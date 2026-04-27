-- =============================================================
-- Inventory Pilot Contract V2
-- - Split transfer create/ship/receive permission gates in RPCs.
-- - Add one-step atomic intra-branch transfer for "Cap bep".
-- - Enforce transfer/issue location ownership.
-- - Make POS consumption fail when default_consumption is missing.
-- =============================================================

-- -----------------------------------------------------------------
-- create_stock_transfer_draft: inter-site draft creation only uses
-- inventory:transfer_create on the source branch. Branch managers may
-- create intra-branch "Cap bep" drafts only, not inter-site outbound.
-- -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_stock_transfer_draft(
  p_from_branch_id   BIGINT,
  p_to_branch_id     BIGINT,
  p_transfer_number  TEXT,
  p_notes            TEXT DEFAULT NULL,
  p_vehicle_info     TEXT DEFAULT NULL,
  p_lines            JSONB DEFAULT '[]'::JSONB,
  p_from_location_id BIGINT DEFAULT NULL,
  p_to_location_id   BIGINT DEFAULT NULL
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
  v_transfer_id  BIGINT;
  v_is_intra     BOOLEAN := (p_from_branch_id = p_to_branch_id);
  v_from_kind    TEXT;
  v_to_kind      TEXT;
  v_from_loc     RECORD;
  v_to_loc       RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant_not_found' USING ERRCODE = '22023';
  END IF;

  SELECT branch_kind INTO v_from_kind
  FROM public.branches
  WHERE id = p_from_branch_id
    AND tenant_id = v_tenant
    AND is_active = TRUE;

  SELECT branch_kind INTO v_to_kind
  FROM public.branches
  WHERE id = p_to_branch_id
    AND tenant_id = v_tenant
    AND is_active = TRUE;

  IF v_from_kind IS NULL OR v_to_kind IS NULL THEN
    RAISE EXCEPTION 'transfer_branch_invalid' USING ERRCODE = '23514';
  END IF;

  IF p_from_location_id IS NULL THEN
    RAISE EXCEPTION 'transfer_from_location_missing' USING ERRCODE = '23502';
  END IF;

  IF p_to_location_id IS NULL THEN
    RAISE EXCEPTION 'transfer_to_location_missing' USING ERRCODE = '23502';
  END IF;

  SELECT id, branch_id, location_kind, is_default_consumption
  INTO v_from_loc
  FROM public.inventory_locations
  WHERE id = p_from_location_id
    AND tenant_id = v_tenant
    AND is_active = TRUE;

  IF NOT FOUND OR v_from_loc.branch_id <> p_from_branch_id THEN
    RAISE EXCEPTION 'transfer_from_location_invalid' USING ERRCODE = '23514';
  END IF;

  SELECT id, branch_id, location_kind, is_default_consumption
  INTO v_to_loc
  FROM public.inventory_locations
  WHERE id = p_to_location_id
    AND tenant_id = v_tenant
    AND is_active = TRUE;

  IF NOT FOUND OR v_to_loc.branch_id <> p_to_branch_id THEN
    RAISE EXCEPTION 'transfer_to_location_invalid' USING ERRCODE = '23514';
  END IF;

  IF v_is_intra THEN
    IF v_from_kind <> 'branch' OR v_to_kind <> 'branch' THEN
      RAISE EXCEPTION 'intra_branch_requires_branch_site' USING ERRCODE = '23514';
    END IF;

    IF p_from_location_id = p_to_location_id THEN
      RAISE EXCEPTION 'intra_branch_same_location' USING ERRCODE = '22023';
    END IF;

    IF v_from_loc.location_kind <> 'warehouse' THEN
      RAISE EXCEPTION 'intra_branch_source_must_be_warehouse' USING ERRCODE = '23514';
    END IF;

    IF v_to_loc.location_kind <> 'kitchen' OR v_to_loc.is_default_consumption IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'intra_branch_target_must_be_default_consumption' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF v_role = 'branch_manager' THEN
      RAISE EXCEPTION 'branch_manager_inter_site_create_forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT public.has_permission(p_from_branch_id, 'inventory:transfer_create') THEN
    RAISE EXCEPTION 'forbidden_transfer_create' USING ERRCODE = '42501';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'transfer_lines_invalid' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_lines) AS line(value)
    LEFT JOIN public.ingredients i
      ON i.id = (line.value->>'ingredientId')::BIGINT
     AND i.tenant_id = v_tenant
    WHERE NOT (line.value ? 'ingredientId')
       OR NOT (line.value ? 'quantity')
       OR NOT (line.value ? 'unit')
       OR (line.value->>'quantity')::NUMERIC <= 0
       OR NULLIF(BTRIM(line.value->>'unit'), '') IS NULL
       OR i.id IS NULL
  ) THEN
    RAISE EXCEPTION 'transfer_lines_invalid' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.stock_transfers (
    tenant_id,
    from_branch_id,
    to_branch_id,
    from_location_id,
    to_location_id,
    transfer_number,
    status,
    notes,
    vehicle_info,
    created_by
  ) VALUES (
    v_tenant,
    p_from_branch_id,
    p_to_branch_id,
    p_from_location_id,
    p_to_location_id,
    p_transfer_number,
    'draft',
    p_notes,
    CASE WHEN v_is_intra THEN NULL ELSE p_vehicle_info END,
    v_uid
  )
  RETURNING id INTO v_transfer_id;

  INSERT INTO public.stock_transfer_items (
    tenant_id,
    transfer_id,
    ingredient_id,
    quantity,
    unit,
    unit_cost_at_ship
  )
  SELECT
    v_tenant,
    v_transfer_id,
    (line.value->>'ingredientId')::BIGINT,
    (line.value->>'quantity')::NUMERIC(15,3),
    NULLIF(BTRIM(line.value->>'unit'), ''),
    (
      SELECT sl.avg_unit_cost
      FROM public.stock_levels sl
      WHERE sl.tenant_id = v_tenant
        AND sl.branch_id = p_from_branch_id
        AND sl.location_id = p_from_location_id
        AND sl.ingredient_id = (line.value->>'ingredientId')::BIGINT
      LIMIT 1
    )
  FROM jsonb_array_elements(p_lines) AS line(value)
  ON CONFLICT (transfer_id, ingredient_id, tenant_id)
  DO UPDATE SET
    quantity = EXCLUDED.quantity,
    unit = EXCLUDED.unit,
    unit_cost_at_ship = EXCLUDED.unit_cost_at_ship;

  RETURN jsonb_build_object('id', v_transfer_id, 'status', 'draft');
END;
$$;

REVOKE ALL ON FUNCTION public.create_stock_transfer_draft(BIGINT, BIGINT, TEXT, TEXT, TEXT, JSONB, BIGINT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_stock_transfer_draft(BIGINT, BIGINT, TEXT, TEXT, TEXT, JSONB, BIGINT, BIGINT) TO authenticated;

-- -----------------------------------------------------------------
-- commit_intra_branch_transfer: one transaction for Branch Warehouse
-- -> Branch Kitchen/default_consumption. This is the live "Cap bep"
-- command for the pilot.
-- -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.commit_intra_branch_transfer(
  p_branch_id        BIGINT,
  p_from_location_id BIGINT,
  p_to_location_id   BIGINT,
  p_transfer_number  TEXT,
  p_notes            TEXT DEFAULT NULL,
  p_lines            JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_tenant       BIGINT := public.auth_tenant_id();
  v_branch_kind  TEXT;
  v_from_loc     RECORD;
  v_to_loc       RECORD;
  v_transfer_id  BIGINT;
  v_line         JSONB;
  v_ingredient   BIGINT;
  v_qty          NUMERIC(15,3);
  v_unit         TEXT;
  v_src_q        NUMERIC(15,3);
  v_src_wac      NUMERIC(15,2);
  v_dst_old_q    NUMERIC(15,3);
  v_dst_old_wac  NUMERIC(15,2);
  v_dst_new_q    NUMERIC(15,3);
  v_dst_new_wac  NUMERIC(15,2);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant_not_found' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'inventory:transfer_create') THEN
    RAISE EXCEPTION 'forbidden_transfer_create' USING ERRCODE = '42501';
  END IF;

  SELECT branch_kind INTO v_branch_kind
  FROM public.branches
  WHERE id = p_branch_id
    AND tenant_id = v_tenant
    AND is_active = TRUE;

  IF v_branch_kind IS DISTINCT FROM 'branch' THEN
    RAISE EXCEPTION 'intra_branch_requires_branch_site' USING ERRCODE = '23514';
  END IF;

  IF p_from_location_id = p_to_location_id THEN
    RAISE EXCEPTION 'intra_branch_same_location' USING ERRCODE = '22023';
  END IF;

  SELECT id, branch_id, location_kind, is_default_consumption
  INTO v_from_loc
  FROM public.inventory_locations
  WHERE id = p_from_location_id
    AND tenant_id = v_tenant
    AND is_active = TRUE;

  IF NOT FOUND OR v_from_loc.branch_id <> p_branch_id OR v_from_loc.location_kind <> 'warehouse' THEN
    RAISE EXCEPTION 'intra_branch_source_must_be_warehouse' USING ERRCODE = '23514';
  END IF;

  SELECT id, branch_id, location_kind, is_default_consumption
  INTO v_to_loc
  FROM public.inventory_locations
  WHERE id = p_to_location_id
    AND tenant_id = v_tenant
    AND is_active = TRUE;

  IF NOT FOUND
     OR v_to_loc.branch_id <> p_branch_id
     OR v_to_loc.location_kind <> 'kitchen'
     OR v_to_loc.is_default_consumption IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'intra_branch_target_must_be_default_consumption' USING ERRCODE = '23514';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'transfer_lines_required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.stock_transfers (
    tenant_id,
    from_branch_id,
    to_branch_id,
    from_location_id,
    to_location_id,
    transfer_number,
    status,
    notes,
    vehicle_info,
    created_by,
    shipped_at,
    received_at,
    receive_started_at
  ) VALUES (
    v_tenant,
    p_branch_id,
    p_branch_id,
    p_from_location_id,
    p_to_location_id,
    p_transfer_number,
    'received',
    p_notes,
    NULL,
    v_uid,
    now(),
    now(),
    now()
  )
  RETURNING id INTO v_transfer_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) AS line(value)
  LOOP
    IF NOT (v_line ? 'ingredientId') OR NOT (v_line ? 'quantity') OR NOT (v_line ? 'unit') THEN
      RAISE EXCEPTION 'transfer_lines_invalid' USING ERRCODE = '22023';
    END IF;

    v_ingredient := (v_line->>'ingredientId')::BIGINT;
    v_qty := (v_line->>'quantity')::NUMERIC(15,3);
    v_unit := NULLIF(BTRIM(v_line->>'unit'), '');

    IF v_qty <= 0 OR v_unit IS NULL THEN
      RAISE EXCEPTION 'transfer_lines_invalid' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.ingredients
      WHERE id = v_ingredient AND tenant_id = v_tenant
    ) THEN
      RAISE EXCEPTION 'transfer_ingredient_invalid:%', v_ingredient USING ERRCODE = '23514';
    END IF;

    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_src_q, v_src_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = p_branch_id
      AND sl.location_id = p_from_location_id
      AND sl.ingredient_id = v_ingredient
    FOR UPDATE;

    IF NOT FOUND OR COALESCE(v_src_q, 0) < v_qty THEN
      RAISE EXCEPTION 'insufficient_stock:%', v_ingredient USING ERRCODE = 'P0001';
    END IF;

    IF v_src_wac IS NULL THEN
      RAISE EXCEPTION 'wac_not_ready_for_%', v_ingredient USING ERRCODE = '22023';
    END IF;

    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_dst_old_q, v_dst_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = p_branch_id
      AND sl.location_id = p_to_location_id
      AND sl.ingredient_id = v_ingredient
    FOR UPDATE;

    IF NOT FOUND THEN
      v_dst_old_q := 0;
      v_dst_old_wac := NULL;
    END IF;

    INSERT INTO public.stock_transfer_items (
      tenant_id,
      transfer_id,
      ingredient_id,
      quantity,
      unit,
      unit_cost_at_ship,
      quantity_received
    ) VALUES (
      v_tenant,
      v_transfer_id,
      v_ingredient,
      v_qty,
      v_unit,
      v_src_wac,
      v_qty
    );

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, transfer_id, unit_cost, location_id
    ) VALUES (
      v_tenant, p_branch_id, v_ingredient, 'transfer_out', -v_qty,
      'Transfer ' || p_transfer_number, v_uid, v_transfer_id, v_src_wac,
      p_from_location_id
    );

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, transfer_id, unit_cost, location_id
    ) VALUES (
      v_tenant, p_branch_id, v_ingredient, 'transfer_in', v_qty,
      'Transfer ' || p_transfer_number, v_uid, v_transfer_id, v_src_wac,
      p_to_location_id
    );

    v_dst_new_q := COALESCE(v_dst_old_q, 0) + v_qty;
    v_dst_new_wac := (
      COALESCE(v_dst_old_q, 0) * COALESCE(v_dst_old_wac, 0)
        + v_qty * v_src_wac
    ) / v_dst_new_q;

    UPDATE public.stock_levels sl
    SET avg_unit_cost = v_dst_new_wac,
        updated_at = now()
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = p_branch_id
      AND sl.location_id = p_to_location_id
      AND sl.ingredient_id = v_ingredient;
  END LOOP;

  RETURN jsonb_build_object('id', v_transfer_id, 'status', 'received');
END;
$$;

REVOKE ALL ON FUNCTION public.commit_intra_branch_transfer(BIGINT, BIGINT, BIGINT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_intra_branch_transfer(BIGINT, BIGINT, BIGINT, TEXT, TEXT, JSONB) TO authenticated;

-- -----------------------------------------------------------------
-- Transfer state-machine RPCs: ship/receive split and location gates.
-- -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.stock_transfer_confirm_ship(p_transfer_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_tenant      BIGINT := public.auth_tenant_id();
  v_role        TEXT := public.auth_role();
  v_tr          RECORD;
  v_line        RECORD;
  v_src_q       NUMERIC(15,3);
  v_src_wac     NUMERIC(15,2);
  v_is_intra    BOOLEAN;
  v_required    TEXT;
  v_from_loc    RECORD;
  v_to_loc      RECORD;
  v_dst_old_q   NUMERIC(15,3);
  v_dst_old_wac NUMERIC(15,2);
  v_dst_new_q   NUMERIC(15,3);
  v_dst_new_wac NUMERIC(15,2);
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

  IF v_tr.status <> 'draft' THEN
    RAISE EXCEPTION 'transfer_not_draft' USING ERRCODE = '22023';
  END IF;

  v_is_intra := (v_tr.from_branch_id = v_tr.to_branch_id);
  v_required := CASE
    WHEN v_is_intra THEN 'inventory:transfer_create'
    ELSE 'inventory:transfer_ship'
  END;

  IF NOT public.has_permission(v_tr.from_branch_id, v_required) THEN
    RAISE EXCEPTION 'forbidden_transfer_ship' USING ERRCODE = '42501';
  END IF;

  IF v_role = 'branch_manager' AND NOT v_is_intra THEN
    RAISE EXCEPTION 'branch_manager_inter_site_ship_forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_tr.from_location_id IS NULL THEN
    RAISE EXCEPTION 'transfer_from_location_missing' USING ERRCODE = '23502';
  END IF;

  SELECT id, branch_id, location_kind, is_default_consumption
  INTO v_from_loc
  FROM public.inventory_locations
  WHERE id = v_tr.from_location_id
    AND tenant_id = v_tenant
    AND is_active = TRUE;

  IF NOT FOUND OR v_from_loc.branch_id <> v_tr.from_branch_id THEN
    RAISE EXCEPTION 'transfer_from_location_invalid' USING ERRCODE = '23514';
  END IF;

  IF v_is_intra THEN
    IF v_tr.to_location_id IS NULL THEN
      RAISE EXCEPTION 'intra_branch_transfer_requires_to_location' USING ERRCODE = '23502';
    END IF;

    SELECT id, branch_id, location_kind, is_default_consumption
    INTO v_to_loc
    FROM public.inventory_locations
    WHERE id = v_tr.to_location_id
      AND tenant_id = v_tenant
      AND is_active = TRUE;

    IF NOT FOUND
       OR v_to_loc.branch_id <> v_tr.to_branch_id
       OR v_from_loc.location_kind <> 'warehouse'
       OR v_to_loc.location_kind <> 'kitchen'
       OR v_to_loc.is_default_consumption IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'intra_branch_location_invalid' USING ERRCODE = '23514';
    END IF;
  END IF;

  FOR v_line IN
    SELECT * FROM public.stock_transfer_items
    WHERE transfer_id = p_transfer_id
      AND tenant_id = v_tenant
  LOOP
    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_src_q, v_src_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_tr.from_branch_id
      AND sl.location_id = v_tr.from_location_id
      AND sl.ingredient_id = v_line.ingredient_id
    FOR UPDATE;

    IF NOT FOUND OR COALESCE(v_src_q, 0) < v_line.quantity THEN
      RAISE EXCEPTION 'insufficient_stock:%', v_line.ingredient_id USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, transfer_id, unit_cost, location_id
    ) VALUES (
      v_tenant, v_tr.from_branch_id, v_line.ingredient_id, 'transfer_out', -v_line.quantity,
      'Transfer ' || v_tr.transfer_number, v_uid, p_transfer_id, v_src_wac,
      v_tr.from_location_id
    );

    UPDATE public.stock_transfer_items
    SET unit_cost_at_ship = v_src_wac
    WHERE id = v_line.id;

    IF v_is_intra THEN
      SELECT sl.current_quantity, sl.avg_unit_cost
      INTO v_dst_old_q, v_dst_old_wac
      FROM public.stock_levels sl
      WHERE sl.tenant_id = v_tenant
        AND sl.branch_id = v_tr.to_branch_id
        AND sl.location_id = v_tr.to_location_id
        AND sl.ingredient_id = v_line.ingredient_id
      FOR UPDATE;

      IF NOT FOUND THEN
        v_dst_old_q := 0;
        v_dst_old_wac := NULL;
      END IF;

      INSERT INTO public.stock_movements (
        tenant_id, branch_id, ingredient_id, type, quantity_change,
        reason, created_by, transfer_id, unit_cost, location_id
      ) VALUES (
        v_tenant, v_tr.to_branch_id, v_line.ingredient_id, 'transfer_in', v_line.quantity,
        'Transfer ' || v_tr.transfer_number, v_uid, p_transfer_id, v_src_wac,
        v_tr.to_location_id
      );

      v_dst_new_q := COALESCE(v_dst_old_q, 0) + v_line.quantity;
      v_dst_new_wac := (
        COALESCE(v_dst_old_q, 0) * COALESCE(v_dst_old_wac, 0)
          + v_line.quantity * COALESCE(v_src_wac, 0)
      ) / v_dst_new_q;

      UPDATE public.stock_levels sl
      SET avg_unit_cost = v_dst_new_wac,
          updated_at = now()
      WHERE sl.tenant_id = v_tenant
        AND sl.branch_id = v_tr.to_branch_id
        AND sl.location_id = v_tr.to_location_id
        AND sl.ingredient_id = v_line.ingredient_id;

      UPDATE public.stock_transfer_items
      SET quantity_received = v_line.quantity
      WHERE id = v_line.id;
    END IF;
  END LOOP;

  IF v_is_intra THEN
    UPDATE public.stock_transfers
    SET status = 'received',
        shipped_at = now(),
        received_at = now(),
        receive_started_at = COALESCE(receive_started_at, now()),
        updated_at = now()
    WHERE id = p_transfer_id;

    RETURN jsonb_build_object('transfer_id', p_transfer_id, 'status', 'received');
  END IF;

  UPDATE public.stock_transfers
  SET status = 'confirmed_ship',
      shipped_at = now(),
      updated_at = now()
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object('transfer_id', p_transfer_id, 'status', 'confirmed_ship');
END;
$$;

REVOKE ALL ON FUNCTION public.stock_transfer_confirm_ship(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stock_transfer_confirm_ship(BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION public.stock_transfer_mark_in_transit(p_transfer_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_tenant BIGINT := public.auth_tenant_id();
  v_tr     RECORD;
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
  v_uid    UUID := auth.uid();
  v_tenant BIGINT := public.auth_tenant_id();
  v_tr     RECORD;
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
  v_uid       UUID := auth.uid();
  v_tenant    BIGINT := public.auth_tenant_id();
  v_tr        RECORD;
  v_line      RECORD;
  v_recv      NUMERIC(15,3);
  v_note      TEXT;
  v_cost      NUMERIC(15,2);
  v_old_q     NUMERIC(15,3);
  v_old_wac   NUMERIC(15,2);
  v_new_q     NUMERIC(15,3);
  v_new_wac   NUMERIC(15,2);
  v_key       TEXT;
  v_transfer_total NUMERIC(15,2) := 0;
  v_journal_id     BIGINT;
  v_lines          JSONB;
  v_to_loc         RECORD;
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

-- -----------------------------------------------------------------
-- confirm_stock_issue: issue RPC also enforces app permission and source
-- location ownership. kitchen_use remains retired by CHECK constraint.
-- -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.confirm_stock_issue(p_issue_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         UUID   := auth.uid();
  v_tenant      BIGINT := public.auth_tenant_id();
  v_issue       RECORD;
  v_item        RECORD;
  v_branch_kind TEXT;
  v_subtype     TEXT;
  v_sl_q        NUMERIC(15,3);
  v_wac         NUMERIC(15,2);
  v_source_loc  RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_issue
  FROM public.stock_issues
  WHERE id = p_issue_id
    AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_issue.branch_id, 'inventory:write') THEN
    RAISE EXCEPTION 'forbidden_inventory_write' USING ERRCODE = '42501';
  END IF;

  IF v_issue.status <> 'draft' THEN
    RAISE EXCEPTION 'issue_not_draft' USING ERRCODE = '22023';
  END IF;

  IF v_issue.source_location_id IS NULL THEN
    RAISE EXCEPTION 'issue_source_location_missing' USING ERRCODE = '23502';
  END IF;

  SELECT id, branch_id
  INTO v_source_loc
  FROM public.inventory_locations
  WHERE id = v_issue.source_location_id
    AND tenant_id = v_tenant
    AND is_active = TRUE;

  IF NOT FOUND OR v_source_loc.branch_id <> v_issue.branch_id THEN
    RAISE EXCEPTION 'issue_source_location_invalid' USING ERRCODE = '23514';
  END IF;

  SELECT b.branch_kind INTO v_branch_kind
  FROM public.branches b
  WHERE b.id = v_issue.branch_id
    AND b.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue_branch_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_subtype := CASE
    WHEN v_issue.issue_type = 'consumption'
         AND v_branch_kind IN ('central_warehouse', 'central_kitchen')
      THEN 'storage_loss'
    WHEN v_issue.issue_type = 'consumption'
      THEN 'sale_consumption'
    WHEN v_issue.issue_type = 'writeoff'
      THEN 'writeoff'
    WHEN v_issue.issue_type = 'other'
      THEN 'other'
    ELSE NULL
  END;

  FOR v_item IN
    SELECT * FROM public.stock_issue_items
    WHERE issue_id = p_issue_id
      AND tenant_id = v_tenant
  LOOP
    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_sl_q, v_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_issue.branch_id
      AND sl.location_id = v_issue.source_location_id
      AND sl.ingredient_id = v_item.ingredient_id
    FOR UPDATE;

    IF NOT FOUND OR v_wac IS NULL THEN
      RAISE EXCEPTION 'wac_not_ready_for_%', v_item.ingredient_id
        USING ERRCODE = '22023';
    END IF;

    IF v_sl_q < v_item.quantity THEN
      RAISE EXCEPTION 'insufficient_stock_for_%', v_item.ingredient_id
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.stock_issue_items
    SET unit_cost = v_wac
    WHERE id = v_item.id
      AND tenant_id = v_tenant;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, movement_subtype,
      quantity_change, unit_cost, reason, created_by, issue_id, location_id
    ) VALUES (
      v_tenant,
      v_issue.branch_id,
      v_item.ingredient_id,
      'consumption',
      v_subtype,
      -v_item.quantity,
      v_wac,
      COALESCE(v_item.reason, v_issue.notes),
      v_uid,
      p_issue_id,
      v_issue.source_location_id
    );
  END LOOP;

  UPDATE public.stock_issues
  SET status = 'confirmed'
  WHERE id = p_issue_id
    AND tenant_id = v_tenant;

  RETURN jsonb_build_object(
    'ok', true,
    'issue_id', p_issue_id,
    'movement_subtype', v_subtype
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_stock_issue(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_stock_issue(BIGINT) TO authenticated;

-- -----------------------------------------------------------------
-- POS consumption: missing default_consumption is a setup gate, never a
-- silent fallback to default_receive.
-- -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.consume_stock_for_order(p_order_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_tenant      BIGINT := public.auth_tenant_id();
  v_order       RECORD;
  v_need        RECORD;
  v_sl          NUMERIC(15,3);
  v_total       NUMERIC(15,3);
  v_location_id BIGINT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT o.id, o.tenant_id, o.branch_id, o.status
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
    AND o.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stock_movements sm
    WHERE sm.order_id = p_order_id
      AND sm.type = 'consumption'
      AND sm.tenant_id = v_tenant
  ) THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'skipped', true, 'reason', 'already_consumed');
  END IF;

  SELECT il.id INTO v_location_id
  FROM public.inventory_locations il
  WHERE il.branch_id = v_order.branch_id
    AND il.tenant_id = v_tenant
    AND il.is_default_consumption = TRUE
    AND il.is_active = TRUE
  LIMIT 1;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'default_consumption_location_missing:%', v_order.branch_id USING ERRCODE = 'P0002';
  END IF;

  FOR v_need IN
    SELECT
      r.ingredient_id,
      SUM(oi.quantity::NUMERIC * r.quantity / r.yield_factor) AS need_qty
    FROM public.order_items oi
    JOIN public.recipes r
      ON r.menu_item_id = oi.menu_item_id
     AND r.tenant_id = oi.tenant_id
    WHERE oi.order_id = p_order_id
      AND oi.tenant_id = v_tenant
      AND oi.status <> 'cancelled'
    GROUP BY r.ingredient_id
  LOOP
    SELECT sl.current_quantity INTO v_sl
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_order.branch_id
      AND sl.location_id = v_location_id
      AND sl.ingredient_id = v_need.ingredient_id;

    v_total := COALESCE(v_sl, 0);
    IF v_total < v_need.need_qty THEN
      RAISE EXCEPTION 'insufficient_stock_ingredient:%', v_need.ingredient_id USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  FOR v_need IN
    SELECT
      r.ingredient_id,
      SUM(oi.quantity::NUMERIC * r.quantity / r.yield_factor) AS need_qty
    FROM public.order_items oi
    JOIN public.recipes r
      ON r.menu_item_id = oi.menu_item_id
     AND r.tenant_id = oi.tenant_id
    WHERE oi.order_id = p_order_id
      AND oi.tenant_id = v_tenant
      AND oi.status <> 'cancelled'
    GROUP BY r.ingredient_id
  LOOP
    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, order_id, unit_cost, location_id
    )
    SELECT
      v_tenant,
      v_order.branch_id,
      v_need.ingredient_id,
      'consumption',
      -v_need.need_qty,
      'Order ' || p_order_id::TEXT,
      v_uid,
      p_order_id,
      COALESCE(sl.avg_unit_cost, 0),
      v_location_id
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_order.branch_id
      AND sl.location_id = v_location_id
      AND sl.ingredient_id = v_need.ingredient_id;
  END LOOP;

  RETURN jsonb_build_object('order_id', p_order_id, 'consumed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_stock_for_order(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_stock_for_order(BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION public.consume_stock_for_order_service(
  p_order_id BIGINT,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor      UUID := COALESCE(p_actor_id, '00000000-0000-0000-0000-000000000000'::UUID);
  v_order      RECORD;
  v_need       RECORD;
  v_sl         NUMERIC(15,3);
  v_total      NUMERIC(15,3);
  v_location_id BIGINT;
BEGIN
  SELECT o.id, o.tenant_id, o.branch_id, o.status
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stock_movements sm
    WHERE sm.order_id = p_order_id
      AND sm.type = 'consumption'
      AND sm.tenant_id = v_order.tenant_id
  ) THEN
    RETURN jsonb_build_object(
      'order_id', p_order_id, 'skipped', true, 'reason', 'already_consumed'
    );
  END IF;

  SELECT il.id INTO v_location_id
  FROM public.inventory_locations il
  WHERE il.branch_id = v_order.branch_id
    AND il.tenant_id = v_order.tenant_id
    AND il.is_default_consumption = TRUE
    AND il.is_active = TRUE
  LIMIT 1;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'default_consumption_location_missing:%', v_order.branch_id USING ERRCODE = 'P0002';
  END IF;

  FOR v_need IN
    SELECT
      r.ingredient_id,
      SUM(oi.quantity::NUMERIC * r.quantity / r.yield_factor) AS need_qty
    FROM public.order_items oi
    JOIN public.recipes r
      ON r.menu_item_id = oi.menu_item_id
     AND r.tenant_id = oi.tenant_id
    WHERE oi.order_id = p_order_id
      AND oi.tenant_id = v_order.tenant_id
      AND oi.status <> 'cancelled'
    GROUP BY r.ingredient_id
  LOOP
    SELECT sl.current_quantity INTO v_sl
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_order.tenant_id
      AND sl.branch_id = v_order.branch_id
      AND sl.location_id = v_location_id
      AND sl.ingredient_id = v_need.ingredient_id;

    v_total := COALESCE(v_sl, 0);
    IF v_total < v_need.need_qty THEN
      RAISE EXCEPTION 'insufficient_stock_ingredient:%', v_need.ingredient_id
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  FOR v_need IN
    SELECT
      r.ingredient_id,
      SUM(oi.quantity::NUMERIC * r.quantity / r.yield_factor) AS need_qty
    FROM public.order_items oi
    JOIN public.recipes r
      ON r.menu_item_id = oi.menu_item_id
     AND r.tenant_id = oi.tenant_id
    WHERE oi.order_id = p_order_id
      AND oi.tenant_id = v_order.tenant_id
      AND oi.status <> 'cancelled'
    GROUP BY r.ingredient_id
  LOOP
    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, order_id, unit_cost, location_id
    )
    SELECT
      v_order.tenant_id,
      v_order.branch_id,
      v_need.ingredient_id,
      'consumption',
      -v_need.need_qty,
      'Order ' || p_order_id::TEXT,
      v_actor,
      p_order_id,
      COALESCE(sl.avg_unit_cost, 0),
      v_location_id
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_order.tenant_id
      AND sl.branch_id = v_order.branch_id
      AND sl.location_id = v_location_id
      AND sl.ingredient_id = v_need.ingredient_id;
  END LOOP;

  RETURN jsonb_build_object('order_id', p_order_id, 'consumed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_stock_for_order_service(BIGINT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_stock_for_order_service(BIGINT, UUID) TO service_role;
