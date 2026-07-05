-- =============================================================
-- Regression test: resolve_branch_printer_for_type resolves under service_role
--
-- SePay/MoMo webhooks run confirm_sepay_payment → enqueue_receipt_print as
-- service_role (no user JWT). The resolver used to gate on
-- p_tenant_id = auth_tenant_id(), which is NULL for service_role, so it returned
-- NULL and the webhook receipt was never queued. This locks in the service_role
-- bypass while keeping tenant/branch scoping for authenticated callers.
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/receipt_printer_resolve_service_role_test.sql
--   supabase db query --linked --file supabase/tests/receipt_printer_resolve_service_role_test.sql
-- =============================================================

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_def         TEXT;
  v_tenant      BIGINT;
  v_branch      BIGINT;
  v_resolved    BIGINT;
BEGIN
  -- 1. Definitional guard: the service_role escape must be present.
  SELECT pg_get_functiondef(
    'public.resolve_branch_printer_for_type(bigint,bigint,text)'::regprocedure)
    INTO v_def;
  IF v_def NOT ILIKE '%auth.role() = ''service_role''%' THEN
    RAISE EXCEPTION
      'TEST FAILED: resolve_branch_printer_for_type lost the service_role bypass';
  END IF;

  -- 2. Behavioral guard: pick any tenant/branch with an active receipt printer.
  SELECT p.tenant_id, p.branch_id
    INTO v_tenant, v_branch
  FROM public.printers p
  JOIN public.printer_print_types ppt
    ON ppt.printer_id = p.id
   AND ppt.tenant_id = p.tenant_id
   AND ppt.branch_id = p.branch_id
   AND ppt.print_type = 'receipt'
  WHERE p.is_active = TRUE
  LIMIT 1;

  IF v_tenant IS NULL THEN
    RAISE NOTICE
      'TEST SKIPPED: no active receipt printer fixture in this environment';
    RETURN;
  END IF;

  -- service_role context: no tenant claim, role=service_role → must resolve.
  SET LOCAL request.jwt.claims = '{"role":"service_role"}';
  v_resolved := public.resolve_branch_printer_for_type(v_tenant, v_branch, 'receipt');
  IF v_resolved IS NULL THEN
    RAISE EXCEPTION
      'TEST FAILED: service_role could not resolve receipt printer for tenant % branch %',
      v_tenant, v_branch;
  END IF;

  -- authenticated caller scoped to a different tenant → must still be denied.
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'role', 'authenticated',
      'app_metadata', json_build_object('tenant_id', v_tenant + 1000000)
    )::text,
    true);
  v_resolved := public.resolve_branch_printer_for_type(v_tenant, v_branch, 'receipt');
  IF v_resolved IS NOT NULL THEN
    RAISE EXCEPTION
      'TEST FAILED: cross-tenant authenticated caller resolved a printer (scoping broken)';
  END IF;

  RAISE NOTICE
    'TEST PASSED: service_role resolves receipt printer; authenticated scoping intact';
END;
$$;

ROLLBACK;
