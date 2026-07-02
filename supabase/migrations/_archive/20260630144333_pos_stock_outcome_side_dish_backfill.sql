WITH enabled_branches AS (
  SELECT branch_id, created_at AS enabled_at
  FROM public.branch_feature_flags
  WHERE flag_key = 'pos_stock_outcome_posting'
    AND enabled = TRUE
),
candidate_orders AS (
  SELECT
    sm.tenant_id,
    sm.branch_id,
    sm.order_id,
    sm.location_id,
    MIN(sm.created_at) AS posted_at,
    (ARRAY_AGG(sm.created_by ORDER BY sm.created_at, sm.id))[1] AS actor_id
  FROM public.stock_movements sm
  JOIN enabled_branches eb
    ON eb.branch_id = sm.branch_id
   AND sm.created_at >= eb.enabled_at
  WHERE sm.order_id IS NOT NULL
    AND sm.movement_subtype = 'sale_consumption'
  GROUP BY sm.tenant_id, sm.branch_id, sm.order_id, sm.location_id
),
candidate_order_items AS (
  SELECT
    oi.id AS order_item_id,
    oi.order_id,
    oi.tenant_id,
    oi.menu_item_id,
    oi.quantity AS item_quantity,
    oi.sides,
    o.branch_id,
    co.location_id,
    co.posted_at,
    co.actor_id
  FROM candidate_orders co
  JOIN public.orders o
    ON o.id = co.order_id
   AND o.tenant_id = co.tenant_id
   AND o.branch_id = co.branch_id
  JOIN public.order_items oi
    ON oi.order_id = o.id
   AND oi.tenant_id = o.tenant_id
  WHERE o.status = 'completed'
    AND o.payment_status = 'paid'
    AND oi.status <> 'cancelled'
    AND EXISTS (
      SELECT 1
      FROM public.kds_tickets kt
      WHERE kt.order_item_id = oi.id
        AND kt.tenant_id = oi.tenant_id
        AND kt.order_id = oi.order_id
        AND kt.first_ready_at IS NOT NULL
        AND kt.status <> 'cancelled'
    )
    AND EXISTS (
      SELECT 1
      FROM public.order_items side_oi
      WHERE side_oi.order_id = o.id
        AND side_oi.tenant_id = o.tenant_id
        AND side_oi.status <> 'cancelled'
        AND jsonb_typeof(COALESCE(side_oi.sides, '[]'::jsonb)) = 'array'
        AND jsonb_array_length(COALESCE(side_oi.sides, '[]'::jsonb)) > 0
    )
),
side_lines AS (
  SELECT
    coi.tenant_id,
    coi.branch_id,
    coi.order_id,
    coi.location_id,
    coi.posted_at,
    coi.actor_id,
    (s.elem ->> 'side_item_id')::bigint AS side_menu_item_id,
    coi.item_quantity::numeric *
      CASE
        WHEN COALESCE(s.elem ->> 'quantity', '') ~ '^[0-9]+$'
          THEN (s.elem ->> 'quantity')::numeric
        ELSE 1
      END AS side_quantity
  FROM candidate_order_items coi
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(coi.sides, '[]'::jsonb)) AS s(elem)
  WHERE s.elem ? 'side_item_id'
    AND (s.elem ->> 'side_item_id') ~ '^[0-9]+$'
),
consumption_lines AS (
  SELECT
    tenant_id,
    branch_id,
    order_id,
    location_id,
    posted_at,
    actor_id,
    menu_item_id,
    item_quantity::numeric AS line_quantity
  FROM candidate_order_items

  UNION ALL

  SELECT
    tenant_id,
    branch_id,
    order_id,
    location_id,
    posted_at,
    actor_id,
    side_menu_item_id AS menu_item_id,
    side_quantity AS line_quantity
  FROM side_lines
),
expected_needs AS (
  SELECT
    cl.tenant_id,
    cl.branch_id,
    cl.order_id,
    cl.location_id,
    cl.posted_at,
    cl.actor_id,
    r.ingredient_id,
    ROUND(SUM(
      cl.line_quantity * r.quantity / r.yield_factor * iu.to_base_factor
    ), 3)::numeric(15,3) AS expected_need_qty
  FROM consumption_lines cl
  JOIN public.recipes r
    ON r.tenant_id = cl.tenant_id
   AND r.menu_item_id = cl.menu_item_id
  JOIN public.ingredient_units iu
    ON iu.tenant_id = r.tenant_id
   AND iu.ingredient_id = r.ingredient_id
   AND iu.unit_id = r.entry_unit_id
   AND iu.is_active = TRUE
  GROUP BY
    cl.tenant_id,
    cl.branch_id,
    cl.order_id,
    cl.location_id,
    cl.posted_at,
    cl.actor_id,
    r.ingredient_id
),
underposted_movements AS (
  SELECT
    sm.id AS movement_id,
    en.tenant_id,
    en.branch_id,
    en.location_id,
    en.ingredient_id,
    en.expected_need_qty + sm.quantity_change AS missing_qty
  FROM expected_needs en
  JOIN public.stock_movements sm
    ON sm.tenant_id = en.tenant_id
   AND sm.branch_id = en.branch_id
   AND sm.order_id = en.order_id
   AND sm.location_id = en.location_id
   AND sm.ingredient_id = en.ingredient_id
   AND sm.movement_subtype = 'sale_consumption'
  WHERE en.expected_need_qty > 0
    AND sm.quantity_change < 0
    AND en.expected_need_qty + sm.quantity_change > 0
),
updated_movements AS (
  UPDATE public.stock_movements sm
  SET
    quantity_change = sm.quantity_change - um.missing_qty,
    reason = concat_ws(' + ', NULLIF(sm.reason, ''), 'side dish backfill')
  FROM underposted_movements um
  WHERE sm.id = um.movement_id
    AND COALESCE(sm.reason, '') NOT LIKE '%side dish backfill%'
  RETURNING
    um.tenant_id,
    um.branch_id,
    um.location_id,
    um.ingredient_id,
    um.missing_qty
),
updated_stock_levels AS (
  UPDATE public.stock_levels sl
  SET
    current_quantity = sl.current_quantity - um.missing_qty,
    updated_at = now()
  FROM updated_movements um
  WHERE sl.tenant_id = um.tenant_id
    AND sl.branch_id = um.branch_id
    AND sl.location_id = um.location_id
    AND sl.ingredient_id = um.ingredient_id
  RETURNING sl.id
),
missing_movements AS (
  SELECT en.*
  FROM expected_needs en
  WHERE en.expected_need_qty > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.stock_movements sm
      WHERE sm.tenant_id = en.tenant_id
        AND sm.branch_id = en.branch_id
        AND sm.order_id = en.order_id
        AND sm.location_id = en.location_id
        AND sm.ingredient_id = en.ingredient_id
        AND sm.movement_subtype = 'sale_consumption'
    )
)
INSERT INTO public.stock_movements (
  tenant_id,
  branch_id,
  ingredient_id,
  type,
  movement_subtype,
  quantity_change,
  reason,
  created_by,
  created_at,
  order_id,
  unit_cost,
  location_id
)
SELECT
  mm.tenant_id,
  mm.branch_id,
  mm.ingredient_id,
  'consumption',
  'sale_consumption',
  -mm.expected_need_qty,
  'Order ' || mm.order_id::text || ' sale consumption side dish backfill',
  mm.actor_id,
  mm.posted_at,
  mm.order_id,
  COALESCE(sl.avg_unit_cost, 0),
  mm.location_id
FROM missing_movements mm
JOIN public.stock_levels sl
  ON sl.tenant_id = mm.tenant_id
 AND sl.branch_id = mm.branch_id
 AND sl.location_id = mm.location_id
 AND sl.ingredient_id = mm.ingredient_id
ON CONFLICT (
  tenant_id,
  order_id,
  movement_subtype,
  ingredient_id,
  location_id
)
WHERE order_id IS NOT NULL
  AND movement_subtype IN (
    'sale_consumption',
    'cancelled_after_kds_ready'
  )
DO NOTHING;
