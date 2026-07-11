CREATE OR REPLACE FUNCTION public.get_cash_variance_summary(
  p_branch_id bigint,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE(
  session_count bigint,
  total_variance numeric,
  abs_variance_total numeric,
  short_count bigint,
  short_total numeric,
  over_count bigint,
  over_total numeric,
  worst_cashiers jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
  v_uid    uuid;
  v_tenant bigint;
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
      AND ps.variance_approval_note IS NULL
      AND abs(ps.cash_difference) > GREATEST(
        50000::numeric,
        ROUND(COALESCE(ps.expected_cash, 0) * 0.005, 2)
      )
      AND (ps.closed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_start_date
      AND (ps.closed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date
      AND (
        (p_branch_id IS NOT NULL AND ps.branch_id = p_branch_id)
        OR (p_branch_id IS NULL AND public.has_permission(ps.branch_id, 'finance:view'))
      )
  ),
  agg AS (
    SELECT
      COUNT(*)::bigint AS session_count,
      COALESCE(SUM(c.cash_difference), 0) AS total_variance,
      COALESCE(SUM(ABS(c.cash_difference)), 0) AS abs_variance_total,
      COUNT(*) FILTER (WHERE c.cash_difference < 0)::bigint AS short_count,
      COALESCE(SUM(c.cash_difference) FILTER (WHERE c.cash_difference < 0), 0) AS short_total,
      COUNT(*) FILTER (WHERE c.cash_difference > 0)::bigint AS over_count,
      COALESCE(SUM(c.cash_difference) FILTER (WHERE c.cash_difference > 0), 0) AS over_total
    FROM closed_in_range c
  ),
  by_cashier AS (
    SELECT
      c.cashier_id,
      COALESCE(pr.full_name, '—') AS cashier_name,
      COUNT(*)::bigint AS session_count,
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

COMMENT ON FUNCTION public.get_cash_variance_summary(bigint, date, date)
IS 'Aggregate unresolved over-threshold POS cash variance over closed sessions in range. A session is unresolved while variance_approval_note is NULL.';
