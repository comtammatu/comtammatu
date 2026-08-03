BEGIN;

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
    WHERE allocation.quantity IS NULL
       OR allocation.quantity <= 0
       OR grn.id IS NULL
       OR grn.status <> 'confirmed'
       OR purchase_order.supplier_id IS DISTINCT FROM v_supplier_id
       OR po_item.ingredient_id IS DISTINCT FROM line.ingredient_id
       OR grn_item.entry_unit_id IS DISTINCT FROM line.unit_id
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
    ) AS requested_total ON TRUE
    WHERE already_billed.quantity + requested_total.quantity
      > grn_item.po_applied_quantity
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

CREATE OR REPLACE FUNCTION private.notify_supplier_invoice_valuation_variance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_warning boolean;
  v_delta numeric(20,2);
  v_provisional numeric(20,2);
BEGIN
  IF NEW.document_status <> 'confirmed'
     OR OLD.document_status = 'confirmed'
     OR NEW.invoice_kind = 'service' THEN
    RETURN NEW;
  END IF;

  SELECT
    coalesce(pg_catalog.bool_or(
      pg_catalog.abs(event.value_delta) >= settings.variance_warning_amount
      OR (
        allocation.confirmed_net_inventory_amount - event.value_delta > 0
        AND pg_catalog.abs(event.value_delta) * 100
          / (
            allocation.confirmed_net_inventory_amount - event.value_delta
          ) >= settings.variance_warning_percent
      )
    ), FALSE),
    coalesce(pg_catalog.sum(event.value_delta), 0),
    coalesce(pg_catalog.sum(
      allocation.confirmed_net_inventory_amount - event.value_delta
    ), 0)
  INTO v_warning, v_delta, v_provisional
  FROM public.inventory_valuation_events AS event
  JOIN public.supplier_invoice_receipt_allocations AS allocation
    ON allocation.valuation_event_id = event.id
   AND allocation.tenant_id = event.tenant_id
  JOIN public.inventory_valuation_settings AS settings
    ON settings.tenant_id = event.tenant_id
  WHERE event.tenant_id = NEW.tenant_id
    AND event.source_invoice_id = NEW.id;

  IF NOT v_warning THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (
    tenant_id,
    target_branch_id,
    target_roles,
    kind,
    severity,
    title,
    body,
    entity_type,
    entity_id,
    action_url,
    dedup_key,
    meta
  )
  VALUES (
    NEW.tenant_id,
    NULL,
    ARRAY['owner']::text[],
    'inventory.valuation_variance',
    'warning',
    'Chênh lệch giá mua cần hậu kiểm',
    pg_catalog.format(
      'Hóa đơn NCC đã xác nhận; chênh lệch quyết toán tồn kho là %sđ.',
      pg_catalog.to_char(v_delta, 'FM999G999G999G999G990D00')
    ),
    'supplier_invoice',
    NEW.id,
    '/finance/supplier-invoices?invoiceId=' || NEW.id::text,
    'inventory.valuation_variance:' || NEW.id::text,
    pg_catalog.jsonb_build_object(
      'provisional_value', v_provisional,
      'variance_amount', v_delta,
      'currency', 'VND',
      'source', 'rpc'
    )
  )
  ON CONFLICT (tenant_id, dedup_key)
    WHERE dedup_key IS NOT NULL
  DO UPDATE SET
    severity = EXCLUDED.severity,
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    action_url = EXCLUDED.action_url,
    meta = EXCLUDED.meta,
    created_at = pg_catalog.now(),
    expires_at = NULL;

  RETURN NEW;
END;
$$;

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
  v_supplier_ok boolean := false;
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
    SELECT id, supplier_id, po_id, status
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

    v_supplier_ok := (
      v_grn.supplier_id IS NOT DISTINCT FROM p_supplier_id
      OR (
        v_grn.supplier_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.grn_items gi
          WHERE gi.grn_id = p_grn_id
            AND gi.tenant_id = v_tenant_id
            AND gi.supplier_id = p_supplier_id
        )
      )
    );
    IF NOT v_supplier_ok THEN
      RAISE EXCEPTION 'grn_supplier_mismatch' USING ERRCODE = '22023';
    END IF;

    IF p_po_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.purchase_orders po
        WHERE po.id = p_po_id
          AND po.tenant_id = v_tenant_id
          AND po.supplier_id = p_supplier_id
          AND (
            po.id IS NOT DISTINCT FROM v_grn.po_id
            OR po.source_grn_id = p_grn_id
          )
      ) THEN
        RAISE EXCEPTION 'po_grn_mismatch' USING ERRCODE = '22023';
      END IF;
      v_effective_po_id := p_po_id;
    ELSE
      SELECT po.id
      INTO v_effective_po_id
      FROM public.purchase_orders po
      WHERE po.tenant_id = v_tenant_id
        AND po.supplier_id = p_supplier_id
        AND po.source_grn_id = p_grn_id
      ORDER BY po.id
      LIMIT 1;

      IF v_effective_po_id IS NULL
        AND v_grn.po_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.purchase_orders po
          WHERE po.id = v_grn.po_id
            AND po.tenant_id = v_tenant_id
            AND po.supplier_id = p_supplier_id
        ) THEN
        v_effective_po_id := v_grn.po_id;
      END IF;
    END IF;
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

ALTER TABLE public.supplier_invoices
  DROP COLUMN invoice_number;

COMMIT;
