-- =========================================================================
-- DAILY-LIMIT-REDUCE-QTY-LEAK: reduce_order_item_quantity must decrement
-- branch_menu_item_daily_limits.sold_today by the qty delta.
--
-- Bug: enforce_branch_menu_daily_limit (INSERT trigger) fires when an
-- order_item is added — increments sold_today by quantity. The companion
-- decrement trigger fires only when status flips to `cancelled`. A pure
-- quantity reduction (5 → 2) keeps status='pending'/'preparing' so neither
-- trigger fires; the 3 freed portions stay locked in sold_today, manager
-- dashboard reports "Hết suất" prematurely (especially for high-quota
-- side dishes).
--
-- Fix: in reduce_order_item_quantity, after the order_items UPDATE,
-- explicitly decrement sold_today by (v_old_qty - p_new_quantity) for
-- (branch_id, menu_item_id, today). GREATEST(... , 0) defends against
-- race timing producing a transient negative; CHECK constraint on the
-- column would reject negative anyway.
--
-- The rest of the RPC body is unchanged — copying the full CREATE OR
-- REPLACE because PostgreSQL function bodies cannot be patched in place.
-- Source: supabase/migrations/20260427074752_pos_reduce_order_item_qty.sql.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.reduce_order_item_quantity(
  p_order_item_id BIGINT,
  p_new_quantity  INT,
  p_reason        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           UUID;
  v_prof_tenant   BIGINT;
  v_prof_branch   BIGINT;
  v_prof_role     TEXT;
  v_item          public.order_items%ROWTYPE;
  v_order         public.orders%ROWTYPE;
  v_old_qty       INT;
  v_qty_diff      INT;
  v_new_subtotal  NUMERIC(15,2);
  v_subtotal_sum  NUMERIC(15,2);
  v_disc_amount   NUMERIC(15,2);
  v_total_amount  NUMERIC(15,2);
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(po.legacy_role_code, 'office')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN ('branch_manager', 'cashier', 'waiter') THEN
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

  IF v_prof_branch IS NULL OR v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
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

  -- DAILY-LIMIT-REDUCE-QTY-LEAK: explicitly decrement today's quota by the
  -- qty diff. Triggers won't fire (status unchanged, no INSERT). Only the
  -- menu_item's own row is touched — items without a daily-limit row stay
  -- a no-op. GREATEST(..., 0) defends against any race producing a
  -- transient negative (the column has CHECK >= 0 anyway).
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

  v_disc_amount := public.compute_discount_amount(
    v_order.discount_type, v_order.discount_value, v_subtotal_sum
  );
  v_total_amount := v_subtotal_sum
    + COALESCE(v_order.service_charge, 0)
    - v_disc_amount;

  UPDATE public.orders
  SET subtotal        = v_subtotal_sum,
      discount_amount = v_disc_amount,
      total_amount    = v_total_amount,
      updated_at      = now()
  WHERE id = v_item.order_id;

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

REVOKE ALL ON FUNCTION public.reduce_order_item_quantity(BIGINT, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reduce_order_item_quantity(BIGINT, INT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.reduce_order_item_quantity(BIGINT, INT, TEXT) IS
  'Giảm SL món đã gửi (qty: từ N xuống M, M<N, M>=1). Lock order + item, '
  'permission pos:void_order, recompute subtotal/discount/total qua compute_discount_amount, '
  'bump kds_tickets.updated_at, decrement branch_menu_item_daily_limits.sold_today '
  'cho menu_item của row (DAILY-LIMIT-REDUCE-QTY-LEAK fix). Reason >=5 ký tự, '
  'ghi order_status_history. Block khi item served/cancelled, order completed/cancelled, '
  'hoặc payment_status=paid.';
