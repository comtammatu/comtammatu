-- =============================================================
-- Finance scope and KDS slow-query follow-up
--
-- Evidence after pg_stat_statements reset:
-- - Finance RPCs were spending 300-490ms per call on live dashboard paths.
--   The tenant-wide branch case called has_permission(branch_id, ...)
--   inside row predicates, turning each aggregate scan into many permission
--   probes.
-- - KDS PostgREST reads still appeared as slow even though tenant-led indexes
--   exist. Add a branch-led created_at index that matches the explicit
--   PostgREST predicate/order before RLS predicates are considered.
--
-- Production policy: owner applies this migration manually after merge.
-- =============================================================

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.finance_scope(
  p_uid UUID,
  p_key TEXT DEFAULT 'finance:view'
)
RETURNS TABLE (
  has_tenant_scope BOOLEAN,
  branch_ids BIGINT[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH owner_scope AS (
    SELECT 1
    FROM public.profiles pr
    JOIN public.positions po ON po.id = pr.position_id
    WHERE pr.id = p_uid
      AND po.code = 'owner'
  ),
  active_permissions AS (
    SELECT sp.branch_id
    FROM public.staff_permissions sp
    WHERE sp.user_id = p_uid
      AND sp.permission_key = p_key
      AND sp.valid_from <= now()
      AND (sp.valid_until IS NULL OR sp.valid_until > now())
  )
  SELECT
    (
      EXISTS (SELECT 1 FROM owner_scope)
      OR EXISTS (
        SELECT 1
        FROM active_permissions ap
        WHERE ap.branch_id IS NULL
      )
    ) AS has_tenant_scope,
    COALESCE(
      (
        SELECT array_agg(DISTINCT ap.branch_id)
        FROM active_permissions ap
        WHERE ap.branch_id IS NOT NULL
      ),
      ARRAY[]::BIGINT[]
    ) AS branch_ids;
$$;

REVOKE ALL ON FUNCTION private.finance_scope(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_kds_tickets_branch_created
  ON public.kds_tickets (branch_id, created_at)
  INCLUDE (
    tenant_id,
    status,
    station_id,
    order_id,
    order_item_id,
    kitchen_send_batch_id,
    bumped_at,
    updated_at
  );

CREATE INDEX IF NOT EXISTS idx_tax_invoices_finance_summary
  ON public.tax_invoices (tenant_id, branch_id, status, issued_at, created_at);

CREATE INDEX IF NOT EXISTS idx_journal_entries_finance_summary
  ON public.journal_entries (tenant_id, branch_id, status, entry_date);

CREATE INDEX IF NOT EXISTS idx_webhook_events_finance_failed
  ON public.webhook_events (tenant_id, processing_status, created_at)
  INCLUDE (payment_id)
  WHERE processing_status = 'failed';


-- get_revenue_kpis: compute finance branch scope once
CREATE OR REPLACE FUNCTION public.get_revenue_kpis(
  p_branch_id BIGINT,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  net_revenue NUMERIC,
  subtotal_revenue NUMERIC,
  discount_amount NUMERIC,
  total_tax NUMERIC,
  vat_8_amount NUMERIC,
  vat_10_amount NUMERIC,
  order_count BIGINT,
  total_covers BIGINT,
  cash_revenue NUMERIC,
  vietqr_revenue NUMERIC,
  momo_revenue NUMERIC,
  dine_in_revenue NUMERIC,
  takeaway_revenue NUMERIC,
  voided_amount NUMERIC,
  voided_count BIGINT,
  refreshed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid UUID;
  v_tenant BIGINT;
  v_start_utc TIMESTAMPTZ;
  v_end_utc TIMESTAMPTZ;
  v_has_tenant_scope BOOLEAN;
  v_branch_ids BIGINT[];
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

  SELECT fs.has_tenant_scope, fs.branch_ids
    INTO v_has_tenant_scope, v_branch_ids
  FROM private.finance_scope(v_uid, 'finance:view') fs;

  IF p_branch_id IS NULL THEN
    IF NOT (v_has_tenant_scope OR cardinality(v_branch_ids) > 0) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT (v_has_tenant_scope OR p_branch_id = ANY(v_branch_ids)) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_start_utc := (p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_end_utc := ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  RETURN QUERY
  WITH paid_orders AS MATERIALIZED (
    SELECT
      o.id,
      o.branch_id,
      o.tenant_id,
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
     AND o.branch_id = p.branch_id
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
        po.tenant_id,
        CASE
          WHEN SUM(oi2.subtotal) > 0 THEN po.total_amount / SUM(oi2.subtotal)
          ELSE 1
        END AS scale
      FROM paid_orders po
      JOIN public.order_items oi2
        ON oi2.tenant_id = po.tenant_id
       AND oi2.order_id = po.id
       AND oi2.status <> 'cancelled'
      GROUP BY po.id, po.tenant_id, po.total_amount
    ) scaled
    JOIN public.order_items oi
      ON oi.tenant_id = scaled.tenant_id
     AND oi.order_id = scaled.order_id
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
     AND o.branch_id = p.branch_id
    WHERE p.tenant_id = v_tenant
      AND p.status = 'refunded'
      AND p.paid_at >= v_start_utc
      AND p.paid_at < v_end_utc
      AND (
        (p_branch_id IS NOT NULL AND o.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (v_has_tenant_scope OR o.branch_id = ANY(v_branch_ids))
        )
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


-- get_revenue_rollup: remove per-row permission probes
CREATE OR REPLACE FUNCTION public.get_revenue_rollup(
  p_branch_id BIGINT,
  p_start_date DATE,
  p_end_date DATE,
  p_granularity TEXT
)
RETURNS TABLE (
  period_start DATE,
  period_end DATE,
  period_label TEXT,
  branch_id BIGINT,
  order_count BIGINT,
  total_revenue NUMERIC,
  total_tax NUMERIC,
  subtotal_revenue NUMERIC,
  discount_amount NUMERIC,
  cash_revenue NUMERIC,
  vietqr_revenue NUMERIC,
  momo_revenue NUMERIC,
  dine_in_revenue NUMERIC,
  takeaway_revenue NUMERIC,
  total_covers BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_tenant BIGINT;
  v_start_utc TIMESTAMPTZ;
  v_end_utc TIMESTAMPTZ;
  v_has_tenant_scope BOOLEAN;
  v_branch_ids BIGINT[];
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

  SELECT fs.has_tenant_scope, fs.branch_ids
    INTO v_has_tenant_scope, v_branch_ids
  FROM private.finance_scope(v_uid, 'finance:view') fs;

  IF p_branch_id IS NULL THEN
    IF NOT (v_has_tenant_scope OR cardinality(v_branch_ids) > 0) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT (v_has_tenant_scope OR p_branch_id = ANY(v_branch_ids)) THEN
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
     AND o.branch_id = p.branch_id
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


-- get_revenue_by_hour: remove per-row permission probes
CREATE OR REPLACE FUNCTION public.get_revenue_by_hour(
  p_branch_id BIGINT DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  dow SMALLINT,
  hour SMALLINT,
  order_count BIGINT,
  net_revenue NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_tenant BIGINT;
  v_days INT;
  v_start_utc TIMESTAMPTZ;
  v_end_utc TIMESTAMPTZ;
  v_has_tenant_scope BOOLEAN;
  v_branch_ids BIGINT[];
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
  ELSE
    IF NOT (v_has_tenant_scope OR p_branch_id = ANY(v_branch_ids)) THEN
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
        OR (
          p_branch_id IS NULL
          AND (v_has_tenant_scope OR o.branch_id = ANY(v_branch_ids))
        )
      )
  )
  SELECT
    EXTRACT(DOW FROM paid.paid_local)::SMALLINT AS dow,
    EXTRACT(HOUR FROM paid.paid_local)::SMALLINT AS hour,
    COUNT(DISTINCT paid.order_id)::BIGINT AS order_count,
    COALESCE(SUM(paid.subtotal - paid.discount_amount), 0)::NUMERIC AS net_revenue
  FROM paid
  GROUP BY 1, 2
  ORDER BY 1, 2;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_revenue_by_hour(BIGINT, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_by_hour(BIGINT, DATE, DATE) TO authenticated;


-- get_revenue_by_cashier: remove per-row permission probes
CREATE OR REPLACE FUNCTION public.get_revenue_by_cashier(
  p_branch_id BIGINT DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  cashier_id UUID,
  cashier_name TEXT,
  order_count BIGINT,
  net_revenue NUMERIC,
  cash_revenue NUMERIC,
  qr_revenue NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid UUID;
  v_tenant BIGINT;
  v_days INT;
  v_start_utc TIMESTAMPTZ;
  v_end_utc TIMESTAMPTZ;
  v_has_tenant_scope BOOLEAN;
  v_branch_ids BIGINT[];
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
  ELSE
    IF NOT (v_has_tenant_scope OR p_branch_id = ANY(v_branch_ids)) THEN
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
      o.cashier_id,
      COUNT(*)::BIGINT AS order_count,
      COALESCE(SUM(o.subtotal - o.discount_amount), 0)::NUMERIC AS net_revenue
    FROM order_rows o
    GROUP BY o.cashier_id
  ),
  payments_by_cashier AS (
    SELECT
      sp.cashier_id,
      COALESCE(SUM(sp.amount) FILTER (WHERE sp.method = 'cash'), 0)::NUMERIC AS cash_revenue,
      COALESCE(SUM(sp.amount) FILTER (WHERE sp.method IN ('vietqr', 'momo')), 0)::NUMERIC AS qr_revenue
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


-- get_top_items: remove per-row permission probes
CREATE OR REPLACE FUNCTION public.get_top_items(
  p_branch_id BIGINT DEFAULT NULL,
  p_period_start DATE DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  period_start DATE,
  period_end DATE,
  branch_id BIGINT,
  tenant_id BIGINT,
  menu_item_id BIGINT,
  item_name TEXT,
  quantity_sold NUMERIC,
  revenue NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_tenant BIGINT;
  v_effective_limit INT;
  v_period_start DATE;
  v_period_end DATE;
  v_start_utc TIMESTAMPTZ;
  v_end_utc TIMESTAMPTZ;
  v_has_tenant_scope BOOLEAN;
  v_branch_ids BIGINT[];
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

  SELECT fs.has_tenant_scope, fs.branch_ids
    INTO v_has_tenant_scope, v_branch_ids
  FROM private.finance_scope(v_uid, 'finance:view') fs;

  IF p_branch_id IS NULL THEN
    IF NOT (v_has_tenant_scope OR cardinality(v_branch_ids) > 0) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT (v_has_tenant_scope OR p_branch_id = ANY(v_branch_ids)) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
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
        OR (
          p_branch_id IS NULL
          AND (v_has_tenant_scope OR o.branch_id = ANY(v_branch_ids))
        )
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


-- get_finance_dashboard_summary: remove per-row permission probes
CREATE OR REPLACE FUNCTION public.get_finance_dashboard_summary(
  p_start_date DATE,
  p_end_date DATE,
  p_branch_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
  invoice_attention_count BIGINT,
  invoice_issued_count BIGINT,
  invoice_not_required_count BIGINT,
  journal_draft_count BIGINT,
  journal_posted_count BIGINT,
  failed_webhook_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID;
  v_tenant BIGINT;
  v_start_utc TIMESTAMPTZ;
  v_end_utc TIMESTAMPTZ;
  v_has_tenant_scope BOOLEAN;
  v_branch_ids BIGINT[];
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'invalid_date_range' USING ERRCODE = '22023';
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

  SELECT fs.has_tenant_scope, fs.branch_ids
    INTO v_has_tenant_scope, v_branch_ids
  FROM private.finance_scope(v_uid, 'finance:view') fs;

  IF p_branch_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = p_branch_id
        AND b.tenant_id = v_tenant
    ) THEN
      RAISE EXCEPTION 'branch not found' USING ERRCODE = '22023';
    END IF;
    IF NOT (v_has_tenant_scope OR p_branch_id = ANY(v_branch_ids)) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT (v_has_tenant_scope OR cardinality(v_branch_ids) > 0) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_start_utc := (p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_end_utc := ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  RETURN QUERY
  WITH scoped_tax_invoices AS MATERIALIZED (
    SELECT ti.*
    FROM public.tax_invoices ti
    WHERE ti.tenant_id = v_tenant
      AND (
        (p_branch_id IS NOT NULL AND ti.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (
            v_has_tenant_scope
            OR ti.branch_id = ANY(v_branch_ids)
          )
        )
      )
  ),
  scoped_journals AS MATERIALIZED (
    SELECT je.*
    FROM public.journal_entries je
    WHERE je.tenant_id = v_tenant
      AND (
        (p_branch_id IS NOT NULL AND je.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (
            v_has_tenant_scope
            OR je.branch_id = ANY(v_branch_ids)
          )
        )
      )
  ),
  scoped_failed_webhooks AS MATERIALIZED (
    SELECT we.id
    FROM public.webhook_events we
    LEFT JOIN public.payments p
      ON p.id = we.payment_id
     AND p.tenant_id = we.tenant_id
    WHERE we.tenant_id = v_tenant
      AND we.processing_status = 'failed'
      AND we.created_at >= v_start_utc
      AND we.created_at < v_end_utc
      AND (
        (p_branch_id IS NOT NULL AND p.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (
            v_has_tenant_scope
            OR p.branch_id = ANY(v_branch_ids)
          )
        )
      )
  )
  SELECT
    (
      SELECT COUNT(*)::BIGINT
      FROM scoped_tax_invoices ti
      WHERE ti.status IN ('draft', 'signing', 'submitted')
    ) AS invoice_attention_count,
    (
      SELECT COUNT(*)::BIGINT
      FROM scoped_tax_invoices ti
      WHERE ti.status = 'issued'
        AND ti.issued_at >= v_start_utc
        AND ti.issued_at < v_end_utc
    ) AS invoice_issued_count,
    (
      SELECT COUNT(*)::BIGINT
      FROM scoped_tax_invoices ti
      WHERE ti.status = 'not_required'
        AND ti.created_at >= v_start_utc
        AND ti.created_at < v_end_utc
    ) AS invoice_not_required_count,
    (
      SELECT COUNT(*)::BIGINT
      FROM scoped_journals je
      WHERE je.status = 'draft'
    ) AS journal_draft_count,
    (
      SELECT COUNT(*)::BIGINT
      FROM scoped_journals je
      WHERE je.status = 'posted'
        AND je.entry_date >= v_start_utc
        AND je.entry_date < v_end_utc
    ) AS journal_posted_count,
    (
      SELECT COUNT(*)::BIGINT
      FROM scoped_failed_webhooks
    ) AS failed_webhook_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_finance_dashboard_summary(DATE, DATE, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_finance_dashboard_summary(DATE, DATE, BIGINT) TO authenticated;
