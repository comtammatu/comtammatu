CREATE OR REPLACE FUNCTION public.self_order_get_snapshot(
  p_token text,
  p_client_op_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_table record;
  v_request public.self_order_requests%ROWTYPE;
  v_request_found boolean := false;
  v_open_order_count integer := 0;
  v_order_id bigint;
  v_order_payload jsonb := NULL;
  v_rounds_payload jsonb := '[]'::jsonb;
  v_payment_payload jsonb := NULL;
  v_request_payload jsonb := NULL;
  v_state text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT
    t.id AS table_id,
    t.tenant_id,
    t.branch_id,
    t.number AS table_number,
    b.name AS branch_name
  INTO v_table
  FROM public.tables t
  JOIN public.branches b
    ON b.id = t.branch_id
   AND b.tenant_id = t.tenant_id
   AND b.is_active = true
  WHERE t.self_order_token = p_token
    AND t.self_order_enabled = true
    AND t.status <> 'maintenance'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_disabled_token');
  END IF;

  IF NOT public.self_order_branch_has_open_pos_session(
    v_table.tenant_id,
    v_table.branch_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'pos_session_closed');
  END IF;

  SELECT r.*
  INTO v_request
  FROM public.self_order_requests r
  WHERE r.tenant_id = v_table.tenant_id
    AND r.table_id = v_table.table_id
    AND r.status = 'pending'
  ORDER BY r.id DESC
  LIMIT 1;
  v_request_found := FOUND;

  IF NOT v_request_found AND p_client_op_id IS NOT NULL THEN
    SELECT r.*
    INTO v_request
    FROM public.self_order_requests r
    WHERE r.tenant_id = v_table.tenant_id
      AND r.table_id = v_table.table_id
      AND r.client_op_id = p_client_op_id
      AND r.status = 'rejected'
    ORDER BY r.id DESC
    LIMIT 1;
    v_request_found := FOUND;
  END IF;

  IF v_request_found THEN
    v_request_payload := jsonb_build_object(
      'id', v_request.id,
      'clientOpId', v_request.client_op_id,
      'status', v_request.status,
      'items', v_request.cart_payload,
      'customerNote', v_request.customer_note,
      'orderId', v_request.order_id,
      'createdAt', v_request.created_at,
      'decidedAt', v_request.decided_at
    );
  END IF;

  SELECT count(*)::integer, min(o.id)
  INTO v_open_order_count, v_order_id
  FROM public.orders o
  WHERE o.tenant_id = v_table.tenant_id
    AND o.branch_id = v_table.branch_id
    AND o.table_id = v_table.table_id
    AND o.payment_status <> 'paid'
    AND o.status NOT IN ('completed', 'cancelled')
    AND o.merged_into_order_id IS NULL;

  IF v_open_order_count = 1 THEN
    SELECT jsonb_build_object(
      'id', o.id,
      'orderNumber', o.order_number,
      'status', o.status,
      'paymentStatus', o.payment_status,
      'paymentMethod', o.payment_method,
      'subtotal', o.subtotal,
      'serviceCharge', o.service_charge,
      'discountAmount', o.discount_amount,
      'totalAmount', o.total_amount,
      'itemCount', (
        SELECT COALESCE(sum(oi.quantity), 0)::integer
        FROM public.order_items oi
        WHERE oi.tenant_id = o.tenant_id
          AND oi.order_id = o.id
          AND oi.status <> 'cancelled'
      ),
      'items', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'id', oi.id,
            'menuItemId', oi.menu_item_id,
            'itemName', oi.item_name,
            'variantId', oi.variant_id,
            'variantName', oi.variant_name,
            'quantity', oi.quantity,
            'unitPrice', oi.unit_price,
            'lineTotal', oi.subtotal,
            'modifiers', COALESCE(oi.modifiers, '[]'::jsonb),
            'sides', COALESCE(oi.sides, '[]'::jsonb),
            'note', oi.note
          ) ORDER BY oi.id
        ), '[]'::jsonb)
        FROM public.order_items oi
        WHERE oi.tenant_id = o.tenant_id
          AND oi.order_id = o.id
          AND oi.status <> 'cancelled'
      )
    )
    INTO v_order_payload
    FROM public.orders o
    WHERE o.id = v_order_id
      AND o.tenant_id = v_table.tenant_id;

    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', ksb.id,
        'sendSeq', ksb.send_seq,
        'kind', ksb.kind,
        'ticketNumber', ksb.kitchen_ticket_number,
        'createdAt', ksb.created_at,
        'items', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', lines.id,
              'itemName', lines.item_name,
              'variantName', lines.variant_name,
              'quantity', lines.quantity,
              'modifiers', lines.modifiers,
              'sides', lines.sides,
              'note', lines.note
            ) ORDER BY lines.id
          )
          FROM (
            SELECT DISTINCT ON (oi.id)
              oi.id,
              oi.item_name,
              oi.variant_name,
              oi.quantity,
              COALESCE(oi.modifiers, '[]'::jsonb) AS modifiers,
              COALESCE(oi.sides, '[]'::jsonb) AS sides,
              oi.note
            FROM public.kds_tickets kt
            JOIN public.order_items oi
              ON oi.id = kt.order_item_id
             AND oi.tenant_id = kt.tenant_id
            WHERE kt.tenant_id = v_table.tenant_id
              AND kt.kitchen_send_batch_id = ksb.id
            ORDER BY oi.id, kt.id
          ) lines
        ), '[]'::jsonb)
      ) ORDER BY ksb.send_seq
    ), '[]'::jsonb)
    INTO v_rounds_payload
    FROM public.kitchen_send_batches ksb
    WHERE ksb.tenant_id = v_table.tenant_id
      AND ksb.order_id = v_order_id;

    SELECT public.self_order_payment_request_public_payload(pr.id)
    INTO v_payment_payload
    FROM public.self_order_payment_requests pr
    WHERE pr.tenant_id = v_table.tenant_id
      AND pr.order_id = v_order_id
      AND pr.status IN ('cash_call', 'vietqr_pending')
      AND pr.expires_at > now()
    ORDER BY pr.id DESC
    LIMIT 1;
  END IF;

  v_state := CASE
    WHEN v_request_found AND v_request.status = 'pending'
      THEN 'awaiting_confirmation'
    WHEN v_open_order_count > 1
      THEN 'multiple_open_orders'
    WHEN v_open_order_count = 1 AND v_payment_payload IS NOT NULL
      THEN 'payment_pending'
    WHEN v_open_order_count = 1
      THEN 'open'
    WHEN v_request_found AND v_request.status = 'rejected'
      THEN 'rejected'
    ELSE 'unopened'
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'state', v_state,
    'branch', jsonb_build_object('name', v_table.branch_name),
    'table', jsonb_build_object(
      'id', v_table.table_id,
      'number', v_table.table_number
    ),
    'openOrderCount', v_open_order_count,
    'order', CASE WHEN v_open_order_count = 1 THEN v_order_payload ELSE NULL END,
    'rounds', CASE WHEN v_open_order_count = 1 THEN v_rounds_payload ELSE '[]'::jsonb END,
    'request', v_request_payload,
    'paymentRequest', CASE WHEN v_open_order_count = 1 THEN v_payment_payload ELSE NULL END,
    'menu', public.self_order_menu_payload(v_table.tenant_id)
  );
END;
$$;
