-- Cut over draft Viettel invoice profiles to the registered MTT template/series.
-- Active/retired rows stay immutable (private.validate_invoice_profile).

UPDATE public.invoice_profiles
SET
  template_code = '1/002',
  invoice_series = 'C26MCS'
WHERE status = 'draft'
  AND template_code = '1/001'
  AND invoice_series = 'C26TCS';
