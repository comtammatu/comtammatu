-- Tighten update_pos_order_status('served') to mirror the 'completed' guard:
-- the order-level "Phục vụ" action now requires every active order_item to
-- already be terminal from the kitchen's perspective (ready, served, or
-- cancelled). This prevents the inverse of PAYMENT-AUTO-COMPLETES-ORDER:
-- previously a cashier tap on "Phục vụ" force-flipped pending/preparing
-- kds_tickets to served, erasing in-flight tickets the chef was still
-- cooking. Per-item served (mark_order_item_served) and explicit chef bumps
-- via KDS remain the canonical fulfillment path.

CREATE OR REPLACE FUNCTION public.update_pos_order_status(
  p_order_id BIGINT,
  p_new_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_prof_tenant BIGINT;
  v_prof_branch BIGINT;
  v_prof_role TEXT;
  v_order RECORD;
  v_from_status TEXT;
  v_bad_items INT;
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

  IF p_new_status NOT IN ('served', 'completed') THEN
    RAISE EXCEPTION 'invalid status' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT id, tenant_id, branch_id, status
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

  IF v_prof_role IN ('owner', 'super_manager', 'area_manager') THEN
    NULL;
  ELSIF v_prof_branch IS NOT NULL AND v_order.branch_id <> v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  v_from_status := v_order.status;

  IF p_new_status = 'served' THEN
    IF v_order.status NOT IN ('new', 'confirmed', 'preparing', 'ready') THEN
      RAISE EXCEPTION 'invalid transition to served' USING ERRCODE = '22023';
    END IF;

    -- Same invariant as 'completed': every active item must already be
    -- terminal from the kitchen's perspective. Cashier cannot retire a
    -- ticket the chef is still working on.
    SELECT COUNT(*) INTO v_bad_items
    FROM public.order_items
    WHERE order_id = p_order_id
      AND status NOT IN ('ready', 'served', 'cancelled');

    IF v_bad_items > 0 THEN
      RAISE EXCEPTION 'items not terminal' USING ERRCODE = '22023';
    END IF;

    -- Only flip the rows that still need transitioning. 'served' stays
    -- 'served', 'cancelled' stays 'cancelled' (guard above already proved
    -- nothing is pending/preparing).
    UPDATE public.order_items
    SET status = 'served',
        updated_at = now()
    WHERE order_id = p_order_id
      AND tenant_id = v_order.tenant_id
      AND status = 'ready';

    UPDATE public.kds_tickets
    SET status = 'served',
        bumped_at = COALESCE(bumped_at, now()),
        bumped_by = COALESCE(bumped_by, v_uid),
        updated_at = now()
    WHERE order_id = p_order_id
      AND tenant_id = v_order.tenant_id
      AND status = 'ready';

    UPDATE public.orders
    SET status = 'served', updated_at = now()
    WHERE id = p_order_id;
  ELSIF p_new_status = 'completed' THEN
    IF v_order.status <> 'served' THEN
      RAISE EXCEPTION 'complete requires served' USING ERRCODE = '22023';
    END IF;

    SELECT COUNT(*) INTO v_bad_items
    FROM public.order_items
    WHERE order_id = p_order_id
      AND status NOT IN ('ready', 'served', 'cancelled');

    IF v_bad_items > 0 THEN
      RAISE EXCEPTION 'items not terminal' USING ERRCODE = '22023';
    END IF;

    UPDATE public.orders
    SET status = 'completed', updated_at = now()
    WHERE id = p_order_id;
  END IF;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_order.tenant_id, p_order_id, v_from_status, p_new_status, v_uid, 'pos update'
  );

  RETURN jsonb_build_object('order_id', p_order_id, 'status', p_new_status);
END;
$$;

REVOKE ALL ON FUNCTION public.update_pos_order_status(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_pos_order_status(BIGINT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.update_pos_order_status(BIGINT, TEXT) IS
  'POS order status update. Both ''served'' and ''completed'' require every active order_item to already be ready/served/cancelled — cashier cannot retire kitchen tickets that are still pending/preparing. Per-item served stays available via mark_order_item_served.';
