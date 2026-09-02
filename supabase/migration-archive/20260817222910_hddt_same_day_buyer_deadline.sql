-- Cap the HĐĐT buyer window to the Vietnam calendar day of payment.
-- Viettel MTT rejects invoiceIssuedDate on a later calendar day (TT78).
-- Cron is */5, so the same-day ceiling is 23:55 VN.

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
  'Buyer QR / issue-job eligibility: min(paid_at+2h, VN calendar day end minus 5 minutes).';

CREATE OR REPLACE FUNCTION private.cap_tax_invoice_job_available_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_paid_at timestamptz;
  v_deadline timestamptz;
BEGIN
  IF NEW.payment_id IS NULL OR NEW.available_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT payment.paid_at
  INTO v_paid_at
  FROM public.payments payment
  WHERE payment.id = NEW.payment_id;

  IF v_paid_at IS NULL THEN
    RETURN NEW;
  END IF;

  v_deadline := private.tax_invoice_buyer_deadline(v_paid_at);
  IF v_deadline IS NOT NULL AND NEW.available_at > v_deadline THEN
    NEW.available_at := v_deadline;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cap_tax_invoice_job_available_at
  ON public.tax_invoice_issue_jobs;
CREATE TRIGGER trg_cap_tax_invoice_job_available_at
BEFORE INSERT OR UPDATE OF available_at ON public.tax_invoice_issue_jobs
FOR EACH ROW
EXECUTE FUNCTION private.cap_tax_invoice_job_available_at();

CREATE OR REPLACE FUNCTION private.cap_tax_invoice_buyer_request_expires_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_paid_at timestamptz;
  v_deadline timestamptz;
BEGIN
  IF NEW.expires_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT payment.paid_at
  INTO v_paid_at
  FROM public.payments payment
  WHERE payment.tenant_id = NEW.tenant_id
    AND payment.order_id = NEW.order_id
    AND payment.status = 'completed'
    AND payment.paid_at IS NOT NULL
  ORDER BY payment.id DESC
  LIMIT 1;

  IF v_paid_at IS NULL THEN
    RETURN NEW;
  END IF;

  v_deadline := private.tax_invoice_buyer_deadline(v_paid_at);
  IF v_deadline IS NOT NULL AND NEW.expires_at > v_deadline THEN
    NEW.expires_at := v_deadline;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cap_tax_invoice_buyer_request_expires_at
  ON public.tax_invoice_buyer_requests;
CREATE TRIGGER trg_cap_tax_invoice_buyer_request_expires_at
BEFORE INSERT OR UPDATE OF expires_at ON public.tax_invoice_buyer_requests
FOR EACH ROW
EXECUTE FUNCTION private.cap_tax_invoice_buyer_request_expires_at();

REVOKE ALL ON FUNCTION private.cap_tax_invoice_job_available_at()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.cap_tax_invoice_buyer_request_expires_at()
  FROM PUBLIC, anon, authenticated;

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

CREATE OR REPLACE FUNCTION public.requeue_tax_invoice_issue_job(
  p_job_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_job public.tax_invoice_issue_jobs%ROWTYPE;
  v_invoice public.tax_invoices%ROWTYPE;
BEGIN
  IF v_actor IS NULL
    OR v_tenant IS NULL
    OR NOT (public.auth_is_owner(v_actor) OR public.has_position('accountant'))
    OR NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_job
  FROM public.tax_invoice_issue_jobs
  WHERE id = p_job_id AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND OR v_job.status NOT IN ('blocked', 'reconcile_required') THEN
    RAISE EXCEPTION 'tax_invoice_issue_job_not_requeueable' USING ERRCODE = '22023';
  END IF;

  IF v_job.tax_invoice_id IS NOT NULL THEN
    SELECT * INTO v_invoice FROM public.tax_invoices WHERE id = v_job.tax_invoice_id FOR UPDATE;
    IF NOT FOUND OR v_invoice.status <> 'draft' THEN
      RAISE EXCEPTION 'tax_invoice_issue_job_requires_draft_invoice' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.tax_invoice_issue_jobs
  SET
    status = 'queued',
    locked_until = NULL,
    last_error = NULL,
    available_at = now(),
    updated_at = now()
  WHERE id = v_job.id;

  RETURN jsonb_build_object('job_id', v_job.id, 'status', 'queued');
END;
$$;
