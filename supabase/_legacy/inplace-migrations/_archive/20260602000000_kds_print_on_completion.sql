-- ============================================================================
-- POS/KDS: print kitchen slips when KDS marks work complete
--
-- New operating rule:
--   - POS "Gửi bếp" creates/routes KDS tickets only; it must not print paper.
--   - KDS completing one item prints that item only.
--   - KDS completing a kitchen card prints only the active tickets completed by
--     that RPC call, excluding tickets already ready/cancelled.
--
-- The durable transport remains print_jobs -> print-agent -> LAN printer.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS private;

DROP TRIGGER IF EXISTS trg_auto_enqueue_kitchen_print_from_ticket
  ON public.kds_tickets;

CREATE OR REPLACE FUNCTION private.enqueue_kitchen_completion_print_internal(
  p_branch_id BIGINT,
  p_ticket_ids BIGINT[],
  p_actor UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_requested_count INT := 0;
  v_printed_ticket_count INT := 0;
  v_route RECORD;
  v_payload JSONB;
  v_idempotency TEXT;
  v_job_id BIGINT;
  v_jobs JSONB := '[]'::jsonb;
BEGIN
  SELECT COALESCE(array_agg(DISTINCT ticket_id), ARRAY[]::BIGINT[])
  INTO v_ticket_ids
  FROM unnest(COALESCE(p_ticket_ids, ARRAY[]::BIGINT[])) AS input(ticket_id)
  WHERE ticket_id IS NOT NULL AND ticket_id > 0;

  v_requested_count := COALESCE(array_length(v_ticket_ids, 1), 0);

  IF v_requested_count = 0 THEN
    RETURN jsonb_build_object(
      'jobs', v_jobs,
      'requested_ticket_count', 0,
      'printed_ticket_count', 0,
      'skipped_ticket_count', 0
    );
  END IF;

  FOR v_route IN
    WITH routed_items AS (
      SELECT
        kt.id AS ticket_id,
        kt.order_id,
        kt.order_item_id,
        kt.kitchen_send_batch_id,
        o.tenant_id,
        o.branch_id,
        o.order_number,
        o.order_type,
        o.note AS order_note,
        tbl.number AS table_number,
        COALESCE(profile.full_name, '') AS cashier_name,
        p.id AS printer_id,
        p.role AS printer_role,
        CASE WHEN p.role = 'kitchen_2' THEN 2 ELSE 1 END AS slot,
        COALESCE(ksb.kitchen_ticket_number, o.order_number) AS kitchen_ticket_number,
        COALESCE(ksb.send_seq, o.kitchen_send_count) AS send_seq,
        COALESCE(ksb.kind, 'manual') AS send_kind,
        jsonb_build_object(
          'item_name', oi.item_name,
          'variant_name', oi.variant_name,
          'quantity', oi.quantity,
          'modifiers', oi.modifiers,
          'sides', oi.sides,
          'note', oi.note
        ) AS item_payload
      FROM public.kds_tickets kt
      JOIN public.order_items oi
        ON oi.tenant_id = kt.tenant_id
       AND oi.id = kt.order_item_id
      JOIN public.orders o
        ON o.tenant_id = kt.tenant_id
       AND o.id = kt.order_id
      LEFT JOIN public.tables tbl
        ON tbl.id = o.table_id
      LEFT JOIN public.profiles profile
        ON profile.id = o.created_by
      JOIN public.menu_items mi
        ON mi.id = oi.menu_item_id
      JOIN public.printer_menu_categories pmc
        ON pmc.category_id = mi.category_id
       AND pmc.tenant_id = o.tenant_id
       AND pmc.branch_id = o.branch_id
      JOIN public.printers p
        ON p.id = pmc.printer_id
       AND p.tenant_id = pmc.tenant_id
       AND p.branch_id = pmc.branch_id
       AND p.is_active = TRUE
      JOIN public.printer_print_types ppt
        ON ppt.printer_id = p.id
       AND ppt.tenant_id = p.tenant_id
       AND ppt.branch_id = p.branch_id
       AND ppt.print_type = 'kitchen_ticket'
      LEFT JOIN public.kitchen_send_batches ksb
        ON ksb.id = kt.kitchen_send_batch_id
      WHERE kt.id = ANY(v_ticket_ids)
        AND kt.branch_id = p_branch_id
        AND oi.sent_to_kitchen_at IS NULL
    ),
    grouped_routes AS (
      SELECT
        tenant_id,
        branch_id,
        order_id,
        printer_id,
        printer_role,
        slot,
        kitchen_ticket_number,
        order_number,
        order_type,
        table_number,
        cashier_name,
        send_seq,
        send_kind,
        order_note,
        array_agg(order_item_id ORDER BY order_item_id) AS item_ids,
        array_agg(ticket_id ORDER BY order_item_id) AS ticket_ids,
        jsonb_agg(item_payload ORDER BY order_item_id) AS items
      FROM routed_items
      GROUP BY
        tenant_id,
        branch_id,
        order_id,
        printer_id,
        printer_role,
        slot,
        kitchen_ticket_number,
        order_number,
        order_type,
        table_number,
        cashier_name,
        send_seq,
        send_kind,
        order_note
    )
    SELECT *
    FROM grouped_routes
    ORDER BY order_id, printer_role, printer_id
  LOOP
    v_job_id := NULL;

    v_payload := jsonb_build_object(
      'kind', 'kitchen_ticket',
      'kitchen_ticket_number', v_route.kitchen_ticket_number,
      'source_order_number', v_route.order_number,
      'order_number', v_route.order_number,
      'order_type', v_route.order_type,
      'table_number', v_route.table_number,
      'cashier_name', v_route.cashier_name,
      'send_seq', v_route.send_seq,
      'send_kind', v_route.send_kind,
      'slot', v_route.slot,
      'note', v_route.order_note,
      'items', v_route.items,
      'printed_at', to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh',
                            'YYYY-MM-DD"T"HH24:MI:SS')
    );

    v_idempotency := 'order:' || v_route.order_id::TEXT
      || ':kds-complete:printer:' || v_route.printer_id::TEXT
      || ':tickets:' || md5(array_to_string(v_route.ticket_ids, ','));

    INSERT INTO public.print_jobs (
      tenant_id, branch_id, printer_id, job_type,
      order_id, payload, idempotency_key, created_by
    )
    VALUES (
      v_route.tenant_id, v_route.branch_id, v_route.printer_id,
      'kitchen_ticket', v_route.order_id, v_payload, v_idempotency, p_actor
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_job_id;

    IF v_job_id IS NULL THEN
      SELECT id INTO v_job_id
      FROM public.print_jobs
      WHERE idempotency_key = v_idempotency;
    END IF;

    UPDATE public.order_items
       SET sent_to_kitchen_at = COALESCE(sent_to_kitchen_at, now())
     WHERE id = ANY(v_route.item_ids)
       AND sent_to_kitchen_at IS NULL;

    v_printed_ticket_count := v_printed_ticket_count
      + COALESCE(array_length(v_route.ticket_ids, 1), 0);

    v_jobs := v_jobs || jsonb_build_object(
      'printer_id', v_route.printer_id,
      'job_id', v_job_id,
      'item_count', jsonb_array_length(v_route.items),
      'ticket_count', COALESCE(array_length(v_route.ticket_ids, 1), 0),
      'kitchen_ticket_number', v_route.kitchen_ticket_number,
      'send_seq', v_route.send_seq
    );
  END LOOP;

  RETURN jsonb_build_object(
    'jobs', v_jobs,
    'requested_ticket_count', v_requested_count,
    'printed_ticket_count', v_printed_ticket_count,
    'skipped_ticket_count', GREATEST(v_requested_count - v_printed_ticket_count, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION private.enqueue_kitchen_completion_print_internal(BIGINT, BIGINT[], UUID)
  FROM PUBLIC;

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
  v_updated_ticket_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_order_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_requested_count INT := 0;
  v_locked_count INT := 0;
  v_completed_count INT := 0;
  v_group_count INT := 0;
  v_order_id BIGINT;
  v_print_result JSONB := jsonb_build_object(
    'jobs', '[]'::jsonb,
    'requested_ticket_count', 0,
    'printed_ticket_count', 0,
    'skipped_ticket_count', 0
  );
  v_print_warning TEXT := NULL;
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
  SELECT
    COALESCE(array_agg(id), ARRAY[]::BIGINT[]),
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

      IF COALESCE((v_print_result->>'skipped_ticket_count')::INT, 0) > 0 THEN
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
  END LOOP;

  RETURN jsonb_build_object(
    'requested_count', v_requested_count,
    'completed_count', v_completed_count,
    'print_jobs', COALESCE(v_print_result->'jobs', '[]'::jsonb),
    'printed_ticket_count', COALESCE((v_print_result->>'printed_ticket_count')::INT, 0),
    'skipped_ticket_count', COALESCE((v_print_result->>'skipped_ticket_count')::INT, 0),
    'print_warning', v_print_warning
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_kds_tickets(BIGINT, BIGINT[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_kds_tickets(BIGINT, BIGINT[])
  TO authenticated;

COMMENT ON FUNCTION public.complete_kds_tickets(BIGINT, BIGINT[]) IS
  'Atomically marks visible pending/preparing KDS tickets ready and queues matching kitchen print jobs for the completed tickets only. Does not close POS/payment/table state.';

CREATE OR REPLACE FUNCTION public.enqueue_kitchen_print(
  p_order_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_order public.orders%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission_any('pos:send_kitchen') THEN
    RAISE EXCEPTION 'permission denied: pos:send_kitchen' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'send_seq', v_order.kitchen_send_count,
    'jobs', '[]'::jsonb,
    'deferred_to', 'kds_completion'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_kitchen_print(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_kitchen_print(BIGINT) TO authenticated;

COMMENT ON FUNCTION public.enqueue_kitchen_print(BIGINT) IS
  'Compatibility wrapper. POS send routes work to KDS; kitchen paper is queued by complete_kds_tickets when KDS marks items ready.';
