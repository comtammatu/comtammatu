-- Finance Revenue top items must decompose paid side-items into their own menu
-- item rows. Example: "Com tam Suon Cot Let + Cha" reports Suon Cot Let x1
-- and Cha x1, with side revenue separated from the main line instead of being
-- counted twice.

CREATE OR REPLACE FUNCTION public.get_top_items(
  p_branch_id BIGINT,
  p_start_date DATE,
  p_end_date DATE,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  period_start DATE,
  period_end DATE,
  branch_id BIGINT,
  tenant_id BIGINT,
  menu_item_id BIGINT,
  item_name TEXT,
  quantity_sold NUMERIC,
  revenue NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_tenant BIGINT;
  v_effective_limit INT;
  v_start_utc TIMESTAMPTZ;
  v_end_utc TIMESTAMPTZ;
  v_has_tenant_scope BOOLEAN;
  v_branch_ids BIGINT[];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant
  FROM public.profiles pr
  WHERE pr.id = v_uid;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'start/end required' USING ERRCODE = '22023';
  END IF;

  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'start > end' USING ERRCODE = '22023';
  END IF;

  SELECT fs.has_tenant_scope, fs.branch_ids
    INTO v_has_tenant_scope, v_branch_ids
  FROM private.finance_scope(v_uid, 'finance:view') fs;

  IF p_branch_id IS NULL THEN
    IF NOT (v_has_tenant_scope OR COALESCE(cardinality(v_branch_ids), 0) > 0) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT (v_has_tenant_scope OR p_branch_id = ANY(v_branch_ids)) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_effective_limit := GREATEST(1, LEAST(COALESCE(p_limit, 20), 200));
  v_start_utc := (p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_end_utc := ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  RETURN QUERY
  WITH paid_orders AS MATERIALIZED (
    SELECT DISTINCT
      o.id,
      o.branch_id,
      o.tenant_id
    FROM public.payments p
    JOIN public.orders o
      ON o.id = p.order_id
     AND o.tenant_id = p.tenant_id
     AND o.branch_id = p.branch_id
    WHERE p.tenant_id = v_tenant
      AND p.status = 'completed'
      AND p.paid_at >= v_start_utc
      AND p.paid_at < v_end_utc
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
      AND (
        (p_branch_id IS NOT NULL AND o.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (v_has_tenant_scope OR o.branch_id = ANY(v_branch_ids))
        )
      )
  ),
  paid_items AS MATERIALIZED (
    SELECT
      oi.id AS order_item_id,
      po.branch_id,
      po.tenant_id,
      oi.menu_item_id,
      oi.item_name,
      oi.quantity::NUMERIC AS parent_quantity,
      COALESCE(oi.subtotal, 0)::NUMERIC AS line_revenue,
      CASE
        WHEN jsonb_typeof(oi.sides) = 'array' THEN oi.sides
        ELSE '[]'::JSONB
      END AS sides
    FROM paid_orders po
    JOIN public.order_items oi
      ON oi.tenant_id = po.tenant_id
     AND oi.order_id = po.id
     AND oi.status <> 'cancelled'
  ),
  side_lines AS (
    SELECT
      pi.order_item_id,
      pi.branch_id,
      pi.tenant_id,
      (side_el ->> 'side_item_id')::BIGINT AS menu_item_id,
      COALESCE(NULLIF(side_el ->> 'name', ''), 'Mon an kem')::TEXT AS item_name,
      pi.parent_quantity,
      CASE
        WHEN COALESCE(side_el ->> 'quantity', '') ~ '^[0-9]+(\.[0-9]+)?$'
          THEN GREATEST((side_el ->> 'quantity')::NUMERIC, 0)
        ELSE 1
      END AS quantity_per_parent,
      CASE
        WHEN COALESCE(side_el ->> 'price', '') ~ '^[0-9]+(\.[0-9]+)?$'
          THEN GREATEST((side_el ->> 'price')::NUMERIC, 0)
        ELSE 0
      END AS unit_price
    FROM paid_items pi
    CROSS JOIN LATERAL jsonb_array_elements(pi.sides) AS side_el
    WHERE side_el ? 'side_item_id'
      AND (side_el ->> 'side_item_id') ~ '^[0-9]+$'
  ),
  side_totals_by_line AS (
    SELECT
      order_item_id,
      COALESCE(SUM(quantity_per_parent * unit_price * parent_quantity), 0)::NUMERIC AS side_revenue
    FROM side_lines
    GROUP BY order_item_id
  ),
  main_components AS (
    SELECT
      pi.branch_id,
      pi.tenant_id,
      pi.menu_item_id,
      pi.item_name,
      COALESCE(SUM(pi.parent_quantity), 0)::NUMERIC AS quantity_sold,
      COALESCE(
        SUM(GREATEST(pi.line_revenue - COALESCE(st.side_revenue, 0), 0)),
        0
      )::NUMERIC AS revenue
    FROM paid_items pi
    LEFT JOIN side_totals_by_line st
      ON st.order_item_id = pi.order_item_id
    GROUP BY pi.branch_id, pi.tenant_id, pi.menu_item_id, pi.item_name
  ),
  side_components AS (
    SELECT
      branch_id,
      tenant_id,
      menu_item_id,
      MAX(item_name) AS item_name,
      COALESCE(SUM(parent_quantity * quantity_per_parent), 0)::NUMERIC AS quantity_sold,
      COALESCE(SUM(parent_quantity * quantity_per_parent * unit_price), 0)::NUMERIC AS revenue
    FROM side_lines
    GROUP BY branch_id, tenant_id, menu_item_id
  ),
  component_rows AS (
    SELECT branch_id, tenant_id, menu_item_id, item_name, quantity_sold, revenue
    FROM main_components
    UNION ALL
    SELECT branch_id, tenant_id, menu_item_id, item_name, quantity_sold, revenue
    FROM side_components
  ),
  component_agg AS (
    SELECT
      cr.branch_id,
      cr.tenant_id,
      cr.menu_item_id,
      MAX(cr.item_name) AS item_name,
      COALESCE(SUM(cr.quantity_sold), 0)::NUMERIC AS quantity_sold,
      COALESCE(SUM(cr.revenue), 0)::NUMERIC AS revenue
    FROM component_rows cr
    GROUP BY cr.branch_id, cr.tenant_id, cr.menu_item_id
  )
  SELECT
    p_start_date AS period_start,
    p_end_date AS period_end,
    ca.branch_id,
    ca.tenant_id,
    ca.menu_item_id,
    ca.item_name,
    ca.quantity_sold,
    ca.revenue
  FROM component_agg ca
  ORDER BY ca.quantity_sold DESC, ca.revenue DESC, ca.item_name ASC
  LIMIT v_effective_limit;
END;
$$;

COMMENT ON FUNCTION public.get_top_items(BIGINT, DATE, DATE, INT) IS
  'Live paid-at top items for an explicit Vietnam-local date range. Decomposes order_items.sides into separate menu-item rows and subtracts side revenue from the main line.';
