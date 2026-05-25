-- =========================================================================
-- POS/KDS: fix DB-triggered kitchen print enqueue
--
-- 20260601910000 made KDS ticket creation call enqueue_kitchen_print(...) from
-- a deferred trigger. Live logs showed two remaining failure modes:
-- - requestless/internal trigger context can have auth.uid() = NULL
-- - the aggregate route query referenced ksb.id from a grouped outer query
--
-- Keep public RPC auth behavior unchanged by making enqueue_kitchen_print(...)
-- a thin wrapper over an ungranted internal helper. The KDS trigger calls the
-- helper after order/KDS creation has already succeeded.
-- =========================================================================

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.enqueue_kitchen_print_internal(
  p_order_id BIGINT,
  p_actor_override UUID DEFAULT NULL,
  p_enforce_request_auth BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_uid            UUID;
  v_uid                    UUID;
  v_order                  public.orders%ROWTYPE;
  v_table_no               INT;
  v_cashier_name           TEXT;
  v_route                  RECORD;
  v_payload                JSONB;
  v_idempotency            TEXT;
  v_job_id                 BIGINT;
  v_jobs                   JSONB := '[]'::jsonb;
  v_mapped_pending         INT;
  v_null_batch_pending     INT;
  v_fallback_batch_id      BIGINT;
  v_fallback_ticket_number TEXT;
  v_fallback_send_seq      INT;
  v_fallback_kind          TEXT;
  v_ticket_seq             INT;
  v_date_part              TEXT;
BEGIN
  v_request_uid := auth.uid();

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_enforce_request_auth THEN
    IF v_request_uid IS NULL THEN
      RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
    END IF;

    IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
      RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission_any('pos:send_kitchen') THEN
      RAISE EXCEPTION 'permission denied: pos:send_kitchen' USING ERRCODE = '42501';
    END IF;

    v_uid := v_request_uid;
  ELSE
    v_uid := COALESCE(p_actor_override, v_request_uid, v_order.created_by);
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
    END IF;
  END IF;

  IF v_order.table_id IS NOT NULL THEN
    SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
  END IF;

  SELECT full_name INTO v_cashier_name
  FROM public.profiles WHERE id = v_order.created_by;

  SELECT COUNT(*)
  INTO v_mapped_pending
  FROM public.order_items oi
  JOIN public.menu_items mi ON mi.id = oi.menu_item_id
  JOIN public.printer_menu_categories pmc
    ON pmc.category_id = mi.category_id
   AND pmc.tenant_id = v_order.tenant_id
   AND pmc.branch_id = v_order.branch_id
  WHERE oi.order_id = p_order_id
    AND oi.sent_to_kitchen_at IS NULL;

  IF v_mapped_pending = 0 THEN
    RETURN jsonb_build_object(
      'order_id', p_order_id,
      'send_seq', v_order.kitchen_send_count,
      'jobs', v_jobs
    );
  END IF;

  SELECT COUNT(*)
  INTO v_null_batch_pending
  FROM public.order_items oi
  JOIN public.menu_items mi ON mi.id = oi.menu_item_id
  JOIN public.printer_menu_categories pmc
    ON pmc.category_id = mi.category_id
   AND pmc.tenant_id = v_order.tenant_id
   AND pmc.branch_id = v_order.branch_id
  LEFT JOIN public.kds_tickets kt
    ON kt.tenant_id = v_order.tenant_id
   AND kt.order_item_id = oi.id
  LEFT JOIN public.kitchen_send_batches ksb
    ON ksb.id = kt.kitchen_send_batch_id
  WHERE oi.order_id = p_order_id
    AND oi.sent_to_kitchen_at IS NULL
    AND ksb.id IS NULL;

  IF v_null_batch_pending > 0 THEN
    SELECT ksb.id, ksb.kitchen_ticket_number, ksb.send_seq, ksb.kind
    INTO v_fallback_batch_id, v_fallback_ticket_number, v_fallback_send_seq, v_fallback_kind
    FROM public.order_items oi
    JOIN public.kds_tickets kt
      ON kt.tenant_id = v_order.tenant_id
     AND kt.order_item_id = oi.id
    JOIN public.kitchen_send_batches ksb
      ON ksb.id = kt.kitchen_send_batch_id
    WHERE oi.order_id = p_order_id
      AND oi.sent_to_kitchen_at IS NULL
    ORDER BY ksb.created_at DESC, ksb.id DESC
    LIMIT 1;

    IF v_fallback_batch_id IS NULL THEN
      UPDATE public.orders
         SET kitchen_send_count = kitchen_send_count + 1
       WHERE id = p_order_id
       RETURNING kitchen_send_count INTO v_fallback_send_seq;

      INSERT INTO public.kitchen_daily_counters (
        tenant_id, branch_id, counter_date, last_seq
      )
      VALUES (
        v_order.tenant_id,
        v_order.branch_id,
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
        1
      )
      ON CONFLICT (tenant_id, branch_id, counter_date)
      DO UPDATE SET
        last_seq = public.kitchen_daily_counters.last_seq + 1,
        updated_at = now()
      RETURNING last_seq INTO v_ticket_seq;

      v_date_part := to_char(
        CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh',
        'YYMMDD'
      );
      v_fallback_ticket_number := 'PB-' || v_date_part || '-' || lpad(v_ticket_seq::TEXT, 3, '0');
      v_fallback_kind := CASE WHEN v_fallback_send_seq = 1 THEN 'initial' ELSE 'append' END;

      INSERT INTO public.kitchen_send_batches (
        tenant_id, branch_id, order_id, counter_date, ticket_seq,
        kitchen_ticket_number, send_seq, kind, created_by
      )
      VALUES (
        v_order.tenant_id,
        v_order.branch_id,
        p_order_id,
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
        v_ticket_seq,
        v_fallback_ticket_number,
        v_fallback_send_seq,
        v_fallback_kind,
        v_uid
      )
      RETURNING id INTO v_fallback_batch_id;
    END IF;

    UPDATE public.kds_tickets kt
       SET kitchen_send_batch_id = v_fallback_batch_id,
           updated_at = now()
      FROM public.order_items oi
      JOIN public.menu_items mi ON mi.id = oi.menu_item_id
      JOIN public.printer_menu_categories pmc
        ON pmc.category_id = mi.category_id
       AND pmc.tenant_id = v_order.tenant_id
       AND pmc.branch_id = v_order.branch_id
     WHERE kt.tenant_id = v_order.tenant_id
       AND kt.order_item_id = oi.id
       AND oi.order_id = p_order_id
       AND oi.sent_to_kitchen_at IS NULL
       AND kt.kitchen_send_batch_id IS NULL;
  END IF;

  FOR v_route IN
    WITH routed_items AS (
      SELECT
        p.id AS printer_id,
        p.role AS printer_role,
        CASE WHEN p.role = 'kitchen_2' THEN 2 ELSE 1 END AS slot,
        COALESCE(ksb.id, v_fallback_batch_id) AS batch_id,
        COALESCE(ksb.kitchen_ticket_number, v_fallback_ticket_number) AS kitchen_ticket_number,
        COALESCE(ksb.send_seq, v_fallback_send_seq) AS send_seq,
        COALESCE(ksb.kind, v_fallback_kind) AS send_kind,
        COALESCE(ksb.created_at, now()) AS batch_created_at,
        oi.id AS order_item_id,
        jsonb_build_object(
          'item_name',    oi.item_name,
          'variant_name', oi.variant_name,
          'quantity',     oi.quantity,
          'modifiers',    oi.modifiers,
          'sides',        oi.sides,
          'note',         oi.note
        ) AS item_payload
      FROM public.order_items oi
      JOIN public.menu_items mi ON mi.id = oi.menu_item_id
      JOIN public.printer_menu_categories pmc
        ON pmc.category_id = mi.category_id
       AND pmc.tenant_id = v_order.tenant_id
       AND pmc.branch_id = v_order.branch_id
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
      LEFT JOIN public.kds_tickets kt
        ON kt.tenant_id = v_order.tenant_id
       AND kt.order_item_id = oi.id
      LEFT JOIN public.kitchen_send_batches ksb
        ON ksb.id = kt.kitchen_send_batch_id
      WHERE oi.order_id = p_order_id
        AND oi.sent_to_kitchen_at IS NULL
    ),
    grouped_routes AS (
      SELECT
        printer_id,
        printer_role,
        slot,
        batch_id,
        kitchen_ticket_number,
        send_seq,
        send_kind,
        batch_created_at,
        array_agg(order_item_id ORDER BY order_item_id) AS item_ids,
        jsonb_agg(item_payload ORDER BY order_item_id) AS items
      FROM routed_items
      GROUP BY
        printer_id,
        printer_role,
        slot,
        batch_id,
        kitchen_ticket_number,
        send_seq,
        send_kind,
        batch_created_at
    )
    SELECT
      gr.*,
      EXISTS (
        SELECT 1
        FROM public.order_items sent_oi
        JOIN public.kds_tickets sent_kt
          ON sent_kt.tenant_id = v_order.tenant_id
         AND sent_kt.order_item_id = sent_oi.id
        WHERE sent_oi.order_id = p_order_id
          AND sent_oi.sent_to_kitchen_at IS NOT NULL
          AND sent_kt.kitchen_send_batch_id = gr.batch_id
      ) AS batch_has_sent_items
    FROM grouped_routes gr
    ORDER BY gr.batch_created_at, gr.printer_role, gr.printer_id
  LOOP
    v_job_id := NULL;

    v_payload := jsonb_build_object(
      'kind',                  'kitchen_ticket',
      'kitchen_ticket_number', v_route.kitchen_ticket_number,
      'source_order_number',   v_order.order_number,
      'order_number',          v_order.order_number,
      'order_type',            v_order.order_type,
      'table_number',          v_table_no,
      'cashier_name',          COALESCE(v_cashier_name, ''),
      'send_seq',              v_route.send_seq,
      'send_kind',             CASE
                                  WHEN v_route.batch_has_sent_items THEN 'append'
                                  ELSE v_route.send_kind
                                END,
      'slot',                  v_route.slot,
      'note',                  v_order.note,
      'items',                 v_route.items,
      'printed_at',            to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                       'YYYY-MM-DD"T"HH24:MI:SS')
    );

    v_idempotency := 'order:' || p_order_id::TEXT
      || ':kitchen:printer:' || v_route.printer_id::TEXT
      || ':batch:' || v_route.batch_id::TEXT
      || ':items:' || md5(array_to_string(v_route.item_ids, ','));

    INSERT INTO public.print_jobs (
      tenant_id, branch_id, printer_id, job_type,
      order_id, payload, idempotency_key, created_by
    )
    VALUES (
      v_order.tenant_id, v_order.branch_id, v_route.printer_id, 'kitchen_ticket',
      p_order_id, v_payload, v_idempotency, v_uid
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_job_id;

    IF v_job_id IS NULL THEN
      SELECT id INTO v_job_id
      FROM public.print_jobs
      WHERE idempotency_key = v_idempotency;
    END IF;

    UPDATE public.order_items
       SET sent_to_kitchen_at = now()
     WHERE id = ANY(v_route.item_ids)
       AND sent_to_kitchen_at IS NULL;

    v_jobs := v_jobs || jsonb_build_object(
      'slot', v_route.slot,
      'printer_id', v_route.printer_id,
      'job_id', v_job_id,
      'item_count', jsonb_array_length(v_route.items),
      'kitchen_ticket_number', v_route.kitchen_ticket_number,
      'send_seq', v_route.send_seq
    );
  END LOOP;

  IF jsonb_array_length(v_jobs) = 0 THEN
    RAISE EXCEPTION 'no active kitchen printer for branch %', v_order.branch_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'send_seq', COALESCE(v_fallback_send_seq, v_order.kitchen_send_count),
    'jobs', v_jobs
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_kitchen_print(
  p_order_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN private.enqueue_kitchen_print_internal(p_order_id, NULL, TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_enqueue_kitchen_print_from_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.kitchen_send_batch_id IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    PERFORM private.enqueue_kitchen_print_internal(NEW.order_id, NULL, FALSE);
  EXCEPTION
    WHEN OTHERS THEN
      RAISE LOG 'auto_enqueue_kitchen_print_from_ticket skipped order_id=%, ticket_id=%, sqlstate=%, error=%',
        NEW.order_id,
        NEW.id,
        SQLSTATE,
        SQLERRM;
      RETURN NULL;
  END;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.enqueue_kitchen_print_internal(BIGINT, UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_kitchen_print(BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_enqueue_kitchen_print_from_ticket() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.enqueue_kitchen_print(BIGINT) TO authenticated;
