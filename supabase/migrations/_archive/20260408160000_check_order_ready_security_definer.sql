-- =============================================================
-- KDS: check_order_ready + bump/recall RPC privileges
-- =============================================================
--
-- 1) UPDATE (status) on public.orders was revoked from authenticated
--    (transition_order_item_status). check_order_ready must run as
--    SECURITY DEFINER to set orders.status = 'ready'.
--
-- 2) check_order_ready EXECUTE was revoked from authenticated so it
--    cannot be called from PostgREST — but PERFORM from SECURITY
--    INVOKER bump_kds_ticket still required the session user to have
--    EXECUTE. Bump/recall are SECURITY DEFINER with explicit JWT checks
--    so only the entry RPC is exposed to clients; inner PERFORM runs
--    as the function owner.

CREATE OR REPLACE FUNCTION public.check_order_ready(p_order_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending_count INT;
  v_current_status TEXT;
  v_order_branch BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  SELECT o.status, o.branch_id INTO v_current_status, v_order_branch
  FROM public.orders o
  WHERE o.id = p_order_id
    AND o.tenant_id = public.auth_tenant_id()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF public.auth_branch_id() IS NOT NULL
     AND v_order_branch IS DISTINCT FROM public.auth_branch_id() THEN
    RAISE EXCEPTION 'not_in_branch' USING ERRCODE = '42501';
  END IF;

  IF v_current_status IN ('ready', 'served', 'completed', 'cancelled') THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_pending_count
  FROM public.kds_tickets
  WHERE order_id = p_order_id
    AND tenant_id = public.auth_tenant_id()
    AND status NOT IN ('ready', 'served');

  IF v_pending_count = 0 THEN
    UPDATE public.orders
    SET status = 'ready'
    WHERE id = p_order_id
      AND tenant_id = public.auth_tenant_id();

    INSERT INTO public.order_status_history (
      tenant_id, order_id, from_status, to_status, changed_by
    )
    SELECT tenant_id, id, v_current_status, 'ready', auth.uid()
    FROM public.orders
    WHERE id = p_order_id
      AND tenant_id = public.auth_tenant_id();
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_order_ready(BIGINT) FROM authenticated;


CREATE OR REPLACE FUNCTION public.bump_kds_ticket(p_ticket_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket    RECORD;
  v_new_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF public.auth_role() NOT IN (
    'chef', 'branch_manager', 'owner', 'super_manager', 'area_manager'
  ) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT id, tenant_id, branch_id, station_id, order_id, status
  INTO v_ticket
  FROM public.kds_tickets
  WHERE id = p_ticket_id
    AND tenant_id = public.auth_tenant_id()
    AND (
      public.auth_branch_id() IS NULL
      OR branch_id = public.auth_branch_id()
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_ticket.status = 'pending' THEN
    v_new_status := 'preparing';
  ELSIF v_ticket.status = 'preparing' THEN
    v_new_status := 'ready';
  ELSE
    RAISE EXCEPTION 'Ticket cannot be bumped from status %', v_ticket.status
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.kds_tickets
  SET status    = v_new_status,
      bumped_at = now(),
      bumped_by = auth.uid()
  WHERE id = p_ticket_id;

  IF v_new_status = 'ready' THEN
    PERFORM public.check_order_ready(v_ticket.order_id);
  END IF;

  RETURN v_new_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_kds_ticket(BIGINT) TO authenticated;


CREATE OR REPLACE FUNCTION public.recall_kds_ticket(p_ticket_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket     RECORD;
  v_new_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF public.auth_role() NOT IN (
    'chef', 'branch_manager', 'owner', 'super_manager', 'area_manager'
  ) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT id, tenant_id, branch_id, status
  INTO v_ticket
  FROM public.kds_tickets
  WHERE id = p_ticket_id
    AND tenant_id = public.auth_tenant_id()
    AND (
      public.auth_branch_id() IS NULL
      OR branch_id = public.auth_branch_id()
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_ticket.status = 'ready' THEN
    v_new_status := 'preparing';
  ELSIF v_ticket.status = 'preparing' THEN
    v_new_status := 'pending';
  ELSE
    RAISE EXCEPTION 'Ticket cannot be recalled from status %', v_ticket.status
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.kds_tickets
  SET status    = v_new_status,
      bumped_at = NULL,
      bumped_by = NULL
  WHERE id = p_ticket_id;

  RETURN v_new_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recall_kds_ticket(BIGINT) TO authenticated;
