-- Drop legacy 'unit' columns from inventory and production tables
-- We previously dropped their NOT NULL constraints in 20260707172500_drop_legacy_unit_not_null.sql.
-- These columns are no longer used by the codebase.

ALTER TABLE public.production_recipes DROP COLUMN IF EXISTS unit;
ALTER TABLE public.production_order_items DROP COLUMN IF EXISTS unit;
ALTER TABLE public.recipes DROP COLUMN IF EXISTS unit;
ALTER TABLE public.purchase_order_items DROP COLUMN IF EXISTS unit;
ALTER TABLE public.grn_items DROP COLUMN IF EXISTS unit;
ALTER TABLE public.stock_issue_items DROP COLUMN IF EXISTS unit;
ALTER TABLE public.stock_transfer_items DROP COLUMN IF EXISTS unit;
ALTER TABLE public.supplier_return_items DROP COLUMN IF EXISTS unit;
ALTER TABLE public.attendance_consumption_report_lines DROP COLUMN IF EXISTS unit;
