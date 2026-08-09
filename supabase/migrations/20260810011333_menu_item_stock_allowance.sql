-- ADR 0026 / INV-1 PR 2B: per-menu-item daily stock_allowance_quantity
-- (add N portions on top of stock-derived remaining). Extends availability,
-- the pre-order stock gate, and manager RPCs. Does not touch the warehouse
-- ledger.

ALTER TABLE public.branch_menu_item_daily_limits
  ADD COLUMN IF NOT EXISTS stock_allowance_quantity integer;

ALTER TABLE public.branch_menu_item_daily_limits
  DROP CONSTRAINT IF EXISTS branch_menu_item_daily_limits_stock_allowance_quantity_check;

ALTER TABLE public.branch_menu_item_daily_limits
  ADD CONSTRAINT branch_menu_item_daily_limits_stock_allowance_quantity_check
  CHECK (
    (stock_allowance_quantity IS NULL)
    OR (stock_allowance_quantity >= 0)
  );

COMMENT ON COLUMN public.branch_menu_item_daily_limits.stock_allowance_quantity IS
  'ADR 0026: supplemental sellable portions added on top of stock-derived remaining for this (branch, menu item, day). NULL = no allowance. Never books warehouse movements.';

DROP FUNCTION IF EXISTS public.list_branch_menu_daily_limits(bigint, date);
DROP FUNCTION IF EXISTS public.get_branch_menu_daily_limits_for_pos(bigint, uuid[]);
DROP FUNCTION IF EXISTS public.branch_menu_limit_availability(bigint, bigint, date, boolean, uuid[]);



CREATE FUNCTION public.branch_menu_limit_availability(p_tenant_id bigint, p_branch_id bigint, p_limit_date date, p_stock_gate_enabled boolean DEFAULT false, p_exclude_hold_tokens uuid[] DEFAULT NULL::uuid[]) RETURNS TABLE(menu_item_id bigint, item_name text, category_id bigint, category_name text, base_price numeric, limit_id bigint, limit_date date, is_disabled boolean, sold_today integer, stock_capacity integer, manual_limit_quantity integer, stock_allowance_quantity integer, pending_unfinalized_demand integer, active_hold_demand integer, available_to_sell integer)
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
      bl.stock_allowance_quantity,
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
        ELSE r.stock_remaining + COALESCE(r.stock_allowance_quantity, 0)
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
    c.stock_allowance_quantity,
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
$_$;

CREATE FUNCTION public.list_branch_menu_daily_limits(p_branch_id bigint, p_limit_date date DEFAULT NULL::date) RETURNS TABLE(menu_item_id bigint, item_name text, category_id bigint, category_name text, base_price numeric, limit_id bigint, limit_date date, is_disabled boolean, sold_today integer, stock_capacity integer, manual_limit_quantity integer, stock_allowance_quantity integer, pending_unfinalized_demand integer, active_hold_demand integer, available_to_sell integer)
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

  v_gate_eff := public.is_feature_enabled(p_branch_id, 'pos_stock_outcome_posting');

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
    a.stock_allowance_quantity,
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

CREATE FUNCTION public.get_branch_menu_daily_limits_for_pos(p_branch_id bigint, p_exclude_hold_tokens uuid[] DEFAULT NULL::uuid[]) RETURNS TABLE(menu_item_id bigint, is_disabled boolean, sold_today integer, stock_capacity integer, manual_limit_quantity integer, stock_allowance_quantity integer, pending_unfinalized_demand integer, active_hold_demand integer, available_to_sell integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  WITH ctx AS (
    SELECT public.auth_tenant_id() AS tenant_id,
           public.auth_role() AS role,
           public.auth_branch_id() AS branch_id,
           (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS limit_date,
           public.is_feature_enabled(p_branch_id, 'pos_stock_outcome_posting') AS gate_eff
  )
  SELECT
    a.menu_item_id,
    a.is_disabled,
    a.sold_today,
    a.stock_capacity,
    a.manual_limit_quantity,
    a.stock_allowance_quantity,
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

CREATE OR REPLACE FUNCTION public.enforce_branch_stock_availability() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  v_tenant_id   bigint;
  v_branch_id   bigint;
  v_order_date  date;
  v_location_id bigint;
  v_need        record;
  v_on_hand     numeric(15,3);
  v_pending     numeric(15,3);
  v_allowance   numeric(15,3);
BEGIN
  IF COALESCE(current_setting('comtammatu.skip_quota_enforcement', true), 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT o.tenant_id,
         o.branch_id,
         (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  INTO v_tenant_id, v_branch_id, v_order_date
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  IF v_branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_feature_enabled(v_branch_id, 'pos_stock_outcome_posting') THEN
    RETURN NEW;
  END IF;

  -- Same location resolution as post_pos_sale_consumption_if_ready so the
  -- gate measures exactly the pool posting deducts from. NULL (no active
  -- kitchen location) leaves on_hand at 0 below — consistent with
  -- capacity/availability display already showing 0 in that case.
  SELECT il.id
  INTO v_location_id
  FROM public.inventory_locations il
  WHERE il.branch_id = v_branch_id
    AND il.tenant_id = v_tenant_id
    AND il.location_kind = 'warehouse'
    AND il.is_active = TRUE
  ORDER BY il.is_default_consumption DESC, il.sort_order NULLS LAST, il.id
  LIMIT 1;

  -- Demand of this inserted row only (main + sides), converted to base units.
  -- Recipe-less items contribute nothing — outside stock control (D064 §2/D065 §4).
  -- Items with a recipe line whose entry_unit_id has no active ingredient_units
  -- row are ALSO outside stock control (mirrors compute_menu_item_stock_capacity's
  -- line_missing_config: capacity is NULL for them, never a hard 0) — excluded
  -- via NOT EXISTS so inv_to_base_for_tenant never hits recipe_unit_conversion_missing.
  FOR v_need IN
    WITH row_demand AS (
      SELECT NEW.menu_item_id::bigint AS menu_item_id,
             NEW.quantity::integer    AS quantity
      UNION ALL
      SELECT (s.elem ->> 'side_item_id')::bigint,
             (NEW.quantity * COALESCE(NULLIF(s.elem ->> 'quantity', '')::integer, 1))::integer
      FROM jsonb_array_elements(COALESCE(NEW.sides, '[]'::jsonb)) AS s(elem)
      WHERE s.elem ? 'side_item_id'
        AND (s.elem ->> 'side_item_id') ~ '^[0-9]+$'
    )
    SELECT
      r.ingredient_id,
      ROUND(SUM(public.inv_to_base_for_tenant(
        v_tenant_id,
        r.ingredient_id,
        r.entry_unit_id,
        d.quantity * r.quantity / r.yield_factor
      )), 3)::numeric(15,3) AS need_qty
    FROM row_demand d
    JOIN public.recipes r
      ON r.menu_item_id = d.menu_item_id
     AND r.tenant_id = v_tenant_id
    WHERE d.menu_item_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.recipes r2
        WHERE r2.menu_item_id = d.menu_item_id
          AND r2.tenant_id = v_tenant_id
          AND r2.entry_unit_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM public.ingredient_units iu
            WHERE iu.tenant_id = v_tenant_id
              AND iu.ingredient_id = r2.ingredient_id
              AND iu.unit_id = r2.entry_unit_id
              AND iu.is_active = TRUE
          )
      )
    GROUP BY r.ingredient_id
    HAVING ROUND(SUM(public.inv_to_base_for_tenant(
      v_tenant_id,
      r.ingredient_id,
      r.entry_unit_id,
      d.quantity * r.quantity / r.yield_factor
    )), 3) > 0
    ORDER BY r.ingredient_id
  LOOP
    -- Serialize concurrent carts sharing an ingredient — lock only the
    -- stock_levels row(s) at the resolved issue location, not the location
    -- catalog itself.
    PERFORM 1
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant_id
      AND sl.branch_id = v_branch_id
      AND sl.ingredient_id = v_need.ingredient_id
      AND sl.location_id = v_location_id
    FOR UPDATE OF sl;

    SELECT COALESCE(SUM(sl.current_quantity), 0)
    INTO v_on_hand
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant_id
      AND sl.branch_id = v_branch_id
      AND sl.ingredient_id = v_need.ingredient_id
      AND sl.location_id = v_location_id;

    -- Pending demand = today's not-yet-completed/cancelled order lines
    -- (main + sides), including the row just inserted, same explosion,
    -- business-date keying, and missing-config exclusion as above.
    SELECT COALESCE(ROUND(SUM(public.inv_to_base_for_tenant(
      v_tenant_id,
      r.ingredient_id,
      r.entry_unit_id,
      cl.quantity * r.quantity / r.yield_factor
    )), 3), 0)
    INTO v_pending
    FROM (
      SELECT oi.menu_item_id::bigint AS menu_item_id,
             oi.quantity::integer AS quantity
      FROM public.orders o
      JOIN public.order_items oi
        ON oi.order_id = o.id
       AND oi.tenant_id = o.tenant_id
      WHERE o.tenant_id = v_tenant_id
        AND o.branch_id = v_branch_id
        AND (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_order_date
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
      WHERE o.tenant_id = v_tenant_id
        AND o.branch_id = v_branch_id
        AND (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_order_date
        AND o.status NOT IN ('completed', 'cancelled')
        AND oi.status <> 'cancelled'
        AND s.elem ? 'side_item_id'
        AND (s.elem ->> 'side_item_id') ~ '^[0-9]+$'
    ) cl
    JOIN public.recipes r
      ON r.menu_item_id = cl.menu_item_id
     AND r.tenant_id = v_tenant_id
    WHERE r.ingredient_id = v_need.ingredient_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.recipes r2
        WHERE r2.menu_item_id = cl.menu_item_id
          AND r2.tenant_id = v_tenant_id
          AND r2.entry_unit_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM public.ingredient_units iu
            WHERE iu.tenant_id = v_tenant_id
              AND iu.ingredient_id = r2.ingredient_id
              AND iu.unit_id = r2.entry_unit_id
              AND iu.is_active = TRUE
          )
      );

    -- ADR 0026: today's per-menu-item stock_allowance_quantity adds N
    -- portions of headroom for the inserted main item and its sides,
    -- converted to this ingredient's base units. Self-consumes once
    -- posting drives on-hand negative (or while pending fills the credit).
    SELECT COALESCE(ROUND(SUM(public.inv_to_base_for_tenant(
      v_tenant_id,
      r.ingredient_id,
      r.entry_unit_id,
      COALESCE(bl.stock_allowance_quantity, 0) * r.quantity / r.yield_factor
    )), 3), 0)
    INTO v_allowance
    FROM (
      SELECT NEW.menu_item_id::bigint AS menu_item_id
      WHERE NEW.menu_item_id IS NOT NULL
      UNION
      SELECT (s.elem ->> 'side_item_id')::bigint AS menu_item_id
      FROM jsonb_array_elements(COALESCE(NEW.sides, '[]'::jsonb)) AS s(elem)
      WHERE s.elem ? 'side_item_id'
        AND (s.elem ->> 'side_item_id') ~ '^[0-9]+$'
    ) items
    JOIN public.branch_menu_item_daily_limits bl
      ON bl.branch_id = v_branch_id
     AND bl.menu_item_id = items.menu_item_id
     AND bl.limit_date = v_order_date
     AND bl.tenant_id = v_tenant_id
     AND COALESCE(bl.stock_allowance_quantity, 0) > 0
    JOIN public.recipes r
      ON r.menu_item_id = items.menu_item_id
     AND r.tenant_id = v_tenant_id
     AND r.ingredient_id = v_need.ingredient_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.recipes r2
      WHERE r2.menu_item_id = items.menu_item_id
        AND r2.tenant_id = v_tenant_id
        AND r2.entry_unit_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.ingredient_units iu
          WHERE iu.tenant_id = v_tenant_id
            AND iu.ingredient_id = r2.ingredient_id
            AND iu.unit_id = r2.entry_unit_id
            AND iu.is_active = TRUE
        )
    );

    IF v_on_hand + v_allowance - v_pending < 0 THEN
      RAISE EXCEPTION 'insufficient_stock_ingredient:%', v_need.ingredient_id
        USING ERRCODE = 'P0001',
              DETAIL = jsonb_build_object(
                'reason', 'insufficient_stock_ingredient',
                'ingredient_id', v_need.ingredient_id
              )::text;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$_$;


CREATE OR REPLACE FUNCTION public.set_branch_menu_stock_allowance(
  p_branch_id bigint,
  p_menu_item_id bigint,
  p_stock_allowance_quantity integer
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant_id BIGINT := public.auth_tenant_id();
  v_role      TEXT   := public.auth_role();
  v_branch    BIGINT := public.auth_branch_id();
  v_today     DATE   := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_row       public.branch_menu_item_daily_limits;
  v_stock_capacity INTEGER;
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

  IF p_stock_allowance_quantity IS NOT NULL AND p_stock_allowance_quantity < 0 THEN
    RAISE EXCEPTION 'stock_allowance_quantity must be nonnegative or null'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.menu_items mi
    WHERE mi.id = p_menu_item_id
      AND mi.tenant_id = v_tenant_id
      AND mi.is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'menu item not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1 FROM public.branches b
    WHERE b.id = p_branch_id AND b.tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch not found' USING ERRCODE = 'P0002';
  END IF;

  v_stock_capacity := public.compute_menu_item_stock_capacity(
    v_tenant_id,
    p_branch_id,
    p_menu_item_id
  );

  INSERT INTO public.branch_menu_item_daily_limits (
    tenant_id,
    branch_id,
    menu_item_id,
    limit_date,
    limit_quantity,
    is_disabled,
    sold_today,
    stock_capacity,
    stock_allowance_quantity
  )
  VALUES (
    v_tenant_id,
    p_branch_id,
    p_menu_item_id,
    v_today,
    NULL,
    false,
    0,
    v_stock_capacity,
    p_stock_allowance_quantity
  )
  ON CONFLICT (branch_id, menu_item_id, limit_date)
  DO UPDATE SET
    stock_allowance_quantity = EXCLUDED.stock_allowance_quantity,
    stock_capacity = EXCLUDED.stock_capacity,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'branch_id', v_row.branch_id,
    'menu_item_id', v_row.menu_item_id,
    'limit_date', v_row.limit_date,
    'stock_allowance_quantity', v_row.stock_allowance_quantity,
    'is_disabled', v_row.is_disabled,
    'sold_today', v_row.sold_today,
    'stock_capacity', v_row.stock_capacity
  );
END;
$$;

COMMENT ON FUNCTION public.set_branch_menu_stock_allowance(
  p_branch_id bigint,
  p_menu_item_id bigint,
  p_stock_allowance_quantity integer
) IS 'ADR 0026: sets today''s supplemental sellable allowance (add-N-on-top portions) for one menu item. Does not book warehouse movements.';

GRANT ALL ON FUNCTION public.set_branch_menu_stock_allowance(
  p_branch_id bigint,
  p_menu_item_id bigint,
  p_stock_allowance_quantity integer
) TO authenticated;
GRANT ALL ON FUNCTION public.set_branch_menu_stock_allowance(
  p_branch_id bigint,
  p_menu_item_id bigint,
  p_stock_allowance_quantity integer
) TO service_role;




COMMENT ON FUNCTION public.enforce_branch_stock_availability() IS
  'Blocks stock-controlled order demand that exceeds warehouse balance plus today''s per-menu-item stock_allowance_quantity when POS stock posting is enabled (ADR 0026).';

GRANT ALL ON FUNCTION public.branch_menu_limit_availability(p_tenant_id bigint, p_branch_id bigint, p_limit_date date, p_stock_gate_enabled boolean, p_exclude_hold_tokens uuid[]) TO service_role;
GRANT ALL ON FUNCTION public.get_branch_menu_daily_limits_for_pos(p_branch_id bigint, p_exclude_hold_tokens uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_branch_menu_daily_limits_for_pos(p_branch_id bigint, p_exclude_hold_tokens uuid[]) TO service_role;
GRANT ALL ON FUNCTION public.list_branch_menu_daily_limits(p_branch_id bigint, p_limit_date date) TO authenticated;
GRANT ALL ON FUNCTION public.list_branch_menu_daily_limits(p_branch_id bigint, p_limit_date date) TO service_role;
