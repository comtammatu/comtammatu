BEGIN;

ALTER TABLE public.production_runs
  ADD COLUMN IF NOT EXISTS source_location_id bigint REFERENCES public.inventory_locations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS target_location_id bigint REFERENCES public.inventory_locations(id) ON DELETE RESTRICT;

UPDATE public.production_runs pr
SET source_location_id = (
  SELECT il.id
  FROM public.branches b
  JOIN public.inventory_locations il
    ON il.tenant_id = b.tenant_id
   AND il.branch_id = b.id
   AND il.is_active = TRUE
  WHERE b.tenant_id = pr.tenant_id
    AND b.id = pr.branch_id
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
  LIMIT 1
)
WHERE pr.source_location_id IS NULL;

UPDATE public.production_runs pr
SET target_location_id = (
  SELECT il.id
  FROM public.inventory_locations il
  WHERE il.tenant_id = pr.tenant_id
    AND il.branch_id = pr.target_branch_id
    AND il.is_active = TRUE
  ORDER BY
    il.is_default_receive DESC,
    il.sort_order NULLS LAST,
    il.id
  LIMIT 1
)
WHERE pr.target_location_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.production_runs
    WHERE source_location_id IS NULL
       OR target_location_id IS NULL
  ) THEN
    RAISE EXCEPTION 'production_run_location_backfill_missing' USING ERRCODE = 'P0002';
  END IF;
END $$;

ALTER TABLE public.production_runs
  ALTER COLUMN source_location_id SET NOT NULL,
  ALTER COLUMN target_location_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_production_runs_source_location
  ON public.production_runs(tenant_id, source_location_id);
CREATE INDEX IF NOT EXISTS idx_production_runs_target_location
  ON public.production_runs(tenant_id, target_location_id);

CREATE OR REPLACE FUNCTION public.create_production_run_with_locations(
  p_branch_id bigint,
  p_finished_good_id bigint,
  p_planned_quantity numeric,
  p_entry_unit_id bigint,
  p_notes text DEFAULT NULL::text,
  p_target_branch_id bigint DEFAULT NULL::bigint,
  p_ingredients_override jsonb DEFAULT NULL::jsonb,
  p_source_location_id bigint DEFAULT NULL::bigint,
  p_target_location_id bigint DEFAULT NULL::bigint
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
  v_source_location_id bigint := p_source_location_id;
  v_target_location_id bigint := p_target_location_id;
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

  IF v_source_location_id IS NULL THEN
    SELECT il.id INTO v_source_location_id
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
    SELECT il.id INTO v_source_location_id
    FROM public.inventory_locations il
    WHERE il.id = v_source_location_id
      AND il.tenant_id = v_tenant
      AND il.branch_id = p_branch_id
      AND il.is_active = TRUE
    LIMIT 1;
  END IF;

  IF v_source_location_id IS NULL THEN
    RAISE EXCEPTION 'production_source_location_missing:%', p_branch_id USING ERRCODE = 'P0002';
  END IF;

  IF v_target_location_id IS NULL THEN
    SELECT il.id INTO v_target_location_id
    FROM public.inventory_locations il
    WHERE il.tenant_id = v_tenant
      AND il.branch_id = v_target_branch_id
      AND il.is_active = TRUE
    ORDER BY
      il.is_default_receive DESC,
      il.sort_order NULLS LAST,
      il.id
    LIMIT 1;
  ELSE
    SELECT il.id INTO v_target_location_id
    FROM public.inventory_locations il
    WHERE il.id = v_target_location_id
      AND il.tenant_id = v_tenant
      AND il.branch_id = v_target_branch_id
      AND il.is_active = TRUE
    LIMIT 1;
  END IF;

  IF v_target_location_id IS NULL THEN
    RAISE EXCEPTION 'production_target_location_missing:%', v_target_branch_id USING ERRCODE = 'P0002';
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
    source_location_id,
    target_branch_id,
    target_location_id,
    finished_good_id,
    planned_quantity,
    entry_unit_id,
    notes,
    created_by,
    status,
    ingredients_override
  ) VALUES (
    v_tenant,
    v_number,
    p_branch_id,
    v_source_location_id,
    v_target_branch_id,
    v_target_location_id,
    p_finished_good_id,
    p_planned_quantity,
    v_entry_unit_id,
    p_notes,
    v_uid,
    'draft',
    p_ingredients_override
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('production_run_id', v_new_id, 'production_number', v_number);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_production_run(
  p_branch_id bigint,
  p_finished_good_id bigint,
  p_planned_quantity numeric,
  p_entry_unit_id bigint,
  p_notes text DEFAULT NULL::text,
  p_target_branch_id bigint DEFAULT NULL::bigint,
  p_ingredients_override jsonb DEFAULT NULL::jsonb
) RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT public.create_production_run_with_locations(
    p_branch_id,
    p_finished_good_id,
    p_planned_quantity,
    p_entry_unit_id,
    p_notes,
    p_target_branch_id,
    p_ingredients_override,
    NULL::bigint,
    NULL::bigint
  );
$$;

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
    JOIN public.ingredients ing ON ing.id = pr.ingredient_id
    LEFT JOIN public.units entry_u ON entry_u.id = pr.entry_unit_id
    LEFT JOIN public.ingredient_units entry_iu
      ON entry_iu.tenant_id = v_tenant
     AND entry_iu.ingredient_id = pr.ingredient_id
     AND entry_iu.unit_id = pr.entry_unit_id
     AND entry_iu.is_active = TRUE
    LEFT JOIN public.ingredient_units base_iu
      ON base_iu.tenant_id = v_tenant
     AND base_iu.ingredient_id = pr.ingredient_id
     AND base_iu.is_base = TRUE
     AND base_iu.is_active = TRUE
    LEFT JOIN public.units base_u ON base_u.id = base_iu.unit_id
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
          THEN ((1.0 * recipe_quantity) / yield_factor) * COALESCE(to_base_factor, 1.0)
        ELSE ((1.0 * recipe_quantity) / yield_factor)
      END AS required_base_per_fg,
      CASE
        WHEN entry_unit_id IS NOT NULL
          THEN current_quantity_base / COALESCE(to_base_factor, 1.0)
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

CREATE OR REPLACE FUNCTION public.get_production_recipe_context(
  p_finished_good_id bigint,
  p_branch_id bigint
) RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT public.get_production_recipe_context_for_location(
    p_finished_good_id,
    p_branch_id,
    NULL::bigint
  );
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
  JOIN public.branches b ON b.id = pr.branch_id AND b.tenant_id = pr.tenant_id
  WHERE pr.id = p_run_id AND pr.tenant_id = v_tenant
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

  FOR v_recipe IN
    SELECT pr.ingredient_id, pr.quantity, pr.yield_factor, pr.entry_unit_id,
           COALESCE(sl.avg_unit_cost, ing.unit_cost, 0) AS raw_unit_cost
    FROM public.production_recipes pr
    JOIN public.ingredients ing ON ing.id = pr.ingredient_id AND ing.tenant_id = pr.tenant_id
    LEFT JOIN public.stock_levels sl
      ON sl.tenant_id = v_tenant
     AND sl.branch_id = v_run.branch_id
     AND sl.location_id = v_source_location_id
     AND sl.ingredient_id = pr.ingredient_id
    WHERE pr.tenant_id = v_tenant
      AND pr.finished_good_id = v_run.finished_good_id
  LOOP
    v_has_recipe := true;
    v_raw_need_measure := (v_run.planned_quantity * v_recipe.quantity) / COALESCE(v_recipe.yield_factor, 1.0);

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
      v_raw_need_purchase := ROUND(public.inv_to_base(v_recipe.ingredient_id, v_recipe.entry_unit_id, v_raw_need_measure), 3);
    ELSE
      v_raw_need_purchase := ROUND(v_raw_need_measure, 3);
    END IF;

    v_key := v_recipe.ingredient_id::text;
    v_need_map := jsonb_set(v_need_map, ARRAY[v_key], to_jsonb(COALESCE((v_need_map ->> v_key)::numeric, 0) + v_raw_need_purchase), TRUE);
    v_output_cost := v_output_cost + (v_raw_need_purchase * COALESCE(v_recipe.raw_unit_cost, 0));
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
  SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v_shortages FROM shortages s;

  IF jsonb_array_length(v_shortages) > 0 THEN
    RAISE EXCEPTION 'insufficient_stock_for_production' USING ERRCODE = 'P0001', DETAIL = v_shortages::text;
  END IF;

  v_cost_total := v_output_cost;

  FOR v_key, v_need_qty IN SELECT key, value::numeric(15,3) FROM jsonb_each_text(v_need_map) LOOP
    SELECT sl.current_quantity, sl.avg_unit_cost INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_run.branch_id
      AND sl.location_id = v_source_location_id
      AND sl.ingredient_id = v_key::bigint;
    IF NOT FOUND THEN v_old_q := 0; v_old_wac := 0; END IF;

    SELECT iu.unit_id INTO v_raw_entry_unit_id
    FROM public.ingredient_units iu
    JOIN public.units u ON u.id = iu.unit_id AND u.tenant_id = iu.tenant_id AND u.is_active = TRUE
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
    v_out_base := public.inv_to_base(v_run.finished_good_id, v_run.entry_unit_id, v_actual_quantity);
  ELSE
    v_out_base := v_actual_quantity;
  END IF;

  v_out_unit_cost := CASE WHEN v_out_base <> 0 THEN ROUND(v_cost_total / v_out_base, 2) ELSE 0 END;

  SELECT sl.current_quantity, sl.avg_unit_cost INTO v_old_q, v_old_wac
  FROM public.stock_levels sl
  WHERE sl.tenant_id = v_tenant
    AND sl.branch_id = v_run.target_branch_id
    AND sl.location_id = v_target_location_id
    AND sl.ingredient_id = v_run.finished_good_id;
  IF NOT FOUND THEN v_old_q := 0; v_old_wac := 0; END IF;

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
  v_new_wac := CASE WHEN v_new_q > 0 THEN (COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_cost_total) / v_new_q ELSE v_out_unit_cost END;

  UPDATE public.stock_levels sl
  SET avg_unit_cost = v_new_wac, updated_at = now()
  WHERE sl.tenant_id = v_tenant
    AND sl.branch_id = v_run.target_branch_id
    AND sl.location_id = v_target_location_id
    AND sl.ingredient_id = v_run.finished_good_id;

  UPDATE public.ingredients
  SET unit_cost = v_out_unit_cost, updated_at = now()
  WHERE id = v_run.finished_good_id AND tenant_id = v_tenant;

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

REVOKE ALL ON FUNCTION public.create_production_run_with_locations(
  bigint, bigint, numeric, bigint, text, bigint, jsonb, bigint, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_production_run_with_locations(
  bigint, bigint, numeric, bigint, text, bigint, jsonb, bigint, bigint
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_production_run(
  bigint, bigint, numeric, bigint, text, bigint, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_production_run(
  bigint, bigint, numeric, bigint, text, bigint, jsonb
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_production_recipe_context_for_location(
  bigint, bigint, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_production_recipe_context_for_location(
  bigint, bigint, bigint
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_production_recipe_context(bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_production_recipe_context(bigint, bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.confirm_production_run(bigint, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_production_run(bigint, numeric, jsonb) TO authenticated, service_role;

COMMIT;
