BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_method_check,
  ADD CONSTRAINT payments_method_check
    CHECK (method IN ('cash', 'vietqr', 'momo'));

ALTER TABLE public.webhook_events
  DROP CONSTRAINT IF EXISTS webhook_events_provider_check,
  ADD CONSTRAINT webhook_events_provider_check
    CHECK (provider IN ('momo', 'vietqr', 'vnpay', 'sepay'));

ALTER TABLE public.self_order_payment_requests
  ADD COLUMN momo_checkout_url text,
  ADD COLUMN momo_checkout_claim_id uuid,
  ADD COLUMN momo_checkout_claimed_at timestamptz,
  ADD COLUMN momo_reconcile_claim_id uuid,
  ADD COLUMN momo_reconcile_claimed_at timestamptz,
  ADD COLUMN momo_reconcile_last_attempt_at timestamptz,
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

DO $$
DECLARE
  v_function regprocedure;
  v_definition text;
BEGIN
  FOR v_function IN
    SELECT unnest(ARRAY[
      'public.self_order_active_payment_lock(bigint)'::regprocedure,
      'public.self_order_create_payment_request(text,uuid,text,jsonb)'::regprocedure,
      'public.self_order_get_snapshot(text,uuid)'::regprocedure,
      'public.self_order_submit(text,jsonb,text,uuid)'::regprocedure,
      'public.self_order_sync_payment_request()'::regprocedure,
      'public.self_order_sync_payment_request_from_order()'::regprocedure
    ])
  LOOP
    v_definition := pg_get_functiondef(v_function);
    IF position('''cash_call'', ''vietqr_pending''' IN v_definition) = 0 THEN
      RAISE EXCEPTION 'self_order_momo_active_state_contract_changed: %', v_function;
    END IF;
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
  v_method_match_count integer;
  v_method_match text := $needle$
        (pr.method = 'cash_call' AND v_payment_method = 'cash')
        OR (pr.method = 'vietqr' AND v_payment_method = 'vietqr')
$needle$;
  v_method_match_with_momo text := $replacement$
        (pr.method = 'cash_call' AND v_payment_method = 'cash')
        OR (pr.method = 'vietqr' AND v_payment_method = 'vietqr')
        OR (pr.method = 'momo' AND v_payment_method = 'momo')
$replacement$;
BEGIN
  SELECT pg_get_functiondef(
    'public.self_order_sync_payment_request_from_order()'::regprocedure
  )
  INTO v_definition;

  v_method_match_count := (
    length(v_definition) - length(replace(v_definition, v_method_match, ''))
  ) / length(v_method_match);

  IF v_method_match_count <> 2
     OR position(
       '(pr.method = ''momo'' AND v_payment_method = ''momo'')'
       IN v_definition
     ) > 0 THEN
    RAISE EXCEPTION 'self_order_momo_order_sync_contract_changed';
  END IF;

  EXECUTE replace(
    v_definition,
    v_method_match,
    v_method_match_with_momo
  );
END;
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
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
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

  IF OLD.momo_checkout_claim_id IS DISTINCT FROM NEW.momo_checkout_claim_id
     OR OLD.momo_checkout_claimed_at IS DISTINCT FROM NEW.momo_checkout_claimed_at THEN
    IF NOT (
      (
        OLD.method = 'momo'
        AND OLD.status = 'momo_pending'
        AND NEW.status = 'momo_pending'
        AND OLD.momo_checkout_url IS NULL
        AND NEW.momo_checkout_url IS NULL
        AND NEW.momo_checkout_claim_id IS NOT NULL
        AND NEW.momo_checkout_claimed_at IS NOT NULL
        AND (
          OLD.momo_checkout_claim_id IS NULL
          OR OLD.momo_checkout_claimed_at < now() - interval '2 minutes'
        )
      )
      OR (
        OLD.method = 'momo'
        AND OLD.status = 'momo_pending'
        AND NEW.status = 'momo_pending'
        AND OLD.momo_checkout_url IS NULL
        AND NEW.momo_checkout_url IS NULL
        AND OLD.momo_checkout_claim_id IS NOT NULL
        AND OLD.momo_checkout_claimed_at IS NOT NULL
        AND NEW.momo_checkout_claim_id IS NULL
        AND NEW.momo_checkout_claimed_at IS NULL
      )
    ) THEN
      RAISE EXCEPTION 'self_order_momo_checkout_claim_immutable' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF OLD.momo_reconcile_claim_id IS DISTINCT FROM NEW.momo_reconcile_claim_id
     OR OLD.momo_reconcile_claimed_at IS DISTINCT FROM NEW.momo_reconcile_claimed_at
     OR OLD.momo_reconcile_last_attempt_at IS DISTINCT FROM NEW.momo_reconcile_last_attempt_at THEN
    IF NOT (
      (
        OLD.method = 'momo'
        AND OLD.status = 'momo_pending'
        AND NEW.status = 'momo_pending'
        AND NEW.momo_reconcile_claim_id IS NOT NULL
        AND NEW.momo_reconcile_claimed_at IS NOT NULL
        AND NEW.momo_reconcile_last_attempt_at IS NOT DISTINCT FROM
          OLD.momo_reconcile_last_attempt_at
      )
      OR (
        OLD.method = 'momo'
        AND OLD.momo_reconcile_claim_id IS NOT NULL
        AND OLD.momo_reconcile_claimed_at IS NOT NULL
        AND NEW.momo_reconcile_claim_id IS NULL
        AND NEW.momo_reconcile_claimed_at IS NULL
        AND NEW.momo_reconcile_last_attempt_at IS NOT NULL
        AND NEW.momo_reconcile_last_attempt_at >=
          COALESCE(OLD.momo_reconcile_last_attempt_at, '-infinity'::timestamptz)
      )
    ) THEN
      RAISE EXCEPTION 'self_order_momo_reconcile_claim_immutable'
        USING ERRCODE = '22023';
    END IF;
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
    'redirectUrl', CASE
      WHEN pr.method = 'momo' AND pr.status = 'momo_pending'
      THEN pr.momo_checkout_url
      ELSE NULL
    END,
    'createdAt', pr.created_at,
    'expiresAt', pr.expires_at
  ))
  FROM public.self_order_payment_requests pr
  WHERE pr.id = p_request_id;
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

    UPDATE public.orders
    SET payment_status = 'pending',
        payment_method = 'momo',
        updated_at = now()
    WHERE id = v_order.id
      AND tenant_id = v_order.tenant_id;

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
      v_momo_provider_ref,
      jsonb_build_object(
        'source', 'self_order_momo',
        'invoicePayload', v_invoice_payload
      ),
      v_order.created_by
    )
    RETURNING id INTO v_payment_id;

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

DO $$
DECLARE
  v_definition text;
  v_needle text := $needle$
      AND pr.status IN ('cash_call', 'vietqr_pending', 'momo_pending')
      AND pr.expires_at > now()
$needle$;
BEGIN
  SELECT pg_get_functiondef(
    'public.self_order_get_snapshot(text, uuid)'::regprocedure
  ) INTO v_definition;

  IF position(v_needle IN v_definition) = 0 THEN
    RAISE EXCEPTION 'momo_snapshot_visibility_contract_changed';
  END IF;
  v_definition := replace(
    v_definition,
    v_needle,
    $replacement$
      AND pr.status IN ('cash_call', 'vietqr_pending', 'momo_pending')
      AND (
        pr.expires_at > now()
        OR (pr.method = 'momo' AND pr.status = 'momo_pending')
      )
$replacement$
  );
  EXECUTE v_definition;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_no_pending_momo_payment(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_order_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.tenant_id = p_tenant_id
      AND p.branch_id = p_branch_id
      AND p.order_id = p_order_id
      AND p.method = 'momo'
      AND p.status = 'pending'
  ) OR EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.branch_id = p_branch_id
      AND o.id = p_order_id
      AND o.payment_method = 'momo'
      AND o.payment_status = 'pending'
  ) THEN
    RAISE EXCEPTION 'momo_payment_pending' USING ERRCODE = '55P03';
  END IF;
END;
$$;

DO $$
DECLARE
  v_definition text;
  v_lock_needle text;
  v_guard_needle text;
BEGIN
  SELECT pg_get_functiondef(
    'public.confirm_cash_payment_with_invoice_binding(bigint, numeric)'::regprocedure
  ) INTO v_definition;

  v_lock_needle := $needle$
  SELECT o.*
  INTO v_order
  FROM public.orders o
$needle$;
  v_guard_needle := $needle$
  IF NOT public.has_permission(v_order.branch_id, 'pos:confirm_payment') THEN
    RAISE EXCEPTION 'permission denied: pos:confirm_payment' USING ERRCODE = '42501';
  END IF;
$needle$;
  IF position(v_lock_needle IN v_definition) = 0
     OR position(v_guard_needle IN v_definition) = 0
     OR position('pg_try_advisory_xact_lock(v_order.id)' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'momo_cash_binding_contract_changed';
  END IF;

  v_definition := replace(
    v_definition,
    v_lock_needle,
    $replacement$
  IF NOT pg_try_advisory_xact_lock(p_order_id) THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END IF;

  SELECT o.*
  INTO v_order
  FROM public.orders o
$replacement$
  );
  v_definition := replace(
    v_definition,
    $needle$
  IF NOT pg_try_advisory_xact_lock(v_order.id) THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END IF;

$needle$,
    ''
  );
  v_definition := replace(
    v_definition,
    v_guard_needle,
    v_guard_needle || $replacement$

  PERFORM public.assert_no_pending_momo_payment(
    v_order.tenant_id,
    v_order.branch_id,
    v_order.id
  );
$replacement$
  );
  EXECUTE v_definition;

  SELECT pg_get_functiondef(
    'public.confirm_cash_payment(bigint, numeric)'::regprocedure
  ) INTO v_definition;

  v_lock_needle := $needle$
  SELECT * INTO v_order
  FROM public.orders
$needle$;
  IF position(v_lock_needle IN v_definition) = 0
     OR position(v_guard_needle IN v_definition) = 0 THEN
    RAISE EXCEPTION 'momo_cash_payment_contract_changed';
  END IF;
  v_definition := replace(
    v_definition,
    v_lock_needle,
    $replacement$
  IF NOT pg_try_advisory_xact_lock(p_order_id) THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
$replacement$
  );
  v_definition := replace(
    v_definition,
    v_guard_needle,
    v_guard_needle || $replacement$

  PERFORM public.assert_no_pending_momo_payment(
    v_order.tenant_id,
    v_order.branch_id,
    v_order.id
  );
$replacement$
  );
  EXECUTE v_definition;

  SELECT pg_get_functiondef(
    'public.confirm_vietqr_payment(bigint, bigint, bigint, numeric, uuid)'::regprocedure
  ) INTO v_definition;

  v_lock_needle := $needle$
  SELECT id, total_amount, tax_amount, payment_status, branch_id, tenant_id, payment_code
$needle$;
  IF position(v_lock_needle IN v_definition) = 0
     OR position(v_guard_needle IN v_definition) = 0 THEN
    RAISE EXCEPTION 'momo_vietqr_payment_contract_changed';
  END IF;
  v_definition := replace(
    v_definition,
    v_lock_needle,
    $replacement$
  IF NOT pg_try_advisory_xact_lock(p_order_id) THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END IF;

  SELECT id, total_amount, tax_amount, payment_status, branch_id, tenant_id, payment_code
$replacement$
  );
  v_definition := replace(
    v_definition,
    v_guard_needle,
    v_guard_needle || $replacement$

  PERFORM public.assert_no_pending_momo_payment(
    v_order.tenant_id,
    v_order.branch_id,
    p_order_id
  );
$replacement$
  );
  EXECUTE v_definition;

  SELECT pg_get_functiondef(
    'public.cancel_order(bigint, text)'::regprocedure
  ) INTO v_definition;

  v_guard_needle := $needle$
  IF NOT public.has_permission(v_order.branch_id, 'pos:void_order') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
$needle$;
  IF position(v_guard_needle IN v_definition) = 0 THEN
    RAISE EXCEPTION 'momo_cancel_order_contract_changed';
  END IF;
  v_definition := replace(
    v_definition,
    v_guard_needle,
    v_guard_needle || $replacement$

  PERFORM public.assert_no_pending_momo_payment(
    v_order.tenant_id,
    v_order.branch_id,
    v_order.id
  );
$replacement$
  );
  EXECUTE v_definition;
END;
$$;

DO $$
DECLARE
  v_definition text;
  v_guard_needle text := $needle$
  IF NOT public.has_permission(v_request_ref.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'permission denied: pos:use' USING ERRCODE = '42501';
  END IF;
$needle$;
BEGIN
  SELECT pg_get_functiondef(
    'public.self_order_cancel_payment_request(bigint, text)'::regprocedure
  ) INTO v_definition;

  IF position(v_guard_needle IN v_definition) = 0 THEN
    RAISE EXCEPTION 'momo_self_order_cancel_contract_changed';
  END IF;
  v_definition := replace(
    v_definition,
    v_guard_needle,
    v_guard_needle || $replacement$

  IF v_request_ref.method = 'momo'
     AND v_request_ref.status = 'momo_pending' THEN
    RAISE EXCEPTION 'momo_payment_pending' USING ERRCODE = '55P03';
  END IF;
$replacement$
  );
  EXECUTE v_definition;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_pending_payment(
  p_payment_id bigint,
  p_tenant_id bigint,
  p_branch_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_order_id bigint;
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

  SELECT p.order_id
  INTO v_order_id
  FROM public.payments p
  WHERE p.id = p_payment_id
    AND p.tenant_id = p_tenant_id
    AND p.branch_id = p_branch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF NOT pg_try_advisory_xact_lock(v_order_id) THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END IF;

  SELECT p.*
  INTO v_payment
  FROM public.payments p
  WHERE p.id = p_payment_id
    AND p.tenant_id = p_tenant_id
    AND p.branch_id = p_branch_id
    AND p.order_id = v_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_payment.status <> 'pending' THEN
    RAISE EXCEPTION 'payment_not_pending' USING ERRCODE = 'P0001';
  END IF;
  IF v_payment.method = 'momo' THEN
    RAISE EXCEPTION 'momo_payment_pending' USING ERRCODE = '55P03';
  END IF;

  UPDATE public.payments
  SET status = 'failed',
      updated_at = now()
  WHERE id = v_payment.id
    AND tenant_id = p_tenant_id
    AND status = 'pending';

  UPDATE public.orders o
  SET payment_status = 'unpaid',
      payment_method = NULL,
      updated_at = now()
  WHERE o.id = v_payment.order_id
    AND o.tenant_id = p_tenant_id
    AND COALESCE(o.payment_status, 'unpaid') <> 'paid'
    AND NOT EXISTS (
      SELECT 1
      FROM public.payments p
      WHERE p.tenant_id = o.tenant_id
        AND p.order_id = o.id
        AND p.status IN ('pending', 'completed')
    );
END;
$$;

COMMENT ON FUNCTION public.cancel_pending_payment(bigint, bigint, bigint)
  IS 'Cancels a locally reversible pending payment and resets order payment fields.';

CREATE OR REPLACE FUNCTION public.correct_payment_method(
  p_payment_id bigint,
  p_new_method text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_order_id bigint;
  v_payment public.payments%ROWTYPE;
  v_order public.orders%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_new_method IS NULL OR p_new_method NOT IN ('cash', 'vietqr') THEN
    RAISE EXCEPTION 'invalid method: %', p_new_method USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 1 THEN
    RAISE EXCEPTION 'reason required' USING ERRCODE = '22023';
  END IF;
  IF length(p_reason) > 500 THEN
    RAISE EXCEPTION 'reason exceeds 500 chars' USING ERRCODE = '22023';
  END IF;

  SELECT p.order_id
  INTO v_order_id
  FROM public.payments p
  WHERE p.id = p_payment_id
    AND p.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment % not found', p_payment_id USING ERRCODE = 'P0002';
  END IF;
  PERFORM pg_advisory_xact_lock(v_order_id);

  SELECT p.*
  INTO v_payment
  FROM public.payments p
  WHERE p.id = p_payment_id
    AND p.tenant_id = v_tenant
    AND p.order_id = v_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment % not found', p_payment_id USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(v_payment.branch_id, 'orders:refund_approve') THEN
    RAISE EXCEPTION 'permission denied: orders:refund_approve required'
      USING ERRCODE = '42501';
  END IF;
  IF v_payment.status <> 'completed' THEN
    RAISE EXCEPTION 'payment_not_completed: status=%', v_payment.status
      USING ERRCODE = 'P0001';
  END IF;
  IF v_payment.method = 'momo' THEN
    RAISE EXCEPTION 'momo_method_correction_not_supported' USING ERRCODE = 'P0001';
  END IF;
  IF v_payment.method = p_new_method THEN
    RAISE EXCEPTION 'method_unchanged: already %', p_new_method
      USING ERRCODE = 'P0001';
  END IF;

  SELECT o.*
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_payment.order_id
    AND o.tenant_id = v_payment.tenant_id
    AND o.branch_id = v_payment.branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_order_not_found' USING ERRCODE = '23503';
  END IF;
  IF v_order.payment_status <> 'paid'
     OR v_order.payment_method IS DISTINCT FROM v_payment.method THEN
    RAISE EXCEPTION 'payment_method_mismatch_requires_review' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.payments
  SET method = p_new_method,
      updated_at = now()
  WHERE id = v_payment.id
    AND tenant_id = v_payment.tenant_id;

  UPDATE public.orders
  SET payment_method = p_new_method,
      cash_received = CASE WHEN p_new_method = 'cash' THEN total_amount ELSE NULL END,
      cash_change = CASE WHEN p_new_method = 'cash' THEN 0 ELSE NULL END,
      updated_at = now()
  WHERE id = v_order.id
    AND tenant_id = v_order.tenant_id;

  PERFORM public.log_audit(
    'payment.method_correct',
    'payment',
    v_payment.id,
    jsonb_build_object(
      'method', v_payment.method,
      'orderMethod', v_order.payment_method
    ),
    jsonb_build_object(
      'method', p_new_method,
      'orderMethod', p_new_method,
      'orderId', v_order.id,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'status', 'corrected',
    'payment_id', v_payment.id,
    'order_id', v_order.id,
    'old_method', v_payment.method,
    'new_method', p_new_method
  );
END;
$$;

COMMENT ON FUNCTION public.correct_payment_method(bigint, text, text)
  IS 'Atomically corrects a completed cash or VietQR payment and its order projection.';

CREATE OR REPLACE FUNCTION public.cleanup_abandoned_payments(
  p_threshold interval DEFAULT interval '24 hours'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_candidate record;
  v_payment_id bigint;
  v_updated integer;
  v_count integer := 0;
  v_cutoff timestamptz;
BEGIN
  IF p_threshold IS NULL
     OR p_threshold < interval '15 minutes'
     OR p_threshold > interval '30 days' THEN
    RAISE EXCEPTION 'invalid_cleanup_threshold' USING ERRCODE = '22023';
  END IF;
  v_cutoff := now() - p_threshold;

  FOR v_candidate IN
    SELECT p.order_id, p.id AS payment_id
    FROM public.payments p
    WHERE p.status = 'pending'
      AND p.method IN ('cash', 'vietqr')
      AND p.created_at < v_cutoff
    ORDER BY p.order_id, p.id
  LOOP
    PERFORM pg_advisory_xact_lock(v_candidate.order_id);

    SELECT p.id
    INTO v_payment_id
    FROM public.payments p
    WHERE p.id = v_candidate.payment_id
      AND p.order_id = v_candidate.order_id
      AND p.status = 'pending'
      AND p.method IN ('cash', 'vietqr')
      AND p.created_at < v_cutoff
    FOR UPDATE;
    CONTINUE WHEN NOT FOUND;

    UPDATE public.payments p
    SET status = 'failed',
        provider_data = COALESCE(p.provider_data, '{}'::jsonb)
          || jsonb_build_object(
            'cleanup_reason', 'abandoned',
            'cleanup_at', to_char(
              now() AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS"Z"'
            ),
            'cleanup_threshold', extract(epoch FROM p_threshold)::integer
          ),
        updated_at = now()
    WHERE p.id = v_payment_id
      AND p.status = 'pending';
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    v_count := v_count + v_updated;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.cleanup_abandoned_payments(interval)
  IS 'Payment janitor for locally reversible pending cash and VietQR rows.';

REVOKE ALL ON FUNCTION public.cleanup_abandoned_payments(interval)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_abandoned_payments(interval)
  TO service_role;

REVOKE ALL ON FUNCTION public.assert_no_pending_momo_payment(bigint, bigint, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.confirm_cash_payment(bigint, numeric)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.self_order_enforce_payment_request_invariants()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_self_order_enforce_payment_request_invariants
  ON public.self_order_payment_requests;
CREATE TRIGGER trg_self_order_enforce_payment_request_invariants
  BEFORE UPDATE ON public.self_order_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.self_order_enforce_payment_request_invariants();

CREATE INDEX self_order_payment_requests_momo_reconcile_due
  ON public.self_order_payment_requests (
    momo_reconcile_last_attempt_at,
    created_at,
    id
  )
  WHERE method = 'momo'
    AND status = 'momo_pending';

DO $$
DECLARE
  v_definition text;
  v_select_needle text :=
    'SELECT p.id, p.order_id, p.tenant_id, p.branch_id, p.amount, p.status';
  v_mismatch_needle text := $needle$
    UPDATE public.payments
       SET status = 'failed',
           provider_data = COALESCE(p_provider_data, provider_data),
           updated_at = now()
     WHERE id = v_payment.id;
$needle$;
  v_mismatch_count integer;
BEGIN
  SELECT pg_get_functiondef(
    'public.complete_payment_and_consume_stock(bigint, numeric, jsonb, uuid)'::regprocedure
  ) INTO v_definition;

  v_mismatch_count := (
    length(v_definition) - length(replace(v_definition, v_mismatch_needle, ''))
  ) / length(v_mismatch_needle);
  IF position(v_select_needle IN v_definition) = 0 OR v_mismatch_count <> 2 THEN
    RAISE EXCEPTION 'momo_payment_completion_contract_changed';
  END IF;

  v_definition := replace(
    v_definition,
    v_select_needle,
    v_select_needle || ', p.method'
  );
  v_definition := replace(
    v_definition,
    v_mismatch_needle,
    $replacement$
    IF v_payment.method = 'momo' THEN
      UPDATE public.payments
      SET provider_data = COALESCE(provider_data, '{}'::jsonb)
            || COALESCE(p_provider_data, '{}'::jsonb)
            || jsonb_build_object(
              'localEvidenceMismatchRequiresReview', true,
              'localEvidenceMismatchAt', now()
            ),
          updated_at = now()
      WHERE id = v_payment.id;

      RETURN QUERY SELECT
        'payment_state_conflict_needs_review'::text,
        v_payment.id,
        v_payment.order_id,
        false,
        'signed provider amount conflicts with local order evidence'::text;
      RETURN;
    END IF;

    UPDATE public.payments
       SET status = 'failed',
           provider_data = COALESCE(p_provider_data, provider_data),
           updated_at = now()
     WHERE id = v_payment.id;
$replacement$
  );
  EXECUTE v_definition;
END;
$$;

CREATE OR REPLACE FUNCTION private.momo_settlement_context_matches(
  p_order_id bigint,
  p_payment_id bigint DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT COALESCE(
    auth.role() = 'service_role'
      AND current_setting('app.momo_settlement_order_id', true) = p_order_id::text
      AND (
        p_payment_id IS NULL
        OR current_setting('app.momo_settlement_payment_id', true) = p_payment_id::text
      ),
    false
  );
$$;

REVOKE ALL ON FUNCTION private.momo_settlement_context_matches(bigint, bigint)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.order_has_pending_momo_payment(
  p_tenant_id bigint,
  p_order_id bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.tenant_id = p_tenant_id
      AND p.order_id = p_order_id
      AND p.method = 'momo'
      AND p.status = 'pending'
  );
$$;

REVOKE ALL ON FUNCTION private.order_has_pending_momo_payment(bigint, bigint)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_pending_momo_payment_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF OLD.method = 'momo'
     AND OLD.status = 'pending'
     AND NOT private.momo_settlement_context_matches(OLD.order_id, OLD.id)
     AND (
       to_jsonb(NEW) - ARRAY['provider_data', 'updated_at']::text[]
     ) IS DISTINCT FROM (
       to_jsonb(OLD) - ARRAY['provider_data', 'updated_at']::text[]
     ) THEN
    RAISE EXCEPTION 'momo_payment_pending' USING ERRCODE = '55P03';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pending_momo_payment_update()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_zzz_guard_pending_momo_payment ON public.payments;
CREATE TRIGGER trg_zzz_guard_pending_momo_payment
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_pending_momo_payment_update();

CREATE OR REPLACE FUNCTION public.clear_terminal_momo_reconciliation_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.method = 'momo'
     AND OLD.status = 'pending'
     AND NEW.status IN ('completed', 'failed') THEN
    UPDATE public.self_order_payment_requests
    SET momo_reconcile_claim_id = NULL,
        momo_reconcile_claimed_at = NULL,
        momo_reconcile_last_attempt_at = now()
    WHERE tenant_id = NEW.tenant_id
      AND payment_id = NEW.id
      AND method = 'momo'
      AND momo_reconcile_claim_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_terminal_momo_reconciliation_claim()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_zzz_clear_terminal_momo_reconciliation_claim
  ON public.payments;
CREATE TRIGGER trg_zzz_clear_terminal_momo_reconciliation_claim
  AFTER UPDATE OF status ON public.payments
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.clear_terminal_momo_reconciliation_claim();

CREATE OR REPLACE FUNCTION public.guard_pending_momo_order_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT private.order_has_pending_momo_payment(OLD.tenant_id, OLD.id)
     OR private.momo_settlement_context_matches(OLD.id) THEN
    RETURN NEW;
  END IF;

  IF (
    to_jsonb(NEW) - ARRAY[
      'status',
      'note',
      'is_priority',
      'priority_note',
      'priority_marked_at',
      'priority_marked_by',
      'updated_at'
    ]::text[]
  ) IS DISTINCT FROM (
    to_jsonb(OLD) - ARRAY[
      'status',
      'note',
      'is_priority',
      'priority_note',
      'priority_marked_at',
      'priority_marked_by',
      'updated_at'
    ]::text[]
  ) OR (
    OLD.status IS DISTINCT FROM NEW.status
    AND NOT (
      OLD.status IN ('new', 'confirmed', 'preparing', 'ready')
      AND NEW.status IN ('confirmed', 'preparing', 'ready', 'served')
      AND array_position(
        ARRAY['new', 'confirmed', 'preparing', 'ready', 'served']::text[],
        OLD.status
      ) < array_position(
        ARRAY['new', 'confirmed', 'preparing', 'ready', 'served']::text[],
        NEW.status
      )
    )
  ) THEN
    RAISE EXCEPTION 'momo_payment_pending' USING ERRCODE = '55P03';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pending_momo_order_update()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_zzz_guard_pending_momo_order ON public.orders;
CREATE TRIGGER trg_zzz_guard_pending_momo_order
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_pending_momo_order_update();

CREATE OR REPLACE FUNCTION public.guard_pending_momo_order_item_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_old_pending boolean := false;
  v_new_pending boolean := false;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_old_pending := private.order_has_pending_momo_payment(
      OLD.tenant_id,
      OLD.order_id
    );
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_pending := private.order_has_pending_momo_payment(
      NEW.tenant_id,
      NEW.order_id
    );
  END IF;

  IF NOT v_old_pending AND NOT v_new_pending THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'momo_payment_pending' USING ERRCODE = '55P03';
  END IF;

  IF (
    to_jsonb(NEW) - ARRAY[
      'status',
      'note',
      'is_priority',
      'priority_note',
      'priority_marked_at',
      'priority_marked_by',
      'updated_at'
    ]::text[]
  ) IS DISTINCT FROM (
    to_jsonb(OLD) - ARRAY[
      'status',
      'note',
      'is_priority',
      'priority_note',
      'priority_marked_at',
      'priority_marked_by',
      'updated_at'
    ]::text[]
  ) OR (
    OLD.status IS DISTINCT FROM NEW.status
    AND NOT (
      OLD.status IN ('pending', 'preparing', 'ready')
      AND NEW.status IN ('preparing', 'ready', 'served')
      AND array_position(
        ARRAY['pending', 'preparing', 'ready', 'served']::text[],
        OLD.status
      ) < array_position(
        ARRAY['pending', 'preparing', 'ready', 'served']::text[],
        NEW.status
      )
    )
  ) THEN
    RAISE EXCEPTION 'momo_payment_pending' USING ERRCODE = '55P03';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pending_momo_order_item_write()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_zzz_guard_pending_momo_order_item
  ON public.order_items;
CREATE TRIGGER trg_zzz_guard_pending_momo_order_item
  BEFORE INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_pending_momo_order_item_write();

CREATE OR REPLACE FUNCTION public.guard_pending_momo_kds_ticket_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_old_pending boolean := false;
  v_new_pending boolean := false;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_old_pending := private.order_has_pending_momo_payment(
      OLD.tenant_id,
      OLD.order_id
    );
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_pending := private.order_has_pending_momo_payment(
      NEW.tenant_id,
      NEW.order_id
    );
  END IF;

  IF NOT v_old_pending AND NOT v_new_pending THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'momo_payment_pending' USING ERRCODE = '55P03';
  END IF;

  IF (
    to_jsonb(NEW) - ARRAY[
      'status',
      'bumped_at',
      'bumped_by',
      'first_ready_at',
      'updated_at'
    ]::text[]
  ) IS DISTINCT FROM (
    to_jsonb(OLD) - ARRAY[
      'status',
      'bumped_at',
      'bumped_by',
      'first_ready_at',
      'updated_at'
    ]::text[]
  ) OR (
    OLD.status IS DISTINCT FROM NEW.status
    AND NOT (
      OLD.status IN ('pending', 'preparing', 'ready')
      AND NEW.status IN ('preparing', 'ready', 'served')
      AND array_position(
        ARRAY['pending', 'preparing', 'ready', 'served']::text[],
        OLD.status
      ) < array_position(
        ARRAY['pending', 'preparing', 'ready', 'served']::text[],
        NEW.status
      )
    )
  ) THEN
    RAISE EXCEPTION 'momo_payment_pending' USING ERRCODE = '55P03';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pending_momo_kds_ticket_write()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_zzz_guard_pending_momo_kds_ticket
  ON public.kds_tickets;
CREATE TRIGGER trg_zzz_guard_pending_momo_kds_ticket
  BEFORE INSERT OR UPDATE OR DELETE ON public.kds_tickets
  FOR EACH ROW EXECUTE FUNCTION public.guard_pending_momo_kds_ticket_write();

CREATE OR REPLACE FUNCTION public.self_order_guard_table_token_rotation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT pg_try_advisory_xact_lock(
    hashtext('self-order-table'),
    hashtext(OLD.id::text)
  ) THEN
    RAISE EXCEPTION 'self_order_operation_in_progress' USING ERRCODE = '55P03';
  END IF;

  IF (
    OLD.self_order_token IS DISTINCT FROM NEW.self_order_token
    OR (OLD.self_order_enabled AND NOT NEW.self_order_enabled)
    OR (OLD.status <> 'maintenance' AND NEW.status = 'maintenance')
  ) AND EXISTS (
    SELECT 1
    FROM public.self_order_payment_requests pr
    WHERE pr.tenant_id = OLD.tenant_id
      AND pr.branch_id = OLD.branch_id
      AND pr.table_id = OLD.id
      AND pr.status IN ('cash_call', 'vietqr_pending', 'momo_pending')
  ) THEN
    RAISE EXCEPTION 'self_order_payment_pending' USING ERRCODE = '55P03';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.self_order_guard_table_token_rotation()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_self_order_guard_table_token_rotation
  ON public.tables;
CREATE TRIGGER trg_self_order_guard_table_token_rotation
  BEFORE UPDATE OF self_order_token, self_order_token_rotated_at,
    self_order_enabled, status ON public.tables
  FOR EACH ROW EXECUTE FUNCTION public.self_order_guard_table_token_rotation();

CREATE OR REPLACE FUNCTION public.recover_momo_checkout_request(
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
   AND p.order_id = pr.order_id
   AND p.method = 'momo'
   AND p.status = 'pending'
  WHERE t.self_order_token = p_token
    AND t.self_order_enabled = true
    AND t.status <> 'maintenance'
    AND pr.client_op_id = p_client_op_id
    AND pr.method = 'momo'
    AND pr.status = 'momo_pending'
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

CREATE OR REPLACE FUNCTION public.claim_momo_checkout(
  p_tenant_id bigint,
  p_payment_id bigint,
  p_payment_request_id bigint,
  p_provider_ref text,
  p_claim_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_request public.self_order_payment_requests%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_claim_id IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid_claim');
  END IF;

  SELECT p.*
  INTO v_payment
  FROM public.payments p
  WHERE p.id = p_payment_id
    AND p.tenant_id = p_tenant_id
    AND p.method = 'momo'
    AND p.provider_ref = p_provider_ref
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'payment_not_found');
  END IF;
  IF v_payment.status = 'completed' THEN
    RETURN jsonb_build_object('status', 'already_completed');
  END IF;
  IF v_payment.status IS DISTINCT FROM 'pending' THEN
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
    AND pr.payment_code_snapshot = p_provider_ref
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'payment_not_pending');
  END IF;
  IF v_request.momo_checkout_url IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'stored',
      'redirectUrl', v_request.momo_checkout_url
    );
  END IF;
  IF v_request.momo_checkout_claim_id = p_claim_id THEN
    RETURN jsonb_build_object('status', 'claimed');
  END IF;
  IF v_request.momo_checkout_claim_id IS NOT NULL
     AND v_request.momo_checkout_claimed_at >= now() - interval '2 minutes' THEN
    RETURN jsonb_build_object('status', 'in_progress');
  END IF;

  UPDATE public.self_order_payment_requests
  SET momo_checkout_claim_id = p_claim_id,
      momo_checkout_claimed_at = now()
  WHERE id = v_request.id
    AND tenant_id = v_request.tenant_id;

  UPDATE public.payments
  SET provider_data = COALESCE(provider_data, '{}'::jsonb)
        || jsonb_build_object(
          'checkoutAttemptedAt', now(),
          'checkoutClaimId', p_claim_id
        ),
      updated_at = now()
  WHERE id = v_payment.id
    AND tenant_id = v_payment.tenant_id
    AND status = 'pending';

  RETURN jsonb_build_object('status', 'claimed');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_momo_checkout(
  p_tenant_id bigint,
  p_payment_id bigint,
  p_payment_request_id bigint,
  p_provider_ref text,
  p_claim_id uuid,
  p_checkout_url text,
  p_checkout_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_request public.self_order_payment_requests%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_claim_id IS NULL
     OR p_checkout_url IS NULL
     OR p_checkout_url !~ '^https://(test-payment|payment)[.]momo[.]vn/v2/gateway/pay[?]t=[^&[:space:]]+(&[^[:space:]]*)?$'
     OR p_checkout_request_id IS DISTINCT FROM p_provider_ref THEN
    RETURN jsonb_build_object('status', 'invalid_checkout_data');
  END IF;

  SELECT p.*
  INTO v_payment
  FROM public.payments p
  WHERE p.id = p_payment_id
    AND p.tenant_id = p_tenant_id
    AND p.method = 'momo'
    AND p.provider_ref = p_provider_ref
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'payment_not_found');
  END IF;
  IF v_payment.status = 'completed' THEN
    RETURN jsonb_build_object('status', 'already_completed');
  END IF;
  IF v_payment.status IS DISTINCT FROM 'pending' THEN
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
    AND pr.payment_code_snapshot = p_provider_ref
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'payment_not_pending');
  END IF;
  IF v_request.momo_checkout_url IS NOT NULL THEN
    IF v_request.momo_checkout_url = p_checkout_url
       AND v_payment.provider_data ->> 'checkoutPayUrl' = p_checkout_url
       AND v_payment.provider_data ->> 'checkoutRequestId' = p_checkout_request_id THEN
      RETURN jsonb_build_object(
        'status', 'stored',
        'redirectUrl', v_request.momo_checkout_url
      );
    END IF;
    RETURN jsonb_build_object('status', 'checkout_conflict');
  END IF;
  IF v_request.momo_checkout_claim_id IS DISTINCT FROM p_claim_id THEN
    RETURN jsonb_build_object('status', 'in_progress');
  END IF;
  IF (v_payment.provider_data ? 'checkoutPayUrl'
      AND v_payment.provider_data ->> 'checkoutPayUrl' IS DISTINCT FROM p_checkout_url)
     OR (v_payment.provider_data ? 'checkoutRequestId'
      AND v_payment.provider_data ->> 'checkoutRequestId' IS DISTINCT FROM p_checkout_request_id) THEN
    RETURN jsonb_build_object('status', 'checkout_conflict');
  END IF;

  UPDATE public.payments
  SET provider_data = COALESCE(provider_data, '{}'::jsonb)
        || jsonb_build_object(
          'checkoutPayUrl', p_checkout_url,
          'checkoutRequestId', p_checkout_request_id
        ),
      updated_at = now()
  WHERE id = p_payment_id
    AND tenant_id = p_tenant_id;

  UPDATE public.self_order_payment_requests
  SET momo_checkout_url = p_checkout_url
  WHERE id = p_payment_request_id
    AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object('status', 'stored', 'redirectUrl', p_checkout_url);
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
  v_request public.self_order_payment_requests%ROWTYPE;
  v_complete_result record;
  v_receipt_result jsonb;
  v_print_warning text;
  v_actor uuid;
  v_provider_data jsonb;
  v_order_id bigint;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT p.order_id
  INTO v_order_id
  FROM public.payments p
  WHERE p.id = p_payment_id
    AND p.tenant_id = p_tenant_id
    AND p.method = 'momo'
    AND p.provider_ref = p_provider_ref;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'payment_not_found');
  END IF;
  PERFORM pg_advisory_xact_lock(v_order_id);

  SELECT p.*,
         o.total_amount,
         o.created_by AS order_created_by,
         o.status AS order_status,
         o.payment_status AS order_payment_status,
         o.payment_method AS order_payment_method
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
  FOR UPDATE OF p, o;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'payment_not_found');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> v_payment.amount
     OR p_amount <> v_payment.total_amount THEN
    RETURN jsonb_build_object('status', 'amount_mismatch');
  END IF;
  IF COALESCE(p_transaction_id, '') !~ '^[1-9][0-9]*$' THEN
    RETURN jsonb_build_object('status', 'invalid_transaction_id');
  END IF;
  IF COALESCE(p_provider_data ->> 'paymentRequestId', '') !~ '^[0-9]+$'
     OR p_provider_data ->> 'requestId' IS DISTINCT FROM p_provider_ref
     OR p_provider_data ->> 'orderId' IS DISTINCT FROM p_provider_ref
     OR COALESCE(p_provider_data ->> 'amount', '') !~ '^[0-9]+([.][0-9]+)?$'
     OR (p_provider_data ->> 'amount')::numeric <> p_amount THEN
    RETURN jsonb_build_object('status', 'payment_request_mismatch');
  END IF;

  SELECT pr.*
  INTO v_request
  FROM public.self_order_payment_requests pr
  WHERE pr.id = (p_provider_data ->> 'paymentRequestId')::bigint
    AND pr.tenant_id = p_tenant_id
    AND pr.branch_id = v_payment.branch_id
    AND pr.order_id = v_payment.order_id
    AND pr.payment_id = v_payment.id
    AND pr.method = 'momo'
    AND pr.payment_code_snapshot = p_provider_ref
    AND pr.amount_snapshot = p_amount
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'payment_request_mismatch');
  END IF;
  IF v_payment.status = 'pending' AND v_request.status <> 'momo_pending' THEN
    RETURN jsonb_build_object('status', 'payment_state_conflict_needs_review');
  END IF;

  v_provider_data := COALESCE(v_payment.provider_data, '{}'::jsonb)
    || COALESCE(p_provider_data, '{}'::jsonb)
    || jsonb_build_object('transactionId', p_transaction_id);

  IF v_payment.status = 'completed' THEN
    IF NULLIF(v_payment.provider_data ->> 'transactionId', '') IS NOT NULL
       AND v_payment.provider_data ->> 'transactionId' IS DISTINCT FROM p_transaction_id THEN
      UPDATE public.payments
      SET provider_data = COALESCE(provider_data, '{}'::jsonb)
            || jsonb_build_object(
              'conflictingTransactionId', p_transaction_id,
              'lateSuccessRequiresReview', true
            ),
          updated_at = now()
      WHERE id = v_payment.id
        AND tenant_id = p_tenant_id;

      RETURN jsonb_build_object(
        'status', 'overpayment_needs_review',
        'payment_id', v_payment.id,
        'order_id', v_payment.order_id
      );
    END IF;

    UPDATE public.payments
    SET provider_data = v_provider_data,
        updated_at = now()
    WHERE id = v_payment.id
      AND tenant_id = p_tenant_id
      AND NOT (COALESCE(provider_data, '{}'::jsonb) ? 'transactionId');

    BEGIN
      v_receipt_result := public.enqueue_receipt_print(v_payment.order_id, NULL, NULL);
    EXCEPTION WHEN OTHERS THEN
      v_print_warning := 'receipt_enqueue_failed';
      v_receipt_result := jsonb_build_object('error', v_print_warning);
      RAISE NOTICE '[confirm_momo_payment] receipt enqueue skipped for order %: %',
        v_payment.order_id, SQLERRM;
    END;
    RETURN jsonb_build_object(
      'status', 'already_completed',
      'payment_id', v_payment.id,
      'order_id', v_payment.order_id,
      'print', v_receipt_result,
      'print_warning', v_print_warning
    );
  END IF;
  IF v_payment.status = 'failed' THEN
    UPDATE public.payments
    SET provider_data = v_provider_data
          || jsonb_build_object('lateSuccessRequiresReview', true),
        updated_at = now()
    WHERE id = v_payment.id
      AND tenant_id = p_tenant_id;

    RETURN jsonb_build_object(
      'status', 'overpayment_needs_review',
      'payment_id', v_payment.id,
      'order_id', v_payment.order_id
    );
  END IF;
  IF v_payment.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('status', 'payment_not_pending');
  END IF;
  IF v_payment.order_status = 'cancelled'
     OR v_payment.order_payment_status = 'paid'
     OR COALESCE(v_payment.order_payment_method, '') NOT IN ('', 'momo') THEN
    PERFORM set_config(
      'app.momo_settlement_order_id',
      v_payment.order_id::text,
      true
    );
    PERFORM set_config(
      'app.momo_settlement_payment_id',
      v_payment.id::text,
      true
    );
    UPDATE public.payments
    SET status = 'failed',
        provider_data = v_provider_data
          || jsonb_build_object('lateSuccessRequiresReview', true),
        updated_at = now()
    WHERE id = v_payment.id
      AND tenant_id = p_tenant_id
      AND status = 'pending';
    PERFORM set_config('app.momo_settlement_order_id', '', true);
    PERFORM set_config('app.momo_settlement_payment_id', '', true);

    RETURN jsonb_build_object(
      'status', 'overpayment_needs_review',
      'payment_id', v_payment.id,
      'order_id', v_payment.order_id
    );
  END IF;

  v_actor := COALESCE(v_payment.created_by, v_payment.order_created_by);
  PERFORM set_config(
    'app.momo_settlement_order_id',
    v_payment.order_id::text,
    true
  );
  PERFORM set_config(
    'app.momo_settlement_payment_id',
    v_payment.id::text,
    true
  );
  SELECT *
  INTO v_complete_result
  FROM public.complete_payment_and_consume_stock(
    v_payment.id,
    p_amount,
    v_provider_data,
    v_actor
  );
  PERFORM set_config('app.momo_settlement_order_id', '', true);
  PERFORM set_config('app.momo_settlement_payment_id', '', true);

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

  BEGIN
    v_receipt_result := public.enqueue_receipt_print(v_payment.order_id, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    v_print_warning := 'receipt_enqueue_failed';
    v_receipt_result := jsonb_build_object('error', v_print_warning);
    RAISE NOTICE '[confirm_momo_payment] receipt enqueue skipped for order %: %',
      v_payment.order_id, SQLERRM;
  END;
  RETURN jsonb_build_object(
    'status', v_complete_result.status,
    'payment_id', v_payment.id,
    'order_id', v_payment.order_id,
    'print', v_receipt_result,
    'print_warning', v_print_warning
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
  v_request public.self_order_payment_requests%ROWTYPE;
  v_order_id bigint;
  v_provider_amount numeric;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT p.order_id
  INTO v_order_id
  FROM public.payments p
  WHERE p.id = p_payment_id
    AND p.tenant_id = p_tenant_id
    AND p.method = 'momo'
    AND p.provider_ref = p_provider_ref;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'payment_not_found');
  END IF;
  PERFORM pg_advisory_xact_lock(v_order_id);

  SELECT p.*, o.total_amount
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
  FOR UPDATE OF p, o;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'payment_not_found');
  END IF;
  IF COALESCE(p_provider_data ->> 'paymentRequestId', '') !~ '^[0-9]+$'
     OR p_provider_data ->> 'requestId' IS DISTINCT FROM p_provider_ref
     OR p_provider_data ->> 'orderId' IS DISTINCT FROM p_provider_ref
     OR COALESCE(p_provider_data ->> 'amount', '') !~ '^[0-9]+([.][0-9]+)?$' THEN
    RETURN jsonb_build_object('status', 'payment_request_mismatch');
  END IF;
  v_provider_amount := (p_provider_data ->> 'amount')::numeric;
  IF v_provider_amount <= 0
     OR v_provider_amount <> v_payment.amount
     OR v_provider_amount <> v_payment.total_amount THEN
    RETURN jsonb_build_object('status', 'amount_mismatch');
  END IF;

  SELECT pr.*
  INTO v_request
  FROM public.self_order_payment_requests pr
  WHERE pr.id = (p_provider_data ->> 'paymentRequestId')::bigint
    AND pr.tenant_id = p_tenant_id
    AND pr.branch_id = v_payment.branch_id
    AND pr.order_id = v_payment.order_id
    AND pr.payment_id = v_payment.id
    AND pr.method = 'momo'
    AND pr.payment_code_snapshot = p_provider_ref
    AND pr.amount_snapshot = v_provider_amount
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'payment_request_mismatch');
  END IF;
  IF v_payment.status = 'completed' THEN
    RETURN jsonb_build_object('status', 'already_completed');
  END IF;
  IF v_payment.status = 'pending' THEN
    IF v_request.status <> 'momo_pending' THEN
      RETURN jsonb_build_object('status', 'payment_state_conflict_needs_review');
    END IF;
    PERFORM set_config(
      'app.momo_settlement_order_id',
      v_payment.order_id::text,
      true
    );
    PERFORM set_config(
      'app.momo_settlement_payment_id',
      v_payment.id::text,
      true
    );

    UPDATE public.payments
    SET status = 'failed',
        provider_data = COALESCE(provider_data, '{}'::jsonb)
          || COALESCE(p_provider_data, '{}'::jsonb),
        updated_at = now()
    WHERE id = v_payment.id
      AND tenant_id = p_tenant_id;
    PERFORM set_config('app.momo_settlement_order_id', '', true);
    PERFORM set_config('app.momo_settlement_payment_id', '', true);
  END IF;

  RETURN jsonb_build_object('status', 'failed', 'payment_id', v_payment.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_momo_checkout_claim(
  p_tenant_id bigint,
  p_payment_id bigint,
  p_payment_request_id bigint,
  p_provider_ref text,
  p_claim_id uuid,
  p_provider_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_request public.self_order_payment_requests%ROWTYPE;
  v_order_id bigint;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_claim_id IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid_claim');
  END IF;

  SELECT p.order_id
  INTO v_order_id
  FROM public.payments p
  WHERE p.id = p_payment_id
    AND p.tenant_id = p_tenant_id
    AND p.method = 'momo'
    AND p.provider_ref = p_provider_ref;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'payment_not_found');
  END IF;
  PERFORM pg_advisory_xact_lock(v_order_id);

  SELECT p.*
  INTO v_payment
  FROM public.payments p
  WHERE p.id = p_payment_id
    AND p.tenant_id = p_tenant_id
    AND p.order_id = v_order_id
    AND p.method = 'momo'
    AND p.provider_ref = p_provider_ref
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'payment_not_found');
  END IF;
  IF v_payment.status = 'completed' THEN
    RETURN jsonb_build_object('status', 'already_completed');
  END IF;
  IF v_payment.status IS DISTINCT FROM 'pending' THEN
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
    AND pr.payment_code_snapshot = p_provider_ref
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'payment_not_pending');
  END IF;
  IF v_request.momo_checkout_url IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'stored',
      'redirectUrl', v_request.momo_checkout_url
    );
  END IF;
  IF v_request.momo_checkout_claim_id IS DISTINCT FROM p_claim_id THEN
    RETURN jsonb_build_object('status', 'in_progress');
  END IF;

  UPDATE public.payments
  SET provider_data = COALESCE(provider_data, '{}'::jsonb)
        || COALESCE(p_provider_data, '{}'::jsonb)
        || jsonb_build_object(
          'checkoutClaimReleasedAt', now(),
          'checkoutClaimId', p_claim_id
        ),
      updated_at = now()
  WHERE id = v_payment.id
    AND tenant_id = v_payment.tenant_id
    AND status = 'pending';

  UPDATE public.self_order_payment_requests
  SET momo_checkout_claim_id = NULL,
      momo_checkout_claimed_at = NULL
  WHERE id = v_request.id
    AND tenant_id = v_request.tenant_id
    AND status = 'momo_pending'
    AND momo_checkout_url IS NULL
    AND momo_checkout_claim_id = p_claim_id;

  RETURN jsonb_build_object('status', 'released');
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_momo_reconciliation_request(
  p_tenant_id bigint,
  p_payment_id bigint,
  p_payment_request_id bigint,
  p_provider_ref text,
  p_claim_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_order_id bigint;
  v_target record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_claim_id IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid_claim');
  END IF;

  SELECT p.order_id
  INTO v_order_id
  FROM public.payments p
  WHERE p.id = p_payment_id
    AND p.tenant_id = p_tenant_id
    AND p.method = 'momo'
    AND p.provider_ref = p_provider_ref;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'payment_not_found');
  END IF;
  PERFORM pg_advisory_xact_lock(v_order_id);

  SELECT
    pr.id AS payment_request_id,
    pr.momo_reconcile_claim_id,
    pr.momo_reconcile_claimed_at,
    pr.momo_reconcile_last_attempt_at,
    pr.created_at AS payment_request_created_at,
    p.id AS payment_id,
    p.tenant_id,
    p.order_id,
    p.provider_ref,
    p.amount
  INTO v_target
  FROM public.self_order_payment_requests pr
  JOIN public.payments p
    ON p.id = pr.payment_id
   AND p.tenant_id = pr.tenant_id
   AND p.branch_id = pr.branch_id
   AND p.order_id = pr.order_id
  WHERE pr.id = p_payment_request_id
    AND pr.tenant_id = p_tenant_id
    AND pr.payment_id = p_payment_id
    AND pr.method = 'momo'
    AND pr.status = 'momo_pending'
    AND pr.payment_code_snapshot = p_provider_ref
    AND (
      pr.momo_checkout_url IS NOT NULL
      OR NULLIF(p.provider_data ->> 'checkoutAttemptedAt', '') IS NOT NULL
    )
    AND p.method = 'momo'
    AND p.status = 'pending'
    AND p.provider_ref = p_provider_ref
    AND p.amount = pr.amount_snapshot
  FOR UPDATE OF pr, p;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'payment_not_pending');
  END IF;
  IF v_target.momo_reconcile_claim_id = p_claim_id THEN
    RETURN jsonb_build_object(
      'status', 'claimed',
      'tenantId', v_target.tenant_id,
      'paymentId', v_target.payment_id,
      'paymentRequestId', v_target.payment_request_id,
      'providerRef', v_target.provider_ref,
      'amount', v_target.amount
    );
  END IF;
  IF v_target.payment_request_created_at > now() - interval '2 minutes' THEN
    RETURN jsonb_build_object('status', 'not_due');
  END IF;
  IF v_target.momo_reconcile_claim_id IS NOT NULL
     AND v_target.momo_reconcile_claimed_at >= now() - interval '10 minutes' THEN
    RETURN jsonb_build_object('status', 'in_progress');
  END IF;
  IF v_target.momo_reconcile_last_attempt_at >= now() - interval '2 minutes' THEN
    RETURN jsonb_build_object('status', 'rate_limited');
  END IF;

  UPDATE public.self_order_payment_requests
  SET momo_reconcile_claim_id = p_claim_id,
      momo_reconcile_claimed_at = now()
  WHERE id = v_target.payment_request_id
    AND tenant_id = v_target.tenant_id;

  RETURN jsonb_build_object(
    'status', 'claimed',
    'tenantId', v_target.tenant_id,
    'paymentId', v_target.payment_id,
    'paymentRequestId', v_target.payment_request_id,
    'providerRef', v_target.provider_ref,
    'amount', v_target.amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_momo_reconciliation_by_token(
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
  v_target record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_client_op_id IS NULL OR p_claim_id IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid_claim');
  END IF;

  SELECT
    pr.tenant_id,
    pr.payment_id,
    pr.id AS payment_request_id,
    p.provider_ref
  INTO v_target
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
   AND p.method = 'momo'
   AND p.status = 'pending'
   AND p.provider_ref = pr.payment_code_snapshot
   AND p.amount = pr.amount_snapshot
  WHERE t.self_order_token = p_token
    AND t.self_order_enabled = true
    AND t.status <> 'maintenance'
    AND pr.client_op_id = p_client_op_id
    AND pr.method = 'momo'
    AND pr.status = 'momo_pending'
    AND (
      pr.momo_checkout_url IS NOT NULL
      OR NULLIF(p.provider_data ->> 'checkoutAttemptedAt', '') IS NOT NULL
    )
  ORDER BY pr.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'payment_not_pending');
  END IF;

  RETURN public.claim_momo_reconciliation_request(
    v_target.tenant_id,
    v_target.payment_id,
    v_target.payment_request_id,
    v_target.provider_ref,
    p_claim_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_momo_reconciliation_batch(
  p_claim_id uuid,
  p_limit integer DEFAULT 20,
  p_min_age interval DEFAULT interval '5 minutes'
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
  IF p_claim_id IS NULL OR p_limit < 1 OR p_limit > 50
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
      AND (
        pr.momo_checkout_url IS NOT NULL
        OR NULLIF(p.provider_data ->> 'checkoutAttemptedAt', '') IS NOT NULL
      )
      AND pr.created_at <= now() - p_min_age
      AND (
        pr.momo_reconcile_last_attempt_at IS NULL
        OR pr.momo_reconcile_last_attempt_at < now() - interval '2 minutes'
      )
      AND (
        pr.momo_reconcile_claim_id IS NULL
        OR pr.momo_reconcile_claimed_at < now() - interval '10 minutes'
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

CREATE OR REPLACE FUNCTION public.release_momo_reconciliation_claim(
  p_tenant_id bigint,
  p_payment_request_id bigint,
  p_claim_id uuid,
  p_provider_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_request public.self_order_payment_requests%ROWTYPE;
  v_payment_id bigint;
  v_order_id bigint;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_claim_id IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid_claim');
  END IF;

  SELECT pr.payment_id, pr.order_id
  INTO v_payment_id, v_order_id
  FROM public.self_order_payment_requests pr
  WHERE pr.id = p_payment_request_id
    AND pr.tenant_id = p_tenant_id
    AND pr.method = 'momo';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'claim_lost');
  END IF;
  PERFORM pg_advisory_xact_lock(v_order_id);

  SELECT p.*
  INTO v_payment
  FROM public.payments p
  WHERE p.id = v_payment_id
    AND p.tenant_id = p_tenant_id
    AND p.order_id = v_order_id
    AND p.method = 'momo'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'claim_lost');
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
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'claim_lost');
  END IF;
  IF v_request.momo_reconcile_claim_id IS DISTINCT FROM p_claim_id THEN
    IF v_request.status IN ('completed', 'cancelled', 'expired')
       AND v_request.momo_reconcile_claim_id IS NULL
       AND v_request.momo_reconcile_claimed_at IS NULL
       AND v_payment.status IN ('completed', 'failed') THEN
      RETURN jsonb_build_object('status', 'already_released');
    END IF;
    RETURN jsonb_build_object('status', 'claim_lost');
  END IF;

  UPDATE public.payments
  SET provider_data = COALESCE(provider_data, '{}'::jsonb)
        || COALESCE(p_provider_data, '{}'::jsonb),
      updated_at = now()
  WHERE id = v_payment.id
    AND tenant_id = p_tenant_id
    AND method = 'momo';

  UPDATE public.self_order_payment_requests
  SET momo_reconcile_claim_id = NULL,
      momo_reconcile_claimed_at = NULL,
      momo_reconcile_last_attempt_at = now()
  WHERE id = v_request.id
    AND tenant_id = p_tenant_id
    AND momo_reconcile_claim_id = p_claim_id;

  RETURN jsonb_build_object('status', 'released');
END;
$$;

CREATE OR REPLACE FUNCTION public.review_momo_payment_exception(
  p_payment_id bigint,
  p_expected_transaction_id text,
  p_status text,
  p_resolution_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_order_id bigint;
  v_payment public.payments%ROWTYPE;
  v_transaction_id text;
  v_existing_status text;
  v_existing_reference text;
  v_old_review jsonb;
  v_new_review jsonb;
  v_requires_review boolean;
BEGIN
  IF v_user_id IS NULL
     OR v_tenant_id IS NULL
     OR NOT public.auth_is_owner(v_user_id)
     OR NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;
  IF p_payment_id IS NULL
     OR p_payment_id <= 0
     OR COALESCE(p_expected_transaction_id, '') !~ '^[1-9][0-9]*$'
     OR p_status IS NULL
     OR p_status NOT IN ('reviewing', 'refunded')
     OR (
       p_status = 'refunded'
       AND (
         char_length(btrim(COALESCE(p_resolution_reference, ''))) < 3
         OR char_length(btrim(COALESCE(p_resolution_reference, ''))) > 160
       )
     )
     OR (
       p_status = 'reviewing'
       AND NULLIF(btrim(COALESCE(p_resolution_reference, '')), '') IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'invalid_momo_review_input' USING ERRCODE = '22023';
  END IF;

  SELECT p.order_id
  INTO v_order_id
  FROM public.payments p
  WHERE p.id = p_payment_id
    AND p.tenant_id = v_tenant_id
    AND p.method = 'momo';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'momo_review_payment_not_found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM pg_advisory_xact_lock(v_order_id);

  SELECT p.*
  INTO v_payment
  FROM public.payments p
  WHERE p.id = p_payment_id
    AND p.tenant_id = v_tenant_id
    AND p.order_id = v_order_id
    AND p.method = 'momo'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'momo_review_payment_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_transaction_id := COALESCE(
    NULLIF(v_payment.provider_data ->> 'conflictingTransactionId', ''),
    NULLIF(v_payment.provider_data #>> '{momoReconciliation,transactionId}', ''),
    NULLIF(v_payment.provider_data ->> 'transactionId', '')
  );
  v_requires_review :=
    v_payment.provider_data ->> 'lateSuccessRequiresReview' = 'true'
    OR (
      v_payment.provider_data #>> '{momoReconciliation,disposition}' = 'success'
      AND COALESCE(
        v_payment.provider_data #>> '{momoReconciliation,settlementStatus}',
        ''
      ) NOT IN ('completed', 'already_completed')
    );
  IF v_requires_review IS DISTINCT FROM true
     OR v_transaction_id IS DISTINCT FROM p_expected_transaction_id THEN
    RAISE EXCEPTION 'momo_review_evidence_changed' USING ERRCODE = '23514';
  END IF;

  v_old_review := v_payment.provider_data -> 'momoReview';
  v_existing_status := v_old_review ->> 'status';
  v_existing_reference := v_old_review ->> 'resolutionReference';
  IF v_existing_status = 'refunded' THEN
    IF p_status = 'refunded'
       AND v_existing_reference IS NOT DISTINCT FROM btrim(p_resolution_reference) THEN
      RETURN jsonb_build_object(
        'status', 'already_refunded',
        'paymentId', v_payment.id
      );
    END IF;
    RAISE EXCEPTION 'momo_review_already_refunded' USING ERRCODE = '23514';
  END IF;

  v_new_review := jsonb_strip_nulls(jsonb_build_object(
    'status', p_status,
    'reviewedAt', now(),
    'reviewedBy', v_user_id,
    'transactionId', v_transaction_id,
    'resolutionReference', CASE
      WHEN p_status = 'refunded' THEN btrim(p_resolution_reference)
      ELSE NULL
    END
  ));

  UPDATE public.payments
  SET provider_data = jsonb_set(
        COALESCE(provider_data, '{}'::jsonb),
        '{momoReview}',
        v_new_review,
        true
      ),
      updated_at = now()
  WHERE id = v_payment.id
    AND tenant_id = v_tenant_id;

  PERFORM public.log_audit(
    'review_momo_payment_exception',
    'payment',
    v_payment.id,
    jsonb_build_object('momoReview', v_old_review),
    jsonb_build_object('momoReview', v_new_review)
  );

  RETURN jsonb_build_object(
    'status', p_status,
    'paymentId', v_payment.id,
    'orderId', v_payment.order_id
  );
END;
$$;

COMMENT ON FUNCTION public.review_momo_payment_exception(bigint, text, text, text)
  IS 'Owner-only acknowledgement and externally-refunded closure for authoritative MoMo settlement exceptions.';

REVOKE ALL ON FUNCTION public.confirm_momo_payment(bigint, bigint, text, text, numeric, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_momo_payment(bigint, bigint, text, text, numeric, jsonb)
  TO service_role;
REVOKE ALL ON FUNCTION public.claim_momo_checkout(bigint, bigint, bigint, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_momo_checkout(bigint, bigint, bigint, text, uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.recover_momo_checkout_request(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_momo_checkout_request(text, uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.set_momo_checkout(bigint, bigint, bigint, text, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_momo_checkout(bigint, bigint, bigint, text, uuid, text, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.fail_momo_payment(bigint, bigint, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_momo_payment(bigint, bigint, text, jsonb)
  TO service_role;
REVOKE ALL ON FUNCTION public.release_momo_checkout_claim(bigint, bigint, bigint, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_momo_checkout_claim(bigint, bigint, bigint, text, uuid, jsonb)
  TO service_role;
REVOKE ALL ON FUNCTION public.claim_momo_reconciliation_request(
  bigint,
  bigint,
  bigint,
  text,
  uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_momo_reconciliation_request(
  bigint,
  bigint,
  bigint,
  text,
  uuid
) TO service_role;
REVOKE ALL ON FUNCTION public.claim_momo_reconciliation_by_token(text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_momo_reconciliation_by_token(text, uuid, uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.claim_momo_reconciliation_batch(uuid, integer, interval)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_momo_reconciliation_batch(uuid, integer, interval)
  TO service_role;
REVOKE ALL ON FUNCTION public.release_momo_reconciliation_claim(
  bigint,
  bigint,
  uuid,
  jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_momo_reconciliation_claim(
  bigint,
  bigint,
  uuid,
  jsonb
) TO service_role;
REVOKE ALL ON FUNCTION public.review_momo_payment_exception(bigint, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_momo_payment_exception(bigint, text, text, text)
  TO authenticated;

DROP POLICY IF EXISTS payments_no_direct_momo_insert ON public.payments;
CREATE POLICY payments_no_direct_momo_insert
  ON public.payments
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (method <> 'momo');

DROP POLICY IF EXISTS payments_no_direct_momo_update ON public.payments;
CREATE POLICY payments_no_direct_momo_update
  ON public.payments
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (method <> 'momo')
  WITH CHECK (method <> 'momo');

REVOKE INSERT, DELETE, MAINTAIN, UPDATE
  ON TABLE public.orders, public.order_items, public.kds_tickets
  FROM anon, authenticated;
REVOKE INSERT, DELETE, MAINTAIN, UPDATE
  ON TABLE public.payments
  FROM anon, authenticated;
GRANT UPDATE (provider_ref, provider_data)
  ON TABLE public.payments
  TO authenticated;

REVOKE ALL ON FUNCTION public.complete_payment_and_consume_stock(
  bigint,
  numeric,
  jsonb,
  uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finalize_paid_order(bigint, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.confirm_payment_and_post(
  bigint,
  bigint,
  bigint,
  text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.transition_order_status(
  bigint,
  text,
  text,
  text
) FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
