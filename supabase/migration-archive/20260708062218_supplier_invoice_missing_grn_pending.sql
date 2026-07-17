CREATE OR REPLACE FUNCTION public.recompute_supplier_invoice_matching(p_invoice_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant   BIGINT := public.auth_tenant_id();
  v_inv      RECORD;
  v_grn_tot  NUMERIC(15,2);
  v_po_tot   NUMERIC(15,2);
  v_status   TEXT := 'pending';
  v_reason   TEXT := 'missing_grn';
BEGIN
  SELECT * INTO v_inv FROM public.supplier_invoices
  WHERE id = p_invoice_id AND tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_inv.grn_id IS NULL THEN
    UPDATE public.supplier_invoices
    SET matching_status = v_status, updated_at = now()
    WHERE id = p_invoice_id;

    RETURN jsonb_build_object(
      'invoice_id', p_invoice_id,
      'matching_status', v_status,
      'reason', v_reason
    );
  END IF;

  v_status := 'matched';
  v_reason := 'grn_total_within_tolerance';

  IF v_inv.grn_id IS NOT NULL THEN
    SELECT COALESCE(SUM(gi.total_cost), 0) INTO v_grn_tot
    FROM public.grn_items gi WHERE gi.grn_id = v_inv.grn_id;
    IF v_inv.total_amount > v_grn_tot * 1.02 THEN
      v_status := 'discrepancy';
      v_reason := 'grn_total_mismatch';
    END IF;
  END IF;

  IF v_inv.po_id IS NOT NULL THEN
    SELECT COALESCE(SUM(poi.line_total), 0) INTO v_po_tot
    FROM public.purchase_order_items poi WHERE poi.po_id = v_inv.po_id;
    IF v_po_tot > 0 AND abs(v_inv.subtotal - v_po_tot) / v_po_tot > 0.02 THEN
      v_status := 'discrepancy';
      v_reason := 'po_total_mismatch';
    ELSIF v_po_tot > 0 AND v_status = 'matched' THEN
      v_reason := 'grn_and_po_total_within_tolerance';
    END IF;
  END IF;

  UPDATE public.supplier_invoices
  SET matching_status = v_status, updated_at = now()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object(
    'invoice_id', p_invoice_id,
    'matching_status', v_status,
    'reason', v_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_supplier_invoice_matching(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_supplier_invoice_matching(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_supplier_invoice_matching(bigint) TO service_role;

UPDATE public.supplier_invoices
SET matching_status = 'pending', updated_at = now()
WHERE grn_id IS NULL
  AND matching_status = 'matched';
