-- One-shot recovery for date-blocked drafts that provably never reached
-- Viettel. Provider submission always reserves provider_ref and moves the
-- invoice to signing before the HTTP call, so this predicate excludes every
-- unknown or externally submitted outcome.

UPDATE public.tax_invoice_issue_jobs AS job
SET
  status = 'queued',
  locked_until = NULL,
  last_error = NULL,
  available_at = now(),
  invoice_payload = COALESCE(job.invoice_payload, '{}'::jsonb)
    || jsonb_build_object('allowBacklogSubmitDate', true),
  updated_at = now()
FROM public.tax_invoices AS invoice
WHERE invoice.id = job.tax_invoice_id
  AND job.status = 'blocked'
  AND job.last_error = 'invoice_issue_date_not_today'
  AND invoice.status = 'draft'
  AND invoice.provider_ref IS NULL
  AND invoice.provider_data IS NULL;
