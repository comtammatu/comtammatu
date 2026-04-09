-- M6.S5: Chart of Accounts (VAS Standard for F&B)

-- ─── 1. chart_of_accounts table ───

CREATE TABLE public.chart_of_accounts (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_code    TEXT NOT NULL,          -- VAS code: '111', '511', etc.
  account_name    TEXT NOT NULL,
  account_type    TEXT NOT NULL
    CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  parent_id       BIGINT REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  level           INT NOT NULL DEFAULT 1, -- depth in tree (1=top)
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(account_code, tenant_id)
);

CREATE INDEX idx_coa_tenant ON public.chart_of_accounts(tenant_id);
CREATE INDEX idx_coa_parent ON public.chart_of_accounts(parent_id);
CREATE INDEX idx_coa_type ON public.chart_of_accounts(account_type);

ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coa_select" ON public.chart_of_accounts
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager')
  );

CREATE POLICY "coa_manage" ON public.chart_of_accounts
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chart_of_accounts TO authenticated;

CREATE TRIGGER trg_coa_updated_at
  BEFORE UPDATE ON public.chart_of_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();


-- ─── 2. Seed VAS standard accounts for F&B ───
-- These are inserted per-tenant via RPC (called from Server Action on first setup)

CREATE OR REPLACE FUNCTION public.seed_chart_of_accounts(p_tenant_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip if already seeded
  IF EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id LIMIT 1) THEN
    RETURN;
  END IF;

  INSERT INTO public.chart_of_accounts (tenant_id, account_code, account_name, account_type, level) VALUES
    -- Tài sản (Assets)
    (p_tenant_id, '111', 'Tiền mặt', 'asset', 1),
    (p_tenant_id, '112', 'Tiền gửi ngân hàng', 'asset', 1),
    (p_tenant_id, '131', 'Phải thu khách hàng', 'asset', 1),
    (p_tenant_id, '152', 'Nguyên liệu, vật liệu', 'asset', 1),
    (p_tenant_id, '153', 'Công cụ, dụng cụ', 'asset', 1),
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
