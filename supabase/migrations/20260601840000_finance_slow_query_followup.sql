-- =============================================================
-- Finance slow-query follow-up
--
-- The previous hot-path pass made POS/KDS reads cheap. The remaining slow
-- entries are Finance analytics RPCs. This migration targets two causes:
--
-- 1) Tenant-wide Finance pages filter completed payments by date without a
--    concrete branch_id, while the earlier live-revenue index leads with
--    (tenant_id, branch_id, status, paid_at).
-- 2) Hour/cashier RPCs cast paid_at to a local date in the WHERE clause,
--    forcing more work before the paid_at range predicate can prune rows.
-- =============================================================

CREATE INDEX IF NOT EXISTS idx_payments_finance_tenant_paid_at
  ON public.payments (tenant_id, status, paid_at)
  INCLUDE (branch_id, order_id, method, amount, created_by)
  WHERE paid_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_finance_live_order
  ON public.order_items (tenant_id, order_id, menu_item_id)
  INCLUDE (item_name, quantity, subtotal, vat_rate)
  WHERE status <> 'cancelled';


-- ─── get_revenue_by_hour: make date filter sargable ────────────────────
CREATE OR REPLACE FUNCTION public.get_revenue_by_hour(
  p_branch_id  BIGINT DEFAULT NULL,
  p_start_date DATE   DEFAULT NULL,
  p_end_date   DATE   DEFAULT NULL
)
RETURNS TABLE (
  dow         SMALLINT,
  hour        SMALLINT,
  order_count BIGINT,
  net_revenue NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID;
  v_tenant    BIGINT;
  v_days      INT;
  v_start_utc TIMESTAMPTZ;
  v_end_utc   TIMESTAMPTZ;
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

  v_start_utc := (p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_end_utc := ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  RETURN QUERY
  WITH paid AS MATERIALIZED (
    SELECT
      (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS paid_local,
      o.id AS order_id,
      o.subtotal,
      o.discount_amount
    FROM public.payments p
    JOIN public.orders o
      ON o.id = p.order_id
     AND o.tenant_id = p.tenant_id
     AND o.branch_id = p.branch_id
    WHERE p.tenant_id = v_tenant
      AND p.status = 'completed'
      AND p.paid_at >= v_start_utc
      AND p.paid_at < v_end_utc
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
      AND (
        (p_branch_id IS NOT NULL AND o.branch_id = p_branch_id)
        OR (p_branch_id IS NULL AND public.has_permission(o.branch_id, 'finance:view'))
      )
  )
  SELECT
    EXTRACT(DOW FROM paid.paid_local)::SMALLINT  AS dow,
    EXTRACT(HOUR FROM paid.paid_local)::SMALLINT AS hour,
    COUNT(DISTINCT paid.order_id)::BIGINT AS order_count,
    COALESCE(SUM(paid.subtotal - paid.discount_amount), 0)::NUMERIC
      AS net_revenue
  FROM paid
  GROUP BY 1, 2
  ORDER BY 1, 2;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_revenue_by_hour(BIGINT, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_by_hour(BIGINT, DATE, DATE) TO authenticated;


-- ─── get_revenue_by_cashier: make date filter sargable ────────────────
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
  v_uid       UUID;
  v_tenant    BIGINT;
  v_days      INT;
  v_start_utc TIMESTAMPTZ;
  v_end_utc   TIMESTAMPTZ;
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

  v_start_utc := (p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_end_utc := ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

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
      COALESCE(SUM(o.subtotal - o.discount_amount), 0)::NUMERIC
        AS net_revenue
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


-- ─── get_top_items: reuse paid order set before item fan-out ───────────
CREATE OR REPLACE FUNCTION public.get_top_items(
  p_branch_id    BIGINT DEFAULT NULL,
  p_period_start DATE   DEFAULT NULL,
  p_limit        INT    DEFAULT 20
)
RETURNS TABLE (
  period_start  DATE,
  period_end    DATE,
  branch_id     BIGINT,
  tenant_id     BIGINT,
  menu_item_id  BIGINT,
  item_name     TEXT,
  quantity_sold NUMERIC,
  revenue       NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid             UUID;
  v_tenant          BIGINT;
  v_effective_limit INT;
  v_period_start    DATE;
  v_period_end      DATE;
  v_start_utc       TIMESTAMPTZ;
  v_end_utc         TIMESTAMPTZ;
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

  IF p_branch_id IS NULL THEN
    IF NOT public.has_permission_any('finance:view') THEN
      RAISE EXCEPTION 'permission denied: finance:view required' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.has_permission(p_branch_id, 'finance:view') THEN
      RAISE EXCEPTION 'permission denied: finance:view required' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_effective_limit := GREATEST(1, LEAST(COALESCE(p_limit, 20), 200));
  v_period_start := COALESCE(
    p_period_start,
    date_trunc('month', (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'))::date
  );
  v_period_end := (date_trunc('month', v_period_start)::date + INTERVAL '1 month - 1 day')::date;
  v_start_utc := (v_period_start::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_end_utc := ((v_period_end + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  RETURN QUERY
  WITH paid_orders AS MATERIALIZED (
    SELECT DISTINCT
      o.id,
      o.branch_id,
      o.tenant_id
    FROM public.payments p
    JOIN public.orders o
      ON o.id = p.order_id
     AND o.tenant_id = p.tenant_id
     AND o.branch_id = p.branch_id
    WHERE p.tenant_id = v_tenant
      AND p.status = 'completed'
      AND p.paid_at >= v_start_utc
      AND p.paid_at < v_end_utc
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
      AND (
        (p_branch_id IS NOT NULL AND o.branch_id = p_branch_id)
        OR (p_branch_id IS NULL AND public.has_permission(o.branch_id, 'finance:view'))
      )
  )
  SELECT
    v_period_start AS period_start,
    v_period_end AS period_end,
    po.branch_id,
    po.tenant_id,
    oi.menu_item_id,
    MAX(oi.item_name) AS item_name,
    COALESCE(SUM(oi.quantity), 0)::NUMERIC AS quantity_sold,
    COALESCE(SUM(oi.subtotal), 0)::NUMERIC AS revenue
  FROM paid_orders po
  JOIN public.order_items oi
    ON oi.tenant_id = po.tenant_id
   AND oi.order_id = po.id
   AND oi.status <> 'cancelled'
  GROUP BY po.branch_id, po.tenant_id, oi.menu_item_id
  ORDER BY quantity_sold DESC, revenue DESC
  LIMIT v_effective_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_top_items(BIGINT, DATE, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_top_items(BIGINT, DATE, INT) TO authenticated;
