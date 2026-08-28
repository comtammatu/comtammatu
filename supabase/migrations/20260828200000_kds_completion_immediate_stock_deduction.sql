-- Migration: Deduct stock immediately when KDS marks tickets ready.
-- Kitchen preparation consumes ingredients irreversibly upon completion.
-- Unpaid / in-flight orders deduct stock immediately per completed ticket via delta posting.

DROP INDEX IF EXISTS public.idx_stock_movements_pos_outcome_idempotency;

CREATE INDEX IF NOT EXISTS idx_stock_movements_pos_outcome_lookup
  ON public.stock_movements (
    tenant_id,
    order_id,
    movement_subtype,
    ingredient_id,
    location_id
  )
  WHERE order_id IS NOT NULL;

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
  v_unit_cost numeric(24,8);
  v_cost_rung text;
  v_inserted int := 0;
  v_needed int := 0;
  v_row_count int := 0;
  v_short bigint[] := ARRAY[]::bigint[];
  v_synthesized bigint[] := ARRAY[]::bigint[];
  v_cost_fallback bigint[] := ARRAY[]::bigint[];
  v_zero_cost bigint[] := ARRAY[]::bigint[];
  v_followup_needed boolean := false;
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

  SELECT il.id, il.is_default_consumption
  INTO v_location_id, v_location_is_default
  FROM public.inventory_locations il
  WHERE il.branch_id = v_order.branch_id
    AND il.tenant_id = v_order.tenant_id
    AND il.location_kind = 'warehouse'
    AND il.is_active = TRUE
  ORDER BY il.is_default_consumption DESC, il.sort_order NULLS LAST, il.id
  LIMIT 1;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'issue_location_missing:%', v_order.branch_id USING ERRCODE = 'P0002';
  END IF;

  IF v_location_is_default IS DISTINCT FROM TRUE THEN
    RAISE WARNING 'default_consumption_location_missing:branch %; using warehouse location %',
      v_order.branch_id,
      v_location_id;
  END IF;

  -- Qualifying items:
  -- 1) Items with a KDS ticket that is ready/served (first_ready_at IS NOT NULL) and not cancelled.
  -- 2) Items without a KDS ticket if sent to kitchen (sent_to_kitchen_at IS NOT NULL) OR if order is paid/completed.
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
            (oi.sent_to_kitchen_at IS NOT NULL OR (v_order.payment_status = 'paid' AND v_order.status = 'completed'))
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
    ),
    expected_needs AS (
      SELECT
        r.ingredient_id,
        ROUND(SUM(public.inv_to_base_for_tenant(
          v_order.tenant_id,
          r.ingredient_id,
          r.entry_unit_id,
          cl.line_quantity * r.quantity / r.yield_factor
        )), 3)::numeric(15,3) AS total_need_qty,
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
    ),
    already_posted AS (
      SELECT
        sm.ingredient_id,
        COALESCE(SUM(ABS(sm.quantity_change)), 0)::numeric(15,3) AS posted_qty
      FROM public.stock_movements sm
      WHERE sm.tenant_id = v_order.tenant_id
        AND sm.order_id = p_order_id
        AND sm.location_id = v_location_id
        AND sm.type = 'consumption'
        AND (sm.movement_subtype IS NULL OR sm.movement_subtype = 'sale_consumption')
      GROUP BY sm.ingredient_id
    )
    SELECT
      en.ingredient_id,
      (en.total_need_qty - COALESCE(ap.posted_qty, 0))::numeric(15,3) AS need_qty,
      en.entry_unit_id
    FROM expected_needs en
    LEFT JOIN already_posted ap ON ap.ingredient_id = en.ingredient_id
    WHERE (en.total_need_qty - COALESCE(ap.posted_qty, 0)) > 0
    ORDER BY en.ingredient_id
  LOOP
    v_needed := v_needed + 1;

    IF v_need.entry_unit_id IS NULL THEN
      RAISE EXCEPTION 'entry_unit_not_found:%', v_need.ingredient_id USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.stock_levels (
      tenant_id,
      branch_id,
      ingredient_id,
      location_id,
      current_quantity
    )
    VALUES (
      v_order.tenant_id,
      v_order.branch_id,
      v_need.ingredient_id,
      v_location_id,
      0
    )
    ON CONFLICT (ingredient_id, branch_id, location_id, tenant_id)
    DO NOTHING;

    IF FOUND THEN
      v_synthesized := array_append(v_synthesized, v_need.ingredient_id);
      v_followup_needed := true;
    END IF;

    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_available, v_unit_cost
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_order.tenant_id
      AND sl.branch_id = v_order.branch_id
      AND sl.location_id = v_location_id
      AND sl.ingredient_id = v_need.ingredient_id
    FOR UPDATE;

    IF v_available IS NULL THEN
      INSERT INTO public.stock_levels (
        tenant_id, branch_id, ingredient_id, location_id, current_quantity
      ) VALUES (
        v_order.tenant_id, v_order.branch_id, v_need.ingredient_id,
        v_location_id, 0
      )
      ON CONFLICT (ingredient_id, branch_id, location_id, tenant_id)
      DO UPDATE SET updated_at = public.stock_levels.updated_at
      RETURNING current_quantity, avg_unit_cost
      INTO v_available, v_unit_cost;
      v_synthesized := array_append(v_synthesized, v_need.ingredient_id);
      v_followup_needed := true;
    END IF;

    IF COALESCE(v_available, 0) < v_need.need_qty THEN
      v_short := array_append(v_short, v_need.ingredient_id);
      v_followup_needed := true;
    END IF;

    -- Cost ladder (ADR 0026 Decision 4, ADR 0040 company WAC)
    v_cost_rung := NULL;
    IF v_unit_cost IS NOT NULL AND v_unit_cost > 0 THEN
      v_cost_rung := 'company_wac';
    ELSE
      v_unit_cost := private.ingredient_company_wac(
        v_order.tenant_id,
        v_need.ingredient_id
      );
      IF v_unit_cost IS NULL OR v_unit_cost <= 0 THEN
        v_unit_cost := private.ingredient_provisional_unit_cost(
          v_order.tenant_id,
          v_need.ingredient_id
        );
      END IF;
      IF v_unit_cost IS NOT NULL AND v_unit_cost > 0 THEN
        v_cost_rung := 'company_wac';
        v_cost_fallback := array_append(v_cost_fallback, v_need.ingredient_id);
        v_followup_needed := true;
      END IF;
    END IF;

    IF v_cost_rung IS NULL THEN
      SELECT gi.unit_cost / NULLIF(
        public.inv_to_base_for_tenant(
          v_order.tenant_id,
          gi.ingredient_id,
          gi.entry_unit_id,
          1
        ),
        0
      )
      INTO v_unit_cost
      FROM public.grn_items gi
      JOIN public.goods_received_notes grn
        ON grn.id = gi.grn_id
       AND grn.tenant_id = gi.tenant_id
      WHERE gi.tenant_id = v_order.tenant_id
        AND gi.ingredient_id = v_need.ingredient_id
        AND grn.status = 'confirmed'
        AND gi.unit_cost IS NOT NULL
        AND gi.unit_cost > 0
      ORDER BY grn.updated_at DESC NULLS LAST, gi.id DESC
      LIMIT 1;
      IF v_unit_cost IS NOT NULL AND v_unit_cost > 0 THEN
        v_cost_rung := 'latest_purchase';
        v_cost_fallback := array_append(v_cost_fallback, v_need.ingredient_id);
        v_followup_needed := true;
      END IF;
    END IF;

    IF v_cost_rung IS NULL THEN
      SELECT sm.unit_cost
      INTO v_unit_cost
      FROM public.stock_movements sm
      WHERE sm.tenant_id = v_order.tenant_id
        AND sm.ingredient_id = v_need.ingredient_id
        AND sm.unit_cost IS NOT NULL
        AND sm.unit_cost > 0
      ORDER BY
        CASE
          WHEN sm.type = 'production_output' THEN 0
          WHEN sm.type IN ('transfer_in', 'grn_receipt') THEN 1
          ELSE 2
        END,
        sm.created_at DESC
      LIMIT 1;
      IF v_unit_cost IS NOT NULL AND v_unit_cost > 0 THEN
        v_cost_rung := 'last_known_movement';
        v_cost_fallback := array_append(v_cost_fallback, v_need.ingredient_id);
        v_followup_needed := true;
      END IF;
    END IF;

    IF v_cost_rung IS NULL THEN
      v_unit_cost := 0;
      v_cost_rung := 'zero';
      v_zero_cost := array_append(v_zero_cost, v_need.ingredient_id);
      v_followup_needed := true;
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
    VALUES (
      v_order.tenant_id,
      v_order.branch_id,
      v_need.ingredient_id,
      'consumption',
      'sale_consumption',
      -v_need.need_qty,
      'Order ' || p_order_id::text
        || ' sale consumption; cost_rung=' || v_cost_rung,
      v_actor,
      p_order_id,
      v_unit_cost,
      v_location_id,
      v_need.entry_unit_id,
      v_need.need_qty
    );

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_inserted := v_inserted + v_row_count;
  END LOOP;

  IF v_needed = 0 THEN
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
    RETURN jsonb_build_object('order_id', p_order_id, 'consumed', false, 'skipped', true, 'reason', 'no_recipe_movements');
  END IF;

  IF v_followup_needed THEN
    INSERT INTO public.notifications (
      tenant_id,
      target_branch_id,
      target_roles,
      kind,
      severity,
      title,
      body,
      entity_type,
      entity_id,
      action_url,
      dedup_key,
      meta
    )
    VALUES (
      v_order.tenant_id,
      v_order.branch_id,
      ARRAY['owner', 'branch_manager']::text[],
      'inventory.pos_stock_shortfall',
      'warning',
      'Trừ tồn bán hàng cần đối soát',
      'Đơn hàng đã trừ kho khi hoàn thành món; có nguyên liệu thiếu tồn, thiếu dòng tồn hoặc thiếu giá vốn.',
      'order',
      p_order_id,
      format('/br/%s/stock', v_order.branch_id),
      'inventory.pos_stock_shortfall:' || p_order_id::text,
      jsonb_build_object(
        'order_id', p_order_id,
        'short_ingredient_ids', to_jsonb(v_short),
        'synthesized_ingredient_ids', to_jsonb(v_synthesized),
        'cost_fallback_ingredient_ids', to_jsonb(v_cost_fallback),
        'zero_cost_ingredient_ids', to_jsonb(v_zero_cost),
        'source', 'post_pos_sale_consumption_if_ready'
      )
    )
    ON CONFLICT (tenant_id, dedup_key)
      WHERE dedup_key IS NOT NULL
    DO UPDATE SET
      body = EXCLUDED.body,
      meta = EXCLUDED.meta,
      action_url = EXCLUDED.action_url,
      created_at = now(),
      expires_at = NULL;
  END IF;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'consumed', v_inserted = v_needed AND v_inserted > 0,
    'movements_created', v_inserted,
    'lines_needed', v_needed,
    'short_ingredient_ids', to_jsonb(v_short),
    'synthesized_ingredient_ids', to_jsonb(v_synthesized),
    'cost_fallback_ingredient_ids', to_jsonb(v_cost_fallback),
    'zero_cost_ingredient_ids', to_jsonb(v_zero_cost),
    'followup', v_followup_needed
  );
END;
$_$;

COMMENT ON FUNCTION public.post_pos_sale_consumption_if_ready(p_order_id bigint, p_actor_id uuid) IS
  'Deducts branch warehouse inventory immediately upon KDS completion via delta posting. Non-KDS lines consume after dispatch or payment.';

CREATE OR REPLACE FUNCTION public.post_pos_cancelled_ready_waste(p_order_id bigint, p_actor_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text) RETURNS jsonb
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
      AND sm.type = 'consumption'
      AND (
        sm.movement_subtype IS NULL
        OR sm.movement_subtype IN ('sale_consumption', 'cancelled_after_kds_ready')
      )
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

  SELECT il.id, il.is_default_consumption
  INTO v_location_id, v_location_is_default
  FROM public.inventory_locations il
  WHERE il.branch_id = v_order.branch_id
    AND il.tenant_id = v_order.tenant_id
    AND il.location_kind = 'warehouse'
    AND il.is_active = TRUE
  ORDER BY il.is_default_consumption DESC, il.sort_order NULLS LAST, il.id
  LIMIT 1;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'issue_location_missing:%', v_order.branch_id USING ERRCODE = 'P0002';
  END IF;

  IF v_location_is_default IS DISTINCT FROM TRUE THEN
    RAISE WARNING 'default_consumption_location_missing:branch %; using warehouse location %',
      v_order.branch_id,
      v_location_id;
  END IF;

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
    SELECT current_quantity
    INTO v_available
    FROM public.stock_levels
    WHERE tenant_id = v_order.tenant_id
      AND branch_id = v_order.branch_id
      AND location_id = v_location_id
      AND ingredient_id = v_need.ingredient_id
    FOR UPDATE;

    IF COALESCE(v_available, 0) < v_need.need_qty THEN
      RAISE EXCEPTION 'insufficient_stock_at_posting:%', v_need.ingredient_id USING ERRCODE = 'P0001';
    END IF;

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
    VALUES (
      v_order.tenant_id,
      v_order.branch_id,
      v_need.ingredient_id,
      'consumption',
      'cancelled_after_kds_ready',
      -v_need.need_qty,
      'Cancelled order ' || p_order_id::text
        || ' waste: '
        || v_reason,
      v_actor,
      p_order_id,
      COALESCE(
        (
          SELECT sl.avg_unit_cost
          FROM public.stock_levels sl
          WHERE sl.tenant_id = v_order.tenant_id
            AND sl.branch_id = v_order.branch_id
            AND sl.location_id = v_location_id
            AND sl.ingredient_id = v_need.ingredient_id
          LIMIT 1
        ),
        0
      ),
      v_location_id,
      v_need.entry_unit_id,
      v_need.need_qty
    );

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_inserted := v_inserted + v_row_count;
  END LOOP;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'consumed', v_inserted > 0,
    'movements_created', v_inserted,
    'reason', v_reason
  );
END;
$_$;

COMMENT ON FUNCTION public.post_pos_cancelled_ready_waste(p_order_id bigint, p_actor_id uuid, p_reason text) IS
  'Posts waste for ready items on cancelled orders only when not already deducted as sale consumption upon KDS completion.';

DO $backfill_open_ready_orders$
DECLARE
  v_order record;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  FOR v_order IN
    SELECT DISTINCT o.id, o.created_by
    FROM public.orders o
    JOIN public.branches b ON b.id = o.branch_id
    JOIN public.order_items oi ON oi.order_id = o.id AND oi.tenant_id = o.tenant_id
    JOIN public.kds_tickets kt ON kt.order_item_id = oi.id AND kt.tenant_id = oi.tenant_id
    WHERE o.status <> 'cancelled'
      AND kt.first_ready_at IS NOT NULL
      AND kt.status <> 'cancelled'
      AND oi.status <> 'cancelled'
      AND b.branch_kind = 'branch'
    ORDER BY o.id
  LOOP
    PERFORM public.post_pos_sale_consumption_if_ready(
      v_order.id,
      v_order.created_by
    );
  END LOOP;
END
$backfill_open_ready_orders$;

