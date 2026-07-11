CREATE OR REPLACE FUNCTION public.transition_tax_invoice_state(
  p_tax_invoice_id bigint,
  p_to_status text,
  p_payload jsonb DEFAULT NULL::jsonb,
  p_note text DEFAULT NULL::text
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_invoice  RECORD;
  v_uid      UUID := auth.uid();
  v_allowed  BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_invoice
  FROM public.tax_invoices
  WHERE id = p_tax_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tax_invoice_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_invoice.tenant_id <> public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_to_status IN ('cancelled', 'replaced') THEN
    IF NOT public.has_permission(NULL, 'settings:tenant') THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.has_permission(v_invoice.branch_id, 'orders:write') THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_allowed := (
    (v_invoice.status = 'draft'     AND p_to_status IN ('signing', 'cancelled'))
    OR (v_invoice.status = 'signing'   AND p_to_status IN ('submitted', 'issued', 'draft', 'cancelled'))
    OR (v_invoice.status = 'submitted' AND p_to_status IN ('issued', 'cancelled'))
    OR (v_invoice.status = 'issued'    AND p_to_status IN ('cancelled', 'replaced'))
  );

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'illegal_transition: % -> %', v_invoice.status, p_to_status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.tax_invoices
  SET
    status = p_to_status,
    issued_at = CASE WHEN p_to_status = 'issued' THEN now() ELSE issued_at END,
    cancelled_at = CASE WHEN p_to_status = 'cancelled' THEN now() ELSE cancelled_at END,
    signing_started_at = CASE WHEN p_to_status = 'signing' THEN now() ELSE signing_started_at END,
    provider_data = CASE
      WHEN p_payload IS NULL THEN provider_data
      ELSE COALESCE(provider_data, '{}'::JSONB) || jsonb_build_object(p_to_status, p_payload)
    END,
    updated_at = now()
  WHERE id = p_tax_invoice_id;

  INSERT INTO public.tax_invoice_events
    (tax_invoice_id, tenant_id, from_status, to_status, actor_id, payload, note)
  VALUES
    (p_tax_invoice_id, v_invoice.tenant_id, v_invoice.status, p_to_status, v_uid, p_payload, p_note);

  RETURN jsonb_build_object(
    'tax_invoice_id', p_tax_invoice_id,
    'from_status', v_invoice.status,
    'to_status', p_to_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_tax_invoice(
  p_old_id bigint,
  p_reason text,
  p_agreement_ref text,
  p_agreement_date timestamp with time zone,
  p_buyer_name text,
  p_buyer_tax_code text,
  p_buyer_address text,
  p_subtotal numeric,
  p_vat_rate numeric,
  p_vat_amount numeric,
  p_total_amount numeric,
  p_provider text
) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_old        RECORD;
  v_actor      UUID;
  v_new_id     BIGINT;
  v_chain_depth INTEGER;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'forbidden_no_auth' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 20 THEN
    RAISE EXCEPTION 'reason_too_short' USING ERRCODE = '23514';
  END IF;
  IF length(p_reason) > 255 THEN
    RAISE EXCEPTION 'reason_too_long' USING ERRCODE = '23514';
  END IF;

  IF p_agreement_ref IS NULL OR length(trim(p_agreement_ref)) = 0 THEN
    RAISE EXCEPTION 'agreement_ref_required' USING ERRCODE = '23514';
  END IF;
  IF length(p_agreement_ref) > 225 THEN
    RAISE EXCEPTION 'agreement_ref_too_long' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_old
  FROM public.tax_invoices
  WHERE id = p_old_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tax_invoice_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_old.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(NULL, 'settings:tenant') THEN
    RAISE EXCEPTION 'permission_denied_settings_tenant' USING ERRCODE = '42501';
  END IF;

  IF v_old.status IS DISTINCT FROM 'issued' THEN
    RAISE EXCEPTION 'only_issued_can_be_replaced' USING ERRCODE = '22023';
  END IF;

  IF v_old.replaced_by IS NOT NULL THEN
    RAISE EXCEPTION 'already_replaced' USING ERRCODE = '22023';
  END IF;

  IF v_old.invoice_kind IS DISTINCT FROM 'per_order' THEN
    RAISE EXCEPTION 'b2c_summary_replace_not_supported' USING ERRCODE = '0A000';
  END IF;

  IF p_agreement_date > now() THEN
    RAISE EXCEPTION 'agreement_date_in_future' USING ERRCODE = '22008';
  END IF;
  IF v_old.issued_at IS NOT NULL AND p_agreement_date < v_old.issued_at THEN
    RAISE EXCEPTION 'agreement_date_before_issued_at' USING ERRCODE = '22008';
  END IF;

  WITH RECURSIVE chain AS (
    SELECT id, replaced_for, 1 AS depth
    FROM public.tax_invoices
    WHERE id = p_old_id
    UNION ALL
    SELECT t.id, t.replaced_for, c.depth + 1
    FROM public.tax_invoices t
    JOIN chain c ON t.id = c.replaced_for
    WHERE c.depth < 10
  )
  SELECT MAX(depth) INTO v_chain_depth FROM chain;

  IF v_chain_depth >= 3 THEN
    RAISE EXCEPTION 'replacement_chain_too_deep_max_3' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tax_invoices
  SET status = 'replaced',
      cancelled_at = now(),
      updated_at = now()
  WHERE id = p_old_id;

  INSERT INTO public.tax_invoices (
    tenant_id, branch_id, order_id,
    status, invoice_kind,
    buyer_name, buyer_tax_code, buyer_address,
    subtotal, vat_rate, vat_amount, total_amount,
    provider, provider_data,
    replaced_for,
    created_by
  )
  VALUES (
    v_old.tenant_id, v_old.branch_id, v_old.order_id,
    'draft', 'per_order',
    p_buyer_name, p_buyer_tax_code, p_buyer_address,
    p_subtotal, p_vat_rate, p_vat_amount, p_total_amount,
    p_provider,
    jsonb_build_object(
      'replace', jsonb_build_object(
        'reason', p_reason,
        'agreement_ref', p_agreement_ref,
        'agreement_date', p_agreement_date,
        'original_invoice_id', v_old.id,
        'original_invoice_number', v_old.invoice_number,
        'original_issued_at', v_old.issued_at,
        'original_provider_ref', v_old.provider_ref
      )
    ),
    p_old_id,
    v_actor
  )
  RETURNING id INTO v_new_id;

  UPDATE public.tax_invoices
  SET replaced_by = v_new_id
  WHERE id = p_old_id;

  INSERT INTO public.tax_invoice_events
    (tax_invoice_id, from_status, to_status, payload, note, actor_id, tenant_id)
  VALUES
    (p_old_id, 'issued', 'replaced',
     jsonb_build_object(
       'reason', p_reason,
       'replaced_by', v_new_id,
       'agreement_ref', p_agreement_ref,
       'agreement_date', p_agreement_date
     ),
     'TT78 §7 replace: ' || p_reason,
     v_actor,
     v_old.tenant_id),
    (v_new_id, NULL, 'draft',
     jsonb_build_object(
       'replaces', p_old_id,
       'original_invoice_number', v_old.invoice_number
     ),
     'Replacement draft for invoice ' || COALESCE(v_old.invoice_number, '#' || p_old_id::TEXT),
     v_actor,
     v_old.tenant_id);

  RETURN v_new_id;
END;
$$;
