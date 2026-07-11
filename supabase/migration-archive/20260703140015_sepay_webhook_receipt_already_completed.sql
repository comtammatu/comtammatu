CREATE OR REPLACE FUNCTION public.confirm_sepay_payment(
  p_tenant_id bigint,
  p_order_id bigint,
  p_provider_ref text,
  p_transfer_amount numeric,
  p_account_number text,
  p_bank_reference text,
  p_provider_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_order            RECORD;
  v_payment          RECORD;
  v_has_payment      BOOLEAN := FALSE;
  v_payment_id       BIGINT;
  v_expected_account TEXT;
  v_complete_res     RECORD;
  v_receipt_res      JSONB;
  v_print_job_id     BIGINT;
  v_print_failed     BOOLEAN := FALSE;
  v_print_error      TEXT;
  v_provider_data    JSONB;
  v_actor            UUID;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  IF btrim(COALESCE(p_provider_ref, '')) = '' THEN
    RETURN jsonb_build_object('status', 'invalid_payment_code');
  END IF;

  IF p_transfer_amount IS NULL OR p_transfer_amount <= 0 THEN
    RETURN jsonb_build_object('status', 'invalid_amount');
  END IF;

  SELECT
    o.id AS order_id,
    o.tenant_id,
    o.branch_id,
    o.total_amount,
    o.payment_status,
    o.payment_method,
    o.payment_code,
    o.created_by
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
    AND o.tenant_id = p_tenant_id
    AND lower(o.payment_code) = lower(btrim(p_provider_ref))
    AND o.status <> 'cancelled'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'payment_not_found');
  END IF;

  SELECT NULLIF(regexp_replace(COALESCE(ss.value, ''), '\s+', '', 'g'), '')
  INTO v_expected_account
  FROM public.system_settings ss
  WHERE ss.tenant_id = v_order.tenant_id
    AND ss.key = 'payment_vietqr_account_no'
  LIMIT 1;

  IF v_expected_account IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'account_config_missing',
      'order_id', v_order.order_id,
      'payment_id', NULL
    );
  END IF;

  IF regexp_replace(COALESCE(p_account_number, ''), '\s+', '', 'g') <> v_expected_account THEN
    RETURN jsonb_build_object(
      'status', 'account_mismatch',
      'order_id', v_order.order_id,
      'payment_id', NULL
    );
  END IF;

  IF p_transfer_amount <> v_order.total_amount THEN
    RETURN jsonb_build_object(
      'status', 'amount_mismatch',
      'order_id', v_order.order_id,
      'payment_id', NULL,
      'expected', v_order.total_amount,
      'received', p_transfer_amount
    );
  END IF;

  v_provider_data := COALESCE(p_provider_data, '{}'::jsonb)
    || jsonb_build_object(
      'bankReference', p_bank_reference,
      'description', v_order.payment_code
    );

  SELECT p.id AS payment_id,
         p.method AS payment_method,
         p.amount AS payment_amount,
         p.status AS payment_status,
         p.created_by AS payment_created_by
  INTO v_payment
  FROM public.payments p
  WHERE p.tenant_id = v_order.tenant_id
    AND p.branch_id = v_order.branch_id
    AND p.order_id = v_order.order_id
    AND p.status <> 'failed'
  ORDER BY p.id DESC
  LIMIT 1
  FOR UPDATE;
  v_has_payment := FOUND;
  v_actor := v_order.created_by;
  IF v_has_payment THEN
    v_actor := COALESCE(v_payment.payment_created_by, v_order.created_by);
  END IF;

  IF v_has_payment AND (
    v_payment.payment_status = 'completed'
    OR COALESCE(v_order.payment_status, 'unpaid') = 'paid'
  ) THEN
    IF v_payment.payment_method = 'vietqr'
       AND COALESCE(v_order.payment_method, '') = 'vietqr' THEN
      BEGIN
        v_receipt_res := public.enqueue_receipt_print(v_order.order_id, NULL, NULL);
        v_print_job_id := NULLIF(v_receipt_res ->> 'job_id', '')::BIGINT;
      EXCEPTION WHEN OTHERS THEN
        v_print_failed := TRUE;
        v_print_error := SQLERRM;
        RAISE NOTICE '[confirm_sepay_payment] receipt print failed for order %: %',
          v_order.order_id, SQLERRM;
      END;

      RETURN jsonb_build_object(
        'status', 'already_completed',
        'order_id', v_order.order_id,
        'payment_id', v_payment.payment_id,
        'print', jsonb_build_object(
          'job_id', v_print_job_id,
          'failed', v_print_failed,
          'error', v_print_error
        )
      );
    END IF;

    UPDATE public.payments
       SET method = 'vietqr',
           amount = v_order.total_amount,
           status = 'completed',
           provider_ref = v_order.payment_code,
           paid_at = COALESCE(paid_at, now()),
           provider_data = v_provider_data,
           updated_at = now()
     WHERE id = v_payment.payment_id;

    UPDATE public.orders
       SET payment_status = 'paid',
           payment_method = 'vietqr',
           cash_received = NULL,
           cash_change = NULL,
           updated_at = now()
     WHERE id = v_order.order_id
       AND tenant_id = v_order.tenant_id;

    BEGIN
      v_receipt_res := public.enqueue_receipt_print(v_order.order_id, NULL, NULL);
      v_print_job_id := NULLIF(v_receipt_res ->> 'job_id', '')::BIGINT;
    EXCEPTION WHEN OTHERS THEN
      v_print_failed := TRUE;
      v_print_error := SQLERRM;
      RAISE NOTICE '[confirm_sepay_payment] receipt print failed for order %: %',
        v_order.order_id, SQLERRM;
    END;

    RETURN jsonb_build_object(
      'status', 'completed',
      'order_id', v_order.order_id,
      'payment_id', v_payment.payment_id,
      'corrected_from_cash', TRUE,
      'print', jsonb_build_object(
        'job_id', v_print_job_id,
        'failed', v_print_failed,
        'error', v_print_error
      )
    );
  END IF;

  IF v_has_payment THEN
    UPDATE public.payments
       SET method = 'vietqr',
           amount = v_order.total_amount,
           provider_ref = v_order.payment_code,
           provider_data = v_provider_data,
           updated_at = now()
     WHERE id = v_payment.payment_id
     RETURNING id INTO v_payment_id;
  ELSE
    INSERT INTO public.payments (
      tenant_id, branch_id, order_id, method, amount, status, provider_ref, provider_data, created_by
    )
    VALUES (
      v_order.tenant_id, v_order.branch_id, v_order.order_id, 'vietqr',
      v_order.total_amount, 'pending', v_order.payment_code, v_provider_data, v_order.created_by
    )
    RETURNING id INTO v_payment_id;
  END IF;

  SELECT * INTO v_complete_res
  FROM public.complete_payment_and_consume_stock(
    v_payment_id,
    p_transfer_amount,
    v_provider_data,
    v_actor
  );

  IF v_complete_res.status NOT IN ('completed', 'already_completed') THEN
    RETURN jsonb_build_object(
      'status', v_complete_res.status,
      'order_id', v_order.order_id,
      'payment_id', v_payment_id,
      'detail', v_complete_res.detail
    );
  END IF;

  UPDATE public.orders
     SET payment_method = 'vietqr',
         cash_received = NULL,
         cash_change = NULL,
         updated_at = now()
   WHERE id = v_order.order_id
     AND tenant_id = v_order.tenant_id;

  BEGIN
    v_receipt_res := public.enqueue_receipt_print(v_order.order_id, NULL, NULL);
    v_print_job_id := NULLIF(v_receipt_res ->> 'job_id', '')::BIGINT;
  EXCEPTION WHEN OTHERS THEN
    v_print_failed := TRUE;
    v_print_error := SQLERRM;
    RAISE NOTICE '[confirm_sepay_payment] receipt print failed for order %: %',
      v_order.order_id, SQLERRM;
  END;

  RETURN jsonb_build_object(
    'status', v_complete_res.status,
    'order_id', v_order.order_id,
    'payment_id', v_payment_id,
    'print', jsonb_build_object(
      'job_id', v_print_job_id,
      'failed', v_print_failed,
      'error', v_print_error
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_sepay_payment(bigint, bigint, text, numeric, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_sepay_payment(bigint, bigint, text, numeric, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.confirm_sepay_payment(bigint, bigint, text, numeric, text, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_sepay_payment(bigint, bigint, text, numeric, text, text, jsonb) TO service_role;
