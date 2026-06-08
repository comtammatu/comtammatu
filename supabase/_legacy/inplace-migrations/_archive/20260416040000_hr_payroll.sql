-- M7.S5: Payroll Periods + Entries
-- Depends on: employees, tenants, profiles

-- ─── 1. payroll_periods ───

CREATE TABLE public.payroll_periods (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_month    INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year     INT NOT NULL CHECK (period_year >= 2020),
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'calculated', 'approved', 'paid')),
  approved_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(period_month, period_year, tenant_id)
);

CREATE INDEX idx_pp_tenant ON public.payroll_periods(tenant_id);
CREATE INDEX idx_pp_status ON public.payroll_periods(status);

ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;

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

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payroll_periods TO authenticated;

CREATE TRIGGER trg_pp_updated_at
  BEFORE UPDATE ON public.payroll_periods
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();


-- ─── 2. payroll_entries ───

CREATE TABLE public.payroll_entries (
  id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id                   BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payroll_period_id           BIGINT NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  employee_id                 BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,

  -- Công
  working_days                NUMERIC(5,1) NOT NULL,
  standard_days               NUMERIC(5,1) NOT NULL,
  overtime_hours              NUMERIC(6,2) NOT NULL DEFAULT 0,

  -- Thu nhập
  base_salary                 NUMERIC(15,2) NOT NULL,
  allowances                  NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_exempt_allowances       NUMERIC(15,2) NOT NULL DEFAULT 0,
  overtime_pay                NUMERIC(15,2) NOT NULL DEFAULT 0,
  bonus                       NUMERIC(15,2) NOT NULL DEFAULT 0,
  gross_total                 NUMERIC(15,2) NOT NULL,

  -- BH NLĐ đóng
  bhxh_employee               NUMERIC(15,2) NOT NULL,
  bhyt_employee               NUMERIC(15,2) NOT NULL,
  bhtn_employee               NUMERIC(15,2) NOT NULL,
  total_insurance_employee    NUMERIC(15,2) NOT NULL,

  -- BH NSDLĐ đóng
  bhxh_employer               NUMERIC(15,2) NOT NULL,
  bhyt_employer               NUMERIC(15,2) NOT NULL,
  bhtn_employer               NUMERIC(15,2) NOT NULL,
  total_insurance_employer    NUMERIC(15,2) NOT NULL,

  -- Giảm trừ thuế TNCN
  personal_deduction          NUMERIC(15,2) NOT NULL DEFAULT 11000000,
  dependent_count             INT NOT NULL DEFAULT 0,
  dependent_deduction         NUMERIC(15,2) NOT NULL DEFAULT 0,
  charity_deduction           NUMERIC(15,2) NOT NULL DEFAULT 0,

  -- Thuế TNCN
  taxable_income              NUMERIC(15,2) NOT NULL,
  pit_tax                     NUMERIC(15,2) NOT NULL,

  -- Khấu trừ khác
  advance_deduction           NUMERIC(15,2) NOT NULL DEFAULT 0,
  other_deductions            NUMERIC(15,2) NOT NULL DEFAULT 0,

  -- Lương thực lĩnh
  net_salary                  NUMERIC(15,2) NOT NULL,

  -- Snapshot
  insurance_base              NUMERIC(15,2) NOT NULL,
  notes                       TEXT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(payroll_period_id, employee_id, tenant_id)
);

CREATE INDEX idx_pe_period ON public.payroll_entries(payroll_period_id);
CREATE INDEX idx_pe_employee ON public.payroll_entries(employee_id);
CREATE INDEX idx_pe_tenant ON public.payroll_entries(tenant_id);

ALTER TABLE public.payroll_entries ENABLE ROW LEVEL SECURITY;

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

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payroll_entries TO authenticated;

CREATE TRIGGER trg_pe_updated_at
  BEFORE UPDATE ON public.payroll_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
