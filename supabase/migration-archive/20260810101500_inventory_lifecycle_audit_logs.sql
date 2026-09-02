-- Add operational audit_logs rows for issue confirm, stocktake create/complete,
-- and transfer ship/receive so DETAIL Lịch sử tabs are not empty.

CREATE OR REPLACE FUNCTION public.confirm_stock_issue(p_issue_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_issue public.stock_issues%ROWTYPE;
  v_item record;
  v_subtype text;
  v_stock_quantity numeric(15,3);
  v_wac numeric(15,2);
  v_quantity_base numeric(15,3);
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT issue.*
  INTO v_issue
  FROM public.stock_issues AS issue
  WHERE issue.id = p_issue_id
    AND issue.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_issue.branch_id,
    'inventory:write'
  ) THEN
    RAISE EXCEPTION 'forbidden_inventory_write'
      USING ERRCODE = '42501';
  END IF;
  IF v_issue.status <> 'draft' THEN
    RAISE EXCEPTION 'issue_not_draft' USING ERRCODE = '22023';
  END IF;
  IF v_issue.issue_type = 'writeoff'
     AND v_issue.approval_status = 'pending' THEN
    RAISE EXCEPTION 'writeoff_pending_approval'
      USING ERRCODE = '42501';
  END IF;
  IF v_issue.source_location_id IS NULL THEN
    RAISE EXCEPTION 'issue_source_location_missing'
      USING ERRCODE = '23502';
  END IF;

  PERFORM 1
  FROM public.inventory_locations AS location
  JOIN public.branches AS branch
    ON branch.id = location.branch_id
   AND branch.tenant_id = location.tenant_id
  WHERE location.id = v_issue.source_location_id
    AND location.tenant_id = v_tenant
    AND location.branch_id = v_issue.branch_id
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE
    AND branch.is_active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue_source_location_invalid'
      USING ERRCODE = '23514';
  END IF;

  v_subtype := CASE
    WHEN v_issue.issue_type = 'consumption'
      THEN 'sale_consumption'
    WHEN v_issue.issue_type = 'writeoff'
      THEN 'writeoff'
    WHEN v_issue.issue_type = 'other'
      THEN 'other'
    ELSE NULL
  END;

  FOR v_item IN
    SELECT item.*
    FROM public.stock_issue_items AS item
    WHERE item.issue_id = p_issue_id
      AND item.tenant_id = v_tenant
  LOOP
    v_quantity_base := public.inv_to_base(
      v_item.ingredient_id,
      v_item.entry_unit_id,
      v_item.quantity
    );

    SELECT stock.current_quantity, stock.avg_unit_cost
    INTO v_stock_quantity, v_wac
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = v_issue.branch_id
      AND stock.location_id = v_issue.source_location_id
      AND stock.ingredient_id = v_item.ingredient_id
    FOR UPDATE;

    IF NOT FOUND OR v_wac IS NULL THEN
      RAISE EXCEPTION 'wac_not_ready_for_%',
        v_item.ingredient_id
        USING ERRCODE = '22023';
    END IF;
    IF v_stock_quantity < v_quantity_base THEN
      RAISE EXCEPTION 'insufficient_stock_for_%',
        v_item.ingredient_id
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.stock_issue_items
    SET unit_cost = v_wac
    WHERE id = v_item.id
      AND tenant_id = v_tenant;

    INSERT INTO public.stock_movements (
      tenant_id,
      branch_id,
      ingredient_id,
      type,
      movement_subtype,
      quantity_change,
      unit_cost,
      reason,
      created_by,
      issue_id,
      location_id,
      entry_unit_id,
      entry_quantity
    )
    VALUES (
      v_tenant,
      v_issue.branch_id,
      v_item.ingredient_id,
      'consumption',
      v_subtype,
      -v_quantity_base,
      v_wac,
      coalesce(v_item.reason, v_issue.notes),
      v_uid,
      p_issue_id,
      v_issue.source_location_id,
      v_item.entry_unit_id,
      v_item.quantity
    );
  END LOOP;

  UPDATE public.stock_issues
  SET status = 'confirmed'
  WHERE id = p_issue_id
    AND tenant_id = v_tenant;


  PERFORM public.log_audit(
    'inventory.issue.confirmed',
    'stock_issue',
    p_issue_id,
    NULL,
    jsonb_build_object(
      'status', 'confirmed',
      'movement_subtype', v_subtype
    )
  );

  RETURN jsonb_build_object(
    'ok',
    TRUE,
    'issue_id',
    p_issue_id,
    'movement_subtype',
    v_subtype
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_stocktake_session(p_branch_id bigint, p_location_id bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_session_id bigint;
  v_location_id bigint;
  v_session_number text;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  PERFORM 1
  FROM public.branches AS branch
  WHERE branch.id = p_branch_id
    AND branch.tenant_id = v_tenant
    AND branch.is_active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    p_branch_id,
    'inventory:stocktake_create'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT location.id
  INTO v_location_id
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = p_branch_id
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE
    AND (
      p_location_id IS NULL
      OR location.id = p_location_id
    )
  ORDER BY
    location.is_default_consumption DESC,
    location.sort_order NULLS LAST,
    location.id
  LIMIT 1;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'location_not_found_or_inactive'
      USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = p_branch_id
      AND stock.location_id = v_location_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.ingredient_units AS ingredient_unit
        JOIN public.units AS unit
          ON unit.id = ingredient_unit.unit_id
         AND unit.tenant_id = ingredient_unit.tenant_id
         AND unit.is_active IS TRUE
        WHERE ingredient_unit.tenant_id = v_tenant
          AND ingredient_unit.ingredient_id = stock.ingredient_id
          AND ingredient_unit.is_base IS TRUE
          AND ingredient_unit.is_active IS TRUE
      )
  ) THEN
    RAISE EXCEPTION 'stocktake_entry_unit_missing'
      USING ERRCODE = '23503';
  END IF;

  v_session_number := public.next_inventory_doc_number(
    v_tenant,
    'stocktake'
  );

  INSERT INTO public.stocktake_sessions (
    tenant_id,
    branch_id,
    location_id,
    created_by,
    session_number
  )
  VALUES (
    v_tenant,
    p_branch_id,
    v_location_id,
    v_uid,
    v_session_number
  )
  RETURNING id INTO v_session_id;

  INSERT INTO public.stocktake_lines (
    tenant_id,
    session_id,
    ingredient_id,
    system_quantity,
    entry_unit_id
  )
  SELECT
    v_tenant,
    v_session_id,
    stock.ingredient_id,
    stock.current_quantity,
    base_unit.unit_id
  FROM public.stock_levels AS stock
  JOIN LATERAL (
    SELECT ingredient_unit.unit_id
    FROM public.ingredient_units AS ingredient_unit
    JOIN public.units AS unit
      ON unit.id = ingredient_unit.unit_id
     AND unit.tenant_id = ingredient_unit.tenant_id
     AND unit.is_active IS TRUE
    WHERE ingredient_unit.tenant_id = v_tenant
      AND ingredient_unit.ingredient_id = stock.ingredient_id
      AND ingredient_unit.is_base IS TRUE
      AND ingredient_unit.is_active IS TRUE
    ORDER BY ingredient_unit.sort_order, ingredient_unit.id
    LIMIT 1
  ) AS base_unit ON TRUE
  WHERE stock.tenant_id = v_tenant
    AND stock.branch_id = p_branch_id
    AND stock.location_id = v_location_id;


  PERFORM public.log_audit(
    'inventory.stocktake.created',
    'stocktake_session',
    v_session_id,
    NULL,
    jsonb_build_object(
      'status', 'in_progress',
      'session_number', v_session_number,
      'branch_id', p_branch_id,
      'location_id', v_location_id
    )
  );

  RETURN jsonb_build_object(
    'id',
    v_session_id,
    'session_number',
    v_session_number
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_stocktake(p_session_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_session public.stocktake_sessions%ROWTYPE;
  v_line record;
  v_fresh_quantity numeric(15,3);
  v_counted_base numeric(15,3);
  v_adjustment numeric(15,3);
  v_total_lines integer := 0;
  v_adjusted integer := 0;
  v_total_variance_abs numeric(15,3) := 0;
  v_reason text;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT session.*
  INTO v_session
  FROM public.stocktake_sessions AS session
  JOIN public.inventory_locations AS location
    ON location.id = session.location_id
   AND location.tenant_id = session.tenant_id
   AND location.branch_id = session.branch_id
   AND location.location_kind = 'warehouse'
   AND location.is_active IS TRUE
  WHERE session.id = p_session_id
    AND session.tenant_id = v_tenant
  FOR UPDATE OF session;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_session.branch_id,
    'inventory:stocktake_complete'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_session.status <> 'in_progress' THEN
    RAISE EXCEPTION 'session_not_in_progress'
      USING ERRCODE = '22023';
  END IF;

  PERFORM line.id
  FROM public.stocktake_lines AS line
  WHERE line.tenant_id = v_tenant
    AND line.session_id = p_session_id
    AND line.round_no = 1
  ORDER BY line.ingredient_id
  FOR UPDATE OF line;

  IF EXISTS (
    SELECT 1
    FROM public.stocktake_lines AS line
    WHERE line.tenant_id = v_tenant
      AND line.session_id = p_session_id
      AND line.round_no = 1
      AND line.counted_quantity IS NULL
  ) THEN
    RAISE EXCEPTION 'uncounted_lines_exist'
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.stocktake_lines AS line
    WHERE line.tenant_id = v_tenant
      AND line.session_id = p_session_id
      AND line.round_no = 1
      AND line.needs_recount IS TRUE
  ) THEN
    RAISE EXCEPTION 'recount_lines_exist'
      USING ERRCODE = '22023';
  END IF;

  FOR v_line IN
    SELECT line.*
    FROM public.stocktake_lines AS line
    WHERE line.tenant_id = v_tenant
      AND line.session_id = p_session_id
      AND line.round_no = 1
    ORDER BY line.ingredient_id
  LOOP
    v_total_lines := v_total_lines + 1;

    SELECT coalesce(stock.current_quantity, 0)
    INTO v_fresh_quantity
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = v_session.branch_id
      AND stock.location_id = v_session.location_id
      AND stock.ingredient_id = v_line.ingredient_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_fresh_quantity := 0;
    END IF;

    v_counted_base := public.inv_to_base(
      v_line.ingredient_id,
      v_line.entry_unit_id,
      v_line.counted_quantity
    );
    v_adjustment := v_counted_base - v_fresh_quantity;

    IF v_adjustment <> 0 THEN
      IF NULLIF(btrim(COALESCE(v_line.reason_code, '')), '') IS NULL THEN
        RAISE EXCEPTION 'stocktake_reason_code_required:%',
          v_line.ingredient_id
          USING ERRCODE = '22023';
      END IF;

      v_adjusted := v_adjusted + 1;
      v_total_variance_abs :=
        v_total_variance_abs + abs(v_adjustment);

      v_reason := v_line.reason_code
        || COALESCE(': ' || NULLIF(btrim(v_line.variance_reason), ''), '')
        || ' (Stocktake #' || p_session_id::text || ')';

      INSERT INTO public.stock_movements (
        tenant_id,
        branch_id,
        ingredient_id,
        type,
        quantity_change,
        reason,
        created_by,
        location_id,
        entry_unit_id,
        entry_quantity
      )
      VALUES (
        v_tenant,
        v_session.branch_id,
        v_line.ingredient_id,
        'count_adjustment',
        v_adjustment,
        v_reason,
        v_uid,
        v_session.location_id,
        v_line.entry_unit_id,
        v_line.counted_quantity
      );
    END IF;
  END LOOP;

  UPDATE public.stocktake_sessions
  SET status = 'completed',
      completed_at = now()
  WHERE id = p_session_id
    AND tenant_id = v_tenant;


  PERFORM public.log_audit(
    'inventory.stocktake.completed',
    'stocktake_session',
    p_session_id,
    jsonb_build_object('status', 'in_progress'),
    jsonb_build_object(
      'status', 'completed',
      'total_lines', v_total_lines,
      'adjusted_lines', v_adjusted,
      'total_variance_abs', v_total_variance_abs
    )
  );

  RETURN jsonb_build_object(
    'success',
    TRUE,
    'session_id',
    p_session_id,
    'total_lines',
    v_total_lines,
    'adjusted_lines',
    v_adjusted,
    'total_variance_abs',
    v_total_variance_abs
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.stock_transfer_confirm_ship(p_transfer_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_role text := public.auth_role();
  v_transfer record;
  v_line record;
  v_source_quantity numeric(15,3);
  v_source_wac numeric(15,2);
  v_quantity_base numeric(15,3);
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT transfer.*
  INTO v_transfer
  FROM public.stock_transfers AS transfer
  WHERE transfer.id = p_transfer_id
    AND transfer.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_transfer.status <> 'draft' THEN
    RAISE EXCEPTION 'transfer_not_draft' USING ERRCODE = '22023';
  END IF;
  IF v_transfer.from_branch_id = v_transfer.to_branch_id THEN
    RAISE EXCEPTION 'transfer_requires_distinct_branches'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM private.assert_stock_transfer_warehouse_endpoints(
    p_transfer_id,
    v_tenant
  );

  IF v_role = 'branch_manager' THEN
    RAISE EXCEPTION 'branch_manager_inter_site_ship_forbidden'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(
    v_transfer.from_branch_id,
    'inventory:transfer_ship'
  ) THEN
    RAISE EXCEPTION 'forbidden_transfer_ship'
      USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations AS location
    WHERE location.id = v_transfer.from_location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = v_transfer.from_branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations AS location
    WHERE location.id = v_transfer.to_location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = v_transfer.to_branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'transfer_warehouse_location_invalid'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.stock_transfer_items AS item
    WHERE item.transfer_id = p_transfer_id
      AND item.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'transfer_lines_required'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_line IN
    SELECT item.*
    FROM public.stock_transfer_items AS item
    WHERE item.transfer_id = p_transfer_id
      AND item.tenant_id = v_tenant
    ORDER BY item.ingredient_id
    FOR UPDATE
  LOOP
    IF v_line.quantity <= 0
       OR v_line.quantity = 'NaN'::numeric
       OR v_line.quantity = 'Infinity'::numeric
       OR v_line.quantity = '-Infinity'::numeric THEN
      RAISE EXCEPTION 'transfer_line_quantity_invalid:%',
        v_line.ingredient_id
        USING ERRCODE = '22023';
    END IF;

    v_quantity_base := public.inv_to_base(
      v_line.ingredient_id,
      v_line.entry_unit_id,
      v_line.quantity
    );

    SELECT stock.current_quantity, stock.avg_unit_cost
    INTO v_source_quantity, v_source_wac
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = v_transfer.from_branch_id
      AND stock.location_id = v_transfer.from_location_id
      AND stock.ingredient_id = v_line.ingredient_id
    FOR UPDATE;

    IF NOT FOUND
       OR coalesce(v_source_quantity, 0) < v_quantity_base THEN
      RAISE EXCEPTION 'insufficient_stock:%',
        v_line.ingredient_id
        USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id,
      branch_id,
      ingredient_id,
      type,
      quantity_change,
      reason,
      created_by,
      transfer_id,
      unit_cost,
      location_id,
      entry_unit_id,
      entry_quantity
    )
    VALUES (
      v_tenant,
      v_transfer.from_branch_id,
      v_line.ingredient_id,
      'transfer_out',
      -v_quantity_base,
      'Transfer ' || v_transfer.transfer_number,
      v_uid,
      p_transfer_id,
      v_source_wac,
      v_transfer.from_location_id,
      v_line.entry_unit_id,
      v_line.quantity
    );

    UPDATE public.stock_transfer_items
    SET unit_cost_at_ship = v_source_wac
    WHERE id = v_line.id;
  END LOOP;

  UPDATE public.stock_transfers
  SET status = 'confirmed_ship',
      shipped_at = now(),
      updated_at = now()
  WHERE id = p_transfer_id;


  PERFORM public.log_audit(
    'inventory.transfer.shipped',
    'stock_transfer',
    p_transfer_id,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object(
      'status', 'confirmed_ship',
      'transfer_number', v_transfer.transfer_number
    )
  );

  RETURN public.stock_transfer_mark_in_transit(p_transfer_id);

END;
$function$;

CREATE OR REPLACE FUNCTION private.execute_stock_transfer_receive(p_transfer_id bigint, p_items jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_tenant       BIGINT := public.auth_tenant_id();
  v_role         TEXT := public.auth_role();
  v_branch_claim BIGINT := public.auth_branch_id();
  v_tr           RECORD;
  v_line         RECORD;
  v_recv         NUMERIC(15,3);
  v_recv_base    NUMERIC(15,3);
  v_note         TEXT;
  v_cost         NUMERIC(15,2);
  v_old_q        NUMERIC(15,3);
  v_old_wac      NUMERIC(15,2);
  v_new_q        NUMERIC(15,3);
  v_new_wac      NUMERIC(15,2);
  v_key          TEXT;
  v_to_loc       RECORD;
  v_shortfall    NUMERIC(15,3);
  v_shortfall_base NUMERIC(15,3);
  v_class        TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_tr
  FROM public.stock_transfers
  WHERE id = p_transfer_id
    AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_tr.from_branch_id = v_tr.to_branch_id THEN
    RAISE EXCEPTION 'intra_branch_transfer_already_atomic' USING ERRCODE = '22023';
  END IF;

  IF v_role IN ('branch_manager', 'branch_manager', 'branch_manager')
     AND (v_branch_claim IS NULL OR v_branch_claim <> v_tr.to_branch_id) THEN
    RAISE EXCEPTION 'forbidden_transfer_receive' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_tr.to_branch_id, 'inventory:transfer_receive') THEN
    RAISE EXCEPTION 'forbidden_transfer_receive' USING ERRCODE = '42501';
  END IF;

  IF v_tr.status <> 'confirmed_receive' THEN
    RAISE EXCEPTION 'transfer_not_in_confirmed_receive' USING ERRCODE = '22023';
  END IF;

  IF v_tr.to_location_id IS NULL THEN
    RAISE EXCEPTION 'transfer_to_location_missing' USING ERRCODE = '23502';
  END IF;

  SELECT id, branch_id
  INTO v_to_loc
  FROM public.inventory_locations
  WHERE id = v_tr.to_location_id
    AND tenant_id = v_tenant
    AND is_active = TRUE;

  IF NOT FOUND OR v_to_loc.branch_id <> v_tr.to_branch_id THEN
    RAISE EXCEPTION 'transfer_to_location_invalid' USING ERRCODE = '23514';
  END IF;

  FOR v_line IN
    SELECT * FROM public.stock_transfer_items
    WHERE transfer_id = p_transfer_id
      AND tenant_id = v_tenant
  LOOP
    v_recv := v_line.quantity;
    v_note := NULL;
    v_class := NULL;

    IF p_items IS NOT NULL THEN
      v_key := v_line.ingredient_id::TEXT;
      IF (p_items ? v_key) THEN
        IF jsonb_typeof(p_items -> v_key) = 'object' THEN
          v_recv := ((p_items -> v_key) ->> 'qty')::NUMERIC;
          v_note := (p_items -> v_key) ->> 'note';
          v_class := NULLIF(btrim((p_items -> v_key) ->> 'shortfall_class'), '');
        ELSE
          v_recv := (p_items ->> v_key)::NUMERIC;
          v_class := NULL;
        END IF;
      END IF;
    END IF;

    IF v_recv < 0 OR v_recv > v_line.quantity THEN
      RAISE EXCEPTION 'invalid_receive_qty:%', v_line.ingredient_id USING ERRCODE = '22023';
    END IF;

    v_shortfall := v_line.quantity - COALESCE(v_recv, 0);
    IF v_shortfall > 0 THEN
      IF v_class IS NULL OR v_class NOT IN ('source_variance', 'transit_loss') THEN
        RAISE EXCEPTION 'short_receive_classification_required:%', v_line.ingredient_id
          USING ERRCODE = '22023';
      END IF;
      IF length(COALESCE(v_note, '')) < 5 THEN
        RAISE EXCEPTION 'short_receive_reason_required:%', v_line.ingredient_id
          USING ERRCODE = '22023';
      END IF;
    END IF;

    IF v_recv > 0 THEN
    v_recv_base := public.inv_to_base(v_line.ingredient_id, v_line.entry_unit_id, v_recv)::NUMERIC(15,3);
    v_cost := COALESCE(v_line.unit_cost_at_ship, 0);

    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_tr.to_branch_id
      AND sl.location_id = v_tr.to_location_id
      AND sl.ingredient_id = v_line.ingredient_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_old_q := 0;
      v_old_wac := NULL;
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, transfer_id, unit_cost, location_id,
      entry_unit_id, entry_quantity
    ) VALUES (
      v_tenant, v_tr.to_branch_id, v_line.ingredient_id, 'transfer_in', v_recv_base,
      'Transfer ' || v_tr.transfer_number, v_uid, p_transfer_id, v_cost,
      v_tr.to_location_id,
      v_line.entry_unit_id, v_recv
    );

    v_new_q := COALESCE(v_old_q, 0) + v_recv_base;
    IF v_new_q > 0 THEN
      v_new_wac := (
        COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_recv_base * v_cost
      ) / v_new_q;
    ELSE
      v_new_wac := v_cost;
    END IF;

    UPDATE public.stock_levels sl
    SET avg_unit_cost = v_new_wac,
        updated_at = now()
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_tr.to_branch_id
      AND sl.location_id = v_tr.to_location_id
      AND sl.ingredient_id = v_line.ingredient_id;
    END IF; -- v_recv > 0

    IF v_shortfall > 0 THEN
      IF v_tr.from_location_id IS NULL THEN
        RAISE EXCEPTION 'transfer_from_location_missing' USING ERRCODE = '23502';
      END IF;

      v_shortfall_base := public.inv_to_base(
        v_line.ingredient_id, v_line.entry_unit_id, v_shortfall
      )::NUMERIC(15,3);
      v_cost := COALESCE(v_line.unit_cost_at_ship, 0);

      INSERT INTO public.stock_movements (
        tenant_id, branch_id, ingredient_id, type, movement_subtype,
        quantity_change, reason, created_by, transfer_id, unit_cost,
        location_id, entry_unit_id, entry_quantity
      ) VALUES (
        v_tenant,
        v_tr.from_branch_id,
        v_line.ingredient_id,
        'adjustment',
        CASE
          WHEN v_class = 'transit_loss' THEN 'transfer_transit_loss'
          ELSE 'transfer_source_variance'
        END,
        0,
        CASE
          WHEN v_class = 'transit_loss' THEN
            'Transfer ' || v_tr.transfer_number
              || ' transit_loss: ' || v_note
          ELSE
            'Transfer ' || v_tr.transfer_number
              || ' source_variance: ' || v_note
        END,
        v_uid,
        p_transfer_id,
        v_cost,
        v_tr.from_location_id,
        v_line.entry_unit_id,
        v_shortfall
      );
    END IF;

    UPDATE public.stock_transfer_items
    SET quantity_received = v_recv,
        receive_note = CASE
          WHEN v_shortfall > 0 THEN
            COALESCE(v_note, '') || ' [shortfall_class=' || v_class || ']'
          ELSE v_note
        END
    WHERE id = v_line.id;
  END LOOP;

  UPDATE public.stock_transfers
  SET status = 'received',
      received_at = now(),
      updated_at = now()
  WHERE id = p_transfer_id;


  PERFORM public.log_audit(
    'inventory.transfer.received',
    'stock_transfer',
    p_transfer_id,
    jsonb_build_object('status', 'confirmed_receive'),
    jsonb_build_object(
      'status', 'received',
      'transfer_number', v_tr.transfer_number
    )
  );

  RETURN jsonb_build_object(
    'transfer_id', p_transfer_id,
    'status', 'received'
  );

END;
$$;

COMMENT ON FUNCTION public.confirm_stock_issue(p_issue_id bigint) IS
  'Confirms a tenant-bound draft issue only from an active site warehouse; writes inventory.issue.confirmed audit.';

COMMENT ON FUNCTION public.create_stocktake_session(p_branch_id bigint, p_location_id bigint) IS
  'Creates a stocktake only at the authenticated tenant site active warehouse; writes inventory.stocktake.created audit.';

COMMENT ON FUNCTION public.complete_stocktake(p_session_id bigint) IS
  'Completes a tenant-bound warehouse stocktake and writes count adjustments; variance lines require reason_code; writes inventory.stocktake.completed audit.';

