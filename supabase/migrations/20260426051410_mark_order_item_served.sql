-- POS waiter per-item served action.
-- Updates one order_items row + matching kds_tickets to served.
-- Order header status remains in current state until cashier explicitly
-- calls update_pos_order_status('served') for the bulk transition. This
-- preserves the existing PAYMENT-AUTO-COMPLETES-ORDER and
-- POS-SERVED-NOT-TABLE-TERMINAL invariants — order-level state machine
-- is untouched here.

CREATE OR REPLACE FUNCTION public.mark_order_item_served(p_item_id BIGINT)
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
  v_item RECORD;
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

  -- Lock the item row + read the parent order in one shot for ACL + state checks.
  SELECT
    oi.id,
    oi.order_id,
    oi.tenant_id,
    oi.status        AS item_status,
    o.branch_id,
    o.status         AS order_status
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

  IF v_prof_role IN ('owner', 'super_manager', 'area_manager') THEN
    NULL; -- cross-branch ops allowed
  ELSIF v_prof_branch IS NOT NULL AND v_item.branch_id <> v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
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

  -- Bring matching KDS tickets along so chef view + audit reflect reality.
  -- Tickets that are already cancelled stay cancelled.
  UPDATE public.kds_tickets
  SET status = 'served',
      bumped_at = COALESCE(bumped_at, now()),
      bumped_by = COALESCE(bumped_by, v_uid),
      updated_at = now()
  WHERE order_item_id = p_item_id
    AND tenant_id = v_item.tenant_id
    AND status <> 'cancelled';

  RETURN jsonb_build_object(
    'item_id',   p_item_id,
    'order_id',  v_item.order_id,
    'status',    'served'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_order_item_served(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_order_item_served(BIGINT) TO authenticated;

COMMENT ON FUNCTION public.mark_order_item_served(BIGINT) IS
  'POS waiter per-item served action. Sets one order_items row + matching kds_tickets to served. Order-level state machine is untouched; cashier still drives ''served''/''completed'' via update_pos_order_status / payment close. Permission: pos role with branch scope (cashier/waiter/manager).';
