-- Contract drift checks for scan_order_delay_sla.
-- Run after active migrations on a non-production database.

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_definition text;
BEGIN
  IF to_regprocedure('public.scan_order_delay_sla()') IS NULL THEN
    RAISE EXCEPTION 'scan_order_delay_sla_missing';
  END IF;

  IF pg_get_function_result('public.scan_order_delay_sla()'::regprocedure) <> 'bigint' THEN
    RAISE EXCEPTION 'scan_order_delay_sla_return_type_drift';
  END IF;

  SELECT pg_get_functiondef('public.scan_order_delay_sla()'::regprocedure)
  INTO v_definition;

  IF position('order.delay_sla_breach' IN v_definition) = 0
     OR position('workflow.sla:order:%s:kds_ready' IN v_definition) = 0
     OR position('owner' IN v_definition) = 0
     OR position('branch_manager' IN v_definition) = 0
     OR position('interval ''15 minutes''' IN v_definition) = 0
     OR position('''ready'', ''served''' IN v_definition) = 0
     OR position('ON CONFLICT' IN v_definition) = 0
     OR position('expires_at' IN v_definition) = 0
  THEN
    RAISE EXCEPTION 'scan_order_delay_sla_contract_drift';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.scan_order_delay_sla()',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.scan_order_delay_sla()',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.scan_order_delay_sla()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'scan_order_delay_sla_acl_drift';
  END IF;
END;
$$;

ROLLBACK;
