-- Persist entry_unit_id inside the existing multi-row RPC transactions.

CREATE OR REPLACE FUNCTION public.create_production_order(p_branch_id bigint, p_production_number text, p_notes text DEFAULT NULL::text, p_items jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid    UUID   := auth.uid();
  v_tenant BIGINT := public.auth_tenant_id();
  v_branch RECORD;
  v_order_id BIGINT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_inventory_production_operator() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:production_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_production_number IS NULL OR btrim(p_production_number) = '' THEN
    RAISE EXCEPTION 'production_number_required' USING ERRCODE = '22023';
  END IF;

  SELECT id, branch_kind INTO v_branch
  FROM public.branches
  WHERE id = p_branch_id AND tenant_id = v_tenant AND is_active = TRUE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_branch.branch_kind NOT IN ('branch', 'central_kitchen') THEN
    RAISE EXCEPTION 'branch_must_be_operational' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.production_orders (
    tenant_id, branch_id, production_number, status, notes, created_by
  )
  VALUES (v_tenant, p_branch_id, p_production_number, 'draft', p_notes, v_uid)
  RETURNING id INTO v_order_id;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    INSERT INTO public.production_order_items (
      tenant_id, production_order_id, finished_good_id, quantity, unit, entry_unit_id
    )
    SELECT v_tenant, v_order_id,
      (line->>'finishedGoodId')::BIGINT,
      (line->>'quantity')::NUMERIC(15,3),
      NULLIF(btrim(line->>'unit'), ''),
      NULLIF(line->>'entryUnitId', '')::BIGINT
    FROM jsonb_array_elements(p_items) AS line
    WHERE line ? 'finishedGoodId' AND line ? 'quantity' AND line ? 'unit'
    ON CONFLICT (production_order_id, finished_good_id, tenant_id)
    DO UPDATE SET
      quantity = EXCLUDED.quantity,
      unit = EXCLUDED.unit,
      entry_unit_id = EXCLUDED.entry_unit_id;
  END IF;

  RETURN jsonb_build_object('id', v_order_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_stock_transfer_draft(p_from_branch_id bigint, p_to_branch_id bigint, p_transfer_number text, p_notes text DEFAULT NULL::text, p_vehicle_info text DEFAULT NULL::text, p_lines jsonb DEFAULT '[]'::jsonb, p_from_location_id bigint DEFAULT NULL::bigint, p_to_location_id bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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

    IF v_to_loc.location_kind <> 'kitchen' THEN
      RAISE EXCEPTION 'intra_branch_target_must_be_kitchen' USING ERRCODE = '23514';
    END IF;

    IF v_to_loc.is_default_consumption IS DISTINCT FROM TRUE THEN
      RAISE WARNING 'default_consumption_location_not_marked:branch %, location %',
        p_to_branch_id,
        p_to_location_id;
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
    entry_unit_id,
    unit_cost_at_ship
  )
  SELECT
    v_tenant,
    v_transfer_id,
    (line.value->>'ingredientId')::BIGINT,
    (line.value->>'quantity')::NUMERIC(15,3),
    NULLIF(BTRIM(line.value->>'unit'), ''),
    NULLIF(line.value->>'entryUnitId', '')::BIGINT,
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
    entry_unit_id = EXCLUDED.entry_unit_id,
    unit_cost_at_ship = EXCLUDED.unit_cost_at_ship;

  RETURN jsonb_build_object('id', v_transfer_id, 'status', 'draft');
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_production_recipe_lines(p_finished_good_id bigint, p_lines jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid           UUID   := auth.uid();
  v_tenant        BIGINT := public.auth_tenant_id();
  v_kept          BIGINT[] := ARRAY[]::BIGINT[];
  v_line          JSONB;
  v_ingredient_id BIGINT;
  v_quantity      NUMERIC;
  v_yield_factor  NUMERIC;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_inventory_production_operator() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission_any('menu:write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ingredients i
    WHERE i.id = p_finished_good_id AND i.tenant_id = v_tenant
      AND i.item_kind = 'finished_good' AND i.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'finished_good_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'lines_must_be_array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'lines_must_not_be_empty' USING ERRCODE = '22023';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    IF (v_line->>'ingredient_id') IS NULL OR (v_line->>'quantity') IS NULL
       OR (v_line->>'unit') IS NULL OR btrim(v_line->>'unit') = '' THEN
      RAISE EXCEPTION 'invalid_line_shape' USING ERRCODE = '22023';
    END IF;

    v_ingredient_id := (v_line->>'ingredient_id')::BIGINT;
    v_quantity := (v_line->>'quantity')::NUMERIC;
    v_yield_factor := COALESCE(NULLIF(v_line->>'yield_factor', '')::NUMERIC, 1.000);

    IF v_quantity <= 0 OR v_yield_factor <= 0 THEN
      RAISE EXCEPTION 'invalid_line_quantity' USING ERRCODE = '22023';
    END IF;

    IF v_ingredient_id = ANY(v_kept) THEN
      RAISE EXCEPTION 'duplicate_ingredient' USING ERRCODE = '23505';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.ingredients i
      WHERE i.id = v_ingredient_id AND i.tenant_id = v_tenant
        AND i.item_kind = 'raw_material' AND i.is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'ingredient_not_found' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.production_recipes (
      tenant_id, finished_good_id, ingredient_id,
      quantity, unit, entry_unit_id, note, yield_factor
    )
    VALUES (
      v_tenant, p_finished_good_id, v_ingredient_id,
      v_quantity, btrim(v_line->>'unit'),
      NULLIF(v_line->>'entry_unit_id', '')::BIGINT,
      NULLIF(v_line->>'note', ''), v_yield_factor
    )
    ON CONFLICT (finished_good_id, ingredient_id, tenant_id)
    DO UPDATE SET
      quantity = EXCLUDED.quantity, unit = EXCLUDED.unit,
      entry_unit_id = EXCLUDED.entry_unit_id,
      note = EXCLUDED.note, yield_factor = EXCLUDED.yield_factor;

    v_kept := v_kept || v_ingredient_id;
  END LOOP;

  DELETE FROM public.production_recipes pr
  WHERE pr.tenant_id = v_tenant
    AND pr.finished_good_id = p_finished_good_id
    AND NOT (pr.ingredient_id = ANY(v_kept));

  RETURN jsonb_build_object(
    'finished_good_id', p_finished_good_id,
    'kept_count', COALESCE(array_length(v_kept, 1), 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_recipe_lines(p_menu_item_id bigint, p_lines jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid    UUID   := auth.uid();
  v_tenant BIGINT := public.auth_tenant_id();
  v_kept   BIGINT[] := ARRAY[]::BIGINT[];
  v_line   JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_permission_any('menu:write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.menu_items mi WHERE mi.id = p_menu_item_id AND mi.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'menu_item_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF jsonb_typeof(p_lines) <> 'array' THEN RAISE EXCEPTION 'lines_must_be_array' USING ERRCODE = '22023'; END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    IF (v_line->>'ingredient_id') IS NULL OR (v_line->>'quantity') IS NULL OR (v_line->>'unit') IS NULL THEN
      RAISE EXCEPTION 'invalid_line_shape' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.recipes (tenant_id, menu_item_id, ingredient_id, quantity, unit, entry_unit_id, note, yield_factor)
    VALUES (v_tenant, p_menu_item_id, (v_line->>'ingredient_id')::BIGINT,
            (v_line->>'quantity')::NUMERIC, v_line->>'unit',
            NULLIF(v_line->>'entry_unit_id', '')::BIGINT,
            NULLIF(v_line->>'note',''), COALESCE((v_line->>'yield_factor')::NUMERIC, 1.000))
    ON CONFLICT (menu_item_id, ingredient_id, tenant_id)
    DO UPDATE SET quantity = EXCLUDED.quantity, unit = EXCLUDED.unit,
                  entry_unit_id = EXCLUDED.entry_unit_id,
                  note = EXCLUDED.note, yield_factor = EXCLUDED.yield_factor;
    v_kept := v_kept || (v_line->>'ingredient_id')::BIGINT;
  END LOOP;

  DELETE FROM public.recipes r
  WHERE r.tenant_id = v_tenant AND r.menu_item_id = p_menu_item_id
    AND NOT (r.ingredient_id = ANY(v_kept));

  RETURN jsonb_build_object('menu_item_id', p_menu_item_id, 'kept_count', COALESCE(array_length(v_kept, 1), 0));
END;
$$;

REVOKE ALL ON FUNCTION public.create_production_order(bigint, text, text, jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_production_order(bigint, text, text, jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.create_production_order(bigint, text, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.create_stock_transfer_draft(bigint, bigint, text, text, text, jsonb, bigint, bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_stock_transfer_draft(bigint, bigint, text, text, text, jsonb, bigint, bigint) TO authenticated;
GRANT ALL ON FUNCTION public.create_stock_transfer_draft(bigint, bigint, text, text, text, jsonb, bigint, bigint) TO service_role;

REVOKE ALL ON FUNCTION public.upsert_production_recipe_lines(bigint, jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.upsert_production_recipe_lines(bigint, jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.upsert_production_recipe_lines(bigint, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.upsert_recipe_lines(bigint, jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.upsert_recipe_lines(bigint, jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.upsert_recipe_lines(bigint, jsonb) TO service_role;
