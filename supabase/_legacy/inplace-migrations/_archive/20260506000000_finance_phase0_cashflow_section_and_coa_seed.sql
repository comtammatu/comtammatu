-- =============================================================
-- M6 Finance Phase 0 — Cashflow section flag + COA sub-accounts
-- =============================================================
-- Adds chart_of_accounts.cashflow_section enum so B03-DN
-- (Báo cáo lưu chuyển tiền tệ) classifies operating/investing/
-- financing without hardcoding account ranges. Seeds Phase 1
-- prerequisites: 1111, 1121, 4111. Backfills existing rows.
--
-- Rule: CASHFLOW-CLASSIFY-USES-COA-FLAG (regression rule
--       2026-04-28). B03-DN reports MUST filter by this column,
--       NEVER pattern-match account_code prefixes.
-- =============================================================

-- ─── 1. Add cashflow_section column ───

ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS cashflow_section TEXT NOT NULL DEFAULT 'operating'
    CHECK (cashflow_section IN ('operating', 'investing', 'financing', 'none'));

CREATE INDEX IF NOT EXISTS idx_coa_cashflow_section
  ON public.chart_of_accounts(tenant_id, cashflow_section);

COMMENT ON COLUMN public.chart_of_accounts.cashflow_section IS
  'B03-DN classification: operating (working capital + ops cash), '
  'investing (FA acquisition/disposal: 21x, 22x, 24x), '
  'financing (equity 4xx + long-term debt 34x), '
  'none (clearing accounts like 911 that do not represent cash movement)';

-- ─── 2. Backfill existing rows ───
-- Investing: tangible/intangible FA (21x), construction-in-progress (241),
-- long-term investments (22x). Pattern-match prefix to handle sub-accounts
-- (e.g. 2113, 2141 once seeded).
UPDATE public.chart_of_accounts
SET cashflow_section = 'investing'
WHERE account_code ~ '^(21[1-7]|22[1-8]|241)';

-- Financing: equity (411-421), long-term debt (341-343).
UPDATE public.chart_of_accounts
SET cashflow_section = 'financing'
WHERE account_code ~ '^(34[1-3]|41[1-9]|421)';

-- None: clearing / determine-result accounts (no cash flow impact).
UPDATE public.chart_of_accounts
SET cashflow_section = 'none'
WHERE account_code IN ('911');

-- All other rows keep DEFAULT 'operating'.

-- ─── 3. Seed Phase 0 sub-accounts for existing tenants (idempotent) ───

-- 1111 (Tiền Việt Nam) — sub of 111 cash drawer
INSERT INTO public.chart_of_accounts
  (tenant_id, account_code, account_name, account_type, parent_id, level, cashflow_section)
SELECT
  t.id,
  '1111',
  'Tiền Việt Nam',
  'asset',
  (SELECT id FROM public.chart_of_accounts
    WHERE tenant_id = t.id AND account_code = '111' LIMIT 1),
  2,
  'operating'
FROM public.tenants t
WHERE EXISTS (
  SELECT 1 FROM public.chart_of_accounts c
  WHERE c.tenant_id = t.id AND c.account_code = '111'
)
ON CONFLICT (account_code, tenant_id) DO NOTHING;

-- 1121 (Tiền Việt Nam gửi NH) — sub of 112 bank account
INSERT INTO public.chart_of_accounts
  (tenant_id, account_code, account_name, account_type, parent_id, level, cashflow_section)
SELECT
  t.id,
  '1121',
  'Tiền Việt Nam gửi ngân hàng',
  'asset',
  (SELECT id FROM public.chart_of_accounts
    WHERE tenant_id = t.id AND account_code = '112' LIMIT 1),
  2,
  'operating'
FROM public.tenants t
WHERE EXISTS (
  SELECT 1 FROM public.chart_of_accounts c
  WHERE c.tenant_id = t.id AND c.account_code = '112'
)
ON CONFLICT (account_code, tenant_id) DO NOTHING;

-- 4111 (Vốn góp của chủ sở hữu) — sub of 411 equity
-- Used by OWNER_DRAW posting rule + capital contribution form.
INSERT INTO public.chart_of_accounts
  (tenant_id, account_code, account_name, account_type, parent_id, level, cashflow_section)
SELECT
  t.id,
  '4111',
  'Vốn góp của chủ sở hữu',
  'equity',
  (SELECT id FROM public.chart_of_accounts
    WHERE tenant_id = t.id AND account_code = '411' LIMIT 1),
  2,
  'financing'
FROM public.tenants t
WHERE EXISTS (
  SELECT 1 FROM public.chart_of_accounts c
  WHERE c.tenant_id = t.id AND c.account_code = '411'
)
ON CONFLICT (account_code, tenant_id) DO NOTHING;

-- ─── 4. Update seed_chart_of_accounts to include new accounts + section ───

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

  INSERT INTO public.chart_of_accounts
    (tenant_id, account_code, account_name, account_type, level, cashflow_section)
  VALUES
    -- Tài sản (Assets)
    (p_tenant_id, '111',   'Tiền mặt',                                'asset',     1, 'operating'),
    (p_tenant_id, '1111',  'Tiền Việt Nam',                           'asset',     2, 'operating'),
    (p_tenant_id, '112',   'Tiền gửi ngân hàng',                      'asset',     1, 'operating'),
    (p_tenant_id, '1121',  'Tiền Việt Nam gửi ngân hàng',             'asset',     2, 'operating'),
    (p_tenant_id, '131',   'Phải thu khách hàng',                     'asset',     1, 'operating'),
    (p_tenant_id, '152',   'Nguyên liệu, vật liệu',                   'asset',     1, 'operating'),
    (p_tenant_id, '153',   'Công cụ, dụng cụ',                        'asset',     1, 'operating'),
    (p_tenant_id, '156',   'Hàng hóa',                                'asset',     1, 'operating'),
    (p_tenant_id, '211',   'TSCĐ hữu hình',                           'asset',     1, 'investing'),
    (p_tenant_id, '214',   'Hao mòn TSCĐ',                            'asset',     1, 'investing'),
    -- Nợ phải trả (Liabilities)
    (p_tenant_id, '331',   'Phải trả người bán',                      'liability', 1, 'operating'),
    (p_tenant_id, '334',   'Phải trả người lao động',                 'liability', 1, 'operating'),
    (p_tenant_id, '335',   'Chi phí phải trả',                        'liability', 1, 'operating'),
    (p_tenant_id, '338',   'Phải trả, phải nộp khác',                 'liability', 1, 'operating'),
    (p_tenant_id, '3383',  'BHXH',                                    'liability', 2, 'operating'),
    (p_tenant_id, '3384',  'BHYT',                                    'liability', 2, 'operating'),
    (p_tenant_id, '3386',  'BHTN',                                    'liability', 2, 'operating'),
    (p_tenant_id, '3335',  'Thuế TNCN',                               'liability', 2, 'operating'),
    (p_tenant_id, '33311', 'Thuế GTGT đầu ra',                        'liability', 2, 'operating'),
    (p_tenant_id, '33312', 'Thuế GTGT đầu vào',                       'liability', 2, 'operating'),
    -- Vốn chủ sở hữu (Equity) — financing for B03-DN
    (p_tenant_id, '411',   'Vốn đầu tư của chủ sở hữu',               'equity',    1, 'financing'),
    (p_tenant_id, '4111',  'Vốn góp của chủ sở hữu',                  'equity',    2, 'financing'),
    (p_tenant_id, '421',   'Lợi nhuận sau thuế chưa phân phối',       'equity',    1, 'financing'),
    -- Doanh thu (Revenue)
    (p_tenant_id, '511',   'Doanh thu bán hàng và cung cấp dịch vụ',  'revenue',   1, 'operating'),
    (p_tenant_id, '515',   'Doanh thu hoạt động tài chính',           'revenue',   1, 'operating'),
    (p_tenant_id, '521',   'Các khoản giảm trừ doanh thu',            'revenue',   1, 'operating'),
    -- Chi phí (Expenses)
    (p_tenant_id, '621',   'Chi phí nguyên liệu trực tiếp',           'expense',   1, 'operating'),
    (p_tenant_id, '622',   'Chi phí nhân công trực tiếp',             'expense',   1, 'operating'),
    (p_tenant_id, '627',   'Chi phí sản xuất chung',                  'expense',   1, 'operating'),
    (p_tenant_id, '641',   'Chi phí bán hàng',                        'expense',   1, 'operating'),
    (p_tenant_id, '642',   'Chi phí quản lý doanh nghiệp',            'expense',   1, 'operating'),
    (p_tenant_id, '811',   'Chi phí khác',                            'expense',   1, 'operating'),
    -- Xác định kết quả (clearing — none for B03-DN)
    (p_tenant_id, '911',   'Xác định kết quả kinh doanh',             'expense',   1, 'none');

  -- Set parent_id for cash sub-accounts
  UPDATE public.chart_of_accounts SET parent_id = (
    SELECT id FROM public.chart_of_accounts c2
    WHERE c2.tenant_id = p_tenant_id AND c2.account_code = '111'
  ) WHERE tenant_id = p_tenant_id AND account_code = '1111';

  UPDATE public.chart_of_accounts SET parent_id = (
    SELECT id FROM public.chart_of_accounts c2
    WHERE c2.tenant_id = p_tenant_id AND c2.account_code = '112'
  ) WHERE tenant_id = p_tenant_id AND account_code = '1121';

  -- Set parent_id for equity sub-accounts
  UPDATE public.chart_of_accounts SET parent_id = (
    SELECT id FROM public.chart_of_accounts c2
    WHERE c2.tenant_id = p_tenant_id AND c2.account_code = '411'
  ) WHERE tenant_id = p_tenant_id AND account_code = '4111';

  -- Set parent_id for sub-accounts of 338
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
