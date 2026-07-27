CREATE OR REPLACE FUNCTION public.self_order_cancel_vietqr_payment(
  p_token text,
  p_client_op_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_table record;
  v_request_ref public.self_order_payment_requests%ROWTYPE;
  v_request public.self_order_payment_requests%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_payment_found boolean := false;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT t.id AS table_id, t.tenant_id
  INTO v_table
  FROM public.tables t
  JOIN public.branches b
    ON b.id = t.branch_id
   AND b.tenant_id = t.tenant_id
   AND b.is_active = true
  WHERE t.self_order_token = p_token
    AND t.self_order_enabled = true
    AND t.status <> 'maintenance'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_or_disabled_token'
    );
  END IF;

  SELECT pr.*
  INTO v_request_ref
  FROM public.self_order_payment_requests pr
  WHERE pr.tenant_id = v_table.tenant_id
    AND pr.table_id = v_table.table_id
    AND pr.client_op_id = p_client_op_id
  ORDER BY pr.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'self_order_payment_request_not_found'
    );
  END IF;
  IF v_request_ref.method <> 'vietqr' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'self_order_payment_cancel_not_allowed'
    );
  END IF;
  IF v_request_ref.status <> 'vietqr_pending' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true
    ) || public.self_order_payment_request_public_payload(v_request_ref.id);
  END IF;

  SELECT o.*
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_request_ref.order_id
    AND o.tenant_id = v_request_ref.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_payment_order_missing' USING ERRCODE = '23503';
  END IF;
  IF NOT pg_try_advisory_xact_lock(v_order.id) THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END IF;

  BEGIN
    SELECT p.*
    INTO v_payment
    FROM public.payments p
    WHERE p.tenant_id = v_request_ref.tenant_id
      AND p.order_id = v_request_ref.order_id
      AND (
        p.id = v_request_ref.payment_id
        OR (
          p.status = 'completed'
          AND p.method = 'vietqr'
        )
      )
    ORDER BY
      CASE WHEN p.status = 'completed' THEN 0 ELSE 1 END,
      CASE WHEN p.id = v_request_ref.payment_id THEN 0 ELSE 1 END,
      p.id DESC
    LIMIT 1
    FOR UPDATE NOWAIT;
    v_payment_found := FOUND;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END;

  SELECT pr.*
  INTO v_request
  FROM public.self_order_payment_requests pr
  WHERE pr.id = v_request_ref.id
    AND pr.tenant_id = v_request_ref.tenant_id
    AND pr.table_id = v_table.table_id
    AND pr.client_op_id = p_client_op_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'self_order_payment_request_not_found'
    );
  END IF;
  IF v_request.status <> 'vietqr_pending' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true
    ) || public.self_order_payment_request_public_payload(v_request.id);
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid'
     OR (v_payment_found AND v_payment.status = 'completed') THEN
    UPDATE public.self_order_payment_requests
    SET status = 'completed',
        payment_id = CASE
          WHEN v_payment_found AND v_payment.status = 'completed'
            THEN v_payment.id
          ELSE v_request.payment_id
        END,
        completed_at = COALESCE(
          CASE WHEN v_payment_found THEN v_payment.paid_at ELSE NULL END,
          now()
        )
    WHERE id = v_request.id
      AND status = 'vietqr_pending';

    RETURN jsonb_build_object('ok', true)
      || public.self_order_payment_request_public_payload(v_request.id);
  END IF;

  UPDATE public.self_order_payment_requests
  SET status = 'cancelled',
      cancelled_at = now(),
      cancel_reason = 'guest_cancelled_vietqr'
  WHERE id = v_request.id
    AND status = 'vietqr_pending';

  IF v_payment_found AND v_payment.status = 'pending' THEN
    UPDATE public.payments
    SET status = 'failed',
        updated_at = now()
    WHERE id = v_payment.id
      AND tenant_id = v_request.tenant_id
      AND status = 'pending';
  END IF;

  UPDATE public.orders o
  SET payment_status = 'unpaid',
      payment_method = NULL,
      updated_at = now()
  WHERE o.id = v_request.order_id
    AND o.tenant_id = v_request.tenant_id
    AND COALESCE(o.payment_status, 'unpaid') <> 'paid'
    AND NOT EXISTS (
      SELECT 1
      FROM public.payments p
      WHERE p.tenant_id = v_request.tenant_id
        AND p.order_id = v_request.order_id
        AND p.status IN ('pending', 'completed')
    );

  RETURN jsonb_build_object('ok', true)
    || public.self_order_payment_request_public_payload(v_request.id);
END;
$$;

REVOKE ALL ON FUNCTION public.self_order_cancel_vietqr_payment(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_order_cancel_vietqr_payment(text, uuid)
  TO service_role;

COMMENT ON FUNCTION public.self_order_cancel_vietqr_payment(text, uuid)
IS 'Cancel the exact active VietQR request bound to a public self-order table token.';

CREATE OR REPLACE FUNCTION public.self_order_enforce_payment_request_invariants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.branch_id IS DISTINCT FROM NEW.branch_id
     OR OLD.table_id IS DISTINCT FROM NEW.table_id
     OR OLD.order_id IS DISTINCT FROM NEW.order_id
     OR OLD.client_op_id IS DISTINCT FROM NEW.client_op_id
     OR OLD.method IS DISTINCT FROM NEW.method
     OR OLD.amount_snapshot IS DISTINCT FROM NEW.amount_snapshot
     OR OLD.invoice_payload IS DISTINCT FROM NEW.invoice_payload
     OR OLD.request_fingerprint IS DISTINCT FROM NEW.request_fingerprint
     OR OLD.request_fingerprint_version IS DISTINCT FROM NEW.request_fingerprint_version
     OR OLD.payment_code_snapshot IS DISTINCT FROM NEW.payment_code_snapshot
     OR OLD.qr_payload_snapshot IS DISTINCT FROM NEW.qr_payload_snapshot
     OR OLD.vietqr_config_snapshot IS DISTINCT FROM NEW.vietqr_config_snapshot
     OR OLD.expires_at IS DISTINCT FROM NEW.expires_at THEN
    RAISE EXCEPTION 'self_order_payment_request_immutable' USING ERRCODE = '22023';
  END IF;

  IF OLD.payment_id IS DISTINCT FROM NEW.payment_id
     AND NOT (
       NEW.payment_id IS NOT NULL
       AND NEW.status = 'completed'
       AND (
         (
           OLD.payment_id IS NULL
           AND OLD.status IN ('cash_call', 'vietqr_pending')
         )
         OR (
           OLD.status = 'cancelled'
           AND OLD.method = 'vietqr'
           AND OLD.cancel_reason = 'guest_cancelled_vietqr'
         )
       )
     ) THEN
    RAISE EXCEPTION 'self_order_payment_binding_immutable' USING ERRCODE = '22023';
  END IF;

  IF OLD.cancel_reason IS DISTINCT FROM NEW.cancel_reason
     AND NOT (
       OLD.cancel_reason IS NULL
       AND NEW.cancel_reason IS NOT NULL
       AND OLD.status IN ('cash_call', 'vietqr_pending')
       AND NEW.status = 'cancelled'
     ) THEN
    RAISE EXCEPTION 'self_order_payment_cancel_reason_immutable' USING ERRCODE = '22023';
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status
     AND NOT (
       (
         OLD.status IN ('cash_call', 'vietqr_pending')
         AND NEW.status IN ('completed', 'cancelled', 'expired')
       )
       OR (
         OLD.status = 'cancelled'
         AND OLD.method = 'vietqr'
         AND OLD.cancel_reason = 'guest_cancelled_vietqr'
         AND NEW.status = 'completed'
       )
     ) THEN
    RAISE EXCEPTION 'self_order_invalid_payment_request_transition' USING ERRCODE = '22023';
  END IF;

  IF NEW.status = 'completed'
     AND (NEW.completed_at IS NULL OR NEW.payment_id IS NULL) THEN
    RAISE EXCEPTION 'self_order_completed_request_missing_payment_evidence' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL THEN
    RAISE EXCEPTION 'self_order_cancelled_request_missing_timestamp' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'expired' AND NEW.expired_at IS NULL THEN
    RAISE EXCEPTION 'self_order_expired_request_missing_timestamp' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.self_order_enforce_payment_request_invariants()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.self_order_sync_payment_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_status_changed boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_status_changed := true;
  ELSIF TG_OP = 'UPDATE' THEN
    v_status_changed := OLD.status IS DISTINCT FROM NEW.status;
  END IF;

  IF NEW.status = 'completed' AND v_status_changed THEN
    UPDATE public.self_order_payment_requests pr
    SET status = 'completed',
        payment_id = COALESCE(pr.payment_id, NEW.id),
        completed_at = COALESCE(NEW.paid_at, now())
    WHERE pr.tenant_id = NEW.tenant_id
      AND pr.order_id = NEW.order_id
      AND pr.status IN ('cash_call', 'vietqr_pending')
      AND (
        pr.payment_id = NEW.id
        OR (
          pr.payment_id IS NULL
          AND pr.method = 'cash_call'
          AND NEW.method = 'cash'
        )
        OR (
          pr.method = 'vietqr'
          AND NEW.method = 'vietqr'
        )
      );

    IF NOT FOUND AND NEW.method = 'vietqr' THEN
      UPDATE public.self_order_payment_requests pr
      SET status = 'completed',
          payment_id = NEW.id,
          completed_at = COALESCE(NEW.paid_at, now())
      WHERE pr.id = (
        SELECT candidate.id
        FROM public.self_order_payment_requests candidate
        WHERE candidate.tenant_id = NEW.tenant_id
          AND candidate.order_id = NEW.order_id
          AND candidate.method = 'vietqr'
          AND candidate.status = 'cancelled'
          AND candidate.cancel_reason = 'guest_cancelled_vietqr'
          AND candidate.amount_snapshot = NEW.amount
          AND candidate.payment_code_snapshot IS NOT NULL
          AND NULLIF(btrim(COALESCE(NEW.provider_ref, '')), '') IS NOT NULL
          AND lower(COALESCE(candidate.payment_code_snapshot, ''))
            = lower(COALESCE(NEW.provider_ref, ''))
        ORDER BY candidate.id DESC
        LIMIT 1
      );
    END IF;
  ELSIF NEW.status = 'failed' AND v_status_changed THEN
    UPDATE public.self_order_payment_requests pr
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = COALESCE(pr.cancel_reason, 'payment_failed')
    WHERE pr.tenant_id = NEW.tenant_id
      AND pr.payment_id = NEW.id
      AND pr.status IN ('cash_call', 'vietqr_pending');

    IF FOUND THEN
      UPDATE public.orders o
      SET payment_status = 'unpaid',
          payment_method = NULL,
          updated_at = now()
      WHERE o.id = NEW.order_id
        AND o.tenant_id = NEW.tenant_id
        AND COALESCE(o.payment_status, 'unpaid') <> 'paid'
        AND NOT EXISTS (
          SELECT 1
          FROM public.payments p
          WHERE p.tenant_id = NEW.tenant_id
            AND p.order_id = NEW.order_id
            AND p.status IN ('pending', 'completed')
        );
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.self_order_sync_payment_request()
  FROM PUBLIC, anon, authenticated, service_role;
