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
  v_payment_code text := btrim(COALESCE(p_payment_code, ''));
  v_amount numeric;
  v_order_count integer := 0;
  v_payment_count integer := 0;
  v_payment_found boolean := false;
  v_order_id bigint;
  v_payment_id bigint;
  v_confirmation jsonb;
  v_confirmation_status text;
  v_review_code text;
  v_can_confirm boolean := false;
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
     AND v_event.payment_id IS NULL
     AND v_event.error_code IN (
       'missing_payment_code_needs_review',
       'order_not_found_needs_review',
       'ambiguous_payment_code_needs_review',
       'amount_mismatch_needs_review'
     ) THEN
    RETURN jsonb_build_object(
      'status', CASE v_event.error_code
        WHEN 'missing_payment_code_needs_review' THEN 'missing_payment_code'
        WHEN 'order_not_found_needs_review' THEN 'order_not_found'
        WHEN 'ambiguous_payment_code_needs_review' THEN 'ambiguous_payment_code'
        ELSE 'amount_mismatch'
      END,
      'order_id', v_event.order_id,
      'idempotent', true
    );
  END IF;

  IF v_event.processing_status = 'processed'
     AND v_event.payment_id IS NULL
     AND v_event.error_code IN (
       'payment_method_conflict_needs_review',
       'payment_state_conflict_needs_review',
       'overpayment_needs_review'
     ) THEN
    RETURN jsonb_build_object(
      'status', 'payment_confirmation_failed',
      'review_code', v_event.error_code,
      'order_id', v_event.order_id,
      'idempotent', true
    );
  END IF;

  IF v_payment_code = '' THEN
    UPDATE public.webhook_events
    SET processing_status = 'processed',
        http_status = 200,
        error_code = 'missing_payment_code_needs_review',
        processed_at = COALESCE(processed_at, now())
    WHERE id = v_event.id;

    RETURN jsonb_build_object('status', 'missing_payment_code');
  END IF;

  IF btrim(COALESCE(v_event.payload ->> 'transferAmount', ''))
       !~ '^[0-9]+([.][0-9]+)?$' THEN
    UPDATE public.webhook_events
    SET processing_status = 'failed',
        http_status = 200,
        error_code = 'invalid_amount',
        processed_at = now()
    WHERE id = v_event.id;

    RETURN jsonb_build_object('status', 'invalid_amount');
  END IF;

  v_amount := (v_event.payload ->> 'transferAmount')::numeric;
  IF v_amount <= 0 THEN
    UPDATE public.webhook_events
    SET processing_status = 'failed',
        http_status = 200,
        error_code = 'invalid_amount',
        processed_at = now()
    WHERE id = v_event.id;

    RETURN jsonb_build_object('status', 'invalid_amount');
  END IF;

  SELECT count(*)::integer, min(id)
  INTO v_order_count, v_order_id
  FROM public.orders
  WHERE tenant_id = v_event.tenant_id
    AND lower(COALESCE(payment_code, '')) = lower(v_payment_code)
    AND status <> 'cancelled';

  IF v_order_count = 0 THEN
    UPDATE public.webhook_events
    SET processing_status = 'processed',
        http_status = 200,
        error_code = 'order_not_found_needs_review',
        processed_at = COALESCE(processed_at, now())
    WHERE id = v_event.id;

    RETURN jsonb_build_object('status', 'order_not_found');
  END IF;

  IF v_order_count > 1 THEN
    UPDATE public.webhook_events
    SET processing_status = 'processed',
        http_status = 200,
        error_code = 'ambiguous_payment_code_needs_review',
        processed_at = COALESCE(processed_at, now())
    WHERE id = v_event.id;

    RETURN jsonb_build_object('status', 'ambiguous_payment_code');
  END IF;

  PERFORM pg_advisory_xact_lock(v_order_id);

  SELECT
    id,
    tenant_id,
    branch_id,
    total_amount,
    payment_status,
    payment_method,
    payment_code,
    created_by
  INTO v_order
  FROM public.orders
  WHERE id = v_order_id
    AND tenant_id = v_event.tenant_id
    AND lower(COALESCE(payment_code, '')) = lower(v_payment_code)
    AND status <> 'cancelled'
  FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE public.webhook_events
    SET processing_status = 'processed',
        http_status = 200,
        error_code = 'order_not_found_needs_review',
        processed_at = COALESCE(processed_at, now())
    WHERE id = v_event.id;

    RETURN jsonb_build_object('status', 'order_not_found');
  END IF;

  IF v_amount <> v_order.total_amount THEN
    UPDATE public.webhook_events
    SET order_id = v_order.id,
        processing_status = 'processed',
        http_status = 200,
        error_code = 'amount_mismatch_needs_review',
        processed_at = COALESCE(processed_at, now())
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'status', 'amount_mismatch',
      'order_id', v_order.id
    );
  END IF;

  PERFORM p.id
  FROM public.payments p
  WHERE p.tenant_id = v_event.tenant_id
    AND p.order_id = v_order.id
    AND p.status <> 'failed'
  ORDER BY p.id
  FOR UPDATE;

  SELECT count(*)::integer
  INTO v_payment_count
  FROM public.payments p
  WHERE p.tenant_id = v_event.tenant_id
    AND p.order_id = v_order.id
    AND p.status <> 'failed';

  SELECT
    p.id,
    p.method,
    p.amount,
    p.status,
    p.provider_ref,
    p.created_by
  INTO v_payment
  FROM public.payments p
  WHERE p.tenant_id = v_event.tenant_id
    AND p.order_id = v_order.id
    AND p.status <> 'failed'
  ORDER BY p.id DESC
  LIMIT 1;
  v_payment_found := FOUND;

  v_can_confirm := COALESCE(v_payment_count <= 1 AND (
    (
      NOT v_payment_found
      AND COALESCE(v_order.payment_status, 'unpaid') = 'unpaid'
      AND COALESCE(v_order.payment_method, '') IN ('', 'vietqr')
    )
    OR (
      v_payment_found
      AND v_payment.status = 'pending'
      AND v_payment.method = 'vietqr'
      AND v_payment.amount = v_order.total_amount
      AND lower(COALESCE(v_payment.provider_ref, '')) = lower(v_order.payment_code)
      AND v_order.payment_status IN ('unpaid', 'pending')
      AND v_order.payment_method = 'vietqr'
    )
    OR (
      v_payment_found
      AND v_payment.status = 'completed'
      AND v_payment.method = 'vietqr'
      AND v_payment.amount = v_order.total_amount
      AND lower(COALESCE(v_payment.provider_ref, '')) = lower(v_order.payment_code)
      AND v_order.payment_status = 'paid'
      AND v_order.payment_method = 'vietqr'
    )
  ), false);

  IF NOT v_can_confirm THEN
    v_review_code := CASE
      WHEN (
        v_payment_found
        AND v_payment.method IS DISTINCT FROM 'vietqr'
      ) OR COALESCE(v_order.payment_method, '') NOT IN ('', 'vietqr')
      THEN 'payment_method_conflict_needs_review'
      ELSE 'payment_state_conflict_needs_review'
    END;

    UPDATE public.webhook_events
    SET order_id = v_order.id,
        payment_id = NULL,
        processing_status = 'processed',
        http_status = 200,
        error_code = v_review_code,
        processed_at = COALESCE(processed_at, now())
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'status', 'payment_confirmation_failed',
      'review_code', v_review_code,
      'order_id', v_order.id
    );
  END IF;

  IF v_payment_found
     AND v_payment.status = 'completed'
     AND EXISTS (
       SELECT 1
       FROM public.webhook_events prior_event
       LEFT JOIN public.payments prior_payment
         ON prior_payment.id = prior_event.payment_id
        AND prior_payment.tenant_id = prior_event.tenant_id
       WHERE prior_event.tenant_id = v_event.tenant_id
         AND prior_event.provider = 'sepay'
         AND prior_event.id <> v_event.id
         AND prior_event.signature_valid
         AND lower(COALESCE(prior_event.payload ->> 'transferType', '')) = 'in'
         AND prior_event.processing_status = 'processed'
         AND prior_event.error_code IS NULL
         AND prior_event.payment_id IS NOT NULL
         AND (
           prior_event.order_id = v_order.id
           OR prior_payment.order_id = v_order.id
         )
     ) THEN
    UPDATE public.webhook_events
    SET order_id = v_order.id,
        payment_id = NULL,
        processing_status = 'processed',
        http_status = 200,
        error_code = 'overpayment_needs_review',
        processed_at = COALESCE(processed_at, now())
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'status', 'payment_confirmation_failed',
      'review_code', 'overpayment_needs_review',
      'order_id', v_order.id
    );
  END IF;

  SELECT public.confirm_sepay_payment(
    v_event.tenant_id,
    v_order.id,
    v_order.payment_code,
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
        payment_id = NULL,
        processing_status = 'failed',
        http_status = 500,
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
        payment_id = NULL,
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

REVOKE ALL ON FUNCTION public.confirm_sepay_payment(
  bigint,
  bigint,
  text,
  numeric,
  text,
  text,
  jsonb
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.link_sepay_transaction_to_payment(
  p_event_id bigint,
  p_payment_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
    OR NOT public.auth_is_owner(v_user_id)
    OR NOT public.has_permission_any('finance:view')
  THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
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

  IF v_event.processing_status <> 'processed'
     OR (
       v_event.error_code IS NOT NULL
       AND v_event.error_code NOT IN (
          'missing_payment_code_needs_review',
          'order_not_found_needs_review',
          'ambiguous_payment_code_needs_review',
          'amount_mismatch_needs_review'
       )
     ) THEN
    RAISE EXCEPTION 'webhook_event_failed' USING ERRCODE = '23514';
  END IF;

  IF lower(COALESCE(v_event.payload ->> 'transferType', '')) <> 'in' THEN
    RAISE EXCEPTION 'webhook_event_not_in' USING ERRCODE = '23514';
  END IF;

  v_raw_amount := btrim(COALESCE(v_event.payload ->> 'transferAmount', ''));
  IF v_raw_amount !~ '^[0-9]+([.][0-9]+)?$' THEN
    RAISE EXCEPTION 'webhook_event_amount_invalid' USING ERRCODE = '22023';
  END IF;

  v_amount := v_raw_amount::numeric;
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
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
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
      AND lower(COALESCE(other_event.payload ->> 'transferType', '')) = 'in'
      AND other_event.processing_status = 'processed'
      AND other_event.error_code IS NULL
  ) THEN
    RAISE EXCEPTION 'payment_already_has_bank_webhook' USING ERRCODE = '23505';
  END IF;

  UPDATE public.webhook_events
  SET order_id = v_payment.order_id,
      payment_id = p_payment_id,
      processing_status = 'processed',
      http_status = 200,
      error_code = NULL,
      processed_at = COALESCE(processed_at, now())
  WHERE id = p_event_id
    AND tenant_id = v_tenant_id;

  PERFORM public.log_audit(
    'link_sepay_transaction_to_payment',
    'webhook_event',
    p_event_id,
    jsonb_build_object(
      'order_id', v_event.order_id,
      'payment_id', v_event.payment_id,
      'processing_status', v_event.processing_status,
      'error_code', v_event.error_code
    ),
    jsonb_build_object(
      'order_id', v_payment.order_id,
      'payment_id', p_payment_id,
      'processing_status', 'processed',
      'error_code', NULL,
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

REVOKE ALL ON FUNCTION public.link_sepay_transaction_to_payment(bigint, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.link_sepay_transaction_to_payment(bigint, bigint)
  TO authenticated;

UPDATE public.webhook_events
SET processing_status = 'processed',
    http_status = 200,
    error_code = CASE error_code
      WHEN 'invalid_payment_code' THEN 'missing_payment_code_needs_review'
      WHEN 'missing_payment_code' THEN 'missing_payment_code_needs_review'
      WHEN 'order_not_found' THEN 'order_not_found_needs_review'
      WHEN 'ambiguous_payment_code' THEN 'ambiguous_payment_code_needs_review'
      WHEN 'amount_mismatch' THEN 'amount_mismatch_needs_review'
    END,
    processed_at = COALESCE(processed_at, now())
WHERE provider = 'sepay'
  AND signature_valid
  AND lower(COALESCE(payload ->> 'transferType', '')) = 'in'
  AND payment_id IS NULL
  AND expense_id IS NULL
  AND processing_status = 'failed'
  AND http_status = 200
  AND error_code IN (
    'invalid_payment_code',
    'missing_payment_code',
    'order_not_found',
    'ambiguous_payment_code',
    'amount_mismatch'
  );
