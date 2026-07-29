-- New inventory document codes include their VN business date.
-- Existing codes and year-scoped counter rows remain unchanged.

CREATE OR REPLACE FUNCTION public.next_inventory_doc_number(
  p_tenant_id bigint,
  p_doc_kind text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_year smallint;
  v_seq bigint;
  v_prefix text;
  v_kind text :=
    pg_catalog.lower(pg_catalog.btrim(COALESCE(p_doc_kind, '')));
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id <= 0 THEN
    RAISE EXCEPTION 'next_inventory_doc_number: invalid tenant_id'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (
       public.auth_tenant_id() IS NULL
       OR public.auth_tenant_id() <> p_tenant_id
     ) THEN
    RAISE EXCEPTION 'next_inventory_doc_number: tenant scope mismatch'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_prefix := CASE v_kind
    WHEN 'grn' THEN 'GRN'
    WHEN 'transfer' THEN 'DC'
    WHEN 'issue' THEN 'PXK'
    WHEN 'waste' THEN 'HH'
    WHEN 'production' THEN 'LSX'
    WHEN 'stocktake' THEN 'KK'
    WHEN 'count_slip' THEN 'PD'
    WHEN 'stock_request' THEN 'YC'
    ELSE NULL
  END;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'next_inventory_doc_number: invalid doc_kind'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_year := EXTRACT(
    year FROM (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')
  )::smallint;

  INSERT INTO public.tenant_inventory_doc_counters (
    tenant_id, doc_kind, year, next_seq, updated_at
  )
  VALUES (p_tenant_id, v_kind, v_year, 2, now())
  ON CONFLICT (tenant_id, doc_kind, year) DO UPDATE
  SET next_seq =
        public.tenant_inventory_doc_counters.next_seq + 1,
      updated_at = now()
  RETURNING public.tenant_inventory_doc_counters.next_seq - 1
  INTO v_seq;

  RETURN v_prefix
    || '-'
    || pg_catalog.to_char(
      now() AT TIME ZONE 'Asia/Ho_Chi_Minh',
      'DDMMYYYY'
    )
    || '-'
    || pg_catalog.lpad(v_seq::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.next_po_display_id(
  p_tenant_id bigint
) RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_year smallint;
  v_seq bigint;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id <= 0 THEN
    RAISE EXCEPTION 'next_po_display_id: invalid tenant_id'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF public.auth_tenant_id() IS NULL
     OR public.auth_tenant_id() <> p_tenant_id THEN
    RAISE EXCEPTION 'next_po_display_id: tenant scope mismatch'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_year := EXTRACT(
    year FROM (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')
  )::smallint;

  INSERT INTO public.tenant_po_counters (
    tenant_id, year, next_seq, updated_at
  )
  VALUES (p_tenant_id, v_year, 2, now())
  ON CONFLICT (tenant_id, year) DO UPDATE
  SET next_seq = public.tenant_po_counters.next_seq + 1,
      updated_at = now()
  RETURNING (
    CASE
      WHEN xmax::text::int = 0 THEN 1
      ELSE public.tenant_po_counters.next_seq - 1
    END
  )
  INTO v_seq;

  RETURN 'PO-'
    || pg_catalog.to_char(
      now() AT TIME ZONE 'Asia/Ho_Chi_Minh',
      'DDMMYYYY'
    )
    || '-'
    || pg_catalog.lpad(v_seq::text, 4, '0');
END;
$$;

COMMENT ON TABLE public.tenant_inventory_doc_counters IS
  'Per-tenant per-kind per-year sequence for inventory document codes (PREFIX-DDMMYYYY-####). Date scoped to Asia/Ho_Chi_Minh. Updated by next_inventory_doc_number.';

COMMENT ON FUNCTION public.next_inventory_doc_number(bigint, text) IS
  'Atomically allocates PREFIX-DDMMYYYY-#### for new inventory documents using the VN business date and a tenant/kind/year sequence.';

COMMENT ON FUNCTION public.next_po_display_id(bigint) IS
  'Atomically allocates PO-DDMMYYYY-#### using the VN business date and a tenant/year sequence.';
