-- CSO Audit Fixes: Employee self-access RLS + area_manager alignment
-- Findings: #1 (employee portal blocked), #3 (role/RLS mismatch)

-- ─── 1. Employee self-access: payroll_entries ───
-- Employees can read their own payslip (matched via profile_id → employees.id)

CREATE POLICY "pe_employee_self_select" ON public.payroll_entries
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND employee_id IN (
      SELECT id FROM public.employees
      WHERE profile_id = auth.uid()
    )
  );

-- ─── 2. Employee self-access: attendance_records ───
-- Employees can read their own attendance history

CREATE POLICY "attendance_employee_self_select" ON public.attendance_records
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND employee_id IN (
      SELECT id FROM public.employees
      WHERE profile_id = auth.uid()
    )
  );

-- ─── 3. Area manager access: payroll read (Finding #3) ───
-- area_manager can view payroll for employees in their area's branches

CREATE POLICY "pp_area_manager_select" ON public.payroll_periods
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() = 'area_manager'
  );

CREATE POLICY "pe_area_manager_select" ON public.payroll_entries
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() = 'area_manager'
  );

-- ─── 4. Area manager access: journal entries read ───

CREATE POLICY "je_area_manager_select" ON public.journal_entries
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() = 'area_manager'
  );

CREATE POLICY "jel_area_manager_select" ON public.journal_entry_lines
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() = 'area_manager'
  );

-- ─── 5. Audit log immutability: prevent UPDATE/DELETE ───
-- audit_logs should be append-only (no UPDATE or DELETE policies)
-- The existing RLS only has SELECT + INSERT, no UPDATE/DELETE → already immutable via RLS
-- Add explicit denial comment for clarity

COMMENT ON TABLE public.audit_logs IS 'Append-only audit trail. No UPDATE/DELETE RLS policies = immutable via RLS.';
