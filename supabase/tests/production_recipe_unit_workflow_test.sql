\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_planned_output numeric := 8;
  v_recipe_output numeric := 8;
  v_recipe_raw numeric := 1;
  v_raw_entry numeric := 500;
  v_raw_factor numeric := 0.001;
  v_definition text;
BEGIN
  IF to_regclass('public.production_recipe_specs') IS NULL THEN
    RAISE EXCEPTION 'production_recipe_specs_missing';
  END IF;
  IF to_regclass('public.production_run_lines') IS NULL THEN
    RAISE EXCEPTION 'production_run_lines_missing';
  END IF;
  IF (v_planned_output / v_recipe_output) * v_recipe_raw <> 1 THEN
    RAISE EXCEPTION 'batch_ratio_regression';
  END IF;
  IF v_raw_entry * v_raw_factor <> 0.5 THEN
    RAISE EXCEPTION 'entry_to_base_regression';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.production_recipe_specs AS spec
    WHERE spec.status = 'active'
      AND (
        spec.output_unit_id IS NULL
        OR spec.output_to_base_factor IS NULL
        OR spec.output_to_base_factor <= 0
      )
  ) THEN
    RAISE EXCEPTION 'active_recipe_without_output_unit';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.production_recipes AS recipe
    LEFT JOIN public.production_recipe_specs AS spec
      ON spec.id = recipe.recipe_spec_id
     AND spec.tenant_id = recipe.tenant_id
    WHERE spec.id IS NULL
  ) THEN
    RAISE EXCEPTION 'recipe_line_without_spec';
  END IF;

  SELECT pg_get_functiondef(
    'public.confirm_production_run(bigint,numeric,jsonb)'::regprocedure
  ) INTO v_definition;
  IF position('production_maintenance_legacy_rpc' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'legacy_confirm_not_fail_closed';
  END IF;

  SELECT pg_get_functiondef(
    'public.record_production_run(bigint,bigint,numeric,bigint,numeric,text,bigint,jsonb,bigint,bigint)'::regprocedure
  ) INTO v_definition;
  IF position('production_maintenance_legacy_rpc' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'legacy_record_not_fail_closed';
  END IF;

  SELECT pg_get_functiondef(
    'public.get_production_recipe_context_for_location(bigint,bigint,bigint)'::regprocedure
  ) INTO v_definition;
  IF position('production_maintenance_legacy_rpc' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'legacy_context_not_fail_closed';
  END IF;

  SELECT pg_get_functiondef(
    'public.complete_production_run(bigint,bigint,numeric,jsonb)'::regprocedure
  ) INTO v_definition;
  IF position('v_run.status <> ''in_progress''' IN v_definition) = 0
     OR position('FOR UPDATE OF run' IN v_definition) = 0
     OR position('line.actual_quantity IS NOT NULL' IN v_definition) = 0
     OR position('DETAIL = v_shortages::text' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'complete_production_run_contract_missing';
  END IF;
END;
$$;

ROLLBACK;
