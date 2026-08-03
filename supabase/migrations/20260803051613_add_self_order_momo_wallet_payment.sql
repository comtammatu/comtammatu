BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_method_check,
  ADD CONSTRAINT payments_method_check
    CHECK (method IN ('cash', 'vietqr', 'momo'))
    NOT VALID;
ALTER TABLE public.payments VALIDATE CONSTRAINT payments_method_check;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_method_check,
  ADD CONSTRAINT orders_payment_method_check
    CHECK (payment_method IS NULL OR payment_method IN ('cash', 'vietqr', 'momo'))
    NOT VALID;
ALTER TABLE public.orders VALIDATE CONSTRAINT orders_payment_method_check;

ALTER TABLE public.webhook_events
  DROP CONSTRAINT IF EXISTS webhook_events_provider_check,
  ADD CONSTRAINT webhook_events_provider_check
    CHECK (provider IN ('vietqr', 'vnpay', 'sepay', 'momo'))
    NOT VALID;
ALTER TABLE public.webhook_events VALIDATE CONSTRAINT webhook_events_provider_check;

ALTER TABLE public.self_order_payment_requests
  DROP CONSTRAINT IF EXISTS self_order_payment_requests_method_check,
  ADD CONSTRAINT self_order_payment_requests_method_check
    CHECK (method IN ('cash_call', 'vietqr', 'momo'))
    NOT VALID,
  DROP CONSTRAINT IF EXISTS self_order_payment_requests_status_method_check,
  ADD CONSTRAINT self_order_payment_requests_status_method_check
    CHECK (
      (method = 'cash_call' AND status IN ('cash_call', 'cancelled', 'completed', 'expired'))
      OR (method IN ('vietqr', 'momo') AND status IN ('vietqr_pending', 'cancelled', 'completed', 'expired'))
    )
    NOT VALID,
  DROP CONSTRAINT IF EXISTS self_order_payment_requests_active_vietqr_snapshot_check,
  ADD CONSTRAINT self_order_payment_requests_active_vietqr_snapshot_check
    CHECK (
      method <> 'vietqr'
      OR status <> 'vietqr_pending'
      OR (
        qr_payload_snapshot IS NOT NULL
        AND COALESCE(vietqr_config_snapshot ->> 'bankCode', '') <> ''
        AND COALESCE(vietqr_config_snapshot ->> 'accountNo', '') <> ''
      )
    )
    NOT VALID;
ALTER TABLE public.self_order_payment_requests
  VALIDATE CONSTRAINT self_order_payment_requests_method_check;
ALTER TABLE public.self_order_payment_requests
  VALIDATE CONSTRAINT self_order_payment_requests_status_method_check;
ALTER TABLE public.self_order_payment_requests
  VALIDATE CONSTRAINT self_order_payment_requests_active_vietqr_snapshot_check;

CREATE OR REPLACE FUNCTION public.self_order_payment_request_public_payload(
  p_request_id bigint
) RETURNS jsonb
LANGUAGE sql
SET search_path TO ''
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'id', request.id,
    'clientOpId', request.client_op_id,
    'status', CASE
      WHEN request.method = 'momo' AND request.status = 'vietqr_pending'
        THEN 'momo_pending'
      ELSE request.status
    END,
    'method', request.method,
    'amount', request.amount_snapshot,
    'paymentId', request.payment_id,
    'paymentCode', request.payment_code_snapshot,
    'qrData', request.qr_payload_snapshot,
    'bankCode', request.vietqr_config_snapshot ->> 'bankCode',
    'accountNo', request.vietqr_config_snapshot ->> 'accountNo',
    'accountName', request.vietqr_config_snapshot ->> 'accountName',
    'deeplink', CASE
      WHEN request.method = 'momo' THEN payment.provider_data ->> 'deeplink'
      ELSE NULL
    END,
    'payUrl', CASE
      WHEN request.method = 'momo' THEN payment.provider_data ->> 'payUrl'
      ELSE NULL
    END,
    'createdAt', request.created_at,
    'expiresAt', request.expires_at
  ))
  FROM public.self_order_payment_requests request
  LEFT JOIN public.payments payment
    ON payment.id = request.payment_id
   AND payment.tenant_id = request.tenant_id
  WHERE request.id = p_request_id;
$$;

CREATE OR REPLACE FUNCTION public.self_order_momo_service_payload(
  p_request_id bigint
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT public.self_order_payment_request_public_payload(request.id)
    || jsonb_build_object(
      'tenantId', request.tenant_id,
      'orderId', request.order_id,
      'orderNumber', order_row.order_number,
      'providerOrderId', payment.provider_ref,
      'providerRequestId', payment.provider_data ->> 'requestId'
    )
  FROM public.self_order_payment_requests request
  JOIN public.orders order_row
    ON order_row.id = request.order_id
   AND order_row.tenant_id = request.tenant_id
  JOIN public.payments payment
    ON payment.id = request.payment_id
   AND payment.tenant_id = request.tenant_id
  WHERE request.id = p_request_id
    AND request.method = 'momo';
$$;

REVOKE ALL ON FUNCTION public.self_order_momo_service_payload(bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_order_momo_service_payload(bigint)
  TO service_role;

CREATE OR REPLACE FUNCTION public.self_order_create_momo_payment_request(
  p_token text,
  p_client_op_id uuid,
  p_method text,
  p_invoice_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_table public.tables%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_existing public.self_order_payment_requests%ROWTYPE;
  v_active public.self_order_payment_requests%ROWTYPE;
  v_open_order_count integer;
  v_order_id bigint;
  v_payment_id bigint;
  v_invoice_payload jsonb;
  v_fingerprint text;
  v_provider_order_id text;
  v_provider_request_id text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_client_op_id IS NULL OR p_method <> 'momo' THEN
    RAISE EXCEPTION 'invalid_payment_method' USING ERRCODE = '22023';
  END IF;

  v_invoice_payload := public.self_order_normalize_invoice_payload(
    COALESCE(p_invoice_payload, '{}'::jsonb)
  );
  v_fingerprint := public.self_order_payment_request_fingerprint(
    'momo',
    v_invoice_payload
  );

  SELECT table_row.*
  INTO v_table
  FROM public.tables table_row
  JOIN public.branches branch
    ON branch.id = table_row.branch_id
   AND branch.tenant_id = table_row.tenant_id
   AND branch.is_active = true
  WHERE table_row.self_order_token = p_token
    AND table_row.self_order_enabled = true
    AND table_row.status <> 'maintenance'
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_disabled_token');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('self-order-table'),
    hashtext(v_table.id::text)
  );

  SELECT request.*
  INTO v_existing
  FROM public.self_order_payment_requests request
  WHERE request.tenant_id = v_table.tenant_id
    AND request.client_op_id = p_client_op_id
  ORDER BY request.id DESC
  LIMIT 1;
  IF FOUND THEN
    IF v_existing.table_id <> v_table.id
       OR v_existing.method <> 'momo'
       OR v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'self_order_idempotency_conflict' USING ERRCODE = '22023';
    END IF;
    IF v_existing.status = 'vietqr_pending' AND v_existing.expires_at <= now() THEN
      PERFORM public.self_order_expire_payment_request(v_existing.id);
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'self_order_payment_intent_expired'
      );
    END IF;
    IF v_existing.status <> 'vietqr_pending' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'self_order_payment_completed'
      );
    END IF;
    RETURN jsonb_build_object('ok', true, 'idempotent', true)
      || public.self_order_momo_service_payload(v_existing.id);
  END IF;

  IF NOT public.self_order_branch_has_open_pos_session(
    v_table.tenant_id,
    v_table.branch_id
  ) THEN
    RAISE EXCEPTION 'self_order_pos_session_closed' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer, min(order_row.id)
  INTO v_open_order_count, v_order_id
  FROM public.orders order_row
  WHERE order_row.tenant_id = v_table.tenant_id
    AND order_row.branch_id = v_table.branch_id
    AND order_row.table_id = v_table.id
    AND order_row.payment_status <> 'paid'
    AND order_row.status NOT IN ('completed', 'cancelled')
    AND order_row.merged_into_order_id IS NULL;
  IF v_open_order_count <> 1 THEN
    RAISE EXCEPTION 'self_order_order_ambiguous' USING ERRCODE = '22023';
  END IF;

  SELECT order_row.*
  INTO v_order
  FROM public.orders order_row
  WHERE order_row.id = v_order_id
    AND order_row.tenant_id = v_table.tenant_id
  FOR UPDATE;
  IF NOT pg_try_advisory_xact_lock(v_order.id) THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END IF;
  IF v_order.status NOT IN ('new', 'confirmed', 'preparing', 'ready', 'served')
     OR COALESCE(v_order.payment_status, 'unpaid') = 'paid'
     OR v_order.merged_into_order_id IS NOT NULL
     OR v_order.total_amount <= 0 THEN
    RAISE EXCEPTION 'self_order_order_not_payable' USING ERRCODE = '22023';
  END IF;

  SELECT request.*
  INTO v_active
  FROM public.self_order_payment_requests request
  WHERE request.tenant_id = v_order.tenant_id
    AND request.order_id = v_order.id
    AND request.status IN ('cash_call', 'vietqr_pending')
  ORDER BY request.id DESC
  LIMIT 1;
  IF FOUND AND v_active.expires_at <= now() THEN
    PERFORM public.self_order_expire_payment_request(v_active.id);
    v_active.id := NULL;
  END IF;
  IF v_active.id IS NOT NULL THEN
    RAISE EXCEPTION 'self_order_pending_payment_exists' USING ERRCODE = '55P03';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.payments payment
    WHERE payment.tenant_id = v_order.tenant_id
      AND payment.order_id = v_order.id
      AND payment.status IN ('pending', 'completed')
  ) THEN
    RAISE EXCEPTION 'self_order_pending_payment_exists' USING ERRCODE = '55P03';
  END IF;

  v_provider_request_id := replace(p_client_op_id::text, '-', '');
  v_provider_order_id := format(
    'MOMO-%s-%s-%s',
    v_order.tenant_id,
    v_order.id,
    left(v_provider_request_id, 12)
  );

  INSERT INTO public.payments (
    tenant_id,
    branch_id,
    order_id,
    method,
    amount,
    status,
    provider_ref,
    provider_data,
    created_by
  ) VALUES (
    v_order.tenant_id,
    v_order.branch_id,
    v_order.id,
    'momo',
    v_order.total_amount,
    'pending',
    v_provider_order_id,
    jsonb_build_object(
      'source', 'qr_self_order',
      'providerRef', v_provider_order_id,
      'requestId', v_provider_request_id,
      'invoicePayload', v_invoice_payload
    ),
    v_order.created_by
  ) RETURNING id INTO v_payment_id;

  UPDATE public.orders
  SET payment_status = 'pending',
      payment_method = 'momo',
      updated_at = now()
  WHERE id = v_order.id
    AND tenant_id = v_order.tenant_id;

  INSERT INTO public.self_order_payment_requests (
    tenant_id,
    branch_id,
    table_id,
    order_id,
    payment_id,
    client_op_id,
    method,
    status,
    amount_snapshot,
    invoice_payload,
    request_fingerprint,
    request_fingerprint_version,
    expires_at
  ) VALUES (
    v_order.tenant_id,
    v_order.branch_id,
    v_order.table_id,
    v_order.id,
    v_payment_id,
    p_client_op_id,
    'momo',
    'vietqr_pending',
    v_order.total_amount,
    v_invoice_payload,
    v_fingerprint,
    'payment:v1',
    now() + interval '30 minutes'
  ) RETURNING * INTO v_existing;

  RETURN jsonb_build_object('ok', true)
    || public.self_order_momo_service_payload(v_existing.id);
END;
$$;

REVOKE ALL ON FUNCTION public.self_order_create_momo_payment_request(
  text, uuid, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_order_create_momo_payment_request(
  text, uuid, text, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.self_order_bind_momo_create_result(
  p_token text,
  p_client_op_id uuid,
  p_provider_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_request public.self_order_payment_requests%ROWTYPE;
  v_payment public.payments%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_provider_data IS NULL
     OR jsonb_typeof(p_provider_data) <> 'object'
     OR NULLIF(btrim(p_provider_data ->> 'momoOrderId'), '') IS NULL
     OR NULLIF(btrim(p_provider_data ->> 'requestId'), '') IS NULL
     OR NULLIF(btrim(p_provider_data ->> 'deeplink'), '') IS NULL
     OR COALESCE(p_provider_data ->> 'payUrl', '') !~ '^https://' THEN
    RAISE EXCEPTION 'momo_create_result_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT request.*
  INTO v_request
  FROM public.self_order_payment_requests request
  JOIN public.tables table_row
    ON table_row.id = request.table_id
   AND table_row.tenant_id = request.tenant_id
  WHERE table_row.self_order_token = p_token
    AND request.client_op_id = p_client_op_id
    AND request.method = 'momo';
  IF NOT FOUND OR v_request.status <> 'vietqr_pending' THEN
    RAISE EXCEPTION 'self_order_payment_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(v_request.order_id);
  PERFORM 1
  FROM public.orders order_row
  WHERE order_row.id = v_request.order_id
    AND order_row.tenant_id = v_request.tenant_id
  FOR UPDATE;

  SELECT payment.*
  INTO v_payment
  FROM public.payments payment
  WHERE payment.id = v_request.payment_id
    AND payment.tenant_id = v_request.tenant_id
    AND payment.order_id = v_request.order_id
    AND payment.method = 'momo'
  FOR UPDATE;
  IF NOT FOUND
     OR v_payment.status <> 'pending'
     OR v_payment.provider_ref IS DISTINCT FROM p_provider_data ->> 'momoOrderId'
     OR v_payment.provider_data ->> 'requestId'
        IS DISTINCT FROM p_provider_data ->> 'requestId' THEN
    RAISE EXCEPTION 'momo_create_result_mismatch' USING ERRCODE = '23514';
  END IF;

  UPDATE public.payments
  SET provider_data = provider_data || p_provider_data,
      updated_at = now()
  WHERE id = v_payment.id;

  RETURN jsonb_build_object('ok', true)
    || public.self_order_momo_service_payload(v_request.id);
END;
$$;

REVOKE ALL ON FUNCTION public.self_order_bind_momo_create_result(
  text, uuid, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_order_bind_momo_create_result(
  text, uuid, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_pending_momo_reconciliations(
  p_limit integer DEFAULT 10
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_payment record;
  v_claims jsonb := '[]'::jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_limit < 1 OR p_limit > 20 THEN
    RAISE EXCEPTION 'invalid_claim_limit' USING ERRCODE = '22023';
  END IF;

  FOR v_payment IN
    SELECT payment.id,
           payment.provider_ref,
           payment.amount
    FROM public.payments payment
    JOIN public.self_order_payment_requests request
      ON request.payment_id = payment.id
     AND request.tenant_id = payment.tenant_id
     AND request.order_id = payment.order_id
     AND request.method = 'momo'
     AND request.status = 'vietqr_pending'
     AND request.expires_at > now()
    WHERE payment.method = 'momo'
      AND payment.status = 'pending'
      AND payment.created_at <= now() - interval '30 seconds'
      AND COALESCE(payment.provider_data ->> 'deeplink', '') <> ''
      AND COALESCE(
        (payment.provider_data ->> 'lastQueryClaimedAt')::timestamptz,
        '-infinity'::timestamptz
      ) <= now() - interval '60 seconds'
    ORDER BY payment.created_at, payment.id
    FOR UPDATE OF payment SKIP LOCKED
    LIMIT p_limit
  LOOP
    UPDATE public.payments
    SET provider_data = provider_data || jsonb_build_object(
          'lastQueryClaimedAt', now()
        ),
        updated_at = now()
    WHERE id = v_payment.id;

    v_claims := v_claims || jsonb_build_array(jsonb_build_object(
      'paymentId', v_payment.id,
      'providerOrderId', v_payment.provider_ref,
      'amount', v_payment.amount
    ));
  END LOOP;

  RETURN v_claims;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_momo_reconciliations(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_momo_reconciliations(integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.record_momo_query_result(
  p_payment_id bigint,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_amount numeric;
  v_result_code integer;
  v_result record;
  v_provider_data jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_payload IS NULL
     OR jsonb_typeof(p_payload) <> 'object'
     OR NULLIF(btrim(p_payload ->> 'momoOrderId'), '') IS NULL
     OR NULLIF(btrim(p_payload ->> 'queryRequestId'), '') IS NULL THEN
    RAISE EXCEPTION 'momo_query_payload_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT payment.*
  INTO v_payment
  FROM public.payments payment
  WHERE payment.id = p_payment_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'momo_payment_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_amount := NULLIF(p_payload ->> 'amount', '')::numeric;
  v_result_code := NULLIF(p_payload ->> 'resultCode', '')::integer;
  IF v_payment.method <> 'momo'
     OR v_payment.provider_ref IS DISTINCT FROM p_payload ->> 'momoOrderId'
     OR v_amount IS DISTINCT FROM v_payment.amount
     OR v_result_code IS NULL THEN
    RAISE EXCEPTION 'momo_query_scope_mismatch' USING ERRCODE = '23514';
  END IF;

  v_provider_data := v_payment.provider_data || jsonb_build_object(
    'lastQueryResult', p_payload
  );
  UPDATE public.payments
  SET provider_data = v_provider_data,
      updated_at = now()
  WHERE id = v_payment.id;

  IF v_result_code NOT IN (0, 9000) THEN
    RETURN jsonb_build_object('status', 'pending');
  END IF;

  SELECT *
  INTO v_result
  FROM public.complete_payment_and_consume_stock(
    v_payment.id,
    v_amount,
    v_provider_data,
    NULL
  );
  RETURN jsonb_build_object('status', v_result.status);
END;
$$;

REVOKE ALL ON FUNCTION public.record_momo_query_result(bigint, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_momo_query_result(bigint, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.record_momo_payment_result(
  p_event_id bigint,
  p_payment_id bigint,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_event public.webhook_events%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_amount numeric;
  v_result_code integer;
  v_result record;
  v_provider_data jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'momo_payload_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT event.*
  INTO v_event
  FROM public.webhook_events event
  WHERE event.id = p_event_id;
  IF NOT FOUND
     OR v_event.provider <> 'momo'
     OR NOT v_event.signature_valid
     OR v_event.request_id IS DISTINCT FROM p_payload ->> 'requestId' THEN
    RAISE EXCEPTION 'momo_event_mismatch' USING ERRCODE = '23514';
  END IF;

  SELECT payment.*
  INTO v_payment
  FROM public.payments payment
  WHERE payment.id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'momo_payment_not_found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM pg_advisory_xact_lock(v_payment.order_id);
  SELECT event.*
  INTO v_event
  FROM public.webhook_events event
  WHERE event.id = p_event_id
  FOR UPDATE;
  IF v_event.processing_status <> 'received' THEN
    RETURN jsonb_build_object('status', 'already_final');
  END IF;
  SELECT payment.*
  INTO v_payment
  FROM public.payments payment
  WHERE payment.id = p_payment_id
  FOR UPDATE;

  v_amount := NULLIF(p_payload ->> 'amount', '')::numeric;
  v_result_code := NULLIF(p_payload ->> 'resultCode', '')::integer;
  IF v_payment.method <> 'momo'
     OR v_payment.tenant_id <> v_event.tenant_id
     OR v_payment.order_id IS DISTINCT FROM v_event.order_id
     OR v_payment.provider_ref IS DISTINCT FROM p_payload ->> 'orderId'
     OR v_payment.provider_data ->> 'requestId'
        IS DISTINCT FROM p_payload ->> 'requestId'
     OR v_amount IS DISTINCT FROM v_payment.amount THEN
    RAISE EXCEPTION 'momo_payment_scope_mismatch' USING ERRCODE = '23514';
  END IF;

  v_provider_data := v_payment.provider_data || jsonb_build_object(
    'lastIpn', p_payload,
    'momoTransId', p_payload -> 'transId'
  );
  UPDATE public.webhook_events
  SET payment_id = v_payment.id,
      payload = p_payload,
      http_status = 204
  WHERE id = v_event.id;

  IF v_result_code IN (1000, 7000, 7002) THEN
    UPDATE public.payments
    SET provider_data = v_provider_data,
        updated_at = now()
    WHERE id = v_payment.id
      AND status = 'pending';
    RETURN jsonb_build_object('status', 'pending');
  END IF;

  IF v_result_code NOT IN (0, 9000) THEN
    UPDATE public.payments
    SET status = CASE WHEN status = 'pending' THEN 'failed' ELSE status END,
        provider_data = v_provider_data,
        updated_at = now()
    WHERE id = v_payment.id;
    UPDATE public.webhook_events
    SET processing_status = 'processed',
        error_code = 'momo_result_' || v_result_code::text,
        processed_at = now()
    WHERE id = v_event.id;
    RETURN jsonb_build_object('status', 'failed');
  END IF;

  SELECT *
  INTO v_result
  FROM public.complete_payment_and_consume_stock(
    v_payment.id,
    v_amount,
    v_provider_data,
    NULL
  );
  UPDATE public.webhook_events
  SET processing_status = CASE
        WHEN v_result.status IN ('completed', 'already_completed')
          THEN 'processed'
        ELSE 'failed'
      END,
      error_code = CASE
        WHEN v_result.status IN ('completed', 'already_completed') THEN NULL
        ELSE 'momo_' || COALESCE(v_result.status, 'completion_failed')
      END,
      processed_at = now()
  WHERE id = v_event.id;
  RETURN jsonb_build_object('status', v_result.status);
END;
$$;

REVOKE ALL ON FUNCTION public.record_momo_payment_result(bigint, bigint, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_momo_payment_result(bigint, bigint, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.self_order_momo_request_cleanup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.method = 'momo'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status IN ('cancelled', 'expired') THEN
    UPDATE public.payments
    SET status = 'failed',
        updated_at = now()
    WHERE id = NEW.payment_id
      AND tenant_id = NEW.tenant_id
      AND status = 'pending';

    UPDATE public.orders order_row
    SET payment_status = 'unpaid',
        payment_method = NULL,
        updated_at = now()
    WHERE order_row.id = NEW.order_id
      AND order_row.tenant_id = NEW.tenant_id
      AND COALESCE(order_row.payment_status, 'unpaid') <> 'paid'
      AND NOT EXISTS (
        SELECT 1
        FROM public.payments payment
        WHERE payment.tenant_id = NEW.tenant_id
          AND payment.order_id = NEW.order_id
          AND payment.status IN ('pending', 'completed')
      );
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.self_order_momo_request_cleanup()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_self_order_momo_request_cleanup
  ON public.self_order_payment_requests;
CREATE TRIGGER trg_self_order_momo_request_cleanup
AFTER UPDATE OF status ON public.self_order_payment_requests
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.self_order_momo_request_cleanup();

CREATE OR REPLACE FUNCTION public.self_order_sync_payment_request_from_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_reason text;
  v_payment_id bigint;
  v_payment_method text;
  v_paid_at timestamptz;
BEGIN
  IF NEW.payment_status = 'paid' THEN
    SELECT payment.id, payment.method, payment.paid_at
    INTO v_payment_id, v_payment_method, v_paid_at
    FROM public.payments payment
    WHERE payment.tenant_id = NEW.tenant_id
      AND payment.branch_id = NEW.branch_id
      AND payment.order_id = NEW.id
      AND payment.status = 'completed'
    ORDER BY payment.paid_at DESC NULLS LAST, payment.id DESC
    LIMIT 1;
    IF v_payment_id IS NULL THEN RETURN NULL; END IF;

    UPDATE public.self_order_payment_requests request
    SET status = 'completed',
        payment_id = COALESCE(request.payment_id, v_payment_id),
        completed_at = COALESCE(v_paid_at, now())
    WHERE request.tenant_id = NEW.tenant_id
      AND request.branch_id = NEW.branch_id
      AND request.order_id = NEW.id
      AND request.status IN ('cash_call', 'vietqr_pending')
      AND (
        (request.method = 'cash_call' AND v_payment_method = 'cash')
        OR (request.method = v_payment_method AND v_payment_method IN ('vietqr', 'momo'))
      );

    UPDATE public.self_order_payment_requests request
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = COALESCE(request.cancel_reason, 'order_paid_by_other_method')
    WHERE request.tenant_id = NEW.tenant_id
      AND request.branch_id = NEW.branch_id
      AND request.order_id = NEW.id
      AND request.status IN ('cash_call', 'vietqr_pending')
      AND NOT (
        (request.method = 'cash_call' AND v_payment_method = 'cash')
        OR (request.method = v_payment_method AND v_payment_method IN ('vietqr', 'momo'))
      );
  ELSIF NEW.status IN ('completed', 'cancelled') THEN
    v_reason := 'order_' || NEW.status;
    UPDATE public.self_order_payment_requests request
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = COALESCE(request.cancel_reason, v_reason)
    WHERE request.tenant_id = NEW.tenant_id
      AND request.order_id = NEW.id
      AND request.status IN ('cash_call', 'vietqr_pending');
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.self_order_sync_payment_request_from_order()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.sync_tax_invoice_issue_job_for_payment(
  p_payment_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_payload jsonb;
  v_request_payload jsonb;
  v_status text;
BEGIN
  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;
  IF NOT FOUND OR v_payment.method NOT IN ('cash', 'vietqr', 'momo') THEN
    RETURN;
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_payment.order_id
    AND tenant_id = v_payment.tenant_id
    AND branch_id = v_payment.branch_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT request.invoice_payload INTO v_request_payload
  FROM public.self_order_payment_requests request
  WHERE request.tenant_id = v_payment.tenant_id
    AND request.branch_id = v_payment.branch_id
    AND request.order_id = v_payment.order_id
    AND request.payment_id = v_payment.id
    AND request.status IN ('cash_call', 'vietqr_pending', 'completed')
  ORDER BY request.id DESC
  LIMIT 1;

  v_payload := COALESCE(
    v_payment.provider_data -> 'invoiceSnapshot',
    v_payment.provider_data -> 'invoicePayload',
    v_request_payload
  );
  IF v_payload IS NULL THEN RETURN; END IF;
  IF v_payment.status NOT IN ('pending', 'completed')
     OR (
       v_payment.status = 'completed'
       AND (v_order.payment_status <> 'paid' OR v_order.status <> 'completed')
     ) THEN
    RETURN;
  END IF;

  v_status := CASE
    WHEN v_payment.status = 'completed' THEN 'queued'
    ELSE 'pending_payment'
  END;
  PERFORM private.upsert_tax_invoice_issue_job(
    v_payment.tenant_id,
    v_payment.branch_id,
    v_payment.order_id,
    v_payment.id,
    v_payload,
    v_status
  );
END;
$$;

REVOKE ALL ON FUNCTION private.sync_tax_invoice_issue_job_for_payment(bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.sync_tax_invoice_issue_job_for_payment(bigint)
  TO service_role;

COMMIT;
