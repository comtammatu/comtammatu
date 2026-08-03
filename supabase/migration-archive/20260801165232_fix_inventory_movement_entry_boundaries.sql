-- Preserve the selected business unit at the stock movement boundary.

CREATE OR REPLACE FUNCTION public.adjust_stock_exception(
  p_branch_id bigint,
  p_ingredient_id bigint,
  p_entry_quantity numeric,
  p_entry_unit_id bigint,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_location_id bigint;
  v_entry_to_base_factor numeric(18,12);
  v_entry_unit_code text;
  v_quantity_change numeric;
  v_movement_id bigint;
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_branch_id IS NULL
     OR p_ingredient_id IS NULL
     OR p_entry_unit_id IS NULL THEN
    RAISE EXCEPTION 'invalid_adjustment_target'
      USING ERRCODE = '22023';
  END IF;
  IF p_entry_quantity IS NULL
     OR p_entry_quantity = 0
     OR p_entry_quantity = 'NaN'::numeric
     OR p_entry_quantity = 'Infinity'::numeric
     OR p_entry_quantity = '-Infinity'::numeric THEN
    RAISE EXCEPTION 'quantity_change_nonzero_finite'
      USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_reason) < 5 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT ingredient_unit.to_base_factor, unit_row.code
  INTO v_entry_to_base_factor, v_entry_unit_code
  FROM public.ingredients AS ingredient
  JOIN public.ingredient_units AS ingredient_unit
    ON ingredient_unit.tenant_id = ingredient.tenant_id
   AND ingredient_unit.ingredient_id = ingredient.id
   AND ingredient_unit.unit_id = p_entry_unit_id
   AND ingredient_unit.is_active IS TRUE
  JOIN public.units AS unit_row
    ON unit_row.tenant_id = ingredient_unit.tenant_id
   AND unit_row.id = ingredient_unit.unit_id
   AND unit_row.is_active IS TRUE
  WHERE ingredient.tenant_id = v_tenant
    AND ingredient.id = p_ingredient_id
    AND ingredient.is_active IS TRUE
    AND p_entry_unit_id IN (
      ingredient.issue_unit_id,
      ingredient.receipt_unit_id
    );

  IF v_entry_to_base_factor IS NULL OR v_entry_to_base_factor <= 0 THEN
    RAISE EXCEPTION 'inventory_unit_role_mismatch:receipt,issue'
      USING ERRCODE = '23514';
  END IF;

  v_quantity_change := p_entry_quantity * v_entry_to_base_factor;

  SELECT location.id
  INTO v_location_id
  FROM public.inventory_locations AS location
  JOIN public.branches AS branch
    ON branch.id = location.branch_id
   AND branch.tenant_id = location.tenant_id
   AND branch.is_active IS TRUE
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = p_branch_id
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE
  ORDER BY location.id
  LIMIT 1
  FOR UPDATE OF location;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'active_warehouse_required'
      USING ERRCODE = 'P0002';
  END IF;

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
    entry_quantity,
    entry_to_base_factor,
    entry_unit_code
  ) VALUES (
    v_tenant,
    p_branch_id,
    p_ingredient_id,
    'adjustment',
    v_quantity_change,
    v_reason,
    v_uid,
    v_location_id,
    p_entry_unit_id,
    pg_catalog.abs(p_entry_quantity),
    v_entry_to_base_factor,
    v_entry_unit_code
  )
  RETURNING id INTO v_movement_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'movement_id', v_movement_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_stock_exception(
  bigint, bigint, numeric, bigint, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_stock_exception(
  bigint, bigint, numeric, bigint, text
) TO authenticated, service_role;

-- Keep deployed clients on the base-quantity signature working during rollout.
CREATE OR REPLACE FUNCTION public.adjust_stock_exception(
  p_branch_id bigint,
  p_ingredient_id bigint,
  p_quantity_change numeric,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_entry_unit_id bigint;
  v_entry_to_base_factor numeric(18,12);
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT
    ingredient.issue_unit_id,
    ingredient_unit.to_base_factor
  INTO
    v_entry_unit_id,
    v_entry_to_base_factor
  FROM public.ingredients AS ingredient
  JOIN public.ingredient_units AS ingredient_unit
    ON ingredient_unit.tenant_id = ingredient.tenant_id
   AND ingredient_unit.ingredient_id = ingredient.id
   AND ingredient_unit.unit_id = ingredient.issue_unit_id
   AND ingredient_unit.is_active IS TRUE
  JOIN public.units AS unit_row
    ON unit_row.tenant_id = ingredient_unit.tenant_id
   AND unit_row.id = ingredient_unit.unit_id
   AND unit_row.is_active IS TRUE
  WHERE ingredient.tenant_id = v_tenant
    AND ingredient.id = p_ingredient_id
    AND ingredient.is_active IS TRUE;

  IF v_entry_unit_id IS NULL
     OR v_entry_to_base_factor IS NULL
     OR v_entry_to_base_factor <= 0 THEN
    RAISE EXCEPTION 'entry_unit_not_found:%', p_ingredient_id
      USING ERRCODE = '23503';
  END IF;

  RETURN public.adjust_stock_exception(
    p_branch_id,
    p_ingredient_id,
    p_quantity_change / v_entry_to_base_factor,
    v_entry_unit_id,
    p_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_stock_exception(
  bigint, bigint, numeric, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_stock_exception(
  bigint, bigint, numeric, text
) TO authenticated, service_role;

-- Zero consumption is not a movement. Non-zero production consumption keeps
-- the configured production unit while the ledger quantity remains base-unit.
CREATE OR REPLACE FUNCTION private.execute_confirm_production_run(
  p_run_id bigint,
  p_actual_quantity numeric DEFAULT NULL::numeric,
  p_actual_ingredients jsonb DEFAULT NULL::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_run record;
  v_recipe record;
  v_has_recipe boolean := false;
  v_effective_ingredients jsonb;
  v_raw_need_measure numeric(15,3);
  v_raw_need_purchase numeric(15,3);
  v_actual_usage numeric(15,3);
  v_need_map jsonb := '{}'::jsonb;
  v_key text;
  v_need_qty numeric(15,3);
  v_old_q numeric(15,3);
  v_old_wac numeric(15,2);
  v_new_q numeric(15,3);
  v_new_wac numeric(15,2);
  v_output_cost numeric(15,2) := 0;
  v_cost_total numeric(15,2);
  v_out_base numeric(15,3);
  v_out_unit_cost numeric(15,2);
  v_target_location_id bigint;
  v_source_location_id bigint;
  v_shortages jsonb;
  v_raw_entry_unit_id bigint;
  v_raw_entry_to_base_factor numeric(18,12);
  v_raw_entry_unit_code text;
  v_actual_quantity numeric(15,3);
  v_planned_output_base numeric(15,3);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_inventory_production_operator() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission_any('inventory:production_confirm') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT pr.*, b.branch_kind INTO v_run
  FROM public.production_runs pr
  JOIN public.branches b
    ON b.id = pr.branch_id
   AND b.tenant_id = pr.tenant_id
  WHERE pr.id = p_run_id
    AND pr.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'production_run_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_run.status NOT IN ('draft', 'in_progress') THEN
    RAISE EXCEPTION 'production_run_not_draft' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_permission(v_run.branch_id, 'inventory:production_confirm') THEN
    RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.production_recipes pr
    LEFT JOIN public.ingredient_units iu
      ON iu.tenant_id = pr.tenant_id
     AND iu.ingredient_id = pr.ingredient_id
     AND iu.unit_id = pr.entry_unit_id
     AND iu.is_active = TRUE
    LEFT JOIN public.units u
      ON u.id = iu.unit_id
     AND u.tenant_id = iu.tenant_id
     AND u.is_active = TRUE
    WHERE pr.tenant_id = v_tenant
      AND pr.finished_good_id = v_run.finished_good_id
      AND pr.entry_unit_id IS NOT NULL
      AND (iu.id IS NULL OR u.id IS NULL)
  ) THEN
    RAISE EXCEPTION 'production_recipe_unit_mapping_missing:%',
      v_run.finished_good_id
      USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.production_recipes pr
    JOIN public.ingredient_units iu
      ON iu.tenant_id = pr.tenant_id
     AND iu.ingredient_id = pr.ingredient_id
     AND iu.unit_id = pr.entry_unit_id
     AND iu.is_active = TRUE
    WHERE pr.tenant_id = v_tenant
      AND pr.finished_good_id = v_run.finished_good_id
      AND iu.created_at > v_run.created_at
  ) THEN
    RAISE EXCEPTION 'production_run_unit_mapping_review_required:%',
      v_run.id
      USING ERRCODE = 'P0001';
  END IF;

  v_effective_ingredients := COALESCE(
    p_actual_ingredients,
    v_run.ingredients_override
  );

  SELECT il.id INTO v_source_location_id
  FROM public.inventory_locations il
  WHERE il.id = v_run.source_location_id
    AND il.tenant_id = v_tenant
    AND il.branch_id = v_run.branch_id
    AND il.is_active = TRUE
  LIMIT 1;
  IF v_source_location_id IS NULL THEN
    RAISE EXCEPTION 'production_source_location_missing:%', v_run.branch_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT il.id INTO v_target_location_id
  FROM public.inventory_locations il
  WHERE il.id = v_run.target_location_id
    AND il.tenant_id = v_tenant
    AND il.branch_id = v_run.target_branch_id
    AND il.is_active = TRUE
  LIMIT 1;
  IF v_target_location_id IS NULL THEN
    RAISE EXCEPTION 'production_target_location_missing:%', v_run.target_branch_id
      USING ERRCODE = 'P0002';
  END IF;

  v_actual_quantity := ROUND(
    COALESCE(p_actual_quantity, v_run.planned_quantity),
    3
  );

  IF v_run.entry_unit_id IS NOT NULL THEN
    v_planned_output_base := ROUND(
      public.inv_to_base(
        v_run.finished_good_id,
        v_run.entry_unit_id,
        v_run.planned_quantity
      ),
      3
    );
  ELSE
    v_planned_output_base := v_run.planned_quantity;
  END IF;

  FOR v_recipe IN
    SELECT
      pr.ingredient_id,
      pr.quantity,
      pr.output_quantity,
      pr.entry_unit_id,
      COALESCE(sl.avg_unit_cost, ing.unit_cost, 0) AS raw_unit_cost
    FROM public.production_recipes pr
    JOIN public.ingredients ing
      ON ing.id = pr.ingredient_id
     AND ing.tenant_id = pr.tenant_id
    LEFT JOIN public.stock_levels sl
      ON sl.tenant_id = v_tenant
     AND sl.branch_id = v_run.branch_id
     AND sl.location_id = v_source_location_id
     AND sl.ingredient_id = pr.ingredient_id
    WHERE pr.tenant_id = v_tenant
      AND pr.finished_good_id = v_run.finished_good_id
  LOOP
    v_has_recipe := true;
    v_raw_need_measure :=
      (v_planned_output_base * v_recipe.quantity) /
      v_recipe.output_quantity;

    IF v_effective_ingredients IS NOT NULL THEN
      v_actual_usage := NULL;
      SELECT (elem ->> 'actual_quantity')::numeric(15,3)
      INTO v_actual_usage
      FROM jsonb_array_elements(v_effective_ingredients) elem
      WHERE (elem ->> 'ingredient_id')::bigint = v_recipe.ingredient_id;

      IF v_actual_usage IS NOT NULL THEN
        v_raw_need_measure := v_actual_usage;
      END IF;
    END IF;

    IF v_recipe.entry_unit_id IS NOT NULL THEN
      v_raw_need_purchase := ROUND(
        public.inv_to_base(
          v_recipe.ingredient_id,
          v_recipe.entry_unit_id,
          v_raw_need_measure
        ),
        3
      );
    ELSE
      v_raw_need_purchase := ROUND(v_raw_need_measure, 3);
    END IF;

    v_key := v_recipe.ingredient_id::text;
    v_need_map := jsonb_set(
      v_need_map,
      ARRAY[v_key],
      to_jsonb(
        COALESCE((v_need_map ->> v_key)::numeric, 0) +
        v_raw_need_purchase
      ),
      TRUE
    );
    v_output_cost := v_output_cost +
      (v_raw_need_purchase * COALESCE(v_recipe.raw_unit_cost, 0));
  END LOOP;

  IF NOT v_has_recipe THEN
    RAISE EXCEPTION 'production_recipe_missing' USING ERRCODE = 'P0001';
  END IF;

  WITH shortages AS (
    SELECT
      (need.ingredient_id)::bigint AS ingredient_id,
      ing.name AS ingredient_name,
      (
        SELECT u.name
        FROM public.ingredient_units iu
        JOIN public.units u ON u.id = iu.unit_id
        WHERE iu.ingredient_id = ing.id
          AND iu.is_base = TRUE
        LIMIT 1
      ) AS unit,
      ROUND((need.need_qty)::numeric, 3) AS needed,
      ROUND(COALESCE(sl.current_quantity, 0)::numeric, 3) AS on_hand
    FROM jsonb_each_text(v_need_map) AS need(ingredient_id, need_qty)
    JOIN public.ingredients ing
      ON ing.id = (need.ingredient_id)::bigint
    LEFT JOIN public.stock_levels sl
      ON sl.tenant_id = v_tenant
     AND sl.branch_id = v_run.branch_id
     AND sl.location_id = v_source_location_id
     AND sl.ingredient_id = (need.ingredient_id)::bigint
    WHERE COALESCE(sl.current_quantity, 0) < (need.need_qty)::numeric
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
  INTO v_shortages
  FROM shortages s;

  IF jsonb_array_length(v_shortages) > 0 THEN
    RAISE EXCEPTION 'insufficient_stock_for_production'
      USING ERRCODE = 'P0001', DETAIL = v_shortages::text;
  END IF;

  v_cost_total := v_output_cost;

  FOR v_key, v_need_qty IN
    SELECT key, value::numeric(15,3)
    FROM jsonb_each_text(v_need_map)
  LOOP
    IF v_need_qty = 0 THEN
      CONTINUE;
    END IF;

    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_run.branch_id
      AND sl.location_id = v_source_location_id
      AND sl.ingredient_id = v_key::bigint;
    IF NOT FOUND THEN
      v_old_q := 0;
      v_old_wac := 0;
    END IF;

    SELECT
      ingredient.production_unit_id,
      ingredient_unit.to_base_factor,
      unit_row.code
    INTO
      v_raw_entry_unit_id,
      v_raw_entry_to_base_factor,
      v_raw_entry_unit_code
    FROM public.ingredients AS ingredient
    JOIN public.ingredient_units AS ingredient_unit
      ON ingredient_unit.tenant_id = ingredient.tenant_id
     AND ingredient_unit.ingredient_id = ingredient.id
     AND ingredient_unit.unit_id = ingredient.production_unit_id
     AND ingredient_unit.is_active IS TRUE
    JOIN public.units AS unit_row
      ON unit_row.id = ingredient_unit.unit_id
     AND unit_row.tenant_id = ingredient_unit.tenant_id
     AND unit_row.is_active IS TRUE
    WHERE ingredient.tenant_id = v_tenant
      AND ingredient.id = v_key::bigint;

    IF v_raw_entry_unit_id IS NULL
       OR v_raw_entry_to_base_factor IS NULL
       OR v_raw_entry_to_base_factor <= 0 THEN
      RAISE EXCEPTION 'entry_unit_not_found:%', v_key::bigint
        USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id,
      branch_id,
      ingredient_id,
      type,
      quantity_change,
      reason,
      created_by,
      production_run_id,
      unit_cost,
      location_id,
      entry_unit_id,
      entry_quantity,
      entry_to_base_factor,
      entry_unit_code
    ) VALUES (
      v_tenant,
      v_run.branch_id,
      v_key::bigint,
      'production_consumption',
      -v_need_qty,
      'Production ' || v_run.production_number,
      v_uid,
      p_run_id,
      COALESCE(v_old_wac, 0),
      v_source_location_id,
      v_raw_entry_unit_id,
      v_need_qty / v_raw_entry_to_base_factor,
      v_raw_entry_to_base_factor,
      v_raw_entry_unit_code
    );
  END LOOP;

  IF v_run.entry_unit_id IS NOT NULL THEN
    v_out_base := public.inv_to_base(
      v_run.finished_good_id,
      v_run.entry_unit_id,
      v_actual_quantity
    );
  ELSE
    v_out_base := v_actual_quantity;
  END IF;

  v_out_unit_cost := CASE
    WHEN v_out_base <> 0 THEN ROUND(v_cost_total / v_out_base, 2)
    ELSE 0
  END;

  SELECT sl.current_quantity, sl.avg_unit_cost
  INTO v_old_q, v_old_wac
  FROM public.stock_levels sl
  WHERE sl.tenant_id = v_tenant
    AND sl.branch_id = v_run.target_branch_id
    AND sl.location_id = v_target_location_id
    AND sl.ingredient_id = v_run.finished_good_id;
  IF NOT FOUND THEN
    v_old_q := 0;
    v_old_wac := 0;
  END IF;

  INSERT INTO public.stock_movements (
    tenant_id,
    branch_id,
    ingredient_id,
    type,
    quantity_change,
    reason,
    created_by,
    production_run_id,
    unit_cost,
    location_id,
    entry_unit_id,
    entry_quantity
  ) VALUES (
    v_tenant,
    v_run.target_branch_id,
    v_run.finished_good_id,
    'production_output',
    v_out_base,
    'Production ' || v_run.production_number,
    v_uid,
    p_run_id,
    v_out_unit_cost,
    v_target_location_id,
    v_run.entry_unit_id,
    v_actual_quantity
  );

  v_new_q := COALESCE(v_old_q, 0) + v_out_base;
  v_new_wac := CASE
    WHEN v_new_q > 0 THEN
      (
        COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) +
        v_cost_total
      ) / v_new_q
    ELSE v_out_unit_cost
  END;

  UPDATE public.stock_levels sl
  SET avg_unit_cost = v_new_wac,
      updated_at = now()
  WHERE sl.tenant_id = v_tenant
    AND sl.branch_id = v_run.target_branch_id
    AND sl.location_id = v_target_location_id
    AND sl.ingredient_id = v_run.finished_good_id;

  UPDATE public.ingredients
  SET unit_cost = v_out_unit_cost,
      updated_at = now()
  WHERE id = v_run.finished_good_id
    AND tenant_id = v_tenant;

  UPDATE public.production_runs
  SET status = 'completed',
      actual_quantity = v_actual_quantity,
      completed_at = now(),
      updated_at = now(),
      ingredients_override = v_effective_ingredients
  WHERE id = p_run_id
    AND tenant_id = v_tenant;

  RETURN jsonb_build_object(
    'production_run_id', p_run_id,
    'status', 'completed',
    'actual_quantity', v_actual_quantity,
    'output_quantity_base', v_out_base,
    'unit_cost', v_out_unit_cost
  );
END;
$$;

REVOKE ALL ON FUNCTION private.execute_confirm_production_run(
  bigint, numeric, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
