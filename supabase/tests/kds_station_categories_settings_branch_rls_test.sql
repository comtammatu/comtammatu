-- =============================================================
-- Regression test: KDS station category routing uses settings:branch
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/kds_station_categories_settings_branch_rls_test.sql
--   supabase db query --linked --file supabase/tests/kds_station_categories_settings_branch_rls_test.sql
-- =============================================================

BEGIN;

DO $$
DECLARE
  v_bad_policy_count INTEGER;
  v_missing_policy_count INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO v_bad_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'kds_station_categories'
    AND policyname <> 'tenant_select'
    AND (
      COALESCE(qual, '') ILIKE '%menu:manage_category%'
      OR COALESCE(with_check, '') ILIKE '%menu:manage_category%'
    );

  IF v_bad_policy_count <> 0 THEN
    RAISE EXCEPTION
      'TEST FAILED: kds_station_categories write policy still depends on menu:manage_category';
  END IF;

  SELECT 3 - COUNT(*)
    INTO v_missing_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'kds_station_categories'
    AND policyname IN (
      'kds_station_categories_insert',
      'kds_station_categories_update',
      'kds_station_categories_delete'
    )
    AND (
      COALESCE(qual, '') ILIKE '%settings:branch%'
      OR COALESCE(with_check, '') ILIKE '%settings:branch%'
    );

  IF v_missing_policy_count <> 0 THEN
    RAISE EXCEPTION
      'TEST FAILED: missing % settings:branch KDS station category write policy/policies',
      v_missing_policy_count;
  END IF;

  RAISE NOTICE
    'TEST PASSED: kds_station_categories write policies use settings:branch';
END;
$$;

ROLLBACK;
