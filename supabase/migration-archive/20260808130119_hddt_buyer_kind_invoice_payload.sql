-- Explicit buyerKind on invoice payloads so personal MST never maps to Viettel
-- buyerLegalName. Preserve kind through normalize; validate receipt-QR submit by kind.

CREATE OR REPLACE FUNCTION public.self_order_normalize_invoice_payload(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
  v_buyer_name text := btrim(COALESCE(v_payload ->> 'buyerName', ''));
  v_tax_code text := btrim(COALESCE(v_payload ->> 'buyerTaxCode', ''));
  v_address text := btrim(COALESCE(v_payload ->> 'buyerAddress', ''));
  v_email text := btrim(COALESCE(v_payload ->> 'buyerEmail', ''));
  v_kind text := lower(btrim(COALESCE(v_payload ->> 'buyerKind', '')));
  v_not_get boolean := COALESCE((v_payload ->> 'buyerNotGetInvoice')::boolean, false);
BEGIN
  IF v_not_get
     OR (v_buyer_name = '' AND v_tax_code = '' AND v_address = '' AND v_email = '') THEN
    RETURN jsonb_build_object(
      'buyerName', 'Bán cho người tiêu dùng',
      'buyerNotGetInvoice', true,
      'buyerKind', 'consumer'
    );
  END IF;

  IF v_kind = '' THEN
    -- Legacy payloads without buyerKind: tax present → business, else individual.
    IF v_tax_code <> '' THEN
      v_kind := 'business';
    ELSE
      v_kind := 'individual';
    END IF;
  END IF;

  IF v_kind NOT IN ('business', 'individual') THEN
    RAISE EXCEPTION 'invalid_invoice_payload' USING ERRCODE = '22023';
  END IF;

  IF v_kind = 'business' THEN
    IF v_tax_code = '' OR v_buyer_name = '' OR v_address = '' THEN
      RAISE EXCEPTION 'invalid_invoice_payload' USING ERRCODE = '22023';
    END IF;
  ELSIF v_kind = 'individual' THEN
    IF v_buyer_name = '' THEN
      RAISE EXCEPTION 'invalid_invoice_payload' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'buyerName', NULLIF(v_buyer_name, ''),
    'buyerTaxCode', NULLIF(v_tax_code, ''),
    'buyerAddress', NULLIF(v_address, ''),
    'buyerEmail', NULLIF(v_email, ''),
    'buyerNotGetInvoice', false,
    'buyerKind', v_kind
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_invoice_buyer_request_as_system(
  p_token_hash text,
  p_invoice_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_request public.tax_invoice_buyer_requests%ROWTYPE;
  v_job public.tax_invoice_issue_jobs%ROWTYPE;
  v_invoice public.tax_invoices%ROWTYPE;
  v_buyer_payload jsonb;
  v_payload jsonb;
  v_existing_job_id bigint;
  v_kind text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request
  FROM public.tax_invoice_buyer_requests request
  WHERE request.token_hash = p_token_hash
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_buyer_request_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_request.status = 'submitted' THEN
    SELECT job.id
    INTO v_existing_job_id
    FROM public.tax_invoice_issue_jobs job
    WHERE job.tenant_id = v_request.tenant_id
      AND job.order_id = v_request.order_id;
    RETURN jsonb_build_object(
      'status', 'submitted',
      'jobId', v_existing_job_id
    );
  END IF;
  IF v_request.status = 'expired' THEN
    RETURN jsonb_build_object('status', 'expired');
  END IF;
  IF v_request.expires_at <= now() THEN
    UPDATE public.tax_invoice_buyer_requests
    SET status = 'expired',
        closed_at = now(),
        close_reason = 'deadline_elapsed',
        updated_at = now()
    WHERE id = v_request.id;
    RETURN jsonb_build_object('status', 'expired');
  END IF;

  SELECT * INTO v_job
  FROM public.tax_invoice_issue_jobs job
  WHERE job.tenant_id = v_request.tenant_id
    AND job.order_id = v_request.order_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_job.status <> 'queued'
    OR v_job.tax_invoice_id IS NULL THEN
    RAISE EXCEPTION 'invoice_buyer_request_closed' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_invoice
  FROM public.tax_invoices invoice
  WHERE invoice.id = v_job.tax_invoice_id
    AND invoice.tenant_id = v_request.tenant_id
    AND invoice.order_id = v_request.order_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_invoice.status <> 'draft'
    OR v_invoice.invoice_number IS NOT NULL THEN
    RAISE EXCEPTION 'invoice_buyer_request_closed' USING ERRCODE = '55000';
  END IF;

  v_buyer_payload := public.self_order_normalize_invoice_payload(p_invoice_payload);
  v_kind := COALESCE(v_buyer_payload ->> 'buyerKind', '');

  IF v_buyer_payload->>'buyerNotGetInvoice' = 'true'
    OR jsonb_typeof(v_job.invoice_payload -> 'draftSnapshot') IS DISTINCT FROM 'object'
    OR COALESCE(v_buyer_payload->>'buyerName', '') = ''
    OR COALESCE(v_buyer_payload->>'buyerEmail', '') = ''
    OR v_kind NOT IN ('business', 'individual')
    OR (
      v_kind = 'business'
      AND (
        COALESCE(v_buyer_payload->>'buyerTaxCode', '') = ''
        OR COALESCE(v_buyer_payload->>'buyerAddress', '') = ''
      )
    )
  THEN
    RAISE EXCEPTION 'invoice_buyer_request_invalid_payload' USING ERRCODE = '22023';
  END IF;

  v_payload := v_buyer_payload || jsonb_build_object(
    'draftSnapshot',
    v_job.invoice_payload -> 'draftSnapshot'
  );

  UPDATE public.tax_invoices
  SET buyer_name = v_buyer_payload ->> 'buyerName',
      buyer_tax_code = v_buyer_payload ->> 'buyerTaxCode',
      buyer_address = v_buyer_payload ->> 'buyerAddress',
      buyer_email = NULLIF(v_buyer_payload ->> 'buyerEmail', ''),
      updated_at = now()
  WHERE id = v_invoice.id;

  INSERT INTO public.tax_invoice_events (
    tax_invoice_id,
    tenant_id,
    from_status,
    to_status,
    actor_id,
    payload,
    note
  ) VALUES (
    v_invoice.id,
    v_invoice.tenant_id,
    'draft',
    'draft',
    NULL,
    jsonb_build_object(
      'buyer_tax_code', v_buyer_payload ->> 'buyerTaxCode',
      'buyer_name', v_buyer_payload ->> 'buyerName',
      'buyer_kind', v_kind,
      'source', 'receipt_qr'
    ),
    'Buyer details confirmed from receipt QR'
  );

  UPDATE public.tax_invoice_buyer_requests
  SET status = 'submitted',
      submitted_payload = v_buyer_payload,
      submitted_at = now(),
      closed_at = now(),
      close_reason = 'queue_submitted',
      updated_at = now()
  WHERE id = v_request.id;

  UPDATE public.tax_invoice_issue_jobs
  SET invoice_payload = v_payload,
      available_at = now(),
      updated_at = now()
  WHERE id = v_job.id;

  RETURN jsonb_build_object(
    'status', 'submitted',
    'jobId', v_job.id,
    'taxInvoiceId', v_invoice.id
  );
END;
$$;

DROP FUNCTION IF EXISTS public.reserve_tax_invoice_replacement(
  bigint, text, text, timestamp with time zone, text, text, text
);

CREATE FUNCTION public.reserve_tax_invoice_replacement(
  p_old_id bigint,
  p_reason text,
  p_agreement_ref text,
  p_agreement_date timestamp with time zone,
  p_buyer_name text,
  p_buyer_tax_code text,
  p_buyer_address text,
  p_buyer_kind text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_old public.tax_invoices%ROWTYPE;
  v_actor uuid := auth.uid();
  v_new_id bigint;
  v_payload jsonb;
  v_payment_id bigint;
  v_buyer_name text := COALESCE(p_buyer_name, '');
  v_tax_code text := NULLIF(btrim(COALESCE(p_buyer_tax_code, '')), '');
  v_address text := NULLIF(btrim(COALESCE(p_buyer_address, '')), '');
  v_kind text := lower(btrim(COALESCE(p_buyer_kind, '')));
  v_not_get boolean;
BEGIN
  IF v_actor IS NULL
    OR NOT (public.auth_is_owner(v_actor) OR public.has_position('accountant'))
    OR NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'replacement_forbidden' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL OR length(btrim(p_reason)) < 20
    OR length(p_reason) > 255
    OR NULLIF(btrim(p_agreement_ref), '') IS NULL
    OR length(p_agreement_ref) > 225 THEN
    RAISE EXCEPTION 'replacement_reference_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_old
  FROM public.tax_invoices
  WHERE id = p_old_id
  FOR UPDATE;
  IF v_old.id IS NULL OR v_old.tenant_id IS DISTINCT FROM public.auth_tenant_id()
    OR v_old.status <> 'issued' OR v_old.replaced_by IS NOT NULL
    OR v_old.invoice_kind <> 'per_order' OR v_old.invoice_snapshot IS NULL THEN
    RAISE EXCEPTION 'replacement_original_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_agreement_date > now()
    OR (v_old.issued_at IS NOT NULL AND p_agreement_date < v_old.issued_at) THEN
    RAISE EXCEPTION 'replacement_agreement_date_invalid'
      USING ERRCODE = '22008';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tax_invoices
    WHERE replaced_for = v_old.id
      AND status IN ('draft', 'signing', 'submitted', 'issued')
  ) THEN
    RAISE EXCEPTION 'replacement_already_pending' USING ERRCODE = '55000';
  END IF;

  v_not_get :=
    NULLIF(btrim(v_buyer_name), '') IS NULL
    AND v_tax_code IS NULL
    AND v_address IS NULL;

  IF v_not_get THEN
    v_kind := 'consumer';
  ELSIF v_kind = '' THEN
    IF v_tax_code IS NOT NULL THEN
      v_kind := 'business';
    ELSE
      v_kind := 'individual';
    END IF;
  ELSIF v_kind NOT IN ('business', 'individual', 'consumer') THEN
    RAISE EXCEPTION 'replacement_buyer_kind_invalid' USING ERRCODE = '22023';
  END IF;

  IF v_kind = 'business'
    AND (v_tax_code IS NULL OR NULLIF(btrim(v_buyer_name), '') IS NULL) THEN
    RAISE EXCEPTION 'replacement_buyer_invalid' USING ERRCODE = '22023';
  END IF;
  IF v_kind = 'individual' AND NULLIF(btrim(v_buyer_name), '') IS NULL THEN
    RAISE EXCEPTION 'replacement_buyer_invalid' USING ERRCODE = '22023';
  END IF;

  v_payload := jsonb_set(
    v_old.invoice_snapshot - 'submissionSnapshot',
    '{draftSnapshot,invoiceTime}',
    to_jsonb(now()),
    true
  ) || jsonb_strip_nulls(jsonb_build_object(
    'buyerName', NULLIF(btrim(v_buyer_name), ''),
    'buyerTaxCode', v_tax_code,
    'buyerAddress', v_address,
    'buyerNotGetInvoice', v_not_get,
    'buyerKind', v_kind,
    'replacement',
      jsonb_build_object(
        'originalInvoiceNumber', v_old.invoice_number,
        'originalIssuedAt', v_old.issued_at,
        'originalInvoiceType', '1',
        'originalTemplateCode', split_part(v_old.template_code, '/', 1),
        'reason', p_reason,
        'agreementRef', p_agreement_ref,
        'agreementDate', p_agreement_date
      )
  ));

  INSERT INTO public.tax_invoices (
    tenant_id, branch_id, order_id, status, invoice_kind,
    buyer_name, buyer_tax_code, buyer_address,
    subtotal, vat_rate, vat_amount, total_amount,
    provider, replaced_for, created_by,
    invoice_profile_id, invoice_profile_version, template_code, invoice_series,
    seller_name, seller_tax_code, seller_address, invoice_snapshot
  ) VALUES (
    v_old.tenant_id, v_old.branch_id, v_old.order_id, 'draft', 'per_order',
    NULLIF(btrim(v_buyer_name), ''), v_tax_code, v_address,
    v_old.subtotal, NULL, v_old.vat_amount, v_old.total_amount,
    v_old.provider, v_old.id, v_actor,
    v_old.invoice_profile_id, v_old.invoice_profile_version,
    v_old.template_code, v_old.invoice_series,
    v_old.seller_name, v_old.seller_tax_code, v_old.seller_address, v_payload
  ) RETURNING id INTO v_new_id;

  SELECT payment_id INTO v_payment_id
  FROM public.tax_invoice_issue_jobs
  WHERE tax_invoice_id = v_old.id
  ORDER BY id DESC LIMIT 1;

  INSERT INTO public.tax_invoice_issue_jobs (
    tenant_id, branch_id, order_id, payment_id, invoice_payload,
    tax_invoice_id, status, available_at, operation
  ) VALUES (
    v_old.tenant_id, v_old.branch_id, v_old.order_id, v_payment_id, v_payload,
    v_new_id, 'queued', now(), 'replace'
  );

  INSERT INTO public.tax_invoice_events (
    tax_invoice_id, tenant_id, from_status, to_status, actor_id, payload, note
  ) VALUES (
    v_new_id, v_old.tenant_id, NULL, 'draft', v_actor,
    jsonb_build_object('replaces', v_old.id, 'buyer_kind', v_kind),
    'Replacement reserved; original remains issued'
  );
  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_tax_invoice_replacement(
  bigint, text, text, timestamp with time zone, text, text, text, text
) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reserve_tax_invoice_replacement(
  bigint, text, text, timestamp with time zone, text, text, text, text
) TO authenticated;
GRANT ALL ON FUNCTION public.reserve_tax_invoice_replacement(
  bigint, text, text, timestamp with time zone, text, text, text, text
) TO service_role;
