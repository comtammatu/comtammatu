-- Read-only period-close readiness health check (Chốt sổ Sức khoẻ tài chính).
-- Advisory only: never mutates accounting_periods and never blocks closes.

CREATE FUNCTION public.get_finance_period_close_readiness(
  p_year integer,
  p_month integer,
  p_branch_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_start date;
  v_end date;
  v_month_start_utc timestamptz;
  v_month_end_utc timestamptz;
  v_period_status text;
  v_valuation_active boolean;
  v_recon jsonb;
  v_food jsonb;
  v_expense jsonb;
  v_variance numeric;
  v_missing_opex_branches bigint[];
  v_negative_stock integer;
  v_desync_count integer;
  v_unpaid_count integer;
  v_recon_attention jsonb := '{}'::jsonb;
  v_blockers jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_year < 2000 OR p_month NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'invalid_period' USING ERRCODE = '22023';
  END IF;

  v_start := make_date(p_year, p_month, 1);
  v_end := (v_start + INTERVAL '1 month' - INTERVAL '1 day')::date;
  v_month_start_utc := v_start::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_month_end_utc :=
    (v_end + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';

  SELECT CASE
      WHEN period.hard_closed_at IS NOT NULL THEN 'hard_closed'
      WHEN period.soft_closed_at IS NOT NULL THEN 'soft_closed'
      ELSE 'open'
    END
  INTO v_period_status
  FROM public.accounting_periods period
  WHERE period.tenant_id = v_tenant
    AND period.year = p_year
    AND period.month = p_month;
  IF NOT FOUND THEN v_period_status := 'open'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.inventory_valuation_cutovers cutover
    WHERE cutover.tenant_id = v_tenant AND cutover.status = 'active'
  ) INTO v_valuation_active;
  IF NOT v_valuation_active THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'valuation_inactive', 'severity', 'blocker'));
  END IF;

  IF v_valuation_active THEN
    -- The accountant role holds finance:view but NOT inventory:valuation_read,
    -- so the reconciliation RPC raises 42501 for accountants while the cutover
    -- is active; downgrade that gate mismatch to a warning instead of aborting
    -- the whole health check (same insufficient_privilege pattern as the
    -- finance operating cockpit).
    BEGIN
      v_recon := public.get_inventory_valuation_reconciliation(
        p_year, p_month, p_branch_id);
      IF COALESCE((v_recon->>'is_reconciled')::boolean, false) = false THEN
        v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
          'code', 'valuation_not_reconciled', 'severity', 'blocker',
          'detail', v_recon));
      END IF;
    EXCEPTION
      WHEN insufficient_privilege THEN
        v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
          'code', 'valuation_reconciliation_unreadable',
          'severity', 'warning'));
    END;
  END IF;

  SELECT COALESCE(array_agg(branch.id), ARRAY[]::bigint[])
  INTO v_missing_opex_branches
  FROM public.branches branch
  WHERE branch.tenant_id = v_tenant
    AND branch.branch_kind = 'branch'
    AND COALESCE(branch.is_active, true)
    AND (p_branch_id IS NULL OR branch.id = p_branch_id)
    AND EXISTS (
      SELECT 1
      FROM public.payments payment
      WHERE payment.tenant_id = v_tenant
        AND payment.branch_id = branch.id
        AND payment.status = 'completed'
        AND payment.paid_at >= v_month_start_utc
        AND payment.paid_at < v_month_end_utc
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.expenses expense
      WHERE expense.tenant_id = v_tenant
        AND expense.branch_id = branch.id
        AND expense.expense_date >= v_start
        AND expense.expense_date <= v_end
        AND expense.category IN (
          'rent','utilities','gas_fuel','salary','repair','supplies',
          'marketing','fees_tax','hospitality','other')
    );
  IF cardinality(v_missing_opex_branches) > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'operating_expense_missing', 'severity', 'blocker',
      'branches', to_jsonb(v_missing_opex_branches)));
  END IF;

  SELECT COUNT(*)::integer INTO v_negative_stock
  FROM public.stock_levels stock
  WHERE stock.tenant_id = v_tenant
    AND stock.current_quantity < 0
    AND (p_branch_id IS NULL OR stock.branch_id = p_branch_id);
  IF v_negative_stock > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'negative_stock', 'severity', 'blocker',
      'count', v_negative_stock));
  END IF;

  v_food := public.get_finance_food_cost_recorded(
    v_start, v_end, p_branch_id);
  IF COALESCE((v_food->>'coverage_complete')::boolean, false) = false THEN
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'code', 'food_cost_coverage_incomplete', 'severity', 'warning',
      'paid_order_count', (v_food->>'paid_order_count')::integer,
      'covered_order_count', (v_food->>'covered_order_count')::integer));
  END IF;

  v_expense := public.get_finance_expense_period_summary(
    CASE WHEN p_branch_id IS NULL THEN 'all' ELSE 'branch' END,
    v_start, v_end, p_branch_id);
  IF COALESCE((v_expense->>'needs_action_count')::integer, 0) > 0 THEN
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'code', 'expenses_needs_action', 'severity', 'warning',
      'count', (v_expense->>'needs_action_count')::integer,
      'amount', v_expense->>'needs_action_total'));
  END IF;

  SELECT COALESCE(SUM(summary.abs_variance_total), 0)
  INTO v_variance
  FROM public.get_cash_variance_summary(p_branch_id, v_start, v_end) summary;
  IF v_variance > 0 THEN
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'code', 'cash_variance_open', 'severity', 'warning',
      'amount', v_variance::text));
  END IF;

  IF p_branch_id IS NULL THEN
    SELECT jsonb_build_object(
      'unmatched_bank_count', attn.unmatched_bank_count,
      'missing_vietqr_count', attn.missing_vietqr_count)
    INTO v_recon_attention
    FROM public.get_finance_reconciliation_attention(v_start, v_end) attn;
    IF COALESCE((v_recon_attention->>'unmatched_bank_count')::integer, 0) > 0
      OR COALESCE((v_recon_attention->>'missing_vietqr_count')::integer, 0) > 0
    THEN
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
        'code', 'bank_reconciliation_open', 'severity', 'warning',
        'detail', v_recon_attention));
    END IF;
  END IF;

  SELECT COUNT(*)::integer INTO v_desync_count
  FROM public.find_payment_order_desync(v_month_start_utc) desync
  WHERE desync.payment_paid_at < v_month_end_utc
    AND (p_branch_id IS NULL OR desync.branch_id = p_branch_id);
  IF v_desync_count > 0 THEN
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'code', 'payment_desync_open', 'severity', 'warning',
      'count', v_desync_count));
  END IF;

  SELECT COUNT(*)::integer INTO v_unpaid_count
  FROM public.supplier_invoices invoice
  WHERE invoice.tenant_id = v_tenant
    AND invoice.document_status IN ('confirmed', 'adjusted')
    AND invoice.payment_status IS DISTINCT FROM 'paid'
    AND invoice.invoice_date >= v_start
    AND invoice.invoice_date <= v_end;
  IF v_unpaid_count > 0 THEN
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'code', 'unpaid_supplier_invoices', 'severity', 'warning',
      'count', v_unpaid_count));
  END IF;

  RETURN jsonb_build_object(
    'year', p_year,
    'month', p_month,
    'branch_id', p_branch_id,
    'period_status', v_period_status,
    'valuation_active', v_valuation_active,
    'blocker_count', jsonb_array_length(v_blockers),
    'warning_count', jsonb_array_length(v_warnings),
    'can_close', jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers,
    'warnings', v_warnings
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.get_finance_period_close_readiness(integer, integer, bigint)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.get_finance_period_close_readiness(integer, integer, bigint)
  TO authenticated;
COMMENT ON FUNCTION
  public.get_finance_period_close_readiness(integer, integer, bigint) IS
  'Read-only close-readiness health check (Chốt sổ Sức khoẻ tài chính). Never mutates accounting_periods; blockers flag periods whose Kết quả kinh doanh cannot be trusted.';
