CREATE OR REPLACE FUNCTION public.get_operating_cash_movement_for_period(
  p_start_date date,
  p_end_date date,
  p_branch_id bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_cash_collections numeric;
  v_cash_refunds numeric;
  v_cash_expenses numeric;
  v_cash_supplier_payments numeric;
  v_cash_out numeric;
BEGIN
  IF v_actor IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.auth_is_owner(v_actor)
  THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date
  THEN
    RAISE EXCEPTION 'invalid_period' USING ERRCODE = '22023';
  END IF;

  v_start_at := p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_end_at := (p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';

  SELECT COALESCE(sum(payment.amount), 0)
  INTO v_cash_collections
  FROM public.payments payment
  WHERE payment.tenant_id = v_tenant_id
    AND payment.method = 'cash'
    AND payment.status IN ('completed', 'refunded')
    AND payment.paid_at >= v_start_at
    AND payment.paid_at < v_end_at
    AND (p_branch_id IS NULL OR payment.branch_id = p_branch_id);

  SELECT COALESCE(sum(refund.amount), 0)
  INTO v_cash_refunds
  FROM public.refunds refund
  WHERE refund.tenant_id = v_tenant_id
    AND refund.status = 'approved'
    AND refund.payout_method = 'cash'
    AND refund.approved_at >= v_start_at
    AND refund.approved_at < v_end_at
    AND (p_branch_id IS NULL OR refund.branch_id = p_branch_id);

  SELECT COALESCE(sum(expense.amount), 0)
  INTO v_cash_expenses
  FROM public.expenses expense
  WHERE expense.tenant_id = v_tenant_id
    AND expense.payment_method = 'cash'
    AND expense.paid_at IS NOT NULL
    AND expense.category IN (
      'rent',
      'utilities',
      'gas_fuel',
      'salary',
      'supplies',
      'repair',
      'marketing',
      'fees_tax',
      'other'
    )
    AND expense.expense_date >= p_start_date
    AND expense.expense_date <= p_end_date
    AND (p_branch_id IS NULL OR expense.branch_id = p_branch_id);

  SELECT COALESCE(sum(supplier_payment.amount), 0)
  INTO v_cash_supplier_payments
  FROM public.supplier_payments supplier_payment
  JOIN public.supplier_invoices supplier_invoice
    ON supplier_invoice.id = supplier_payment.supplier_invoice_id
   AND supplier_invoice.tenant_id = supplier_payment.tenant_id
  LEFT JOIN public.goods_received_notes grn
    ON grn.id = supplier_invoice.grn_id
   AND grn.tenant_id = supplier_invoice.tenant_id
  WHERE supplier_payment.tenant_id = v_tenant_id
    AND supplier_payment.payment_method = 'cash'
    AND supplier_payment.payment_date >= v_start_at
    AND supplier_payment.payment_date < v_end_at
    AND (p_branch_id IS NULL OR grn.branch_id = p_branch_id);

  v_cash_out := v_cash_refunds + v_cash_expenses + v_cash_supplier_payments;

  RETURN jsonb_build_object(
    'cash_collections', v_cash_collections,
    'cash_refunds', v_cash_refunds,
    'cash_expenses', v_cash_expenses,
    'cash_supplier_payments', v_cash_supplier_payments,
    'cash_out', v_cash_out,
    'net_cash_movement', v_cash_collections - v_cash_out
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_operating_cash_movement_for_period(
  date,
  date,
  bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_operating_cash_movement_for_period(
  date,
  date,
  bigint
) TO authenticated;
