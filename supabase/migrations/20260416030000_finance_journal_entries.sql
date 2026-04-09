-- M6.S6: Journal Entries (Bút toán kế toán)
-- Depends on: chart_of_accounts, tenants, profiles

-- ─── 1. journal_entries ───

CREATE TABLE public.journal_entries (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id       BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,
  entry_number    TEXT NOT NULL,           -- Auto-generated: JE-YYYYMMDD-NNN
  entry_date      TIMESTAMPTZ NOT NULL,
  description     TEXT NOT NULL,
  reference_type  TEXT NOT NULL DEFAULT 'manual'
    CHECK (reference_type IN ('sale', 'purchase', 'payroll', 'manual', 'adjustment')),
  reference_id    BIGINT,                  -- FK to orders/supplier_invoices/payroll_periods
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'posted', 'voided')),
  posted_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  posted_at       TIMESTAMPTZ,
  voided_reason   TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(entry_number, tenant_id)
);

CREATE INDEX idx_je_tenant ON public.journal_entries(tenant_id);
CREATE INDEX idx_je_date ON public.journal_entries(entry_date);
CREATE INDEX idx_je_status ON public.journal_entries(status);
CREATE INDEX idx_je_ref ON public.journal_entries(reference_type, reference_id);

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "je_select" ON public.journal_entries
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager')
  );

CREATE POLICY "je_manage" ON public.journal_entries
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_entries TO authenticated;

CREATE TRIGGER trg_je_updated_at
  BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();


-- ─── 2. journal_entry_lines ───

CREATE TABLE public.journal_entry_lines (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id           BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  journal_entry_id    BIGINT NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id          BIGINT NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  debit_amount        NUMERIC(15,2) NOT NULL DEFAULT 0
    CHECK (debit_amount >= 0),
  credit_amount       NUMERIC(15,2) NOT NULL DEFAULT 0
    CHECK (credit_amount >= 0),
  description         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- At least one side must be non-zero
  CHECK (debit_amount > 0 OR credit_amount > 0)
);

CREATE INDEX idx_jel_entry ON public.journal_entry_lines(journal_entry_id);
CREATE INDEX idx_jel_account ON public.journal_entry_lines(account_id);
CREATE INDEX idx_jel_tenant ON public.journal_entry_lines(tenant_id);

ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jel_select" ON public.journal_entry_lines
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager')
  );

CREATE POLICY "jel_manage" ON public.journal_entry_lines
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_entry_lines TO authenticated;


-- ─── 3. RPC: validate_journal_balance ───
-- Ensures SUM(debit) = SUM(credit) for a journal entry

CREATE OR REPLACE FUNCTION public.validate_journal_balance(p_entry_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_debit  NUMERIC(15,2);
  v_credit NUMERIC(15,2);
BEGIN
  SELECT COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0)
  INTO v_debit, v_credit
  FROM public.journal_entry_lines
  WHERE journal_entry_id = p_entry_id;

  RETURN v_debit = v_credit AND v_debit > 0;
END;
$$;
