BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF EXISTS (
    WITH missing AS (
      SELECT DISTINCT pr.tenant_id, pr.ingredient_id, pr.entry_unit_id
      FROM public.production_recipes pr
      LEFT JOIN public.ingredient_units active_iu
        ON active_iu.tenant_id = pr.tenant_id
       AND active_iu.ingredient_id = pr.ingredient_id
       AND active_iu.unit_id = pr.entry_unit_id
       AND active_iu.is_active = TRUE
      WHERE pr.entry_unit_id IS NOT NULL
        AND active_iu.id IS NULL
    )
    SELECT 1
    FROM missing m
    LEFT JOIN public.ingredient_units any_iu
      ON any_iu.tenant_id = m.tenant_id
     AND any_iu.ingredient_id = m.ingredient_id
     AND any_iu.unit_id = m.entry_unit_id
    LEFT JOIN public.units entry_u
      ON entry_u.id = m.entry_unit_id
     AND entry_u.tenant_id = m.tenant_id
    LEFT JOIN public.ingredient_units base_iu
      ON base_iu.tenant_id = m.tenant_id
     AND base_iu.ingredient_id = m.ingredient_id
     AND base_iu.is_base = TRUE
     AND base_iu.is_active = TRUE
    LEFT JOIN public.units base_u
      ON base_u.id = base_iu.unit_id
     AND base_u.tenant_id = base_iu.tenant_id
    WHERE any_iu.id IS NOT NULL
       OR entry_u.id IS NULL
       OR entry_u.code <> 'g'
       OR entry_u.is_standard IS DISTINCT FROM TRUE
       OR entry_u.is_active IS DISTINCT FROM TRUE
       OR entry_u.standard_factor IS NULL
       OR entry_u.standard_factor <= 0
       OR base_iu.id IS NULL
       OR base_u.id IS NULL
       OR base_u.code <> 'kg'
       OR base_u.is_standard IS DISTINCT FROM TRUE
       OR base_u.is_active IS DISTINCT FROM TRUE
       OR base_u.standard_factor IS NULL
       OR base_u.standard_factor <= 0
       OR base_iu.to_base_factor <> 1
  ) THEN
    RAISE EXCEPTION 'production_recipe_unit_repair_unexpected_mapping';
  END IF;
END;
$$;

WITH missing AS (
  SELECT DISTINCT pr.tenant_id, pr.ingredient_id, pr.entry_unit_id
  FROM public.production_recipes pr
  LEFT JOIN public.ingredient_units active_iu
    ON active_iu.tenant_id = pr.tenant_id
   AND active_iu.ingredient_id = pr.ingredient_id
   AND active_iu.unit_id = pr.entry_unit_id
   AND active_iu.is_active = TRUE
  WHERE pr.entry_unit_id IS NOT NULL
    AND active_iu.id IS NULL
), base_units AS (
  SELECT
    missing.tenant_id,
    missing.ingredient_id,
    missing.entry_unit_id,
    base_iu.to_base_factor AS base_to_base_factor,
    entry_u.standard_factor / base_u.standard_factor AS to_base_factor
  FROM missing
  JOIN public.units entry_u
    ON entry_u.id = missing.entry_unit_id
   AND entry_u.tenant_id = missing.tenant_id
  JOIN public.ingredient_units base_iu
    ON base_iu.tenant_id = missing.tenant_id
   AND base_iu.ingredient_id = missing.ingredient_id
   AND base_iu.is_base = TRUE
   AND base_iu.is_active = TRUE
  JOIN public.units base_u
    ON base_u.id = base_iu.unit_id
   AND base_u.tenant_id = base_iu.tenant_id
  WHERE entry_u.code = 'g'
    AND entry_u.is_standard = TRUE
    AND entry_u.is_active = TRUE
    AND entry_u.standard_factor > 0
    AND base_u.code = 'kg'
    AND base_u.is_standard = TRUE
    AND base_u.is_active = TRUE
    AND base_u.standard_factor > 0
    AND base_iu.to_base_factor = 1
)
INSERT INTO public.ingredient_units (
  tenant_id,
  ingredient_id,
  unit_id,
  to_base_factor,
  is_base,
  sort_order,
  is_active
)
SELECT
  base_units.tenant_id,
  base_units.ingredient_id,
  base_units.entry_unit_id,
  base_units.to_base_factor,
  FALSE,
  COALESCE((
    SELECT MAX(existing.sort_order) + 1
    FROM public.ingredient_units existing
    WHERE existing.tenant_id = base_units.tenant_id
      AND existing.ingredient_id = base_units.ingredient_id
  ), 0),
  TRUE
FROM base_units;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.production_recipes pr
    LEFT JOIN public.ingredient_units iu
      ON iu.tenant_id = pr.tenant_id
     AND iu.ingredient_id = pr.ingredient_id
     AND iu.unit_id = pr.entry_unit_id
    WHERE pr.entry_unit_id IS NOT NULL
      AND iu.id IS NULL
  ) THEN
    RAISE EXCEPTION 'production_recipe_unit_repair_incomplete';
  END IF;
END;
$$;

ALTER TABLE public.production_recipes
  ADD CONSTRAINT production_recipes_ingredient_entry_unit_fkey
  FOREIGN KEY (ingredient_id, entry_unit_id, tenant_id)
  REFERENCES public.ingredient_units (ingredient_id, unit_id, tenant_id)
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE public.production_recipes
  VALIDATE CONSTRAINT production_recipes_ingredient_entry_unit_fkey;

COMMIT;
