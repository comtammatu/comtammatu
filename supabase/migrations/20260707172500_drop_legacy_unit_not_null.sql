-- Drop NOT NULL constraint from legacy 'unit' columns across inventory and production tables
-- This allows the system to smoothly transition to Phase C (entry_unit_id) without requiring the old string fields.

ALTER TABLE public.production_recipes ALTER COLUMN unit DROP NOT NULL;
ALTER TABLE public.production_order_items ALTER COLUMN unit DROP NOT NULL;
ALTER TABLE public.recipes ALTER COLUMN unit DROP NOT NULL;
ALTER TABLE public.purchase_order_items ALTER COLUMN unit DROP NOT NULL;
ALTER TABLE public.grn_items ALTER COLUMN unit DROP NOT NULL;
ALTER TABLE public.stock_issue_items ALTER COLUMN unit DROP NOT NULL;
ALTER TABLE public.stock_transfer_items ALTER COLUMN unit DROP NOT NULL;
ALTER TABLE public.supplier_return_items ALTER COLUMN unit DROP NOT NULL;
ALTER TABLE public.attendance_consumption_report_lines ALTER COLUMN unit DROP NOT NULL;
