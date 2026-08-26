-- ADR 0047 (extends ADR 0026) / Primary Recipe Ingredients for Sellable Capacity
-- Adds recipes.is_primary to allow 1 or more core ingredients to determine
-- stock capacity and pre-order availability gating, while secondary
-- ingredients (garnishes, condiments) are deducted post-sale without blocking sales.

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS is_primary boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN public.recipes.is_primary IS
  'When TRUE, this ingredient is a primary core component of the dish that constrains sellable capacity and pre-order availability. When a recipe has primary lines, secondary lines do not block sales when out of stock, but are still deducted post-sale.';

-- 1. Update upsert_recipe_lines to accept is_primary and preserve existing flags if omitted
CREATE OR REPLACE FUNCTION public.upsert_recipe_lines(
  p_menu_item_id bigint,
  p_lines jsonb,
  p_old_menu_item_id bigint DEFAULT NULL::bigint
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_kept bigint[] := ARRAY[]::bigint[];
  v_line jsonb;
  v_ingredient_id bigint;
  v_entry_unit_id bigint;
  v_is_primary boolean;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;
  IF public.auth_role() <> 'owner' THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_permission_any('inventory:write')
    OR public.has_permission_any('menu:write')
  ) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.menu_items AS menu_item
    WHERE menu_item.id = p_menu_item_id
      AND menu_item.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'menu_item_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'lines_must_be_array'
      USING ERRCODE = '22023';
  END IF;

  IF p_old_menu_item_id IS NOT NULL
     AND p_old_menu_item_id <> p_menu_item_id THEN
    DELETE FROM public.recipes AS recipe
    WHERE recipe.tenant_id = v_tenant
      AND recipe.menu_item_id = p_old_menu_item_id;
  END IF;

  FOR v_line IN
    SELECT value
    FROM jsonb_array_elements(p_lines)
  LOOP
    IF (v_line ->> 'ingredient_id') IS NULL
       OR (v_line ->> 'quantity') IS NULL THEN
      RAISE EXCEPTION 'invalid_line_shape'
        USING ERRCODE = '22023';
    END IF;

    v_ingredient_id := (v_line ->> 'ingredient_id')::bigint;
    v_entry_unit_id :=
      nullif(v_line ->> 'entry_unit_id', '')::bigint;

    v_is_primary := CASE
      WHEN v_line ? 'is_primary' THEN (v_line ->> 'is_primary')::boolean
      WHEN v_line ? 'isPrimary' THEN (v_line ->> 'isPrimary')::boolean
      ELSE NULL::boolean
    END;

    PERFORM public.inventory_entry_unit_code(
      v_tenant,
      v_ingredient_id,
      v_entry_unit_id
    );

    INSERT INTO public.recipes (
      tenant_id,
      menu_item_id,
      ingredient_id,
      quantity,
      entry_unit_id,
      note,
      yield_factor,
      is_primary
    )
    VALUES (
      v_tenant,
      p_menu_item_id,
      v_ingredient_id,
      (v_line ->> 'quantity')::numeric,
      v_entry_unit_id,
      nullif(v_line ->> 'note', ''),
      coalesce(
        nullif(v_line ->> 'yield_factor', '')::numeric,
        1.000
      ),
      coalesce(v_is_primary, false)
    )
    ON CONFLICT (menu_item_id, ingredient_id, tenant_id)
    DO UPDATE SET
      quantity = excluded.quantity,
      entry_unit_id = excluded.entry_unit_id,
      note = excluded.note,
      yield_factor = excluded.yield_factor,
      is_primary = coalesce(v_is_primary, recipes.is_primary, false);

    v_kept := v_kept || v_ingredient_id;
  END LOOP;

  DELETE FROM public.recipes AS recipe
  WHERE recipe.tenant_id = v_tenant
    AND recipe.menu_item_id = p_menu_item_id
    AND NOT (recipe.ingredient_id = ANY(v_kept));

  RETURN jsonb_build_object(
    'menu_item_id',
    p_menu_item_id,
    'kept_count',
    coalesce(array_length(v_kept, 1), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_recipe_lines(bigint, jsonb, bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.upsert_recipe_lines(bigint, jsonb, bigint) TO authenticated;
GRANT ALL ON FUNCTION public.upsert_recipe_lines(bigint, jsonb, bigint) TO service_role;

-- 2. Update compute_menu_item_stock_capacity to filter primary ingredients
CREATE OR REPLACE FUNCTION public.compute_menu_item_stock_capacity(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_menu_item_id bigint
) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  WITH item_primary_flags AS (
    SELECT bool_or(r.is_primary) AS has_primary
    FROM public.recipes r
    WHERE r.tenant_id = p_tenant_id
      AND r.menu_item_id = p_menu_item_id
  ),
  recipe_lines AS (
    SELECT
      r.ingredient_id,
      CASE
        WHEN r.entry_unit_id IS NULL THEN r.quantity / r.yield_factor
        WHEN iu.id IS NULL THEN NULL::numeric
        ELSE (r.quantity / r.yield_factor) * iu.to_base_factor
      END AS per_portion_qty,
      (r.entry_unit_id IS NOT NULL AND iu.id IS NULL) AS line_missing_config
    FROM public.recipes r
    CROSS JOIN item_primary_flags ipf
    LEFT JOIN public.ingredient_units iu
      ON iu.tenant_id = p_tenant_id
     AND iu.ingredient_id = r.ingredient_id
     AND iu.unit_id = r.entry_unit_id
     AND iu.is_active = TRUE
    WHERE r.tenant_id = p_tenant_id
      AND r.menu_item_id = p_menu_item_id
      AND (r.is_primary = true OR COALESCE(ipf.has_primary, false) = false)
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

REVOKE ALL ON FUNCTION public.compute_menu_item_stock_capacity(bigint, bigint, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.compute_menu_item_stock_capacity(bigint, bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.compute_menu_item_stock_capacity(bigint, bigint, bigint) TO service_role;

-- 3. Update branch_menu_limit_availability to filter primary ingredients for capacity while aggregating shared ingredient demand
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
  stock_allowance_quantity integer,
  pending_unfinalized_demand integer,
  active_hold_demand integer,
  available_to_sell integer
)
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
  menu_item_primary_flags AS (
    SELECT
      r.menu_item_id,
      bool_or(r.is_primary) AS has_primary
    FROM public.recipes r
    WHERE r.tenant_id = p_tenant_id
    GROUP BY r.menu_item_id
  ),
  all_recipe_lines AS (
    SELECT
      r.menu_item_id,
      r.ingredient_id,
      r.is_primary,
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
  primary_recipe_lines AS (
    SELECT
      rl.menu_item_id,
      rl.ingredient_id,
      rl.per_portion_qty,
      rl.line_missing_config
    FROM all_recipe_lines rl
    LEFT JOIN menu_item_primary_flags mpf
      ON mpf.menu_item_id = rl.menu_item_id
    WHERE (rl.is_primary = true OR COALESCE(mpf.has_primary, false) = false)
  ),
  pending_ingredient AS (
    SELECT
      rl.ingredient_id,
      SUM(pi.quantity * rl.per_portion_qty) AS base_qty
    FROM pending_item pi
    JOIN all_recipe_lines rl ON rl.menu_item_id = pi.menu_item_id
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
    JOIN all_recipe_lines rl ON rl.menu_item_id = hi.menu_item_id
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
    LEFT JOIN primary_recipe_lines rl ON rl.menu_item_id = mi.id
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

REVOKE ALL ON FUNCTION public.branch_menu_limit_availability(bigint, bigint, date, boolean, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.branch_menu_limit_availability(bigint, bigint, date, boolean, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.branch_menu_limit_availability(bigint, bigint, date, boolean, uuid[]) TO service_role;

-- 4. Update enforce_branch_stock_availability to only enforce on primary ingredients
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

  SELECT il.id
  INTO v_location_id
  FROM public.inventory_locations il
  WHERE il.branch_id = v_branch_id
    AND il.tenant_id = v_tenant_id
    AND il.location_kind = 'warehouse'
    AND il.is_active = TRUE
  ORDER BY il.is_default_consumption DESC, il.sort_order NULLS LAST, il.id
  LIMIT 1;

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
    ),
    item_primary_flags AS (
      SELECT
        r.menu_item_id,
        bool_or(r.is_primary) AS has_primary
      FROM public.recipes r
      WHERE r.tenant_id = v_tenant_id
        AND r.menu_item_id IN (SELECT d.menu_item_id FROM row_demand d WHERE d.menu_item_id IS NOT NULL)
      GROUP BY r.menu_item_id
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
    LEFT JOIN item_primary_flags ipf
      ON ipf.menu_item_id = r.menu_item_id
    WHERE d.menu_item_id IS NOT NULL
      AND (r.is_primary = true OR COALESCE(ipf.has_primary, false) = false)
      AND (
        r.entry_unit_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.ingredient_units iu
          WHERE iu.tenant_id = v_tenant_id
            AND iu.ingredient_id = r.ingredient_id
            AND iu.unit_id = r.entry_unit_id
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
     AND r.ingredient_id = v_need.ingredient_id
    WHERE (
      r.entry_unit_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.ingredient_units iu
        WHERE iu.tenant_id = v_tenant_id
          AND iu.ingredient_id = r.ingredient_id
          AND iu.unit_id = r.entry_unit_id
          AND iu.is_active = TRUE
      )
    );

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
    LEFT JOIN LATERAL (
      SELECT bool_or(r_sub.is_primary) AS has_primary
      FROM public.recipes r_sub
      WHERE r_sub.tenant_id = v_tenant_id
        AND r_sub.menu_item_id = items.menu_item_id
    ) ipf ON TRUE
    WHERE (r.is_primary = true OR COALESCE(ipf.has_primary, false) = false)
      AND (
        r.entry_unit_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.ingredient_units iu
          WHERE iu.tenant_id = v_tenant_id
            AND iu.ingredient_id = r.ingredient_id
            AND iu.unit_id = r.entry_unit_id
            AND iu.is_active = TRUE
        )
      );

    IF v_on_hand + v_allowance - v_pending < 0 THEN
      RAISE EXCEPTION 'insufficient_stock_ingredient:%', v_need.ingredient_id
        USING ERRCODE = 'P0001',
              DETAIL = jsonb_build_object(
                'reason', 'insufficient_stock_ingredient',
                'ingredient_id', v_need.ingredient_id,
                'location_id', v_location_id,
                'on_hand', v_on_hand,
                'pending', v_pending,
                'allowance', v_allowance,
                'demand', v_need.need_qty,
                'shortfall', v_pending - (v_on_hand + v_allowance)
              )::text;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$_$;

REVOKE ALL ON FUNCTION public.enforce_branch_stock_availability() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_branch_stock_availability() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_branch_stock_availability() TO service_role;
