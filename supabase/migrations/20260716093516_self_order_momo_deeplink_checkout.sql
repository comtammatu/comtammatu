BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.self_order_payment_requests pr
    WHERE pr.method NOT IN ('cash_call', 'vietqr')
       OR pr.status NOT IN ('cash_call', 'vietqr_pending', 'completed', 'cancelled', 'expired')
  ) THEN
    RAISE EXCEPTION 'self_order_momo_baseline_payment_request_state_invalid'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

ALTER TABLE public.self_order_payment_requests
  ADD COLUMN momo_checkout_url text,
  ADD COLUMN momo_checkout_claim_id uuid,
  ADD COLUMN momo_checkout_claimed_at timestamptz,
  ADD COLUMN momo_reconcile_claim_id uuid,
  ADD COLUMN momo_reconcile_claimed_at timestamptz,
  ADD COLUMN momo_reconcile_last_attempt_at timestamptz;

ALTER TABLE public.self_order_payment_requests
  DROP CONSTRAINT IF EXISTS self_order_payment_requests_method_check,
  DROP CONSTRAINT IF EXISTS self_order_payment_requests_status_check,
  DROP CONSTRAINT IF EXISTS self_order_payment_requests_status_method_check,
  DROP CONSTRAINT IF EXISTS self_order_payment_requests_active_expiry_required,
  DROP CONSTRAINT IF EXISTS self_order_payment_requests_momo_checkout_url_check,
  DROP CONSTRAINT IF EXISTS self_order_payment_requests_momo_checkout_claim_check,
  DROP CONSTRAINT IF EXISTS self_order_payment_requests_momo_reconcile_claim_check;

ALTER TABLE public.self_order_payment_requests
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
    CHECK (status NOT IN ('cash_call', 'vietqr_pending', 'momo_pending') OR expires_at IS NOT NULL),
  ADD CONSTRAINT self_order_payment_requests_momo_checkout_url_check
    CHECK (
      momo_checkout_url IS NULL
      OR (
        method = 'momo'
        AND momo_checkout_url ~ '^https://(test-payment|payment)[.]momo[.]vn/v2/gateway/pay[?]t=[^&[:space:]]+(&[^[:space:]]*)?$'
      )
    ),
  ADD CONSTRAINT self_order_payment_requests_momo_checkout_claim_check
    CHECK (
      (momo_checkout_claim_id IS NULL) = (momo_checkout_claimed_at IS NULL)
      AND (momo_checkout_claim_id IS NULL OR method = 'momo')
    ),
  ADD CONSTRAINT self_order_payment_requests_momo_reconcile_claim_check
    CHECK (
      (momo_reconcile_claim_id IS NULL) = (momo_reconcile_claimed_at IS NULL)
      AND (momo_reconcile_claim_id IS NULL OR method = 'momo')
    );

DROP INDEX IF EXISTS public.self_order_payment_requests_one_active_per_order;
CREATE UNIQUE INDEX self_order_payment_requests_one_active_per_order
  ON public.self_order_payment_requests (tenant_id, order_id)
  WHERE status IN ('cash_call', 'vietqr_pending', 'momo_pending');

CREATE OR REPLACE FUNCTION public.self_order_payment_request_public_payload(
  p_request_id bigint
)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SET search_path TO ''
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'id', pr.id,
    'clientOpId', pr.client_op_id,
    'status', pr.status,
    'method', pr.method,
    'amount', pr.amount_snapshot,
    'paymentId', pr.payment_id,
    'paymentCode', pr.payment_code_snapshot,
    'qrData', pr.qr_payload_snapshot,
    'bankCode', pr.vietqr_config_snapshot ->> 'bankCode',
    'accountNo', pr.vietqr_config_snapshot ->> 'accountNo',
    'accountName', pr.vietqr_config_snapshot ->> 'accountName',
    'momoDeeplink', CASE
      WHEN pr.method = 'momo' AND pr.status = 'momo_pending'
        THEN payment.provider_data ->> 'deeplink'
      ELSE NULL
    END,
    'momoPayUrl', CASE
      WHEN pr.method = 'momo' AND pr.status = 'momo_pending'
        THEN pr.momo_checkout_url
      ELSE NULL
    END,
    'createdAt', pr.created_at,
    'expiresAt', pr.expires_at
  ))
  FROM public.self_order_payment_requests pr
  LEFT JOIN public.payments payment
    ON payment.id = pr.payment_id
   AND payment.tenant_id = pr.tenant_id
  WHERE pr.id = p_request_id;
$$;

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

  IF OLD.momo_checkout_url IS DISTINCT FROM NEW.momo_checkout_url
     AND NOT (
       OLD.momo_checkout_url IS NULL
       AND NEW.momo_checkout_url IS NOT NULL
       AND OLD.method = 'momo'
       AND OLD.status = 'momo_pending'
       AND NEW.status = 'momo_pending'
       AND OLD.momo_checkout_claim_id IS NOT NULL
       AND OLD.momo_checkout_claim_id = NEW.momo_checkout_claim_id
     ) THEN
    RAISE EXCEPTION 'self_order_momo_checkout_immutable' USING ERRCODE = '22023';
  END IF;

  IF (
    OLD.momo_checkout_claim_id IS DISTINCT FROM NEW.momo_checkout_claim_id
    OR OLD.momo_checkout_claimed_at IS DISTINCT FROM NEW.momo_checkout_claimed_at
  ) AND NOT (
    OLD.method = 'momo'
    AND OLD.status = 'momo_pending'
    AND NEW.status = 'momo_pending'
    AND OLD.momo_checkout_url IS NULL
    AND NEW.momo_checkout_url IS NULL
  ) THEN
    RAISE EXCEPTION 'self_order_momo_checkout_claim_immutable' USING ERRCODE = '22023';
  END IF;

  IF (
    OLD.momo_reconcile_claim_id IS DISTINCT FROM NEW.momo_reconcile_claim_id
    OR OLD.momo_reconcile_claimed_at IS DISTINCT FROM NEW.momo_reconcile_claimed_at
    OR OLD.momo_reconcile_last_attempt_at IS DISTINCT FROM NEW.momo_reconcile_last_attempt_at
  ) AND NOT (
    OLD.method = 'momo'
    AND OLD.status = 'momo_pending'
    AND NEW.status = 'momo_pending'
  ) THEN
    RAISE EXCEPTION 'self_order_momo_reconcile_claim_immutable' USING ERRCODE = '22023';
  END IF;

  IF OLD.payment_id IS DISTINCT FROM NEW.payment_id
     AND NOT (
       OLD.payment_id IS NULL
       AND NEW.payment_id IS NOT NULL
       AND OLD.status IN ('cash_call', 'vietqr_pending', 'momo_pending')
       AND NEW.status = 'completed'
     ) THEN
    RAISE EXCEPTION 'self_order_payment_binding_immutable' USING ERRCODE = '22023';
  END IF;

  IF OLD.cancel_reason IS DISTINCT FROM NEW.cancel_reason
     AND NOT (
       OLD.cancel_reason IS NULL
       AND NEW.cancel_reason IS NOT NULL
       AND OLD.status IN ('cash_call', 'vietqr_pending', 'momo_pending')
       AND NEW.status = 'cancelled'
     ) THEN
    RAISE EXCEPTION 'self_order_payment_cancel_reason_immutable' USING ERRCODE = '22023';
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status
     AND NOT (
       OLD.status IN ('cash_call', 'vietqr_pending', 'momo_pending')
       AND NEW.status IN ('completed', 'cancelled', 'expired')
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

DROP TRIGGER IF EXISTS trg_self_order_enforce_payment_request_invariants
  ON public.self_order_payment_requests;
CREATE TRIGGER trg_self_order_enforce_payment_request_invariants
  BEFORE UPDATE OF
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
    payment_code_snapshot,
    qr_payload_snapshot,
    vietqr_config_snapshot,
    expires_at,
    momo_checkout_url,
    momo_checkout_claim_id,
    momo_checkout_claimed_at,
    momo_reconcile_claim_id,
    momo_reconcile_claimed_at,
    momo_reconcile_last_attempt_at,
    completed_at,
    cancelled_at,
    expired_at,
    cancel_reason
  ON public.self_order_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.self_order_enforce_payment_request_invariants();

REVOKE ALL ON FUNCTION public.self_order_enforce_payment_request_invariants()
  FROM PUBLIC, anon, authenticated, service_role;

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
    SELECT p.id, p.method, p.paid_at
    INTO v_payment_id, v_payment_method, v_paid_at
    FROM public.payments p
    WHERE p.tenant_id = NEW.tenant_id
      AND p.branch_id = NEW.branch_id
      AND p.order_id = NEW.id
      AND p.status = 'completed'
    ORDER BY p.paid_at DESC NULLS LAST, p.id DESC
    LIMIT 1;

    IF v_payment_id IS NULL THEN
      RETURN NULL;
    END IF;

    UPDATE public.self_order_payment_requests pr
    SET status = 'completed',
        payment_id = COALESCE(pr.payment_id, v_payment_id),
        completed_at = COALESCE(v_paid_at, now())
    WHERE pr.tenant_id = NEW.tenant_id
      AND pr.branch_id = NEW.branch_id
      AND pr.order_id = NEW.id
      AND pr.status IN ('cash_call', 'vietqr_pending', 'momo_pending')
      AND (
        (pr.method = 'cash_call' AND v_payment_method = 'cash')
        OR (pr.method = 'vietqr' AND v_payment_method = 'vietqr')
        OR (pr.method = 'momo' AND v_payment_method = 'momo')
      );

    UPDATE public.self_order_payment_requests pr
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = COALESCE(pr.cancel_reason, 'order_paid_by_other_method')
    WHERE pr.tenant_id = NEW.tenant_id
      AND pr.branch_id = NEW.branch_id
      AND pr.order_id = NEW.id
      AND pr.status IN ('cash_call', 'vietqr_pending', 'momo_pending')
      AND NOT (
        (pr.method = 'cash_call' AND v_payment_method = 'cash')
        OR (pr.method = 'vietqr' AND v_payment_method = 'vietqr')
        OR (pr.method = 'momo' AND v_payment_method = 'momo')
      );
  ELSIF NEW.payment_status = 'unpaid' THEN
    UPDATE public.self_order_payment_requests pr
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = COALESCE(pr.cancel_reason, 'momo_provider_failed')
    WHERE pr.tenant_id = NEW.tenant_id
      AND pr.branch_id = NEW.branch_id
      AND pr.order_id = NEW.id
      AND pr.method = 'momo'
      AND pr.status = 'momo_pending'
      AND EXISTS (
        SELECT 1
        FROM public.payments payment
        WHERE payment.id = pr.payment_id
          AND payment.tenant_id = pr.tenant_id
          AND payment.branch_id = pr.branch_id
          AND payment.order_id = pr.order_id
          AND payment.method = 'momo'
          AND payment.status = 'failed'
      );
  ELSIF NEW.status IN ('completed', 'cancelled') THEN
    v_reason := 'order_' || NEW.status;

    UPDATE public.self_order_payment_requests pr
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = COALESCE(pr.cancel_reason, v_reason)
    WHERE pr.tenant_id = NEW.tenant_id
      AND pr.order_id = NEW.id
      AND pr.status IN ('cash_call', 'vietqr_pending');
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_self_order_sync_payment_request_from_order
  ON public.orders;
CREATE TRIGGER trg_self_order_sync_payment_request_from_order
  AFTER UPDATE OF status, payment_status ON public.orders
  FOR EACH ROW
  WHEN (
    OLD.status IS DISTINCT FROM NEW.status
    OR OLD.payment_status IS DISTINCT FROM NEW.payment_status
  ) EXECUTE FUNCTION public.self_order_sync_payment_request_from_order();

REVOKE ALL ON FUNCTION public.self_order_sync_payment_request_from_order()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.self_order_guard_momo_pending_order_terminalization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.status IN ('completed', 'cancelled')
     AND OLD.status IS DISTINCT FROM NEW.status
     AND EXISTS (
       SELECT 1
       FROM public.self_order_payment_requests pr
       WHERE pr.tenant_id = NEW.tenant_id
         AND pr.order_id = NEW.id
         AND pr.method = 'momo'
         AND pr.status = 'momo_pending'
     ) THEN
    RAISE EXCEPTION 'self_order_momo_reconcile_required' USING ERRCODE = '55P03';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_self_order_guard_momo_pending_order_terminalization
  ON public.orders;
CREATE TRIGGER trg_self_order_guard_momo_pending_order_terminalization
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.self_order_guard_momo_pending_order_terminalization();

REVOKE ALL ON FUNCTION public.self_order_guard_momo_pending_order_terminalization()
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  v_definition text;
  v_snapshot_needle text := $needle$
      AND pr.status IN ('cash_call', 'vietqr_pending')
      AND pr.expires_at > now()
$needle$;
  v_snapshot_replacement text := $replacement$
      AND pr.status IN ('cash_call', 'vietqr_pending', 'momo_pending')
      AND (
        pr.status = 'momo_pending'
        OR pr.expires_at > now()
      )
$replacement$;
BEGIN
  SELECT pg_get_functiondef(
    'public.self_order_get_snapshot(text, uuid)'::regprocedure
  ) INTO v_definition;

  IF position(v_snapshot_needle IN v_definition) = 0 THEN
    RAISE EXCEPTION 'self_order_momo_snapshot_contract_changed';
  END IF;

  EXECUTE replace(v_definition, v_snapshot_needle, v_snapshot_replacement);
END;
$$;

DO $$
DECLARE
  v_definition text;
  v_needle text := $needle$
  IF v_request.status NOT IN ('cash_call', 'vietqr_pending') THEN
$needle$;
  v_replacement text := $replacement$
  IF v_request.method = 'momo' AND v_request.status = 'momo_pending' THEN
    RAISE EXCEPTION 'self_order_momo_reconcile_required' USING ERRCODE = '55P03';
  END IF;
  IF v_request.status NOT IN ('cash_call', 'vietqr_pending') THEN
$replacement$;
BEGIN
  SELECT pg_get_functiondef(
    'public.self_order_cancel_payment_request(bigint, text)'::regprocedure
  ) INTO v_definition;

  IF position(v_needle IN v_definition) = 0 THEN
    RAISE EXCEPTION 'self_order_momo_cancel_contract_changed';
  END IF;

  EXECUTE replace(v_definition, v_needle, v_replacement);
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_create_momo_payment_request(
  p_token text,
  p_client_op_id uuid,
  p_invoice_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_table public.tables%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_existing public.self_order_payment_requests%ROWTYPE;
  v_active public.self_order_payment_requests%ROWTYPE;
  v_open_order_count integer := 0;
  v_order_id bigint;
  v_invoice_payload jsonb;
  v_fingerprint text;
  v_payment_id bigint;
  v_provider_ref text;
  v_line_subtotal numeric(15,2) := 0;
  v_recomputed_total numeric(15,2) := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_client_op_id IS NULL THEN
    RAISE EXCEPTION 'self_order_missing_operation_id' USING ERRCODE = '22023';
  END IF;

  v_invoice_payload := public.self_order_normalize_invoice_payload(
    COALESCE(p_invoice_payload, '{}'::jsonb)
  );
  v_fingerprint := public.self_order_payment_request_fingerprint(
    'momo',
    v_invoice_payload
  );

  SELECT t.*
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
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_disabled_token');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('self-order-table'),
    hashtext(v_table.id::text)
  );

  SELECT pr.*
  INTO v_existing
  FROM public.self_order_payment_requests pr
  WHERE pr.tenant_id = v_table.tenant_id
    AND pr.client_op_id = p_client_op_id
  ORDER BY pr.id DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.table_id <> v_table.id
       OR (
         v_existing.request_fingerprint_version = 'payment:v1'
         AND v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint
       ) THEN
      RAISE EXCEPTION 'self_order_idempotency_conflict' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('ok', true, 'idempotent', true)
      || COALESCE(
        public.self_order_payment_request_public_payload(v_existing.id),
        '{}'::jsonb
      );
  END IF;

  IF NOT public.self_order_branch_has_open_pos_session(
    v_table.tenant_id,
    v_table.branch_id
  ) THEN
    RAISE EXCEPTION 'self_order_pos_session_closed' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.system_settings setting
    WHERE setting.tenant_id = v_table.tenant_id
      AND setting.key = 'payment_enable_momo'
      AND lower(btrim(setting.value)) IN ('true', '1')
  ) THEN
    RAISE EXCEPTION 'self_order_momo_unavailable' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer, min(o.id)
  INTO v_open_order_count, v_order_id
  FROM public.orders o
  WHERE o.tenant_id = v_table.tenant_id
    AND o.branch_id = v_table.branch_id
    AND o.table_id = v_table.id
    AND o.payment_status <> 'paid'
    AND o.status NOT IN ('completed', 'cancelled')
    AND o.merged_into_order_id IS NULL;

  IF v_open_order_count <> 1 THEN
    RAISE EXCEPTION 'self_order_order_ambiguous' USING ERRCODE = '22023';
  END IF;

  SELECT o.*
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_order_id
    AND o.tenant_id = v_table.tenant_id
  FOR UPDATE;

  IF NOT pg_try_advisory_xact_lock(v_order.id) THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END IF;
  IF v_order.status NOT IN ('new', 'confirmed', 'preparing', 'ready', 'served')
     OR COALESCE(v_order.payment_status, 'unpaid') = 'paid'
     OR v_order.merged_into_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'self_order_order_not_payable' USING ERRCODE = '22023';
  END IF;
  IF v_order.status NOT IN ('ready', 'served') THEN
    RAISE EXCEPTION 'self_order_payment_not_ready' USING ERRCODE = '22023';
  END IF;
  IF v_order.total_amount <= 0 THEN
    RAISE EXCEPTION 'self_order_momo_requires_positive_amount' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(
    SUM(oi.quantity::numeric * oi.unit_price),
    0
  )::numeric(15,2)
  INTO v_line_subtotal
  FROM public.order_items oi
  WHERE oi.tenant_id = v_order.tenant_id
    AND oi.order_id = v_order.id
    AND oi.status <> 'cancelled';

  v_recomputed_total := ROUND(
    v_line_subtotal
    + COALESCE(v_order.tax_amount, 0)
    + COALESCE(v_order.service_charge, 0)
    - COALESCE(v_order.discount_amount, 0),
    2
  );
  IF ABS(v_order.total_amount - v_recomputed_total) > 1 THEN
    RAISE EXCEPTION 'self_order_momo_amount_mismatch_recomputed'
      USING ERRCODE = '23514';
  END IF;

  SELECT pr.*
  INTO v_active
  FROM public.self_order_payment_requests pr
  WHERE pr.tenant_id = v_order.tenant_id
    AND pr.order_id = v_order.id
    AND pr.status IN ('cash_call', 'vietqr_pending', 'momo_pending')
  ORDER BY pr.id DESC
  LIMIT 1;

  IF FOUND
     AND v_active.status IN ('cash_call', 'vietqr_pending')
     AND v_active.expires_at <= now() THEN
    PERFORM public.self_order_expire_payment_request(v_active.id);
    SELECT pr.*
    INTO v_active
    FROM public.self_order_payment_requests pr
    WHERE pr.tenant_id = v_order.tenant_id
      AND pr.order_id = v_order.id
      AND pr.status IN ('cash_call', 'vietqr_pending', 'momo_pending')
    ORDER BY pr.id DESC
    LIMIT 1;
  END IF;

  IF FOUND THEN
    IF v_active.method = 'momo'
       AND v_active.request_fingerprint_version = 'payment:v1'
       AND v_active.request_fingerprint = v_fingerprint THEN
      RETURN jsonb_build_object('ok', true, 'recovered', true)
        || public.self_order_payment_request_public_payload(v_active.id);
    END IF;
    RAISE EXCEPTION 'self_order_pending_payment_exists' USING ERRCODE = '55P03';
  END IF;

  BEGIN
    PERFORM 1
    FROM public.payments p
    WHERE p.tenant_id = v_order.tenant_id
      AND p.order_id = v_order.id
      AND p.status = 'pending'
    ORDER BY p.id DESC
    LIMIT 1
    FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END;

  IF FOUND THEN
    RAISE EXCEPTION 'self_order_pending_payment_exists' USING ERRCODE = '55P03';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.tenant_id = v_order.tenant_id
      AND p.order_id = v_order.id
      AND p.status = 'completed'
  ) THEN
    RAISE EXCEPTION 'self_order_payment_completed' USING ERRCODE = '22023';
  END IF;

  v_provider_ref := 'MTSO-' || v_order.id::text || '-' ||
    substr(replace(p_client_op_id::text, '-', ''), 1, 20);

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
    v_order.tenant_id,
    v_order.branch_id,
    v_order.id,
    'momo',
    v_order.total_amount,
    'pending',
    v_provider_ref,
    jsonb_build_object(
      'source', 'self_order_momo',
      'providerRef', v_provider_ref,
      'momoOrderId', v_provider_ref,
      'requestId', v_provider_ref,
      'invoicePayload', v_invoice_payload
    ),
    v_order.created_by
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
    v_order.tenant_id,
    v_order.branch_id,
    v_order.table_id,
    v_order.id,
    v_payment_id,
    p_client_op_id,
    'momo',
    'momo_pending',
    v_order.total_amount,
    v_invoice_payload,
    v_fingerprint,
    'payment:v1',
    v_provider_ref,
    now() + interval '15 minutes'
  )
  RETURNING * INTO v_existing;

  RETURN jsonb_build_object('ok', true)
    || public.self_order_payment_request_public_payload(v_existing.id);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'self_order_pending_payment_exists' USING ERRCODE = '55P03';
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_claim_momo_checkout(
  p_token text,
  p_client_op_id uuid,
  p_claim_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_request public.self_order_payment_requests%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_order public.orders%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_client_op_id IS NULL OR p_claim_id IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid_claim');
  END IF;

  SELECT pr.*
  INTO v_request
  FROM public.self_order_payment_requests pr
  JOIN public.tables t
    ON t.id = pr.table_id
   AND t.tenant_id = pr.tenant_id
   AND t.branch_id = pr.branch_id
  JOIN public.branches b
    ON b.id = t.branch_id
   AND b.tenant_id = t.tenant_id
   AND b.is_active = true
  WHERE t.self_order_token = p_token
    AND t.self_order_enabled = true
    AND t.status <> 'maintenance'
    AND pr.client_op_id = p_client_op_id
    AND pr.method = 'momo'
    AND pr.status = 'momo_pending'
  ORDER BY pr.id DESC
  LIMIT 1
  FOR UPDATE OF pr;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'payment_not_pending');
  END IF;

  SELECT p.*
  INTO v_payment
  FROM public.payments p
  WHERE p.id = v_request.payment_id
    AND p.tenant_id = v_request.tenant_id
    AND p.branch_id = v_request.branch_id
    AND p.order_id = v_request.order_id
    AND p.method = 'momo'
    AND p.status = 'pending'
    AND p.provider_ref = v_request.payment_code_snapshot
    AND p.amount = v_request.amount_snapshot
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'payment_not_pending');
  END IF;

  SELECT o.*
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_request.order_id
    AND o.tenant_id = v_request.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'payment_not_pending');
  END IF;
  IF NOT pg_try_advisory_xact_lock(v_request.order_id) THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END IF;

  IF v_request.momo_checkout_url IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'stored');
  END IF;
  IF v_request.momo_checkout_claim_id IS NOT NULL
     AND v_request.momo_checkout_claim_id IS DISTINCT FROM p_claim_id
     AND v_request.momo_checkout_claimed_at >= now() - interval '2 minutes' THEN
    RETURN jsonb_build_object('status', 'in_progress');
  END IF;

  UPDATE public.self_order_payment_requests
  SET momo_checkout_claim_id = p_claim_id,
      momo_checkout_claimed_at = now()
  WHERE id = v_request.id
    AND tenant_id = v_request.tenant_id;

  RETURN jsonb_build_object(
    'status', 'claimed',
    'tenantId', v_request.tenant_id,
    'branchId', v_request.branch_id,
    'orderId', v_request.order_id,
    'orderNumber', v_order.order_number,
    'paymentId', v_payment.id,
    'paymentRequestId', v_request.id,
    'providerRef', v_payment.provider_ref,
    'amount', v_payment.amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_set_momo_checkout(
  p_tenant_id bigint,
  p_payment_id bigint,
  p_payment_request_id bigint,
  p_provider_ref text,
  p_claim_id uuid,
  p_pay_url text,
  p_provider_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_request public.self_order_payment_requests%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_provider_ref text := NULLIF(btrim(p_provider_ref), '');
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_claim_id IS NULL
     OR p_pay_url IS NULL
     OR p_pay_url !~ '^https://(test-payment|payment)[.]momo[.]vn/v2/gateway/pay[?]t=[^&[:space:]]+(&[^[:space:]]*)?$'
     OR v_provider_ref IS NULL
     OR p_provider_data IS NULL
     OR jsonb_typeof(p_provider_data) <> 'object'
     OR NULLIF(btrim(p_provider_data ->> 'providerRef'), '') IS DISTINCT FROM v_provider_ref
     OR NULLIF(btrim(p_provider_data ->> 'momoOrderId'), '') IS DISTINCT FROM v_provider_ref
     OR NULLIF(btrim(p_provider_data ->> 'requestId'), '') IS DISTINCT FROM v_provider_ref
     OR NULLIF(btrim(p_provider_data ->> 'payUrl'), '') IS DISTINCT FROM p_pay_url THEN
    RETURN jsonb_build_object('status', 'invalid_checkout_data');
  END IF;

  SELECT p.*
  INTO v_payment
  FROM public.payments p
  WHERE p.id = p_payment_id
    AND p.tenant_id = p_tenant_id
    AND p.method = 'momo'
    AND p.status = 'pending'
    AND p.provider_ref = v_provider_ref
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'payment_not_pending');
  END IF;

  SELECT pr.*
  INTO v_request
  FROM public.self_order_payment_requests pr
  WHERE pr.id = p_payment_request_id
    AND pr.tenant_id = p_tenant_id
    AND pr.branch_id = v_payment.branch_id
    AND pr.order_id = v_payment.order_id
    AND pr.payment_id = v_payment.id
    AND pr.method = 'momo'
    AND pr.status = 'momo_pending'
    AND pr.payment_code_snapshot = v_provider_ref
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'payment_not_pending');
  END IF;
  IF v_request.momo_checkout_url IS NOT NULL THEN
    IF v_request.momo_checkout_url = p_pay_url THEN
      RETURN jsonb_build_object('status', 'stored');
    END IF;
    RETURN jsonb_build_object('status', 'checkout_conflict');
  END IF;
  IF v_request.momo_checkout_claim_id IS DISTINCT FROM p_claim_id THEN
    RETURN jsonb_build_object('status', 'in_progress');
  END IF;

  UPDATE public.payments
  SET provider_data = COALESCE(provider_data, '{}'::jsonb) || p_provider_data,
      updated_at = now()
  WHERE id = v_payment.id
    AND tenant_id = v_payment.tenant_id
    AND status = 'pending';

  UPDATE public.self_order_payment_requests
  SET momo_checkout_url = p_pay_url
  WHERE id = v_request.id
    AND tenant_id = v_request.tenant_id;

  RETURN jsonb_build_object('status', 'stored');
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_release_momo_checkout_claim(
  p_tenant_id bigint,
  p_payment_request_id bigint,
  p_claim_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_request public.self_order_payment_requests%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_claim_id IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid_claim');
  END IF;

  SELECT pr.*
  INTO v_request
  FROM public.self_order_payment_requests pr
  WHERE pr.id = p_payment_request_id
    AND pr.tenant_id = p_tenant_id
    AND pr.method = 'momo'
    AND pr.status = 'momo_pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'payment_not_pending');
  END IF;
  IF v_request.momo_checkout_url IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'stored');
  END IF;
  IF v_request.momo_checkout_claim_id IS DISTINCT FROM p_claim_id THEN
    RETURN jsonb_build_object('status', 'in_progress');
  END IF;

  UPDATE public.self_order_payment_requests
  SET momo_checkout_claim_id = NULL,
      momo_checkout_claimed_at = NULL
  WHERE id = v_request.id
    AND tenant_id = v_request.tenant_id;

  RETURN jsonb_build_object('status', 'released');
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_recover_momo_checkout_request(
  p_token text,
  p_client_op_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_request_id bigint;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_client_op_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_operation_id');
  END IF;

  SELECT pr.id
  INTO v_request_id
  FROM public.self_order_payment_requests pr
  JOIN public.tables t
    ON t.id = pr.table_id
   AND t.tenant_id = pr.tenant_id
   AND t.branch_id = pr.branch_id
  JOIN public.branches b
    ON b.id = t.branch_id
   AND b.tenant_id = t.tenant_id
   AND b.is_active = true
  JOIN public.payments p
    ON p.id = pr.payment_id
   AND p.tenant_id = pr.tenant_id
   AND p.branch_id = pr.branch_id
   AND p.order_id = pr.order_id
  WHERE t.self_order_token = p_token
    AND t.self_order_enabled = true
    AND t.status <> 'maintenance'
    AND pr.client_op_id = p_client_op_id
    AND pr.method = 'momo'
    AND pr.status = 'momo_pending'
    AND p.method = 'momo'
    AND p.status = 'pending'
    AND p.provider_ref = pr.payment_code_snapshot
    AND p.amount = pr.amount_snapshot
  ORDER BY pr.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'momo_checkout_recovery_unavailable'
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'recovered', true)
    || COALESCE(
      public.self_order_payment_request_public_payload(v_request_id),
      '{}'::jsonb
    );
END;
$$;

REVOKE ALL ON FUNCTION public.self_order_create_momo_payment_request(text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_order_claim_momo_checkout(text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_order_set_momo_checkout(bigint, bigint, bigint, text, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_order_release_momo_checkout_claim(bigint, bigint, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_order_recover_momo_checkout_request(text, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.self_order_create_momo_payment_request(text, uuid, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.self_order_claim_momo_checkout(text, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.self_order_set_momo_checkout(bigint, bigint, bigint, text, uuid, text, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.self_order_release_momo_checkout_claim(bigint, bigint, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.self_order_recover_momo_checkout_request(text, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.self_order_claim_momo_reconciliation_batch(
  p_claim_id uuid,
  p_limit integer DEFAULT 20,
  p_min_age interval DEFAULT interval '2 minutes'
)
RETURNS TABLE(
  tenant_id bigint,
  payment_id bigint,
  payment_request_id bigint,
  provider_ref text,
  amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_claim_id IS NULL OR p_limit < 1 OR p_limit > 20
     OR p_min_age IS NULL OR p_min_age < interval '1 minute' THEN
    RAISE EXCEPTION 'invalid_momo_reconciliation_claim' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT pr.id
    FROM public.self_order_payment_requests pr
    JOIN public.payments p
      ON p.id = pr.payment_id
     AND p.tenant_id = pr.tenant_id
     AND p.branch_id = pr.branch_id
     AND p.order_id = pr.order_id
    WHERE pr.method = 'momo'
      AND pr.status = 'momo_pending'
      AND pr.created_at <= now() - p_min_age
      AND (
        pr.momo_reconcile_last_attempt_at IS NULL
        OR pr.momo_reconcile_last_attempt_at < now() - interval '2 minutes'
      )
      AND (
        pr.momo_reconcile_claim_id IS NULL
        OR pr.momo_reconcile_claimed_at < now() - interval '5 minutes'
      )
      AND p.method = 'momo'
      AND p.status = 'pending'
      AND p.provider_ref = pr.payment_code_snapshot
      AND p.amount = pr.amount_snapshot
    ORDER BY pr.momo_reconcile_last_attempt_at NULLS FIRST, pr.created_at, pr.id
    FOR UPDATE OF pr SKIP LOCKED
    LIMIT p_limit
  ), claimed AS (
    UPDATE public.self_order_payment_requests pr
    SET momo_reconcile_claim_id = p_claim_id,
        momo_reconcile_claimed_at = now()
    FROM candidates c
    WHERE pr.id = c.id
    RETURNING
      pr.tenant_id,
      pr.payment_id,
      pr.id,
      pr.payment_code_snapshot,
      pr.amount_snapshot
  )
  SELECT
    c.tenant_id,
    c.payment_id,
    c.id,
    c.payment_code_snapshot,
    c.amount_snapshot
  FROM claimed c
  ORDER BY c.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_release_momo_reconciliation_claim(
  p_tenant_id bigint,
  p_payment_request_id bigint,
  p_claim_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_request public.self_order_payment_requests%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_claim_id IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid_claim');
  END IF;

  SELECT pr.*
  INTO v_request
  FROM public.self_order_payment_requests pr
  WHERE pr.id = p_payment_request_id
    AND pr.tenant_id = p_tenant_id
    AND pr.method = 'momo'
    AND pr.status = 'momo_pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'payment_not_pending');
  END IF;
  IF v_request.momo_reconcile_claim_id IS DISTINCT FROM p_claim_id THEN
    RETURN jsonb_build_object('status', 'claim_lost');
  END IF;

  UPDATE public.self_order_payment_requests
  SET momo_reconcile_claim_id = NULL,
      momo_reconcile_claimed_at = NULL,
      momo_reconcile_last_attempt_at = now()
  WHERE id = v_request.id
    AND tenant_id = v_request.tenant_id;

  RETURN jsonb_build_object('status', 'released');
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_apply_momo_query_result(
  p_tenant_id bigint,
  p_payment_request_id bigint,
  p_claim_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_request public.self_order_payment_requests%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_result_code integer;
  v_amount numeric;
  v_provider_data jsonb;
  v_completion record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_claim_id IS NULL
     OR p_payload IS NULL
     OR jsonb_typeof(p_payload) <> 'object'
     OR COALESCE(p_payload ->> 'amount', '') !~ '^[0-9]{1,18}([.][0-9]{1,2})?$'
     OR COALESCE(p_payload ->> 'resultCode', '') !~ '^-?[0-9]{1,9}$' THEN
    RAISE EXCEPTION 'momo_query_payload_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT pr.*
  INTO v_request
  FROM public.self_order_payment_requests pr
  WHERE pr.id = p_payment_request_id
    AND pr.tenant_id = p_tenant_id
    AND pr.method = 'momo'
    AND pr.status = 'momo_pending'
    AND pr.momo_reconcile_claim_id = p_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'claim_lost');
  END IF;

  SELECT p.*
  INTO v_payment
  FROM public.payments p
  WHERE p.id = v_request.payment_id
    AND p.tenant_id = v_request.tenant_id
    AND p.branch_id = v_request.branch_id
    AND p.order_id = v_request.order_id
    AND p.method = 'momo'
    AND p.status = 'pending'
    AND p.provider_ref = v_request.payment_code_snapshot
    AND p.amount = v_request.amount_snapshot
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'payment_not_pending');
  END IF;
  PERFORM pg_advisory_xact_lock(v_payment.order_id);

  IF (p_payload ->> 'orderId') IS DISTINCT FROM v_payment.provider_ref
     OR (p_payload ->> 'requestId') IS DISTINCT FROM v_payment.provider_ref THEN
    RAISE EXCEPTION 'momo_query_reference_mismatch' USING ERRCODE = '23514';
  END IF;

  v_amount := (p_payload ->> 'amount')::numeric;
  v_result_code := (p_payload ->> 'resultCode')::integer;
  IF v_amount IS DISTINCT FROM v_payment.amount THEN
    RAISE EXCEPTION 'momo_query_amount_mismatch' USING ERRCODE = '23514';
  END IF;

  v_provider_data := CASE
    WHEN jsonb_typeof(v_payment.provider_data) = 'object'
      THEN v_payment.provider_data
    ELSE '{}'::jsonb
  END || jsonb_build_object('momoQuery', p_payload, 'momoQueryAt', now());

  UPDATE public.self_order_payment_requests
  SET momo_reconcile_claim_id = NULL,
      momo_reconcile_claimed_at = NULL,
      momo_reconcile_last_attempt_at = now()
  WHERE id = v_request.id
    AND tenant_id = v_request.tenant_id;

  IF v_result_code IN (1000, 7000, 7002) THEN
    UPDATE public.payments
    SET provider_data = v_provider_data,
        updated_at = now()
    WHERE id = v_payment.id
      AND status = 'pending';
    RETURN jsonb_build_object('status', 'pending', 'paymentId', v_payment.id);
  END IF;

  IF v_result_code IN (0, 9000) THEN
    SELECT *
    INTO v_completion
    FROM public.complete_payment_and_consume_stock(
      v_payment.id,
      v_amount,
      v_provider_data,
      NULL
    );
    RETURN jsonb_build_object(
      'status', v_completion.status,
      'paymentId', v_payment.id,
      'orderId', v_payment.order_id,
      'detail', v_completion.detail
    );
  END IF;

  UPDATE public.payments
  SET status = 'failed',
      provider_data = v_provider_data || jsonb_build_object(
        'momoFailure', jsonb_build_object(
          'resultCode', v_result_code,
          'message', p_payload ->> 'message',
          'source', 'query'
        )
      ),
      updated_at = now()
  WHERE id = v_payment.id
    AND status = 'pending';

  UPDATE public.orders
  SET payment_status = 'unpaid',
      payment_method = NULL,
      updated_at = now()
  WHERE id = v_payment.order_id
    AND tenant_id = v_payment.tenant_id
    AND branch_id = v_payment.branch_id
    AND payment_status <> 'paid';

  UPDATE public.self_order_payment_requests
  SET status = 'cancelled',
      cancelled_at = now(),
      cancel_reason = 'momo_provider_failed'
  WHERE id = v_request.id
    AND tenant_id = v_request.tenant_id
    AND status = 'momo_pending';

  RETURN jsonb_build_object('status', 'failed', 'paymentId', v_payment.id);
END;
$$;

REVOKE ALL ON FUNCTION public.self_order_claim_momo_reconciliation_batch(uuid, integer, interval)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_order_release_momo_reconciliation_claim(bigint, bigint, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_order_apply_momo_query_result(bigint, bigint, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.self_order_claim_momo_reconciliation_batch(uuid, integer, interval)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.self_order_release_momo_reconciliation_claim(bigint, bigint, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.self_order_apply_momo_query_result(bigint, bigint, uuid, jsonb)
  TO service_role;

COMMIT;
