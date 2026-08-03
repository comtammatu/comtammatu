CREATE OR REPLACE FUNCTION public.save_supplier_invoice_draft(
  p_invoice_id bigint,
  p_invoice jsonb,
  p_lines jsonb,
  p_allocations jsonb,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_raw_discount numeric;
  v_client_subtotal numeric;
  v_client_vat numeric;
  v_client_total numeric;
  v_derived_subtotal numeric;
  v_derived_vat numeric;
  v_derived_total numeric;
BEGIN
  IF p_idempotency_key IS NULL
    OR pg_catalog.jsonb_typeof(p_invoice) <> 'object'
    OR pg_catalog.jsonb_typeof(p_lines) <> 'array'
    OR pg_catalog.jsonb_array_length(p_lines) = 0
    OR pg_catalog.jsonb_array_length(p_lines) > 200
    OR pg_catalog.jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'supplier_invoice_draft_invalid'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_raw_discount := COALESCE(
      (p_invoice->>'document_discount_amount')::numeric,
      0::numeric
    );
    v_client_subtotal := (p_invoice->>'subtotal')::numeric;
    v_client_vat := (p_invoice->>'vat_amount')::numeric;
    v_client_total := (p_invoice->>'total_amount')::numeric;
  EXCEPTION
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'supplier_invoice_header_invalid'
        USING ERRCODE = '22023';
  END;

  IF v_raw_discount <> pg_catalog.round(v_raw_discount, 2)
    OR v_client_subtotal <> pg_catalog.round(v_client_subtotal, 2)
    OR v_client_vat <> pg_catalog.round(v_client_vat, 2)
    OR v_client_total <> pg_catalog.round(v_client_total, 2) THEN
    RAISE EXCEPTION 'supplier_invoice_money_scale_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_to_recordset(p_lines) AS line(
      line_key text,
      ingredient_id bigint,
      description text,
      quantity numeric,
      unit_id bigint,
      unit_price numeric,
      line_discount numeric,
      vat_rate numeric,
      vat_amount numeric,
      line_total numeric
    )
    WHERE line.quantity IS NULL
       OR line.quantity <= 0
       OR line.quantity <> pg_catalog.round(line.quantity, 3)
       OR line.unit_price IS NULL
       OR line.unit_price < 0
       OR line.unit_price <> pg_catalog.round(line.unit_price, 2)
       OR line.line_discount IS NULL
       OR line.line_discount < 0
       OR line.line_discount <> pg_catalog.round(line.line_discount, 2)
       OR line.vat_amount IS NULL
       OR line.vat_amount < 0
       OR line.vat_amount <> pg_catalog.round(line.vat_amount, 2)
       OR line.line_total IS NULL
       OR line.line_total < 0
       OR line.line_total <> pg_catalog.round(line.line_total, 2)
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_to_recordset(p_allocations) AS allocation(
      line_key text,
      grn_id bigint,
      po_id bigint,
      purchase_order_item_id bigint,
      quantity numeric
    )
    WHERE allocation.quantity IS NULL
       OR allocation.quantity <= 0
       OR allocation.quantity
          <> pg_catalog.round(allocation.quantity, 3)
  ) THEN
    RAISE EXCEPTION 'supplier_invoice_money_scale_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_to_recordset(p_lines) AS line(
      quantity numeric,
      unit_price numeric,
      line_discount numeric,
      vat_rate numeric,
      vat_amount numeric,
      line_total numeric
    )
    WHERE line.vat_rate NOT IN (0, 5, 8, 10)
       OR (line.vat_rate = 0 AND line.vat_amount <> 0)
       OR line.line_discount
          > pg_catalog.round(line.quantity * line.unit_price, 2)
       OR line.line_total IS DISTINCT FROM GREATEST(
         pg_catalog.round(line.quantity * line.unit_price, 2)
           - line.line_discount,
         0::numeric
       )
  ) THEN
    RAISE EXCEPTION 'supplier_invoice_line_invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    pg_catalog.sum(line.line_total),
    pg_catalog.sum(line.vat_amount)
  INTO v_derived_subtotal, v_derived_vat
  FROM pg_catalog.jsonb_to_recordset(p_lines) AS line(
    line_total numeric,
    vat_amount numeric
  );
  v_derived_total :=
    v_derived_subtotal - v_raw_discount + v_derived_vat;

  IF v_derived_subtotal <= 0
    OR v_raw_discount < 0
    OR v_raw_discount > v_derived_subtotal
    OR v_derived_total < 0
    OR v_client_subtotal IS DISTINCT FROM v_derived_subtotal
    OR v_client_vat IS DISTINCT FROM v_derived_vat
    OR v_client_total IS DISTINCT FROM v_derived_total THEN
    RAISE EXCEPTION 'supplier_invoice_total_mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN public.save_supplier_invoice_draft_unchecked(
    p_invoice_id,
    p_invoice,
    p_lines,
    p_allocations,
    p_idempotency_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_supplier_invoice_draft(
  bigint,
  jsonb,
  jsonb,
  jsonb,
  uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_supplier_invoice_draft(
  bigint,
  jsonb,
  jsonb,
  jsonb,
  uuid
) TO authenticated, service_role;

COMMENT ON FUNCTION public.save_supplier_invoice_draft(
  bigint,
  jsonb,
  jsonb,
  jsonb,
  uuid
) IS
  'Validates scale-2 invoice money and scale-3 quantity before delegating the atomic draft save.';
