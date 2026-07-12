CREATE OR REPLACE FUNCTION public.reconcile_sepay_order_evidence(
  p_event_id bigint,
  p_payment_code text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.webhook_events%ROWTYPE;
  v_order record;
  v_payment record;
  v_requested_payment_code text := btrim(COALESCE(p_payment_code, ''));
  v_payment_code text;
  v_event_memo text;
  v_amount numeric;
  v_order_count integer := 0;
  v_payment_id bigint := NULL;
  v_confirmation jsonb;
  v_confirmation_status text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
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

  IF NOT v_event.signature_valid
    OR lower(COALESCE(v_event.payload ->> 'transferType', '')) <> 'in'
  THEN
    RAISE EXCEPTION 'webhook_event_invalid' USING ERRCODE = '22023';
  END IF;

  IF v_event.processing_status = 'processed'
     AND v_event.error_code IS NULL
     AND v_event.payment_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'matched',
      'order_id', v_event.order_id,
      'payment_id', v_event.payment_id,
      'idempotent', true
    );
  END IF;

  IF v_event.processing_status = 'processed'
     AND v_event.error_code = 'overpayment_needs_review'
     AND v_event.payment_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'overpayment_needs_review',
      'order_id', v_event.order_id,
      'idempotent', true
    );
  END IF;

  IF btrim(COALESCE(v_event.payload ->> 'transferAmount', '')) !~ '^-?[0-9]+([.][0-9]+)?$' THEN
    UPDATE public.webhook_events
    SET processing_status = 'failed',
        http_status = 200,
        error_code = 'invalid_amount',
        processed_at = now()
    WHERE id = v_event.id;
    RETURN jsonb_build_object('status', 'invalid_amount');
  END IF;

  v_amount := abs((v_event.payload ->> 'transferAmount')::numeric);
  IF v_amount <= 0 THEN
    UPDATE public.webhook_events
    SET processing_status = 'failed',
        http_status = 200,
        error_code = 'invalid_amount',
        processed_at = now()
    WHERE id = v_event.id;
    RETURN jsonb_build_object('status', 'invalid_amount');
  END IF;

  v_event_memo := ' ' || upper(regexp_replace(
    concat_ws(
      ' ',
      v_event.payload ->> 'content',
      v_event.payload ->> 'description',
      v_event.payload ->> 'code'
    ),
    '[^A-Za-z0-9]+',
    ' ',
    'g'
  )) || ' ';

  IF v_requested_payment_code <> '' THEN
    FOR v_order IN
      SELECT id, total_amount, payment_code
      FROM public.orders
      WHERE tenant_id = v_event.tenant_id
        AND status <> 'cancelled'
        AND lower(COALESCE(payment_code, '')) = lower(v_requested_payment_code)
      FOR UPDATE
    LOOP
      v_order_count := v_order_count + 1;
    END LOOP;
  END IF;

  IF v_order_count = 0 THEN
    FOR v_order IN
      SELECT id, total_amount, payment_code
      FROM public.orders
      WHERE tenant_id = v_event.tenant_id
        AND status <> 'cancelled'
        AND payment_code IS NOT NULL
        AND btrim(payment_code) <> ''
        AND regexp_replace(payment_code, '[^A-Za-z0-9]+', '', 'g')
          ~ '^[A-Za-z][A-Za-z0-9]{15,49}$'
        AND position(
          ' ' || upper(regexp_replace(
            payment_code,
            '[^A-Za-z0-9]+',
            ' ',
            'g'
          )) || ' '
          IN v_event_memo
        ) > 0
      ORDER BY id
      FOR UPDATE
    LOOP
      v_order_count := v_order_count + 1;
    END LOOP;
  END IF;

  IF v_order_count = 0 THEN
    UPDATE public.webhook_events
    SET processing_status = 'failed',
        http_status = 200,
        error_code = CASE
          WHEN v_requested_payment_code = '' THEN 'missing_payment_code'
          ELSE 'order_not_found'
        END,
        processed_at = now()
    WHERE id = v_event.id;
    RETURN jsonb_build_object(
      'status', CASE
        WHEN v_requested_payment_code = '' THEN 'missing_payment_code'
        ELSE 'order_not_found'
      END
    );
  END IF;

  IF v_order_count > 1 THEN
    UPDATE public.webhook_events
    SET processing_status = 'failed',
        http_status = 200,
        error_code = 'ambiguous_payment_code',
        processed_at = now()
    WHERE id = v_event.id;
    RETURN jsonb_build_object('status', 'ambiguous_payment_code');
  END IF;

  v_payment_code := v_order.payment_code;

  IF v_amount <> v_order.total_amount THEN
    UPDATE public.webhook_events
    SET processing_status = 'failed',
        http_status = 200,
        error_code = 'amount_mismatch',
        processed_at = now()
    WHERE id = v_event.id;
    RETURN jsonb_build_object('status', 'amount_mismatch');
  END IF;

  SELECT id, method, status
  INTO v_payment
  FROM public.payments
  WHERE tenant_id = v_event.tenant_id
    AND order_id = v_order.id
    AND status <> 'failed'
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_payment.status = 'completed'
     AND v_payment.method = 'vietqr'
     AND EXISTS (
       SELECT 1
       FROM public.webhook_events prior_event
       WHERE prior_event.tenant_id = v_event.tenant_id
         AND prior_event.provider = 'sepay'
         AND prior_event.id <> v_event.id
         AND prior_event.request_id IS DISTINCT FROM v_event.request_id
         AND prior_event.payment_id = v_payment.id
         AND prior_event.signature_valid
         AND lower(COALESCE(prior_event.payload ->> 'transferType', '')) = 'in'
         AND prior_event.processing_status <> 'failed'
         AND prior_event.error_code IS NULL
     ) THEN
    UPDATE public.webhook_events
    SET order_id = v_order.id,
        payment_id = NULL,
        processing_status = 'processed',
        http_status = 200,
        error_code = 'overpayment_needs_review',
        processed_at = now()
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'status', 'overpayment_needs_review',
      'order_id', v_order.id
    );
  END IF;

  SELECT public.confirm_sepay_payment(
    v_event.tenant_id,
    v_order.id,
    v_payment_code,
    v_amount,
    COALESCE(v_event.payload ->> 'accountNumber', ''),
    COALESCE(v_event.payload ->> 'referenceCode', ''),
    v_event.payload
  )
  INTO v_confirmation;

  v_confirmation_status := v_confirmation ->> 'status';
  IF v_confirmation_status IS DISTINCT FROM 'completed'
     AND v_confirmation_status IS DISTINCT FROM 'already_completed' THEN
    UPDATE public.webhook_events
    SET order_id = v_order.id,
        processing_status = 'failed',
        http_status = 200,
        error_code = COALESCE(
          NULLIF(v_confirmation_status, ''),
          'payment_confirmation_failed'
        ),
        processed_at = now()
    WHERE id = v_event.id;
    RETURN jsonb_build_object(
      'status', 'payment_confirmation_failed',
      'order_id', v_order.id
    );
  END IF;

  v_payment_id := NULLIF(v_confirmation ->> 'payment_id', '')::bigint;
  IF v_payment_id IS NULL THEN
    UPDATE public.webhook_events
    SET order_id = v_order.id,
        processing_status = 'failed',
        http_status = 500,
        error_code = 'payment_confirmation_missing_payment',
        processed_at = now()
    WHERE id = v_event.id;
    RETURN jsonb_build_object(
      'status', 'payment_confirmation_failed',
      'order_id', v_order.id
    );
  END IF;

  UPDATE public.webhook_events
  SET order_id = v_order.id,
      payment_id = v_payment_id,
      processing_status = 'processed',
      http_status = 200,
      error_code = NULL,
      processed_at = now()
  WHERE id = v_event.id;

  RETURN jsonb_build_object(
    'status', 'matched',
    'order_id', v_order.id,
    'payment_id', v_payment_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_sepay_order_evidence(bigint, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_sepay_order_evidence(bigint, text)
  TO service_role;
