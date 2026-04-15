-- =============================================================
-- GL Auto-Posting: Phase 1.1 — posting_rules table + seed
-- Configurable mapping from transaction events to GL accounts.
-- =============================================================

-- ─── 1. posting_rules table ───

CREATE TABLE public.posting_rules (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id           BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule_code           TEXT NOT NULL,
  description         TEXT NOT NULL,
  transaction_type    TEXT NOT NULL
    CHECK (transaction_type IN ('sale', 'purchase', 'payroll', 'transfer', 'production')),
  debit_account_code  TEXT NOT NULL,
  credit_account_code TEXT NOT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(rule_code, tenant_id)
);

CREATE INDEX idx_pr_tenant ON public.posting_rules(tenant_id);
CREATE INDEX idx_pr_type ON public.posting_rules(transaction_type);

ALTER TABLE public.posting_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pr_select" ON public.posting_rules
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  );

CREATE POLICY "pr_manage" ON public.posting_rules
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.posting_rules TO authenticated;

CREATE TRIGGER trg_pr_updated_at
  BEFORE UPDATE ON public.posting_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();


-- ─── 2. Add account 155 (Thành phẩm) to CoA seed ───

CREATE OR REPLACE FUNCTION public.seed_chart_of_accounts(p_tenant_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip if already seeded
  IF EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id LIMIT 1) THEN
    -- But still add 155 if missing (for existing tenants)
    IF NOT EXISTS (
      SELECT 1 FROM public.chart_of_accounts
      WHERE tenant_id = p_tenant_id AND account_code = '155'
    ) THEN
      INSERT INTO public.chart_of_accounts (tenant_id, account_code, account_name, account_type, level)
      VALUES (p_tenant_id, '155', 'Thành phẩm', 'asset', 1);
    END IF;
    RETURN;
  END IF;

  INSERT INTO public.chart_of_accounts (tenant_id, account_code, account_name, account_type, level) VALUES
    -- Tài sản (Assets)
    (p_tenant_id, '111', 'Tiền mặt', 'asset', 1),
    (p_tenant_id, '112', 'Tiền gửi ngân hàng', 'asset', 1),
    (p_tenant_id, '131', 'Phải thu khách hàng', 'asset', 1),
    (p_tenant_id, '152', 'Nguyên liệu, vật liệu', 'asset', 1),
    (p_tenant_id, '153', 'Công cụ, dụng cụ', 'asset', 1),
    (p_tenant_id, '155', 'Thành phẩm', 'asset', 1),
    (p_tenant_id, '156', 'Hàng hóa', 'asset', 1),
    (p_tenant_id, '211', 'TSCĐ hữu hình', 'asset', 1),
    (p_tenant_id, '214', 'Hao mòn TSCĐ', 'asset', 1),
    -- Nợ phải trả (Liabilities)
    (p_tenant_id, '331', 'Phải trả người bán', 'liability', 1),
    (p_tenant_id, '334', 'Phải trả người lao động', 'liability', 1),
    (p_tenant_id, '335', 'Chi phí phải trả', 'liability', 1),
    (p_tenant_id, '338', 'Phải trả, phải nộp khác', 'liability', 1),
    (p_tenant_id, '3383', 'BHXH', 'liability', 2),
    (p_tenant_id, '3384', 'BHYT', 'liability', 2),
    (p_tenant_id, '3386', 'BHTN', 'liability', 2),
    (p_tenant_id, '3335', 'Thuế TNCN', 'liability', 2),
    (p_tenant_id, '33311', 'Thuế GTGT đầu ra', 'liability', 2),
    (p_tenant_id, '33312', 'Thuế GTGT đầu vào', 'liability', 2),
    -- Vốn chủ sở hữu (Equity)
    (p_tenant_id, '411', 'Vốn đầu tư của chủ sở hữu', 'equity', 1),
    (p_tenant_id, '421', 'Lợi nhuận sau thuế chưa phân phối', 'equity', 1),
    -- Doanh thu (Revenue)
    (p_tenant_id, '511', 'Doanh thu bán hàng và cung cấp dịch vụ', 'revenue', 1),
    (p_tenant_id, '515', 'Doanh thu hoạt động tài chính', 'revenue', 1),
    (p_tenant_id, '521', 'Các khoản giảm trừ doanh thu', 'revenue', 1),
    -- Chi phí (Expenses)
    (p_tenant_id, '621', 'Chi phí nguyên liệu trực tiếp', 'expense', 1),
    (p_tenant_id, '622', 'Chi phí nhân công trực tiếp', 'expense', 1),
    (p_tenant_id, '627', 'Chi phí sản xuất chung', 'expense', 1),
    (p_tenant_id, '641', 'Chi phí bán hàng', 'expense', 1),
    (p_tenant_id, '642', 'Chi phí quản lý doanh nghiệp', 'expense', 1),
    (p_tenant_id, '811', 'Chi phí khác', 'expense', 1),
    -- Xác định kết quả
    (p_tenant_id, '911', 'Xác định kết quả kinh doanh', 'expense', 1);

  -- Set parent_id for sub-accounts
  UPDATE public.chart_of_accounts SET parent_id = (
    SELECT id FROM public.chart_of_accounts c2
    WHERE c2.tenant_id = p_tenant_id AND c2.account_code = '338'
  ) WHERE tenant_id = p_tenant_id AND account_code IN ('3383', '3384', '3386');

  UPDATE public.chart_of_accounts SET parent_id = (
    SELECT id FROM public.chart_of_accounts c2
    WHERE c2.tenant_id = p_tenant_id AND c2.account_code = '338'
  ) WHERE tenant_id = p_tenant_id AND account_code = '3335';

  UPDATE public.chart_of_accounts SET parent_id = (
    SELECT id FROM public.chart_of_accounts c2
    WHERE c2.tenant_id = p_tenant_id AND c2.account_code = '338'
  ) WHERE tenant_id = p_tenant_id AND account_code IN ('33311', '33312');
END;
$$;


-- ─── 3. Seed posting rules per-tenant ───

CREATE OR REPLACE FUNCTION public.seed_posting_rules(p_tenant_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip if already seeded
  IF EXISTS (SELECT 1 FROM public.posting_rules WHERE tenant_id = p_tenant_id LIMIT 1) THEN
    RETURN;
  END IF;

  INSERT INTO public.posting_rules (tenant_id, rule_code, description, transaction_type, debit_account_code, credit_account_code)
  VALUES
    -- Sale (POS)
    (p_tenant_id, 'SALE_CASH',             'Doanh thu bán hàng tiền mặt',          'sale', '111', '511'),
    (p_tenant_id, 'SALE_BANK',             'Doanh thu bán hàng chuyển khoản',      'sale', '112', '511'),
    (p_tenant_id, 'SALE_VAT_CASH',         'Thuế GTGT đầu ra (tiền mặt)',          'sale', '111', '33311'),
    (p_tenant_id, 'SALE_VAT_BANK',         'Thuế GTGT đầu ra (chuyển khoản)',      'sale', '112', '33311'),
    (p_tenant_id, 'SALE_COGS',             'Giá vốn hàng bán (xuất kho NVL)',      'sale', '621', '152'),
    -- Purchase (GRN / Supplier)
    (p_tenant_id, 'GRN_INVENTORY',         'Nhập kho nguyên liệu',                 'purchase', '152', '331'),
    (p_tenant_id, 'GRN_VAT_INPUT',         'Thuế GTGT đầu vào',                    'purchase', '33312', '331'),
    (p_tenant_id, 'SUPPLIER_PAYMENT_CASH', 'Trả tiền NCC bằng tiền mặt',           'purchase', '331', '111'),
    (p_tenant_id, 'SUPPLIER_PAYMENT_BANK', 'Trả tiền NCC bằng chuyển khoản',       'purchase', '331', '112'),
    -- Payroll
    (p_tenant_id, 'PAYROLL_SALARY',        'Chi phí lương nhân công',               'payroll', '622', '334'),
    (p_tenant_id, 'PAYROLL_BHXH_ER',       'BHXH phần doanh nghiệp',               'payroll', '627', '3383'),
    (p_tenant_id, 'PAYROLL_BHYT_ER',       'BHYT phần doanh nghiệp',               'payroll', '627', '3384'),
    (p_tenant_id, 'PAYROLL_BHTN_ER',       'BHTN phần doanh nghiệp',               'payroll', '627', '3386'),
    (p_tenant_id, 'PAYROLL_PIT',           'Thuế TNCN khấu trừ',                   'payroll', '334', '3335'),
    -- Transfer
    (p_tenant_id, 'TRANSFER_INVENTORY',    'Chuyển kho liên chi nhánh',             'transfer', '152', '152'),
    -- Production
    (p_tenant_id, 'PRODUCTION_CONSUME',    'Tiêu thụ NVL cho sản xuất',            'production', '621', '152'),
    (p_tenant_id, 'PRODUCTION_OUTPUT',     'Nhập kho thành phẩm sản xuất',         'production', '155', '621');
END;
$$;

REVOKE ALL ON FUNCTION public.seed_posting_rules(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_posting_rules(BIGINT) TO authenticated;


-- ─── 4. Auto-seed for existing tenant (id=1) ───

-- Add account 155 for existing tenant
SELECT public.seed_chart_of_accounts(1);

-- Seed posting rules for existing tenant
SELECT public.seed_posting_rules(1);
