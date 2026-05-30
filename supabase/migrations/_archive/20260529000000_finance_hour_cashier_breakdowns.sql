-- =============================================================
-- Finance redesign — hour-of-day + cashier breakdown RPCs
--
-- Trang Doanh thu (consolidated /finance/revenue) cần:
--   • heatmap 7×24 (dow × hour) → get_revenue_by_hour
--   • cashier productivity bar → get_revenue_by_cashier
--
-- Decision (Architect §1, §5): KHÔNG thêm MV cho hour-of-day vì
-- cardinality × 24 explode. Query trực tiếp payments (small,
-- indexed by paid_at + order_id) cho range ≤ 90 ngày — cap ở
-- application layer.
--
-- Pattern bắt buộc theo regressions.md:
--   • REVENUE-BUCKET-BY-PAID-AT-LOCAL-TZ:
--     `(p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date` cho bucket
--     `EXTRACT(...)` cho dow/hour cùng từ TZ-shifted timestamp
--   • Filter `o.status<>'cancelled' AND o.payment_status='paid' AND
--     p.status='completed' AND p.paid_at IS NOT NULL`
--   • RLS-NOT-APPLIED-ON-MV: SECURITY DEFINER + has_permission gate
--   • SET search_path = public (regressions.md set_search_path_definer)
-- =============================================================


-- ─── 1. get_revenue_by_hour ─────────────────────────────────────
-- p_branch_id NULL = aggregate qua mọi branch user có finance:view.
-- Returns 1 row per (dow, hour) — caller tự pad 0 khi render heatmap.
DROP FUNCTION IF EXISTS public.get_revenue_by_hour(BIGINT, DATE, DATE);

CREATE OR REPLACE FUNCTION public.get_revenue_by_hour(
  p_branch_id  BIGINT DEFAULT NULL,
  p_start_date DATE   DEFAULT NULL,
  p_end_date   DATE   DEFAULT NULL
)
RETURNS TABLE (
  dow         SMALLINT,  -- 0=Sun .. 6=Sat (Postgres EXTRACT(DOW))
  hour        SMALLINT,  -- 0..23
  order_count BIGINT,
  net_revenue NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Cap range to 90 days (matches application-layer guard).
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
  WITH paid AS (
    SELECT
      (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS paid_local,
      o.subtotal,
      o.discount_amount,
      o.tenant_id,
      o.branch_id
    FROM public.payments p
    JOIN public.orders o ON o.id = p.order_id
    WHERE o.tenant_id = v_tenant
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
      AND p.status = 'completed'
      AND p.paid_at IS NOT NULL
      AND (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
            BETWEEN p_start_date AND p_end_date
      AND (p_branch_id IS NULL OR o.branch_id = p_branch_id)
  )
  SELECT
    EXTRACT(DOW FROM paid_local)::SMALLINT  AS dow,
    EXTRACT(HOUR FROM paid_local)::SMALLINT AS hour,
    COUNT(*)::BIGINT                         AS order_count,
    COALESCE(SUM(subtotal - discount_amount), 0)::NUMERIC AS net_revenue
  FROM paid
  GROUP BY 1, 2
  ORDER BY 1, 2;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_revenue_by_hour(BIGINT, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_by_hour(BIGINT, DATE, DATE) TO authenticated;


-- ─── 2. get_revenue_by_cashier ──────────────────────────────────
-- Cashier = pos_sessions.cashier_user_id. Owner muốn xem productivity
-- + variance pattern; trả full set, UI tự sort/limit.
DROP FUNCTION IF EXISTS public.get_revenue_by_cashier(BIGINT, DATE, DATE);

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
  WITH paid AS (
    SELECT
      ps.cashier_user_id AS cashier_id,
      o.subtotal,
      o.discount_amount,
      p.payment_method,
      p.amount,
      o.tenant_id,
      o.branch_id
    FROM public.payments p
    JOIN public.orders o ON o.id = p.order_id
    LEFT JOIN public.pos_sessions ps ON ps.id = p.session_id
    WHERE o.tenant_id = v_tenant
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
      AND p.status = 'completed'
      AND p.paid_at IS NOT NULL
      AND (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
            BETWEEN p_start_date AND p_end_date
      AND (p_branch_id IS NULL OR o.branch_id = p_branch_id)
  )
  SELECT
    paid.cashier_id,
    COALESCE(pr.full_name, '— Không xác định')::TEXT AS cashier_name,
    COUNT(*)::BIGINT AS order_count,
    COALESCE(SUM(paid.subtotal - paid.discount_amount), 0)::NUMERIC
      AS net_revenue,
    COALESCE(SUM(paid.amount) FILTER (WHERE paid.payment_method = 'cash'), 0)::NUMERIC
      AS cash_revenue,
    COALESCE(
      SUM(paid.amount) FILTER (WHERE paid.payment_method IN ('vietqr', 'momo')),
      0
    )::NUMERIC AS qr_revenue
  FROM paid
  LEFT JOIN public.profiles pr ON pr.id = paid.cashier_id
  GROUP BY paid.cashier_id, pr.full_name
  ORDER BY net_revenue DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_revenue_by_cashier(BIGINT, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_by_cashier(BIGINT, DATE, DATE) TO authenticated;
