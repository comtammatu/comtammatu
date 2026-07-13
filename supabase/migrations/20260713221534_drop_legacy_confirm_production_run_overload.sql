BEGIN;

REVOKE ALL ON FUNCTION public.confirm_production_run(bigint, numeric)
  FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION public.confirm_production_run(bigint, numeric) RESTRICT;

COMMIT;
