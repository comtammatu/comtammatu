DROP FUNCTION public.branch_menu_limit_availability(bigint, bigint, date, boolean, uuid[]);

CREATE FUNCTION public.branch_menu_limit_availability(p_tenant_id bigint, p_branch_id bigint, p_limit_date date, p_stock_gate_enabled boolean DEFAULT false, p_exclude_hold_tokens uuid[] DEFAULT NULL) RETURNS TABLE(menu_item_id bigint, item_name text, category_id bigint, category_name text, base_price numeric, limit_id bigint, limit_date date, is_disabled boolean, sold_today integer, stock_capacity integer, manual_limit_quantity integer, pending_unfinalized_demand integer, active_hold_demand integer, available_to_sell integer)
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
      AND (p_exclude_hold_tokens IS NULL OR h.hold_token <> ALL(p_exclude_hold_tokens))
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
      COALESCE(bl.is_disabled, false) AS is_disabled,
      COALESCE(bl.sold_today, 0) AS sold_today,
      sc.stock_capacity,
      bl.limit_quantity AS manual_limit_quantity,
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
        WHEN NOT p_stock_gate_enabled THEN NULL::integer
        WHEN r.stock_capacity IS NULL THEN NULL::integer
        ELSE r.stock_capacity - r.pending_unfinalized_demand - r.active_hold_demand
      END AS stock_remaining,
      CASE
        WHEN r.manual_limit_quantity IS NULL THEN NULL::integer
        ELSE r.manual_limit_quantity - r.sold_today - r.active_hold_demand
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
      WHEN c.stock_remaining IS NULL AND c.manual_remaining IS NULL THEN NULL
      WHEN c.stock_remaining IS NULL THEN GREATEST(0, c.manual_remaining)
      WHEN c.manual_remaining IS NULL THEN GREATEST(0, c.stock_remaining)
      ELSE GREATEST(0, LEAST(c.stock_remaining, c.manual_remaining))
    END AS available_to_sell
  FROM computed c
  ORDER BY c.category_sort_order, c.item_sort_order, c.item_name;
$_$;

REVOKE ALL ON FUNCTION public.branch_menu_limit_availability(p_tenant_id bigint, p_branch_id bigint, p_limit_date date, p_stock_gate_enabled boolean, p_exclude_hold_tokens uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.branch_menu_limit_availability(p_tenant_id bigint, p_branch_id bigint, p_limit_date date, p_stock_gate_enabled boolean, p_exclude_hold_tokens uuid[]) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.branch_menu_limit_availability(p_tenant_id bigint, p_branch_id bigint, p_limit_date date, p_stock_gate_enabled boolean, p_exclude_hold_tokens uuid[]) TO service_role;

COMMENT ON FUNCTION public.branch_menu_limit_availability(p_tenant_id bigint, p_branch_id bigint, p_limit_date date, p_stock_gate_enabled boolean, p_exclude_hold_tokens uuid[]) IS 'stock_remaining is NULL (unlimited) both when the gate is off AND when stock_capacity is NULL (no recipe / broken unit config) — D064 §2 fail-open NULL doctrine, never 0. p_exclude_hold_tokens drops the caller''s own active holds from active_hold_demand so a refetch does not double-count a terminal''s own reservation. Slimmed shape: accepted_today (dup of sold_today), stock_capacity_live (dup of stock_capacity), and the COALESCE-blended limit_quantity were dropped — D064 §7/PR-3.';

DROP FUNCTION public.get_branch_menu_daily_limits_for_pos(bigint, uuid[]);

CREATE FUNCTION public.get_branch_menu_daily_limits_for_pos(p_branch_id bigint, p_exclude_hold_tokens uuid[] DEFAULT NULL) RETURNS TABLE(menu_item_id bigint, is_disabled boolean, sold_today integer, stock_capacity integer, manual_limit_quantity integer, pending_unfinalized_demand integer, active_hold_demand integer, available_to_sell integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  WITH ctx AS (
    SELECT public.auth_tenant_id() AS tenant_id,
           public.auth_role() AS role,
           public.auth_branch_id() AS branch_id,
           (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS limit_date,
           (
             public.is_feature_enabled(p_branch_id, 'pos_stock_availability_gate')
             AND public.is_feature_enabled(p_branch_id, 'pos_stock_outcome_posting')
           ) AS gate_eff
  )
  SELECT
    a.menu_item_id,
    a.is_disabled,
    a.sold_today,
    a.stock_capacity,
    a.manual_limit_quantity,
    a.pending_unfinalized_demand,
    a.active_hold_demand,
    a.available_to_sell
  FROM ctx
  JOIN LATERAL public.branch_menu_limit_availability(
    ctx.tenant_id,
    p_branch_id,
    ctx.limit_date,
    ctx.gate_eff,
    p_exclude_hold_tokens
  ) a ON TRUE
  WHERE ctx.tenant_id IS NOT NULL
    AND (
      ctx.role = 'owner'
      OR ctx.branch_id = p_branch_id
    )
    AND (
      a.limit_id IS NOT NULL
      OR ctx.gate_eff
    );
$$;

REVOKE ALL ON FUNCTION public.get_branch_menu_daily_limits_for_pos(p_branch_id bigint, p_exclude_hold_tokens uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_branch_menu_daily_limits_for_pos(p_branch_id bigint, p_exclude_hold_tokens uuid[]) TO service_role;
GRANT ALL ON FUNCTION public.get_branch_menu_daily_limits_for_pos(p_branch_id bigint, p_exclude_hold_tokens uuid[]) TO authenticated;

COMMENT ON FUNCTION public.get_branch_menu_daily_limits_for_pos(p_branch_id bigint, p_exclude_hold_tokens uuid[]) IS 'Row filter and availability gate both key on gate_eff = pos_stock_availability_gate AND pos_stock_outcome_posting (D064 §1 — the gate is only effective while deduction posting is on). p_exclude_hold_tokens passes the caller''s live hold token(s) through so its own reservation is not double-counted on refetch. Slimmed shape — see branch_menu_limit_availability comment.';

DROP FUNCTION public.list_branch_menu_daily_limits(bigint, date);

CREATE FUNCTION public.list_branch_menu_daily_limits(p_branch_id bigint, p_limit_date date DEFAULT NULL::date) RETURNS TABLE(menu_item_id bigint, item_name text, category_id bigint, category_name text, base_price numeric, limit_id bigint, limit_date date, is_disabled boolean, sold_today integer, stock_capacity integer, manual_limit_quantity integer, pending_unfinalized_demand integer, active_hold_demand integer, available_to_sell integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant_id BIGINT := public.auth_tenant_id();
  v_role      TEXT   := public.auth_role();
  v_branch    BIGINT := public.auth_branch_id();
  v_date      DATE   := COALESCE(
    p_limit_date,
    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  );
  v_gate_eff  BOOLEAN;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF v_role NOT IN ('owner', 'branch_manager') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_role = 'branch_manager'
     AND (v_branch IS NULL OR v_branch <> p_branch_id) THEN
    RAISE EXCEPTION 'branch scope mismatch' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.branches b
   WHERE b.id = p_branch_id AND b.tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch not found' USING ERRCODE = 'P0002';
  END IF;

  v_gate_eff := public.is_feature_enabled(p_branch_id, 'pos_stock_availability_gate')
    AND public.is_feature_enabled(p_branch_id, 'pos_stock_outcome_posting');

  RETURN QUERY
  SELECT
    a.menu_item_id,
    a.item_name,
    a.category_id,
    a.category_name,
    a.base_price,
    a.limit_id,
    a.limit_date,
    a.is_disabled,
    a.sold_today,
    a.stock_capacity,
    a.manual_limit_quantity,
    a.pending_unfinalized_demand,
    a.active_hold_demand,
    a.available_to_sell
  FROM public.branch_menu_limit_availability(
    v_tenant_id,
    p_branch_id,
    v_date,
    v_gate_eff
  ) a
  ORDER BY a.category_name, a.item_name;
END;
$$;

REVOKE ALL ON FUNCTION public.list_branch_menu_daily_limits(p_branch_id bigint, p_limit_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_branch_menu_daily_limits(p_branch_id bigint, p_limit_date date) TO service_role;
GRANT ALL ON FUNCTION public.list_branch_menu_daily_limits(p_branch_id bigint, p_limit_date date) TO authenticated;

COMMENT ON FUNCTION public.list_branch_menu_daily_limits(p_branch_id bigint, p_limit_date date) IS 'Manager Giới hạn bán page. gate_eff = pos_stock_availability_gate AND pos_stock_outcome_posting (D064 §1), same source as get_branch_menu_daily_limits_for_pos. Slimmed shape — see branch_menu_limit_availability comment.';

DROP TRIGGER trg_refresh_menu_stock_capacity_on_recipe ON public.recipes;

DROP TRIGGER trg_refresh_menu_stock_capacity_on_stock ON public.stock_levels;

DROP FUNCTION public.trg_refresh_menu_stock_capacity_on_recipe();

DROP FUNCTION public.trg_refresh_menu_stock_capacity_on_stock();

DROP FUNCTION public.refresh_branch_menu_stock_capacity(bigint, bigint, bigint, bigint);

COMMENT ON COLUMN public.branch_menu_item_daily_limits.stock_capacity IS 'Dead snapshot — refresh triggers removed in PR-3 (D064 §7); live capacity now comes from compute_menu_item_stock_capacity inside branch_menu_limit_availability. Column kept only for additive-only compliance.';
