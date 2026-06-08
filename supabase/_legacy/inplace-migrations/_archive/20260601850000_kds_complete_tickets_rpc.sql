-- ============================================================================
-- KDS one-tap completion for the visible kitchen card
-- ============================================================================
-- KDS completion means kitchen-ready only. This RPC updates active KDS tickets
-- to `ready` atomically and lets check_order_ready move the parent order to
-- `ready` when all kitchen work is ready/cancelled. It never closes POS
-- payment, never marks `orders.status = completed`, and never releases tables.

CREATE OR REPLACE FUNCTION public.complete_kds_tickets(
  p_branch_id BIGINT,
  p_ticket_ids BIGINT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_ticket_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_order_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_requested_count INT := 0;
  v_locked_count INT := 0;
  v_completed_count INT := 0;
  v_group_count INT := 0;
  v_order_id BIGINT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_branch_id IS NULL OR p_branch_id <= 0 THEN
    RAISE EXCEPTION 'invalid_branch' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_permission_any('kds:mark_ready') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT ticket_id), ARRAY[]::BIGINT[])
  INTO v_ticket_ids
  FROM unnest(COALESCE(p_ticket_ids, ARRAY[]::BIGINT[])) AS input(ticket_id)
  WHERE ticket_id IS NOT NULL AND ticket_id > 0;

  v_requested_count := COALESCE(array_length(v_ticket_ids, 1), 0);

  IF v_requested_count = 0 THEN
    RAISE EXCEPTION 'no_tickets' USING ERRCODE = '22023';
  END IF;

  WITH locked AS (
    SELECT kt.id
    FROM public.kds_tickets kt
    WHERE kt.id = ANY(v_ticket_ids)
      AND kt.tenant_id = public.auth_tenant_id()
      AND kt.branch_id = p_branch_id
      AND public.can_access_branch(kt.branch_id)
    FOR UPDATE
  )
  SELECT COUNT(*) INTO v_locked_count
  FROM locked;

  IF v_locked_count <> v_requested_count THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COUNT(DISTINCT COALESCE(
    'batch:' || kt.kitchen_send_batch_id::TEXT,
    'order:' || kt.order_id::TEXT
  ))
  INTO v_group_count
  FROM public.kds_tickets kt
  WHERE kt.id = ANY(v_ticket_ids)
    AND kt.tenant_id = public.auth_tenant_id()
    AND kt.branch_id = p_branch_id;

  IF v_group_count <> 1 THEN
    RAISE EXCEPTION 'mixed_kds_card' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT kt.order_id), ARRAY[]::BIGINT[])
  INTO v_order_ids
  FROM public.kds_tickets kt
  WHERE kt.id = ANY(v_ticket_ids)
    AND kt.tenant_id = public.auth_tenant_id()
    AND kt.branch_id = p_branch_id;

  WITH updated AS (
    UPDATE public.kds_tickets kt
    SET status = 'ready',
        bumped_at = now(),
        bumped_by = v_uid,
        updated_at = now()
    WHERE kt.id = ANY(v_ticket_ids)
      AND kt.tenant_id = public.auth_tenant_id()
      AND kt.branch_id = p_branch_id
      AND kt.status IN ('pending', 'preparing')
    RETURNING kt.id
  )
  SELECT COUNT(*) INTO v_completed_count
  FROM updated;

  FOREACH v_order_id IN ARRAY v_order_ids LOOP
    PERFORM public.check_order_ready(v_order_id);
  END LOOP;

  RETURN jsonb_build_object(
    'requested_count', v_requested_count,
    'completed_count', v_completed_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_kds_tickets(BIGINT, BIGINT[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_kds_tickets(BIGINT, BIGINT[])
  TO authenticated;

COMMENT ON FUNCTION public.complete_kds_tickets(BIGINT, BIGINT[]) IS
  'Atomically marks visible pending/preparing KDS tickets ready for a kitchen card. Does not close POS/payment/table state.';
