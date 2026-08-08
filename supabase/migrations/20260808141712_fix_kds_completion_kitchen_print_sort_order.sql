-- Fix KDS completion kitchen print: LATERAL printer projection omitted
-- sort_order while the outer SELECT used printer.sort_order for slot.
-- complete_kds_tickets swallowed the error as kitchen_print_enqueue_failed.

CREATE OR REPLACE FUNCTION private.enqueue_kitchen_completion_print_internal(
  p_branch_id bigint,
  p_ticket_ids bigint[],
  p_actor uuid DEFAULT NULL::uuid
) RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  SET join_collapse_limit TO '1'
  SET from_collapse_limit TO '1'
AS $$
DECLARE
  v_ticket_ids bigint[] := ARRAY[]::bigint[];
  v_requested_count integer := 0;
  v_printed_ticket_count integer := 0;
  v_route record;
  v_payload jsonb;
  v_idempotency text;
  v_job_id bigint;
  v_jobs jsonb := '[]'::jsonb;
BEGIN
  SELECT COALESCE(
    array_agg(DISTINCT ticket_id),
    ARRAY[]::bigint[]
  )
  INTO v_ticket_ids
  FROM unnest(
    COALESCE(p_ticket_ids, ARRAY[]::bigint[])
  ) AS input(ticket_id)
  WHERE ticket_id IS NOT NULL
    AND ticket_id > 0;

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
        ticket.id AS ticket_id,
        ticket.order_id,
        ticket.order_item_id,
        orders.tenant_id,
        orders.branch_id,
        orders.order_number,
        orders.order_type,
        orders.note AS order_note,
        dining_table.number AS table_number,
        COALESCE(profile.full_name, '') AS cashier_name,
        printer.id AS printer_id,
        printer.role AS printer_role,
        (printer.sort_order + 1)::smallint AS slot,
        COALESCE(
          batch.kitchen_ticket_number,
          orders.order_number
        ) AS kitchen_ticket_number,
        COALESCE(batch.send_seq, orders.kitchen_send_count) AS send_seq,
        COALESCE(batch.kind, 'manual') AS send_kind,
        jsonb_build_object(
          'order_item_id', item.id,
          'ticket_id', ticket.id,
          'item_name', item.item_name,
          'variant_name', item.variant_name,
          'quantity', item.quantity,
          'modifiers', item.modifiers,
          'sides', item.sides,
          'note', item.note
        ) AS item_payload
      FROM public.kds_tickets ticket
      JOIN public.order_items item
        ON item.tenant_id = ticket.tenant_id
       AND item.id = ticket.order_item_id
      JOIN public.orders orders
        ON orders.tenant_id = ticket.tenant_id
       AND orders.id = ticket.order_id
      LEFT JOIN public.tables dining_table
        ON dining_table.id = orders.table_id
      LEFT JOIN public.profiles profile
        ON profile.id = orders.created_by
      JOIN public.menu_items menu_item
        ON menu_item.id = item.menu_item_id
      JOIN LATERAL (
        SELECT
          candidate.id,
          candidate.role,
          candidate.sort_order
        FROM public.printers candidate
        JOIN public.printer_print_types print_type
          ON print_type.printer_id = candidate.id
         AND print_type.tenant_id = candidate.tenant_id
         AND print_type.branch_id = candidate.branch_id
         AND print_type.print_type = 'kitchen_ticket'
        LEFT JOIN public.printer_menu_categories route
          ON route.printer_id = candidate.id
         AND route.tenant_id = candidate.tenant_id
         AND route.branch_id = candidate.branch_id
         AND route.category_id = menu_item.category_id
        WHERE candidate.tenant_id = orders.tenant_id
          AND candidate.branch_id = orders.branch_id
          AND candidate.is_active IS TRUE
          AND (
            route.id IS NOT NULL
            OR NOT EXISTS (
              SELECT 1
              FROM public.printer_menu_categories route_any
              WHERE route_any.tenant_id = orders.tenant_id
                AND route_any.branch_id = orders.branch_id
                AND route_any.category_id = menu_item.category_id
            )
          )
        ORDER BY
          CASE WHEN route.id IS NOT NULL THEN 0 ELSE 1 END,
          candidate.sort_order,
          candidate.id
        LIMIT 1
      ) printer ON true
      LEFT JOIN public.kitchen_send_batches batch
        ON batch.id = ticket.kitchen_send_batch_id
      WHERE ticket.id = ANY(v_ticket_ids)
        AND ticket.branch_id = p_branch_id
        AND item.sent_to_kitchen_at IS NULL
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
      'order_item_ids', to_jsonb(v_route.item_ids),
      'ticket_ids', to_jsonb(v_route.ticket_ids),
      'items', v_route.items,
      'printed_at', to_char(
        now() AT TIME ZONE 'Asia/Ho_Chi_Minh',
        'YYYY-MM-DD"T"HH24:MI:SS'
      )
    );

    v_idempotency := 'order:' || v_route.order_id::text
      || ':kds-complete:printer:' || v_route.printer_id::text
      || ':tickets:' || md5(array_to_string(v_route.ticket_ids, ','));

    INSERT INTO public.print_jobs (
      tenant_id,
      branch_id,
      printer_id,
      job_type,
      order_id,
      payload,
      idempotency_key,
      created_by
    ) VALUES (
      v_route.tenant_id,
      v_route.branch_id,
      v_route.printer_id,
      'kitchen_ticket',
      v_route.order_id,
      v_payload,
      v_idempotency,
      p_actor
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_job_id;

    IF v_job_id IS NULL THEN
      SELECT job.id
      INTO v_job_id
      FROM public.print_jobs job
      WHERE job.idempotency_key = v_idempotency;
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
      'ticket_count', COALESCE(
        array_length(v_route.ticket_ids, 1),
        0
      ),
      'kitchen_ticket_number', v_route.kitchen_ticket_number,
      'send_seq', v_route.send_seq
    );
  END LOOP;

  RETURN jsonb_build_object(
    'jobs', v_jobs,
    'requested_ticket_count', v_requested_count,
    'printed_ticket_count', v_printed_ticket_count,
    'skipped_ticket_count', GREATEST(
      v_requested_count - v_printed_ticket_count,
      0
    )
  );
END;
$$;
