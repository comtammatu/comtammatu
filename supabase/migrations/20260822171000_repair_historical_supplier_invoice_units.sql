-- Migration: Repair historical supplier invoice line units and price history units.
-- Fixes line units that were saved with GRN entry units instead of PO entry units.

DO $$
DECLARE
  v_lines_updated integer;
  v_history_updated integer;
BEGIN
  -- 1. Update supplier_invoice_lines unit_id to match the PO item entry_unit_id
  WITH updated_lines AS (
    UPDATE public.supplier_invoice_lines AS line
    SET unit_id = po_item.entry_unit_id
    FROM public.supplier_invoice_receipt_allocations AS alloc
    JOIN public.purchase_order_items AS po_item
      ON po_item.id = alloc.purchase_order_item_id
     AND po_item.tenant_id = alloc.tenant_id
    WHERE alloc.invoice_line_id = line.id
      AND alloc.tenant_id = line.tenant_id
      AND po_item.entry_unit_id IS NOT NULL
      AND line.unit_id IS DISTINCT FROM po_item.entry_unit_id
    RETURNING line.id
  )
  SELECT count(*) INTO v_lines_updated FROM updated_lines;

  -- 2. Update supplier_ingredient_price_history unit_id to match the corrected invoice line unit_id
  WITH updated_history AS (
    UPDATE public.supplier_ingredient_price_history AS hist
    SET unit_id = line.unit_id
    FROM public.supplier_invoice_lines AS line
    WHERE hist.supplier_invoice_line_id = line.id
      AND hist.tenant_id = line.tenant_id
      AND hist.unit_id IS DISTINCT FROM line.unit_id
    RETURNING hist.id
  )
  SELECT count(*) INTO v_history_updated FROM updated_history;

  RAISE NOTICE 'Repaired % supplier invoice lines and % price history entries.',
    v_lines_updated, v_history_updated;
END $$;
