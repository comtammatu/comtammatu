CREATE FUNCTION private.canonicalize_shift_close_print_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.pos_sessions%ROWTYPE;
  v_payment_breakdown jsonb;
  v_total_revenue numeric;
  v_paid_order_count integer;
  v_payment_attempt_count integer;
  v_item_counts jsonb;
  v_payment_exceptions jsonb;
BEGIN
  IF NEW.job_type <> 'shift_close_report' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.payload->>'session_id', '') !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'shift_close_session_id_missing'
      USING ERRCODE = '23514';
  END IF;

  SELECT *
  INTO v_session
  FROM public.pos_sessions session
  WHERE session.id = (NEW.payload->>'session_id')::bigint
    AND session.tenant_id = NEW.tenant_id
    AND session.branch_id = NEW.branch_id;

  IF v_session.id IS NULL OR v_session.status <> 'closed' THEN
    RAISE EXCEPTION 'shift_close_session_invalid'
      USING ERRCODE = '23514';
  END IF;

  WITH eligible_payments AS (
    SELECT
      payment.order_id,
      payment.method,
      payment.amount
    FROM public.payments payment
    JOIN public.orders orders
      ON orders.id = payment.order_id
     AND orders.tenant_id = payment.tenant_id
     AND orders.branch_id = payment.branch_id
    WHERE payment.tenant_id = v_session.tenant_id
      AND orders.pos_session_id = v_session.id
      AND payment.status = 'completed'
      AND payment.paid_at IS NOT NULL
  ),
  grouped AS (
    SELECT
      payment.method,
      count(*)::integer AS payment_count,
      count(DISTINCT payment.order_id)::integer AS order_count,
      COALESCE(sum(payment.amount), 0)::numeric AS amount
    FROM eligible_payments payment
    GROUP BY payment.method
  )
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'method', grouped.method,
        'count', grouped.payment_count,
        'order_count', grouped.order_count,
        'amount', grouped.amount
      )
      ORDER BY grouped.method
    ), '[]'::jsonb),
    COALESCE((
      SELECT sum(payment.amount) FROM eligible_payments payment
    ), 0)::numeric,
    COALESCE((
      SELECT count(DISTINCT payment.order_id)
      FROM eligible_payments payment
    ), 0)::integer
  INTO
    v_payment_breakdown,
    v_total_revenue,
    v_paid_order_count
  FROM grouped;

  SELECT count(*)::integer
  INTO v_payment_attempt_count
  FROM public.payments payment
  JOIN public.orders orders
    ON orders.id = payment.order_id
   AND orders.tenant_id = payment.tenant_id
  WHERE payment.tenant_id = v_session.tenant_id
    AND orders.pos_session_id = v_session.id;

  WITH paid_orders AS (
    SELECT DISTINCT orders.id
    FROM public.orders orders
    JOIN public.payments payment
      ON payment.order_id = orders.id
     AND payment.tenant_id = orders.tenant_id
     AND payment.branch_id = orders.branch_id
    WHERE orders.tenant_id = v_session.tenant_id
      AND orders.pos_session_id = v_session.id
      AND payment.status = 'completed'
      AND payment.paid_at IS NOT NULL
  )
  SELECT jsonb_build_object(
    'item_row_count', count(*)::integer,
    'item_quantity', COALESCE(sum(item.quantity), 0)::integer,
    'main_dish_quantity', COALESCE(sum(item.quantity) FILTER (
      WHERE item.category_type_snapshot = 'main_dish'
    ), 0)::integer,
    'side_dish_quantity', COALESCE(sum(item.quantity) FILTER (
      WHERE item.category_type_snapshot = 'side_dish'
    ), 0)::integer,
    'legacy_unclassified_quantity', COALESCE(sum(item.quantity) FILTER (
      WHERE item.category_type_snapshot IS NULL
    ), 0)::integer,
    'legacy_current_main_dish_quantity', COALESCE(sum(item.quantity) FILTER (
      WHERE item.category_type_snapshot IS NULL
        AND current_category.type = 'main_dish'
    ), 0)::integer,
    'included_side_quantity', COALESCE(sum(
      item.quantity * COALESCE((
        SELECT sum(
          CASE
            WHEN COALESCE(side->>'quantity', '') ~ '^[0-9]+$'
              THEN (side->>'quantity')::integer
            ELSE 1
          END
        )
        FROM jsonb_array_elements(item.sides) side
      ), 0)
    ), 0)::integer
  )
  INTO v_item_counts
  FROM public.order_items item
  JOIN paid_orders paid_order
    ON paid_order.id = item.order_id
  LEFT JOIN public.menu_items current_item
    ON current_item.id = item.menu_item_id
   AND current_item.tenant_id = item.tenant_id
  LEFT JOIN public.menu_categories current_category
    ON current_category.id = current_item.category_id
   AND current_category.tenant_id = current_item.tenant_id
  WHERE item.tenant_id = v_session.tenant_id
    AND item.status <> 'cancelled';

  SELECT jsonb_build_object(
    'order_payment_state_mismatch_count', count(DISTINCT orders.id) FILTER (
      WHERE orders.payment_status IS DISTINCT FROM 'paid'
        OR orders.status = 'cancelled'
        OR payment.amount IS DISTINCT FROM orders.total_amount
    ),
    'late_payment_count', count(*) FILTER (
      WHERE payment.paid_at < v_session.opened_at
        OR payment.paid_at > v_session.closed_at
    ),
    'late_payment_amount', COALESCE(sum(payment.amount) FILTER (
      WHERE payment.paid_at < v_session.opened_at
        OR payment.paid_at > v_session.closed_at
    ), 0)
  )
  INTO v_payment_exceptions
  FROM public.payments payment
  JOIN public.orders orders
    ON orders.id = payment.order_id
   AND orders.tenant_id = payment.tenant_id
   AND orders.branch_id = payment.branch_id
  WHERE payment.tenant_id = v_session.tenant_id
    AND orders.pos_session_id = v_session.id
    AND payment.status = 'completed'
    AND payment.paid_at IS NOT NULL;

  NEW.payload := NEW.payload || jsonb_build_object(
    'paid_order_count', v_paid_order_count,
    'payment_attempt_count', v_payment_attempt_count,
    'payment_breakdown', v_payment_breakdown,
    'payment_exceptions', v_payment_exceptions,
    'total_revenue', v_total_revenue,
    'item_counts', v_item_counts,
    'printed_at', to_char(
      v_session.closed_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
      'YYYY-MM-DD"T"HH24:MI:SS'
    )
  );

  NEW.idempotency_key :=
    'session:' || v_session.id::text
    || ':shift_close:truth:v2:'
    || md5(NEW.payload::text);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.canonicalize_shift_close_print_evidence()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_00_shift_close_print_evidence
BEFORE INSERT
ON public.print_jobs
FOR EACH ROW
EXECUTE FUNCTION private.canonicalize_shift_close_print_evidence();

CREATE FUNCTION private.canonicalize_receipt_print_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_attempt_count integer;
  v_completed_total numeric;
BEGIN
  IF NEW.job_type <> 'receipt' THEN
    RETURN NEW;
  END IF;

  IF NEW.order_id IS NULL THEN
    RAISE EXCEPTION 'receipt_order_id_missing'
      USING ERRCODE = '23514';
  END IF;

  SELECT *
  INTO v_payment
  FROM public.payments payment
  WHERE payment.tenant_id = NEW.tenant_id
    AND payment.branch_id = NEW.branch_id
    AND payment.order_id = NEW.order_id
    AND payment.status = 'completed'
    AND payment.paid_at IS NOT NULL
  ORDER BY payment.paid_at DESC, payment.id DESC
  LIMIT 1;

  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'receipt_completed_payment_missing'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    count(*)::integer,
    COALESCE(sum(payment.amount) FILTER (
      WHERE payment.status = 'completed'
    ), 0)::numeric
  INTO v_attempt_count, v_completed_total
  FROM public.payments payment
  WHERE payment.tenant_id = NEW.tenant_id
    AND payment.order_id = NEW.order_id;

  NEW.payload := NEW.payload || jsonb_build_object(
    'payment_id', v_payment.id,
    'payment_method', v_payment.method,
    'payment_amount', v_payment.amount,
    'completed_payment_total', v_completed_total,
    'payment_attempt_count', v_attempt_count,
    'paid_at', to_char(
      v_payment.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
      'YYYY-MM-DD"T"HH24:MI:SS'
    ),
    'printed_at', to_char(
      v_payment.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
      'YYYY-MM-DD"T"HH24:MI:SS'
    )
  );

  NEW.idempotency_key :=
    'order:' || NEW.order_id::text
    || ':receipt:truth:v2:printer:' || NEW.printer_id::text
    || ':payment:' || v_payment.id::text
    || ':' || md5(NEW.payload::text);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.canonicalize_receipt_print_evidence()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_00_receipt_print_evidence
BEFORE INSERT
ON public.print_jobs
FOR EACH ROW
EXECUTE FUNCTION private.canonicalize_receipt_print_evidence();

CREATE FUNCTION private.version_provisional_print_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.job_type = 'provisional_bill' THEN
    NEW.idempotency_key := NEW.idempotency_key
      || ':truth:v2:printer:' || NEW.printer_id::text
      || ':' || md5(NEW.payload::text);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.version_provisional_print_evidence()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_00_provisional_print_evidence
BEFORE INSERT
ON public.print_jobs
FOR EACH ROW
EXECUTE FUNCTION private.version_provisional_print_evidence();

CREATE OR REPLACE FUNCTION private.enqueue_kitchen_completion_print_internal(
  p_branch_id bigint,
  p_ticket_ids bigint[],
  p_actor uuid DEFAULT NULL
)
RETURNS jsonb
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
        CASE WHEN printer.role = 'kitchen_2' THEN 2 ELSE 1 END AS slot,
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
          candidate.role
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
          CASE candidate.role
            WHEN 'kitchen_1' THEN 1
            WHEN 'kitchen_2' THEN 2
            ELSE 9
          END,
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

REVOKE ALL ON FUNCTION
  private.enqueue_kitchen_completion_print_internal(
    bigint,
    bigint[],
    uuid
  )
  FROM PUBLIC;
