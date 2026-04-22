ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS purchase_to_measure_factor NUMERIC(15,6) NOT NULL DEFAULT 1;

ALTER TABLE public.ingredients
  ADD CONSTRAINT ingredients_purchase_to_measure_factor_positive
  CHECK (purchase_to_measure_factor > 0);

COMMENT ON COLUMN public.ingredients.purchase_to_measure_factor IS
  'Number of measure_unit units contained in one purchase_unit. Example: 1 bottle = 250 ml => factor 250.';
