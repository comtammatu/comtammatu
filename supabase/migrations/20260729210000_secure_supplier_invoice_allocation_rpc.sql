BEGIN;

CREATE OR REPLACE FUNCTION public.create_supplier_invoice_with_allocations(
  p_supplier_id bigint,
  p_invoice_number text,
  p_invoice_date date,
  p_vat_breakdown jsonb,
  p_matching_notes text,
  p_due_date date,
  p_document_discount_amount numeric,
  p_receipts jsonb
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_receipt_count integer := COALESCE(jsonb_array_length(p_receipts), 0);
  v_first_receipt jsonb;
  v_invoice_id bigint;
  v_bucket jsonb;
  v_bucket_index integer := 0;
  v_bucket_count integer := COALESCE(jsonb_array_length(p_vat_breakdown), 0);
  v_taxable_total numeric(15,2);
  v_bucket_taxable numeric(15,2);
  v_discount numeric(15,2) :=
    COALESCE(p_document_discount_amount, 0)::numeric(15,2);
  v_allocated_discount numeric(15,2);
  v_remaining_discount numeric(15,2);
  v_receipt_value numeric(15,2);
  v_invoice_subtotal numeric(15,2);
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('procurement:invoice_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_receipts) <> 'array'
     OR jsonb_typeof(p_vat_breakdown) <> 'array'
     OR v_bucket_count = 0
     OR v_discount < 0 THEN
    RAISE EXCEPTION 'supplier_invoice_allocations_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF v_receipt_count > 0 AND (
    SELECT count(DISTINCT (receipt.value->>'grn_id')::bigint)
    FROM jsonb_array_elements(p_receipts) receipt
  ) <> v_receipt_count THEN
    RAISE EXCEPTION 'supplier_invoice_receipt_duplicate'
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_receipts) receipt
    LEFT JOIN public.goods_received_notes grn
      ON grn.id = (receipt.value->>'grn_id')::bigint
     AND grn.tenant_id = v_tenant
    LEFT JOIN public.purchase_orders purchase_order
      ON purchase_order.id = (receipt.value->>'po_id')::bigint
     AND purchase_order.tenant_id = v_tenant
    WHERE grn.id IS NULL
       OR grn.status <> 'confirmed'
       OR grn.po_id IS DISTINCT FROM purchase_order.id
       OR purchase_order.supplier_id IS DISTINCT FROM p_supplier_id
  ) THEN
    RAISE EXCEPTION 'supplier_invoice_receipt_mismatch'
      USING ERRCODE = '23514';
  END IF;

  v_first_receipt := p_receipts->0;
  v_invoice_id := public.create_supplier_invoice_with_vat_breakdown(
    p_supplier_id,
    CASE
      WHEN v_first_receipt IS NULL THEN NULL
      ELSE (v_first_receipt->>'grn_id')::bigint
    END,
    CASE
      WHEN v_first_receipt IS NULL THEN NULL
      ELSE (v_first_receipt->>'po_id')::bigint
    END,
    p_invoice_number,
    p_invoice_date,
    p_vat_breakdown,
    p_matching_notes,
    p_due_date
  );

  SELECT COALESCE(sum((bucket.value->>'taxable_amount')::numeric), 0)
  INTO v_taxable_total
  FROM jsonb_array_elements(p_vat_breakdown) bucket;

  IF v_taxable_total <= 0 THEN
    RAISE EXCEPTION 'supplier_invoice_vat_breakdown_invalid'
      USING ERRCODE = '23514';
  END IF;

  v_remaining_discount := v_discount;
  FOR v_bucket IN
    SELECT bucket.value
    FROM jsonb_array_elements(p_vat_breakdown) WITH ORDINALITY bucket(value, ord)
    ORDER BY bucket.ord
  LOOP
    v_bucket_index := v_bucket_index + 1;
    v_bucket_taxable := (v_bucket->>'taxable_amount')::numeric(15,2);
    v_allocated_discount := CASE
      WHEN v_bucket_index = v_bucket_count THEN v_remaining_discount
      ELSE round(v_discount * v_bucket_taxable / v_taxable_total, 2)
    END;
    v_remaining_discount := v_remaining_discount - v_allocated_discount;

    INSERT INTO public.supplier_invoice_lines (
      tenant_id,
      supplier_invoice_id,
      description,
      quantity,
      unit_price,
      line_discount_amount,
      allocated_document_discount,
      line_total
    )
    VALUES (
      v_tenant,
      v_invoice_id,
      'Thuế suất ' || (v_bucket->>'vat_rate') || '%',
      1,
      v_bucket_taxable + v_allocated_discount,
      0,
      v_allocated_discount,
      v_bucket_taxable
    );
  END LOOP;

  UPDATE public.supplier_invoices
  SET document_discount_amount = v_discount,
      updated_at = now()
  WHERE id = v_invoice_id
    AND tenant_id = v_tenant
  RETURNING subtotal INTO v_invoice_subtotal;

  INSERT INTO public.supplier_invoice_receipt_allocations (
    tenant_id,
    supplier_invoice_id,
    grn_id,
    po_id,
    billed_quantity,
    matched_quantity
  )
  SELECT
    v_tenant,
    v_invoice_id,
    (receipt.value->>'grn_id')::bigint,
    (receipt.value->>'po_id')::bigint,
    0,
    0
  FROM jsonb_array_elements(p_receipts) receipt;

  SELECT COALESCE(
    sum(grn_item.po_applied_quantity * purchase_order_item.unit_price_est),
    0
  )
  INTO v_receipt_value
  FROM jsonb_array_elements(p_receipts) receipt
  JOIN public.grn_items grn_item
    ON grn_item.grn_id = (receipt.value->>'grn_id')::bigint
   AND grn_item.tenant_id = v_tenant
  JOIN public.purchase_order_items purchase_order_item
    ON purchase_order_item.id = grn_item.purchase_order_item_id
   AND purchase_order_item.tenant_id = grn_item.tenant_id;

  UPDATE public.supplier_invoices
  SET matching_status = CASE
        WHEN v_receipt_count = 0 THEN 'pending'
        WHEN abs(
          (v_invoice_subtotal + v_discount) - v_receipt_value
        ) <= 1 THEN 'matched'
        ELSE 'discrepancy'
      END,
      matching_notes = CASE
        WHEN v_receipt_count > 0
         AND abs((v_invoice_subtotal + v_discount) - v_receipt_value) > 1
        THEN concat_ws(
          E'\n',
          NULLIF(btrim(p_matching_notes), ''),
          'Chênh lệch giá trị đối chiếu: '
            || ((v_invoice_subtotal + v_discount) - v_receipt_value)::text
        )
        ELSE NULLIF(btrim(p_matching_notes), '')
      END,
      updated_at = now()
  WHERE id = v_invoice_id
    AND tenant_id = v_tenant;

  RETURN v_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_supplier_invoice_with_allocations(
  bigint, text, date, jsonb, text, date, numeric, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_supplier_invoice_with_allocations(
  bigint, text, date, jsonb, text, date, numeric, jsonb
) TO authenticated, service_role;

COMMIT;
