CREATE OR REPLACE FUNCTION public.get_cash_variance_action_target(
  p_branch_id bigint,
  p_start_date date,
  p_end_date date
) RETURNS TABLE(
  session_id bigint,
  branch_id bigint,
  cash_difference numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'invalid_date_range' USING ERRCODE = '22023';
  END IF;
  IF p_branch_id IS NOT NULL THEN
    IF NOT public.has_permission(p_branch_id, 'finance:view') THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_start := p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_end := (p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';

  RETURN QUERY
  SELECT session.id, session.branch_id, session.cash_difference
  FROM public.pos_sessions session
  WHERE session.tenant_id = v_tenant
    AND session.status = 'closed'
    AND session.closed_at >= v_start
    AND session.closed_at < v_end
    AND session.cash_difference IS NOT NULL
    AND session.variance_resolution_type IS NULL
    AND abs(session.cash_difference) > GREATEST(
      50000::numeric,
      ROUND(COALESCE(session.expected_cash, 0) * 0.005, 2)
    )
    AND (p_branch_id IS NULL OR session.branch_id = p_branch_id)
    AND public.has_permission(session.branch_id, 'finance:view')
  ORDER BY abs(session.cash_difference) DESC, session.closed_at, session.id
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_cash_variance_action_target(bigint, date, date)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_cash_variance_action_target(bigint, date, date)
  TO authenticated;

COMMENT ON FUNCTION public.get_cash_variance_action_target(bigint, date, date) IS
  'Returns the highest-value unresolved POS cash variance so Finance can deep-link to the exact session.';

CREATE OR REPLACE FUNCTION public.get_finance_reconciliation_attention(
  p_start_date date,
  p_end_date date
) RETURNS TABLE(
  unmatched_bank_count bigint,
  unmatched_bank_amount numeric,
  unmatched_money_in_count bigint,
  unmatched_money_out_count bigint,
  missing_vietqr_count bigint,
  missing_vietqr_amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'invalid_date_range' USING ERRCODE = '22023';
  END IF;

  v_start := p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_end := (p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';

  RETURN QUERY
  WITH unmatched_bank AS (
    SELECT transaction.transfer_type, transaction.amount
    FROM public.bank_transactions transaction
    WHERE transaction.tenant_id = v_tenant
      AND transaction.occurred_at >= v_start
      AND transaction.occurred_at < v_end
      AND NOT EXISTS (
        SELECT 1
        FROM public.bank_transaction_reconciliation_matches reconciliation
        WHERE reconciliation.tenant_id = transaction.tenant_id
          AND reconciliation.bank_transaction_id = transaction.id
      )
  ),
  missing_vietqr AS (
    SELECT payment.amount
    FROM public.payments payment
    WHERE payment.tenant_id = v_tenant
      AND payment.method = 'vietqr'
      AND payment.status = 'completed'
      AND payment.paid_at >= v_start
      AND payment.paid_at < v_end
      AND NOT EXISTS (
        SELECT 1
        FROM public.bank_transaction_reconciliation_matches reconciliation
        WHERE reconciliation.tenant_id = payment.tenant_id
          AND reconciliation.payment_id = payment.id
      )
  )
  SELECT
    (SELECT COUNT(*)::bigint FROM unmatched_bank),
    (SELECT COALESCE(SUM(entry.amount), 0) FROM unmatched_bank entry),
    (SELECT COUNT(*)::bigint FROM unmatched_bank entry WHERE entry.transfer_type = 'in'),
    (SELECT COUNT(*)::bigint FROM unmatched_bank entry WHERE entry.transfer_type = 'out'),
    (SELECT COUNT(*)::bigint FROM missing_vietqr),
    (SELECT COALESCE(SUM(entry.amount), 0) FROM missing_vietqr entry);
END;
$$;

REVOKE ALL ON FUNCTION public.get_finance_reconciliation_attention(date, date)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_finance_reconciliation_attention(date, date)
  TO authenticated;

COMMENT ON FUNCTION public.get_finance_reconciliation_attention(date, date) IS
  'Counts unmatched canonical SePay movements and completed VietQR payments without canonical bank evidence for the selected VN business-date range.';
