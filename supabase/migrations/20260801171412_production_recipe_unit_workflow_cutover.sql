-- Move production units from the ingredient catalog into recipe-local snapshots.

CREATE TABLE public.production_recipe_specs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  finished_good_id bigint NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  output_quantity numeric(15,3) NOT NULL,
  output_unit_id bigint REFERENCES public.units(id) ON DELETE RESTRICT,
  output_to_base_factor numeric(18,12),
  output_unit_code text,
  status text NOT NULL DEFAULT 'needs_review',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT production_recipe_specs_tenant_finished_key
    UNIQUE (tenant_id, finished_good_id),
  CONSTRAINT production_recipe_specs_output_quantity_check CHECK (
    output_quantity > 0
    AND output_quantity <> 'NaN'::numeric
    AND output_quantity <> 'Infinity'::numeric
    AND output_quantity <> '-Infinity'::numeric
  ),
  CONSTRAINT production_recipe_specs_status_check CHECK (
    status IN ('needs_review', 'active', 'inactive')
  ),
  CONSTRAINT production_recipe_specs_active_output_check CHECK (
    status <> 'active'
    OR (
      output_unit_id IS NOT NULL
      AND output_to_base_factor > 0
      AND output_unit_code IS NOT NULL
    )
  ),
  CONSTRAINT production_recipe_specs_output_unit_tenant_fkey
    FOREIGN KEY (output_unit_id, tenant_id)
    REFERENCES public.units(id, tenant_id) ON DELETE RESTRICT
);

CREATE INDEX production_recipe_specs_tenant_status_idx
  ON public.production_recipe_specs (tenant_id, status, finished_good_id);

ALTER TABLE public.production_recipe_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_recipe_specs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.production_recipe_specs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.production_recipe_specs TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.production_recipe_specs_id_seq TO service_role;

CREATE POLICY production_recipe_specs_select
ON public.production_recipe_specs
FOR SELECT TO authenticated
USING (
  tenant_id = (SELECT public.auth_tenant_id())
  AND public.is_inventory_production_operator()
);

ALTER TABLE public.production_recipes
  ADD COLUMN recipe_spec_id bigint;

INSERT INTO public.production_recipe_specs (
  tenant_id,
  finished_good_id,
  output_quantity,
  output_unit_id,
  output_to_base_factor,
  output_unit_code,
  status
)
SELECT
  recipe.tenant_id,
  recipe.finished_good_id,
  MIN(recipe.output_quantity),
  valid_output.unit_id,
  valid_output.to_base_factor,
  valid_output.unit_code,
  'needs_review'
FROM public.production_recipes AS recipe
JOIN public.ingredients AS finished_good
  ON finished_good.id = recipe.finished_good_id
 AND finished_good.tenant_id = recipe.tenant_id
LEFT JOIN LATERAL (
  SELECT
    ingredient_unit.unit_id,
    ingredient_unit.to_base_factor,
    unit_row.code AS unit_code
  FROM public.ingredient_units AS ingredient_unit
  JOIN public.units AS unit_row
    ON unit_row.id = ingredient_unit.unit_id
   AND unit_row.tenant_id = ingredient_unit.tenant_id
   AND unit_row.is_active IS TRUE
  WHERE ingredient_unit.tenant_id = finished_good.tenant_id
    AND ingredient_unit.ingredient_id = finished_good.id
    AND ingredient_unit.unit_id = finished_good.production_unit_id
    AND ingredient_unit.is_active IS TRUE
  LIMIT 1
) AS valid_output ON TRUE
GROUP BY
  recipe.tenant_id,
  recipe.finished_good_id,
  valid_output.unit_id,
  valid_output.to_base_factor,
  valid_output.unit_code;

UPDATE public.production_recipes AS recipe
SET recipe_spec_id = spec.id
FROM public.production_recipe_specs AS spec
WHERE spec.tenant_id = recipe.tenant_id
  AND spec.finished_good_id = recipe.finished_good_id;

ALTER TABLE public.production_recipes
  ALTER COLUMN recipe_spec_id SET NOT NULL,
  ADD CONSTRAINT production_recipes_recipe_spec_fkey
    FOREIGN KEY (recipe_spec_id)
    REFERENCES public.production_recipe_specs(id) ON DELETE CASCADE;

CREATE INDEX production_recipes_recipe_spec_idx
  ON public.production_recipes (tenant_id, recipe_spec_id, ingredient_id);

DROP TRIGGER IF EXISTS enforce_production_recipe_entry_unit_role
  ON public.production_recipes;

CREATE TABLE public.production_run_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  production_run_id bigint NOT NULL
    REFERENCES public.production_runs(id) ON DELETE CASCADE,
  ingredient_id bigint NOT NULL
    REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  planned_quantity numeric(15,3) NOT NULL,
  actual_quantity numeric(15,3),
  entry_unit_id bigint NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
  entry_to_base_factor numeric(18,12) NOT NULL,
  entry_unit_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT production_run_lines_run_ingredient_key
    UNIQUE (production_run_id, ingredient_id),
  CONSTRAINT production_run_lines_planned_quantity_check CHECK (
    planned_quantity > 0
    AND planned_quantity <> 'NaN'::numeric
    AND planned_quantity <> 'Infinity'::numeric
    AND planned_quantity <> '-Infinity'::numeric
  ),
  CONSTRAINT production_run_lines_actual_quantity_check CHECK (
    actual_quantity IS NULL
    OR (
      actual_quantity >= 0
      AND actual_quantity <> 'NaN'::numeric
      AND actual_quantity <> 'Infinity'::numeric
      AND actual_quantity <> '-Infinity'::numeric
    )
  ),
  CONSTRAINT production_run_lines_ingredient_unit_fkey
    FOREIGN KEY (ingredient_id, entry_unit_id, tenant_id)
    REFERENCES public.ingredient_units(ingredient_id, unit_id, tenant_id)
    ON DELETE RESTRICT
);

CREATE INDEX production_run_lines_tenant_run_idx
  ON public.production_run_lines (tenant_id, production_run_id, ingredient_id);

ALTER TABLE public.production_run_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_run_lines FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.production_run_lines FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.production_run_lines TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.production_run_lines_id_seq TO service_role;

CREATE POLICY production_run_lines_select
ON public.production_run_lines
FOR SELECT TO authenticated
USING (
  tenant_id = (SELECT public.auth_tenant_id())
  AND public.is_inventory_production_operator()
);

ALTER TABLE public.production_runs
  ADD COLUMN recipe_spec_id bigint
    REFERENCES public.production_recipe_specs(id) ON DELETE RESTRICT,
  ADD COLUMN recipe_output_quantity numeric(15,3),
  ADD COLUMN cancel_reason text;

ALTER TABLE public.production_runs
  ADD CONSTRAINT production_runs_recipe_output_quantity_check CHECK (
    recipe_output_quantity IS NULL
    OR (
      recipe_output_quantity > 0
      AND recipe_output_quantity <> 'NaN'::numeric
      AND recipe_output_quantity <> 'Infinity'::numeric
      AND recipe_output_quantity <> '-Infinity'::numeric
    )
  );

CREATE INDEX production_runs_recipe_spec_idx
  ON public.production_runs (tenant_id, recipe_spec_id, created_at DESC);

DROP TRIGGER IF EXISTS enforce_production_run_entry_unit_role
  ON public.production_runs;

CREATE OR REPLACE FUNCTION private.enforce_stock_movement_unit_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_expected_unit_id bigint;
BEGIN
  IF NEW.type IN ('production_consumption', 'production_output') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.ingredient_units AS ingredient_unit
      JOIN public.units AS unit_row
        ON unit_row.id = ingredient_unit.unit_id
       AND unit_row.tenant_id = ingredient_unit.tenant_id
       AND unit_row.is_active IS TRUE
      WHERE ingredient_unit.tenant_id = NEW.tenant_id
        AND ingredient_unit.ingredient_id = NEW.ingredient_id
        AND ingredient_unit.unit_id = NEW.entry_unit_id
        AND ingredient_unit.is_active IS TRUE
    ) THEN
      RAISE EXCEPTION 'inventory_unit_not_active_for_ingredient'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  SELECT CASE
    WHEN NEW.type IN ('grn_receipt', 'grn_amend', 'supplier_return')
      THEN ingredient.receipt_unit_id
    ELSE ingredient.issue_unit_id
  END
  INTO v_expected_unit_id
  FROM public.ingredients AS ingredient
  WHERE ingredient.tenant_id = NEW.tenant_id
    AND ingredient.id = NEW.ingredient_id;

  IF v_expected_unit_id IS NULL
     OR NEW.entry_unit_id IS DISTINCT FROM v_expected_unit_id THEN
    RAISE EXCEPTION 'inventory_unit_role_mismatch:%',
      CASE
        WHEN NEW.type IN ('grn_receipt', 'grn_amend', 'supplier_return')
          THEN 'receipt'
        ELSE 'issue'
      END
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.upsert_production_recipe_lines(
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
      AND ingredient.item_kind = 'raw_material'
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

CREATE FUNCTION public.bulk_import_production_recipe_specs(p_groups jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_group jsonb;
  v_result jsonb;
  v_recipe_count integer := 0;
  v_line_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF jsonb_typeof(p_groups) <> 'array' OR jsonb_array_length(p_groups) = 0 THEN
    RAISE EXCEPTION 'invalid_group_shape' USING ERRCODE = '22023';
  END IF;
  IF (
    SELECT count(*) <> count(DISTINCT item.value ->> 'finished_good_id')
    FROM jsonb_array_elements(p_groups) AS item(value)
  ) THEN
    RAISE EXCEPTION 'duplicate_finished_good' USING ERRCODE = '23505';
  END IF;

  FOR v_group IN
    SELECT item.value FROM jsonb_array_elements(p_groups) AS item(value)
  LOOP
    v_result := public.upsert_production_recipe_lines(
      nullif(v_group ->> 'finished_good_id', '')::bigint,
      nullif(v_group ->> 'output_quantity', '')::numeric,
      nullif(v_group ->> 'output_unit_id', '')::bigint,
      v_group -> 'lines'
    );
    v_recipe_count := v_recipe_count + 1;
    v_line_count := v_line_count + coalesce((v_result ->> 'line_count')::integer, 0);
  END LOOP;

  RETURN jsonb_build_object('recipes', v_recipe_count, 'lines', v_line_count);
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_import_production_recipe_specs(jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_import_production_recipe_specs(jsonb)
  TO authenticated, service_role;

CREATE FUNCTION public.set_production_recipe_status(
  p_recipe_spec_id bigint,
  p_status text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_inventory_production_operator()
     OR NOT public.has_permission_any('inventory:production_confirm') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('active', 'inactive') THEN
    RAISE EXCEPTION 'recipe_status_invalid' USING ERRCODE = '22023';
  END IF;

  UPDATE public.production_recipe_specs AS spec
  SET status = p_status, updated_at = now()
  WHERE spec.id = p_recipe_spec_id
    AND spec.tenant_id = v_tenant
    AND (
      p_status = 'inactive'
      OR (
        spec.output_unit_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.production_recipes AS recipe
          WHERE recipe.recipe_spec_id = spec.id
        )
      )
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recipe_not_ready' USING ERRCODE = '23514';
  END IF;
  RETURN jsonb_build_object('recipe_spec_id', p_recipe_spec_id, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.set_production_recipe_status(bigint, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_production_recipe_status(bigint, text)
  TO authenticated, service_role;

CREATE FUNCTION public.create_production_run(
  p_branch_id bigint,
  p_recipe_spec_id bigint,
  p_planned_quantity numeric,
  p_source_location_id bigint DEFAULT NULL,
  p_target_location_id bigint DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_uid uuid := auth.uid();
  v_spec record;
  v_source_location_id bigint := p_source_location_id;
  v_target_location_id bigint := p_target_location_id;
  v_run_id bigint;
  v_number text;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_inventory_production_operator()
     OR NOT public.has_permission(p_branch_id, 'inventory:production_create') THEN
    RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
  END IF;
  IF p_planned_quantity IS NULL OR p_planned_quantity <= 0
     OR p_planned_quantity IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) THEN
    RAISE EXCEPTION 'planned_quantity_invalid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.branches AS branch
    WHERE branch.tenant_id = v_tenant
      AND branch.id = p_branch_id
      AND branch.branch_kind = 'central_kitchen'
      AND branch.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'production_site_invalid' USING ERRCODE = '42501';
  END IF;

  SELECT spec.* INTO v_spec
  FROM public.production_recipe_specs AS spec
  WHERE spec.tenant_id = v_tenant
    AND spec.id = p_recipe_spec_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recipe_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_spec.status <> 'active' THEN
    RAISE EXCEPTION 'recipe_not_active' USING ERRCODE = '23514';
  END IF;

  IF v_source_location_id IS NULL THEN
    SELECT location.id INTO v_source_location_id
    FROM public.inventory_locations AS location
    WHERE location.tenant_id = v_tenant
      AND location.branch_id = p_branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE
    ORDER BY location.is_default_issue DESC, location.sort_order, location.id
    LIMIT 1;
  END IF;
  IF v_target_location_id IS NULL THEN
    v_target_location_id := v_source_location_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_locations AS location
    WHERE location.tenant_id = v_tenant
      AND location.branch_id = p_branch_id
      AND location.id = v_source_location_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'production_source_location_invalid' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_locations AS location
    WHERE location.tenant_id = v_tenant
      AND location.branch_id = p_branch_id
      AND location.id = v_target_location_id
      AND location.location_kind IN ('warehouse', 'production_storage')
      AND location.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'production_target_location_invalid' USING ERRCODE = '23514';
  END IF;

  v_number := public.next_inventory_doc_number(v_tenant, 'production');
  INSERT INTO public.production_runs (
    tenant_id, production_number, branch_id, source_location_id,
    target_branch_id, target_location_id, finished_good_id,
    recipe_spec_id, recipe_output_quantity, planned_quantity,
    entry_unit_id, entry_to_base_factor, entry_unit_code,
    notes, created_by, status, ingredients_override
  ) VALUES (
    v_tenant, v_number, p_branch_id, v_source_location_id,
    p_branch_id, v_target_location_id, v_spec.finished_good_id,
    v_spec.id, v_spec.output_quantity, p_planned_quantity,
    v_spec.output_unit_id, v_spec.output_to_base_factor, v_spec.output_unit_code,
    nullif(pg_catalog.btrim(p_notes), ''), v_uid, 'draft', NULL
  ) RETURNING id INTO v_run_id;

  INSERT INTO public.production_run_lines (
    tenant_id, production_run_id, ingredient_id, planned_quantity,
    entry_unit_id, entry_to_base_factor, entry_unit_code
  )
  SELECT
    recipe.tenant_id,
    v_run_id,
    recipe.ingredient_id,
    (p_planned_quantity / v_spec.output_quantity) * recipe.quantity,
    recipe.entry_unit_id,
    recipe.entry_to_base_factor,
    recipe.entry_unit_code
  FROM public.production_recipes AS recipe
  WHERE recipe.tenant_id = v_tenant
    AND recipe.recipe_spec_id = v_spec.id
  ORDER BY recipe.ingredient_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recipe_has_no_lines' USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object(
    'production_run_id', v_run_id,
    'production_number', v_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_production_run(bigint, bigint, numeric, bigint, bigint, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_production_run(bigint, bigint, numeric, bigint, bigint, text)
  TO authenticated, service_role;

CREATE FUNCTION public.start_production_run(
  p_run_id bigint,
  p_branch_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_inventory_production_operator()
     OR NOT public.has_permission(p_branch_id, 'inventory:production_confirm') THEN
    RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
  END IF;
  UPDATE public.production_runs AS run
  SET status = 'in_progress', started_at = now(), updated_at = now()
  WHERE run.tenant_id = v_tenant
    AND run.id = p_run_id
    AND run.branch_id = p_branch_id
    AND run.status = 'draft';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'production_transition_invalid' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('production_run_id', p_run_id, 'status', 'in_progress');
END;
$$;

REVOKE ALL ON FUNCTION public.start_production_run(bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_production_run(bigint, bigint)
  TO authenticated, service_role;

CREATE FUNCTION public.cancel_production_run(
  p_run_id bigint,
  p_branch_id bigint,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_inventory_production_operator()
     OR NOT public.has_permission(p_branch_id, 'inventory:production_confirm') THEN
    RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
  END IF;
  UPDATE public.production_runs AS run
  SET status = 'cancelled', cancel_reason = nullif(pg_catalog.btrim(p_reason), ''),
      updated_at = now()
  WHERE run.tenant_id = v_tenant
    AND run.id = p_run_id
    AND run.branch_id = p_branch_id
    AND run.status IN ('draft', 'in_progress');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'production_transition_invalid' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('production_run_id', p_run_id, 'status', 'cancelled');
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_production_run(bigint, bigint, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_production_run(bigint, bigint, text)
  TO authenticated, service_role;

CREATE FUNCTION public.complete_production_run(
  p_run_id bigint,
  p_branch_id bigint,
  p_actual_quantity numeric,
  p_actual_ingredients jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_uid uuid := auth.uid();
  v_run record;
  v_item jsonb;
  v_ingredient_id bigint;
  v_actual numeric;
  v_actual_total_base numeric;
  v_output_base numeric;
  v_input_value numeric(20,4);
  v_output_unit_cost numeric(15,2);
  v_old_output_qty numeric;
  v_old_output_wac numeric;
  v_new_output_qty numeric;
  v_shortages jsonb;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_inventory_production_operator()
     OR NOT public.has_permission(p_branch_id, 'inventory:production_confirm') THEN
    RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
  END IF;
  IF p_actual_quantity IS NULL OR p_actual_quantity <= 0
     OR p_actual_quantity IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) THEN
    RAISE EXCEPTION 'actual_output_invalid' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_actual_ingredients) <> 'array' THEN
    RAISE EXCEPTION 'actual_payload_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT run.* INTO v_run
  FROM public.production_runs AS run
  JOIN public.branches AS branch
    ON branch.id = run.branch_id
   AND branch.tenant_id = run.tenant_id
   AND branch.branch_kind = 'central_kitchen'
   AND branch.is_active IS TRUE
  WHERE run.tenant_id = v_tenant
    AND run.id = p_run_id
    AND run.branch_id = p_branch_id
  FOR UPDATE OF run;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'production_run_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_run.status <> 'in_progress' THEN
    RAISE EXCEPTION 'production_transition_invalid' USING ERRCODE = '22023';
  END IF;
  IF v_run.target_branch_id <> v_run.branch_id THEN
    RAISE EXCEPTION 'production_site_invalid' USING ERRCODE = '42501';
  END IF;

  IF jsonb_array_length(p_actual_ingredients) <> (
    SELECT count(*) FROM public.production_run_lines AS line
    WHERE line.tenant_id = v_tenant AND line.production_run_id = p_run_id
  ) OR (
    SELECT count(DISTINCT item.value ->> 'ingredientId')
    FROM jsonb_array_elements(p_actual_ingredients) AS item(value)
  ) <> jsonb_array_length(p_actual_ingredients) THEN
    RAISE EXCEPTION 'actual_payload_invalid' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN
    SELECT item.value FROM jsonb_array_elements(p_actual_ingredients) AS item(value)
  LOOP
    BEGIN
      v_ingredient_id := nullif(v_item ->> 'ingredientId', '')::bigint;
      v_actual := nullif(v_item ->> 'actualQuantity', '')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'actual_payload_invalid' USING ERRCODE = '22023';
    END;
    IF v_ingredient_id IS NULL OR v_actual IS NULL OR v_actual < 0
       OR v_actual IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) THEN
      RAISE EXCEPTION 'actual_payload_invalid' USING ERRCODE = '22023';
    END IF;

    UPDATE public.production_run_lines AS line
    SET actual_quantity = v_actual, updated_at = now()
    WHERE line.tenant_id = v_tenant
      AND line.production_run_id = p_run_id
      AND line.ingredient_id = v_ingredient_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'actual_payload_invalid' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF (
    SELECT count(*)
    FROM public.production_run_lines AS line
    WHERE line.tenant_id = v_tenant
      AND line.production_run_id = p_run_id
      AND line.actual_quantity IS NOT NULL
  ) <> jsonb_array_length(p_actual_ingredients) THEN
    RAISE EXCEPTION 'actual_payload_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(sum(line.actual_quantity * line.entry_to_base_factor), 0)
  INTO v_actual_total_base
  FROM public.production_run_lines AS line
  WHERE line.tenant_id = v_tenant
    AND line.production_run_id = p_run_id;
  IF v_actual_total_base <= 0 THEN
    RAISE EXCEPTION 'actual_consumption_zero' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.stock_levels (
    tenant_id, branch_id, location_id, ingredient_id, current_quantity
  )
  SELECT v_tenant, v_run.branch_id, v_run.source_location_id,
         line.ingredient_id, 0
  FROM public.production_run_lines AS line
  WHERE line.tenant_id = v_tenant
    AND line.production_run_id = p_run_id
  UNION ALL
  SELECT v_tenant, v_run.branch_id, v_run.target_location_id,
         v_run.finished_good_id, 0
  ON CONFLICT ON CONSTRAINT stock_levels_ingredient_branch_location_tenant_key
  DO NOTHING;

  PERFORM 1
  FROM public.stock_levels AS stock
  WHERE stock.tenant_id = v_tenant
    AND stock.branch_id = v_run.branch_id
    AND (
      (stock.location_id = v_run.source_location_id AND EXISTS (
        SELECT 1 FROM public.production_run_lines AS line
        WHERE line.production_run_id = p_run_id
          AND line.ingredient_id = stock.ingredient_id
      ))
      OR (stock.location_id = v_run.target_location_id
          AND stock.ingredient_id = v_run.finished_good_id)
    )
  ORDER BY stock.ingredient_id, stock.location_id
  FOR UPDATE;

  WITH shortage AS (
    SELECT
      line.ingredient_id,
      ingredient.name AS ingredient_name,
      line.entry_unit_code AS unit,
      line.actual_quantity AS needed,
      stock.current_quantity / line.entry_to_base_factor AS on_hand
    FROM public.production_run_lines AS line
    JOIN public.ingredients AS ingredient
      ON ingredient.id = line.ingredient_id
     AND ingredient.tenant_id = line.tenant_id
    JOIN public.stock_levels AS stock
      ON stock.tenant_id = line.tenant_id
     AND stock.branch_id = v_run.branch_id
     AND stock.location_id = v_run.source_location_id
     AND stock.ingredient_id = line.ingredient_id
    WHERE line.tenant_id = v_tenant
      AND line.production_run_id = p_run_id
      AND stock.current_quantity < line.actual_quantity * line.entry_to_base_factor
    ORDER BY line.ingredient_id
    LIMIT 20
  )
  SELECT coalesce(jsonb_agg(to_jsonb(shortage)), '[]'::jsonb)
  INTO v_shortages
  FROM shortage;
  IF jsonb_array_length(v_shortages) > 0 THEN
    RAISE EXCEPTION 'insufficient_stock_for_production'
      USING ERRCODE = 'P0001', DETAIL = v_shortages::text;
  END IF;

  SELECT coalesce(sum(
    line.actual_quantity
      * line.entry_to_base_factor
      * coalesce(stock.avg_unit_cost, ingredient.unit_cost, 0)
  ), 0)
  INTO v_input_value
  FROM public.production_run_lines AS line
  JOIN public.ingredients AS ingredient
    ON ingredient.tenant_id = line.tenant_id
   AND ingredient.id = line.ingredient_id
  JOIN public.stock_levels AS stock
    ON stock.tenant_id = line.tenant_id
   AND stock.branch_id = v_run.branch_id
   AND stock.location_id = v_run.source_location_id
   AND stock.ingredient_id = line.ingredient_id
  WHERE line.tenant_id = v_tenant
    AND line.production_run_id = p_run_id;

  FOR v_ingredient_id, v_actual IN
    SELECT line.ingredient_id, line.actual_quantity
    FROM public.production_run_lines AS line
    WHERE line.tenant_id = v_tenant
      AND line.production_run_id = p_run_id
      AND line.actual_quantity > 0
    ORDER BY line.ingredient_id
  LOOP
    INSERT INTO public.stock_movements (
      tenant_id, branch_id, location_id, ingredient_id, type,
      quantity_change, reason, created_by, production_run_id, unit_cost,
      entry_unit_id, entry_quantity, entry_to_base_factor, entry_unit_code
    )
    SELECT
      v_tenant, v_run.branch_id, v_run.source_location_id, line.ingredient_id,
      'production_consumption',
      -(line.actual_quantity * line.entry_to_base_factor),
      'Production ' || v_run.production_number,
      v_uid, p_run_id, coalesce(stock.avg_unit_cost, ingredient.unit_cost, 0),
      line.entry_unit_id, line.actual_quantity,
      line.entry_to_base_factor, line.entry_unit_code
    FROM public.production_run_lines AS line
    JOIN public.ingredients AS ingredient
      ON ingredient.tenant_id = line.tenant_id
     AND ingredient.id = line.ingredient_id
    JOIN public.stock_levels AS stock
      ON stock.tenant_id = line.tenant_id
     AND stock.branch_id = v_run.branch_id
     AND stock.location_id = v_run.source_location_id
     AND stock.ingredient_id = line.ingredient_id
    WHERE line.tenant_id = v_tenant
      AND line.production_run_id = p_run_id
      AND line.ingredient_id = v_ingredient_id;
  END LOOP;

  v_output_base := p_actual_quantity * v_run.entry_to_base_factor;
  v_output_unit_cost := round(v_input_value / v_output_base, 2);
  SELECT stock.current_quantity, coalesce(stock.avg_unit_cost, 0)
  INTO v_old_output_qty, v_old_output_wac
  FROM public.stock_levels AS stock
  WHERE stock.tenant_id = v_tenant
    AND stock.branch_id = v_run.branch_id
    AND stock.location_id = v_run.target_location_id
    AND stock.ingredient_id = v_run.finished_good_id;

  INSERT INTO public.stock_movements (
    tenant_id, branch_id, location_id, ingredient_id, type,
    quantity_change, reason, created_by, production_run_id, unit_cost,
    entry_unit_id, entry_quantity, entry_to_base_factor, entry_unit_code
  ) VALUES (
    v_tenant, v_run.branch_id, v_run.target_location_id, v_run.finished_good_id,
    'production_output', v_output_base,
    'Production ' || v_run.production_number,
    v_uid, p_run_id, v_output_unit_cost,
    v_run.entry_unit_id, p_actual_quantity,
    v_run.entry_to_base_factor, v_run.entry_unit_code
  );

  v_new_output_qty := v_old_output_qty + v_output_base;
  UPDATE public.stock_levels AS stock
  SET avg_unit_cost = CASE
        WHEN v_new_output_qty > 0 THEN
          ((v_old_output_qty * v_old_output_wac) + v_input_value) / v_new_output_qty
        ELSE v_output_unit_cost
      END,
      updated_at = now()
  WHERE stock.tenant_id = v_tenant
    AND stock.branch_id = v_run.branch_id
    AND stock.location_id = v_run.target_location_id
    AND stock.ingredient_id = v_run.finished_good_id;

  UPDATE public.ingredients AS ingredient
  SET unit_cost = v_output_unit_cost, updated_at = now()
  WHERE ingredient.tenant_id = v_tenant
    AND ingredient.id = v_run.finished_good_id;

  UPDATE public.production_runs AS run
  SET status = 'completed', actual_quantity = p_actual_quantity,
      completed_at = now(), updated_at = now()
  WHERE run.tenant_id = v_tenant AND run.id = p_run_id;

  RETURN jsonb_build_object(
    'production_run_id', p_run_id,
    'status', 'completed',
    'actual_quantity', p_actual_quantity,
    'output_quantity_base', v_output_base,
    'input_value', v_input_value,
    'unit_cost', v_output_unit_cost
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_production_run(bigint, bigint, numeric, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_production_run(bigint, bigint, numeric, jsonb)
  TO authenticated, service_role;

-- Legacy writers stay callable only to return a stable maintenance failure during cutover.
CREATE OR REPLACE FUNCTION public.create_production_run_with_locations(
  p_branch_id bigint,
  p_finished_good_id bigint,
  p_planned_quantity numeric,
  p_entry_unit_id bigint,
  p_notes text DEFAULT NULL,
  p_target_branch_id bigint DEFAULT NULL,
  p_ingredients_override jsonb DEFAULT NULL,
  p_source_location_id bigint DEFAULT NULL,
  p_target_location_id bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$ BEGIN
  PERFORM auth.role();
  RAISE EXCEPTION 'production_maintenance_legacy_rpc' USING ERRCODE = '55000';
END; $$;

CREATE OR REPLACE FUNCTION public.confirm_production_run(
  p_run_id bigint,
  p_actual_quantity numeric DEFAULT NULL,
  p_actual_ingredients jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$ BEGIN
  PERFORM auth.role();
  RAISE EXCEPTION 'production_maintenance_legacy_rpc' USING ERRCODE = '55000';
END; $$;

CREATE OR REPLACE FUNCTION public.start_production_run(p_run_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$ BEGIN
  PERFORM auth.role();
  RAISE EXCEPTION 'production_maintenance_legacy_rpc' USING ERRCODE = '55000';
END; $$;

CREATE OR REPLACE FUNCTION public.cancel_production_run(p_run_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$ BEGIN
  PERFORM auth.role();
  RAISE EXCEPTION 'production_maintenance_legacy_rpc' USING ERRCODE = '55000';
END; $$;

CREATE OR REPLACE FUNCTION public.upsert_production_recipe_lines(
  p_finished_good_id bigint,
  p_lines jsonb,
  p_output_quantity numeric,
  p_old_finished_good_id bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$ BEGIN
  PERFORM auth.role();
  RAISE EXCEPTION 'production_maintenance_legacy_rpc' USING ERRCODE = '55000';
END; $$;

CREATE OR REPLACE FUNCTION public.record_production_run(
  p_branch_id bigint,
  p_finished_good_id bigint,
  p_planned_quantity numeric,
  p_entry_unit_id bigint,
  p_actual_quantity numeric,
  p_notes text DEFAULT NULL,
  p_target_branch_id bigint DEFAULT NULL,
  p_actual_ingredients jsonb DEFAULT NULL,
  p_source_location_id bigint DEFAULT NULL,
  p_target_location_id bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$ BEGIN
  PERFORM auth.role();
  RAISE EXCEPTION 'production_maintenance_legacy_rpc' USING ERRCODE = '55000';
END; $$;

CREATE OR REPLACE FUNCTION public.get_production_recipe_context_for_location(
  p_finished_good_id bigint,
  p_branch_id bigint,
  p_source_location_id bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$ BEGIN
  PERFORM auth.role();
  RAISE EXCEPTION 'production_maintenance_legacy_rpc' USING ERRCODE = '55000';
END; $$;
