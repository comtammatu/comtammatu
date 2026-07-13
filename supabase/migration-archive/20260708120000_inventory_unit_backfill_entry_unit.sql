-- Backfill any remaining NULL stock_movements.entry_unit_id before writers are
-- patched. Idempotent: only touches rows where entry_unit_id IS NULL.
--
-- The NOT NULL constraint (20260707191741) already ran in prod; this catches
-- rows that were inserted NULL by a writer before that constraint existed and
-- were missed by the earlier 20260708103000 backfill, plus any edge rows where
-- entry_quantity was not derived. Each NULL is resolved to the ingredient's
-- active base unit, and entry_quantity falls back to ABS(quantity_change) so the
-- entry/base pair is self-consistent.

SET search_path TO '';

WITH base_units AS (
  SELECT DISTINCT ON (iu.tenant_id, iu.ingredient_id)
    iu.tenant_id,
    iu.ingredient_id,
    iu.unit_id
  FROM public.ingredient_units iu
  JOIN public.units u
    ON u.id = iu.unit_id
   AND u.tenant_id = iu.tenant_id
   AND u.is_active = TRUE
  WHERE iu.is_base = TRUE
    AND iu.is_active = TRUE
  ORDER BY iu.tenant_id, iu.ingredient_id, iu.sort_order ASC, iu.id ASC
)
UPDATE public.stock_movements sm
SET entry_unit_id = bu.unit_id,
    entry_quantity = COALESCE(sm.entry_quantity, ABS(sm.quantity_change))
FROM base_units bu
WHERE sm.tenant_id = bu.tenant_id
  AND sm.ingredient_id = bu.ingredient_id
  AND sm.entry_unit_id IS NULL;
