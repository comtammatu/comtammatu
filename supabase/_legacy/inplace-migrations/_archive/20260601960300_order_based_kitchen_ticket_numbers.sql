-- ============================================================================
-- POS/KDS: make kitchen ticket numbers follow the order number
--
-- Operational rule:
--   Order header #105 -> first kitchen ticket #105
--   Same order next kitchen send -> #105-2, then #105-3, ...
--
-- `ticket_seq` and `kitchen_daily_counters` stay in place as internal daily
-- uniqueness/audit machinery. The operator-visible PB code is now derived from
-- orders.order_number + kitchen_send_batches.send_seq.
-- ============================================================================

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT c.conname
    INTO v_constraint_name
    FROM pg_constraint c
   WHERE c.conrelid = 'public.kitchen_send_batches'::regclass
     AND c.contype = 'u'
     AND (
       SELECT array_agg(a.attname ORDER BY cols.ordinality)
         FROM unnest(c.conkey) WITH ORDINALITY AS cols(attnum, ordinality)
         JOIN pg_attribute a
           ON a.attrelid = c.conrelid
          AND a.attnum = cols.attnum
     ) = ARRAY['tenant_id', 'branch_id', 'kitchen_ticket_number']::name[];

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.kitchen_send_batches DROP CONSTRAINT %I',
      v_constraint_name
    );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS kitchen_send_batches_branch_date_ticket_number_unique
  ON public.kitchen_send_batches (
    tenant_id,
    branch_id,
    counter_date,
    kitchen_ticket_number
  );

CREATE OR REPLACE FUNCTION public.route_order_to_kds(p_order_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_station_id BIGINT;
  v_fallback_station_id BIGINT;
  v_batch_id BIGINT;
  v_send_seq INT;
  v_ticket_seq INT;
  v_order_number_clean TEXT;
  v_order_number_match TEXT[];
  v_ticket_base TEXT;
  v_ticket_number TEXT;
  v_ticket_id BIGINT;
BEGIN
  SELECT tenant_id, branch_id, order_number, kitchen_send_count
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id = public.auth_tenant_id()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT s.id INTO v_fallback_station_id
  FROM public.kds_stations s
  LEFT JOIN public.kds_station_categories sc ON sc.station_id = s.id
  WHERE s.branch_id = v_order.branch_id
    AND s.tenant_id = v_order.tenant_id
    AND s.is_active = TRUE
    AND sc.id IS NULL
  ORDER BY s.position
  LIMIT 1;

  FOR v_item IN
    SELECT oi.id AS order_item_id, mi.category_id
    FROM public.order_items oi
    JOIN public.menu_items mi ON mi.id = oi.menu_item_id
    WHERE oi.order_id = p_order_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.kds_tickets kt
        WHERE kt.tenant_id = v_order.tenant_id
          AND kt.order_item_id = oi.id
      )
    ORDER BY oi.id
  LOOP
    SELECT sc.station_id INTO v_station_id
    FROM public.kds_station_categories sc
    JOIN public.kds_stations s ON s.id = sc.station_id
    WHERE sc.category_id = v_item.category_id
      AND s.branch_id = v_order.branch_id
      AND s.tenant_id = v_order.tenant_id
      AND s.is_active = TRUE
    LIMIT 1;

    IF v_station_id IS NULL THEN
      v_station_id := v_fallback_station_id;
    END IF;

    IF v_station_id IS NOT NULL THEN
      IF v_batch_id IS NULL THEN
        UPDATE public.orders
           SET kitchen_send_count = kitchen_send_count + 1
         WHERE id = p_order_id
         RETURNING kitchen_send_count INTO v_send_seq;

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

        v_order_number_clean := regexp_replace(
          btrim(COALESCE(v_order.order_number, '')),
          '^#+',
          ''
        );
        v_order_number_match := regexp_match(
          v_order_number_clean,
          '^(?:TC|MV)-(?:(?:[0-9]{6}|[0-9]{8})-)?([0-9]{1,5})(?:-.+)?$',
          'i'
        );
        v_ticket_base := COALESCE(
          v_order_number_match[1],
          NULLIF(v_order_number_clean, ''),
          p_order_id::TEXT
        );
        v_ticket_number := '#' || v_ticket_base
          || CASE WHEN v_send_seq > 1 THEN '-' || v_send_seq::TEXT ELSE '' END;

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
          v_ticket_number,
          v_send_seq,
          CASE WHEN v_send_seq = 1 THEN 'initial' ELSE 'append' END,
          auth.uid()
        )
        RETURNING id INTO v_batch_id;
      END IF;

      INSERT INTO public.kds_tickets (
        tenant_id, branch_id, station_id, order_id, order_item_id,
        kitchen_send_batch_id
      )
      VALUES (
        v_order.tenant_id, v_order.branch_id, v_station_id,
        p_order_id, v_item.order_item_id, v_batch_id
      )
      ON CONFLICT (order_item_id, station_id, tenant_id) DO NOTHING
      RETURNING id INTO v_ticket_id;
    END IF;
  END LOOP;
END;
$$;

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
  v_order_number_clean     TEXT;
  v_order_number_match     TEXT[];
  v_ticket_base            TEXT;
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

      v_order_number_clean := regexp_replace(
        btrim(COALESCE(v_order.order_number, '')),
        '^#+',
        ''
      );
      v_order_number_match := regexp_match(
        v_order_number_clean,
        '^(?:TC|MV)-(?:(?:[0-9]{6}|[0-9]{8})-)?([0-9]{1,5})(?:-.+)?$',
        'i'
      );
      v_ticket_base := COALESCE(
        v_order_number_match[1],
        NULLIF(v_order_number_clean, ''),
        p_order_id::TEXT
      );
      v_fallback_ticket_number := '#' || v_ticket_base
        || CASE
             WHEN v_fallback_send_seq > 1
               THEN '-' || v_fallback_send_seq::TEXT
             ELSE ''
           END;
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

COMMENT ON TABLE public.kitchen_send_batches IS
  'Kitchen queue batches. kitchen_ticket_number is the operator-visible PB code derived from order_number and send_seq, e.g. #105, #105-2.';

COMMENT ON COLUMN public.kitchen_send_batches.kitchen_ticket_number IS
  'Operator-visible kitchen ticket code. First send follows the order display sequence; later sends append -{send_seq}.';

REVOKE ALL ON FUNCTION public.route_order_to_kds(BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.enqueue_kitchen_print_internal(BIGINT, UUID, BOOLEAN) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.route_order_to_kds(BIGINT) TO authenticated;
