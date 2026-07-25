ALTER FUNCTION public.get_pos_session_report(bigint)
  RENAME TO get_pos_session_report_legacy_20260725;

REVOKE ALL ON FUNCTION
  public.get_pos_session_report_legacy_20260725(bigint)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_pos_session_report(p_session_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.pos_sessions%ROWTYPE;
  v_report jsonb;
  v_money jsonb;
  v_payment_mix jsonb;
  v_hourly jsonb;
  v_peak_hour jsonb;
  v_aov_bins jsonb;
  v_item_counts jsonb;
  v_top_items jsonb;
  v_categories jsonb;
  v_discounts jsonb;
  v_payment_attempts jsonb;
  v_operational_evidence jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.auth_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO v_session
  FROM public.pos_sessions session
  WHERE session.id = p_session_id
    AND session.tenant_id = public.auth_tenant_id();

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.has_permission(v_session.branch_id, 'settings:branch')
    OR public.has_permission(v_session.branch_id, 'finance:view')
  ) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT public.get_pos_session_report_legacy_20260725(p_session_id)
  INTO v_report;

  WITH eligible_payments AS MATERIALIZED (
    SELECT
      payment.id,
      payment.order_id,
      payment.method,
      payment.amount,
      payment.paid_at
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
  paid_orders AS MATERIALIZED (
    SELECT DISTINCT
      orders.id,
      orders.subtotal,
      orders.discount_amount,
      orders.tax_amount,
      orders.service_charge
    FROM public.orders orders
    JOIN eligible_payments payment
      ON payment.order_id = orders.id
    WHERE orders.tenant_id = v_session.tenant_id
  ),
  payment_totals AS (
    SELECT
      COALESCE(sum(payment.amount), 0)::numeric AS net_revenue,
      COALESCE(sum(payment.amount) FILTER (
        WHERE payment.method = 'cash'
      ), 0)::numeric AS cash_revenue,
      COALESCE(sum(payment.amount) FILTER (
        WHERE payment.method <> 'cash'
      ), 0)::numeric AS noncash_revenue
    FROM eligible_payments payment
  ),
  order_totals AS (
    SELECT
      count(*)::integer AS paid_order_count,
      COALESCE(sum(orders.subtotal), 0)::numeric AS gross_revenue,
      COALESCE(sum(orders.discount_amount), 0)::numeric
        AS discount_total,
      COALESCE(sum(orders.tax_amount), 0)::numeric AS tax_total,
      COALESCE(sum(orders.service_charge), 0)::numeric
        AS service_charge_total
    FROM paid_orders orders
  ),
  order_counts AS (
    SELECT
      count(*) FILTER (
        WHERE orders.status <> 'cancelled'
          AND NOT EXISTS (
            SELECT 1
            FROM eligible_payments payment
            WHERE payment.order_id = orders.id
          )
      )::integer AS unpaid_order_count,
      count(*) FILTER (
        WHERE orders.status = 'cancelled'
      )::integer AS cancelled_order_count
    FROM public.orders orders
    WHERE orders.tenant_id = v_session.tenant_id
      AND orders.pos_session_id = v_session.id
  )
  SELECT jsonb_build_object(
    'gross_revenue', orders.gross_revenue,
    'discount_total', orders.discount_total,
    'tax_total', orders.tax_total,
    'service_charge_total', orders.service_charge_total,
    'net_revenue', payment.net_revenue,
    'cash_revenue', payment.cash_revenue,
    'noncash_revenue', payment.noncash_revenue,
    'paid_order_count', orders.paid_order_count,
    'unpaid_order_count', counts.unpaid_order_count,
    'cancelled_order_count', counts.cancelled_order_count,
    'aov', CASE
      WHEN orders.paid_order_count > 0
        THEN round(
          payment.net_revenue / orders.paid_order_count,
          2
        )
      ELSE 0
    END
  )
  INTO v_money
  FROM order_totals orders
  CROSS JOIN payment_totals payment
  CROSS JOIN order_counts counts;

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
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'method', mix.method,
      'count', mix.payment_count,
      'order_count', mix.order_count,
      'amount', mix.amount
    )
    ORDER BY mix.amount DESC, mix.method
  ), '[]'::jsonb)
  INTO v_payment_mix
  FROM (
    SELECT
      payment.method,
      count(*)::integer AS payment_count,
      count(DISTINCT payment.order_id)::integer AS order_count,
      COALESCE(sum(payment.amount), 0)::numeric AS amount
    FROM eligible_payments payment
    GROUP BY payment.method
  ) mix;

  WITH eligible_payments AS (
    SELECT
      payment.id,
      payment.order_id,
      payment.amount,
      payment.paid_at
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
  buckets AS (
    SELECT
      EXTRACT(
        HOUR FROM payment.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh'
      )::integer AS hour,
      count(DISTINCT payment.order_id)::integer AS order_count,
      count(*)::integer AS payment_count,
      COALESCE(sum(payment.amount), 0)::numeric AS revenue
    FROM eligible_payments payment
    GROUP BY 1
  )
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'hour', bucket.hour,
        'order_count', bucket.order_count,
        'payment_count', bucket.payment_count,
        'revenue', bucket.revenue
      )
      ORDER BY bucket.hour
    ), '[]'::jsonb),
    (
      SELECT jsonb_build_object(
        'hour', peak.hour,
        'order_count', peak.order_count,
        'payment_count', peak.payment_count,
        'revenue', peak.revenue
      )
      FROM buckets peak
      ORDER BY peak.revenue DESC, peak.order_count DESC, peak.hour
      LIMIT 1
    )
  INTO v_hourly, v_peak_hour
  FROM buckets bucket;

  WITH eligible_payments AS (
    SELECT
      payment.order_id,
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
  order_payments AS (
    SELECT
      payment.order_id,
      sum(payment.amount)::numeric AS amount
    FROM eligible_payments payment
    GROUP BY payment.order_id
  ),
  bins AS (
    SELECT
      CASE
        WHEN payment.amount <= 50000 THEN '≤50.000đ'
        WHEN payment.amount <= 100000 THEN '50.000–100.000đ'
        WHEN payment.amount <= 200000 THEN '100.000–200.000đ'
        WHEN payment.amount <= 500000 THEN '200.000–500.000đ'
        ELSE '>500.000đ'
      END AS label,
      CASE
        WHEN payment.amount <= 50000 THEN 1
        WHEN payment.amount <= 100000 THEN 2
        WHEN payment.amount <= 200000 THEN 3
        WHEN payment.amount <= 500000 THEN 4
        ELSE 5
      END AS ordinal
    FROM order_payments payment
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('label', grouped.label, 'count', grouped.count)
    ORDER BY grouped.ordinal
  ), '[]'::jsonb)
  INTO v_aov_bins
  FROM (
    SELECT
      bin.label,
      bin.ordinal,
      count(*)::integer AS count
    FROM bins bin
    GROUP BY bin.label, bin.ordinal
  ) grouped;

  WITH paid_order_ids AS (
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
    'total_items', COALESCE(sum(item.quantity), 0)::integer,
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
    'served_item_quantity', COALESCE(sum(item.quantity) FILTER (
      WHERE item.status = 'served'
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
  JOIN paid_order_ids paid_order
    ON paid_order.id = item.order_id
  LEFT JOIN public.menu_items current_item
    ON current_item.id = item.menu_item_id
   AND current_item.tenant_id = item.tenant_id
  LEFT JOIN public.menu_categories current_category
    ON current_category.id = current_item.category_id
   AND current_category.tenant_id = current_item.tenant_id
  WHERE item.tenant_id = v_session.tenant_id
    AND item.status <> 'cancelled';

  WITH paid_order_ids AS (
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
  ),
  paid_items AS (
    SELECT
      item.item_name,
      item.quantity,
      item.subtotal,
      item.modifiers,
      item.sides,
      item.category_type_snapshot,
      current_category.id AS current_category_id,
      current_category.name AS current_category_name
    FROM public.order_items item
    JOIN paid_order_ids paid_order
      ON paid_order.id = item.order_id
    LEFT JOIN public.menu_items current_item
      ON current_item.id = item.menu_item_id
     AND current_item.tenant_id = item.tenant_id
    LEFT JOIN public.menu_categories current_category
      ON current_category.id = current_item.category_id
     AND current_category.tenant_id = current_item.tenant_id
    WHERE item.tenant_id = v_session.tenant_id
      AND item.status <> 'cancelled'
  ),
  main_items AS (
    SELECT
      item.item_name AS name,
      'main'::text AS source,
      COALESCE(sum(item.quantity), 0)::integer AS qty,
      COALESCE(sum(item.subtotal), 0)::numeric AS revenue
    FROM paid_items item
    GROUP BY item.item_name
  ),
  side_items AS (
    SELECT
      COALESCE(side->>'name', 'Side')::text AS name,
      'side'::text AS source,
      COALESCE(sum(
        CASE
          WHEN COALESCE(side->>'quantity', '') ~ '^[0-9]+$'
            THEN (side->>'quantity')::integer
          ELSE 1
        END * item.quantity
      ), 0)::integer AS qty,
      COALESCE(sum(
        CASE
          WHEN COALESCE(side->>'price', '') ~ '^-?[0-9]+([.][0-9]+)?$'
            THEN (side->>'price')::numeric
          ELSE 0
        END
          * CASE
            WHEN COALESCE(side->>'quantity', '') ~ '^[0-9]+$'
              THEN (side->>'quantity')::integer
            ELSE 1
          END
          * item.quantity
      ), 0)::numeric AS revenue
    FROM paid_items item
    CROSS JOIN LATERAL jsonb_array_elements(item.sides) side
    GROUP BY side->>'name'
  ),
  modifier_items AS (
    SELECT
      COALESCE(modifier->>'name', 'Modifier')::text AS name,
      'modifier'::text AS source,
      COALESCE(sum(item.quantity), 0)::integer AS qty,
      COALESCE(sum(
        CASE
          WHEN COALESCE(modifier->>'price', '')
            ~ '^-?[0-9]+([.][0-9]+)?$'
            THEN (modifier->>'price')::numeric
          ELSE 0
        END * item.quantity
      ), 0)::numeric AS revenue
    FROM paid_items item
    CROSS JOIN LATERAL jsonb_array_elements(item.modifiers) modifier
    GROUP BY modifier->>'name'
  ),
  all_items AS (
    SELECT * FROM main_items
    UNION ALL
    SELECT * FROM side_items
    UNION ALL
    SELECT * FROM modifier_items
  ),
  categories AS (
    SELECT
      COALESCE(item.current_category_id, 0)::bigint AS category_id,
      CASE
        WHEN item.category_type_snapshot IS NULL
          THEN 'Dữ liệu cũ chưa có snapshot'
        ELSE COALESCE(item.current_category_name, 'Khác')
      END AS category_name,
      COALESCE(sum(item.quantity), 0)::integer AS qty,
      COALESCE(sum(item.subtotal), 0)::numeric AS revenue
    FROM paid_items item
    GROUP BY
      COALESCE(item.current_category_id, 0),
      CASE
        WHEN item.category_type_snapshot IS NULL
          THEN 'Dữ liệu cũ chưa có snapshot'
        ELSE COALESCE(item.current_category_name, 'Khác')
      END
  )
  SELECT
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', top_item.name,
          'source', top_item.source,
          'qty', top_item.qty,
          'revenue', top_item.revenue
        )
        ORDER BY top_item.qty DESC, top_item.revenue DESC, top_item.name
      )
      FROM (
        SELECT *
        FROM all_items
        ORDER BY qty DESC, revenue DESC, name
        LIMIT 10
      ) top_item
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'category_id', category.category_id,
          'category_name', category.category_name,
          'qty', category.qty,
          'revenue', category.revenue
        )
        ORDER BY category.revenue DESC, category.category_name
      )
      FROM categories category
    ), '[]'::jsonb)
  INTO v_top_items, v_categories;

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
  ),
  discount_orders AS (
    SELECT
      orders.id,
      orders.order_number,
      orders.discount_amount,
      orders.discount_note,
      orders.discount_type,
      orders.discount_value
    FROM public.orders orders
    JOIN paid_orders paid_order
      ON paid_order.id = orders.id
    WHERE orders.tenant_id = v_session.tenant_id
      AND orders.discount_amount > 0
  )
  SELECT jsonb_build_object(
    'count', count(*)::integer,
    'total', COALESCE(sum(discount.discount_amount), 0)::numeric,
    'top_orders', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'order_id', top_order.id,
          'order_number', top_order.order_number,
          'amount', top_order.discount_amount,
          'note', top_order.discount_note,
          'type', top_order.discount_type,
          'value', top_order.discount_value
        )
        ORDER BY top_order.discount_amount DESC, top_order.id
      )
      FROM (
        SELECT *
        FROM discount_orders
        ORDER BY discount_amount DESC, id
        LIMIT 10
      ) top_order
    ), '[]'::jsonb)
  )
  INTO v_discounts
  FROM discount_orders discount;

  SELECT jsonb_build_object(
    'total', count(*)::integer,
    'completed', count(*) FILTER (
      WHERE payment.status = 'completed'
    )::integer,
    'pending', count(*) FILTER (
      WHERE payment.status = 'pending'
    )::integer,
    'failed', count(*) FILTER (
      WHERE payment.status = 'failed'
    )::integer,
    'refunded', count(*) FILTER (
      WHERE payment.status = 'refunded'
    )::integer
  )
  INTO v_payment_attempts
  FROM public.payments payment
  JOIN public.orders orders
    ON orders.id = payment.order_id
   AND orders.tenant_id = payment.tenant_id
  WHERE payment.tenant_id = v_session.tenant_id
    AND orders.pos_session_id = v_session.id;

  WITH session_orders AS (
    SELECT orders.id
    FROM public.orders orders
    WHERE orders.tenant_id = v_session.tenant_id
      AND orders.pos_session_id = v_session.id
  ),
  completed_items AS (
    SELECT DISTINCT ON (event.order_item_id)
      CASE
        WHEN COALESCE(
          event.item_snapshot->>'quantity',
          ''
        ) ~ '^[0-9]+$'
          THEN (event.item_snapshot->>'quantity')::integer
        ELSE 0
      END AS quantity
    FROM public.kds_ticket_events event
    JOIN session_orders orders
      ON orders.id = event.order_id
    WHERE event.tenant_id = v_session.tenant_id
      AND event.event_type = 'completed'
      AND event.context->>'evidence_source'
        IS DISTINCT FROM 'legacy_live_snapshot'
    ORDER BY event.order_item_id, event.occurred_at, event.id
  ),
  legacy_completed_items AS (
    SELECT DISTINCT ON (event.order_item_id)
      CASE
        WHEN COALESCE(
          event.item_snapshot->>'quantity',
          ''
        ) ~ '^[0-9]+$'
          THEN (event.item_snapshot->>'quantity')::integer
        ELSE 0
      END AS quantity
    FROM public.kds_ticket_events event
    JOIN session_orders orders
      ON orders.id = event.order_id
    WHERE event.tenant_id = v_session.tenant_id
      AND event.event_type = 'completed'
      AND event.context->>'evidence_source' = 'legacy_live_snapshot'
      AND NOT EXISTS (
        SELECT 1
        FROM public.kds_ticket_events canonical
        WHERE canonical.tenant_id = event.tenant_id
          AND canonical.order_item_id = event.order_item_id
          AND canonical.event_type = 'completed'
          AND canonical.context->>'evidence_source'
            IS DISTINCT FROM 'legacy_live_snapshot'
      )
    ORDER BY event.order_item_id, event.occurred_at, event.id
  ),
  invoice_evidence AS (
    SELECT DISTINCT invoice.id, invoice.status
    FROM session_orders orders
    JOIN public.tax_invoices invoice
      ON invoice.order_id = orders.id
     AND invoice.tenant_id = v_session.tenant_id

    UNION

    SELECT DISTINCT invoice.id, invoice.status
    FROM session_orders orders
    JOIN public.tax_invoice_orders invoice_order
      ON invoice_order.order_id = orders.id
     AND invoice_order.tenant_id = v_session.tenant_id
    JOIN public.tax_invoices invoice
      ON invoice.id = invoice_order.tax_invoice_id
     AND invoice.tenant_id = invoice_order.tenant_id
  )
  SELECT jsonb_build_object(
    'kds_event_count', (
      SELECT count(*)::integer
      FROM public.kds_ticket_events event
      JOIN session_orders orders
        ON orders.id = event.order_id
      WHERE event.tenant_id = v_session.tenant_id
    ),
    'kds_completed_item_quantity', COALESCE((
      SELECT sum(item.quantity)::integer
      FROM completed_items item
    ), 0),
    'kds_legacy_completed_item_quantity', COALESCE((
      SELECT sum(item.quantity)::integer
      FROM legacy_completed_items item
    ), 0),
    'print_job_count', (
      SELECT count(*)::integer
      FROM public.print_jobs job
      JOIN session_orders orders
        ON orders.id = job.order_id
      WHERE job.tenant_id = v_session.tenant_id
    ),
    'printed_job_count', (
      SELECT count(*)::integer
      FROM public.print_jobs job
      JOIN session_orders orders
        ON orders.id = job.order_id
      WHERE job.tenant_id = v_session.tenant_id
        AND job.status = 'printed'
    ),
    'print_failed_count', (
      SELECT count(*)::integer
      FROM public.print_jobs job
      JOIN session_orders orders
        ON orders.id = job.order_id
      WHERE job.tenant_id = v_session.tenant_id
        AND job.status IN ('failed', 'expired')
    ),
    'invoice_count', (
      SELECT count(*)::integer FROM invoice_evidence
    ),
    'invoice_attention_count', (
      SELECT count(*)::integer
      FROM invoice_evidence invoice
      WHERE invoice.status IN ('draft', 'signing', 'submitted')
    ),
    'audit_event_count', (
      SELECT count(*)::integer
      FROM public.audit_logs audit
      WHERE audit.tenant_id = v_session.tenant_id
        AND (
          (
            audit.entity_type = 'order'
            AND audit.entity_id IN (
              SELECT orders.id FROM session_orders orders
            )
          )
          OR (
            audit.entity_type = 'payment'
            AND audit.entity_id IN (
              SELECT payment.id
              FROM public.payments payment
              JOIN session_orders orders
                ON orders.id = payment.order_id
              WHERE payment.tenant_id = v_session.tenant_id
            )
          )
          OR (
            audit.entity_type = 'webhook_event'
            AND audit.entity_id IN (
              SELECT event.id
              FROM public.webhook_events event
              JOIN session_orders orders
                ON orders.id = event.order_id
              WHERE event.tenant_id = v_session.tenant_id
            )
          )
        )
    ),
    'order_payment_state_mismatch_count', (
      SELECT count(DISTINCT orders.id)::integer
      FROM public.orders orders
      JOIN public.payments payment
        ON payment.order_id = orders.id
       AND payment.tenant_id = orders.tenant_id
       AND payment.branch_id = orders.branch_id
      WHERE orders.tenant_id = v_session.tenant_id
        AND orders.pos_session_id = v_session.id
        AND payment.status = 'completed'
        AND payment.paid_at IS NOT NULL
        AND (
          orders.payment_status IS DISTINCT FROM 'paid'
          OR orders.status = 'cancelled'
          OR payment.amount IS DISTINCT FROM orders.total_amount
        )
    ),
    'late_payment_count', (
      SELECT count(*)::integer
      FROM public.payments payment
      JOIN public.orders orders
        ON orders.id = payment.order_id
       AND orders.tenant_id = payment.tenant_id
       AND orders.branch_id = payment.branch_id
      WHERE payment.tenant_id = v_session.tenant_id
        AND orders.pos_session_id = v_session.id
        AND payment.status = 'completed'
        AND payment.paid_at IS NOT NULL
        AND (
          payment.paid_at < v_session.opened_at
          OR (
            v_session.closed_at IS NOT NULL
            AND payment.paid_at > v_session.closed_at
          )
        )
    ),
    'late_payment_amount', (
      SELECT COALESCE(sum(payment.amount), 0)::numeric
      FROM public.payments payment
      JOIN public.orders orders
        ON orders.id = payment.order_id
       AND orders.tenant_id = payment.tenant_id
       AND orders.branch_id = payment.branch_id
      WHERE payment.tenant_id = v_session.tenant_id
        AND orders.pos_session_id = v_session.id
        AND payment.status = 'completed'
        AND payment.paid_at IS NOT NULL
        AND (
          payment.paid_at < v_session.opened_at
          OR (
            v_session.closed_at IS NOT NULL
            AND payment.paid_at > v_session.closed_at
          )
        )
    )
  )
  INTO v_operational_evidence;

  v_report := jsonb_set(
    v_report,
    '{totals}',
    COALESCE(v_report->'totals', '{}'::jsonb)
      || v_money
      || v_item_counts,
    true
  );
  v_report := jsonb_set(v_report, '{payment_mix}', v_payment_mix, true);
  v_report := jsonb_set(v_report, '{hourly}', v_hourly, true);
  v_report := jsonb_set(
    v_report,
    '{peak_hour}',
    COALESCE(v_peak_hour, 'null'::jsonb),
    true
  );
  v_report := jsonb_set(v_report, '{aov_bins}', v_aov_bins, true);
  v_report := jsonb_set(v_report, '{top_items}', v_top_items, true);
  v_report := jsonb_set(
    v_report,
    '{category_breakdown}',
    v_categories,
    true
  );
  v_report := jsonb_set(v_report, '{discounts}', v_discounts, true);

  RETURN v_report || jsonb_build_object(
    'payment_attempt_summary', v_payment_attempts,
    'operational_evidence', v_operational_evidence,
    'generated_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.get_pos_session_report(bigint) IS
  'POS-session membership follows orders.pos_session_id. Money comes from completed payments, hourly buckets use payments.paid_at, and payments outside opened_at/closed_at are retained but flagged as late.';

REVOKE ALL ON FUNCTION public.get_pos_session_report(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pos_session_report(bigint)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.close_pos_session(
  p_session_id bigint,
  p_closing_cash numeric,
  p_note text DEFAULT NULL,
  p_variance_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_session record;
  v_paid_count integer;
  v_unpaid_count integer;
  v_cash_revenue numeric(15,2);
  v_noncash_revenue numeric(15,2);
  v_expected_cash numeric(15,2);
  v_cash_difference numeric(15,2);
  v_threshold numeric(15,2);
  v_closed_by uuid;
  v_variance_trim text;
BEGIN
  IF p_closing_cash IS NULL OR p_closing_cash < 0 THEN
    RAISE EXCEPTION 'closing_cash_must_be_non_negative'
      USING ERRCODE = '22023';
  END IF;

  v_closed_by := auth.uid();
  IF v_closed_by IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT
    session.id,
    session.tenant_id,
    session.branch_id,
    session.opening_cash,
    session.opened_at,
    session.status
  INTO v_session
  FROM public.pos_sessions session
  WHERE session.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'session_already_closed' USING ERRCODE = 'P0001';
  END IF;

  SELECT
    count(DISTINCT orders.id) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM public.payments payment
        WHERE payment.tenant_id = orders.tenant_id
          AND payment.order_id = orders.id
          AND payment.status = 'completed'
          AND payment.paid_at IS NOT NULL
      )
    ),
    count(DISTINCT orders.id) FILTER (
      WHERE orders.status <> 'cancelled'
        AND NOT EXISTS (
          SELECT 1
          FROM public.payments payment
          WHERE payment.tenant_id = orders.tenant_id
            AND payment.order_id = orders.id
            AND payment.status = 'completed'
            AND payment.paid_at IS NOT NULL
        )
    )
  INTO v_paid_count, v_unpaid_count
  FROM public.orders orders
  WHERE orders.tenant_id = v_session.tenant_id
    AND orders.pos_session_id = p_session_id;

  SELECT
    COALESCE(sum(payment.amount) FILTER (
      WHERE payment.method = 'cash'
    ), 0),
    COALESCE(sum(payment.amount) FILTER (
      WHERE payment.method <> 'cash'
    ), 0)
  INTO v_cash_revenue, v_noncash_revenue
  FROM public.payments payment
  JOIN public.orders orders
    ON orders.id = payment.order_id
   AND orders.tenant_id = payment.tenant_id
   AND orders.branch_id = payment.branch_id
  WHERE orders.tenant_id = v_session.tenant_id
    AND orders.pos_session_id = p_session_id
    AND payment.status = 'completed'
    AND payment.paid_at IS NOT NULL;

  v_expected_cash := v_session.opening_cash + v_cash_revenue;
  v_cash_difference := p_closing_cash - v_expected_cash;
  v_threshold := GREATEST(
    50000::numeric,
    round(v_expected_cash * 0.005, 2)
  );
  v_variance_trim := NULLIF(btrim(COALESCE(p_variance_note, '')), '');

  UPDATE public.pos_sessions
  SET
    status = 'closed',
    closed_at = now(),
    closed_by = v_closed_by,
    closing_cash = p_closing_cash,
    expected_cash = v_expected_cash,
    cash_difference = v_cash_difference,
    note = p_note,
    variance_approval_note = v_variance_trim,
    variance_approver_user_id = NULL,
    variance_resolution_type = NULL,
    variance_settlement_amount = NULL,
    variance_resolved_at = NULL
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'opening_cash', v_session.opening_cash,
    'closing_cash', p_closing_cash,
    'expected_cash', v_expected_cash,
    'cash_revenue', v_cash_revenue,
    'noncash_revenue', v_noncash_revenue,
    'cash_difference', v_cash_difference,
    'variance_threshold', v_threshold,
    'variance_breached', abs(v_cash_difference) > v_threshold,
    'order_count', v_paid_count + v_unpaid_count,
    'paid_order_count', v_paid_count,
    'unpaid_order_count', v_unpaid_count,
    'opened_at', v_session.opened_at,
    'closed_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.close_pos_session(
  bigint,
  numeric,
  text,
  text
) IS
  'Closes a POS session. Expected cash uses completed cash payments with paid_at; stale order payment mirrors never suppress collected money.';

CREATE OR REPLACE FUNCTION public.correct_payment_method(
  p_payment_id bigint,
  p_new_method text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_payment record;
  v_order record;
  v_session record;
  v_cash_revenue numeric(15,2);
  v_expected_cash numeric(15,2);
  v_cash_difference numeric(15,2);
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_new_method IS NULL OR p_new_method NOT IN ('cash', 'vietqr') THEN
    RAISE EXCEPTION 'invalid_payment_method' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL
    OR length(trim(p_reason)) < 1
    OR length(p_reason) > 500
  THEN
    RAISE EXCEPTION 'invalid_reason' USING ERRCODE = '22023';
  END IF;

  SELECT
    payment.id,
    payment.tenant_id,
    payment.branch_id,
    payment.order_id,
    payment.status,
    payment.method
  INTO v_payment
  FROM public.payments payment
  WHERE payment.id = p_payment_id
    AND payment.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.auth_is_owner(v_actor)
    OR NOT public.has_permission(
      v_payment.branch_id,
      'orders:refund_approve'
    )
  THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  IF v_payment.status <> 'completed' THEN
    RAISE EXCEPTION 'payment_not_completed' USING ERRCODE = 'P0001';
  END IF;
  IF v_payment.method = p_new_method THEN
    RAISE EXCEPTION 'payment_method_unchanged' USING ERRCODE = 'P0001';
  END IF;

  SELECT
    orders.id,
    orders.pos_session_id,
    orders.payment_method
  INTO v_order
  FROM public.orders orders
  WHERE orders.id = v_payment.order_id
    AND orders.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.payments
  SET method = p_new_method, updated_at = now()
  WHERE id = v_payment.id;

  UPDATE public.orders
  SET payment_method = p_new_method, updated_at = now()
  WHERE id = v_order.id;

  IF v_order.pos_session_id IS NOT NULL THEN
    SELECT session.*
    INTO v_session
    FROM public.pos_sessions session
    WHERE session.id = v_order.pos_session_id
      AND session.tenant_id = v_tenant
    FOR UPDATE;

    IF FOUND AND v_session.status = 'closed' THEN
      SELECT COALESCE(sum(payment.amount), 0)
      INTO v_cash_revenue
      FROM public.payments payment
      JOIN public.orders orders
        ON orders.id = payment.order_id
       AND orders.tenant_id = payment.tenant_id
       AND orders.branch_id = payment.branch_id
      WHERE orders.tenant_id = v_tenant
        AND orders.pos_session_id = v_session.id
        AND payment.status = 'completed'
        AND payment.paid_at IS NOT NULL
        AND payment.method = 'cash';

      v_expected_cash := v_session.opening_cash + v_cash_revenue;
      v_cash_difference := v_session.closing_cash - v_expected_cash;

      UPDATE public.pos_sessions
      SET
        expected_cash = v_expected_cash,
        cash_difference = v_cash_difference,
        variance_approval_note = NULL,
        variance_approver_user_id = NULL,
        variance_resolution_type = NULL,
        variance_settlement_amount = NULL,
        variance_resolved_at = NULL,
        updated_at = now()
      WHERE id = v_session.id;
    END IF;
  END IF;

  PERFORM public.log_audit(
    'payment.method_correct',
    'payment',
    v_payment.id,
    jsonb_build_object(
      'method', v_payment.method,
      'order_payment_method', v_order.payment_method,
      'pos_session_id', v_order.pos_session_id
    ),
    jsonb_build_object(
      'method', p_new_method,
      'order_payment_method', p_new_method,
      'pos_session_id', v_order.pos_session_id,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'status', 'corrected',
    'payment_id', v_payment.id,
    'order_id', v_order.id,
    'pos_session_id', v_order.pos_session_id,
    'old_method', v_payment.method,
    'new_method', p_new_method
  );
END;
$$;
