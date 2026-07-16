CREATE OR REPLACE FUNCTION public.confirm_cash_payment_with_invoice_binding(
  p_order_id bigint,
  p_cash_received numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_order public.orders%ROWTYPE;
  v_request public.self_order_payment_requests%ROWTYPE;
  v_bound_request public.self_order_payment_requests%ROWTYPE;
  v_active_request_count integer := 0;
  v_request_found boolean := false;
  v_bound_request_found boolean := false;
  v_expired_request_id bigint;
  v_payment_result jsonb;
  v_payment_id bigint;
  v_payment_status text;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT o.*
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM v_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'pos:confirm_payment') THEN
    RAISE EXCEPTION 'permission denied: pos:confirm_payment' USING ERRCODE = '42501';
  END IF;

  IF NOT pg_try_advisory_xact_lock(v_order.id) THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END IF;

  FOR v_expired_request_id IN
    SELECT pr.id
    FROM public.self_order_payment_requests pr
    WHERE pr.tenant_id = v_order.tenant_id
      AND pr.branch_id = v_order.branch_id
      AND pr.order_id = v_order.id
      AND pr.status IN ('cash_call', 'vietqr_pending')
      AND pr.expires_at <= now()
    ORDER BY pr.id
  LOOP
    PERFORM public.self_order_expire_payment_request(v_expired_request_id);
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.self_order_payment_requests pr
    WHERE pr.tenant_id = v_order.tenant_id
      AND pr.branch_id = v_order.branch_id
      AND pr.order_id = v_order.id
      AND pr.method = 'vietqr'
      AND pr.status = 'vietqr_pending'
      AND pr.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'self_order_payment_cancel_staff_required' USING ERRCODE = '55P03';
  END IF;

  SELECT count(*)::integer
  INTO v_active_request_count
  FROM public.self_order_payment_requests pr
  WHERE pr.tenant_id = v_order.tenant_id
    AND pr.branch_id = v_order.branch_id
    AND pr.order_id = v_order.id
    AND pr.method = 'cash_call'
    AND pr.status = 'cash_call'
    AND pr.expires_at > now();

  IF v_active_request_count > 1 THEN
    RAISE EXCEPTION 'self_order_cash_request_ambiguous' USING ERRCODE = '23505';
  END IF;

  -- The order lock serializes self-order request mutations. Keep the request
  -- unlocked until confirm_cash_payment acquires its payment lock; its payment
  -- trigger then locks the request in the canonical order -> payment -> request order.
  SELECT pr.*
  INTO v_request
  FROM public.self_order_payment_requests pr
  WHERE pr.tenant_id = v_order.tenant_id
    AND pr.branch_id = v_order.branch_id
    AND pr.order_id = v_order.id
    AND pr.method = 'cash_call'
    AND pr.status = 'cash_call'
    AND pr.expires_at > now()
  ORDER BY pr.id DESC
  LIMIT 1;
  v_request_found := FOUND;

  IF v_request_found THEN
    IF abs(v_request.amount_snapshot - v_order.total_amount) > 1 THEN
      RAISE EXCEPTION 'self_order_cash_amount_mismatch' USING ERRCODE = '22023';
    END IF;

    PERFORM public.self_order_normalize_invoice_payload(v_request.invoice_payload);
  END IF;

  v_payment_result := public.confirm_cash_payment(p_order_id, p_cash_received);
  v_payment_status := NULLIF(v_payment_result ->> 'status', '');
  v_payment_id := NULLIF(v_payment_result ->> 'payment_id', '')::bigint;

  IF v_payment_status IN ('completed', 'already_completed') THEN
    IF v_request_found THEN
      IF v_payment_id IS NULL THEN
        RAISE EXCEPTION 'self_order_cash_payment_binding_missing' USING ERRCODE = '23503';
      END IF;

      UPDATE public.self_order_payment_requests pr
      SET status = 'completed',
          payment_id = COALESCE(pr.payment_id, v_payment_id),
          completed_at = COALESCE(pr.completed_at, now())
      WHERE pr.id = v_request.id
        AND pr.tenant_id = v_order.tenant_id
        AND pr.status = 'cash_call'
        AND pr.expires_at > now();

      SELECT pr.*
      INTO v_bound_request
      FROM public.self_order_payment_requests pr
      WHERE pr.id = v_request.id
        AND pr.tenant_id = v_order.tenant_id
        AND pr.branch_id = v_order.branch_id
        AND pr.order_id = v_order.id
        AND pr.method = 'cash_call'
      FOR UPDATE;
      v_bound_request_found := FOUND;

      IF NOT v_bound_request_found
         OR v_bound_request.status <> 'completed'
         OR v_bound_request.payment_id IS DISTINCT FROM v_payment_id
         OR v_bound_request.completed_at IS NULL
         OR v_bound_request.expires_at <= v_bound_request.completed_at THEN
        RAISE EXCEPTION 'self_order_cash_payment_binding_failed' USING ERRCODE = '23514';
      END IF;
    ELSIF v_payment_id IS NOT NULL THEN
      SELECT pr.*
      INTO v_bound_request
      FROM public.self_order_payment_requests pr
      WHERE pr.tenant_id = v_order.tenant_id
        AND pr.branch_id = v_order.branch_id
        AND pr.order_id = v_order.id
        AND pr.payment_id = v_payment_id
        AND pr.method = 'cash_call'
        AND pr.status = 'completed'
        AND pr.completed_at IS NOT NULL
        AND pr.expires_at > pr.completed_at
      ORDER BY pr.id DESC
      LIMIT 1
      FOR UPDATE;
      v_bound_request_found := FOUND;
    END IF;
  END IF;

  RETURN v_payment_result || jsonb_build_object(
    'self_order_request_id',
    CASE WHEN v_bound_request_found THEN v_bound_request.id ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_cash_payment_with_invoice_binding(bigint, numeric)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_cash_payment_with_invoice_binding(bigint, numeric)
  TO authenticated;
