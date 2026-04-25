-- =============================================================
-- Fix: mv_top_items and mv_food_cost CONCURRENTLY-refresh fails
-- =============================================================
-- Root cause: GROUP BY includes `oi.item_name` (snapshot at order time)
-- but the unique index covers (period_start, branch_id, tenant_id, menu_item_id)
-- only. When the same menu_item_id is sold under two different item_name
-- strings (e.g., menu rename "Cà phê" -> "Cà Phê"), the MV produces two rows
-- per unique-key tuple, violating idx_mv_*_pk during REFRESH CONCURRENTLY.
--
-- Confirmed in dev DB: tenant 1 / branch 2 has menu items renamed in flight,
-- producing 2-3 distinct item_name strings per menu_item_id.
--
-- Fix: drop oi.item_name from GROUP BY, aggregate with MAX(item_name) so each
-- (period_start, branch_id, tenant_id, menu_item_id) yields exactly one row.
-- The displayed name is deterministic but may differ slightly from the latest
-- rename — acceptable for dashboard label.

DROP MATERIALIZED VIEW IF EXISTS public.mv_top_items;

CREATE MATERIALIZED VIEW public.mv_top_items AS
SELECT
  date_trunc('week', o.created_at)::date AS period_start,
  (date_trunc('week', o.created_at) + interval '6 days')::date AS period_end,
  o.branch_id,
  o.tenant_id,
  oi.menu_item_id,
  MAX(oi.item_name) AS item_name,
  SUM(oi.quantity) AS quantity_sold,
  SUM(oi.subtotal) AS revenue
FROM public.order_items oi
JOIN public.orders o ON oi.order_id = o.id
WHERE o.status NOT IN ('cancelled')
  AND oi.status NOT IN ('cancelled')
GROUP BY period_start, period_end, o.branch_id, o.tenant_id, oi.menu_item_id;

CREATE UNIQUE INDEX idx_mv_top_items_pk
  ON public.mv_top_items(period_start, branch_id, tenant_id, menu_item_id);

GRANT SELECT ON public.mv_top_items TO authenticated;


DROP MATERIALIZED VIEW IF EXISTS public.mv_food_cost;

CREATE MATERIALIZED VIEW public.mv_food_cost AS
WITH latest_grn_cost AS (
  SELECT DISTINCT ON (gi.ingredient_id, gi.tenant_id)
    gi.ingredient_id,
    gi.tenant_id,
    gi.unit_cost
  FROM public.grn_items gi
  JOIN public.goods_received_notes grn ON grn.id = gi.grn_id
  WHERE grn.status = 'confirmed'
    AND gi.quality_status = 'accepted'
  ORDER BY gi.ingredient_id, gi.tenant_id, grn.received_date DESC NULLS LAST
),
recipe_cost AS (
  SELECT
    r.menu_item_id,
    r.tenant_id,
    SUM(r.quantity * COALESCE(lgc.unit_cost, i.unit_cost, 0)) AS cost_per_unit
  FROM public.recipes r
  JOIN public.ingredients i ON i.id = r.ingredient_id
  LEFT JOIN latest_grn_cost lgc
    ON lgc.ingredient_id = r.ingredient_id
    AND lgc.tenant_id = r.tenant_id
  GROUP BY r.menu_item_id, r.tenant_id
)
SELECT
  date_trunc('week', o.created_at)::date AS period_start,
  (date_trunc('week', o.created_at) + interval '6 days')::date AS period_end,
  o.branch_id,
  o.tenant_id,
  oi.menu_item_id,
  MAX(oi.item_name) AS item_name,
  SUM(oi.quantity) AS quantity_sold,
  SUM(oi.subtotal) AS revenue,
  SUM(oi.quantity * COALESCE(rc.cost_per_unit, 0)) AS ingredient_cost,
  CASE
    WHEN SUM(oi.subtotal) > 0
    THEN ROUND(SUM(oi.quantity * COALESCE(rc.cost_per_unit, 0)) / SUM(oi.subtotal) * 100, 2)
    ELSE 0
  END AS food_cost_pct
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
LEFT JOIN recipe_cost rc
  ON rc.menu_item_id = oi.menu_item_id
  AND rc.tenant_id = oi.tenant_id
WHERE o.status NOT IN ('cancelled')
  AND oi.status NOT IN ('cancelled')
GROUP BY period_start, period_end, o.branch_id, o.tenant_id, oi.menu_item_id;

CREATE UNIQUE INDEX idx_mv_food_cost_pk
  ON public.mv_food_cost(period_start, branch_id, tenant_id, menu_item_id);

GRANT SELECT ON public.mv_food_cost TO authenticated;
