CREATE OR REPLACE FUNCTION public.confirm_cash_payment(
  p_order_id bigint,
  p_cash_received numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_order public.orders%ROWTYPE;
  v_existing_id bigint;
  v_existing_st text;
  v_existing_method text;
  v_existing_provider_ref text;
  v_payment_id bigint;
  v_provider_ref text;
  v_cash_change numeric(15,2);
  v_complete_res record;
  v_receipt_res jsonb;
  v_print_warning text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'pos:confirm_payment') THEN
    RAISE EXCEPTION 'permission denied: pos:confirm_payment' USING ERRCODE = '42501';
  END IF;

  IF v_order.payment_status = 'paid' THEN
    SELECT id INTO v_payment_id
    FROM public.payments
    WHERE order_id = p_order_id
      AND tenant_id = v_order.tenant_id
      AND status = 'completed'
    ORDER BY id DESC
    LIMIT 1;

    RETURN jsonb_build_object(
      'status',        'already_completed',
      'order_id',      p_order_id,
      'payment_id',    v_payment_id,
      'cash_received', v_order.cash_received,
      'cash_change',   COALESCE(v_order.cash_change, 0),
      'print_job_id',  NULL,
      'idempotent',    true
    );
  END IF;

  IF p_cash_received IS NULL THEN
    RAISE EXCEPTION 'cash_received required' USING ERRCODE = 'P0001';
  END IF;
  IF p_cash_received < v_order.total_amount THEN
    RAISE EXCEPTION 'cash_received (%) must be >= total_amount (%)',
      p_cash_received, v_order.total_amount
      USING ERRCODE = 'P0001';
  END IF;

  IF p_cash_received > GREATEST(v_order.total_amount * 10, 50000000) THEN
    RAISE EXCEPTION 'cash_received (%) exceeds sane upper bound for total (%)',
      p_cash_received, v_order.total_amount
      USING ERRCODE = 'P0001';
  END IF;

  v_provider_ref := upper(v_order.payment_code);
  v_cash_change := p_cash_received - v_order.total_amount;

  SELECT id, status, method, provider_ref
  INTO v_existing_id, v_existing_st, v_existing_method, v_existing_provider_ref
  FROM public.payments
  WHERE order_id = p_order_id
    AND tenant_id = v_order.tenant_id
    AND status <> 'failed'
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_st = 'completed' THEN
    RETURN jsonb_build_object(
      'status',        'already_completed',
      'order_id',      p_order_id,
      'payment_id',    v_existing_id,
      'cash_received', COALESCE(v_order.cash_received, p_cash_received),
      'cash_change',   COALESCE(v_order.cash_change, v_cash_change),
      'print_job_id',  NULL,
      'idempotent',    true
    );
  END IF;

  IF v_existing_st = 'pending' AND v_existing_method = 'momo' THEN
    RAISE EXCEPTION 'pending_momo_payment_requires_provider_resolution'
      USING ERRCODE = '55P03';
  END IF;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.payments
       SET method        = 'cash',
           amount        = v_order.total_amount,
           status        = 'pending',
           provider_ref  = COALESCE(v_provider_ref, v_existing_provider_ref),
           provider_data = COALESCE(provider_data, '{}'::jsonb)
                           || jsonb_build_object('description', COALESCE(v_provider_ref, v_existing_provider_ref)),
           updated_at    = now()
     WHERE id = v_existing_id;
    v_payment_id := v_existing_id;
  ELSE
    INSERT INTO public.payments (
      tenant_id, branch_id, order_id, method, amount, status, provider_ref, provider_data, created_by
    ) VALUES (
      v_order.tenant_id, v_order.branch_id, p_order_id, 'cash',
      v_order.total_amount, 'pending', v_provider_ref,
      jsonb_build_object('description', v_provider_ref),
      v_uid
    )
    RETURNING id INTO v_payment_id;
  END IF;

  UPDATE public.orders
     SET payment_method = 'cash',
         updated_at     = now()
   WHERE id = p_order_id;

  SELECT * INTO v_complete_res
  FROM public.complete_payment_and_consume_stock(
    v_payment_id,
    v_order.total_amount,
    jsonb_build_object('cash_received', p_cash_received, 'cash_change', v_cash_change),
    v_uid
  );

  IF v_complete_res.status = 'stock_failed' THEN
    RETURN jsonb_build_object(
      'status',      'stock_failed',
      'order_id',    p_order_id,
      'payment_id',  v_payment_id,
      'error_code',  'stock_consumption_failed',
      'detail',      v_complete_res.detail
    );
  END IF;

  IF v_complete_res.status = 'amount_mismatch_recomputed' THEN
    RETURN jsonb_build_object(
      'status',      'amount_mismatch_recomputed',
      'order_id',    p_order_id,
      'payment_id',  v_payment_id,
      'error_code',  'amount_mismatch_recomputed',
      'detail',      v_complete_res.detail
    );
  END IF;

  IF v_complete_res.status NOT IN ('completed', 'already_completed') THEN
    RAISE EXCEPTION 'payment completion failed: % (detail: %)',
      v_complete_res.status, v_complete_res.detail
      USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    v_receipt_res := public.enqueue_receipt_print(
      p_order_id,
      p_cash_received,
      v_cash_change
    );
  EXCEPTION WHEN OTHERS THEN
    v_print_warning := SQLERRM;
    v_receipt_res := jsonb_build_object('error', SQLERRM);
    RAISE NOTICE '[confirm_cash_payment] receipt enqueue skipped for order %: %',
      p_order_id, SQLERRM;
  END;

  RETURN jsonb_build_object(
    'status',        'completed',
    'order_id',      p_order_id,
    'payment_id',    v_payment_id,
    'cash_received', p_cash_received,
    'cash_change',   v_cash_change,
    'print_job_id',  v_receipt_res->>'job_id',
    'print_warning', v_print_warning
  );
END;
$$;

COMMENT ON FUNCTION public.confirm_cash_payment(bigint, numeric) IS
  'Atomically completes cash payment while preserving an existing pending MoMo intent for provider settlement.';

CREATE OR REPLACE FUNCTION public.cancel_pending_payment(
  p_payment_id bigint,
  p_tenant_id bigint,
  p_branch_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order_id bigint;
  v_payment record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(p_branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'permission denied: pos:use' USING ERRCODE = '42501';
  END IF;

  SELECT payment.order_id
  INTO v_order_id
  FROM public.payments payment
  WHERE payment.id = p_payment_id
    AND payment.tenant_id = p_tenant_id
    AND payment.branch_id = p_branch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(v_order_id);

  PERFORM 1
  FROM public.orders order_row
  WHERE order_row.id = v_order_id
    AND order_row.tenant_id = p_tenant_id
    AND order_row.branch_id = p_branch_id
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT
    payment.id,
    payment.order_id,
    payment.method,
    payment.status,
    payment.provider_data
  INTO v_payment
  FROM public.payments payment
  WHERE payment.id = p_payment_id
    AND payment.tenant_id = p_tenant_id
    AND payment.branch_id = p_branch_id
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_payment.order_id IS DISTINCT FROM v_order_id THEN
    RAISE EXCEPTION 'payment_order_changed' USING ERRCODE = '40001';
  END IF;
  IF v_payment.status <> 'pending' THEN
    RAISE EXCEPTION 'payment_not_pending' USING ERRCODE = 'P0001';
  END IF;
  IF v_payment.method = 'momo' THEN
    RAISE EXCEPTION 'momo_cancellation_requires_provider_confirmation'
      USING ERRCODE = '55P03';
  END IF;
  IF COALESCE(v_payment.provider_data ->> 'source', '') = 'qr_self_order'
    OR EXISTS (
      SELECT 1
      FROM public.self_order_payment_requests request
      WHERE request.tenant_id = p_tenant_id
        AND request.payment_id = v_payment.id
        AND request.status IN ('cash_call', 'vietqr_pending')
    )
  THEN
    RAISE EXCEPTION 'self_order_payment_owned' USING ERRCODE = '55P03';
  END IF;

  UPDATE public.payments
  SET status = 'failed',
      updated_at = now()
  WHERE id = p_payment_id;

  UPDATE public.orders
  SET payment_status = 'unpaid',
      payment_method = NULL,
      updated_at = now()
  WHERE id = v_payment.order_id
    AND payment_status <> 'paid';
END;
$$;

COMMENT ON FUNCTION public.cancel_pending_payment(
  bigint,
  bigint,
  bigint
) IS 'Cancel a pending payment under the same order-scoped transaction lock used by payment creation and settlement.';

REVOKE ALL ON FUNCTION public.cancel_pending_payment(
  bigint,
  bigint,
  bigint
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_pending_payment(
  bigint,
  bigint,
  bigint
) TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.payments payment
    WHERE payment.method = 'momo'
      AND payment.status = 'pending'
      AND (
        jsonb_typeof(payment.provider_data) IS DISTINCT FROM 'object'
        OR NULLIF(btrim(payment.provider_ref), '') IS NULL
        OR NULLIF(btrim(payment.provider_data ->> 'providerRef'), '')
          IS DISTINCT FROM NULLIF(btrim(payment.provider_ref), '')
        OR NULLIF(btrim(payment.provider_data ->> 'qrCodeUrl'), '') IS NULL
        OR NULLIF(btrim(payment.provider_data ->> 'requestId'), '') IS NULL
        OR NULLIF(btrim(payment.provider_data ->> 'momoOrderId'), '')
          IS DISTINCT FROM NULLIF(btrim(payment.provider_ref), '')
      )
  ) THEN
    RAISE EXCEPTION 'pending_momo_provider_metadata_reconciliation_required'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.create_payment(
  bigint,
  bigint,
  bigint,
  text,
  numeric,
  uuid,
  text,
  text
);

DROP FUNCTION IF EXISTS public.persist_pending_payment_provider_data(
  bigint,
  text,
  jsonb
);

DROP FUNCTION IF EXISTS public.persist_pending_payment_provider_data(
  bigint,
  bigint,
  bigint,
  uuid,
  text,
  jsonb
);

CREATE OR REPLACE FUNCTION public.create_payment(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_order_id bigint,
  p_method text,
  p_amount numeric,
  p_created_by uuid,
  p_provider_ref text,
  p_provider_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment_id bigint;
  v_existing_payment_id bigint;
  v_existing_status text;
  v_existing_method text;
  v_existing_amount numeric;
  v_existing_provider_ref text;
  v_existing_provider_data jsonb;
  v_requested_provider_ref text;
  v_requested_provider_data jsonb;
  v_line_subtotal numeric(15,2) := 0;
  v_recomputed_total numeric(15,2) := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = p_created_by
      AND profile.tenant_id = p_tenant_id
      AND COALESCE(profile.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'actor_inactive_or_tenant_mismatch'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.auth_is_owner(p_created_by)
    AND NOT EXISTS (
      SELECT 1
      FROM public.staff_permissions permission
      WHERE permission.user_id = p_created_by
        AND permission.tenant_id = p_tenant_id
        AND permission.permission_key = 'pos:use'
        AND (
          permission.branch_id = p_branch_id
          OR permission.branch_id IS NULL
        )
        AND permission.valid_from <= now()
        AND (
          permission.valid_until IS NULL
          OR permission.valid_until > now()
        )
    )
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_method NOT IN ('momo', 'vietqr') THEN
    RAISE EXCEPTION 'remote_payment_method_required' USING ERRCODE = '22023';
  END IF;

  v_requested_provider_ref := NULLIF(btrim(p_provider_ref), '');
  IF v_requested_provider_ref IS NULL THEN
    RAISE EXCEPTION 'remote_payment_provider_ref_required' USING ERRCODE = '22023';
  END IF;

  IF p_provider_data IS NULL OR jsonb_typeof(p_provider_data) <> 'object' THEN
    RAISE EXCEPTION 'provider_data_must_be_object' USING ERRCODE = '22023';
  END IF;
  IF p_provider_data ?| ARRAY[
    'bankWebhookReview',
    'source',
    'invoicePayload',
    'momoFailure'
  ] THEN
    RAISE EXCEPTION 'provider_data_contains_reserved_key'
      USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_provider_data ->> 'providerRef'), '')
    IS DISTINCT FROM v_requested_provider_ref
  THEN
    RAISE EXCEPTION 'provider_data_ref_mismatch' USING ERRCODE = '23514';
  END IF;
  IF p_method = 'momo'
    AND (
      NULLIF(btrim(p_provider_data ->> 'qrCodeUrl'), '') IS NULL
      OR NULLIF(btrim(p_provider_data ->> 'requestId'), '') IS NULL
      OR NULLIF(btrim(p_provider_data ->> 'momoOrderId'), '')
        IS DISTINCT FROM v_requested_provider_ref
    )
  THEN
    RAISE EXCEPTION 'momo_provider_metadata_incomplete'
      USING ERRCODE = '23514';
  END IF;
  v_requested_provider_data := p_provider_data;

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT order_row.*
  INTO v_order
  FROM public.orders order_row
  WHERE order_row.id = p_order_id
    AND order_row.tenant_id = p_tenant_id
    AND order_row.branch_id = p_branch_id
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'order_already_paid' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(
    SUM(order_item.quantity::numeric * order_item.unit_price),
    0
  )::numeric(15,2)
  INTO v_line_subtotal
  FROM public.order_items order_item
  WHERE order_item.order_id = v_order.id
    AND order_item.tenant_id = v_order.tenant_id
    AND order_item.status <> 'cancelled';

  v_recomputed_total := ROUND(
    v_line_subtotal
    + COALESCE(v_order.tax_amount, 0)
    + COALESCE(v_order.service_charge, 0)
    - COALESCE(v_order.discount_amount, 0),
    2
  );

  IF ABS(p_amount - v_recomputed_total) > 1
    OR ABS(v_order.total_amount - v_recomputed_total) > 1
  THEN
    RAISE EXCEPTION 'amount_mismatch_recomputed: stored=% expected=% recomputed=%',
      v_order.total_amount,
      p_amount,
      v_recomputed_total
      USING ERRCODE = '23514';
  END IF;

  IF p_amount <> v_order.total_amount THEN
    RAISE EXCEPTION 'amount_mismatch: expected % got %',
      v_order.total_amount,
      p_amount
      USING ERRCODE = '22023';
  END IF;

  IF p_method = 'vietqr' THEN
    IF NULLIF(btrim(v_order.payment_code), '') IS NULL THEN
      RAISE EXCEPTION 'order_payment_code_required' USING ERRCODE = '23514';
    END IF;
    IF lower(v_requested_provider_ref)
      IS DISTINCT FROM lower(btrim(v_order.payment_code))
    THEN
      RAISE EXCEPTION 'vietqr_provider_ref_mismatch'
        USING ERRCODE = '23514';
    END IF;
    v_requested_provider_ref := btrim(v_order.payment_code);
    v_requested_provider_data := jsonb_set(
      v_requested_provider_data,
      '{providerRef}',
      to_jsonb(v_requested_provider_ref),
      true
    );
  END IF;

  SELECT
    payment.id,
    payment.status,
    payment.method,
    payment.amount,
    payment.provider_ref,
    payment.provider_data
  INTO
    v_existing_payment_id,
    v_existing_status,
    v_existing_method,
    v_existing_amount,
    v_existing_provider_ref,
    v_existing_provider_data
  FROM public.payments payment
  WHERE payment.tenant_id = p_tenant_id
    AND payment.branch_id = p_branch_id
    AND payment.order_id = p_order_id
    AND payment.status <> 'failed'
  ORDER BY payment.id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_status = 'completed' THEN
    RAISE EXCEPTION 'payment_already_completed' USING ERRCODE = 'P0001';
  ELSIF v_existing_status = 'pending' THEN
    IF v_existing_method IS DISTINCT FROM p_method THEN
      RAISE EXCEPTION 'payment_pending_different_method: existing=% requested=%',
        v_existing_method,
        p_method
        USING ERRCODE = '23505';
    END IF;

    IF v_existing_amount IS DISTINCT FROM p_amount THEN
      RAISE EXCEPTION 'payment_pending_amount_mismatch'
        USING ERRCODE = '23514';
    END IF;

    IF COALESCE(v_existing_provider_data ->> 'source', '') = 'qr_self_order'
      OR EXISTS (
        SELECT 1
        FROM public.self_order_payment_requests request
        WHERE request.tenant_id = p_tenant_id
          AND request.payment_id = v_existing_payment_id
          AND request.status IN ('cash_call', 'vietqr_pending')
      )
    THEN
      RAISE EXCEPTION 'self_order_payment_owned' USING ERRCODE = '55P03';
    END IF;

    IF p_method = 'momo'
      AND (
        NULLIF(btrim(v_existing_provider_ref), '') IS NULL
        OR jsonb_typeof(v_existing_provider_data) IS DISTINCT FROM 'object'
        OR NULLIF(btrim(v_existing_provider_data ->> 'providerRef'), '')
          IS DISTINCT FROM NULLIF(btrim(v_existing_provider_ref), '')
        OR NULLIF(btrim(v_existing_provider_data ->> 'qrCodeUrl'), '') IS NULL
        OR NULLIF(btrim(v_existing_provider_data ->> 'requestId'), '') IS NULL
        OR NULLIF(btrim(v_existing_provider_data ->> 'momoOrderId'), '')
          IS DISTINCT FROM NULLIF(btrim(v_existing_provider_ref), '')
      )
    THEN
      RAISE EXCEPTION 'pending_momo_provider_metadata_incomplete'
        USING ERRCODE = '23514';
    ELSIF p_method = 'vietqr'
      AND (
        v_existing_provider_ref IS DISTINCT FROM v_requested_provider_ref
        OR jsonb_typeof(v_existing_provider_data) IS DISTINCT FROM 'object'
        OR NULLIF(btrim(v_existing_provider_data ->> 'providerRef'), '')
          IS DISTINCT FROM v_requested_provider_ref
      )
    THEN
      UPDATE public.payments
      SET provider_ref = v_requested_provider_ref,
          provider_data = v_requested_provider_data,
          updated_at = now()
      WHERE id = v_existing_payment_id
      RETURNING id INTO v_payment_id;
      v_existing_provider_ref := v_requested_provider_ref;
      v_existing_provider_data := v_requested_provider_data;
    ELSE
      v_payment_id := v_existing_payment_id;
    END IF;
  ELSIF v_existing_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'payment_not_pending: status=%', v_existing_status
      USING ERRCODE = '22023';
  ELSE
    INSERT INTO public.payments (
      tenant_id,
      branch_id,
      order_id,
      method,
      amount,
      status,
      provider_ref,
      provider_data,
      paid_at,
      created_by
    ) VALUES (
      p_tenant_id,
      p_branch_id,
      p_order_id,
      p_method,
      p_amount,
      'pending',
      v_requested_provider_ref,
      v_requested_provider_data,
      NULL,
      p_created_by
    )
    RETURNING id INTO v_payment_id;
  END IF;

  UPDATE public.orders
  SET payment_method = p_method,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'status', 'pending',
    'idempotent', COALESCE(v_existing_status = 'pending', false),
    'provider_ref', COALESCE(v_existing_provider_ref, v_requested_provider_ref)
  );
END;
$$;

COMMENT ON FUNCTION public.create_payment(
  bigint,
  bigint,
  bigint,
  text,
  numeric,
  uuid,
  text,
  jsonb
) IS 'Service-only atomic creation or reuse of a pending VietQR or MoMo intent with trusted provider metadata and an explicitly authorized POS actor.';

REVOKE ALL ON FUNCTION public.create_payment(
  bigint,
  bigint,
  bigint,
  text,
  numeric,
  uuid,
  text,
  jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_payment(
  bigint,
  bigint,
  bigint,
  text,
  numeric,
  uuid,
  text,
  jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.review_completed_vietqr_bank_webhook(
  p_payment_id bigint,
  p_status text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_payment public.payments%ROWTYPE;
  v_old_review jsonb;
  v_new_review jsonb;
  v_provider_data jsonb;
BEGIN
  IF v_actor IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.auth_is_owner(v_actor) THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  IF p_status IS NULL
    OR p_status NOT IN ('reviewing', 'resolved', 'ignored')
  THEN
    RAISE EXCEPTION 'invalid_review_status' USING ERRCODE = '22023';
  END IF;

  SELECT payment.*
  INTO v_payment
  FROM public.payments payment
  WHERE payment.id = p_payment_id
    AND payment.tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_payment.branch_id, 'finance:view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_payment.method <> 'vietqr' OR v_payment.status <> 'completed' THEN
    RAISE EXCEPTION 'payment_not_reviewable' USING ERRCODE = '23514';
  END IF;

  v_provider_data := CASE
    WHEN jsonb_typeof(v_payment.provider_data) = 'object'
      THEN v_payment.provider_data
    ELSE '{}'::jsonb
  END;
  v_old_review := v_provider_data -> 'bankWebhookReview';
  v_new_review := jsonb_build_object(
    'status', p_status,
    'reviewedAt', now(),
    'reviewedBy', v_actor
  );

  UPDATE public.payments
  SET provider_data = v_provider_data || jsonb_build_object(
        'bankWebhookReview',
        v_new_review
      ),
      updated_at = now()
  WHERE id = v_payment.id;

  PERFORM public.log_audit(
    'update_bank_webhook_review',
    'payment',
    v_payment.id,
    jsonb_build_object('bankWebhookReview', v_old_review),
    jsonb_build_object('bankWebhookReview', v_new_review)
  );

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'bank_webhook_review', v_new_review
  );
END;
$$;

COMMENT ON FUNCTION public.review_completed_vietqr_bank_webhook(
  bigint,
  text
) IS 'Owner-only atomic review marker and audit append for a completed VietQR payment missing bank evidence.';

REVOKE ALL ON FUNCTION public.review_completed_vietqr_bank_webhook(
  bigint,
  text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_completed_vietqr_bank_webhook(
  bigint,
  text
) TO authenticated;

DROP FUNCTION IF EXISTS public.finalize_momo_failed_payment(
  bigint,
  bigint
);

CREATE OR REPLACE FUNCTION public.record_momo_pending_result(
  p_event_id bigint,
  p_payment_id bigint,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.webhook_events%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_order_id bigint;
  v_event_amount numeric;
  v_result_code integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'momo_payload_must_be_object' USING ERRCODE = '22023';
  END IF;

  SELECT event.*
  INTO v_event
  FROM public.webhook_events event
  WHERE event.id = p_event_id
    AND event.provider = 'momo'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'webhook_event_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_event.processing_status IN ('processed', 'ignored')
    OR (
      v_event.processing_status = 'failed'
      AND COALESCE(v_event.http_status, 500) < 500
    )
  THEN
    RETURN jsonb_build_object(
      'status', 'already_final',
      'payment_id', v_event.payment_id
    );
  END IF;
  IF v_event.signature_valid IS NOT TRUE THEN
    RAISE EXCEPTION 'webhook_event_signature_invalid' USING ERRCODE = '23514';
  END IF;
  IF v_event.payment_id IS NOT NULL
    AND v_event.payment_id IS DISTINCT FROM p_payment_id
  THEN
    RAISE EXCEPTION 'webhook_event_payment_conflict' USING ERRCODE = '23514';
  END IF;

  SELECT payment.order_id
  INTO v_order_id
  FROM public.payments payment
  WHERE payment.id = p_payment_id
    AND payment.tenant_id = v_event.tenant_id
    AND payment.method = 'momo';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(v_order_id);

  SELECT payment.*
  INTO v_payment
  FROM public.payments payment
  WHERE payment.id = p_payment_id
    AND payment.tenant_id = v_event.tenant_id
    AND payment.method = 'momo'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_event.order_id IS DISTINCT FROM v_payment.order_id
    OR (p_payload ->> 'requestId') IS DISTINCT FROM v_event.request_id
    OR (p_payload ->> 'orderId') IS DISTINCT FROM v_payment.provider_ref
    OR COALESCE(p_payload ->> 'amount', '')
      !~ '^[0-9]{1,18}(\.[0-9]{1,2})?$'
    OR COALESCE(p_payload ->> 'resultCode', '') !~ '^-?[0-9]{1,9}$'
  THEN
    RAISE EXCEPTION 'momo_evidence_mismatch' USING ERRCODE = '23514';
  END IF;

  v_event_amount := (p_payload ->> 'amount')::numeric;
  v_result_code := (p_payload ->> 'resultCode')::integer;
  IF v_event_amount IS DISTINCT FROM v_payment.amount THEN
    RAISE EXCEPTION 'momo_amount_mismatch' USING ERRCODE = '23514';
  END IF;
  IF v_result_code NOT IN (1000, 7000, 7002) THEN
    RAISE EXCEPTION 'momo_result_not_pending' USING ERRCODE = '23514';
  END IF;

  UPDATE public.webhook_events
  SET payment_id = v_payment.id,
      payload = p_payload,
      processing_status = CASE
        WHEN v_payment.status = 'pending' THEN 'received'
        ELSE 'ignored'
      END,
      http_status = 204,
      error_code = CASE
        WHEN v_payment.status = 'pending' THEN 'provider_pending'
        ELSE 'payment_already_final'
      END,
      processed_at = CASE
        WHEN v_payment.status = 'pending' THEN NULL
        ELSE now()
      END
  WHERE id = v_event.id;

  RETURN jsonb_build_object(
    'status', CASE
      WHEN v_payment.status = 'pending' THEN 'pending'
      ELSE 'payment_already_final'
    END,
    'payment_id', v_payment.id
  );
END;
$$;

COMMENT ON FUNCTION public.record_momo_pending_result(
  bigint,
  bigint,
  jsonb
) IS 'Service-only event-first serialization of a signed non-terminal MoMo result without changing payment state.';

REVOKE ALL ON FUNCTION public.record_momo_pending_result(
  bigint,
  bigint,
  jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_momo_pending_result(
  bigint,
  bigint,
  jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_momo_successful_payment(
  p_event_id bigint,
  p_payment_id bigint,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.webhook_events%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_order_id bigint;
  v_event_amount numeric;
  v_result_code integer;
  v_provider_data jsonb;
  v_completion record;
  v_processing_status text;
  v_http_status integer;
  v_error_code text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'momo_payload_must_be_object' USING ERRCODE = '22023';
  END IF;

  SELECT event.*
  INTO v_event
  FROM public.webhook_events event
  WHERE event.id = p_event_id
    AND event.provider = 'momo'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'webhook_event_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_event.processing_status IN ('processed', 'ignored')
    OR (
      v_event.processing_status = 'failed'
      AND COALESCE(v_event.http_status, 500) < 500
    )
  THEN
    RETURN jsonb_build_object(
      'status', 'already_final',
      'payment_id', v_event.payment_id
    );
  END IF;
  IF v_event.signature_valid IS NOT TRUE THEN
    RAISE EXCEPTION 'webhook_event_signature_invalid' USING ERRCODE = '23514';
  END IF;
  IF v_event.payment_id IS NOT NULL
    AND v_event.payment_id IS DISTINCT FROM p_payment_id
  THEN
    RAISE EXCEPTION 'webhook_event_payment_conflict' USING ERRCODE = '23514';
  END IF;

  SELECT payment.order_id
  INTO v_order_id
  FROM public.payments payment
  WHERE payment.id = p_payment_id
    AND payment.tenant_id = v_event.tenant_id
    AND payment.method = 'momo';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(v_order_id);

  SELECT payment.*
  INTO v_payment
  FROM public.payments payment
  WHERE payment.id = p_payment_id
    AND payment.tenant_id = v_event.tenant_id
    AND payment.method = 'momo'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_event.order_id IS DISTINCT FROM v_payment.order_id
    OR (p_payload ->> 'requestId') IS DISTINCT FROM v_event.request_id
    OR (p_payload ->> 'orderId') IS DISTINCT FROM v_payment.provider_ref
    OR COALESCE(p_payload ->> 'amount', '')
      !~ '^[0-9]{1,18}(\.[0-9]{1,2})?$'
    OR COALESCE(p_payload ->> 'resultCode', '') !~ '^-?[0-9]{1,9}$'
  THEN
    RAISE EXCEPTION 'momo_evidence_mismatch' USING ERRCODE = '23514';
  END IF;

  v_event_amount := (p_payload ->> 'amount')::numeric;
  v_result_code := (p_payload ->> 'resultCode')::integer;
  IF v_event_amount IS DISTINCT FROM v_payment.amount THEN
    RAISE EXCEPTION 'momo_amount_mismatch' USING ERRCODE = '23514';
  END IF;
  IF v_result_code NOT IN (0, 9000) THEN
    RAISE EXCEPTION 'momo_result_not_successful' USING ERRCODE = '23514';
  END IF;

  v_provider_data := CASE
    WHEN jsonb_typeof(v_payment.provider_data) = 'object'
      THEN v_payment.provider_data
    ELSE '{}'::jsonb
  END || p_payload;

  SELECT *
  INTO v_completion
  FROM public.complete_payment_and_consume_stock(
    v_payment.id,
    v_event_amount,
    v_provider_data,
    NULL
  );

  CASE
    WHEN v_completion.status IN ('completed', 'already_completed') THEN
      v_processing_status := 'processed';
      v_http_status := 204;
      v_error_code := NULL;
    WHEN v_completion.status = 'stock_failed' THEN
      v_processing_status := 'failed';
      v_http_status := 500;
      v_error_code := 'stock_consumption_failed';
    WHEN v_completion.status IN (
      'amount_mismatch',
      'amount_mismatch_recomputed'
    ) THEN
      v_processing_status := 'failed';
      v_http_status := 204;
      v_error_code := 'amount_mismatch';
    ELSE
      v_processing_status := 'failed';
      v_http_status := 204;
      v_error_code := COALESCE(NULLIF(v_completion.status, ''), 'unexpected_status');
  END CASE;

  UPDATE public.webhook_events
  SET payment_id = v_payment.id,
      payload = p_payload,
      processing_status = v_processing_status,
      http_status = v_http_status,
      error_code = v_error_code,
      processed_at = now()
  WHERE id = v_event.id;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'status', v_completion.status,
    'payment_id', v_payment.id,
    'order_id', v_payment.order_id,
    'detail', v_completion.detail,
    'http_status', v_http_status,
    'error_code', v_error_code
  ));
END;
$$;

COMMENT ON FUNCTION public.finalize_momo_successful_payment(
  bigint,
  bigint,
  jsonb
) IS 'Service-only event-first atomic MoMo success settlement and exact terminal webhook evidence write.';

REVOKE ALL ON FUNCTION public.finalize_momo_successful_payment(
  bigint,
  bigint,
  jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_momo_successful_payment(
  bigint,
  bigint,
  jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_momo_failed_payment(
  p_event_id bigint,
  p_payment_id bigint,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.webhook_events%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_order_id bigint;
  v_outcome text;
  v_failure_data jsonb;
  v_event_amount numeric;
  v_result_code integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'momo_payload_must_be_object' USING ERRCODE = '22023';
  END IF;

  SELECT event.*
  INTO v_event
  FROM public.webhook_events event
  WHERE event.id = p_event_id
    AND event.provider = 'momo'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'webhook_event_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_event.processing_status IN ('processed', 'ignored')
    OR (
      v_event.processing_status = 'failed'
      AND COALESCE(v_event.http_status, 500) < 500
    )
  THEN
    RETURN jsonb_build_object(
      'status', 'already_final',
      'payment_id', v_event.payment_id
    );
  END IF;
  IF v_event.signature_valid IS NOT TRUE THEN
    RAISE EXCEPTION 'webhook_event_signature_invalid' USING ERRCODE = '23514';
  END IF;
  IF v_event.payment_id IS NOT NULL
    AND v_event.payment_id IS DISTINCT FROM p_payment_id
  THEN
    RAISE EXCEPTION 'webhook_event_payment_conflict' USING ERRCODE = '23514';
  END IF;

  SELECT payment.order_id
  INTO v_order_id
  FROM public.payments payment
  WHERE payment.id = p_payment_id
    AND payment.tenant_id = v_event.tenant_id
    AND payment.method = 'momo';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(v_order_id);

  SELECT payment.*
  INTO v_payment
  FROM public.payments payment
  WHERE payment.id = p_payment_id
    AND payment.tenant_id = v_event.tenant_id
    AND payment.method = 'momo'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_event.order_id IS DISTINCT FROM v_payment.order_id
    OR (p_payload ->> 'requestId') IS DISTINCT FROM v_event.request_id
    OR (p_payload ->> 'orderId') IS DISTINCT FROM v_payment.provider_ref
    OR COALESCE(p_payload ->> 'amount', '')
      !~ '^[0-9]{1,18}(\.[0-9]{1,2})?$'
    OR COALESCE(p_payload ->> 'resultCode', '') !~ '^-?[0-9]{1,9}$'
  THEN
    RAISE EXCEPTION 'momo_evidence_mismatch' USING ERRCODE = '23514';
  END IF;

  v_event_amount := (p_payload ->> 'amount')::numeric;
  v_result_code := (p_payload ->> 'resultCode')::integer;
  IF v_event_amount IS DISTINCT FROM v_payment.amount THEN
    RAISE EXCEPTION 'momo_amount_mismatch' USING ERRCODE = '23514';
  END IF;
  IF v_result_code IN (0, 9000, 1000, 7000, 7002) THEN
    RAISE EXCEPTION 'momo_result_not_failed' USING ERRCODE = '23514';
  END IF;

  v_failure_data := jsonb_strip_nulls(jsonb_build_object(
    'requestId', v_event.request_id,
    'orderId', p_payload ->> 'orderId',
    'resultCode', v_result_code,
    'message', p_payload ->> 'message',
    'responseTime', p_payload -> 'responseTime',
    'transId', p_payload -> 'transId'
  ));

  CASE v_payment.status
    WHEN 'pending' THEN
      UPDATE public.payments
      SET status = 'failed',
          provider_data = CASE
            WHEN jsonb_typeof(provider_data) = 'object' THEN provider_data
            ELSE '{}'::jsonb
          END || jsonb_build_object('momoFailure', v_failure_data),
          updated_at = now()
      WHERE id = v_payment.id;

      UPDATE public.orders
      SET payment_status = 'unpaid',
          payment_method = NULL,
          updated_at = now()
      WHERE id = v_payment.order_id
        AND tenant_id = v_payment.tenant_id
        AND branch_id = v_payment.branch_id
        AND payment_status <> 'paid';
      v_outcome := 'failed';
    WHEN 'failed' THEN
      v_outcome := 'already_failed';
    WHEN 'completed' THEN
      v_outcome := 'already_completed';
    WHEN 'refunded' THEN
      v_outcome := 'already_refunded';
    ELSE
      RAISE EXCEPTION 'payment_status_invalid' USING ERRCODE = '23514';
  END CASE;

  UPDATE public.webhook_events
  SET payment_id = v_payment.id,
      payload = p_payload,
      processing_status = CASE
        WHEN v_outcome IN ('already_completed', 'already_refunded')
          THEN 'ignored'
        ELSE 'processed'
      END,
      http_status = 204,
      error_code = CASE
        WHEN v_outcome IN ('failed', 'already_failed')
          THEN 'provider_result_failed'
        ELSE 'payment_already_final'
      END,
      processed_at = now()
  WHERE id = v_event.id;

  RETURN jsonb_build_object(
    'status', v_outcome,
    'payment_id', v_payment.id
  );
END;
$$;

COMMENT ON FUNCTION public.finalize_momo_failed_payment(
  bigint,
  bigint,
  jsonb
) IS 'Service-only event-first atomic MoMo failure transition and exact terminal webhook evidence write; completed or refunded payments are never downgraded.';

REVOKE ALL ON FUNCTION public.finalize_momo_failed_payment(
  bigint,
  bigint,
  jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_momo_failed_payment(
  bigint,
  bigint,
  jsonb
) TO service_role;
