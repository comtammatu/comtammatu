-- =============================================================
-- M2-Ext2 PR3: Align transfer_order_table with multi-order-per-table
--
-- Context: PR3 Gộp bàn Option A allowed creating a 2nd order on an
-- already-occupied dine-in table. transfer_order_table previously blocked
-- target with status='occupied', producing an inconsistent UX:
--   - Cashier CAN tap occupied bàn → "Tạo đơn mới" → bàn now has 2 orders
--   - Cashier CANNOT transfer order from bàn A onto bàn B that has 1 order
--
-- Fix #1: relax target check — allow `available` and `occupied`. Block
-- only `reserved` and `maintenance` (intentionally unavailable).
--
-- Fix #2: role lookup uses Auth-v2 pattern (`positions.legacy_role_code`
-- via `profiles.position_id` LEFT JOIN). The legacy `profiles.role` column
-- was dropped during Auth v2 cutover; the original M2-Ext body
-- (20260409100000) referenced it and was already silently broken in
-- Auth v2's pre-cutover window — this migration fixes both at once.
-- =============================================================

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
  WHERE id = p_new_table_id AND branch_id = v_order.branch_id AND tenant_id = v_order.tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'table not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_new_table_id = v_order.table_id THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'table_id', p_new_table_id);
  END IF;

  -- Multi-order-per-table alignment: target may be available OR occupied.
  -- Reserved / maintenance still block — those signal bàn is intentionally
  -- unavailable for service.
  IF v_new_table.status NOT IN ('available', 'occupied') THEN
    RAISE EXCEPTION 'table not available' USING ERRCODE = '22023';
  END IF;

  v_old_table_id := v_order.table_id;

  UPDATE public.orders
  SET table_id = p_new_table_id, updated_at = now()
  WHERE id = p_order_id;

  -- Idempotent: if target was already occupied, this is a no-op; the bàn
  -- continues to host its prior order(s) plus the freshly transferred one.
  UPDATE public.tables
  SET status = 'occupied', updated_at = now()
  WHERE id = p_new_table_id AND tenant_id = v_order.tenant_id;

  IF v_old_table_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_active_on_old
    FROM public.orders
    WHERE table_id = v_old_table_id
      AND tenant_id = v_order.tenant_id
      AND id <> p_order_id
      AND status NOT IN ('completed', 'cancelled', 'served');

    IF v_active_on_old = 0 THEN
      UPDATE public.tables
      SET status = 'available', updated_at = now()
      WHERE id = v_old_table_id AND tenant_id = v_order.tenant_id;
    END IF;
  END IF;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_order.tenant_id, p_order_id, v_order.status, v_order.status, v_uid,
    'transfer_table -> ' || p_new_table_id::text
  );

  RETURN jsonb_build_object('order_id', p_order_id, 'table_id', p_new_table_id);
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_order_table(BIGINT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_order_table(BIGINT, BIGINT) TO authenticated;
