BEGIN;

ALTER TABLE public.ingredient_units
  ALTER COLUMN to_base_factor TYPE numeric(18,12);

CREATE OR REPLACE FUNCTION public.compute_menu_item_stock_capacity(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_menu_item_id bigint
) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH recipe_lines AS (
    SELECT
      r.ingredient_id,
      CASE
        WHEN r.entry_unit_id IS NULL THEN r.quantity / r.yield_factor
        WHEN iu.id IS NULL THEN NULL::numeric
        ELSE (r.quantity / r.yield_factor) * iu.to_base_factor
      END AS per_portion_qty,
      (r.entry_unit_id IS NOT NULL AND iu.id IS NULL) AS line_missing_config
    FROM public.recipes r
    LEFT JOIN public.ingredient_units iu
      ON iu.tenant_id = p_tenant_id
     AND iu.ingredient_id = r.ingredient_id
     AND iu.unit_id = r.entry_unit_id
     AND iu.is_active = TRUE
    WHERE r.tenant_id = p_tenant_id
      AND r.menu_item_id = p_menu_item_id
  ),
  capacity_lines AS (
    SELECT
      rl.ingredient_id,
      rl.per_portion_qty,
      rl.line_missing_config,
      COALESCE(oh.on_hand, 0) AS on_hand
    FROM recipe_lines rl
    LEFT JOIN LATERAL (
      SELECT SUM(sl.current_quantity) AS on_hand
      FROM public.stock_levels sl
      JOIN public.inventory_locations il ON il.id = sl.location_id
      WHERE sl.tenant_id = p_tenant_id
        AND sl.branch_id = p_branch_id
        AND sl.ingredient_id = rl.ingredient_id
        AND il.location_kind = 'warehouse'
        AND il.is_active = TRUE
    ) oh ON TRUE
  )
  SELECT CASE
    WHEN COUNT(*) = 0 THEN NULL::integer
    WHEN BOOL_OR(
      line_missing_config
      OR per_portion_qty IS NULL
      OR per_portion_qty <= 0
    ) THEN NULL::integer
    ELSE FLOOR(MIN(on_hand / NULLIF(per_portion_qty, 0)) + 0.000001)::integer
  END
  FROM capacity_lines;
$$;

WITH target_factors(sku, sale_unit_code, sale_to_base_factor) AS (
  VALUES
    ('TP-SUON-COT-LET', 'piece', (1.0 / 43.5)::numeric),
    ('TP-SUON-CONG', 'piece', (1.0 / 40)::numeric),
    ('TP-SUON-MOT-GANG', 'piece', (1.0 / 12.5)::numeric),
    ('TP-BI', 'piece', (1.0 / 27)::numeric),
    ('TP-CHA', 'piece', (1.0 / 52)::numeric),
    ('TP-TRUNG', 'piece', (1.0 / 30)::numeric),
    ('TP-COM-THEM', 'piece', (1.0 / 10)::numeric),
    ('TP-TOP-MO', 'piece', (1.0 / 10)::numeric),
    ('TP-CAM', 'ly', (1.0 / 2)::numeric),
    ('TP-TRA-TAC', 'ly', 200::numeric),
    ('TP-RAU-MA', 'ly', 200::numeric),
    ('TP-NUOC-SAM', 'ly', 200::numeric),
    ('TP-FANTA-CAM', 'lon', (1.0 / 24)::numeric),
    ('TP-FANTA-XA-XI', 'lon', (1.0 / 24)::numeric),
    ('TP-SPRITE', 'lon', (1.0 / 24)::numeric),
    ('TP-NUOC-SUOI', 'chai', (1.0 / 24)::numeric),
    ('TP-TRA-DA', 'ly', (1.0 / 500)::numeric),
    ('TP-KHAN-LANH', 'piece', (1.0 / 100)::numeric)
)
UPDATE public.ingredient_units iu
SET to_base_factor = tf.sale_to_base_factor
FROM target_factors tf
JOIN public.ingredients i
  ON i.sku = tf.sku
JOIN public.units u
  ON u.tenant_id = i.tenant_id
 AND u.code = tf.sale_unit_code
WHERE iu.tenant_id = i.tenant_id
  AND iu.ingredient_id = i.id
  AND iu.unit_id = u.id
  AND iu.is_base = FALSE;

SELECT public.refresh_branch_menu_stock_capacity(t.id, b.id)
FROM public.tenants t
JOIN public.branches b
  ON b.tenant_id = t.id
WHERE b.is_active;

REVOKE ALL ON FUNCTION public.compute_menu_item_stock_capacity(bigint, bigint, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_menu_item_stock_capacity(bigint, bigint, bigint)
  TO service_role;

COMMIT;
