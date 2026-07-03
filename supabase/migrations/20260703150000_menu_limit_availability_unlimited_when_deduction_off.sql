CREATE OR REPLACE FUNCTION public.branch_menu_limit_availability(p_tenant_id bigint, p_branch_id bigint, p_limit_date date, p_stock_outcome_enabled boolean DEFAULT false) RETURNS TABLE(menu_item_id bigint, item_name text, category_id bigint, category_name text, base_price numeric, limit_id bigint, limit_date date, limit_quantity integer, is_disabled boolean, sold_today integer, stock_capacity integer, stock_capacity_live integer, manual_limit_quantity integer, accepted_today integer, pending_unfinalized_demand integer, active_hold_demand integer, available_to_sell integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
  pending AS (
    SELECT d.menu_item_id,
           SUM(d.quantity)::integer AS quantity
    FROM order_line_demand d
    GROUP BY d.menu_item_id
  ),
  holds AS (
    SELECT h.menu_item_id,
           SUM(h.quantity)::integer AS quantity
    FROM public.branch_menu_item_daily_holds h
    WHERE h.tenant_id = p_tenant_id
      AND h.branch_id = p_branch_id
      AND h.limit_date = p_limit_date
      AND h.committed_at IS NULL
      AND h.released_at IS NULL
      AND h.expires_at > now()
    GROUP BY h.menu_item_id
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
      COALESCE(bl.limit_quantity, sc.stock_capacity) AS limit_quantity,
      COALESCE(bl.is_disabled, false) AS is_disabled,
      COALESCE(bl.sold_today, 0) AS sold_today,
      sc.stock_capacity,
      sc.stock_capacity AS stock_capacity_live,
      bl.limit_quantity AS manual_limit_quantity,
      COALESCE(bl.sold_today, 0) AS accepted_today,
      COALESCE(p.quantity, 0) AS pending_unfinalized_demand,
      COALESCE(h.quantity, 0) AS active_hold_demand
    FROM public.menu_items mi
    JOIN public.menu_categories mc ON mc.id = mi.category_id
    LEFT JOIN public.branch_menu_item_daily_limits bl
      ON bl.menu_item_id = mi.id
     AND bl.branch_id = p_branch_id
     AND bl.limit_date = p_limit_date
    LEFT JOIN LATERAL (
      SELECT public.compute_menu_item_stock_capacity(
        p_tenant_id,
        p_branch_id,
        mi.id
      ) AS stock_capacity
    ) sc ON TRUE
    LEFT JOIN pending p ON p.menu_item_id = mi.id
    LEFT JOIN holds h ON h.menu_item_id = mi.id
    WHERE mi.tenant_id = p_tenant_id
      AND mi.is_active = true
  ),
  computed AS (
    SELECT
      r.*,
      CASE
        WHEN NOT p_stock_outcome_enabled THEN NULL::integer
        WHEN r.stock_capacity_live IS NULL THEN 0
        ELSE r.stock_capacity_live - r.pending_unfinalized_demand - r.active_hold_demand
      END AS stock_remaining,
      CASE
        WHEN r.manual_limit_quantity IS NULL THEN NULL::integer
        ELSE r.manual_limit_quantity - r.accepted_today - r.active_hold_demand
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
    c.limit_quantity,
    c.is_disabled,
    c.sold_today,
    c.stock_capacity,
    c.stock_capacity_live,
    c.manual_limit_quantity,
    c.accepted_today,
    c.pending_unfinalized_demand,
    c.active_hold_demand,
    CASE
      WHEN c.is_disabled THEN 0
      WHEN c.stock_remaining IS NULL AND c.manual_remaining IS NULL THEN NULL
      WHEN c.stock_remaining IS NULL THEN GREATEST(0, c.manual_remaining)
      WHEN c.manual_remaining IS NULL THEN GREATEST(0, c.stock_remaining)
      ELSE GREATEST(0, LEAST(c.stock_remaining, c.manual_remaining))
    END AS available_to_sell
  FROM computed c
  ORDER BY c.category_sort_order, c.item_sort_order, c.item_name;
$_$;

REVOKE ALL ON FUNCTION public.branch_menu_limit_availability(p_tenant_id bigint, p_branch_id bigint, p_limit_date date, p_stock_outcome_enabled boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.branch_menu_limit_availability(p_tenant_id bigint, p_branch_id bigint, p_limit_date date, p_stock_outcome_enabled boolean) TO service_role;
