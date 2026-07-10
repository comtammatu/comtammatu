SET search_path = '';

-- Both functions are SECURITY DEFINER so the per-row has_permission(branch_id, ...)
-- in orders_select / order_items_select is not evaluated once per scanned row.
-- They reproduce that policy's access rule exactly by intersecting with the set of
-- branches the caller may read, computed once against the (tiny) branches table.

CREATE OR REPLACE FUNCTION public.get_orders_summary(
  p_status text DEFAULT NULL,
  p_branch_id bigint DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
) RETURNS TABLE (
  total_count bigint,
  in_progress_count bigint,
  paid_count bigint,
  paid_revenue numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH allowed AS (
    SELECT b.id
    FROM public.branches b
    WHERE b.tenant_id = public.auth_tenant_id()
      AND (
        public.has_permission(b.id, 'orders:read')
        OR public.has_permission(b.id, 'kds:use')
      )
  )
  SELECT
    count(*)::bigint,
    count(*) FILTER (
      WHERE o.status NOT IN ('completed', 'cancelled')
    )::bigint,
    count(*) FILTER (
      WHERE o.payment_status = 'paid' AND o.status <> 'cancelled'
    )::bigint,
    COALESCE(
      sum(o.total_amount) FILTER (
        WHERE o.payment_status = 'paid' AND o.status <> 'cancelled'
      ),
      0
    )::numeric(15, 2)
  FROM public.orders o
  WHERE o.tenant_id = public.auth_tenant_id()
    AND o.branch_id IN (SELECT id FROM allowed)
    AND (p_status IS NULL OR o.status = p_status)
    AND (p_branch_id IS NULL OR o.branch_id = p_branch_id)
    AND (p_from IS NULL OR o.created_at >= p_from)
    AND (p_to IS NULL OR o.created_at < p_to);
$function$;

-- Collapses order_items to one row per (branch, menu item). Callers that need
-- recipe-aware costing keep doing that in TypeScript against the small recipes
-- table; only the unbounded raw-row fetch moves into SQL.
-- p_order_statuses NULL means "every order except cancelled".
CREATE OR REPLACE FUNCTION public.get_menu_item_sales_agg(
  p_branch_id bigint DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_order_statuses text[] DEFAULT NULL
) RETURNS TABLE (
  branch_id bigint,
  menu_item_id bigint,
  item_name text,
  quantity_sold numeric,
  revenue numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH allowed AS (
    SELECT b.id
    FROM public.branches b
    WHERE b.tenant_id = public.auth_tenant_id()
      AND (
        public.has_permission(b.id, 'orders:read')
        OR public.has_permission(b.id, 'kds:use')
      )
  )
  SELECT
    o.branch_id,
    oi.menu_item_id,
    (array_agg(oi.item_name ORDER BY oi.id))[1],
    sum(oi.quantity)::numeric,
    sum(oi.subtotal)::numeric
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.tenant_id = public.auth_tenant_id()
    AND o.branch_id IN (SELECT id FROM allowed)
    AND oi.status <> 'cancelled'
    AND o.status <> 'cancelled'
    AND (p_order_statuses IS NULL OR o.status = ANY (p_order_statuses))
    AND (p_branch_id IS NULL OR o.branch_id = p_branch_id)
    AND (p_from IS NULL OR o.created_at >= p_from)
    AND (p_to IS NULL OR o.created_at < p_to)
  GROUP BY o.branch_id, oi.menu_item_id;
$function$;

-- Theoretical ingredient consumption for the inventory variance report:
-- SUM(order_items.quantity * recipes.quantity / yield_factor) grouped by
-- ingredient. Replaces a client loop that fetched order ids (truncated at the
-- PostgREST 1000-row cap -> silently wrong variance past ~2 weeks) then paged
-- order_items in chunks. yield_factor <= 0 or NULL is treated as 1, matching the
-- prior TS guard. Consumption model (no entry-unit base conversion) is unchanged.
CREATE OR REPLACE FUNCTION public.get_theoretical_consumption(
  p_branch_id bigint DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_order_statuses text[] DEFAULT NULL
) RETURNS TABLE (
  ingredient_id bigint,
  theoretical_qty numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH allowed AS (
    SELECT b.id
    FROM public.branches b
    WHERE b.tenant_id = public.auth_tenant_id()
      AND (
        public.has_permission(b.id, 'orders:read')
        OR public.has_permission(b.id, 'kds:use')
      )
  )
  SELECT
    r.ingredient_id,
    sum(oi.quantity * r.quantity / CASE WHEN COALESCE(r.yield_factor, 1) > 0 THEN r.yield_factor ELSE 1 END)::numeric
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  JOIN public.recipes r ON r.menu_item_id = oi.menu_item_id AND r.tenant_id = oi.tenant_id
  WHERE oi.tenant_id = public.auth_tenant_id()
    AND o.branch_id IN (SELECT id FROM allowed)
    AND oi.status <> 'cancelled'
    AND (p_order_statuses IS NULL OR o.status = ANY (p_order_statuses))
    AND (p_branch_id IS NULL OR o.branch_id = p_branch_id)
    AND (p_from IS NULL OR o.created_at >= p_from)
    AND (p_to IS NULL OR o.created_at < p_to)
  GROUP BY r.ingredient_id;
$function$;

REVOKE ALL ON FUNCTION public.get_orders_summary(text, bigint, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_menu_item_sales_agg(bigint, timestamptz, timestamptz, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_theoretical_consumption(bigint, timestamptz, timestamptz, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_orders_summary(text, bigint, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_menu_item_sales_agg(bigint, timestamptz, timestamptz, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_theoretical_consumption(bigint, timestamptz, timestamptz, text[]) TO authenticated, service_role;

-- get_orders_paid_summary is superseded by get_orders_summary but is NOT dropped
-- here: the currently-deployed app still calls it. Dropping it lives in
-- 20260710093000, to be applied only after this app version reaches production.
