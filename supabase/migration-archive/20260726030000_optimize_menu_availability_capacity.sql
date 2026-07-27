BEGIN;

CREATE OR REPLACE FUNCTION public.branch_menu_limit_availability(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_limit_date date,
  p_stock_gate_enabled boolean DEFAULT false,
  p_exclude_hold_tokens uuid[] DEFAULT NULL::uuid[]
) RETURNS TABLE(
  menu_item_id bigint,
  item_name text,
  category_id bigint,
  category_name text,
  base_price numeric,
  limit_id bigint,
  limit_date date,
  is_disabled boolean,
  sold_today integer,
  stock_capacity integer,
  manual_limit_quantity integer,
  pending_unfinalized_demand integer,
  active_hold_demand integer,
  available_to_sell integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH order_line_demand AS (
    SELECT oi.menu_item_id::bigint AS menu_item_id,
           oi.quantity::integer AS quantity
    FROM public.orders o
    JOIN public.order_items oi
      ON oi.order_id = o.id
     AND oi.tenant_id = o.tenant_id
    WHERE o.tenant_id = p_tenant_id
      AND o.branch_id = p_branch_id
      AND (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = p_limit_date
      AND o.status NOT IN ('completed', 'cancelled')
      AND oi.status <> 'cancelled'

    UNION ALL

    SELECT (s.elem ->> 'side_item_id')::bigint AS menu_item_id,
           (oi.quantity * COALESCE(NULLIF(s.elem ->> 'quantity', '')::integer, 1))::integer AS quantity
    FROM public.orders o
    JOIN public.order_items oi
      ON oi.order_id = o.id
     AND oi.tenant_id = o.tenant_id
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(oi.sides, '[]'::jsonb)) AS s(elem)
    WHERE o.tenant_id = p_tenant_id
      AND o.branch_id = p_branch_id
      AND (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = p_limit_date
      AND o.status NOT IN ('completed', 'cancelled')
      AND oi.status <> 'cancelled'
      AND s.elem ? 'side_item_id'
      AND (s.elem ->> 'side_item_id') ~ '^[0-9]+$'
  ),
  pending_item AS (
    SELECT d.menu_item_id,
           SUM(d.quantity)::integer AS quantity
    FROM order_line_demand d
    GROUP BY d.menu_item_id
  ),
  holds_item AS (
    SELECT h.menu_item_id,
           SUM(h.quantity)::integer AS quantity
    FROM public.branch_menu_item_daily_holds h
    WHERE h.tenant_id = p_tenant_id
      AND h.branch_id = p_branch_id
      AND h.limit_date = p_limit_date
      AND h.committed_at IS NULL
      AND h.released_at IS NULL
      AND h.expires_at > now()
      AND (p_exclude_hold_tokens IS NULL OR h.hold_token <> ALL(p_exclude_hold_tokens))
    GROUP BY h.menu_item_id
  ),
  recipe_lines AS (
    SELECT
      r.menu_item_id,
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
  ),
  pending_ingredient AS (
    SELECT
      rl.ingredient_id,
      SUM(pi.quantity * rl.per_portion_qty) AS base_qty
    FROM pending_item pi
    JOIN recipe_lines rl ON rl.menu_item_id = pi.menu_item_id
    WHERE rl.line_missing_config = false
      AND rl.per_portion_qty IS NOT NULL
      AND rl.per_portion_qty > 0
    GROUP BY rl.ingredient_id
  ),
  holds_ingredient AS (
    SELECT
      rl.ingredient_id,
      SUM(hi.quantity * rl.per_portion_qty) AS base_qty
    FROM holds_item hi
    JOIN recipe_lines rl ON rl.menu_item_id = hi.menu_item_id
    WHERE rl.line_missing_config = false
      AND rl.per_portion_qty IS NOT NULL
      AND rl.per_portion_qty > 0
    GROUP BY rl.ingredient_id
  ),
  branch_stock AS (
    SELECT
      sl.ingredient_id,
      SUM(sl.current_quantity) AS on_hand
    FROM public.stock_levels sl
    JOIN public.inventory_locations il ON il.id = sl.location_id
    WHERE sl.tenant_id = p_tenant_id
      AND sl.branch_id = p_branch_id
      AND il.location_kind = 'warehouse'
      AND il.is_active = TRUE
    GROUP BY sl.ingredient_id
  ),
  stock_pool AS (
    SELECT
      mi.id AS menu_item_id,
      -- Keep raw capacity semantics aligned with compute_menu_item_stock_capacity.
      CASE
        WHEN COUNT(rl.ingredient_id) = 0 THEN NULL::integer
        WHEN BOOL_OR(
          rl.line_missing_config
          OR rl.per_portion_qty IS NULL
          OR rl.per_portion_qty <= 0
        ) THEN NULL::integer
        ELSE FLOOR(MIN(
          COALESCE(bs.on_hand, 0) / NULLIF(rl.per_portion_qty, 0)
        ) + 0.000001)::integer
      END AS stock_capacity,
      CASE
        WHEN COUNT(rl.ingredient_id) = 0 THEN NULL::integer
        WHEN BOOL_OR(
          rl.line_missing_config
          OR rl.per_portion_qty IS NULL
          OR rl.per_portion_qty <= 0
        ) THEN NULL::integer
        ELSE FLOOR(MIN((
          COALESCE(bs.on_hand, 0)
          - COALESCE(pi.base_qty, 0)
          - COALESCE(hi.base_qty, 0)
        ) / NULLIF(rl.per_portion_qty, 0)) + 0.000001)::integer
      END AS stock_remaining,
      CASE
        WHEN COUNT(rl.ingredient_id) = 0 THEN 0
        WHEN BOOL_OR(
          rl.line_missing_config
          OR rl.per_portion_qty IS NULL
          OR rl.per_portion_qty <= 0
        ) THEN 0
        ELSE CEIL(MAX(COALESCE(pi.base_qty, 0) / NULLIF(rl.per_portion_qty, 0)))::integer
      END AS pending_unfinalized_demand,
      CASE
        WHEN COUNT(rl.ingredient_id) = 0 THEN 0
        WHEN BOOL_OR(
          rl.line_missing_config
          OR rl.per_portion_qty IS NULL
          OR rl.per_portion_qty <= 0
        ) THEN 0
        ELSE CEIL(MAX(COALESCE(hi.base_qty, 0) / NULLIF(rl.per_portion_qty, 0)))::integer
      END AS active_hold_demand
    FROM public.menu_items mi
    LEFT JOIN recipe_lines rl ON rl.menu_item_id = mi.id
    LEFT JOIN branch_stock bs ON bs.ingredient_id = rl.ingredient_id
    LEFT JOIN pending_ingredient pi ON pi.ingredient_id = rl.ingredient_id
    LEFT JOIN holds_ingredient hi ON hi.ingredient_id = rl.ingredient_id
    WHERE mi.tenant_id = p_tenant_id
      AND mi.is_active = true
    GROUP BY mi.id
  ),
  rows AS (
    SELECT
      mi.id AS menu_item_id,
      mi.name AS item_name,
      mc.id AS category_id,
      mc.name AS category_name,
      mc.sort_order AS category_sort_order,
      mi.sort_order AS item_sort_order,
      mi.base_price,
      bl.id AS limit_id,
      bl.limit_date,
      COALESCE(bl.is_disabled, false) AS is_disabled,
      COALESCE(bl.sold_today, 0) AS sold_today,
      sp.stock_capacity,
      bl.limit_quantity AS manual_limit_quantity,
      COALESCE(sp.pending_unfinalized_demand, 0) AS pending_unfinalized_demand,
      COALESCE(sp.active_hold_demand, 0) AS active_hold_demand,
      COALESCE(hi.quantity, 0) AS item_active_hold_demand,
      sp.stock_remaining
    FROM public.menu_items mi
    JOIN public.menu_categories mc ON mc.id = mi.category_id
    LEFT JOIN public.branch_menu_item_daily_limits bl
      ON bl.menu_item_id = mi.id
     AND bl.branch_id = p_branch_id
     AND bl.limit_date = p_limit_date
    LEFT JOIN stock_pool sp ON sp.menu_item_id = mi.id
    LEFT JOIN holds_item hi ON hi.menu_item_id = mi.id
    WHERE mi.tenant_id = p_tenant_id
      AND mi.is_active = true
  ),
  computed AS (
    SELECT
      r.*,
      CASE
        WHEN NOT p_stock_gate_enabled THEN NULL::integer
        WHEN r.stock_capacity IS NULL THEN NULL::integer
        ELSE r.stock_remaining
      END AS stock_remaining_effective,
      CASE
        WHEN r.manual_limit_quantity IS NULL THEN NULL::integer
        ELSE r.manual_limit_quantity - r.sold_today - r.item_active_hold_demand
      END AS manual_remaining
    FROM rows r
  )
  SELECT
    c.menu_item_id,
    c.item_name,
    c.category_id,
    c.category_name,
    c.base_price,
    c.limit_id,
    c.limit_date,
    c.is_disabled,
    c.sold_today,
    c.stock_capacity,
    c.manual_limit_quantity,
    c.pending_unfinalized_demand,
    c.active_hold_demand,
    CASE
      WHEN c.is_disabled THEN 0
      WHEN c.stock_remaining_effective IS NULL
        AND c.manual_remaining IS NULL THEN NULL
      WHEN c.stock_remaining_effective IS NULL
        THEN GREATEST(0, c.manual_remaining)
      WHEN c.manual_remaining IS NULL
        THEN GREATEST(0, c.stock_remaining_effective)
      ELSE GREATEST(
        0,
        LEAST(c.stock_remaining_effective, c.manual_remaining)
      )
    END AS available_to_sell
  FROM computed c
  ORDER BY
    c.category_sort_order,
    c.item_sort_order,
    c.item_name;
$$;

REVOKE ALL ON FUNCTION public.branch_menu_limit_availability(
  BIGINT,
  BIGINT,
  DATE,
  BOOLEAN,
  UUID[]
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.branch_menu_limit_availability(
  BIGINT,
  BIGINT,
  DATE,
  BOOLEAN,
  UUID[]
) TO service_role;

COMMIT;
