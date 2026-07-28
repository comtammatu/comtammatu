CREATE OR REPLACE FUNCTION public.get_bank_ledger_movement_since(
  p_since timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_bank_in numeric;
  v_bank_out numeric;
BEGIN
  IF v_actor IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.has_permission_any('finance:view')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT
    COALESCE(sum(transaction.amount) FILTER (
      WHERE transaction.transfer_type = 'in'
    ), 0),
    COALESCE(sum(transaction.amount) FILTER (
      WHERE transaction.transfer_type = 'out'
    ), 0)
  INTO v_bank_in, v_bank_out
  FROM public.bank_transactions transaction
  WHERE transaction.tenant_id = v_tenant_id
    AND transaction.occurred_at >= p_since;

  RETURN jsonb_build_object(
    'bank_in', v_bank_in,
    'bank_out', v_bank_out
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cash_ledger_movement_since(
  p_since timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_cash_collections numeric;
  v_cash_refunds numeric;
  v_cash_expenses numeric;
  v_cash_supplier_payments numeric;
BEGIN
  IF v_actor IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.has_permission_any('finance:view')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(sum(payment.amount), 0)
  INTO v_cash_collections
  FROM public.payments payment
  WHERE payment.tenant_id = v_tenant_id
    AND payment.method = 'cash'
    AND payment.status IN ('completed', 'refunded')
    AND payment.paid_at >= p_since;

  SELECT COALESCE(sum(refund.amount), 0)
  INTO v_cash_refunds
  FROM public.refunds refund
  WHERE refund.tenant_id = v_tenant_id
    AND refund.status = 'approved'
    AND refund.payout_method = 'cash'
    AND refund.approved_at >= p_since;

  SELECT COALESCE(sum(expense.amount), 0)
  INTO v_cash_expenses
  FROM public.expenses expense
  WHERE expense.tenant_id = v_tenant_id
    AND expense.payment_method = 'cash'
    AND expense.paid_at >= p_since;

  SELECT COALESCE(sum(supplier_payment.amount), 0)
  INTO v_cash_supplier_payments
  FROM public.supplier_payments supplier_payment
  WHERE supplier_payment.tenant_id = v_tenant_id
    AND supplier_payment.payment_method = 'cash'
    AND supplier_payment.payment_date >= p_since;

  RETURN jsonb_build_object(
    'cash_collections', v_cash_collections,
    'cash_refunds', v_cash_refunds,
    'cash_expenses', v_cash_expenses,
    'cash_supplier_payments', v_cash_supplier_payments,
    'cash_variance_adjustments', 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_finance_current_funds()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_opening public.finance_fund_entries%ROWTYPE;
  v_cash_movement jsonb;
  v_bank_movement jsonb;
  v_cash_adjustments numeric;
  v_bank_adjustments numeric;
  v_cash_collections numeric;
  v_cash_refunds numeric;
  v_cash_expenses numeric;
  v_cash_supplier_payments numeric;
  v_bank_in numeric;
  v_bank_out numeric;
  v_legacy_settings_present boolean;
BEGIN
  IF v_actor IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.has_permission_any('finance:view')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_opening
  FROM public.finance_fund_entries entry
  WHERE entry.tenant_id = v_tenant_id
    AND entry.entry_type = 'opening';

  SELECT EXISTS (
    SELECT 1
    FROM public.system_settings setting
    WHERE setting.tenant_id = v_tenant_id
      AND setting.key IN (
        'cash_opening_balance',
        'bank_opening_balance',
        'cash_opening_date'
      )
  )
  INTO v_legacy_settings_present;

  IF v_opening.id IS NULL THEN
    RETURN jsonb_build_object(
      'has_opening', false,
      'opening_entry_id', NULL,
      'opening_cash', 0,
      'opening_bank', 0,
      'opening_effective_at', NULL,
      'cash_collections', 0,
      'cash_refunds', 0,
      'cash_expenses', 0,
      'cash_supplier_payments', 0,
      'cash_variance_adjustments', 0,
      'cash_adjustments', 0,
      'cash_current', 0,
      'bank_in', 0,
      'bank_out', 0,
      'bank_adjustments', 0,
      'bank_current', 0,
      'legacy_settings_present', v_legacy_settings_present
    );
  END IF;

  v_cash_movement :=
    public.get_cash_ledger_movement_since(v_opening.effective_at);
  v_bank_movement :=
    public.get_bank_ledger_movement_since(v_opening.effective_at);

  SELECT
    COALESCE(sum(entry.cash_delta), 0),
    COALESCE(sum(entry.bank_delta), 0)
  INTO v_cash_adjustments, v_bank_adjustments
  FROM public.finance_fund_entries entry
  WHERE entry.tenant_id = v_tenant_id
    AND entry.entry_type = 'adjustment'
    AND entry.effective_at >= v_opening.effective_at;

  v_cash_collections :=
    COALESCE((v_cash_movement ->> 'cash_collections')::numeric, 0);
  v_cash_refunds :=
    COALESCE((v_cash_movement ->> 'cash_refunds')::numeric, 0);
  v_cash_expenses :=
    COALESCE((v_cash_movement ->> 'cash_expenses')::numeric, 0);
  v_cash_supplier_payments :=
    COALESCE((v_cash_movement ->> 'cash_supplier_payments')::numeric, 0);
  v_bank_in := COALESCE((v_bank_movement ->> 'bank_in')::numeric, 0);
  v_bank_out := COALESCE((v_bank_movement ->> 'bank_out')::numeric, 0);

  RETURN jsonb_build_object(
    'has_opening', true,
    'opening_entry_id', v_opening.id,
    'opening_cash', v_opening.cash_delta,
    'opening_bank', v_opening.bank_delta,
    'opening_effective_at', v_opening.effective_at,
    'cash_collections', v_cash_collections,
    'cash_refunds', v_cash_refunds,
    'cash_expenses', v_cash_expenses,
    'cash_supplier_payments', v_cash_supplier_payments,
    'cash_variance_adjustments', 0,
    'cash_adjustments', v_cash_adjustments,
    'cash_current',
      v_opening.cash_delta
      + v_cash_collections
      - v_cash_refunds
      - v_cash_expenses
      - v_cash_supplier_payments
      + v_cash_adjustments,
    'bank_in', v_bank_in,
    'bank_out', v_bank_out,
    'bank_adjustments', v_bank_adjustments,
    'bank_current',
      v_opening.bank_delta
      + v_bank_in
      - v_bank_out
      + v_bank_adjustments,
    'legacy_settings_present', v_legacy_settings_present
  );
END;
$$;

COMMENT ON FUNCTION public.get_finance_current_funds()
IS 'Returns immutable opening funds, canonical cash and bank movements, audited adjustments, and current balances for callers with finance:view.';
