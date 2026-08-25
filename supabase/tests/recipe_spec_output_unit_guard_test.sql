\set ON_ERROR_STOP on

BEGIN;

-- Recipe-spec output units must be protected from ladder edits: deleting or
-- deactivating an ingredient_units row still referenced by
-- production_recipe_specs.output_unit_id raises
-- ingredient_unit_in_use_by_recipe_spec, and save_ingredient_catalog carries
-- the same early guard.
DO $$
DECLARE
  v_tenant bigint;
  v_unit_a bigint;
  v_unit_b bigint;
  v_unit_b_code text;
  v_ingredient bigint;
  v_blocked boolean;
  v_definition text;
  v_suffix text := pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 8);
BEGIN
  SELECT profile.tenant_id
  INTO v_tenant
  FROM public.profiles AS profile
  ORDER BY profile.created_at, profile.id
  LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'RECIPE SPEC GUARD: seeded tenant is required';
  END IF;

  SELECT agg.unit_ids[1], agg.unit_ids[2]
  INTO v_unit_a, v_unit_b
  FROM (
    SELECT array_agg(picked.id ORDER BY picked.id) AS unit_ids
    FROM (
      SELECT u.id
      FROM public.units AS u
      WHERE u.tenant_id = v_tenant
        AND u.is_active
      ORDER BY u.id
      LIMIT 2
    ) AS picked
  ) AS agg;
  IF v_unit_a IS NULL OR v_unit_b IS NULL THEN
    RAISE EXCEPTION 'RECIPE SPEC GUARD: two seeded units are required';
  END IF;

  SELECT u.code INTO v_unit_b_code
  FROM public.units AS u
  WHERE u.tenant_id = v_tenant AND u.id = v_unit_b;

  INSERT INTO public.ingredients (
    tenant_id, name, item_kind, storage_type, receipt_unit_id, issue_unit_id
  ) VALUES (
    v_tenant, '__recipe_spec_guard_' || v_suffix, 'finished_good', 'ambient',
    v_unit_a, v_unit_a
  ) RETURNING id INTO v_ingredient;

  INSERT INTO public.ingredient_units (
    tenant_id, ingredient_id, unit_id, to_base_factor, is_base, sort_order
  ) VALUES
    (v_tenant, v_ingredient, v_unit_a, 1, TRUE, 0),
    (v_tenant, v_ingredient, v_unit_b, 2, FALSE, 1);

  INSERT INTO public.production_recipe_specs (
    tenant_id, finished_good_id, output_quantity, output_unit_id,
    output_to_base_factor, output_unit_code, status
  ) VALUES (
    v_tenant, v_ingredient, 1, v_unit_b, 2, v_unit_b_code, 'active'
  );

  -- (a) Deleting the spec output unit is rejected.
  v_blocked := FALSE;
  BEGIN
    DELETE FROM public.ingredient_units
    WHERE tenant_id = v_tenant
      AND ingredient_id = v_ingredient
      AND unit_id = v_unit_b;
  EXCEPTION
    WHEN foreign_key_violation THEN
      IF SQLERRM = 'ingredient_unit_in_use_by_recipe_spec' THEN
        v_blocked := TRUE;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RECIPE SPEC GUARD: spec output unit delete was not rejected';
  END IF;

  -- (b) Deactivating the spec output unit is rejected.
  v_blocked := FALSE;
  BEGIN
    UPDATE public.ingredient_units
    SET is_active = FALSE
    WHERE tenant_id = v_tenant
      AND ingredient_id = v_ingredient
      AND unit_id = v_unit_b;
  EXCEPTION
    WHEN foreign_key_violation THEN
      IF SQLERRM = 'ingredient_unit_in_use_by_recipe_spec' THEN
        v_blocked := TRUE;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RECIPE SPEC GUARD: spec output unit deactivation was not rejected';
  END IF;

  -- (c) Unreferenced units stay deletable (negative control).
  DELETE FROM public.ingredient_units
  WHERE tenant_id = v_tenant
    AND ingredient_id = v_ingredient
    AND unit_id = v_unit_a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RECIPE SPEC GUARD: unreferenced unit delete regressed';
  END IF;

  -- (d) Catalog RPC carries the early spec-output guard in its body.
  SELECT pg_get_functiondef(
    'public.save_ingredient_catalog(bigint,text,text,bigint,text,text,numeric,numeric,numeric,integer,jsonb,text,bigint,bigint,bigint,boolean,boolean)'::regprocedure
  ) INTO v_definition;
  IF position('ingredient_unit_in_use_by_recipe_spec' IN v_definition) = 0
     OR position('production_recipe_specs AS spec' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'RECIPE SPEC GUARD: save_ingredient_catalog guard missing';
  END IF;
END;
$$;

ROLLBACK;
