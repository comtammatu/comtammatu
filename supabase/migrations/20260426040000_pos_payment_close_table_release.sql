-- =============================================================
-- POS payment-close table release
--
-- Business rule:
--   - orders.status = 'completed' means paid + closed from POS view.
--   - served/ready/preparing are fulfillment states and must not release a
--     dine-in table before payment closes the POS order.
--   - KDS/order item statuses stay independent from POS payment close.
-- =============================================================

CREATE OR REPLACE FUNCTION public.trg_release_table_on_order_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_table_id BIGINT;
  v_active_count INT;
BEGIN
  -- Only care about dine-in orders with a table.
  IF NEW.table_id IS NULL OR NEW.order_type <> 'dine_in' THEN
    RETURN NEW;
  END IF;

  -- Only POS-terminal statuses release the table. `served` is fulfillment-only.
  IF NEW.status NOT IN ('completed', 'cancelled') THEN
    RETURN NEW;
  END IF;

  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  v_table_id := NEW.table_id;

  SELECT COUNT(*) INTO v_active_count
  FROM public.orders
  WHERE table_id = v_table_id
    AND tenant_id = NEW.tenant_id
    AND id <> NEW.id
    AND status NOT IN ('completed', 'cancelled');

  IF v_active_count = 0 THEN
    UPDATE public.tables
    SET status = 'available'
    WHERE id = v_table_id
      AND tenant_id = NEW.tenant_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_release_table_on_order_status() IS
  'Releases dine-in tables only when POS order is completed/cancelled. `served` is fulfillment-only and must not free the table before payment close.';

CREATE OR REPLACE FUNCTION public.transfer_order_table(
  p_order_id BIGINT,
  p_new_table_id BIGINT
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
  v_new_table RECORD;
  v_old_table_id BIGINT;
  v_active_on_old INT;
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

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT id, tenant_id, branch_id, table_id, order_type, status
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

  IF v_order.order_type <> 'dine_in' THEN
    RAISE EXCEPTION 'takeaway cannot transfer' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  SELECT id, status INTO v_new_table
  FROM public.tables
  WHERE id = p_new_table_id
    AND branch_id = v_order.branch_id
    AND tenant_id = v_order.tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'table not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_new_table_id = v_order.table_id THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'table_id', p_new_table_id);
  END IF;

  IF v_new_table.status <> 'available' THEN
    RAISE EXCEPTION 'table not available' USING ERRCODE = '22023';
  END IF;

  v_old_table_id := v_order.table_id;

  UPDATE public.orders
  SET table_id = p_new_table_id, updated_at = now()
  WHERE id = p_order_id;

  UPDATE public.tables
  SET status = 'occupied', updated_at = now()
  WHERE id = p_new_table_id
    AND tenant_id = v_order.tenant_id;

  IF v_old_table_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_active_on_old
    FROM public.orders
    WHERE table_id = v_old_table_id
      AND tenant_id = v_order.tenant_id
      AND id <> p_order_id
      AND status NOT IN ('completed', 'cancelled');

    IF v_active_on_old = 0 THEN
      UPDATE public.tables
      SET status = 'available', updated_at = now()
      WHERE id = v_old_table_id
        AND tenant_id = v_order.tenant_id;
    END IF;
  END IF;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_order.tenant_id,
    p_order_id,
    v_order.status,
    v_order.status,
    v_uid,
    'transfer_table -> ' || p_new_table_id::text
  );

  RETURN jsonb_build_object('order_id', p_order_id, 'table_id', p_new_table_id);
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_order_table(BIGINT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_order_table(BIGINT, BIGINT) TO authenticated;

COMMENT ON FUNCTION public.transfer_order_table(BIGINT, BIGINT) IS
  'Transfers a dine-in order between tables. Old table is released only when no non-completed/non-cancelled order remains; served remains active.';
