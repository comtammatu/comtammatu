-- Migration: allow service_role callers to route orders to KDS and print jobs in route_order_to_kds
-- When delivery orders are created via service_role webhook relays (GrabFood, ShopeeFood),
-- auth.uid() is null, so public.auth_tenant_id() returns null.
-- This checks COALESCE(auth.role() = 'service_role', false) to permit service_role routing
-- and uses COALESCE(auth.uid(), v_order.created_by) for actor attribution in batches and print jobs.

CREATE OR REPLACE FUNCTION public.route_order_to_kds(p_order_id bigint) RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
AS $function$
DECLARE
  v_is_service BOOLEAN := COALESCE(auth.role() = 'service_role', false);
  v_order RECORD;
  v_item RECORD;
  v_station_id BIGINT;
  v_has_printer_route BOOLEAN := FALSE;
  v_batch_id BIGINT;
  v_send_seq INT;
  v_ticket_seq INT;
  v_order_number_clean TEXT;
  v_order_number_match TEXT[];
  v_ticket_base TEXT;
  v_ticket_number TEXT;
  v_ticket_id BIGINT;
  v_table_no INT;
  v_cashier_name TEXT;
  v_route RECORD;
  v_payload JSONB;
  v_idempotency TEXT;
  v_job_id BIGINT;
  v_unrouted INT;
  v_actor UUID;
BEGIN
  SELECT tenant_id, branch_id, order_number, order_type,
         delivery_platform, external_order_ref, note, created_by,
         table_id, kitchen_send_count
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND (v_is_service OR tenant_id = public.auth_tenant_id())
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_actor := COALESCE(auth.uid(), v_order.created_by);

  FOR v_item IN
    SELECT oi.id AS order_item_id, mi.category_id
    FROM public.order_items oi
    JOIN public.menu_items mi
      ON mi.id = oi.menu_item_id
     AND mi.tenant_id = oi.tenant_id
    WHERE oi.order_id = p_order_id
      AND oi.sent_to_kitchen_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.kds_tickets kt
        WHERE kt.tenant_id = v_order.tenant_id
          AND kt.order_item_id = oi.id
      )
    ORDER BY oi.id
  LOOP
    v_station_id := NULL;
    v_has_printer_route := FALSE;

    SELECT sc.station_id INTO v_station_id
    FROM public.kds_station_categories sc
    JOIN public.kds_stations s ON s.id = sc.station_id
    WHERE sc.category_id = v_item.category_id
      AND s.branch_id = v_order.branch_id
      AND s.tenant_id = v_order.tenant_id
      AND s.is_active = TRUE
    ORDER BY s.position, s.id
    LIMIT 1;

    SELECT EXISTS (
      SELECT 1
      FROM public.printers p
      JOIN public.printer_print_types ppt
        ON ppt.printer_id = p.id
       AND ppt.tenant_id = p.tenant_id
       AND ppt.branch_id = p.branch_id
       AND ppt.print_type = 'kitchen_ticket'
      LEFT JOIN public.printer_menu_categories pmc
        ON pmc.printer_id = p.id
       AND pmc.tenant_id = p.tenant_id
       AND pmc.branch_id = p.branch_id
       AND pmc.category_id = v_item.category_id
      WHERE p.tenant_id = v_order.tenant_id
        AND p.branch_id = v_order.branch_id
        AND p.is_active = TRUE
        AND (
          pmc.id IS NOT NULL
          OR NOT EXISTS (
            SELECT 1
            FROM public.printer_menu_categories pmc_any
            WHERE pmc_any.tenant_id = v_order.tenant_id
              AND pmc_any.branch_id = v_order.branch_id
              AND pmc_any.category_id = v_item.category_id
          )
        )
    ) INTO v_has_printer_route;

    IF v_station_id IS NULL AND v_has_printer_route THEN
      CONTINUE;
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
          '^(?:TC|MV|GH)-(?:(?:[0-9]{6}|[0-9]{8})-)?([0-9]{1,5})(?:-.+)?$',
          'i'
        );
        v_ticket_base := COALESCE(
          v_order_number_match[1],
          NULLIF(v_order_number_clean, ''),
          p_order_id::TEXT
        );
        v_ticket_number := '#' || v_ticket_base
          || CASE WHEN v_send_seq > 1 THEN '-' || v_send_seq::TEXT ELSE '' END;

        BEGIN
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
            v_actor
          )
          RETURNING id INTO v_batch_id;
        EXCEPTION
          WHEN unique_violation THEN
            v_ticket_number := '#' || v_ticket_base || '-' || v_ticket_seq::text;
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
              v_actor
            )
            RETURNING id INTO v_batch_id;
        END;
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

  IF EXISTS (
    SELECT 1
    FROM public.order_items oi
    JOIN public.menu_items mi
      ON mi.id = oi.menu_item_id
     AND mi.tenant_id = oi.tenant_id
    JOIN LATERAL (
      SELECT p.id AS printer_id
      FROM public.printers p
      JOIN public.printer_print_types ppt
        ON ppt.printer_id = p.id
       AND ppt.tenant_id = p.tenant_id
       AND ppt.branch_id = p.branch_id
       AND ppt.print_type = 'kitchen_ticket'
      LEFT JOIN public.printer_menu_categories pmc
        ON pmc.printer_id = p.id
       AND pmc.tenant_id = p.tenant_id
       AND pmc.branch_id = p.branch_id
       AND pmc.category_id = mi.category_id
      WHERE p.tenant_id = v_order.tenant_id
        AND p.branch_id = v_order.branch_id
        AND p.is_active = TRUE
        AND (
          pmc.id IS NOT NULL
          OR NOT EXISTS (
            SELECT 1
            FROM public.printer_menu_categories pmc_any
            WHERE pmc_any.tenant_id = v_order.tenant_id
              AND pmc_any.branch_id = v_order.branch_id
              AND pmc_any.category_id = mi.category_id
          )
        )
      ORDER BY
        CASE WHEN pmc.id IS NOT NULL THEN 0 ELSE 1 END,
        p.sort_order, p.id
      LIMIT 1
    ) pr ON TRUE
    WHERE oi.order_id = p_order_id
      AND oi.sent_to_kitchen_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.kds_tickets kt
        WHERE kt.tenant_id = v_order.tenant_id
          AND kt.order_item_id = oi.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.kds_station_categories sc
        JOIN public.kds_stations s ON s.id = sc.station_id
        WHERE sc.category_id = mi.category_id
          AND s.branch_id = v_order.branch_id
          AND s.tenant_id = v_order.tenant_id
          AND s.is_active = TRUE
      )
    LIMIT 1
  ) THEN
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
        '^(?:TC|MV|GH)-(?:(?:[0-9]{6}|[0-9]{8})-)?([0-9]{1,5})(?:-.+)?$',
        'i'
      );
      v_ticket_base := COALESCE(
        v_order_number_match[1],
        NULLIF(v_order_number_clean, ''),
        p_order_id::TEXT
      );
      v_ticket_number := '#' || v_ticket_base
        || CASE WHEN v_send_seq > 1 THEN '-' || v_send_seq::TEXT ELSE '' END;

      BEGIN
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
          v_actor
        )
        RETURNING id INTO v_batch_id;
      EXCEPTION
        WHEN unique_violation THEN
          v_ticket_number := '#' || v_ticket_base || '-' || v_ticket_seq::text;
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
            v_actor
          )
          RETURNING id INTO v_batch_id;
      END;
    ELSE
      SELECT kitchen_ticket_number, send_seq
        INTO v_ticket_number, v_send_seq
      FROM public.kitchen_send_batches
      WHERE id = v_batch_id;
    END IF;

    IF v_order.table_id IS NOT NULL THEN
      SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
    END IF;

    SELECT full_name INTO v_cashier_name
    FROM public.profiles WHERE id = v_order.created_by;

    FOR v_route IN
      WITH routed_items AS (
        SELECT
          pr.printer_id,
          pr.printer_role,
          pr.slot,
          oi.id AS order_item_id,
          jsonb_build_object(
            'item_name', oi.item_name,
            'variant_name', oi.variant_name,
            'quantity', oi.quantity,
            'modifiers', oi.modifiers,
            'sides', oi.sides,
            'note', oi.note
          ) AS item_payload
        FROM public.order_items oi
        JOIN public.menu_items mi
          ON mi.id = oi.menu_item_id
         AND mi.tenant_id = oi.tenant_id
        JOIN LATERAL (
          SELECT
            p.id AS printer_id,
            p.role AS printer_role,
            (p.sort_order + 1)::smallint AS slot
          FROM public.printers p
          JOIN public.printer_print_types ppt
            ON ppt.printer_id = p.id
           AND ppt.tenant_id = p.tenant_id
           AND ppt.branch_id = p.branch_id
           AND ppt.print_type = 'kitchen_ticket'
          LEFT JOIN public.printer_menu_categories pmc
            ON pmc.printer_id = p.id
           AND pmc.tenant_id = p.tenant_id
           AND pmc.branch_id = p.branch_id
           AND pmc.category_id = mi.category_id
          WHERE p.tenant_id = v_order.tenant_id
            AND p.branch_id = v_order.branch_id
            AND p.is_active = TRUE
            AND (
              pmc.id IS NOT NULL
              OR NOT EXISTS (
                SELECT 1
                FROM public.printer_menu_categories pmc_any
                WHERE pmc_any.tenant_id = v_order.tenant_id
                  AND pmc_any.branch_id = v_order.branch_id
                  AND pmc_any.category_id = mi.category_id
              )
            )
          ORDER BY
            CASE WHEN pmc.id IS NOT NULL THEN 0 ELSE 1 END,
            p.sort_order, p.id
          LIMIT 1
        ) pr ON TRUE
        WHERE oi.order_id = p_order_id
          AND oi.sent_to_kitchen_at IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM public.kds_tickets kt
            WHERE kt.tenant_id = v_order.tenant_id
              AND kt.order_item_id = oi.id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.kds_station_categories sc
            JOIN public.kds_stations s ON s.id = sc.station_id
            WHERE sc.category_id = mi.category_id
              AND s.branch_id = v_order.branch_id
              AND s.tenant_id = v_order.tenant_id
              AND s.is_active = TRUE
          )
      ),
      grouped_routes AS (
        SELECT
          printer_id,
          printer_role,
          slot,
          array_agg(order_item_id ORDER BY order_item_id) AS item_ids,
          jsonb_agg(item_payload ORDER BY order_item_id) AS items
        FROM routed_items
        GROUP BY printer_id, printer_role, slot
      )
      SELECT *
      FROM grouped_routes
      ORDER BY printer_role, printer_id
    LOOP
      v_job_id := NULL;

      v_payload := jsonb_build_object(
        'kind', 'kitchen_ticket',
        'kitchen_ticket_number', v_ticket_number,
        'source_order_number', v_order.order_number,
        'order_number', v_order.order_number,
        'order_type', v_order.order_type,
        'delivery_platform', v_order.delivery_platform,
        'external_order_ref', v_order.external_order_ref,
        'table_number', v_table_no,
        'cashier_name', COALESCE(v_cashier_name, ''),
        'send_seq', v_send_seq,
        'send_kind', CASE WHEN v_send_seq = 1 THEN 'initial' ELSE 'append' END,
        'slot', v_route.slot,
        'note', v_order.note,
        'items', v_route.items,
        'printed_at', to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh',
                              'YYYY-MM-DD"T"HH24:MI:SS')
      );

      v_idempotency := 'order:' || p_order_id::TEXT
        || ':non-kds-dispatch:printer:' || v_route.printer_id::TEXT
        || ':batch:' || v_batch_id::TEXT
        || ':items:' || md5(array_to_string(v_route.item_ids, ','));

      INSERT INTO public.print_jobs (
        tenant_id, branch_id, printer_id, job_type,
        order_id, payload, idempotency_key, created_by
      )
      VALUES (
        v_order.tenant_id, v_order.branch_id, v_route.printer_id,
        'kitchen_ticket', p_order_id, v_payload, v_idempotency, v_actor
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
    END LOOP;
  END IF;

  SELECT count(*)::int INTO v_unrouted
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.status <> 'cancelled'
    AND oi.sent_to_kitchen_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.kds_tickets kt
      WHERE kt.tenant_id = v_order.tenant_id
        AND kt.order_item_id = oi.id
    );

  IF v_unrouted > 0 THEN
    RAISE EXCEPTION 'kds_no_route: order % has % unroutable item(s)',
      p_order_id, v_unrouted
      USING ERRCODE = '22023';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.route_order_to_kds(bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.route_order_to_kds(bigint) TO authenticated;
GRANT ALL ON FUNCTION public.route_order_to_kds(bigint) TO service_role;
