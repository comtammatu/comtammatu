-- Fix complete_kds_tickets: align card group validation with KDS board rules.
-- Takeaway and delivery orders group all kitchen sends into a single order card.
-- Multi-batch takeaway cards must not trigger mixed_kds_card on completion.

CREATE OR REPLACE FUNCTION public.complete_kds_tickets(p_branch_id bigint, p_ticket_ids bigint[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ticket_ids bigint[] := ARRAY[]::bigint[];
  v_order_ids bigint[] := ARRAY[]::bigint[];
  v_requested_count integer := 0;
  v_locked_count integer := 0;
  v_completed_count integer := 0;
  v_group_count integer := 0;
  v_order_id bigint;
  v_updated_ticket_ids bigint[] := ARRAY[]::bigint[];
  v_print_result jsonb := '{"jobs": []}'::jsonb;
  v_print_warning text := NULL;
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

  SELECT COALESCE(array_agg(DISTINCT ticket_id), ARRAY[]::bigint[])
  INTO v_ticket_ids
  FROM unnest(COALESCE(p_ticket_ids, ARRAY[]::bigint[])) AS input(ticket_id)
  WHERE ticket_id IS NOT NULL AND ticket_id > 0;

  v_requested_count := COALESCE(array_length(v_ticket_ids, 1), 0);

  IF v_requested_count = 0 THEN
    RAISE EXCEPTION 'no_tickets' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT kt.order_id ORDER BY kt.order_id), ARRAY[]::bigint[])
  INTO v_order_ids
  FROM public.kds_tickets kt
  WHERE kt.id = ANY(v_ticket_ids)
    AND kt.tenant_id = public.auth_tenant_id()
    AND kt.branch_id = p_branch_id
    AND (public.auth_role() = 'owner' OR kt.branch_id = public.auth_branch_id());

  FOREACH v_order_id IN ARRAY v_order_ids LOOP
    PERFORM pg_advisory_xact_lock(v_order_id);
  END LOOP;

  WITH locked AS (
    SELECT kt.id
    FROM public.kds_tickets kt
    WHERE kt.id = ANY(v_ticket_ids)
      AND kt.tenant_id = public.auth_tenant_id()
      AND kt.branch_id = p_branch_id
      AND (public.auth_role() = 'owner' OR kt.branch_id = public.auth_branch_id())
    FOR UPDATE
  )
  SELECT COUNT(*) INTO v_locked_count
  FROM locked;

  IF v_locked_count <> v_requested_count THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COUNT(DISTINCT CASE
    WHEN o.order_type IN ('takeaway', 'delivery') THEN 'order:' || kt.order_id::text
    WHEN kt.kitchen_send_batch_id IS NOT NULL THEN 'batch:' || kt.kitchen_send_batch_id::text
    ELSE 'order:' || kt.order_id::text
  END)
  INTO v_group_count
  FROM public.kds_tickets kt
  JOIN public.orders o
    ON o.tenant_id = kt.tenant_id
   AND o.id = kt.order_id
  WHERE kt.id = ANY(v_ticket_ids)
    AND kt.tenant_id = public.auth_tenant_id()
    AND kt.branch_id = p_branch_id;

  IF v_group_count <> 1 THEN
    RAISE EXCEPTION 'mixed_kds_card' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT kt.order_id), ARRAY[]::bigint[])
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
        first_ready_at = COALESCE(first_ready_at, now()),
        updated_at = now()
    WHERE kt.id = ANY(v_ticket_ids)
      AND kt.tenant_id = public.auth_tenant_id()
      AND kt.branch_id = p_branch_id
      AND kt.status IN ('pending', 'preparing')
    RETURNING kt.id
  )
  SELECT
    COALESCE(array_agg(id), ARRAY[]::bigint[]),
    COUNT(*)
  INTO v_updated_ticket_ids, v_completed_count
  FROM updated;

  IF v_completed_count > 0 THEN
    BEGIN
      v_print_result := private.enqueue_kitchen_completion_print_internal(
        p_branch_id,
        v_updated_ticket_ids,
        v_uid
      );

      IF COALESCE((v_print_result->>'skipped_ticket_count')::int, 0) > 0 THEN
        v_print_warning := 'kitchen_print_skipped';
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        v_print_warning := 'kitchen_print_enqueue_failed';
        v_print_result := jsonb_build_object(
          'jobs', '[]'::jsonb,
          'requested_ticket_count', v_completed_count,
          'printed_ticket_count', 0,
          'skipped_ticket_count', v_completed_count
        );
        RAISE LOG 'complete_kds_tickets print enqueue skipped branch_id=%, ticket_ids=%, sqlstate=%, error=%',
          p_branch_id,
          v_updated_ticket_ids,
          SQLSTATE,
          SQLERRM;
    END;
  END IF;

  FOREACH v_order_id IN ARRAY v_order_ids LOOP
    PERFORM public.check_order_ready(v_order_id);
    PERFORM public.post_pos_sale_consumption_if_ready(v_order_id, v_uid);
  END LOOP;

  RETURN jsonb_build_object(
    'requested_count', v_requested_count,
    'completed_count', v_completed_count,
    'print_jobs', COALESCE(v_print_result->'jobs', '[]'::jsonb),
    'printed_ticket_count', COALESCE((v_print_result->>'printed_ticket_count')::int, 0),
    'skipped_ticket_count', COALESCE((v_print_result->>'skipped_ticket_count')::int, 0),
    'print_warning', v_print_warning
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_kds_tickets(bigint, bigint[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.complete_kds_tickets(bigint, bigint[]) TO authenticated;
GRANT ALL ON FUNCTION public.complete_kds_tickets(bigint, bigint[]) TO service_role;

COMMENT ON FUNCTION public.complete_kds_tickets(p_branch_id bigint, p_ticket_ids bigint[]) IS 'Atomically marks visible pending/preparing KDS tickets ready and queues matching kitchen print jobs for the completed tickets only. Supports multi-batch takeaway/delivery card grouping. Does not close POS/payment/table state.';
