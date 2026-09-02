-- Drop orphan / revoke-locked RPCs with zero app and print-agent callers.
-- 6-channel scan (JS .rpc, SQL PERFORM/SELECT, triggers, RLS, DEFAULT/CHECK, cron)
-- confirms no live callers. Internal pair dropped together:
--   save_purchase_orders_from_request → create_purchase_orders_from_request
-- Skipped: close_branch_day (intentional ADR 0024 retired stub; SQL tests assert it).
-- Skipped: stock_transfer_*_legacy, get_pos_session_report_legacy_20260725 (SQL wrappers).

DROP FUNCTION IF EXISTS public.save_purchase_orders_from_request(bigint, jsonb, boolean, uuid);
DROP FUNCTION IF EXISTS public.create_purchase_orders_from_request(bigint, jsonb);
DROP FUNCTION IF EXISTS public.save_purchase_order(bigint, date, text, jsonb, boolean);
DROP FUNCTION IF EXISTS public.approve_purchase_order(bigint);
DROP FUNCTION IF EXISTS public.create_purchase_order_from_grn(bigint);
DROP FUNCTION IF EXISTS public.add_stock_request_line(bigint, bigint, bigint, numeric);
DROP FUNCTION IF EXISTS public.submit_stock_request(bigint);
DROP FUNCTION IF EXISTS public.create_stock_request_draft(bigint, text);
DROP FUNCTION IF EXISTS public.confirm_goods_receipt_note_legacy(bigint);
DROP FUNCTION IF EXISTS public.confirm_payment_and_post(bigint, bigint, bigint, text);
DROP FUNCTION IF EXISTS public.get_orders_for_day(bigint, date);
DROP FUNCTION IF EXISTS public.bump_kds_ticket(bigint);

/*
-- RPC-ROLLBACK-MUST-INCLUDE-BODY
-- Snapshot source: supabase/migrations/20260802162900_baseline.sql
-- Restore with CREATE OR REPLACE + original GRANT/REVOKE below if rollback is required.

CREATE OR REPLACE FUNCTION public.save_purchase_orders_from_request(p_request_id bigint, p_orders jsonb, p_send boolean DEFAULT true, p_idempotency_key uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_result jsonb;
  v_po jsonb;
  v_po_id bigint;
  v_results jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_orders IS NULL
     OR jsonb_typeof(p_orders) <> 'array'
     OR jsonb_array_length(p_orders) = 0
     OR jsonb_array_length(p_orders) > 100 THEN
    RAISE EXCEPTION 'purchase_orders_invalid' USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.purchase_orders AS purchase_order
       WHERE purchase_order.tenant_id = v_tenant
         AND purchase_order.purchase_request_id = p_request_id
         AND purchase_order.save_idempotency_key = p_idempotency_key
     ) THEN
    SELECT jsonb_build_object(
      'purchase_orders',
      jsonb_agg(
        jsonb_build_object(
          'po_id', purchase_order.id,
          'po_number', purchase_order.po_number,
          'status', purchase_order.status
        )
        ORDER BY purchase_order.id
      )
    )
    INTO v_result
    FROM public.purchase_orders AS purchase_order
    WHERE purchase_order.tenant_id = v_tenant
      AND purchase_order.purchase_request_id = p_request_id
      AND purchase_order.save_idempotency_key = p_idempotency_key;
    RETURN v_result;
  END IF;

  v_result := public.create_purchase_orders_from_request(
    p_request_id,
    p_orders
  );

  FOR v_po IN
    SELECT value
    FROM jsonb_array_elements(v_result -> 'purchase_orders')
  LOOP
    v_po_id := (v_po ->> 'po_id')::bigint;
    UPDATE public.purchase_orders
    SET save_idempotency_key = p_idempotency_key
    WHERE id = v_po_id
      AND tenant_id = v_tenant;

    IF p_send THEN
      v_po := v_po || public.send_purchase_order(v_po_id);
    END IF;
    v_results := v_results || jsonb_build_array(v_po);
  END LOOP;

  RETURN jsonb_build_object('purchase_orders', v_results);
END;
$$;
REVOKE ALL ON FUNCTION public.save_purchase_orders_from_request(p_request_id bigint, p_orders jsonb, p_send boolean, p_idempotency_key uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.create_purchase_orders_from_request(p_request_id bigint, p_orders jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_order jsonb;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
BEGIN
  IF p_orders IS NULL
     OR jsonb_typeof(p_orders) <> 'array'
     OR jsonb_array_length(p_orders) = 0
     OR jsonb_array_length(p_orders) > 100 THEN
    RAISE EXCEPTION 'purchase_orders_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(*) <> count(DISTINCT order_row.supplier_id)
    FROM jsonb_to_recordset(p_orders)
      AS order_row(supplier_id bigint)
  ) THEN
    RAISE EXCEPTION 'purchase_orders_duplicate_supplier'
      USING ERRCODE = '22023';
  END IF;

  FOR v_order IN
    SELECT value
    FROM jsonb_array_elements(p_orders)
  LOOP
    v_result := public.create_purchase_order_from_request(
      p_request_id,
      (v_order ->> 'supplier_id')::bigint,
      NULLIF(v_order ->> 'expected_delivery_date', '')::date,
      COALESCE(v_order ->> 'notes', ''),
      v_order -> 'lines'
    );
    v_results := v_results || jsonb_build_array(v_result);
  END LOOP;

  RETURN jsonb_build_object('purchase_orders', v_results);
END;
$$;
REVOKE ALL ON FUNCTION public.create_purchase_orders_from_request(p_request_id bigint, p_orders jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.save_purchase_order(p_po_id bigint, p_expected_delivery_date date, p_notes text, p_lines jsonb, p_send boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_po public.purchase_orders%ROWTYPE;
  v_line_count integer;
  v_expected_count integer;
  v_status text;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT purchase_order.*
  INTO v_po
  FROM public.purchase_orders AS purchase_order
  WHERE purchase_order.id = p_po_id
    AND purchase_order.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_order_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(v_po.branch_id, 'procurement:po_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_po.status NOT IN ('draft', 'sent')
     OR EXISTS (
       SELECT 1
       FROM public.goods_received_notes AS grn
       WHERE grn.tenant_id = v_tenant
         AND grn.po_id = p_po_id
         AND grn.status = 'confirmed'
     ) THEN
    RAISE EXCEPTION 'purchase_order_not_editable'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.purchase_orders
  SET expected_delivery_date = p_expected_delivery_date,
      notes = NULLIF(btrim(p_notes), ''),
      updated_at = now()
  WHERE id = p_po_id
    AND tenant_id = v_tenant;

  IF p_lines IS NOT NULL THEN
    IF jsonb_typeof(p_lines) <> 'array'
       OR EXISTS (
         SELECT 1
         FROM public.goods_received_notes AS grn
         WHERE grn.tenant_id = v_tenant
           AND grn.po_id = p_po_id
           AND grn.status = 'draft'
       ) THEN
      RAISE EXCEPTION 'purchase_order_lines_locked'
        USING ERRCODE = '23514';
    END IF;

    SELECT count(*), count(DISTINCT line.line_id)
    INTO v_line_count, v_expected_count
    FROM jsonb_to_recordset(p_lines)
      AS line(line_id bigint);

    IF v_line_count <> v_expected_count
       OR v_line_count <> (
         SELECT count(*)
         FROM public.purchase_order_items AS item
         WHERE item.po_id = p_po_id
           AND item.tenant_id = v_tenant
       )
       OR EXISTS (
         SELECT 1
         FROM jsonb_to_recordset(p_lines)
           AS line(line_id bigint, quantity numeric, unit_price numeric)
         LEFT JOIN public.purchase_order_items AS item
           ON item.id = line.line_id
          AND item.po_id = p_po_id
          AND item.tenant_id = v_tenant
         WHERE item.id IS NULL
            OR line.quantity IS NULL
            OR line.quantity <= 0
            OR line.unit_price IS NULL
            OR line.unit_price < 0
       ) THEN
      RAISE EXCEPTION 'purchase_order_lines_invalid'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.purchase_order_items AS item
    SET quantity = line.quantity::numeric(15,3),
        unit_price_est = line.unit_price::numeric(15,2),
        line_total = round(line.quantity * line.unit_price, 2)
    FROM jsonb_to_recordset(p_lines)
      AS line(line_id bigint, quantity numeric, unit_price numeric)
    WHERE item.id = line.line_id
      AND item.po_id = p_po_id
      AND item.tenant_id = v_tenant;

    IF v_po.purchase_request_id IS NOT NULL THEN
      PERFORM private.recompute_purchase_request_status(
        v_po.purchase_request_id,
        v_tenant
      );
    END IF;
  END IF;

  IF p_send AND v_po.status = 'draft' THEN
    v_status := public.send_purchase_order(p_po_id) ->> 'status';
  ELSE
    v_status := v_po.status;
  END IF;

  PERFORM public.log_audit(
    'procurement.po.saved',
    'purchase_order',
    p_po_id,
    to_jsonb(v_po),
    jsonb_build_object(
      'status', v_status,
      'expected_delivery_date', p_expected_delivery_date,
      'line_count', CASE
        WHEN p_lines IS NULL THEN NULL
        ELSE jsonb_array_length(p_lines)
      END
    )
  );

  RETURN jsonb_build_object('id', p_po_id, 'status', v_status);
END;
$$;
REVOKE ALL ON FUNCTION public.save_purchase_order(p_po_id bigint, p_expected_delivery_date date, p_notes text, p_lines jsonb, p_send boolean) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.approve_purchase_order(p_po_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_po record;
  v_synced_lines integer := 0;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT purchase_order.*
  INTO v_po
  FROM public.purchase_orders purchase_order
  WHERE purchase_order.id = p_po_id
    AND purchase_order.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_order_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(v_po.branch_id, 'procurement:po_approve') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_po.status <> 'draft' THEN
    RAISE EXCEPTION 'purchase_order_not_draft' USING ERRCODE = '23514';
  END IF;
  IF v_po.purchase_request_id IS NULL
     AND v_po.source_grn_id IS NULL THEN
    RAISE EXCEPTION 'purchase_order_source_required'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.purchase_order_items item
    WHERE item.po_id = p_po_id
      AND item.tenant_id = v_tenant
  )
  OR EXISTS (
    SELECT 1
    FROM public.purchase_order_items item
    WHERE item.po_id = p_po_id
      AND item.tenant_id = v_tenant
      AND (
        item.quantity <= 0
        OR item.unit_price_est IS NULL
        OR item.unit_price_est < 0
      )
  ) THEN
    RAISE EXCEPTION 'purchase_order_lines_incomplete'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.purchase_order_items
  SET line_total = round(quantity * unit_price_est, 2)
  WHERE po_id = p_po_id
    AND tenant_id = v_tenant;

  -- Compatibility only: price an existing retrospective draft GRN.
  WITH synced AS (
    UPDATE public.grn_items grn_item
    SET unit_cost = po_item.unit_price_est,
        total_cost = round(
          (grn_item.received_quantity - grn_item.rejected_quantity)
          * po_item.unit_price_est,
          2
        )
    FROM public.purchase_order_items po_item
    WHERE v_po.source_grn_id IS NOT NULL
      AND grn_item.grn_id = v_po.source_grn_id
      AND grn_item.tenant_id = v_tenant
      AND po_item.po_id = p_po_id
      AND po_item.tenant_id = v_tenant
      AND po_item.ingredient_id = grn_item.ingredient_id
      AND po_item.entry_unit_id IS NOT DISTINCT FROM grn_item.entry_unit_id
    RETURNING grn_item.id
  )
  SELECT count(*)::integer
  INTO v_synced_lines
  FROM synced;

  UPDATE public.purchase_orders
  SET status = 'sent',
      ordered_at = now(),
      updated_at = now()
  WHERE id = p_po_id
    AND tenant_id = v_tenant;

  RETURN jsonb_build_object(
    'id', p_po_id,
    'status', 'sent',
    'grn_unit_cost_synced_lines', v_synced_lines
  );
END;
$$;
REVOKE ALL ON FUNCTION public.approve_purchase_order(p_po_id bigint) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.create_purchase_order_from_grn(p_grn_id bigint) RETURNS jsonb
    LANGUAGE plpgsql
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
REVOKE ALL ON FUNCTION public.create_purchase_order_from_grn(p_grn_id bigint) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.add_stock_request_line(p_request_id bigint, p_ingredient_id bigint, p_entry_unit_id bigint, p_quantity numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_req public.stock_requests%ROWTYPE;
  v_fulfill text;
  v_item_id bigint;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_req
  FROM public.stock_requests AS req
  WHERE req.id = p_request_id
    AND req.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stock_request_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_req.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'stock_request_not_draft' USING ERRCODE = '22023';
  END IF;
  IF NOT public.auth_is_owner(auth.uid())
     AND NOT public.has_permission(
       v_req.branch_id,
       'inventory:request_create'
     )
  THEN
    RAISE EXCEPTION 'forbidden_request_create' USING ERRCODE = '42501';
  END IF;

  SELECT ingredient.default_fulfill_site_kind
  INTO v_fulfill
  FROM public.ingredients AS ingredient
  WHERE ingredient.id = p_ingredient_id
    AND ingredient.tenant_id = v_tenant
    AND ingredient.is_active IS TRUE;

  IF v_fulfill IS NULL THEN
    RAISE EXCEPTION 'ingredient_fulfill_site_required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'stock_request_qty_invalid' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.stock_request_items (
    tenant_id,
    request_id,
    ingredient_id,
    entry_unit_id,
    quantity,
    fulfill_site_kind,
    status
  )
  VALUES (
    v_tenant,
    p_request_id,
    p_ingredient_id,
    p_entry_unit_id,
    p_quantity,
    v_fulfill,
    'pending'
  )
  RETURNING id INTO v_item_id;

  RETURN jsonb_build_object(
    'item_id', v_item_id,
    'fulfill_site_kind', v_fulfill
  );
END;
$$;
REVOKE ALL ON FUNCTION public.add_stock_request_line(p_request_id bigint, p_ingredient_id bigint, p_entry_unit_id bigint, p_quantity numeric) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.submit_stock_request(p_request_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_req public.stock_requests%ROWTYPE;
  v_line_count int;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_req
  FROM public.stock_requests AS req
  WHERE req.id = p_request_id AND req.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stock_request_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_req.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'stock_request_not_draft' USING ERRCODE = '22023';
  END IF;
  IF NOT public.auth_is_owner(auth.uid())
     AND NOT public.has_permission(
       v_req.branch_id,
       'inventory:request_submit'
     )
  THEN
    RAISE EXCEPTION 'forbidden_request_submit' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::int INTO v_line_count
  FROM public.stock_request_items AS item
  WHERE item.request_id = p_request_id
    AND item.tenant_id = v_tenant;

  IF v_line_count < 1 THEN
    RAISE EXCEPTION 'stock_request_empty' USING ERRCODE = '22023';
  END IF;

  UPDATE public.stock_requests
  SET status = 'submitted',
      submitted_at = now(),
      updated_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'submitted');
END;
$$;
REVOKE ALL ON FUNCTION public.submit_stock_request(p_request_id bigint) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.create_stock_request_draft(p_branch_id bigint, p_notes text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_kind text;
  v_id bigint;
  v_number text;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT branch.branch_kind INTO v_kind
  FROM public.branches AS branch
  WHERE branch.id = p_branch_id
    AND branch.tenant_id = v_tenant
    AND branch.is_active IS TRUE;

  IF v_kind IS DISTINCT FROM 'branch' THEN
    RAISE EXCEPTION 'stock_request_branch_site_only'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.auth_is_owner(auth.uid())
     AND NOT public.has_permission(p_branch_id, 'inventory:request_create')
  THEN
    RAISE EXCEPTION 'forbidden_request_create' USING ERRCODE = '42501';
  END IF;

  v_number := public.next_inventory_doc_number(v_tenant, 'stock_request');

  INSERT INTO public.stock_requests (
    tenant_id, branch_id, request_number, status, notes, created_by
  )
  VALUES (
    v_tenant, p_branch_id, v_number, 'draft', p_notes, v_uid
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'request_id', v_id,
    'request_number', v_number
  );
END;
$$;
REVOKE ALL ON FUNCTION public.create_stock_request_draft(p_branch_id bigint, p_notes text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.confirm_goods_receipt_note_legacy(p_grn_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
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
REVOKE ALL ON FUNCTION public.confirm_goods_receipt_note_legacy(p_grn_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_goods_receipt_note_legacy(p_grn_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.confirm_goods_receipt_note_legacy(p_grn_id bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.confirm_payment_and_post(p_payment_id bigint, p_tenant_id bigint, p_branch_id bigint, p_provider_ref text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid           UUID := auth.uid();
  v_payment       RECORD;
  v_order         RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.* INTO v_payment
  FROM public.payments p
  WHERE p.id = p_payment_id
    AND p.tenant_id = p_tenant_id
    AND p.branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_payment.status <> 'pending' THEN
    RAISE EXCEPTION 'payment_not_pending' USING ERRCODE = '22023';
  END IF;

  SELECT o.id, o.total_amount, o.tax_amount
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_payment.order_id
    AND o.tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.payments
  SET status = 'completed',
      provider_ref = COALESCE(p_provider_ref, provider_ref),
      paid_at = now(),
      updated_at = now()
  WHERE id = p_payment_id;

  UPDATE public.orders
  SET payment_status = 'paid',
      updated_at = now()
  WHERE id = v_payment.order_id
    AND tenant_id = p_tenant_id;

  PERFORM public.finalize_paid_order(v_payment.order_id, v_uid);

  RETURN jsonb_build_object(
    'payment_id', p_payment_id,
    'status', 'completed'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_payment_and_post(p_payment_id bigint, p_tenant_id bigint, p_branch_id bigint, p_provider_ref text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_payment_and_post(p_payment_id bigint, p_tenant_id bigint, p_branch_id bigint, p_provider_ref text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_orders_for_day(p_branch_id bigint, p_date date) RETURNS TABLE(order_id bigint, order_number text, branch_id bigint, branch_name text, paid_at timestamp with time zone, paid_hour integer, order_type text, subtotal numeric, discount_amount numeric, tax_amount numeric, total_amount numeric, payment_method text, item_count bigint, invoice_status text, invoice_number text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid    UUID;
  v_tenant BIGINT;
BEGIN
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_id required for drill-down'
      USING ERRCODE = '22023';
  END IF;

  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant
    FROM public.profiles pr WHERE pr.id = v_uid;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'finance:view') THEN
    RAISE EXCEPTION 'permission denied: finance:view required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT
      o.id AS order_id,
      o.order_number,
      o.branch_id,
      b.name AS branch_name,
      p.paid_at,
      EXTRACT(HOUR FROM (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::INT
        AS paid_hour,
      o.order_type,
      o.subtotal,
      o.discount_amount,
      o.tax_amount,
      o.total_amount,
      o.payment_method,
      (SELECT COUNT(*) FROM public.order_items oi
        WHERE oi.order_id = o.id AND oi.status <> 'cancelled')::BIGINT
        AS item_count,
      ti.status         AS invoice_status,
      ti.invoice_number
    FROM public.orders o
    JOIN public.branches b
      ON b.id = o.branch_id
     AND b.tenant_id = o.tenant_id
    JOIN public.payments p
      ON p.order_id  = o.id
     AND p.tenant_id = o.tenant_id
     AND p.status    = 'completed'
     AND p.paid_at IS NOT NULL
    LEFT JOIN public.tax_invoices ti
      ON ti.order_id  = o.id
     AND ti.tenant_id = o.tenant_id
     AND ti.status NOT IN ('cancelled', 'replaced')
    WHERE o.tenant_id = v_tenant
      AND o.branch_id = p_branch_id
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
      AND (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = p_date
    ORDER BY p.paid_at;
END;
$$;
REVOKE ALL ON FUNCTION public.get_orders_for_day(p_branch_id bigint, p_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_orders_for_day(p_branch_id bigint, p_date date) TO authenticated;
GRANT ALL ON FUNCTION public.get_orders_for_day(p_branch_id bigint, p_date date) TO service_role;

CREATE OR REPLACE FUNCTION public.bump_kds_ticket(p_ticket_id bigint) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_ticket record;
  v_order_id bigint;
  v_new_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('kds:mark_ready') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT kt.order_id
  INTO v_order_id
  FROM public.kds_tickets kt
  WHERE kt.id = p_ticket_id
    AND kt.tenant_id = public.auth_tenant_id()
    AND (public.auth_role() = 'owner' OR kt.branch_id = public.auth_branch_id());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(v_order_id);

  SELECT id, tenant_id, branch_id, station_id, order_id, status
  INTO v_ticket
  FROM public.kds_tickets
  WHERE id = p_ticket_id
    AND tenant_id = public.auth_tenant_id()
    AND (public.auth_role() = 'owner' OR branch_id = public.auth_branch_id())
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_ticket.status = 'pending' THEN
    v_new_status := 'preparing';
  ELSIF v_ticket.status = 'preparing' THEN
    v_new_status := 'ready';
  ELSE
    RAISE EXCEPTION 'Ticket cannot be bumped from status %', v_ticket.status
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.kds_tickets
  SET status = v_new_status,
      bumped_at = now(),
      bumped_by = auth.uid(),
      first_ready_at = CASE
        WHEN v_new_status = 'ready' THEN COALESCE(first_ready_at, now())
        ELSE first_ready_at
      END,
      updated_at = now()
  WHERE id = p_ticket_id;

  IF v_new_status = 'ready' THEN
    PERFORM public.check_order_ready(v_ticket.order_id);
    PERFORM public.post_pos_sale_consumption_if_ready(v_ticket.order_id, auth.uid());
  END IF;

  RETURN v_new_status;
END;
$$;
REVOKE ALL ON FUNCTION public.bump_kds_ticket(p_ticket_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.bump_kds_ticket(p_ticket_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.bump_kds_ticket(p_ticket_id bigint) TO service_role;

*/
