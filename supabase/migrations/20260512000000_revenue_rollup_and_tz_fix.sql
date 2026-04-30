-- =============================================================
-- Revenue rollup + mv_daily_revenue TZ/paid-filter fix
--
-- Hai mục tiêu trong cùng 1 migration (owner approved A+B song song
-- 2026-04-30):
--
-- (B) Fix `mv_daily_revenue` 3 bug đã phát hiện khi review:
--   1. Bucket theo `created_at::date` UTC → đơn 00:30 VN (17:30 UTC ngày
--      trước) lệch sang ngày trước. FIX:
--      `(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`.
--   2. Filter chỉ `status NOT IN ('cancelled')` — đếm cả đơn unpaid
--      carry-forward. FIX: thêm `payment_status = 'paid'`.
--      Reference: POS-CLOSE-SHIFT-PAID-FILTER-AND-VARIANCE-GATE.
--   3. (Tradeoff documented) Bucket vẫn theo `created_at` không phải
--      `paid_at` — đơn quán cơm tấm thường tạo + paid trong cùng ngày
--      VN; JOIN payments để dùng paid_at sẽ phức tạp hoá MV. Filter
--      `payment_status='paid'` đã đảm bảo chỉ count đơn đã thực sự thu
--      tiền. Nếu sau pilot phát hiện báo cáo lệch ngày do đơn paid
--      hôm sau, sẽ bổ sung JOIN payments.
--
-- (A) Thêm RPC `get_revenue_rollup(branch, start, end, granularity)` để
--     UI có thể chuyển giữa Daily / Weekly / Monthly mà không cần thêm
--     MV. Aggregate trên top của mv_daily_revenue (max 365 daily rows
--     → CPU minimal, không tăng refresh cost).
--
-- Schema mv_daily_revenue giữ nguyên columns → `get_daily_revenue` cũ
-- vẫn tương thích. Drop+recreate vì không thể CREATE OR REPLACE
-- MATERIALIZED VIEW.
-- =============================================================

-- ─── 1. Drop wrapper RPC trước khi drop MV (function depend) ────────────
DROP FUNCTION IF EXISTS public.get_daily_revenue(BIGINT, DATE, DATE);

-- ─── 2. Drop + recreate MV với fix TZ + paid filter ─────────────────────
DROP MATERIALIZED VIEW IF EXISTS public.mv_daily_revenue;

CREATE MATERIALIZED VIEW public.mv_daily_revenue AS
SELECT
  (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS date,
  o.branch_id,
  o.tenant_id,
  COUNT(*) AS order_count,
  COALESCE(SUM(o.total_amount), 0) AS total_revenue,
  COALESCE(SUM(o.tax_amount), 0) AS total_tax,
  COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_method = 'cash'), 0)
    AS cash_revenue,
  COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_method = 'vietqr'), 0)
    AS vietqr_revenue,
  COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_method = 'momo'), 0)
    AS momo_revenue
FROM public.orders o
WHERE o.status <> 'cancelled'
  AND o.payment_status = 'paid'
GROUP BY 1, o.branch_id, o.tenant_id;

CREATE UNIQUE INDEX idx_mv_daily_revenue_pk
  ON public.mv_daily_revenue(date, branch_id, tenant_id);

-- Index hỗ trợ filter theo branch + date range trong wrapper RPC.
CREATE INDEX idx_mv_daily_revenue_branch_date
  ON public.mv_daily_revenue(branch_id, date);

-- RLS không apply lên MV → revoke direct SELECT, đi qua wrapper
-- SECURITY DEFINER (pattern từ secure_finance_mvs).
REVOKE SELECT ON public.mv_daily_revenue FROM anon;
REVOKE SELECT ON public.mv_daily_revenue FROM authenticated;
REVOKE SELECT ON public.mv_daily_revenue FROM PUBLIC;

-- Lần đầu phải refresh non-concurrent (không có data nào). Sau đó
-- refresh_finance_views() chạy CONCURRENTLY bình thường.
REFRESH MATERIALIZED VIEW public.mv_daily_revenue;


-- ─── 3. Restore get_daily_revenue wrapper (giữ signature cũ) ────────────
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
  FROM public.profiles pr
  WHERE pr.id = v_uid;

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

REVOKE EXECUTE ON FUNCTION public.get_daily_revenue(BIGINT, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_daily_revenue(BIGINT, DATE, DATE) TO authenticated;


-- ─── 4. New RPC: get_revenue_rollup ─────────────────────────────────────
-- Aggregate mv_daily_revenue thành Daily / Weekly / Monthly tuỳ
-- granularity. Trả period_start + period_end + label (Vietnamese) +
-- aggregate columns y hệt get_daily_revenue.
--
-- Granularity:
--   - 'day':   period_start = period_end = date; label = "DD/MM/YYYY"
--   - 'week':  ISO week, period_start = Monday, period_end = Sunday;
--              label = "Tuần W (DD/MM–DD/MM/YYYY)"
--   - 'month': period_start = ngày 1, period_end = ngày cuối tháng;
--              label = "Tháng M/YYYY"

CREATE OR REPLACE FUNCTION public.get_revenue_rollup(
  p_branch_id   BIGINT,
  p_start_date  DATE,
  p_end_date    DATE,
  p_granularity TEXT
)
RETURNS TABLE (
  period_start    DATE,
  period_end      DATE,
  period_label    TEXT,
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

  IF NOT public.has_permission(p_branch_id, 'finance:view') THEN
    RAISE EXCEPTION 'permission denied: finance:view required'
      USING ERRCODE = '42501';
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
      m.order_count, m.total_revenue, m.total_tax,
      m.cash_revenue, m.vietqr_revenue, m.momo_revenue
    FROM public.mv_daily_revenue m
    WHERE m.tenant_id = v_tenant
      AND m.branch_id = p_branch_id
      AND m.date >= p_start_date
      AND m.date <= p_end_date
  )
  SELECT
    p_start AS period_start,
    p_end   AS period_end,
    CASE p_granularity
      WHEN 'day' THEN to_char(p_start, 'DD/MM/YYYY')
      WHEN 'week' THEN
        'Tuần ' || to_char(p_start, 'IW') || ' ('
          || to_char(p_start, 'DD/MM') || '–'
          || to_char(p_end,   'DD/MM/YYYY') || ')'
      WHEN 'month' THEN 'Tháng ' || to_char(p_start, 'MM/YYYY')
    END AS period_label,
    COALESCE(SUM(b.order_count), 0)::BIGINT AS order_count,
    COALESCE(SUM(b.total_revenue), 0)       AS total_revenue,
    COALESCE(SUM(b.total_tax), 0)           AS total_tax,
    COALESCE(SUM(b.cash_revenue), 0)        AS cash_revenue,
    COALESCE(SUM(b.vietqr_revenue), 0)      AS vietqr_revenue,
    COALESCE(SUM(b.momo_revenue), 0)        AS momo_revenue
  FROM bucketed b
  GROUP BY p_start, p_end
  ORDER BY p_start;
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public.get_revenue_rollup(BIGINT, DATE, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.get_revenue_rollup(BIGINT, DATE, DATE, TEXT) TO authenticated;

COMMENT ON FUNCTION
  public.get_revenue_rollup(BIGINT, DATE, DATE, TEXT) IS
  'Aggregate mv_daily_revenue thành day/week/month buckets. SECURITY '
  'DEFINER, tenant + branch + finance:view check. Granularity = '
  '''day''/''week''/''month''. Week = ISO week (Monday start). '
  'Period label localized Vietnamese.';
