BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.record_production_run(
  p_branch_id bigint,
  p_finished_good_id bigint,
  p_planned_quantity numeric,
  p_entry_unit_id bigint,
  p_actual_quantity numeric,
  p_notes text DEFAULT NULL::text,
  p_target_branch_id bigint DEFAULT NULL::bigint,
  p_actual_ingredients jsonb DEFAULT NULL::jsonb,
  p_source_location_id bigint DEFAULT NULL::bigint,
  p_target_location_id bigint DEFAULT NULL::bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_created jsonb;
  v_run_id bigint;
BEGIN
  IF p_actual_quantity IS NULL OR p_actual_quantity <= 0 THEN
    RAISE EXCEPTION 'invalid_actual_quantity' USING ERRCODE = '22023';
  END IF;

  v_created := public.create_production_run_with_locations(
    p_branch_id,
    p_finished_good_id,
    p_planned_quantity,
    p_entry_unit_id,
    p_notes,
    p_target_branch_id,
    p_actual_ingredients,
    p_source_location_id,
    p_target_location_id
  );
  v_run_id := (v_created ->> 'production_run_id')::bigint;

  IF v_run_id IS NULL THEN
    RAISE EXCEPTION 'production_run_create_failed' USING ERRCODE = 'P0001';
  END IF;

  RETURN public.confirm_production_run(
    v_run_id,
    p_actual_quantity,
    p_actual_ingredients
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_production_run(
  bigint, bigint, numeric, bigint, numeric, text, bigint, jsonb, bigint, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_production_run(
  bigint, bigint, numeric, bigint, numeric, text, bigint, jsonb, bigint, bigint
) TO authenticated, service_role;

COMMIT;
