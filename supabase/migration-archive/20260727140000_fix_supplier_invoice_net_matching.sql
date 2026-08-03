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

  IF NOT FOUND OR v_grn.supplier_id IS DISTINCT FROM v_invoice.supplier_id THEN
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
      AND tenant_id = v_tenant;

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

  v_effective_po_id := COALESCE(v_invoice.po_id, v_grn.po_id);

  IF v_status = 'matched' AND v_effective_po_id IS NOT NULL THEN
    IF v_invoice.po_id IS NOT NULL
      AND v_grn.po_id IS DISTINCT FROM v_invoice.po_id THEN
      v_status := 'discrepancy';
      v_reason := 'po_grn_mismatch';
    ELSIF NOT EXISTS (
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
  'Matches the supplier invoice pre-VAT subtotal against confirmed net accepted GRN value and, when fully priced, the linked PO subtotal.';

REVOKE ALL ON FUNCTION public.recompute_supplier_invoice_matching(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_supplier_invoice_matching(bigint)
  TO authenticated, service_role;
