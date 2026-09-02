-- Fix: Drop legacy 1-arg confirm_goods_receipt_note overload and guard post_stock_movement_valuation against 0 quantity.
-- Prevents 23514 (inventory_valuation_insufficient_quantity) when PostgREST resolves to the legacy 1-arg overload
-- or when a stock movement with quantity_change = 0 is processed.

-- 1. Explicitly drop the legacy 1-argument overload
DROP FUNCTION IF EXISTS public.confirm_goods_receipt_note(bigint);

-- 2. Patch private.post_stock_movement_valuation to immediately return on zero quantity
DO $patch_valuation_zero_qty$
DECLARE
  v_def text;
  v_updated text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'post_stock_movement_valuation';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'post_stock_movement_valuation missing';
  END IF;

  v_def := regexp_replace(
    v_def,
    '^CREATE (OR REPLACE )?FUNCTION',
    'CREATE OR REPLACE FUNCTION'
  );

  -- Insert zero-quantity early return right after idempotency check
  v_updated := regexp_replace(
    v_def,
    '(IF EXISTS \(\s*SELECT 1\s*FROM public\.inventory_valuation_events AS event\s*WHERE event\.tenant_id = NEW\.tenant_id\s*AND event\.idempotency_key = v_idempotency_key\s*\) THEN\s*RETURN NEW;\s*END IF;)',
    E'\\1\n\n  IF COALESCE(NEW.quantity_change, 0) = 0 THEN\n    RETURN NEW;\n  END IF;'
  );

  IF v_updated = v_def THEN
    RAISE EXCEPTION 'post_stock_movement_valuation zero-quantity pattern insertion failed';
  END IF;

  EXECUTE v_updated;

  IF pg_get_functiondef(
    'private.post_stock_movement_valuation()'::regprocedure
  ) !~ 'COALESCE\(NEW\.quantity_change, 0\) = 0' THEN
    RAISE EXCEPTION 'post_stock_movement_valuation zero-quantity verification failed';
  END IF;
END
$patch_valuation_zero_qty$;

-- 3. Update public.confirm_goods_receipt_note(bigint, bigint) with explicit zero-quantity guards
CREATE OR REPLACE FUNCTION public.confirm_goods_receipt_note(
  p_grn_id bigint,
  p_supplier_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_grn record;
  v_po record;
  v_item record;
  v_old_quantity numeric(15,3);
  v_old_wac numeric(15,2);
  v_accepted numeric(15,3);
  v_accepted_base numeric(15,3);
  v_previously_applied numeric(15,3);
  v_remaining numeric(15,3);
  v_remaining_base numeric(15,3);
  v_applied numeric(15,3);
  v_applied_base numeric(15,3);
  v_po_factor numeric;
  v_persist_factor numeric;
  v_applied_money numeric(15,2);
  v_applied_cost_base numeric(15,2);
  v_new_quantity numeric(15,3);
  v_new_wac numeric(15,2);
  v_po_complete boolean;
  v_po_status text;
  v_unconfirmed_suppliers integer;
  v_header_status text;
  v_now timestamptz := pg_catalog.now();
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT grn.*
  INTO v_grn
  FROM public.goods_received_notes AS grn
  WHERE grn.id = p_grn_id
    AND grn.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_grn.branch_id,
    'procurement:grn_confirm'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_grn.status = 'confirmed'
     AND NOT EXISTS (
       SELECT 1
       FROM public.grn_items AS item
       WHERE item.grn_id = p_grn_id
         AND item.tenant_id = v_tenant
         AND item.confirmed_at IS NULL
     ) THEN
    SELECT po.status
    INTO v_po_status
    FROM public.purchase_orders AS po
    WHERE po.id = v_grn.po_id
      AND po.tenant_id = v_tenant;

    RETURN pg_catalog.jsonb_build_object(
      'grn_id', p_grn_id,
      'status', 'confirmed',
      'po_id', v_grn.po_id,
      'po_status', v_po_status
    );
  END IF;
  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_not_draft' USING ERRCODE = '23514';
  END IF;

  SELECT po.*
  INTO v_po
  FROM public.purchase_orders AS po
  WHERE po.id = v_grn.po_id
    AND po.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND
     OR v_po.status NOT IN ('sent', 'approved', 'partially_received')
     OR v_po.branch_id <> v_grn.branch_id
     OR (
       v_po.supplier_id IS NOT NULL
       AND v_grn.supplier_id IS NOT NULL
       AND v_po.supplier_id <> v_grn.supplier_id
     ) THEN
    RAISE EXCEPTION 'grn_purchase_order_invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT pg_catalog.count(DISTINCT item.supplier_id)
  INTO v_unconfirmed_suppliers
  FROM public.grn_items AS item
  WHERE item.grn_id = p_grn_id
    AND item.tenant_id = v_tenant
    AND item.confirmed_at IS NULL;

  IF p_supplier_id IS NULL
     AND v_unconfirmed_suppliers > 1
     AND EXISTS (
       SELECT 1
       FROM public.grn_items AS item
       WHERE item.grn_id = p_grn_id
         AND item.tenant_id = v_tenant
         AND item.confirmed_at IS NULL
         AND item.received_quantity - item.rejected_quantity <= 0
     ) THEN
    RAISE EXCEPTION 'grn_supplier_confirm_required'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.confirmed_at IS NULL
      AND (p_supplier_id IS NULL OR item.supplier_id = p_supplier_id)
      AND (
        item.received_quantity < 0
        OR item.rejected_quantity < 0
        OR item.rejected_quantity > item.received_quantity
        OR (
          item.rejected_quantity > 0
          AND (
            nullif(pg_catalog.btrim(item.rejection_reason), '') IS NULL
            OR NOT private.grn_rejection_photo_exists(
              item.tenant_id,
              item.grn_id,
              item.id,
              item.rejected_photo_url
            )
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'grn_physical_qc_incomplete'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.confirmed_at IS NULL
      AND (p_supplier_id IS NULL OR item.supplier_id = p_supplier_id)
      AND item.received_quantity - item.rejected_quantity > 0
      AND item.unit_cost <= 0
  ) THEN
    RAISE EXCEPTION 'grn_unit_price_required'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.confirmed_at IS NULL
      AND (p_supplier_id IS NULL OR item.supplier_id = p_supplier_id)
      AND item.received_quantity - item.rejected_quantity > 0
  ) THEN
    RAISE EXCEPTION 'grn_has_no_accepted_quantity'
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1
  FROM public.purchase_order_items AS po_item
  WHERE po_item.po_id = v_po.id
    AND po_item.tenant_id = v_tenant
  ORDER BY po_item.id
  FOR UPDATE;

  PERFORM pg_catalog.set_config(
    'comtammatu.grn_confirm',
    'true',
    TRUE
  );

  FOR v_item IN
    SELECT
      grn_item.*,
      po_item.quantity AS ordered_quantity,
      po_item.entry_unit_id AS po_entry_unit_id
    FROM public.grn_items AS grn_item
    JOIN public.purchase_order_items AS po_item
      ON po_item.id = grn_item.purchase_order_item_id
     AND po_item.tenant_id = grn_item.tenant_id
     AND po_item.po_id = v_po.id
    WHERE grn_item.grn_id = p_grn_id
      AND grn_item.tenant_id = v_tenant
      AND grn_item.confirmed_at IS NULL
      AND (p_supplier_id IS NULL OR grn_item.supplier_id = p_supplier_id)
      AND grn_item.received_quantity - grn_item.rejected_quantity > 0
    ORDER BY grn_item.id
    FOR UPDATE OF grn_item
  LOOP
    v_accepted := v_item.received_quantity - v_item.rejected_quantity;

    SELECT coalesce(pg_catalog.sum(previous_item.po_applied_quantity), 0)
    INTO v_previously_applied
    FROM public.grn_items AS previous_item
    JOIN public.goods_received_notes AS previous_grn
      ON previous_grn.id = previous_item.grn_id
     AND previous_grn.tenant_id = previous_item.tenant_id
    WHERE previous_item.tenant_id = v_tenant
      AND previous_item.purchase_order_item_id =
        v_item.purchase_order_item_id
      AND (
        previous_item.confirmed_at IS NOT NULL
        OR previous_grn.status = 'confirmed'
      );

    v_remaining := greatest(
      v_item.ordered_quantity - v_previously_applied,
      0
    );
    v_accepted_base := public.inv_to_base(
      v_item.ingredient_id,
      v_item.entry_unit_id,
      v_accepted
    );
    v_remaining_base := public.inv_to_base(
      v_item.ingredient_id,
      v_item.po_entry_unit_id,
      v_remaining
    );
    v_applied_base := least(v_accepted_base, v_remaining_base);

    SELECT ingredient_unit.to_base_factor
    INTO v_po_factor
    FROM public.ingredient_units AS ingredient_unit
    WHERE ingredient_unit.tenant_id = v_tenant
      AND ingredient_unit.ingredient_id = v_item.ingredient_id
      AND ingredient_unit.unit_id = v_item.po_entry_unit_id
      AND ingredient_unit.is_active;

    SELECT ingredient_unit.to_base_factor
    INTO v_persist_factor
    FROM public.ingredient_units AS ingredient_unit
    WHERE ingredient_unit.tenant_id = v_tenant
      AND ingredient_unit.ingredient_id = v_item.ingredient_id
      AND ingredient_unit.unit_id = v_item.entry_unit_id
      AND ingredient_unit.is_active;

    IF v_po_factor IS NULL OR v_po_factor <= 0
       OR v_persist_factor IS NULL OR v_persist_factor <= 0 THEN
      RAISE EXCEPTION 'entry_unit_not_configured' USING ERRCODE = '23503';
    END IF;

    v_applied := pg_catalog.round(v_applied_base / v_po_factor, 3);

    IF v_accepted_base > v_remaining_base THEN
      v_applied := pg_catalog.round(v_accepted_base / v_po_factor, 3);
      UPDATE public.purchase_order_items AS po_line
      SET quantity = v_previously_applied + v_applied
      WHERE po_line.id = v_item.purchase_order_item_id
        AND po_line.tenant_id = v_tenant;
      v_applied_base := v_accepted_base;
    END IF;

    SELECT stock.current_quantity, stock.avg_unit_cost
    INTO v_old_quantity, v_old_wac
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = v_grn.branch_id
      AND stock.location_id = v_grn.location_id
      AND stock.ingredient_id = v_item.ingredient_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_old_quantity := 0;
      v_old_wac := NULL;
    END IF;

    v_applied_money := private.grn_line_book_total(
      v_tenant,
      v_item.ingredient_id,
      v_accepted,
      v_item.entry_unit_id,
      v_item.unit_cost,
      v_item.unit_cost_unit_id
    );
    v_applied_cost_base := CASE
      WHEN v_accepted_base > 0
        THEN pg_catalog.round(v_applied_money / v_accepted_base, 2)
      ELSE 0
    END;

    IF v_accepted_base > 0 THEN
      INSERT INTO public.stock_movements (
        tenant_id,
        branch_id,
        ingredient_id,
        type,
        quantity_change,
        reason,
        created_by,
        grn_id,
        unit_cost,
        location_id,
        entry_unit_id,
        entry_quantity
      )
      VALUES (
        v_tenant,
        v_grn.branch_id,
        v_item.ingredient_id,
        'grn_receipt',
        v_accepted_base,
        'GRN ' || v_grn.grn_number,
        v_uid,
        p_grn_id,
        v_applied_cost_base,
        v_grn.location_id,
        v_item.entry_unit_id,
        v_accepted
      );

      v_new_quantity := coalesce(v_old_quantity, 0) + v_accepted_base;
      v_new_wac := CASE
        WHEN v_new_quantity > 0 THEN (
          coalesce(v_old_quantity, 0) * coalesce(v_old_wac, 0)
          + v_applied_money
        ) / v_new_quantity
        ELSE coalesce(v_old_wac, 0)
      END;

      UPDATE public.stock_levels AS stock
      SET avg_unit_cost = v_new_wac,
          updated_at = v_now
      WHERE stock.tenant_id = v_tenant
        AND stock.branch_id = v_grn.branch_id
        AND stock.location_id = v_grn.location_id
        AND stock.ingredient_id = v_item.ingredient_id;
    END IF;

    UPDATE public.grn_items
    SET po_applied_quantity = v_applied,
        total_cost = v_applied_money,
        cost_pending = FALSE,
        confirmed_at = v_now
    WHERE id = v_item.id
      AND tenant_id = v_tenant;
  END LOOP;

  INSERT INTO public.grn_items (
    tenant_id,
    grn_id,
    ingredient_id,
    supplier_id,
    purchase_order_item_id,
    received_quantity,
    rejected_quantity,
    entry_unit_id,
    unit_cost,
    unit_cost_unit_id,
    total_cost,
    po_applied_quantity,
    cost_pending,
    provisional_cost_source
  )
  SELECT
    v_tenant,
    p_grn_id,
    po_item.ingredient_id,
    po_item.supplier_id,
    po_item.id,
    0,
    0,
    po_item.entry_unit_id,
    0,
    po_item.entry_unit_id,
    0,
    0,
    TRUE,
    'pending'
  FROM public.purchase_order_items AS po_item
  LEFT JOIN LATERAL (
    SELECT pg_catalog.sum(grn_item.po_applied_quantity) AS quantity
    FROM public.grn_items AS grn_item
    JOIN public.goods_received_notes AS grn
      ON grn.id = grn_item.grn_id
     AND grn.tenant_id = grn_item.tenant_id
    WHERE grn_item.tenant_id = v_tenant
      AND grn_item.purchase_order_item_id = po_item.id
      AND (
        grn_item.confirmed_at IS NOT NULL
        OR grn.status = 'confirmed'
      )
  ) AS received ON TRUE
  WHERE po_item.po_id = v_po.id
    AND po_item.tenant_id = v_tenant
    AND (p_supplier_id IS NULL OR po_item.supplier_id = p_supplier_id)
    AND po_item.quantity > coalesce(received.quantity, 0)
    AND NOT EXISTS (
      SELECT 1
      FROM public.grn_items AS open_item
      WHERE open_item.grn_id = p_grn_id
        AND open_item.tenant_id = v_tenant
        AND open_item.purchase_order_item_id = po_item.id
        AND open_item.confirmed_at IS NULL
    );

  IF NOT EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.confirmed_at IS NULL
  ) THEN
    v_header_status := 'confirmed';
    UPDATE public.goods_received_notes
    SET status = 'confirmed',
        received_date = v_now,
        received_by = v_uid,
        updated_at = v_now
    WHERE id = p_grn_id
      AND tenant_id = v_tenant;
  ELSE
    v_header_status := 'draft';
    UPDATE public.goods_received_notes
    SET updated_at = v_now
    WHERE id = p_grn_id
      AND tenant_id = v_tenant;
  END IF;

  SELECT pg_catalog.bool_and(
    coalesce(received.quantity, 0) >= po_item.quantity
  )
  INTO v_po_complete
  FROM public.purchase_order_items AS po_item
  LEFT JOIN LATERAL (
    SELECT pg_catalog.sum(grn_item.po_applied_quantity) AS quantity
    FROM public.grn_items AS grn_item
    JOIN public.goods_received_notes AS grn
      ON grn.id = grn_item.grn_id
     AND grn.tenant_id = grn_item.tenant_id
    WHERE grn_item.tenant_id = v_tenant
      AND grn_item.purchase_order_item_id = po_item.id
      AND (
        grn_item.confirmed_at IS NOT NULL
        OR grn.status = 'confirmed'
      )
  ) AS received ON TRUE
  WHERE po_item.po_id = v_po.id
    AND po_item.tenant_id = v_tenant;

  v_po_status := CASE
    WHEN coalesce(v_po_complete, FALSE) THEN 'received'
    ELSE 'partially_received'
  END;

  UPDATE public.purchase_orders
  SET status = v_po_status,
      updated_at = v_now
  WHERE id = v_po.id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'inventory.grn.confirmed',
    'goods_received_note',
    p_grn_id,
    pg_catalog.to_jsonb(v_grn),
    pg_catalog.jsonb_build_object(
      'status', v_header_status,
      'po_id', v_po.id,
      'po_status', v_po_status,
      'supplier_id', p_supplier_id
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'grn_id', p_grn_id,
    'status', v_header_status,
    'po_id', v_po.id,
    'po_status', v_po_status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_goods_receipt_note(bigint, bigint)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_goods_receipt_note(bigint, bigint)
TO authenticated, service_role;

COMMENT ON FUNCTION public.confirm_goods_receipt_note(bigint, bigint) IS
  'Book unconfirmed GRN lines for one NCC (or remaining priced set). Shared GRN stays draft until every line is booked. Kept qty amends the PO line.';
