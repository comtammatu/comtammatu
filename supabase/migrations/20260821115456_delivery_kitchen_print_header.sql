-- Delivery kitchen print header: 2 lines (Platform Name, Order Ref), no 'Mang về'
-- Pass delivery_platform and external_order_ref into print payload.

-- ---------------------------------------------------------------------------
-- 1. print_template_order_header
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.print_template_order_header(p_payload jsonb) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
AS $_$
DECLARE
  v_order_number TEXT := btrim(
    COALESCE(
      NULLIF(p_payload->>'source_order_number', ''),
      NULLIF(p_payload->>'order_number', ''),
      ''
    )
  );
  v_clean_order_number TEXT;
  v_order_type TEXT := COALESCE(p_payload->>'order_type', '');
  v_table_number TEXT := NULLIF(btrim(COALESCE(p_payload->>'table_number', '')), '');
  v_platform TEXT := lower(NULLIF(btrim(COALESCE(p_payload->>'delivery_platform', '')), ''));
  v_external_ref TEXT := NULLIF(btrim(COALESCE(p_payload->>'external_order_ref', '')), '');
  v_prefix TEXT;
  v_label TEXT;
  v_match TEXT[];
  v_sequence TEXT;
  v_is_dine_in BOOLEAN;
  v_platform_label TEXT;
  v_header TEXT;
BEGIN
  v_clean_order_number := regexp_replace(v_order_number, '^#+', '');
  v_prefix := upper(split_part(v_clean_order_number, '-', 1));

  IF v_order_type = 'delivery' OR v_prefix = 'GH' THEN
    v_platform_label := CASE v_platform
      WHEN 'grab' THEN 'GRAB'
      WHEN 'shopee' THEN 'SHOPEEFOOD'
      WHEN 'be' THEN 'BEFOOD'
      WHEN 'green_sm' THEN 'GREEN SM'
      ELSE upper(COALESCE(v_platform, 'GIAO HANG'))
    END;

    IF v_external_ref IS NOT NULL THEN
      RETURN v_platform_label || E'\n' || v_external_ref;
    END IF;

    v_match := regexp_match(
      v_clean_order_number,
      '^(?:TC|MV|GH)-(?:(?:[0-9]{6}|[0-9]{8})-)?([0-9]{1,4})(?:-.+)?$',
      'i'
    );
    IF v_match IS NOT NULL THEN
      v_sequence := v_match[1];
    END IF;

    IF COALESCE(v_sequence, '') <> '' THEN
      RETURN v_platform_label || E'\n#' || v_sequence;
    ELSIF v_clean_order_number <> '' THEN
      RETURN v_platform_label || E'\n' || v_clean_order_number;
    ELSE
      RETURN v_platform_label;
    END IF;
  END IF;

  v_is_dine_in := v_order_type = 'dine_in'
    OR (v_order_type NOT IN ('takeaway', 'delivery') AND v_prefix = 'TC');

  v_label := CASE
    WHEN v_is_dine_in AND v_table_number IS NOT NULL THEN 'Bàn ' || v_table_number
    WHEN v_is_dine_in THEN 'Tại bàn'
    WHEN v_order_type = 'takeaway' OR v_prefix = 'MV' THEN 'Mang về'
    ELSE 'Đơn'
  END;

  v_match := regexp_match(
    v_clean_order_number,
    '^(?:TC|MV|GH)-(?:(?:[0-9]{6}|[0-9]{8})-)?([0-9]{1,4})(?:-.+)?$',
    'i'
  );
  IF v_match IS NOT NULL THEN
    v_sequence := v_match[1];
  END IF;

  IF COALESCE(v_sequence, '') <> '' THEN
    v_header := v_label || ' #' || v_sequence;
  ELSIF v_clean_order_number <> '' THEN
    v_header := v_label || ' ' || v_clean_order_number;
  ELSE
    v_header := v_label;
  END IF;

  RETURN v_header;
END;
$_$;

REVOKE ALL ON FUNCTION public.print_template_order_header(jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.print_template_order_header(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. print_template_order_destination
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.print_template_order_destination(p_payload jsonb) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_payload->>'order_type' = 'dine_in'
      THEN CASE
        WHEN NULLIF(p_payload->>'table_number', '') IS NOT NULL
          THEN 'BÀN ' || (p_payload->>'table_number')
        ELSE 'TẠI CHỖ'
      END
    WHEN p_payload->>'order_type' = 'delivery'
      THEN 'GIAO HÀNG'
    ELSE 'MANG VỀ'
  END;
$$;

REVOKE ALL ON FUNCTION public.print_template_order_destination(jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.print_template_order_destination(jsonb) TO anon;
GRANT ALL ON FUNCTION public.print_template_order_destination(jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.print_template_order_destination(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. enqueue_kitchen_print_internal
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.enqueue_kitchen_print_internal(
  p_order_id bigint,
  p_actor_override uuid DEFAULT NULL::uuid,
  p_enforce_request_auth boolean DEFAULT true
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
AS $_$
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
        '^(?:TC|MV|GH)-(?:(?:[0-9]{6}|[0-9]{8})-)?([0-9]{1,5})(?:-.+)?$',
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
        (p.sort_order + 1)::smallint AS slot,
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
      'delivery_platform',     v_order.delivery_platform,
      'external_order_ref',    v_order.external_order_ref,
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

    IF v_job_id IS NOT NULL THEN
      v_jobs := v_jobs || jsonb_build_object(
        'job_id', v_job_id,
        'printer_id', v_route.printer_id,
        'printer_role', v_route.printer_role,
        'slot', v_route.slot,
        'kitchen_ticket_number', v_route.kitchen_ticket_number,
        'send_seq', v_route.send_seq,
        'send_kind', v_route.send_kind,
        'batch_id', v_route.batch_id,
        'item_ids', to_jsonb(v_route.item_ids)
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'send_seq', COALESCE(v_fallback_send_seq, v_order.kitchen_send_count),
    'jobs', v_jobs
  );
END;
$_$;

REVOKE ALL ON FUNCTION private.enqueue_kitchen_print_internal(BIGINT, UUID, BOOLEAN) FROM PUBLIC;
GRANT ALL ON FUNCTION private.enqueue_kitchen_print_internal(BIGINT, UUID, BOOLEAN) TO service_role;
