BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.enforce_production_recipe_entry_unit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.entry_unit_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.ingredient_units iu
       JOIN public.units u
         ON u.id = iu.unit_id
        AND u.tenant_id = iu.tenant_id
        AND u.is_active = TRUE
       WHERE iu.tenant_id = NEW.tenant_id
         AND iu.ingredient_id = NEW.ingredient_id
         AND iu.unit_id = NEW.entry_unit_id
         AND iu.is_active = TRUE
     ) THEN
    RAISE EXCEPTION 'production_recipe_unit_mapping_missing:%:%',
      NEW.ingredient_id,
      NEW.entry_unit_id
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_production_recipe_entry_unit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS production_recipes_entry_unit_guard ON public.production_recipes;
CREATE TRIGGER production_recipes_entry_unit_guard
  BEFORE INSERT OR UPDATE ON public.production_recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_production_recipe_entry_unit();

CREATE OR REPLACE FUNCTION public.enforce_production_run_recipe_units()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
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
    WHERE pr.tenant_id = NEW.tenant_id
      AND pr.finished_good_id = NEW.finished_good_id
      AND pr.entry_unit_id IS NOT NULL
      AND (iu.id IS NULL OR u.id IS NULL)
  ) THEN
    RAISE EXCEPTION 'production_recipe_unit_mapping_missing:%',
      NEW.finished_good_id
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_production_run_recipe_units() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS production_runs_recipe_unit_guard ON public.production_runs;
CREATE TRIGGER production_runs_recipe_unit_guard
  BEFORE INSERT OR UPDATE OF tenant_id, finished_good_id ON public.production_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_production_run_recipe_units();

CREATE OR REPLACE FUNCTION public.get_production_recipe_context_for_location(
  p_finished_good_id bigint,
  p_branch_id bigint,
  p_source_location_id bigint DEFAULT NULL::bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_location_id bigint := p_source_location_id;
  v_res jsonb;
BEGIN
  IF NOT public.has_permission_any('inventory:production_create')
     AND NOT public.has_permission_any('inventory:production_confirm') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
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
      AND pr.finished_good_id = p_finished_good_id
      AND pr.entry_unit_id IS NOT NULL
      AND (iu.id IS NULL OR u.id IS NULL)
  ) THEN
    RAISE EXCEPTION 'production_recipe_unit_mapping_missing:%',
      p_finished_good_id
      USING ERRCODE = '23503';
  END IF;

  IF v_location_id IS NULL THEN
    SELECT il.id INTO v_location_id
    FROM public.branches b
    JOIN public.inventory_locations il
      ON il.tenant_id = b.tenant_id
     AND il.branch_id = b.id
     AND il.is_active = TRUE
    WHERE b.tenant_id = v_tenant
      AND b.id = p_branch_id
    ORDER BY
      CASE
        WHEN b.branch_kind = 'branch' AND il.location_kind = 'kitchen' THEN 0
        WHEN b.branch_kind = 'central_kitchen' AND il.location_kind = 'production_storage' THEN 0
        WHEN il.is_default_issue = TRUE THEN 1
        WHEN il.is_default_receive = TRUE THEN 2
        ELSE 3
      END,
      il.is_default_consumption DESC,
      il.sort_order NULLS LAST,
      il.id
    LIMIT 1;
  ELSE
    SELECT il.id INTO v_location_id
    FROM public.inventory_locations il
    WHERE il.id = v_location_id
      AND il.tenant_id = v_tenant
      AND il.branch_id = p_branch_id
      AND il.is_active = TRUE
    LIMIT 1;
  END IF;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'production_source_location_missing:%', p_branch_id USING ERRCODE = 'P0002';
  END IF;

  WITH base AS (
    SELECT
      pr.ingredient_id,
      ing.name AS ingredient_name,
      COALESCE(entry_u.name, entry_u.code, base_u.name, base_u.code, '') AS unit_name,
      pr.entry_unit_id,
      pr.quantity AS recipe_quantity,
      COALESCE(pr.yield_factor, 1.0) AS yield_factor,
      COALESCE(sl.current_quantity, 0) AS current_quantity_base,
      entry_iu.to_base_factor
    FROM public.production_recipes pr
    JOIN public.ingredients ing
      ON ing.id = pr.ingredient_id
     AND ing.tenant_id = pr.tenant_id
    LEFT JOIN public.units entry_u
      ON entry_u.id = pr.entry_unit_id
     AND entry_u.tenant_id = pr.tenant_id
     AND entry_u.is_active = TRUE
    LEFT JOIN public.ingredient_units entry_iu
      ON entry_iu.tenant_id = pr.tenant_id
     AND entry_iu.ingredient_id = pr.ingredient_id
     AND entry_iu.unit_id = pr.entry_unit_id
     AND entry_iu.is_active = TRUE
    LEFT JOIN public.ingredient_units base_iu
      ON base_iu.tenant_id = pr.tenant_id
     AND base_iu.ingredient_id = pr.ingredient_id
     AND base_iu.is_base = TRUE
     AND base_iu.is_active = TRUE
    LEFT JOIN public.units base_u
      ON base_u.id = base_iu.unit_id
     AND base_u.tenant_id = base_iu.tenant_id
     AND base_u.is_active = TRUE
    LEFT JOIN public.stock_levels sl
      ON sl.tenant_id = v_tenant
     AND sl.branch_id = p_branch_id
     AND sl.location_id = v_location_id
     AND sl.ingredient_id = pr.ingredient_id
    WHERE pr.tenant_id = v_tenant
      AND pr.finished_good_id = p_finished_good_id
  ),
  calculated AS (
    SELECT
      *,
      CASE
        WHEN entry_unit_id IS NOT NULL
          THEN ((1.0 * recipe_quantity) / yield_factor) * to_base_factor
        ELSE ((1.0 * recipe_quantity) / yield_factor)
      END AS required_base_per_fg,
      CASE
        WHEN entry_unit_id IS NOT NULL
          THEN current_quantity_base / to_base_factor
        ELSE current_quantity_base
      END AS max_ingredient_qty
    FROM base
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(calculated)), '[]'::jsonb)
  INTO v_res
  FROM calculated;

  RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_production_run(
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

  v_effective_ingredients := COALESCE(p_actual_ingredients, v_run.ingredients_override);

  SELECT il.id INTO v_source_location_id
  FROM public.inventory_locations il
  WHERE il.id = v_run.source_location_id
    AND il.tenant_id = v_tenant
    AND il.branch_id = v_run.branch_id
    AND il.is_active = TRUE
  LIMIT 1;
  IF v_source_location_id IS NULL THEN
    RAISE EXCEPTION 'production_source_location_missing:%', v_run.branch_id USING ERRCODE = 'P0002';
  END IF;

  SELECT il.id INTO v_target_location_id
  FROM public.inventory_locations il
  WHERE il.id = v_run.target_location_id
    AND il.tenant_id = v_tenant
    AND il.branch_id = v_run.target_branch_id
    AND il.is_active = TRUE
  LIMIT 1;
  IF v_target_location_id IS NULL THEN
    RAISE EXCEPTION 'production_target_location_missing:%', v_run.target_branch_id USING ERRCODE = 'P0002';
  END IF;

  v_actual_quantity := ROUND(COALESCE(p_actual_quantity, v_run.planned_quantity), 3);

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
    SELECT pr.ingredient_id, pr.quantity, pr.yield_factor, pr.entry_unit_id,
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
      COALESCE(v_recipe.yield_factor, 1.0);

    IF v_effective_ingredients IS NOT NULL THEN
      v_actual_usage := NULL;
      SELECT (elem->>'actual_quantity')::numeric(15,3) INTO v_actual_usage
      FROM jsonb_array_elements(v_effective_ingredients) elem
      WHERE (elem->>'ingredient_id')::bigint = v_recipe.ingredient_id;

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
      to_jsonb(COALESCE((v_need_map ->> v_key)::numeric, 0) + v_raw_need_purchase),
      TRUE
    );
    v_output_cost := v_output_cost +
      (v_raw_need_purchase * COALESCE(v_recipe.raw_unit_cost, 0));
  END LOOP;

  IF NOT v_has_recipe THEN
    RAISE EXCEPTION 'production_recipe_missing' USING ERRCODE = 'P0001';
  END IF;

  WITH shortages AS (
    SELECT (need.ingredient_id)::bigint AS ingredient_id, ing.name AS ingredient_name,
           (
             SELECT u.name
             FROM public.ingredient_units iu
             JOIN public.units u ON u.id = iu.unit_id
             WHERE iu.ingredient_id = ing.id AND iu.is_base = TRUE
             LIMIT 1
           ) AS unit,
           ROUND((need.need_qty)::numeric, 3) AS needed,
           ROUND(COALESCE(sl.current_quantity, 0)::numeric, 3) AS on_hand
    FROM jsonb_each_text(v_need_map) AS need(ingredient_id, need_qty)
    JOIN public.ingredients ing ON ing.id = (need.ingredient_id)::bigint
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
    SELECT sl.current_quantity, sl.avg_unit_cost INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_run.branch_id
      AND sl.location_id = v_source_location_id
      AND sl.ingredient_id = v_key::bigint;
    IF NOT FOUND THEN
      v_old_q := 0;
      v_old_wac := 0;
    END IF;

    SELECT iu.unit_id INTO v_raw_entry_unit_id
    FROM public.ingredient_units iu
    JOIN public.units u
      ON u.id = iu.unit_id
     AND u.tenant_id = iu.tenant_id
     AND u.is_active = TRUE
    WHERE iu.tenant_id = v_tenant
      AND iu.ingredient_id = v_key::bigint
      AND iu.is_base = TRUE
      AND iu.is_active = TRUE
    ORDER BY iu.sort_order ASC, iu.id ASC
    LIMIT 1;

    IF v_raw_entry_unit_id IS NULL THEN
      RAISE EXCEPTION 'entry_unit_not_found:%', v_key::bigint USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, production_run_id, unit_cost, location_id,
      entry_unit_id, entry_quantity
    ) VALUES (
      v_tenant, v_run.branch_id, v_key::bigint, 'production_consumption', -v_need_qty,
      'Production ' || v_run.production_number, v_uid, p_run_id, COALESCE(v_old_wac, 0), v_source_location_id,
      v_raw_entry_unit_id, v_need_qty
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

  SELECT sl.current_quantity, sl.avg_unit_cost INTO v_old_q, v_old_wac
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
    tenant_id, branch_id, ingredient_id, type, quantity_change,
    reason, created_by, production_run_id, unit_cost, location_id,
    entry_unit_id, entry_quantity
  ) VALUES (
    v_tenant, v_run.target_branch_id, v_run.finished_good_id, 'production_output', v_out_base,
    'Production ' || v_run.production_number, v_uid, p_run_id, v_out_unit_cost, v_target_location_id,
    v_run.entry_unit_id, v_actual_quantity
  );

  v_new_q := COALESCE(v_old_q, 0) + v_out_base;
  v_new_wac := CASE
    WHEN v_new_q > 0 THEN
      (COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_cost_total) / v_new_q
    ELSE v_out_unit_cost
  END;

  UPDATE public.stock_levels sl
  SET avg_unit_cost = v_new_wac, updated_at = now()
  WHERE sl.tenant_id = v_tenant
    AND sl.branch_id = v_run.target_branch_id
    AND sl.location_id = v_target_location_id
    AND sl.ingredient_id = v_run.finished_good_id;

  UPDATE public.ingredients
  SET unit_cost = v_out_unit_cost, updated_at = now()
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

REVOKE ALL ON FUNCTION public.get_production_recipe_context_for_location(bigint, bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_production_recipe_context_for_location(bigint, bigint, bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.confirm_production_run(bigint, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_production_run(bigint, numeric, jsonb) TO authenticated, service_role;

COMMIT;
