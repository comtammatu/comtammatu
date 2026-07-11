-- Rollback for 20260430100000_cron_refresh_finance_views.sql

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'refresh-finance-views-daily'
  ) THEN
    PERFORM cron.unschedule('refresh-finance-views-daily');
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.finance_views_last_refresh();
