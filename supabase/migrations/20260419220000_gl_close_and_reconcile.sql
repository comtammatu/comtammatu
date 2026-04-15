-- =============================================================
-- GL Phase 3.3 — close_fiscal_period() + reconciliation
-- Month-end close: refresh MVs, run reconciliation, close period.
-- gl_reconciliation() compares subledger totals vs GL totals.
-- =============================================================

-- ─── 1. GL Reconciliation RPC ───
-- Compares source document totals vs journal entry totals per category.
-- Returns JSONB array of {category, subledger_total, gl_total, difference}.

CREATE OR REPLACE FUNCTION public.gl_reconciliation(
  p_tenant_id BIGINT,
  p_year      INT,
  p_month     INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date DATE;
  v_end_date   DATE;
  v_result     JSONB := '[]'::JSONB;
  v_sub_total  NUMERIC(15,2);
  v_gl_total   NUMERIC(15,2);
  v_entry_ids  BIGINT[];
BEGIN
  v_start_date := make_date(p_year, p_month, 1);
  v_end_date   := (v_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  -- Collect posted journal entry IDs in period
  SELECT ARRAY_AGG(je.id)
  INTO v_entry_ids
  FROM public.journal_entries je
  WHERE je.tenant_id = p_tenant_id
    AND je.status = 'posted'
    AND je.entry_date >= v_start_date
    AND je.entry_date <= v_end_date;

  IF v_entry_ids IS NULL THEN
    v_entry_ids := ARRAY[]::BIGINT[];
  END IF;

  -- ═══ 1. SALES: payments vs GL revenue (511) + VAT (33311) ═══
  -- payments.amount is gross (includes VAT), so compare against 511 + 33311 credits
  SELECT COALESCE(SUM(p.amount), 0) INTO v_sub_total
  FROM public.payments p
  WHERE p.tenant_id = p_tenant_id
    AND p.status = 'completed'
    AND p.paid_at >= v_start_date
    AND p.paid_at < (v_end_date + INTERVAL '1 day');

  SELECT COALESCE(SUM(jel.credit_amount), 0) INTO v_gl_total
  FROM public.journal_entry_lines jel
  JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  WHERE jel.tenant_id = p_tenant_id
    AND jel.journal_entry_id = ANY(v_entry_ids)
    AND coa.account_code IN ('511', '33311')
    AND je.reference_type = 'sale';

  v_result := v_result || jsonb_build_array(jsonb_build_object(
    'category', 'Doanh thu + VAT (511+33311)',
    'subledger_total', v_sub_total,
    'gl_total', v_gl_total,
    'difference', v_sub_total - v_gl_total
  ));

  -- ═══ 2. COGS: stock consumption vs GL expense (account 621) ═══
  SELECT COALESCE(SUM(ABS(sm.quantity_change) * sm.unit_cost), 0) INTO v_sub_total
  FROM public.stock_movements sm
  WHERE sm.tenant_id = p_tenant_id
    AND sm.type = 'consumption'
    AND sm.created_at >= v_start_date
    AND sm.created_at < (v_end_date + INTERVAL '1 day');

  SELECT COALESCE(SUM(jel.debit_amount), 0) INTO v_gl_total
  FROM public.journal_entry_lines jel
  JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  WHERE jel.tenant_id = p_tenant_id
    AND jel.journal_entry_id = ANY(v_entry_ids)
    AND coa.account_code = '621'
    AND je.reference_type = 'sale';

  v_result := v_result || jsonb_build_array(jsonb_build_object(
    'category', 'Giá vốn bán hàng (621-sale)',
    'subledger_total', v_sub_total,
    'gl_total', v_gl_total,
    'difference', v_sub_total - v_gl_total
  ));

  -- ═══ 3. INVENTORY IN: GRN value vs GL inventory debit (account 152, purchase) ═══
  SELECT COALESCE(SUM(sm.quantity_change * sm.unit_cost), 0) INTO v_sub_total
  FROM public.stock_movements sm
  WHERE sm.tenant_id = p_tenant_id
    AND sm.type = 'grn_receipt'
    AND sm.created_at >= v_start_date
    AND sm.created_at < (v_end_date + INTERVAL '1 day');

  SELECT COALESCE(SUM(jel.debit_amount), 0) INTO v_gl_total
  FROM public.journal_entry_lines jel
  JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  WHERE jel.tenant_id = p_tenant_id
    AND jel.journal_entry_id = ANY(v_entry_ids)
    AND coa.account_code = '152'
    AND je.reference_type = 'purchase';

  v_result := v_result || jsonb_build_array(jsonb_build_object(
    'category', 'Nhập kho NVL (152-purchase)',
    'subledger_total', v_sub_total,
    'gl_total', v_gl_total,
    'difference', v_sub_total - v_gl_total
  ));

  -- ═══ 4. PAYROLL: gross salary vs GL payroll expense (account 622) ═══
  SELECT COALESCE(SUM(pe.gross_total), 0) INTO v_sub_total
  FROM public.payroll_entries pe
  JOIN public.payroll_periods pp ON pp.id = pe.payroll_period_id
  WHERE pe.tenant_id = p_tenant_id
    AND pp.period_year = p_year
    AND pp.period_month = p_month
    AND pp.status IN ('approved', 'paid');

  SELECT COALESCE(SUM(jel.debit_amount), 0) INTO v_gl_total
  FROM public.journal_entry_lines jel
  JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  WHERE jel.tenant_id = p_tenant_id
    AND jel.journal_entry_id = ANY(v_entry_ids)
    AND coa.account_code = '622'
    AND je.reference_type = 'payroll';

  v_result := v_result || jsonb_build_array(jsonb_build_object(
    'category', 'Lương nhân công (622)',
    'subledger_total', v_sub_total,
    'gl_total', v_gl_total,
    'difference', v_sub_total - v_gl_total
  ));

  -- ═══ 5. AP PAYMENTS: supplier payments vs GL AP reduction (account 331 debit) ═══
  SELECT COALESCE(SUM(sp.amount), 0) INTO v_sub_total
  FROM public.supplier_payments sp
  WHERE sp.tenant_id = p_tenant_id
    AND sp.payment_date >= v_start_date
    AND sp.payment_date < (v_end_date + INTERVAL '1 day');

  SELECT COALESCE(SUM(jel.debit_amount), 0) INTO v_gl_total
  FROM public.journal_entry_lines jel
  JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  WHERE jel.tenant_id = p_tenant_id
    AND jel.journal_entry_id = ANY(v_entry_ids)
    AND coa.account_code = '331'
    AND je.reference_type = 'purchase';

  v_result := v_result || jsonb_build_array(jsonb_build_object(
    'category', 'Thanh toán NCC (331-purchase)',
    'subledger_total', v_sub_total,
    'gl_total', v_gl_total,
    'difference', v_sub_total - v_gl_total
  ));

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.gl_reconciliation(BIGINT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gl_reconciliation(BIGINT, INT, INT) TO authenticated;


-- ─── 2. Close Fiscal Period RPC ───

CREATE OR REPLACE FUNCTION public.close_fiscal_period(
  p_tenant_id BIGINT,
  p_year      INT,
  p_month     INT,
  p_notes     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           UUID := auth.uid();
  v_period        RECORD;
  v_recon         JSONB;
  v_has_diff      BOOLEAN := false;
  v_item          JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF public.auth_role() NOT IN ('owner', 'super_manager') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Fetch period
  SELECT fp.* INTO v_period
  FROM public.fiscal_periods fp
  WHERE fp.tenant_id = p_tenant_id
    AND fp.period_month = p_month
    AND fp.period_year = p_year
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'fiscal_period_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_period.status = 'closed' THEN
    RAISE EXCEPTION 'fiscal_period_already_closed' USING ERRCODE = '22023';
  END IF;

  -- Step 1: Set status to 'closing'
  UPDATE public.fiscal_periods
  SET status = 'closing', updated_at = now()
  WHERE id = v_period.id;

  -- Step 2: Refresh materialized views
  PERFORM public.refresh_finance_views();

  -- Step 3: Run reconciliation
  v_recon := public.gl_reconciliation(p_tenant_id, p_year, p_month);

  -- Check for discrepancies (tolerance: 1 VND)
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_recon)
  LOOP
    IF ABS((v_item ->> 'difference')::NUMERIC) > 1 THEN
      v_has_diff := true;
    END IF;
  END LOOP;

  -- Step 4: Close the period
  UPDATE public.fiscal_periods
  SET status = 'closed',
      closed_by = v_uid,
      closed_at = now(),
      notes = COALESCE(p_notes, '') ||
        CASE WHEN v_has_diff THEN ' [CẢNH BÁO: Có chênh lệch đối chiếu]' ELSE '' END,
      updated_at = now()
  WHERE id = v_period.id;

  RETURN jsonb_build_object(
    'period_id', v_period.id,
    'status', 'closed',
    'has_discrepancies', v_has_diff,
    'reconciliation', v_recon
  );
END;
$$;

REVOKE ALL ON FUNCTION public.close_fiscal_period(BIGINT, INT, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_fiscal_period(BIGINT, INT, INT, TEXT) TO authenticated;
