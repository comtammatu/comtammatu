WITH branch_sites AS (
  SELECT b.id AS branch_id, b.tenant_id
  FROM public.branches b
  WHERE b.branch_kind = 'branch'
)
INSERT INTO public.inventory_locations (
  tenant_id,
  branch_id,
  code,
  name,
  location_kind,
  is_active,
  is_default_receive,
  is_default_issue,
  is_default_consumption,
  sort_order
)
SELECT
  branch_sites.tenant_id,
  branch_sites.branch_id,
  'kitchen',
  'Bếp CN',
  'kitchen',
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  10
FROM branch_sites
WHERE NOT EXISTS (
  SELECT 1
  FROM public.inventory_locations il
  WHERE il.tenant_id = branch_sites.tenant_id
    AND il.branch_id = branch_sites.branch_id
    AND il.location_kind = 'kitchen'
)
ON CONFLICT (code, branch_id, tenant_id) DO UPDATE
SET name = 'Bếp CN',
    location_kind = 'kitchen',
    is_active = TRUE,
    is_default_receive = FALSE,
    is_default_issue = FALSE,
    is_default_consumption = FALSE,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

WITH canonical AS (
  SELECT DISTINCT ON (b.tenant_id, b.id)
    il.id,
    il.tenant_id,
    il.branch_id
  FROM public.branches b
  JOIN public.inventory_locations il
    ON il.tenant_id = b.tenant_id
   AND il.branch_id = b.id
  WHERE b.branch_kind = 'branch'
    AND il.location_kind = 'kitchen'
  ORDER BY
    b.tenant_id,
    b.id,
    il.is_default_consumption DESC,
    il.is_active DESC,
    CASE il.code WHEN 'kitchen' THEN 0 WHEN 'bep_cn' THEN 1 ELSE 2 END,
    il.sort_order NULLS LAST,
    il.id
)
UPDATE public.inventory_locations il
SET is_default_consumption = FALSE,
    updated_at = now()
FROM public.branches b
WHERE il.tenant_id = b.tenant_id
  AND il.branch_id = b.id
  AND b.branch_kind = 'branch'
  AND il.is_default_consumption = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM canonical c
    WHERE c.id = il.id
  );

WITH canonical AS (
  SELECT DISTINCT ON (b.tenant_id, b.id)
    il.id,
    il.tenant_id,
    il.branch_id
  FROM public.branches b
  JOIN public.inventory_locations il
    ON il.tenant_id = b.tenant_id
   AND il.branch_id = b.id
  WHERE b.branch_kind = 'branch'
    AND il.location_kind = 'kitchen'
  ORDER BY
    b.tenant_id,
    b.id,
    il.is_default_consumption DESC,
    il.is_active DESC,
    CASE il.code WHEN 'kitchen' THEN 0 WHEN 'bep_cn' THEN 1 ELSE 2 END,
    il.sort_order NULLS LAST,
    il.id
)
UPDATE public.inventory_locations il
SET name = 'Bếp CN',
    is_active = TRUE,
    is_default_receive = FALSE,
    is_default_issue = FALSE,
    is_default_consumption = TRUE,
    sort_order = CASE WHEN il.sort_order = 0 THEN 10 ELSE il.sort_order END,
    updated_at = now()
FROM canonical c
WHERE il.id = c.id;

WITH canonical AS (
  SELECT DISTINCT ON (b.tenant_id, b.id)
    il.id AS location_id,
    il.tenant_id,
    il.branch_id
  FROM public.branches b
  JOIN public.inventory_locations il
    ON il.tenant_id = b.tenant_id
   AND il.branch_id = b.id
  WHERE b.branch_kind = 'branch'
    AND il.location_kind = 'kitchen'
    AND il.is_active = TRUE
    AND il.is_default_consumption = TRUE
  ORDER BY b.tenant_id, b.id, il.sort_order NULLS LAST, il.id
),
warehouse_stock AS (
  SELECT DISTINCT ON (sl.tenant_id, sl.branch_id, sl.ingredient_id)
    sl.tenant_id,
    sl.branch_id,
    sl.ingredient_id,
    sl.avg_unit_cost
  FROM public.stock_levels sl
  JOIN public.inventory_locations il
    ON il.id = sl.location_id
   AND il.tenant_id = sl.tenant_id
   AND il.branch_id = sl.branch_id
  JOIN public.branches b
    ON b.tenant_id = sl.tenant_id
   AND b.id = sl.branch_id
  WHERE b.branch_kind = 'branch'
    AND il.location_kind = 'warehouse'
  ORDER BY
    sl.tenant_id,
    sl.branch_id,
    sl.ingredient_id,
    sl.current_quantity DESC,
    sl.id
)
INSERT INTO public.stock_levels (
  tenant_id,
  branch_id,
  ingredient_id,
  location_id,
  current_quantity,
  avg_unit_cost
)
SELECT
  warehouse_stock.tenant_id,
  warehouse_stock.branch_id,
  warehouse_stock.ingredient_id,
  canonical.location_id,
  0,
  warehouse_stock.avg_unit_cost
FROM warehouse_stock
JOIN canonical
  ON canonical.tenant_id = warehouse_stock.tenant_id
 AND canonical.branch_id = warehouse_stock.branch_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.stock_levels existing
  WHERE existing.tenant_id = warehouse_stock.tenant_id
    AND existing.branch_id = warehouse_stock.branch_id
    AND existing.ingredient_id = warehouse_stock.ingredient_id
    AND existing.location_id = canonical.location_id
);
