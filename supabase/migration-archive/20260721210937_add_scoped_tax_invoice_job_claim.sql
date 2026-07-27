BEGIN;

CREATE OR REPLACE FUNCTION public.claim_tax_invoice_issue_job(
  p_job_id bigint,
  p_lease_seconds integer DEFAULT 300
) RETURNS TABLE (
  id bigint,
  tenant_id bigint,
  branch_id bigint,
  order_id bigint,
  payment_id bigint,
  invoice_payload jsonb,
  tax_invoice_id bigint,
  attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  UPDATE public.tax_invoice_issue_jobs job
  SET status = 'reconcile_required',
      locked_until = NULL,
      last_error = 'lease_expired_provider_state_unknown',
      updated_at = now()
  FROM public.tax_invoices invoice
  WHERE job.id = p_job_id
    AND job.tax_invoice_id = invoice.id
    AND job.status = 'processing'
    AND job.locked_until < now()
    AND invoice.status IN ('signing', 'submitted');

  RETURN QUERY
  WITH candidate AS (
    SELECT job.id
    FROM public.tax_invoice_issue_jobs job
    WHERE job.id = p_job_id
      AND (
        job.status = 'queued'
        OR (job.status = 'processing' AND job.locked_until < now())
      )
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.tax_invoice_issue_jobs job
    SET status = 'processing',
        locked_until = now() + make_interval(
          secs => LEAST(GREATEST(COALESCE(p_lease_seconds, 300), 30), 900)
        ),
        attempt_count = job.attempt_count + 1,
        updated_at = now()
    FROM candidate
    WHERE job.id = candidate.id
    RETURNING job.*
  )
  SELECT
    claimed.id,
    claimed.tenant_id,
    claimed.branch_id,
    claimed.order_id,
    claimed.payment_id,
    claimed.invoice_payload,
    claimed.tax_invoice_id,
    claimed.attempt_count
  FROM claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_tax_invoice_issue_job(bigint, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_tax_invoice_issue_job(bigint, integer)
  TO service_role;

COMMIT;
