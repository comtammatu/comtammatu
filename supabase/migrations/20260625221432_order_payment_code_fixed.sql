CREATE OR REPLACE FUNCTION public.generate_order_payment_code() RETURNS text
LANGUAGE sql
VOLATILE
SET search_path TO ''
AS $$
  SELECT 'DH' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
$$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_code text;

ALTER TABLE public.orders
  ALTER COLUMN payment_code SET DEFAULT public.generate_order_payment_code();

WITH ranked_payment_codes AS (
  SELECT
    p.order_id,
    upper(p.provider_ref) AS payment_code,
    row_number() OVER (
      PARTITION BY p.order_id
      ORDER BY p.id DESC
    ) AS order_rank,
    row_number() OVER (
      PARTITION BY lower(p.provider_ref)
      ORDER BY p.id DESC
    ) AS code_rank
  FROM public.payments p
  WHERE p.provider_ref ~* '^DH[A-Z0-9]{3,12}$'
    AND p.status <> 'failed'
)
UPDATE public.orders o
   SET payment_code = ranked_payment_codes.payment_code
  FROM ranked_payment_codes
 WHERE o.id = ranked_payment_codes.order_id
   AND o.payment_code IS NULL
   AND ranked_payment_codes.order_rank = 1
   AND ranked_payment_codes.code_rank = 1;

UPDATE public.orders
   SET payment_code = public.generate_order_payment_code()
 WHERE payment_code IS NULL;

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

  SELECT value INTO v_qr_type
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'payment_qr_type';
  v_qr_type := COALESCE(v_qr_type, 'vietqr');

  IF v_qr_type = 'vietqr' AND v_order.payment_code IS NOT NULL THEN
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
        v_order.payment_code
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
        'description',  v_order.payment_code
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
      RETURN jsonb_build_object(
        'status', 'already_completed',
        'order_id', v_order.order_id,
        'payment_id', v_payment.payment_id,
        'print', jsonb_build_object('failed', FALSE)
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

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_code_format_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_code_format_check
  CHECK (payment_code ~* '^DH[A-Z0-9]{3,12}$') NOT VALID;

ALTER TABLE public.orders
  VALIDATE CONSTRAINT orders_payment_code_format_check;

ALTER TABLE public.orders
  ALTER COLUMN payment_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_code_unique
  ON public.orders (lower(payment_code));

CREATE OR REPLACE FUNCTION public.ensure_order_payment_code(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_order_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_order RECORD;
  v_code text;
  v_try int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT id, tenant_id, branch_id, status, payment_status, payment_code
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id = p_tenant_id
    AND branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.has_permission(v_order.branch_id, 'pos:use')
    OR public.has_permission(v_order.branch_id, 'pos:print')
  ) THEN
    RAISE EXCEPTION 'permission denied: pos:use' USING ERRCODE = '42501';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'order_cancelled' USING ERRCODE = '22023';
  END IF;

  IF v_order.payment_code IS NULL THEN
    FOR v_try IN 1..20 LOOP
      v_code := public.generate_order_payment_code();
      BEGIN
        UPDATE public.orders
           SET payment_code = v_code,
               updated_at = now()
         WHERE id = v_order.id
         RETURNING payment_code INTO v_order.payment_code;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        IF v_try = 20 THEN
          RAISE;
        END IF;
      END;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'payment_code', v_order.payment_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_order_payment_code(bigint, bigint, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_order_payment_code(bigint, bigint, bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_order_payment_code(bigint, bigint, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_order_payment_code(bigint, bigint, bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.confirm_cash_payment(p_order_id bigint, p_cash_received numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid                   UUID;
  v_order                 public.orders%ROWTYPE;
  v_existing_id           BIGINT;
  v_existing_st           TEXT;
  v_existing_provider_ref TEXT;
  v_payment_id            BIGINT;
  v_provider_ref          TEXT;
  v_cash_change           NUMERIC(15,2);
  v_complete_res          RECORD;
  v_receipt_res           JSONB;
  v_print_warning         TEXT;
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

  v_provider_ref := upper(v_order.payment_code);
  v_cash_change := p_cash_received - v_order.total_amount;

  SELECT id, status, provider_ref
  INTO v_existing_id, v_existing_st, v_existing_provider_ref
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

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.payments
       SET method        = 'cash',
           amount        = v_order.total_amount,
           status        = 'pending',
           provider_ref  = COALESCE(v_provider_ref, v_existing_provider_ref),
           provider_data = COALESCE(provider_data, '{}'::jsonb)
                           || jsonb_build_object('description', COALESCE(v_provider_ref, v_existing_provider_ref)),
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

CREATE OR REPLACE FUNCTION public.confirm_vietqr_payment(p_tenant_id bigint, p_branch_id bigint, p_order_id bigint, p_amount numeric, p_created_by uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid             UUID;
  v_order           RECORD;
  v_payment_id      BIGINT;
  v_existing_id     BIGINT;
  v_existing_status TEXT;
  v_idempotent      BOOLEAN := FALSE;
  v_receipt_res     JSONB;
  v_print_job_id    BIGINT;
  v_print_failed    BOOLEAN := FALSE;
  v_print_error     TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT id, total_amount, tax_amount, payment_status, branch_id, tenant_id, payment_code
  INTO v_order
  FROM public.orders
  WHERE id          = p_order_id
    AND tenant_id   = p_tenant_id
    AND branch_id   = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
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
    WHERE order_id  = p_order_id
      AND tenant_id = p_tenant_id
      AND status    = 'completed'
    ORDER BY id DESC LIMIT 1;

    RETURN jsonb_build_object(
      'payment_id', v_payment_id,
      'idempotent', TRUE,
      'print',      jsonb_build_object('failed', FALSE)
    );
  END IF;

  IF p_amount <> v_order.total_amount THEN
    RAISE EXCEPTION 'amount_mismatch: expected % got %',
      v_order.total_amount, p_amount
      USING ERRCODE = '22023';
  END IF;

  SELECT id, status
  INTO v_existing_id, v_existing_status
  FROM public.payments
  WHERE tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND order_id  = p_order_id
    AND status   <> 'failed'
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_status = 'completed' THEN
    v_payment_id := v_existing_id;
    v_idempotent := TRUE;

  ELSIF v_existing_status = 'pending' THEN
    UPDATE public.payments
    SET method        = 'vietqr',
        amount        = p_amount,
        status        = 'completed',
        provider_ref  = v_order.payment_code,
        provider_data = COALESCE(provider_data, '{}'::jsonb)
                        || jsonb_build_object('description', v_order.payment_code),
        paid_at       = now(),
        updated_at    = now()
    WHERE id = v_existing_id
    RETURNING id INTO v_payment_id;

  ELSE
    INSERT INTO public.payments (
      tenant_id, branch_id, order_id,
      method, amount, status, provider_ref, provider_data, paid_at, created_by
    ) VALUES (
      p_tenant_id, p_branch_id, p_order_id,
      'vietqr', p_amount, 'completed', v_order.payment_code,
      jsonb_build_object('description', v_order.payment_code),
      now(), v_uid
    )
    RETURNING id INTO v_payment_id;
  END IF;

  IF NOT v_idempotent THEN
    UPDATE public.orders
    SET payment_status = 'paid',
        payment_method = 'vietqr',
        cash_received = NULL,
        cash_change = NULL,
        updated_at = now()
    WHERE id = p_order_id;

    PERFORM public.finalize_paid_order(p_order_id, v_uid);
  END IF;

  BEGIN
    v_receipt_res  := public.enqueue_receipt_print(p_order_id, NULL, NULL);
    v_print_job_id := (v_receipt_res ->> 'job_id')::BIGINT;
  EXCEPTION WHEN OTHERS THEN
    v_print_failed := TRUE;
    v_print_error  := SQLERRM;
    RAISE NOTICE '[confirm_vietqr_payment] receipt print failed for order %: %',
      p_order_id, SQLERRM;
  END;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'idempotent', v_idempotent,
    'print', jsonb_build_object(
      'job_id', v_print_job_id,
      'failed', v_print_failed,
      'error',  v_print_error
    )
  );
END;
$$;
