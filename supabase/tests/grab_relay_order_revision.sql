-- Contract SQL for Grab relay amend/cancel.
-- Do not apply from this path while supabase/migrations still has an
-- out-of-task pending file. Copy into a task-owned migration via
-- `node scripts/supabase-migration-new.mjs grab_relay_order_revision`
-- after that sibling is gone, then Preview-apply.

CREATE OR REPLACE FUNCTION public.relay_cancel_delivery_order(
  p_order_id bigint,
  p_actor_staff_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order record;
  v_actor record;
  v_code record;
  v_item_id bigint;
  v_print_res jsonb;
  v_waste_res jsonb;
  v_tickets_enqueued int := 0;
  v_tickets_skipped int := 0;
  v_skip_reasons text[] := ARRAY[]::text[];
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'reason too short' USING ERRCODE = '22023';
  END IF;

  SELECT id, tenant_id INTO v_actor
  FROM public.profiles
  WHERE id = p_actor_staff_id
    AND is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'actor not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM v_actor.tenant_id THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_order.delivery_platform IS DISTINCT FROM 'grab'
     OR v_order.order_type IS DISTINCT FROM 'delivery' THEN
    RAISE EXCEPTION 'order not a grab delivery' USING ERRCODE = '22023';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'idempotent', TRUE,
      'order_id', p_order_id,
      'status', 'cancelled'
    );
  END IF;

  IF v_order.status IN ('completed')
     OR coalesce(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'paid_or_terminal' USING ERRCODE = '22023';
  END IF;

  IF v_order.promotion_code_id IS NOT NULL THEN
    SELECT * INTO v_code FROM public.promotion_codes
    WHERE id = v_order.promotion_code_id FOR UPDATE;
    IF FOUND AND v_code.kind = 'unique' THEN
      UPDATE public.promotion_codes
      SET redeemed_count = GREATEST(redeemed_count - 1, 0), status = 'active'
      WHERE id = v_code.id;
    ELSIF FOUND THEN
      UPDATE public.promotion_codes
      SET redeemed_count = GREATEST(redeemed_count - 1, 0),
          status = CASE WHEN status = 'redeemed' THEN 'active' ELSE status END
      WHERE id = v_code.id;
    END IF;
  END IF;

  UPDATE public.promotion_redemptions
  SET status = 'cleared', cleared_at = now(), cleared_reason = 'Đơn bị hủy: ' || p_reason
  WHERE order_id = p_order_id AND status = 'applied';

  v_waste_res := public.post_pos_cancelled_ready_waste(p_order_id, p_actor_staff_id, p_reason);

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
    order_discount_amount = 0,
    item_discount_amount = 0,
    promotion_id = NULL,
    promotion_code_id = NULL,
    total_amount = 0 + COALESCE(service_charge, 0),
    updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_order.tenant_id, p_order_id, v_order.status, 'cancelled', p_actor_staff_id, p_reason
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
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE,
    'order_id', p_order_id,
    'status', 'cancelled',
    'cancel_tickets', v_tickets_enqueued,
    'cancel_skipped', v_tickets_skipped,
    'skip_reasons', to_jsonb(v_skip_reasons),
    'stock_outcome', COALESCE(v_waste_res, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.relay_apply_grab_order_revision(
  p_order_id bigint,
  p_actor_staff_id uuid,
  p_items jsonb,
  p_note text DEFAULT NULL,
  p_reason text DEFAULT 'Grab sửa đơn trên Merchant'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order record;
  v_actor record;
  v_incoming jsonb;
  v_current record;
  v_key text;
  v_qty int;
  v_matched_id bigint;
  v_item jsonb;
  v_base_price numeric(15,2);
  v_variant_adj numeric(15,2);
  v_modifier_sum numeric(15,2);
  v_sides_sum numeric(15,2);
  v_enriched_sides jsonb;
  v_unit_price numeric(15,2);
  v_item_subtotal numeric(15,2);
  v_menu_item_id bigint;
  v_variant_id bigint;
  v_quantity int;
  v_subtotal numeric(15,2);
  v_discount_amount numeric(15,2);
  v_item_discount numeric(15,2);
  v_total_amount numeric(15,2);
  v_changed boolean := FALSE;
  v_appended int := 0;
  v_voided int := 0;
  v_reduced int := 0;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'reason too short' USING ERRCODE = '22023';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'p_items must be a non-empty JSON array' USING ERRCODE = '22023';
  END IF;

  SELECT id, tenant_id INTO v_actor
  FROM public.profiles
  WHERE id = p_actor_staff_id
    AND is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'actor not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM v_actor.tenant_id THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_order.delivery_platform IS DISTINCT FROM 'grab'
     OR v_order.order_type IS DISTINCT FROM 'delivery' THEN
    RAISE EXCEPTION 'order not a grab delivery' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IN ('completed', 'cancelled')
     OR coalesce(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'paid_or_terminal' USING ERRCODE = '22023';
  END IF;

  DROP TABLE IF EXISTS grab_revision_current;
  CREATE TEMP TABLE grab_revision_current (
    item_id bigint PRIMARY KEY,
    match_key text NOT NULL,
    quantity int NOT NULL,
    unit_price numeric(15,2) NOT NULL,
    status text NOT NULL,
    sent_to_kitchen boolean NOT NULL,
    matched boolean NOT NULL DEFAULT FALSE
  ) ON COMMIT DROP;

  INSERT INTO grab_revision_current (item_id, match_key, quantity, unit_price, status, sent_to_kitchen)
  SELECT
    oi.id,
    md5(
      coalesce(oi.menu_item_id::text, '') || '|' ||
      coalesce(oi.variant_id::text, '') || '|' ||
      coalesce(oi.note, '') || '|' ||
      coalesce(oi.sides::text, '[]')
    ),
    oi.quantity,
    oi.unit_price,
    oi.status,
    oi.sent_to_kitchen_at IS NOT NULL
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.status <> 'cancelled';

  FOR v_incoming IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_key := md5(
      coalesce(v_incoming->>'menu_item_id', '') || '|' ||
      coalesce(v_incoming->>'variant_id', '') || '|' ||
      coalesce(v_incoming->>'note', '') || '|' ||
      coalesce((v_incoming->'sides')::text, '[]')
    );
    v_qty := coalesce((v_incoming->>'quantity')::int, 0);
    IF v_qty < 1 THEN
      RAISE EXCEPTION 'invalid quantity' USING ERRCODE = '22023';
    END IF;

    SELECT item_id INTO v_matched_id
    FROM grab_revision_current
    WHERE match_key = v_key
      AND matched = FALSE
    ORDER BY item_id
    LIMIT 1;

    IF v_matched_id IS NULL THEN
      v_menu_item_id := (v_incoming->>'menu_item_id')::bigint;
      v_variant_id := NULLIF(v_incoming->>'variant_id', '')::bigint;
      v_quantity := v_qty;
      v_base_price := public.pos_resolve_item_list_price(
        v_order.tenant_id,
        v_menu_item_id,
        v_order.order_type,
        v_order.delivery_platform
      );
      v_variant_adj := 0;
      IF v_variant_id IS NOT NULL THEN
        SELECT price_adjustment INTO v_variant_adj
        FROM public.menu_item_variants
        WHERE id = v_variant_id
          AND item_id = v_menu_item_id
          AND tenant_id = v_order.tenant_id
          AND is_active = TRUE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Variant % not found or inactive', v_variant_id USING ERRCODE = 'P0002';
        END IF;
      END IF;
      v_modifier_sum := public.pos_order_modifier_sum(
        v_order.tenant_id,
        v_menu_item_id,
        COALESCE(v_incoming->'modifiers', '[]'::jsonb)
      );
      SELECT sides_sum, enriched_sides
      INTO v_sides_sum, v_enriched_sides
      FROM public.pos_enrich_order_sides(
        v_order.tenant_id,
        v_menu_item_id,
        COALESCE(v_incoming->'sides', '[]'::jsonb),
        v_order.order_type,
        v_order.delivery_platform
      );
      v_unit_price := v_base_price + v_variant_adj + v_modifier_sum + COALESCE(v_sides_sum, 0);
      v_item_subtotal := v_unit_price * v_quantity;
      INSERT INTO public.order_items (
        tenant_id, order_id, menu_item_id, variant_id,
        item_name, variant_name, quantity, unit_price,
        modifiers, sides, subtotal, note, status,
        discount_type, discount_value, discount_note
      )
      VALUES (
        v_order.tenant_id, p_order_id, v_menu_item_id, v_variant_id,
        COALESCE(v_incoming->>'item_name', 'Mon'),
        v_incoming->>'variant_name',
        v_quantity, v_unit_price,
        COALESCE(v_incoming->'modifiers', '[]'::jsonb),
        COALESCE(v_enriched_sides, '[]'::jsonb),
        v_item_subtotal, v_incoming->>'note', 'pending',
        NULLIF(v_incoming->>'discount_type', ''),
        CASE WHEN NULLIF(v_incoming->>'discount_value', '') IS NOT NULL
             THEN (v_incoming->>'discount_value')::numeric
             ELSE NULL END,
        NULLIF(trim(COALESCE(v_incoming->>'discount_note', '')), '')
      );
      v_appended := v_appended + 1;
      v_changed := TRUE;
    ELSE
      UPDATE grab_revision_current SET matched = TRUE WHERE item_id = v_matched_id;
      SELECT * INTO v_current FROM grab_revision_current WHERE item_id = v_matched_id;
      IF v_current.quantity IS DISTINCT FROM v_qty THEN
        IF v_current.status = 'served' THEN
          RAISE EXCEPTION 'order not amendable' USING ERRCODE = '22023';
        END IF;
        IF v_qty > v_current.quantity THEN
          UPDATE public.order_items
          SET quantity = v_qty,
              subtotal = unit_price * v_qty,
              updated_at = now()
          WHERE id = v_matched_id;
        ELSE
          UPDATE public.order_items
          SET quantity = v_qty,
              subtotal = unit_price * v_qty,
              updated_at = now()
          WHERE id = v_matched_id;
          v_reduced := v_reduced + 1;
          IF v_current.sent_to_kitchen THEN
            PERFORM public.enqueue_cancel_ticket_print(v_matched_id, p_reason);
          END IF;
        END IF;
        UPDATE public.kds_tickets
        SET updated_at = now()
        WHERE order_item_id = v_matched_id
          AND tenant_id = v_order.tenant_id
          AND status NOT IN ('served', 'cancelled');
        v_changed := TRUE;
      END IF;
    END IF;
  END LOOP;

  FOR v_current IN
    SELECT * FROM grab_revision_current WHERE matched = FALSE
  LOOP
    IF v_current.status = 'served' THEN
      RAISE EXCEPTION 'order not amendable' USING ERRCODE = '22023';
    END IF;
    UPDATE public.order_items
    SET status = 'cancelled',
        cancel_reason = p_reason,
        updated_at = now()
    WHERE id = v_current.item_id;
    UPDATE public.kds_tickets
    SET status = 'cancelled', updated_at = now()
    WHERE order_item_id = v_current.item_id AND tenant_id = v_order.tenant_id;
    IF v_current.sent_to_kitchen THEN
      PERFORM public.enqueue_cancel_ticket_print(v_current.item_id, p_reason);
    END IF;
    v_voided := v_voided + 1;
    v_changed := TRUE;
  END LOOP;

  IF NOT v_changed THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'idempotent', TRUE,
      'order_id', p_order_id
    );
  END IF;

  SELECT COALESCE(SUM(subtotal), 0),
         COALESCE(SUM(CASE WHEN discount_type = 'vnd' THEN COALESCE(discount_value, 0) ELSE 0 END), 0)
  INTO v_subtotal, v_item_discount
  FROM public.order_items
  WHERE order_id = p_order_id AND status <> 'cancelled';

  v_discount_amount := public.compute_discount_amount(
    v_order.discount_type, v_order.discount_value, v_subtotal
  );
  v_total_amount := v_subtotal
    + COALESCE(v_order.service_charge, 0)
    - v_discount_amount
    - v_item_discount;

  UPDATE public.orders
  SET
    note = COALESCE(p_note, note),
    subtotal = v_subtotal,
    item_discount_amount = v_item_discount,
    discount_amount = v_discount_amount,
    total_amount = GREATEST(v_total_amount, 0),
    updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_order.tenant_id, p_order_id, v_order.status, v_order.status, p_actor_staff_id, p_reason
  );

  PERFORM public.route_order_to_kds(p_order_id);

  RETURN jsonb_build_object(
    'success', TRUE,
    'order_id', p_order_id,
    'appended', v_appended,
    'voided', v_voided,
    'reduced', v_reduced,
    'subtotal', v_subtotal,
    'total_amount', GREATEST(v_total_amount, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.relay_cancel_delivery_order(bigint, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.relay_cancel_delivery_order(bigint, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.relay_apply_grab_order_revision(bigint, uuid, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.relay_apply_grab_order_revision(bigint, uuid, jsonb, text, text) TO service_role;
