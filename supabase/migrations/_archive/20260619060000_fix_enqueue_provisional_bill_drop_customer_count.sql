-- enqueue_provisional_bill still referenced v_order.customer_count after
-- 20260616100000 dropped orders.customer_count (that migration recreated the
-- final-bill builder but missed this one), so every POS provisional-bill print
-- failed at runtime with `record "v_order" has no field "customer_count"`.
-- Recreate the function verbatim minus the customer_count payload key. No
-- renderer/TS change needed — nothing reads customer_count from the payload.

CREATE OR REPLACE FUNCTION public.enqueue_provisional_bill(p_order_id bigint, p_qr_content text DEFAULT NULL::text, p_qr_header_label text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid          UUID;
  v_order        public.orders%ROWTYPE;
  v_branch       public.branches%ROWTYPE;
  v_table_no     INT;
  v_printer_id   BIGINT;
  v_cashier_name TEXT;
  v_branch_tax   TEXT;
  v_qr_type      TEXT;
  v_flag_enabled TEXT;
  v_vietqr_bank  TEXT;
  v_vietqr_acc   TEXT;
  v_vietqr_name  TEXT;
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

  IF NOT public.has_permission_any('pos:print') THEN
    RAISE EXCEPTION 'permission denied: pos:print' USING ERRCODE = '42501';
  END IF;

  SELECT value INTO v_flag_enabled
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'pos_provisional_bill_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RAISE EXCEPTION 'provisional bill printing is disabled' USING ERRCODE = 'P0001';
  END IF;

  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'order already paid; cannot print provisional bill' USING ERRCODE = 'P0001';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'order is cancelled; cannot print provisional bill' USING ERRCODE = 'P0001';
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
    'provisional_bill'
  );

  IF v_printer_id IS NULL THEN
    RAISE EXCEPTION 'no active receipt printer for branch %', v_order.branch_id
      USING ERRCODE = 'P0002';
  END IF;

  IF p_qr_content IS NOT NULL AND length(trim(p_qr_content)) > 0 THEN
    SELECT value INTO v_qr_type
    FROM public.system_settings
    WHERE tenant_id = v_order.tenant_id AND key = 'payment_qr_type';
    v_qr_type := COALESCE(v_qr_type, 'vietqr');

    IF v_qr_type = 'vietqr' THEN
      SELECT value INTO v_vietqr_bank FROM public.system_settings
       WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_bank_code';
      SELECT value INTO v_vietqr_acc FROM public.system_settings
       WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_account_no';
      SELECT value INTO v_vietqr_name FROM public.system_settings
       WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_account_name';
    END IF;

    v_payment_qr := jsonb_build_object(
      'type',          v_qr_type,
      'content',       p_qr_content,
      'header_label',  COALESCE(p_qr_header_label, UPPER(v_qr_type)),
      'account_no',    v_vietqr_acc,
      'account_name',  v_vietqr_name,
      'amount',        v_order.total_amount,
      'description',   'DH ' || v_order.order_number
    );
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
    'kind',             'provisional_bill',
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
    'payment_qr',       v_payment_qr,
    'created_at',       to_char(v_order.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                'YYYY-MM-DD"T"HH24:MI:SS'),
    'printed_at',       to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                'YYYY-MM-DD"T"HH24:MI:SS')
  );

  v_idempotency := 'order:' || p_order_id::TEXT
    || ':provisional:' || extract(epoch from v_now)::BIGINT::TEXT;

  INSERT INTO public.print_jobs (
    tenant_id, branch_id, printer_id, job_type,
    order_id, payload, idempotency_key, created_by
  )
  VALUES (
    v_order.tenant_id, v_order.branch_id, v_printer_id, 'provisional_bill',
    p_order_id, v_payload, v_idempotency, v_uid
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET payload = EXCLUDED.payload
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'order_id',   p_order_id,
    'job_id',     v_job_id,
    'printer_id', v_printer_id,
    'qr_type',    v_qr_type
  );
END;
$function$;
