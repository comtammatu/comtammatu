BEGIN;

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
       OLD.payment_id IS NULL
       AND NEW.payment_id IS NOT NULL
       AND OLD.status IN ('cash_call', 'vietqr_pending')
       AND NEW.status = 'completed'
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
       OLD.status IN ('cash_call', 'vietqr_pending')
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
      AND pr.status IN ('cash_call', 'vietqr_pending')
      AND (
        (pr.method = 'cash_call' AND v_payment_method = 'cash')
        OR (pr.method = 'vietqr' AND v_payment_method = 'vietqr')
      );

    UPDATE public.self_order_payment_requests pr
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = COALESCE(pr.cancel_reason, 'order_paid_by_other_method')
    WHERE pr.tenant_id = NEW.tenant_id
      AND pr.branch_id = NEW.branch_id
      AND pr.order_id = NEW.id
      AND pr.status IN ('cash_call', 'vietqr_pending')
      AND NOT (
        (pr.method = 'cash_call' AND v_payment_method = 'cash')
        OR (pr.method = 'vietqr' AND v_payment_method = 'vietqr')
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

REVOKE ALL ON FUNCTION public.self_order_sync_payment_request_from_order()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_self_order_sync_payment_request_from_order
  ON public.orders;
CREATE TRIGGER trg_self_order_sync_payment_request_from_order
  AFTER UPDATE OF status, payment_status ON public.orders
  FOR EACH ROW
  WHEN (
    OLD.status IS DISTINCT FROM NEW.status
    OR OLD.payment_status IS DISTINCT FROM NEW.payment_status
  ) EXECUTE FUNCTION public.self_order_sync_payment_request_from_order();

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

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.self_order_guard_table_token_rotation()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_self_order_guard_table_token_rotation
  ON public.tables;
CREATE TRIGGER trg_self_order_guard_table_token_rotation
  BEFORE UPDATE OF self_order_token, self_order_token_rotated_at ON public.tables
  FOR EACH ROW EXECUTE FUNCTION public.self_order_guard_table_token_rotation();

CREATE OR REPLACE FUNCTION public.rotate_table_self_order_qr(p_table_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_table record;
  v_token text;
  v_rotated_at timestamptz := now();
BEGIN
  IF v_uid IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('self-order-table'),
    hashtext(p_table_id::text)
  );

  SELECT t.*
  INTO v_table
  FROM public.tables t
  WHERE t.id = p_table_id
    AND t.tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_table_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_table.branch_id, 'settings:branch') THEN
    RAISE EXCEPTION 'permission denied: settings:branch' USING ERRCODE = '42501';
  END IF;

  v_token := translate(
    encode(extensions.gen_random_bytes(24), 'base64'),
    '+/=',
    '-_'
  );

  UPDATE public.tables
  SET self_order_token = v_token,
      self_order_enabled = true,
      self_order_token_rotated_at = v_rotated_at
  WHERE id = v_table.id
    AND tenant_id = v_table.tenant_id;

  RETURN jsonb_build_object(
    'token', v_token,
    'enabled', true,
    'rotatedAt', v_rotated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_table_self_order_qr(bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rotate_table_self_order_qr(bigint)
  TO authenticated, service_role;

CREATE UNIQUE INDEX IF NOT EXISTS self_order_payment_requests_client_op_id_uidx
  ON public.self_order_payment_requests (tenant_id, client_op_id);

COMMIT;
