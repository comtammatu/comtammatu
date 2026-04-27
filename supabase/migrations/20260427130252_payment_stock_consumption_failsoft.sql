-- POS payment must not be blocked by inventory setup or insufficient kitchen stock.
-- Payment/order completion stays atomic; stock consumption is a fail-soft side
-- effect reported through stock_consumed/detail for later reconciliation.

CREATE OR REPLACE FUNCTION public.complete_payment_and_consume_stock(
  p_payment_id BIGINT,
  p_expected_amount NUMERIC DEFAULT NULL::NUMERIC,
  p_provider_data JSONB DEFAULT NULL::JSONB,
  p_actor_id UUID DEFAULT NULL::UUID
)
RETURNS TABLE(
  status TEXT,
  payment_id BIGINT,
  order_id BIGINT,
  stock_consumed BOOLEAN,
  detail TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_payment       RECORD;
  v_stock_result  TEXT := 'skipped';
  v_stock_ok      BOOLEAN := FALSE;
BEGIN
  SELECT p.id, p.order_id, p.tenant_id, p.branch_id, p.amount, p.status
  INTO v_payment
  FROM public.payments p
  WHERE p.id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'not_found'::TEXT, p_payment_id, NULL::BIGINT, FALSE,
      ('payment ' || p_payment_id || ' does not exist')::TEXT;
    RETURN;
  END IF;

  IF v_payment.status = 'completed' THEN
    RETURN QUERY SELECT
      'already_completed'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      'payment was previously completed; no-op'::TEXT;
    RETURN;
  END IF;

  IF v_payment.status <> 'pending' THEN
    RETURN QUERY SELECT
      'failed'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      ('payment status=' || v_payment.status || ' cannot transition to completed')::TEXT;
    RETURN;
  END IF;

  IF p_expected_amount IS NOT NULL AND v_payment.amount <> p_expected_amount THEN
    UPDATE public.payments
       SET status = 'failed',
           provider_data = COALESCE(p_provider_data, provider_data),
           updated_at = now()
     WHERE id = v_payment.id;

    RETURN QUERY SELECT
      'amount_mismatch'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      ('stored=' || v_payment.amount || ' expected=' || p_expected_amount)::TEXT;
    RETURN;
  END IF;

  UPDATE public.payments
     SET status        = 'completed',
         paid_at       = COALESCE(paid_at, now()),
         provider_data = COALESCE(p_provider_data, provider_data),
         updated_at    = now()
   WHERE id = v_payment.id;

  UPDATE public.orders
     SET payment_status = 'paid',
         updated_at     = now()
   WHERE id = v_payment.order_id
     AND tenant_id = v_payment.tenant_id;

  BEGIN
    PERFORM public.consume_stock_for_order_service(v_payment.order_id, p_actor_id);
    v_stock_result := 'ok';
    v_stock_ok := TRUE;
  EXCEPTION WHEN OTHERS THEN
    v_stock_result := 'consume_stock_failed: ' || SQLERRM;
    v_stock_ok := FALSE;
    RAISE WARNING '[complete_payment_and_consume_stock] stock consumption skipped for payment %, order %: %',
      v_payment.id, v_payment.order_id, SQLERRM;
  END;

  PERFORM public.finalize_paid_order(v_payment.order_id, p_actor_id);

  RETURN QUERY SELECT
    'completed'::TEXT,
    v_payment.id,
    v_payment.order_id,
    v_stock_ok,
    ('stock=' || v_stock_result)::TEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_payment_and_consume_stock(BIGINT, NUMERIC, JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_payment_and_consume_stock(BIGINT, NUMERIC, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_payment_and_consume_stock(BIGINT, NUMERIC, JSONB, UUID) TO service_role;

COMMENT ON FUNCTION public.complete_payment_and_consume_stock(BIGINT, NUMERIC, JSONB, UUID) IS
  'Marks payment/order as paid and finalizes the order. Inventory consumption is fail-soft and reported via stock_consumed/detail for reconciliation.';
