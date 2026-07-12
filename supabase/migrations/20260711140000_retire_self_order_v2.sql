BEGIN;

DO $$
DECLARE
  v_has_rows boolean;
BEGIN
  IF to_regclass('public.self_order_sessions') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.self_order_sessions)'
      INTO v_has_rows;
    IF v_has_rows THEN
      RAISE EXCEPTION 'self_order_v2_sessions_not_empty';
    END IF;
  END IF;

  IF to_regclass('public.self_order_batches') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.self_order_batches)'
      INTO v_has_rows;
    IF v_has_rows THEN
      RAISE EXCEPTION 'self_order_v2_batches_not_empty';
    END IF;
  END IF;

  IF to_regclass('public.self_order_session_devices') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.self_order_session_devices)'
      INTO v_has_rows;
    IF v_has_rows THEN
      RAISE EXCEPTION 'self_order_v2_devices_not_empty';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'self_order_payment_requests'
      AND column_name = 'session_id'
  ) THEN
    EXECUTE 'SELECT EXISTS (
      SELECT 1
      FROM public.self_order_payment_requests
      WHERE session_id IS NOT NULL
    )' INTO v_has_rows;
    IF v_has_rows THEN
      RAISE EXCEPTION 'self_order_v2_payment_sessions_not_empty';
    END IF;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.tables') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_self_order_fill_realtime_topic_token ON public.tables';
    EXECUTE 'DROP TRIGGER IF EXISTS trg_self_order_guard_capability_version ON public.tables';
    EXECUTE 'DROP TRIGGER IF EXISTS trg_self_order_guard_capability_version_change ON public.tables';
  END IF;

  IF to_regclass('public.self_order_payment_requests') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_self_order_payment_requests_broadcast ON public.self_order_payment_requests';
    EXECUTE 'DROP TRIGGER IF EXISTS trg_self_order_enforce_payment_request_invariants ON public.self_order_payment_requests';
    EXECUTE 'DROP TRIGGER IF EXISTS trg_self_order_enforce_payment_device_binding_insert ON public.self_order_payment_requests';
    EXECUTE 'DROP TRIGGER IF EXISTS trg_self_order_enforce_payment_device_binding_update ON public.self_order_payment_requests';
  END IF;

  IF to_regclass('public.orders') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_self_order_close_session_from_order ON public.orders';
    EXECUTE 'DROP TRIGGER IF EXISTS trg_self_order_close_session_on_order_transfer ON public.orders';
  END IF;
END;
$$;

DROP POLICY IF EXISTS self_order_public_broadcast_select ON realtime.messages;

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
    completed_at,
    cancelled_at,
    expired_at,
    cancel_reason
  ON public.self_order_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.self_order_enforce_payment_request_invariants();

REVOKE ALL ON FUNCTION public.self_order_enforce_payment_request_invariants() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.self_order_enforce_payment_request_invariants() FROM anon, authenticated;

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

ALTER TABLE public.self_order_payment_requests DROP COLUMN IF EXISTS session_id;

ALTER TABLE IF EXISTS public.self_order_payment_requests
  DROP CONSTRAINT IF EXISTS self_order_payment_requests_session_device_id_fkey,
  DROP COLUMN IF EXISTS session_device_id;
ALTER TABLE IF EXISTS public.self_order_batches
  DROP CONSTRAINT IF EXISTS self_order_batches_session_device_id_fkey;
ALTER TABLE IF EXISTS public.self_order_session_devices
  DROP CONSTRAINT IF EXISTS self_order_session_devices_request_batch_id_fkey;

DROP TABLE IF EXISTS public.self_order_batches;
DROP TABLE IF EXISTS public.self_order_session_devices;
DROP TABLE IF EXISTS public.self_order_sessions;
ALTER TABLE public.tables DROP COLUMN IF EXISTS self_order_capability_version;
ALTER TABLE public.tables DROP COLUMN IF EXISTS realtime_topic_token;

DROP FUNCTION IF EXISTS private.self_order_get_snapshot_base(text);
DROP FUNCTION IF EXISTS private.self_order_list_staff_queue_base(bigint);
DROP FUNCTION IF EXISTS public.self_order_append_active_batch(bigint, bigint, uuid, jsonb);
DROP FUNCTION IF EXISTS public.self_order_approve_batch(bigint, bigint, bigint, uuid);
DROP FUNCTION IF EXISTS public.self_order_list_staff_queue(bigint);
DROP FUNCTION IF EXISTS public.self_order_reject_batch(bigint, text);
DROP FUNCTION IF EXISTS public.self_order_submit_batch(text, uuid, jsonb, text);
DROP FUNCTION IF EXISTS public.self_order_broadcast_session_changed();
DROP FUNCTION IF EXISTS public.self_order_close_session_from_order();
DROP FUNCTION IF EXISTS public.self_order_batch_request_fingerprint(jsonb, text);
DROP FUNCTION IF EXISTS public.self_order_fill_batch_request_fingerprint();
DROP FUNCTION IF EXISTS public.self_order_enforce_session_invariants();
DROP FUNCTION IF EXISTS public.self_order_enforce_batch_transition();

DROP FUNCTION IF EXISTS public.self_order_get_public_context_v2(text);
DROP FUNCTION IF EXISTS public.self_order_get_snapshot_v2(text, text);
DROP FUNCTION IF EXISTS public.self_order_submit_batch_v2(text, text, text, uuid, jsonb, text);
DROP FUNCTION IF EXISTS public.self_order_request_device_join_v2(text, text, text);
DROP FUNCTION IF EXISTS public.self_order_refresh_pairing_code_v2(text, text, text);
DROP FUNCTION IF EXISTS public.self_order_create_payment_request_v2(text, text, text, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.set_table_self_order_capability_version(bigint, smallint);
DROP FUNCTION IF EXISTS public.self_order_approve_batch_v2(bigint, text, bigint, bigint, uuid);
DROP FUNCTION IF EXISTS public.self_order_approve_device_join_v2(bigint, text);
DROP FUNCTION IF EXISTS public.self_order_reject_batch_v2(bigint, text);
DROP FUNCTION IF EXISTS public.self_order_reject_device_join_v2(bigint, text);
DROP FUNCTION IF EXISTS public.self_order_revoke_session_device_v2(bigint, text);
DROP FUNCTION IF EXISTS public.self_order_list_staff_queue_v2(bigint);
DROP FUNCTION IF EXISTS public.self_order_random_token(integer);
DROP FUNCTION IF EXISTS public.self_order_fill_realtime_topic_token();
DROP FUNCTION IF EXISTS public.self_order_pairing_code_hash(text, text);
DROP FUNCTION IF EXISTS public.self_order_new_pairing_code();
DROP FUNCTION IF EXISTS public.self_order_enforce_session_device_invariants();
DROP FUNCTION IF EXISTS public.self_order_enforce_batch_device_binding();
DROP FUNCTION IF EXISTS public.self_order_enforce_payment_device_binding();
DROP FUNCTION IF EXISTS public.self_order_create_pending_device(bigint, text, text);
DROP FUNCTION IF EXISTS public.self_order_refresh_pairing_code(bigint);
DROP FUNCTION IF EXISTS public.self_order_guard_capability_version_change();
DROP FUNCTION IF EXISTS public.self_order_terminalize_session_devices();
DROP FUNCTION IF EXISTS public.self_order_close_session_on_order_transfer();

COMMIT;
