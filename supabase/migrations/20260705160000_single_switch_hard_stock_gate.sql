-- D065: collapse the two-flag gate_eff to the single "Trừ tồn khi bán" switch,
-- add a hard warehouse-stock gate trigger, and stop payment posting from
-- ever raising on a stock shortage.

CREATE OR REPLACE FUNCTION public.get_branch_menu_daily_limits_for_pos(p_branch_id bigint, p_exclude_hold_tokens uuid[] DEFAULT NULL) RETURNS TABLE(menu_item_id bigint, is_disabled boolean, sold_today integer, stock_capacity integer, manual_limit_quantity integer, pending_unfinalized_demand integer, active_hold_demand integer, available_to_sell integer)
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

COMMENT ON FUNCTION public.get_branch_menu_daily_limits_for_pos(p_branch_id bigint, p_exclude_hold_tokens uuid[]) IS 'Row filter and availability gate both key on gate_eff = pos_stock_outcome_posting alone — D065 §1 collapses the two-flag AND into one owner-facing switch. p_exclude_hold_tokens passes the caller''s live hold token(s) through so its own reservation is not double-counted on refetch. Slimmed shape — see branch_menu_limit_availability comment.';

CREATE OR REPLACE FUNCTION public.list_branch_menu_daily_limits(p_branch_id bigint, p_limit_date date DEFAULT NULL::date) RETURNS TABLE(menu_item_id bigint, item_name text, category_id bigint, category_name text, base_price numeric, limit_id bigint, limit_date date, is_disabled boolean, sold_today integer, stock_capacity integer, manual_limit_quantity integer, pending_unfinalized_demand integer, active_hold_demand integer, available_to_sell integer)
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

COMMENT ON FUNCTION public.list_branch_menu_daily_limits(p_branch_id bigint, p_limit_date date) IS 'Manager Giới hạn bán page. gate_eff = pos_stock_outcome_posting alone (D065 §1), same source as get_branch_menu_daily_limits_for_pos.';

-- Hard stock gate: fires AFTER trg_enforce_branch_menu_daily_limit
-- ("branch" < "stock" alphabetically), so the quota/disable checks run first
-- and this trigger only needs to worry about warehouse stock.
CREATE FUNCTION public.enforce_branch_stock_availability() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant_id   bigint;
  v_branch_id   bigint;
  v_order_date  date;
  v_location_id bigint;
  v_need        record;
  v_on_hand     numeric(15,3);
  v_pending     numeric(15,3);
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
  -- warehouse location) leaves on_hand at 0 below — consistent with
  -- capacity/availability display already showing 0 in that case.
  SELECT il.id
  INTO v_location_id
  FROM public.inventory_locations il
  WHERE il.branch_id = v_branch_id
    AND il.tenant_id = v_tenant_id
    AND il.location_kind = 'warehouse'
    AND il.is_active = TRUE
  ORDER BY il.is_default_issue DESC, il.sort_order NULLS LAST, il.id
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

    IF v_on_hand - v_pending < 0 THEN
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
$$;

REVOKE ALL ON FUNCTION public.enforce_branch_stock_availability() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_branch_stock_availability() FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.enforce_branch_stock_availability() TO service_role;

COMMENT ON FUNCTION public.enforce_branch_stock_availability() IS 'AFTER INSERT on order_items: when branch flag pos_stock_outcome_posting is on, hard-block (P0001 insufficient_stock_ingredient:<id>) if this row''s recipe demand would drive branch warehouse stock negative at the SAME issue location post_pos_sale_consumption_if_ready deducts from (is_default_issue DESC, sort_order, id — NULL location leaves on_hand 0); pending = today''s not-yet-completed/cancelled order lines, main + sides, including this row. No-recipe items AND items with a recipe line missing an active unit conversion contribute nothing (D064 §2 fail-open, mirrors compute_menu_item_stock_capacity). Skip-hatch comtammatu.skip_quota_enforcement. Fires after trg_enforce_branch_menu_daily_limit — D065 §2.';

CREATE TRIGGER trg_enforce_stock_availability AFTER INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.enforce_branch_stock_availability();

-- Posting-time shortage must never fail payment completion — a race that
-- slipped past the hard gate is caught by stocktake, not by blocking the
-- till (D065 §3).
CREATE OR REPLACE FUNCTION public.post_pos_sale_consumption_if_ready(p_order_id bigint, p_actor_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_actor uuid := COALESCE(p_actor_id, auth.uid());
  v_order record;
  v_location_id bigint;
  v_location_is_default boolean;
  v_need record;
  v_available numeric(15,3);
  v_inserted int := 0;
  v_row_count int := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT o.id, o.tenant_id, o.branch_id, o.status, o.payment_status, o.created_by
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'consumed', false, 'skipped', true, 'reason', 'order_not_found');
  END IF;

  v_actor := COALESCE(v_actor, v_order.created_by);

  IF NOT COALESCE((
    SELECT bff.enabled
    FROM public.branch_feature_flags bff
    WHERE bff.branch_id = v_order.branch_id
      AND bff.flag_key = 'pos_stock_outcome_posting'
  ), false) THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'consumed', false, 'skipped', true, 'reason', 'feature_disabled');
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') <> 'paid'
     OR v_order.status <> 'completed' THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'consumed', false, 'pending', true, 'reason', 'order_not_paid_completed');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_movements sm
    WHERE sm.tenant_id = v_order.tenant_id
      AND sm.order_id = p_order_id
      AND sm.type = 'consumption'
      AND (sm.movement_subtype IS NULL OR sm.movement_subtype = 'sale_consumption')
  ) THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'consumed', true, 'skipped', true, 'reason', 'already_posted');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.kds_tickets kt
    JOIN public.order_items oi
      ON oi.id = kt.order_item_id
     AND oi.tenant_id = kt.tenant_id
    WHERE kt.order_id = p_order_id
      AND kt.tenant_id = v_order.tenant_id
      AND kt.status <> 'cancelled'
      AND oi.status <> 'cancelled'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.kds_tickets kt
      JOIN public.order_items oi
        ON oi.id = kt.order_item_id
       AND oi.tenant_id = kt.tenant_id
      WHERE kt.order_id = p_order_id
        AND kt.tenant_id = v_order.tenant_id
        AND kt.first_ready_at IS NOT NULL
        AND kt.status <> 'cancelled'
        AND oi.status <> 'cancelled'
    ) THEN
      RETURN jsonb_build_object('order_id', p_order_id, 'consumed', false, 'pending', true, 'reason', 'no_ready_kds_items');
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.kds_tickets kt
      JOIN public.order_items oi
        ON oi.id = kt.order_item_id
       AND oi.tenant_id = kt.tenant_id
      WHERE kt.order_id = p_order_id
        AND kt.tenant_id = v_order.tenant_id
        AND kt.status <> 'cancelled'
        AND oi.status <> 'cancelled'
        AND kt.first_ready_at IS NULL
    ) THEN
      RETURN jsonb_build_object('order_id', p_order_id, 'consumed', false, 'pending', true, 'reason', 'kds_not_fully_ready');
    END IF;
  END IF;

  SELECT il.id, il.is_default_issue
  INTO v_location_id, v_location_is_default
  FROM public.inventory_locations il
  WHERE il.branch_id = v_order.branch_id
    AND il.tenant_id = v_order.tenant_id
    AND il.location_kind = 'warehouse'
    AND il.is_active = TRUE
  ORDER BY il.is_default_issue DESC, il.sort_order NULLS LAST, il.id
  LIMIT 1;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'issue_location_missing:%', v_order.branch_id USING ERRCODE = 'P0002';
  END IF;

  IF v_location_is_default IS DISTINCT FROM TRUE THEN
    RAISE WARNING 'default_issue_location_missing:branch %; using warehouse location %',
      v_order.branch_id,
      v_location_id;
  END IF;

  FOR v_need IN
    WITH qualifying_order_items AS (
      SELECT
        oi.id AS order_item_id,
        oi.menu_item_id::bigint AS menu_item_id,
        oi.quantity::numeric AS line_quantity,
        oi.sides
      FROM public.order_items oi
      JOIN public.menu_items mi
        ON mi.id = oi.menu_item_id
       AND mi.tenant_id = oi.tenant_id
      WHERE oi.order_id = p_order_id
        AND oi.tenant_id = v_order.tenant_id
        AND oi.status <> 'cancelled'
        AND (
          EXISTS (
            SELECT 1
            FROM public.kds_tickets kt
            WHERE kt.order_item_id = oi.id
              AND kt.tenant_id = oi.tenant_id
              AND kt.order_id = oi.order_id
              AND kt.first_ready_at IS NOT NULL
              AND kt.status <> 'cancelled'
          )
          OR (
            oi.sent_to_kitchen_at IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM public.kds_tickets kt
              WHERE kt.order_item_id = oi.id
                AND kt.tenant_id = oi.tenant_id
                AND kt.order_id = oi.order_id
                AND kt.status <> 'cancelled'
            )
          )
        )
    ),
    consumption_lines AS (
      SELECT menu_item_id, line_quantity
      FROM qualifying_order_items

      UNION ALL

      SELECT (s.elem ->> 'side_item_id')::bigint AS menu_item_id,
             qoi.line_quantity *
               CASE
                 WHEN COALESCE(s.elem ->> 'quantity', '') ~ '^[0-9]+$'
                   THEN (s.elem ->> 'quantity')::numeric
                 ELSE 1
               END AS line_quantity
      FROM qualifying_order_items qoi
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(qoi.sides, '[]'::jsonb)) AS s(elem)
      WHERE s.elem ? 'side_item_id'
        AND (s.elem ->> 'side_item_id') ~ '^[0-9]+$'
    )
    SELECT
      r.ingredient_id,
      ROUND(SUM(public.inv_to_base_for_tenant(
        v_order.tenant_id,
        r.ingredient_id,
        r.entry_unit_id,
        cl.line_quantity * r.quantity / r.yield_factor
      )), 3)::numeric(15,3) AS need_qty
    FROM consumption_lines cl
    JOIN public.recipes r
      ON r.menu_item_id = cl.menu_item_id
     AND r.tenant_id = v_order.tenant_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.recipes r2
      WHERE r2.menu_item_id = cl.menu_item_id
        AND r2.tenant_id = v_order.tenant_id
        AND r2.entry_unit_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.ingredient_units iu
          WHERE iu.tenant_id = v_order.tenant_id
            AND iu.ingredient_id = r2.ingredient_id
            AND iu.unit_id = r2.entry_unit_id
            AND iu.is_active = TRUE
        )
    )
    GROUP BY r.ingredient_id
    HAVING ROUND(SUM(public.inv_to_base_for_tenant(
      v_order.tenant_id,
      r.ingredient_id,
      r.entry_unit_id,
      cl.line_quantity * r.quantity / r.yield_factor
    )), 3) > 0
    ORDER BY r.ingredient_id
  LOOP
    SELECT sl.current_quantity
    INTO v_available
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_order.tenant_id
      AND sl.branch_id = v_order.branch_id
      AND sl.location_id = v_location_id
      AND sl.ingredient_id = v_need.ingredient_id
    FOR UPDATE;

    IF COALESCE(v_available, 0) < v_need.need_qty THEN
      RAISE WARNING 'insufficient_stock_at_posting: order %, ingredient %', p_order_id, v_need.ingredient_id;
      RETURN jsonb_build_object('order_id', p_order_id, 'consumed', false, 'skipped', true, 'reason', 'insufficient_stock_at_posting');
    END IF;
  END LOOP;

  FOR v_need IN
    WITH qualifying_order_items AS (
      SELECT
        oi.id AS order_item_id,
        oi.menu_item_id::bigint AS menu_item_id,
        oi.quantity::numeric AS line_quantity,
        oi.sides
      FROM public.order_items oi
      JOIN public.menu_items mi
        ON mi.id = oi.menu_item_id
       AND mi.tenant_id = oi.tenant_id
      WHERE oi.order_id = p_order_id
        AND oi.tenant_id = v_order.tenant_id
        AND oi.status <> 'cancelled'
        AND (
          EXISTS (
            SELECT 1
            FROM public.kds_tickets kt
            WHERE kt.order_item_id = oi.id
              AND kt.tenant_id = oi.tenant_id
              AND kt.order_id = oi.order_id
              AND kt.first_ready_at IS NOT NULL
              AND kt.status <> 'cancelled'
          )
          OR (
            oi.sent_to_kitchen_at IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM public.kds_tickets kt
              WHERE kt.order_item_id = oi.id
                AND kt.tenant_id = oi.tenant_id
                AND kt.order_id = oi.order_id
                AND kt.status <> 'cancelled'
            )
          )
        )
    ),
    consumption_lines AS (
      SELECT menu_item_id, line_quantity
      FROM qualifying_order_items

      UNION ALL

      SELECT (s.elem ->> 'side_item_id')::bigint AS menu_item_id,
             qoi.line_quantity *
               CASE
                 WHEN COALESCE(s.elem ->> 'quantity', '') ~ '^[0-9]+$'
                   THEN (s.elem ->> 'quantity')::numeric
                 ELSE 1
               END AS line_quantity
      FROM qualifying_order_items qoi
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(qoi.sides, '[]'::jsonb)) AS s(elem)
      WHERE s.elem ? 'side_item_id'
        AND (s.elem ->> 'side_item_id') ~ '^[0-9]+$'
    )
    SELECT
      r.ingredient_id,
      ROUND(SUM(public.inv_to_base_for_tenant(
        v_order.tenant_id,
        r.ingredient_id,
        r.entry_unit_id,
        cl.line_quantity * r.quantity / r.yield_factor
      )), 3)::numeric(15,3) AS need_qty
    FROM consumption_lines cl
    JOIN public.recipes r
      ON r.menu_item_id = cl.menu_item_id
     AND r.tenant_id = v_order.tenant_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.recipes r2
      WHERE r2.menu_item_id = cl.menu_item_id
        AND r2.tenant_id = v_order.tenant_id
        AND r2.entry_unit_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.ingredient_units iu
          WHERE iu.tenant_id = v_order.tenant_id
            AND iu.ingredient_id = r2.ingredient_id
            AND iu.unit_id = r2.entry_unit_id
            AND iu.is_active = TRUE
        )
    )
    GROUP BY r.ingredient_id
    HAVING ROUND(SUM(public.inv_to_base_for_tenant(
      v_order.tenant_id,
      r.ingredient_id,
      r.entry_unit_id,
      cl.line_quantity * r.quantity / r.yield_factor
    )), 3) > 0
    ORDER BY r.ingredient_id
  LOOP
    INSERT INTO public.stock_movements (
      tenant_id,
      branch_id,
      ingredient_id,
      type,
      movement_subtype,
      quantity_change,
      reason,
      created_by,
      order_id,
      unit_cost,
      location_id
    )
    SELECT
      v_order.tenant_id,
      v_order.branch_id,
      v_need.ingredient_id,
      'consumption',
      'sale_consumption',
      -v_need.need_qty,
      'Order ' || p_order_id::text || ' sale consumption',
      v_actor,
      p_order_id,
      COALESCE(sl.avg_unit_cost, 0),
      v_location_id
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_order.tenant_id
      AND sl.branch_id = v_order.branch_id
      AND sl.location_id = v_location_id
      AND sl.ingredient_id = v_need.ingredient_id
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

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_inserted := v_inserted + v_row_count;
  END LOOP;

  IF v_inserted = 0 THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'consumed', false, 'skipped', true, 'reason', 'no_recipe_movements');
  END IF;

  RETURN jsonb_build_object('order_id', p_order_id, 'consumed', true, 'movements_created', v_inserted);
END;
$_$;

COMMENT ON FUNCTION public.post_pos_sale_consumption_if_ready(p_order_id bigint, p_actor_id uuid) IS 'Idempotency check matches sale-shaped consumption rows for the order: movement_subtype IS NULL (legacy Path-2 consume_stock_for_order) or sale_consumption. Not any consumption row — cancelled_after_kds_ready waste is also type=consumption and must not suppress the sale posting (D064 §8). A shortage caught here (race past the hard gate) never fails payment completion: RAISE WARNING + return insufficient_stock_at_posting, no partial posting — drift is caught by stocktake (D065 §3). Menu items with a recipe line missing an active unit conversion are excluded from both consumption loops (D064 §2 fail-open) rather than letting inv_to_base_for_tenant raise recipe_unit_conversion_missing on the payment path.';

DELETE FROM public.branch_feature_flags WHERE flag_key = 'pos_stock_availability_gate';
