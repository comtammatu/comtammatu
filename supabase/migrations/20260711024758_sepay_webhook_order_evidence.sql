ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS order_id bigint REFERENCES public.orders(id);

CREATE INDEX IF NOT EXISTS idx_webhook_events_order_id
  ON public.webhook_events (tenant_id, order_id)
  WHERE order_id IS NOT NULL;

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
  v_payment_code text := btrim(COALESCE(p_payment_code, ''));
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

  IF v_payment_code = '' THEN
    UPDATE public.webhook_events
    SET processing_status = 'failed',
        http_status = 200,
        error_code = 'invalid_payment_code',
        processed_at = now()
    WHERE id = v_event.id;
    RETURN jsonb_build_object('status', 'invalid_payment_code');
  END IF;

  IF btrim(COALESCE(v_event.payload ->> 'transferAmount', '')) !~ '^-?[0-9]+(\\.[0-9]+)?$' THEN
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

  FOR v_order IN
    SELECT id, total_amount
    FROM public.orders
    WHERE tenant_id = v_event.tenant_id
      AND lower(COALESCE(payment_code, '')) = lower(v_payment_code)
      AND status <> 'cancelled'
    FOR UPDATE
  LOOP
    v_order_count := v_order_count + 1;
  END LOOP;

  IF v_order_count = 0 THEN
    UPDATE public.webhook_events
    SET processing_status = 'failed',
        http_status = 200,
        error_code = 'order_not_found',
        processed_at = now()
    WHERE id = v_event.id;
    RETURN jsonb_build_object('status', 'order_not_found');
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

  IF v_amount <> v_order.total_amount THEN
    UPDATE public.webhook_events
    SET processing_status = 'failed',
        http_status = 200,
        error_code = 'amount_mismatch',
        processed_at = now()
    WHERE id = v_event.id;
    RETURN jsonb_build_object('status', 'amount_mismatch');
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

REVOKE ALL ON FUNCTION public.reconcile_sepay_order_evidence(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_sepay_order_evidence(bigint, text) TO service_role;

CREATE OR REPLACE FUNCTION public.confirm_vietqr_payment(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_order_id bigint,
  p_amount numeric,
  p_created_by uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_order record;
  v_payment_id bigint;
  v_existing_id bigint;
  v_existing_status text;
  v_idempotent boolean := false;
  v_receipt_res jsonb;
  v_print_job_id bigint;
  v_print_failed boolean := false;
  v_print_error text;
  v_evidence_id bigint;
  v_evidence_count integer := 0;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT id, total_amount, tax_amount, payment_status, branch_id, tenant_id, payment_code
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id = p_tenant_id
    AND branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'pos:confirm_payment') THEN
    RAISE EXCEPTION 'permission denied: pos:confirm_payment' USING ERRCODE = '42501';
  END IF;

  IF v_order.payment_status = 'paid' THEN
    SELECT id
    INTO v_payment_id
    FROM public.payments
    WHERE order_id = p_order_id
      AND tenant_id = p_tenant_id
      AND status = 'completed'
    ORDER BY id DESC
    LIMIT 1;
    v_idempotent := true;
  ELSE
    IF p_amount <> v_order.total_amount THEN
      RAISE EXCEPTION 'amount_mismatch: expected % got %',
        v_order.total_amount, p_amount
        USING ERRCODE = '22023';
    END IF;

    SELECT id, status
    INTO v_existing_id, v_existing_status
    FROM public.payments
    WHERE tenant_id = p_tenant_id
      AND branch_id = p_branch_id
      AND order_id = p_order_id
      AND status <> 'failed'
    ORDER BY id DESC
    LIMIT 1
    FOR UPDATE;

    IF v_existing_status = 'completed' THEN
      v_payment_id := v_existing_id;
      v_idempotent := true;
    ELSIF v_existing_status = 'pending' THEN
      UPDATE public.payments
      SET method = 'vietqr',
          amount = p_amount,
          status = 'completed',
          provider_ref = v_order.payment_code,
          provider_data = COALESCE(provider_data, '{}'::jsonb)
            || jsonb_build_object('description', v_order.payment_code),
          paid_at = now(),
          updated_at = now()
      WHERE id = v_existing_id
      RETURNING id INTO v_payment_id;
    ELSE
      INSERT INTO public.payments (
        tenant_id, branch_id, order_id,
        method, amount, status, provider_ref, provider_data, paid_at, created_by
      ) VALUES (
        p_tenant_id, p_branch_id, p_order_id,
        'vietqr', p_amount, 'completed', v_order.payment_code,
        jsonb_build_object('description', v_order.payment_code), now(), v_uid
      )
      RETURNING id INTO v_payment_id;
    END IF;

    IF NOT v_idempotent THEN
      UPDATE public.orders
      SET payment_status = 'paid',
          payment_method = 'vietqr',
          cash_received = NULL,
          cash_change = NULL,
          updated_at = now()
      WHERE id = p_order_id;

      PERFORM public.finalize_paid_order(p_order_id, v_uid);
    END IF;
  END IF;

  IF v_payment_id IS NOT NULL THEN
    FOR v_evidence_id IN
      SELECT id
      FROM public.webhook_events
      WHERE tenant_id = p_tenant_id
        AND provider = 'sepay'
        AND signature_valid
        AND order_id = p_order_id
        AND payment_id IS NULL
        AND processing_status = 'processed'
        AND error_code IS NULL
        AND lower(COALESCE(payload ->> 'transferType', '')) = 'in'
        AND btrim(COALESCE(payload ->> 'transferAmount', '')) ~ '^-?[0-9]+(\\.[0-9]+)?$'
        AND abs((payload ->> 'transferAmount')::numeric) = p_amount
      FOR UPDATE
    LOOP
      v_evidence_count := v_evidence_count + 1;
    END LOOP;

    IF v_evidence_count = 1 THEN
      UPDATE public.webhook_events
      SET payment_id = v_payment_id
      WHERE id = v_evidence_id;
    END IF;
  END IF;

  BEGIN
    v_receipt_res := public.enqueue_receipt_print(p_order_id, NULL, NULL);
    v_print_job_id := (v_receipt_res ->> 'job_id')::bigint;
  EXCEPTION WHEN OTHERS THEN
    v_print_failed := true;
    v_print_error := SQLERRM;
    RAISE NOTICE '[confirm_vietqr_payment] receipt print failed for order %: %',
      p_order_id, SQLERRM;
  END;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'idempotent', v_idempotent,
    'print', jsonb_build_object(
      'job_id', v_print_job_id,
      'failed', v_print_failed,
      'error', v_print_error
    )
  );
END;
$$;

DO $$
DECLARE
  v_event record;
BEGIN
  FOR v_event IN
    SELECT
      we.id,
      (regexp_match(
        upper(concat_ws(' ', we.payload ->> 'content', we.payload ->> 'description', we.payload ->> 'code')),
        '\\mMATU DON [A-Z0-9]{12}\\M'
      ))[1] AS payment_code
    FROM public.webhook_events we
    WHERE we.provider = 'sepay'
      AND we.signature_valid
      AND we.error_code = 'order_not_found'
      AND lower(COALESCE(we.payload ->> 'transferType', '')) = 'in'
      AND btrim(COALESCE(we.payload ->> 'transferAmount', '')) ~ '^-?[0-9]+(\\.[0-9]+)?$'
  LOOP
    IF v_event.payment_code IS NOT NULL THEN
      PERFORM public.reconcile_sepay_order_evidence(
        v_event.id,
        v_event.payment_code
      );
    END IF;
  END LOOP;
END;
$$;
