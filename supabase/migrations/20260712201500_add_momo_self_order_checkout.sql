BEGIN;

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_method_check,
  ADD CONSTRAINT payments_method_check
    CHECK (method IN ('cash', 'vietqr', 'momo'));

ALTER TABLE public.webhook_events
  DROP CONSTRAINT IF EXISTS webhook_events_provider_check,
  ADD CONSTRAINT webhook_events_provider_check
    CHECK (provider IN ('momo', 'vietqr', 'vnpay', 'sepay'));

ALTER TABLE public.self_order_payment_requests
  DROP CONSTRAINT IF EXISTS self_order_payment_requests_method_check,
  DROP CONSTRAINT IF EXISTS self_order_payment_requests_status_check,
  DROP CONSTRAINT IF EXISTS self_order_payment_requests_status_method_check,
  DROP CONSTRAINT IF EXISTS self_order_payment_requests_active_expiry_required,
  ADD CONSTRAINT self_order_payment_requests_method_check
    CHECK (method IN ('cash_call', 'vietqr', 'momo')),
  ADD CONSTRAINT self_order_payment_requests_status_check
    CHECK (status IN ('cash_call', 'vietqr_pending', 'momo_pending', 'cancelled', 'completed', 'expired')),
  ADD CONSTRAINT self_order_payment_requests_status_method_check
    CHECK (
      (method = 'cash_call' AND status IN ('cash_call', 'cancelled', 'completed', 'expired'))
      OR (method = 'vietqr' AND status IN ('vietqr_pending', 'cancelled', 'completed', 'expired'))
      OR (method = 'momo' AND status IN ('momo_pending', 'cancelled', 'completed', 'expired'))
    ),
  ADD CONSTRAINT self_order_payment_requests_active_expiry_required
    CHECK (status NOT IN ('cash_call', 'vietqr_pending', 'momo_pending') OR expires_at IS NOT NULL);

DROP INDEX IF EXISTS public.self_order_payment_requests_one_active_per_order;
CREATE UNIQUE INDEX self_order_payment_requests_one_active_per_order
  ON public.self_order_payment_requests (tenant_id, order_id)
  WHERE status IN ('cash_call', 'vietqr_pending', 'momo_pending');

DO $$
DECLARE
  v_function record;
  v_definition text;
BEGIN
  FOR v_function IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'self_order_%'
      AND pg_get_functiondef(p.oid) LIKE '%''cash_call'', ''vietqr_pending''%'
  LOOP
    v_definition := pg_get_functiondef(v_function.oid);
    v_definition := replace(
      v_definition,
      '''cash_call'', ''vietqr_pending''',
      '''cash_call'', ''vietqr_pending'', ''momo_pending'''
    );
    EXECUTE v_definition;
  END LOOP;
END;
$$;

DO $$
DECLARE
  v_definition text;
  v_momo_branch text := $branch$
  IF p_method = 'momo' THEN
    IF v_order.total_amount <= 0 THEN
      RAISE EXCEPTION 'self_order_momo_requires_positive_amount' USING ERRCODE = '22023';
    END IF;

    v_momo_provider_ref := 'MT' || v_order.id::text || '-' ||
      substr(replace(p_client_op_id::text, '-', ''), 1, 12);

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
    )
    VALUES (
      v_session.tenant_id,
      v_session.branch_id,
      v_order.id,
      'momo',
      v_order.total_amount,
      'pending',
      v_momo_provider_ref,
      jsonb_build_object(
        'source', 'self_order_momo',
        'invoicePayload', v_invoice_payload
      ),
      v_session.approved_by
    )
    RETURNING id INTO v_payment_id;

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
      session_id,
      order_id,
      payment_id,
      client_op_id,
      method,
      status,
      amount_snapshot,
      invoice_payload,
      request_fingerprint,
      request_fingerprint_version,
      payment_code_snapshot,
      expires_at
    )
    VALUES (
      v_session.tenant_id,
      v_session.branch_id,
      v_session.table_id,
      v_session.id,
      v_order.id,
      v_payment_id,
      p_client_op_id,
      'momo',
      'momo_pending',
      v_order.total_amount,
      v_invoice_payload,
      v_fingerprint,
      'payment:v1',
      v_momo_provider_ref,
      now() + interval '15 minutes'
    )
    RETURNING * INTO v_existing;

    RETURN jsonb_build_object('ok', true)
      || public.self_order_payment_request_public_payload(v_existing.id);
  END IF;

$branch$;
BEGIN
  SELECT pg_get_functiondef(
    'public.self_order_create_payment_request(text, uuid, text, jsonb)'::regprocedure
  )
  INTO v_definition;

  IF position('p_method NOT IN (''cash_call'', ''vietqr'')' IN v_definition) = 0
     OR position('v_qr_payload text;' IN v_definition) = 0
     OR position(E'  IF v_order.total_amount <= 0 THEN' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'self_order_momo_source_contract_changed';
  END IF;

  v_definition := replace(
    v_definition,
    'p_method NOT IN (''cash_call'', ''vietqr'')',
    'p_method NOT IN (''cash_call'', ''vietqr'', ''momo'')'
  );
  v_definition := replace(
    v_definition,
    '  v_qr_payload text;',
    '  v_qr_payload text;' || E'\n' || '  v_momo_provider_ref text;'
  );
  v_definition := replace(
    v_definition,
    E'  IF v_order.total_amount <= 0 THEN',
    v_momo_branch || E'  IF v_order.total_amount <= 0 THEN'
  );
  EXECUTE v_definition;
END;
$$;

DO $$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.self_order_sync_payment_request()'::regprocedure)
  INTO v_definition;

  IF position(
    $needle$
        OR (
          pr.method = 'vietqr'
          AND NEW.method = 'vietqr'
        )
$needle$
    IN v_definition
  ) = 0 THEN
    RAISE EXCEPTION 'self_order_momo_payment_sync_contract_changed';
  END IF;

  v_definition := replace(
    v_definition,
    $needle$
        OR (
          pr.method = 'vietqr'
          AND NEW.method = 'vietqr'
        )
$needle$,
    $replacement$
        OR (
          pr.method = 'vietqr'
          AND NEW.method = 'vietqr'
        )
        OR (
          pr.method = 'momo'
          AND NEW.method = 'momo'
        )
$replacement$
  );
  EXECUTE v_definition;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_momo_payment(
  p_tenant_id bigint,
  p_payment_id bigint,
  p_provider_ref text,
  p_transaction_id text,
  p_amount numeric,
  p_provider_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_payment record;
  v_order record;
  v_complete_result record;
  v_receipt_result jsonb;
  v_actor uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT p.*, o.total_amount, o.created_by AS order_created_by
  INTO v_payment
  FROM public.payments p
  JOIN public.orders o
    ON o.id = p.order_id
   AND o.tenant_id = p.tenant_id
   AND o.branch_id = p.branch_id
  WHERE p.id = p_payment_id
    AND p.tenant_id = p_tenant_id
    AND p.method = 'momo'
    AND p.provider_ref = p_provider_ref
    AND o.status <> 'cancelled'
  FOR UPDATE OF p, o;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'payment_not_found');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> v_payment.amount
     OR p_amount <> v_payment.total_amount THEN
    RETURN jsonb_build_object('status', 'amount_mismatch');
  END IF;
  IF v_payment.status = 'completed' THEN
    v_receipt_result := public.enqueue_receipt_print(v_payment.order_id, NULL, NULL);
    RETURN jsonb_build_object(
      'status', 'already_completed',
      'payment_id', v_payment.id,
      'order_id', v_payment.order_id,
      'print', v_receipt_result
    );
  END IF;
  IF v_payment.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('status', 'payment_not_pending');
  END IF;

  UPDATE public.payments
  SET provider_data = COALESCE(provider_data, '{}'::jsonb)
        || COALESCE(p_provider_data, '{}'::jsonb)
        || jsonb_build_object('transactionId', p_transaction_id),
      updated_at = now()
  WHERE id = v_payment.id
    AND tenant_id = p_tenant_id;

  v_actor := COALESCE(v_payment.created_by, v_payment.order_created_by);
  SELECT *
  INTO v_complete_result
  FROM public.complete_payment_and_consume_stock(
    v_payment.id,
    p_amount,
    COALESCE(p_provider_data, '{}'::jsonb)
      || jsonb_build_object('transactionId', p_transaction_id),
    v_actor
  );

  IF v_complete_result.status NOT IN ('completed', 'already_completed') THEN
    RETURN jsonb_build_object('status', v_complete_result.status);
  END IF;

  UPDATE public.orders
  SET payment_method = 'momo',
      cash_received = NULL,
      cash_change = NULL,
      updated_at = now()
  WHERE id = v_payment.order_id
    AND tenant_id = p_tenant_id;

  v_receipt_result := public.enqueue_receipt_print(v_payment.order_id, NULL, NULL);
  RETURN jsonb_build_object(
    'status', v_complete_result.status,
    'payment_id', v_payment.id,
    'order_id', v_payment.order_id,
    'print', v_receipt_result
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_momo_payment(
  p_tenant_id bigint,
  p_payment_id bigint,
  p_provider_ref text,
  p_provider_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_payment record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
    AND tenant_id = p_tenant_id
    AND method = 'momo'
    AND provider_ref = p_provider_ref
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'payment_not_found');
  END IF;
  IF v_payment.status = 'completed' THEN
    RETURN jsonb_build_object('status', 'already_completed');
  END IF;
  IF v_payment.status = 'pending' THEN
    UPDATE public.payments
    SET status = 'failed',
        provider_data = COALESCE(provider_data, '{}'::jsonb)
          || COALESCE(p_provider_data, '{}'::jsonb),
        updated_at = now()
    WHERE id = v_payment.id
      AND tenant_id = p_tenant_id;
  END IF;

  RETURN jsonb_build_object('status', 'failed', 'payment_id', v_payment.id);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_momo_payment(bigint, bigint, text, text, numeric, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_momo_payment(bigint, bigint, text, text, numeric, jsonb)
  TO service_role;
REVOKE ALL ON FUNCTION public.fail_momo_payment(bigint, bigint, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_momo_payment(bigint, bigint, text, jsonb)
  TO service_role;

COMMIT;
