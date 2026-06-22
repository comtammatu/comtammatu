-- Receipt prints carry the same VietQR payment block as provisional bills.
-- EMV content is built server-side so every enqueue path (confirm_cash_payment,
-- confirm_vietqr_payment, web reprint) gets the QR without signature changes.

-- NAPAS BIN lookup. MIRRORS BANK_BINS in
-- packages/shared/src/providers/impl/vietqr.ts — keep both in sync.
CREATE OR REPLACE FUNCTION public.print_vietqr_bank_bin(p_bank_code text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE upper(COALESCE(p_bank_code, ''))
    WHEN 'VIETCOMBANK' THEN '970436'
    WHEN 'VCB' THEN '970436'
    WHEN 'VIETINBANK' THEN '970415'
    WHEN 'CTG' THEN '970415'
    WHEN 'BIDV' THEN '970418'
    WHEN 'AGRIBANK' THEN '970405'
    WHEN 'AGR' THEN '970405'
    WHEN 'TECHCOMBANK' THEN '970407'
    WHEN 'TCB' THEN '970407'
    WHEN 'MBBANK' THEN '970422'
    WHEN 'MB' THEN '970422'
    WHEN 'TPBANK' THEN '970423'
    WHEN 'TPB' THEN '970423'
    WHEN 'ACB' THEN '970416'
    WHEN 'VPBANK' THEN '970432'
    WHEN 'VPB' THEN '970432'
    WHEN 'SACOMBANK' THEN '970403'
    WHEN 'STB' THEN '970403'
    WHEN 'HDBANK' THEN '970437'
    WHEN 'HDB' THEN '970437'
    WHEN 'SHBANK' THEN '970443'
    WHEN 'SHB' THEN '970443'
    WHEN 'OCEANBANK' THEN '970414'
    WHEN 'EXIMBANK' THEN '970431'
    WHEN 'EIB' THEN '970431'
    WHEN 'MSBANK' THEN '970426'
    WHEN 'MSB' THEN '970426'
    WHEN 'NAMABANK' THEN '970428'
    WHEN 'NAB' THEN '970428'
    WHEN 'BAOVIETBANK' THEN '970438'
    WHEN 'BVB' THEN '970438'
    WHEN 'PVCOMBANK' THEN '970412'
    WHEN 'PVB' THEN '970412'
    WHEN 'VIETABANK' THEN '970427'
    WHEN 'VAB' THEN '970427'
    WHEN 'ABBANK' THEN '970423'
    WHEN 'ABB' THEN '970423'
    WHEN 'LIENVIETPOSTBANK' THEN '970449'
    WHEN 'LPB' THEN '970449'
    WHEN 'KIENLONGBANK' THEN '970452'
    WHEN 'KLB' THEN '970452'
    WHEN 'SAIGONBANK' THEN '970400'
    WHEN 'SGB' THEN '970400'
    ELSE upper(COALESCE(p_bank_code, ''))
  END;
$$;

REVOKE ALL ON FUNCTION public.print_vietqr_bank_bin(text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.print_vietqr_bank_bin(text) TO service_role;

-- ASCII sanitizer for EMV fields: strip Vietnamese diacritics, drop other
-- non [0-9A-Za-z ] characters, collapse whitespace, truncate. Banking apps
-- truncate or reject memos with combining marks.
CREATE OR REPLACE FUNCTION public.print_vietqr_ascii(p_value text, p_max integer)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT left(
    btrim(
      regexp_replace(
        regexp_replace(
          translate(
            COALESCE(p_value, ''),
            'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ',
            repeat('a', 17) || repeat('e', 11) || repeat('i', 5)
              || repeat('o', 17) || repeat('u', 11) || repeat('y', 5) || 'd'
              || repeat('A', 17) || repeat('E', 11) || repeat('I', 5)
              || repeat('O', 17) || repeat('U', 11) || repeat('Y', 5) || 'D'
          ),
          '[^0-9A-Za-z ]', ' ', 'g'
        ),
        '\s+', ' ', 'g'
      )
    ),
    p_max
  );
$$;

REVOKE ALL ON FUNCTION public.print_vietqr_ascii(text, integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.print_vietqr_ascii(text, integer) TO service_role;

-- CRC-16/CCITT-FALSE over an ASCII payload (EMVCo tag 63).
CREATE OR REPLACE FUNCTION public.print_vietqr_crc16(p_input text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_crc INT := 65535;
  v_i INT;
  v_j INT;
BEGIN
  FOR v_i IN 1..length(COALESCE(p_input, '')) LOOP
    v_crc := (v_crc # ((ascii(substring(p_input FROM v_i FOR 1)) << 8) & 65535)) & 65535;
    FOR v_j IN 1..8 LOOP
      IF (v_crc & 32768) <> 0 THEN
        v_crc := ((v_crc << 1) # 4129) & 65535;
      ELSE
        v_crc := (v_crc << 1) & 65535;
      END IF;
    END LOOP;
  END LOOP;
  RETURN lpad(upper(to_hex(v_crc)), 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.print_vietqr_crc16(text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.print_vietqr_crc16(text) TO service_role;

-- VietQR EMVCo payload (NAPAS QRIBFTTA). MIRRORS buildVietQrEmvco in
-- packages/shared/src/providers/impl/vietqr.ts — keep TLV layout and CRC
-- output identical so printed and on-screen QRs scan to the same transfer.
CREATE OR REPLACE FUNCTION public.print_vietqr_emvco(
  p_bank_code text,
  p_account_no text,
  p_account_name text,
  p_amount numeric,
  p_description text
)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_bin TEXT;
  v_amount TEXT;
  v_description TEXT;
  v_merchant_name TEXT;
  v_beneficiary TEXT;
  v_merchant_account_info TEXT;
  v_additional TEXT := '';
  v_payload TEXT;
BEGIN
  IF COALESCE(p_bank_code, '') = ''
     OR COALESCE(p_account_no, '') = ''
     OR COALESCE(p_amount, 0) <= 0 THEN
    RETURN NULL;
  END IF;

  v_bin := public.print_vietqr_bank_bin(p_bank_code);
  v_amount := trim(to_char(round(p_amount), 'FM9999999999999999'));
  v_description := public.print_vietqr_ascii(p_description, 25);
  v_merchant_name := COALESCE(
    NULLIF(public.print_vietqr_ascii(p_account_name, 25), ''),
    'MERCHANT'
  );

  v_beneficiary :=
    '00' || lpad(length(v_bin)::text, 2, '0') || v_bin
    || '01' || lpad(length(p_account_no)::text, 2, '0') || p_account_no;
  v_merchant_account_info :=
    '0010A000000727'
    || '01' || lpad(length(v_beneficiary)::text, 2, '0') || v_beneficiary
    || '0208QRIBFTTA';

  IF v_description <> '' THEN
    v_additional := '08' || lpad(length(v_description)::text, 2, '0') || v_description;
  END IF;

  v_payload :=
    '000201'
    || '010212'
    || '38' || lpad(length(v_merchant_account_info)::text, 2, '0') || v_merchant_account_info
    || '5303704'
    || '54' || lpad(length(v_amount)::text, 2, '0') || v_amount
    || '5802VN'
    || '59' || lpad(length(v_merchant_name)::text, 2, '0') || v_merchant_name
    || '6007VIETNAM'
    || CASE WHEN v_additional <> ''
         THEN '62' || lpad(length(v_additional)::text, 2, '0') || v_additional
         ELSE ''
       END;

  v_payload := v_payload || '6304';
  RETURN v_payload || public.print_vietqr_crc16(v_payload);
END;
$$;

REVOKE ALL ON FUNCTION public.print_vietqr_emvco(text, text, text, numeric, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.print_vietqr_emvco(text, text, text, numeric, text) TO service_role;

COMMENT ON FUNCTION public.print_vietqr_emvco(text, text, text, numeric, text) IS
  'VietQR EMVCo payload for thermal printing. Mirrors buildVietQrEmvco in packages/shared/src/providers/impl/vietqr.ts; keep outputs identical.';

-- enqueue_receipt_print: attach payment_qr (same block as enqueue_provisional_bill)
-- so receipts print a scannable transfer QR. Signature unchanged.
CREATE OR REPLACE FUNCTION public.enqueue_receipt_print(
  p_order_id bigint,
  p_cash_received numeric DEFAULT NULL::numeric,
  p_cash_change numeric DEFAULT NULL::numeric
)
RETURNS jsonb
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

  IF v_qr_type = 'vietqr' THEN
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
        'DH ' || v_order.order_number
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
        'description',  'DH ' || v_order.order_number
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
    'customer_count',   v_order.customer_count,
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

-- Receipt default template gains the paymentQr block (between note and footer),
-- matching provisional_bill. materialize_print_document skips the block when
-- the payload carries no payment_qr content.
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
          jsonb_build_object('type', 'brandHeader', 'eyebrow', 'TIỆM CƠM TẤM', 'name', 'MÁ TƯ', 'tagline', 'Thịt tươi 100%'),
          jsonb_build_object('type', 'branchInfo'),
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'text', 'text', 'HÓA ĐƠN THANH TOÁN', 'align', 'center', 'bold', true, 'double', true),
          jsonb_build_object('type', 'text', 'text', '{{order_header}}', 'align', 'center', 'bold', true, 'double', true),
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'billMeta'),
          jsonb_build_object('type', 'paymentMethod'),
          jsonb_build_object('type', 'itemsTable'),
          jsonb_build_object('type', 'totals'),
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

-- Backfill the paymentQr block into active receipt template rows that
-- predate it (inserted before the footer block). Idempotent.
WITH target AS (
  SELECT
    pt.id,
    pt.content,
    (
      SELECT min(t.ord) - 1
      FROM jsonb_array_elements(pt.content->'blocks') WITH ORDINALITY AS t(blk, ord)
      WHERE t.blk->>'type' = 'footer'
    ) AS footer_idx
  FROM public.print_template_versions pt
  WHERE pt.kind = 'receipt'
    AND pt.is_active = true
    AND jsonb_typeof(pt.content->'blocks') = 'array'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(pt.content->'blocks') AS b(blk)
      WHERE b.blk->>'type' = 'paymentQr'
    )
)
UPDATE public.print_template_versions pt
SET content = jsonb_set(
      t.content,
      '{blocks}',
      CASE
        WHEN t.footer_idx IS NULL THEN
          (t.content->'blocks')
            || jsonb_build_array(jsonb_build_object('type', 'paymentQr', 'heading', 'QUÉT QR THANH TOÁN'))
        ELSE
          jsonb_insert(
            t.content->'blocks',
            ARRAY[t.footer_idx::text],
            jsonb_build_object('type', 'paymentQr', 'heading', 'QUÉT QR THANH TOÁN')
          )
      END
    ),
    updated_at = now()
FROM target t
WHERE pt.id = t.id;
