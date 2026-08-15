-- POS: Update order general note on active orders
-- Allows cashiers / staff with pos:use to add or edit order.note after creation.
-- Realtime sync is broadcasted via orders UPDATE and kds_tickets touch.

CREATE OR REPLACE FUNCTION public.update_pos_order_note(
  p_order_id BIGINT,
  p_note TEXT DEFAULT NULL
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
  v_order public.orders%ROWTYPE;
  v_note TEXT;
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

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role = 'owner' THEN
    PERFORM 1
    FROM public.branches b
    WHERE b.id = v_order.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NULL THEN
    RAISE EXCEPTION 'branch scope required' USING ERRCODE = '42501';
  ELSIF v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  v_note := NULLIF(trim(COALESCE(p_note, '')), '');

  UPDATE public.orders
  SET note = v_note,
      updated_at = now()
  WHERE id = p_order_id;

  UPDATE public.kds_tickets kt
  SET updated_at = now()
  WHERE kt.order_id = p_order_id
    AND kt.tenant_id = v_order.tenant_id
    AND kt.status IN ('pending', 'preparing');

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_order.tenant_id,
    p_order_id,
    v_order.status,
    v_order.status,
    v_uid,
    'update_order_note' || COALESCE(': ' || v_note, ': <empty>')
  );

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'note', v_note
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_pos_order_note(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_pos_order_note(BIGINT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.update_pos_order_note(BIGINT, TEXT) IS
  'Update general note on an active POS order with pos:use permission. Broadcasts changes to POS and KDS via realtime.';
