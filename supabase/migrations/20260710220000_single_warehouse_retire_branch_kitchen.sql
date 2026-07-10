-- D078: Retire branch kitchen locations. One warehouse per branch.
-- Does NOT drop location_kind enum values; deactivates kitchen rows and
-- rewires defaults + key RPCs to warehouse. Owner must apply to production.

SET search_path = '';

-- 1) Ensure every active branch site has an active warehouse with all defaults.
UPDATE public.inventory_locations wh
SET
  is_default_receive = TRUE,
  is_default_issue = TRUE,
  is_default_consumption = NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations kitchen
    WHERE kitchen.tenant_id = wh.tenant_id
      AND kitchen.branch_id = wh.branch_id
      AND kitchen.location_kind = 'kitchen'
      AND kitchen.is_active = TRUE
      AND kitchen.is_default_consumption = TRUE
  ),
  is_active = TRUE,
  updated_at = now()
FROM public.branches b
WHERE wh.branch_id = b.id
  AND wh.tenant_id = b.tenant_id
  AND b.branch_kind = 'branch'
  AND b.is_active = TRUE
  AND wh.location_kind = 'warehouse'
  AND wh.id = (
    SELECT il.id
    FROM public.inventory_locations il
    WHERE il.branch_id = b.id
      AND il.tenant_id = b.tenant_id
      AND il.location_kind = 'warehouse'
    ORDER BY il.is_active DESC, il.is_default_receive DESC, il.sort_order NULLS LAST, il.id
    LIMIT 1
  );

-- 2) Merge kitchen stock_levels into the branch warehouse (sum qty, WAC blend).
DO $$
DECLARE
  r record;
  v_wh_id bigint;
  v_wh_qty numeric;
  v_wh_cost numeric;
  v_kit_qty numeric;
  v_kit_cost numeric;
  v_new_qty numeric;
  v_new_cost numeric;
BEGIN
  FOR r IN
    SELECT
      kit.location_id AS kitchen_location_id,
      kit.tenant_id,
      kit.branch_id,
      kit.ingredient_id,
      kit.current_quantity AS kitchen_qty,
      kit.avg_unit_cost AS kitchen_cost
    FROM public.stock_levels kit
    JOIN public.inventory_locations loc
      ON loc.id = kit.location_id
     AND loc.tenant_id = kit.tenant_id
    JOIN public.branches b
      ON b.id = kit.branch_id
     AND b.tenant_id = kit.tenant_id
    WHERE loc.location_kind = 'kitchen'
      AND b.branch_kind = 'branch'
      AND kit.current_quantity IS DISTINCT FROM 0
  LOOP
    SELECT il.id
    INTO v_wh_id
    FROM public.inventory_locations il
    WHERE il.tenant_id = r.tenant_id
      AND il.branch_id = r.branch_id
      AND il.location_kind = 'warehouse'
      AND il.is_active = TRUE
    ORDER BY il.is_default_receive DESC, il.sort_order NULLS LAST, il.id
    LIMIT 1;

    IF v_wh_id IS NULL THEN
      RAISE EXCEPTION 'warehouse_missing_for_branch:%', r.branch_id
        USING ERRCODE = 'P0002';
    END IF;

    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_wh_qty, v_wh_cost
    FROM public.stock_levels sl
    WHERE sl.tenant_id = r.tenant_id
      AND sl.branch_id = r.branch_id
      AND sl.location_id = v_wh_id
      AND sl.ingredient_id = r.ingredient_id
    FOR UPDATE;

    v_kit_qty := COALESCE(r.kitchen_qty, 0);
    v_kit_cost := COALESCE(r.kitchen_cost, 0);
    v_wh_qty := COALESCE(v_wh_qty, 0);
    v_wh_cost := COALESCE(v_wh_cost, 0);
    v_new_qty := v_wh_qty + v_kit_qty;

    IF v_new_qty = 0 THEN
      v_new_cost := 0;
    ELSIF v_wh_qty <= 0 THEN
      v_new_cost := v_kit_cost;
    ELSIF v_kit_qty <= 0 THEN
      v_new_cost := v_wh_cost;
    ELSE
      v_new_cost := ((v_wh_qty * v_wh_cost) + (v_kit_qty * v_kit_cost)) / v_new_qty;
    END IF;

    INSERT INTO public.stock_levels (
      tenant_id, branch_id, location_id, ingredient_id,
      current_quantity, avg_unit_cost, updated_at
    )
    VALUES (
      r.tenant_id, r.branch_id, v_wh_id, r.ingredient_id,
      v_new_qty, v_new_cost, now()
    )
    ON CONFLICT (tenant_id, branch_id, location_id, ingredient_id)
    DO UPDATE SET
      current_quantity = EXCLUDED.current_quantity,
      avg_unit_cost = EXCLUDED.avg_unit_cost,
      updated_at = now();

    UPDATE public.stock_levels
    SET current_quantity = 0,
        updated_at = now()
    WHERE tenant_id = r.tenant_id
      AND branch_id = r.branch_id
      AND location_id = r.kitchen_location_id
      AND ingredient_id = r.ingredient_id;
  END LOOP;
END $$;

-- 3) Clear kitchen default flags and deactivate kitchen locations on branch sites.
UPDATE public.inventory_locations loc
SET
  is_default_receive = FALSE,
  is_default_issue = FALSE,
  is_default_consumption = FALSE,
  is_active = FALSE,
  updated_at = now()
FROM public.branches b
WHERE loc.branch_id = b.id
  AND loc.tenant_id = b.tenant_id
  AND b.branch_kind = 'branch'
  AND loc.location_kind = 'kitchen'
  AND loc.is_active = TRUE;

UPDATE public.inventory_locations wh
SET
  is_default_consumption = TRUE,
  updated_at = now()
FROM public.branches b
WHERE wh.branch_id = b.id
  AND wh.tenant_id = b.tenant_id
  AND b.branch_kind = 'branch'
  AND b.is_active = TRUE
  AND wh.location_kind = 'warehouse'
  AND wh.is_active = TRUE
  AND wh.id = (
    SELECT il.id
    FROM public.inventory_locations il
    WHERE il.tenant_id = b.tenant_id
      AND il.branch_id = b.id
      AND il.location_kind = 'warehouse'
      AND il.is_active = TRUE
    ORDER BY il.is_default_receive DESC, il.sort_order NULLS LAST, il.id
    LIMIT 1
  );

-- 4) Stop seeding kitchen locations for new/updated branch sites.
CREATE OR REPLACE FUNCTION public.ensure_branch_inventory_location_defaults(
  p_tenant_id bigint,
  p_branch_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_branch_kind TEXT;
  v_warehouse_id BIGINT;
  v_needs_default_receive BOOLEAN;
  v_needs_default_issue BOOLEAN;
  v_needs_default_consumption BOOLEAN;
BEGIN
  SELECT branch_kind
  INTO v_branch_kind
  FROM public.branches
  WHERE id = p_branch_id
    AND tenant_id = p_tenant_id;

  IF NOT FOUND OR v_branch_kind IS DISTINCT FROM 'branch' THEN
    RETURN;
  END IF;

  SELECT il.id
  INTO v_warehouse_id
  FROM public.inventory_locations il
  WHERE il.tenant_id = p_tenant_id
    AND il.branch_id = p_branch_id
    AND il.location_kind = 'warehouse'
    AND il.is_active = TRUE
  ORDER BY il.is_default_receive DESC, il.sort_order NULLS LAST, il.id
  LIMIT 1;

  v_needs_default_receive := NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations il
    WHERE il.tenant_id = p_tenant_id
      AND il.branch_id = p_branch_id
      AND il.is_default_receive = TRUE
      AND il.is_active = TRUE
  );

  v_needs_default_issue := NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations il
    WHERE il.tenant_id = p_tenant_id
      AND il.branch_id = p_branch_id
      AND il.is_default_issue = TRUE
      AND il.is_active = TRUE
  );

  v_needs_default_consumption := NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations il
    WHERE il.tenant_id = p_tenant_id
      AND il.branch_id = p_branch_id
      AND il.is_default_consumption = TRUE
      AND il.is_active = TRUE
  );

  IF v_warehouse_id IS NULL THEN
    INSERT INTO public.inventory_locations (
      tenant_id,
      branch_id,
      code,
      name,
      location_kind,
      is_active,
      is_default_receive,
      is_default_issue,
      is_default_consumption,
      sort_order
    )
    VALUES (
      p_tenant_id,
      p_branch_id,
      'main_warehouse',
      U&'Kho chi nh\00E1nh',
      'warehouse',
      TRUE,
      TRUE,
      TRUE,
      TRUE,
      0
    )
    ON CONFLICT (code, branch_id, tenant_id) DO UPDATE
    SET name = EXCLUDED.name,
        location_kind = 'warehouse',
        is_active = TRUE,
        is_default_receive = TRUE,
        is_default_issue = TRUE,
        is_default_consumption = TRUE,
        sort_order = EXCLUDED.sort_order,
        updated_at = now()
    RETURNING id INTO v_warehouse_id;
  ELSE
    UPDATE public.inventory_locations
    SET
      is_default_receive = CASE
        WHEN v_needs_default_receive OR is_default_receive THEN TRUE
        ELSE is_default_receive
      END,
      is_default_issue = CASE
        WHEN v_needs_default_issue OR is_default_issue THEN TRUE
        ELSE is_default_issue
      END,
      is_default_consumption = CASE
        WHEN v_needs_default_consumption OR is_default_consumption THEN TRUE
        ELSE is_default_consumption
      END,
      updated_at = now()
    WHERE id = v_warehouse_id;
  END IF;

  -- Keep any leftover kitchen rows inactive and non-default.
  UPDATE public.inventory_locations
  SET is_active = FALSE,
      is_default_receive = FALSE,
      is_default_issue = FALSE,
      is_default_consumption = FALSE,
      updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND location_kind = 'kitchen'
    AND (
      is_active = TRUE
      OR is_default_receive = TRUE
      OR is_default_issue = TRUE
      OR is_default_consumption = TRUE
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_branch_inventory_location_defaults(bigint, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_branch_inventory_location_defaults(bigint, bigint)
  TO service_role;

-- 5) Retire atomic intra-branch Kho↔Bếp RPC.
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
BEGIN
  RAISE EXCEPTION 'intra_branch_transfer_retired'
    USING ERRCODE = 'P0001',
          HINT = 'D078: branch kitchen retired; one warehouse per branch.';
END;
$$;

REVOKE ALL ON FUNCTION public.commit_intra_branch_transfer(bigint, bigint, bigint, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.commit_intra_branch_transfer(bigint, bigint, bigint, text, text, jsonb)
IS 'Retired by D078. Branch kitchen locations are inactive; one warehouse per branch.';

-- 6) Surgical rewire: kitchen → warehouse in live POS / adjust / capacity helpers.
DO $$
DECLARE
  v_sql text;
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.enforce_branch_stock_availability()',
    'public.post_pos_sale_consumption_if_ready(bigint, uuid)',
    'public.post_pos_cancelled_ready_waste(bigint, uuid, text)',
    'public.adjust_stock_exception(bigint, bigint, numeric, text)',
    'public.compute_menu_item_stock_capacity(bigint, bigint)',
    'public.add_menu_item_kitchen_stock_exception(bigint, bigint, numeric, text)'
  ]
  LOOP
    BEGIN
      SELECT pg_get_functiondef(v_fn::regprocedure) INTO v_sql;
    EXCEPTION
      WHEN undefined_function THEN
        CONTINUE;
    END;

    IF v_sql IS NULL THEN
      CONTINUE;
    END IF;

    IF position('location_kind = ''kitchen''' in v_sql) = 0 THEN
      CONTINUE;
    END IF;

    v_sql := replace(v_sql, 'location_kind = ''kitchen''', 'location_kind = ''warehouse''');
    v_sql := replace(v_sql, 'using kitchen location', 'using warehouse location');
    v_sql := replace(v_sql, 'branch_kitchen_required', 'branch_warehouse_required');
    v_sql := replace(v_sql, 'branch_kitchen_location_missing', 'branch_warehouse_location_missing');
    EXECUTE v_sql;
  END LOOP;
END $$;

-- 7) Stocktake / count-slip writers: prefer warehouse for branch sites.
DO $$
DECLARE
  v_sql text;
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.create_stocktake_session(bigint, bigint)',
    'public.start_stocktake(bigint, bigint, text, boolean, uuid, numeric, numeric)',
    'public.submit_count_slip(bigint, jsonb, text)'
  ]
  LOOP
    BEGIN
      SELECT pg_get_functiondef(v_fn::regprocedure) INTO v_sql;
    EXCEPTION
      WHEN undefined_function THEN
        CONTINUE;
    END;

    IF v_sql IS NULL THEN
      CONTINUE;
    END IF;

    IF position('location_kind = ''kitchen''' in v_sql) = 0 THEN
      CONTINUE;
    END IF;

    v_sql := replace(v_sql, 'location_kind = ''kitchen''', 'location_kind = ''warehouse''');
    v_sql := replace(v_sql, 'branch_kitchen_location_missing', 'branch_warehouse_location_missing');
    EXECUTE v_sql;
  END LOOP;
END $$;
