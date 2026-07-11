ALTER TABLE public.webhook_events
  DROP CONSTRAINT IF EXISTS webhook_events_provider_check;

ALTER TABLE public.webhook_events
  ADD CONSTRAINT webhook_events_provider_check
  CHECK (provider = ANY (ARRAY['momo'::text, 'vietqr'::text, 'vnpay'::text, 'sepay'::text]));

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_vietqr_provider_ref_active
  ON public.payments (tenant_id, lower(provider_ref))
  WHERE method = 'vietqr'
    AND provider_ref IS NOT NULL
    AND status <> 'failed';

CREATE OR REPLACE FUNCTION public.create_payment(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_order_id bigint,
  p_method text,
  p_amount numeric,
  p_created_by uuid,
  p_provider_ref text DEFAULT NULL::text,
  p_status text DEFAULT 'pending'::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_order                        RECORD;
  v_payment_id                   BIGINT;
  v_existing_payment_id          BIGINT;
  v_existing_status              TEXT;
  v_existing_method              TEXT;
  v_effective_method             TEXT;
  v_final_status                 TEXT;
  v_skip_completion_side_effects BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;
  IF p_created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'actor_mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_method NOT IN ('cash', 'momo', 'vietqr') THEN
    RAISE EXCEPTION 'invalid payment method: %', p_method USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'permission denied: pos:use' USING ERRCODE = '42501';
  END IF;

  SELECT id, total_amount, tax_amount, payment_status, branch_id, tenant_id
  INTO v_order
  FROM public.orders
  WHERE id        = p_order_id
    AND tenant_id = p_tenant_id
    AND branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'order_already_paid' USING ERRCODE = 'P0001';
  END IF;

  IF p_amount <> v_order.total_amount THEN
    RAISE EXCEPTION 'amount_mismatch: expected % got %', v_order.total_amount, p_amount
      USING ERRCODE = '22023';
  END IF;

  v_final_status := CASE
    WHEN p_method = 'cash' THEN 'completed'
    ELSE COALESCE(p_status, 'pending')
  END;
  v_effective_method := p_method;

  SELECT id, status, method
  INTO v_existing_payment_id, v_existing_status, v_existing_method
  FROM public.payments
  WHERE tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND order_id  = p_order_id
    AND status   <> 'failed'
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_status = 'completed' THEN
    v_payment_id                   := v_existing_payment_id;
    v_final_status                 := 'completed';
    v_effective_method             := v_existing_method;
    v_skip_completion_side_effects := TRUE;
  ELSIF v_existing_status = 'pending' THEN
    IF v_existing_method IS DISTINCT FROM p_method THEN
      RAISE EXCEPTION 'payment_pending_different_method: existing=% requested=%',
        v_existing_method, p_method
        USING ERRCODE = '23505';
    END IF;

    UPDATE public.payments
    SET method = p_method, amount = p_amount, status = v_final_status,
        provider_ref = p_provider_ref, provider_data = NULL,
        paid_at = CASE WHEN v_final_status = 'completed' THEN now() ELSE NULL END,
        updated_at = now()
    WHERE id = v_existing_payment_id
    RETURNING id INTO v_payment_id;
  ELSIF v_existing_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'payment_not_pending: status=%', v_existing_status USING ERRCODE = '22023';
  ELSE
    INSERT INTO public.payments (
      tenant_id, branch_id, order_id, method, amount, status, provider_ref, paid_at, created_by
    ) VALUES (
      p_tenant_id, p_branch_id, p_order_id, p_method, p_amount, v_final_status, p_provider_ref,
      CASE WHEN v_final_status = 'completed' THEN now() ELSE NULL END, p_created_by
    )
    RETURNING id INTO v_payment_id;
  END IF;

  UPDATE public.orders
  SET payment_method = v_effective_method,
      payment_status = CASE WHEN v_final_status = 'completed' THEN 'paid' ELSE payment_status END,
      updated_at = now()
  WHERE id = p_order_id;

  IF v_final_status = 'completed' AND NOT v_skip_completion_side_effects THEN
    PERFORM public.finalize_paid_order(p_order_id, p_created_by);
  END IF;

  RETURN jsonb_build_object('payment_id', v_payment_id, 'status', v_final_status, 'idempotent', v_skip_completion_side_effects);
END;
$$;

COMMENT ON FUNCTION public.create_payment(bigint, bigint, bigint, text, numeric, uuid, text, text)
IS 'Atomic POS payment creation for cash, MoMo, and VietQR. VietQR starts pending with a random provider_ref and is completed by SePay webhook or cashier confirmation.';

REVOKE ALL ON FUNCTION public.create_payment(bigint, bigint, bigint, text, numeric, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_payment(bigint, bigint, bigint, text, numeric, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_payment(bigint, bigint, bigint, text, numeric, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_payment(bigint, bigint, bigint, text, numeric, uuid, text, text) TO service_role;

DROP FUNCTION IF EXISTS public.confirm_sepay_payment(text, numeric, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.confirm_sepay_payment(
  p_tenant_id bigint,
  p_payment_id bigint,
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
  v_payment          RECORD;
  v_expected_account TEXT;
  v_complete_res     RECORD;
  v_receipt_res      JSONB;
  v_print_job_id     BIGINT;
  v_print_failed     BOOLEAN := FALSE;
  v_print_error      TEXT;
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

  SELECT p.id AS payment_id,
         p.tenant_id,
         p.branch_id,
         p.order_id,
         p.amount AS payment_amount,
         p.status AS payment_status,
         p.provider_data AS payment_provider_data,
         p.created_by AS payment_created_by,
         o.total_amount AS order_total_amount,
         o.payment_status AS order_payment_status
  INTO v_payment
  FROM public.payments p
  JOIN public.orders o
    ON o.id = p.order_id
   AND o.tenant_id = p.tenant_id
   AND o.branch_id = p.branch_id
  WHERE p.method = 'vietqr'
    AND p.tenant_id = p_tenant_id
    AND p.id = p_payment_id
    AND lower(p.provider_ref) = lower(btrim(p_provider_ref))
    AND p.status <> 'failed'
    AND o.status <> 'cancelled'
  FOR UPDATE OF p, o;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'payment_not_found');
  END IF;

  SELECT COALESCE(
    NULLIF(regexp_replace(COALESCE(v_payment.payment_provider_data ->> 'accountNo', ''), '\s+', '', 'g'), ''),
    (
      SELECT NULLIF(regexp_replace(COALESCE(ss.value, ''), '\s+', '', 'g'), '')
      FROM public.system_settings ss
      WHERE ss.tenant_id = v_payment.tenant_id
        AND ss.key = 'payment_vietqr_account_no'
      LIMIT 1
    )
  )
  INTO v_expected_account;

  IF v_expected_account IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'account_config_missing',
      'order_id', v_payment.order_id,
      'payment_id', v_payment.payment_id
    );
  END IF;

  IF regexp_replace(COALESCE(p_account_number, ''), '\s+', '', 'g') <> v_expected_account THEN
    RETURN jsonb_build_object(
      'status', 'account_mismatch',
      'order_id', v_payment.order_id,
      'payment_id', v_payment.payment_id
    );
  END IF;

  IF p_transfer_amount <> v_payment.payment_amount
     OR p_transfer_amount <> v_payment.order_total_amount THEN
    RETURN jsonb_build_object(
      'status', 'amount_mismatch',
      'order_id', v_payment.order_id,
      'payment_id', v_payment.payment_id,
      'expected', v_payment.payment_amount,
      'received', p_transfer_amount
    );
  END IF;

  IF v_payment.payment_status = 'completed'
     OR COALESCE(v_payment.order_payment_status, 'unpaid') = 'paid' THEN
    RETURN jsonb_build_object(
      'status', 'already_completed',
      'order_id', v_payment.order_id,
      'payment_id', v_payment.payment_id,
      'print', jsonb_build_object('failed', FALSE)
    );
  END IF;

  SELECT * INTO v_complete_res
  FROM public.complete_payment_and_consume_stock(
    v_payment.payment_id,
    p_transfer_amount,
    COALESCE(p_provider_data, '{}'::jsonb) || jsonb_build_object('bankReference', p_bank_reference),
    v_payment.payment_created_by
  );

  IF v_complete_res.status NOT IN ('completed', 'already_completed') THEN
    RETURN jsonb_build_object(
      'status', v_complete_res.status,
      'order_id', v_payment.order_id,
      'payment_id', v_payment.payment_id,
      'detail', v_complete_res.detail
    );
  END IF;

  BEGIN
    v_receipt_res := public.enqueue_receipt_print(v_payment.order_id, NULL, NULL);
    v_print_job_id := NULLIF(v_receipt_res ->> 'job_id', '')::BIGINT;
  EXCEPTION WHEN OTHERS THEN
    v_print_failed := TRUE;
    v_print_error := SQLERRM;
    RAISE NOTICE '[confirm_sepay_payment] receipt print failed for order %: %',
      v_payment.order_id, SQLERRM;
  END;

  RETURN jsonb_build_object(
    'status', v_complete_res.status,
    'order_id', v_payment.order_id,
    'payment_id', v_payment.payment_id,
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

COMMENT ON FUNCTION public.confirm_sepay_payment(bigint, bigint, text, numeric, text, text, jsonb)
IS 'Service-role settlement for SePay bank-transfer webhooks. Matches a tenant-bound pending VietQR payment, completes the payment, and enqueues receipt printing.';

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.webhook_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.webhook_events FROM authenticated;
REVOKE USAGE, UPDATE ON SEQUENCE public.webhook_events_id_seq FROM anon;
REVOKE USAGE, UPDATE ON SEQUENCE public.webhook_events_id_seq FROM authenticated;
GRANT SELECT ON TABLE public.webhook_events TO authenticated;
GRANT ALL ON TABLE public.webhook_events TO service_role;
GRANT ALL ON SEQUENCE public.webhook_events_id_seq TO service_role;
