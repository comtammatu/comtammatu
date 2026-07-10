CREATE TABLE public.self_order_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id bigint NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  table_id bigint NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
  cart_payload jsonb NOT NULL,
  customer_note text,
  client_op_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  order_id bigint REFERENCES public.orders(id) ON DELETE SET NULL,
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT self_order_requests_status_check
    CHECK (status IN ('pending', 'accepted', 'rejected')),
  CONSTRAINT self_order_requests_cart_array_check
    CHECK (jsonb_typeof(cart_payload) = 'array' AND jsonb_array_length(cart_payload) > 0),
  CONSTRAINT self_order_requests_customer_note_length
    CHECK (customer_note IS NULL OR char_length(customer_note) <= 500),
  CONSTRAINT self_order_requests_decision_check
    CHECK (
      (status = 'pending' AND decided_at IS NULL)
      OR (status IN ('accepted', 'rejected') AND decided_at IS NOT NULL)
    )
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.self_order_batches b
    WHERE b.status = 'pending_approval'
    GROUP BY b.tenant_id, b.client_op_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'self_order_pending_batch_client_op_duplicate';
  END IF;
END;
$$;

WITH pending_batches AS (
  SELECT
    b.*,
    row_number() OVER (
      PARTITION BY b.table_id
      ORDER BY b.created_at DESC, b.id DESC
    ) AS table_rank
  FROM public.self_order_batches b
  WHERE b.status = 'pending_approval'
)
INSERT INTO public.self_order_requests (
  tenant_id,
  branch_id,
  table_id,
  cart_payload,
  customer_note,
  client_op_id,
  status,
  order_id,
  decided_at,
  created_at
)
SELECT
  b.tenant_id,
  b.branch_id,
  b.table_id,
  b.cart_payload,
  b.customer_note,
  b.client_op_id,
  CASE WHEN b.table_rank = 1 THEN 'pending' ELSE 'rejected' END,
  COALESCE(b.order_id, s.order_id),
  CASE WHEN b.table_rank = 1 THEN NULL ELSE now() END,
  b.created_at
FROM pending_batches b
LEFT JOIN public.self_order_sessions s
  ON s.id = b.session_id
 AND s.tenant_id = b.tenant_id;

CREATE UNIQUE INDEX self_order_requests_one_pending_per_table
  ON public.self_order_requests (table_id)
  WHERE status = 'pending';

CREATE UNIQUE INDEX self_order_requests_client_op_id_uidx
  ON public.self_order_requests (tenant_id, client_op_id);

CREATE INDEX idx_self_order_requests_branch_status
  ON public.self_order_requests (tenant_id, branch_id, status, created_at DESC);

ALTER TABLE public.self_order_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY self_order_requests_staff_select
  ON public.self_order_requests
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT public.auth_tenant_id())
    AND public.has_permission(branch_id, 'pos:use')
  );

REVOKE ALL PRIVILEGES ON TABLE public.self_order_requests
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.self_order_requests TO authenticated, service_role;
REVOKE ALL PRIVILEGES ON SEQUENCE public.self_order_requests_id_seq
  FROM PUBLIC, anon, authenticated, service_role;

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

CREATE OR REPLACE FUNCTION public.self_order_get_snapshot(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  RETURN public.self_order_get_snapshot(p_token, NULL::uuid);
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_submit(
  p_token text,
  p_items jsonb,
  p_customer_note text,
  p_client_op_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_table public.tables%ROWTYPE;
  v_existing public.self_order_requests%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_active_request public.self_order_payment_requests%ROWTYPE;
  v_items jsonb;
  v_note text := NULLIF(btrim(COALESCE(p_customer_note, '')), '');
  v_open_order_count integer := 0;
  v_order_id bigint;
  v_request_id bigint;
  v_result jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_client_op_id IS NULL THEN
    RAISE EXCEPTION 'self_order_missing_operation_id' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'self_order_customer_note_too_long' USING ERRCODE = '22023';
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

  PERFORM pg_advisory_xact_lock(
    hashtext('self-order-table'),
    hashtext(v_table.id::text)
  );

  SELECT t.*
  INTO v_table
  FROM public.tables t
  WHERE t.id = v_table.id
    AND t.self_order_token = p_token
    AND t.self_order_enabled = true
    AND t.status <> 'maintenance';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_disabled_token');
  END IF;
  IF NOT public.self_order_branch_has_open_pos_session(
    v_table.tenant_id,
    v_table.branch_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'pos_session_closed');
  END IF;

  v_items := public.self_order_canonicalize_cart(v_table.tenant_id, p_items);

  SELECT r.*
  INTO v_existing
  FROM public.self_order_requests r
  WHERE r.tenant_id = v_table.tenant_id
    AND r.client_op_id = p_client_op_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.table_id <> v_table.id
       OR (
         SELECT jsonb_agg(item.value - 'key' ORDER BY item.ordinality)
         FROM jsonb_array_elements(v_existing.cart_payload)
           WITH ORDINALITY AS item(value, ordinality)
       ) IS DISTINCT FROM (
         SELECT jsonb_agg(item.value - 'key' ORDER BY item.ordinality)
         FROM jsonb_array_elements(v_items)
           WITH ORDINALITY AS item(value, ordinality)
       )
       OR v_existing.customer_note IS DISTINCT FROM v_note THEN
      RAISE EXCEPTION 'self_order_idempotency_conflict' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'requestId', v_existing.id,
      'status', v_existing.status,
      'orderId', v_existing.order_id
    );
  END IF;

  SELECT count(*)::integer, min(o.id)
  INTO v_open_order_count, v_order_id
  FROM public.orders o
  WHERE o.tenant_id = v_table.tenant_id
    AND o.branch_id = v_table.branch_id
    AND o.table_id = v_table.id
    AND o.payment_status <> 'paid'
    AND o.status NOT IN ('completed', 'cancelled')
    AND o.merged_into_order_id IS NULL;

  IF v_open_order_count = 1 THEN
    SELECT o.*
    INTO v_order
    FROM public.orders o
    WHERE o.id = v_order_id
      AND o.tenant_id = v_table.tenant_id
    FOR UPDATE;

    SELECT pr.*
    INTO v_active_request
    FROM public.self_order_payment_requests pr
    WHERE pr.tenant_id = v_order.tenant_id
      AND pr.order_id = v_order.id
      AND pr.status IN ('cash_call', 'vietqr_pending')
    ORDER BY pr.id DESC
    LIMIT 1;

    IF FOUND AND v_active_request.expires_at <= now() THEN
      PERFORM public.self_order_expire_payment_request(v_active_request.id);
    END IF;

    IF public.self_order_active_payment_lock(v_order.id) IS NOT NULL THEN
      RAISE EXCEPTION 'self_order_pending_payment_exists' USING ERRCODE = '55P03';
    END IF;

    PERFORM public.self_order_set_actor_claims(v_order.created_by, v_order.tenant_id);
    v_result := public.append_order_items(v_order.id, v_items, p_client_op_id);

    INSERT INTO public.self_order_requests (
      tenant_id,
      branch_id,
      table_id,
      cart_payload,
      customer_note,
      client_op_id,
      status,
      order_id,
      decided_by,
      decided_at
    )
    VALUES (
      v_table.tenant_id,
      v_table.branch_id,
      v_table.id,
      v_items,
      v_note,
      p_client_op_id,
      'accepted',
      v_order.id,
      v_order.created_by,
      now()
    )
    RETURNING id INTO v_request_id;

    RETURN COALESCE(v_result, '{}'::jsonb) || jsonb_build_object(
      'ok', true,
      'requestId', v_request_id,
      'status', 'accepted',
      'orderId', v_order.id
    );
  END IF;

  BEGIN
    INSERT INTO public.self_order_requests (
      tenant_id,
      branch_id,
      table_id,
      cart_payload,
      customer_note,
      client_op_id,
      status
    )
    VALUES (
      v_table.tenant_id,
      v_table.branch_id,
      v_table.id,
      v_items,
      v_note,
      p_client_op_id,
      'pending'
    )
    RETURNING id INTO v_request_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'self_order_pending_request_exists' USING ERRCODE = '55P03';
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'requestId', v_request_id,
    'status', 'pending',
    'openOrderCount', v_open_order_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_accept_request(
  p_request_id bigint,
  p_target_order_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_request_ref public.self_order_requests%ROWTYPE;
  v_request public.self_order_requests%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_open_order_count integer := 0;
  v_order_id bigint;
  v_pos_session_id bigint;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT r.*
  INTO v_request_ref
  FROM public.self_order_requests r
  WHERE r.id = p_request_id
    AND r.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_request_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(v_request_ref.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'permission denied: pos:use' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('self-order-table'),
    hashtext(v_request_ref.table_id::text)
  );

  SELECT r.*
  INTO v_request
  FROM public.self_order_requests r
  WHERE r.id = v_request_ref.id
    AND r.tenant_id = v_request_ref.tenant_id
  FOR UPDATE;

  IF v_request.status = 'accepted' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'status', 'accepted',
      'orderId', v_request.order_id
    );
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'self_order_request_not_pending' USING ERRCODE = '22023';
  END IF;

  SELECT ps.id
  INTO v_pos_session_id
  FROM public.pos_sessions ps
  WHERE ps.tenant_id = v_request.tenant_id
    AND ps.branch_id = v_request.branch_id
    AND ps.status = 'open'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_pos_session_closed' USING ERRCODE = '22023';
  END IF;

  IF p_target_order_id IS NOT NULL THEN
    v_order_id := p_target_order_id;
  ELSE
    SELECT count(*)::integer, min(o.id)
    INTO v_open_order_count, v_order_id
    FROM public.orders o
    WHERE o.tenant_id = v_request.tenant_id
      AND o.branch_id = v_request.branch_id
      AND o.table_id = v_request.table_id
      AND o.payment_status <> 'paid'
      AND o.status NOT IN ('completed', 'cancelled')
      AND o.merged_into_order_id IS NULL;

    IF v_open_order_count <> 1 THEN
      v_order_id := NULL;
    END IF;
  END IF;

  IF v_order_id IS NULL THEN
    v_result := public.create_order(
      v_request.tenant_id,
      v_request.branch_id,
      v_uid,
      v_request.cart_payload,
      'dine_in',
      v_request.table_id,
      v_pos_session_id,
      v_request.customer_note,
      v_request.client_op_id
    );
    v_order_id := NULLIF(v_result ->> 'order_id', '')::bigint;
  ELSE
    SELECT o.*
    INTO v_order
    FROM public.orders o
    WHERE o.id = v_order_id
      AND o.tenant_id = v_request.tenant_id
      AND o.branch_id = v_request.branch_id
      AND o.table_id = v_request.table_id
      AND o.payment_status <> 'paid'
      AND o.status NOT IN ('completed', 'cancelled')
      AND o.merged_into_order_id IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'self_order_target_order_not_appendable' USING ERRCODE = '22023';
    END IF;
    IF public.self_order_active_payment_lock(v_order.id) IS NOT NULL THEN
      RAISE EXCEPTION 'self_order_pending_payment_exists' USING ERRCODE = '55P03';
    END IF;

    v_result := public.append_order_items(
      v_order.id,
      v_request.cart_payload,
      v_request.client_op_id
    );
  END IF;

  UPDATE public.self_order_requests
  SET status = 'accepted',
      order_id = v_order_id,
      decided_by = v_uid,
      decided_at = now()
  WHERE id = v_request.id
    AND tenant_id = v_request.tenant_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_request_not_pending' USING ERRCODE = '40001';
  END IF;

  RETURN COALESCE(v_result, '{}'::jsonb) || jsonb_build_object(
    'ok', true,
    'status', 'accepted',
    'orderId', v_order_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_reject_request(p_request_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_request_ref public.self_order_requests%ROWTYPE;
  v_request public.self_order_requests%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT r.*
  INTO v_request_ref
  FROM public.self_order_requests r
  WHERE r.id = p_request_id
    AND r.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_request_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(v_request_ref.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'permission denied: pos:use' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('self-order-table'),
    hashtext(v_request_ref.table_id::text)
  );

  SELECT r.*
  INTO v_request
  FROM public.self_order_requests r
  WHERE r.id = v_request_ref.id
    AND r.tenant_id = v_request_ref.tenant_id
  FOR UPDATE;

  IF v_request.status = 'rejected' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'status', 'rejected');
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'self_order_request_not_pending' USING ERRCODE = '22023';
  END IF;

  UPDATE public.self_order_requests
  SET status = 'rejected',
      decided_by = v_uid,
      decided_at = now()
  WHERE id = v_request.id
    AND tenant_id = v_request.tenant_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_request_not_pending' USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'rejected');
END;
$$;

ALTER TABLE public.self_order_payment_requests
  ALTER COLUMN session_id DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.self_order_payment_requests pr
    WHERE pr.status IN ('cash_call', 'vietqr_pending')
    GROUP BY pr.tenant_id, pr.order_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'self_order_active_payment_request_duplicate_order';
  END IF;
END;
$$;

CREATE UNIQUE INDEX self_order_payment_requests_one_active_per_order
  ON public.self_order_payment_requests (tenant_id, order_id)
  WHERE status IN ('cash_call', 'vietqr_pending');

CREATE UNIQUE INDEX self_order_payment_requests_sessionless_client_op_uidx
  ON public.self_order_payment_requests (tenant_id, client_op_id)
  WHERE session_id IS NULL;

CREATE OR REPLACE FUNCTION public.self_order_expire_payment_request(
  p_request_id bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_request_ref public.self_order_payment_requests%ROWTYPE;
  v_request public.self_order_payment_requests%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_payment_found boolean := false;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT pr.*
  INTO v_request_ref
  FROM public.self_order_payment_requests pr
  WHERE pr.id = p_request_id;

  IF NOT FOUND
     OR v_request_ref.status NOT IN ('cash_call', 'vietqr_pending')
     OR v_request_ref.expires_at > now() THEN
    RETURN false;
  END IF;

  SELECT o.*
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_request_ref.order_id
    AND o.tenant_id = v_request_ref.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_payment_order_missing' USING ERRCODE = '23503';
  END IF;
  IF NOT pg_try_advisory_xact_lock(v_order.id) THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END IF;

  BEGIN
    SELECT p.*
    INTO v_payment
    FROM public.payments p
    WHERE p.tenant_id = v_request_ref.tenant_id
      AND p.order_id = v_request_ref.order_id
      AND (
        p.id = v_request_ref.payment_id
        OR (
          v_request_ref.payment_id IS NULL
          AND v_request_ref.method = 'cash_call'
          AND p.method = 'cash'
          AND p.status = 'completed'
        )
      )
    ORDER BY
      CASE WHEN p.id = v_request_ref.payment_id THEN 0 ELSE 1 END,
      p.id DESC
    LIMIT 1
    FOR UPDATE NOWAIT;
    v_payment_found := FOUND;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END;

  SELECT pr.*
  INTO v_request
  FROM public.self_order_payment_requests pr
  WHERE pr.id = p_request_id
    AND pr.tenant_id = v_request_ref.tenant_id
    AND pr.order_id = v_request_ref.order_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_request.status NOT IN ('cash_call', 'vietqr_pending')
     OR v_request.expires_at > now() THEN
    RETURN false;
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid'
     OR (v_payment_found AND v_payment.status = 'completed') THEN
    UPDATE public.self_order_payment_requests
    SET status = 'completed',
        payment_id = COALESCE(
          v_request.payment_id,
          CASE WHEN v_payment_found THEN v_payment.id ELSE NULL END
        ),
        completed_at = COALESCE(
          CASE WHEN v_payment_found THEN v_payment.paid_at ELSE NULL END,
          now()
        )
    WHERE id = v_request.id
      AND status IN ('cash_call', 'vietqr_pending');
    RETURN false;
  END IF;

  UPDATE public.self_order_payment_requests
  SET status = 'expired',
      expired_at = now()
  WHERE id = v_request.id
    AND status IN ('cash_call', 'vietqr_pending');

  IF v_payment_found AND v_payment.status = 'pending' THEN
    UPDATE public.payments
    SET status = 'failed',
        updated_at = now()
    WHERE id = v_payment.id
      AND status = 'pending';
  END IF;

  IF v_request.method = 'vietqr' THEN
    UPDATE public.orders o
    SET payment_status = 'unpaid',
        payment_method = NULL,
        updated_at = now()
    WHERE o.id = v_request.order_id
      AND o.tenant_id = v_request.tenant_id
      AND COALESCE(o.payment_status, 'unpaid') <> 'paid'
      AND NOT EXISTS (
        SELECT 1
        FROM public.payments p
        WHERE p.tenant_id = v_request.tenant_id
          AND p.order_id = v_request.order_id
          AND p.status IN ('pending', 'completed')
      );
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_reconcile_expired_payment_requests(
  p_tenant_id bigint,
  p_branch_id bigint
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_candidate record;
  v_count integer := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  FOR v_candidate IN
    SELECT pr.id, pr.order_id
    FROM public.self_order_payment_requests pr
    WHERE pr.tenant_id = p_tenant_id
      AND pr.branch_id = p_branch_id
      AND pr.status IN ('cash_call', 'vietqr_pending')
      AND pr.expires_at <= now()
    ORDER BY pr.order_id, pr.id
  LOOP
    BEGIN
      PERFORM 1
      FROM public.orders o
      WHERE o.id = v_candidate.order_id
        AND o.tenant_id = p_tenant_id
      FOR UPDATE SKIP LOCKED;

      IF NOT FOUND THEN
        CONTINUE;
      END IF;
      IF NOT pg_try_advisory_xact_lock(v_candidate.order_id) THEN
        RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
      END IF;
      IF public.self_order_expire_payment_request(v_candidate.id) THEN
        v_count := v_count + 1;
      END IF;
    EXCEPTION WHEN serialization_failure THEN
      RAISE NOTICE 'Skipped busy self-order payment request %', v_candidate.id;
    END;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_create_payment_request(
  p_token text,
  p_client_op_id uuid,
  p_method text,
  p_invoice_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_table public.tables%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_existing public.self_order_payment_requests%ROWTYPE;
  v_active public.self_order_payment_requests%ROWTYPE;
  v_open_order_count integer := 0;
  v_order_id bigint;
  v_invoice_payload jsonb;
  v_fingerprint text;
  v_payment_id bigint;
  v_bank_code text;
  v_account_no text;
  v_account_name text;
  v_payment_code text;
  v_qr_payload text;
  v_config_snapshot jsonb := '{}'::jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_client_op_id IS NULL THEN
    RAISE EXCEPTION 'self_order_missing_operation_id' USING ERRCODE = '22023';
  END IF;
  IF p_method NOT IN ('cash_call', 'vietqr') THEN
    RAISE EXCEPTION 'invalid_payment_method' USING ERRCODE = '22023';
  END IF;

  v_invoice_payload := public.self_order_normalize_invoice_payload(
    COALESCE(p_invoice_payload, '{}'::jsonb)
  );
  v_fingerprint := public.self_order_payment_request_fingerprint(
    p_method,
    v_invoice_payload
  );

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

  PERFORM pg_advisory_xact_lock(
    hashtext('self-order-table'),
    hashtext(v_table.id::text)
  );

  SELECT pr.*
  INTO v_existing
  FROM public.self_order_payment_requests pr
  WHERE pr.tenant_id = v_table.tenant_id
    AND pr.client_op_id = p_client_op_id
  ORDER BY pr.id DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.table_id <> v_table.id
       OR (
         v_existing.request_fingerprint_version = 'payment:v1'
         AND v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint
       ) THEN
      RAISE EXCEPTION 'self_order_idempotency_conflict' USING ERRCODE = '22023';
    END IF;
    IF v_existing.status IN ('cash_call', 'vietqr_pending')
       AND v_existing.expires_at <= now() THEN
      PERFORM public.self_order_expire_payment_request(v_existing.id);
      SELECT pr.* INTO v_existing
      FROM public.self_order_payment_requests pr
      WHERE pr.id = v_existing.id;
    END IF;
    RETURN jsonb_build_object('ok', true, 'idempotent', true)
      || COALESCE(
        public.self_order_payment_request_public_payload(v_existing.id),
        '{}'::jsonb
      );
  END IF;

  IF NOT public.self_order_branch_has_open_pos_session(
    v_table.tenant_id,
    v_table.branch_id
  ) THEN
    RAISE EXCEPTION 'self_order_pos_session_closed' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer, min(o.id)
  INTO v_open_order_count, v_order_id
  FROM public.orders o
  WHERE o.tenant_id = v_table.tenant_id
    AND o.branch_id = v_table.branch_id
    AND o.table_id = v_table.id
    AND o.payment_status <> 'paid'
    AND o.status NOT IN ('completed', 'cancelled')
    AND o.merged_into_order_id IS NULL;

  IF v_open_order_count <> 1 THEN
    RAISE EXCEPTION 'self_order_order_ambiguous' USING ERRCODE = '22023';
  END IF;

  SELECT o.*
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_order_id
    AND o.tenant_id = v_table.tenant_id
  FOR UPDATE;

  IF NOT pg_try_advisory_xact_lock(v_order.id) THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END IF;
  IF v_order.status NOT IN ('new', 'confirmed', 'preparing', 'ready', 'served')
     OR COALESCE(v_order.payment_status, 'unpaid') = 'paid'
     OR v_order.merged_into_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'self_order_order_not_payable' USING ERRCODE = '22023';
  END IF;
  IF p_method = 'vietqr' AND v_order.status NOT IN ('ready', 'served') THEN
    RAISE EXCEPTION 'self_order_payment_not_ready' USING ERRCODE = '22023';
  END IF;

  SELECT pr.*
  INTO v_active
  FROM public.self_order_payment_requests pr
  WHERE pr.tenant_id = v_order.tenant_id
    AND pr.order_id = v_order.id
    AND pr.status IN ('cash_call', 'vietqr_pending')
  ORDER BY pr.id DESC
  LIMIT 1;

  IF FOUND AND v_active.expires_at <= now() THEN
    PERFORM public.self_order_expire_payment_request(v_active.id);
    SELECT pr.*
    INTO v_active
    FROM public.self_order_payment_requests pr
    WHERE pr.tenant_id = v_order.tenant_id
      AND pr.order_id = v_order.id
      AND pr.status IN ('cash_call', 'vietqr_pending')
    ORDER BY pr.id DESC
    LIMIT 1;
  END IF;

  IF FOUND THEN
    IF v_active.request_fingerprint_version = 'payment:v1'
       AND v_active.request_fingerprint = v_fingerprint THEN
      RETURN jsonb_build_object('ok', true, 'recovered', true)
        || public.self_order_payment_request_public_payload(v_active.id);
    END IF;
    RAISE EXCEPTION 'self_order_pending_payment_exists' USING ERRCODE = '55P03';
  END IF;

  BEGIN
    PERFORM 1
    FROM public.payments p
    WHERE p.tenant_id = v_order.tenant_id
      AND p.order_id = v_order.id
      AND p.status = 'pending'
    ORDER BY p.id DESC
    LIMIT 1
    FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END;

  IF FOUND THEN
    RAISE EXCEPTION 'self_order_pending_payment_exists' USING ERRCODE = '55P03';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.tenant_id = v_order.tenant_id
      AND p.order_id = v_order.id
      AND p.status = 'completed'
  ) THEN
    RAISE EXCEPTION 'self_order_payment_completed' USING ERRCODE = '22023';
  END IF;

  IF p_method = 'cash_call' THEN
    INSERT INTO public.self_order_payment_requests (
      tenant_id,
      branch_id,
      table_id,
      order_id,
      client_op_id,
      method,
      status,
      amount_snapshot,
      invoice_payload,
      request_fingerprint,
      request_fingerprint_version,
      expires_at
    )
    VALUES (
      v_order.tenant_id,
      v_order.branch_id,
      v_order.table_id,
      v_order.id,
      p_client_op_id,
      'cash_call',
      'cash_call',
      v_order.total_amount,
      v_invoice_payload,
      v_fingerprint,
      'payment:v1',
      now() + interval '15 minutes'
    )
    RETURNING * INTO v_existing;

    RETURN jsonb_build_object('ok', true)
      || public.self_order_payment_request_public_payload(v_existing.id);
  END IF;

  IF v_order.total_amount <= 0 THEN
    RAISE EXCEPTION 'self_order_vietqr_requires_positive_amount' USING ERRCODE = '22023';
  END IF;

  v_payment_code := NULLIF(btrim(COALESCE(v_order.payment_code, '')), '');
  IF v_payment_code IS NULL THEN
    RAISE EXCEPTION 'self_order_vietqr_config_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT
    max(NULLIF(btrim(ss.value), '')) FILTER (
      WHERE ss.key = 'payment_vietqr_bank_code'
    ),
    max(NULLIF(btrim(ss.value), '')) FILTER (
      WHERE ss.key = 'payment_vietqr_account_no'
    ),
    max(NULLIF(btrim(ss.value), '')) FILTER (
      WHERE ss.key = 'payment_vietqr_account_name'
    )
  INTO v_bank_code, v_account_no, v_account_name
  FROM public.system_settings ss
  WHERE ss.tenant_id = v_order.tenant_id
    AND ss.key IN (
      'payment_vietqr_bank_code',
      'payment_vietqr_account_no',
      'payment_vietqr_account_name'
    );

  v_bank_code := upper(v_bank_code);
  IF v_bank_code IS NULL OR v_account_no IS NULL THEN
    RAISE EXCEPTION 'self_order_vietqr_config_missing' USING ERRCODE = '22023';
  END IF;
  IF public.print_vietqr_bank_bin(v_bank_code) !~ '^[0-9]{6}$'
     OR char_length(v_account_no) > 50 THEN
    RAISE EXCEPTION 'self_order_vietqr_config_invalid' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_qr_payload := public.print_vietqr_emvco(
      v_bank_code,
      v_account_no,
      v_account_name,
      v_order.total_amount,
      v_payment_code
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'self_order_vietqr_config_invalid' USING ERRCODE = '22023';
  END;

  IF v_qr_payload IS NULL THEN
    RAISE EXCEPTION 'self_order_vietqr_config_invalid' USING ERRCODE = '22023';
  END IF;

  v_config_snapshot := jsonb_strip_nulls(jsonb_build_object(
    'bankCode', v_bank_code,
    'accountNo', v_account_no,
    'accountName', COALESCE(v_account_name, '')
  ));

  INSERT INTO public.payments (
    tenant_id,
    branch_id,
    order_id,
    method,
    amount,
    status,
    provider_ref,
    provider_data,
    created_by
  )
  VALUES (
    v_order.tenant_id,
    v_order.branch_id,
    v_order.id,
    'vietqr',
    v_order.total_amount,
    'pending',
    v_payment_code,
    jsonb_build_object(
      'source', 'qr_self_order',
      'description', v_payment_code,
      'invoicePayload', v_invoice_payload
    ),
    v_order.created_by
  )
  RETURNING id INTO v_payment_id;

  UPDATE public.orders
  SET payment_status = 'pending',
      payment_method = 'vietqr',
      updated_at = now()
  WHERE id = v_order.id
    AND tenant_id = v_order.tenant_id;

  INSERT INTO public.self_order_payment_requests (
    tenant_id,
    branch_id,
    table_id,
    order_id,
    payment_id,
    client_op_id,
    method,
    status,
    amount_snapshot,
    invoice_payload,
    request_fingerprint,
    request_fingerprint_version,
    payment_code_snapshot,
    qr_payload_snapshot,
    vietqr_config_snapshot,
    expires_at
  )
  VALUES (
    v_order.tenant_id,
    v_order.branch_id,
    v_order.table_id,
    v_order.id,
    v_payment_id,
    p_client_op_id,
    'vietqr',
    'vietqr_pending',
    v_order.total_amount,
    v_invoice_payload,
    v_fingerprint,
    'payment:v1',
    v_payment_code,
    v_qr_payload,
    v_config_snapshot,
    now() + interval '30 minutes'
  )
  RETURNING * INTO v_existing;

  RETURN jsonb_build_object('ok', true)
    || public.self_order_payment_request_public_payload(v_existing.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_cancel_payment_request(
  p_request_id bigint,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_request_ref public.self_order_payment_requests%ROWTYPE;
  v_request public.self_order_payment_requests%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_payment_found boolean := false;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.*
  INTO v_request_ref
  FROM public.self_order_payment_requests pr
  WHERE pr.id = p_request_id
    AND pr.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_payment_request_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(v_request_ref.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'permission denied: pos:use' USING ERRCODE = '42501';
  END IF;

  SELECT o.*
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_request_ref.order_id
    AND o.tenant_id = v_request_ref.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_payment_order_missing' USING ERRCODE = '23503';
  END IF;
  IF NOT pg_try_advisory_xact_lock(v_order.id) THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END IF;

  BEGIN
    SELECT p.*
    INTO v_payment
    FROM public.payments p
    WHERE p.tenant_id = v_request_ref.tenant_id
      AND p.order_id = v_request_ref.order_id
      AND (
        p.id = v_request_ref.payment_id
        OR (
          p.status = 'completed'
          AND (
            (v_request_ref.method = 'cash_call' AND p.method = 'cash')
            OR (v_request_ref.method = 'vietqr' AND p.method = 'vietqr')
          )
        )
      )
    ORDER BY
      CASE WHEN p.status = 'completed' THEN 0 ELSE 1 END,
      CASE WHEN p.id = v_request_ref.payment_id THEN 0 ELSE 1 END,
      p.id DESC
    LIMIT 1
    FOR UPDATE NOWAIT;
    v_payment_found := FOUND;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END;

  SELECT pr.*
  INTO v_request
  FROM public.self_order_payment_requests pr
  WHERE pr.id = v_request_ref.id
    AND pr.tenant_id = v_request_ref.tenant_id
    AND pr.order_id = v_request_ref.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_payment_request_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_request.status NOT IN ('cash_call', 'vietqr_pending') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'paymentCompleted', (
        v_request.status = 'completed'
        OR COALESCE(v_order.payment_status, 'unpaid') = 'paid'
        OR (v_payment_found AND v_payment.status = 'completed')
      )
    ) || public.self_order_payment_request_public_payload(v_request.id);
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid'
     OR (v_payment_found AND v_payment.status = 'completed') THEN
    UPDATE public.self_order_payment_requests
    SET status = 'completed',
        payment_id = COALESCE(
          v_request.payment_id,
          CASE WHEN v_payment_found THEN v_payment.id ELSE NULL END
        ),
        completed_at = COALESCE(
          CASE WHEN v_payment_found THEN v_payment.paid_at ELSE NULL END,
          now()
        )
    WHERE id = v_request.id;

    RETURN jsonb_build_object('ok', true, 'paymentCompleted', true)
      || public.self_order_payment_request_public_payload(v_request.id);
  END IF;

  UPDATE public.self_order_payment_requests
  SET status = 'cancelled',
      cancelled_at = now(),
      cancel_reason = v_reason
  WHERE id = v_request.id
    AND status IN ('cash_call', 'vietqr_pending');

  IF v_payment_found AND v_payment.status = 'pending' THEN
    UPDATE public.payments
    SET status = 'failed',
        updated_at = now()
    WHERE id = v_payment.id
      AND tenant_id = v_request.tenant_id
      AND status = 'pending';
  END IF;

  IF v_request.method = 'vietqr' THEN
    UPDATE public.orders o
    SET payment_status = 'unpaid',
        payment_method = NULL,
        updated_at = now()
    WHERE o.id = v_request.order_id
      AND o.tenant_id = v_request.tenant_id
      AND COALESCE(o.payment_status, 'unpaid') <> 'paid'
      AND NOT EXISTS (
        SELECT 1
        FROM public.payments p
        WHERE p.tenant_id = v_request.tenant_id
          AND p.order_id = v_request.order_id
          AND p.status IN ('pending', 'completed')
      );
  END IF;

  RETURN jsonb_build_object('ok', true)
    || public.self_order_payment_request_public_payload(v_request.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_close_session_from_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_reason text;
  v_payment_id bigint;
  v_paid_at timestamptz;
BEGIN
  IF NEW.payment_status = 'paid' THEN
    SELECT p.id, p.paid_at
    INTO v_payment_id, v_paid_at
    FROM public.payments p
    WHERE p.tenant_id = NEW.tenant_id
      AND p.order_id = NEW.id
      AND p.status = 'completed'
    ORDER BY p.paid_at DESC NULLS LAST, p.id DESC
    LIMIT 1;

    UPDATE public.self_order_payment_requests pr
    SET status = 'completed',
        payment_id = COALESCE(pr.payment_id, v_payment_id),
        completed_at = COALESCE(v_paid_at, now())
    WHERE pr.tenant_id = NEW.tenant_id
      AND pr.order_id = NEW.id
      AND pr.status IN ('cash_call', 'vietqr_pending');
  ELSIF NEW.status IN ('completed', 'cancelled') THEN
    v_reason := 'order_' || NEW.status;

    UPDATE public.self_order_payment_requests pr
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = COALESCE(pr.cancel_reason, v_reason)
    WHERE pr.tenant_id = NEW.tenant_id
      AND pr.order_id = NEW.id
      AND pr.status IN ('cash_call', 'vietqr_pending');
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.self_order_get_snapshot(text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_order_get_snapshot(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_order_submit(text, jsonb, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_order_create_payment_request(text, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_order_expire_payment_request(bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_order_reconcile_expired_payment_requests(bigint, bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_order_accept_request(bigint, bigint)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.self_order_reject_request(bigint)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.self_order_cancel_payment_request(bigint, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.self_order_set_actor_claims(uuid, bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_order_close_session_from_order()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.self_order_get_snapshot(text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.self_order_get_snapshot(text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.self_order_submit(text, jsonb, text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.self_order_create_payment_request(text, uuid, text, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.self_order_expire_payment_request(bigint)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.self_order_reconcile_expired_payment_requests(bigint, bigint)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.self_order_accept_request(bigint, bigint)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.self_order_reject_request(bigint)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.self_order_cancel_payment_request(bigint, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.self_order_set_actor_claims(uuid, bigint)
  TO service_role;
