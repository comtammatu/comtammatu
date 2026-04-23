-- =============================================================
-- Enrich receipt print payload with branch info + cashier + timing
-- + payment + totals breakdown so the print-agent can render a
-- full-featured invoice layout (branch header, table meta grid,
-- line-item totals, VAT/discount, payment method).
-- =============================================================

CREATE OR REPLACE FUNCTION public.enqueue_receipt_print(p_order_id bigint)
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
    public.has_permission_any('pos:print')
    OR public.has_permission_any('pos:reprint_receipt')
  ) THEN
    RAISE EXCEPTION 'permission denied: pos:print' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_branch FROM public.branches WHERE id = v_order.branch_id;

  IF v_order.table_id IS NOT NULL THEN
    SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
  END IF;

  SELECT full_name INTO v_cashier_name
  FROM public.profiles WHERE id = v_order.created_by;

  SELECT id INTO v_printer_id
  FROM public.printers
  WHERE branch_id = v_order.branch_id
    AND tenant_id = v_order.tenant_id
    AND role = 'receipt'
    AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no active receipt printer for branch %', v_order.branch_id
      USING ERRCODE = 'P0002';
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
  WHERE oi.order_id = p_order_id;

  v_payload := jsonb_build_object(
    'kind',            'receipt',
    'branch_name',     COALESCE(v_branch.name, ''),
    'branch_address',  COALESCE(v_branch.address, ''),
    'branch_phone',    COALESCE(v_branch.phone, ''),
    'order_number',    v_order.order_number,
    'order_type',      v_order.order_type,
    'table_number',    v_table_no,
    'customer_count',  v_order.customer_count,
    'cashier_name',    COALESCE(v_cashier_name, ''),
    'note',            v_order.note,
    'items',           v_items,
    'subtotal',        v_order.subtotal,
    'tax_amount',      v_order.tax_amount,
    'service_charge',  v_order.service_charge,
    'discount_amount', v_order.discount_amount,
    'total_amount',    v_order.total_amount,
    'payment_method',  v_order.payment_method,
    'payment_status',  v_order.payment_status,
    'created_at',      to_char(v_order.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
                               'YYYY-MM-DD"T"HH24:MI:SS'),
    'printed_at',      to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                               'YYYY-MM-DD"T"HH24:MI:SS')
  );

  v_idempotency := 'order:' || p_order_id::TEXT
    || ':receipt:' || extract(epoch from v_now)::BIGINT::TEXT;

  INSERT INTO public.print_jobs (
    tenant_id, branch_id, printer_id, job_type,
    order_id, payload, idempotency_key, created_by
  )
  VALUES (
    v_order.tenant_id, v_order.branch_id, v_printer_id, 'receipt',
    p_order_id, v_payload, v_idempotency, v_uid
  )
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'order_id',   p_order_id,
    'job_id',     v_job_id,
    'printer_id', v_printer_id
  );
END;
$function$;
