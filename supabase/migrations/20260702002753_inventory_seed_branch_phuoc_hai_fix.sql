BEGIN;

WITH expected_stock(sku, quantity) AS (
  VALUES
    ('TP-SUON-COT-LET', 7::numeric),
    ('TP-SUON-CONG', 3.6::numeric),
    ('TP-SUON-MOT-GANG', 1.92::numeric),
    ('TP-BI', 1::numeric),
    ('TP-CHA', 1.5::numeric),
    ('TP-TRUNG', 0.1::numeric),
    ('TP-COM-THEM', 200::numeric),
    ('TP-TOP-MO', 0.6::numeric),
    ('TP-CAM', 5.5::numeric),
    ('TP-TRA-TAC', 8600::numeric),
    ('TP-RAU-MA', 10050::numeric),
    ('TP-NUOC-SAM', 6100::numeric),
    ('TP-FANTA-CAM', 2::numeric),
    ('TP-FANTA-XA-XI', 2.375::numeric),
    ('TP-SPRITE', 1.75::numeric),
    ('TP-NUOC-SUOI', 2.417::numeric),
    ('TP-KHAN-LANH', 10::numeric)
),
ph_target AS (
  SELECT
    i.tenant_id,
    b.id AS branch_id,
    il.id AS location_id,
    i.id AS ingredient_id,
    e.quantity
  FROM expected_stock e
  JOIN public.ingredients i
    ON i.sku = e.sku
   AND i.is_active
  JOIN public.branches b
    ON b.tenant_id = i.tenant_id
   AND b.code = 'PH'
   AND b.is_active
  JOIN public.inventory_locations il
    ON il.tenant_id = i.tenant_id
   AND il.branch_id = b.id
   AND il.code = 'main_warehouse'
   AND il.is_active
)
DELETE FROM public.stock_levels sl
USING ph_target pt
WHERE sl.tenant_id = pt.tenant_id
  AND sl.ingredient_id = pt.ingredient_id
  AND (
    sl.branch_id <> pt.branch_id
    OR sl.location_id <> pt.location_id
  );

WITH expected_stock(sku, quantity) AS (
  VALUES
    ('TP-SUON-COT-LET', 7::numeric),
    ('TP-SUON-CONG', 3.6::numeric),
    ('TP-SUON-MOT-GANG', 1.92::numeric),
    ('TP-BI', 1::numeric),
    ('TP-CHA', 1.5::numeric),
    ('TP-TRUNG', 0.1::numeric),
    ('TP-COM-THEM', 200::numeric),
    ('TP-TOP-MO', 0.6::numeric),
    ('TP-CAM', 5.5::numeric),
    ('TP-TRA-TAC', 8600::numeric),
    ('TP-RAU-MA', 10050::numeric),
    ('TP-NUOC-SAM', 6100::numeric),
    ('TP-FANTA-CAM', 2::numeric),
    ('TP-FANTA-XA-XI', 2.375::numeric),
    ('TP-SPRITE', 1.75::numeric),
    ('TP-NUOC-SUOI', 2.417::numeric),
    ('TP-KHAN-LANH', 10::numeric)
)
INSERT INTO public.stock_levels (
  tenant_id, branch_id, ingredient_id, current_quantity,
  last_counted_at, updated_at, location_id
)
SELECT
  i.tenant_id,
  b.id,
  i.id,
  e.quantity,
  now(),
  now(),
  il.id
FROM expected_stock e
JOIN public.ingredients i
  ON i.sku = e.sku
 AND i.is_active
JOIN public.branches b
  ON b.tenant_id = i.tenant_id
 AND b.code = 'PH'
 AND b.is_active
JOIN public.inventory_locations il
  ON il.tenant_id = i.tenant_id
 AND il.branch_id = b.id
 AND il.code = 'main_warehouse'
 AND il.is_active
ON CONFLICT (ingredient_id, branch_id, location_id, tenant_id) DO UPDATE
SET current_quantity = EXCLUDED.current_quantity,
    last_counted_at = EXCLUDED.last_counted_at,
    updated_at = EXCLUDED.updated_at;

SELECT public.refresh_branch_menu_stock_capacity(t.id, b.id)
FROM public.tenants t
JOIN public.branches b
  ON b.tenant_id = t.id
WHERE b.is_active;

COMMIT;
