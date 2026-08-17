\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_function oid := to_regprocedure(
    'public.requeue_invoice_total_mismatch_jobs()'
  );
  v_definition text;
BEGIN
  IF v_function IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc function_row
      WHERE function_row.oid = v_function
        AND function_row.prosecdef
        AND 'search_path=""' = ANY(function_row.proconfig)
    )
    OR has_function_privilege('anon', v_function, 'EXECUTE')
    OR has_function_privilege('service_role', v_function, 'EXECUTE')
    OR NOT has_function_privilege('authenticated', v_function, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'requeue_invoice_total_mismatch_jobs_acl_invalid';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(v_function) INTO v_definition;
  IF v_definition IS NULL
    OR v_definition NOT LIKE '%last_error = ''invoice_total_mismatch''%'
    OR v_definition NOT LIKE '%job.status = ''blocked''%'
    OR v_definition NOT LIKE '%status = ''queued''%'
    OR v_definition NOT LIKE '%invoice.status = ''draft''%'
    OR v_definition NOT LIKE '%tax_invoice_id IS NULL%'
    OR v_definition LIKE '%reconcile_required%'
    OR v_definition LIKE '%Asia/Ho_Chi_Minh%'
    OR v_definition NOT LIKE '%auth_is_owner%'
    OR v_definition NOT LIKE '%has_position(''accountant'')%'
  THEN
    RAISE EXCEPTION 'requeue_invoice_total_mismatch_jobs_contract_invalid';
  END IF;
END
$$;

ROLLBACK;
