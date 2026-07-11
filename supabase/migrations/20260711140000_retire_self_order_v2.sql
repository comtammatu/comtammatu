BEGIN;

DO $$
BEGIN
  IF to_regclass('public.self_order_sessions') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.self_order_sessions) THEN
    RAISE EXCEPTION 'self_order_v2_sessions_not_empty';
  END IF;

  IF to_regclass('public.self_order_batches') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.self_order_batches) THEN
    RAISE EXCEPTION 'self_order_v2_batches_not_empty';
  END IF;

  IF to_regclass('public.self_order_session_devices') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.self_order_session_devices) THEN
    RAISE EXCEPTION 'self_order_v2_devices_not_empty';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'self_order_payment_requests'
      AND column_name = 'session_id'
  ) AND EXISTS (
    SELECT 1
    FROM public.self_order_payment_requests
    WHERE session_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'self_order_v2_payment_sessions_not_empty';
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.tables') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_self_order_fill_realtime_topic_token ON public.tables';
    EXECUTE 'DROP TRIGGER IF EXISTS trg_self_order_guard_capability_version ON public.tables';
  END IF;

  IF to_regclass('public.self_order_payment_requests') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_self_order_payment_requests_broadcast ON public.self_order_payment_requests';
    EXECUTE 'DROP TRIGGER IF EXISTS trg_self_order_enforce_payment_device_binding_insert ON public.self_order_payment_requests';
    EXECUTE 'DROP TRIGGER IF EXISTS trg_self_order_enforce_payment_device_binding_update ON public.self_order_payment_requests';
  END IF;

  IF to_regclass('public.orders') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_self_order_close_session_from_order ON public.orders';
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

  IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
    RAISE EXCEPTION 'self_order_completed_request_missing_timestamp' USING ERRCODE = '23514';
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

REVOKE ALL ON FUNCTION public.self_order_enforce_payment_request_invariants() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.self_order_enforce_payment_request_invariants() FROM anon, authenticated;

ALTER TABLE public.self_order_payment_requests DROP COLUMN IF EXISTS session_id;
DROP TABLE IF EXISTS public.self_order_session_devices;
DROP TABLE IF EXISTS public.self_order_batches;
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
DROP FUNCTION IF EXISTS public.self_order_broadcast_session_changed();
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
