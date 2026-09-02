-- Requeue every tenant job blocked on invoice_total_mismatch so the worker
-- can retry after whole-VND qty peel. Does not touch Viettel-unknown or other
-- blocked errors. Same actor gate as requeue_tax_invoice_issue_job.

CREATE OR REPLACE FUNCTION public.requeue_invoice_total_mismatch_jobs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $requeue_mismatch$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_requeued integer := 0;
BEGIN
  IF v_actor IS NULL
    OR v_tenant IS NULL
    OR NOT (public.auth_is_owner(v_actor) OR public.has_position('accountant'))
    OR NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH candidates AS (
    SELECT job.id, job.tax_invoice_id
    FROM public.tax_invoice_issue_jobs job
    WHERE job.tenant_id = v_tenant
      AND job.status = 'blocked'
      AND job.last_error = 'invoice_total_mismatch'
    ORDER BY job.id
    FOR UPDATE OF job SKIP LOCKED
    LIMIT 200
  ),
  eligible AS (
    SELECT candidates.id
    FROM candidates
    LEFT JOIN public.tax_invoices invoice
      ON invoice.id = candidates.tax_invoice_id
    WHERE candidates.tax_invoice_id IS NULL
       OR invoice.status = 'draft'
  ),
  updated AS (
    UPDATE public.tax_invoice_issue_jobs job
    SET
      status = 'queued',
      locked_until = NULL,
      last_error = NULL,
      available_at = now(),
      updated_at = now()
    FROM eligible
    WHERE job.id = eligible.id
    RETURNING job.id
  )
  SELECT count(*)::integer INTO v_requeued FROM updated;

  RETURN jsonb_build_object('requeued', v_requeued);
END;
$requeue_mismatch$;

REVOKE ALL ON FUNCTION public.requeue_invoice_total_mismatch_jobs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.requeue_invoice_total_mismatch_jobs() FROM anon;
REVOKE ALL ON FUNCTION public.requeue_invoice_total_mismatch_jobs() FROM service_role;
GRANT EXECUTE ON FUNCTION public.requeue_invoice_total_mismatch_jobs() TO authenticated;

COMMENT ON FUNCTION public.requeue_invoice_total_mismatch_jobs() IS
  'Owner/accountant: queue blocked invoice_total_mismatch HĐĐT jobs that still have a draft tax invoice.';
