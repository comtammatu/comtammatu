BEGIN;

DROP FUNCTION IF EXISTS public.create_production_run(
  bigint,
  bigint,
  numeric,
  bigint,
  text
);

COMMIT;
