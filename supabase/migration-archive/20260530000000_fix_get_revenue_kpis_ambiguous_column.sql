-- =============================================================
-- Fix: get_revenue_kpis column reference ambiguity
--
-- Bug: RETURNS TABLE OUT params (discount_amount, voided_amount, ...)
-- shadow column names referenced inside the function body's WITH
-- clauses. Postgres throws 42702 "column reference X is ambiguous"
-- at runtime — function returns no rows, action returns success:false,
-- UI silently shows zeros.
--
-- Bug đã ngầm fail từ trước (RPC này có từ migration 20260514010000).
-- UI cũ aggregate KPI-like values từ get_revenue_rollup nên không lộ;
-- UI redesign mới (hero KPI cards) hiển thị 0 prominent.
--
-- Fix: thêm `#variable_conflict use_column` directive ngay sau AS $$
-- để column references trong body win over PL/pgSQL OUT variables.
-- Tham khảo: https://www.postgresql.org/docs/current/plpgsql-implementation.html#PLPGSQL-VAR-SUBST
-- =============================================================

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
#variable_conflict use_column
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
