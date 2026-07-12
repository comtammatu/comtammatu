CREATE OR REPLACE FUNCTION public.create_payment(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_order_id bigint,
  p_method text,
  p_amount numeric,
  p_created_by uuid,
  p_provider_ref text DEFAULT NULL::text,
  p_status text DEFAULT 'pending'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_order record;
  v_payment_id bigint;
  v_existing_payment_id bigint;
  v_existing_status text;
  v_existing_method text;
  v_effective_method text;
  v_final_status text;
  v_skip_completion_side_effects boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;
  IF p_created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'actor_mismatch' USING ERRCODE = '42501';
  END IF;
  IF p_method NOT IN ('cash', 'vietqr') THEN
    RAISE EXCEPTION 'invalid payment method: %', p_method USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_permission(p_branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'permission denied: pos:use' USING ERRCODE = '42501';
  END IF;

  SELECT id, total_amount, tax_amount, payment_status, branch_id, tenant_id
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id = p_tenant_id
    AND branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'order_already_paid' USING ERRCODE = 'P0001';
  END IF;
  IF p_amount <> v_order.total_amount THEN
    RAISE EXCEPTION 'amount_mismatch: expected % got %', v_order.total_amount, p_amount
      USING ERRCODE = '22023';
  END IF;

  v_final_status := CASE
    WHEN p_method = 'cash' THEN 'completed'
    ELSE COALESCE(p_status, 'pending')
  END;
  v_effective_method := p_method;

  SELECT id, status, method
  INTO v_existing_payment_id, v_existing_status, v_existing_method
  FROM public.payments
  WHERE tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND order_id = p_order_id
    AND status <> 'failed'
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_status = 'completed' THEN
    v_payment_id := v_existing_payment_id;
    v_final_status := 'completed';
    v_effective_method := v_existing_method;
    v_skip_completion_side_effects := true;
  ELSIF v_existing_status = 'pending' THEN
    IF v_existing_method IS DISTINCT FROM p_method THEN
      RAISE EXCEPTION 'payment_pending_different_method: existing=% requested=%',
        v_existing_method, p_method
        USING ERRCODE = '23505';
    END IF;

    UPDATE public.payments
    SET method = p_method,
        amount = p_amount,
        status = v_final_status,
        provider_ref = p_provider_ref,
        provider_data = NULL,
        paid_at = CASE WHEN v_final_status = 'completed' THEN now() ELSE NULL END,
        updated_at = now()
    WHERE id = v_existing_payment_id
    RETURNING id INTO v_payment_id;
  ELSIF v_existing_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'payment_not_pending: status=%', v_existing_status
      USING ERRCODE = '22023';
  ELSE
    INSERT INTO public.payments (
      tenant_id,
      branch_id,
      order_id,
      method,
      amount,
      status,
      provider_ref,
      paid_at,
      created_by
    ) VALUES (
      p_tenant_id,
      p_branch_id,
      p_order_id,
      p_method,
      p_amount,
      v_final_status,
      p_provider_ref,
      CASE WHEN v_final_status = 'completed' THEN now() ELSE NULL END,
      p_created_by
    )
    RETURNING id INTO v_payment_id;
  END IF;

  UPDATE public.orders
  SET payment_method = v_effective_method,
      payment_status = CASE
        WHEN v_final_status = 'completed' THEN 'paid'
        ELSE payment_status
      END,
      updated_at = now()
  WHERE id = p_order_id;

  IF v_final_status = 'completed' AND NOT v_skip_completion_side_effects THEN
    PERFORM public.finalize_paid_order(p_order_id, p_created_by);
  END IF;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'status', v_final_status,
    'idempotent', v_skip_completion_side_effects
  );
END;
$$;

COMMENT ON FUNCTION public.create_payment(
  bigint, bigint, bigint, text, numeric, uuid, text, text
) IS 'Atomic POS payment creation for cash and VietQR.';

REVOKE ALL ON FUNCTION public.create_payment(
  bigint, bigint, bigint, text, numeric, uuid, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_payment(
  bigint, bigint, bigint, text, numeric, uuid, text, text
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_revenue_by_cashier(
  p_branch_id bigint DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  cashier_id uuid,
  cashier_name text,
  order_count bigint,
  net_revenue numeric,
  cash_revenue numeric,
  qr_revenue numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid;
  v_tenant bigint;
  v_days integer;
  v_start_utc timestamptz;
  v_end_utc timestamptz;
  v_has_tenant_scope boolean;
  v_branch_ids bigint[];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant
  FROM public.profiles pr
  WHERE pr.id = v_uid;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'start/end required' USING ERRCODE = '22023';
  END IF;
  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'start > end' USING ERRCODE = '22023';
  END IF;

  v_days := (p_end_date - p_start_date) + 1;
  IF v_days > 90 THEN
    RAISE EXCEPTION 'range > 90 days' USING ERRCODE = '22023';
  END IF;

  SELECT fs.has_tenant_scope, fs.branch_ids
  INTO v_has_tenant_scope, v_branch_ids
  FROM private.finance_scope(v_uid, 'finance:view') fs;

  IF p_branch_id IS NULL THEN
    IF NOT (v_has_tenant_scope OR cardinality(v_branch_ids) > 0) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NOT (v_has_tenant_scope OR p_branch_id = ANY(v_branch_ids)) THEN
    RAISE EXCEPTION 'permission denied: finance:view required'
      USING ERRCODE = '42501';
  END IF;

  v_start_utc := p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_end_utc := (p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';

  RETURN QUERY
  WITH scoped_payments AS MATERIALIZED (
    SELECT
      p.id AS payment_id,
      p.method,
      p.amount,
      o.id AS order_id,
      o.subtotal,
      o.discount_amount,
      COALESCE(ps.opened_by, p.created_by) AS cashier_id
    FROM public.payments p
    JOIN public.orders o
      ON o.id = p.order_id
     AND o.tenant_id = p.tenant_id
     AND o.branch_id = p.branch_id
    LEFT JOIN public.pos_sessions ps
      ON ps.id = o.pos_session_id
     AND ps.tenant_id = o.tenant_id
     AND ps.branch_id = o.branch_id
    WHERE p.tenant_id = v_tenant
      AND p.status = 'completed'
      AND p.paid_at >= v_start_utc
      AND p.paid_at < v_end_utc
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
      AND (
        (p_branch_id IS NOT NULL AND o.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (v_has_tenant_scope OR o.branch_id = ANY(v_branch_ids))
        )
      )
  ),
  order_rows AS (
    SELECT DISTINCT ON (sp.order_id)
      sp.cashier_id,
      sp.order_id,
      sp.subtotal,
      sp.discount_amount
    FROM scoped_payments sp
    ORDER BY sp.order_id, sp.payment_id DESC
  ),
  orders_by_cashier AS (
    SELECT
      row_data.cashier_id,
      COUNT(*)::bigint AS order_count,
      COALESCE(SUM(row_data.subtotal - row_data.discount_amount), 0)::numeric AS net_revenue
    FROM order_rows row_data
    GROUP BY row_data.cashier_id
  ),
  payments_by_cashier AS (
    SELECT
      sp.cashier_id,
      COALESCE(SUM(sp.amount) FILTER (WHERE sp.method = 'cash'), 0)::numeric AS cash_revenue,
      COALESCE(SUM(sp.amount) FILTER (WHERE sp.method = 'vietqr'), 0)::numeric AS qr_revenue
    FROM scoped_payments sp
    GROUP BY sp.cashier_id
  )
  SELECT
    totals.cashier_id,
    COALESCE(pr.full_name, '— Không xác định')::text AS cashier_name,
    totals.order_count,
    totals.net_revenue,
    COALESCE(methods.cash_revenue, 0)::numeric AS cash_revenue,
    COALESCE(methods.qr_revenue, 0)::numeric AS qr_revenue
  FROM orders_by_cashier totals
  LEFT JOIN payments_by_cashier methods
    ON methods.cashier_id = totals.cashier_id
  LEFT JOIN public.profiles pr
    ON pr.id = totals.cashier_id
  ORDER BY totals.net_revenue DESC;
END;
$$;

COMMENT ON FUNCTION public.get_revenue_by_cashier(bigint, date, date) IS
  'Cashier revenue from completed cash and VietQR payments.';

REVOKE ALL ON FUNCTION public.get_revenue_by_cashier(bigint, date, date)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_revenue_by_cashier(bigint, date, date)
  TO authenticated, service_role;
