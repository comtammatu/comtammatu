BEGIN;

CREATE OR REPLACE FUNCTION public.create_production_run(
  p_branch_id bigint,
  p_finished_good_id bigint,
  p_planned_quantity numeric,
  p_entry_unit_id bigint,
  p_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT public.create_production_run(
    p_branch_id,
    p_finished_good_id,
    p_planned_quantity,
    p_entry_unit_id,
    p_notes,
    p_branch_id,
    NULL::jsonb
  );
$function$;

REVOKE ALL ON FUNCTION public.create_production_run(
  bigint,
  bigint,
  numeric,
  bigint,
  text
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_production_run(
  bigint,
  bigint,
  numeric,
  bigint,
  text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_production_run(
  bigint,
  bigint,
  numeric,
  bigint,
  text
) TO service_role;

COMMIT;
