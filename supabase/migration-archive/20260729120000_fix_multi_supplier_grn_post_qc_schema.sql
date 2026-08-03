-- Fix multi-supplier GRN RPCs for post-QC schema.
-- 20260729010000 incorrectly referenced dropped physical-QC-only columns.
-- Post-QC grn_items columns: id, tenant_id, grn_id, ingredient_id,
-- received_quantity, unit_cost, total_cost, rejected_quantity,
-- rejection_reason, rejected_photo_url, entry_unit_id, supplier_id.
-- Multi-supplier columns that remain valid: grn_items.supplier_id,
-- nullable goods_received_notes.supplier_id, purchase_orders.source_grn_id.
-- Do not apply without Environment Registry check + owner delegation.

-- ---------------------------------------------------------------------------
-- 1. Supplier-item mapping on document status (line supplier_id; receivable)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_supplier_items_on_document_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'purchase_orders'
     AND NEW.status = 'sent'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND EXISTS (
       SELECT 1
         FROM public.purchase_order_items poi
        WHERE poi.po_id = NEW.id
          AND poi.tenant_id = NEW.tenant_id
          AND NOT EXISTS (
            SELECT 1
              FROM public.supplier_items si
             WHERE si.tenant_id = NEW.tenant_id
               AND si.supplier_id = NEW.supplier_id
               AND si.ingredient_id = poi.ingredient_id
               AND si.is_active
          )
     ) THEN
    RAISE EXCEPTION 'supplier_item_mapping_required'
      USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'goods_received_notes'
     AND NEW.status = 'confirmed'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND EXISTS (
       SELECT 1
         FROM public.grn_items gi
        WHERE gi.grn_id = NEW.id
          AND gi.tenant_id = NEW.tenant_id
          AND gi.received_quantity - gi.rejected_quantity > 0
          AND NOT EXISTS (
            SELECT 1
              FROM public.supplier_items si
             WHERE si.tenant_id = NEW.tenant_id
               AND si.supplier_id = gi.supplier_id
               AND si.ingredient_id = gi.ingredient_id
               AND si.is_active
          )
     ) THEN
    RAISE EXCEPTION 'supplier_item_mapping_required'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Split draft POs from multi-supplier GRN (post-QC receivable filter)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_purchase_orders_from_grn(p_grn_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_grn record;
  v_supplier_id bigint;
  v_po_id bigint;
  v_location_id bigint;
  v_display text;
  v_line_count integer;
  v_total_lines integer := 0;
  v_po_count integer := 0;
  v_first_po_id bigint := NULL;
  v_by_supplier jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
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
  IF NOT public.has_permission(v_grn.branch_id, 'procurement:po_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_not_draft' USING ERRCODE = '22023';
  END IF;
  IF v_grn.po_id IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM public.purchase_orders AS po
       WHERE po.source_grn_id = p_grn_id
         AND po.tenant_id = v_tenant
     ) THEN
    RAISE EXCEPTION 'grn_already_linked_to_po' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.received_quantity - item.rejected_quantity > 0
      AND item.supplier_id IS NULL
  ) THEN
    RAISE EXCEPTION 'grn_line_supplier_required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.received_quantity - item.rejected_quantity > 0
  ) THEN
    RAISE EXCEPTION 'grn_has_no_receivable_lines' USING ERRCODE = '22023';
  END IF;

  IF NOT private.grn_physical_qc_is_valid(v_tenant, p_grn_id) THEN
    RAISE EXCEPTION 'grn_physical_qc_incomplete'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.branches AS branch
    WHERE branch.id = v_grn.branch_id
      AND branch.tenant_id = v_tenant
      AND branch.is_active IS TRUE
      AND branch.branch_kind IN (
        'branch',
        'central_supply',
        'central_kitchen'
      )
  ) THEN
    RAISE EXCEPTION 'invalid_branch' USING ERRCODE = 'P0002';
  END IF;

  IF v_grn.location_id IS NULL THEN
    SELECT location.id
    INTO v_location_id
    FROM public.inventory_locations AS location
    WHERE location.tenant_id = v_tenant
      AND location.branch_id = v_grn.branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE
      AND location.is_default_receive IS TRUE;
  ELSE
    SELECT location.id
    INTO v_location_id
    FROM public.inventory_locations AS location
    WHERE location.id = v_grn.location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = v_grn.branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE;
  END IF;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'grn_receiving_warehouse_required'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_supplier_id IN
    SELECT DISTINCT item.supplier_id
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.received_quantity - item.rejected_quantity > 0
    ORDER BY item.supplier_id
  LOOP
    v_display := public.next_po_display_id(v_tenant);

    INSERT INTO public.purchase_orders (
      tenant_id,
      branch_id,
      supplier_id,
      po_number,
      display_id,
      status,
      notes,
      created_by,
      source_grn_id
    )
    VALUES (
      v_tenant,
      v_grn.branch_id,
      v_supplier_id,
      v_display,
      v_display,
      'draft',
      NULLIF(btrim(v_grn.notes), ''),
      v_uid,
      p_grn_id
    )
    RETURNING id INTO v_po_id;

    IF v_first_po_id IS NULL THEN
      v_first_po_id := v_po_id;
    END IF;

    INSERT INTO public.purchase_order_items (
      tenant_id,
      po_id,
      ingredient_id,
      quantity,
      entry_unit_id,
      unit_price_est,
      line_total
    )
    SELECT
      v_tenant,
      v_po_id,
      item.ingredient_id,
      (
        item.received_quantity - item.rejected_quantity
      )::numeric(15,3),
      item.entry_unit_id,
      NULL::numeric,
      NULL::numeric
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.supplier_id = v_supplier_id
      AND item.received_quantity - item.rejected_quantity > 0;

    GET DIAGNOSTICS v_line_count = ROW_COUNT;
    v_total_lines := v_total_lines + v_line_count;
    v_po_count := v_po_count + 1;

    v_by_supplier := v_by_supplier || jsonb_build_array(
      jsonb_build_object(
        'supplier_id', v_supplier_id,
        'po_id', v_po_id,
        'display_id', v_display,
        'line_count', v_line_count
      )
    );

    PERFORM public.log_audit(
      'inventory.po.created_from_grn_draft',
      'purchase_order',
      v_po_id,
      NULL,
      jsonb_build_object(
        'grn_id', p_grn_id,
        'supplier_id', v_supplier_id,
        'lines', v_line_count,
        'branch_id', v_grn.branch_id
      )
    );
  END LOOP;

  -- Legacy single pointer: first PO. Confirm gate also reads source_grn_id.
  UPDATE public.goods_received_notes
  SET po_id = v_first_po_id,
      location_id = v_location_id,
      updated_at = now()
  WHERE id = p_grn_id
    AND tenant_id = v_tenant;

  RETURN jsonb_build_object(
    'grn_id', p_grn_id,
    'po_id', v_first_po_id,
    'po_ids', (
      SELECT COALESCE(jsonb_agg(po.id ORDER BY po.id), '[]'::jsonb)
      FROM public.purchase_orders AS po
      WHERE po.source_grn_id = p_grn_id
        AND po.tenant_id = v_tenant
    ),
    'po_count', v_po_count,
    'line_count', v_total_lines,
    'by_supplier', v_by_supplier,
    'status', 'draft'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_purchase_orders_from_grn(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_orders_from_grn(bigint)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.create_purchase_orders_from_grn(bigint) IS
  'Create one draft PO per distinct grn_items.supplier_id from a multi-supplier GRN draft. Sets purchase_orders.source_grn_id and legacy goods_received_notes.po_id to the first PO.';

-- ---------------------------------------------------------------------------
-- 3. Compatibility wrapper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_purchase_order_from_grn(
  p_grn_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.create_purchase_orders_from_grn(p_grn_id);
  RETURN jsonb_build_object(
    'po_id', (v_result->>'po_id')::bigint,
    'display_id', (
      SELECT po.display_id
      FROM public.purchase_orders AS po
      WHERE po.id = (v_result->>'po_id')::bigint
    ),
    'grn_id', p_grn_id,
    'line_count', (v_result->>'line_count')::integer,
    'po_count', (v_result->>'po_count')::integer,
    'po_ids', v_result->'po_ids',
    'by_supplier', v_result->'by_supplier',
    'status', 'draft'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_purchase_order_from_grn(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_order_from_grn(bigint)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.create_purchase_order_from_grn(bigint) IS
  'Compatibility wrapper around create_purchase_orders_from_grn (multi-supplier split).';

-- ---------------------------------------------------------------------------
-- 4. Approve: sync unit_cost for matching supplier lines only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.approve_purchase_order(p_po_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_po record;
  v_synced_lines integer := 0;
  v_missing_price integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'approve_purchase_order: anonymous caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'approve_purchase_order: missing tenant_id claim'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_po_id IS NULL OR p_po_id <= 0 THEN
    RAISE EXCEPTION 'approve_purchase_order: invalid PO id'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT
    purchase_order.id,
    purchase_order.branch_id,
    purchase_order.po_number,
    purchase_order.status,
    purchase_order.supplier_id,
    purchase_order.source_grn_id
  INTO v_po
  FROM public.purchase_orders AS purchase_order
  WHERE purchase_order.id = p_po_id
    AND purchase_order.tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'approve_purchase_order: PO not found in tenant scope'
      USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.has_permission(
    v_po.branch_id,
    'procurement:po_approve'
  ) THEN
    RAISE EXCEPTION 'approve_purchase_order: forbidden'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_po.status <> 'draft' THEN
    RAISE EXCEPTION 'approve_purchase_order: invalid status transition'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM grn.id
  FROM public.goods_received_notes AS grn
  WHERE grn.tenant_id = v_tenant_id
    AND grn.status = 'draft'
    AND (
      grn.po_id = v_po.id
      OR (
        v_po.source_grn_id IS NOT NULL
        AND grn.id = v_po.source_grn_id
      )
    )
  FOR UPDATE OF grn;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'approve_purchase_order: linked draft GRN required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*)::integer
  INTO v_missing_price
  FROM public.purchase_order_items AS item
  WHERE item.tenant_id = v_tenant_id
    AND item.po_id = v_po.id
    AND (
      item.quantity <= 0
      OR item.unit_price_est IS NULL
      OR item.unit_price_est <= 0
    );

  IF NOT EXISTS (
    SELECT 1
    FROM public.purchase_order_items AS item
    WHERE item.tenant_id = v_tenant_id
      AND item.po_id = v_po.id
  ) THEN
    RAISE EXCEPTION 'approve_purchase_order: PO has no lines'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_missing_price > 0 THEN
    RAISE EXCEPTION 'approve_purchase_order: positive price required'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.purchase_order_items
  SET line_total = round(quantity * unit_price_est, 2)
  WHERE tenant_id = v_tenant_id
    AND po_id = v_po.id;

  WITH linked_grn AS (
    SELECT grn.id AS grn_id
    FROM public.goods_received_notes AS grn
    WHERE grn.tenant_id = v_tenant_id
      AND grn.status = 'draft'
      AND (
        grn.po_id = v_po.id
        OR (
          v_po.source_grn_id IS NOT NULL
          AND grn.id = v_po.source_grn_id
        )
      )
  ),
  synced AS (
    UPDATE public.grn_items AS grn_item
    SET unit_cost = po_item.unit_price_est,
        total_cost = round(
          (
            grn_item.received_quantity
            - grn_item.rejected_quantity
          ) * po_item.unit_price_est,
          2
        )
    FROM linked_grn, public.purchase_order_items AS po_item
    WHERE grn_item.tenant_id = v_tenant_id
      AND grn_item.grn_id = linked_grn.grn_id
      AND grn_item.supplier_id = v_po.supplier_id
      AND po_item.tenant_id = v_tenant_id
      AND po_item.po_id = v_po.id
      AND po_item.ingredient_id = grn_item.ingredient_id
      AND po_item.entry_unit_id IS NOT DISTINCT FROM
        grn_item.entry_unit_id
      AND grn_item.received_quantity - grn_item.rejected_quantity > 0
    RETURNING grn_item.id
  )
  SELECT count(*)::integer
  INTO v_synced_lines
  FROM synced;

  IF EXISTS (
    SELECT 1
    FROM public.goods_received_notes AS grn
    JOIN public.grn_items AS grn_item
      ON grn_item.grn_id = grn.id
     AND grn_item.tenant_id = grn.tenant_id
    WHERE grn.tenant_id = v_tenant_id
      AND grn.status = 'draft'
      AND (
        grn.po_id = v_po.id
        OR (
          v_po.source_grn_id IS NOT NULL
          AND grn.id = v_po.source_grn_id
        )
      )
      AND grn_item.supplier_id = v_po.supplier_id
      AND grn_item.received_quantity - grn_item.rejected_quantity > 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.purchase_order_items AS po_item
        WHERE po_item.tenant_id = v_tenant_id
          AND po_item.po_id = v_po.id
          AND po_item.ingredient_id = grn_item.ingredient_id
          AND po_item.entry_unit_id IS NOT DISTINCT FROM
            grn_item.entry_unit_id
      )
  ) THEN
    RAISE EXCEPTION 'approve_purchase_order: GRN line missing from PO'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.purchase_orders
  SET status = 'sent',
      updated_at = now()
  WHERE id = v_po.id
    AND tenant_id = v_tenant_id;

  PERFORM public.log_audit(
    'inventory.po.approved',
    'purchase_order',
    v_po.id,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object(
      'status', 'sent',
      'branch_id', v_po.branch_id,
      'po_number', v_po.po_number,
      'grn_unit_cost_synced_lines', v_synced_lines
    )
  );

  RETURN jsonb_build_object(
    'id', v_po.id,
    'status', 'sent',
    'grn_unit_cost_synced_lines', v_synced_lines
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_purchase_order(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_purchase_order(bigint)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.approve_purchase_order(bigint) IS
  'Approve PO draft→sent. Syncs unit_price_est into draft GRN lines matching PO supplier (source_grn_id or legacy po_id).';

-- ---------------------------------------------------------------------------
-- 5. Confirm: require every linked PO approved; fulfill per supplier
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.confirm_goods_receipt_note(
  p_grn_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_grn record;
  v_item record;
  v_old_q numeric(15,3);
  v_old_wac numeric(15,2);
  v_recv numeric(15,3);
  v_recv_base numeric(15,3);
  v_cost numeric(15,2);
  v_money numeric(15,2);
  v_cost_base numeric(15,2);
  v_new_q numeric(15,3);
  v_new_wac numeric(15,2);
  v_location_id bigint;
  v_all_fulfilled boolean;
  v_po_status text;
  v_po_id bigint;
  v_po_ids bigint[];
  v_unapproved integer;
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
  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_not_draft' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.branches AS branch
    WHERE branch.id = v_grn.branch_id
      AND branch.tenant_id = v_tenant
      AND branch.is_active IS TRUE
      AND branch.branch_kind IN (
        'branch',
        'central_supply',
        'central_kitchen'
      )
  ) THEN
    RAISE EXCEPTION 'grn_branch_must_be_operational'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_grn.location_id IS NULL THEN
    SELECT location.id
    INTO v_location_id
    FROM public.inventory_locations AS location
    WHERE location.tenant_id = v_tenant
      AND location.branch_id = v_grn.branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE
      AND location.is_default_receive IS TRUE
      AND location.is_default_issue IS TRUE
      AND location.is_default_consumption IS TRUE;
  ELSE
    SELECT location.id
    INTO v_location_id
    FROM public.inventory_locations AS location
    WHERE location.id = v_grn.location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = v_grn.branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE;
  END IF;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'grn_warehouse_location_missing'
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT COALESCE(array_agg(po.id ORDER BY po.id), ARRAY[]::bigint[])
  INTO v_po_ids
  FROM public.purchase_orders AS po
  WHERE po.tenant_id = v_tenant
    AND (
      po.source_grn_id = p_grn_id
      OR (v_grn.po_id IS NOT NULL AND po.id = v_grn.po_id)
    );

  IF cardinality(v_po_ids) = 0 THEN
    RAISE EXCEPTION 'grn_confirm_requires_approved_po'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT COUNT(*)::integer
  INTO v_unapproved
  FROM public.purchase_orders AS po
  WHERE po.id = ANY (v_po_ids)
    AND po.tenant_id = v_tenant
    AND po.status NOT IN ('sent', 'partially_received');

  IF v_unapproved > 0 THEN
    RAISE EXCEPTION 'grn_confirm_requires_approved_po'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM 1
  FROM public.purchase_orders AS po
  WHERE po.id = ANY (v_po_ids)
    AND po.tenant_id = v_tenant
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND (
        item.rejected_quantity < 0
        OR item.rejected_quantity > item.received_quantity
      )
  ) THEN
    RAISE EXCEPTION 'rejected_exceeds_received'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.rejected_quantity > 0
      AND NULLIF(btrim(item.rejection_reason), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'grn_qc_reason_required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.rejected_quantity > 0
      AND NOT private.grn_rejection_photo_exists(
        item.tenant_id,
        item.grn_id,
        item.id,
        item.rejected_photo_url
      )
  ) THEN
    RAISE EXCEPTION 'grn_qc_photo_required'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Each receivable line must match a PO item on the PO for that line's supplier.
  IF EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.received_quantity - item.rejected_quantity > 0
      AND (
        item.unit_cost <= 0
        OR NOT EXISTS (
          SELECT 1
          FROM public.purchase_orders AS po
          JOIN public.purchase_order_items AS po_item
            ON po_item.po_id = po.id
           AND po_item.tenant_id = po.tenant_id
          WHERE po.tenant_id = v_tenant
            AND po.id = ANY (v_po_ids)
            AND po.supplier_id = item.supplier_id
            AND po_item.ingredient_id = item.ingredient_id
            AND po_item.entry_unit_id IS NOT DISTINCT FROM
              item.entry_unit_id
            AND po_item.unit_price_est > 0
            AND po_item.unit_price_est = item.unit_cost
        )
      )
  ) THEN
    RAISE EXCEPTION 'grn_approved_po_price_missing_or_stale'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_item IN
    SELECT item.*
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.received_quantity - item.rejected_quantity > 0
    ORDER BY item.id
    FOR UPDATE
  LOOP
    v_recv := v_item.received_quantity - v_item.rejected_quantity;
    v_recv_base := public.inv_to_base(
      v_item.ingredient_id,
      v_item.entry_unit_id,
      v_recv
    );
    v_cost := v_item.unit_cost;
    v_money := round(v_recv * v_cost, 2);
    v_cost_base := CASE
      WHEN v_recv_base <> 0 THEN round(v_money / v_recv_base, 2)
      ELSE v_cost
    END;

    SELECT stock.current_quantity, stock.avg_unit_cost
    INTO v_old_q, v_old_wac
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = v_grn.branch_id
      AND stock.location_id = v_location_id
      AND stock.ingredient_id = v_item.ingredient_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_old_q := 0;
      v_old_wac := NULL;
    END IF;

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
      v_recv_base,
      'GRN ' || v_grn.grn_number,
      v_uid,
      p_grn_id,
      v_cost_base,
      v_location_id,
      v_item.entry_unit_id,
      v_recv
    );

    v_new_q := coalesce(v_old_q, 0) + v_recv_base;
    v_new_wac := CASE
      WHEN v_new_q > 0 THEN (
        coalesce(v_old_q, 0) * coalesce(v_old_wac, 0) + v_money
      ) / v_new_q
      ELSE v_cost_base
    END;

    UPDATE public.stock_levels AS stock
    SET avg_unit_cost = v_new_wac,
        updated_at = now()
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = v_grn.branch_id
      AND stock.location_id = v_location_id
      AND stock.ingredient_id = v_item.ingredient_id;

    UPDATE public.ingredients AS ingredient
    SET unit_cost = v_cost_base,
        updated_at = now()
    WHERE ingredient.id = v_item.ingredient_id
      AND ingredient.tenant_id = v_tenant;
  END LOOP;

  UPDATE public.goods_received_notes
  SET status = 'confirmed',
      po_id = COALESCE(v_grn.po_id, v_po_ids[1]),
      location_id = v_location_id,
      updated_at = now()
  WHERE id = p_grn_id
    AND tenant_id = v_tenant;

  FOREACH v_po_id IN ARRAY v_po_ids
  LOOP
    WITH ordered AS (
      SELECT
        po_item.ingredient_id,
        sum(public.inv_to_base(
          po_item.ingredient_id,
          po_item.entry_unit_id,
          po_item.quantity
        ))::numeric(15,3) AS quantity
      FROM public.purchase_order_items AS po_item
      WHERE po_item.po_id = v_po_id
        AND po_item.tenant_id = v_tenant
      GROUP BY po_item.ingredient_id
    ),
    received AS (
      SELECT
        item.ingredient_id,
        sum(public.inv_to_base(
          item.ingredient_id,
          item.entry_unit_id,
          item.received_quantity - item.rejected_quantity
        ))::numeric(15,3) AS quantity
      FROM public.grn_items AS item
      JOIN public.goods_received_notes AS grn
        ON grn.id = item.grn_id
       AND grn.tenant_id = item.tenant_id
      JOIN public.purchase_orders AS po
        ON po.id = v_po_id
       AND po.tenant_id = v_tenant
      WHERE grn.tenant_id = v_tenant
        AND grn.status = 'confirmed'
        AND (
          grn.po_id = v_po_id
          OR po.source_grn_id = grn.id
        )
        AND item.supplier_id = po.supplier_id
      GROUP BY item.ingredient_id
    )
    SELECT bool_and(coalesce(received.quantity, 0) >= ordered.quantity)
    INTO v_all_fulfilled
    FROM ordered
    LEFT JOIN received USING (ingredient_id)
    WHERE ordered.quantity > 0;

    UPDATE public.purchase_orders
    SET status = CASE
          WHEN coalesce(v_all_fulfilled, FALSE) THEN 'received'
          ELSE 'partially_received'
        END,
        updated_at = now()
    WHERE id = v_po_id
      AND tenant_id = v_tenant
      AND status IN ('sent', 'partially_received')
    RETURNING status INTO v_po_status;
  END LOOP;

  RETURN jsonb_build_object(
    'grn_id', p_grn_id,
    'status', 'confirmed',
    'po_id', COALESCE(v_grn.po_id, v_po_ids[1]),
    'po_ids', to_jsonb(v_po_ids),
    'po_status', v_po_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_goods_receipt_note(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_goods_receipt_note(bigint)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.confirm_goods_receipt_note(bigint) IS
  'Atomic confirm GRN. Fail-closed unless every PO linked via source_grn_id (or legacy po_id) is sent/partially_received.';

-- ---------------------------------------------------------------------------
-- 6. Legacy PO→GRN path (post-QC insert columns + line supplier_id)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_grn_from_po(p_po_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_po record;
  v_grn_id bigint;
  v_grn_number text;
  v_location_id bigint;
  v_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'create_grn_from_po: anonymous caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'create_grn_from_po: missing tenant_id claim'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_po_id IS NULL OR p_po_id <= 0 THEN
    RAISE EXCEPTION 'create_grn_from_po: invalid PO id'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT
    purchase_order.id,
    purchase_order.supplier_id,
    purchase_order.status,
    purchase_order.branch_id,
    purchase_order.tenant_id,
    purchase_order.source_grn_id
  INTO v_po
  FROM public.purchase_orders AS purchase_order
  WHERE purchase_order.id = p_po_id
    AND purchase_order.tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'create_grn_from_po: PO not found in tenant scope'
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_po.status NOT IN ('sent', 'partially_received') THEN
    RAISE EXCEPTION 'create_grn_from_po: PO status not eligible'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_po.branch_id IS NULL THEN
    RAISE EXCEPTION 'create_grn_from_po: PO has no destination branch'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.branches AS branch
    WHERE branch.id = v_po.branch_id
      AND branch.tenant_id = v_tenant_id
      AND branch.is_active IS TRUE
      AND branch.branch_kind IN (
        'branch',
        'central_supply',
        'central_kitchen'
      )
  ) THEN
    RAISE EXCEPTION 'create_grn_from_po: branch inactive or out of scope'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.suppliers AS supplier
    WHERE supplier.id = v_po.supplier_id
      AND supplier.tenant_id = v_tenant_id
      AND supplier.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'create_grn_from_po: supplier inactive or out of scope'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT location.id
  INTO v_location_id
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant_id
    AND location.branch_id = v_po.branch_id
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE
    AND location.is_default_receive IS TRUE;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'create_grn_from_po: warehouse missing'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT EXISTS (
    WITH received AS (
      SELECT
        item.ingredient_id,
        sum(public.inv_to_base(
          item.ingredient_id,
          item.entry_unit_id,
          item.received_quantity - item.rejected_quantity
        )) AS base_quantity
      FROM public.grn_items AS item
      JOIN public.goods_received_notes AS grn
        ON grn.id = item.grn_id
       AND grn.tenant_id = item.tenant_id
      WHERE grn.po_id = v_po.id
        AND grn.tenant_id = v_tenant_id
        AND grn.status = 'confirmed'
      GROUP BY item.ingredient_id
    )
    SELECT 1
    FROM public.purchase_order_items AS po_item
    LEFT JOIN received USING (ingredient_id)
    WHERE po_item.tenant_id = v_tenant_id
      AND po_item.po_id = v_po.id
      AND public.inv_to_base(
        po_item.ingredient_id,
        po_item.entry_unit_id,
        po_item.quantity
      ) > coalesce(received.base_quantity, 0)
  ) THEN
    RAISE EXCEPTION 'create_grn_from_po: PO already fully received'
      USING ERRCODE = 'no_data_found';
  END IF;

  v_grn_number := public.next_inventory_doc_number(v_tenant_id, 'grn');

  INSERT INTO public.goods_received_notes (
    tenant_id,
    branch_id,
    location_id,
    supplier_id,
    po_id,
    grn_number,
    status,
    created_by
  )
  VALUES (
    v_tenant_id,
    v_po.branch_id,
    v_location_id,
    v_po.supplier_id,
    v_po.id,
    v_grn_number,
    'draft',
    v_user_id
  )
  RETURNING id INTO v_grn_id;

  IF v_grn_id IS NULL THEN
    RAISE EXCEPTION 'create_grn_from_po: header insert blocked (RLS)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.purchase_orders
  SET source_grn_id = COALESCE(source_grn_id, v_grn_id)
  WHERE id = v_po.id
    AND tenant_id = v_tenant_id;

  WITH received AS (
    SELECT
      item.ingredient_id,
      sum(public.inv_to_base(
        item.ingredient_id,
        item.entry_unit_id,
        item.received_quantity - item.rejected_quantity
      )) AS base_quantity
    FROM public.grn_items AS item
    JOIN public.goods_received_notes AS grn
      ON grn.id = item.grn_id
     AND grn.tenant_id = item.tenant_id
    WHERE grn.po_id = v_po.id
      AND grn.tenant_id = v_tenant_id
      AND grn.status = 'confirmed'
    GROUP BY item.ingredient_id
  ),
  remaining AS (
    SELECT
      po_item.ingredient_id,
      po_item.entry_unit_id,
      po_item.unit_price_est,
      round(
        (
          public.inv_to_base(
            po_item.ingredient_id,
            po_item.entry_unit_id,
            po_item.quantity
          ) - coalesce(received.base_quantity, 0)
        ) / public.inv_to_base(
          po_item.ingredient_id,
          po_item.entry_unit_id,
          1
        ),
        3
      )::numeric(15,3) AS quantity
    FROM public.purchase_order_items AS po_item
    LEFT JOIN received USING (ingredient_id)
    WHERE po_item.tenant_id = v_tenant_id
      AND po_item.po_id = v_po.id
  )
  INSERT INTO public.grn_items (
    tenant_id,
    grn_id,
    ingredient_id,
    supplier_id,
    received_quantity,
    rejected_quantity,
    rejection_reason,
    rejected_photo_url,
    entry_unit_id,
    unit_cost,
    total_cost
  )
  SELECT
    v_tenant_id,
    v_grn_id,
    remaining.ingredient_id,
    v_po.supplier_id,
    remaining.quantity,
    0,
    NULL,
    NULL,
    remaining.entry_unit_id,
    remaining.unit_price_est,
    round(remaining.quantity * remaining.unit_price_est, 2)
  FROM remaining
  WHERE remaining.quantity > 0;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'create_grn_from_po: items insert blocked (RLS)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM public.log_audit(
    'inventory.grn.created_from_po',
    'goods_received_note',
    v_grn_id,
    NULL,
    jsonb_build_object(
      'po_id', v_po.id,
      'branch_id', v_po.branch_id,
      'lines', v_count
    )
  );

  RETURN jsonb_build_object(
    'grn_id', v_grn_id,
    'grn_number', v_grn_number,
    'lines', v_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_grn_from_po(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_grn_from_po(bigint)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Recreate GRN at receiving site (post-QC columns only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.recreate_grn_at_receiving_site(
  p_grn_id bigint,
  p_target_branch_id bigint,
  p_target_location_id bigint,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  c_numeric_15_3_max CONSTANT numeric := 999999999999.999;
  c_numeric_15_2_max CONSTANT numeric := 9999999999999.99;
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_old_grn record;
  v_target_location record;
  v_old_location_id bigint;
  v_new_grn_id bigint;
  v_new_po_id bigint;
  v_new_grn_number text;
  v_new_po_display text;
  v_line record;
  v_net_qty numeric;
  v_net_base numeric;
  v_cost_base numeric;
  v_old_current_qty numeric;
  v_target_current_qty numeric;
  v_target_wac numeric;
  v_next_wac numeric;
  v_old_po_auto boolean := false;
  v_auto_po_lines integer := 0;
  v_invoice_id bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'reason_required_min_10_chars' USING ERRCODE = '22023';
  END IF;

  SELECT grn.*
  INTO v_old_grn
  FROM public.goods_received_notes AS grn
  WHERE grn.id = p_grn_id
    AND grn.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_old_grn.status <> 'confirmed' THEN
    RAISE EXCEPTION 'grn_not_confirmed' USING ERRCODE = '22023';
  END IF;

  IF v_old_grn.branch_id = p_target_branch_id THEN
    RAISE EXCEPTION 'same_branch_use_location_amend' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_permission(v_old_grn.branch_id, 'procurement:grn_amend') THEN
    RAISE EXCEPTION 'forbidden_source_branch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(p_target_branch_id, 'procurement:grn_amend')
     OR NOT public.has_permission(p_target_branch_id, 'procurement:grn_confirm') THEN
    RAISE EXCEPTION 'forbidden_target_branch' USING ERRCODE = '42501';
  END IF;

  SELECT location.id, location.branch_id, location.location_kind
  INTO v_target_location
  FROM public.inventory_locations AS location
  WHERE location.id = p_target_location_id
    AND location.tenant_id = v_tenant
    AND location.branch_id = p_target_branch_id
    AND location.is_active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target_location_invalid' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_returns AS supplier_return
    WHERE supplier_return.tenant_id = v_tenant
      AND supplier_return.grn_id = p_grn_id
      AND supplier_return.status <> 'cancelled'
  )
  OR EXISTS (
    SELECT 1
    FROM public.supplier_return_items AS return_item
    JOIN public.supplier_returns AS supplier_return
      ON supplier_return.id = return_item.return_id
     AND supplier_return.tenant_id = return_item.tenant_id
    JOIN public.grn_items AS grn_item
      ON grn_item.id = return_item.grn_item_id
     AND grn_item.tenant_id = return_item.tenant_id
    WHERE return_item.tenant_id = v_tenant
      AND grn_item.grn_id = p_grn_id
      AND supplier_return.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'has_active_supplier_return' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_invoices AS invoice
    WHERE invoice.tenant_id = v_tenant
      AND invoice.grn_id = p_grn_id
      AND (
        COALESCE(invoice.payment_status, 'unpaid') <> 'unpaid'
        OR COALESCE(invoice.paid_amount, 0) > 0
        OR COALESCE(invoice.credit_applied_amount, 0) > 0
      )
  ) THEN
    RAISE EXCEPTION 'has_paid_invoice' USING ERRCODE = '23514';
  END IF;

  IF v_old_grn.po_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.audit_logs AS audit_log
      WHERE audit_log.tenant_id = v_tenant
        AND audit_log.action = 'inventory.po.created_from_grn'
        AND audit_log.entity_type = 'purchase_order'
        AND audit_log.entity_id = v_old_grn.po_id
        AND audit_log.new_data ->> 'grn_id' = p_grn_id::text
    ) INTO v_old_po_auto;

    IF NOT v_old_po_auto THEN
      RAISE EXCEPTION 'source_po_attached' USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.goods_received_notes AS grn
      WHERE grn.tenant_id = v_tenant
        AND grn.po_id = v_old_grn.po_id
        AND grn.id <> p_grn_id
        AND grn.status = 'confirmed'
    ) THEN
      RAISE EXCEPTION 'source_po_shared' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_old_grn.location_id IS NOT NULL THEN
    SELECT location.id
    INTO v_old_location_id
    FROM public.inventory_locations AS location
    WHERE location.id = v_old_grn.location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = v_old_grn.branch_id
      AND location.is_active IS TRUE;
  ELSE
    SELECT location.id
    INTO v_old_location_id
    FROM public.inventory_locations AS location
    WHERE location.tenant_id = v_tenant
      AND location.branch_id = v_old_grn.branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_default_receive IS TRUE
      AND location.is_active IS TRUE
    ORDER BY location.id
    LIMIT 1;
  END IF;

  IF v_old_location_id IS NULL THEN
    RAISE EXCEPTION 'source_location_missing' USING ERRCODE = '23502';
  END IF;

  FOR v_line IN
    SELECT item.*
    FROM public.grn_items AS item
    WHERE item.tenant_id = v_tenant
      AND item.grn_id = p_grn_id
    ORDER BY item.id
    FOR UPDATE
  LOOP
    v_net_qty := v_line.received_quantity - v_line.rejected_quantity;
    v_net_base := public.inv_to_base(
      v_line.ingredient_id,
      v_line.entry_unit_id,
      v_net_qty
    );
    v_cost_base := CASE
      WHEN v_net_base <> 0 THEN ROUND(
        (v_net_qty * v_line.unit_cost) / v_net_base,
        2
      )
      ELSE v_line.unit_cost
    END;

    IF abs(v_net_base) > c_numeric_15_3_max
       OR abs(v_cost_base) > c_numeric_15_2_max THEN
      RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
    END IF;

    IF v_net_base <= 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.stock_levels (
      tenant_id,
      branch_id,
      ingredient_id,
      location_id,
      current_quantity
    ) VALUES (
      v_tenant,
      p_target_branch_id,
      v_line.ingredient_id,
      p_target_location_id,
      0
    )
    ON CONFLICT ON CONSTRAINT stock_levels_ingredient_branch_location_tenant_key
    DO NOTHING;

    PERFORM 1
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.ingredient_id = v_line.ingredient_id
      AND (
        (
          stock.branch_id = v_old_grn.branch_id
          AND stock.location_id = v_old_location_id
        )
        OR (
          stock.branch_id = p_target_branch_id
          AND stock.location_id = p_target_location_id
        )
      )
    ORDER BY stock.branch_id, stock.location_id, stock.ingredient_id
    FOR UPDATE;

    SELECT stock.current_quantity
    INTO v_old_current_qty
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = v_old_grn.branch_id
      AND stock.location_id = v_old_location_id
      AND stock.ingredient_id = v_line.ingredient_id;

    IF COALESCE(v_old_current_qty, 0) < v_net_base THEN
      RAISE EXCEPTION 'insufficient_source_stock:%', v_line.ingredient_id
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  v_new_grn_number := public.next_inventory_doc_number(v_tenant, 'grn');

  INSERT INTO public.goods_received_notes (
    tenant_id,
    branch_id,
    location_id,
    supplier_id,
    po_id,
    grn_number,
    received_date,
    received_by,
    status,
    notes,
    created_by
  ) VALUES (
    v_tenant,
    p_target_branch_id,
    p_target_location_id,
    v_old_grn.supplier_id,
    NULL,
    v_new_grn_number,
    v_old_grn.received_date,
    v_uid,
    'confirmed',
    NULLIF(btrim(v_old_grn.notes), ''),
    v_uid
  )
  RETURNING id INTO v_new_grn_id;

  INSERT INTO public.grn_items (
    tenant_id,
    grn_id,
    ingredient_id,
    supplier_id,
    received_quantity,
    entry_unit_id,
    unit_cost,
    total_cost,
    rejected_quantity,
    rejection_reason,
    rejected_photo_url
  )
  SELECT
    item.tenant_id,
    v_new_grn_id,
    item.ingredient_id,
    item.supplier_id,
    item.received_quantity,
    item.entry_unit_id,
    item.unit_cost,
    item.total_cost,
    item.rejected_quantity,
    item.rejection_reason,
    item.rejected_photo_url
  FROM public.grn_items AS item
  WHERE item.tenant_id = v_tenant
    AND item.grn_id = p_grn_id
  ORDER BY item.id;

  IF EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.tenant_id = v_tenant
      AND item.grn_id = v_new_grn_id
      AND item.received_quantity - item.rejected_quantity > 0
  ) THEN
    v_new_po_display := public.next_po_display_id(v_tenant);

    INSERT INTO public.purchase_orders (
      tenant_id,
      branch_id,
      supplier_id,
      po_number,
      display_id,
      status,
      notes,
      created_by,
      source_grn_id
    ) VALUES (
      v_tenant,
      p_target_branch_id,
      COALESCE(
        v_old_grn.supplier_id,
        (
          SELECT item.supplier_id
          FROM public.grn_items AS item
          WHERE item.grn_id = v_new_grn_id
            AND item.tenant_id = v_tenant
          ORDER BY item.id
          LIMIT 1
        )
      ),
      v_new_po_display,
      v_new_po_display,
      'received',
      NULLIF(btrim(v_old_grn.notes), ''),
      v_uid,
      v_new_grn_id
    )
    RETURNING id INTO v_new_po_id;

    INSERT INTO public.purchase_order_items (
      tenant_id,
      po_id,
      ingredient_id,
      quantity,
      entry_unit_id,
      unit_price_est,
      line_total
    )
    SELECT
      v_tenant,
      v_new_po_id,
      item.ingredient_id,
      (
        item.received_quantity - item.rejected_quantity
      )::numeric(15,3),
      item.entry_unit_id,
      item.unit_cost,
      ROUND(
        (item.received_quantity - item.rejected_quantity) * item.unit_cost,
        2
      )
    FROM public.grn_items AS item
    WHERE item.tenant_id = v_tenant
      AND item.grn_id = v_new_grn_id
      AND item.received_quantity - item.rejected_quantity > 0;

    GET DIAGNOSTICS v_auto_po_lines = ROW_COUNT;

    UPDATE public.goods_received_notes
    SET po_id = v_new_po_id,
        updated_at = now()
    WHERE id = v_new_grn_id
      AND tenant_id = v_tenant;

    PERFORM public.log_audit(
      'inventory.po.created_from_grn',
      'purchase_order',
      v_new_po_id,
      NULL,
      jsonb_build_object(
        'grn_id', v_new_grn_id,
        'lines', v_auto_po_lines,
        'branch_id', p_target_branch_id
      )
    );
  END IF;

  FOR v_line IN
    SELECT item.*
    FROM public.grn_items AS item
    WHERE item.tenant_id = v_tenant
      AND item.grn_id = p_grn_id
    ORDER BY item.id
  LOOP
    v_net_qty := v_line.received_quantity - v_line.rejected_quantity;
    v_net_base := public.inv_to_base(
      v_line.ingredient_id,
      v_line.entry_unit_id,
      v_net_qty
    );
    v_cost_base := CASE
      WHEN v_net_base <> 0 THEN ROUND(
        (v_net_qty * v_line.unit_cost) / v_net_base,
        2
      )
      ELSE v_line.unit_cost
    END;

    IF v_net_base <= 0 THEN
      CONTINUE;
    END IF;

    SELECT stock.current_quantity, stock.avg_unit_cost
    INTO v_target_current_qty, v_target_wac
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = p_target_branch_id
      AND stock.location_id = p_target_location_id
      AND stock.ingredient_id = v_line.ingredient_id;

    v_target_current_qty := COALESCE(v_target_current_qty, 0);

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
    ) VALUES (
      v_tenant,
      v_old_grn.branch_id,
      v_line.ingredient_id,
      'grn_amend',
      -v_net_base,
      'GRN ' || v_old_grn.grn_number || ' recreated at ' || v_new_grn_number ||
        ': reverse source receipt - ' || trim(p_reason),
      v_uid,
      p_grn_id,
      v_cost_base,
      v_old_location_id,
      v_line.entry_unit_id,
      v_net_qty
    );

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
    ) VALUES (
      v_tenant,
      p_target_branch_id,
      v_line.ingredient_id,
      'grn_receipt',
      v_net_base,
      'GRN ' || v_new_grn_number || ' recreated from ' || v_old_grn.grn_number ||
        ': target receipt - ' || trim(p_reason),
      v_uid,
      v_new_grn_id,
      v_cost_base,
      p_target_location_id,
      v_line.entry_unit_id,
      v_net_qty
    );

    v_next_wac := CASE
      WHEN v_target_current_qty + v_net_base > 0 THEN ROUND(
        (
          (v_target_current_qty * COALESCE(v_target_wac, 0))
          + (v_net_base * v_cost_base)
        ) / (v_target_current_qty + v_net_base),
        2
      )
      ELSE v_cost_base
    END;

    IF abs(v_next_wac) > c_numeric_15_2_max THEN
      RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
    END IF;

    UPDATE public.stock_levels AS stock
    SET avg_unit_cost = v_next_wac,
        updated_at = now()
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = p_target_branch_id
      AND stock.location_id = p_target_location_id
      AND stock.ingredient_id = v_line.ingredient_id;

    UPDATE public.ingredients AS ingredient
    SET unit_cost = v_cost_base,
        updated_at = now()
    WHERE ingredient.tenant_id = v_tenant
      AND ingredient.id = v_line.ingredient_id;
  END LOOP;

  UPDATE public.goods_received_notes
  SET status = 'cancelled',
      updated_at = now()
  WHERE id = p_grn_id
    AND tenant_id = v_tenant;

  IF v_old_po_auto THEN
    UPDATE public.purchase_orders
    SET status = 'cancelled',
        updated_at = now()
    WHERE id = v_old_grn.po_id
      AND tenant_id = v_tenant
      AND status IN ('sent', 'partially_received', 'received');
  END IF;

  UPDATE public.supplier_invoices
  SET grn_id = v_new_grn_id,
      po_id = v_new_po_id,
      updated_at = now()
  WHERE tenant_id = v_tenant
    AND grn_id = p_grn_id
    AND COALESCE(payment_status, 'unpaid') = 'unpaid'
    AND COALESCE(paid_amount, 0) = 0
    AND COALESCE(credit_applied_amount, 0) = 0;

  FOR v_invoice_id IN
    SELECT invoice.id
    FROM public.supplier_invoices AS invoice
    WHERE invoice.tenant_id = v_tenant
      AND invoice.grn_id = v_new_grn_id
  LOOP
    PERFORM public.recompute_supplier_invoice_matching(v_invoice_id);
  END LOOP;

  PERFORM public.log_audit(
    'inventory.grn.recreated_receiving_site',
    'goods_received_note',
    p_grn_id,
    jsonb_build_object(
      'grn_id', p_grn_id,
      'grn_number', v_old_grn.grn_number,
      'branch_id', v_old_grn.branch_id,
      'location_id', v_old_location_id,
      'po_id', v_old_grn.po_id,
      'status', 'confirmed'
    ),
    jsonb_build_object(
      'new_grn_id', v_new_grn_id,
      'new_grn_number', v_new_grn_number,
      'branch_id', p_target_branch_id,
      'location_id', p_target_location_id,
      'po_id', v_new_po_id,
      'old_auto_po_cancelled', v_old_po_auto,
      'reason', trim(p_reason)
    )
  );

  PERFORM public.log_audit(
    'inventory.grn.recreated_from_source',
    'goods_received_note',
    v_new_grn_id,
    NULL,
    jsonb_build_object(
      'source_grn_id', p_grn_id,
      'source_grn_number', v_old_grn.grn_number,
      'reason', trim(p_reason)
    )
  );

  RETURN jsonb_build_object(
    'old_grn_id', p_grn_id,
    'old_grn_number', v_old_grn.grn_number,
    'new_grn_id', v_new_grn_id,
    'new_grn_number', v_new_grn_number,
    'new_po_id', v_new_po_id,
    'old_auto_po_cancelled', v_old_po_auto
  );
END;
$$;

REVOKE ALL ON FUNCTION public.recreate_grn_at_receiving_site(
  bigint,
  bigint,
  bigint,
  text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recreate_grn_at_receiving_site(
  bigint,
  bigint,
  bigint,
  text
) TO authenticated, service_role;
