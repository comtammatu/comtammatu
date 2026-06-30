ALTER TABLE public.kds_tickets
  ADD COLUMN IF NOT EXISTS first_ready_at timestamptz;

UPDATE public.kds_tickets
SET first_ready_at = COALESCE(first_ready_at, bumped_at, updated_at)
WHERE status IN ('ready', 'served')
  AND first_ready_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_kds_tickets_order_first_ready
  ON public.kds_tickets (tenant_id, order_id, first_ready_at)
  WHERE first_ready_at IS NOT NULL;

ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_movement_subtype_check;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_movement_subtype_check
  CHECK (
    movement_subtype IS NULL
    OR movement_subtype = ANY (
      ARRAY[
        'storage_loss'::text,
        'sale_consumption'::text,
        'cancelled_after_kds_ready'::text,
        'writeoff'::text,
        'other'::text
      ]
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_movements_pos_outcome_idempotency
  ON public.stock_movements (
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
    );

CREATE OR REPLACE FUNCTION public.inv_to_base_for_tenant(
  p_tenant_id bigint,
  p_ingredient_id bigint,
  p_unit_id bigint,
  p_qty numeric
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_factor numeric;
BEGIN
  IF p_qty IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_required' USING ERRCODE = '22023';
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role'
     AND p_tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_unit_id IS NULL THEN
    RETURN p_qty;
  END IF;

  SELECT iu.to_base_factor
  INTO v_factor
  FROM public.ingredient_units iu
  WHERE iu.tenant_id = p_tenant_id
    AND iu.ingredient_id = p_ingredient_id
    AND iu.unit_id = p_unit_id
    AND iu.is_active = TRUE;

  IF v_factor IS NULL THEN
    RAISE EXCEPTION 'recipe_unit_conversion_missing:%', p_ingredient_id USING ERRCODE = '23503';
  END IF;

  RETURN p_qty * v_factor;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_pos_sale_consumption_if_ready(
  p_order_id bigint,
  p_actor_id uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
      AND sm.movement_subtype = 'sale_consumption'
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
    SELECT
      r.ingredient_id,
      ROUND(SUM(public.inv_to_base_for_tenant(
        v_order.tenant_id,
        r.ingredient_id,
        r.entry_unit_id,
        oi.quantity::numeric * r.quantity / r.yield_factor
      )), 3)::numeric(15,3) AS need_qty
    FROM public.order_items oi
    JOIN public.recipes r
      ON r.menu_item_id = oi.menu_item_id
     AND r.tenant_id = oi.tenant_id
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
    GROUP BY r.ingredient_id
    HAVING ROUND(SUM(public.inv_to_base_for_tenant(
      v_order.tenant_id,
      r.ingredient_id,
      r.entry_unit_id,
      oi.quantity::numeric * r.quantity / r.yield_factor
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

  FOR v_need IN
    SELECT
      r.ingredient_id,
      ROUND(SUM(public.inv_to_base_for_tenant(
        v_order.tenant_id,
        r.ingredient_id,
        r.entry_unit_id,
        oi.quantity::numeric * r.quantity / r.yield_factor
      )), 3)::numeric(15,3) AS need_qty
    FROM public.order_items oi
    JOIN public.recipes r
      ON r.menu_item_id = oi.menu_item_id
     AND r.tenant_id = oi.tenant_id
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
    GROUP BY r.ingredient_id
    HAVING ROUND(SUM(public.inv_to_base_for_tenant(
      v_order.tenant_id,
      r.ingredient_id,
      r.entry_unit_id,
      oi.quantity::numeric * r.quantity / r.yield_factor
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
$$;

CREATE OR REPLACE FUNCTION public.post_pos_cancelled_ready_waste(
  p_order_id bigint,
  p_actor_id uuid DEFAULT NULL::uuid,
  p_reason text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
    SELECT
      r.ingredient_id,
      ROUND(SUM(public.inv_to_base_for_tenant(
        v_order.tenant_id,
        r.ingredient_id,
        r.entry_unit_id,
        oi.quantity::numeric * r.quantity / r.yield_factor
      )), 3)::numeric(15,3) AS need_qty
    FROM public.order_items oi
    JOIN public.recipes r
      ON r.menu_item_id = oi.menu_item_id
     AND r.tenant_id = oi.tenant_id
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
    GROUP BY r.ingredient_id
    HAVING ROUND(SUM(public.inv_to_base_for_tenant(
      v_order.tenant_id,
      r.ingredient_id,
      r.entry_unit_id,
      oi.quantity::numeric * r.quantity / r.yield_factor
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

  FOR v_need IN
    SELECT
      r.ingredient_id,
      ROUND(SUM(public.inv_to_base_for_tenant(
        v_order.tenant_id,
        r.ingredient_id,
        r.entry_unit_id,
        oi.quantity::numeric * r.quantity / r.yield_factor
      )), 3)::numeric(15,3) AS need_qty
    FROM public.order_items oi
    JOIN public.recipes r
      ON r.menu_item_id = oi.menu_item_id
     AND r.tenant_id = oi.tenant_id
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
    GROUP BY r.ingredient_id
    HAVING ROUND(SUM(public.inv_to_base_for_tenant(
      v_order.tenant_id,
      r.ingredient_id,
      r.entry_unit_id,
      oi.quantity::numeric * r.quantity / r.yield_factor
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
      'cancelled_after_kds_ready',
      -v_need.need_qty,
      'Order ' || p_order_id::text || ' cancelled after KDS ready: ' || v_reason,
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
$$;

CREATE OR REPLACE FUNCTION public.finalize_paid_order(
  p_order_id bigint,
  p_actor_id uuid DEFAULT NULL::uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_order record;
  v_actor uuid := COALESCE(p_actor_id, auth.uid());
BEGIN
  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT o.id, o.tenant_id, o.status, o.created_by
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_actor := COALESCE(v_actor, v_order.created_by);

  IF v_order.status = 'cancelled' THEN
    RETURN;
  END IF;

  IF v_order.status = 'completed' THEN
    PERFORM public.post_pos_sale_consumption_if_ready(p_order_id, v_actor);
    RETURN;
  END IF;

  UPDATE public.orders
  SET status = 'completed',
      updated_at = now()
  WHERE id = p_order_id;

  IF v_actor IS NOT NULL THEN
    INSERT INTO public.order_status_history (
      tenant_id, order_id, from_status, to_status, changed_by, note
    )
    VALUES (
      v_order.tenant_id,
      p_order_id,
      v_order.status,
      'completed',
      v_actor,
      'auto_complete_on_payment'
    );
  END IF;

  PERFORM public.post_pos_sale_consumption_if_ready(p_order_id, v_actor);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_payment_and_consume_stock(
  p_payment_id bigint,
  p_expected_amount numeric DEFAULT NULL::numeric,
  p_provider_data jsonb DEFAULT NULL::jsonb,
  p_actor_id uuid DEFAULT NULL::uuid
) RETURNS TABLE(status text, payment_id bigint, order_id bigint, stock_consumed boolean, detail text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_payment record;
  v_order record;
  v_order_id bigint;
  v_line_subtotal numeric(15,2) := 0;
  v_recomputed_total numeric(15,2) := 0;
  v_stock_outcome jsonb := jsonb_build_object('consumed', false, 'reason', 'not_attempted');
BEGIN
  SELECT p.order_id
  INTO v_order_id
  FROM public.payments p
  WHERE p.id = p_payment_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'not_found'::text, p_payment_id, NULL::bigint, false,
      ('payment ' || p_payment_id || ' does not exist')::text;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(v_order_id);

  SELECT p.id, p.order_id, p.tenant_id, p.branch_id, p.amount, p.status
  INTO v_payment
  FROM public.payments p
  WHERE p.id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'not_found'::text, p_payment_id, NULL::bigint, false,
      ('payment ' || p_payment_id || ' does not exist')::text;
    RETURN;
  END IF;

  IF v_payment.status = 'completed' THEN
    RETURN QUERY SELECT
      'already_completed'::text, v_payment.id, v_payment.order_id, false,
      'payment was previously completed; no-op'::text;
    RETURN;
  END IF;

  IF v_payment.status <> 'pending' THEN
    RETURN QUERY SELECT
      'failed'::text, v_payment.id, v_payment.order_id, false,
      ('payment status=' || v_payment.status || ' cannot transition to completed')::text;
    RETURN;
  END IF;

  SELECT o.id, o.tenant_id, o.branch_id, o.tax_amount, o.service_charge,
         o.discount_amount, o.total_amount
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_payment.order_id
    AND o.tenant_id = v_payment.tenant_id
    AND o.branch_id = v_payment.branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'failed'::text, v_payment.id, v_payment.order_id, false,
      'order_not_found'::text;
    RETURN;
  END IF;

  SELECT COALESCE(SUM(oi.quantity::numeric * oi.unit_price), 0)::numeric(15,2)
  INTO v_line_subtotal
  FROM public.order_items oi
  WHERE oi.order_id = v_order.id
    AND oi.tenant_id = v_order.tenant_id
    AND oi.status <> 'cancelled';

  v_recomputed_total := ROUND(
    v_line_subtotal
    + COALESCE(v_order.tax_amount, 0)
    + COALESCE(v_order.service_charge, 0)
    - COALESCE(v_order.discount_amount, 0),
    2
  );

  IF ABS(v_payment.amount - v_recomputed_total) > 1 THEN
    UPDATE public.payments
       SET status = 'failed',
           provider_data = COALESCE(p_provider_data, provider_data),
           updated_at = now()
     WHERE id = v_payment.id;

    RETURN QUERY SELECT
      'amount_mismatch_recomputed'::text, v_payment.id, v_payment.order_id, false,
      ('stored=' || v_payment.amount || ' recomputed=' || v_recomputed_total)::text;
    RETURN;
  END IF;

  IF p_expected_amount IS NOT NULL AND ABS(p_expected_amount - v_recomputed_total) > 1 THEN
    UPDATE public.payments
       SET status = 'failed',
           provider_data = COALESCE(p_provider_data, provider_data),
           updated_at = now()
     WHERE id = v_payment.id;

    RETURN QUERY SELECT
      'amount_mismatch_recomputed'::text, v_payment.id, v_payment.order_id, false,
      ('expected=' || p_expected_amount || ' recomputed=' || v_recomputed_total)::text;
    RETURN;
  END IF;

  UPDATE public.payments
     SET status = 'completed',
         paid_at = COALESCE(paid_at, now()),
         provider_data = COALESCE(p_provider_data, provider_data),
         updated_at = now()
   WHERE id = v_payment.id;

  UPDATE public.orders
     SET payment_status = 'paid',
         updated_at = now()
   WHERE id = v_payment.order_id
     AND tenant_id = v_payment.tenant_id;

  PERFORM public.finalize_paid_order(v_payment.order_id, p_actor_id);
  v_stock_outcome := public.post_pos_sale_consumption_if_ready(v_payment.order_id, p_actor_id);

  RETURN QUERY SELECT
    'completed'::text,
    v_payment.id,
    v_payment.order_id,
    COALESCE((v_stock_outcome->>'consumed')::boolean, false),
    ('stock=' || COALESCE(v_stock_outcome->>'reason', 'posted'))::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_order(
  p_order_id bigint,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_prof_tenant bigint;
  v_prof_branch bigint;
  v_prof_role text;
  v_order record;
  v_item_id bigint;
  v_print_res jsonb;
  v_waste_res jsonb;
  v_tickets_enqueued int := 0;
  v_tickets_skipped int := 0;
  v_skip_reasons text[] := ARRAY[]::text[];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'office')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN ('branch_manager', 'cashier') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 1 THEN
    RAISE EXCEPTION 'reason required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT id, tenant_id, branch_id, status, table_id, order_type,
         service_charge, discount_type, discount_value
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_branch IS NULL OR v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'pos:void_order') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  v_waste_res := public.post_pos_cancelled_ready_waste(p_order_id, v_uid, p_reason);

  UPDATE public.order_items
  SET status = 'cancelled',
      cancel_reason = p_reason,
      updated_at = now()
  WHERE order_id = p_order_id AND status <> 'cancelled';

  UPDATE public.kds_tickets
  SET status = 'cancelled', updated_at = now()
  WHERE order_id = p_order_id AND tenant_id = v_order.tenant_id;

  UPDATE public.orders
  SET
    status = 'cancelled',
    subtotal = 0,
    discount_type = NULL,
    discount_value = NULL,
    discount_note = NULL,
    discount_amount = 0,
    total_amount = 0 + COALESCE(service_charge, 0),
    updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_order.tenant_id, p_order_id, v_order.status, 'cancelled', v_uid, p_reason
  );

  FOR v_item_id IN
    SELECT id FROM public.order_items
    WHERE order_id = p_order_id
      AND sent_to_kitchen_at IS NOT NULL
    ORDER BY id
  LOOP
    BEGIN
      v_print_res := public.enqueue_cancel_ticket_print(v_item_id, p_reason);
      IF (v_print_res ? 'skipped') AND (v_print_res->>'skipped')::boolean THEN
        v_tickets_skipped := v_tickets_skipped + 1;
        v_skip_reasons := v_skip_reasons || COALESCE(v_print_res->>'reason', 'unknown');
      ELSE
        v_tickets_enqueued := v_tickets_enqueued + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_tickets_skipped := v_tickets_skipped + 1;
      v_skip_reasons := v_skip_reasons || ('error:' || SQLERRM);
      RAISE NOTICE '[cancel_order] cancel-ticket enqueue raised for item %: %',
        v_item_id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'status', 'cancelled',
    'cancel_tickets', v_tickets_enqueued,
    'cancel_skipped', v_tickets_skipped,
    'skip_reasons', to_jsonb(v_skip_reasons),
    'stock_outcome', COALESCE(v_waste_res, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bump_kds_ticket(p_ticket_id bigint) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ticket record;
  v_order_id bigint;
  v_new_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('kds:mark_ready') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT kt.order_id
  INTO v_order_id
  FROM public.kds_tickets kt
  WHERE kt.id = p_ticket_id
    AND kt.tenant_id = public.auth_tenant_id()
    AND (public.auth_role() = 'owner' OR kt.branch_id = public.auth_branch_id());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(v_order_id);

  SELECT id, tenant_id, branch_id, station_id, order_id, status
  INTO v_ticket
  FROM public.kds_tickets
  WHERE id = p_ticket_id
    AND tenant_id = public.auth_tenant_id()
    AND (public.auth_role() = 'owner' OR branch_id = public.auth_branch_id())
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_ticket.status = 'pending' THEN
    v_new_status := 'preparing';
  ELSIF v_ticket.status = 'preparing' THEN
    v_new_status := 'ready';
  ELSE
    RAISE EXCEPTION 'Ticket cannot be bumped from status %', v_ticket.status
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.kds_tickets
  SET status = v_new_status,
      bumped_at = now(),
      bumped_by = auth.uid(),
      first_ready_at = CASE
        WHEN v_new_status = 'ready' THEN COALESCE(first_ready_at, now())
        ELSE first_ready_at
      END,
      updated_at = now()
  WHERE id = p_ticket_id;

  IF v_new_status = 'ready' THEN
    PERFORM public.check_order_ready(v_ticket.order_id);
    PERFORM public.post_pos_sale_consumption_if_ready(v_ticket.order_id, auth.uid());
  END IF;

  RETURN v_new_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_kds_tickets(
  p_branch_id bigint,
  p_ticket_ids bigint[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ticket_ids bigint[] := ARRAY[]::bigint[];
  v_updated_ticket_ids bigint[] := ARRAY[]::bigint[];
  v_order_ids bigint[] := ARRAY[]::bigint[];
  v_requested_count int := 0;
  v_locked_count int := 0;
  v_completed_count int := 0;
  v_group_count int := 0;
  v_order_id bigint;
  v_print_result jsonb := jsonb_build_object(
    'jobs', '[]'::jsonb,
    'requested_ticket_count', 0,
    'printed_ticket_count', 0,
    'skipped_ticket_count', 0
  );
  v_print_warning text := NULL;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_branch_id IS NULL OR p_branch_id <= 0 THEN
    RAISE EXCEPTION 'invalid_branch' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_permission_any('kds:mark_ready') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT ticket_id), ARRAY[]::bigint[])
  INTO v_ticket_ids
  FROM unnest(COALESCE(p_ticket_ids, ARRAY[]::bigint[])) AS input(ticket_id)
  WHERE ticket_id IS NOT NULL AND ticket_id > 0;

  v_requested_count := COALESCE(array_length(v_ticket_ids, 1), 0);

  IF v_requested_count = 0 THEN
    RAISE EXCEPTION 'no_tickets' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT kt.order_id ORDER BY kt.order_id), ARRAY[]::bigint[])
  INTO v_order_ids
  FROM public.kds_tickets kt
  WHERE kt.id = ANY(v_ticket_ids)
    AND kt.tenant_id = public.auth_tenant_id()
    AND kt.branch_id = p_branch_id
    AND (public.auth_role() = 'owner' OR kt.branch_id = public.auth_branch_id());

  FOREACH v_order_id IN ARRAY v_order_ids LOOP
    PERFORM pg_advisory_xact_lock(v_order_id);
  END LOOP;

  WITH locked AS (
    SELECT kt.id
    FROM public.kds_tickets kt
    WHERE kt.id = ANY(v_ticket_ids)
      AND kt.tenant_id = public.auth_tenant_id()
      AND kt.branch_id = p_branch_id
      AND (public.auth_role() = 'owner' OR kt.branch_id = public.auth_branch_id())
    FOR UPDATE
  )
  SELECT COUNT(*) INTO v_locked_count
  FROM locked;

  IF v_locked_count <> v_requested_count THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COUNT(DISTINCT COALESCE(
    'batch:' || kt.kitchen_send_batch_id::text,
    'order:' || kt.order_id::text
  ))
  INTO v_group_count
  FROM public.kds_tickets kt
  WHERE kt.id = ANY(v_ticket_ids)
    AND kt.tenant_id = public.auth_tenant_id()
    AND kt.branch_id = p_branch_id;

  IF v_group_count <> 1 THEN
    RAISE EXCEPTION 'mixed_kds_card' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT kt.order_id), ARRAY[]::bigint[])
  INTO v_order_ids
  FROM public.kds_tickets kt
  WHERE kt.id = ANY(v_ticket_ids)
    AND kt.tenant_id = public.auth_tenant_id()
    AND kt.branch_id = p_branch_id;

  WITH updated AS (
    UPDATE public.kds_tickets kt
    SET status = 'ready',
        bumped_at = now(),
        bumped_by = v_uid,
        first_ready_at = COALESCE(first_ready_at, now()),
        updated_at = now()
    WHERE kt.id = ANY(v_ticket_ids)
      AND kt.tenant_id = public.auth_tenant_id()
      AND kt.branch_id = p_branch_id
      AND kt.status IN ('pending', 'preparing')
    RETURNING kt.id
  )
  SELECT
    COALESCE(array_agg(id), ARRAY[]::bigint[]),
    COUNT(*)
  INTO v_updated_ticket_ids, v_completed_count
  FROM updated;

  IF v_completed_count > 0 THEN
    BEGIN
      v_print_result := private.enqueue_kitchen_completion_print_internal(
        p_branch_id,
        v_updated_ticket_ids,
        v_uid
      );

      IF COALESCE((v_print_result->>'skipped_ticket_count')::int, 0) > 0 THEN
        v_print_warning := 'kitchen_print_skipped';
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        v_print_warning := 'kitchen_print_enqueue_failed';
        v_print_result := jsonb_build_object(
          'jobs', '[]'::jsonb,
          'requested_ticket_count', v_completed_count,
          'printed_ticket_count', 0,
          'skipped_ticket_count', v_completed_count
        );
        RAISE LOG 'complete_kds_tickets print enqueue skipped branch_id=%, ticket_ids=%, sqlstate=%, error=%',
          p_branch_id,
          v_updated_ticket_ids,
          SQLSTATE,
          SQLERRM;
    END;
  END IF;

  FOREACH v_order_id IN ARRAY v_order_ids LOOP
    PERFORM public.check_order_ready(v_order_id);
    PERFORM public.post_pos_sale_consumption_if_ready(v_order_id, v_uid);
  END LOOP;

  RETURN jsonb_build_object(
    'requested_count', v_requested_count,
    'completed_count', v_completed_count,
    'print_jobs', COALESCE(v_print_result->'jobs', '[]'::jsonb),
    'printed_ticket_count', COALESCE((v_print_result->>'printed_ticket_count')::int, 0),
    'skipped_ticket_count', COALESCE((v_print_result->>'skipped_ticket_count')::int, 0),
    'print_warning', v_print_warning
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.recall_kds_ticket(p_ticket_id bigint) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ticket record;
  v_new_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('kds:recall') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT id, tenant_id, branch_id, status
  INTO v_ticket
  FROM public.kds_tickets
  WHERE id = p_ticket_id
    AND tenant_id = public.auth_tenant_id()
    AND (public.auth_role() = 'owner' OR branch_id = public.auth_branch_id())
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_ticket.status = 'ready' THEN
    v_new_status := 'preparing';
  ELSIF v_ticket.status = 'preparing' THEN
    v_new_status := 'pending';
  ELSE
    RAISE EXCEPTION 'Ticket cannot be recalled from status %', v_ticket.status
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.kds_tickets
  SET status = v_new_status,
      bumped_at = NULL,
      bumped_by = NULL,
      updated_at = now()
  WHERE id = p_ticket_id;

  RETURN v_new_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_order_item_served(p_item_id bigint) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_prof_tenant bigint;
  v_prof_branch bigint;
  v_prof_role text;
  v_order_id bigint;
  v_item record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'office')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  SELECT oi.order_id
  INTO v_order_id
  FROM public.order_items oi
  WHERE oi.id = p_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(v_order_id);

  SELECT
    oi.id,
    oi.order_id,
    oi.tenant_id,
    oi.status AS item_status,
    o.branch_id,
    o.status AS order_status
  INTO v_item
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = p_item_id
  FOR UPDATE OF oi;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_item.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role <> 'owner' THEN
    IF v_prof_branch IS NULL THEN
      RAISE EXCEPTION 'branch scope required' USING ERRCODE = '42501';
    END IF;
    IF v_item.branch_id <> v_prof_branch THEN
      RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT public.has_permission(v_item.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'forbidden: missing pos:use' USING ERRCODE = '42501';
  END IF;

  IF v_item.order_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF v_item.item_status NOT IN ('pending', 'preparing', 'ready') THEN
    RAISE EXCEPTION 'invalid item transition to served' USING ERRCODE = '22023';
  END IF;

  UPDATE public.order_items
  SET status = 'served',
      updated_at = now()
  WHERE id = p_item_id;

  UPDATE public.kds_tickets
  SET status = 'served',
      bumped_at = COALESCE(bumped_at, now()),
      bumped_by = COALESCE(bumped_by, v_uid),
      first_ready_at = COALESCE(first_ready_at, now()),
      updated_at = now()
  WHERE order_item_id = p_item_id
    AND tenant_id = v_item.tenant_id
    AND status <> 'cancelled';

  PERFORM public.post_pos_sale_consumption_if_ready(v_item.order_id, v_uid);

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_item.tenant_id, v_item.order_id, v_item.order_status, v_item.order_status,
    v_uid, 'mark_item_served ' || p_item_id::text
  );

  RETURN jsonb_build_object(
    'item_id', p_item_id,
    'order_id', v_item.order_id,
    'status', 'served'
  );
END;
$$;

COMMENT ON FUNCTION public.complete_payment_and_consume_stock(bigint, numeric, jsonb, uuid) IS
  'Marks a pending payment completed, marks the order paid, and posts POS stock outcome when pos_stock_outcome_posting is enabled and KDS readiness is complete.';

COMMENT ON FUNCTION public.finalize_paid_order(bigint, uuid) IS
  'Marks order completed after payment. If stock-outcome posting is enabled, sale consumption posts only after KDS first_ready_at proves the kitchen made the order.';

COMMENT ON FUNCTION public.post_pos_sale_consumption_if_ready(bigint, uuid) IS
  'Internal POS stock outcome helper: posts sale_consumption once an order is paid, completed, and all active KDS tickets have first_ready_at.';

COMMENT ON FUNCTION public.post_pos_cancelled_ready_waste(bigint, uuid, text) IS
  'Internal POS stock outcome helper: posts cancelled_after_kds_ready for ready KDS lines before an active order is cancelled.';

COMMENT ON FUNCTION public.inv_to_base_for_tenant(bigint, bigint, bigint, numeric) IS
  'Tenant-explicit unit conversion for SECURITY DEFINER and service-role stock posting paths.';

REVOKE ALL ON FUNCTION public.inv_to_base_for_tenant(bigint, bigint, bigint, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inv_to_base_for_tenant(bigint, bigint, bigint, numeric)
  TO service_role;

REVOKE ALL ON FUNCTION public.complete_payment_and_consume_stock(bigint, numeric, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_payment_and_consume_stock(bigint, numeric, jsonb, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.finalize_paid_order(bigint, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_paid_order(bigint, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.post_pos_sale_consumption_if_ready(bigint, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_pos_sale_consumption_if_ready(bigint, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.post_pos_cancelled_ready_waste(bigint, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_pos_cancelled_ready_waste(bigint, uuid, text)
  TO service_role;
