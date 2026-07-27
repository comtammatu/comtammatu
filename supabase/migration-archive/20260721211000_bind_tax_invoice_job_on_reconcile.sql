BEGIN;

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
  SET status = 'completed',
      tax_invoice_id = COALESCE(tax_invoice_id, v_invoice.id),
      locked_until = NULL,
      last_error = NULL,
      updated_at = now()
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

UPDATE public.tax_invoice_issue_jobs job
SET tax_invoice_id = invoice.id,
    updated_at = now()
FROM public.tax_invoices invoice
WHERE job.status = 'completed'
  AND job.tax_invoice_id IS NULL
  AND invoice.tenant_id = job.tenant_id
  AND invoice.order_id = job.order_id
  AND invoice.status = 'issued'
  AND NOT EXISTS (
    SELECT 1
    FROM public.tax_invoices other
    WHERE other.tenant_id = invoice.tenant_id
      AND other.order_id = invoice.order_id
      AND other.status = 'issued'
      AND other.id <> invoice.id
  );

REVOKE ALL ON FUNCTION private.upsert_tax_invoice_issue_job(bigint, bigint, bigint, bigint, jsonb, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_cash_payment_with_invoice_binding(bigint, numeric)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_tax_invoice_provider_issued(bigint, text, text, text, jsonb, timestamptz, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_tax_invoice_provider_issued(bigint, text, text, text, jsonb, timestamptz, text)
  TO authenticated, service_role;

COMMIT;
