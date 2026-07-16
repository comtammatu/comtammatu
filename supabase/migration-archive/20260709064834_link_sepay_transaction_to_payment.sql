CREATE OR REPLACE FUNCTION public.link_sepay_transaction_to_payment(
  p_event_id bigint,
  p_payment_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id bigint := public.auth_tenant_id();
  v_user_id uuid := auth.uid();
  v_event public.webhook_events%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_raw_amount text;
  v_amount numeric;
BEGIN
  IF v_user_id IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.has_permission_any('finance:view')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_event
  FROM public.webhook_events
  WHERE id = p_event_id
    AND tenant_id = v_tenant_id
    AND provider = 'sepay'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'webhook_event_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_event.payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'webhook_event_already_linked' USING ERRCODE = '23505';
  END IF;

  IF v_event.expense_id IS NOT NULL THEN
    RAISE EXCEPTION 'webhook_event_matches_expense' USING ERRCODE = '23514';
  END IF;

  IF NOT v_event.signature_valid THEN
    RAISE EXCEPTION 'webhook_event_signature_invalid' USING ERRCODE = '23514';
  END IF;

  IF v_event.processing_status = 'failed' OR v_event.error_code IS NOT NULL THEN
    RAISE EXCEPTION 'webhook_event_failed' USING ERRCODE = '23514';
  END IF;

  IF lower(COALESCE(v_event.payload->>'transferType', '')) <> 'in' THEN
    RAISE EXCEPTION 'webhook_event_not_in' USING ERRCODE = '23514';
  END IF;

  v_raw_amount := btrim(COALESCE(v_event.payload->>'transferAmount', ''));
  IF v_raw_amount !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
    RAISE EXCEPTION 'webhook_event_amount_invalid' USING ERRCODE = '22023';
  END IF;

  v_amount := abs(v_raw_amount::numeric);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'webhook_event_amount_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
    AND tenant_id = v_tenant_id
    AND method = 'vietqr'
    AND status = 'completed'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_payment.branch_id, 'finance:view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_payment.amount <> v_amount THEN
    RAISE EXCEPTION 'payment_amount_mismatch' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.webhook_events other_event
    WHERE other_event.tenant_id = v_tenant_id
      AND other_event.payment_id = p_payment_id
      AND other_event.id <> p_event_id
      AND other_event.provider = 'sepay'
      AND other_event.signature_valid
      AND lower(COALESCE(other_event.payload->>'transferType', '')) = 'in'
      AND other_event.processing_status <> 'failed'
      AND other_event.error_code IS NULL
  ) THEN
    RAISE EXCEPTION 'payment_already_has_bank_webhook' USING ERRCODE = '23505';
  END IF;

  UPDATE public.webhook_events
  SET payment_id = p_payment_id,
      processing_status = CASE
        WHEN processing_status = 'received' THEN 'processed'
        ELSE processing_status
      END,
      processed_at = COALESCE(processed_at, now())
  WHERE id = p_event_id
    AND tenant_id = v_tenant_id;

  PERFORM public.log_audit(
    'link_sepay_transaction_to_payment',
    'webhook_event',
    p_event_id,
    jsonb_build_object('payment_id', NULL),
    jsonb_build_object(
      'payment_id', p_payment_id,
      'order_id', v_payment.order_id,
      'amount', v_amount
    )
  );

  RETURN jsonb_build_object(
    'event_id', p_event_id,
    'payment_id', p_payment_id,
    'order_id', v_payment.order_id,
    'amount', v_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.link_sepay_transaction_to_payment(bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_sepay_transaction_to_payment(bigint, bigint) TO authenticated, service_role;
