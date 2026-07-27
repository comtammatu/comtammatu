CREATE OR REPLACE FUNCTION public.initialize_finance_funds(
  p_cash_opening numeric,
  p_bank_opening numeric,
  p_effective_at timestamptz,
  p_reason text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_now timestamptz := statement_timestamp();
  v_effective_at timestamptz := COALESCE(p_effective_at, statement_timestamp());
  v_reason text := btrim(p_reason);
  v_existing public.finance_fund_entries%ROWTYPE;
  v_entry public.finance_fund_entries%ROWTYPE;
BEGIN
  IF v_actor IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.auth_is_owner(v_actor)
  THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  IF p_cash_opening IS NULL
    OR p_bank_opening IS NULL
    OR p_cash_opening < 0
    OR p_bank_opening < 0
    OR abs(p_cash_opening) > 100000000000
    OR abs(p_bank_opening) > 100000000000
    OR NOT isfinite(v_effective_at)
    OR v_effective_at > v_now
    OR v_reason IS NULL
    OR char_length(v_reason) NOT BETWEEN 5 AND 500
    OR p_idempotency_key IS NULL
  THEN
    RAISE EXCEPTION 'finance_fund_opening_invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('finance_funds:' || v_tenant_id::text, 0)
  );

  SELECT *
  INTO v_existing
  FROM public.finance_fund_entries entry
  WHERE entry.tenant_id = v_tenant_id
    AND entry.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.entry_type = 'opening'
      AND v_existing.cash_delta = p_cash_opening
      AND v_existing.bank_delta = p_bank_opening
      AND (
        v_existing.effective_at = p_effective_at
        OR (
          p_effective_at IS NULL
          AND v_existing.effective_at = v_existing.created_at
        )
      )
      AND v_existing.reason = v_reason
    THEN
      RETURN to_jsonb(v_existing);
    END IF;

    RAISE EXCEPTION 'finance_fund_idempotency_conflict'
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.finance_fund_entries entry
    WHERE entry.tenant_id = v_tenant_id
      AND entry.entry_type = 'opening'
  ) THEN
    RAISE EXCEPTION 'finance_funds_already_initialized'
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.system_settings setting
    WHERE setting.tenant_id = v_tenant_id
      AND setting.key IN (
        'cash_opening_balance',
        'bank_opening_balance',
        'cash_opening_date'
      )
  )
    AND current_setting(
      'app.finance_legacy_cutover_idempotency_key',
      true
    ) IS DISTINCT FROM p_idempotency_key::text
  THEN
    RAISE EXCEPTION 'finance_fund_legacy_cutover_required'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.finance_fund_entries (
    tenant_id,
    entry_type,
    cash_delta,
    bank_delta,
    effective_at,
    reason,
    created_by,
    idempotency_key,
    created_at
  ) VALUES (
    v_tenant_id,
    'opening',
    p_cash_opening,
    p_bank_opening,
    v_effective_at,
    v_reason,
    v_actor,
    p_idempotency_key,
    v_now
  )
  RETURNING * INTO v_entry;

  PERFORM public.log_audit(
    'finance_fund_opening_created',
    'finance_fund_entry',
    v_entry.id,
    NULL,
    jsonb_build_object(
      'entry_type', v_entry.entry_type,
      'cash_delta', v_entry.cash_delta,
      'bank_delta', v_entry.bank_delta,
      'effective_at', v_entry.effective_at,
      'reason', v_entry.reason,
      'idempotency_key', v_entry.idempotency_key
    )
  );

  RETURN to_jsonb(v_entry);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cash_ledger_movement_since(
  p_since timestamptz
) RETURNS jsonb
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
    OR NOT public.auth_is_owner(v_actor)
  THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
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
    OR NOT public.auth_is_owner(v_actor)
  THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
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

REVOKE ALL ON FUNCTION public.get_cash_ledger_movement_since(timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cash_ledger_movement_since(timestamptz)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.initialize_finance_funds(
  numeric,
  numeric,
  timestamptz,
  text,
  uuid
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.initialize_finance_funds(
  numeric,
  numeric,
  timestamptz,
  text,
  uuid
) TO authenticated;

REVOKE ALL ON FUNCTION public.get_finance_current_funds()
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_finance_current_funds()
  TO authenticated;

COMMENT ON FUNCTION public.initialize_finance_funds(
  numeric,
  numeric,
  timestamptz,
  text,
  uuid
) IS
  'Creates one immutable tenant fund opening. Legacy evidence requires an operator-controlled transaction whose local cutover key exactly matches the request idempotency key.';

COMMENT ON FUNCTION public.get_cash_ledger_movement_since(timestamptz) IS
  'Returns tenant cash-book movements from order payments, refunds, cash expenses, and cash supplier payments. POS session counts and variances are reconciliation evidence only.';

COMMENT ON FUNCTION public.get_finance_current_funds() IS
  'Returns immutable opening funds, canonical cash and bank movements, audited adjustments, and current balances in one PostgreSQL snapshot. POS session variance has no book delta.';
