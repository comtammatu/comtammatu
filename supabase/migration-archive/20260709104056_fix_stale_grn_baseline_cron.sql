SELECT cron.unschedule('refresh_mv_grn_price_baseline')
WHERE EXISTS (
  SELECT 1
  FROM cron.job
  WHERE jobname = 'refresh_mv_grn_price_baseline'
);
