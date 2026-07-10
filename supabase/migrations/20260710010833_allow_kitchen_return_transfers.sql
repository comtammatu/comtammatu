CREATE OR REPLACE FUNCTION public.create_stock_transfer_draft(
  p_from_branch_id bigint,
  p_to_branch_id bigint,
  p_transfer_number text,
  p_notes text DEFAULT NULL::text,
  p_vehicle_info text DEFAULT NULL::text,
  p_lines jsonb DEFAULT '[]'::jsonb,
  p_from_location_id bigint DEFAULT NULL::bigint,
  p_to_location_id bigint DEFAULT NULL::bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_role text := public.auth_role();
  v_branch_claim bigint := public.auth_branch_id();
  v_transfer_id bigint;
  v_is_intra boolean := p_from_branch_id = p_to_branch_id;
  v_from_kind text;
  v_to_kind text;
  v_from_loc record;
  v_to_loc record;
  v_line jsonb;
  v_ingredient_id bigint;
  v_entry_unit_id bigint;
  v_entry_qty numeric(15,3);
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

    IF NOT (
      (v_from_loc.location_kind = 'warehouse' AND v_to_loc.location_kind = 'kitchen')
      OR (v_from_loc.location_kind = 'kitchen' AND v_to_loc.location_kind = 'warehouse')
    ) THEN
      RAISE EXCEPTION 'intra_branch_location_invalid' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF v_role = 'branch_manager' THEN
      IF v_branch_claim IS NULL OR p_to_branch_id <> v_branch_claim THEN
        RAISE EXCEPTION 'branch_manager_inbound_request_forbidden' USING ERRCODE = '42501';
      END IF;

      IF v_to_kind <> 'branch' OR v_from_kind NOT IN ('central_supply', 'central_kitchen') THEN
        RAISE EXCEPTION 'branch_manager_inbound_request_source_invalid' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  IF v_role = 'branch_manager' THEN
    IF NOT public.has_permission(p_to_branch_id, 'inventory:transfer_create') THEN
      RAISE EXCEPTION 'forbidden_transfer_create' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.has_permission(p_from_branch_id, 'inventory:transfer_create') THEN
      RAISE EXCEPTION 'forbidden_transfer_create' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
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

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) AS line(value)
  LOOP
    v_ingredient_id := NULLIF(COALESCE(v_line->>'ingredientId', v_line->>'ingredient_id'), '')::bigint;
    v_entry_qty := NULLIF(v_line->>'quantity', '')::numeric(15,3);
    v_entry_unit_id := NULLIF(COALESCE(v_line->>'entryUnitId', v_line->>'entry_unit_id'), '')::bigint;

    IF v_ingredient_id IS NULL OR v_entry_qty IS NULL OR v_entry_qty <= 0 THEN
      RAISE EXCEPTION 'transfer_lines_invalid' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.ingredients i
      WHERE i.id = v_ingredient_id
        AND i.tenant_id = v_tenant
        AND i.is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'transfer_ingredient_invalid:%', v_ingredient_id USING ERRCODE = '23514';
    END IF;

    IF v_entry_unit_id IS NULL THEN
      SELECT iu.unit_id INTO v_entry_unit_id
      FROM public.ingredient_units iu
      JOIN public.units u
        ON u.id = iu.unit_id
       AND u.tenant_id = iu.tenant_id
       AND u.is_active = TRUE
      WHERE iu.tenant_id = v_tenant
        AND iu.ingredient_id = v_ingredient_id
        AND iu.is_base = TRUE
        AND iu.is_active = TRUE
      ORDER BY iu.sort_order ASC, iu.id ASC
      LIMIT 1;
    ELSE
      IF NOT EXISTS (
        SELECT 1
        FROM public.ingredient_units iu
        JOIN public.units u
          ON u.id = iu.unit_id
         AND u.tenant_id = iu.tenant_id
         AND u.is_active = TRUE
        WHERE iu.tenant_id = v_tenant
          AND iu.ingredient_id = v_ingredient_id
          AND iu.unit_id = v_entry_unit_id
          AND iu.is_active = TRUE
      ) THEN
        RAISE EXCEPTION 'entry_unit_not_found:%', v_ingredient_id USING ERRCODE = '23503';
      END IF;
    END IF;

    IF v_entry_unit_id IS NULL THEN
      RAISE EXCEPTION 'entry_unit_not_found:%', v_ingredient_id USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.stock_transfer_items (
      tenant_id,
      transfer_id,
      ingredient_id,
      quantity,
      entry_unit_id,
      unit_cost_at_ship
    ) VALUES (
      v_tenant,
      v_transfer_id,
      v_ingredient_id,
      v_entry_qty,
      v_entry_unit_id,
      (
        SELECT sl.avg_unit_cost
        FROM public.stock_levels sl
        WHERE sl.tenant_id = v_tenant
          AND sl.branch_id = p_from_branch_id
          AND sl.location_id = p_from_location_id
          AND sl.ingredient_id = v_ingredient_id
        LIMIT 1
      )
    )
    ON CONFLICT (transfer_id, ingredient_id, tenant_id)
    DO UPDATE SET
      quantity = EXCLUDED.quantity,
      entry_unit_id = EXCLUDED.entry_unit_id,
      unit_cost_at_ship = EXCLUDED.unit_cost_at_ship;
  END LOOP;

  RETURN jsonb_build_object('id', v_transfer_id, 'status', 'draft');
END;
$$;
