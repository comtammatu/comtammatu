CREATE OR REPLACE FUNCTION public.print_template_interpolate(p_text text, p_payload jsonb) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_text TEXT := COALESCE(p_text, '');
BEGIN
  v_text := replace(v_text, '{{order_header}}', public.print_template_payload_text(p_payload, 'order_header'));
  v_text := replace(v_text, '{{order_number}}', public.print_template_payload_text(p_payload, 'order_number'));
  v_text := replace(v_text, '{{branch_name}}', public.print_template_payload_text(p_payload, 'branch_name'));
  v_text := replace(v_text, '{{branch_address}}', public.print_template_payload_text(p_payload, 'branch_address'));
  v_text := replace(v_text, '{{branch_phone}}', public.print_template_payload_text(p_payload, 'branch_phone'));
  v_text := replace(v_text, '{{cashier_name}}', public.print_template_payload_text(p_payload, 'cashier_name'));
  v_text := replace(v_text, '{{printed_at}}', public.print_template_payload_text(p_payload, 'printed_at'));
  v_text := replace(v_text, '{{printed_time}}', public.print_template_payload_text(p_payload, 'printed_time'));
  v_text := replace(v_text, '{{printed_datetime}}', public.print_template_payload_text(p_payload, 'printed_datetime'));
  v_text := replace(v_text, '{{created_datetime}}', public.print_template_payload_text(p_payload, 'created_datetime'));
  v_text := replace(v_text, '{{opened_datetime}}', public.print_template_payload_text(p_payload, 'opened_datetime'));
  v_text := replace(v_text, '{{closed_datetime}}', public.print_template_payload_text(p_payload, 'closed_datetime'));
  v_text := replace(v_text, '{{duration}}', public.print_template_payload_text(p_payload, 'duration'));
  v_text := replace(v_text, '{{total_amount}}', public.print_template_payload_text(p_payload, 'total_amount'));
  v_text := replace(v_text, '{{order_destination}}', public.print_template_payload_text(p_payload, 'order_destination'));
  v_text := replace(v_text, '{{kitchen_ticket_number}}', public.print_template_payload_text(p_payload, 'kitchen_ticket_number'));
  v_text := replace(v_text, '{{kitchen_ticket_number_raw}}', public.print_template_payload_text(p_payload, 'kitchen_ticket_number_raw'));
  v_text := replace(v_text, '{{source_order_number}}', public.print_template_payload_text(p_payload, 'source_order_number'));
  v_text := replace(v_text, '{{table_number}}', public.print_template_payload_text(p_payload, 'table_number'));
  v_text := replace(v_text, '{{send_seq}}', public.print_template_payload_text(p_payload, 'send_seq'));
  v_text := replace(v_text, '{{slot}}', public.print_template_payload_text(p_payload, 'slot'));
  v_text := replace(v_text, '{{reprint_seq}}', public.print_template_payload_text(p_payload, 'reprint_seq'));
  v_text := replace(v_text, '{{voided_by}}', public.print_template_payload_text(p_payload, 'voided_by'));
  v_text := replace(v_text, '{{reason}}', public.print_template_payload_text(p_payload, 'reason'));
  v_text := replace(v_text, '{{session_id}}', public.print_template_payload_text(p_payload, 'session_id'));
  v_text := replace(v_text, '{{note}}', public.print_template_payload_text(p_payload, 'note'));
  RETURN v_text;
END;
$$;

CREATE OR REPLACE FUNCTION public.print_template_default_content(p_kind text)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public'
AS $$
BEGIN
  CASE p_kind
    WHEN 'receipt' THEN
      RETURN jsonb_build_object(
        'blocks', jsonb_build_array(
          jsonb_build_object('type', 'row', 'left', 'MÁ TƯ', 'right', '{{branch_address}}', 'bold', true),
          jsonb_build_object('type', 'row', 'left', 'Thịt tươi 100%', 'right', ''),
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'text', 'text', 'HÓA ĐƠN THANH TOÁN', 'align', 'center', 'bold', true, 'double', true),
          jsonb_build_object('type', 'text', 'text', '{{order_header}}', 'align', 'center', 'bold', true, 'double', true),
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'billMeta'),
          jsonb_build_object('type', 'paymentMethod'),
          jsonb_build_object('type', 'itemsTable', 'group_by_category', true),
          jsonb_build_object('type', 'totals', 'always_show_adjustments', true),
          jsonb_build_object('type', 'cashChange'),
          jsonb_build_object('type', 'note', 'prefix', 'Ghi chú: '),
          jsonb_build_object('type', 'paymentQr', 'heading', 'QUÉT QR THANH TOÁN'),
          jsonb_build_object('type', 'footer', 'lines', jsonb_build_array('Thịt tươi 100%'))
        )
      );
    WHEN 'provisional_bill' THEN
      RETURN jsonb_build_object(
        'blocks', jsonb_build_array(
          jsonb_build_object('type', 'brandHeader', 'eyebrow', 'TIỆM CƠM TẤM', 'name', 'MÁ TƯ', 'tagline', 'Thịt tươi 100%'),
          jsonb_build_object('type', 'branchInfo'),
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'text', 'text', 'PHIẾU TẠM TÍNH', 'align', 'center', 'bold', true, 'double', true),
          jsonb_build_object('type', 'text', 'text', '{{order_header}}', 'align', 'center', 'bold', true, 'double', true),
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'billMeta'),
          jsonb_build_object('type', 'itemsTable'),
          jsonb_build_object('type', 'totals'),
          jsonb_build_object('type', 'note', 'prefix', 'Ghi chú: '),
          jsonb_build_object('type', 'paymentQr', 'heading', 'QUÉT QR THANH TOÁN'),
          jsonb_build_object('type', 'footer', 'lines', jsonb_build_array('Thịt tươi 100%'))
        )
      );
    WHEN 'kitchen_ticket' THEN
      RETURN jsonb_build_object(
        'blocks', jsonb_build_array(
          jsonb_build_object('type', 'text', 'text', '{{order_header}}', 'align', 'center', 'bold', true, 'double', true),
          jsonb_build_object('type', 'text', 'text', 'GỌI THÊM', 'align', 'center', 'bold', true, 'double', true, 'when_field', 'send_kind', 'when_equals', 'append'),
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'text', 'text', 'IN LẠI LẦN #{{reprint_seq}}', 'align', 'center', 'bold', true, 'double', true, 'when_field', 'reprint_seq', 'when_min', 2),
          jsonb_build_object('type', 'divider', 'char', '=', 'when_field', 'reprint_seq', 'when_min', 2),
          jsonb_build_object('type', 'row', 'left', 'Đơn: {{source_order_number}}', 'right', 'Lần gửi: {{send_seq}}'),
          jsonb_build_object('type', 'row', 'left', 'Phiếu bếp: {{kitchen_ticket_number_raw}}', 'right', 'Bếp: {{slot}}', 'when_field', 'kitchen_ticket_number_raw', 'when_not_empty', true),
          jsonb_build_object('type', 'row', 'left', 'Bàn: {{table_number}}', 'right', 'Giờ: {{printed_time}}', 'when_field', 'table_number', 'when_not_empty', true),
          jsonb_build_object('type', 'row', 'left', 'Giờ: {{printed_time}}', 'right', '', 'when_field', 'table_number', 'when_equals', ''),
          jsonb_build_object('type', 'text', 'text', 'Người order: {{cashier_name}}', 'when_field', 'cashier_name', 'when_not_empty', true),
          jsonb_build_object('type', 'kitchenItems'),
          jsonb_build_object('type', 'divider', 'char', '=', 'when_field', 'note', 'when_not_empty', true),
          jsonb_build_object('type', 'text', 'text', 'GHI CHÚ', 'align', 'center', 'bold', true, 'double', true, 'when_field', 'note', 'when_not_empty', true),
          jsonb_build_object('type', 'text', 'text', '{{note}}', 'align', 'center', 'bold', true, 'double', true, 'when_field', 'note', 'when_not_empty', true),
          jsonb_build_object('type', 'divider', 'char', '=', 'when_field', 'note', 'when_not_empty', true)
        )
      );
    WHEN 'cancel_ticket' THEN
      RETURN jsonb_build_object(
        'blocks', jsonb_build_array(
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'text', 'text', 'HỦY MÓN', 'align', 'center', 'bold', true, 'double', true, 'inverse', true),
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'text', 'text', '{{order_header}}', 'align', 'center', 'bold', true, 'double', true),
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'row', 'left', 'Bếp: {{slot}}', 'right', 'Giờ: {{printed_time}}'),
          jsonb_build_object('type', 'row', 'left', 'Bàn: {{table_number}}', 'right', '', 'when_field', 'table_number', 'when_not_empty', true),
          jsonb_build_object('type', 'text', 'text', 'Người hủy: {{voided_by}}', 'when_field', 'voided_by', 'when_not_empty', true),
          jsonb_build_object('type', 'cancelItems'),
          jsonb_build_object('type', 'divider', 'char', '=', 'when_field', 'reason', 'when_not_empty', true),
          jsonb_build_object('type', 'text', 'text', 'LÝ DO', 'align', 'center', 'bold', true, 'double', true, 'when_field', 'reason', 'when_not_empty', true),
          jsonb_build_object('type', 'text', 'text', '{{reason}}', 'align', 'center', 'when_field', 'reason', 'when_not_empty', true),
          jsonb_build_object('type', 'divider', 'char', '=', 'when_field', 'reason', 'when_not_empty', true)
        )
      );
    WHEN 'shift_close_report' THEN
      RETURN jsonb_build_object(
        'blocks', jsonb_build_array(
          jsonb_build_object('type', 'brandHeader', 'eyebrow', 'TIỆM CƠM TẤM', 'name', 'MÁ TƯ', 'tagline', 'Thịt tươi 100%'),
          jsonb_build_object('type', 'branchInfo'),
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'text', 'text', 'PHIẾU CHỐT CA', 'align', 'center', 'bold', true, 'double', true),
          jsonb_build_object('type', 'text', 'text', 'BIÊN BẢN BÀN GIAO TIỀN & DOANH THU', 'align', 'center', 'bold', true),
          jsonb_build_object('type', 'text', 'text', 'Mã ca: #{{session_id}}', 'align', 'center'),
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'row', 'left', 'Thu ngân:', 'right', '{{cashier_name}}', 'when_field', 'cashier_name', 'when_not_empty', true),
          jsonb_build_object('type', 'row', 'left', 'Mở ca:', 'right', '{{opened_datetime}}'),
          jsonb_build_object('type', 'row', 'left', 'Đóng ca:', 'right', '{{closed_datetime}}'),
          jsonb_build_object('type', 'row', 'left', 'Thời gian:', 'right', '{{duration}}', 'when_field', 'duration', 'when_not_empty', true),
          jsonb_build_object('type', 'shiftOrderSummary'),
          jsonb_build_object('type', 'shiftItemBreakdown'),
          jsonb_build_object('type', 'shiftCashReconciliation'),
          jsonb_build_object('type', 'paymentBreakdown'),
          jsonb_build_object('type', 'note', 'prefix', 'Ghi chú bàn giao: '),
          jsonb_build_object('type', 'shiftVarianceNotice'),
          jsonb_build_object('type', 'shiftSignature'),
          jsonb_build_object('type', 'spacer', 'lines', 1),
          jsonb_build_object('type', 'text', 'text', 'In lúc: {{printed_datetime}}', 'align', 'center'),
          jsonb_build_object('type', 'footer', 'lines', jsonb_build_array('Thịt tươi 100%'))
        )
      );
    ELSE
      RETURN jsonb_build_object('blocks', '[]'::jsonb);
  END CASE;
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
      'item_name',     oi.item_name,
      'variant_name',  oi.variant_name,
      'category_type', mc.type,
      'quantity',      oi.quantity,
      'unit_price',    oi.unit_price,
      'modifiers',     oi.modifiers,
      'sides',         oi.sides,
      'subtotal',      oi.subtotal,
      'note',          oi.note
    )
    ORDER BY oi.id
  )
  INTO v_items
  FROM public.order_items oi
  LEFT JOIN public.menu_items mi
    ON mi.id = oi.menu_item_id
   AND mi.tenant_id = oi.tenant_id
  LEFT JOIN public.menu_categories mc
    ON mc.id = mi.category_id
   AND mc.tenant_id = oi.tenant_id
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

WITH target AS (
  SELECT id, content
  FROM public.print_template_versions
  WHERE kind = 'receipt'
    AND is_active = true
    AND jsonb_typeof(content->'blocks') = 'array'
    AND content#>>'{blocks,0,type}' = 'brandHeader'
    AND content#>>'{blocks,1,type}' = 'branchInfo'
)
UPDATE public.print_template_versions pt
SET content = jsonb_set(
      t.content,
      '{blocks}',
      jsonb_build_array(
        jsonb_build_object('type', 'row', 'left', 'MÁ TƯ', 'right', '{{branch_address}}', 'bold', true),
        jsonb_build_object('type', 'row', 'left', 'Thịt tươi 100%', 'right', '')
      ) || (((t.content->'blocks') - 0) - 0)
    ),
    updated_at = now()
FROM target t
WHERE pt.id = t.id;

WITH target AS (
  SELECT
    pt.id,
    jsonb_agg(
      CASE
        WHEN block->>'type' = 'itemsTable'
          THEN block || jsonb_build_object('group_by_category', true)
        WHEN block->>'type' = 'totals'
          THEN block || jsonb_build_object('always_show_adjustments', true)
        ELSE block
      END
      ORDER BY ord
    ) AS blocks
  FROM public.print_template_versions pt
  CROSS JOIN LATERAL jsonb_array_elements(pt.content->'blocks') WITH ORDINALITY AS b(block, ord)
  WHERE pt.kind = 'receipt'
    AND pt.is_active = true
    AND jsonb_typeof(pt.content->'blocks') = 'array'
  GROUP BY pt.id
)
UPDATE public.print_template_versions pt
SET content = jsonb_set(pt.content, '{blocks}', target.blocks),
    updated_at = now()
FROM target
WHERE pt.id = target.id
  AND pt.content->'blocks' IS DISTINCT FROM target.blocks;
