-- =========================================================================
-- Payment completion hardening:
--   1. Recompute order total inside payment completion.
--   2. Never mark payment/order paid if stock consumption fails.
--   3. Emit a durable manager notification for stock-consumption blockers.
--
-- This intentionally keeps the existing RETURNS TABLE shape so app code can
-- stay compatible until generated Supabase types are refreshed.
-- =========================================================================

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_stock_consumed_status_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_stock_consumed_status_check
    CHECK (
      stock_consumed_status IS NULL
      OR stock_consumed_status IN ('ok', 'out_of_stock', 'recipe_missing', 'internal_error')
    );

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
  v_payment          RECORD;
  v_order            RECORD;
  v_line_subtotal    NUMERIC(15,2) := 0;
  v_recomputed_total NUMERIC(15,2) := 0;
  v_stock_status     TEXT := NULL;
  v_stock_detail     TEXT := NULL;
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

  SELECT o.id, o.tenant_id, o.branch_id, o.tax_amount, o.service_charge,
         o.discount_amount, o.total_amount
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_payment.order_id
    AND o.tenant_id = v_payment.tenant_id
    AND o.branch_id = v_payment.branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'failed'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      'order_not_found'::TEXT;
    RETURN;
  END IF;

  SELECT COALESCE(SUM(oi.quantity::NUMERIC * oi.unit_price), 0)::NUMERIC(15,2)
  INTO v_line_subtotal
  FROM public.order_items oi
  WHERE oi.order_id = v_order.id
    AND oi.tenant_id = v_order.tenant_id
    AND oi.status <> 'cancelled';

  v_recomputed_total := ROUND(
    v_line_subtotal
    + COALESCE(v_order.tax_amount, 0)
    + COALESCE(v_order.service_charge, 0)
    - COALESCE(v_order.discount_amount, 0),
    2
  );

  IF ABS(v_payment.amount - v_recomputed_total) > 1 THEN
    UPDATE public.payments
       SET status = 'failed',
           provider_data = COALESCE(p_provider_data, provider_data),
           updated_at = now()
     WHERE id = v_payment.id;

    RETURN QUERY SELECT
      'amount_mismatch_recomputed'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      ('stored=' || v_payment.amount || ' recomputed=' || v_recomputed_total)::TEXT;
    RETURN;
  END IF;

  IF p_expected_amount IS NOT NULL AND ABS(p_expected_amount - v_recomputed_total) > 1 THEN
    UPDATE public.payments
       SET status = 'failed',
           provider_data = COALESCE(p_provider_data, provider_data),
           updated_at = now()
     WHERE id = v_payment.id;

    RETURN QUERY SELECT
      'amount_mismatch_recomputed'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      ('expected=' || p_expected_amount || ' recomputed=' || v_recomputed_total)::TEXT;
    RETURN;
  END IF;

  BEGIN
    PERFORM public.consume_stock_for_order_service(v_payment.order_id, p_actor_id);
    v_stock_status := 'ok';
  EXCEPTION WHEN OTHERS THEN
    v_stock_detail := SQLERRM;
    v_stock_status := CASE
      WHEN lower(SQLERRM) LIKE '%out_of_stock%' OR lower(SQLERRM) LIKE '%insufficient%' THEN 'out_of_stock'
      WHEN lower(SQLERRM) LIKE '%recipe%' THEN 'recipe_missing'
      ELSE 'internal_error'
    END;

    UPDATE public.payments
       SET stock_consumed_status = v_stock_status,
           provider_data = COALESCE(p_provider_data, provider_data),
           updated_at = now()
     WHERE id = v_payment.id;

    INSERT INTO public.notifications (
      tenant_id,
      target_branch_id,
      target_roles,
      kind,
      severity,
      title,
      body,
      entity_type,
      entity_id,
      action_url,
      dedup_key,
      meta
    )
    VALUES (
      v_payment.tenant_id,
      v_payment.branch_id,
      ARRAY['owner', 'super_manager', 'branch_manager'],
      'pos.payment_stock_failed',
      'critical',
      'Thanh toán chưa thể hoàn tất do tồn kho',
      'Hệ thống chưa ghi nhận thanh toán vì trừ tồn kho không thành công. Vui lòng kiểm tra định mức và tồn kho trước khi xác nhận lại.',
      'payment',
      v_payment.id,
      '/orders',
      'payment_stock_failed:' || v_payment.id::TEXT,
      jsonb_build_object(
        'payment_id', v_payment.id,
        'order_id', v_payment.order_id,
        'branch_id', v_payment.branch_id,
        'stock_status', v_stock_status
      )
    )
    ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
    DO UPDATE SET
      severity = EXCLUDED.severity,
      body = EXCLUDED.body,
      meta = EXCLUDED.meta,
      created_at = now(),
      expires_at = NULL;

    RAISE WARNING '[complete_payment_and_consume_stock] stock consumption blocked for payment %, order %: %',
      v_payment.id, v_payment.order_id, v_stock_detail;

    RETURN QUERY SELECT
      'stock_failed'::TEXT,
      v_payment.id,
      v_payment.order_id,
      FALSE,
      ('stock_consumed_status=' || v_stock_status)::TEXT;
    RETURN;
  END;

  UPDATE public.payments
     SET status        = 'completed',
         paid_at       = COALESCE(paid_at, now()),
         provider_data = COALESCE(p_provider_data, provider_data),
         stock_consumed_status = 'ok',
         updated_at    = now()
   WHERE id = v_payment.id;

  UPDATE public.orders
     SET payment_status = 'paid',
         updated_at     = now()
   WHERE id = v_payment.order_id
     AND tenant_id = v_payment.tenant_id;

  PERFORM public.finalize_paid_order(v_payment.order_id, p_actor_id);

  RETURN QUERY SELECT
    'completed'::TEXT,
    v_payment.id,
    v_payment.order_id,
    TRUE,
    'stock=ok'::TEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_payment_and_consume_stock(BIGINT, NUMERIC, JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_payment_and_consume_stock(BIGINT, NUMERIC, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_payment_and_consume_stock(BIGINT, NUMERIC, JSONB, UUID) TO service_role;

COMMENT ON FUNCTION public.complete_payment_and_consume_stock(BIGINT, NUMERIC, JSONB, UUID) IS
  'Recomputes order total at payment time, consumes stock before marking paid, and returns stock_failed without completing payment/order when inventory cannot be consumed.';

CREATE OR REPLACE FUNCTION public.confirm_cash_payment(
  p_order_id       bigint,
  p_cash_received  numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid          UUID;
  v_order        public.orders%ROWTYPE;
  v_existing_id  BIGINT;
  v_existing_st  TEXT;
  v_payment_id   BIGINT;
  v_cash_change  NUMERIC(15,2);
  v_complete_res RECORD;
  v_receipt_res  JSONB;
  v_print_warning TEXT;
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

  IF NOT public.has_permission_any('pos:confirm_payment') THEN
    RAISE EXCEPTION 'permission denied: pos:confirm_payment' USING ERRCODE = '42501';
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

  v_cash_change := p_cash_received - v_order.total_amount;

  SELECT id, status INTO v_existing_id, v_existing_st
  FROM public.payments
  WHERE order_id = p_order_id
    AND status <> 'failed'
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_st = 'completed' THEN
    v_payment_id := v_existing_id;
  ELSIF v_existing_id IS NOT NULL THEN
    UPDATE public.payments
       SET method        = 'cash',
           amount        = v_order.total_amount,
           status        = 'pending',
           provider_ref  = NULL,
           provider_data = NULL,
           updated_at    = now()
     WHERE id = v_existing_id;
    v_payment_id := v_existing_id;
  ELSE
    INSERT INTO public.payments (
      tenant_id, branch_id, order_id, method, amount, status, created_by
    ) VALUES (
      v_order.tenant_id, v_order.branch_id, p_order_id, 'cash',
      v_order.total_amount, 'pending', v_uid
    )
    RETURNING id INTO v_payment_id;
  END IF;

  UPDATE public.orders
     SET payment_method = 'cash',
         updated_at     = now()
   WHERE id = p_order_id;

  IF v_existing_st = 'completed' THEN
    RETURN jsonb_build_object(
      'status',        'already_completed',
      'order_id',      p_order_id,
      'payment_id',    v_payment_id,
      'cash_received', COALESCE(v_order.cash_received, p_cash_received),
      'cash_change',   COALESCE(v_order.cash_change, v_cash_change),
      'print_job_id',  NULL,
      'idempotent',    true
    );
  END IF;

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
$function$;

GRANT EXECUTE ON FUNCTION public.confirm_cash_payment(bigint, numeric) TO authenticated;

COMMENT ON FUNCTION public.confirm_cash_payment(bigint, numeric) IS
  'Cash payment confirmation. Reuses active payment slot, allows zero-total comp orders, delegates server recompute + stock fail-hard to complete_payment_and_consume_stock, and keeps receipt printing fail-soft.';
