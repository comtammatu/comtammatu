BEGIN;

-- refresh_mv_inventory_stock_current ran every 5 min (288 full REFRESH
-- MATERIALIZED VIEW CONCURRENTLY/day). The MV is a non-aggregating join whose
-- source tables change only on GRN / stock-movement events, not on a clock, and
-- it carried no per-job statement_timeout. Lower the cadence to 15 min and add a
-- 2 min guard. cron.schedule upserts by jobname (matches managed-surfaces
-- install Section E). Freshness becomes <=15 min for on-hand stock; revisit an
-- event-driven refresh when live inventory makes 15 min too coarse.

SELECT cron.schedule(
  'refresh_mv_inventory_stock_current',
  '*/15 * * * *',
  'SET LOCAL statement_timeout = ''2min''; REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_inventory_stock_current;'
);

DO $$
DECLARE
  v_schedule text;
BEGIN
  SELECT schedule INTO v_schedule
  FROM cron.job
  WHERE jobname = 'refresh_mv_inventory_stock_current';

  IF v_schedule IS DISTINCT FROM '*/15 * * * *' THEN
    RAISE EXCEPTION 'inventory MV cron reschedule failed: schedule is %', v_schedule;
  END IF;
END $$;

COMMIT;
