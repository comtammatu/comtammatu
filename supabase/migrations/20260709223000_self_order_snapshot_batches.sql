-- Guest bill history: expose self_order_batches as rounds on snapshot.
-- Heal orphan pending_approval sessions (no pending batch) to revoked in DB.
-- Do NOT expose closed sessions via the stable table QR token (next guest leak).
-- Harden submit_batch so orphan pending sessions cannot accept new batches.

CREATE OR REPLACE FUNCTION public.self_order_get_snapshot(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_table record;
  v_session record;
  v_order record;
  v_payment_request record;
  v_session_payload jsonb := NULL;
  v_order_payload jsonb := NULL;
  v_order_items jsonb := NULL;
  v_payment_request_payload jsonb := NULL;
  v_batches_payload jsonb := NULL;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT
    t.id AS table_id,
    t.tenant_id,
    t.branch_id,
    t.number AS table_number,
    t.self_order_token,
    t.self_order_token_rotated_at,
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

  IF NOT public.self_order_branch_has_open_pos_session(v_table.tenant_id, v_table.branch_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'pos_session_closed');
  END IF;

  -- Current guest session only. Never include closed: the table QR token is
  -- stable across seatings unless staff rotates it manually.
  SELECT *
  INTO v_session
  FROM public.self_order_sessions s
  WHERE s.tenant_id = v_table.tenant_id
    AND s.table_id = v_table.table_id
    AND s.status IN ('pending_approval', 'active', 'revoked')
    AND s.token_snapshot = v_table.self_order_token
    AND s.token_rotated_at_snapshot IS NOT DISTINCT FROM v_table.self_order_token_rotated_at
  ORDER BY s.id DESC
  LIMIT 1;

  IF FOUND THEN
    -- Heal orphan pending_approval (no live pending batch) in DB.
    IF v_session.status = 'pending_approval'
       AND NOT EXISTS (
         SELECT 1
         FROM public.self_order_batches b
         WHERE b.tenant_id = v_session.tenant_id
           AND b.session_id = v_session.id
           AND b.status = 'pending_approval'
       ) THEN
      UPDATE public.self_order_sessions
         SET status = 'revoked',
             closed_at = COALESCE(closed_at, now()),
             close_reason = COALESCE(close_reason, 'orphan_pending_no_batch')
       WHERE id = v_session.id
         AND tenant_id = v_session.tenant_id
         AND status = 'pending_approval'
      RETURNING * INTO v_session;
    END IF;

    v_session_payload := jsonb_build_object(
      'status', v_session.status,
      'createdAt', v_session.created_at,
      'approvedAt', v_session.approved_at
    );

    SELECT COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', ranked.id,
            'roundIndex', ranked.round_index,
            'status', ranked.guest_status,
            'items', ranked.items,
            'customerNote', ranked.customer_note,
            'createdAt', ranked.created_at,
            'decidedAt', ranked.decided_at
          )
          ORDER BY ranked.round_index
        )
        FROM (
          SELECT
            b.id,
            row_number() OVER (ORDER BY b.created_at, b.id)::int AS round_index,
            CASE
              WHEN b.status IN ('accepted', 'auto_accepted') THEN 'approved'
              WHEN b.status = 'rejected' THEN 'rejected'
              WHEN b.status = 'pending_approval' THEN 'pending_approval'
              ELSE 'rejected'
            END AS guest_status,
            (
              SELECT COALESCE(
                jsonb_agg(
                  jsonb_build_object(
                    'menuItemId',
                      CASE
                        WHEN (elem->>'menu_item_id') ~ '^[0-9]+$'
                          THEN (elem->>'menu_item_id')::bigint
                        ELSE NULL
                      END,
                    'itemName', COALESCE(NULLIF(elem->>'item_name', ''), '?'),
                    'variantId',
                      CASE
                        WHEN (elem->>'variant_id') ~ '^[0-9]+$'
                          THEN (elem->>'variant_id')::bigint
                        ELSE NULL
                      END,
                    'variantName', NULLIF(elem->>'variant_name', ''),
                    'quantity',
                      CASE
                        WHEN (elem->>'quantity') ~ '^[0-9]+$'
                          THEN GREATEST(1, LEAST(99, (elem->>'quantity')::int))
                        ELSE 1
                      END,
                    'unitPrice',
                      CASE
                        WHEN (elem->>'unit_price') ~ '^[0-9]+(\.[0-9]+)?$'
                          THEN (elem->>'unit_price')::numeric
                        ELSE 0
                      END,
                    'modifiers',
                      CASE
                        WHEN jsonb_typeof(elem->'modifiers') = 'array'
                          THEN elem->'modifiers'
                        ELSE '[]'::jsonb
                      END,
                    'sides',
                      CASE
                        WHEN jsonb_typeof(elem->'sides') = 'array'
                          THEN elem->'sides'
                        ELSE '[]'::jsonb
                      END,
                    'note', NULLIF(elem->>'note', '')
                  )
                ),
                '[]'::jsonb
              )
              FROM jsonb_array_elements(
                CASE
                  WHEN jsonb_typeof(b.cart_payload) = 'array' THEN b.cart_payload
                  ELSE '[]'::jsonb
                END
              ) AS elem
            ) AS items,
            b.customer_note,
            b.created_at,
            COALESCE(b.accepted_at, b.rejected_at) AS decided_at
          FROM public.self_order_batches b
          WHERE b.tenant_id = v_session.tenant_id
            AND b.session_id = v_session.id
            AND b.status IN (
              'pending_approval',
              'accepted',
              'auto_accepted',
              'rejected'
            )
        ) ranked
      ),
      '[]'::jsonb
    )
    INTO v_batches_payload;

    IF v_session.status = 'active'
       AND v_session.order_id IS NOT NULL THEN
      SELECT
        o.order_number,
        o.status,
        o.payment_status,
        o.payment_method,
        o.total_amount,
        COALESCE(SUM(oi.quantity) FILTER (WHERE oi.status <> 'cancelled'), 0)::int AS item_count
      INTO v_order
      FROM public.orders o
      LEFT JOIN public.order_items oi
        ON oi.order_id = o.id
       AND oi.tenant_id = o.tenant_id
      WHERE o.id = v_session.order_id
        AND o.tenant_id = v_session.tenant_id
      GROUP BY o.id;

      IF FOUND THEN
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
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
            ) ORDER BY oi.id),
          '[]'::jsonb
        )
        INTO v_order_items
        FROM public.order_items oi
        WHERE oi.order_id = v_session.order_id
          AND oi.tenant_id = v_session.tenant_id
          AND oi.status <> 'cancelled';

        v_order_payload := jsonb_build_object(
          'orderNumber', v_order.order_number,
          'status', v_order.status,
          'paymentStatus', v_order.payment_status,
          'paymentMethod', v_order.payment_method,
          'totalAmount', v_order.total_amount,
          'itemCount', v_order.item_count,
          'items', v_order_items
        );
      END IF;

      SELECT status, method, amount_snapshot, created_at
      INTO v_payment_request
      FROM public.self_order_payment_requests pr
      WHERE pr.tenant_id = v_session.tenant_id
        AND pr.session_id = v_session.id
        AND pr.status IN ('cash_call', 'vietqr_pending')
      ORDER BY pr.id DESC
      LIMIT 1;

      IF FOUND THEN
        v_payment_request_payload := jsonb_build_object(
          'status', v_payment_request.status,
          'method', v_payment_request.method,
          'amount', v_payment_request.amount_snapshot,
          'createdAt', v_payment_request.created_at
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'branch', jsonb_build_object(
      'name', v_table.branch_name
    ),
    'table', jsonb_build_object(
      'number', v_table.table_number
    ),
    'session', v_session_payload,
    'order', v_order_payload,
    'batches', COALESCE(v_batches_payload, '[]'::jsonb),
    'paymentRequest', v_payment_request_payload,
    'menu', public.self_order_menu_payload(v_table.tenant_id),
    'realtimeTopic', 'self-order:' || v_table.self_order_token
  );
END;
$$;

REVOKE ALL ON FUNCTION public.self_order_get_snapshot(text) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.self_order_get_snapshot(text) TO service_role;

CREATE OR REPLACE FUNCTION public.self_order_submit_batch(
  p_token text,
  p_client_op_id uuid,
  p_items jsonb,
  p_customer_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_table record;
  v_session record;
  v_batch record;
  v_items jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'invalid_cart_payload' USING ERRCODE = '22023';
  END IF;

  SELECT t.*
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

  PERFORM 1
  FROM public.self_order_sessions s
  WHERE s.tenant_id = v_table.tenant_id
    AND s.table_id = v_table.id
    AND s.status = 'revoked'
    AND s.token_snapshot = v_table.self_order_token
    AND s.token_rotated_at_snapshot IS NOT DISTINCT FROM v_table.self_order_token_rotated_at
  ORDER BY s.id DESC
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'self_order_session_revoked' USING ERRCODE = '22023';
  END IF;

  v_items := public.self_order_canonicalize_cart(v_table.tenant_id, p_items);

  LOOP
    SELECT *
    INTO v_session
    FROM public.self_order_sessions s
    WHERE s.tenant_id = v_table.tenant_id
      AND s.table_id = v_table.id
      AND s.status IN ('pending_approval', 'active')
    ORDER BY s.id DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      -- Orphan pending_approval: heal + block (same as staff reject).
      IF v_session.status = 'pending_approval'
         AND NOT EXISTS (
           SELECT 1
           FROM public.self_order_batches b
           WHERE b.tenant_id = v_session.tenant_id
             AND b.session_id = v_session.id
             AND b.status = 'pending_approval'
         ) THEN
        UPDATE public.self_order_sessions
           SET status = 'revoked',
               closed_at = COALESCE(closed_at, now()),
               close_reason = COALESCE(close_reason, 'orphan_pending_no_batch')
         WHERE id = v_session.id
           AND tenant_id = v_session.tenant_id
           AND status = 'pending_approval';
        RAISE EXCEPTION 'self_order_session_revoked' USING ERRCODE = '22023';
      END IF;
      EXIT;
    END IF;

    BEGIN
      INSERT INTO public.self_order_sessions (
        tenant_id, branch_id, table_id, status,
        token_snapshot, token_rotated_at_snapshot
      )
      VALUES (
        v_table.tenant_id, v_table.branch_id, v_table.id, 'pending_approval',
        v_table.self_order_token, v_table.self_order_token_rotated_at
      )
      RETURNING * INTO v_session;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  INSERT INTO public.self_order_batches (
    tenant_id, branch_id, table_id, session_id,
    client_op_id, status, cart_payload, customer_note
  )
  VALUES (
    v_table.tenant_id, v_table.branch_id, v_table.id, v_session.id,
    p_client_op_id, 'pending_approval', v_items, NULLIF(btrim(COALESCE(p_customer_note, '')), '')
  )
  ON CONFLICT (tenant_id, session_id, client_op_id) DO UPDATE
    SET updated_at = public.self_order_batches.updated_at
  RETURNING * INTO v_batch;

  IF v_batch.status IN ('accepted', 'auto_accepted') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', v_batch.status,
      'idempotent', true
    );
  END IF;

  IF v_session.status = 'active' THEN
    RETURN public.self_order_append_active_batch(
      v_session.id,
      v_batch.id,
      p_client_op_id,
      v_items
    ) || jsonb_build_object('ok', true, 'status', 'auto_accepted');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'pending_approval',
    'batchId', v_batch.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.self_order_submit_batch(text, uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.self_order_submit_batch(text, uuid, jsonb, text) TO service_role;
