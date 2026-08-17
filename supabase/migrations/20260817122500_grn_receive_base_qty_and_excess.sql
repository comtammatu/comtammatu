-- GRN confirm compares remaining in base units, applies PO qty, and stocks
-- the full accepted quantity in one movement. Excess dilutes WAC (cost 0).
-- Draft PO-linked lines may persist in any active unit of the same ingredient.

CREATE OR REPLACE FUNCTION private.enforce_inventory_entry_unit_active()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF NOT private.entry_unit_is_active_for_ingredient(
    NEW.tenant_id,
    NEW.ingredient_id,
    NEW.entry_unit_id
  ) THEN
    RAISE EXCEPTION 'inventory_unit_not_active_for_ingredient'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_grn_entry_unit_role ON public.grn_items;
CREATE TRIGGER enforce_grn_entry_unit_role
  BEFORE INSERT OR UPDATE OF ingredient_id, entry_unit_id
  ON public.grn_items
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_inventory_entry_unit_active();

CREATE OR REPLACE FUNCTION private.enforce_linked_grn_line_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_grn record;
  v_po_item record;
  v_confirming boolean := coalesce(
    pg_catalog.current_setting('comtammatu.grn_confirm', TRUE),
    'false'
  ) = 'true';
BEGIN
  IF TG_OP = 'UPDATE'
     AND (
       to_jsonb(NEW) - 'entry_to_base_factor' - 'entry_unit_code'
     ) IS NOT DISTINCT FROM (
       to_jsonb(OLD) - 'entry_to_base_factor' - 'entry_unit_code'
     ) THEN
    RETURN NEW;
  END IF;

  SELECT grn.*
  INTO v_grn
  FROM public.goods_received_notes AS grn
  WHERE grn.id = coalesce(NEW.grn_id, OLD.grn_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF v_grn.status = 'draft' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'confirmed_grn_lines_immutable'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
     AND (
       NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.grn_id IS DISTINCT FROM OLD.grn_id
       OR NEW.purchase_order_item_id IS DISTINCT FROM
         OLD.purchase_order_item_id
       OR NEW.ingredient_id IS DISTINCT FROM OLD.ingredient_id
       OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
     ) THEN
    RAISE EXCEPTION 'grn_line_identity_immutable'
      USING ERRCODE = '23514';
  END IF;

  SELECT po_item.*, purchase_order.supplier_id
  INTO v_po_item
  FROM public.purchase_order_items AS po_item
  JOIN public.purchase_orders AS purchase_order
    ON purchase_order.id = po_item.po_id
   AND purchase_order.tenant_id = po_item.tenant_id
  WHERE po_item.id = NEW.purchase_order_item_id
    AND po_item.tenant_id = v_grn.tenant_id
    AND po_item.po_id = v_grn.po_id;

  IF NOT FOUND
     OR NEW.ingredient_id <> v_po_item.ingredient_id
     OR NEW.supplier_id <> v_po_item.supplier_id THEN
    RAISE EXCEPTION 'grn_line_po_mismatch' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.ingredient_units AS ingredient_unit
    WHERE ingredient_unit.tenant_id = NEW.tenant_id
      AND ingredient_unit.ingredient_id = NEW.ingredient_id
      AND ingredient_unit.unit_id = NEW.entry_unit_id
      AND ingredient_unit.is_active
  ) THEN
    RAISE EXCEPTION 'entry_unit_not_configured' USING ERRCODE = '23503';
  END IF;

  IF v_confirming THEN
    RETURN NEW;
  END IF;
  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'confirmed_grn_lines_immutable'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.unit_cost := OLD.unit_cost;
    NEW.cost_pending := OLD.cost_pending;
    NEW.provisional_cost_source := OLD.provisional_cost_source;
  END IF;
  NEW.total_cost := 0;
  NEW.po_applied_quantity := 0;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION private.enforce_linked_grn_line_immutability() IS
  'Linked GRN line immutability. Draft lines may persist in any active unit of the PO ingredient; identity still freezes ingredient, PO line, and supplier.';

CREATE OR REPLACE FUNCTION public.save_goods_receipt_note(
  p_grn_id bigint,
  p_received_date timestamp with time zone,
  p_notes text,
  p_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_grn public.goods_received_notes%ROWTYPE;
  v_input_count integer;
  v_distinct_count integer;
  v_expected_count integer;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'grn_lines_invalid' USING ERRCODE = '22023';
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
  IF NOT public.has_permission(v_grn.branch_id, 'procurement:grn_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_not_draft' USING ERRCODE = '23514';
  END IF;

  SELECT count(*), count(DISTINCT line.line_id)
  INTO v_input_count, v_distinct_count
  FROM jsonb_to_recordset(p_lines)
    AS line(line_id bigint);

  SELECT count(*)
  INTO v_expected_count
  FROM public.grn_items AS item
  WHERE item.grn_id = p_grn_id
    AND item.tenant_id = v_tenant;

  IF v_input_count <> v_distinct_count
     OR v_input_count <> v_expected_count
     OR EXISTS (
       SELECT 1
       FROM jsonb_to_recordset(p_lines)
         AS line(
           line_id bigint,
           received_quantity numeric,
           rejected_quantity numeric,
           rejection_reason text,
           rejected_photo_url text,
           entry_unit_id bigint
         )
       LEFT JOIN public.grn_items AS item
         ON item.id = line.line_id
        AND item.grn_id = p_grn_id
        AND item.tenant_id = v_tenant
       WHERE item.id IS NULL
          OR line.received_quantity IS NULL
          OR line.received_quantity < 0
          OR COALESCE(line.rejected_quantity, 0) < 0
          OR COALESCE(line.rejected_quantity, 0) > line.received_quantity
          OR (
            COALESCE(line.rejected_quantity, 0) > 0
            AND (
              length(btrim(COALESCE(line.rejection_reason, ''))) = 0
              OR length(btrim(COALESCE(line.rejected_photo_url, ''))) = 0
            )
          )
          OR (
            line.entry_unit_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM public.ingredient_units AS ingredient_unit
              WHERE ingredient_unit.tenant_id = item.tenant_id
                AND ingredient_unit.ingredient_id = item.ingredient_id
                AND ingredient_unit.unit_id = line.entry_unit_id
                AND ingredient_unit.is_active
            )
          )
     ) THEN
    RAISE EXCEPTION 'grn_lines_invalid' USING ERRCODE = '23514';
  END IF;

  UPDATE public.grn_items AS item
  SET received_quantity = line.received_quantity::numeric(15,3),
      rejected_quantity = COALESCE(
        line.rejected_quantity,
        0
      )::numeric(15,3),
      rejection_reason = NULLIF(btrim(line.rejection_reason), ''),
      rejected_photo_url = NULLIF(btrim(line.rejected_photo_url), ''),
      entry_unit_id = COALESCE(line.entry_unit_id, item.entry_unit_id)
  FROM jsonb_to_recordset(p_lines)
    AS line(
      line_id bigint,
      received_quantity numeric,
      rejected_quantity numeric,
      rejection_reason text,
      rejected_photo_url text,
      entry_unit_id bigint
    )
  WHERE item.id = line.line_id
    AND item.grn_id = p_grn_id
    AND item.tenant_id = v_tenant;

  UPDATE public.goods_received_notes
  SET received_date = COALESCE(p_received_date, received_date),
      notes = CASE
        WHEN p_notes IS NULL THEN notes
        ELSE NULLIF(btrim(p_notes), '')
      END,
      updated_at = now()
  WHERE id = p_grn_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'inventory.grn.saved',
    'goods_received_note',
    p_grn_id,
    to_jsonb(v_grn),
    jsonb_build_object(
      'status', 'draft',
      'line_count', v_input_count,
      'received_date', p_received_date
    )
  );

  RETURN jsonb_build_object(
    'id', p_grn_id,
    'status', 'draft',
    'updated_lines', v_input_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.save_goods_receipt_note(
  bigint,
  timestamp with time zone,
  text,
  jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_goods_receipt_note(
  bigint,
  timestamp with time zone,
  text,
  jsonb
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.confirm_goods_receipt_note(p_grn_id bigint)
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
  IF v_grn.status = 'confirmed' THEN
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
     OR v_po.supplier_id <> v_grn.supplier_id
     OR v_po.branch_id <> v_grn.branch_id THEN
    RAISE EXCEPTION 'grn_purchase_order_invalid'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND (
        item.received_quantity < 0
        OR item.rejected_quantity < 0
        OR item.rejected_quantity > item.received_quantity
        OR (
          item.rejected_quantity > 0
          AND (
            nullif(
              pg_catalog.btrim(item.rejection_reason),
              ''
            ) IS NULL
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
  IF NOT EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
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
    ORDER BY grn_item.id
    FOR UPDATE OF grn_item
  LOOP
    v_accepted := v_item.received_quantity - v_item.rejected_quantity;

    SELECT coalesce(
      pg_catalog.sum(previous_item.po_applied_quantity),
      0
    )
    INTO v_previously_applied
    FROM public.grn_items AS previous_item
    JOIN public.goods_received_notes AS previous_grn
      ON previous_grn.id = previous_item.grn_id
     AND previous_grn.tenant_id = previous_item.tenant_id
    WHERE previous_item.tenant_id = v_tenant
      AND previous_item.purchase_order_item_id =
        v_item.purchase_order_item_id
      AND previous_grn.status = 'confirmed';

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

    v_applied_money := CASE
      WHEN v_item.cost_pending
        THEN pg_catalog.round(
          v_applied_base * coalesce(v_old_wac, 0),
          2
        )
      ELSE pg_catalog.round(
        v_applied_base * (v_item.unit_cost / v_po_factor),
        2
      )
    END;
    v_applied_cost_base := CASE
      WHEN v_accepted_base > 0
        THEN pg_catalog.round(v_applied_money / v_accepted_base, 2)
      ELSE 0
    END;

    IF v_accepted > 0 THEN
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
    END IF;

    v_new_quantity :=
      coalesce(v_old_quantity, 0) + v_accepted_base;
    v_new_wac := CASE
      WHEN v_new_quantity > 0 THEN (
        coalesce(v_old_quantity, 0)
          * coalesce(v_old_wac, 0)
        + v_applied_money
      ) / v_new_quantity
      ELSE coalesce(v_old_wac, 0)
    END;

    UPDATE public.stock_levels AS stock
    SET avg_unit_cost = v_new_wac,
        updated_at = pg_catalog.now()
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = v_grn.branch_id
      AND stock.location_id = v_grn.location_id
      AND stock.ingredient_id = v_item.ingredient_id;

    UPDATE public.grn_items
    SET po_applied_quantity = v_applied,
        total_cost = v_applied_money
    WHERE id = v_item.id
      AND tenant_id = v_tenant;
  END LOOP;

  UPDATE public.goods_received_notes
  SET status = 'confirmed',
      received_date = pg_catalog.now(),
      received_by = v_uid,
      updated_at = pg_catalog.now()
  WHERE id = p_grn_id
    AND tenant_id = v_tenant;

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
      AND grn.status = 'confirmed'
  ) AS received ON TRUE
  WHERE po_item.po_id = v_po.id
    AND po_item.tenant_id = v_tenant;

  v_po_status := CASE
    WHEN coalesce(v_po_complete, FALSE) THEN 'received'
    ELSE 'partially_received'
  END;

  UPDATE public.purchase_orders
  SET status = v_po_status,
      updated_at = pg_catalog.now()
  WHERE id = v_po.id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'inventory.grn.confirmed',
    'goods_received_note',
    p_grn_id,
    pg_catalog.to_jsonb(v_grn),
    pg_catalog.jsonb_build_object(
      'status', 'confirmed',
      'po_id', v_po.id,
      'po_status', v_po_status
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'grn_id', p_grn_id,
    'status', 'confirmed',
    'po_id', v_po.id,
    'po_status', v_po_status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_goods_receipt_note(bigint)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_goods_receipt_note(bigint)
TO authenticated, service_role;

COMMENT ON FUNCTION public.confirm_goods_receipt_note(bigint) IS
  'Confirm a draft GRN. Remaining and apply are compared in base units. Excess accepted quantity stocks in the same grn_receipt movement and dilutes WAC (cost 0). Over-receipt does not block confirm.';
