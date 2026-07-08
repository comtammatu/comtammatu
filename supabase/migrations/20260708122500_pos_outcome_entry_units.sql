-- Patch the two POS outcome writers (post_pos_sale_consumption_if_ready,
-- post_pos_cancelled_ready_waste) so the consumption INSERT into stock_movements
-- carries entry_unit_id + entry_quantity, satisfying the NOT NULL constraint
-- added in 20260707191741. Both functions are gated behind pos_stock_outcome_posting
-- (currently OFF on every branch), so this is a dormant-writer fix: it only matters
-- once the flag is enabled, but it MUST land before the flag flips.
--
-- Strategy: the function bodies are preserved VERBATIM from 20260706085000. The
-- ONLY changes are inside the INSERT loop of each function:
--   (a) the cursor SELECT gains one correlated subquery `entry_unit_id` resolving
--       the ingredient's active base unit (same pattern as 20260708121500);
--   (b) a guard raises `entry_unit_not_found:%` if that resolution is NULL, so the
--       INSERT can never violate the NOT NULL constraint;
--   (c) the stock_movements INSERT column list gains entry_unit_id + entry_quantity
--       (entry_quantity mirrors need_qty because need_qty is already in base units
--       and entry == base for aggregated consumption).
-- Guards, flag check, KDS-ready gate, idempotency ON CONFLICT, kitchen-location
-- resolve, the availability pre-check loop, and the sides explosion are preserved
-- verbatim. Signatures and return shapes do not change.

SET search_path = '';
SET check_function_bodies = off;

-- ============================================================
-- 1) post_pos_sale_consumption_if_ready
-- ============================================================
CREATE OR REPLACE FUNCTION public.post_pos_sale_consumption_if_ready(
  p_order_id bigint,
  p_actor_id uuid DEFAULT NULL::uuid
) RETURNS jsonb
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
    AND il.location_kind = 'kitchen'
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

  -- Availability pre-check (fail-soft: a shortage caught here never fails payment
  -- completion; drift is caught by stocktake). Preserved verbatim.
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

  -- INSERT loop: same CTE as the pre-check, with an added entry_unit_id subquery.
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
      )), 3)::numeric(15,3) AS need_qty,
      (
        SELECT iu.unit_id
        FROM public.ingredient_units iu
        JOIN public.units u
          ON u.id = iu.unit_id
         AND u.tenant_id = iu.tenant_id
         AND u.is_active = TRUE
        WHERE iu.tenant_id = v_order.tenant_id
          AND iu.ingredient_id = r.ingredient_id
          AND iu.is_base = TRUE
          AND iu.is_active = TRUE
        ORDER BY iu.sort_order ASC, iu.id ASC
        LIMIT 1
      ) AS entry_unit_id
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
    IF v_need.entry_unit_id IS NULL THEN
      RAISE EXCEPTION 'entry_unit_not_found:%', v_need.ingredient_id USING ERRCODE = '23503';
    END IF;

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
      location_id,
      entry_unit_id,
      entry_quantity
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
      v_location_id,
      v_need.entry_unit_id,
      v_need.need_qty
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

REVOKE ALL ON FUNCTION public.post_pos_sale_consumption_if_ready(bigint, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_pos_sale_consumption_if_ready(bigint, uuid) TO service_role;

-- ============================================================
-- 2) post_pos_cancelled_ready_waste
-- ============================================================
CREATE OR REPLACE FUNCTION public.post_pos_cancelled_ready_waste(
  p_order_id bigint,
  p_actor_id uuid DEFAULT NULL::uuid,
  p_reason text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := COALESCE(p_actor_id, auth.uid());
  v_order record;
  v_location_id bigint;
  v_location_is_default boolean;
  v_need record;
  v_available numeric(15,3);
  v_inserted int := 0;
  v_row_count int := 0;
  v_reason text := COALESCE(NULLIF(trim(p_reason), ''), 'cancelled_after_kds_ready');
BEGIN
  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT o.id, o.tenant_id, o.branch_id, o.status, o.created_by
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

  IF EXISTS (
    SELECT 1
    FROM public.stock_movements sm
    WHERE sm.tenant_id = v_order.tenant_id
      AND sm.order_id = p_order_id
      AND sm.movement_subtype = 'cancelled_after_kds_ready'
  ) THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'consumed', true, 'skipped', true, 'reason', 'already_posted');
  END IF;

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
    RETURN jsonb_build_object('order_id', p_order_id, 'consumed', false, 'skipped', true, 'reason', 'no_ready_kds_items');
  END IF;

  SELECT il.id, il.is_default_issue
  INTO v_location_id, v_location_is_default
  FROM public.inventory_locations il
  WHERE il.branch_id = v_order.branch_id
    AND il.tenant_id = v_order.tenant_id
    AND il.location_kind = 'kitchen'
    AND il.is_active = TRUE
  ORDER BY il.is_default_issue DESC, il.sort_order NULLS LAST, il.id
  LIMIT 1;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'issue_location_missing:%', v_order.branch_id USING ERRCODE = 'P0002';
  END IF;

  IF v_location_is_default IS DISTINCT FROM TRUE THEN
    RAISE WARNING 'default_issue_location_missing:branch %; using kitchen location %',
      v_order.branch_id,
      v_location_id;
  END IF;

  -- Availability pre-check (hard-fail: cancel-after-ready must not post phantom
  -- waste when stock is insufficient). Preserved verbatim.
  FOR v_need IN
    WITH consumption_lines AS (
      SELECT oi.menu_item_id::bigint AS menu_item_id,
             oi.quantity::numeric AS line_quantity
      FROM public.order_items oi
      WHERE oi.order_id = p_order_id
        AND oi.tenant_id = v_order.tenant_id
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

      UNION ALL

      SELECT (s.elem ->> 'side_item_id')::bigint AS menu_item_id,
             oi.quantity::numeric *
               CASE
                 WHEN COALESCE(s.elem ->> 'quantity', '') ~ '^[0-9]+$'
                   THEN (s.elem ->> 'quantity')::numeric
                 ELSE 1
               END AS line_quantity
      FROM public.order_items oi
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(oi.sides, '[]'::jsonb)) AS s(elem)
      WHERE oi.order_id = p_order_id
        AND oi.tenant_id = v_order.tenant_id
        AND oi.status <> 'cancelled'
        AND s.elem ? 'side_item_id'
        AND (s.elem ->> 'side_item_id') ~ '^[0-9]+$'
        AND EXISTS (
          SELECT 1
          FROM public.kds_tickets kt
          WHERE kt.order_item_id = oi.id
            AND kt.tenant_id = oi.tenant_id
            AND kt.order_id = oi.order_id
            AND kt.first_ready_at IS NOT NULL
            AND kt.status <> 'cancelled'
        )
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
      RAISE EXCEPTION 'insufficient_stock_ingredient:%', v_need.ingredient_id USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  -- INSERT loop: same CTE as the pre-check, with an added entry_unit_id subquery.
  FOR v_need IN
    WITH consumption_lines AS (
      SELECT oi.menu_item_id::bigint AS menu_item_id,
             oi.quantity::numeric AS line_quantity
      FROM public.order_items oi
      WHERE oi.order_id = p_order_id
        AND oi.tenant_id = v_order.tenant_id
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

      UNION ALL

      SELECT (s.elem ->> 'side_item_id')::bigint AS menu_item_id,
             oi.quantity::numeric *
               CASE
                 WHEN COALESCE(s.elem ->> 'quantity', '') ~ '^[0-9]+$'
                   THEN (s.elem ->> 'quantity')::numeric
                 ELSE 1
               END AS line_quantity
      FROM public.order_items oi
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(oi.sides, '[]'::jsonb)) AS s(elem)
      WHERE oi.order_id = p_order_id
        AND oi.tenant_id = v_order.tenant_id
        AND oi.status <> 'cancelled'
        AND s.elem ? 'side_item_id'
        AND (s.elem ->> 'side_item_id') ~ '^[0-9]+$'
        AND EXISTS (
          SELECT 1
          FROM public.kds_tickets kt
          WHERE kt.order_item_id = oi.id
            AND kt.tenant_id = oi.tenant_id
            AND kt.order_id = oi.order_id
            AND kt.first_ready_at IS NOT NULL
            AND kt.status <> 'cancelled'
        )
    )
    SELECT
      r.ingredient_id,
      ROUND(SUM(public.inv_to_base_for_tenant(
        v_order.tenant_id,
        r.ingredient_id,
        r.entry_unit_id,
        cl.line_quantity * r.quantity / r.yield_factor
      )), 3)::numeric(15,3) AS need_qty,
      (
        SELECT iu.unit_id
        FROM public.ingredient_units iu
        JOIN public.units u
          ON u.id = iu.unit_id
         AND u.tenant_id = iu.tenant_id
         AND u.is_active = TRUE
        WHERE iu.tenant_id = v_order.tenant_id
          AND iu.ingredient_id = r.ingredient_id
          AND iu.is_base = TRUE
          AND iu.is_active = TRUE
        ORDER BY iu.sort_order ASC, iu.id ASC
        LIMIT 1
      ) AS entry_unit_id
    FROM consumption_lines cl
    JOIN public.recipes r
      ON r.menu_item_id = cl.menu_item_id
     AND r.tenant_id = v_order.tenant_id
    GROUP BY r.ingredient_id
    HAVING ROUND(SUM(public.inv_to_base_for_tenant(
      v_order.tenant_id,
      r.ingredient_id,
      r.entry_unit_id,
      cl.line_quantity * r.quantity / r.yield_factor
    )), 3) > 0
    ORDER BY r.ingredient_id
  LOOP
    IF v_need.entry_unit_id IS NULL THEN
      RAISE EXCEPTION 'entry_unit_not_found:%', v_need.ingredient_id USING ERRCODE = '23503';
    END IF;

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
      location_id,
      entry_unit_id,
      entry_quantity
    )
    SELECT
      v_order.tenant_id,
      v_order.branch_id,
      v_need.ingredient_id,
      'consumption',
      'cancelled_after_kds_ready',
      -v_need.need_qty,
      'Order ' || p_order_id::text || ' cancelled after KDS ready: ' || v_reason,
      v_actor,
      p_order_id,
      COALESCE(sl.avg_unit_cost, 0),
      v_location_id,
      v_need.entry_unit_id,
      v_need.need_qty
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
$$;

REVOKE ALL ON FUNCTION public.post_pos_cancelled_ready_waste(bigint, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_pos_cancelled_ready_waste(bigint, uuid, text) TO service_role;
