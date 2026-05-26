-- ============================================================================
-- Print slips: clarify order-facing header codes
--
-- Header display is derived from order_number/source_order_number:
--   TC-260525-087-PH -> Tại chỗ #087
--   MV-260525-088-PH -> Mang về #088
--
-- kitchen_ticket_number/PB remains a kitchen-batch metadata value, not the
-- primary header identifier.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.print_template_order_header(p_payload JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_order_number TEXT := btrim(
    COALESCE(
      NULLIF(p_payload->>'source_order_number', ''),
      NULLIF(p_payload->>'order_number', ''),
      ''
    )
  );
  v_clean_order_number TEXT;
  v_order_type TEXT := COALESCE(p_payload->>'order_type', '');
  v_prefix TEXT;
  v_label TEXT;
  v_match TEXT[];
  v_sequence TEXT;
BEGIN
  v_clean_order_number := regexp_replace(v_order_number, '^#+', '');
  v_prefix := upper(split_part(v_clean_order_number, '-', 1));

  v_label := CASE
    WHEN v_prefix = 'TC' OR v_order_type = 'dine_in' THEN 'Tại chỗ'
    WHEN v_prefix = 'MV' OR v_order_type = 'takeaway' THEN 'Mang về'
    ELSE 'Đơn'
  END;

  v_match := regexp_match(
    v_clean_order_number,
    '^(?:TC|MV)-(?:(?:[0-9]{6}|[0-9]{8})-)?([0-9]{1,4})(?:-.+)?$',
    'i'
  );
  IF v_match IS NOT NULL THEN
    v_sequence := v_match[1];
  END IF;

  IF COALESCE(v_sequence, '') <> '' THEN
    RETURN v_label || ' #' || v_sequence;
  END IF;

  IF v_clean_order_number <> '' THEN
    RETURN v_label || ' ' || v_clean_order_number;
  END IF;

  RETURN v_label;
END;
$$;

CREATE OR REPLACE FUNCTION public.print_template_payload_text(
  p_payload JSONB,
  p_field TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_value JSONB;
BEGIN
  IF p_payload IS NULL OR p_field IS NULL OR p_field = '' THEN
    RETURN '';
  END IF;

  CASE p_field
    WHEN 'order_header' THEN
      RETURN public.print_template_order_header(p_payload);
    WHEN 'order_destination' THEN
      RETURN public.print_template_order_destination(p_payload);
    WHEN 'kitchen_ticket_number' THEN
      RETURN COALESCE(NULLIF(p_payload->>'kitchen_ticket_number', ''), p_payload->>'order_number', '');
    WHEN 'kitchen_ticket_number_raw' THEN
      RETURN COALESCE(NULLIF(p_payload->>'kitchen_ticket_number', ''), '');
    WHEN 'source_order_number' THEN
      RETURN COALESCE(NULLIF(p_payload->>'source_order_number', ''), p_payload->>'order_number', '');
    WHEN 'printed_time' THEN
      RETURN public.print_template_hhmm(p_payload->>'printed_at');
    WHEN 'printed_datetime' THEN
      RETURN public.print_template_datetime(p_payload->>'printed_at');
    WHEN 'created_datetime' THEN
      RETURN public.print_template_datetime(p_payload->>'created_at');
    WHEN 'opened_datetime' THEN
      RETURN public.print_template_datetime(p_payload->>'opened_at');
    WHEN 'closed_datetime' THEN
      RETURN public.print_template_datetime(p_payload->>'closed_at');
    WHEN 'duration' THEN
      RETURN public.print_template_duration(p_payload->>'opened_at', p_payload->>'closed_at');
    WHEN 'payment_method_label' THEN
      RETURN public.print_template_payment_label(p_payload->>'payment_method', false);
    WHEN 'cash_difference_sign' THEN
      RETURN public.print_template_diff_sign(public.print_template_payload_number(p_payload, 'cash_difference'));
    ELSE
      v_value := p_payload -> p_field;
      IF v_value IS NULL OR v_value = 'null'::jsonb THEN
        RETURN '';
      END IF;
      RETURN COALESCE(v_value #>> '{}', '');
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.print_template_interpolate(
  p_text TEXT,
  p_payload JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_text TEXT := COALESCE(p_text, '');
BEGIN
  v_text := replace(v_text, '{{order_header}}', public.print_template_payload_text(p_payload, 'order_header'));
  v_text := replace(v_text, '{{order_number}}', public.print_template_payload_text(p_payload, 'order_number'));
  v_text := replace(v_text, '{{branch_name}}', public.print_template_payload_text(p_payload, 'branch_name'));
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

CREATE OR REPLACE FUNCTION public.print_template_default_content(p_kind TEXT)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
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

UPDATE public.print_template_versions
SET content = public.print_template_default_content(kind),
    updated_at = now()
WHERE tenant_id IS NULL
  AND branch_id IS NULL
  AND is_active = TRUE
  AND kind IN ('receipt', 'provisional_bill', 'kitchen_ticket', 'cancel_ticket');

REVOKE ALL ON FUNCTION public.print_template_order_header(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_template_payload_text(JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_template_interpolate(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_template_default_content(TEXT) FROM PUBLIC;
