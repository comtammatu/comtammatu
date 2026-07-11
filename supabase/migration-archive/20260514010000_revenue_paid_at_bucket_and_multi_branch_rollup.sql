-- =============================================================
-- Sprint 1 — Finance Revenue rebuild
--
-- Three goals in this single migration:
--
--  (A) `mv_daily_revenue` v3 — bucket by `paid_at AT TZ 'Asia/Ho_Chi_Minh'`
--      instead of `created_at`. Also expose more columns the new
--      `/finance/revenue` surface needs (subtotal, discount, dine_in /
--      takeaway split, total_covers). Fixes the cross-day cut-off
--      tradeoff documented in 20260512000000.
--
--      Bucket source: `payments.paid_at` for a single completed payment
--      per order (partial unique idx on payments(order_id) WHERE
--      status<>'failed' guarantees ≤1 row, status='completed' filter
--      narrows to the single non-failed non-refunded one). Refunds
--      (status='refunded') are intentionally excluded from gross
--      revenue MV — refund metric is computed separately in the KPIs
--      RPC so it stays a tracked but distinct number.
--
--  (B) `get_revenue_rollup` v2 — accept NULL branch (= aggregate across
--      every branch the caller has finance:view on). Adds `branch_id`
--      to RETURNS TABLE so the UI can show per-branch breakdown when
--      user picks "all branches". Single-branch behavior unchanged
--      modulo the new column.
--
--  (C) Two new wrappers: `get_revenue_kpis` (single-row hero KPIs incl.
--      VAT 8% / 10% split via JOIN order_items + voided/refund amount
--      via JOIN payments status='refunded') and `get_orders_for_day`
--      (drill-down: order list sorted by paid_at hour for one day,
--      one branch).
--
-- Constraints respected:
--   - RLS-NOT-APPLIED-ON-MV: REVOKE direct SELECT on MV, expose only
--     via SECURITY DEFINER wrappers with explicit tenant + permission
--     check. has_permission() is called per row when p_branch_id IS
--     NULL so users with finance:view on 2/5 branches see exactly
--     those 2 branches, not 5.
--   - PERIOD-FILTER-USES-LOCAL-TZ: every date bucket and every
--     `get_orders_for_day` filter uses `AT TIME ZONE
--     'Asia/Ho_Chi_Minh'`.
--   - MV-GROUP-BY-MUST-MATCH-UNIQUE-INDEX: unique idx
--     (date, branch_id, tenant_id) matches the MV GROUP BY exactly so
--     CONCURRENTLY refresh never throws 23505.
--   - POS-CLOSE-SHIFT-PAID-FILTER: `payment_status='paid' AND
--     status<>'cancelled'` carried through to every wrapper.
--   - VAT-PER-LINE-NOT-PER-INVOICE: VAT 8% / 10% split aggregated
--     from `order_items.vat_rate` snapshot, NOT divided from
--     `orders.tax_amount`.
-- =============================================================

-- ─── 1. mv_refresh_log (staleness banner source) ────────────────────────
CREATE TABLE IF NOT EXISTS public.mv_refresh_log (
  view_name    TEXT PRIMARY KEY,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE public.mv_refresh_log FROM PUBLIC;
GRANT SELECT ON TABLE public.mv_refresh_log TO authenticated;

COMMENT ON TABLE public.mv_refresh_log IS
  'Last successful refresh time per finance MV. Updated by '
  'refresh_finance_views(). Read by /finance/revenue staleness banner.';


-- ─── 2. Drop wrappers that depend on mv_daily_revenue ───────────────────
DROP FUNCTION IF EXISTS public.get_daily_revenue(BIGINT, DATE, DATE);
DROP FUNCTION IF EXISTS public.get_revenue_rollup(BIGINT, DATE, DATE, TEXT);


-- ─── 3. Drop + recreate mv_daily_revenue v3 ─────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS public.mv_daily_revenue;

CREATE MATERIALIZED VIEW public.mv_daily_revenue AS
SELECT
  (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS date,
  o.branch_id,
  o.tenant_id,
  COUNT(*) AS order_count,
  COALESCE(SUM(o.total_amount), 0)     AS total_revenue,
  COALESCE(SUM(o.tax_amount), 0)       AS total_tax,
  COALESCE(SUM(o.subtotal), 0)         AS subtotal_revenue,
  COALESCE(SUM(o.discount_amount), 0)  AS discount_amount,
  COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_method = 'cash'), 0)
    AS cash_revenue,
  COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_method = 'vietqr'), 0)
    AS vietqr_revenue,
  COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_method = 'momo'), 0)
    AS momo_revenue,
  COALESCE(SUM(o.total_amount) FILTER (WHERE o.order_type = 'dine_in'), 0)
    AS dine_in_revenue,
  COALESCE(SUM(o.total_amount) FILTER (WHERE o.order_type = 'takeaway'), 0)
    AS takeaway_revenue,
  COALESCE(SUM(o.customer_count), 0)::BIGINT AS total_covers
FROM public.orders o
JOIN public.payments p
  ON p.order_id  = o.id
 AND p.tenant_id = o.tenant_id
 AND p.status    = 'completed'
 AND p.paid_at IS NOT NULL
WHERE o.status <> 'cancelled'
  AND o.payment_status = 'paid'
GROUP BY 1, o.branch_id, o.tenant_id;

CREATE UNIQUE INDEX idx_mv_daily_revenue_pk
  ON public.mv_daily_revenue(date, branch_id, tenant_id);

CREATE INDEX idx_mv_daily_revenue_branch_date
  ON public.mv_daily_revenue(branch_id, date);

REVOKE SELECT ON public.mv_daily_revenue FROM anon;
REVOKE SELECT ON public.mv_daily_revenue FROM authenticated;
REVOKE SELECT ON public.mv_daily_revenue FROM PUBLIC;

REFRESH MATERIALIZED VIEW public.mv_daily_revenue;

INSERT INTO public.mv_refresh_log(view_name, refreshed_at)
VALUES ('mv_daily_revenue', now())
ON CONFLICT (view_name) DO UPDATE SET refreshed_at = EXCLUDED.refreshed_at;


-- ─── 4. get_daily_revenue restore (signature unchanged) ─────────────────
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

  IF NOT public.has_permission(p_branch_id, 'finance:view') THEN
    RAISE EXCEPTION 'permission denied: finance:view required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT m.date, m.branch_id, m.tenant_id,
           m.order_count, m.total_revenue, m.total_tax,
           m.cash_revenue, m.vietqr_revenue, m.momo_revenue
    FROM public.mv_daily_revenue m
    WHERE m.tenant_id = v_tenant
      AND m.branch_id = p_branch_id
      AND m.date >= p_start_date
      AND m.date <= p_end_date
    ORDER BY m.date;
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public.get_daily_revenue(BIGINT, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.get_daily_revenue(BIGINT, DATE, DATE) TO authenticated;


-- ─── 5. get_revenue_rollup v2 (NULL branch = all-accessible) ────────────
-- Rows when p_branch_id IS NOT NULL: one per period (branch_id =
-- the requested branch).
-- Rows when p_branch_id IS NULL: one per (period, branch_id) for every
-- branch the caller has finance:view on. Caller can sum to get the
-- tenant total or display the breakdown directly.
CREATE FUNCTION public.get_revenue_rollup(
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
  v_uid    UUID;
  v_tenant BIGINT;
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
  FROM public.profiles pr WHERE pr.id = v_uid;

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

  RETURN QUERY
  WITH bucketed AS (
    SELECT
      CASE p_granularity
        WHEN 'day'   THEN m.date
        WHEN 'week'  THEN date_trunc('week',  m.date)::date
        WHEN 'month' THEN date_trunc('month', m.date)::date
      END AS p_start,
      CASE p_granularity
        WHEN 'day'   THEN m.date
        WHEN 'week'  THEN (date_trunc('week',  m.date) + INTERVAL '6 days')::date
        WHEN 'month' THEN (date_trunc('month', m.date) + INTERVAL '1 month - 1 day')::date
      END AS p_end,
      m.branch_id,
      m.order_count,
      m.total_revenue,
      m.total_tax,
      m.subtotal_revenue,
      m.discount_amount,
      m.cash_revenue,
      m.vietqr_revenue,
      m.momo_revenue,
      m.dine_in_revenue,
      m.takeaway_revenue,
      m.total_covers
    FROM public.mv_daily_revenue m
    WHERE m.tenant_id = v_tenant
      AND m.date >= p_start_date
      AND m.date <= p_end_date
      AND (
        (p_branch_id IS NOT NULL AND m.branch_id = p_branch_id)
        OR (p_branch_id IS NULL AND public.has_permission(m.branch_id, 'finance:view'))
      )
  )
  SELECT
    b.p_start AS period_start,
    b.p_end   AS period_end,
    CASE p_granularity
      WHEN 'day'   THEN to_char(b.p_start, 'DD/MM/YYYY')
      WHEN 'week'  THEN
        'Tuần ' || to_char(b.p_start, 'IW') || ' ('
          || to_char(b.p_start, 'DD/MM') || '–'
          || to_char(b.p_end,   'DD/MM/YYYY') || ')'
      WHEN 'month' THEN 'Tháng ' || to_char(b.p_start, 'MM/YYYY')
    END AS period_label,
    b.branch_id,
    COALESCE(SUM(b.order_count), 0)::BIGINT     AS order_count,
    COALESCE(SUM(b.total_revenue), 0)           AS total_revenue,
    COALESCE(SUM(b.total_tax), 0)               AS total_tax,
    COALESCE(SUM(b.subtotal_revenue), 0)        AS subtotal_revenue,
    COALESCE(SUM(b.discount_amount), 0)         AS discount_amount,
    COALESCE(SUM(b.cash_revenue), 0)            AS cash_revenue,
    COALESCE(SUM(b.vietqr_revenue), 0)          AS vietqr_revenue,
    COALESCE(SUM(b.momo_revenue), 0)            AS momo_revenue,
    COALESCE(SUM(b.dine_in_revenue), 0)         AS dine_in_revenue,
    COALESCE(SUM(b.takeaway_revenue), 0)        AS takeaway_revenue,
    COALESCE(SUM(b.total_covers), 0)::BIGINT    AS total_covers
  FROM bucketed b
  GROUP BY b.p_start, b.p_end, b.branch_id
  ORDER BY b.p_start, b.branch_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public.get_revenue_rollup(BIGINT, DATE, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.get_revenue_rollup(BIGINT, DATE, DATE, TEXT) TO authenticated;

COMMENT ON FUNCTION
  public.get_revenue_rollup(BIGINT, DATE, DATE, TEXT) IS
  'Aggregate mv_daily_revenue (paid_at-bucketed) into day/week/month '
  'periods × branch. p_branch_id NULL => all branches caller has '
  'finance:view on. SECURITY DEFINER, RLS-MV-safe.';


-- ─── 6. get_revenue_kpis (single-row hero metrics) ──────────────────────
-- Returns 1 row with all KPI hero numbers + breakdowns for a given
-- (branch_or_all × date range). Drives the 5 hero cards + payment mix
-- + dine-in/takeaway + VAT 8/10 split + voided amount on
-- /finance/revenue.
CREATE FUNCTION public.get_revenue_kpis(
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
  WITH paid_orders AS (
    SELECT o.id, o.branch_id, o.total_amount
    FROM public.orders o
    JOIN public.payments p
      ON p.order_id  = o.id
     AND p.tenant_id = o.tenant_id
     AND p.status    = 'completed'
     AND p.paid_at IS NOT NULL
    WHERE o.tenant_id = v_tenant
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
      AND (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_start_date
      AND (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date
      AND (
        (p_branch_id IS NOT NULL AND o.branch_id = p_branch_id)
        OR (p_branch_id IS NULL AND public.has_permission(o.branch_id, 'finance:view'))
      )
  ),
  mv_agg AS (
    SELECT
      COALESCE(SUM(m.total_revenue), 0)      AS net_revenue,
      COALESCE(SUM(m.subtotal_revenue), 0)   AS subtotal_revenue,
      COALESCE(SUM(m.discount_amount), 0)    AS discount_amount,
      COALESCE(SUM(m.total_tax), 0)          AS total_tax,
      COALESCE(SUM(m.order_count), 0)::BIGINT AS order_count,
      COALESCE(SUM(m.total_covers), 0)::BIGINT AS total_covers,
      COALESCE(SUM(m.cash_revenue), 0)       AS cash_revenue,
      COALESCE(SUM(m.vietqr_revenue), 0)     AS vietqr_revenue,
      COALESCE(SUM(m.momo_revenue), 0)       AS momo_revenue,
      COALESCE(SUM(m.dine_in_revenue), 0)    AS dine_in_revenue,
      COALESCE(SUM(m.takeaway_revenue), 0)   AS takeaway_revenue
    FROM public.mv_daily_revenue m
    WHERE m.tenant_id = v_tenant
      AND m.date >= p_start_date
      AND m.date <= p_end_date
      AND (
        (p_branch_id IS NOT NULL AND m.branch_id = p_branch_id)
        OR (p_branch_id IS NULL AND public.has_permission(m.branch_id, 'finance:view'))
      )
  ),
  vat_split AS (
    -- VAT-PER-LINE-NOT-PER-INVOICE: aggregate from order_items.vat_rate
    -- snapshot. Allocate order-level discount proportionally so the
    -- VAT base mirrors what createTaxInvoice computes.
    SELECT
      COALESCE(SUM(
        CASE WHEN ROUND(oi.vat_rate::numeric, 2) = 8.00
          THEN (oi.subtotal * scale) - ((oi.subtotal * scale) / (1 + oi.vat_rate / 100))
          ELSE 0
        END
      ), 0) AS vat_8_amount,
      COALESCE(SUM(
        CASE WHEN ROUND(oi.vat_rate::numeric, 2) = 10.00
          THEN (oi.subtotal * scale) - ((oi.subtotal * scale) / (1 + oi.vat_rate / 100))
          ELSE 0
        END
      ), 0) AS vat_10_amount
    FROM (
      SELECT
        po.id AS order_id,
        CASE WHEN SUM(oi2.subtotal) > 0
          THEN po.total_amount / SUM(oi2.subtotal)
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
      COALESCE(SUM(p.amount), 0)           AS voided_amount,
      COUNT(DISTINCT p.order_id)::BIGINT   AS voided_count
    FROM public.payments p
    JOIN public.orders o
      ON o.id = p.order_id
     AND o.tenant_id = p.tenant_id
    WHERE p.tenant_id = v_tenant
      AND p.status = 'refunded'
      AND p.paid_at IS NOT NULL
      AND (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_start_date
      AND (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date
      AND (
        (p_branch_id IS NOT NULL AND o.branch_id = p_branch_id)
        OR (p_branch_id IS NULL AND public.has_permission(o.branch_id, 'finance:view'))
      )
  ),
  freshness AS (
    SELECT refreshed_at
    FROM public.mv_refresh_log
    WHERE view_name = 'mv_daily_revenue'
  )
  SELECT
    mv_agg.net_revenue,
    mv_agg.subtotal_revenue,
    mv_agg.discount_amount,
    mv_agg.total_tax,
    vat_split.vat_8_amount,
    vat_split.vat_10_amount,
    mv_agg.order_count,
    mv_agg.total_covers,
    mv_agg.cash_revenue,
    mv_agg.vietqr_revenue,
    mv_agg.momo_revenue,
    mv_agg.dine_in_revenue,
    mv_agg.takeaway_revenue,
    refunds.voided_amount,
    refunds.voided_count,
    COALESCE(freshness.refreshed_at, now())
  FROM mv_agg
  CROSS JOIN vat_split
  CROSS JOIN refunds
  LEFT JOIN freshness ON TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public.get_revenue_kpis(BIGINT, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.get_revenue_kpis(BIGINT, DATE, DATE) TO authenticated;

COMMENT ON FUNCTION
  public.get_revenue_kpis(BIGINT, DATE, DATE) IS
  'Single-row KPI bundle for /finance/revenue: net revenue, covers, '
  'VAT 8/10 split, voided/refunded, payment mix, dine-in/takeaway. '
  'p_branch_id NULL = aggregate over branches caller has finance:view.';


-- ─── 7. get_orders_for_day (drill: order list for a single day) ─────────
-- Returns order rows with paid_at + items summary + invoice status for
-- the chosen (branch, date). Caller passes branch_id and date.
CREATE FUNCTION public.get_orders_for_day(
  p_branch_id BIGINT,
  p_date      DATE
)
RETURNS TABLE (
  order_id        BIGINT,
  order_number    TEXT,
  branch_id       BIGINT,
  paid_at         TIMESTAMPTZ,
  paid_hour       INT,
  order_type      TEXT,
  customer_count  INT,
  subtotal        NUMERIC,
  discount_amount NUMERIC,
  tax_amount      NUMERIC,
  total_amount    NUMERIC,
  payment_method  TEXT,
  item_count      BIGINT,
  invoice_status  TEXT,
  invoice_number  TEXT
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
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_id required for drill-down'
      USING ERRCODE = '22023';
  END IF;

  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant
  FROM public.profiles pr WHERE pr.id = v_uid;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'finance:view') THEN
    RAISE EXCEPTION 'permission denied: finance:view required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT
      o.id AS order_id,
      o.order_number,
      o.branch_id,
      p.paid_at,
      EXTRACT(HOUR FROM (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::INT
        AS paid_hour,
      o.order_type,
      o.customer_count,
      o.subtotal,
      o.discount_amount,
      o.tax_amount,
      o.total_amount,
      o.payment_method,
      (SELECT COUNT(*) FROM public.order_items oi
        WHERE oi.order_id = o.id AND oi.status <> 'cancelled')::BIGINT
        AS item_count,
      ti.status AS invoice_status,
      ti.invoice_number
    FROM public.orders o
    JOIN public.payments p
      ON p.order_id  = o.id
     AND p.tenant_id = o.tenant_id
     AND p.status    = 'completed'
     AND p.paid_at IS NOT NULL
    LEFT JOIN public.tax_invoices ti
      ON ti.order_id  = o.id
     AND ti.tenant_id = o.tenant_id
     AND ti.status NOT IN ('cancelled', 'replaced')
    WHERE o.tenant_id = v_tenant
      AND o.branch_id = p_branch_id
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
      AND (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = p_date
    ORDER BY p.paid_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public.get_orders_for_day(BIGINT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.get_orders_for_day(BIGINT, DATE) TO authenticated;

COMMENT ON FUNCTION
  public.get_orders_for_day(BIGINT, DATE) IS
  'Drill-down: paid orders sorted by paid_at hour for one (branch, '
  'date). Joins tax_invoices for HĐĐT status badge. SECURITY DEFINER, '
  'finance:view on the requested branch required.';


-- ─── 8. refresh_finance_views() — log to mv_refresh_log ─────────────────
CREATE OR REPLACE FUNCTION public.refresh_finance_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_daily_revenue;
  INSERT INTO public.mv_refresh_log(view_name, refreshed_at)
    VALUES ('mv_daily_revenue', now())
    ON CONFLICT (view_name) DO UPDATE SET refreshed_at = EXCLUDED.refreshed_at;

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_top_items;
  INSERT INTO public.mv_refresh_log(view_name, refreshed_at)
    VALUES ('mv_top_items', now())
    ON CONFLICT (view_name) DO UPDATE SET refreshed_at = EXCLUDED.refreshed_at;

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_food_cost;
  INSERT INTO public.mv_refresh_log(view_name, refreshed_at)
    VALUES ('mv_food_cost', now())
    ON CONFLICT (view_name) DO UPDATE SET refreshed_at = EXCLUDED.refreshed_at;
END;
$$;


-- ─── 9. Reconcile gate (in-migration assertion) ─────────────────────────
-- Hard guarantee that channel sum = total_revenue inside the rebuilt
-- MV. If this assertion ever fires after a future schema change,
-- migration aborts and the bug is caught before reaching prod.
DO $reconcile$
DECLARE
  bad_rows BIGINT;
BEGIN
  SELECT COUNT(*) INTO bad_rows
  FROM public.mv_daily_revenue
  WHERE ABS(
    (cash_revenue + vietqr_revenue + momo_revenue) - total_revenue
  ) > 1;

  IF bad_rows > 0 THEN
    RAISE EXCEPTION
      'mv_daily_revenue reconcile failed: % row(s) where cash+vietqr+momo <> total_revenue (>1₫ off)',
      bad_rows;
  END IF;
END
$reconcile$;
