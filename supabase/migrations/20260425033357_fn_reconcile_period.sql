-- =============================================================
-- M6 Branch B — Reconciliation Period RPC + Drilldown
-- =============================================================
-- Extends gl_reconciliation(year, month) with arbitrary date range +
-- optional branch filter, plus a per-category drilldown returning the
-- raw subledger or GL lines that make up the totals.
--
-- Migrates the auth gate from legacy auth_role() to Auth v2
-- has_permission_any('finance:view'). Old gl_reconciliation(year, month)
-- is preserved as a thin wrapper so close_fiscal_period() callsite at
-- 20260419220000_gl_close_and_reconcile.sql:243 keeps working unchanged.
--
-- Categories returned (5 total — same as gl_reconciliation):
--   sales         — payments completed vs 511+33311 credits (sale)
--   cogs          — stock consumption vs 621 debit (sale)
--   inventory_in  — GRN value vs 152 debit (purchase)
--   payroll       — gross salary vs 622 debit (payroll)  [tenant-wide only]
--   ap_payment    — supplier payments vs 331 debit (purchase)  [tenant-wide only]
--
-- Branch filter behaviour: payroll + ap_payment do NOT carry branch_id on
-- the subledger side, so when p_branch_id IS NOT NULL they return
-- subledger_total = NULL with branch_scoped = false in the metadata —
-- the UI shows them as "Áp dụng toàn doanh nghiệp" instead of zero.

-- ─── Partial index for branch-filtered date range scans ───
CREATE INDEX IF NOT EXISTS idx_je_branch_date
  ON public.journal_entries (tenant_id, branch_id, entry_date)
  WHERE status = 'posted';


-- ─── Core RPC: fn_reconcile_period ───
CREATE OR REPLACE FUNCTION public.fn_reconcile_period(
  p_tenant_id  BIGINT,
  p_start_date DATE,
  p_end_date   DATE,
  p_branch_id  BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result     JSONB := '[]'::JSONB;
  v_sub_total  NUMERIC(15,2);
  v_gl_total   NUMERIC(15,2);
  v_entry_ids  BIGINT[];
  v_branch_active BOOLEAN := p_branch_id IS NOT NULL;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_tenant_id <> public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'invalid_date_range' USING ERRCODE = '22023';
  END IF;
  IF (p_end_date - p_start_date) > 366 THEN
    RAISE EXCEPTION 'date_range_too_large' USING ERRCODE = '22023';
  END IF;

  -- Posted journal entry IDs in window, optionally filtered by branch
  SELECT ARRAY_AGG(je.id)
  INTO v_entry_ids
  FROM public.journal_entries je
  WHERE je.tenant_id = p_tenant_id
    AND je.status = 'posted'
    AND je.entry_date >= p_start_date
    AND je.entry_date < (p_end_date + INTERVAL '1 day')
    AND (p_branch_id IS NULL OR je.branch_id = p_branch_id);

  IF v_entry_ids IS NULL THEN
    v_entry_ids := ARRAY[]::BIGINT[];
  END IF;

  -- ═══ 1. SALES ═══
  SELECT COALESCE(SUM(p.amount), 0) INTO v_sub_total
  FROM public.payments p
  WHERE p.tenant_id = p_tenant_id
    AND p.status = 'completed'
    AND p.paid_at >= p_start_date
    AND p.paid_at < (p_end_date + INTERVAL '1 day')
    AND (p_branch_id IS NULL OR p.branch_id = p_branch_id);

  SELECT COALESCE(SUM(jel.credit_amount), 0) INTO v_gl_total
  FROM public.journal_entry_lines jel
  JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  WHERE jel.tenant_id = p_tenant_id
    AND jel.journal_entry_id = ANY(v_entry_ids)
    AND coa.account_code IN ('511', '33311')
    AND je.reference_type = 'sale';

  v_result := v_result || jsonb_build_array(jsonb_build_object(
    'category', 'sales',
    'label', 'Doanh thu + VAT (511+33311)',
    'subledger_total', v_sub_total,
    'gl_total', v_gl_total,
    'difference', v_sub_total - v_gl_total,
    'branch_scoped', true
  ));

  -- ═══ 2. COGS ═══
  SELECT COALESCE(SUM(ABS(sm.quantity_change) * sm.unit_cost), 0) INTO v_sub_total
  FROM public.stock_movements sm
  WHERE sm.tenant_id = p_tenant_id
    AND sm.type = 'consumption'
    AND sm.created_at >= p_start_date
    AND sm.created_at < (p_end_date + INTERVAL '1 day')
    AND (p_branch_id IS NULL OR sm.branch_id = p_branch_id);

  SELECT COALESCE(SUM(jel.debit_amount), 0) INTO v_gl_total
  FROM public.journal_entry_lines jel
  JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  WHERE jel.tenant_id = p_tenant_id
    AND jel.journal_entry_id = ANY(v_entry_ids)
    AND coa.account_code = '621'
    AND je.reference_type = 'sale';

  v_result := v_result || jsonb_build_array(jsonb_build_object(
    'category', 'cogs',
    'label', 'Giá vốn bán hàng (621-sale)',
    'subledger_total', v_sub_total,
    'gl_total', v_gl_total,
    'difference', v_sub_total - v_gl_total,
    'branch_scoped', true
  ));

  -- ═══ 3. INVENTORY IN ═══
  SELECT COALESCE(SUM(sm.quantity_change * sm.unit_cost), 0) INTO v_sub_total
  FROM public.stock_movements sm
  WHERE sm.tenant_id = p_tenant_id
    AND sm.type = 'grn_receipt'
    AND sm.created_at >= p_start_date
    AND sm.created_at < (p_end_date + INTERVAL '1 day')
    AND (p_branch_id IS NULL OR sm.branch_id = p_branch_id);

  SELECT COALESCE(SUM(jel.debit_amount), 0) INTO v_gl_total
  FROM public.journal_entry_lines jel
  JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  WHERE jel.tenant_id = p_tenant_id
    AND jel.journal_entry_id = ANY(v_entry_ids)
    AND coa.account_code = '152'
    AND je.reference_type = 'purchase';

  v_result := v_result || jsonb_build_array(jsonb_build_object(
    'category', 'inventory_in',
    'label', 'Nhập kho NVL (152-purchase)',
    'subledger_total', v_sub_total,
    'gl_total', v_gl_total,
    'difference', v_sub_total - v_gl_total,
    'branch_scoped', true
  ));

  -- ═══ 4. PAYROLL — tenant-wide subledger ═══
  IF v_branch_active THEN
    v_sub_total := NULL;
    v_gl_total  := NULL;
  ELSE
    SELECT COALESCE(SUM(pe.gross_total), 0) INTO v_sub_total
    FROM public.payroll_entries pe
    JOIN public.payroll_periods pp ON pp.id = pe.payroll_period_id
    WHERE pe.tenant_id = p_tenant_id
      AND make_date(pp.period_year, pp.period_month, 1) >= date_trunc('month', p_start_date)::DATE
      AND make_date(pp.period_year, pp.period_month, 1) <= date_trunc('month', p_end_date)::DATE
      AND pp.status IN ('approved', 'paid');

    SELECT COALESCE(SUM(jel.debit_amount), 0) INTO v_gl_total
    FROM public.journal_entry_lines jel
    JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE jel.tenant_id = p_tenant_id
      AND jel.journal_entry_id = ANY(v_entry_ids)
      AND coa.account_code = '622'
      AND je.reference_type = 'payroll';
  END IF;

  v_result := v_result || jsonb_build_array(jsonb_build_object(
    'category', 'payroll',
    'label', 'Lương nhân công (622)',
    'subledger_total', v_sub_total,
    'gl_total', v_gl_total,
    'difference', CASE
      WHEN v_sub_total IS NULL OR v_gl_total IS NULL THEN NULL
      ELSE v_sub_total - v_gl_total
    END,
    'branch_scoped', false
  ));

  -- ═══ 5. AP PAYMENT — tenant-wide subledger ═══
  IF v_branch_active THEN
    v_sub_total := NULL;
    v_gl_total  := NULL;
  ELSE
    SELECT COALESCE(SUM(sp.amount), 0) INTO v_sub_total
    FROM public.supplier_payments sp
    WHERE sp.tenant_id = p_tenant_id
      AND sp.payment_date >= p_start_date
      AND sp.payment_date < (p_end_date + INTERVAL '1 day');

    SELECT COALESCE(SUM(jel.debit_amount), 0) INTO v_gl_total
    FROM public.journal_entry_lines jel
    JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE jel.tenant_id = p_tenant_id
      AND jel.journal_entry_id = ANY(v_entry_ids)
      AND coa.account_code = '331'
      AND je.reference_type = 'purchase';
  END IF;

  v_result := v_result || jsonb_build_array(jsonb_build_object(
    'category', 'ap_payment',
    'label', 'Thanh toán NCC (331-purchase)',
    'subledger_total', v_sub_total,
    'gl_total', v_gl_total,
    'difference', CASE
      WHEN v_sub_total IS NULL OR v_gl_total IS NULL THEN NULL
      ELSE v_sub_total - v_gl_total
    END,
    'branch_scoped', false
  ));

  RETURN jsonb_build_object(
    'tenant_id', p_tenant_id,
    'branch_id', p_branch_id,
    'start_date', p_start_date,
    'end_date', p_end_date,
    'generated_at', now(),
    'categories', v_result
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_reconcile_period(BIGINT, DATE, DATE, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_reconcile_period(BIGINT, DATE, DATE, BIGINT) TO authenticated;


-- ─── Drilldown RPC ───
CREATE OR REPLACE FUNCTION public.fn_reconcile_drilldown(
  p_tenant_id  BIGINT,
  p_start_date DATE,
  p_end_date   DATE,
  p_category   TEXT,
  p_side       TEXT,
  p_branch_id  BIGINT DEFAULT NULL,
  p_limit      INT DEFAULT 200
)
RETURNS TABLE (
  ref_id      BIGINT,
  ref_label   TEXT,
  ref_date    TIMESTAMPTZ,
  branch_id   BIGINT,
  amount      NUMERIC(15,2),
  description TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_ids BIGINT[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_tenant_id <> public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;
  IF p_side NOT IN ('subledger', 'gl') THEN
    RAISE EXCEPTION 'invalid_side' USING ERRCODE = '22023';
  END IF;
  IF p_category NOT IN ('sales', 'cogs', 'inventory_in', 'payroll', 'ap_payment') THEN
    RAISE EXCEPTION 'invalid_category' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    p_limit := 200;
  END IF;

  IF p_side = 'gl' THEN
    SELECT ARRAY_AGG(je.id)
    INTO v_entry_ids
    FROM public.journal_entries je
    WHERE je.tenant_id = p_tenant_id
      AND je.status = 'posted'
      AND je.entry_date >= p_start_date
      AND je.entry_date < (p_end_date + INTERVAL '1 day')
      AND (p_branch_id IS NULL OR je.branch_id = p_branch_id);

    IF v_entry_ids IS NULL THEN
      RETURN;
    END IF;

    RETURN QUERY
    SELECT
      je.id                      AS ref_id,
      je.entry_number            AS ref_label,
      je.entry_date::TIMESTAMPTZ AS ref_date,
      je.branch_id               AS branch_id,
      CASE
        WHEN p_category IN ('sales')                   THEN jel.credit_amount
        WHEN p_category IN ('cogs', 'inventory_in', 'payroll', 'ap_payment')
          THEN jel.debit_amount
        ELSE 0
      END                        AS amount,
      COALESCE(jel.description, je.description) AS description
    FROM public.journal_entry_lines jel
    JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE jel.tenant_id = p_tenant_id
      AND jel.journal_entry_id = ANY(v_entry_ids)
      AND (
        (p_category = 'sales'        AND coa.account_code IN ('511', '33311') AND je.reference_type = 'sale') OR
        (p_category = 'cogs'         AND coa.account_code = '621'              AND je.reference_type = 'sale') OR
        (p_category = 'inventory_in' AND coa.account_code = '152'              AND je.reference_type = 'purchase') OR
        (p_category = 'payroll'      AND coa.account_code = '622'              AND je.reference_type = 'payroll') OR
        (p_category = 'ap_payment'   AND coa.account_code = '331'              AND je.reference_type = 'purchase')
      )
    ORDER BY je.entry_date DESC, je.id DESC
    LIMIT p_limit;
    RETURN;
  END IF;

  -- p_side = 'subledger'
  IF p_category = 'sales' THEN
    RETURN QUERY
    SELECT
      p.id                                  AS ref_id,
      ('PAY#' || p.id::TEXT)                AS ref_label,
      p.paid_at                             AS ref_date,
      p.branch_id                           AS branch_id,
      p.amount                              AS amount,
      ('Method: ' || COALESCE(p.method, '?')) AS description
    FROM public.payments p
    WHERE p.tenant_id = p_tenant_id
      AND p.status = 'completed'
      AND p.paid_at >= p_start_date
      AND p.paid_at < (p_end_date + INTERVAL '1 day')
      AND (p_branch_id IS NULL OR p.branch_id = p_branch_id)
    ORDER BY p.paid_at DESC
    LIMIT p_limit;

  ELSIF p_category = 'cogs' THEN
    RETURN QUERY
    SELECT
      sm.id                                       AS ref_id,
      ('SM#' || sm.id::TEXT)                      AS ref_label,
      sm.created_at                               AS ref_date,
      sm.branch_id                                AS branch_id,
      (ABS(sm.quantity_change) * sm.unit_cost)    AS amount,
      sm.type::TEXT                               AS description
    FROM public.stock_movements sm
    WHERE sm.tenant_id = p_tenant_id
      AND sm.type = 'consumption'
      AND sm.created_at >= p_start_date
      AND sm.created_at < (p_end_date + INTERVAL '1 day')
      AND (p_branch_id IS NULL OR sm.branch_id = p_branch_id)
    ORDER BY sm.created_at DESC
    LIMIT p_limit;

  ELSIF p_category = 'inventory_in' THEN
    RETURN QUERY
    SELECT
      sm.id                                  AS ref_id,
      ('GRN-SM#' || sm.id::TEXT)             AS ref_label,
      sm.created_at                          AS ref_date,
      sm.branch_id                           AS branch_id,
      (sm.quantity_change * sm.unit_cost)    AS amount,
      sm.type::TEXT                          AS description
    FROM public.stock_movements sm
    WHERE sm.tenant_id = p_tenant_id
      AND sm.type = 'grn_receipt'
      AND sm.created_at >= p_start_date
      AND sm.created_at < (p_end_date + INTERVAL '1 day')
      AND (p_branch_id IS NULL OR sm.branch_id = p_branch_id)
    ORDER BY sm.created_at DESC
    LIMIT p_limit;

  ELSIF p_category = 'payroll' THEN
    -- branch_id intentionally NULL — payroll is tenant-wide
    RETURN QUERY
    SELECT
      pe.id                                                            AS ref_id,
      ('Lương ' || pp.period_year || '-' || lpad(pp.period_month::TEXT, 2, '0')) AS ref_label,
      (make_date(pp.period_year, pp.period_month, 1))::TIMESTAMPTZ     AS ref_date,
      NULL::BIGINT                                                     AS branch_id,
      pe.gross_total                                                   AS amount,
      pp.status                                                        AS description
    FROM public.payroll_entries pe
    JOIN public.payroll_periods pp ON pp.id = pe.payroll_period_id
    WHERE pe.tenant_id = p_tenant_id
      AND make_date(pp.period_year, pp.period_month, 1) >= date_trunc('month', p_start_date)::DATE
      AND make_date(pp.period_year, pp.period_month, 1) <= date_trunc('month', p_end_date)::DATE
      AND pp.status IN ('approved', 'paid')
    ORDER BY pp.period_year DESC, pp.period_month DESC, pe.id DESC
    LIMIT p_limit;

  ELSIF p_category = 'ap_payment' THEN
    RETURN QUERY
    SELECT
      sp.id                       AS ref_id,
      ('SP#' || sp.id::TEXT)      AS ref_label,
      sp.payment_date::TIMESTAMPTZ AS ref_date,
      NULL::BIGINT                AS branch_id,
      sp.amount                   AS amount,
      ('Supplier #' || COALESCE(sp.supplier_id::TEXT, '?')) AS description
    FROM public.supplier_payments sp
    WHERE sp.tenant_id = p_tenant_id
      AND sp.payment_date >= p_start_date
      AND sp.payment_date < (p_end_date + INTERVAL '1 day')
    ORDER BY sp.payment_date DESC
    LIMIT p_limit;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_reconcile_drilldown(BIGINT, DATE, DATE, TEXT, TEXT, BIGINT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_reconcile_drilldown(BIGINT, DATE, DATE, TEXT, TEXT, BIGINT, INT) TO authenticated;


-- ─── Wrapper: gl_reconciliation(year, month) for back-compat ───
-- Preserves close_fiscal_period() callsite — projects new shape down to
-- the original [{category, subledger_total, gl_total, difference}] array.

CREATE OR REPLACE FUNCTION public.gl_reconciliation(
  p_tenant_id BIGINT,
  p_year      INT,
  p_month     INT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date DATE;
  v_end_date   DATE;
  v_full       JSONB;
BEGIN
  v_start_date := make_date(p_year, p_month, 1);
  v_end_date   := (v_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  v_full := public.fn_reconcile_period(p_tenant_id, v_start_date, v_end_date, NULL);

  RETURN (
    SELECT jsonb_agg(jsonb_build_object(
      'category', cat ->> 'label',
      'subledger_total', cat ->> 'subledger_total',
      'gl_total', cat ->> 'gl_total',
      'difference', cat ->> 'difference'
    ))
    FROM jsonb_array_elements(v_full -> 'categories') cat
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gl_reconciliation(BIGINT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gl_reconciliation(BIGINT, INT, INT) TO authenticated;
