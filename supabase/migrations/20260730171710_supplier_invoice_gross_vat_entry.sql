BEGIN;

ALTER TABLE public.supplier_invoice_lines
  ADD COLUMN pricing_mode text,
  ADD COLUMN gross_unit_price numeric(15,2),
  ADD COLUMN gross_line_total numeric(15,2);

UPDATE public.supplier_invoice_lines
SET pricing_mode = 'gross_total',
    gross_line_total = line_total + vat_amount,
    gross_unit_price = CASE
      WHEN quantity > 0 THEN pg_catalog.round(
        (line_total + vat_amount + line_discount_amount) / quantity,
        2
      )
      ELSE 0
    END;

ALTER TABLE public.supplier_invoice_lines
  ADD CONSTRAINT supplier_invoice_lines_pricing_mode_check
    CHECK (pricing_mode IN ('gross_total', 'unit_price')),
  ADD CONSTRAINT supplier_invoice_lines_gross_unit_price_check
    CHECK (gross_unit_price >= 0),
  ADD CONSTRAINT supplier_invoice_lines_gross_line_total_check
    CHECK (
      gross_line_total >= 0
      AND vat_amount <= gross_line_total
      AND line_total = gross_line_total - vat_amount
    );

CREATE OR REPLACE FUNCTION private.enforce_supplier_invoice_gross_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_line public.supplier_invoice_lines%ROWTYPE;
BEGIN
  SELECT line.*
  INTO v_line
  FROM public.supplier_invoice_lines AS line
  WHERE line.id = NEW.id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_line.pricing_mode NOT IN ('gross_total', 'unit_price')
     OR v_line.gross_unit_price IS NULL
     OR v_line.gross_unit_price < 0
     OR v_line.gross_line_total IS NULL
     OR v_line.gross_line_total < 0
     OR v_line.vat_amount > v_line.gross_line_total
     OR v_line.line_total
        IS DISTINCT FROM v_line.gross_line_total - v_line.vat_amount
     OR (
       v_line.pricing_mode = 'unit_price'
       AND v_line.gross_line_total IS DISTINCT FROM GREATEST(
         pg_catalog.round(
           v_line.quantity * v_line.gross_unit_price,
           2
         ) - v_line.line_discount_amount,
         0::numeric
       )
     )
     OR (
       v_line.pricing_mode = 'gross_total'
       AND v_line.gross_unit_price IS DISTINCT FROM pg_catalog.round(
         (
           v_line.gross_line_total + v_line.line_discount_amount
         ) / v_line.quantity,
         2
       )
     ) THEN
    RAISE EXCEPTION 'supplier_invoice_gross_contract_invalid'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_supplier_invoice_gross_contract()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_supplier_invoice_lines_gross_contract
  ON public.supplier_invoice_lines;
CREATE CONSTRAINT TRIGGER trg_supplier_invoice_lines_gross_contract
AFTER INSERT OR UPDATE
ON public.supplier_invoice_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION private.enforce_supplier_invoice_gross_contract();

CREATE OR REPLACE FUNCTION private.apply_supplier_invoice_matching(
  p_invoice_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_invoice public.supplier_invoices%ROWTYPE;
  v_allocation_count integer;
  v_invalid_count integer;
  v_expected numeric(15,2);
  v_allocated numeric(15,2);
  v_difference numeric(15,2);
  v_status text;
  v_reason text;
  v_notes text;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT invoice.*
  INTO v_invoice
  FROM public.supplier_invoices AS invoice
  WHERE invoice.id = p_invoice_id
    AND invoice.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_invoice.invoice_kind = 'service' THEN
    IF EXISTS (
      SELECT 1
      FROM public.supplier_invoice_receipt_allocations AS allocation
      WHERE allocation.tenant_id = v_tenant
        AND allocation.supplier_invoice_id = p_invoice_id
    ) THEN
      RAISE EXCEPTION 'service_invoice_receipts_forbidden'
        USING ERRCODE = '23514';
    END IF;
    v_status := CASE
      WHEN v_invoice.service_verified_at IS NULL THEN 'pending'
      ELSE 'matched'
    END;
    v_reason := CASE
      WHEN v_invoice.service_verified_at IS NULL
        THEN 'service_verification_required'
      ELSE 'service_verified'
    END;
    v_notes := CASE
      WHEN v_invoice.service_verified_at IS NULL
        THEN 'Hóa đơn dịch vụ chờ xác minh chứng từ.'
      ELSE 'Hóa đơn dịch vụ đã được xác minh chứng từ.'
    END;
    v_expected := v_invoice.subtotal;
    v_allocated := NULL;
    v_difference := NULL;
  ELSE
    SELECT
      count(*),
      count(*) FILTER (
        WHERE grn.id IS NULL
           OR grn.status <> 'confirmed'
           OR purchase_order.id IS NULL
           OR purchase_order.supplier_id IS DISTINCT FROM
             v_invoice.supplier_id
           OR po_item.id IS NULL
           OR grn_item.id IS NULL
           OR invoice_line.id IS NULL
           OR invoice_line.ingredient_id IS DISTINCT FROM
             po_item.ingredient_id
           OR invoice_line.unit_id IS DISTINCT FROM grn_item.entry_unit_id
      )
    INTO v_allocation_count, v_invalid_count
    FROM public.supplier_invoice_receipt_allocations AS allocation
    LEFT JOIN public.goods_received_notes AS grn
      ON grn.id = allocation.grn_id
     AND grn.tenant_id = allocation.tenant_id
    LEFT JOIN public.purchase_orders AS purchase_order
      ON purchase_order.id = allocation.po_id
     AND purchase_order.tenant_id = allocation.tenant_id
     AND purchase_order.id = grn.po_id
    LEFT JOIN public.purchase_order_items AS po_item
      ON po_item.id = allocation.purchase_order_item_id
     AND po_item.tenant_id = allocation.tenant_id
     AND po_item.po_id = purchase_order.id
    LEFT JOIN public.grn_items AS grn_item
      ON grn_item.grn_id = allocation.grn_id
     AND grn_item.tenant_id = allocation.tenant_id
     AND grn_item.purchase_order_item_id = po_item.id
    LEFT JOIN public.supplier_invoice_lines AS invoice_line
      ON invoice_line.id = allocation.invoice_line_id
     AND invoice_line.tenant_id = allocation.tenant_id
     AND invoice_line.supplier_invoice_id = p_invoice_id
    WHERE allocation.tenant_id = v_tenant
      AND allocation.supplier_invoice_id = p_invoice_id;

    v_expected := v_invoice.subtotal;
    SELECT coalesce(
      pg_catalog.sum(
        invoice_line.line_total
          * allocation.billed_quantity
          / invoice_line.quantity
      ),
      0
    )::numeric(15,2)
    INTO v_allocated
    FROM public.supplier_invoice_receipt_allocations AS allocation
    JOIN public.supplier_invoice_lines AS invoice_line
      ON invoice_line.id = allocation.invoice_line_id
     AND invoice_line.tenant_id = allocation.tenant_id
     AND invoice_line.supplier_invoice_id = p_invoice_id
    WHERE allocation.tenant_id = v_tenant
      AND allocation.supplier_invoice_id = p_invoice_id;

    v_difference := (v_expected - v_allocated)::numeric(15,2);
    IF v_allocation_count = 0 THEN
      v_status := 'pending';
      v_reason := 'goods_receipts_required';
      v_notes := 'Hóa đơn hàng hóa chưa phân bổ tới dòng phiếu nhập.';
    ELSIF v_invalid_count > 0 THEN
      v_status := 'discrepancy';
      v_reason := 'receipt_line_mismatch';
      v_notes := 'Có dòng phân bổ không khớp NCC, PO, GRN hoặc nguyên liệu.';
    ELSIF pg_catalog.abs(v_difference) <= 1 THEN
      v_status := 'matched';
      v_reason := 'goods_quantity_value_within_one_vnd';
      v_notes := 'Số lượng phân bổ và tổng dòng hóa đơn khớp trong 1đ.';
    ELSE
      v_status := 'discrepancy';
      v_reason := 'goods_quantity_value_difference';
      v_notes := 'Chênh lệch giá trị phân bổ: ' || v_difference::text;
    END IF;
  END IF;

  UPDATE public.supplier_invoices
  SET matching_status = v_status,
      matching_expected_amount = v_expected,
      matching_received_amount = v_allocated,
      matching_difference_amount = v_difference,
      matching_reason_code = v_reason,
      matching_notes = v_notes,
      updated_at = pg_catalog.now()
  WHERE id = p_invoice_id
    AND tenant_id = v_tenant;

  RETURN pg_catalog.jsonb_build_object(
    'invoice_id', p_invoice_id,
    'matching_status', v_status,
    'reason', v_reason,
    'expected_amount', v_expected,
    'received_amount', v_allocated,
    'difference_amount', v_difference
  );
END;
$$;

REVOKE ALL ON FUNCTION private.apply_supplier_invoice_matching(bigint)
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
  v_legacy_lines jsonb;
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
      pricing_mode text,
      gross_unit_price numeric,
      gross_line_total numeric,
      line_discount numeric,
      vat_rate numeric,
      vat_amount numeric,
      line_total numeric
    )
    WHERE line.quantity IS NULL
       OR line.quantity <= 0
       OR line.quantity <> pg_catalog.round(line.quantity, 3)
       OR line.gross_unit_price IS NULL
       OR line.gross_unit_price < 0
       OR line.gross_unit_price
          <> pg_catalog.round(line.gross_unit_price, 2)
       OR line.gross_line_total IS NULL
       OR line.gross_line_total < 0
       OR line.gross_line_total
          <> pg_catalog.round(line.gross_line_total, 2)
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
      pricing_mode text,
      gross_unit_price numeric,
      gross_line_total numeric,
      line_discount numeric,
      vat_rate numeric,
      vat_amount numeric,
      line_total numeric
    )
    WHERE line.pricing_mode NOT IN ('gross_total', 'unit_price')
       OR line.vat_rate NOT IN (0, 5, 8, 10)
       OR (line.vat_rate = 0 AND line.vat_amount <> 0)
       OR line.vat_amount > line.gross_line_total
       OR line.line_total
          IS DISTINCT FROM line.gross_line_total - line.vat_amount
       OR (
         line.pricing_mode = 'unit_price'
         AND (
           line.line_discount > pg_catalog.round(
             line.quantity * line.gross_unit_price,
             2
           )
           OR line.gross_line_total IS DISTINCT FROM GREATEST(
             pg_catalog.round(
               line.quantity * line.gross_unit_price,
               2
             ) - line.line_discount,
             0::numeric
           )
         )
       )
       OR (
         line.pricing_mode = 'gross_total'
         AND line.gross_unit_price IS DISTINCT FROM pg_catalog.round(
           (
             line.gross_line_total + line.line_discount
           ) / line.quantity,
           2
         )
       )
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

  SELECT pg_catalog.jsonb_agg(
    line.value || pg_catalog.jsonb_build_object(
      'unit_price',
      (line.value->>'line_total')::numeric
        / (line.value->>'quantity')::numeric,
      'line_discount',
      0
    )
  )
  INTO v_legacy_lines
  FROM pg_catalog.jsonb_array_elements(p_lines) AS line(value);

  v_result := public.save_supplier_invoice_draft_unchecked(
    p_invoice_id,
    p_invoice,
    v_legacy_lines,
    p_allocations,
    p_idempotency_key
  );

  IF COALESCE((v_result->>'replayed')::boolean, FALSE) THEN
    RETURN v_result;
  END IF;

  v_invoice_id := (v_result->>'invoice_id')::bigint;

  UPDATE public.supplier_invoice_lines AS stored
  SET pricing_mode = source.pricing_mode,
      gross_unit_price = source.gross_unit_price,
      gross_line_total = source.gross_line_total,
      line_discount_amount = source.line_discount
  FROM pg_catalog.jsonb_to_recordset(p_lines) AS source(
    line_key text,
    pricing_mode text,
    gross_unit_price numeric,
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
  'Validates VAT-inclusive supplier invoice lines and preserves manual VAT evidence.';

COMMIT;
