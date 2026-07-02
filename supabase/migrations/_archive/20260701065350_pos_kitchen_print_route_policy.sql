CREATE OR REPLACE FUNCTION public.route_order_to_kds(p_order_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
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
BEGIN
  SELECT tenant_id, branch_id, order_number, order_type, note, created_by,
         table_id, kitchen_send_count
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id = public.auth_tenant_id()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

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
        CASE p.role WHEN 'kitchen_1' THEN 1 WHEN 'kitchen_2' THEN 2 ELSE 9 END,
        p.id
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
            CASE WHEN p.role = 'kitchen_2' THEN 2 ELSE 1 END AS slot
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
            CASE p.role WHEN 'kitchen_1' THEN 1 WHEN 'kitchen_2' THEN 2 ELSE 9 END,
            p.id
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
        'kitchen_ticket', p_order_id, v_payload, v_idempotency, auth.uid()
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

COMMENT ON FUNCTION public.route_order_to_kds(p_order_id bigint) IS
  'Routes explicit KDS categories to KDS tickets; otherwise queues kitchen printer jobs from category-specific or default kitchen printer routing. Missing KDS and printer routing fails loud.';

CREATE OR REPLACE FUNCTION public.post_pos_sale_consumption_if_ready(
  p_order_id bigint,
  p_actor_id uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := COALESCE(p_actor_id, auth.uid());
  v_order record;
  v_location_id bigint;
  v_location_is_default boolean;
  v_need record;
  v_available numeric(15,3);
  v_inserted int := 0;
  v_row_count int := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT o.id, o.tenant_id, o.branch_id, o.status, o.payment_status, o.created_by
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'consumed', false, 'skipped', true, 'reason', 'order_not_found');
  END IF;

  v_actor := COALESCE(v_actor, v_order.created_by);

  IF NOT COALESCE((
    SELECT bff.enabled
    FROM public.branch_feature_flags bff
    WHERE bff.branch_id = v_order.branch_id
      AND bff.flag_key = 'pos_stock_outcome_posting'
  ), false) THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'consumed', false, 'skipped', true, 'reason', 'feature_disabled');
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') <> 'paid'
     OR v_order.status <> 'completed' THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'consumed', false, 'pending', true, 'reason', 'order_not_paid_completed');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_movements sm
    WHERE sm.tenant_id = v_order.tenant_id
      AND sm.order_id = p_order_id
      AND sm.movement_subtype = 'sale_consumption'
  ) THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'consumed', true, 'skipped', true, 'reason', 'already_posted');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.kds_tickets kt
    JOIN public.order_items oi
      ON oi.id = kt.order_item_id
     AND oi.tenant_id = kt.tenant_id
    WHERE kt.order_id = p_order_id
      AND kt.tenant_id = v_order.tenant_id
      AND kt.status <> 'cancelled'
      AND oi.status <> 'cancelled'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.kds_tickets kt
      JOIN public.order_items oi
        ON oi.id = kt.order_item_id
       AND oi.tenant_id = kt.tenant_id
      WHERE kt.order_id = p_order_id
        AND kt.tenant_id = v_order.tenant_id
        AND kt.first_ready_at IS NOT NULL
        AND kt.status <> 'cancelled'
        AND oi.status <> 'cancelled'
    ) THEN
      RETURN jsonb_build_object('order_id', p_order_id, 'consumed', false, 'pending', true, 'reason', 'no_ready_kds_items');
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.kds_tickets kt
      JOIN public.order_items oi
        ON oi.id = kt.order_item_id
       AND oi.tenant_id = kt.tenant_id
      WHERE kt.order_id = p_order_id
        AND kt.tenant_id = v_order.tenant_id
        AND kt.status <> 'cancelled'
        AND oi.status <> 'cancelled'
        AND kt.first_ready_at IS NULL
    ) THEN
      RETURN jsonb_build_object('order_id', p_order_id, 'consumed', false, 'pending', true, 'reason', 'kds_not_fully_ready');
    END IF;
  END IF;

  SELECT il.id, il.is_default_issue
  INTO v_location_id, v_location_is_default
  FROM public.inventory_locations il
  WHERE il.branch_id = v_order.branch_id
    AND il.tenant_id = v_order.tenant_id
    AND il.location_kind = 'warehouse'
    AND il.is_active = TRUE
  ORDER BY il.is_default_issue DESC, il.sort_order NULLS LAST, il.id
  LIMIT 1;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'issue_location_missing:%', v_order.branch_id USING ERRCODE = 'P0002';
  END IF;

  IF v_location_is_default IS DISTINCT FROM TRUE THEN
    RAISE WARNING 'default_issue_location_missing:branch %; using warehouse location %',
      v_order.branch_id,
      v_location_id;
  END IF;

  FOR v_need IN
    WITH qualifying_order_items AS (
      SELECT
        oi.id AS order_item_id,
        oi.menu_item_id::bigint AS menu_item_id,
        oi.quantity::numeric AS line_quantity,
        oi.sides
      FROM public.order_items oi
      JOIN public.menu_items mi
        ON mi.id = oi.menu_item_id
       AND mi.tenant_id = oi.tenant_id
      WHERE oi.order_id = p_order_id
        AND oi.tenant_id = v_order.tenant_id
        AND oi.status <> 'cancelled'
        AND (
          EXISTS (
            SELECT 1
            FROM public.kds_tickets kt
            WHERE kt.order_item_id = oi.id
              AND kt.tenant_id = oi.tenant_id
              AND kt.order_id = oi.order_id
              AND kt.first_ready_at IS NOT NULL
              AND kt.status <> 'cancelled'
          )
          OR (
            oi.sent_to_kitchen_at IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM public.kds_tickets kt
              WHERE kt.order_item_id = oi.id
                AND kt.tenant_id = oi.tenant_id
                AND kt.order_id = oi.order_id
                AND kt.status <> 'cancelled'
            )
          )
        )
    ),
    consumption_lines AS (
      SELECT menu_item_id, line_quantity
      FROM qualifying_order_items

      UNION ALL

      SELECT (s.elem ->> 'side_item_id')::bigint AS menu_item_id,
             qoi.line_quantity *
               CASE
                 WHEN COALESCE(s.elem ->> 'quantity', '') ~ '^[0-9]+$'
                   THEN (s.elem ->> 'quantity')::numeric
                 ELSE 1
               END AS line_quantity
      FROM qualifying_order_items qoi
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(qoi.sides, '[]'::jsonb)) AS s(elem)
      WHERE s.elem ? 'side_item_id'
        AND (s.elem ->> 'side_item_id') ~ '^[0-9]+$'
    )
    SELECT
      r.ingredient_id,
      ROUND(SUM(public.inv_to_base_for_tenant(
        v_order.tenant_id,
        r.ingredient_id,
        r.entry_unit_id,
        cl.line_quantity * r.quantity / r.yield_factor
      )), 3)::numeric(15,3) AS need_qty
    FROM consumption_lines cl
    JOIN public.recipes r
      ON r.menu_item_id = cl.menu_item_id
     AND r.tenant_id = v_order.tenant_id
    GROUP BY r.ingredient_id
    HAVING ROUND(SUM(public.inv_to_base_for_tenant(
      v_order.tenant_id,
      r.ingredient_id,
      r.entry_unit_id,
      cl.line_quantity * r.quantity / r.yield_factor
    )), 3) > 0
    ORDER BY r.ingredient_id
  LOOP
    SELECT sl.current_quantity
    INTO v_available
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_order.tenant_id
      AND sl.branch_id = v_order.branch_id
      AND sl.location_id = v_location_id
      AND sl.ingredient_id = v_need.ingredient_id
    FOR UPDATE;

    IF COALESCE(v_available, 0) < v_need.need_qty THEN
      RAISE EXCEPTION 'insufficient_stock_ingredient:%', v_need.ingredient_id USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  FOR v_need IN
    WITH qualifying_order_items AS (
      SELECT
        oi.id AS order_item_id,
        oi.menu_item_id::bigint AS menu_item_id,
        oi.quantity::numeric AS line_quantity,
        oi.sides
      FROM public.order_items oi
      JOIN public.menu_items mi
        ON mi.id = oi.menu_item_id
       AND mi.tenant_id = oi.tenant_id
      WHERE oi.order_id = p_order_id
        AND oi.tenant_id = v_order.tenant_id
        AND oi.status <> 'cancelled'
        AND (
          EXISTS (
            SELECT 1
            FROM public.kds_tickets kt
            WHERE kt.order_item_id = oi.id
              AND kt.tenant_id = oi.tenant_id
              AND kt.order_id = oi.order_id
              AND kt.first_ready_at IS NOT NULL
              AND kt.status <> 'cancelled'
          )
          OR (
            oi.sent_to_kitchen_at IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM public.kds_tickets kt
              WHERE kt.order_item_id = oi.id
                AND kt.tenant_id = oi.tenant_id
                AND kt.order_id = oi.order_id
                AND kt.status <> 'cancelled'
            )
          )
        )
    ),
    consumption_lines AS (
      SELECT menu_item_id, line_quantity
      FROM qualifying_order_items

      UNION ALL

      SELECT (s.elem ->> 'side_item_id')::bigint AS menu_item_id,
             qoi.line_quantity *
               CASE
                 WHEN COALESCE(s.elem ->> 'quantity', '') ~ '^[0-9]+$'
                   THEN (s.elem ->> 'quantity')::numeric
                 ELSE 1
               END AS line_quantity
      FROM qualifying_order_items qoi
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(qoi.sides, '[]'::jsonb)) AS s(elem)
      WHERE s.elem ? 'side_item_id'
        AND (s.elem ->> 'side_item_id') ~ '^[0-9]+$'
    )
    SELECT
      r.ingredient_id,
      ROUND(SUM(public.inv_to_base_for_tenant(
        v_order.tenant_id,
        r.ingredient_id,
        r.entry_unit_id,
        cl.line_quantity * r.quantity / r.yield_factor
      )), 3)::numeric(15,3) AS need_qty
    FROM consumption_lines cl
    JOIN public.recipes r
      ON r.menu_item_id = cl.menu_item_id
     AND r.tenant_id = v_order.tenant_id
    GROUP BY r.ingredient_id
    HAVING ROUND(SUM(public.inv_to_base_for_tenant(
      v_order.tenant_id,
      r.ingredient_id,
      r.entry_unit_id,
      cl.line_quantity * r.quantity / r.yield_factor
    )), 3) > 0
    ORDER BY r.ingredient_id
  LOOP
    INSERT INTO public.stock_movements (
      tenant_id,
      branch_id,
      ingredient_id,
      type,
      movement_subtype,
      quantity_change,
      reason,
      created_by,
      order_id,
      unit_cost,
      location_id
    )
    SELECT
      v_order.tenant_id,
      v_order.branch_id,
      v_need.ingredient_id,
      'consumption',
      'sale_consumption',
      -v_need.need_qty,
      'Order ' || p_order_id::text || ' sale consumption',
      v_actor,
      p_order_id,
      COALESCE(sl.avg_unit_cost, 0),
      v_location_id
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_order.tenant_id
      AND sl.branch_id = v_order.branch_id
      AND sl.location_id = v_location_id
      AND sl.ingredient_id = v_need.ingredient_id
    ON CONFLICT (
      tenant_id,
      order_id,
      movement_subtype,
      ingredient_id,
      location_id
    )
    WHERE order_id IS NOT NULL
      AND movement_subtype IN (
        'sale_consumption',
        'cancelled_after_kds_ready'
      )
    DO NOTHING;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_inserted := v_inserted + v_row_count;
  END LOOP;

  IF v_inserted = 0 THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'consumed', false, 'skipped', true, 'reason', 'no_recipe_movements');
  END IF;

  RETURN jsonb_build_object('order_id', p_order_id, 'consumed', true, 'movements_created', v_inserted);
END;
$$;

COMMENT ON FUNCTION public.post_pos_sale_consumption_if_ready(bigint, uuid) IS
  'Posts sale_consumption for paid completed orders; KDS lines wait for ready, and non-KDS lines consume after kitchen dispatch.';
