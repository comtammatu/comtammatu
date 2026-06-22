-- Refresh the finance materialized views every 15 minutes instead of once
-- nightly (23:15).
--
-- Before: refresh_finance_views() (mv_daily_revenue, mv_top_items, mv_food_cost)
-- ran only at 23:15 daily, so the finance cockpit + admin dashboard revenue/
-- gross-profit KPIs excluded the CURRENT day's sales until the nightly refresh
-- (verified 2026-06-22: cards showed 186,998,950 through 06-21 while live MTD
-- was 193,074,950 — today's 44 orders / 6,076,000 were missing). Inventory
-- value and operating expense read live, so the same cockpit mixed a day-old
-- revenue figure with live cards.
--
-- Reschedule in place (keep the 'refresh-finance-views-daily' jobname + command
-- so get_finance_refresh_status() / the /finance staleness banner, which join on
-- that jobname, keep working). The job command and the SECURITY DEFINER function
-- are unchanged. refresh_finance_views() refreshes all three views CONCURRENTLY
-- under SET LOCAL statement_timeout = '5min'; at this dataset size that stays
-- well under the 15-minute cadence, so runs never overlap.
--
-- Not done here: the immediate one-off refresh. REFRESH MATERIALIZED VIEW
-- CONCURRENTLY cannot run inside a transaction block (migrations are
-- transactional), so the first up-to-date refresh happens on the next 15-minute
-- cron tick after this migration is applied.

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where jobname = 'refresh-finance-views-daily';

  if v_jobid is null then
    raise notice 'cron job refresh-finance-views-daily not found; nothing to reschedule';
  else
    perform cron.alter_job(job_id => v_jobid, schedule => '*/15 * * * *');
  end if;
end $$;
