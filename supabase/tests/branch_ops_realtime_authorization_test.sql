-- =============================================================
-- Regression test: private Branch Realtime topic authorization
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/branch_ops_realtime_authorization_test.sql
--
-- Safe to run repeatedly. The outer transaction rolls back.
-- =============================================================

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_tenant BIGINT;
  v_staff UUID;
  v_staff_branch BIGINT;
  v_other_branch BIGINT;
  v_owner UUID;
  v_permission TEXT;
  v_definition TEXT;
BEGIN
  SELECT pr.tenant_id, pr.id, pr.branch_id
    INTO v_tenant, v_staff, v_staff_branch
  FROM public.profiles pr
  JOIN public.positions po
    ON po.id = pr.position_id
   AND po.tenant_id = pr.tenant_id
  JOIN public.branches b
    ON b.id = pr.branch_id
   AND b.tenant_id = pr.tenant_id
  WHERE pr.is_active IS TRUE
    AND b.is_active IS TRUE
    AND po.code <> 'owner'
    AND EXISTS (
      SELECT 1
      FROM public.branches other
      WHERE other.tenant_id = pr.tenant_id
        AND other.id <> pr.branch_id
        AND other.is_active IS TRUE
    )
  ORDER BY pr.id
  LIMIT 1;

  IF v_staff IS NULL THEN
    RAISE EXCEPTION
      'TEST FAILED: no active non-owner profile with two active tenant branches found';
  END IF;

  SELECT b.id
    INTO v_other_branch
  FROM public.branches b
  WHERE b.tenant_id = v_tenant
    AND b.id <> v_staff_branch
    AND b.is_active IS TRUE
  ORDER BY b.id
  LIMIT 1;

  SELECT pr.id
    INTO v_owner
  FROM public.profiles pr
  JOIN public.positions po
    ON po.id = pr.position_id
   AND po.tenant_id = pr.tenant_id
  WHERE pr.tenant_id = v_tenant
    AND pr.is_active IS TRUE
    AND po.code = 'owner'
  ORDER BY pr.id
  LIMIT 1;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION
      'TEST FAILED: no active owner profile found for tenant %', v_tenant;
  END IF;

  SELECT pk.key
    INTO v_permission
  FROM public.permission_keys pk
  WHERE pk.scope IN ('tenant', 'either')
  ORDER BY pk.key
  LIMIT 1;

  IF v_permission IS NULL THEN
    RAISE EXCEPTION 'TEST FAILED: no tenant-capable permission key found';
  END IF;

  INSERT INTO public.staff_permissions (
    user_id,
    tenant_id,
    branch_id,
    permission_key,
    valid_from,
    valid_until
  ) VALUES (
    v_staff,
    v_tenant,
    NULL,
    v_permission,
    now() - interval '1 day',
    NULL
  )
  ON CONFLICT DO NOTHING;

  UPDATE public.staff_permissions
  SET valid_from = now() - interval '1 day',
      valid_until = NULL
  WHERE user_id = v_staff
    AND branch_id IS NULL
    AND permission_key = v_permission;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_staff::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'tenant_id', v_tenant,
        'branch_id', v_staff_branch
      )
    )::text,
    true
  );

  IF NOT public.can_read_branch_ops(v_staff_branch) THEN
    RAISE EXCEPTION 'TEST FAILED: active staff cannot read assigned branch topic';
  END IF;

  IF public.can_read_branch_ops(v_other_branch) THEN
    RAISE EXCEPTION
      'TEST FAILED: tenant-wide PBAC grant widened staff Realtime topic scope';
  END IF;

  UPDATE public.profiles SET is_active = FALSE WHERE id = v_staff;
  IF public.can_read_branch_ops(v_staff_branch) THEN
    RAISE EXCEPTION 'TEST FAILED: inactive profile can read Branch Realtime';
  END IF;
  UPDATE public.profiles SET is_active = TRUE WHERE id = v_staff;

  UPDATE public.branches SET is_active = FALSE WHERE id = v_staff_branch;
  IF public.can_read_branch_ops(v_staff_branch) THEN
    RAISE EXCEPTION 'TEST FAILED: inactive assigned branch remains readable';
  END IF;
  UPDATE public.branches SET is_active = TRUE WHERE id = v_staff_branch;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_owner::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', v_tenant)
    )::text,
    true
  );

  IF NOT public.can_read_branch_ops(v_staff_branch)
     OR NOT public.can_read_branch_ops(v_other_branch) THEN
    RAISE EXCEPTION 'TEST FAILED: active owner cannot read active tenant branches';
  END IF;

  UPDATE public.branches SET is_active = FALSE WHERE id = v_other_branch;
  IF public.can_read_branch_ops(v_other_branch) THEN
    RAISE EXCEPTION 'TEST FAILED: owner can read inactive branch topic';
  END IF;
  UPDATE public.branches SET is_active = TRUE WHERE id = v_other_branch;

  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  IF public.can_read_branch_ops(v_staff_branch) THEN
    RAISE EXCEPTION 'TEST FAILED: anonymous caller can read Branch Realtime';
  END IF;

  SELECT pg_get_functiondef(
    'public.can_read_branch_ops(bigint)'::regprocedure
  ) INTO v_definition;

  IF v_definition ILIKE '%staff_permissions%'
     OR v_definition NOT ILIKE '%b.is_active IS TRUE%'
     OR v_definition NOT ILIKE '%pr.is_active IS TRUE%'
     OR v_definition NOT ILIKE '%pr.branch_id = p_branch_id%'
     OR v_definition NOT ILIKE '%auth_is_owner(pr.id)%' THEN
    RAISE EXCEPTION
      'TEST FAILED: can_read_branch_ops definition drifted from active assignment scope';
  END IF;

  IF has_function_privilege(
       'anon',
       'public.can_read_branch_ops(bigint)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'TEST FAILED: anon can execute can_read_branch_ops';
  END IF;

  IF NOT has_function_privilege(
           'authenticated',
           'public.can_read_branch_ops(bigint)',
           'EXECUTE'
         )
     OR NOT has_function_privilege(
              'service_role',
              'public.can_read_branch_ops(bigint)',
              'EXECUTE'
            ) THEN
    RAISE EXCEPTION
      'TEST FAILED: authenticated/service_role execution grant is missing';
  END IF;

  RAISE NOTICE
    'TEST PASSED: Branch Realtime follows active Owner/assigned-branch scope';
END;
$$;

ROLLBACK;
