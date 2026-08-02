BEGIN;

CREATE OR REPLACE FUNCTION public.enqueue_receipt_print(
  p_order_id bigint,
  p_cash_received numeric DEFAULT NULL::numeric,
  p_cash_change numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid;
  v_is_service boolean := (auth.role() = 'service_role');
  v_actor uuid;
  v_order public.orders%ROWTYPE;
  v_branch public.branches%ROWTYPE;
  v_latest_job public.print_jobs%ROWTYPE;
  v_table_no int;
  v_printer_id bigint;
  v_cashier_name text;
  v_branch_tax text;
  v_qr_type text;
  v_vietqr_bank text;
  v_vietqr_acc text;
  v_vietqr_name text;
  v_payment_ref text;
  v_qr_content text;
  v_payment_qr jsonb;
  v_items jsonb;
  v_payload jsonb;
  v_idempotency text;
  v_reprinted_from_id bigint := NULL;
  v_job_id bigint;
  v_now timestamptz := now();
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

  SELECT *
  INTO v_latest_job
  FROM public.print_jobs
  WHERE tenant_id = v_order.tenant_id
    AND order_id = p_order_id
    AND job_type = 'receipt'
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_latest_job.status IN ('pending', 'processing') THEN
      RETURN jsonb_build_object(
        'order_id', p_order_id,
        'job_id', v_latest_job.id,
        'printer_id', v_latest_job.printer_id
      );
    END IF;

    IF v_is_service AND v_latest_job.status IN ('failed', 'expired') THEN
      UPDATE public.print_jobs
      SET status = 'pending',
          last_error = NULL,
          claimed_by_agent = NULL,
          claimed_at = NULL
      WHERE id = v_latest_job.id
      RETURNING id INTO v_job_id;

      RETURN jsonb_build_object(
        'order_id', p_order_id,
        'job_id', v_job_id,
        'printer_id', v_latest_job.printer_id
      );
    END IF;

    IF v_is_service THEN
      RETURN jsonb_build_object(
        'order_id', p_order_id,
        'job_id', v_latest_job.id,
        'printer_id', v_latest_job.printer_id
      );
    END IF;

    v_reprinted_from_id := v_latest_job.id;
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
        cash_change = p_cash_change
    WHERE id = p_order_id;
  END IF;

  IF v_reprinted_from_id IS NULL THEN
    SELECT provider_ref INTO v_payment_ref
    FROM public.payments
    WHERE order_id = p_order_id
      AND tenant_id = v_order.tenant_id
      AND status <> 'failed'
      AND provider_ref ~* ('^(' || public.vietqr_payment_code_prefix()
        || ' [A-Z0-9]{12}|VQRLOAMB20260626100157757 [A-Z0-9]{12}|VQRLOAMB[0-9]{17}|DH[A-Z0-9]{3,12})$')
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
          'type', 'vietqr',
          'content', v_qr_content,
          'header_label', upper(COALESCE(v_vietqr_bank, ''))
            || ' (BIN ' || public.print_vietqr_bank_bin(v_vietqr_bank) || ')',
          'account_no', v_vietqr_acc,
          'account_name', v_vietqr_name,
          'amount', v_order.total_amount,
          'description', v_payment_ref
        );
      END IF;
    END IF;

    v_items := public.bill_line_items(p_order_id);

    v_payload := jsonb_build_object(
      'kind', 'receipt',
      'branch_name', COALESCE(v_branch.name, ''),
      'branch_address', COALESCE(v_branch.address, ''),
      'branch_phone', COALESCE(v_branch.phone, ''),
      'branch_tax_code', COALESCE(v_branch_tax, ''),
      'order_number', v_order.order_number,
      'order_type', v_order.order_type,
      'table_number', v_table_no,
      'cashier_name', COALESCE(v_cashier_name, ''),
      'note', v_order.note,
      'items', COALESCE(v_items, '[]'::jsonb),
      'subtotal', v_order.subtotal,
      'tax_amount', v_order.tax_amount,
      'service_charge', v_order.service_charge,
      'discount_amount', v_order.discount_amount,
      'total_amount', v_order.total_amount,
      'payment_method', v_order.payment_method,
      'payment_qr', v_payment_qr,
      'cash_received', p_cash_received,
      'cash_change', p_cash_change,
      'created_at', to_char(v_order.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD"T"HH24:MI:SS'),
      'printed_at', to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD"T"HH24:MI:SS')
    );
  ELSE
    v_payload := v_latest_job.payload;
  END IF;

  v_idempotency := CASE
    WHEN v_reprinted_from_id IS NULL THEN 'order:' || p_order_id::text || ':receipt'
    ELSE 'order:' || p_order_id::text || ':receipt:reprint:' || v_reprinted_from_id::text
  END;

  INSERT INTO public.print_jobs (
    tenant_id,
    branch_id,
    printer_id,
    job_type,
    order_id,
    payload,
    idempotency_key,
    reprinted_from_id,
    created_by
  )
  VALUES (
    v_order.tenant_id,
    v_order.branch_id,
    v_printer_id,
    'receipt',
    p_order_id,
    v_payload,
    v_idempotency,
    v_reprinted_from_id,
    v_actor
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_job_id;

  IF v_job_id IS NULL THEN
    SELECT id INTO v_job_id
    FROM public.print_jobs
    WHERE idempotency_key = v_idempotency;
  END IF;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'job_id', v_job_id,
    'printer_id', v_printer_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.scope_receipt_reprint_idempotency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF NEW.job_type = 'receipt' AND NEW.reprinted_from_id IS NOT NULL THEN
    NEW.idempotency_key := 'order:' || NEW.order_id::text
      || ':receipt:reprint:' || NEW.reprinted_from_id::text;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.scope_receipt_reprint_idempotency()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_01_receipt_reprint_idempotency
  ON public.print_jobs;

-- Same-event triggers run by name; scope the key after receipt canonicalization.
CREATE TRIGGER trg_01_receipt_reprint_idempotency
BEFORE INSERT
ON public.print_jobs
FOR EACH ROW
EXECUTE FUNCTION private.scope_receipt_reprint_idempotency();

COMMIT;
