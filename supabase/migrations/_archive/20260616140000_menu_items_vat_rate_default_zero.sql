-- menu_items.vat_rate is vestigial after derive_sales_tax_rate (the order-item
-- VAT snapshot is derived by populate_order_item_vat_rate -> resolve_gtgt_rate,
-- no longer read from menu_items). Dropping its 8.00 default in 20260616130000
-- made the NOT NULL column required on INSERT, breaking menu creation which
-- never supplies it. Give it a neutral default so inserts can omit it.
ALTER TABLE public.menu_items ALTER COLUMN vat_rate SET DEFAULT 0;
