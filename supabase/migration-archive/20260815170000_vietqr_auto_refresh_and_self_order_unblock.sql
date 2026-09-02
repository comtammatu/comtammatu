-- Auto-refresh VietQR and unblock Self-Order / POS mutations on pending QR
--
-- 1. `create_remote_payment_intent`: Update pending payment amount & provider data in-place when order total changes.
-- 2. `self_order_submit`: Auto-cancel pending payment / request and allow adding more items instead of blocking.
-- 3. `cancel_pending_payment`: Gracefully cancel self-order payment request when staff unlocks payment from POS.

CREATE OR REPLACE FUNCTION public.create_remote_payment_intent(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_order_id bigint,
  p_method text,
  p_amount numeric,
  p_created_by uuid,
  p_provider_ref text,
  p_provider_data jsonb
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment_id bigint;
  v_existing_payment_id bigint;
  v_existing_status text;
  v_existing_method text;
  v_existing_amount numeric;
  v_existing_provider_ref text;
  v_existing_provider_data jsonb;
  v_requested_provider_ref text;
  v_requested_provider_data jsonb;
  v_line_subtotal numeric(15,2) := 0;
  v_recomputed_total numeric(15,2) := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = p_created_by
      AND profile.tenant_id = p_tenant_id
      AND COALESCE(profile.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'actor_inactive_or_tenant_mismatch'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.auth_is_owner(p_created_by)
    AND NOT EXISTS (
      SELECT 1
      FROM public.staff_permissions permission
      WHERE permission.user_id = p_created_by
        AND permission.tenant_id = p_tenant_id
        AND permission.permission_key = 'pos:use'
        AND (
          permission.branch_id = p_branch_id
          OR permission.branch_id IS NULL
        )
        AND permission.valid_from <= now()
        AND (
          permission.valid_until IS NULL
          OR permission.valid_until > now()
        )
    )
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_method <> 'vietqr' THEN
    RAISE EXCEPTION 'remote_payment_method_required' USING ERRCODE = '22023';
  END IF;

  v_requested_provider_ref := NULLIF(btrim(p_provider_ref), '');
  IF v_requested_provider_ref IS NULL THEN
    RAISE EXCEPTION 'remote_payment_provider_ref_required' USING ERRCODE = '22023';
  END IF;

  IF p_provider_data IS NULL OR jsonb_typeof(p_provider_data) <> 'object' THEN
    RAISE EXCEPTION 'provider_data_must_be_object' USING ERRCODE = '22023';
  END IF;
  IF p_provider_data ?| ARRAY[
    'bankWebhookReview',
    'source',
    'invoicePayload'
  ] THEN
    RAISE EXCEPTION 'provider_data_contains_reserved_key'
      USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_provider_data ->> 'providerRef'), '')
    IS DISTINCT FROM v_requested_provider_ref
  THEN
    RAISE EXCEPTION 'provider_data_ref_mismatch' USING ERRCODE = '23514';
  END IF;
  v_requested_provider_data := p_provider_data;

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT order_row.*
  INTO v_order
  FROM public.orders order_row
  WHERE order_row.id = p_order_id
    AND order_row.tenant_id = p_tenant_id
    AND order_row.branch_id = p_branch_id
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'order_already_paid' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(
    SUM(order_item.quantity::numeric * order_item.unit_price),
    0
  )::numeric(15,2)
  INTO v_line_subtotal
  FROM public.order_items order_item
  WHERE order_item.order_id = v_order.id
    AND order_item.tenant_id = v_order.tenant_id
    AND order_item.status <> 'cancelled';

  v_recomputed_total := ROUND(
    v_line_subtotal
    + COALESCE(v_order.tax_amount, 0)
    + COALESCE(v_order.service_charge, 0)
    - COALESCE(v_order.discount_amount, 0),
    2
  );

  IF ABS(p_amount - v_recomputed_total) > 1
    OR ABS(v_order.total_amount - v_recomputed_total) > 1
  THEN
    RAISE EXCEPTION 'amount_mismatch_recomputed: stored=% expected=% recomputed=%',
      v_order.total_amount,
      p_amount,
      v_recomputed_total
      USING ERRCODE = '23514';
  END IF;

  IF p_amount <> v_order.total_amount THEN
    RAISE EXCEPTION 'amount_mismatch: expected % got %',
      v_order.total_amount,
      p_amount
      USING ERRCODE = '22023';
  END IF;

  IF p_method = 'vietqr' THEN
    IF NULLIF(btrim(v_order.payment_code), '') IS NULL THEN
      RAISE EXCEPTION 'order_payment_code_required' USING ERRCODE = '23514';
    END IF;
    IF lower(v_requested_provider_ref)
      IS DISTINCT FROM lower(btrim(v_order.payment_code))
    THEN
      RAISE EXCEPTION 'vietqr_provider_ref_mismatch'
        USING ERRCODE = '23514';
    END IF;
    v_requested_provider_ref := btrim(v_order.payment_code);
    v_requested_provider_data := jsonb_set(
      v_requested_provider_data,
      '{providerRef}',
      to_jsonb(v_requested_provider_ref),
      true
    );
  END IF;

  SELECT
    payment.id,
    payment.status,
    payment.method,
    payment.amount,
    payment.provider_ref,
    payment.provider_data
  INTO
    v_existing_payment_id,
    v_existing_status,
    v_existing_method,
    v_existing_amount,
    v_existing_provider_ref,
    v_existing_provider_data
  FROM public.payments payment
  WHERE payment.tenant_id = p_tenant_id
    AND payment.branch_id = p_branch_id
    AND payment.order_id = p_order_id
    AND payment.status <> 'failed'
  ORDER BY payment.id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_status = 'completed' THEN
    RAISE EXCEPTION 'payment_already_completed' USING ERRCODE = 'P0001';
  ELSIF v_existing_status = 'pending' THEN
    IF v_existing_method IS DISTINCT FROM p_method THEN
      RAISE EXCEPTION 'payment_pending_different_method: existing=% requested=%',
        v_existing_method,
        p_method
        USING ERRCODE = '23505';
    END IF;

    IF (
        v_existing_amount IS DISTINCT FROM p_amount
        OR v_existing_provider_ref IS DISTINCT FROM v_requested_provider_ref
        OR jsonb_typeof(v_existing_provider_data) IS DISTINCT FROM 'object'
        OR NULLIF(btrim(v_existing_provider_data ->> 'providerRef'), '')
          IS DISTINCT FROM v_requested_provider_ref
        OR (v_existing_provider_data ->> 'description') IS DISTINCT FROM (v_requested_provider_data ->> 'description')
        OR (v_existing_provider_data ->> 'amount') IS DISTINCT FROM (v_requested_provider_data ->> 'amount')
      )
    THEN
      UPDATE public.payments
      SET amount = p_amount,
          provider_ref = v_requested_provider_ref,
          provider_data = v_requested_provider_data,
          updated_at = now()
      WHERE id = v_existing_payment_id
      RETURNING id INTO v_payment_id;
      v_existing_amount := p_amount;
      v_existing_provider_ref := v_requested_provider_ref;
      v_existing_provider_data := v_requested_provider_data;
    ELSE
      v_payment_id := v_existing_payment_id;
    END IF;
  ELSIF v_existing_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'payment_not_pending: status=%', v_existing_status
      USING ERRCODE = '22023';
  ELSE
    INSERT INTO public.payments (
      tenant_id,
      branch_id,
      order_id,
      method,
      amount,
      status,
      provider_ref,
      provider_data,
      paid_at,
      created_by
    ) VALUES (
      p_tenant_id,
      p_branch_id,
      p_order_id,
      p_method,
      p_amount,
      'pending',
      v_requested_provider_ref,
      v_requested_provider_data,
      NULL,
      p_created_by
    )
    RETURNING id INTO v_payment_id;
  END IF;

  UPDATE public.orders
  SET payment_method = p_method,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'status', 'pending',
    'provider_ref', v_requested_provider_ref
  );
END;
$$;

COMMENT ON FUNCTION public.create_remote_payment_intent(bigint, bigint, bigint, text, numeric, uuid, text, jsonb) IS 'Service-only atomic creation or in-place refresh of a pending VietQR intent with updated amount and provider metadata.';

REVOKE ALL ON FUNCTION public.create_remote_payment_intent(bigint, bigint, bigint, text, numeric, uuid, text, jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_remote_payment_intent(bigint, bigint, bigint, text, numeric, uuid, text, jsonb) TO service_role;


CREATE OR REPLACE FUNCTION public.self_order_submit(
  p_token text,
  p_items jsonb,
  p_customer_note text,
  p_client_op_id uuid
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
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
       ) IS DISTINCT FROM v_note THEN
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

    -- Automatically supersede / cancel pending payment and self-order payment requests
    -- so guest can add more items seamlessly.
    SELECT pr.*
    INTO v_active_request
    FROM public.self_order_payment_requests pr
    WHERE pr.tenant_id = v_order.tenant_id
      AND pr.order_id = v_order.id
      AND pr.status IN ('cash_call', 'vietqr_pending')
    ORDER BY pr.id DESC
    LIMIT 1;

    IF FOUND THEN
      UPDATE public.self_order_payment_requests
      SET status = 'cancelled',
          cancelled_at = now(),
          cancel_reason = 'guest_added_items_auto_refresh',
          updated_at = now()
      WHERE id = v_active_request.id;

      IF v_active_request.payment_id IS NOT NULL THEN
        UPDATE public.payments
        SET status = 'failed',
            updated_at = now()
        WHERE id = v_active_request.payment_id
          AND status = 'pending';
      END IF;
    END IF;

    UPDATE public.payments
    SET status = 'failed',
        updated_at = now()
    WHERE order_id = v_order.id
      AND tenant_id = v_order.tenant_id
      AND branch_id = v_order.branch_id
      AND status = 'pending';

    UPDATE public.orders
    SET payment_status = 'unpaid',
        payment_method = NULL,
        updated_at = now()
    WHERE id = v_order.id
      AND payment_status <> 'paid';

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
    SELECT r.*
    INTO v_existing
    FROM public.self_order_requests r
    WHERE r.tenant_id = v_table.tenant_id
      AND r.client_op_id = p_client_op_id
    FOR UPDATE;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'requestId', v_existing.id,
        'status', v_existing.status,
        'orderId', v_existing.order_id
      );
    END IF;
    RAISE;
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
    'status', 'pending'
  );
END;
$$;

COMMENT ON FUNCTION public.self_order_submit(text, jsonb, text, uuid) IS 'Public QR self-order submission; automatically cancels pending payment requests when appending items to an active order.';

REVOKE ALL ON FUNCTION public.self_order_submit(text, jsonb, text, uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.self_order_submit(text, jsonb, text, uuid) TO service_role;


CREATE OR REPLACE FUNCTION public.cancel_pending_payment(
  p_payment_id bigint,
  p_tenant_id bigint,
  p_branch_id bigint
) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_order_id bigint;
  v_payment record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(p_branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'permission denied: pos:use' USING ERRCODE = '42501';
  END IF;

  SELECT payment.order_id
  INTO v_order_id
  FROM public.payments payment
  WHERE payment.id = p_payment_id
    AND payment.tenant_id = p_tenant_id
    AND payment.branch_id = p_branch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(v_order_id);

  PERFORM 1
  FROM public.orders order_row
  WHERE order_row.id = v_order_id
    AND order_row.tenant_id = p_tenant_id
    AND order_row.branch_id = p_branch_id
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT
    payment.id,
    payment.order_id,
    payment.method,
    payment.status,
    payment.provider_data
  INTO v_payment
  FROM public.payments payment
  WHERE payment.id = p_payment_id
    AND payment.tenant_id = p_tenant_id
    AND payment.branch_id = p_branch_id
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_payment.order_id IS DISTINCT FROM v_order_id THEN
    RAISE EXCEPTION 'payment_order_changed' USING ERRCODE = '40001';
  END IF;
  IF v_payment.status <> 'pending' THEN
    RAISE EXCEPTION 'payment_not_pending' USING ERRCODE = 'P0001';
  END IF;

  -- Cancel associated self-order payment request if any
  UPDATE public.self_order_payment_requests
  SET status = 'cancelled',
      cancelled_at = now(),
      cancel_reason = 'staff_cancelled_pending_payment',
      updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND payment_id = v_payment.id
    AND status IN ('cash_call', 'vietqr_pending');

  UPDATE public.payments
  SET status = 'failed',
      updated_at = now()
  WHERE id = p_payment_id;

  UPDATE public.orders
  SET payment_status = 'unpaid',
      payment_method = NULL,
      updated_at = now()
  WHERE id = v_payment.order_id
    AND payment_status <> 'paid';
END;
$$;

COMMENT ON FUNCTION public.cancel_pending_payment(bigint, bigint, bigint) IS 'Cancel a pending payment and associated self-order payment request under the order transaction lock.';

REVOKE ALL ON FUNCTION public.cancel_pending_payment(bigint, bigint, bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_pending_payment(bigint, bigint, bigint) TO authenticated;
