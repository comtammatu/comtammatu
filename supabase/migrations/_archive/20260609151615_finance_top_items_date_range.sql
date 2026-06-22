-- Finance Revenue top items must follow the selected date range, not a fixed
-- month bucket. Keep the old 3-argument RPC as a compatibility wrapper for
-- callers that still ask for a month by period_start.

CREATE OR REPLACE FUNCTION public.get_top_items(
  p_branch_id BIGINT,
  p_start_date DATE,
  p_end_date DATE,
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

  SELECT fs.has_tenant_scope, fs.branch_ids
    INTO v_has_tenant_scope, v_branch_ids
  FROM private.finance_scope(v_uid, 'finance:view') fs;

  IF p_branch_id IS NULL THEN
    IF NOT (v_has_tenant_scope OR COALESCE(cardinality(v_branch_ids), 0) > 0) THEN
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
  v_start_utc := (p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_end_utc := ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

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
    p_start_date AS period_start,
    p_end_date AS period_end,
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
  v_period_start DATE;
  v_period_end DATE;
BEGIN
  v_period_start := COALESCE(
    p_period_start,
    date_trunc('month', (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'))::date
  );
  v_period_end := (date_trunc('month', v_period_start)::date + INTERVAL '1 month - 1 day')::date;

  RETURN QUERY
  SELECT *
  FROM public.get_top_items(
    p_branch_id,
    v_period_start,
    v_period_end,
    p_limit
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_top_items(BIGINT, DATE, DATE, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_top_items(BIGINT, DATE, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_top_items(BIGINT, DATE, DATE, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_top_items(BIGINT, DATE, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_top_items(BIGINT, DATE, DATE, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_items(BIGINT, DATE, INT) TO authenticated;

COMMENT ON FUNCTION public.get_top_items(BIGINT, DATE, DATE, INT) IS
  'Live paid-at top items for an explicit Vietnam-local date range. p_branch_id NULL still checks finance:view per returned branch row.';

COMMENT ON FUNCTION public.get_top_items(BIGINT, DATE, INT) IS
  'Compatibility wrapper for month-bucket top items; delegates to get_top_items(branch, start, end, limit).';
