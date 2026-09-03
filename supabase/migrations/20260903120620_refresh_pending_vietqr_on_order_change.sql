-- Migration: refresh_pending_vietqr_on_order_change

CREATE OR REPLACE FUNCTION public.refresh_pending_vietqr_for_order(p_order_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_request public.self_order_payment_requests%ROWTYPE;
  v_request_found boolean := false;
  v_bank_code text;
  v_account_no text;
  v_account_name text;
  v_payment_code text;
  v_qr_payload text;
  v_amount numeric;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_payment
  FROM public.payments
  WHERE tenant_id = v_order.tenant_id
    AND order_id = v_order.id
    AND method = 'vietqr'
    AND status = 'pending'
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_amount := v_order.total_amount;
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_request
  FROM public.self_order_payment_requests pr
  WHERE pr.tenant_id = v_order.tenant_id
    AND pr.order_id = v_order.id
    AND pr.status = 'vietqr_pending'
  ORDER BY pr.id DESC
  LIMIT 1
  FOR UPDATE;
  v_request_found := FOUND;

  v_payment_code := NULLIF(btrim(COALESCE(
    v_order.payment_code,
    v_payment.provider_ref,
    v_request.payment_code_snapshot,
    ''
  )), '');
  IF v_payment_code IS NULL THEN
    RAISE EXCEPTION 'self_order_vietqr_config_invalid' USING ERRCODE = '22023';
  END IF;

  v_bank_code := upper(NULLIF(btrim(COALESCE(
    CASE WHEN v_request_found THEN v_request.vietqr_config_snapshot ->> 'bankCode' END,
    v_payment.provider_data ->> 'bankCode',
    v_payment.provider_data -> 'qr_info' ->> 'bank_code',
    ''
  )), ''));
  v_account_no := NULLIF(btrim(COALESCE(
    CASE WHEN v_request_found THEN v_request.vietqr_config_snapshot ->> 'accountNo' END,
    v_payment.provider_data ->> 'accountNo',
    v_payment.provider_data -> 'qr_info' ->> 'account_no',
    ''
  )), '');
  v_account_name := NULLIF(btrim(COALESCE(
    CASE WHEN v_request_found THEN v_request.vietqr_config_snapshot ->> 'accountName' END,
    v_payment.provider_data ->> 'accountName',
    v_payment.provider_data -> 'qr_info' ->> 'account_name',
    ''
  )), '');

  IF v_bank_code IS NULL OR v_account_no IS NULL THEN
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
  END IF;

  IF v_bank_code IS NULL OR v_account_no IS NULL THEN
    RAISE EXCEPTION 'self_order_vietqr_config_missing' USING ERRCODE = '22023';
  END IF;

  v_qr_payload := public.print_vietqr_emvco(
    v_bank_code,
    v_account_no,
    v_account_name,
    v_amount,
    v_payment_code
  );
  IF v_qr_payload IS NULL THEN
    RAISE EXCEPTION 'self_order_vietqr_config_invalid' USING ERRCODE = '22023';
  END IF;

  UPDATE public.payments
  SET amount = v_amount,
      provider_ref = v_payment_code,
      provider_data = COALESCE(provider_data, '{}'::jsonb)
        || jsonb_build_object(
          'amount', v_amount::text,
          'description', v_payment_code,
          'qrData', v_qr_payload,
          'qr_data', v_qr_payload,
          'bankCode', v_bank_code,
          'accountNo', v_account_no,
          'accountName', COALESCE(v_account_name, '')
        ),
      updated_at = now()
  WHERE id = v_payment.id;

  IF v_request_found THEN
    UPDATE public.self_order_payment_requests
    SET amount_snapshot = v_amount,
        qr_payload_snapshot = v_qr_payload,
        updated_at = now()
    WHERE id = v_request.id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'paymentId', v_payment.id,
    'amount', v_amount,
    'qrData', v_qr_payload
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_pending_vietqr_for_order(bigint)
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.refresh_pending_vietqr_for_order(bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.self_order_pending_vietqr_public_payload(p_order_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_bank_code text;
  v_account_no text;
  v_account_name text;
  v_qr_payload text;
  v_payment_code text;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_payment
  FROM public.payments
  WHERE tenant_id = v_order.tenant_id
    AND order_id = v_order.id
    AND method = 'vietqr'
    AND status = 'pending'
  ORDER BY id DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_payment_code := NULLIF(btrim(COALESCE(v_order.payment_code, v_payment.provider_ref, '')), '');
  v_bank_code := upper(NULLIF(btrim(COALESCE(
    v_payment.provider_data ->> 'bankCode',
    v_payment.provider_data -> 'qr_info' ->> 'bank_code',
    ''
  )), ''));
  v_account_no := NULLIF(btrim(COALESCE(
    v_payment.provider_data ->> 'accountNo',
    v_payment.provider_data -> 'qr_info' ->> 'account_no',
    ''
  )), '');
  v_account_name := NULLIF(btrim(COALESCE(
    v_payment.provider_data ->> 'accountName',
    v_payment.provider_data -> 'qr_info' ->> 'account_name',
    ''
  )), '');
  v_qr_payload := NULLIF(btrim(COALESCE(
    v_payment.provider_data ->> 'qrData',
    v_payment.provider_data ->> 'qr_data',
    ''
  )), '');

  IF v_qr_payload IS NULL
     AND v_bank_code IS NOT NULL
     AND v_account_no IS NOT NULL
     AND v_payment_code IS NOT NULL THEN
    BEGIN
      v_qr_payload := public.print_vietqr_emvco(
        v_bank_code,
        v_account_no,
        v_account_name,
        v_payment.amount,
        v_payment_code
      );
    EXCEPTION WHEN OTHERS THEN
      v_qr_payload := NULL;
    END;
  END IF;

  IF v_qr_payload IS NULL OR v_payment_code IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'status', 'vietqr_pending',
    'method', 'vietqr',
    'amount', v_payment.amount,
    'paymentId', v_payment.id,
    'paymentCode', v_payment_code,
    'qrData', v_qr_payload,
    'bankCode', v_bank_code,
    'accountNo', v_account_no,
    'accountName', COALESCE(v_account_name, ''),
    'createdAt', v_payment.created_at
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.self_order_pending_vietqr_public_payload(bigint)
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.self_order_pending_vietqr_public_payload(bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.self_order_adopt_pending_vietqr(
  p_order public.orders,
  p_table public.tables,
  p_client_op_id uuid,
  p_invoice_payload jsonb,
  p_fingerprint text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_existing public.self_order_payment_requests%ROWTYPE;
  v_bank_code text;
  v_account_no text;
  v_account_name text;
  v_qr_payload text;
  v_config jsonb;
BEGIN
  PERFORM public.refresh_pending_vietqr_for_order(p_order.id);

  SELECT *
  INTO v_existing
  FROM public.self_order_payment_requests pr
  WHERE pr.tenant_id = p_order.tenant_id
    AND pr.order_id = p_order.id
    AND pr.status = 'vietqr_pending'
  ORDER BY pr.id DESC
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'recovered', true)
      || public.self_order_payment_request_public_payload(v_existing.id);
  END IF;

  SELECT *
  INTO v_payment
  FROM public.payments
  WHERE tenant_id = p_order.tenant_id
    AND order_id = p_order.id
    AND method = 'vietqr'
    AND status = 'pending'
  ORDER BY id DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_pending_payment_exists' USING ERRCODE = '55P03';
  END IF;

  v_bank_code := upper(NULLIF(btrim(COALESCE(
    v_payment.provider_data ->> 'bankCode',
    v_payment.provider_data -> 'qr_info' ->> 'bank_code',
    ''
  )), ''));
  v_account_no := NULLIF(btrim(COALESCE(
    v_payment.provider_data ->> 'accountNo',
    v_payment.provider_data -> 'qr_info' ->> 'account_no',
    ''
  )), '');
  v_account_name := NULLIF(btrim(COALESCE(
    v_payment.provider_data ->> 'accountName',
    v_payment.provider_data -> 'qr_info' ->> 'account_name',
    ''
  )), '');
  v_qr_payload := NULLIF(btrim(COALESCE(
    v_payment.provider_data ->> 'qrData',
    v_payment.provider_data ->> 'qr_data',
    ''
  )), '');
  IF v_bank_code IS NULL OR v_account_no IS NULL OR v_qr_payload IS NULL THEN
    RAISE EXCEPTION 'self_order_vietqr_config_invalid' USING ERRCODE = '22023';
  END IF;

  v_config := jsonb_strip_nulls(jsonb_build_object(
    'bankCode', v_bank_code,
    'accountNo', v_account_no,
    'accountName', COALESCE(v_account_name, '')
  ));

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
    p_order.tenant_id,
    p_order.branch_id,
    p_table.id,
    p_order.id,
    v_payment.id,
    p_client_op_id,
    'vietqr',
    'vietqr_pending',
    v_payment.amount,
    p_invoice_payload,
    p_fingerprint,
    'payment:v1',
    COALESCE(p_order.payment_code, v_payment.provider_ref),
    v_qr_payload,
    v_config,
    now() + interval '30 minutes'
  )
  RETURNING * INTO v_existing;

  RETURN jsonb_build_object('ok', true, 'recovered', true)
    || public.self_order_payment_request_public_payload(v_existing.id);
END;
$$;

REVOKE ALL ON FUNCTION public.self_order_adopt_pending_vietqr(public.orders, public.tables, uuid, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.self_order_adopt_pending_vietqr(public.orders, public.tables, uuid, jsonb, text) TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_pending_vietqr_after_order_amount_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.total_amount IS NOT DISTINCT FROM OLD.total_amount THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.payment_status, 'unpaid') = 'paid' THEN
    RETURN NEW;
  END IF;
  PERFORM public.refresh_pending_vietqr_for_order(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_refresh_pending_vietqr ON public.orders;
CREATE TRIGGER trg_orders_refresh_pending_vietqr
AFTER UPDATE OF total_amount ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.refresh_pending_vietqr_after_order_amount_change();

REVOKE ALL ON FUNCTION public.refresh_pending_vietqr_after_order_amount_change()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prevent_order_amount_mutation_after_payment_code_exposed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_money_changed boolean;
  v_cancelled_unpaid boolean;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(OLD.payment_status, 'unpaid') = 'paid' THEN
    RETURN NEW;
  END IF;

  v_money_changed :=
    NEW.subtotal IS DISTINCT FROM OLD.subtotal
    OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
    OR NEW.service_charge IS DISTINCT FROM OLD.service_charge
    OR NEW.discount_type IS DISTINCT FROM OLD.discount_type
    OR NEW.discount_value IS DISTINCT FROM OLD.discount_value
    OR NEW.discount_note IS DISTINCT FROM OLD.discount_note
    OR NEW.order_discount_amount IS DISTINCT FROM OLD.order_discount_amount
    OR NEW.item_discount_amount IS DISTINCT FROM OLD.item_discount_amount
    OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
    OR NEW.total_amount IS DISTINCT FROM OLD.total_amount;

  v_cancelled_unpaid :=
    NEW.status = 'cancelled'
    AND OLD.status IS DISTINCT FROM NEW.status
    AND COALESCE(OLD.payment_status, 'unpaid') <> 'paid';

  -- Amount changes keep the live VietQR and refresh it after commit.
  -- Cancel still fails closed while a payment code is exposed.
  IF v_cancelled_unpaid
     AND public.order_payment_code_is_exposed(
       OLD.id,
       OLD.tenant_id,
       OLD.branch_id,
       OLD.payment_code
     )
  THEN
    RAISE EXCEPTION 'payment_code_locked' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_order_amount_mutation_after_payment_code_exposed()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.self_order_enforce_payment_request_invariants() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.branch_id IS DISTINCT FROM NEW.branch_id
     OR OLD.table_id IS DISTINCT FROM NEW.table_id
     OR OLD.order_id IS DISTINCT FROM NEW.order_id
     OR OLD.client_op_id IS DISTINCT FROM NEW.client_op_id
     OR OLD.method IS DISTINCT FROM NEW.method
     OR OLD.invoice_payload IS DISTINCT FROM NEW.invoice_payload
     OR OLD.request_fingerprint IS DISTINCT FROM NEW.request_fingerprint
     OR OLD.request_fingerprint_version IS DISTINCT FROM NEW.request_fingerprint_version
     OR OLD.payment_code_snapshot IS DISTINCT FROM NEW.payment_code_snapshot
     OR OLD.vietqr_config_snapshot IS DISTINCT FROM NEW.vietqr_config_snapshot
     OR OLD.expires_at IS DISTINCT FROM NEW.expires_at THEN
    RAISE EXCEPTION 'self_order_payment_request_immutable' USING ERRCODE = '22023';
  END IF;

  -- vietqr_amount_refresh: amount_snapshot and qr_payload_snapshot may track the bill.

  IF OLD.payment_id IS DISTINCT FROM NEW.payment_id
     AND NOT (
       NEW.payment_id IS NOT NULL
       AND NEW.status = 'completed'
       AND (
         (
           OLD.payment_id IS NULL
           AND OLD.status IN ('cash_call', 'vietqr_pending')
         )
         OR (
           OLD.status = 'cancelled'
           AND OLD.method = 'vietqr'
           AND OLD.cancel_reason = 'guest_cancelled_vietqr'
         )
       )
     ) THEN
    RAISE EXCEPTION 'self_order_payment_binding_immutable' USING ERRCODE = '22023';
  END IF;

  IF OLD.cancel_reason IS DISTINCT FROM NEW.cancel_reason
     AND NOT (
       OLD.cancel_reason IS NULL
       AND NEW.cancel_reason IS NOT NULL
       AND OLD.status IN ('cash_call', 'vietqr_pending')
       AND NEW.status = 'cancelled'
     ) THEN
    RAISE EXCEPTION 'self_order_payment_cancel_reason_immutable' USING ERRCODE = '22023';
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status
     AND NOT (
       (
         OLD.status IN ('cash_call', 'vietqr_pending')
         AND NEW.status IN ('completed', 'cancelled', 'expired')
       )
       OR (
         OLD.status = 'cancelled'
         AND OLD.method = 'vietqr'
         AND OLD.cancel_reason = 'guest_cancelled_vietqr'
         AND NEW.status = 'completed'
       )
     ) THEN
    RAISE EXCEPTION 'self_order_invalid_payment_request_transition' USING ERRCODE = '22023';
  END IF;

  IF NEW.status = 'completed'
     AND (NEW.completed_at IS NULL OR NEW.payment_id IS NULL) THEN
    RAISE EXCEPTION 'self_order_completed_request_missing_payment_evidence' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL THEN
    RAISE EXCEPTION 'self_order_cancelled_request_missing_timestamp' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'expired' AND NEW.expired_at IS NULL THEN
    RAISE EXCEPTION 'self_order_expired_request_missing_timestamp' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.self_order_enforce_payment_request_invariants()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.self_order_submit(p_token text, p_items jsonb, p_customer_note text, p_client_op_id uuid) RETURNS jsonb
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

CREATE OR REPLACE FUNCTION public.self_order_accept_request(p_request_id bigint, p_target_order_id bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
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

CREATE OR REPLACE FUNCTION public.self_order_create_payment_request(p_token text, p_client_op_id uuid, p_method text, p_invoice_payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
    IF p_method = 'vietqr' AND v_active.method = 'vietqr' THEN
      PERFORM public.refresh_pending_vietqr_for_order(v_order.id);
      RETURN jsonb_build_object('ok', true, 'recovered', true)
        || public.self_order_payment_request_public_payload(v_active.id);
    END IF;
    IF v_active.request_fingerprint_version = 'payment:v1'
       AND v_active.request_fingerprint = v_fingerprint THEN
      RETURN jsonb_build_object('ok', true, 'recovered', true)
        || public.self_order_payment_request_public_payload(v_active.id);
    END IF;
    RAISE EXCEPTION 'self_order_pending_payment_exists' USING ERRCODE = '55P03';
  END IF;

  BEGIN
    SELECT p.id
    INTO v_payment_id
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

  IF v_payment_id IS NOT NULL THEN
    IF p_method <> 'vietqr' THEN
      RAISE EXCEPTION 'self_order_pending_payment_exists' USING ERRCODE = '55P03';
    END IF;
    PERFORM public.refresh_pending_vietqr_for_order(v_order.id);
    RETURN public.self_order_adopt_pending_vietqr(
      v_order,
      v_table,
      p_client_op_id,
      v_invoice_payload,
      v_fingerprint
    );
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
$_$;

CREATE OR REPLACE FUNCTION public.self_order_get_snapshot(p_token text, p_client_op_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
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
    b.name AS branch_name,
    b.phone AS branch_phone,
    b.google_review_url AS branch_google_review_url
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
      'orderDiscountAmount', COALESCE(o.order_discount_amount, 0),
      'itemDiscountAmount', COALESCE(o.item_discount_amount, 0),
      'discountNote', o.discount_note,
      'promotionName', p.name,
      'promotionCode', pc.code,
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
            'discountAmount', COALESCE(oi.discount_amount, 0),
            'discountNote', oi.discount_note,
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
    LEFT JOIN public.promotions p
      ON p.id = o.promotion_id
     AND p.tenant_id = o.tenant_id
    LEFT JOIN public.promotion_codes pc
      ON pc.id = o.promotion_code_id
     AND pc.tenant_id = o.tenant_id
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

    IF v_payment_payload IS NULL THEN
      v_payment_payload := public.self_order_pending_vietqr_public_payload(v_order_id);
    END IF;
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
    'branch', jsonb_build_object(
      'name', v_table.branch_name,
      'phone', v_table.branch_phone,
      'googleReviewUrl', v_table.branch_google_review_url
    ),
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
