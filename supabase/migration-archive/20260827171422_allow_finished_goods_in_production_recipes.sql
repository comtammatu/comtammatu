-- Allow Finished Goods (semi-finished / intermediate goods) as ingredients in production recipes.
-- Enforces self-reference and transitive circular dependency checks.

CREATE OR REPLACE FUNCTION public.upsert_production_recipe_lines(
  p_finished_good_id bigint,
  p_output_quantity numeric,
  p_output_unit_id bigint,
  p_lines jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_uid uuid := auth.uid();
  v_spec_id bigint;
  v_output_factor numeric(18,12);
  v_output_code text;
  v_line jsonb;
  v_ingredient_id bigint;
  v_quantity numeric;
  v_entry_unit_id bigint;
  v_entry_factor numeric(18,12);
  v_entry_code text;
  v_kept bigint[] := ARRAY[]::bigint[];
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_inventory_production_operator()
     OR NOT (
       public.has_permission_any('inventory:production_create')
       OR public.has_permission_any('inventory:production_confirm')
       OR public.has_permission_any('menu:write')
     ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_output_quantity IS NULL
     OR p_output_quantity <= 0
     OR p_output_quantity IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) THEN
    RAISE EXCEPTION 'output_quantity_invalid' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'invalid_group_shape' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ingredients AS finished_good
    WHERE finished_good.tenant_id = v_tenant
      AND finished_good.id = p_finished_good_id
      AND finished_good.item_kind = 'finished_good'
      AND finished_good.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'finished_good_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT ingredient_unit.to_base_factor, unit_row.code
  INTO v_output_factor, v_output_code
  FROM public.ingredient_units AS ingredient_unit
  JOIN public.units AS unit_row
    ON unit_row.id = ingredient_unit.unit_id
   AND unit_row.tenant_id = ingredient_unit.tenant_id
   AND unit_row.is_active IS TRUE
  WHERE ingredient_unit.tenant_id = v_tenant
    AND ingredient_unit.ingredient_id = p_finished_good_id
    AND ingredient_unit.unit_id = p_output_unit_id
    AND ingredient_unit.is_active IS TRUE;

  IF v_output_factor IS NULL OR v_output_factor <= 0 THEN
    RAISE EXCEPTION 'output_unit_invalid' USING ERRCODE = '23514';
  END IF;

  IF (
    SELECT count(*) <> count(DISTINCT (line.value ->> 'ingredientId'))
    FROM jsonb_array_elements(p_lines) AS line(value)
  ) THEN
    RAISE EXCEPTION 'duplicate_ingredient' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.production_recipe_specs (
    tenant_id, finished_good_id, output_quantity, output_unit_id,
    output_to_base_factor, output_unit_code, status, created_by
  ) VALUES (
    v_tenant, p_finished_good_id, p_output_quantity, p_output_unit_id,
    v_output_factor, v_output_code, 'active', v_uid
  )
  ON CONFLICT (tenant_id, finished_good_id) DO UPDATE SET
    output_quantity = EXCLUDED.output_quantity,
    output_unit_id = EXCLUDED.output_unit_id,
    output_to_base_factor = EXCLUDED.output_to_base_factor,
    output_unit_code = EXCLUDED.output_unit_code,
    status = 'active',
    updated_at = now()
  RETURNING id INTO v_spec_id;

  FOR v_line IN
    SELECT line.value FROM jsonb_array_elements(p_lines) AS line(value)
  LOOP
    BEGIN
      v_ingredient_id := nullif(v_line ->> 'ingredientId', '')::bigint;
      v_quantity := nullif(v_line ->> 'quantity', '')::numeric;
      v_entry_unit_id := nullif(v_line ->> 'entryUnitId', '')::bigint;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'recipe_line_invalid' USING ERRCODE = '22023';
    END;

    IF v_ingredient_id IS NULL OR v_entry_unit_id IS NULL
       OR v_quantity IS NULL OR v_quantity <= 0
       OR v_quantity IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) THEN
      RAISE EXCEPTION 'recipe_line_invalid' USING ERRCODE = '22023';
    END IF;
    IF v_ingredient_id = p_finished_good_id THEN
      RAISE EXCEPTION 'recipe_self_reference' USING ERRCODE = '23514';
    END IF;

    -- Transitive circular dependency check
    IF EXISTS (
      WITH RECURSIVE dependency_chain AS (
        SELECT pr.ingredient_id
        FROM public.production_recipes pr
        WHERE pr.tenant_id = v_tenant
          AND pr.finished_good_id = v_ingredient_id
        UNION
        SELECT pr.ingredient_id
        FROM public.production_recipes pr
        JOIN dependency_chain dc ON dc.ingredient_id = pr.finished_good_id
        WHERE pr.tenant_id = v_tenant
      )
      SELECT 1 FROM dependency_chain WHERE ingredient_id = p_finished_good_id
    ) THEN
      RAISE EXCEPTION 'recipe_circular_dependency' USING ERRCODE = '23514';
    END IF;

    SELECT ingredient_unit.to_base_factor, unit_row.code
    INTO v_entry_factor, v_entry_code
    FROM public.ingredients AS ingredient
    JOIN public.ingredient_units AS ingredient_unit
      ON ingredient_unit.tenant_id = ingredient.tenant_id
     AND ingredient_unit.ingredient_id = ingredient.id
     AND ingredient_unit.unit_id = v_entry_unit_id
     AND ingredient_unit.is_active IS TRUE
    JOIN public.units AS unit_row
      ON unit_row.id = ingredient_unit.unit_id
     AND unit_row.tenant_id = ingredient_unit.tenant_id
     AND unit_row.is_active IS TRUE
    WHERE ingredient.tenant_id = v_tenant
      AND ingredient.id = v_ingredient_id
      AND ingredient.is_active IS TRUE;

    IF v_entry_factor IS NULL OR v_entry_factor <= 0 THEN
      RAISE EXCEPTION 'ingredient_unit_invalid' USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.production_recipes (
      tenant_id, recipe_spec_id, finished_good_id, ingredient_id,
      quantity, entry_unit_id, entry_to_base_factor, entry_unit_code,
      output_quantity, note
    ) VALUES (
      v_tenant, v_spec_id, p_finished_good_id, v_ingredient_id,
      v_quantity, v_entry_unit_id, v_entry_factor, v_entry_code,
      p_output_quantity, nullif(pg_catalog.btrim(v_line ->> 'note'), '')
    )
    ON CONFLICT (finished_good_id, ingredient_id, tenant_id) DO UPDATE SET
      recipe_spec_id = EXCLUDED.recipe_spec_id,
      quantity = EXCLUDED.quantity,
      entry_unit_id = EXCLUDED.entry_unit_id,
      entry_to_base_factor = EXCLUDED.entry_to_base_factor,
      entry_unit_code = EXCLUDED.entry_unit_code,
      output_quantity = EXCLUDED.output_quantity,
      note = EXCLUDED.note,
      updated_at = now();

    v_kept := v_kept || v_ingredient_id;
  END LOOP;

  DELETE FROM public.production_recipes AS recipe
  WHERE recipe.tenant_id = v_tenant
    AND recipe.recipe_spec_id = v_spec_id
    AND NOT (recipe.ingredient_id = ANY(v_kept));

  RETURN jsonb_build_object(
    'recipe_spec_id', v_spec_id,
    'finished_good_id', p_finished_good_id,
    'status', 'active',
    'line_count', array_length(v_kept, 1)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_production_recipe_lines(bigint, numeric, bigint, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_production_recipe_lines(bigint, numeric, bigint, jsonb)
  TO authenticated, service_role;
