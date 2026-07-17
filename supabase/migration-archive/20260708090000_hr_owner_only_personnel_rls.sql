DROP POLICY IF EXISTS employees_select ON public.employees;
DROP POLICY IF EXISTS employees_write ON public.employees;
DROP POLICY IF EXISTS contracts_select ON public.employment_contracts;
DROP POLICY IF EXISTS contracts_write ON public.employment_contracts;

DROP FUNCTION IF EXISTS public.auth_is_current_owner();

CREATE POLICY employees_select ON public.employees
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      JOIN public.positions po
        ON po.id = pr.position_id
       AND po.tenant_id = pr.tenant_id
      WHERE pr.id = (SELECT auth.uid())
        AND pr.tenant_id = public.auth_tenant_id()
        AND po.code = 'owner'
        AND COALESCE(pr.is_active, true) = true
    )
  );

CREATE POLICY employees_write ON public.employees
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      JOIN public.positions po
        ON po.id = pr.position_id
       AND po.tenant_id = pr.tenant_id
      WHERE pr.id = (SELECT auth.uid())
        AND pr.tenant_id = public.auth_tenant_id()
        AND po.code = 'owner'
        AND COALESCE(pr.is_active, true) = true
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      JOIN public.positions po
        ON po.id = pr.position_id
       AND po.tenant_id = pr.tenant_id
      WHERE pr.id = (SELECT auth.uid())
        AND pr.tenant_id = public.auth_tenant_id()
        AND po.code = 'owner'
        AND COALESCE(pr.is_active, true) = true
    )
  );

COMMENT ON POLICY employees_select ON public.employees IS
  'Tenant-wide employee reads are owner-only. Non-owner self-row read stays in employees_select_self; branch-safe HR reads must go through Server Actions.';

COMMENT ON POLICY employees_write ON public.employees IS
  'Employee record writes are owner-only at RLS. Branch managers use read-only branch-safe Server Actions.';

CREATE POLICY contracts_select ON public.employment_contracts
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      JOIN public.positions po
        ON po.id = pr.position_id
       AND po.tenant_id = pr.tenant_id
      WHERE pr.id = (SELECT auth.uid())
        AND pr.tenant_id = public.auth_tenant_id()
        AND po.code = 'owner'
        AND COALESCE(pr.is_active, true) = true
    )
  );

CREATE POLICY contracts_write ON public.employment_contracts
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      JOIN public.positions po
        ON po.id = pr.position_id
       AND po.tenant_id = pr.tenant_id
      WHERE pr.id = (SELECT auth.uid())
        AND pr.tenant_id = public.auth_tenant_id()
        AND po.code = 'owner'
        AND COALESCE(pr.is_active, true) = true
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      JOIN public.positions po
        ON po.id = pr.position_id
       AND po.tenant_id = pr.tenant_id
      WHERE pr.id = (SELECT auth.uid())
        AND pr.tenant_id = public.auth_tenant_id()
        AND po.code = 'owner'
        AND COALESCE(pr.is_active, true) = true
    )
  );

COMMENT ON POLICY contracts_select ON public.employment_contracts IS
  'Employment contract rows include compensation data and are owner-only at RLS.';

COMMENT ON POLICY contracts_write ON public.employment_contracts IS
  'Employment contract writes are owner-only at RLS.';

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('employees', 'employment_contracts')
    AND policyname IN (
      'employees_select',
      'employees_write',
      'contracts_select',
      'contracts_write'
    )
    AND (
      COALESCE(qual, '') LIKE '%hr:view_employee%'
      OR COALESCE(with_check, '') LIKE '%hr:view_employee%'
      OR COALESCE(qual, '') LIKE '%hr:manage_employee%'
      OR COALESCE(with_check, '') LIKE '%hr:manage_employee%'
    );

  IF v_count <> 0 THEN
    RAISE EXCEPTION
      'hr_owner_only_personnel_rls: personnel base-table policies must not use HR permission keys for full-row access';
  END IF;
END $$;
