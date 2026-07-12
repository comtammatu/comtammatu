CREATE TABLE public.self_order_request_operations (
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_op_id uuid NOT NULL,
  request_id bigint NOT NULL REFERENCES public.self_order_requests(id) ON DELETE CASCADE,
  cart_payload jsonb NOT NULL,
  customer_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, client_op_id),
  CONSTRAINT self_order_request_operations_cart_array_check
    CHECK (jsonb_typeof(cart_payload) = 'array' AND jsonb_array_length(cart_payload) > 0),
  CONSTRAINT self_order_request_operations_customer_note_length
    CHECK (customer_note IS NULL OR char_length(customer_note) <= 500)
);

CREATE INDEX idx_self_order_request_operations_request
  ON public.self_order_request_operations (request_id);

ALTER TABLE public.self_order_request_operations ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.self_order_request_operations
  FROM PUBLIC, anon, authenticated, service_role;

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
  v_pending_request public.self_order_requests%ROWTYPE;
  v_operation public.self_order_request_operations%ROWTYPE;
  v_operation_found boolean := false;
  v_order public.orders%ROWTYPE;
  v_active_request public.self_order_payment_requests%ROWTYPE;
  v_items jsonb;
  v_merged_items jsonb;
  v_note text := NULLIF(btrim(COALESCE(p_customer_note, '')), '');
  v_merged_note text;
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
    SELECT o.*
    INTO v_operation
    FROM public.self_order_request_operations o
    WHERE o.tenant_id = v_table.tenant_id
      AND o.client_op_id = p_client_op_id
    FOR UPDATE;
    v_operation_found := FOUND;

    IF v_existing.table_id <> v_table.id
       OR (
         SELECT jsonb_agg(item.value - 'key' ORDER BY item.ordinality)
         FROM jsonb_array_elements(
           CASE
             WHEN v_operation_found THEN v_operation.cart_payload
             ELSE v_existing.cart_payload
           END
         ) WITH ORDINALITY AS item(value, ordinality)
       ) IS DISTINCT FROM (
         SELECT jsonb_agg(item.value - 'key' ORDER BY item.ordinality)
         FROM jsonb_array_elements(v_items)
           WITH ORDINALITY AS item(value, ordinality)
       )
       OR (
         CASE
           WHEN v_operation_found THEN v_operation.customer_note
           ELSE v_existing.customer_note
         END
       )
          IS DISTINCT FROM v_note THEN
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

  SELECT o.*
  INTO v_operation
  FROM public.self_order_request_operations o
  WHERE o.tenant_id = v_table.tenant_id
    AND o.client_op_id = p_client_op_id
  FOR UPDATE;

  IF FOUND THEN
    SELECT r.*
    INTO v_existing
    FROM public.self_order_requests r
    WHERE r.id = v_operation.request_id
      AND r.tenant_id = v_operation.tenant_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_existing.table_id <> v_table.id
       OR (
         SELECT jsonb_agg(item.value - 'key' ORDER BY item.ordinality)
         FROM jsonb_array_elements(v_operation.cart_payload)
           WITH ORDINALITY AS item(value, ordinality)
       ) IS DISTINCT FROM (
         SELECT jsonb_agg(item.value - 'key' ORDER BY item.ordinality)
         FROM jsonb_array_elements(v_items)
           WITH ORDINALITY AS item(value, ordinality)
       )
       OR v_operation.customer_note IS DISTINCT FROM v_note THEN
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

  SELECT r.*
  INTO v_pending_request
  FROM public.self_order_requests r
  WHERE r.tenant_id = v_table.tenant_id
    AND r.table_id = v_table.id
    AND r.status = 'pending'
  ORDER BY r.id DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    v_merged_items := public.self_order_canonicalize_cart(
      v_table.tenant_id,
      v_pending_request.cart_payload || v_items
    );
    v_merged_note := NULLIF(
      concat_ws(E'\n', v_pending_request.customer_note, v_note),
      ''
    );
    IF v_merged_note IS NOT NULL AND char_length(v_merged_note) > 500 THEN
      RAISE EXCEPTION 'self_order_customer_note_too_long' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.self_order_request_operations (
      tenant_id,
      client_op_id,
      request_id,
      cart_payload,
      customer_note
    )
    VALUES (
      v_pending_request.tenant_id,
      v_pending_request.client_op_id,
      v_pending_request.id,
      v_pending_request.cart_payload,
      v_pending_request.customer_note
    )
    ON CONFLICT (tenant_id, client_op_id) DO NOTHING;

    UPDATE public.self_order_requests
    SET cart_payload = v_merged_items,
        customer_note = v_merged_note
    WHERE id = v_pending_request.id
      AND tenant_id = v_pending_request.tenant_id
      AND status = 'pending'
    RETURNING id INTO v_request_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'self_order_request_not_pending' USING ERRCODE = '40001';
    END IF;

    INSERT INTO public.self_order_request_operations (
      tenant_id,
      client_op_id,
      request_id,
      cart_payload,
      customer_note
    )
    VALUES (
      v_table.tenant_id,
      p_client_op_id,
      v_request_id,
      v_items,
      v_note
    );

    RETURN jsonb_build_object(
      'ok', true,
      'requestId', v_request_id,
      'status', 'pending'
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

  INSERT INTO public.self_order_request_operations (
    tenant_id,
    client_op_id,
    request_id,
    cart_payload,
    customer_note
  )
  VALUES (
    v_table.tenant_id,
    p_client_op_id,
    v_request_id,
    v_items,
    v_note
  );

  RETURN jsonb_build_object(
    'ok', true,
    'requestId', v_request_id,
    'status', 'pending',
    'openOrderCount', v_open_order_count
  );
END;
$$;
