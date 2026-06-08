ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS purchase_unit TEXT,
  ADD COLUMN IF NOT EXISTS measure_unit TEXT;

UPDATE public.ingredients
SET
  purchase_unit = COALESCE(NULLIF(purchase_unit, ''), unit),
  measure_unit = COALESCE(NULLIF(measure_unit, ''), unit);

ALTER TABLE public.ingredients
  ALTER COLUMN purchase_unit SET NOT NULL,
  ALTER COLUMN measure_unit SET NOT NULL;
