CREATE OR REPLACE FUNCTION public.confirm_cash_payment(p_order_id bigint, p_cash_received numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid                   UUID;
  v_order                 public.orders%ROWTYPE;
  v_existing_id           BIGINT;
  v_existing_st           TEXT;
  v_existing_method       TEXT;
  v_existing_provider_ref TEXT;
  v_payment_id            BIGINT;
  v_provider_ref          TEXT;
  v_cash_change           NUMERIC(15,2);
  v_complete_res          RECORD;
  v_receipt_res           JSONB;
  v_print_warning         TEXT;
  v_try                   INT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'pos:confirm_payment') THEN
    RAISE EXCEPTION 'permission denied: pos:confirm_payment' USING ERRCODE = '42501';
  END IF;

  IF v_order.payment_status = 'paid' THEN
    SELECT id INTO v_payment_id
    FROM public.payments
    WHERE order_id = p_order_id
      AND tenant_id = v_order.tenant_id
      AND status = 'completed'
    ORDER BY id DESC
    LIMIT 1;

    RETURN jsonb_build_object(
      'status',        'already_completed',
      'order_id',      p_order_id,
      'payment_id',    v_payment_id,
      'cash_received', v_order.cash_received,
      'cash_change',   COALESCE(v_order.cash_change, 0),
      'print_job_id',  NULL,
      'idempotent',    true
    );
  END IF;

  IF p_cash_received IS NULL THEN
    RAISE EXCEPTION 'cash_received required' USING ERRCODE = 'P0001';
  END IF;
  IF p_cash_received < v_order.total_amount THEN
    RAISE EXCEPTION 'cash_received (%) must be >= total_amount (%)',
      p_cash_received, v_order.total_amount
      USING ERRCODE = 'P0001';
  END IF;

  IF p_cash_received > GREATEST(v_order.total_amount * 10, 50000000) THEN
    RAISE EXCEPTION 'cash_received (%) exceeds sane upper bound for total (%)',
      p_cash_received, v_order.total_amount
      USING ERRCODE = 'P0001';
  END IF;

  v_cash_change := p_cash_received - v_order.total_amount;

  SELECT id, status, method, provider_ref
  INTO v_existing_id, v_existing_st, v_existing_method, v_existing_provider_ref
  FROM public.payments
  WHERE order_id = p_order_id
    AND tenant_id = v_order.tenant_id
    AND status <> 'failed'
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_st = 'completed' THEN
    RETURN jsonb_build_object(
      'status',        'already_completed',
      'order_id',      p_order_id,
      'payment_id',    v_existing_id,
      'cash_received', COALESCE(v_order.cash_received, p_cash_received),
      'cash_change',   COALESCE(v_order.cash_change, v_cash_change),
      'print_job_id',  NULL,
      'idempotent',    true
    );
  END IF;

  IF v_existing_provider_ref ~* '^DH[A-Z0-9]{3,12}$' THEN
    v_provider_ref := upper(v_existing_provider_ref);
  ELSE
    FOR v_try IN 1..5 LOOP
      v_provider_ref := 'DH' || upper(substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 10));
      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM public.payments p
        WHERE p.tenant_id = v_order.tenant_id
          AND lower(p.provider_ref) = lower(v_provider_ref)
          AND p.status <> 'failed'
      );
    END LOOP;
  END IF;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.payments
       SET method        = 'cash',
           amount        = v_order.total_amount,
           status        = 'pending',
           provider_ref  = v_provider_ref,
           provider_data = COALESCE(provider_data, '{}'::jsonb)
                           || jsonb_build_object('description', v_provider_ref),
           updated_at    = now()
     WHERE id = v_existing_id;
    v_payment_id := v_existing_id;
  ELSE
    INSERT INTO public.payments (
      tenant_id, branch_id, order_id, method, amount, status, provider_ref, provider_data, created_by
    ) VALUES (
      v_order.tenant_id, v_order.branch_id, p_order_id, 'cash',
      v_order.total_amount, 'pending', v_provider_ref,
      jsonb_build_object('description', v_provider_ref),
      v_uid
    )
    RETURNING id INTO v_payment_id;
  END IF;

  UPDATE public.orders
     SET payment_method = 'cash',
         updated_at     = now()
   WHERE id = p_order_id;

  SELECT * INTO v_complete_res
  FROM public.complete_payment_and_consume_stock(
    v_payment_id,
    v_order.total_amount,
    jsonb_build_object('cash_received', p_cash_received, 'cash_change', v_cash_change),
    v_uid
  );

  IF v_complete_res.status = 'stock_failed' THEN
    RETURN jsonb_build_object(
      'status',      'stock_failed',
      'order_id',    p_order_id,
      'payment_id',  v_payment_id,
      'error_code',  'stock_consumption_failed',
      'detail',      v_complete_res.detail
    );
  END IF;

  IF v_complete_res.status = 'amount_mismatch_recomputed' THEN
    RETURN jsonb_build_object(
      'status',      'amount_mismatch_recomputed',
      'order_id',    p_order_id,
      'payment_id',  v_payment_id,
      'error_code',  'amount_mismatch_recomputed',
      'detail',      v_complete_res.detail
    );
  END IF;

  IF v_complete_res.status NOT IN ('completed', 'already_completed') THEN
    RAISE EXCEPTION 'payment completion failed: % (detail: %)',
      v_complete_res.status, v_complete_res.detail
      USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    v_receipt_res := public.enqueue_receipt_print(
      p_order_id,
      p_cash_received,
      v_cash_change
    );
  EXCEPTION WHEN OTHERS THEN
    v_print_warning := SQLERRM;
    v_receipt_res := jsonb_build_object('error', SQLERRM);
    RAISE NOTICE '[confirm_cash_payment] receipt enqueue skipped for order %: %',
      p_order_id, SQLERRM;
  END;

  RETURN jsonb_build_object(
    'status',        'completed',
    'order_id',      p_order_id,
    'payment_id',    v_payment_id,
    'cash_received', p_cash_received,
    'cash_change',   v_cash_change,
    'print_job_id',  v_receipt_res->>'job_id',
    'print_warning', v_print_warning
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_receipt_print(p_order_id bigint, p_cash_received numeric DEFAULT NULL::numeric, p_cash_change numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid          UUID;
  v_order        public.orders%ROWTYPE;
  v_branch       public.branches%ROWTYPE;
  v_table_no     INT;
  v_printer_id   BIGINT;
  v_cashier_name TEXT;
  v_branch_tax   TEXT;
  v_qr_type      TEXT;
  v_vietqr_bank  TEXT;
  v_vietqr_acc   TEXT;
  v_vietqr_name  TEXT;
  v_payment_ref  TEXT;
  v_qr_content   TEXT;
  v_payment_qr   JSONB;
  v_items        JSONB;
  v_payload      JSONB;
  v_idempotency  TEXT;
  v_job_id       BIGINT;
  v_now          TIMESTAMPTZ := now();
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_permission(v_order.branch_id, 'pos:print')
    OR public.has_permission(v_order.branch_id, 'pos:reprint_receipt')
  ) THEN
    RAISE EXCEPTION 'permission denied: pos:print' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_branch FROM public.branches WHERE id = v_order.branch_id;

  IF v_order.table_id IS NOT NULL THEN
    SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
  END IF;

  SELECT full_name INTO v_cashier_name
  FROM public.profiles WHERE id = v_order.created_by;

  SELECT value INTO v_branch_tax
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'branch_tax_code';

  v_printer_id := public.resolve_branch_printer_for_type(
    v_order.tenant_id,
    v_order.branch_id,
    'receipt'
  );

  IF v_printer_id IS NULL THEN
    RAISE EXCEPTION 'no active receipt printer for branch %', v_order.branch_id
      USING ERRCODE = 'P0002';
  END IF;

  IF p_cash_received IS NOT NULL OR p_cash_change IS NOT NULL THEN
    UPDATE public.orders
       SET cash_received = p_cash_received,
           cash_change   = p_cash_change
     WHERE id = p_order_id;
  END IF;

  SELECT provider_ref INTO v_payment_ref
  FROM public.payments
  WHERE order_id = p_order_id
    AND tenant_id = v_order.tenant_id
    AND status <> 'failed'
    AND provider_ref ~* '^DH[A-Z0-9]{3,12}$'
  ORDER BY id DESC
  LIMIT 1;

  SELECT value INTO v_qr_type
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'payment_qr_type';
  v_qr_type := COALESCE(v_qr_type, 'vietqr');

  IF v_qr_type = 'vietqr' AND v_payment_ref IS NOT NULL THEN
    SELECT value INTO v_vietqr_bank FROM public.system_settings
     WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_bank_code';
    SELECT value INTO v_vietqr_acc FROM public.system_settings
     WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_account_no';
    SELECT value INTO v_vietqr_name FROM public.system_settings
     WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_account_name';

    BEGIN
      v_qr_content := public.print_vietqr_emvco(
        v_vietqr_bank,
        v_vietqr_acc,
        v_vietqr_name,
        v_order.total_amount,
        v_payment_ref
      );
    EXCEPTION WHEN OTHERS THEN
      v_qr_content := NULL;
      RAISE WARNING '[enqueue_receipt_print] vietqr emv build failed for order %: %',
        p_order_id, SQLERRM;
    END;

    IF v_qr_content IS NOT NULL THEN
      v_payment_qr := jsonb_build_object(
        'type',         'vietqr',
        'content',      v_qr_content,
        'header_label', upper(COALESCE(v_vietqr_bank, ''))
                          || ' (BIN ' || public.print_vietqr_bank_bin(v_vietqr_bank) || ')',
        'account_no',   v_vietqr_acc,
        'account_name', v_vietqr_name,
        'amount',       v_order.total_amount,
        'description',  v_payment_ref
      );
    END IF;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'item_name',    oi.item_name,
      'variant_name', oi.variant_name,
      'quantity',     oi.quantity,
      'unit_price',   oi.unit_price,
      'modifiers',    oi.modifiers,
      'sides',        oi.sides,
      'subtotal',     oi.subtotal,
      'note',         oi.note
    )
    ORDER BY oi.id
  )
  INTO v_items
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.status <> 'cancelled';

  v_payload := jsonb_build_object(
    'kind',             'receipt',
    'branch_name',      COALESCE(v_branch.name, ''),
    'branch_address',   COALESCE(v_branch.address, ''),
    'branch_phone',     COALESCE(v_branch.phone, ''),
    'branch_tax_code',  COALESCE(v_branch_tax, ''),
    'order_number',     v_order.order_number,
    'order_type',       v_order.order_type,
    'table_number',     v_table_no,
    'cashier_name',     COALESCE(v_cashier_name, ''),
    'note',             v_order.note,
    'items',            COALESCE(v_items, '[]'::jsonb),
    'subtotal',         v_order.subtotal,
    'tax_amount',       v_order.tax_amount,
    'service_charge',   v_order.service_charge,
    'discount_amount',  v_order.discount_amount,
    'total_amount',     v_order.total_amount,
    'payment_method',   v_order.payment_method,
    'payment_qr',       v_payment_qr,
    'cash_received',    p_cash_received,
    'cash_change',      p_cash_change,
    'created_at',       to_char(v_order.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                'YYYY-MM-DD"T"HH24:MI:SS'),
    'printed_at',       to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                'YYYY-MM-DD"T"HH24:MI:SS')
  );

  v_idempotency := 'order:' || p_order_id::TEXT || ':receipt';

  INSERT INTO public.print_jobs (
    tenant_id, branch_id, printer_id, job_type,
    order_id, payload, idempotency_key, created_by
  )
  VALUES (
    v_order.tenant_id, v_order.branch_id, v_printer_id, 'receipt',
    p_order_id, v_payload, v_idempotency, v_uid
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET
    payload    = EXCLUDED.payload,
    printer_id = EXCLUDED.printer_id,
    status = CASE
               WHEN public.print_jobs.status IN ('failed','expired','printed')
               THEN 'pending'
               ELSE public.print_jobs.status
             END,
    last_error       = NULL,
    claimed_by_agent = NULL,
    claimed_at       = NULL
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'order_id',   p_order_id,
    'job_id',     v_job_id,
    'printer_id', v_printer_id
  );
END;
$$;

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
  v_provider_data    JSONB;
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

  v_provider_data := COALESCE(p_provider_data, '{}'::jsonb)
    || jsonb_build_object('bankReference', p_bank_reference);

  SELECT p.id AS payment_id,
         p.tenant_id,
         p.branch_id,
         p.order_id,
         p.method AS payment_method,
         p.amount AS payment_amount,
         p.status AS payment_status,
         p.provider_data AS payment_provider_data,
         p.created_by AS payment_created_by,
         o.total_amount AS order_total_amount,
         o.payment_status AS order_payment_status,
         o.payment_method AS order_payment_method
  INTO v_payment
  FROM public.payments p
  JOIN public.orders o
    ON o.id = p.order_id
   AND o.tenant_id = p.tenant_id
   AND o.branch_id = p.branch_id
  WHERE p.method IN ('cash', 'vietqr')
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
    IF v_payment.payment_method = 'vietqr'
       AND COALESCE(v_payment.order_payment_method, '') = 'vietqr' THEN
      RETURN jsonb_build_object(
        'status', 'already_completed',
        'order_id', v_payment.order_id,
        'payment_id', v_payment.payment_id,
        'print', jsonb_build_object('failed', FALSE)
      );
    END IF;

    UPDATE public.payments
       SET method = 'vietqr',
           status = 'completed',
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
     WHERE id = v_payment.order_id
       AND tenant_id = v_payment.tenant_id;

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
      'status', 'completed',
      'order_id', v_payment.order_id,
      'payment_id', v_payment.payment_id,
      'corrected_from_cash', TRUE,
      'print', jsonb_build_object(
        'job_id', v_print_job_id,
        'failed', v_print_failed,
        'error', v_print_error
      )
    );
  END IF;

  UPDATE public.payments
     SET method = 'vietqr',
         provider_data = v_provider_data,
         updated_at = now()
   WHERE id = v_payment.payment_id;

  SELECT * INTO v_complete_res
  FROM public.complete_payment_and_consume_stock(
    v_payment.payment_id,
    p_transfer_amount,
    v_provider_data,
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

  UPDATE public.orders
     SET payment_method = 'vietqr',
         cash_received = NULL,
         cash_change = NULL,
         updated_at = now()
   WHERE id = v_payment.order_id
     AND tenant_id = v_payment.tenant_id;

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
IS 'Service-role settlement for SePay bank-transfer webhooks. Matches a tenant-bound payment code, completes pending VietQR payments, and corrects cash-confirmed orders to VietQR when account and amount match.';
