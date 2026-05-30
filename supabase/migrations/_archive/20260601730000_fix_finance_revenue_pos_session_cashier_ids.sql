-- =============================================================
-- Fix Finance Revenue / POS session cashier IDs
--
-- Root cause:
--   get_revenue_by_cashier was written against a stale model:
--     stale payment session field    -- actual link is orders.pos_session_id
--     stale payment method field     -- actual column is payments.method
--     stale shift cashier field      -- actual shift owner is opened_by
--
-- Cash variance also grouped by pos_sessions.closed_by, which is the actor
-- who submitted close. A branch manager can close someone else's shift, so
-- variance ownership must use opened_by.
-- =============================================================

CREATE OR REPLACE FUNCTION public.get_revenue_by_cashier(
  p_branch_id  BIGINT DEFAULT NULL,
  p_start_date DATE   DEFAULT NULL,
  p_end_date   DATE   DEFAULT NULL
)
RETURNS TABLE (
  cashier_id   UUID,
  cashier_name TEXT,
  order_count  BIGINT,
  net_revenue  NUMERIC,
  cash_revenue NUMERIC,
  qr_revenue   NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid    UUID;
  v_tenant BIGINT;
  v_days   INT;
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

  IF p_branch_id IS NULL THEN
    IF NOT public.has_permission_any('finance:view') THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.has_permission(p_branch_id, 'finance:view') THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  WITH scoped_payments AS (
    SELECT
      p.id AS payment_id,
      p.method,
      p.amount,
      o.id AS order_id,
      o.subtotal,
      o.discount_amount,
      o.branch_id,
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
      AND p.paid_at IS NOT NULL
      AND (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
            BETWEEN p_start_date AND p_end_date
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
      AND (
        (p_branch_id IS NOT NULL AND o.branch_id = p_branch_id)
        OR (p_branch_id IS NULL AND public.has_permission(o.branch_id, 'finance:view'))
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
      o.cashier_id,
      COUNT(*)::BIGINT AS order_count,
      COALESCE(SUM(o.subtotal - o.discount_amount), 0)::NUMERIC AS net_revenue
    FROM order_rows o
    GROUP BY o.cashier_id
  ),
  payments_by_cashier AS (
    SELECT
      sp.cashier_id,
      COALESCE(SUM(sp.amount) FILTER (WHERE sp.method = 'cash'), 0)::NUMERIC
        AS cash_revenue,
      COALESCE(SUM(sp.amount) FILTER (WHERE sp.method IN ('vietqr', 'momo')), 0)::NUMERIC
        AS qr_revenue
    FROM scoped_payments sp
    GROUP BY sp.cashier_id
  )
  SELECT
    ob.cashier_id,
    COALESCE(pr.full_name, '— Không xác định')::TEXT AS cashier_name,
    ob.order_count,
    ob.net_revenue,
    COALESCE(pb.cash_revenue, 0)::NUMERIC AS cash_revenue,
    COALESCE(pb.qr_revenue, 0)::NUMERIC AS qr_revenue
  FROM orders_by_cashier ob
  LEFT JOIN payments_by_cashier pb ON pb.cashier_id = ob.cashier_id
  LEFT JOIN public.profiles pr ON pr.id = ob.cashier_id
  ORDER BY ob.net_revenue DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_revenue_by_cashier(BIGINT, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_by_cashier(BIGINT, DATE, DATE) TO authenticated;

COMMENT ON FUNCTION public.get_revenue_by_cashier(BIGINT, DATE, DATE) IS
  'Cashier productivity for Finance Revenue. Cashier identity comes from '
  'orders.pos_session_id -> pos_sessions.opened_by, falling back to '
  'payments.created_by for legacy orders without a session link. Uses '
  'payments.method and completed paid_at rows.';


CREATE OR REPLACE FUNCTION public.get_cash_variance_summary(
  p_branch_id  BIGINT,
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS TABLE (
  session_count       BIGINT,
  total_variance      NUMERIC,
  abs_variance_total  NUMERIC,
  short_count         BIGINT,
  short_total         NUMERIC,
  over_count          BIGINT,
  over_total          NUMERIC,
  worst_cashiers      JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid    UUID;
  v_tenant BIGINT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant
  FROM public.profiles pr WHERE pr.id = v_uid;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'start/end required' USING ERRCODE = '22023';
  END IF;
  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'start > end' USING ERRCODE = '22023';
  END IF;

  IF p_branch_id IS NOT NULL THEN
    IF NOT public.has_permission(p_branch_id, 'finance:view') THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.has_permission_any('finance:view') THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  WITH closed_in_range AS (
    SELECT
      ps.id,
      ps.opened_by AS cashier_id,
      ps.cash_difference
    FROM public.pos_sessions ps
    WHERE ps.tenant_id = v_tenant
      AND ps.status = 'closed'
      AND ps.closed_at IS NOT NULL
      AND ps.cash_difference IS NOT NULL
      AND (ps.closed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_start_date
      AND (ps.closed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date
      AND (
        (p_branch_id IS NOT NULL AND ps.branch_id = p_branch_id)
        OR (p_branch_id IS NULL AND public.has_permission(ps.branch_id, 'finance:view'))
      )
  ),
  agg AS (
    SELECT
      COUNT(*)::BIGINT AS session_count,
      COALESCE(SUM(c.cash_difference), 0) AS total_variance,
      COALESCE(SUM(ABS(c.cash_difference)), 0) AS abs_variance_total,
      COUNT(*) FILTER (WHERE c.cash_difference < 0)::BIGINT AS short_count,
      COALESCE(SUM(c.cash_difference) FILTER (WHERE c.cash_difference < 0), 0) AS short_total,
      COUNT(*) FILTER (WHERE c.cash_difference > 0)::BIGINT AS over_count,
      COALESCE(SUM(c.cash_difference) FILTER (WHERE c.cash_difference > 0), 0) AS over_total
    FROM closed_in_range c
  ),
  by_cashier AS (
    SELECT
      c.cashier_id,
      COALESCE(pr.full_name, '—') AS cashier_name,
      COUNT(*)::BIGINT AS session_count,
      SUM(c.cash_difference) AS net_variance,
      SUM(ABS(c.cash_difference)) AS abs_variance
    FROM closed_in_range c
    LEFT JOIN public.profiles pr ON pr.id = c.cashier_id
    GROUP BY c.cashier_id, pr.full_name
  ),
  worst_top3 AS (
    SELECT bc.*
    FROM by_cashier bc
    WHERE bc.abs_variance > 0
    ORDER BY bc.abs_variance DESC
    LIMIT 3
  ),
  worst_json AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'cashier_id',     w.cashier_id,
          'cashier_name',   w.cashier_name,
          'session_count',  w.session_count,
          'net_variance',   w.net_variance,
          'abs_variance',   w.abs_variance
        )
        ORDER BY w.abs_variance DESC
      ),
      '[]'::jsonb
    ) AS rows
    FROM worst_top3 w
  )
  SELECT
    agg.session_count,
    agg.total_variance,
    agg.abs_variance_total,
    agg.short_count,
    agg.short_total,
    agg.over_count,
    agg.over_total,
    worst_json.rows AS worst_cashiers
  FROM agg
  CROSS JOIN worst_json;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_cash_variance_summary(BIGINT, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cash_variance_summary(BIGINT, DATE, DATE) TO authenticated;

COMMENT ON FUNCTION public.get_cash_variance_summary(BIGINT, DATE, DATE) IS
  'Aggregate POS cash variance over closed sessions in range. Variance is '
  'owned by pos_sessions.opened_by; closed_by is only the close actor and '
  'may be a manager closing another cashier shift. NULL branch = sum across '
  'branches caller has finance:view.';
