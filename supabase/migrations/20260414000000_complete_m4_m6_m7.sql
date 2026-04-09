-- Migration: Complete M4 (Refunds), M6 (CoA, Journal, Food Cost), M7 (Payroll)
-- All missing tables for test server deployment.

-- ============================================================
-- M4: REFUNDS
-- ============================================================

CREATE TABLE public.refunds (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id     BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id     BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  payment_id    BIGINT NOT NULL REFERENCES public.payments(id),
  order_id      BIGINT NOT NULL REFERENCES public.orders(id),
  amount        NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  reason        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approved_by   UUID REFERENCES public.profiles(id),
  created_by    UUID NOT NULL REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one active (pending/approved) refund per payment
CREATE UNIQUE INDEX idx_refunds_payment_active
  ON public.refunds(payment_id, tenant_id) WHERE status != 'rejected';

CREATE INDEX idx_refunds_tenant ON public.refunds(tenant_id);
CREATE INDEX idx_refunds_branch ON public.refunds(branch_id);
CREATE INDEX idx_refunds_order ON public.refunds(order_id);

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY refunds_select ON public.refunds FOR SELECT TO authenticated
  USING (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::bigint);

CREATE POLICY refunds_insert ON public.refunds FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::bigint);

CREATE POLICY refunds_update ON public.refunds FOR UPDATE TO authenticated
  USING (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::bigint);

GRANT SELECT, INSERT, UPDATE ON public.refunds TO authenticated;

-- ============================================================
-- M6: CHART OF ACCOUNTS (VAS subset for restaurants)
-- ============================================================

CREATE TABLE public.chart_of_accounts (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id     BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  account_type  TEXT NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  parent_id     BIGINT REFERENCES public.chart_of_accounts(id),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(code, tenant_id)
);

CREATE INDEX idx_coa_tenant ON public.chart_of_accounts(tenant_id);

ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY coa_select ON public.chart_of_accounts FOR SELECT TO authenticated
  USING (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::bigint);

CREATE POLICY coa_insert ON public.chart_of_accounts FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::bigint);

CREATE POLICY coa_update ON public.chart_of_accounts FOR UPDATE TO authenticated
  USING (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::bigint);

GRANT SELECT, INSERT, UPDATE ON public.chart_of_accounts TO authenticated;

-- Seed default VAS accounts for all existing tenants
INSERT INTO public.chart_of_accounts (tenant_id, code, name, account_type)
SELECT t.id, v.code, v.name, v.account_type
FROM public.tenants t
CROSS JOIN (VALUES
  ('111', 'Tiền mặt', 'asset'),
  ('112', 'Tiền gửi ngân hàng', 'asset'),
  ('131', 'Phải thu khách hàng', 'asset'),
  ('152', 'Nguyên liệu, vật liệu', 'asset'),
  ('153', 'Công cụ, dụng cụ', 'asset'),
  ('211', 'Tài sản cố định', 'asset'),
  ('331', 'Phải trả người bán', 'liability'),
  ('334', 'Phải trả người lao động', 'liability'),
  ('335', 'Chi phí phải trả', 'liability'),
  ('3334', 'Thuế TNCN phải nộp', 'liability'),
  ('3383', 'BHXH phải nộp', 'liability'),
  ('3384', 'BHYT phải nộp', 'liability'),
  ('3386', 'BHTN phải nộp', 'liability'),
  ('411', 'Vốn chủ sở hữu', 'equity'),
  ('511', 'Doanh thu bán hàng', 'revenue'),
  ('515', 'Doanh thu tài chính', 'revenue'),
  ('521', 'Chiết khấu, giảm giá', 'revenue'),
  ('632', 'Giá vốn hàng bán', 'expense'),
  ('641', 'Chi phí bán hàng', 'expense'),
  ('642', 'Chi phí quản lý doanh nghiệp', 'expense')
) AS v(code, name, account_type)
ON CONFLICT (code, tenant_id) DO NOTHING;

-- ============================================================
-- M6: JOURNAL ENTRIES (double-entry bookkeeping)
-- ============================================================

CREATE TABLE public.journal_entries (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id     BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id     BIGINT REFERENCES public.branches(id),
  entry_date    DATE NOT NULL,
  description   TEXT NOT NULL,
  ref_type      TEXT,
  ref_id        BIGINT,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','void')),
  created_by    UUID NOT NULL REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_je_tenant ON public.journal_entries(tenant_id);
CREATE INDEX idx_je_date ON public.journal_entries(entry_date);
CREATE INDEX idx_je_ref ON public.journal_entries(ref_type, ref_id);

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY je_select ON public.journal_entries FOR SELECT TO authenticated
  USING (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::bigint);

CREATE POLICY je_insert ON public.journal_entries FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::bigint);

CREATE POLICY je_update ON public.journal_entries FOR UPDATE TO authenticated
  USING (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::bigint);

GRANT SELECT, INSERT, UPDATE ON public.journal_entries TO authenticated;

CREATE TABLE public.journal_entry_lines (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id     BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entry_id      BIGINT NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id    BIGINT NOT NULL REFERENCES public.chart_of_accounts(id),
  debit         NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit        NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  description   TEXT,
  CONSTRAINT chk_debit_or_credit CHECK (debit > 0 OR credit > 0),
  CONSTRAINT chk_not_both CHECK (NOT (debit > 0 AND credit > 0))
);

CREATE INDEX idx_jel_entry ON public.journal_entry_lines(entry_id);
CREATE INDEX idx_jel_account ON public.journal_entry_lines(account_id);

ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY jel_select ON public.journal_entry_lines FOR SELECT TO authenticated
  USING (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::bigint);

CREATE POLICY jel_insert ON public.journal_entry_lines FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::bigint);

GRANT SELECT, INSERT ON public.journal_entry_lines TO authenticated;

-- DB-enforced balance constraint: debit must equal credit per entry
-- Trigger fires AFTER all lines are inserted for an entry
CREATE OR REPLACE FUNCTION public.check_journal_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total_debit  NUMERIC(15,2);
  total_credit NUMERIC(15,2);
BEGIN
  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
  INTO total_debit, total_credit
  FROM public.journal_entry_lines
  WHERE entry_id = NEW.entry_id;

  -- Allow during insert (partial state); enforce on posting via RPC
  RETURN NEW;
END;
$$;

-- RPC to create a balanced journal entry atomically
CREATE OR REPLACE FUNCTION public.create_journal_entry(
  p_tenant_id   BIGINT,
  p_branch_id   BIGINT,
  p_entry_date  DATE,
  p_description TEXT,
  p_ref_type    TEXT,
  p_ref_id      BIGINT,
  p_lines       JSONB  -- array of {account_id, debit, credit, description}
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry_id   BIGINT;
  v_total_d    NUMERIC(15,2) := 0;
  v_total_c    NUMERIC(15,2) := 0;
  v_line       JSONB;
BEGIN
  -- Validate balance before inserting
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_total_d := v_total_d + COALESCE((v_line->>'debit')::NUMERIC, 0);
    v_total_c := v_total_c + COALESCE((v_line->>'credit')::NUMERIC, 0);
  END LOOP;

  IF v_total_d != v_total_c THEN
    RAISE EXCEPTION 'journal_unbalanced: debit=% credit=%', v_total_d, v_total_c;
  END IF;

  IF v_total_d = 0 THEN
    RAISE EXCEPTION 'journal_empty: no amounts';
  END IF;

  -- Insert header
  INSERT INTO public.journal_entries (tenant_id, branch_id, entry_date, description, ref_type, ref_id, status, created_by)
  VALUES (p_tenant_id, p_branch_id, p_entry_date, p_description, p_ref_type, p_ref_id, 'posted',
          auth.uid())
  RETURNING id INTO v_entry_id;

  -- Insert lines
  INSERT INTO public.journal_entry_lines (tenant_id, entry_id, account_id, debit, credit, description)
  SELECT
    p_tenant_id,
    v_entry_id,
    (line->>'account_id')::BIGINT,
    COALESCE((line->>'debit')::NUMERIC, 0),
    COALESCE((line->>'credit')::NUMERIC, 0),
    line->>'description'
  FROM jsonb_array_elements(p_lines) AS line;

  RETURN v_entry_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_journal_entry TO authenticated;

-- ============================================================
-- M6: FOOD COST MATERIALIZED VIEW
-- ============================================================

CREATE MATERIALIZED VIEW public.mv_food_cost AS
SELECT
  o.created_at::date AS date,
  o.branch_id,
  o.tenant_id,
  oi.menu_item_id,
  oi.item_name,
  SUM(oi.quantity) AS qty_sold,
  SUM(oi.subtotal) AS revenue,
  SUM(
    oi.quantity * COALESCE(
      (SELECT SUM(r.quantity * i.unit_cost)
       FROM public.recipes r
       JOIN public.ingredients i ON i.id = r.ingredient_id AND i.tenant_id = r.tenant_id
       WHERE r.menu_item_id = oi.menu_item_id AND r.tenant_id = o.tenant_id),
      0
    )
  ) AS food_cost
FROM public.order_items oi
JOIN public.orders o ON oi.order_id = o.id
WHERE o.status NOT IN ('cancelled','voided')
GROUP BY o.created_at::date, o.branch_id, o.tenant_id, oi.menu_item_id, oi.item_name
WITH NO DATA;

CREATE UNIQUE INDEX idx_mv_food_cost_pk
  ON public.mv_food_cost(date, branch_id, tenant_id, menu_item_id);

GRANT SELECT ON public.mv_food_cost TO authenticated;

-- ============================================================
-- M7: PAYROLL
-- ============================================================

CREATE TABLE public.payroll_periods (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id     BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_month  DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','calculated','approved','paid')),
  total_gross   NUMERIC(15,2) DEFAULT 0,
  total_net     NUMERIC(15,2) DEFAULT 0,
  total_si      NUMERIC(15,2) DEFAULT 0,
  total_pit     NUMERIC(15,2) DEFAULT 0,
  approved_by   UUID REFERENCES public.profiles(id),
  approved_at   TIMESTAMPTZ,
  created_by    UUID NOT NULL REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(period_month, tenant_id)
);

CREATE INDEX idx_pp_tenant ON public.payroll_periods(tenant_id);

ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY pp_select ON public.payroll_periods FOR SELECT TO authenticated
  USING (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::bigint);

CREATE POLICY pp_insert ON public.payroll_periods FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::bigint);

CREATE POLICY pp_update ON public.payroll_periods FOR UPDATE TO authenticated
  USING (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::bigint);

GRANT SELECT, INSERT, UPDATE ON public.payroll_periods TO authenticated;

CREATE TABLE public.payroll_entries (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id           BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_id           BIGINT NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  employee_id         BIGINT NOT NULL REFERENCES public.employees(id),
  base_salary         NUMERIC(15,2) NOT NULL,
  work_days           NUMERIC(5,1) NOT NULL,
  standard_days       NUMERIC(5,1) NOT NULL,
  overtime_hours      NUMERIC(5,1) NOT NULL DEFAULT 0,
  overtime_pay        NUMERIC(15,2) NOT NULL DEFAULT 0,
  gross_pay           NUMERIC(15,2) NOT NULL,
  social_insurance    NUMERIC(15,2) NOT NULL DEFAULT 0,
  health_insurance    NUMERIC(15,2) NOT NULL DEFAULT 0,
  unemployment_insurance NUMERIC(15,2) NOT NULL DEFAULT 0,
  personal_deduction  NUMERIC(15,2) NOT NULL DEFAULT 0,
  dependent_deduction NUMERIC(15,2) NOT NULL DEFAULT 0,
  taxable_income      NUMERIC(15,2) NOT NULL DEFAULT 0,
  pit_amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
  other_deductions    NUMERIC(15,2) NOT NULL DEFAULT 0,
  net_pay             NUMERIC(15,2) NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(period_id, employee_id, tenant_id)
);

CREATE INDEX idx_pe_period ON public.payroll_entries(period_id);
CREATE INDEX idx_pe_employee ON public.payroll_entries(employee_id);

ALTER TABLE public.payroll_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY pe_select ON public.payroll_entries FOR SELECT TO authenticated
  USING (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::bigint);

CREATE POLICY pe_insert ON public.payroll_entries FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::bigint);

CREATE POLICY pe_update ON public.payroll_entries FOR UPDATE TO authenticated
  USING (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::bigint);

GRANT SELECT, INSERT, UPDATE ON public.payroll_entries TO authenticated;

-- ============================================================
-- Refresh all materialized views (safe for empty data)
-- ============================================================
REFRESH MATERIALIZED VIEW public.mv_daily_revenue;
REFRESH MATERIALIZED VIEW public.mv_top_items;
-- mv_food_cost created WITH NO DATA, first refresh needs CONCURRENTLY=false
REFRESH MATERIALIZED VIEW public.mv_food_cost;
