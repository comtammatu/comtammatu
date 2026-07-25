CREATE FUNCTION public.get_order_operational_trace(p_order_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.auth_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders orders
  WHERE orders.id = p_order_id
    AND orders.tenant_id = public.auth_tenant_id();

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'orders:read') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'order_id', v_order.id,
    'branch_id', v_order.branch_id,
    'pos_session_id', v_order.pos_session_id,
    'item_summary', (
      SELECT jsonb_build_object(
        'item_row_count', count(*)::bigint,
        'item_quantity', COALESCE(sum(item.quantity), 0)::bigint,
        'main_dish_quantity', COALESCE(sum(item.quantity) FILTER (
          WHERE item.category_type_snapshot = 'main_dish'
        ), 0)::bigint,
        'side_dish_quantity', COALESCE(sum(item.quantity) FILTER (
          WHERE item.category_type_snapshot = 'side_dish'
        ), 0)::bigint,
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
        ), 0)::bigint,
        'served_item_quantity', COALESCE(sum(item.quantity) FILTER (
          WHERE item.status = 'served'
        ), 0)::bigint,
        'legacy_unclassified_quantity', COALESCE(sum(item.quantity) FILTER (
          WHERE item.category_type_snapshot IS NULL
        ), 0)::bigint,
        'legacy_current_main_dish_quantity', COALESCE(sum(item.quantity) FILTER (
          WHERE item.category_type_snapshot IS NULL
            AND current_category.type = 'main_dish'
        ), 0)::bigint,
        'legacy_current_side_dish_quantity', COALESCE(sum(item.quantity) FILTER (
          WHERE item.category_type_snapshot IS NULL
            AND current_category.type = 'side_dish'
        ), 0)::bigint
      )
      FROM public.order_items item
      LEFT JOIN public.menu_items current_item
        ON current_item.id = item.menu_item_id
       AND current_item.tenant_id = item.tenant_id
      LEFT JOIN public.menu_categories current_category
        ON current_category.id = current_item.category_id
       AND current_category.tenant_id = current_item.tenant_id
      WHERE item.tenant_id = v_order.tenant_id
        AND item.order_id = v_order.id
        AND item.status <> 'cancelled'
    ),
    'payments', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', payment.id,
          'method', payment.method,
          'amount', payment.amount,
          'status', payment.status,
          'provider_ref', payment.provider_ref,
          'paid_at', payment.paid_at,
          'created_at', payment.created_at,
          'reconciliation_status', CASE
            WHEN payment.method <> 'vietqr' THEN 'not_applicable'
            WHEN EXISTS (
              SELECT 1
              FROM public.bank_transaction_reconciliation_matches match
              WHERE match.tenant_id = payment.tenant_id
                AND match.payment_id = payment.id
            ) THEN 'matched'
            ELSE 'missing'
          END
        )
        ORDER BY
          COALESCE(payment.paid_at, payment.created_at),
          payment.id
      )
      FROM public.payments payment
      WHERE payment.tenant_id = v_order.tenant_id
        AND payment.order_id = v_order.id
    ), '[]'::jsonb),
    'kds_events', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', event.id,
          'event_type', event.event_type,
          'occurred_at', event.occurred_at,
          'actor_id', event.actor_id,
          'actor_name', actor.full_name,
          'ticket_id', event.ticket_id,
          'order_item_id', event.order_item_id,
          'station_id', event.station_id,
          'kitchen_send_batch_id', event.kitchen_send_batch_id,
          'from_status', event.from_status,
          'to_status', event.to_status,
          'reason', event.reason,
          'item_snapshot', event.item_snapshot,
          'context', event.context
        )
        ORDER BY event.occurred_at, event.id
      )
      FROM public.kds_ticket_events event
      LEFT JOIN public.profiles actor
        ON actor.id = event.actor_id
       AND actor.tenant_id = event.tenant_id
      WHERE event.tenant_id = v_order.tenant_id
        AND event.order_id = v_order.id
    ), '[]'::jsonb),
    'print_jobs', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', job.id,
          'job_type', job.job_type,
          'printer_id', job.printer_id,
          'status', job.status,
          'attempts', job.attempts,
          'retry_count', job.retry_count,
          'created_at', job.created_at,
          'printed_at', job.printed_at,
          'payload_summary', jsonb_strip_nulls(jsonb_build_object(
            'kind', job.payload->>'kind',
            'kitchen_ticket_number',
              job.payload->>'kitchen_ticket_number',
            'source_order_number', job.payload->>'source_order_number',
            'send_seq', job.payload->'send_seq',
            'send_kind', job.payload->>'send_kind',
            'ticket_ids', job.payload->'ticket_ids',
            'order_item_ids', job.payload->'order_item_ids',
            'items', job.payload->'items'
          ))
        )
        ORDER BY job.created_at, job.id
      )
      FROM public.print_jobs job
      WHERE job.tenant_id = v_order.tenant_id
        AND job.order_id = v_order.id
    ), '[]'::jsonb),
    'tax_invoices', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', invoice.id,
          'invoice_kind', invoice.invoice_kind,
          'status', invoice.status,
          'invoice_number', invoice.invoice_number,
          'provider', invoice.provider,
          'provider_ref', invoice.provider_ref,
          'issued_at', invoice.issued_at,
          'created_at', invoice.created_at
        )
        ORDER BY invoice.created_at, invoice.id
      )
      FROM (
        SELECT tax_invoice.*
        FROM public.tax_invoices tax_invoice
        WHERE tax_invoice.tenant_id = v_order.tenant_id
          AND tax_invoice.order_id = v_order.id

        UNION ALL

        SELECT tax_invoice.*
        FROM public.tax_invoice_orders invoice_order
        JOIN public.tax_invoices tax_invoice
          ON tax_invoice.id = invoice_order.tax_invoice_id
         AND tax_invoice.tenant_id = invoice_order.tenant_id
        WHERE invoice_order.tenant_id = v_order.tenant_id
          AND invoice_order.order_id = v_order.id
      ) invoice
    ), '[]'::jsonb),
    'audit_events', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', audit.id,
          'action', audit.action,
          'entity_type', audit.entity_type,
          'entity_id', audit.entity_id,
          'actor_id', audit.user_id,
          'actor_name', actor.full_name,
          'created_at', audit.created_at
        )
        ORDER BY audit.created_at, audit.id
      )
      FROM public.audit_logs audit
      LEFT JOIN public.profiles actor
        ON actor.id = audit.user_id
       AND actor.tenant_id = audit.tenant_id
      WHERE audit.tenant_id = v_order.tenant_id
        AND (
          (audit.entity_type = 'order' AND audit.entity_id = v_order.id)
          OR (
            audit.entity_type = 'payment'
            AND audit.entity_id IN (
              SELECT payment.id
              FROM public.payments payment
              WHERE payment.tenant_id = v_order.tenant_id
                AND payment.order_id = v_order.id
            )
          )
          OR (
            audit.entity_type = 'webhook_event'
            AND audit.entity_id IN (
              SELECT event.id
              FROM public.webhook_events event
              WHERE event.tenant_id = v_order.tenant_id
                AND event.order_id = v_order.id
            )
          )
        )
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_order_operational_trace(bigint) IS
  'Order-scoped immutable operational trace across payment, KDS, printing, HĐĐT, and server audit evidence.';

REVOKE ALL ON FUNCTION public.get_order_operational_trace(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_order_operational_trace(bigint)
  TO authenticated, service_role;

CREATE FUNCTION public.get_orders_for_day_v2(
  p_branch_id bigint,
  p_date date
)
RETURNS TABLE (
  payment_id bigint,
  order_id bigint,
  order_number text,
  order_status text,
  order_payment_status text,
  order_payment_state_mismatch boolean,
  branch_id bigint,
  branch_name text,
  paid_at timestamptz,
  paid_hour integer,
  order_type text,
  subtotal numeric,
  discount_amount numeric,
  tax_amount numeric,
  order_total_amount numeric,
  total_amount numeric,
  payment_method text,
  item_count bigint,
  item_row_count bigint,
  main_dish_quantity bigint,
  side_dish_quantity bigint,
  included_side_quantity bigint,
  served_item_quantity bigint,
  legacy_unclassified_quantity bigint,
  legacy_current_main_dish_quantity bigint,
  legacy_current_side_dish_quantity bigint,
  kds_ticket_count bigint,
  kds_completed_ticket_count bigint,
  kds_completed_item_quantity bigint,
  kds_legacy_completed_ticket_count bigint,
  kds_legacy_completed_item_quantity bigint,
  print_job_count bigint,
  printed_job_count bigint,
  print_failed_count bigint,
  pos_session_id bigint,
  payment_attempt_count bigint,
  completed_payment_count bigint,
  payment_attempts jsonb,
  reconciliation_status text,
  invoice_kind text,
  invoice_status text,
  invoice_number text,
  invoice_provider_ref text,
  invoice_evidence jsonb,
  audit_event_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id bigint := public.auth_tenant_id();
BEGIN
  IF auth.uid() IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_branch_id IS NULL OR p_branch_id <= 0 OR p_date IS NULL THEN
    RAISE EXCEPTION 'invalid_day_scope' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'finance:view') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.branches branch
    WHERE branch.id = p_branch_id
      AND branch.tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT
    payment.id,
    orders.id,
    orders.order_number,
    orders.status,
    orders.payment_status,
    orders.status = 'cancelled'
      OR orders.payment_status IS DISTINCT FROM 'paid'
      OR payment.amount IS DISTINCT FROM orders.total_amount
      OR payment_summary.completed_count <> 1,
    orders.branch_id,
    branch.name,
    payment.paid_at,
    EXTRACT(
      HOUR FROM payment.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh'
    )::integer,
    orders.order_type,
    orders.subtotal,
    orders.discount_amount,
    orders.tax_amount,
    orders.total_amount,
    payment.amount,
    payment.method,
    item_summary.item_quantity,
    item_summary.item_row_count,
    item_summary.main_dish_quantity,
    item_summary.side_dish_quantity,
    item_summary.included_side_quantity,
    item_summary.served_item_quantity,
    item_summary.legacy_unclassified_quantity,
    item_summary.legacy_current_main_dish_quantity,
    item_summary.legacy_current_side_dish_quantity,
    kds_summary.ticket_count,
    kds_summary.completed_ticket_count,
    kds_summary.completed_item_quantity,
    kds_summary.legacy_completed_ticket_count,
    kds_summary.legacy_completed_item_quantity,
    print_summary.job_count,
    print_summary.printed_count,
    print_summary.failed_count,
    orders.pos_session_id,
    payment_summary.attempt_count,
    payment_summary.completed_count,
    payment_summary.attempts,
    CASE
      WHEN payment.method <> 'vietqr' THEN 'not_applicable'
      WHEN reconciliation.payment_id IS NOT NULL THEN 'matched'
      ELSE 'missing'
    END,
    invoice_selected.invoice_kind,
    invoice_selected.status,
    invoice_selected.invoice_number,
    invoice_selected.provider_ref,
    invoice_summary.evidence,
    audit_summary.event_count
  FROM public.orders orders
  JOIN public.branches branch
    ON branch.id = orders.branch_id
   AND branch.tenant_id = orders.tenant_id
  JOIN LATERAL (
    SELECT candidate.*
    FROM public.payments candidate
    WHERE candidate.tenant_id = orders.tenant_id
      AND candidate.branch_id = orders.branch_id
      AND candidate.order_id = orders.id
      AND candidate.status = 'completed'
      AND candidate.paid_at IS NOT NULL
      AND (
        candidate.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh'
      )::date = p_date
    ORDER BY candidate.paid_at DESC, candidate.id DESC
    LIMIT 1
  ) payment ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*)::bigint AS item_row_count,
      COALESCE(sum(item.quantity), 0)::bigint AS item_quantity,
      COALESCE(sum(item.quantity) FILTER (
        WHERE item.category_type_snapshot = 'main_dish'
      ), 0)::bigint AS main_dish_quantity,
      COALESCE(sum(item.quantity) FILTER (
        WHERE item.category_type_snapshot = 'side_dish'
      ), 0)::bigint AS side_dish_quantity,
      COALESCE(sum(item.quantity) FILTER (
        WHERE item.status = 'served'
      ), 0)::bigint AS served_item_quantity,
      COALESCE(sum(item.quantity) FILTER (
        WHERE item.category_type_snapshot IS NULL
      ), 0)::bigint AS legacy_unclassified_quantity,
      COALESCE(sum(item.quantity) FILTER (
        WHERE item.category_type_snapshot IS NULL
          AND current_category.type = 'main_dish'
      ), 0)::bigint AS legacy_current_main_dish_quantity,
      COALESCE(sum(item.quantity) FILTER (
        WHERE item.category_type_snapshot IS NULL
          AND current_category.type = 'side_dish'
      ), 0)::bigint AS legacy_current_side_dish_quantity,
      COALESCE(sum(
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
      ), 0)::bigint AS included_side_quantity
    FROM public.order_items item
    LEFT JOIN public.menu_items current_item
      ON current_item.id = item.menu_item_id
     AND current_item.tenant_id = item.tenant_id
    LEFT JOIN public.menu_categories current_category
      ON current_category.id = current_item.category_id
     AND current_category.tenant_id = current_item.tenant_id
    WHERE item.tenant_id = orders.tenant_id
      AND item.order_id = orders.id
      AND item.status <> 'cancelled'
  ) item_summary ON true
  LEFT JOIN LATERAL (
    SELECT
      (
        SELECT count(DISTINCT event.ticket_id)::bigint
        FROM public.kds_ticket_events event
        WHERE event.tenant_id = orders.tenant_id
          AND event.order_id = orders.id
      ) AS ticket_count,
      (
        SELECT count(DISTINCT event.ticket_id)::bigint
        FROM public.kds_ticket_events event
        WHERE event.tenant_id = orders.tenant_id
          AND event.order_id = orders.id
          AND event.event_type = 'completed'
          AND event.context->>'evidence_source'
            IS DISTINCT FROM 'legacy_live_snapshot'
      ) AS completed_ticket_count,
      COALESCE((
        SELECT sum(completed.quantity)::bigint
        FROM (
          SELECT DISTINCT ON (event.order_item_id)
            CASE
              WHEN COALESCE(
                event.item_snapshot->>'quantity',
                ''
              ) ~ '^[0-9]+$'
                THEN (event.item_snapshot->>'quantity')::bigint
              ELSE 0
            END AS quantity
          FROM public.kds_ticket_events event
          WHERE event.tenant_id = orders.tenant_id
            AND event.order_id = orders.id
            AND event.event_type = 'completed'
            AND event.context->>'evidence_source'
              IS DISTINCT FROM 'legacy_live_snapshot'
          ORDER BY
            event.order_item_id,
            event.occurred_at,
            event.id
        ) completed
      ), 0)::bigint AS completed_item_quantity,
      (
        SELECT count(DISTINCT event.ticket_id)::bigint
        FROM public.kds_ticket_events event
        WHERE event.tenant_id = orders.tenant_id
          AND event.order_id = orders.id
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
      ) AS legacy_completed_ticket_count,
      COALESCE((
        SELECT sum(completed.quantity)::bigint
        FROM (
          SELECT DISTINCT ON (event.order_item_id)
            CASE
              WHEN COALESCE(
                event.item_snapshot->>'quantity',
                ''
              ) ~ '^[0-9]+$'
                THEN (event.item_snapshot->>'quantity')::bigint
              ELSE 0
            END AS quantity
          FROM public.kds_ticket_events event
          WHERE event.tenant_id = orders.tenant_id
            AND event.order_id = orders.id
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
          ORDER BY
            event.order_item_id,
            event.occurred_at,
            event.id
        ) completed
      ), 0)::bigint AS legacy_completed_item_quantity
  ) kds_summary ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*)::bigint AS job_count,
      count(*) FILTER (WHERE job.status = 'printed')::bigint
        AS printed_count,
      count(*) FILTER (
        WHERE job.status IN ('failed', 'expired')
      )::bigint AS failed_count
    FROM public.print_jobs job
    WHERE job.tenant_id = orders.tenant_id
      AND job.order_id = orders.id
  ) print_summary ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*)::bigint AS attempt_count,
      count(*) FILTER (
        WHERE attempt.status = 'completed'
      )::bigint AS completed_count,
      jsonb_agg(
        jsonb_build_object(
          'id', attempt.id,
          'method', attempt.method,
          'amount', attempt.amount,
          'status', attempt.status,
          'paid_at', attempt.paid_at,
          'created_at', attempt.created_at
        )
        ORDER BY COALESCE(attempt.paid_at, attempt.created_at), attempt.id
      ) AS attempts
    FROM public.payments attempt
    WHERE attempt.tenant_id = orders.tenant_id
      AND attempt.order_id = orders.id
  ) payment_summary ON true
  LEFT JOIN public.bank_transaction_reconciliation_matches reconciliation
    ON reconciliation.tenant_id = payment.tenant_id
   AND reconciliation.payment_id = payment.id
  LEFT JOIN LATERAL (
    SELECT evidence.*
    FROM (
      SELECT
        invoice.id,
        invoice.invoice_kind,
        invoice.status,
        invoice.invoice_number,
        invoice.provider_ref,
        invoice.created_at
      FROM public.tax_invoices invoice
      WHERE invoice.tenant_id = orders.tenant_id
        AND invoice.order_id = orders.id

      UNION ALL

      SELECT
        invoice.id,
        invoice.invoice_kind,
        invoice.status,
        invoice.invoice_number,
        invoice.provider_ref,
        invoice.created_at
      FROM public.tax_invoice_orders invoice_order
      JOIN public.tax_invoices invoice
        ON invoice.id = invoice_order.tax_invoice_id
       AND invoice.tenant_id = invoice_order.tenant_id
      WHERE invoice_order.tenant_id = orders.tenant_id
        AND invoice_order.order_id = orders.id
    ) evidence
    ORDER BY
      CASE evidence.status
        WHEN 'issued' THEN 1
        WHEN 'submitted' THEN 2
        WHEN 'signing' THEN 3
        WHEN 'draft' THEN 4
        WHEN 'not_required' THEN 5
        WHEN 'replaced' THEN 6
        WHEN 'cancelled' THEN 7
        ELSE 8
      END,
      evidence.created_at DESC,
      evidence.id DESC
    LIMIT 1
  ) invoice_selected ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', evidence.id,
        'invoice_kind', evidence.invoice_kind,
        'status', evidence.status,
        'invoice_number', evidence.invoice_number,
        'provider_ref', evidence.provider_ref,
        'created_at', evidence.created_at
      )
      ORDER BY evidence.created_at, evidence.id
    ), '[]'::jsonb) AS evidence
    FROM (
      SELECT
        invoice.id,
        invoice.invoice_kind,
        invoice.status,
        invoice.invoice_number,
        invoice.provider_ref,
        invoice.created_at
      FROM public.tax_invoices invoice
      WHERE invoice.tenant_id = orders.tenant_id
        AND invoice.order_id = orders.id

      UNION ALL

      SELECT
        invoice.id,
        invoice.invoice_kind,
        invoice.status,
        invoice.invoice_number,
        invoice.provider_ref,
        invoice.created_at
      FROM public.tax_invoice_orders invoice_order
      JOIN public.tax_invoices invoice
        ON invoice.id = invoice_order.tax_invoice_id
       AND invoice.tenant_id = invoice_order.tenant_id
      WHERE invoice_order.tenant_id = orders.tenant_id
        AND invoice_order.order_id = orders.id
    ) evidence
  ) invoice_summary ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS event_count
    FROM public.audit_logs audit
    WHERE audit.tenant_id = orders.tenant_id
      AND (
        (audit.entity_type = 'order' AND audit.entity_id = orders.id)
        OR (
          audit.entity_type = 'payment'
          AND audit.entity_id IN (
            SELECT attempt.id
            FROM public.payments attempt
            WHERE attempt.tenant_id = orders.tenant_id
              AND attempt.order_id = orders.id
          )
        )
        OR (
          audit.entity_type = 'webhook_event'
          AND audit.entity_id IN (
            SELECT event.id
            FROM public.webhook_events event
            WHERE event.tenant_id = orders.tenant_id
              AND event.order_id = orders.id
          )
        )
      )
  ) audit_summary ON true
  WHERE orders.tenant_id = v_tenant_id
    AND orders.branch_id = p_branch_id
  ORDER BY payment.paid_at, payment.id;
END;
$$;

COMMENT ON FUNCTION public.get_orders_for_day_v2(bigint, date) IS
  'One row per order with its canonical completed payment bucketed by payments.paid_at in Asia/Ho_Chi_Minh. Order mirror mismatches remain visible as exceptions.';

REVOKE ALL ON FUNCTION public.get_orders_for_day_v2(bigint, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_orders_for_day_v2(bigint, date)
  TO authenticated, service_role;
