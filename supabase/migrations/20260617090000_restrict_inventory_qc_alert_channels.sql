-- QC alerts are in-app only.

UPDATE public.inventory_qc_settings
SET
  alert_channel = 'generic',
  alert_webhook_url = NULL
WHERE alert_channel <> 'generic'
   OR alert_webhook_url IS NOT NULL;

ALTER TABLE public.inventory_qc_settings
  DROP CONSTRAINT IF EXISTS inventory_qc_settings_alert_channel_check;

ALTER TABLE public.inventory_qc_settings
  ADD CONSTRAINT inventory_qc_settings_alert_channel_check
  CHECK (alert_channel = 'generic');
