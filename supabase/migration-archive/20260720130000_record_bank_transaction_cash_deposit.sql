CREATE OR REPLACE FUNCTION public.assert_bank_deposit_evidence(
  p_tenant_id bigint,
  p_expense_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_expense public.expenses%ROWTYPE;
BEGIN
  SELECT *
  INTO v_expense
  FROM public.expenses expense
  WHERE expense.tenant_id = p_tenant_id
    AND expense.id = p_expense_id;

  IF NOT FOUND OR v_expense.category <> 'bank_deposit' THEN
    RETURN;
  END IF;

  IF v_expense.payment_method <> 'cash'
    OR NOT (
      EXISTS (
        SELECT 1
        FROM public.webhook_events event
        WHERE event.tenant_id = v_expense.tenant_id
          AND event.provider = 'sepay'
          AND event.expense_id = v_expense.id
          AND event.signature_valid IS TRUE
          AND event.processing_status <> 'failed'
          AND event.payment_id IS NULL
          AND lower(COALESCE(event.payload->>'transferType', '')) = 'in'
          AND COALESCE(event.payload->>'transferAmount', '')
            ~ '^[0-9]+(\.[0-9]+)?$'
          AND (event.payload->>'transferAmount')::numeric = v_expense.amount
      )
      OR EXISTS (
        SELECT 1
        FROM public.bank_transaction_reconciliation_matches match
        JOIN public.bank_transactions transaction
          ON transaction.id = match.bank_transaction_id
         AND transaction.tenant_id = match.tenant_id
        WHERE match.tenant_id = v_expense.tenant_id
          AND match.expense_id = v_expense.id
          AND match.matched_amount = v_expense.amount
          AND transaction.transfer_type = 'in'
          AND transaction.amount = v_expense.amount
      )
    )
  THEN
    RAISE EXCEPTION 'bank_deposit_requires_verified_sepay_event'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_bank_deposit_evidence(bigint, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_bank_deposit_evidence(bigint, bigint)
  TO service_role;

CREATE OR REPLACE FUNCTION public.check_bank_reconciliation_match_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    IF OLD.expense_id IS NOT NULL THEN
      PERFORM public.assert_bank_deposit_evidence(
        OLD.tenant_id,
        OLD.expense_id
      );
    END IF;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    IF NEW.expense_id IS NOT NULL THEN
      PERFORM public.assert_bank_deposit_evidence(
        NEW.tenant_id,
        NEW.expense_id
      );
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.check_bank_reconciliation_match_evidence()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_bank_reconciliation_match_evidence()
  TO service_role;

CREATE CONSTRAINT TRIGGER trg_bank_reconciliation_matches_require_evidence
AFTER INSERT OR DELETE OR UPDATE
ON public.bank_transaction_reconciliation_matches
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.check_bank_reconciliation_match_evidence();

CREATE OR REPLACE FUNCTION public.record_bank_transaction_cash_deposit(
  p_bank_transaction_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_transaction public.bank_transactions%ROWTYPE;
  v_event public.webhook_events%ROWTYPE;
  v_expense_id bigint;
BEGIN
  IF v_actor IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.auth_is_owner(v_actor)
    OR NOT public.has_permission_any('finance:view')
  THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  SELECT transaction.*
  INTO v_transaction
  FROM public.bank_transactions transaction
  WHERE transaction.id = p_bank_transaction_id
    AND transaction.tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'bank_transaction_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_transaction.transfer_type <> 'in' THEN
    RAISE EXCEPTION 'bank_transaction_direction_mismatch'
      USING ERRCODE = '23514';
  END IF;

  SELECT expense.id
  INTO v_expense_id
  FROM public.bank_transaction_reconciliation_matches match
  JOIN public.expenses expense
    ON expense.id = match.expense_id
   AND expense.tenant_id = match.tenant_id
  WHERE match.tenant_id = v_tenant_id
    AND match.bank_transaction_id = v_transaction.id
    AND expense.category = 'bank_deposit'
    AND expense.payment_method = 'cash'
    AND expense.amount = v_transaction.amount
    AND match.matched_amount = v_transaction.amount;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'already_recorded',
      'expense_id', v_expense_id
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bank_transaction_reconciliation_matches match
    WHERE match.tenant_id = v_tenant_id
      AND match.bank_transaction_id = v_transaction.id
  ) THEN
    RAISE EXCEPTION 'bank_transaction_already_reconciled'
      USING ERRCODE = '23514';
  END IF;

  IF v_transaction.webhook_event_id IS NOT NULL THEN
    SELECT *
    INTO v_event
    FROM public.webhook_events event
    WHERE event.id = v_transaction.webhook_event_id
      AND event.tenant_id = v_tenant_id
    FOR UPDATE;

    IF NOT FOUND
      OR v_event.provider <> 'sepay'
      OR v_event.signature_valid IS NOT TRUE
      OR v_event.processing_status = 'failed'
      OR v_event.payment_id IS NOT NULL
    THEN
      RAISE EXCEPTION 'bank_transaction_already_reconciled'
        USING ERRCODE = '23514';
    END IF;

    IF v_event.expense_id IS NOT NULL THEN
      SELECT expense.id
      INTO v_expense_id
      FROM public.expenses expense
      WHERE expense.id = v_event.expense_id
        AND expense.tenant_id = v_tenant_id
        AND expense.category = 'bank_deposit'
        AND expense.payment_method = 'cash'
        AND expense.amount = v_transaction.amount;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'cash_deposit_link_invalid'
          USING ERRCODE = '23514';
      END IF;

      RETURN jsonb_build_object(
        'status', 'already_recorded',
        'expense_id', v_expense_id
      );
    END IF;
  END IF;

  INSERT INTO public.expenses (
    tenant_id,
    category,
    amount,
    payment_method,
    paid_at,
    expense_date,
    note,
    created_by
  ) VALUES (
    v_tenant_id,
    'bank_deposit',
    v_transaction.amount,
    'cash',
    v_transaction.occurred_at,
    (v_transaction.occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
    'Nộp tiền mặt vào ngân hàng',
    v_actor
  )
  RETURNING id INTO v_expense_id;

  INSERT INTO public.bank_transaction_reconciliation_matches (
    tenant_id,
    bank_transaction_id,
    expense_id,
    matched_amount,
    created_by
  ) VALUES (
    v_tenant_id,
    v_transaction.id,
    v_expense_id,
    v_transaction.amount,
    v_actor
  );

  IF v_transaction.webhook_event_id IS NOT NULL THEN
    UPDATE public.webhook_events
    SET expense_id = v_expense_id
    WHERE id = v_transaction.webhook_event_id
      AND tenant_id = v_tenant_id;
  END IF;

  SET CONSTRAINTS
    public.trg_expenses_require_bank_deposit_evidence,
    public.trg_webhook_events_require_finance_evidence,
    public.trg_bank_reconciliation_matches_require_evidence
  IMMEDIATE;

  PERFORM public.log_audit(
    'bank_transaction.cash_deposit',
    'bank_transaction',
    v_transaction.id,
    NULL,
    jsonb_build_object(
      'expense_id', v_expense_id,
      'matched_amount', v_transaction.amount
    )
  );

  RETURN jsonb_build_object(
    'status', 'recorded',
    'expense_id', v_expense_id,
    'bank_transaction_id', v_transaction.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_bank_transaction_cash_deposit(bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_bank_transaction_cash_deposit(bigint)
  TO authenticated;

COMMENT ON FUNCTION public.record_bank_transaction_cash_deposit(bigint) IS
  'Owner-only classification of a trusted inbound bank movement as a cash deposit; it never changes bank balance.';
