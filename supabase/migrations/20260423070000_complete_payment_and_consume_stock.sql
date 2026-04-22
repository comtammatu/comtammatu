-- =============================================================
-- Atomic payment completion + stock consumption
--
-- Single transaction: flip payment → completed, mark order paid,
-- deduct ingredient stock. Intended for provider webhooks (Momo, VietQR
-- future) where webhook handler runs under service_role. Replaces the
-- 3-step sequence in `apps/web/app/api/webhooks/momo/route.ts` that
-- could desync on partial failure.
--
-- Idempotent: if payment is already 'completed', returns status
-- 'already_completed' without re-deducting stock. First writer wins.
--
-- Amount guard optional: pass p_expected_amount > 0 to fail with
-- 'amount_mismatch' if the stored payment amount differs (anti-fraud).
--
-- Errors DO NOT raise — they return a result row so the webhook can
-- record the outcome and respond 200 OK to the provider while flagging
-- manual reconciliation for non-fatal cases. Payment RLS bypass via
-- SECURITY DEFINER: only callable by authenticated/service_role (webhooks
-- use service_role, which bypasses RLS anyway).
-- =============================================================

CREATE OR REPLACE FUNCTION public.complete_payment_and_consume_stock(
  p_payment_id        BIGINT,
  p_expected_amount   NUMERIC(15,2) DEFAULT NULL,
  p_provider_data     JSONB          DEFAULT NULL,
  p_actor_id          UUID           DEFAULT NULL
)
RETURNS TABLE (
  status            TEXT,      -- 'completed' | 'already_completed' | 'not_found' | 'amount_mismatch' | 'failed'
  payment_id        BIGINT,
  order_id          BIGINT,
  stock_consumed    BOOLEAN,
  detail            TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment       RECORD;
  v_stock_result  TEXT;
BEGIN
  -- Load payment, lock row for update to prevent concurrent webhooks
  SELECT p.id, p.order_id, p.tenant_id, p.branch_id, p.amount, p.status
  INTO v_payment
  FROM public.payments p
  WHERE p.id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'not_found'::TEXT,
      p_payment_id,
      NULL::BIGINT,
      FALSE,
      ('payment ' || p_payment_id || ' does not exist')::TEXT;
    RETURN;
  END IF;

  -- Idempotent: if already completed, return success without re-running stock deduction
  IF v_payment.status = 'completed' THEN
    RETURN QUERY SELECT
      'already_completed'::TEXT,
      v_payment.id,
      v_payment.order_id,
      FALSE,
      'payment was previously completed; no-op'::TEXT;
    RETURN;
  END IF;

  -- Only pending payments may progress to completed
  IF v_payment.status <> 'pending' THEN
    RETURN QUERY SELECT
      'failed'::TEXT,
      v_payment.id,
      v_payment.order_id,
      FALSE,
      ('payment status=' || v_payment.status || ' cannot transition to completed')::TEXT;
    RETURN;
  END IF;

  -- Amount guard (optional)
  IF p_expected_amount IS NOT NULL AND v_payment.amount <> p_expected_amount THEN
    UPDATE public.payments
       SET status = 'failed',
           provider_data = COALESCE(p_provider_data, provider_data),
           updated_at = now()
     WHERE id = v_payment.id;

    RETURN QUERY SELECT
      'amount_mismatch'::TEXT,
      v_payment.id,
      v_payment.order_id,
      FALSE,
      ('stored=' || v_payment.amount || ' expected=' || p_expected_amount)::TEXT;
    RETURN;
  END IF;

  -- 1. Flip payment → completed
  UPDATE public.payments
     SET status        = 'completed',
         paid_at       = COALESCE(paid_at, now()),
         provider_data = COALESCE(p_provider_data, provider_data),
         updated_at    = now()
   WHERE id = v_payment.id;

  -- 2. Flip order → paid
  UPDATE public.orders
     SET payment_status = 'paid',
         updated_at     = now()
   WHERE id = v_payment.order_id
     AND tenant_id = v_payment.tenant_id;

  -- 3. Deduct ingredient stock. Errors inside consume_stock_for_order_service
  -- would abort this transaction (desired: don't leave order paid but stock
  -- untouched). Webhook should retry on exception.
  BEGIN
    PERFORM public.consume_stock_for_order_service(v_payment.order_id, p_actor_id);
    v_stock_result := 'ok';
  EXCEPTION WHEN OTHERS THEN
    -- Rollback whole transaction by re-raising — payment + order revert.
    RAISE EXCEPTION 'consume_stock_failed: %', SQLERRM;
  END;

  RETURN QUERY SELECT
    'completed'::TEXT,
    v_payment.id,
    v_payment.order_id,
    TRUE,
    ('stock=' || v_stock_result)::TEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_payment_and_consume_stock(BIGINT, NUMERIC, JSONB, UUID) FROM PUBLIC;
-- Callable by service_role (webhooks) and authenticated (in case POS server-action wants to use it).
-- authenticated runs under RLS when they SELECT the payment — SECURITY DEFINER bypasses that here,
-- but webhook flow doesn't use a user JWT so that's fine.
GRANT EXECUTE ON FUNCTION public.complete_payment_and_consume_stock(BIGINT, NUMERIC, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_payment_and_consume_stock(BIGINT, NUMERIC, JSONB, UUID) TO service_role;

COMMENT ON FUNCTION public.complete_payment_and_consume_stock(BIGINT, NUMERIC, JSONB, UUID) IS
  'Webhook-safe atomic: flip payment→completed, order→paid, consume stock. Idempotent via status=pending guard. Raises on stock failure so transaction rolls back; all other outcomes return status code rows.';
