-- =============================================================
-- pg_cron schedule: refresh_finance_views daily
-- =============================================================
-- Runs 23:15 UTC daily (= 06:15 Asia/Ho_Chi_Minh).
-- Staggered 15 min after scan-inventory-alerts-daily (23:00 UTC) to
-- avoid lock contention on shared base tables (orders, payments).
-- Refreshes mv_daily_revenue, mv_top_items, mv_food_cost CONCURRENTLY
-- via existing public.refresh_finance_views() RPC.
-- All 3 MVs already carry unique indexes (idx_mv_*_pk) so concurrent
-- refresh is safe — see 20260406330000_finance.sql:90,112 and
-- 20260416000000_finance_food_cost_audit.sql:59.
--
-- Note: refresh_finance_views() is also called synchronously inside
-- close_fiscal_period(). If a close happens around 23:15 UTC the two
-- CONCURRENTLY refreshes serialize per-MV (Postgres only allows one
-- concurrent refresh per matview at a time) — second waits, no error.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Idempotency: drop existing job before rescheduling.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'refresh-finance-views-daily'
  ) THEN
    PERFORM cron.unschedule('refresh-finance-views-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'refresh-finance-views-daily',
  '15 23 * * *',
  $$SET LOCAL statement_timeout = '5min'; SELECT public.refresh_finance_views();$$
);

-- ─── Surface "last refresh" for dashboard freshness badge ───
-- Reads cron.job_run_details (admin-only by default) via SECURITY
-- DEFINER + permission gate so finance staff can see staleness without
-- exposing the entire cron audit trail.

CREATE OR REPLACE FUNCTION public.finance_views_last_refresh()
RETURNS TABLE(last_run TIMESTAMPTZ, status TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'permission denied: finance:view required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT d.end_time, d.status
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
  WHERE j.jobname = 'refresh-finance-views-daily'
  ORDER BY d.start_time DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finance_views_last_refresh() TO authenticated;
