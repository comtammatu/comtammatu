-- =============================================================
-- M3-S3: KDS Bump/Complete/Recall RPCs
-- =============================================================

-- ─── bump_kds_ticket ───
-- Advances ticket status: pending → preparing → ready
-- When bumping to 'ready', auto-checks if all tickets for the order are ready.

CREATE OR REPLACE FUNCTION public.bump_kds_ticket(p_ticket_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_ticket RECORD;
  v_new_status TEXT;
  v_order_id BIGINT;
BEGIN
  -- Fetch and lock ticket
  SELECT id, tenant_id, branch_id, station_id, order_id, status
  INTO v_ticket
  FROM public.kds_tickets
  WHERE id = p_ticket_id
    AND tenant_id = public.auth_tenant_id()
    AND branch_id = public.auth_branch_id()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

  -- Determine next status
  IF v_ticket.status = 'pending' THEN
    v_new_status := 'preparing';
  ELSIF v_ticket.status = 'preparing' THEN
    v_new_status := 'ready';
  ELSE
    RAISE EXCEPTION 'Ticket cannot be bumped from status %', v_ticket.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Update ticket
  UPDATE public.kds_tickets
  SET status = v_new_status,
      bumped_at = now(),
      bumped_by = auth.uid()
  WHERE id = p_ticket_id;

  -- If bumped to 'ready', check if the entire order is ready
  IF v_new_status = 'ready' THEN
    PERFORM public.check_order_ready(v_ticket.order_id);
  END IF;

  RETURN v_new_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_kds_ticket(BIGINT) TO authenticated;


-- ─── check_order_ready ───
-- If ALL tickets for an order are 'ready', set orders.status = 'ready'
-- and insert into order_status_history.

CREATE OR REPLACE FUNCTION public.check_order_ready(p_order_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_pending_count INT;
  v_current_status TEXT;
BEGIN
  -- Count non-ready tickets
  SELECT COUNT(*) INTO v_pending_count
  FROM public.kds_tickets
  WHERE order_id = p_order_id
    AND status NOT IN ('ready', 'served');

  -- If all tickets are ready (or served), transition order
  IF v_pending_count = 0 THEN
    SELECT status INTO v_current_status
    FROM public.orders
    WHERE id = p_order_id;

    -- Only transition if not already ready or beyond
    IF v_current_status NOT IN ('ready', 'served', 'completed', 'cancelled') THEN
      UPDATE public.orders
      SET status = 'ready'
      WHERE id = p_order_id;

      INSERT INTO public.order_status_history (
        tenant_id, order_id, from_status, to_status, changed_by
      )
      SELECT tenant_id, id, v_current_status, 'ready', auth.uid()
      FROM public.orders
      WHERE id = p_order_id;
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_order_ready(BIGINT) TO authenticated;


-- ─── recall_kds_ticket ───
-- Reverts ticket status: ready → preparing, preparing → pending
-- Clears bumped_at/bumped_by.

CREATE OR REPLACE FUNCTION public.recall_kds_ticket(p_ticket_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_ticket RECORD;
  v_new_status TEXT;
BEGIN
  -- Fetch and lock ticket
  SELECT id, tenant_id, branch_id, status
  INTO v_ticket
  FROM public.kds_tickets
  WHERE id = p_ticket_id
    AND tenant_id = public.auth_tenant_id()
    AND branch_id = public.auth_branch_id()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

  -- Determine previous status
  IF v_ticket.status = 'ready' THEN
    v_new_status := 'preparing';
  ELSIF v_ticket.status = 'preparing' THEN
    v_new_status := 'pending';
  ELSE
    RAISE EXCEPTION 'Ticket cannot be recalled from status %', v_ticket.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Update ticket
  UPDATE public.kds_tickets
  SET status = v_new_status,
      bumped_at = NULL,
      bumped_by = NULL
  WHERE id = p_ticket_id;

  RETURN v_new_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recall_kds_ticket(BIGINT) TO authenticated;
