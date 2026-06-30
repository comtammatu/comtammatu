-- =============================================================
-- Regression test: branch_manager has KDS action permissions by branch
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/branch_manager_kds_permissions_test.sql
--
-- Safe to run repeatedly. The outer transaction rolls back.
-- =============================================================

\set ON_ERROR_STOP on
BEGIN;

SELECT plan(1);

DO $$
DECLARE
  v_template_missing INTEGER;
  v_branch_managers INTEGER;
  v_missing_grants INTEGER;
  v_tenant_wide_grants INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO v_template_missing
  FROM public.role_templates rt
  CROSS JOIN (
    VALUES
      ('kds:use'),
      ('kds:mark_ready'),
      ('kds:recall')
  ) AS k(permission_key)
  WHERE rt.name = 'branch_manager'
    AND rt.position_code = 'branch_manager'
    AND rt.is_system = TRUE
    AND NOT (k.permission_key = ANY(rt.permission_keys));

  IF v_template_missing <> 0 THEN
    RAISE EXCEPTION
      'TEST FAILED: branch_manager template missing % KDS permission grant(s)',
      v_template_missing;
  END IF;

  SELECT COUNT(*)
    INTO v_branch_managers
  FROM public.profiles pr
  JOIN public.positions pos
    ON pos.id = pr.position_id
  WHERE pr.is_active = TRUE
    AND pos.code = 'branch_manager'
    AND pr.branch_id IS NOT NULL;

  IF v_branch_managers = 0 THEN
    RAISE EXCEPTION
      'TEST FAILED: no active branch-scoped branch_manager profile found';
  END IF;

  WITH required AS (
    SELECT
      pr.id AS user_id,
      pr.branch_id,
      k.permission_key
    FROM public.profiles pr
    JOIN public.positions pos
      ON pos.id = pr.position_id
    CROSS JOIN (
      VALUES
        ('kds:use'),
        ('kds:mark_ready'),
        ('kds:recall')
    ) AS k(permission_key)
    WHERE pr.is_active = TRUE
      AND pos.code = 'branch_manager'
      AND pr.branch_id IS NOT NULL
  )
  SELECT COUNT(*)
    INTO v_missing_grants
  FROM required req
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.staff_permissions sp
    WHERE sp.user_id = req.user_id
      AND sp.branch_id = req.branch_id
      AND sp.permission_key = req.permission_key
      AND sp.valid_from <= now()
      AND (sp.valid_until IS NULL OR sp.valid_until > now())
  );

  IF v_missing_grants <> 0 THEN
    RAISE EXCEPTION
      'TEST FAILED: branch_manager missing % active branch-scoped KDS grant(s)',
      v_missing_grants;
  END IF;

  SELECT COUNT(*)
    INTO v_tenant_wide_grants
  FROM public.staff_permissions sp
  JOIN public.profiles pr
    ON pr.id = sp.user_id
  JOIN public.positions pos
    ON pos.id = pr.position_id
  WHERE pos.code = 'branch_manager'
    AND sp.branch_id IS NULL
    AND sp.permission_key IN ('kds:use', 'kds:mark_ready', 'kds:recall');

  IF v_tenant_wide_grants <> 0 THEN
    RAISE EXCEPTION
      'TEST FAILED: branch_manager has % tenant-wide KDS grant(s)',
      v_tenant_wide_grants;
  END IF;

END;
$$;

SELECT ok(TRUE, 'branch_manager KDS permissions are branch-scoped and active');
SELECT * FROM finish();

ROLLBACK;
