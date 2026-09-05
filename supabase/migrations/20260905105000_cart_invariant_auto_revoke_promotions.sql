-- Migration: cart_invariant_auto_revoke_promotions
-- 1. apply_gift_promotion_selection: fix column name notes -> note
-- 2. void_order_item: auto-revoke promotion if subtotal < min_subtotal / conditions violated
-- 3. reduce_order_item_quantity: auto-revoke promotion if subtotal < min_subtotal
-- 4. edit_pending_order_item: auto-revoke promotion if subtotal < min_subtotal

-- 1. apply_gift_promotion_selection
CREATE OR REPLACE FUNCTION public.apply_gift_promotion_selection(
  p_order_id bigint,
  p_promotion_id bigint,
  p_code text,
  p_menu_item_id bigint,
  p_units integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_prof_tenant bigint;
  v_order public.orders;
  v_promo public.promotions;
  v_menu_item public.menu_items;
  v_quota integer;
  v_new_item_id bigint;
  v_selections jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  SELECT p.tenant_id INTO v_prof_tenant FROM public.profiles p WHERE p.id = v_uid;

  PERFORM pg_advisory_xact_lock(p_order_id);
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(v_order.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM public.promotion_assert_order_mutable(v_order);
  IF v_order.promotion_id IS NOT NULL THEN
    RAISE EXCEPTION 'promotion_already_applied' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_promo
  FROM public.promotions
  WHERE id = p_promotion_id AND tenant_id = v_order.tenant_id;
  IF NOT FOUND OR v_promo.kind IS DISTINCT FROM 'free_item' THEN
    RAISE EXCEPTION 'promotion_not_eligible' USING ERRCODE = '22023';
  END IF;

  -- Validate menu item is marked as 'get' for this campaign
  IF NOT EXISTS (
    SELECT 1 FROM public.promotion_items pi
    WHERE pi.promotion_id = v_promo.id
      AND pi.menu_item_id = p_menu_item_id
      AND pi.item_role = 'get'
  ) THEN
    RAISE EXCEPTION 'promotion_item_selection_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_menu_item
  FROM public.menu_items
  WHERE id = p_menu_item_id AND tenant_id = v_order.tenant_id;
  IF NOT FOUND OR v_menu_item.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'menu_item_not_available' USING ERRCODE = '22023';
  END IF;

  v_quota := COALESCE(v_promo.free_item_qty, 1);
  IF p_units < 1 OR p_units > v_quota THEN
    RAISE EXCEPTION 'promotion_item_selection_qty' USING ERRCODE = '22023';
  END IF;

  -- Insert the gift item into order_items (fixed: note column)
  INSERT INTO public.order_items (
    tenant_id,
    order_id,
    menu_item_id,
    item_name,
    quantity,
    unit_price,
    subtotal,
    status,
    note,
    modifiers,
    sides,
    created_at,
    updated_at
  ) VALUES (
    v_order.tenant_id,
    v_order.id,
    v_menu_item.id,
    v_menu_item.name,
    p_units,
    v_menu_item.price,
    v_menu_item.price * p_units,
    'pending',
    '[TẶNG] ' || v_promo.name,
    '[]'::jsonb,
    '[]'::jsonb,
    now(),
    now()
  ) RETURNING id INTO v_new_item_id;

  -- Re-read order totals updated by triggers
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;

  v_selections := jsonb_build_array(
    jsonb_build_object(
      'order_item_id', v_new_item_id,
      'units', p_units
    )
  );

  RETURN public.apply_free_item_selection(p_order_id, p_promotion_id, p_code, v_selections);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_gift_promotion_selection(bigint, bigint, text, bigint, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_gift_promotion_selection(bigint, bigint, text, bigint, integer) TO authenticated, service_role;


-- 2. void_order_item: auto-revoke promotion when order is no longer eligible
CREATE OR REPLACE FUNCTION public.void_order_item(p_order_item_id bigint, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid             UUID;
  v_prof_tenant     BIGINT;
  v_prof_branch     BIGINT;
  v_prof_role       TEXT;
  v_item            RECORD;
  v_order           RECORD;
  v_code            RECORD;
  v_promo           RECORD;
  v_base            NUMERIC(15,2);
  v_subtotal        NUMERIC(15,2);
  v_discount_amount NUMERIC(15,2);
  v_all_cancelled   BOOLEAN;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'unassigned')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  -- Owner + floor money roles only. Waiter maps to branch_staff.
  IF v_prof_role IS NULL OR v_prof_role NOT IN ('owner', 'branch_manager', 'cashier', 'branch_staff') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 1 THEN
    RAISE EXCEPTION 'reason required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(v_item.order_id);

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role <> 'owner' THEN
    IF v_prof_branch IS NULL THEN
      RAISE EXCEPTION 'branch scope required' USING ERRCODE = '42501';
    END IF;
    IF v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
      RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'pos:void_order') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_item.status IN ('served', 'cancelled') THEN
    RAISE EXCEPTION 'item not voidable' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  UPDATE public.order_items
  SET status = 'cancelled',
      cancel_reason = p_reason,
      updated_at = now()
  WHERE id = p_order_item_id;

  UPDATE public.kds_tickets
  SET status = 'cancelled', updated_at = now()
  WHERE order_item_id = p_order_item_id AND tenant_id = v_item.tenant_id;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal
  FROM public.order_items
  WHERE order_id = v_item.order_id AND status <> 'cancelled';

  SELECT NOT EXISTS (
    SELECT 1 FROM public.order_items WHERE order_id = v_item.order_id AND status <> 'cancelled'
  ) INTO v_all_cancelled;

  IF v_all_cancelled THEN
    -- Release voucher if present
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
    SET status = 'cleared', cleared_at = now(), cleared_reason = 'Hủy hết món trong đơn: ' || p_reason
    WHERE order_id = v_item.order_id AND status = 'applied';

    UPDATE public.orders
    SET
      status          = 'cancelled',
      subtotal        = 0,
      discount_type   = NULL,
      discount_value  = NULL,
      discount_note   = NULL,
      discount_amount = 0,
      order_discount_amount = 0,
      item_discount_amount = 0,
      promotion_id    = NULL,
      promotion_code_id = NULL,
      total_amount    = 0 + COALESCE(service_charge, 0),
      updated_at      = now()
    WHERE id = v_item.order_id;

    INSERT INTO public.order_status_history (
      tenant_id, order_id, from_status, to_status, changed_by, note
    )
    VALUES (
      v_item.tenant_id, v_item.order_id, v_order.status, 'cancelled', v_uid,
      'auto_cancel_all_items_voided: ' || p_reason
    );
  ELSE
    -- Update subtotal first so normalization triggers and queries see active subtotal
    UPDATE public.orders o
    SET
      subtotal   = v_subtotal,
      updated_at = now()
    WHERE o.id = v_item.order_id;

    -- Invariant: Auto-revoke or re-evaluate promotion if subtotal changed
    IF v_order.promotion_id IS NOT NULL THEN
      SELECT * INTO v_promo FROM public.promotions WHERE id = v_order.promotion_id;
      IF FOUND THEN
        v_base := GREATEST(
          v_subtotal - COALESCE(v_order.item_discount_amount, 0),
          0
        );
        IF NOT public.promotion_is_eligible(
          v_promo, v_order.branch_id, v_order.order_type, v_base, now()
        ) THEN
          -- Auto-revoke promotion when order no longer qualifies (e.g. subtotal < min_subtotal)
          PERFORM public.clear_promotion(
            v_item.order_id,
            'Hủy khuyến mãi do đơn không còn đủ điều kiện: ' || p_reason
          );
          -- Cancel pending un-sent gift items that were added purely by the promotion
          UPDATE public.order_items
          SET status = 'cancelled',
              cancel_reason = 'Hủy quà tặng do đơn không còn đủ điều kiện',
              updated_at = now()
          WHERE order_id = v_item.order_id
            AND status = 'pending'
            AND sent_to_kitchen_at IS NULL
            AND note LIKE '[TẶNG]%';
        ELSIF v_promo.kind IN ('bxgy', 'free_side', 'free_item', 'auto_order') THEN
          PERFORM public.evaluate_order_promotions(v_item.order_id);
        END IF;
      END IF;
    END IF;

    -- Re-read order totals after trigger normalization or clear/evaluate
    SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id FOR UPDATE;

    -- Manual discount recalc (when not driven by promotion catalog)
    IF v_order.promotion_id IS NULL AND v_order.discount_type IS NOT NULL THEN
      v_discount_amount := public.compute_discount_amount(
        v_order.discount_type, v_order.discount_value, v_subtotal
      );

      UPDATE public.orders o
      SET
        discount_type   = CASE WHEN v_discount_amount = 0 THEN NULL ELSE o.discount_type END,
        discount_value  = CASE WHEN v_discount_amount = 0 THEN NULL ELSE o.discount_value END,
        discount_note   = CASE WHEN v_discount_amount = 0 THEN NULL ELSE o.discount_note END,
        discount_amount = v_discount_amount,
        total_amount    = v_subtotal + COALESCE(o.service_charge, 0) - v_discount_amount,
        updated_at      = now()
      WHERE o.id = v_item.order_id;
    END IF;

    INSERT INTO public.order_status_history (
      tenant_id, order_id, from_status, to_status, changed_by, note
    )
    VALUES (
      v_item.tenant_id, v_item.order_id, v_order.status, v_order.status, v_uid,
      'void_item ' || p_order_item_id::text || ': ' || p_reason
    );
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_item.order_id,
    'auto_cancelled_order', v_all_cancelled,
    'was_sent_to_kitchen', v_item.sent_to_kitchen_at IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.void_order_item(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_order_item(bigint, text) TO authenticated, service_role;


-- 3. reduce_order_item_quantity: auto-revoke promotion when order is no longer eligible
CREATE OR REPLACE FUNCTION public.reduce_order_item_quantity(
  p_order_item_id bigint,
  p_new_quantity integer,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid           UUID;
  v_prof_tenant   BIGINT;
  v_prof_branch   BIGINT;
  v_prof_role     TEXT;
  v_item          public.order_items%ROWTYPE;
  v_order         public.orders%ROWTYPE;
  v_promo         public.promotions%ROWTYPE;
  v_old_qty       INT;
  v_qty_diff      INT;
  v_new_subtotal  NUMERIC(15,2);
  v_subtotal_sum  NUMERIC(15,2);
  v_base          NUMERIC(15,2);
  v_disc_amount   NUMERIC(15,2);
  v_total_amount  NUMERIC(15,2);
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'unassigned')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  -- Owner + floor money roles only. Waiter maps to branch_staff.
  IF v_prof_role IS NULL OR v_prof_role NOT IN ('owner', 'branch_manager', 'cashier', 'branch_staff') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'reason too short' USING ERRCODE = '22023';
  END IF;

  IF p_new_quantity IS NULL OR p_new_quantity < 1 THEN
    RAISE EXCEPTION 'new quantity must be >= 1' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(v_item.order_id);

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role <> 'owner' THEN
    IF v_prof_branch IS NULL THEN
      RAISE EXCEPTION 'branch scope required' USING ERRCODE = '42501';
    END IF;
    IF v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
      RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'pos:void_order') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_item.status IN ('served', 'cancelled') THEN
    RAISE EXCEPTION 'item not reducible' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;

  v_old_qty := v_item.quantity;

  IF p_new_quantity >= v_old_qty THEN
    RAISE EXCEPTION 'no reduction needed' USING ERRCODE = '22023';
  END IF;

  v_qty_diff := v_old_qty - p_new_quantity;
  v_new_subtotal := v_item.unit_price * p_new_quantity;

  UPDATE public.order_items
  SET quantity   = p_new_quantity,
      subtotal   = v_new_subtotal,
      updated_at = now()
  WHERE id = p_order_item_id;

  UPDATE public.kds_tickets
  SET updated_at = now()
  WHERE order_item_id = p_order_item_id
    AND tenant_id = v_item.tenant_id
    AND status NOT IN ('served', 'cancelled');

  IF v_item.menu_item_id IS NOT NULL THEN
    UPDATE public.branch_menu_item_daily_limits
    SET sold_today = GREATEST(sold_today - v_qty_diff, 0),
        updated_at = now()
    WHERE branch_id = v_order.branch_id
      AND menu_item_id = v_item.menu_item_id
      AND limit_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  END IF;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal_sum
  FROM public.order_items
  WHERE order_id = v_item.order_id AND status <> 'cancelled';

  -- Update subtotal first so normalization triggers and queries see active subtotal
  UPDATE public.orders
  SET subtotal   = v_subtotal_sum,
      updated_at = now()
  WHERE id = v_item.order_id;

  -- Invariant: Auto-revoke or re-evaluate promotion if subtotal changed
  IF v_order.promotion_id IS NOT NULL THEN
    SELECT * INTO v_promo FROM public.promotions WHERE id = v_order.promotion_id;
    IF FOUND THEN
      v_base := GREATEST(
        v_subtotal_sum - COALESCE(v_order.item_discount_amount, 0),
        0
      );
      IF NOT public.promotion_is_eligible(
        v_promo, v_order.branch_id, v_order.order_type, v_base, now()
      ) THEN
        PERFORM public.clear_promotion(
          v_item.order_id,
          'Hủy khuyến mãi do đơn không còn đủ điều kiện: ' || p_reason
        );
        UPDATE public.order_items
        SET status = 'cancelled',
            cancel_reason = 'Hủy quà tặng do đơn không còn đủ điều kiện',
            updated_at = now()
        WHERE order_id = v_item.order_id
          AND status = 'pending'
          AND sent_to_kitchen_at IS NULL
          AND note LIKE '[TẶNG]%';
      ELSIF v_promo.kind IN ('bxgy', 'free_side', 'free_item', 'auto_order') THEN
        PERFORM public.evaluate_order_promotions(v_item.order_id);
      END IF;
    END IF;
  END IF;

  -- Re-read order totals
  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id FOR UPDATE;

  -- Manual discount recalc
  IF v_order.promotion_id IS NULL AND v_order.discount_type IS NOT NULL THEN
    v_disc_amount := public.compute_discount_amount(
      v_order.discount_type, v_order.discount_value, v_subtotal_sum
    );
    v_total_amount := v_subtotal_sum
      + COALESCE(v_order.service_charge, 0)
      - v_disc_amount;

    UPDATE public.orders
    SET discount_amount = v_disc_amount,
        total_amount    = v_total_amount,
        updated_at      = now()
    WHERE id = v_item.order_id;
  END IF;

  SELECT subtotal, discount_amount, total_amount
  INTO v_subtotal_sum, v_disc_amount, v_total_amount
  FROM public.orders WHERE id = v_item.order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_item.tenant_id, v_item.order_id, v_order.status, v_order.status, v_uid,
    'reduce_item ' || p_order_item_id::text
      || ': ' || v_old_qty::text || '->' || p_new_quantity::text
      || ': ' || p_reason
  );

  RETURN jsonb_build_object(
    'order_id',           v_item.order_id,
    'order_item_id',      p_order_item_id,
    'old_quantity',       v_old_qty,
    'new_quantity',       p_new_quantity,
    'qty_reduced',        v_qty_diff,
    'subtotal',           v_subtotal_sum,
    'discount_amount',    v_disc_amount,
    'total_amount',       v_total_amount,
    'was_sent_to_kitchen', v_item.sent_to_kitchen_at IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reduce_order_item_quantity(bigint, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reduce_order_item_quantity(bigint, integer, text) TO authenticated, service_role;


-- 4. edit_pending_order_item: auto-revoke promotion when order is no longer eligible
CREATE OR REPLACE FUNCTION public.edit_pending_order_item(
  p_order_item_id bigint,
  p_variant_id bigint,
  p_variant_name text,
  p_unit_price numeric,
  p_modifiers jsonb,
  p_sides jsonb,
  p_note text,
  p_quantity integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid           UUID;
  v_prof_tenant   BIGINT;
  v_prof_branch   BIGINT;
  v_prof_role     TEXT;
  v_flag_enabled  TEXT;
  v_item          public.order_items%ROWTYPE;
  v_order         public.orders%ROWTYPE;
  v_promo         public.promotions%ROWTYPE;
  v_menu_active   BOOLEAN;
  v_base_price    NUMERIC(15,2);
  v_variant_adj   NUMERIC(15,2) := 0;
  v_modifier_sum  NUMERIC(15,2) := 0;
  v_sides_sum     NUMERIC(15,2) := 0;
  v_new_unit      NUMERIC(15,2);
  v_old_qty       INT;
  v_old_unit      NUMERIC(15,2);
  v_new_subtotal  NUMERIC(15,2);
  v_subtotal_sum  NUMERIC(15,2);
  v_base          NUMERIC(15,2);
  v_disc_amount   NUMERIC(15,2);
  v_total_amount  NUMERIC(15,2);
  v_enriched_sides JSONB := '[]'::JSONB;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'unassigned')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN ('owner', 'branch_manager', 'cashier', 'branch_staff') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RAISE EXCEPTION 'quantity must be >= 1' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(v_item.order_id);

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role <> 'owner' THEN
    IF v_prof_branch IS NULL THEN
      RAISE EXCEPTION 'branch scope required' USING ERRCODE = '42501';
    END IF;
    IF v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
      RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'pos:void_order') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT value INTO v_flag_enabled
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'pos_edit_pending_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RAISE EXCEPTION 'feature disabled' USING ERRCODE = '22023';
  END IF;

  IF v_item.status <> 'pending' THEN
    RAISE EXCEPTION 'item not editable' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;

  SELECT is_active INTO v_menu_active
  FROM public.menu_items
  WHERE id = v_item.menu_item_id AND tenant_id = v_order.tenant_id;
  IF NOT FOUND OR COALESCE(v_menu_active, FALSE) = FALSE THEN
    RAISE EXCEPTION 'menu item inactive' USING ERRCODE = '22023';
  END IF;

  v_base_price := public.pos_resolve_item_list_price(
    v_order.tenant_id,
    v_item.menu_item_id,
    v_order.order_type,
    v_order.delivery_platform
  );

  IF p_variant_id IS NOT NULL THEN
    SELECT price_adjustment INTO v_variant_adj
    FROM public.menu_item_variants
    WHERE id = p_variant_id
      AND item_id = v_item.menu_item_id
      AND tenant_id = v_order.tenant_id
      AND is_active = TRUE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'variant inactive' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_variant_adj := 0;
  END IF;

  v_modifier_sum := public.pos_order_modifier_sum(
    v_order.tenant_id,
    v_item.menu_item_id,
    COALESCE(p_modifiers, '[]'::JSONB)
  );

  SELECT sides_sum, enriched_sides
  INTO v_sides_sum, v_enriched_sides
  FROM public.pos_enrich_order_sides(
    v_order.tenant_id,
    v_item.menu_item_id,
    COALESCE(p_sides, '[]'::JSONB),
    v_order.order_type,
    v_order.delivery_platform
  );

  v_new_unit := v_base_price + v_variant_adj + v_modifier_sum + COALESCE(v_sides_sum, 0);
  v_old_qty := v_item.quantity;
  v_old_unit := v_item.unit_price;
  v_new_subtotal := v_new_unit * p_quantity;

  UPDATE public.order_items
  SET variant_id   = p_variant_id,
      variant_name = NULLIF(p_variant_name, ''),
      unit_price   = v_new_unit,
      modifiers    = COALESCE(p_modifiers, '[]'::JSONB),
      sides        = COALESCE(v_enriched_sides, '[]'::JSONB),
      note         = NULLIF(trim(COALESCE(p_note, '')), ''),
      quantity     = p_quantity,
      subtotal     = v_new_subtotal,
      updated_at   = now()
  WHERE id = p_order_item_id;

  UPDATE public.kds_tickets
  SET updated_at = now()
  WHERE order_item_id = p_order_item_id
    AND tenant_id = v_item.tenant_id
    AND status NOT IN ('served', 'cancelled');

  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal_sum
  FROM public.order_items
  WHERE order_id = v_item.order_id AND status <> 'cancelled';

  -- Update subtotal first so normalization triggers and queries see active subtotal
  UPDATE public.orders
  SET subtotal   = v_subtotal_sum,
      updated_at = now()
  WHERE id = v_item.order_id;

  -- Invariant: Auto-revoke or re-evaluate promotion if subtotal changed
  IF v_order.promotion_id IS NOT NULL THEN
    SELECT * INTO v_promo FROM public.promotions WHERE id = v_order.promotion_id;
    IF FOUND THEN
      v_base := GREATEST(
        v_subtotal_sum - COALESCE(v_order.item_discount_amount, 0),
        0
      );
      IF NOT public.promotion_is_eligible(
        v_promo, v_order.branch_id, v_order.order_type, v_base, now()
      ) THEN
        PERFORM public.clear_promotion(
          v_item.order_id,
          'Hủy khuyến mãi do đơn không còn đủ điều kiện sau khi sửa món'
        );
        UPDATE public.order_items
        SET status = 'cancelled',
            cancel_reason = 'Hủy quà tặng do đơn không còn đủ điều kiện',
            updated_at = now()
        WHERE order_id = v_item.order_id
          AND status = 'pending'
          AND sent_to_kitchen_at IS NULL
          AND note LIKE '[TẶNG]%';
      ELSIF v_promo.kind IN ('bxgy', 'free_side', 'free_item', 'auto_order') THEN
        PERFORM public.evaluate_order_promotions(v_item.order_id);
      END IF;
    END IF;
  END IF;

  -- Re-read order totals
  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id FOR UPDATE;

  -- Manual discount recalc
  IF v_order.promotion_id IS NULL AND v_order.discount_type IS NOT NULL THEN
    v_disc_amount := public.compute_discount_amount(
      v_order.discount_type, v_order.discount_value, v_subtotal_sum
    );
    v_total_amount := v_subtotal_sum
      + COALESCE(v_order.service_charge, 0)
      - v_disc_amount;

    UPDATE public.orders
    SET discount_amount = v_disc_amount,
        total_amount    = v_total_amount,
        updated_at      = now()
    WHERE id = v_item.order_id;
  END IF;

  SELECT subtotal, discount_amount, total_amount
  INTO v_subtotal_sum, v_disc_amount, v_total_amount
  FROM public.orders WHERE id = v_item.order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_item.tenant_id, v_item.order_id, v_order.status, v_order.status, v_uid,
    'edit_item ' || p_order_item_id::text
      || ' qty:' || v_old_qty::text || '->' || p_quantity::text
      || ' unit:' || v_old_unit::text || '->' || v_new_unit::text
  );

  RETURN jsonb_build_object(
    'order_id',            v_item.order_id,
    'order_item_id',       p_order_item_id,
    'old_quantity',        v_old_qty,
    'new_quantity',        p_quantity,
    'unit_price',          v_new_unit,
    'subtotal',            v_subtotal_sum,
    'discount_amount',     v_disc_amount,
    'total_amount',        v_total_amount,
    'was_sent_to_kitchen', v_item.sent_to_kitchen_at IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.edit_pending_order_item(bigint, bigint, text, numeric, jsonb, jsonb, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edit_pending_order_item(bigint, bigint, text, numeric, jsonb, jsonb, text, integer) TO authenticated, service_role;
