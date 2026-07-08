SET search_path TO '';

WITH base_units AS (
  SELECT DISTINCT ON (iu.tenant_id, iu.ingredient_id)
    iu.tenant_id,
    iu.ingredient_id,
    iu.unit_id
  FROM public.ingredient_units iu
  JOIN public.units u
    ON u.id = iu.unit_id
   AND u.tenant_id = iu.tenant_id
   AND u.is_active = TRUE
  WHERE iu.is_base = TRUE
    AND iu.is_active = TRUE
  ORDER BY iu.tenant_id, iu.ingredient_id, iu.sort_order ASC, iu.id ASC
)
UPDATE public.production_recipes pr
SET entry_unit_id = bu.unit_id
FROM base_units bu
WHERE pr.tenant_id = bu.tenant_id
  AND pr.ingredient_id = bu.ingredient_id
  AND pr.entry_unit_id IS NULL;

WITH base_units AS (
  SELECT DISTINCT ON (iu.tenant_id, iu.ingredient_id)
    iu.tenant_id,
    iu.ingredient_id,
    iu.unit_id
  FROM public.ingredient_units iu
  JOIN public.units u
    ON u.id = iu.unit_id
   AND u.tenant_id = iu.tenant_id
   AND u.is_active = TRUE
  WHERE iu.is_base = TRUE
    AND iu.is_active = TRUE
  ORDER BY iu.tenant_id, iu.ingredient_id, iu.sort_order ASC, iu.id ASC
)
UPDATE public.production_runs pr
SET entry_unit_id = bu.unit_id
FROM base_units bu
WHERE pr.tenant_id = bu.tenant_id
  AND pr.finished_good_id = bu.ingredient_id
  AND pr.entry_unit_id IS NULL;

WITH base_units AS (
  SELECT DISTINCT ON (iu.tenant_id, iu.ingredient_id)
    iu.tenant_id,
    iu.ingredient_id,
    iu.unit_id
  FROM public.ingredient_units iu
  JOIN public.units u
    ON u.id = iu.unit_id
   AND u.tenant_id = iu.tenant_id
   AND u.is_active = TRUE
  WHERE iu.is_base = TRUE
    AND iu.is_active = TRUE
  ORDER BY iu.tenant_id, iu.ingredient_id, iu.sort_order ASC, iu.id ASC
)
UPDATE public.stock_issue_items sii
SET entry_unit_id = bu.unit_id
FROM base_units bu
WHERE sii.tenant_id = bu.tenant_id
  AND sii.ingredient_id = bu.ingredient_id
  AND sii.entry_unit_id IS NULL;

WITH base_units AS (
  SELECT DISTINCT ON (iu.tenant_id, iu.ingredient_id)
    iu.tenant_id,
    iu.ingredient_id,
    iu.unit_id
  FROM public.ingredient_units iu
  JOIN public.units u
    ON u.id = iu.unit_id
   AND u.tenant_id = iu.tenant_id
   AND u.is_active = TRUE
  WHERE iu.is_base = TRUE
    AND iu.is_active = TRUE
  ORDER BY iu.tenant_id, iu.ingredient_id, iu.sort_order ASC, iu.id ASC
)
UPDATE public.stock_transfer_items sti
SET entry_unit_id = bu.unit_id
FROM base_units bu
WHERE sti.tenant_id = bu.tenant_id
  AND sti.ingredient_id = bu.ingredient_id
  AND sti.entry_unit_id IS NULL;

WITH base_units AS (
  SELECT DISTINCT ON (iu.tenant_id, iu.ingredient_id)
    iu.tenant_id,
    iu.ingredient_id,
    iu.unit_id
  FROM public.ingredient_units iu
  JOIN public.units u
    ON u.id = iu.unit_id
   AND u.tenant_id = iu.tenant_id
   AND u.is_active = TRUE
  WHERE iu.is_base = TRUE
    AND iu.is_active = TRUE
  ORDER BY iu.tenant_id, iu.ingredient_id, iu.sort_order ASC, iu.id ASC
)
UPDATE public.stocktake_lines sl
SET entry_unit_id = bu.unit_id
FROM base_units bu
WHERE sl.tenant_id = bu.tenant_id
  AND sl.ingredient_id = bu.ingredient_id
  AND sl.entry_unit_id IS NULL;

WITH base_units AS (
  SELECT DISTINCT ON (iu.tenant_id, iu.ingredient_id)
    iu.tenant_id,
    iu.ingredient_id,
    iu.unit_id
  FROM public.ingredient_units iu
  JOIN public.units u
    ON u.id = iu.unit_id
   AND u.tenant_id = iu.tenant_id
   AND u.is_active = TRUE
  WHERE iu.is_base = TRUE
    AND iu.is_active = TRUE
  ORDER BY iu.tenant_id, iu.ingredient_id, iu.sort_order ASC, iu.id ASC
)
UPDATE public.stock_movements sm
SET entry_unit_id = bu.unit_id,
    entry_quantity = COALESCE(sm.entry_quantity, ABS(sm.quantity_change))
FROM base_units bu
WHERE sm.tenant_id = bu.tenant_id
  AND sm.ingredient_id = bu.ingredient_id
  AND sm.entry_unit_id IS NULL;

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

    IF v_from_loc.location_kind <> 'warehouse' OR v_to_loc.location_kind <> 'kitchen' THEN
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

CREATE OR REPLACE FUNCTION public.create_production_run(
  p_branch_id bigint,
  p_finished_good_id bigint,
  p_planned_quantity numeric,
  p_entry_unit_id bigint,
  p_notes text DEFAULT NULL,
  p_target_branch_id bigint DEFAULT NULL,
  p_ingredients_override jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_new_id bigint;
  v_number text;
  v_target_branch_id bigint;
  v_entry_unit_id bigint := p_entry_unit_id;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_inventory_production_operator() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'inventory:production_create') THEN
    RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
  END IF;

  IF p_planned_quantity IS NULL OR p_planned_quantity <= 0 THEN
    RAISE EXCEPTION 'invalid_planned_quantity' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.ingredients i
    WHERE i.id = p_finished_good_id
      AND i.tenant_id = v_tenant
      AND i.item_kind = 'finished_good'
      AND i.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'finished_good_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_entry_unit_id IS NULL THEN
    SELECT iu.unit_id INTO v_entry_unit_id
    FROM public.ingredient_units iu
    JOIN public.units u
      ON u.id = iu.unit_id
     AND u.tenant_id = iu.tenant_id
     AND u.is_active = TRUE
    WHERE iu.tenant_id = v_tenant
      AND iu.ingredient_id = p_finished_good_id
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
        AND iu.ingredient_id = p_finished_good_id
        AND iu.unit_id = v_entry_unit_id
        AND iu.is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'entry_unit_not_found:%', p_finished_good_id USING ERRCODE = '23503';
    END IF;
  END IF;

  IF v_entry_unit_id IS NULL THEN
    RAISE EXCEPTION 'entry_unit_not_found:%', p_finished_good_id USING ERRCODE = '23503';
  END IF;

  v_target_branch_id := COALESCE(p_target_branch_id, p_branch_id);

  IF NOT EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = v_target_branch_id
      AND b.tenant_id = v_tenant
      AND b.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'target_branch_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_number := 'LSX' || to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' ||
    lpad((COALESCE((
      SELECT count(*) + 1
      FROM public.production_runs
      WHERE tenant_id = v_tenant
        AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    ), 1))::text, 3, '0');

  INSERT INTO public.production_runs (
    tenant_id,
    production_number,
    branch_id,
    finished_good_id,
    planned_quantity,
    entry_unit_id,
    notes,
    created_by,
    status,
    target_branch_id,
    ingredients_override
  ) VALUES (
    v_tenant,
    v_number,
    p_branch_id,
    p_finished_good_id,
    p_planned_quantity,
    v_entry_unit_id,
    p_notes,
    v_uid,
    'draft',
    v_target_branch_id,
    p_ingredients_override
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('production_run_id', v_new_id, 'production_number', v_number);
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_intra_branch_transfer(
  p_branch_id bigint,
  p_from_location_id bigint,
  p_to_location_id bigint,
  p_transfer_number text,
  p_notes text DEFAULT NULL::text,
  p_lines jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_branch_kind text;
  v_from_loc record;
  v_to_loc record;
  v_transfer_id bigint;
  v_line jsonb;
  v_ingredient_id bigint;
  v_entry_unit_id bigint;
  v_entry_qty numeric(15,3);
  v_qty_base numeric(15,3);
  v_src_q numeric(15,3);
  v_src_wac numeric(15,2);
  v_dst_old_q numeric(15,3);
  v_dst_old_wac numeric(15,2);
  v_dst_new_q numeric(15,3);
  v_dst_new_wac numeric(15,2);
  v_seen bigint[] := ARRAY[]::bigint[];
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

  SELECT id, branch_id, location_kind
  INTO v_from_loc
  FROM public.inventory_locations
  WHERE id = p_from_location_id
    AND tenant_id = v_tenant
    AND is_active = TRUE;

  IF NOT FOUND OR v_from_loc.branch_id <> p_branch_id OR v_from_loc.location_kind <> 'warehouse' THEN
    RAISE EXCEPTION 'intra_branch_source_must_be_warehouse' USING ERRCODE = '23514';
  END IF;

  SELECT id, branch_id, location_kind
  INTO v_to_loc
  FROM public.inventory_locations
  WHERE id = p_to_location_id
    AND tenant_id = v_tenant
    AND is_active = TRUE;

  IF NOT FOUND OR v_to_loc.branch_id <> p_branch_id OR v_to_loc.location_kind <> 'kitchen' THEN
    RAISE EXCEPTION 'intra_branch_target_must_be_kitchen' USING ERRCODE = '23514';
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
    v_ingredient_id := NULLIF(COALESCE(v_line->>'ingredientId', v_line->>'ingredient_id'), '')::bigint;
    v_entry_qty := NULLIF(v_line->>'quantity', '')::numeric(15,3);
    v_entry_unit_id := NULLIF(COALESCE(v_line->>'entryUnitId', v_line->>'entry_unit_id'), '')::bigint;

    IF v_ingredient_id IS NULL OR v_entry_qty IS NULL OR v_entry_qty <= 0 THEN
      RAISE EXCEPTION 'transfer_lines_invalid' USING ERRCODE = '22023';
    END IF;

    IF v_ingredient_id = ANY(v_seen) THEN
      RAISE EXCEPTION 'duplicate_transfer_ingredient:%', v_ingredient_id USING ERRCODE = '23505';
    END IF;
    v_seen := v_seen || v_ingredient_id;

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

    v_qty_base := public.inv_to_base(v_ingredient_id, v_entry_unit_id, v_entry_qty)::numeric(15,3);

    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_src_q, v_src_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = p_branch_id
      AND sl.location_id = p_from_location_id
      AND sl.ingredient_id = v_ingredient_id
    FOR UPDATE;

    IF NOT FOUND OR COALESCE(v_src_q, 0) < v_qty_base THEN
      RAISE EXCEPTION 'insufficient_stock:%', v_ingredient_id USING ERRCODE = 'P0001';
    END IF;

    IF v_src_wac IS NULL THEN
      RAISE EXCEPTION 'wac_not_ready_for_%', v_ingredient_id USING ERRCODE = '22023';
    END IF;

    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_dst_old_q, v_dst_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = p_branch_id
      AND sl.location_id = p_to_location_id
      AND sl.ingredient_id = v_ingredient_id
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
      entry_unit_id,
      unit_cost_at_ship,
      quantity_received
    ) VALUES (
      v_tenant,
      v_transfer_id,
      v_ingredient_id,
      v_entry_qty,
      v_entry_unit_id,
      v_src_wac,
      v_entry_qty
    );

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
    ) VALUES (
      v_tenant,
      p_branch_id,
      v_ingredient_id,
      'transfer_out',
      -v_qty_base,
      'Transfer ' || p_transfer_number,
      v_uid,
      v_transfer_id,
      v_src_wac,
      p_from_location_id,
      v_entry_unit_id,
      v_entry_qty
    );

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
    ) VALUES (
      v_tenant,
      p_branch_id,
      v_ingredient_id,
      'transfer_in',
      v_qty_base,
      'Transfer ' || p_transfer_number,
      v_uid,
      v_transfer_id,
      v_src_wac,
      p_to_location_id,
      v_entry_unit_id,
      v_entry_qty
    );

    v_dst_new_q := COALESCE(v_dst_old_q, 0) + v_qty_base;
    v_dst_new_wac := (
      COALESCE(v_dst_old_q, 0) * COALESCE(v_dst_old_wac, 0)
        + v_qty_base * v_src_wac
    ) / v_dst_new_q;

    UPDATE public.stock_levels sl
    SET avg_unit_cost = v_dst_new_wac,
        updated_at = now()
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = p_branch_id
      AND sl.location_id = p_to_location_id
      AND sl.ingredient_id = v_ingredient_id;
  END LOOP;

  RETURN jsonb_build_object('id', v_transfer_id, 'status', 'received');
END;
$$;

COMMENT ON FUNCTION public.commit_intra_branch_transfer(bigint, bigint, bigint, text, text, jsonb)
IS 'Atomically moves same-branch stock from warehouse to kitchen as a received transfer using entry_unit_id conversion.';

REVOKE ALL ON FUNCTION public.create_stock_transfer_draft(bigint, bigint, text, text, text, jsonb, bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_stock_transfer_draft(bigint, bigint, text, text, text, jsonb, bigint, bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_production_run(bigint, bigint, numeric, bigint, text, bigint, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_production_run(bigint, bigint, numeric, bigint, text, bigint, jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.commit_intra_branch_transfer(bigint, bigint, bigint, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_intra_branch_transfer(bigint, bigint, bigint, text, text, jsonb) TO authenticated, service_role;
