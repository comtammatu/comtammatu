-- Migration: Allow supplier invoice lines to match either the purchase order entry unit or the goods receipt entry unit.
-- Supports 3-way matching when GRN receives in loose/base units while PO was ordered in pack/receipt units.

CREATE OR REPLACE FUNCTION private.apply_supplier_invoice_matching(p_invoice_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
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
           OR NOT (
             grn.status = 'confirmed'
             OR grn_item.confirmed_at IS NOT NULL
           )
           OR purchase_order.id IS NULL
           OR coalesce(
                grn_item.supplier_id,
                po_item.supplier_id,
                purchase_order.supplier_id
              ) IS DISTINCT FROM v_invoice.supplier_id
           OR po_item.id IS NULL
           OR grn_item.id IS NULL
           OR invoice_line.id IS NULL
           OR invoice_line.ingredient_id IS DISTINCT FROM
             po_item.ingredient_id
           OR (
             invoice_line.unit_id IS DISTINCT FROM coalesce(po_item.entry_unit_id, grn_item.entry_unit_id)
             AND invoice_line.unit_id IS DISTINCT FROM grn_item.entry_unit_id
           )
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
     AND (
       grn_item.confirmed_at IS NOT NULL
       OR grn.status = 'confirmed'
     )
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
      matching_reason_code = v_reason,
      matching_notes = v_notes,
      matching_expected_amount = v_expected,
      matching_received_amount = v_allocated,
      matching_difference_amount = v_difference,
      updated_at = pg_catalog.now()
  WHERE id = p_invoice_id
    AND tenant_id = v_tenant;

  RETURN pg_catalog.jsonb_build_object(
    'invoice_id', p_invoice_id,
    'matching_status', v_status,
    'matching_reason_code', v_reason,
    'matching_difference_amount', v_difference
  );
END;
$$;

REVOKE ALL ON FUNCTION private.apply_supplier_invoice_matching(p_invoice_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION private.apply_supplier_invoice_matching(p_invoice_id bigint) TO service_role;
GRANT EXECUTE ON FUNCTION private.apply_supplier_invoice_matching(p_invoice_id bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_supplier_invoice_draft_unchecked(
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
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_invoice_id bigint := p_invoice_id;
  v_supplier_id bigint;
  v_kind text;
  v_discount numeric(15,2);
  v_subtotal numeric(15,2);
  v_vat numeric(15,2);
  v_total numeric(15,2);
  v_vat_breakdown jsonb;
  v_first_allocation jsonb;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('procurement:invoice_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL
     OR pg_catalog.jsonb_typeof(p_invoice) <> 'object'
     OR pg_catalog.jsonb_typeof(p_lines) <> 'array'
     OR pg_catalog.jsonb_array_length(p_lines) = 0
     OR pg_catalog.jsonb_array_length(p_lines) > 200
     OR pg_catalog.jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'supplier_invoice_draft_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT invoice.id
  INTO v_invoice_id
  FROM public.supplier_invoices AS invoice
  WHERE invoice.tenant_id = v_tenant
    AND invoice.save_idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'invoice_id', v_invoice_id,
      'document_status', 'draft',
      'replayed', TRUE
    );
  END IF;

  v_supplier_id := (p_invoice->>'supplier_id')::bigint;
  v_kind := p_invoice->>'invoice_kind';
  v_discount := coalesce(
    (p_invoice->>'document_discount_amount')::numeric,
    0
  );
  IF v_kind NOT IN ('goods', 'service')
     OR v_supplier_id IS NULL
     OR v_discount < 0
     OR (p_invoice->>'invoice_date')::date IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.suppliers AS supplier
       WHERE supplier.id = v_supplier_id
         AND supplier.tenant_id = v_tenant
         AND supplier.is_active
     ) THEN
    RAISE EXCEPTION 'supplier_invoice_header_invalid'
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
    WHERE nullif(pg_catalog.btrim(line.line_key), '') IS NULL
       OR nullif(pg_catalog.btrim(line.description), '') IS NULL
       OR line.quantity IS NULL
       OR line.quantity <= 0
       OR line.unit_price IS NULL
       OR line.unit_price < 0
       OR line.line_discount IS NULL
       OR line.line_discount < 0
       OR line.vat_rate NOT IN (0, 5, 8, 10)
       OR line.vat_amount IS NULL
       OR line.vat_amount < 0
       OR (line.vat_rate = 0 AND line.vat_amount <> 0)
       OR line.line_total IS NULL
       OR pg_catalog.abs(
         line.line_total
           - (
             line.quantity * line.unit_price
             - line.line_discount
           )
       ) > 1
       OR (
         v_kind = 'goods'
         AND (
           line.ingredient_id IS NULL
           OR line.unit_id IS NULL
           OR NOT EXISTS (
             SELECT 1
             FROM public.ingredient_units AS ingredient_unit
             WHERE ingredient_unit.tenant_id = v_tenant
               AND ingredient_unit.ingredient_id = line.ingredient_id
               AND ingredient_unit.unit_id = line.unit_id
               AND ingredient_unit.is_active
           )
         )
       )
  )
  OR (
    SELECT count(DISTINCT line.line_key)
    FROM pg_catalog.jsonb_to_recordset(p_lines)
      AS line(line_key text)
  ) <> pg_catalog.jsonb_array_length(p_lines) THEN
    RAISE EXCEPTION 'supplier_invoice_line_invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    pg_catalog.round(pg_catalog.sum(line.line_total), 2),
    pg_catalog.round(pg_catalog.sum(line.vat_amount), 2)
  INTO v_subtotal, v_vat
  FROM pg_catalog.jsonb_to_recordset(p_lines) AS line(
    line_total numeric,
    vat_amount numeric
  );
  v_total := v_subtotal - v_discount + v_vat;

  IF v_subtotal <= 0
     OR v_discount > v_subtotal
     OR pg_catalog.abs(
       v_subtotal - (p_invoice->>'subtotal')::numeric
     ) > 1
     OR pg_catalog.abs(v_vat - (p_invoice->>'vat_amount')::numeric) > 1
     OR pg_catalog.abs(
       v_total - (p_invoice->>'total_amount')::numeric
     ) > 1 THEN
    RAISE EXCEPTION 'supplier_invoice_total_mismatch'
      USING ERRCODE = '23514';
  END IF;

  SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'vat_rate', grouped.vat_rate,
      'taxable_amount', grouped.taxable_amount,
      'vat_amount', grouped.vat_amount
    )
    ORDER BY grouped.vat_rate
  )
  INTO v_vat_breakdown
  FROM (
    SELECT
      line.vat_rate,
      pg_catalog.round(pg_catalog.sum(line.line_total), 2)
        AS taxable_amount,
      pg_catalog.round(pg_catalog.sum(line.vat_amount), 2) AS vat_amount
    FROM pg_catalog.jsonb_to_recordset(p_lines) AS line(
      vat_rate numeric,
      line_total numeric,
      vat_amount numeric
    )
    GROUP BY line.vat_rate
  ) AS grouped;

  IF v_kind = 'goods'
     AND pg_catalog.jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'goods_invoice_receipts_required'
      USING ERRCODE = '23514';
  END IF;
  IF v_kind = 'service'
     AND pg_catalog.jsonb_array_length(p_allocations) <> 0 THEN
    RAISE EXCEPTION 'service_invoice_receipts_forbidden'
      USING ERRCODE = '23514';
  END IF;

  IF v_kind = 'goods' AND EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_to_recordset(p_allocations) AS allocation(
      line_key text,
      grn_id bigint,
      po_id bigint,
      purchase_order_item_id bigint,
      quantity numeric
    )
    JOIN pg_catalog.jsonb_to_recordset(p_lines) AS line(
      line_key text,
      ingredient_id bigint,
      unit_id bigint
    )
      ON line.line_key = allocation.line_key
    LEFT JOIN public.goods_received_notes AS grn
      ON grn.id = allocation.grn_id
     AND grn.tenant_id = v_tenant
    LEFT JOIN public.purchase_orders AS purchase_order
      ON purchase_order.id = allocation.po_id
     AND purchase_order.tenant_id = v_tenant
     AND purchase_order.id = grn.po_id
    LEFT JOIN public.purchase_order_items AS po_item
      ON po_item.id = allocation.purchase_order_item_id
     AND po_item.tenant_id = v_tenant
     AND po_item.po_id = purchase_order.id
    LEFT JOIN public.grn_items AS grn_item
      ON grn_item.grn_id = grn.id
     AND grn_item.tenant_id = v_tenant
     AND grn_item.purchase_order_item_id = po_item.id
     AND (
       grn_item.confirmed_at IS NOT NULL
       OR grn.status = 'confirmed'
     )
    WHERE allocation.quantity IS NULL
       OR allocation.quantity <= 0
       OR grn.id IS NULL
       OR NOT (
         grn.status = 'confirmed'
         OR grn_item.confirmed_at IS NOT NULL
       )
       OR coalesce(
            grn_item.supplier_id,
            po_item.supplier_id,
            purchase_order.supplier_id
          ) IS DISTINCT FROM v_supplier_id
       OR po_item.ingredient_id IS DISTINCT FROM line.ingredient_id
       OR (
         line.unit_id IS DISTINCT FROM coalesce(po_item.entry_unit_id, grn_item.entry_unit_id)
         AND line.unit_id IS DISTINCT FROM grn_item.entry_unit_id
       )
       OR allocation.quantity > grn_item.po_applied_quantity
  ) THEN
    RAISE EXCEPTION 'supplier_invoice_receipt_line_mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF v_kind = 'goods' AND EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_to_recordset(p_allocations) AS requested(
      line_key text,
      grn_id bigint,
      po_id bigint,
      purchase_order_item_id bigint,
      quantity numeric
    )
    JOIN public.grn_items AS grn_item
      ON grn_item.grn_id = requested.grn_id
     AND grn_item.tenant_id = v_tenant
     AND grn_item.purchase_order_item_id =
       requested.purchase_order_item_id
     AND (
       grn_item.confirmed_at IS NOT NULL
       OR EXISTS (
         SELECT 1
         FROM public.goods_received_notes AS g
         WHERE g.id = requested.grn_id
           AND g.tenant_id = v_tenant
           AND g.status = 'confirmed'
       )
     )
    LEFT JOIN LATERAL (
      SELECT coalesce(pg_catalog.sum(existing.billed_quantity), 0)
        AS quantity
      FROM public.supplier_invoice_receipt_allocations AS existing
      JOIN public.supplier_invoices AS existing_invoice
        ON existing_invoice.id = existing.supplier_invoice_id
       AND existing_invoice.tenant_id = existing.tenant_id
      WHERE existing.tenant_id = v_tenant
        AND existing.grn_id = requested.grn_id
        AND existing.purchase_order_item_id =
          requested.purchase_order_item_id
        AND existing_invoice.id IS DISTINCT FROM p_invoice_id
        AND existing_invoice.document_status <> 'cancelled'
    ) AS already_billed ON TRUE
    LEFT JOIN LATERAL (
      SELECT pg_catalog.sum(same_request.quantity) AS quantity
      FROM pg_catalog.jsonb_to_recordset(p_allocations) AS same_request(
        line_key text,
        grn_id bigint,
        po_id bigint,
        purchase_order_item_id bigint,
        quantity numeric
      )
      WHERE same_request.grn_id = requested.grn_id
        AND same_request.purchase_order_item_id =
          requested.purchase_order_item_id
    ) AS request_total ON TRUE
    WHERE (
      already_billed.quantity + request_total.quantity
    ) > grn_item.po_applied_quantity
  ) THEN
    RAISE EXCEPTION 'supplier_invoice_over_allocation'
      USING ERRCODE = '23514';
  END IF;

  IF v_invoice_id IS NULL THEN
    v_first_allocation := p_allocations->0;
    INSERT INTO public.supplier_invoices (
      tenant_id,
      supplier_id,
      grn_id,
      po_id,
      invoice_date,
      subtotal,
      vat_rate,
      vat_amount,
      total_amount,
      matching_status,
      matching_notes,
      created_by,
      due_date,
      vat_breakdown,
      document_discount_amount,
      invoice_kind,
      document_status,
      save_idempotency_key
    )
    VALUES (
      v_tenant,
      v_supplier_id,
      (v_first_allocation->>'grn_id')::bigint,
      (v_first_allocation->>'po_id')::bigint,
      (p_invoice->>'invoice_date')::date,
      v_subtotal,
      NULL,
      v_vat,
      v_total,
      'pending',
      nullif(pg_catalog.btrim(p_invoice->>'matching_notes'), ''),
      v_uid,
      nullif(p_invoice->>'due_date', '')::date,
      v_vat_breakdown,
      v_discount,
      v_kind,
      'draft',
      p_idempotency_key
    )
    RETURNING id INTO v_invoice_id;
  ELSE
    PERFORM 1
    FROM public.supplier_invoices AS invoice
    WHERE invoice.id = v_invoice_id
      AND invoice.tenant_id = v_tenant
      AND invoice.document_status = 'draft'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'supplier_invoice_not_editable'
        USING ERRCODE = '23514';
    END IF;

    DELETE FROM public.supplier_invoice_receipt_allocations
    WHERE tenant_id = v_tenant
      AND supplier_invoice_id = v_invoice_id;
    DELETE FROM public.supplier_invoice_lines
    WHERE tenant_id = v_tenant
      AND supplier_invoice_id = v_invoice_id;

    v_first_allocation := p_allocations->0;
    UPDATE public.supplier_invoices
    SET supplier_id = v_supplier_id,
        grn_id = (v_first_allocation->>'grn_id')::bigint,
        po_id = (v_first_allocation->>'po_id')::bigint,
        invoice_date = (p_invoice->>'invoice_date')::date,
        subtotal = v_subtotal,
        vat_amount = v_vat,
        total_amount = v_total,
        matching_status = 'pending',
        matching_notes = nullif(
          pg_catalog.btrim(p_invoice->>'matching_notes'),
          ''
        ),
        due_date = nullif(p_invoice->>'due_date', '')::date,
        vat_breakdown = v_vat_breakdown,
        document_discount_amount = v_discount,
        invoice_kind = v_kind,
        save_idempotency_key = p_idempotency_key,
        updated_at = pg_catalog.now()
    WHERE id = v_invoice_id
      AND tenant_id = v_tenant;
  END IF;

  INSERT INTO public.supplier_invoice_lines (
    tenant_id,
    supplier_invoice_id,
    source_line_key,
    ingredient_id,
    description,
    quantity,
    unit_id,
    unit_price,
    line_discount_amount,
    allocated_document_discount,
    vat_rate,
    vat_amount,
    line_total
  )
  SELECT
    v_tenant,
    v_invoice_id,
    line.line_key,
    line.ingredient_id,
    pg_catalog.btrim(line.description),
    line.quantity,
    line.unit_id,
    line.unit_price,
    line.line_discount,
    pg_catalog.round(
      v_discount * line.line_total / v_subtotal,
      2
    ),
    line.vat_rate,
    line.vat_amount,
    line.line_total
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
  );

  INSERT INTO public.supplier_invoice_receipt_allocations (
    tenant_id,
    supplier_invoice_id,
    grn_id,
    po_id,
    purchase_order_item_id,
    invoice_line_id,
    billed_quantity,
    matched_quantity
  )
  SELECT
    v_tenant,
    v_invoice_id,
    allocation.grn_id,
    allocation.po_id,
    allocation.purchase_order_item_id,
    invoice_line.id,
    allocation.quantity,
    allocation.quantity
  FROM pg_catalog.jsonb_to_recordset(p_allocations) AS allocation(
    line_key text,
    grn_id bigint,
    po_id bigint,
    purchase_order_item_id bigint,
    quantity numeric
  )
  JOIN public.supplier_invoice_lines AS invoice_line
    ON invoice_line.tenant_id = v_tenant
   AND invoice_line.supplier_invoice_id = v_invoice_id
   AND invoice_line.source_line_key = allocation.line_key;

  v_result := private.apply_supplier_invoice_matching(v_invoice_id);
  PERFORM public.log_audit(
    'supplier_invoice.draft_saved',
    'supplier_invoice',
    v_invoice_id,
    NULL,
    v_result
  );

  RETURN pg_catalog.jsonb_build_object(
    'invoice_id', v_invoice_id,
    'document_status', 'draft',
    'matching_status', v_result->>'matching_status',
    'replayed', FALSE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_supplier_invoice_draft_unchecked(p_invoice_id bigint, p_invoice jsonb, p_lines jsonb, p_allocations jsonb, p_idempotency_key uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_supplier_invoice_draft_unchecked(p_invoice_id bigint, p_invoice jsonb, p_lines jsonb, p_allocations jsonb, p_idempotency_key uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_supplier_invoice_draft_unchecked(p_invoice_id bigint, p_invoice jsonb, p_lines jsonb, p_allocations jsonb, p_idempotency_key uuid) TO authenticated;

COMMENT ON FUNCTION public.save_supplier_invoice_draft_unchecked(
  bigint, jsonb, jsonb, jsonb, uuid
) IS
  'Saves supplier invoice draft with support for matching both PO and GRN entry units.';
