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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid;
  v_tenant bigint;
  v_has_tenant_scope boolean;
  v_branch_ids bigint[];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id
  INTO v_tenant
  FROM public.profiles pr
  WHERE pr.id = v_uid;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  SELECT fs.has_tenant_scope, fs.branch_ids
  INTO v_has_tenant_scope, v_branch_ids
  FROM private.finance_scope(v_uid, 'finance:view') fs;

  IF p_branch_id IS NULL THEN
    IF NOT (v_has_tenant_scope OR cardinality(v_branch_ids) > 0) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NOT (v_has_tenant_scope OR p_branch_id = ANY(v_branch_ids)) THEN
    RAISE EXCEPTION 'permission denied: finance:view required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH paid_orders AS MATERIALIZED (
    SELECT DISTINCT ON (p.tenant_id, p.branch_id, p.order_id)
      o.id,
      o.branch_id,
      o.tenant_id,
      o.subtotal,
      o.discount_amount
    FROM public.payments p
    JOIN public.orders o
      ON o.id = p.order_id
     AND o.tenant_id = p.tenant_id
     AND o.branch_id = p.branch_id
    WHERE p.tenant_id = v_tenant
      AND p.status = 'completed'
      AND p.paid_at >= COALESCE(p_from, '-infinity'::timestamptz)
      AND p.paid_at < COALESCE(p_to, 'infinity'::timestamptz)
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
      AND (p_order_statuses IS NULL OR o.status = ANY(p_order_statuses))
      AND (
        (p_branch_id IS NOT NULL AND o.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (v_has_tenant_scope OR o.branch_id = ANY(v_branch_ids))
        )
      )
    ORDER BY p.tenant_id, p.branch_id, p.order_id, p.paid_at, p.id
  ),
  paid_items AS MATERIALIZED (
    SELECT
      po.id AS order_id,
      po.branch_id,
      po.tenant_id,
      po.subtotal,
      po.discount_amount,
      oi.id AS order_item_id,
      oi.menu_item_id,
      oi.item_name,
      oi.quantity::numeric AS parent_quantity,
      COALESCE(oi.subtotal, 0)::numeric AS line_revenue,
      CASE
        WHEN jsonb_typeof(oi.sides) = 'array' THEN oi.sides
        ELSE '[]'::jsonb
      END AS sides
    FROM paid_orders po
    JOIN public.order_items oi
      ON oi.order_id = po.id
     AND oi.tenant_id = po.tenant_id
    WHERE oi.status <> 'cancelled'
  ),
  side_lines AS (
    SELECT
      pi.order_id,
      pi.branch_id,
      pi.tenant_id,
      pi.subtotal,
      pi.discount_amount,
      pi.order_item_id,
      (side_el ->> 'side_item_id')::bigint AS menu_item_id,
      COALESCE(NULLIF(side_el ->> 'name', ''), 'Món ăn kèm')::text AS item_name,
      pi.parent_quantity,
      CASE
        WHEN COALESCE(side_el ->> 'quantity', '') ~ '^[0-9]+(\.[0-9]+)?$'
          THEN GREATEST((side_el ->> 'quantity')::numeric, 0)
        ELSE 1
      END AS quantity_per_parent,
      CASE
        WHEN COALESCE(side_el ->> 'price', '') ~ '^[0-9]+(\.[0-9]+)?$'
          THEN GREATEST((side_el ->> 'price')::numeric, 0)
        ELSE 0
      END AS unit_price
    FROM paid_items pi
    CROSS JOIN LATERAL jsonb_array_elements(pi.sides) AS side_el
    WHERE side_el ? 'side_item_id'
      AND (side_el ->> 'side_item_id') ~ '^[0-9]+$'
  ),
  side_totals_by_line AS (
    SELECT
      sl.order_item_id,
      COALESCE(
        SUM(sl.parent_quantity * sl.quantity_per_parent * sl.unit_price),
        0
      )::numeric AS side_revenue
    FROM side_lines sl
    GROUP BY sl.order_item_id
  ),
  component_rows AS (
    SELECT
      pi.order_id,
      pi.branch_id,
      pi.menu_item_id,
      pi.item_name,
      pi.parent_quantity AS quantity_sold,
      GREATEST(pi.line_revenue - COALESCE(st.side_revenue, 0), 0) AS revenue_before_discount,
      pi.subtotal,
      pi.discount_amount
    FROM paid_items pi
    LEFT JOIN side_totals_by_line st
      ON st.order_item_id = pi.order_item_id

    UNION ALL

    SELECT
      sl.order_id,
      sl.branch_id,
      sl.menu_item_id,
      sl.item_name,
      sl.parent_quantity * sl.quantity_per_parent AS quantity_sold,
      sl.parent_quantity * sl.quantity_per_parent * sl.unit_price AS revenue_before_discount,
      sl.subtotal,
      sl.discount_amount
    FROM side_lines sl
  ),
  item_rows AS (
    SELECT
      cr.*,
      SUM(cr.revenue_before_discount) OVER (PARTITION BY cr.order_id) AS order_item_subtotal
    FROM component_rows cr
  )
  SELECT
    ir.branch_id,
    ir.menu_item_id,
    (array_agg(ir.item_name ORDER BY ir.item_name))[1] AS item_name,
    SUM(ir.quantity_sold)::numeric AS quantity_sold,
    COALESCE(SUM(
      CASE
        WHEN ir.order_item_subtotal > 0 THEN
          ir.revenue_before_discount * (ir.subtotal - ir.discount_amount) / ir.order_item_subtotal
        ELSE 0
      END
    ), 0)::numeric AS revenue
  FROM item_rows ir
  GROUP BY ir.branch_id, ir.menu_item_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_menu_item_sales_agg(bigint, timestamptz, timestamptz, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_menu_item_sales_agg(bigint, timestamptz, timestamptz, text[]) TO authenticated, service_role;
