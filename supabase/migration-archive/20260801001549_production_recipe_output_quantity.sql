-- Production recipes: replace yield_factor with explicit finished-good output_quantity.
-- BOM scaling: raw_need = planned_output * (ingredient.quantity / output_quantity).

-- ── Schema ──────────────────────────────────────────────────────────────────

ALTER TABLE public.production_recipes
  ADD COLUMN IF NOT EXISTS output_quantity numeric(15,3);

UPDATE public.production_recipes
SET output_quantity = 1
WHERE output_quantity IS NULL;

ALTER TABLE public.production_recipes
  ALTER COLUMN output_quantity SET NOT NULL;

ALTER TABLE public.production_recipes
  ALTER COLUMN output_quantity DROP DEFAULT;

ALTER TABLE public.production_recipes
  DROP CONSTRAINT IF EXISTS production_recipes_output_quantity_valid;

ALTER TABLE public.production_recipes
  ADD CONSTRAINT production_recipes_output_quantity_valid
  CHECK (
    output_quantity > 0
    AND output_quantity NOT IN (
      'NaN'::numeric,
      'Infinity'::numeric,
      '-Infinity'::numeric
    )
  );

COMMENT ON COLUMN public.production_recipes.output_quantity IS
  'Finished-good quantity this BOM produces, in the finished good production unit. Denormalized onto every ingredient line for the same finished_good_id.';

ALTER TABLE public.production_recipes
  DROP CONSTRAINT IF EXISTS production_recipes_yield_factor_check;

ALTER TABLE public.production_recipes
  DROP CONSTRAINT IF EXISTS production_recipes_yield_factor_valid;

ALTER TABLE public.production_recipes
  DROP COLUMN IF EXISTS yield_factor;

-- ── Recipe context ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_production_recipe_context_for_location(
  p_finished_good_id bigint,
  p_branch_id bigint,
  p_source_location_id bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_location_id bigint := p_source_location_id;
  v_result jsonb;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_inventory_production_operator() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(
       p_branch_id,
       'inventory:production_create'
     )
     AND NOT public.has_permission(
       p_branch_id,
       'inventory:production_confirm'
     ) THEN
    RAISE EXCEPTION 'branch_scope_violation'
      USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.production_recipes AS recipe
    LEFT JOIN public.ingredient_units AS ingredient_unit
      ON ingredient_unit.tenant_id = recipe.tenant_id
     AND ingredient_unit.ingredient_id = recipe.ingredient_id
     AND ingredient_unit.unit_id = recipe.entry_unit_id
     AND ingredient_unit.is_active IS TRUE
    LEFT JOIN public.units AS unit
      ON unit.id = ingredient_unit.unit_id
     AND unit.tenant_id = ingredient_unit.tenant_id
     AND unit.is_active IS TRUE
    WHERE recipe.tenant_id = v_tenant
      AND recipe.finished_good_id = p_finished_good_id
      AND recipe.entry_unit_id IS NOT NULL
      AND (
        ingredient_unit.id IS NULL
        OR unit.id IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'production_recipe_unit_mapping_missing:%',
      p_finished_good_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_location_id IS NULL THEN
    SELECT location.id
    INTO v_location_id
    FROM public.branches AS branch
    JOIN public.inventory_locations AS location
      ON location.tenant_id = branch.tenant_id
     AND location.branch_id = branch.id
     AND location.is_active IS TRUE
    WHERE branch.tenant_id = v_tenant
      AND branch.id = p_branch_id
      AND location.location_kind = 'warehouse'
    ORDER BY
      location.is_default_issue DESC,
      location.sort_order,
      location.id
    LIMIT 1;
  ELSE
    SELECT location.id
    INTO v_location_id
    FROM public.inventory_locations AS location
    JOIN public.branches AS branch
      ON branch.id = location.branch_id
     AND branch.tenant_id = location.tenant_id
    WHERE location.id = v_location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = p_branch_id
      AND location.is_active IS TRUE
      AND (
        location.location_kind = 'warehouse'
        OR (
          branch.branch_kind = 'central_kitchen'
          AND location.location_kind = 'production_storage'
        )
      );
  END IF;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'production_source_location_missing:%',
      p_branch_id
      USING ERRCODE = 'P0002';
  END IF;

  WITH base AS (
    SELECT
      recipe.ingredient_id,
      ingredient.name AS ingredient_name,
      coalesce(
        entry_unit.name,
        entry_unit.code,
        base_unit.name,
        base_unit.code,
        ''
      ) AS unit_name,
      recipe.entry_unit_id,
      recipe.quantity AS recipe_quantity,
      recipe.output_quantity,
      coalesce(stock.current_quantity, 0) AS current_quantity_base,
      entry_mapping.to_base_factor
    FROM public.production_recipes AS recipe
    JOIN public.ingredients AS ingredient
      ON ingredient.id = recipe.ingredient_id
     AND ingredient.tenant_id = recipe.tenant_id
    LEFT JOIN public.units AS entry_unit
      ON entry_unit.id = recipe.entry_unit_id
     AND entry_unit.tenant_id = recipe.tenant_id
     AND entry_unit.is_active IS TRUE
    LEFT JOIN public.ingredient_units AS entry_mapping
      ON entry_mapping.tenant_id = recipe.tenant_id
     AND entry_mapping.ingredient_id = recipe.ingredient_id
     AND entry_mapping.unit_id = recipe.entry_unit_id
     AND entry_mapping.is_active IS TRUE
    LEFT JOIN public.ingredient_units AS base_mapping
      ON base_mapping.tenant_id = recipe.tenant_id
     AND base_mapping.ingredient_id = recipe.ingredient_id
     AND base_mapping.is_base IS TRUE
     AND base_mapping.is_active IS TRUE
    LEFT JOIN public.units AS base_unit
      ON base_unit.id = base_mapping.unit_id
     AND base_unit.tenant_id = base_mapping.tenant_id
     AND base_unit.is_active IS TRUE
    LEFT JOIN public.stock_levels AS stock
      ON stock.tenant_id = v_tenant
     AND stock.branch_id = p_branch_id
     AND stock.location_id = v_location_id
     AND stock.ingredient_id = recipe.ingredient_id
    WHERE recipe.tenant_id = v_tenant
      AND recipe.finished_good_id = p_finished_good_id
  ),
  calculated AS (
    SELECT
      base.*,
      CASE
        WHEN base.entry_unit_id IS NOT NULL
          THEN (
            base.recipe_quantity / base.output_quantity
          ) * base.to_base_factor
        ELSE base.recipe_quantity / base.output_quantity
      END AS required_base_per_fg,
      CASE
        WHEN base.entry_unit_id IS NOT NULL
          THEN base.current_quantity_base / base.to_base_factor
        ELSE base.current_quantity_base
      END AS max_ingredient_qty
    FROM base
  )
  SELECT coalesce(
    jsonb_agg(to_jsonb(calculated)),
    '[]'::jsonb
  )
  INTO v_result
  FROM calculated;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_production_recipe_context_for_location(
  bigint,
  bigint,
  bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_production_recipe_context_for_location(
  bigint,
  bigint,
  bigint
) TO authenticated, service_role;

-- ── Confirm production run ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION private.execute_confirm_production_run(p_run_id bigint, p_actual_quantity numeric DEFAULT NULL::numeric, p_actual_ingredients jsonb DEFAULT NULL::jsonb) RETURNS jsonb
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
    SELECT pr.ingredient_id, pr.quantity, pr.output_quantity, pr.entry_unit_id,
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


REVOKE ALL ON FUNCTION private.execute_confirm_production_run(
  bigint,
  numeric,
  jsonb
) FROM PUBLIC, anon, authenticated, service_role;

-- ── Upsert recipe lines (new signature with p_output_quantity) ──────────────

DROP FUNCTION IF EXISTS public.upsert_production_recipe_lines(
  bigint,
  jsonb,
  bigint
);
DROP FUNCTION IF EXISTS private.execute_upsert_production_recipe_lines(
  bigint,
  jsonb,
  bigint
);

CREATE FUNCTION private.execute_upsert_production_recipe_lines(
  p_finished_good_id bigint,
  p_lines jsonb,
  p_output_quantity numeric,
  p_old_finished_good_id bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_kept bigint[] := ARRAY[]::bigint[];
  v_line jsonb;
  v_ingredient_id bigint;
  v_entry_unit_id bigint;
  v_quantity numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_inventory_production_operator() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_permission_any('inventory:production_create')
    OR public.has_permission_any('inventory:production_confirm')
    OR public.has_permission_any('menu:write')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_output_quantity IS NULL
     OR p_output_quantity <= 0
     OR p_output_quantity = 'NaN'::numeric
     OR p_output_quantity = 'Infinity'::numeric
     OR p_output_quantity = '-Infinity'::numeric THEN
    RAISE EXCEPTION 'output_quantity_invalid' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.ingredients i
    WHERE i.id = p_finished_good_id
      AND i.tenant_id = v_tenant
      AND i.item_kind = 'finished_good'
      AND i.is_active = true
  ) THEN
    RAISE EXCEPTION 'finished_good_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'lines_must_be_array' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'lines_must_not_be_empty' USING ERRCODE = '22023';
  END IF;

  IF p_old_finished_good_id IS NOT NULL AND p_old_finished_good_id <> p_finished_good_id THEN
    DELETE FROM public.production_recipes pr
    WHERE pr.tenant_id = v_tenant
      AND pr.finished_good_id = p_old_finished_good_id;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    IF (v_line->>'ingredient_id') IS NULL OR (v_line->>'quantity') IS NULL THEN
      RAISE EXCEPTION 'invalid_line_shape' USING ERRCODE = '22023';
    END IF;

    v_ingredient_id := (v_line->>'ingredient_id')::bigint;
    v_entry_unit_id := NULLIF(v_line->>'entry_unit_id', '')::bigint;
    v_quantity := (v_line->>'quantity')::numeric;

    IF v_quantity <= 0
       OR v_quantity = 'NaN'::numeric
       OR v_quantity = 'Infinity'::numeric
       OR v_quantity = '-Infinity'::numeric THEN
      RAISE EXCEPTION 'invalid_line_quantity' USING ERRCODE = '22023';
    END IF;

    IF v_ingredient_id = ANY(v_kept) THEN
      RAISE EXCEPTION 'duplicate_ingredient' USING ERRCODE = '23505';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.ingredients i
      WHERE i.id = v_ingredient_id
        AND i.tenant_id = v_tenant
        AND i.item_kind IN ('raw_material', 'finished_good')
        AND i.is_active = true
    ) THEN
      RAISE EXCEPTION 'ingredient_not_found' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.production_recipes (
      tenant_id,
      finished_good_id,
      ingredient_id,
      quantity,
      entry_unit_id,
      note,
      output_quantity
    )
    VALUES (
      v_tenant,
      p_finished_good_id,
      v_ingredient_id,
      v_quantity,
      v_entry_unit_id,
      NULLIF(v_line->>'note', ''),
      p_output_quantity
    )
    ON CONFLICT (finished_good_id, ingredient_id, tenant_id)
    DO UPDATE SET
      quantity = EXCLUDED.quantity,
      entry_unit_id = EXCLUDED.entry_unit_id,
      note = EXCLUDED.note,
      output_quantity = EXCLUDED.output_quantity;

    v_kept := v_kept || v_ingredient_id;
  END LOOP;

  DELETE FROM public.production_recipes pr
  WHERE pr.tenant_id = v_tenant
    AND pr.finished_good_id = p_finished_good_id
    AND NOT (pr.ingredient_id = ANY(v_kept));

  RETURN jsonb_build_object(
    'finished_good_id', p_finished_good_id,
    'kept_count', COALESCE(array_length(v_kept, 1), 0),
    'output_quantity', p_output_quantity
  );
END;
$$;

REVOKE ALL ON FUNCTION private.execute_upsert_production_recipe_lines(
  bigint,
  jsonb,
  numeric,
  bigint
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.upsert_production_recipe_lines(
  p_finished_good_id bigint,
  p_lines jsonb,
  p_output_quantity numeric,
  p_old_finished_good_id bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_line jsonb;
  v_quantity numeric;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;
  IF public.auth_role() NOT IN (
    'owner',
    'central_kitchen_lead'
  ) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_permission_any('inventory:production_create')
    OR public.has_permission_any('inventory:production_confirm')
    OR public.has_permission_any('menu:write')
  ) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF p_output_quantity IS NULL
     OR p_output_quantity <= 0
     OR p_output_quantity = 'NaN'::numeric
     OR p_output_quantity = 'Infinity'::numeric
     OR p_output_quantity = '-Infinity'::numeric THEN
    RAISE EXCEPTION 'output_quantity_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF p_lines IS NOT NULL
     AND jsonb_typeof(p_lines) = 'array' THEN
    FOR v_line IN
      SELECT item.value
      FROM jsonb_array_elements(p_lines) AS item(value)
    LOOP
      v_quantity := nullif(v_line ->> 'quantity', '')::numeric;
      IF v_quantity IS NULL
         OR v_quantity <= 0
         OR v_quantity = 'NaN'::numeric
         OR v_quantity = 'Infinity'::numeric
         OR v_quantity = '-Infinity'::numeric THEN
        RAISE EXCEPTION 'recipe_line_quantity_invalid'
          USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  RETURN private.execute_upsert_production_recipe_lines(
    p_finished_good_id,
    p_lines,
    p_output_quantity,
    p_old_finished_good_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_production_recipe_lines(
  bigint,
  jsonb,
  numeric,
  bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_production_recipe_lines(
  bigint,
  jsonb,
  numeric,
  bigint
) TO authenticated, service_role;

-- ── Bulk import ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION private.execute_bulk_import_production_recipes(
  p_groups jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_recipes integer := 0;
  v_lines integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_inventory_production_operator() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_permission_any('inventory:production_create')
    OR public.has_permission_any('inventory:production_confirm')
    OR public.has_permission_any('menu:write')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_groups IS NULL OR jsonb_typeof(p_groups) <> 'array' OR jsonb_array_length(p_groups) = 0 THEN
    RAISE EXCEPTION 'groups_must_be_non_empty_array' USING ERRCODE = '22023';
  END IF;

  DROP TABLE IF EXISTS pg_temp.bulk_import_production_groups;
  DROP TABLE IF EXISTS pg_temp.bulk_import_production_lines;

  CREATE TEMP TABLE pg_temp.bulk_import_production_groups ON COMMIT DROP AS
  SELECT
    raw.ordinality::integer AS group_no,
    (raw.value->>'finished_good_id')::bigint AS finished_good_id,
    (raw.value->>'output_quantity')::numeric AS output_quantity,
    raw.value->'lines' AS lines
  FROM jsonb_array_elements(p_groups) WITH ORDINALITY AS raw(value, ordinality);

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_production_groups
    WHERE finished_good_id IS NULL
      OR output_quantity IS NULL
      OR output_quantity <= 0
      OR output_quantity = 'NaN'::numeric
      OR output_quantity = 'Infinity'::numeric
      OR output_quantity = '-Infinity'::numeric
      OR lines IS NULL
      OR jsonb_typeof(lines) <> 'array'
      OR jsonb_array_length(lines) = 0
  ) THEN
    RAISE EXCEPTION 'invalid_group_shape' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_production_groups
    GROUP BY finished_good_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate_finished_good' USING ERRCODE = '23505';
  END IF;

  CREATE TEMP TABLE pg_temp.bulk_import_production_lines ON COMMIT DROP AS
  SELECT
    groups.finished_good_id,
    groups.output_quantity,
    raw.ordinality::integer AS line_no,
    (raw.value->>'ingredient_id')::bigint AS ingredient_id,
    (raw.value->>'quantity')::numeric AS quantity,
    NULLIF(raw.value->>'entry_unit_id', '')::bigint AS entry_unit_id,
    NULLIF(btrim(COALESCE(raw.value->>'note', '')), '') AS note
  FROM pg_temp.bulk_import_production_groups groups
  CROSS JOIN LATERAL jsonb_array_elements(groups.lines) WITH ORDINALITY AS raw(value, ordinality);

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_production_lines
    WHERE ingredient_id IS NULL
      OR quantity <= 0
      OR quantity = 'NaN'::numeric
      OR quantity = 'Infinity'::numeric
      OR quantity = '-Infinity'::numeric
  ) THEN
    RAISE EXCEPTION 'invalid_line_shape' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_production_lines
    GROUP BY finished_good_id, ingredient_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate_ingredient' USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_production_groups groups
    LEFT JOIN public.ingredients finished_goods
      ON finished_goods.id = groups.finished_good_id
      AND finished_goods.tenant_id = v_tenant
      AND finished_goods.item_kind = 'finished_good'
      AND finished_goods.is_active
    WHERE finished_goods.id IS NULL
  ) THEN
    RAISE EXCEPTION 'finished_good_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_production_lines lines
    LEFT JOIN public.ingredients ingredients
      ON ingredients.id = lines.ingredient_id
      AND ingredients.tenant_id = v_tenant
      AND ingredients.item_kind IN ('raw_material', 'finished_good')
      AND ingredients.is_active
    WHERE ingredients.id IS NULL
  ) THEN
    RAISE EXCEPTION 'ingredient_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.production_recipes (
    tenant_id,
    finished_good_id,
    ingredient_id,
    quantity,
    entry_unit_id,
    note,
    output_quantity
  )
  SELECT
    v_tenant,
    lines.finished_good_id,
    lines.ingredient_id,
    lines.quantity,
    lines.entry_unit_id,
    lines.note,
    lines.output_quantity
  FROM pg_temp.bulk_import_production_lines lines
  ON CONFLICT (finished_good_id, ingredient_id, tenant_id)
  DO UPDATE SET
    quantity = EXCLUDED.quantity,
    entry_unit_id = EXCLUDED.entry_unit_id,
    note = EXCLUDED.note,
    output_quantity = EXCLUDED.output_quantity;

  DELETE FROM public.production_recipes recipes
  USING pg_temp.bulk_import_production_groups groups
  WHERE recipes.tenant_id = v_tenant
    AND recipes.finished_good_id = groups.finished_good_id
    AND NOT EXISTS (
      SELECT 1
      FROM pg_temp.bulk_import_production_lines lines
      WHERE lines.finished_good_id = recipes.finished_good_id
        AND lines.ingredient_id = recipes.ingredient_id
    );

  SELECT count(*) INTO v_recipes
  FROM pg_temp.bulk_import_production_groups;

  SELECT count(*) INTO v_lines
  FROM pg_temp.bulk_import_production_lines;

  RETURN jsonb_build_object('recipes', v_recipes, 'lines', v_lines);
END;
$$;

REVOKE ALL ON FUNCTION
  private.execute_bulk_import_production_recipes(jsonb)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bulk_import_production_recipes(
  p_groups jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_group jsonb;
  v_line jsonb;
  v_quantity numeric;
  v_output_quantity numeric;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;
  IF public.auth_role() NOT IN (
    'owner',
    'central_kitchen_lead'
  ) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_permission_any('inventory:production_create')
    OR public.has_permission_any('inventory:production_confirm')
    OR public.has_permission_any('menu:write')
  ) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF p_groups IS NOT NULL
     AND jsonb_typeof(p_groups) = 'array' THEN
    FOR v_group IN
      SELECT item.value
      FROM jsonb_array_elements(p_groups) AS item(value)
    LOOP
      v_output_quantity := nullif(v_group ->> 'output_quantity', '')::numeric;
      IF v_output_quantity IS NULL
         OR v_output_quantity <= 0
         OR v_output_quantity = 'NaN'::numeric
         OR v_output_quantity = 'Infinity'::numeric
         OR v_output_quantity = '-Infinity'::numeric THEN
        RAISE EXCEPTION 'output_quantity_invalid'
          USING ERRCODE = '22023';
      END IF;
      IF jsonb_typeof(v_group -> 'lines') = 'array' THEN
        FOR v_line IN
          SELECT item.value
          FROM jsonb_array_elements(v_group -> 'lines') AS item(value)
        LOOP
          v_quantity := nullif(v_line ->> 'quantity', '')::numeric;
          IF v_quantity IS NULL
             OR v_quantity <= 0
             OR v_quantity = 'NaN'::numeric
             OR v_quantity = 'Infinity'::numeric
             OR v_quantity = '-Infinity'::numeric THEN
            RAISE EXCEPTION 'invalid_line_shape'
              USING ERRCODE = '22023';
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  RETURN private.execute_bulk_import_production_recipes(p_groups);
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_import_production_recipes(jsonb)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_import_production_recipes(jsonb)
TO authenticated, service_role;
