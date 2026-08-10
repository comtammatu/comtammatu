-- Align buyer-request close_state CHECK with submit RPC close_reason.
-- Baseline still required customer_submitted; hddt_buyer_kind switched the
-- submit path to queue_submitted without updating the constraint.

UPDATE public.tax_invoice_buyer_requests
SET close_reason = 'queue_submitted',
    updated_at = now()
WHERE status = 'submitted'
  AND close_reason = 'customer_submitted';

ALTER TABLE public.tax_invoice_buyer_requests
  DROP CONSTRAINT tax_invoice_buyer_requests_close_state_check;

ALTER TABLE public.tax_invoice_buyer_requests
  ADD CONSTRAINT tax_invoice_buyer_requests_close_state_check
  CHECK (
    (
      status = 'open'
      AND closed_at IS NULL
      AND close_reason IS NULL
    )
    OR (
      status = 'submitted'
      AND closed_at IS NOT NULL
      AND close_reason = 'queue_submitted'
    )
    OR (
      status = 'expired'
      AND closed_at IS NOT NULL
      AND close_reason = 'deadline_elapsed'
    )
  );
