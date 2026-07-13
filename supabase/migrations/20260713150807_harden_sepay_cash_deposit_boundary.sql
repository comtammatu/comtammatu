CREATE OR REPLACE FUNCTION public.record_sepay_cash_deposit_as_system(
  p_event_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event public.webhook_events%ROWTYPE;
  v_amount numeric;
  v_expense_date date;
  v_expense_id bigint;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_event
  FROM public.webhook_events
  WHERE id = p_event_id
    AND provider = 'sepay'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'webhook_event_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_event.signature_valid IS NOT TRUE THEN
    RAISE EXCEPTION 'webhook_event_signature_invalid' USING ERRCODE = '23514';
  END IF;

  IF v_event.payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'webhook_event_matches_payment' USING ERRCODE = '23514';
  END IF;

  IF lower(COALESCE(v_event.payload->>'transferType', '')) <> 'in' THEN
    RAISE EXCEPTION 'webhook_event_not_in' USING ERRCODE = '23514';
  END IF;

  SELECT CASE
    WHEN COALESCE(v_event.payload->>'transferAmount', '') ~ '^[0-9]+(\.[0-9]+)?$'
      THEN (v_event.payload->>'transferAmount')::numeric
    ELSE NULL
  END
  INTO v_amount;

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'cash_deposit_amount_invalid' USING ERRCODE = '23514';
  END IF;

  IF v_event.expense_id IS NOT NULL THEN
    SELECT e.id
    INTO v_expense_id
    FROM public.expenses e
    WHERE e.id = v_event.expense_id
      AND e.tenant_id = v_event.tenant_id
      AND e.category = 'bank_deposit'
      AND e.payment_method = 'cash'
      AND e.amount = v_amount;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'cash_deposit_link_invalid' USING ERRCODE = '23514';
    END IF;

    RETURN jsonb_build_object(
      'status', 'already_recorded',
      'expense_id', v_expense_id
    );
  END IF;

  SELECT CASE
    WHEN COALESCE(v_event.payload->>'transactionDate', '') ~ '^\d{4}-\d{2}-\d{2}'
      THEN substring(v_event.payload->>'transactionDate' FROM 1 FOR 10)::date
    ELSE (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  END
  INTO v_expense_date;

  INSERT INTO public.expenses (
    tenant_id,
    category,
    amount,
    payment_method,
    paid_at,
    expense_date,
    note
  )
  VALUES (
    v_event.tenant_id,
    'bank_deposit',
    v_amount,
    'cash',
    COALESCE(v_event.processed_at, v_event.created_at, now()),
    v_expense_date,
    COALESCE(NULLIF(v_event.payload->>'content', ''), 'Nộp tiền mặt vào ngân hàng')
  )
  RETURNING id
  INTO v_expense_id;

  UPDATE public.webhook_events
  SET expense_id = v_expense_id
  WHERE id = p_event_id
    AND tenant_id = v_event.tenant_id;

  RETURN jsonb_build_object(
    'status', 'recorded',
    'expense_id', v_expense_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_sepay_cash_deposit_as_system(bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_sepay_cash_deposit_as_system(bigint)
  TO service_role;
