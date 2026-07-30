-- Replace tenant-leading partial indexes so PostgreSQL can use them for
-- single-column foreign-key checks.

DROP INDEX IF EXISTS public.inventory_valuation_events_invoice_idx;
CREATE INDEX inventory_valuation_events_invoice_idx
ON public.inventory_valuation_events (source_invoice_id)
WHERE source_invoice_id IS NOT NULL;

DROP INDEX IF EXISTS public.stock_movements_grn_item_idx;
CREATE INDEX stock_movements_grn_item_idx
ON public.stock_movements (grn_item_id)
WHERE grn_item_id IS NOT NULL;
