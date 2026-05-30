-- =============================================================
-- Finance live revenue wrappers
--
-- Revenue pages must not wait for mv_daily_revenue refresh. Keep the
-- public RPC signatures stable, but compute revenue from completed
-- payments + paid orders at request time. MVs remain useful for heavy
-- historical/food-cost jobs, not for the current live revenue surface.
--
-- Rules preserved:
--   - REVENUE-BUCKET-BY-PAID-AT-LOCAL-TZ
--   - PERIOD-FILTER-USES-LOCAL-TZ
--   - VAT-PER-LINE-NOT-PER-INVOICE
--   - RLS-NOT-APPLIED-ON-MV
-- =============================================================

CREATE INDEX IF NOT EXISTS idx_payments_live_revenue
  ON public.payments (tenant_id, branch_id, status, paid_at)
  INCLUDE (order_id, method, amount)
  WHERE paid_at IS NOT NULL;


-- ─── get_daily_revenue — live, branch-specific ─────────────────────────
CREATE OR REPLACE FUNCTION public.get_daily_revenue(
  p_branch_id  BIGINT,
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS TABLE (
  date            DATE,
  branch_id       BIGINT,
  tenant_id       BIGINT,
  order_count     BIGINT,
  total_revenue   NUMERIC,
  total_tax       NUMERIC,
  cash_revenue    NUMERIC,
  vietqr_revenue  NUMERIC,
  momo_revenue    NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID;
  v_tenant    BIGINT;
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

  IF p_branch_id IS NULL OR NOT public.has_permission(p_branch_id, 'finance:view') THEN
    RAISE EXCEPTION 'permission denied: finance:view required'
      USING ERRCODE = '42501';
  END IF;

  v_start_utc := (p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_end_utc := ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  RETURN QUERY
    SELECT
      (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS date,
      o.branch_id,
      o.tenant_id,
      COUNT(DISTINCT o.id)::BIGINT AS order_count,
      COALESCE(SUM(o.total_amount), 0) AS total_revenue,
      COALESCE(SUM(o.tax_amount), 0) AS total_tax,
      COALESCE(SUM(o.total_amount) FILTER (WHERE p.method = 'cash'), 0) AS cash_revenue,
      COALESCE(SUM(o.total_amount) FILTER (WHERE p.method = 'vietqr'), 0) AS vietqr_revenue,
      COALESCE(SUM(o.total_amount) FILTER (WHERE p.method = 'momo'), 0) AS momo_revenue
    FROM public.payments p
    JOIN public.orders o
      ON o.id = p.order_id
     AND o.tenant_id = p.tenant_id
    WHERE p.tenant_id = v_tenant
      AND p.branch_id = p_branch_id
      AND p.status = 'completed'
      AND p.paid_at >= v_start_utc
      AND p.paid_at < v_end_utc
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
    GROUP BY 1, o.branch_id, o.tenant_id
    ORDER BY 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_daily_revenue(BIGINT, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_daily_revenue(BIGINT, DATE, DATE) TO authenticated;

COMMENT ON FUNCTION public.get_daily_revenue(BIGINT, DATE, DATE) IS
  'Live paid-at revenue by day for one branch. Uses completed payments, '
  'Asia/Ho_Chi_Minh buckets, and finance:view branch permission.';


-- ─── get_revenue_rollup — live day/week/month × branch ─────────────────
CREATE OR REPLACE FUNCTION public.get_revenue_rollup(
  p_branch_id   BIGINT,
  p_start_date  DATE,
  p_end_date    DATE,
  p_granularity TEXT
)
RETURNS TABLE (
  period_start     DATE,
  period_end       DATE,
  period_label     TEXT,
  branch_id        BIGINT,
  order_count      BIGINT,
  total_revenue    NUMERIC,
  total_tax        NUMERIC,
  subtotal_revenue NUMERIC,
  discount_amount  NUMERIC,
  cash_revenue     NUMERIC,
  vietqr_revenue   NUMERIC,
  momo_revenue     NUMERIC,
  dine_in_revenue  NUMERIC,
  takeaway_revenue NUMERIC,
  total_covers     BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID;
  v_tenant    BIGINT;
  v_start_utc TIMESTAMPTZ;
  v_end_utc   TIMESTAMPTZ;
BEGIN
  IF p_granularity NOT IN ('day', 'week', 'month') THEN
    RAISE EXCEPTION 'invalid_granularity (expected day/week/month)'
      USING ERRCODE = '22023';
  END IF;

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

  v_start_utc := (p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_end_utc := ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  RETURN QUERY
  WITH live_daily AS (
    SELECT
      (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS paid_date,
      o.branch_id,
      COUNT(DISTINCT o.id)::BIGINT AS order_count,
      COALESCE(SUM(o.total_amount), 0) AS total_revenue,
      COALESCE(SUM(o.tax_amount), 0) AS total_tax,
      COALESCE(SUM(o.subtotal), 0) AS subtotal_revenue,
      COALESCE(SUM(o.discount_amount), 0) AS discount_amount,
      COALESCE(SUM(o.total_amount) FILTER (WHERE p.method = 'cash'), 0) AS cash_revenue,
      COALESCE(SUM(o.total_amount) FILTER (WHERE p.method = 'vietqr'), 0) AS vietqr_revenue,
      COALESCE(SUM(o.total_amount) FILTER (WHERE p.method = 'momo'), 0) AS momo_revenue,
      COALESCE(SUM(o.total_amount) FILTER (WHERE o.order_type = 'dine_in'), 0) AS dine_in_revenue,
      COALESCE(SUM(o.total_amount) FILTER (WHERE o.order_type = 'takeaway'), 0) AS takeaway_revenue,
      COALESCE(SUM(o.customer_count), 0)::BIGINT AS total_covers
    FROM public.payments p
    JOIN public.orders o
      ON o.id = p.order_id
     AND o.tenant_id = p.tenant_id
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
    GROUP BY 1, o.branch_id
  ),
  bucketed AS (
    SELECT
      CASE p_granularity
        WHEN 'day' THEN d.paid_date
        WHEN 'week' THEN date_trunc('week', d.paid_date)::date
        WHEN 'month' THEN date_trunc('month', d.paid_date)::date
      END AS p_start,
      CASE p_granularity
        WHEN 'day' THEN d.paid_date
        WHEN 'week' THEN (date_trunc('week', d.paid_date) + INTERVAL '6 days')::date
        WHEN 'month' THEN (date_trunc('month', d.paid_date) + INTERVAL '1 month - 1 day')::date
      END AS p_end,
      d.*
    FROM live_daily d
  )
  SELECT
    b.p_start AS period_start,
    b.p_end AS period_end,
    CASE p_granularity
      WHEN 'day' THEN to_char(b.p_start, 'DD/MM/YYYY')
      WHEN 'week' THEN
        'Tuần ' || to_char(b.p_start, 'IW') || ' ('
          || to_char(b.p_start, 'DD/MM') || '-'
          || to_char(b.p_end, 'DD/MM/YYYY') || ')'
      WHEN 'month' THEN 'Tháng ' || to_char(b.p_start, 'MM/YYYY')
    END AS period_label,
    b.branch_id,
    COALESCE(SUM(b.order_count), 0)::BIGINT AS order_count,
    COALESCE(SUM(b.total_revenue), 0) AS total_revenue,
    COALESCE(SUM(b.total_tax), 0) AS total_tax,
    COALESCE(SUM(b.subtotal_revenue), 0) AS subtotal_revenue,
    COALESCE(SUM(b.discount_amount), 0) AS discount_amount,
    COALESCE(SUM(b.cash_revenue), 0) AS cash_revenue,
    COALESCE(SUM(b.vietqr_revenue), 0) AS vietqr_revenue,
    COALESCE(SUM(b.momo_revenue), 0) AS momo_revenue,
    COALESCE(SUM(b.dine_in_revenue), 0) AS dine_in_revenue,
    COALESCE(SUM(b.takeaway_revenue), 0) AS takeaway_revenue,
    COALESCE(SUM(b.total_covers), 0)::BIGINT AS total_covers
  FROM bucketed b
  GROUP BY b.p_start, b.p_end, b.branch_id
  ORDER BY b.p_start, b.branch_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_revenue_rollup(BIGINT, DATE, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_rollup(BIGINT, DATE, DATE, TEXT) TO authenticated;

COMMENT ON FUNCTION public.get_revenue_rollup(BIGINT, DATE, DATE, TEXT) IS
  'Live paid-at revenue rollup. p_branch_id NULL returns period x branch '
  'rows for branches where caller has finance:view.';


-- ─── get_revenue_kpis — live KPI bundle ────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_revenue_kpis(
  p_branch_id  BIGINT,
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS TABLE (
  net_revenue       NUMERIC,
  subtotal_revenue  NUMERIC,
  discount_amount   NUMERIC,
  total_tax         NUMERIC,
  vat_8_amount      NUMERIC,
  vat_10_amount     NUMERIC,
  order_count       BIGINT,
  total_covers      BIGINT,
  cash_revenue      NUMERIC,
  vietqr_revenue    NUMERIC,
  momo_revenue      NUMERIC,
  dine_in_revenue   NUMERIC,
  takeaway_revenue  NUMERIC,
  voided_amount     NUMERIC,
  voided_count      BIGINT,
  refreshed_at      TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID;
  v_tenant    BIGINT;
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

  v_start_utc := (p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_end_utc := ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  RETURN QUERY
  WITH paid_orders AS (
    SELECT
      o.id,
      o.branch_id,
      o.total_amount,
      o.subtotal,
      o.discount_amount,
      o.tax_amount,
      o.customer_count,
      o.order_type,
      p.method
    FROM public.payments p
    JOIN public.orders o
      ON o.id = p.order_id
     AND o.tenant_id = p.tenant_id
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
  sales AS (
    SELECT
      COALESCE(SUM(total_amount), 0) AS net_revenue,
      COALESCE(SUM(subtotal), 0) AS subtotal_revenue,
      COALESCE(SUM(discount_amount), 0) AS discount_amount,
      COALESCE(SUM(tax_amount), 0) AS total_tax,
      COUNT(*)::BIGINT AS order_count,
      COALESCE(SUM(customer_count), 0)::BIGINT AS total_covers,
      COALESCE(SUM(total_amount) FILTER (WHERE method = 'cash'), 0) AS cash_revenue,
      COALESCE(SUM(total_amount) FILTER (WHERE method = 'vietqr'), 0) AS vietqr_revenue,
      COALESCE(SUM(total_amount) FILTER (WHERE method = 'momo'), 0) AS momo_revenue,
      COALESCE(SUM(total_amount) FILTER (WHERE order_type = 'dine_in'), 0) AS dine_in_revenue,
      COALESCE(SUM(total_amount) FILTER (WHERE order_type = 'takeaway'), 0) AS takeaway_revenue
    FROM paid_orders
  ),
  vat_split AS (
    SELECT
      COALESCE(SUM(
        CASE WHEN ROUND(oi.vat_rate::numeric, 2) = 8.00
          THEN (oi.subtotal * scaled.scale) - ((oi.subtotal * scaled.scale) / (1 + oi.vat_rate / 100))
          ELSE 0
        END
      ), 0) AS vat_8_amount,
      COALESCE(SUM(
        CASE WHEN ROUND(oi.vat_rate::numeric, 2) = 10.00
          THEN (oi.subtotal * scaled.scale) - ((oi.subtotal * scaled.scale) / (1 + oi.vat_rate / 100))
          ELSE 0
        END
      ), 0) AS vat_10_amount
    FROM (
      SELECT
        po.id AS order_id,
        CASE
          WHEN SUM(oi2.subtotal) > 0 THEN po.total_amount / SUM(oi2.subtotal)
          ELSE 1
        END AS scale
      FROM paid_orders po
      JOIN public.order_items oi2
        ON oi2.order_id = po.id
       AND oi2.status <> 'cancelled'
      GROUP BY po.id, po.total_amount
    ) scaled
    JOIN public.order_items oi
      ON oi.order_id = scaled.order_id
     AND oi.status <> 'cancelled'
  ),
  refunds AS (
    SELECT
      COALESCE(SUM(p.amount), 0) AS voided_amount,
      COUNT(DISTINCT p.order_id)::BIGINT AS voided_count
    FROM public.payments p
    JOIN public.orders o
      ON o.id = p.order_id
     AND o.tenant_id = p.tenant_id
    WHERE p.tenant_id = v_tenant
      AND p.status = 'refunded'
      AND p.paid_at >= v_start_utc
      AND p.paid_at < v_end_utc
      AND (
        (p_branch_id IS NOT NULL AND o.branch_id = p_branch_id)
        OR (p_branch_id IS NULL AND public.has_permission(o.branch_id, 'finance:view'))
      )
  )
  SELECT
    sales.net_revenue,
    sales.subtotal_revenue,
    sales.discount_amount,
    sales.total_tax,
    vat_split.vat_8_amount,
    vat_split.vat_10_amount,
    sales.order_count,
    sales.total_covers,
    sales.cash_revenue,
    sales.vietqr_revenue,
    sales.momo_revenue,
    sales.dine_in_revenue,
    sales.takeaway_revenue,
    refunds.voided_amount,
    refunds.voided_count,
    now() AS refreshed_at
  FROM sales
  CROSS JOIN vat_split
  CROSS JOIN refunds;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_revenue_kpis(BIGINT, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_kpis(BIGINT, DATE, DATE) TO authenticated;

COMMENT ON FUNCTION public.get_revenue_kpis(BIGINT, DATE, DATE) IS
  'Live KPI bundle for Finance revenue. refreshed_at is request time, not '
  'MV refresh time.';


-- ─── get_top_items — live paid-item ranking ────────────────────────────
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
  v_period_start := COALESCE(p_period_start, date_trunc('month', (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'))::date);
  v_period_end := (date_trunc('month', v_period_start)::date + INTERVAL '1 month - 1 day')::date;
  v_start_utc := (v_period_start::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_end_utc := ((v_period_end + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  RETURN QUERY
    SELECT
      v_period_start AS period_start,
      v_period_end AS period_end,
      o.branch_id,
      o.tenant_id,
      oi.menu_item_id,
      MAX(oi.item_name) AS item_name,
      COALESCE(SUM(oi.quantity), 0)::NUMERIC AS quantity_sold,
      COALESCE(SUM(oi.subtotal), 0) AS revenue
    FROM public.payments p
    JOIN public.orders o
      ON o.id = p.order_id
     AND o.tenant_id = p.tenant_id
    JOIN public.order_items oi
      ON oi.order_id = o.id
     AND oi.tenant_id = o.tenant_id
     AND oi.status <> 'cancelled'
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
    GROUP BY o.branch_id, o.tenant_id, oi.menu_item_id
    ORDER BY quantity_sold DESC, revenue DESC
    LIMIT v_effective_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_top_items(BIGINT, DATE, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_top_items(BIGINT, DATE, INT) TO authenticated;

COMMENT ON FUNCTION public.get_top_items(BIGINT, DATE, INT) IS
  'Live paid-at top items. p_branch_id NULL still checks finance:view per '
  'returned branch row.';


-- ─── get_food_cost — keep MV, fix NULL-branch row ACL ──────────────────
CREATE OR REPLACE FUNCTION public.get_food_cost(
  p_branch_id  BIGINT DEFAULT NULL,
  p_start_date DATE   DEFAULT NULL,
  p_end_date   DATE   DEFAULT NULL
)
RETURNS TABLE (
  period_start    DATE,
  period_end      DATE,
  branch_id       BIGINT,
  tenant_id       BIGINT,
  menu_item_id    BIGINT,
  item_name       TEXT,
  quantity_sold   NUMERIC,
  revenue         NUMERIC,
  ingredient_cost NUMERIC,
  food_cost_pct   NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID;
  v_tenant BIGINT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant FROM public.profiles pr WHERE pr.id = v_uid;
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

  RETURN QUERY
    SELECT
      m.period_start,
      m.period_end,
      m.branch_id,
      m.tenant_id,
      m.menu_item_id,
      m.item_name,
      m.quantity_sold::NUMERIC,
      m.revenue,
      m.ingredient_cost,
      m.food_cost_pct
    FROM public.mv_food_cost m
    WHERE m.tenant_id = v_tenant
      AND (p_branch_id IS NOT NULL OR public.has_permission(m.branch_id, 'finance:view'))
      AND (p_branch_id IS NULL OR m.branch_id = p_branch_id)
      AND (p_start_date IS NULL OR m.period_start >= p_start_date)
      AND (p_end_date IS NULL OR m.period_start <= p_end_date)
    ORDER BY m.food_cost_pct DESC NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_food_cost(BIGINT, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_food_cost(BIGINT, DATE, DATE) TO authenticated;
