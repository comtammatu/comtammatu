-- Migration: fix_sepay_payment_evidence_replay

-- Restore the canonical SePay settlement path after the accountant replay
-- expansion accidentally called the retired cashier-confirm RPC. The service
-- caller supplies the authenticated operator identity explicitly because a
-- service-role JWT has no auth.uid() for public.log_audit.

CREATE OR REPLACE FUNCTION public.replay_signed_sepay_payment_evidence(
  p_event_id bigint,
  p_payment_id bigint,
  p_payment_code text,
  p_actor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_event public.webhook_events%ROWTYPE;
  v_payment record;
  v_actor_authorized boolean := false;
  v_raw_amount text;
  v_amount numeric;
  v_payment_code text := pg_catalog.btrim(COALESCE(p_payment_code, ''));
  v_result jsonb;
  v_result_payment_id bigint;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT event.*
  INTO v_event
  FROM public.webhook_events AS event
  WHERE event.id = p_event_id
    AND event.provider = 'sepay'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sepay_replay_event_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    JOIN public.positions AS position
      ON position.id = profile.position_id
     AND position.tenant_id = profile.tenant_id
    WHERE profile.id = p_actor_id
      AND profile.tenant_id = v_event.tenant_id
      AND COALESCE(profile.is_active, true)
      AND position.code IN ('owner', 'accountant')
  )
  INTO v_actor_authorized;

  IF NOT v_actor_authorized THEN
    RAISE EXCEPTION 'sepay_replay_actor_forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT v_event.signature_valid
    OR pg_catalog.lower(
      COALESCE(v_event.payload ->> 'transferType', '')
    ) <> 'in'
    OR v_event.payment_id IS NOT NULL
    OR v_event.expense_id IS NOT NULL
  THEN
    RAISE EXCEPTION 'sepay_replay_event_invalid' USING ERRCODE = '23514';
  END IF;

  IF NOT (
    (
      v_event.processing_status = 'processed'
      AND v_event.error_code IN (
        'missing_payment_code_needs_review',
        'order_not_found_needs_review',
        'ambiguous_payment_code_needs_review',
        'amount_mismatch_needs_review'
      )
    )
    OR (
      v_event.processing_status = 'failed'
      AND COALESCE(v_event.http_status, 0) >= 500
    )
  ) THEN
    RAISE EXCEPTION 'sepay_replay_event_not_recoverable'
      USING ERRCODE = '23514';
  END IF;

  IF v_payment_code = '' THEN
    RAISE EXCEPTION 'sepay_replay_payment_code_required'
      USING ERRCODE = '22023';
  END IF;

  v_raw_amount := pg_catalog.btrim(
    COALESCE(v_event.payload ->> 'transferAmount', '')
  );
  IF v_raw_amount !~ '^[0-9]+([.][0-9]+)?$' THEN
    RAISE EXCEPTION 'sepay_replay_amount_invalid' USING ERRCODE = '22023';
  END IF;

  v_amount := v_raw_amount::numeric;
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'sepay_replay_amount_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT
    payment.id,
    payment.tenant_id,
    payment.branch_id,
    payment.order_id,
    payment.amount,
    payment.provider_ref,
    orders.payment_code,
    orders.total_amount
  INTO v_payment
  FROM public.payments AS payment
  JOIN public.orders AS orders
    ON orders.id = payment.order_id
   AND orders.tenant_id = payment.tenant_id
  WHERE payment.id = p_payment_id
    AND payment.tenant_id = v_event.tenant_id
    AND payment.method = 'vietqr'
    AND payment.status = 'pending'
    AND orders.status <> 'cancelled'
  FOR UPDATE OF payment, orders;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sepay_replay_payment_not_pending'
      USING ERRCODE = 'P0002';
  END IF;

  IF pg_catalog.lower(COALESCE(v_payment.payment_code, ''))
       <> pg_catalog.lower(v_payment_code)
    OR pg_catalog.lower(COALESCE(v_payment.provider_ref, ''))
       <> pg_catalog.lower(v_payment_code)
  THEN
    RAISE EXCEPTION 'sepay_replay_payment_code_mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF v_amount <> v_payment.amount OR v_amount <> v_payment.total_amount THEN
    RAISE EXCEPTION 'sepay_replay_amount_mismatch' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.webhook_events AS other_event
    WHERE other_event.tenant_id = v_event.tenant_id
      AND other_event.id <> v_event.id
      AND other_event.provider = 'sepay'
      AND other_event.signature_valid
      AND pg_catalog.lower(
        COALESCE(other_event.payload ->> 'transferType', '')
      ) = 'in'
      AND other_event.processing_status = 'processed'
      AND other_event.error_code IS NULL
      AND (
        other_event.payment_id = v_payment.id
        OR other_event.order_id = v_payment.order_id
      )
  ) THEN
    RAISE EXCEPTION 'sepay_replay_payment_already_linked'
      USING ERRCODE = '23505';
  END IF;

  UPDATE public.webhook_events
  SET processing_status = 'received',
      http_status = NULL,
      error_code = NULL,
      processed_at = NULL
  WHERE id = v_event.id
    AND tenant_id = v_event.tenant_id;

  SELECT public.reconcile_sepay_order_evidence(
    v_event.id,
    v_payment_code
  )
  INTO v_result;

  v_result_payment_id := NULLIF(v_result ->> 'payment_id', '')::bigint;
  IF v_result ->> 'status' IS DISTINCT FROM 'matched'
    OR v_result_payment_id IS DISTINCT FROM v_payment.id
  THEN
    RAISE EXCEPTION 'sepay_replay_failed' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.audit_logs (
    tenant_id,
    user_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data
  ) VALUES (
    v_event.tenant_id,
    p_actor_id,
    'replay_signed_sepay_payment_evidence',
    'webhook_event',
    v_event.id,
    pg_catalog.jsonb_build_object(
      'processing_status', v_event.processing_status,
      'http_status', v_event.http_status,
      'error_code', v_event.error_code,
      'order_id', v_event.order_id,
      'payment_id', v_event.payment_id
    ),
    pg_catalog.jsonb_build_object(
      'processing_status', 'processed',
      'http_status', 200,
      'error_code', NULL,
      'order_id', v_payment.order_id,
      'payment_id', v_payment.id
    )
  );

  RETURN v_result || pg_catalog.jsonb_build_object('replayed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.replay_signed_sepay_payment_evidence(
  bigint,
  bigint,
  text,
  uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replay_signed_sepay_payment_evidence(
  bigint,
  bigint,
  text,
  uuid
) TO service_role;

COMMENT ON FUNCTION public.replay_signed_sepay_payment_evidence(
  bigint,
  bigint,
  text,
  uuid
) IS
  'Replays one signed incoming SePay event against its exact pending VietQR payment. The service caller supplies an authenticated Owner or Accountant actor, which is revalidated and audited in the same transaction.';
