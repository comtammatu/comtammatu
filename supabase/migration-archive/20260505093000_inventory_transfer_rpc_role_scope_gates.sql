-- Tighten transfer RPC role/scope gates for the Inventory pilot contract.
-- Schema is unchanged. These guards close permission-key pollution where a
-- branch-scoped role is accidentally granted a transfer key outside its side.

CREATE OR REPLACE FUNCTION public.stock_transfer_mark_in_transit(p_transfer_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_tenant       BIGINT := public.auth_tenant_id();
  v_role         TEXT := public.auth_role();
  v_branch_claim BIGINT := public.auth_branch_id();
  v_tr           RECORD;
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
    RAISE EXCEPTION 'intra_branch_transfer_has_no_transit' USING ERRCODE = '22023';
  END IF;

  IF v_role = 'branch_manager' THEN
    RAISE EXCEPTION 'branch_manager_inter_site_ship_forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_role IN ('warehouse_manager', 'production_manager')
     AND (v_branch_claim IS NULL OR v_branch_claim <> v_tr.from_branch_id) THEN
    RAISE EXCEPTION 'forbidden_transfer_ship' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_tr.from_branch_id, 'inventory:transfer_ship') THEN
    RAISE EXCEPTION 'forbidden_transfer_ship' USING ERRCODE = '42501';
  END IF;

  IF v_tr.status <> 'confirmed_ship' THEN
    RAISE EXCEPTION 'transfer_wrong_state' USING ERRCODE = '22023';
  END IF;

  UPDATE public.stock_transfers
  SET status = 'in_transit',
      updated_at = now()
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object('transfer_id', p_transfer_id, 'status', 'in_transit');
END;
$$;

REVOKE ALL ON FUNCTION public.stock_transfer_mark_in_transit(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stock_transfer_mark_in_transit(BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION public.stock_transfer_confirm_receive(p_transfer_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_tenant       BIGINT := public.auth_tenant_id();
  v_role         TEXT := public.auth_role();
  v_branch_claim BIGINT := public.auth_branch_id();
  v_tr           RECORD;
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
    RAISE EXCEPTION 'intra_branch_transfer_has_no_receive_step' USING ERRCODE = '22023';
  END IF;

  IF v_role IN ('branch_manager', 'warehouse_manager', 'production_manager')
     AND (v_branch_claim IS NULL OR v_branch_claim <> v_tr.to_branch_id) THEN
    RAISE EXCEPTION 'forbidden_transfer_receive' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_tr.to_branch_id, 'inventory:transfer_receive') THEN
    RAISE EXCEPTION 'forbidden_transfer_receive' USING ERRCODE = '42501';
  END IF;

  IF v_tr.status <> 'in_transit' THEN
    RAISE EXCEPTION 'transfer_not_in_transit' USING ERRCODE = '22023';
  END IF;

  UPDATE public.stock_transfers
  SET status = 'confirmed_receive',
      receive_started_at = COALESCE(receive_started_at, now()),
      updated_at = now()
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object('transfer_id', p_transfer_id, 'status', 'confirmed_receive');
END;
$$;

REVOKE ALL ON FUNCTION public.stock_transfer_confirm_receive(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stock_transfer_confirm_receive(BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION public.stock_transfer_receive(
  p_transfer_id BIGINT,
  p_items       JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_tenant       BIGINT := public.auth_tenant_id();
  v_role         TEXT := public.auth_role();
  v_branch_claim BIGINT := public.auth_branch_id();
  v_tr           RECORD;
  v_line         RECORD;
  v_recv         NUMERIC(15,3);
  v_note         TEXT;
  v_cost         NUMERIC(15,2);
  v_old_q        NUMERIC(15,3);
  v_old_wac      NUMERIC(15,2);
  v_new_q        NUMERIC(15,3);
  v_new_wac      NUMERIC(15,2);
  v_key          TEXT;
  v_transfer_total NUMERIC(15,2) := 0;
  v_journal_id      BIGINT;
  v_lines           JSONB;
  v_to_loc          RECORD;
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

  IF v_role IN ('branch_manager', 'warehouse_manager', 'production_manager')
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

    IF p_items IS NOT NULL THEN
      v_key := v_line.ingredient_id::TEXT;
      IF (p_items ? v_key) THEN
        IF jsonb_typeof(p_items -> v_key) = 'object' THEN
          v_recv := ((p_items -> v_key) ->> 'qty')::NUMERIC;
          v_note := (p_items -> v_key) ->> 'note';
        ELSE
          v_recv := (p_items ->> v_key)::NUMERIC;
        END IF;
      END IF;
    END IF;

    IF v_recv < 0 OR v_recv > v_line.quantity THEN
      RAISE EXCEPTION 'invalid_receive_qty:%', v_line.ingredient_id USING ERRCODE = '22023';
    END IF;

    IF v_recv <= 0 THEN
      UPDATE public.stock_transfer_items
      SET quantity_received = 0,
          receive_note = v_note
      WHERE id = v_line.id;
      CONTINUE;
    END IF;

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
      reason, created_by, transfer_id, unit_cost, location_id
    ) VALUES (
      v_tenant, v_tr.to_branch_id, v_line.ingredient_id, 'transfer_in', v_recv,
      'Transfer ' || v_tr.transfer_number, v_uid, p_transfer_id, v_cost,
      v_tr.to_location_id
    );

    v_new_q := COALESCE(v_old_q, 0) + v_recv;
    IF v_new_q > 0 THEN
      v_new_wac := (
        COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_recv * v_cost
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

    UPDATE public.stock_transfer_items
    SET quantity_received = v_recv,
        receive_note = v_note
    WHERE id = v_line.id;

    v_transfer_total := v_transfer_total + (v_recv * v_cost);
  END LOOP;

  UPDATE public.stock_transfers
  SET status = 'received',
      received_at = now(),
      updated_at = now()
  WHERE id = p_transfer_id;

  IF v_transfer_total > 0 THEN
    v_lines := jsonb_build_array(jsonb_build_object(
      'rule_code', 'TRANSFER_INVENTORY',
      'amount', v_transfer_total,
      'line_description', 'Chuyen kho ' || v_tr.transfer_number
    ));

    v_journal_id := public.auto_post_journal(
      v_tenant,
      v_tr.to_branch_id,
      'transfer',
      p_transfer_id,
      'Nhan chuyen kho ' || v_tr.transfer_number,
      v_lines,
      now(),
      v_uid
    );

    IF v_journal_id IS NOT NULL THEN
      UPDATE public.stock_transfers
      SET journal_entry_id = v_journal_id
      WHERE id = p_transfer_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'transfer_id', p_transfer_id,
    'status', 'received',
    'journal_entry_id', v_journal_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stock_transfer_receive(BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stock_transfer_receive(BIGINT, JSONB) TO authenticated;
