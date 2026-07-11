ALTER TABLE public.stock_levels
  DROP CONSTRAINT IF EXISTS stock_levels_current_quantity_nonneg;
