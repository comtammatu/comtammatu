-- Payments at/after 22:00 VN skip the +2h buyer wait and become eligible
-- immediately so issuance stays on the same Vietnam calendar day.

CREATE OR REPLACE FUNCTION private.tax_invoice_buyer_deadline(
  p_paid_at timestamptz
)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT CASE
    WHEN p_paid_at IS NULL THEN NULL
    WHEN EXTRACT(
      HOUR FROM (p_paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
    ) >= 22 THEN p_paid_at
    ELSE LEAST(
      p_paid_at + interval '2 hours',
      (
        date_trunc('day', p_paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
        + interval '1 day'
        - interval '5 minutes'
      ) AT TIME ZONE 'Asia/Ho_Chi_Minh'
    )
  END;
$$;

REVOKE ALL ON FUNCTION private.tax_invoice_buyer_deadline(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.tax_invoice_buyer_deadline(timestamptz)
  TO service_role;

COMMENT ON FUNCTION private.tax_invoice_buyer_deadline(timestamptz) IS
  'Buyer QR / issue-job eligibility: paid_at when VN local hour >= 22, else min(paid_at+2h, VN calendar day end minus 5 minutes).';

UPDATE public.tax_invoice_issue_jobs AS job
SET
  available_at = private.tax_invoice_buyer_deadline(payment.paid_at),
  updated_at = now()
FROM public.payments AS payment
WHERE payment.id = job.payment_id
  AND job.status = 'queued'
  AND job.available_at IS NOT NULL
  AND payment.paid_at IS NOT NULL
  AND job.available_at > private.tax_invoice_buyer_deadline(payment.paid_at);

UPDATE public.tax_invoice_buyer_requests AS request
SET
  expires_at = private.tax_invoice_buyer_deadline(payment.paid_at),
  updated_at = now()
FROM public.payments AS payment
WHERE payment.tenant_id = request.tenant_id
  AND payment.order_id = request.order_id
  AND payment.status = 'completed'
  AND payment.paid_at IS NOT NULL
  AND request.status = 'open'
  AND request.expires_at > private.tax_invoice_buyer_deadline(payment.paid_at);
