-- =============================================================
-- Order Item State Machine RPC
-- Item-level transitions with derived order status.
-- Optimistic locking via expected_status parameter.
-- =============================================================

-- ─── transition_order_item_status ───
-- Chef bumps individual items. Order status auto-derives from items.
--
-- Item transitions:
--   pending → preparing → ready → served
--   pending → cancelled
--   preparing → cancelled
--
-- Order status derivation:
--   ALL items cancelled → order = cancelled
--   ANY item pending/preparing → order = preparing (or confirmed)
--   ALL items ready (none pending/preparing) → order = ready
--   ALL items served → order = served → then manually complete
--
-- Order-only transitions (not item-driven):
--   new → confirmed (POS confirms order)
--   served → completed (POS closes order)
--   any-except-completed → cancelled (POS cancels entire order)

CREATE OR REPLACE FUNCTION public.transition_order_item_status(
  p_item_id BIGINT,
  p_new_status TEXT,
  p_expected_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID;
  v_actor_tenant BIGINT;
  v_actor_branch BIGINT;
  v_item RECORD;
  v_order RECORD;
  v_derived_status TEXT;
  v_old_order_status TEXT;
  v_pending_count INT;
  v_preparing_count INT;
  v_ready_count INT;
  v_served_count INT;
  v_cancelled_count INT;
  v_total_count INT;
BEGIN
  -- Auth context
  v_actor_id := auth.uid();
  v_actor_tenant := public.auth_tenant_id();
  v_actor_branch := public.auth_branch_id();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Validate new_status
  IF p_new_status NOT IN ('pending', 'preparing', 'ready', 'served', 'cancelled') THEN
    RAISE EXCEPTION 'invalid item status: %', p_new_status USING ERRCODE = '22023';
  END IF;

  -- Fetch and lock item + parent order
  SELECT oi.id, oi.order_id, oi.tenant_id, oi.status AS item_status
  INTO v_item
  FROM public.order_items oi
  WHERE oi.id = p_item_id
    AND oi.tenant_id = v_actor_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Fetch parent order for branch check
  SELECT o.id, o.branch_id, o.status, o.table_id, o.order_type, o.tenant_id
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_item.order_id
  FOR UPDATE;

  -- Branch authorization (ops roles must be in same branch, managers bypass)
  IF v_actor_branch IS NOT NULL AND v_order.branch_id <> v_actor_branch THEN
    RAISE EXCEPTION 'not_in_branch' USING ERRCODE = 'P0003';
  END IF;

  -- Optimistic locking: verify expected status
  IF v_item.item_status <> p_expected_status THEN
    RAISE EXCEPTION 'status_changed:% expected % got %', v_item.item_status, p_expected_status, v_item.item_status
      USING ERRCODE = 'P0001';
  END IF;

  -- Validate transition
  IF NOT (
    (p_expected_status = 'pending' AND p_new_status IN ('preparing', 'cancelled'))
    OR (p_expected_status = 'preparing' AND p_new_status IN ('ready', 'cancelled'))
    OR (p_expected_status = 'ready' AND p_new_status = 'served')
    -- Allow served → cancelled for post-serve void (manager action)
  ) THEN
    RAISE EXCEPTION 'invalid_transition:% to %', p_expected_status, p_new_status
      USING ERRCODE = '22023';
  END IF;

  -- Apply item status change
  UPDATE public.order_items
  SET status = p_new_status, updated_at = now()
  WHERE id = p_item_id;

  -- ── Derive order status from sibling items ──
  v_old_order_status := v_order.status;

  SELECT
    COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
    COUNT(*) FILTER (WHERE status = 'preparing') AS preparing_count,
    COUNT(*) FILTER (WHERE status = 'ready') AS ready_count,
    COUNT(*) FILTER (WHERE status = 'served') AS served_count,
    COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_count,
    COUNT(*) AS total_count
  INTO v_pending_count, v_preparing_count, v_ready_count, v_served_count, v_cancelled_count, v_total_count
  FROM public.order_items
  WHERE order_id = v_item.order_id;

  -- Derive new order status
  IF v_cancelled_count = v_total_count THEN
    v_derived_status := 'cancelled';
  ELSIF v_served_count + v_cancelled_count = v_total_count THEN
    v_derived_status := 'served';
  ELSIF v_ready_count + v_served_count + v_cancelled_count = v_total_count THEN
    v_derived_status := 'ready';
  ELSIF v_preparing_count > 0 OR v_ready_count > 0 THEN
    v_derived_status := 'preparing';
  ELSE
    v_derived_status := v_old_order_status; -- no change
  END IF;

  -- Update order status if changed
  IF v_derived_status <> v_old_order_status
     AND v_old_order_status NOT IN ('completed') -- never override completed
  THEN
    UPDATE public.orders
    SET status = v_derived_status, updated_at = now()
    WHERE id = v_item.order_id;

    -- Write audit trail for order transition
    INSERT INTO public.order_status_history (
      tenant_id, order_id, from_status, to_status, changed_by, note
    ) VALUES (
      v_actor_tenant, v_item.order_id, v_old_order_status, v_derived_status,
      v_actor_id, 'derived from item ' || p_item_id || ' → ' || p_new_status
    );

    -- Table release handled by existing trigger trg_order_release_table
  END IF;

  RETURN jsonb_build_object(
    'item_id', p_item_id,
    'item_status', p_new_status,
    'order_id', v_item.order_id,
    'order_status', v_derived_status,
    'order_status_changed', v_derived_status <> v_old_order_status
  );
END;
$$;

-- Grant to authenticated (RPC authorization is inside the function)
REVOKE ALL ON FUNCTION public.transition_order_item_status(BIGINT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_order_item_status(BIGINT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.transition_order_item_status(BIGINT, TEXT, TEXT) TO authenticated;


-- ─── transition_order_status ───
-- For order-level transitions that aren't item-driven:
--   new → confirmed (POS confirms)
--   served → completed (POS closes)
--   any-except-completed → cancelled (POS/manager cancels entire order)

CREATE OR REPLACE FUNCTION public.transition_order_status(
  p_order_id BIGINT,
  p_new_status TEXT,
  p_expected_status TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID;
  v_actor_tenant BIGINT;
  v_actor_branch BIGINT;
  v_order RECORD;
BEGIN
  -- Auth context
  v_actor_id := auth.uid();
  v_actor_tenant := public.auth_tenant_id();
  v_actor_branch := public.auth_branch_id();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Fetch and lock order
  SELECT id, tenant_id, branch_id, status, table_id, order_type
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id = v_actor_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Branch authorization
  IF v_actor_branch IS NOT NULL AND v_order.branch_id <> v_actor_branch THEN
    RAISE EXCEPTION 'not_in_branch' USING ERRCODE = 'P0003';
  END IF;

  -- Optimistic locking
  IF v_order.status <> p_expected_status THEN
    RAISE EXCEPTION 'status_changed:% expected % got %', v_order.status, p_expected_status, v_order.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Validate order-level transitions
  IF NOT (
    (p_expected_status = 'new' AND p_new_status = 'confirmed')
    OR (p_expected_status = 'served' AND p_new_status = 'completed')
    OR (p_expected_status NOT IN ('completed') AND p_new_status = 'cancelled')
  ) THEN
    RAISE EXCEPTION 'invalid_transition:% to %', p_expected_status, p_new_status
      USING ERRCODE = '22023';
  END IF;

  -- Apply order status change
  UPDATE public.orders
  SET status = p_new_status, updated_at = now()
  WHERE id = p_order_id;

  -- Write audit trail
  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  ) VALUES (
    v_actor_tenant, p_order_id, v_order.status, p_new_status, v_actor_id, p_note
  );

  -- If cancelling entire order, cancel all non-terminal items
  IF p_new_status = 'cancelled' THEN
    UPDATE public.order_items
    SET status = 'cancelled', updated_at = now()
    WHERE order_id = p_order_id
      AND status NOT IN ('served', 'cancelled');
  END IF;

  -- Table release handled by existing trigger trg_order_release_table

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'old_status', v_order.status,
    'new_status', p_new_status
  );
END;
$$;

-- Grant
REVOKE ALL ON FUNCTION public.transition_order_status(BIGINT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_order_status(BIGINT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.transition_order_status(BIGINT, TEXT, TEXT, TEXT) TO authenticated;


-- ─── Revoke direct UPDATE on status columns ───
-- All status transitions must go through the RPCs above.
-- Note: We revoke UPDATE on the specific columns, not the entire table.

REVOKE UPDATE (status) ON public.orders FROM authenticated;
REVOKE UPDATE (status) ON public.order_items FROM authenticated;
