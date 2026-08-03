\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_signature constant text :=
    'public.create_purchase_orders_from_request(bigint,jsonb)';
BEGIN
  IF to_regprocedure(v_signature) IS NULL THEN
    RAISE EXCEPTION 'PURCHASE ORDER RPC: bulk function missing';
  END IF;

  IF has_function_privilege('anon', v_signature, 'EXECUTE')
     OR has_function_privilege(
       'authenticated',
       v_signature,
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       v_signature,
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'PURCHASE ORDER RPC: grants invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = to_regprocedure(v_signature)
      AND procedure.prosecdef IS TRUE
      AND procedure.proconfig @> ARRAY['search_path=""']::text[]
  ) THEN
    RAISE EXCEPTION 'PURCHASE ORDER RPC: security contract invalid';
  END IF;
END;
$$;

ROLLBACK;
