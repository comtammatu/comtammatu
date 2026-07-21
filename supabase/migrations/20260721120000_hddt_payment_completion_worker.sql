BEGIN;

CREATE TABLE public.tax_invoice_issue_jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id bigint NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  order_id bigint NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_id bigint REFERENCES public.payments(id) ON DELETE SET NULL,
  invoice_payload jsonb NOT NULL,
  tax_invoice_id bigint REFERENCES public.tax_invoices(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending_payment',
  attempt_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tax_invoice_issue_jobs_status_check CHECK (
    status IN ('pending_payment', 'queued', 'processing', 'completed', 'blocked', 'reconcile_required')
  ),
  CONSTRAINT tax_invoice_issue_jobs_attempt_count_check CHECK (attempt_count >= 0),
  CONSTRAINT tax_invoice_issue_jobs_one_per_order UNIQUE (tenant_id, order_id)
);

CREATE INDEX idx_tax_invoice_issue_jobs_claim
  ON public.tax_invoice_issue_jobs (status, locked_until, created_at)
  WHERE status IN ('queued', 'processing');

CREATE INDEX idx_tax_invoice_issue_jobs_attention
  ON public.tax_invoice_issue_jobs (tenant_id, status, updated_at DESC)
  WHERE status IN ('blocked', 'reconcile_required');

ALTER TABLE public.tax_invoice_issue_jobs ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.tax_invoice_issue_jobs TO authenticated;
GRANT ALL ON TABLE public.tax_invoice_issue_jobs TO service_role;
GRANT ALL ON SEQUENCE public.tax_invoice_issue_jobs_id_seq TO service_role;

CREATE POLICY tax_invoice_issue_jobs_select_finance
  ON public.tax_invoice_issue_jobs
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:view')
  );

CREATE OR REPLACE FUNCTION private.upsert_tax_invoice_issue_job(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_order_id bigint,
  p_payment_id bigint,
  p_invoice_payload jsonb,
  p_status text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_payload jsonb;
  v_job public.tax_invoice_issue_jobs%ROWTYPE;
BEGIN
  IF p_status NOT IN ('pending_payment', 'queued') THEN
    RAISE EXCEPTION 'invalid_tax_invoice_issue_job_status' USING ERRCODE = '22023';
  END IF;

  v_payload := public.self_order_normalize_invoice_payload(p_invoice_payload);

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
    AND tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND order_id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tax_invoice_issue_payment_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id = p_tenant_id
    AND branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tax_invoice_issue_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_status = 'pending_payment' THEN
    IF v_payment.status <> 'pending' THEN
      RAISE EXCEPTION 'tax_invoice_issue_payment_not_pending' USING ERRCODE = '22023';
    END IF;
  ELSIF v_payment.status <> 'completed'
    OR v_order.payment_status <> 'paid'
    OR v_order.status <> 'completed' THEN
    RAISE EXCEPTION 'tax_invoice_issue_payment_not_completed' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.tax_invoice_issue_jobs (
    tenant_id,
    branch_id,
    order_id,
    payment_id,
    invoice_payload,
    status
  ) VALUES (
    p_tenant_id,
    p_branch_id,
    p_order_id,
    p_payment_id,
    v_payload,
    p_status
  )
  ON CONFLICT (tenant_id, order_id) DO UPDATE
  SET payment_id = EXCLUDED.payment_id,
      status = CASE
        WHEN public.tax_invoice_issue_jobs.status IN ('completed', 'blocked', 'reconcile_required')
          THEN public.tax_invoice_issue_jobs.status
        WHEN EXCLUDED.status = 'queued' THEN 'queued'
        ELSE public.tax_invoice_issue_jobs.status
      END,
      updated_at = now()
  RETURNING * INTO v_job;

  RETURN jsonb_build_object(
    'job_id', v_job.id,
    'status', v_job.status,
    'payment_id', v_job.payment_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_tax_invoice_issue_job_for_payment(
  p_payment_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_payload jsonb;
  v_request_payload jsonb;
  v_status text;
BEGIN
  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;
  IF NOT FOUND OR v_payment.method <> 'vietqr' AND v_payment.method <> 'cash' THEN
    RETURN;
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_payment.order_id
    AND tenant_id = v_payment.tenant_id
    AND branch_id = v_payment.branch_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT request.invoice_payload INTO v_request_payload
  FROM public.self_order_payment_requests request
  WHERE request.tenant_id = v_payment.tenant_id
    AND request.branch_id = v_payment.branch_id
    AND request.order_id = v_payment.order_id
    AND request.payment_id = v_payment.id
    AND request.status IN ('cash_call', 'vietqr_pending', 'completed')
  ORDER BY request.id DESC
  LIMIT 1;

  v_payload := COALESCE(
    v_payment.provider_data -> 'invoiceSnapshot',
    v_payment.provider_data -> 'invoicePayload',
    v_request_payload
  );
  IF v_payload IS NULL THEN
    RETURN;
  END IF;

  v_status := CASE
    WHEN v_payment.status = 'completed'
      AND v_order.payment_status = 'paid'
      AND v_order.status = 'completed'
      THEN 'queued'
    ELSE 'pending_payment'
  END;

  PERFORM private.upsert_tax_invoice_issue_job(
    v_payment.tenant_id,
    v_payment.branch_id,
    v_payment.order_id,
    v_payment.id,
    v_payload,
    v_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_tax_invoice_issue_job_from_payment_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.status = 'pending'
    AND (OLD.provider_data ? 'invoiceSnapshot')
    AND (NEW.provider_data ? 'invoiceSnapshot')
    AND OLD.provider_data -> 'invoiceSnapshot' IS DISTINCT FROM NEW.provider_data -> 'invoiceSnapshot' THEN
    RAISE EXCEPTION 'invoice_snapshot_immutable' USING ERRCODE = '22023';
  END IF;

  IF TG_OP = 'UPDATE'
    AND (OLD.provider_data ? 'invoiceSnapshot')
    AND NOT (NEW.provider_data ? 'invoiceSnapshot') THEN
    NEW.provider_data := COALESCE(NEW.provider_data, '{}'::jsonb)
      || jsonb_build_object('invoiceSnapshot', OLD.provider_data -> 'invoiceSnapshot');
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_tax_invoice_issue_job_after_payment_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM private.sync_tax_invoice_issue_job_for_payment(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_tax_invoice_issue_job_after_order_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_payment_id bigint;
BEGIN
  IF NEW.payment_status = 'paid' AND NEW.status = 'completed' THEN
    SELECT payment.id INTO v_payment_id
    FROM public.payments payment
    WHERE payment.tenant_id = NEW.tenant_id
      AND payment.branch_id = NEW.branch_id
      AND payment.order_id = NEW.id
      AND payment.status = 'completed'
    ORDER BY payment.id DESC
    LIMIT 1;

    IF v_payment_id IS NOT NULL THEN
      PERFORM private.sync_tax_invoice_issue_job_for_payment(v_payment_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_tax_invoice_issue_job_after_self_order_request_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.payment_id IS NOT NULL THEN
    PERFORM private.sync_tax_invoice_issue_job_for_payment(NEW.payment_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payments_tax_invoice_snapshot_before_write
  BEFORE INSERT OR UPDATE OF provider_data, status ON public.payments
  FOR EACH ROW EXECUTE FUNCTION private.sync_tax_invoice_issue_job_from_payment_trigger();

CREATE TRIGGER payments_tax_invoice_issue_job_after_write
  AFTER INSERT OR UPDATE OF provider_data, status ON public.payments
  FOR EACH ROW EXECUTE FUNCTION private.sync_tax_invoice_issue_job_after_payment_trigger();

CREATE TRIGGER orders_tax_invoice_issue_job_after_completion
  AFTER UPDATE OF payment_status, status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.sync_tax_invoice_issue_job_after_order_trigger();

CREATE TRIGGER self_order_requests_tax_invoice_issue_job_after_write
  AFTER INSERT OR UPDATE OF payment_id, invoice_payload, status ON public.self_order_payment_requests
  FOR EACH ROW EXECUTE FUNCTION private.sync_tax_invoice_issue_job_after_self_order_request_trigger();

DROP FUNCTION IF EXISTS public.confirm_vietqr_payment(bigint, bigint, bigint, numeric, uuid);

CREATE OR REPLACE FUNCTION public.confirm_cash_payment_with_invoice_binding(
  p_order_id bigint,
  p_cash_received numeric,
  p_invoice_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_result jsonb;
  v_payment_id bigint;
  v_order public.orders%ROWTYPE;
  v_payload jsonb;
  v_request_payload jsonb;
BEGIN
  v_payload := public.self_order_normalize_invoice_payload(p_invoice_payload);
  v_result := public.confirm_cash_payment_with_invoice_binding(p_order_id, p_cash_received);
  v_payment_id := NULLIF(v_result ->> 'payment_id', '')::bigint;

  IF v_result ->> 'status' NOT IN ('completed', 'already_completed') OR v_payment_id IS NULL THEN
    RETURN v_result;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tax_invoice_issue_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT request.invoice_payload INTO v_request_payload
  FROM public.self_order_payment_requests request
  WHERE request.tenant_id = v_order.tenant_id
    AND request.branch_id = v_order.branch_id
    AND request.order_id = v_order.id
    AND request.payment_id = v_payment_id
    AND request.status = 'completed'
  ORDER BY request.id DESC
  LIMIT 1;

  v_payload := COALESCE(v_request_payload, v_payload);

  UPDATE public.payments
  SET provider_data = COALESCE(provider_data, '{}'::jsonb)
    || jsonb_build_object('invoiceSnapshot', v_payload),
      updated_at = now()
  WHERE id = v_payment_id
    AND tenant_id = v_order.tenant_id;

  PERFORM private.upsert_tax_invoice_issue_job(
    v_order.tenant_id,
    v_order.branch_id,
    v_order.id,
    v_payment_id,
    v_payload,
    'queued'
  );

  RETURN v_result || jsonb_build_object('tax_invoice_job_status', 'queued');
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_tax_invoice_issue_jobs(
  p_limit integer DEFAULT 20,
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
  WHERE job.tax_invoice_id = invoice.id
    AND job.status = 'processing'
    AND job.locked_until < now()
    AND invoice.status IN ('signing', 'submitted');

  RETURN QUERY
  WITH candidates AS (
    SELECT job.id
    FROM public.tax_invoice_issue_jobs job
    WHERE job.status = 'queued'
       OR (job.status = 'processing' AND job.locked_until < now())
    ORDER BY job.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 20)
  ), claimed AS (
    UPDATE public.tax_invoice_issue_jobs job
    SET status = 'processing',
        locked_until = now() + make_interval(secs => LEAST(GREATEST(COALESCE(p_lease_seconds, 300), 30), 900)),
        attempt_count = job.attempt_count + 1,
        updated_at = now()
    FROM candidates
    WHERE job.id = candidates.id
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

CREATE OR REPLACE FUNCTION public.finish_tax_invoice_issue_job_as_system(
  p_job_id bigint,
  p_status text,
  p_last_error text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_job public.tax_invoice_issue_jobs%ROWTYPE;
  v_invoice public.tax_invoices%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('completed', 'blocked', 'reconcile_required', 'queued') THEN
    RAISE EXCEPTION 'invalid_tax_invoice_issue_job_status' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_job FROM public.tax_invoice_issue_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tax_invoice_issue_job_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_job.status <> 'processing' THEN
    RAISE EXCEPTION 'tax_invoice_issue_job_not_processing' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_invoice
  FROM public.tax_invoices invoice
  WHERE invoice.tenant_id = v_job.tenant_id
    AND invoice.order_id = v_job.order_id
    AND invoice.status NOT IN ('cancelled', 'replaced', 'not_required')
  ORDER BY invoice.id DESC
  LIMIT 1;

  IF p_status = 'completed' AND (NOT FOUND OR v_invoice.status <> 'issued') THEN
    RAISE EXCEPTION 'tax_invoice_issue_job_not_issued' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tax_invoice_issue_jobs
  SET status = p_status,
      tax_invoice_id = COALESCE(v_job.tax_invoice_id, v_invoice.id),
      locked_until = NULL,
      last_error = p_last_error,
      updated_at = now()
  WHERE id = v_job.id;

  RETURN jsonb_build_object('job_id', v_job.id, 'status', p_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_tax_invoice_provider_issued(
  p_tax_invoice_id bigint,
  p_provider_ref text,
  p_invoice_number text,
  p_cqt_code text DEFAULT NULL,
  p_provider_data jsonb DEFAULT NULL,
  p_issued_at timestamptz DEFAULT now(),
  p_trigger_source text DEFAULT 'manual'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_invoice public.tax_invoices%ROWTYPE;
  v_before_status text;
BEGIN
  IF p_trigger_source NOT IN ('manual', 'cron') THEN
    RAISE EXCEPTION 'invalid_reconcile_trigger_source' USING ERRCODE = '22023';
  END IF;
  IF auth.role() <> 'service_role' THEN
    IF v_actor IS NULL
      OR v_tenant IS NULL
      OR NOT public.auth_is_owner(v_actor)
      OR NOT public.has_permission_any('settings:tenant')
      OR NOT public.has_permission_any('finance:view') THEN
      RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NULLIF(btrim(p_provider_ref), '') IS NULL
    OR NULLIF(btrim(p_invoice_number), '') IS NULL THEN
    RAISE EXCEPTION 'provider_ref_and_invoice_number_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_invoice
  FROM public.tax_invoices invoice
  WHERE invoice.id = p_tax_invoice_id
    AND (auth.role() = 'service_role' OR invoice.tenant_id = v_tenant)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tax_invoice_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_invoice.status NOT IN ('signing', 'submitted') THEN
    RAISE EXCEPTION 'tax_invoice_reconcile_status_invalid' USING ERRCODE = '22023';
  END IF;
  IF v_invoice.provider_ref IS DISTINCT FROM btrim(p_provider_ref) THEN
    RAISE EXCEPTION 'tax_invoice_provider_ref_mismatch' USING ERRCODE = '22023';
  END IF;

  v_before_status := v_invoice.status;
  UPDATE public.tax_invoices
  SET invoice_number = btrim(p_invoice_number),
      cqt_code = NULLIF(btrim(p_cqt_code), ''),
      provider_data = COALESCE(p_provider_data, provider_data),
      issued_at = COALESCE(p_issued_at, now()),
      status = 'issued',
      updated_at = now()
  WHERE id = v_invoice.id;

  INSERT INTO public.tax_invoice_events (
    tax_invoice_id, tenant_id, from_status, to_status, actor_id, payload, note
  ) VALUES (
    v_invoice.id,
    v_invoice.tenant_id,
    v_before_status,
    'issued',
    v_actor,
    jsonb_build_object(
      'provider_ref', btrim(p_provider_ref),
      'invoice_number', btrim(p_invoice_number),
      'cqt_code', NULLIF(btrim(p_cqt_code), ''),
      'trigger_source', p_trigger_source
    ) || COALESCE(p_provider_data, '{}'::jsonb),
    'Provider-issued invoice reconciled'
  );

  INSERT INTO public.reconcile_run_log (
    tenant_id, branch_id, tax_invoice_id, trigger_source, triggered_by,
    before_status, after_status, provider_returned, outcome, error, attempt_age_seconds
  ) VALUES (
    v_invoice.tenant_id,
    v_invoice.branch_id,
    v_invoice.id,
    p_trigger_source,
    v_actor,
    v_before_status,
    'issued',
    'issued',
    'transitioned',
    NULL,
    GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(v_invoice.signing_started_at, v_invoice.updated_at)))::integer)
  );

  UPDATE public.tax_invoice_issue_jobs
  SET status = 'completed', locked_until = NULL, last_error = NULL, updated_at = now()
  WHERE tenant_id = v_invoice.tenant_id
    AND order_id = v_invoice.order_id
    AND status <> 'completed';

  RETURN jsonb_build_object(
    'id', v_invoice.id,
    'status', 'issued',
    'invoice_number', btrim(p_invoice_number)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_tax_invoice_provider_submission(
  p_tax_invoice_id bigint,
  p_provider_ref text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_invoice public.tax_invoices%ROWTYPE;
BEGIN
  IF v_actor IS NULL
    OR v_tenant IS NULL
    OR NOT public.auth_is_owner(v_actor)
    OR NOT public.has_permission_any('settings:tenant') THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_provider_ref), '') IS NULL THEN
    RAISE EXCEPTION 'provider_ref_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_invoice
  FROM public.tax_invoices invoice
  WHERE invoice.id = p_tax_invoice_id
    AND invoice.tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND OR v_invoice.status <> 'signing' THEN
    RAISE EXCEPTION 'tax_invoice_not_signing' USING ERRCODE = '22023';
  END IF;
  IF v_invoice.provider_ref IS NOT NULL
    AND v_invoice.provider_ref IS DISTINCT FROM btrim(p_provider_ref) THEN
    RAISE EXCEPTION 'tax_invoice_provider_ref_mismatch' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tax_invoices
  SET provider_ref = btrim(p_provider_ref), updated_at = now()
  WHERE id = v_invoice.id;

  RETURN jsonb_build_object('id', v_invoice.id, 'provider_ref', btrim(p_provider_ref));
END;
$$;

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
    OR NOT public.auth_is_owner(v_actor)
    OR NOT public.has_permission_any('settings:tenant') THEN
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
  SET status = 'queued', locked_until = NULL, last_error = NULL, updated_at = now()
  WHERE id = v_job.id;

  RETURN jsonb_build_object('job_id', v_job.id, 'status', 'queued');
END;
$$;

CREATE OR REPLACE FUNCTION public.fetch_tax_invoice_issue_attention()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
BEGIN
  IF v_tenant IS NULL OR NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'forbidden_finance_view' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', job.id,
        'order_id', job.order_id,
        'status', job.status,
        'provider_ref', invoice.provider_ref,
        'last_error', job.last_error,
        'updated_at', job.updated_at,
        'payment_method', payment.method,
        'tax_invoice_id', job.tax_invoice_id
      ) ORDER BY job.updated_at DESC
    )
    FROM public.tax_invoice_issue_jobs job
    LEFT JOIN public.payments payment ON payment.id = job.payment_id
    LEFT JOIN public.tax_invoices invoice ON invoice.id = job.tax_invoice_id
    WHERE job.tenant_id = v_tenant
      AND job.status IN ('blocked', 'reconcile_required')
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_tax_invoice_issue_job_for_completed_order(
  p_order_id bigint,
  p_invoice_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
BEGIN
  IF v_actor IS NULL
    OR v_tenant IS NULL
    OR NOT public.auth_is_owner(v_actor)
    OR NOT public.has_permission_any('settings:tenant') THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND
    OR v_order.payment_status <> 'paid'
    OR v_order.status <> 'completed' THEN
    RAISE EXCEPTION 'tax_invoice_issue_order_not_completed' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE tenant_id = v_order.tenant_id
    AND branch_id = v_order.branch_id
    AND order_id = v_order.id
    AND status = 'completed'
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tax_invoice_issue_payment_not_completed' USING ERRCODE = '22023';
  END IF;

  RETURN private.upsert_tax_invoice_issue_job(
    v_order.tenant_id,
    v_order.branch_id,
    v_order.id,
    v_payment.id,
    p_invoice_payload,
    'queued'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_cash_payment_with_invoice_binding(bigint, numeric, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_cash_payment_with_invoice_binding(bigint, numeric, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.claim_tax_invoice_issue_jobs(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_tax_invoice_issue_jobs(integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.finish_tax_invoice_issue_job_as_system(bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finish_tax_invoice_issue_job_as_system(bigint, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.reconcile_tax_invoice_provider_issued(bigint, text, text, text, jsonb, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_tax_invoice_provider_issued(bigint, text, text, text, jsonb, timestamptz, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.prepare_tax_invoice_provider_submission(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_tax_invoice_provider_submission(bigint, text) TO authenticated;
REVOKE ALL ON FUNCTION public.requeue_tax_invoice_issue_job(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.requeue_tax_invoice_issue_job(bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.fetch_tax_invoice_issue_attention() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_tax_invoice_issue_attention() TO authenticated;
REVOKE ALL ON FUNCTION public.queue_tax_invoice_issue_job_for_completed_order(bigint, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_tax_invoice_issue_job_for_completed_order(bigint, jsonb) TO authenticated;

COMMENT ON TABLE public.tax_invoice_issue_jobs IS 'Durable per-order HĐĐT issuance work. Payment completion queues the job; only the worker calls the provider.';
COMMENT ON TABLE public.reconcile_run_log IS 'Per-attempt HĐĐT reconciliation audit. Provider-issued records are reconciled atomically; no entry authorizes automatic cancellation.';
COMMENT ON COLUMN public.reconcile_run_log.attempt_age_seconds IS 'Age of the provider-bound state at reconciliation time. It never authorizes automatic cancellation.';

COMMIT;
