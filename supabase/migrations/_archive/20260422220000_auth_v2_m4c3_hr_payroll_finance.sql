-- =============================================================
-- Auth v2 — M4c.3: HR + Payroll + Finance/GL RLS cutover
-- 13 tables:
--   HR:      employees, employment_contracts, attendance_records,
--            branch_attendance_config, shifts, shift_assignments
--   Payroll: payroll_entries, payroll_periods
--   GL:      chart_of_accounts, journal_entries, journal_entry_lines,
--            fiscal_periods, posting_rules
-- =============================================================

-- ═════════════════════════════════════════════════════
-- HR
-- ═════════════════════════════════════════════════════

-- employees (tenant-scoped PII)
DROP POLICY IF EXISTS "employees_select" ON public.employees;
DROP POLICY IF EXISTS "employees_manage" ON public.employees;

CREATE POLICY "employees_select" ON public.employees
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('hr:view_employee')
  );

CREATE POLICY "employees_write" ON public.employees
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('hr:manage_employee')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('hr:manage_employee')
  );

-- employment_contracts
DROP POLICY IF EXISTS "contracts_select" ON public.employment_contracts;
DROP POLICY IF EXISTS "contracts_manage" ON public.employment_contracts;

CREATE POLICY "contracts_select" ON public.employment_contracts
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('hr:view_employee')
  );

CREATE POLICY "contracts_write" ON public.employment_contracts
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('hr:contract_create')
      OR public.has_permission_any('hr:contract_sign')
      OR public.has_permission_any('hr:terminate')
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('hr:contract_create')
      OR public.has_permission_any('hr:contract_sign')
      OR public.has_permission_any('hr:terminate')
    )
  );

-- attendance_records (branch-scoped; self + managers)
DROP POLICY IF EXISTS "attendance_select" ON public.attendance_records;
DROP POLICY IF EXISTS "attendance_manage" ON public.attendance_records;

CREATE POLICY "attendance_select" ON public.attendance_records
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = attendance_records.employee_id
          AND e.profile_id = auth.uid()
      )  -- self
      OR public.has_permission_any('staff:view')
      OR public.has_permission_any('hr:view_employee')
    )
  );

CREATE POLICY "attendance_write" ON public.attendance_records
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = attendance_records.employee_id
          AND e.profile_id = auth.uid()
      )
      OR public.has_permission_any('staff:manage')
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = attendance_records.employee_id
          AND e.profile_id = auth.uid()
      )
      OR public.has_permission_any('staff:manage')
    )
  );

-- branch_attendance_config (branch-scoped config)
DROP POLICY IF EXISTS "bac_manager_all" ON public.branch_attendance_config;

CREATE POLICY "branch_attendance_config_write" ON public.branch_attendance_config
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'settings:branch')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'settings:branch')
  );

-- shifts (branch-scoped, managed by branch managers)
DROP POLICY IF EXISTS "shifts_manage" ON public.shifts;

CREATE POLICY "shifts_write" ON public.shifts
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'staff:manage')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'staff:manage')
  );

-- shift_assignments
DROP POLICY IF EXISTS "shift_assignments_manage" ON public.shift_assignments;

CREATE POLICY "shift_assignments_write" ON public.shift_assignments
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('staff:manage')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('staff:manage')
  );

-- ═════════════════════════════════════════════════════
-- PAYROLL
-- ═════════════════════════════════════════════════════

-- payroll_entries (sensitive PII)
DROP POLICY IF EXISTS "pe_select" ON public.payroll_entries;
DROP POLICY IF EXISTS "pe_area_manager_select" ON public.payroll_entries;
DROP POLICY IF EXISTS "pe_manage" ON public.payroll_entries;

CREATE POLICY "payroll_entries_select" ON public.payroll_entries
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      -- self view (employee sees own payslip)
      EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = payroll_entries.employee_id
          AND e.profile_id = auth.uid()
      )
      OR public.has_permission_any('finance:payroll_calculate')
      OR public.has_permission_any('finance:view')
    )
  );

CREATE POLICY "payroll_entries_write" ON public.payroll_entries
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:payroll_calculate')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:payroll_calculate')
  );

-- payroll_periods
DROP POLICY IF EXISTS "pp_select" ON public.payroll_periods;
DROP POLICY IF EXISTS "pp_area_manager_select" ON public.payroll_periods;
DROP POLICY IF EXISTS "pp_manage" ON public.payroll_periods;

CREATE POLICY "payroll_periods_select" ON public.payroll_periods
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:view')
  );

CREATE POLICY "payroll_periods_write" ON public.payroll_periods
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:payroll_calculate')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:payroll_calculate')
  );

-- ═════════════════════════════════════════════════════
-- GENERAL LEDGER (finance)
-- ═════════════════════════════════════════════════════

-- chart_of_accounts
DROP POLICY IF EXISTS "coa_select" ON public.chart_of_accounts;
DROP POLICY IF EXISTS "coa_manage" ON public.chart_of_accounts;

CREATE POLICY "chart_of_accounts_select" ON public.chart_of_accounts
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:view')
  );

CREATE POLICY "chart_of_accounts_write" ON public.chart_of_accounts
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('settings:tenant')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('settings:tenant')
  );

-- journal_entries
DROP POLICY IF EXISTS "je_select" ON public.journal_entries;
DROP POLICY IF EXISTS "je_area_manager_select" ON public.journal_entries;
DROP POLICY IF EXISTS "je_manage" ON public.journal_entries;

CREATE POLICY "journal_entries_select" ON public.journal_entries
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:view')
  );

CREATE POLICY "journal_entries_write" ON public.journal_entries
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:expense_approve')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:expense_approve')
  );

-- journal_entry_lines
DROP POLICY IF EXISTS "jel_select" ON public.journal_entry_lines;
DROP POLICY IF EXISTS "jel_area_manager_select" ON public.journal_entry_lines;
DROP POLICY IF EXISTS "jel_manage" ON public.journal_entry_lines;

CREATE POLICY "journal_entry_lines_select" ON public.journal_entry_lines
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:view')
  );

CREATE POLICY "journal_entry_lines_write" ON public.journal_entry_lines
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:expense_approve')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:expense_approve')
  );

-- fiscal_periods
DROP POLICY IF EXISTS "fp_select" ON public.fiscal_periods;
DROP POLICY IF EXISTS "fp_manage" ON public.fiscal_periods;

CREATE POLICY "fiscal_periods_select" ON public.fiscal_periods
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:view')
  );

CREATE POLICY "fiscal_periods_write" ON public.fiscal_periods
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('settings:tenant')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('settings:tenant')
  );

-- posting_rules
DROP POLICY IF EXISTS "pr_select" ON public.posting_rules;
DROP POLICY IF EXISTS "pr_manage" ON public.posting_rules;

CREATE POLICY "posting_rules_select" ON public.posting_rules
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:view')
  );

CREATE POLICY "posting_rules_write" ON public.posting_rules
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('settings:tenant')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('settings:tenant')
  );
