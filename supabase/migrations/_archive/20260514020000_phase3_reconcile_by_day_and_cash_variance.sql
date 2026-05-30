-- =============================================================
-- Phase 3 — Reconcile DT↔Sổ per-day + cash variance summary
--
-- Two new RPCs that close the last gaps in the Finance reporting
-- rebuild without spawning new MVs:
--
--  (A) `fn_reconcile_sales_by_day(branch, start, end)` — per-day rows
--      of POS revenue (paid_at-bucketed) vs sum of credit to revenue
--      accounts in journal_entry_lines (entry_date-bucketed). Owner
--      can drill from the period-total reconcile (Phase 2 snippet)
--      to the exact day(s) that drove the difference. Mirrors the
--      filter shape of `fn_reconcile_period` (sales category) so two
--      surfaces stay consistent.
--
--  (B) `get_cash_variance_summary(branch, start, end)` — single-row
--      aggregate of `pos_sessions.cash_difference` over closed
--      sessions in the range, plus the top 3 cashiers ranked by
--      |variance| as a JSONB sidecar. Drives the "Lệch tiền cuối ca"
--      card on /finance/revenue. Surfaces the BA "pattern variance
--      lệch âm cùng 1 cashier = red flag" signal without exposing
--      raw session lists (PII / long).
--
-- Constraints respected:
--   - PERIOD-FILTER-USES-LOCAL-TZ: bucketing uses
--     `AT TIME ZONE 'Asia/Ho_Chi_Minh'` for both POS payments and JE
--     entry_date conversion.
--   - REVENUE-BUCKET-BY-PAID-AT-LOCAL-TZ: POS side aggregates from
--     `payments` joined to non-cancelled paid orders, NOT from
--     `orders.created_at`.
--   - SECURITY DEFINER + has_permission gate at the RPC entrypoint.
--     For NULL branch we defer to has_permission_any + per-row
--     has_permission filter (same pattern as get_revenue_kpis).
--   - No new MV → no new refresh contract → no MV-staleness band.
-- =============================================================

-- ─── (A) fn_reconcile_sales_by_day ───────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_reconcile_sales_by_day(BIGINT, DATE, DATE);

CREATE FUNCTION public.fn_reconcile_sales_by_day(
  p_branch_id  BIGINT,
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS TABLE (
  date          DATE,
  revenue_paid  NUMERIC,
  gl_credit     NUMERIC,
  diff          NUMERIC
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
  WITH pos_by_day AS (
    SELECT
      (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day,
      COALESCE(SUM(p.amount), 0) AS revenue_paid
    FROM public.payments p
    JOIN public.orders o
      ON o.id        = p.order_id
     AND o.tenant_id = p.tenant_id
    WHERE p.tenant_id = v_tenant
      AND p.status = 'completed'
      AND p.paid_at IS NOT NULL
      AND (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_start_date
      AND (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
      AND (
        (p_branch_id IS NOT NULL AND p.branch_id = p_branch_id)
        OR (p_branch_id IS NULL AND public.has_permission(p.branch_id, 'finance:view'))
      )
    GROUP BY 1
  ),
  gl_by_day AS (
    -- Mirror fn_reconcile_period sales category: account_code IN
    -- ('511','33311') AND reference_type='sale'. Bucket by JE
    -- entry_date local-day so it lines up with paid_at-local-day
    -- on the POS side. journal_entries.branch_id may be NULL for
    -- tenant-wide adjustments — those rows are excluded from a
    -- branch-specific reconcile and included for NULL branch (with
    -- the has_permission filter).
    SELECT
      (je.entry_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day,
      COALESCE(SUM(jel.credit_amount), 0) AS gl_credit
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je
      ON je.id = jel.journal_entry_id
     AND je.tenant_id = jel.tenant_id
    JOIN public.chart_of_accounts coa
      ON coa.id = jel.account_id
    WHERE jel.tenant_id = v_tenant
      AND coa.account_code IN ('511', '33311')
      AND je.reference_type = 'sale'
      AND je.status = 'posted'
      AND (je.entry_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_start_date
      AND (je.entry_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date
      AND (
        (p_branch_id IS NOT NULL AND je.branch_id = p_branch_id)
        OR (p_branch_id IS NULL
            AND je.branch_id IS NOT NULL
            AND public.has_permission(je.branch_id, 'finance:view'))
      )
    GROUP BY 1
  )
  SELECT
    COALESCE(pos.day, gl.day)                            AS date,
    COALESCE(pos.revenue_paid, 0)                        AS revenue_paid,
    COALESCE(gl.gl_credit, 0)                            AS gl_credit,
    COALESCE(pos.revenue_paid, 0) - COALESCE(gl.gl_credit, 0) AS diff
  FROM pos_by_day pos
  FULL OUTER JOIN gl_by_day gl ON gl.day = pos.day
  ORDER BY 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public.fn_reconcile_sales_by_day(BIGINT, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.fn_reconcile_sales_by_day(BIGINT, DATE, DATE) TO authenticated;

COMMENT ON FUNCTION
  public.fn_reconcile_sales_by_day(BIGINT, DATE, DATE) IS
  'Per-day POS revenue (paid_at local) vs GL credit (511+33311, '
  'reference_type=sale, entry_date local). FULL OUTER JOIN — rows '
  'present on either side surface so missing-postings days are '
  'visible. NULL branch = sum across branches caller has finance:view.';


-- ─── (B) get_cash_variance_summary ───────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_cash_variance_summary(BIGINT, DATE, DATE);

CREATE FUNCTION public.get_cash_variance_summary(
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
  WITH closed_in_range AS (
    SELECT
      ps.id,
      ps.closed_by,
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
      COUNT(*)::BIGINT                                           AS session_count,
      COALESCE(SUM(cash_difference), 0)                          AS total_variance,
      COALESCE(SUM(ABS(cash_difference)), 0)                     AS abs_variance_total,
      COUNT(*) FILTER (WHERE cash_difference < 0)::BIGINT        AS short_count,
      COALESCE(SUM(cash_difference) FILTER (WHERE cash_difference < 0), 0) AS short_total,
      COUNT(*) FILTER (WHERE cash_difference > 0)::BIGINT        AS over_count,
      COALESCE(SUM(cash_difference) FILTER (WHERE cash_difference > 0), 0) AS over_total
    FROM closed_in_range
  ),
  by_cashier AS (
    SELECT
      c.closed_by,
      COALESCE(pr.full_name, '—')   AS cashier_name,
      COUNT(*)::BIGINT              AS session_count,
      SUM(c.cash_difference)        AS net_variance,
      SUM(ABS(c.cash_difference))   AS abs_variance
    FROM closed_in_range c
    LEFT JOIN public.profiles pr ON pr.id = c.closed_by
    GROUP BY c.closed_by, pr.full_name
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
          'cashier_id',     w.closed_by,
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

REVOKE EXECUTE ON FUNCTION
  public.get_cash_variance_summary(BIGINT, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.get_cash_variance_summary(BIGINT, DATE, DATE) TO authenticated;

COMMENT ON FUNCTION
  public.get_cash_variance_summary(BIGINT, DATE, DATE) IS
  'Aggregate POS cash variance over closed sessions in range. '
  'Returns single row: session_count, signed and absolute totals, '
  'short/over counts and totals, plus top-3 cashiers JSONB ranked by '
  '|variance|. NULL branch = sum across branches caller has finance:view.';
