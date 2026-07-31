BEGIN;

-- Supplier invoice line entry switches from VAT-inclusive (gross-first) evidence
-- to additive VAT: unit_price is now the NET (pre-VAT) price, VAT is added on top,
-- and gross_line_total = line_total + vat_amount. The pricing_mode selector and the
-- gross_unit_price mirror column are no longer sources of truth and are removed.

UPDATE public.supplier_invoice_lines
SET unit_price = CASE
    WHEN quantity > 0 THEN pg_catalog.round(
        (line_total + line_discount_amount) / quantity,
        2
    )
    ELSE unit_price
END
WHERE unit_price IS DISTINCT FROM CASE
    WHEN quantity > 0 THEN pg_catalog.round(
        (line_total + line_discount_amount) / quantity,
        2
    )
    ELSE unit_price
END;

ALTER TABLE public.supplier_invoice_lines
  DROP CONSTRAINT IF EXISTS supplier_invoice_lines_pricing_mode_check,
  DROP CONSTRAINT IF EXISTS supplier_invoice_lines_gross_unit_price_check,
  DROP CONSTRAINT IF EXISTS supplier_invoice_lines_gross_line_total_check;

ALTER TABLE public.supplier_invoice_lines
  ADD CONSTRAINT supplier_invoice_lines_gross_line_total_check CHECK (
    gross_line_total >= 0
      AND line_total >= 0
      AND vat_amount <= gross_line_total
      AND gross_line_total = line_total + vat_amount
  );

CREATE OR REPLACE FUNCTION private.enforce_supplier_invoice_gross_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_line public.supplier_invoice_lines%ROWTYPE;
  v_expected_net numeric(15,2);
BEGIN
  SELECT line.*
  INTO v_line
  FROM public.supplier_invoice_lines AS line
  WHERE line.id = NEW.id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_expected_net := GREATEST(
    pg_catalog.round(
      v_line.quantity * v_line.unit_price,
      2
    ) - v_line.line_discount_amount,
    0::numeric
  );

  IF v_line.unit_price < 0
     OR v_line.line_discount_amount < 0
     OR v_line.line_discount_amount
        > pg_catalog.round(v_line.quantity * v_line.unit_price, 2)
     OR pg_catalog.abs(v_line.line_total - v_expected_net) > 1
     OR v_line.gross_line_total IS NULL
     OR v_line.gross_line_total < 0
     OR v_line.gross_line_total IS DISTINCT FROM v_line.line_total + v_line.vat_amount
     OR v_line.vat_amount < 0
     OR v_line.vat_amount > v_line.gross_line_total
     OR (v_line.vat_rate = 0 AND v_line.vat_amount <> 0)
     OR v_line.vat_rate NOT IN (0, 5, 8, 10) THEN
    RAISE EXCEPTION 'supplier_invoice_gross_contract_invalid'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_supplier_invoice_gross_contract()
  FROM PUBLIC, anon, authenticated;

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
  v_derived_gross numeric;
  v_derived_total numeric;
  v_result jsonb;
  v_invoice_id bigint;
  v_updated_count integer;
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
      quantity numeric,
      unit_price numeric,
      gross_line_total numeric,
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
       OR line.gross_line_total IS NULL
       OR line.gross_line_total < 0
       OR line.gross_line_total <> pg_catalog.round(line.gross_line_total, 2)
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
      quantity numeric
    )
    WHERE allocation.quantity IS NULL
       OR allocation.quantity <= 0
       OR allocation.quantity <> pg_catalog.round(allocation.quantity, 3)
  ) THEN
    RAISE EXCEPTION 'supplier_invoice_money_scale_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_to_recordset(p_lines) AS line(
      quantity numeric,
      unit_price numeric,
      gross_line_total numeric,
      line_discount numeric,
      vat_rate numeric,
      vat_amount numeric,
      line_total numeric
    )
    WHERE line.vat_rate NOT IN (0, 5, 8, 10)
       OR (line.vat_rate = 0 AND line.vat_amount <> 0)
       OR line.line_discount
          > pg_catalog.round(line.quantity * line.unit_price, 2)
       OR pg_catalog.abs(
          line.line_total
            - GREATEST(
              pg_catalog.round(line.quantity * line.unit_price, 2) - line.line_discount,
              0::numeric
            )
       ) > 1
       OR line.gross_line_total
          IS DISTINCT FROM line.line_total + line.vat_amount
  ) THEN
    RAISE EXCEPTION 'supplier_invoice_line_invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    pg_catalog.sum(line.line_total),
    pg_catalog.sum(line.vat_amount),
    pg_catalog.sum(line.gross_line_total)
  INTO v_derived_subtotal, v_derived_vat, v_derived_gross
  FROM pg_catalog.jsonb_to_recordset(p_lines) AS line(
    line_total numeric,
    vat_amount numeric,
    gross_line_total numeric
  );
  v_derived_total := v_derived_gross - v_raw_discount;

  IF v_derived_subtotal <= 0
    OR v_derived_gross
       IS DISTINCT FROM v_derived_subtotal + v_derived_vat
    OR v_raw_discount < 0
    OR v_raw_discount > v_derived_subtotal
    OR v_derived_total < 0
    OR v_client_subtotal IS DISTINCT FROM v_derived_subtotal
    OR v_client_vat IS DISTINCT FROM v_derived_vat
    OR v_client_total IS DISTINCT FROM v_derived_total THEN
    RAISE EXCEPTION 'supplier_invoice_total_mismatch'
      USING ERRCODE = '23514';
  END IF;

  v_result := public.save_supplier_invoice_draft_unchecked(
    p_invoice_id,
    p_invoice,
    p_lines,
    p_allocations,
    p_idempotency_key
  );

  IF COALESCE((v_result->>'replayed')::boolean, FALSE) THEN
    RETURN v_result;
  END IF;

  v_invoice_id := (v_result->>'invoice_id')::bigint;

  UPDATE public.supplier_invoice_lines AS stored
  SET gross_line_total = source.gross_line_total,
      line_discount_amount = source.line_discount
  FROM pg_catalog.jsonb_to_recordset(p_lines) AS source(
    line_key text,
    gross_line_total numeric,
    line_discount numeric
  )
  WHERE stored.supplier_invoice_id = v_invoice_id
    AND stored.tenant_id = public.auth_tenant_id()
    AND stored.source_line_key = source.line_key;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> pg_catalog.jsonb_array_length(p_lines) THEN
    RAISE EXCEPTION 'supplier_invoice_line_update_mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN v_result;
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
  'Validates additive-VAT supplier invoice lines: net unit_price, line_total = qty*unit_price - discount, gross_line_total = line_total + vat_amount.';

ALTER TABLE public.supplier_invoice_lines
  DROP COLUMN IF EXISTS pricing_mode,
  DROP COLUMN IF EXISTS gross_unit_price;

COMMIT;
