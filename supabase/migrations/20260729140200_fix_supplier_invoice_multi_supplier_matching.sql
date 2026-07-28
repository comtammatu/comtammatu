-- D092: supplier invoice create + matching scoped per GRN supplier slice.
-- Header goods_received_notes.supplier_id may be NULL on multi-NCC GRNs;
-- affiliation and net accepted value use grn_items.supplier_id. Effective PO
-- may be a split source_grn_id PO for that supplier, not only grn.po_id.

CREATE OR REPLACE FUNCTION public.recompute_supplier_invoice_matching(
  p_invoice_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_invoice public.supplier_invoices%ROWTYPE;
  v_grn public.goods_received_notes%ROWTYPE;
  v_grn_subtotal numeric(15,2);
  v_po_subtotal numeric(15,2);
  v_effective_po_id bigint;
  v_grn_found boolean := false;
  v_supplier_ok boolean := false;
  v_status text := 'pending';
  v_reason text := 'missing_grn';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('procurement:invoice_match') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_invoice
  FROM public.supplier_invoices
  WHERE id = p_invoice_id
    AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_invoice.grn_id IS NULL THEN
    UPDATE public.supplier_invoices
    SET matching_status = v_status,
        updated_at = pg_catalog.now()
    WHERE id = p_invoice_id;

    RETURN pg_catalog.jsonb_build_object(
      'invoice_id', p_invoice_id,
      'matching_status', v_status,
      'reason', v_reason
    );
  END IF;

  SELECT *
  INTO v_grn
  FROM public.goods_received_notes
  WHERE id = v_invoice.grn_id
    AND tenant_id = v_tenant;

  IF NOT FOUND THEN
    v_status := 'discrepancy';
    v_reason := 'grn_supplier_mismatch';
  ELSE
    v_grn_found := true;
    v_supplier_ok := (
      v_grn.supplier_id IS NOT DISTINCT FROM v_invoice.supplier_id
      OR (
        v_grn.supplier_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.grn_items gi
          WHERE gi.grn_id = v_grn.id
            AND gi.tenant_id = v_tenant
            AND gi.supplier_id = v_invoice.supplier_id
        )
      )
    );

    IF NOT v_supplier_ok THEN
      v_status := 'discrepancy';
      v_reason := 'grn_supplier_mismatch';
    ELSIF v_grn.status <> 'confirmed' THEN
      v_status := 'pending';
      v_reason := 'grn_not_confirmed';
    ELSE
      SELECT COALESCE(
        SUM(
          pg_catalog.round(
            (received_quantity - COALESCE(rejected_quantity, 0)) * unit_cost,
            2
          )
        ),
        0
      )
      INTO v_grn_subtotal
      FROM public.grn_items
      WHERE grn_id = v_grn.id
        AND tenant_id = v_tenant
        AND (
          supplier_id = v_invoice.supplier_id
          OR (
            supplier_id IS NULL
            AND v_grn.supplier_id IS NOT DISTINCT FROM v_invoice.supplier_id
          )
        );

      v_status := 'matched';
      v_reason := 'grn_net_subtotal_within_tolerance';

      IF (
        v_grn_subtotal <= 0
        AND v_invoice.subtotal > 0
      ) OR (
        v_grn_subtotal > 0
        AND pg_catalog.abs(v_invoice.subtotal - v_grn_subtotal)
          / v_grn_subtotal > 0.02
      ) THEN
        v_status := 'discrepancy';
        v_reason := 'grn_net_subtotal_mismatch';
      END IF;
    END IF;
  END IF;

  IF v_invoice.po_id IS NOT NULL THEN
    v_effective_po_id := v_invoice.po_id;
  ELSIF v_grn_found THEN
    SELECT po.id
    INTO v_effective_po_id
    FROM public.purchase_orders po
    WHERE po.tenant_id = v_tenant
      AND po.supplier_id = v_invoice.supplier_id
      AND po.source_grn_id = v_grn.id
    ORDER BY po.id
    LIMIT 1;

    IF v_effective_po_id IS NULL
      AND v_grn.po_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.purchase_orders po
        WHERE po.id = v_grn.po_id
          AND po.tenant_id = v_tenant
          AND po.supplier_id = v_invoice.supplier_id
      ) THEN
      v_effective_po_id := v_grn.po_id;
    END IF;
  END IF;

  IF v_status = 'matched' AND v_grn_found AND v_invoice.po_id IS NOT NULL THEN
    IF NOT (
      v_invoice.po_id IS NOT DISTINCT FROM v_grn.po_id
      OR EXISTS (
        SELECT 1
        FROM public.purchase_orders po
        WHERE po.id = v_invoice.po_id
          AND po.tenant_id = v_tenant
          AND po.source_grn_id = v_grn.id
      )
    ) THEN
      v_status := 'discrepancy';
      v_reason := 'po_grn_mismatch';
    END IF;
  END IF;

  IF v_status = 'matched' AND v_effective_po_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.purchase_orders
      WHERE id = v_effective_po_id
        AND tenant_id = v_tenant
        AND supplier_id = v_invoice.supplier_id
    ) THEN
      v_status := 'discrepancy';
      v_reason := 'po_supplier_mismatch';
    ELSE
      SELECT CASE
        WHEN COUNT(*) > 0 AND COUNT(line_total) = COUNT(*)
          THEN SUM(line_total)
        ELSE NULL
      END
      INTO v_po_subtotal
      FROM public.purchase_order_items
      WHERE po_id = v_effective_po_id
        AND tenant_id = v_tenant;

      IF v_po_subtotal > 0
        AND pg_catalog.abs(v_invoice.subtotal - v_po_subtotal)
          / v_po_subtotal > 0.02 THEN
        v_status := 'discrepancy';
        v_reason := 'po_subtotal_mismatch';
      ELSIF v_po_subtotal > 0 THEN
        v_reason := 'grn_and_po_net_subtotals_within_tolerance';
      END IF;
    END IF;
  END IF;

  UPDATE public.supplier_invoices
  SET po_id = COALESCE(po_id, v_effective_po_id),
      matching_status = v_status,
      updated_at = pg_catalog.now()
  WHERE id = p_invoice_id;

  RETURN pg_catalog.jsonb_build_object(
    'invoice_id', p_invoice_id,
    'matching_status', v_status,
    'reason', v_reason,
    'invoice_subtotal', v_invoice.subtotal,
    'grn_subtotal', v_grn_subtotal,
    'po_subtotal', v_po_subtotal
  );
END;
$$;

COMMENT ON FUNCTION public.recompute_supplier_invoice_matching(bigint) IS
  'Matches supplier-invoice pre-VAT subtotal to confirmed net accepted GRN value for the invoice supplier (header or line-scoped) and, when fully priced, the linked source or legacy PO subtotal.';

REVOKE ALL ON FUNCTION public.recompute_supplier_invoice_matching(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_supplier_invoice_matching(bigint)
  TO authenticated, service_role;

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

COMMENT ON FUNCTION public.create_supplier_invoice_with_vat_breakdown(
  bigint, bigint, bigint, text, date, jsonb, text, date
) IS
  'Creates one tenant-scoped supplier invoice with multi-rate input-VAT breakdown; links GRN/PO per supplier including multi-NCC GRN slices.';

REVOKE ALL ON FUNCTION public.create_supplier_invoice_with_vat_breakdown(
  bigint, bigint, bigint, text, date, jsonb, text, date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_supplier_invoice_with_vat_breakdown(
  bigint, bigint, bigint, text, date, jsonb, text, date
) TO authenticated;
