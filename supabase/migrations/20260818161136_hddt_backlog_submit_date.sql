-- One-shot: requeue leftover draft HĐĐT jobs blocked because Viettel rejected
-- a prior Vietnam calendar day's invoiceIssuedDate. Stamps
-- allowBacklogSubmitDate on those jobs only so the worker may restamp to the
-- S-invoice submit instant. New issue jobs omit the flag and still fail-close.
-- signing/submitted jobs stay reconcile-only.

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
  AND invoice.status = 'draft'
  AND (
    job.last_error = 'invoice_issue_date_not_today'
    OR (
      job.last_error = 'provider_rejected'
      AND (
        COALESCE(invoice.provider_data ->> 'errorCode', '')
          ILIKE '%INVOICE_ISSUE_DATE%'
        OR COALESCE(invoice.provider_data::text, '')
          ILIKE '%INVOICE_ISSUE_DATE_INVALID_TT78%'
      )
    )
  );
