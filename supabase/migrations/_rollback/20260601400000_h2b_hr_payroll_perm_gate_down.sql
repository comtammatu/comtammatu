-- Rollback for 20260601400000_h2b_hr_payroll_perm_gate.sql
-- Restores auth_role() IN ('owner', 'super_manager') gate.
-- WARNING: re-introduces 1h stale-revoke window via JWT user_role caching.

DROP POLICY IF EXISTS "pp_select" ON public.payroll_periods;
DROP POLICY IF EXISTS "pp_manage" ON public.payroll_periods;
DROP POLICY IF EXISTS "pe_select" ON public.payroll_entries;
DROP POLICY IF EXISTS "pe_manage" ON public.payroll_entries;

CREATE POLICY "pp_select" ON public.payroll_periods
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  );

CREATE POLICY "pp_manage" ON public.payroll_periods
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  );

CREATE POLICY "pe_select" ON public.payroll_entries
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  );

CREATE POLICY "pe_manage" ON public.payroll_entries
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  );
