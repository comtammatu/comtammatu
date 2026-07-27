ALTER TABLE public.supplier_invoices
  ADD COLUMN vat_breakdown jsonb;

UPDATE public.supplier_invoices
SET vat_breakdown = pg_catalog.jsonb_build_array(
  pg_catalog.jsonb_build_object(
    'vat_rate', vat_rate,
    'taxable_amount', subtotal,
    'vat_amount', vat_amount
  )
);

ALTER TABLE public.supplier_invoices
  ALTER COLUMN vat_breakdown SET DEFAULT '[]'::jsonb,
  ALTER COLUMN vat_breakdown SET NOT NULL,
  ALTER COLUMN vat_rate DROP NOT NULL,
  ALTER COLUMN vat_rate DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.normalize_supplier_invoice_vat_breakdown()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_line jsonb;
  v_rate numeric(5,2);
  v_taxable_amount numeric(15,2);
  v_vat_amount numeric(15,2);
  v_rates numeric[] := ARRAY[]::numeric[];
  v_subtotal numeric(15,2) := 0;
  v_total_vat numeric(15,2) := 0;
  v_line_count integer;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.vat_breakdown IS DISTINCT FROM OLD.vat_breakdown
    OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
    OR NEW.vat_rate IS DISTINCT FROM OLD.vat_rate
    OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount
    OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
  ) THEN
    RAISE EXCEPTION 'supplier_invoice_vat_snapshot_immutable'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.vat_breakdown IS NULL
    OR pg_catalog.jsonb_typeof(NEW.vat_breakdown) <> 'array'
    OR pg_catalog.jsonb_array_length(NEW.vat_breakdown) = 0 THEN
    IF NEW.subtotal IS NULL
      OR NEW.subtotal <= 0
      OR NEW.vat_rate IS NULL
      OR NEW.vat_amount IS NULL THEN
      RAISE EXCEPTION 'supplier_invoice_vat_breakdown_required'
        USING ERRCODE = '22023';
    END IF;

    NEW.vat_breakdown := pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'vat_rate', NEW.vat_rate,
        'taxable_amount', NEW.subtotal,
        'vat_amount', NEW.vat_amount
      )
    );
  END IF;

  IF pg_catalog.jsonb_typeof(NEW.vat_breakdown) <> 'array' THEN
    RAISE EXCEPTION 'invalid_supplier_invoice_vat_breakdown'
      USING ERRCODE = '22023';
  END IF;

  v_line_count := pg_catalog.jsonb_array_length(NEW.vat_breakdown);
  IF v_line_count < 1 OR v_line_count > 4 THEN
    RAISE EXCEPTION 'invalid_supplier_invoice_vat_breakdown_count'
      USING ERRCODE = '22023';
  END IF;

  FOR v_line IN
    SELECT value
    FROM pg_catalog.jsonb_array_elements(NEW.vat_breakdown)
  LOOP
    IF pg_catalog.jsonb_typeof(v_line) <> 'object' THEN
      RAISE EXCEPTION 'invalid_supplier_invoice_vat_breakdown_line'
        USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_rate := (v_line ->> 'vat_rate')::numeric;
      v_taxable_amount := (v_line ->> 'taxable_amount')::numeric;
      v_vat_amount := (v_line ->> 'vat_amount')::numeric;
    EXCEPTION
      WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION 'invalid_supplier_invoice_vat_breakdown_line'
          USING ERRCODE = '22023';
    END;

    IF v_rate IS NULL
      OR v_taxable_amount IS NULL
      OR v_vat_amount IS NULL
      OR NOT v_rate = ANY (ARRAY[0, 5, 8, 10]::numeric[])
      OR v_taxable_amount <= 0
      OR v_vat_amount < 0
      OR (v_rate = 0 AND v_vat_amount <> 0) THEN
      RAISE EXCEPTION 'invalid_supplier_invoice_vat_breakdown_line'
        USING ERRCODE = '22023';
    END IF;

    IF v_rate = ANY (v_rates) THEN
      RAISE EXCEPTION 'duplicate_supplier_invoice_vat_rate'
        USING ERRCODE = '22023';
    END IF;

    v_rates := pg_catalog.array_append(v_rates, v_rate);
    v_subtotal := v_subtotal + v_taxable_amount;
    v_total_vat := v_total_vat + v_vat_amount;
  END LOOP;

  NEW.subtotal := pg_catalog.round(v_subtotal, 2);
  NEW.vat_amount := pg_catalog.round(v_total_vat, 2);
  NEW.total_amount := NEW.subtotal + NEW.vat_amount;
  NEW.vat_rate := CASE WHEN v_line_count = 1 THEN v_rates[1] ELSE NULL END;

  SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'vat_rate', line.vat_rate,
      'taxable_amount', line.taxable_amount,
      'vat_amount', line.vat_amount
    )
    ORDER BY line.vat_rate
  )
  INTO NEW.vat_breakdown
  FROM pg_catalog.jsonb_to_recordset(NEW.vat_breakdown) AS line(
    vat_rate numeric,
    taxable_amount numeric,
    vat_amount numeric
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_supplier_invoices_normalize_vat_breakdown
BEFORE INSERT OR UPDATE OF vat_breakdown, subtotal, vat_rate, vat_amount, total_amount
ON public.supplier_invoices
FOR EACH ROW
EXECUTE FUNCTION public.normalize_supplier_invoice_vat_breakdown();

CREATE OR REPLACE FUNCTION public.create_supplier_invoice_with_vat_breakdown(
  p_supplier_id bigint,
  p_grn_id bigint,
  p_po_id bigint,
  p_invoice_number text,
  p_invoice_date date,
  p_vat_breakdown jsonb,
  p_matching_notes text,
  p_due_date date
) RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
  v_tenant_id bigint := public.auth_tenant_id();
  v_user_id uuid := auth.uid();
  v_payment_terms_days integer;
  v_effective_po_id bigint := p_po_id;
  v_due_date date := p_due_date;
  v_grn record;
  v_invoice_id bigint;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('procurement:invoice_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT payment_terms_days
  INTO v_payment_terms_days
  FROM public.suppliers
  WHERE id = p_supplier_id
    AND tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'supplier_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_grn_id IS NOT NULL THEN
    SELECT supplier_id, po_id, status
    INTO v_grn
    FROM public.goods_received_notes
    WHERE id = p_grn_id
      AND tenant_id = v_tenant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_grn.status <> 'confirmed' THEN
      RAISE EXCEPTION 'grn_not_confirmed' USING ERRCODE = '22023';
    END IF;
    IF v_grn.supplier_id IS DISTINCT FROM p_supplier_id THEN
      RAISE EXCEPTION 'grn_supplier_mismatch' USING ERRCODE = '22023';
    END IF;
    IF p_po_id IS NOT NULL AND p_po_id IS DISTINCT FROM v_grn.po_id THEN
      RAISE EXCEPTION 'po_grn_mismatch' USING ERRCODE = '22023';
    END IF;

    v_effective_po_id := v_grn.po_id;
  ELSIF p_po_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.purchase_orders
    WHERE id = p_po_id
      AND tenant_id = v_tenant_id
      AND supplier_id = p_supplier_id
  ) THEN
    RAISE EXCEPTION 'po_supplier_mismatch' USING ERRCODE = '22023';
  END IF;

  IF v_due_date IS NULL
    AND v_payment_terms_days IS NOT NULL
    AND v_payment_terms_days > 0 THEN
    v_due_date := p_invoice_date + v_payment_terms_days;
  END IF;

  INSERT INTO public.supplier_invoices (
    tenant_id,
    supplier_id,
    grn_id,
    po_id,
    invoice_number,
    invoice_date,
    subtotal,
    vat_rate,
    vat_amount,
    total_amount,
    vat_breakdown,
    matching_notes,
    created_by,
    due_date,
    payment_status
  ) VALUES (
    v_tenant_id,
    p_supplier_id,
    p_grn_id,
    v_effective_po_id,
    p_invoice_number,
    p_invoice_date,
    0,
    NULL,
    0,
    0,
    p_vat_breakdown,
    NULLIF(pg_catalog.btrim(p_matching_notes), ''),
    v_user_id,
    v_due_date,
    'unpaid'
  )
  RETURNING id INTO v_invoice_id;

  RETURN v_invoice_id;
END;
$$;

COMMENT ON COLUMN public.supplier_invoices.vat_breakdown IS
  'Immutable input-VAT summary by rate. Header subtotal, VAT and total are derived from this snapshot.';
COMMENT ON COLUMN public.supplier_invoices.vat_rate IS
  'Single VAT rate for compatibility; NULL when vat_breakdown contains multiple rates.';
COMMENT ON FUNCTION public.normalize_supplier_invoice_vat_breakdown() IS
  'Validates each supplier-invoice VAT bucket and derives header totals before persistence.';
COMMENT ON FUNCTION public.create_supplier_invoice_with_vat_breakdown(
  bigint, bigint, bigint, text, date, jsonb, text, date
) IS
  'Creates one tenant-scoped supplier invoice with an immutable multi-rate input-VAT breakdown.';

REVOKE ALL ON FUNCTION public.normalize_supplier_invoice_vat_breakdown()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_supplier_invoice_with_vat_breakdown(
  bigint, bigint, bigint, text, date, jsonb, text, date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_supplier_invoice_with_vat_breakdown(
  bigint, bigint, bigint, text, date, jsonb, text, date
) TO authenticated;
