CREATE OR REPLACE FUNCTION public.attach_supplier_invoice_vat_evidence(
  p_invoice_id bigint,
  p_storage_path text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_path text := NULLIF(pg_catalog.btrim(p_storage_path), '');
  v_prefix text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT (
      public.auth_is_owner(v_uid)
      OR public.has_position('accountant')
    )
    OR NOT (
      public.has_permission_any('finance:ap_pay')
      OR public.has_permission_any('procurement:invoice_create')
    ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_invoice_id IS NULL OR v_path IS NULL THEN
    RAISE EXCEPTION 'invalid_vat_invoice_attachment' USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.char_length(v_path) > 500
     OR v_path ~ '[[:space:]]'
     OR v_path LIKE '%..%' THEN
    RAISE EXCEPTION 'invalid_vat_invoice_attachment_path' USING ERRCODE = '22023';
  END IF;

  v_prefix := v_tenant::text || '/';
  IF v_path NOT LIKE v_prefix || '%' THEN
    RAISE EXCEPTION 'vat_invoice_attachment_tenant_mismatch'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.supplier_invoices AS si
  SET vat_invoice_attachment_path = v_path,
      updated_at = pg_catalog.now()
  WHERE si.id = p_invoice_id
    AND si.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_supplier_invoice_vat_evidence(bigint, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_supplier_invoice_vat_evidence(bigint, text)
  TO authenticated, service_role;
