-- =============================================================
-- Regression test: Supabase Advisor Auth hardening
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/advisor_auth_hardening_test.sql
-- =============================================================

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_policy_count integer;
BEGIN
  SELECT count(*)
  INTO v_policy_count
  FROM pg_policies policy
  WHERE policy.schemaname = 'public'
    AND policy.policyname IN (
      'attendance_consumption_report_lines_select',
      'attendance_consumption_reports_select',
      'profiles_select_authorized',
      'inventory_count_assignments_select',
      'inventory_count_slips_select',
      'leave_requests_select'
    )
    AND policy.qual ~* 'select[[:space:]]+auth[.]uid[[:space:]]*[(]';

  IF v_policy_count <> 6 THEN
    RAISE EXCEPTION
      'TEST FAILED: expected 6 initplan-safe Auth policies, found %',
      v_policy_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'profiles'
      AND policy.policyname = 'profiles_select_self'
  ) THEN
    RAISE EXCEPTION
      'TEST FAILED: redundant profiles_select_self policy still exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'profiles'
      AND policy.policyname = 'profiles_select_authorized'
      AND policy.qual LIKE '%staff:view%'
      AND policy.qual LIKE '%auth_role()%owner%'
      AND policy.qual LIKE '%auth_branch_id()%'
  ) THEN
    RAISE EXCEPTION
      'TEST FAILED: profiles_select_authorized lost its authority gates';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'tax_invoices'
      AND policy.policyname = 'tax_invoices_select'
      AND policy.qual ~* 'select[[:space:]]+auth_tenant_id[[:space:]]*[(]'
      AND policy.qual LIKE '%auth_is_owner%'
      AND policy.qual LIKE '%orders:read%'
  ) THEN
    RAISE EXCEPTION
      'TEST FAILED: tax_invoices_select lost its fast or permission path';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_policies policy
    WHERE policy.schemaname = 'public'
      AND policy.policyname IN (
        'attendance_select',
        'attendance_checklist_items_select'
      )
      AND policy.qual ~* 'select[[:space:]]+auth_tenant_id[[:space:]]*[(]'
      AND policy.qual LIKE '%auth_is_owner%'
  ) <> 2 THEN
    RAISE EXCEPTION
      'TEST FAILED: attendance Owner fast paths are incomplete';
  END IF;
END
$$;

DO $$
DECLARE
  v_role name;
  v_table text;
  v_privilege text;
BEGIN
  IF to_regprocedure(
    'public.verify_branch_override_code(bigint,text)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION
      'TEST FAILED: verify_branch_override_code still exists';
  END IF;

  FOREACH v_role IN ARRAY ARRAY['anon'::name, 'authenticated'::name]
  LOOP
    FOREACH v_table IN ARRAY ARRAY[
      'public.branch_override_codes',
      'public.branch_override_attempts'
    ]
    LOOP
      FOREACH v_privilege IN ARRAY ARRAY[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE',
        'TRUNCATE', 'REFERENCES', 'TRIGGER'
      ]
      LOOP
        IF has_table_privilege(v_role, v_table, v_privilege) THEN
          RAISE EXCEPTION
            'TEST FAILED: % retains % on %',
            v_role, v_privilege, v_table;
        END IF;
      END LOOP;
    END LOOP;

    FOREACH v_privilege IN ARRAY ARRAY['USAGE', 'SELECT', 'UPDATE']
    LOOP
      IF has_sequence_privilege(
        v_role,
        'public.branch_override_attempts_id_seq',
        v_privilege
      ) THEN
        RAISE EXCEPTION
          'TEST FAILED: % retains % on branch_override_attempts_id_seq',
          v_role,
          v_privilege;
      END IF;
    END LOOP;
  END LOOP;
END
$$;

DO $$
DECLARE
  v_function_oid oid;
  v_definition text;
BEGIN
  v_function_oid := to_regprocedure(
    'public.branch_menu_limit_availability(bigint,bigint,date,boolean,uuid[])'
  );

  IF v_function_oid IS NULL THEN
    RAISE EXCEPTION
      'TEST FAILED: branch_menu_limit_availability is missing';
  END IF;

  SELECT pg_get_functiondef(v_function_oid)
  INTO v_definition;

  IF v_definition LIKE '%SELECT public.compute_menu_item_stock_capacity(%'
    OR v_definition LIKE
      '%LEFT JOIN LATERAL (%SELECT SUM(sl.current_quantity)%' THEN
    RAISE EXCEPTION
      'TEST FAILED: branch_menu_limit_availability retains per-row stock work';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc function_row
    WHERE function_row.oid = v_function_oid
      AND function_row.prosecdef
      AND 'search_path=""' = ANY(function_row.proconfig)
  ) THEN
    RAISE EXCEPTION
      'TEST FAILED: branch_menu_limit_availability lost its safe search_path';
  END IF;

  IF has_function_privilege('anon', v_function_oid, 'EXECUTE')
    OR has_function_privilege(
      'authenticated',
      v_function_oid,
      'EXECUTE'
    ) THEN
    RAISE EXCEPTION
      'TEST FAILED: browser role can execute branch_menu_limit_availability';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    v_function_oid,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      'TEST FAILED: service_role cannot execute branch_menu_limit_availability';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes index_row
    WHERE index_row.schemaname = 'public'
      AND index_row.tablename = 'tax_invoices'
      AND index_row.indexname = 'idx_tax_invoices_tenant_created_id'
      AND index_row.indexdef LIKE
        '%(tenant_id, created_at DESC, id DESC)%'
  ) THEN
    RAISE EXCEPTION
      'TEST FAILED: tax invoice keyset index is missing';
  END IF;
END
$$;

ROLLBACK;
