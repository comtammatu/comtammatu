-- Hardening Voucher Lifecycle on Order Cancel & Void
-- Ensure promotion codes and redemptions cleanly revert to 'active' when an unpaid order is cancelled or voided.

CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id bigint, p_reason text)
RETURNS jsonb
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
  v_code record;
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

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'unassigned')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  -- Owner + floor money roles only. Waiter maps to branch_staff and stays excluded.
  IF v_prof_role IS NULL OR v_prof_role NOT IN ('owner', 'branch_manager', 'cashier') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 1 THEN
    RAISE EXCEPTION 'reason required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT id, tenant_id, branch_id, status, table_id, order_type,
         service_charge, discount_type, discount_value, promotion_id, promotion_code_id
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

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  -- Release Applied Promotion / Voucher Codes on Cancellation
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

  -- Owner + floor money roles only. Waiter maps to branch_staff and stays excluded.
  IF v_prof_role IS NULL OR v_prof_role NOT IN ('owner', 'branch_manager', 'cashier') THEN
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
    v_discount_amount := public.compute_discount_amount(
      v_order.discount_type, v_order.discount_value, v_subtotal
    );

    UPDATE public.orders o
    SET
      subtotal        = v_subtotal,
      discount_type   = CASE WHEN v_discount_amount = 0 THEN NULL ELSE o.discount_type END,
      discount_value  = CASE WHEN v_discount_amount = 0 THEN NULL ELSE o.discount_value END,
      discount_note   = CASE WHEN v_discount_amount = 0 THEN NULL ELSE o.discount_note END,
      discount_amount = v_discount_amount,
      total_amount    = v_subtotal + COALESCE(o.service_charge, 0) - v_discount_amount,
      updated_at      = now()
    WHERE o.id = v_item.order_id;

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
