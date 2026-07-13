-- Drop legacy 'unit' columns from inventory and production tables
-- We previously dropped their NOT NULL constraints in 20260707172500_drop_legacy_unit_not_null.sql.
-- These columns are no longer used by the codebase.

SELECT cron.unschedule('refresh_mv_grn_price_baseline')
WHERE EXISTS (
  SELECT 1
  FROM cron.job
  WHERE jobname = 'refresh_mv_grn_price_baseline'
);

DROP TRIGGER IF EXISTS trg_grn_items_compute_variance ON public.grn_items;
DROP FUNCTION IF EXISTS public.grn_items_compute_variance();
DROP MATERIALIZED VIEW IF EXISTS public.mv_grn_price_baseline;

ALTER TABLE public.production_recipes DROP COLUMN IF EXISTS unit;
ALTER TABLE public.production_order_items DROP COLUMN IF EXISTS unit;
ALTER TABLE public.recipes DROP COLUMN IF EXISTS unit;
ALTER TABLE public.purchase_order_items DROP COLUMN IF EXISTS unit;
ALTER TABLE public.grn_items DROP COLUMN IF EXISTS unit;
ALTER TABLE public.stock_issue_items DROP COLUMN IF EXISTS unit;
ALTER TABLE public.stock_transfer_items DROP COLUMN IF EXISTS unit;
ALTER TABLE public.supplier_return_items DROP COLUMN IF EXISTS unit;
ALTER TABLE public.attendance_consumption_report_lines DROP COLUMN IF EXISTS unit;
