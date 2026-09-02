-- Paid VietQR receipts must carry a transfer QR so POS can reprint after
-- cash→VietQR conversion. Cash receipts stay QR-free.
-- HDDT buyer-QR triggers used to strip payment_qr from every receipt.

CREATE OR REPLACE FUNCTION public.enqueue_receipt_print(
  p_order_id bigint,
  p_cash_received numeric DEFAULT NULL::numeric,
  p_cash_change numeric DEFAULT NULL::numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $_$
DECLARE
  v_uid          UUID;
  v_is_service   BOOLEAN := (auth.role() = 'service_role');
  v_actor        UUID;
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
  v_tax_breakdowns JSONB;
  v_payload      JSONB;
  v_idempotency  TEXT;
  v_job_id       BIGINT;
  v_now          TIMESTAMPTZ := now();
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_is_service THEN
    IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
      RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
    END IF;

    IF NOT (
      public.has_permission(v_order.branch_id, 'pos:print')
      OR public.has_permission(v_order.branch_id, 'pos:reprint_receipt')
    ) THEN
      RAISE EXCEPTION 'permission denied: pos:print' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_actor := COALESCE(v_uid, v_order.created_by);

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

  IF v_order.payment_method = 'vietqr' THEN
    SELECT provider_ref INTO v_payment_ref
    FROM public.payments
    WHERE order_id = p_order_id
      AND tenant_id = v_order.tenant_id
      AND method = 'vietqr'
      AND status = 'completed'
      AND provider_ref ~* ('^(' || public.vietqr_payment_code_prefix()
            || ' [A-Z0-9]{12}|VQRLOAMB20260626100157757 [A-Z0-9]{12}|VQRLOAMB[0-9]{17}|DH[A-Z0-9]{3,12})$')
    ORDER BY id DESC
    LIMIT 1;
  END IF;

  SELECT value INTO v_qr_type
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'payment_qr_type';
  v_qr_type := COALESCE(v_qr_type, 'vietqr');

  IF v_qr_type = 'vietqr' AND v_payment_ref IS NOT NULL THEN
    SELECT NULLIF(btrim(value), '') INTO v_vietqr_bank
    FROM public.system_settings
    WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_bank_code';
    SELECT NULLIF(btrim(value), '') INTO v_vietqr_acc
    FROM public.system_settings
    WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_account_no';
    SELECT NULLIF(btrim(value), '') INTO v_vietqr_name
    FROM public.system_settings
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

  v_items := public.bill_line_items(p_order_id);
  v_tax_breakdowns := public.bill_tax_breakdowns(p_order_id);

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
    'tax_breakdowns',   COALESCE(v_tax_breakdowns, '[]'::jsonb),
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
    p_order_id, v_payload, v_idempotency, v_actor
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET
    payload    = EXCLUDED.payload,
    printer_id = EXCLUDED.printer_id,
    status = CASE
               WHEN public.print_jobs.status IN ('failed','expired')
               THEN 'pending'
               WHEN public.print_jobs.status = 'printed' AND NOT v_is_service
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
$_$;

COMMENT ON FUNCTION public.enqueue_receipt_print(bigint, numeric, numeric) IS
  'Enqueue a customer receipt. Paid VietQR receipts include a transfer QR; cash receipts do not.';

REVOKE ALL ON FUNCTION public.enqueue_receipt_print(bigint, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_receipt_print(bigint, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_receipt_print(bigint, numeric, numeric) TO service_role;

CREATE OR REPLACE FUNCTION private.attach_invoice_buyer_qr_to_print_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_path text;
  v_raw_token text;
  v_token_hash text;
  v_stored_token_hash text;
  v_paid_at timestamptz;
  v_expires_at timestamptz;
  v_request_status text;
BEGIN
  IF NEW.job_type <> 'receipt' OR NEW.order_id IS NULL OR NEW.payload IS NULL THEN
    RETURN NEW;
  END IF;

  -- Keep VietQR transfer QR on paid VietQR receipts. Cash leftovers stay off.
  IF NEW.payload->>'payment_method' IS DISTINCT FROM 'vietqr' THEN
    NEW.payload := NEW.payload - 'payment_qr';
  END IF;
  NEW.payload := NEW.payload - 'invoice_qr';

  SELECT payment.paid_at
  INTO v_paid_at
  FROM public.payments payment
  WHERE payment.tenant_id = NEW.tenant_id
    AND payment.branch_id = NEW.branch_id
    AND payment.order_id = NEW.order_id
    AND payment.status = 'completed'
    AND payment.paid_at IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.tax_invoice_issue_jobs job
        JOIN public.tax_invoices invoice
          ON invoice.id = job.tax_invoice_id
         AND invoice.tenant_id = job.tenant_id
         AND invoice.order_id = job.order_id
        WHERE job.tenant_id = NEW.tenant_id
          AND job.branch_id = NEW.branch_id
          AND job.order_id = NEW.order_id
          AND job.tax_invoice_id IS NOT NULL
          AND job.status = 'queued'
          AND invoice.status = 'draft'
          AND invoice.invoice_number IS NULL
          AND job.payment_id = payment.id
      )
      OR EXISTS (
        SELECT 1
        FROM public.tax_invoices invoice
        WHERE invoice.tenant_id = NEW.tenant_id
          AND invoice.branch_id = NEW.branch_id
          AND invoice.order_id = NEW.order_id
          AND invoice.status = 'not_required'
      )
    )
  ORDER BY payment.paid_at DESC
  LIMIT 1;
  IF v_paid_at IS NULL THEN
    RETURN NEW;
  END IF;
  v_expires_at := v_paid_at + interval '2 hours';

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'invoice-buyer:' || NEW.tenant_id::text || ':' || NEW.order_id::text,
      0
    )
  );

  IF TG_OP = 'UPDATE' THEN
    v_path := OLD.payload #>> '{invoice_qr,content}';
  END IF;
  v_path := COALESCE(v_path, NEW.payload #>> '{invoice_qr,content}');

  IF v_path IS NULL THEN
    SELECT job.payload #>> '{invoice_qr,content}'
    INTO v_path
    FROM public.print_jobs job
    WHERE job.tenant_id = NEW.tenant_id
      AND job.order_id = NEW.order_id
      AND job.job_type = 'receipt'
      AND COALESCE(job.payload #>> '{invoice_qr,content}', '') <> ''
    ORDER BY job.created_at
    LIMIT 1;
  END IF;

  v_raw_token := substring(
    COALESCE(v_path, '')
    FROM '^/q/invoice/([a-f0-9]{48})$'
  );
  IF v_raw_token IS NULL THEN
    v_raw_token := encode(extensions.gen_random_bytes(24), 'hex');
    v_path := '/q/invoice/' || v_raw_token;
  END IF;
  v_token_hash := encode(
    extensions.digest(convert_to(v_raw_token, 'UTF8'), 'sha256'),
    'hex'
  );

  INSERT INTO public.tax_invoice_buyer_requests (
    tenant_id,
    branch_id,
    order_id,
    token_hash,
    expires_at
  ) VALUES (
    NEW.tenant_id,
    NEW.branch_id,
    NEW.order_id,
    v_token_hash,
    v_expires_at
  )
  ON CONFLICT (tenant_id, order_id) DO NOTHING;

  SELECT request.token_hash, request.expires_at, request.status
  INTO v_stored_token_hash, v_expires_at, v_request_status
  FROM public.tax_invoice_buyer_requests request
  WHERE request.tenant_id = NEW.tenant_id
    AND request.order_id = NEW.order_id;

  IF v_stored_token_hash IS DISTINCT FROM v_token_hash
    OR v_request_status <> 'open'
    OR v_expires_at <= now() THEN
    RETURN NEW;
  END IF;

  NEW.payload := jsonb_set(
    NEW.payload,
    '{invoice_qr}',
    jsonb_build_object(
      'type', 'invoice',
      'content', v_path,
      'header_label', 'NHẬN HĐĐT'
    ),
    true
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.attach_invoice_buyer_qr_to_print_job()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.attach_invoice_buyer_qr_document_to_print_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_blocks jsonb;
  v_footer_blocks jsonb;
  v_keep_payment_qr boolean;
BEGIN
  IF NEW.job_type <> 'receipt'
    OR COALESCE(jsonb_typeof(NEW.payload #> '{document,blocks}'), '') <> 'array'
  THEN
    RETURN NEW;
  END IF;

  v_keep_payment_qr :=
    NEW.payload->>'payment_method' = 'vietqr'
    AND COALESCE(NEW.payload #>> '{payment_qr,content}', '') <> '';

  SELECT
    COALESCE(
      jsonb_agg(entry.block ORDER BY entry.ordinal)
        FILTER (WHERE entry.block->>'type' = 'footer'),
      '[]'::jsonb
    ),
    COALESCE(
      jsonb_agg(entry.block ORDER BY entry.ordinal)
        FILTER (
          WHERE entry.block->>'type' IS DISTINCT FROM 'invoiceQr'
            AND entry.block->>'type' IS DISTINCT FROM 'footer'
            AND (
              entry.block->>'type' IS DISTINCT FROM 'paymentQr'
              OR v_keep_payment_qr
            )
        ),
      '[]'::jsonb
    )
  INTO v_footer_blocks, v_blocks
  FROM jsonb_array_elements(NEW.payload #> '{document,blocks}')
    WITH ORDINALITY AS entry(block, ordinal);

  IF v_keep_payment_qr
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_blocks) block
      WHERE block->>'type' = 'paymentQr'
    )
  THEN
    v_blocks := v_blocks || jsonb_build_array(jsonb_build_object(
      'type', 'paymentQr',
      'heading', 'QUÉT QR THANH TOÁN',
      'qr', NEW.payload->'payment_qr'
    ));
  END IF;

  IF COALESCE(NEW.payload #>> '{invoice_qr,content}', '') <> ''
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_blocks) block
      WHERE block->>'type' = 'invoiceQr'
    )
  THEN
    v_blocks := v_blocks || jsonb_build_array(jsonb_build_object(
      'type', 'invoiceQr',
      'heading', 'QUÉT QR XUẤT HĐĐT',
      'qr', NEW.payload->'invoice_qr'
    ));
  END IF;

  v_blocks := v_blocks || v_footer_blocks;

  NEW.payload := jsonb_set(
    NEW.payload,
    '{document,blocks}',
    v_blocks
  );
  RETURN NEW;
END;
$$;

REVOKE ALL
  ON FUNCTION private.attach_invoice_buyer_qr_document_to_print_job()
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
