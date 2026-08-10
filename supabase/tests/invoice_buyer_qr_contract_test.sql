-- Run against a non-production database after the receipt-QR migration.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/invoice_buyer_qr_contract_test.sql

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_prepare_definition text;
  v_claim_definition text;
  v_constraint_definition text;
BEGIN
  IF has_table_privilege(
    'anon',
    'public.tax_invoice_buyer_requests',
    'SELECT, INSERT, UPDATE, DELETE'
  ) OR has_table_privilege(
    'authenticated',
    'public.tax_invoice_buyer_requests',
    'SELECT, INSERT, UPDATE, DELETE'
  ) THEN
    RAISE EXCEPTION
      'TEST FAILED: buyer request table is reachable outside service_role';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.submit_invoice_buyer_request_as_system(text,jsonb)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.submit_invoice_buyer_request_as_system(text,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      'TEST FAILED: buyer submit RPC is executable outside service_role';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'public.submit_invoice_buyer_request_as_system(text,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      'TEST FAILED: service_role cannot execute buyer submit RPC';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc function
    JOIN pg_namespace namespace ON namespace.oid = function.pronamespace
    WHERE namespace.nspname = 'public'
      AND function.proname IN (
        'confirm_cash_payment_with_invoice_binding',
        'fetch_tax_invoice_issue_attention',
        'prepare_tax_invoice_provider_submission',
        'queue_tax_invoice_issue_job_for_completed_order',
        'reconcile_tax_invoice_provider_issued',
        'requeue_tax_invoice_issue_job'
      )
      AND has_function_privilege('anon', function.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION
      'TEST FAILED: anon can execute an HĐĐT management RPC';
  END IF;

  SELECT pg_get_constraintdef(oid)
  INTO v_constraint_definition
  FROM pg_constraint
  WHERE conrelid = 'public.tax_invoice_buyer_requests'::regclass
    AND conname = 'tax_invoice_buyer_requests_close_state_check';

  IF v_constraint_definition IS NULL
    OR v_constraint_definition NOT ILIKE '%queue_submitted%'
    OR v_constraint_definition ILIKE '%customer_submitted%'
    OR v_constraint_definition NOT ILIKE '%deadline_elapsed%' THEN
    RAISE EXCEPTION
      'TEST FAILED: terminal buyer request state constraint is missing';
  END IF;

  SELECT pg_get_functiondef(
    'public.prepare_tax_invoice_issue_job_as_system(bigint,bigint,text)'::regprocedure
  )
  INTO v_prepare_definition;

  IF v_prepare_definition !~* (
    'from public\.tax_invoice_buyer_requests request(.|\n)*for update;'
    || '(.|\n)*from public\.tax_invoice_issue_jobs job(.|\n)*for update;'
    || '(.|\n)*from public\.tax_invoices invoice(.|\n)*for update;'
  ) THEN
    RAISE EXCEPTION
      'TEST FAILED: prepare RPC lock order is not buyer request -> job -> invoice';
  END IF;

  SELECT pg_get_functiondef(
    'public.claim_tax_invoice_issue_jobs(integer,integer)'::regprocedure
  )
  INTO v_claim_definition;

  IF v_claim_definition NOT ILIKE '%FOR UPDATE SKIP LOCKED%' THEN
    RAISE EXCEPTION
      'TEST FAILED: issue job batch claim lost SKIP LOCKED';
  END IF;

  RAISE NOTICE
    'TEST PASSED: buyer QR terminal state, privileges, lock order and non-blocking claim are intact';
END;
$$;

ROLLBACK;
