-- =============================================================
-- pg_cron schedule: scan_inventory_alerts daily
-- =============================================================
-- Runs 23:00 UTC daily (= 06:00 Asia/Ho_Chi_Minh).
-- Requires `pg_cron` extension to be enabled on the Supabase project
-- (Dashboard → Database → Extensions → pg_cron → Enable).

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Unschedule any previous job with the same name to keep this migration idempotent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'scan-inventory-alerts-daily'
  ) THEN
    PERFORM cron.unschedule('scan-inventory-alerts-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'scan-inventory-alerts-daily',
  '0 23 * * *',
  $$SELECT public.scan_inventory_alerts();$$
);
