-- ============================================================================
-- Data-driven print documents for print-agent
--
-- Keep the branch print-agent as a primitive ESC/POS renderer. Ticket/business
-- layouts are materialized in Postgres into schema_version=1 document blocks so
-- future template changes do not require updating every branch agent runtime.
-- Legacy payload/document wrappers are still understood for old snapshots.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.print_template_text_block(
  p_text TEXT,
  p_align TEXT DEFAULT NULL,
  p_bold BOOLEAN DEFAULT false,
  p_double BOOLEAN DEFAULT false,
  p_inverse BOOLEAN DEFAULT false,
  p_strikethrough BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'type', 'text',
    'text', COALESCE(p_text, ''),
    'align', p_align,
    'bold', COALESCE(p_bold, false),
    'double', COALESCE(p_double, false),
    'inverse', COALESCE(p_inverse, false),
    'strikethrough', COALESCE(p_strikethrough, false)
  );
$$;

CREATE OR REPLACE FUNCTION public.print_template_row_block(
  p_left TEXT,
  p_right TEXT DEFAULT '',
  p_bold BOOLEAN DEFAULT false,
  p_double BOOLEAN DEFAULT false,
  p_strikethrough BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'type', 'row',
    'left', COALESCE(p_left, ''),
    'right', COALESCE(p_right, ''),
    'bold', COALESCE(p_bold, false),
    'double', COALESCE(p_double, false),
    'strikethrough', COALESCE(p_strikethrough, false)
  );
$$;

CREATE OR REPLACE FUNCTION public.print_template_divider_block(
  p_char TEXT DEFAULT '-'
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'type', 'divider',
    'char', COALESCE(NULLIF(left(p_char, 1), ''), '-')
  );
$$;

CREATE OR REPLACE FUNCTION public.print_template_spacer_block(
  p_lines INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'type', 'spacer',
    'lines', GREATEST(1, LEAST(5, COALESCE(p_lines, 1)))
  );
$$;

CREATE OR REPLACE FUNCTION public.print_template_money(p_value NUMERIC)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT replace(to_char(round(COALESCE(p_value, 0)), 'FM999,999,999,999'), ',', '.') || 'đ';
$$;

CREATE OR REPLACE FUNCTION public.print_template_payload_number(
  p_payload JSONB,
  p_field TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_value JSONB;
BEGIN
  IF p_payload IS NULL OR p_field IS NULL OR p_field = '' THEN
    RETURN 0;
  END IF;

  v_value := p_payload -> p_field;
  IF v_value IS NULL OR v_value = 'null'::jsonb THEN
    RETURN 0;
  END IF;

  BEGIN
    RETURN COALESCE((v_value #>> '{}')::numeric, 0);
  EXCEPTION WHEN OTHERS THEN
    RETURN 0;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.print_template_hhmm(p_iso TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(p_iso, '') = '' THEN
    RETURN '';
  END IF;

  IF p_iso ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}' THEN
    RETURN substring(p_iso FROM 12 FOR 5);
  END IF;

  RETURN p_iso;
END;
$$;

CREATE OR REPLACE FUNCTION public.print_template_datetime(p_iso TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(p_iso, '') = '' THEN
    RETURN '';
  END IF;

  IF p_iso ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}' THEN
    RETURN substring(p_iso FROM 12 FOR 5)
      || ' '
      || substring(p_iso FROM 9 FOR 2)
      || '/'
      || substring(p_iso FROM 6 FOR 2)
      || '/'
      || substring(p_iso FROM 1 FOR 4);
  END IF;

  RETURN p_iso;
END;
$$;

CREATE OR REPLACE FUNCTION public.print_template_duration(
  p_opened_at TEXT,
  p_closed_at TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_minutes INT;
  v_hours INT;
  v_rest INT;
BEGIN
  IF COALESCE(p_opened_at, '') = '' OR COALESCE(p_closed_at, '') = '' THEN
    RETURN '';
  END IF;

  BEGIN
    v_minutes := round(
      EXTRACT(epoch FROM ((p_closed_at::timestamp) - (p_opened_at::timestamp))) / 60
    )::INT;
  EXCEPTION WHEN OTHERS THEN
    RETURN '';
  END;

  IF v_minutes <= 0 THEN
    RETURN '';
  END IF;

  v_hours := floor(v_minutes / 60);
  v_rest := v_minutes % 60;

  IF v_hours > 0 AND v_rest > 0 THEN
    RETURN v_hours::TEXT || ' giờ ' || v_rest::TEXT || ' phút';
  ELSIF v_hours > 0 THEN
    RETURN v_hours::TEXT || ' giờ';
  END IF;

  RETURN v_rest::TEXT || ' phút';
END;
$$;

CREATE OR REPLACE FUNCTION public.print_template_order_destination(p_payload JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_payload->>'order_type' = 'dine_in'
      THEN CASE
        WHEN NULLIF(p_payload->>'table_number', '') IS NOT NULL
          THEN 'BÀN ' || (p_payload->>'table_number')
        ELSE 'TẠI CHỖ'
      END
    ELSE 'MANG VỀ'
  END;
$$;

CREATE OR REPLACE FUNCTION public.print_template_diff_sign(p_value NUMERIC)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN COALESCE(p_value, 0) = 0 THEN 'OK'
    WHEN COALESCE(p_value, 0) > 0 THEN 'THỪA'
    ELSE 'THIẾU'
  END;
$$;

CREATE OR REPLACE FUNCTION public.print_template_payment_label(
  p_method TEXT,
  p_full BOOLEAN DEFAULT false
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE COALESCE(p_method, 'unknown')
    WHEN 'cash' THEN 'Tiền mặt'
    WHEN 'vietqr' THEN CASE WHEN p_full THEN 'Chuyển khoản (VietQR)' ELSE 'VietQR' END
    WHEN 'bank_transfer' THEN 'Chuyển khoản'
    WHEN 'momo' THEN 'MoMo'
    WHEN 'unknown' THEN 'Khác'
    ELSE p_method
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
    WHEN 'order_destination' THEN
      RETURN public.print_template_order_destination(p_payload);
    WHEN 'kitchen_ticket_number' THEN
      RETURN COALESCE(NULLIF(p_payload->>'kitchen_ticket_number', ''), p_payload->>'order_number', '');
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

CREATE OR REPLACE FUNCTION public.print_template_block_visible(
  p_block JSONB,
  p_payload JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_field TEXT := p_block->>'when_field';
  v_value TEXT;
  v_other_field TEXT := p_block->>'when_not_equals_field';
  v_numeric NUMERIC;
BEGIN
  IF v_field IS NULL OR v_field = '' THEN
    RETURN true;
  END IF;

  v_value := public.print_template_payload_text(p_payload, v_field);

  IF COALESCE((p_block->>'when_not_empty')::BOOLEAN, false)
     AND COALESCE(NULLIF(btrim(v_value), ''), '') = '' THEN
    RETURN false;
  END IF;

  IF p_block ? 'when_equals'
     AND v_value <> COALESCE(p_block->>'when_equals', '') THEN
    RETURN false;
  END IF;

  IF p_block ? 'when_not_equals'
     AND v_value = COALESCE(p_block->>'when_not_equals', '') THEN
    RETURN false;
  END IF;

  IF v_other_field IS NOT NULL
     AND v_other_field <> ''
     AND v_value = public.print_template_payload_text(p_payload, v_other_field) THEN
    RETURN false;
  END IF;

  IF p_block ? 'when_min' THEN
    BEGIN
      v_numeric := NULLIF(v_value, '')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RETURN false;
    END;
    IF v_numeric IS NULL OR v_numeric < (p_block->>'when_min')::numeric THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
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
  v_text := replace(v_text, '{{source_order_number}}', public.print_template_payload_text(p_payload, 'source_order_number'));
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

CREATE OR REPLACE FUNCTION public.print_template_kitchen_item_blocks(
  p_payload JSONB,
  p_strikethrough BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_out JSONB := '[]'::jsonb;
  v_item JSONB;
  v_modifier JSONB;
  v_side JSONB;
  v_idx INT := 0;
  v_qty NUMERIC;
  v_side_qty NUMERIC;
  v_side_name TEXT;
  v_border TEXT := '----+' || repeat('-', 43);
BEGIN
  v_out := v_out || jsonb_build_array(
    public.print_template_text_block(v_border),
    public.print_template_text_block(' SL | MÓN', NULL, true),
    public.print_template_text_block(v_border)
  );

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'items', '[]'::jsonb))
  LOOP
    v_idx := v_idx + 1;
    IF v_idx > 1 THEN
      v_out := v_out || jsonb_build_array(public.print_template_text_block(v_border));
    END IF;

    v_qty := COALESCE(NULLIF(v_item->>'quantity', '')::numeric, 0);
    v_out := v_out || jsonb_build_array(
      public.print_template_text_block(
        ' x' || trim(to_char(v_qty, 'FM999999')) || ' | ' || COALESCE(v_item->>'item_name', ''),
        NULL,
        true,
        true,
        false,
        p_strikethrough
      )
    );

    IF COALESCE(NULLIF(v_item->>'variant_name', ''), '') <> '' THEN
      v_out := v_out || jsonb_build_array(
        public.print_template_text_block(
          '    |   (' || (v_item->>'variant_name') || ')',
          NULL,
          false,
          false,
          false,
          p_strikethrough
        )
      );
    END IF;

    FOR v_modifier IN SELECT value FROM jsonb_array_elements(COALESCE(v_item->'modifiers', '[]'::jsonb))
    LOOP
      IF COALESCE(NULLIF(v_modifier->>'name', ''), '') <> '' THEN
        v_out := v_out || jsonb_build_array(
          public.print_template_text_block(
            '    |   + ' || (v_modifier->>'name'),
            NULL,
            false,
            false,
            false,
            p_strikethrough
          )
        );
      END IF;
    END LOOP;

    FOR v_side IN SELECT value FROM jsonb_array_elements(COALESCE(v_item->'sides', '[]'::jsonb))
    LOOP
      v_side_name := COALESCE(NULLIF(v_side->>'name', ''), v_side->>'side_item_name', '');
      IF v_side_name <> '' THEN
        v_side_qty := COALESCE(NULLIF(v_side->>'quantity', '')::numeric, 1) * v_qty;
        v_out := v_out || jsonb_build_array(
          public.print_template_text_block(
            '    |   - ' || v_side_name || CASE
              WHEN v_side_qty > 0 THEN ' x' || trim(to_char(v_side_qty, 'FM999999'))
              ELSE ''
            END,
            NULL,
            true,
            true,
            false,
            p_strikethrough
          )
        );
      END IF;
    END LOOP;

    IF COALESCE(NULLIF(v_item->>'note', ''), '') <> '' THEN
      v_out := v_out || jsonb_build_array(
        public.print_template_text_block(
          '    |   * ' || (v_item->>'note'),
          NULL,
          true,
          true,
          false,
          p_strikethrough
        )
      );
    END IF;
  END LOOP;

  v_out := v_out || jsonb_build_array(public.print_template_text_block(v_border));
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.print_template_shift_cash_blocks(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_opening NUMERIC := public.print_template_payload_number(p_payload, 'opening_cash');
  v_closing NUMERIC := public.print_template_payload_number(p_payload, 'closing_cash');
  v_expected NUMERIC := public.print_template_payload_number(p_payload, 'expected_cash');
  v_difference NUMERIC := public.print_template_payload_number(p_payload, 'cash_difference');
  v_collected NUMERIC := greatest(0, v_expected - v_opening);
BEGIN
  RETURN jsonb_build_array(
    public.print_template_divider_block('-'),
    public.print_template_text_block('ĐỐI SOÁT KÉT TIỀN MẶT', 'center', true),
    public.print_template_divider_block('-'),
    public.print_template_row_block('Tiền mặt đầu ca', public.print_template_money(v_opening)),
    public.print_template_row_block('+ Tiền mặt bán hàng', public.print_template_money(v_collected)),
    public.print_template_row_block('= Tiền mặt phải nộp', public.print_template_money(v_expected)),
    public.print_template_row_block('Tiền mặt thực đếm', public.print_template_money(v_closing)),
    public.print_template_row_block(
      'Lệch két (' || public.print_template_diff_sign(v_difference) || ')',
      public.print_template_money(v_difference),
      true
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.print_template_payment_breakdown_blocks(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_out JSONB := '[]'::jsonb;
  v_row JSONB;
BEGIN
  IF COALESCE(jsonb_array_length(COALESCE(p_payload->'payment_breakdown', '[]'::jsonb)), 0) = 0 THEN
    RETURN v_out;
  END IF;

  v_out := v_out || jsonb_build_array(
    public.print_template_divider_block('-'),
    public.print_template_text_block('CƠ CẤU ĐÃ THU', 'center', true),
    public.print_template_divider_block('-')
  );

  FOR v_row IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'payment_breakdown', '[]'::jsonb))
  LOOP
    v_out := v_out || jsonb_build_array(
      public.print_template_row_block(
        public.print_template_payment_label(v_row->>'method', true)
          || ' (' || COALESCE(v_row->>'count', '0') || ' đơn)',
        public.print_template_money(COALESCE(NULLIF(v_row->>'amount', '')::numeric, 0))
      )
    );
  END LOOP;

  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.print_template_shift_summary_blocks(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_out JSONB := '[]'::jsonb;
  v_paid NUMERIC := public.print_template_payload_number(p_payload, 'paid_order_count');
  v_unpaid NUMERIC := public.print_template_payload_number(p_payload, 'unpaid_order_count');
  v_cancelled NUMERIC := public.print_template_payload_number(p_payload, 'cancelled_order_count');
  v_revenue NUMERIC := public.print_template_payload_number(p_payload, 'total_revenue');
BEGIN
  v_out := v_out || jsonb_build_array(
    public.print_template_divider_block('='),
    public.print_template_text_block('TỔNG KẾT CA', 'center', true),
    public.print_template_divider_block('-'),
    public.print_template_row_block(
      'TỔNG ĐÃ THU',
      public.print_template_money(v_revenue),
      true,
      true
    ),
    public.print_template_row_block(
      'Đơn đã thu tiền',
      trim(to_char(v_paid, 'FM999999')) || ' đơn'
    )
  );

  IF v_unpaid > 0 THEN
    v_out := v_out || jsonb_build_array(
      public.print_template_row_block(
        'Đơn chưa thu/chuyển ca',
        trim(to_char(v_unpaid, 'FM999999')) || ' đơn'
      )
    );
  END IF;

  IF v_cancelled > 0 THEN
    v_out := v_out || jsonb_build_array(
      public.print_template_row_block(
        'Đơn đã hủy',
        trim(to_char(v_cancelled, 'FM999999')) || ' đơn'
      )
    );
  END IF;

  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.print_template_shift_item_breakdown_blocks(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_out JSONB := '[]'::jsonb;
  v_items JSONB := CASE
    WHEN jsonb_typeof(p_payload->'item_breakdown') = 'array' THEN p_payload->'item_breakdown'
    ELSE '[]'::jsonb
  END;
  v_row JSONB;
  v_name TEXT;
  v_source TEXT;
  v_prefix TEXT;
  v_qty NUMERIC;
  v_total NUMERIC := 0;
BEGIN
  IF jsonb_array_length(v_items) = 0 THEN
    RETURN v_out;
  END IF;

  SELECT COALESCE(SUM(COALESCE(NULLIF(value->>'qty', '')::numeric, 0)), 0)
  INTO v_total
  FROM jsonb_array_elements(v_items);

  v_out := v_out || jsonb_build_array(
    public.print_template_divider_block('-'),
    public.print_template_text_block('SỐ LƯỢNG BÁN THEO MÓN', 'center', true),
    public.print_template_row_block('Tổng SL bán', trim(to_char(v_total, 'FM999999'))),
    public.print_template_divider_block('-')
  );

  FOR v_row IN
    SELECT value
    FROM jsonb_array_elements(v_items)
  LOOP
    v_name := COALESCE(NULLIF(v_row->>'name', ''), 'Món');
    v_source := COALESCE(NULLIF(v_row->>'source', ''), 'main');
    v_prefix := CASE v_source
      WHEN 'side' THEN '- '
      WHEN 'modifier' THEN '+ '
      ELSE ''
    END;
    v_qty := COALESCE(NULLIF(v_row->>'qty', '')::numeric, 0);

    v_out := v_out || jsonb_build_array(
      public.print_template_text_block(
        'x' || trim(to_char(v_qty, 'FM999999')) || ' ' || v_prefix || v_name
      )
    );
  END LOOP;

  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.print_template_shift_variance_notice_blocks(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_note TEXT := COALESCE(NULLIF(btrim(p_payload->>'variance_note'), ''), '');
  v_expected NUMERIC := public.print_template_payload_number(p_payload, 'expected_cash');
  v_difference NUMERIC := public.print_template_payload_number(p_payload, 'cash_difference');
  v_threshold NUMERIC := GREATEST(50000::NUMERIC, ROUND(v_expected * 0.005, 2));
  v_breached BOOLEAN := ABS(v_difference) > v_threshold;
  v_out JSONB := '[]'::jsonb;
BEGIN
  IF NOT v_breached AND v_note = '' THEN
    RETURN v_out;
  END IF;

  v_out := v_out || jsonb_build_array(
    public.print_template_divider_block('='),
    public.print_template_text_block('LƯU Ý LỆCH KÉT', 'center', true),
    public.print_template_row_block('Ngưỡng cảnh báo', public.print_template_money(v_threshold))
  );

  IF v_breached THEN
    v_out := v_out || jsonb_build_array(
      public.print_template_row_block('Trạng thái', 'Cần quản lý hậu kiểm', true)
    );
  END IF;

  IF COALESCE(NULLIF(p_payload->>'variance_approver', ''), '') <> '' THEN
    v_out := v_out || jsonb_build_array(
      public.print_template_row_block('Người ghi nhận', p_payload->>'variance_approver')
    );
  END IF;

  IF v_note <> '' THEN
    v_out := v_out || jsonb_build_array(
      public.print_template_text_block('Ghi chú lệch két:'),
      public.print_template_text_block('  ' || v_note)
    );
  END IF;

  v_out := v_out || jsonb_build_array(public.print_template_divider_block('='));

  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.print_template_variance_approval_blocks(p_payload JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT public.print_template_shift_variance_notice_blocks(p_payload);
$$;

CREATE OR REPLACE FUNCTION public.print_template_shift_signature_blocks()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_array(
    public.print_template_divider_block('='),
    public.print_template_text_block('KÝ NHẬN BÀN GIAO', 'center', true),
    public.print_template_row_block('Thu ngân bàn giao', 'Quản lý nhận'),
    public.print_template_spacer_block(2),
    public.print_template_row_block('.................', '.................')
  );
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
          jsonb_build_object('type', 'text', 'text', '{{order_destination}} · {{kitchen_ticket_number}}', 'align', 'center', 'bold', true, 'double', true),
          jsonb_build_object('type', 'text', 'text', 'GỌI THÊM', 'align', 'center', 'bold', true, 'double', true, 'when_field', 'send_kind', 'when_equals', 'append'),
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'text', 'text', 'IN LẠI LẦN #{{reprint_seq}}', 'align', 'center', 'bold', true, 'double', true, 'when_field', 'reprint_seq', 'when_min', 2),
          jsonb_build_object('type', 'divider', 'char', '=', 'when_field', 'reprint_seq', 'when_min', 2),
          jsonb_build_object('type', 'row', 'left', 'Phiếu: {{kitchen_ticket_number}}', 'right', 'Lần gửi: {{send_seq}}'),
          jsonb_build_object('type', 'row', 'left', 'HĐ: {{source_order_number}}', 'right', '', 'when_field', 'source_order_number', 'when_not_equals_field', 'kitchen_ticket_number'),
          jsonb_build_object('type', 'row', 'left', 'Bếp: {{slot}}', 'right', 'Giờ: {{printed_time}}'),
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
          jsonb_build_object('type', 'text', 'text', '{{order_destination}} · {{order_number}}', 'align', 'center', 'bold', true, 'double', true),
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'row', 'left', 'Bếp: {{slot}}', 'right', 'Giờ: {{printed_time}}'),
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

CREATE OR REPLACE FUNCTION public.materialize_print_document(
  p_kind TEXT,
  p_payload JSONB,
  p_template_id BIGINT,
  p_template_version INT,
  p_paper_width_mm INT,
  p_font_profile TEXT,
  p_content JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_blocks JSONB;
  v_block JSONB;
  v_render_block JSONB;
  v_type TEXT;
  v_left TEXT;
  v_right TEXT;
  v_out JSONB := '[]'::jsonb;
BEGIN
  v_blocks := p_content->'blocks';
  IF v_blocks IS NULL
     OR jsonb_typeof(v_blocks) <> 'array'
     OR COALESCE(jsonb_array_length(v_blocks), 0) = 0 THEN
    v_blocks := public.print_template_default_content(p_kind)->'blocks';
  END IF;

  FOR v_block IN SELECT value FROM jsonb_array_elements(v_blocks)
  LOOP
    v_type := v_block->>'type';
    IF v_type IS NULL THEN
      CONTINUE;
    END IF;

    IF NOT public.print_template_block_visible(v_block, p_payload) THEN
      CONTINUE;
    END IF;

    v_render_block := v_block
      - 'when_field'
      - 'when_equals'
      - 'when_not_equals'
      - 'when_not_equals_field'
      - 'when_not_empty'
      - 'when_min';

    CASE v_type
      WHEN 'text' THEN
        v_out := v_out || jsonb_build_array(
          jsonb_set(
            v_render_block,
            '{text}',
            to_jsonb(public.print_template_interpolate(v_block->>'text', p_payload)),
            true
          )
        );
      WHEN 'row' THEN
        v_left := public.print_template_interpolate(v_block->>'left', p_payload);
        v_right := public.print_template_interpolate(v_block->>'right', p_payload);
        v_out := v_out || jsonb_build_array(
          jsonb_set(
            jsonb_set(v_render_block, '{left}', to_jsonb(v_left), true),
            '{right}',
            to_jsonb(v_right),
            true
          )
        );
      WHEN 'branchInfo' THEN
        v_out := v_out || jsonb_build_array(
          v_render_block || jsonb_build_object(
            'branch_name', COALESCE(p_payload->>'branch_name', ''),
            'branch_address', COALESCE(p_payload->>'branch_address', ''),
            'branch_phone', COALESCE(p_payload->>'branch_phone', ''),
            'branch_tax_code', COALESCE(p_payload->>'branch_tax_code', '')
          )
        );
      WHEN 'billMeta' THEN
        v_out := v_out || jsonb_build_array(
          v_render_block || jsonb_build_object(
            'order_number', COALESCE(p_payload->>'order_number', ''),
            'order_type', COALESCE(p_payload->>'order_type', ''),
            'table_number', p_payload->'table_number',
            'cashier_name', COALESCE(p_payload->>'cashier_name', ''),
            'created_at', COALESCE(p_payload->>'created_at', '')
          )
        );
      WHEN 'paymentMethod' THEN
        IF COALESCE(p_payload->>'payment_method', '') = '' THEN
          CONTINUE;
        END IF;
        v_out := v_out || jsonb_build_array(
          v_render_block || jsonb_build_object('method', p_payload->>'payment_method')
        );
      WHEN 'itemsTable' THEN
        v_out := v_out || jsonb_build_array(
          v_render_block || jsonb_build_object('items', COALESCE(p_payload->'items', '[]'::jsonb))
        );
      WHEN 'totals' THEN
        v_out := v_out || jsonb_build_array(
          v_render_block || jsonb_build_object(
            'subtotal', p_payload->'subtotal',
            'tax_amount', p_payload->'tax_amount',
            'service_charge', p_payload->'service_charge',
            'discount_amount', p_payload->'discount_amount',
            'total_amount', p_payload->'total_amount'
          )
        );
      WHEN 'cashChange' THEN
        IF NOT (p_payload ? 'cash_received' OR p_payload ? 'cash_change') THEN
          CONTINUE;
        END IF;
        v_out := v_out || jsonb_build_array(
          v_render_block || jsonb_build_object(
            'cash_received', p_payload->'cash_received',
            'cash_change', p_payload->'cash_change',
            'total_amount', p_payload->'total_amount'
          )
        );
      WHEN 'note' THEN
        IF COALESCE(NULLIF(trim(p_payload->>'note'), ''), '') = '' THEN
          CONTINUE;
        END IF;
        v_out := v_out || jsonb_build_array(
          v_render_block || jsonb_build_object('text', p_payload->>'note')
        );
      WHEN 'paymentQr' THEN
        IF jsonb_typeof(p_payload->'payment_qr') <> 'object'
           OR COALESCE(p_payload#>>'{payment_qr,content}', '') = '' THEN
          CONTINUE;
        END IF;
        v_out := v_out || jsonb_build_array(
          v_render_block || jsonb_build_object('qr', p_payload->'payment_qr')
        );
      WHEN 'kitchenItems' THEN
        v_out := v_out || public.print_template_kitchen_item_blocks(p_payload, false);
      WHEN 'cancelItems' THEN
        v_out := v_out || public.print_template_kitchen_item_blocks(p_payload, true);
      WHEN 'shiftCashReconciliation' THEN
        v_out := v_out || public.print_template_shift_cash_blocks(p_payload);
      WHEN 'paymentBreakdown' THEN
        v_out := v_out || public.print_template_payment_breakdown_blocks(p_payload);
      WHEN 'shiftOrderSummary' THEN
        v_out := v_out || public.print_template_shift_summary_blocks(p_payload);
      WHEN 'shiftItemBreakdown' THEN
        v_out := v_out || public.print_template_shift_item_breakdown_blocks(p_payload);
      WHEN 'shiftVarianceNotice' THEN
        v_out := v_out || public.print_template_shift_variance_notice_blocks(p_payload);
      WHEN 'shiftSignature' THEN
        v_out := v_out || public.print_template_shift_signature_blocks();
      WHEN 'varianceApproval' THEN
        v_out := v_out || public.print_template_variance_approval_blocks(p_payload);
      WHEN 'kitchenTicket' THEN
        v_out := v_out || (
          public.materialize_print_document(
            'kitchen_ticket',
            p_payload,
            p_template_id,
            p_template_version,
            p_paper_width_mm,
            p_font_profile,
            public.print_template_default_content('kitchen_ticket')
          )->'blocks'
        );
      WHEN 'cancelTicket' THEN
        v_out := v_out || (
          public.materialize_print_document(
            'cancel_ticket',
            p_payload,
            p_template_id,
            p_template_version,
            p_paper_width_mm,
            p_font_profile,
            public.print_template_default_content('cancel_ticket')
          )->'blocks'
        );
      WHEN 'shiftCloseReport' THEN
        v_out := v_out || (
          public.materialize_print_document(
            'shift_close_report',
            p_payload,
            p_template_id,
            p_template_version,
            p_paper_width_mm,
            p_font_profile,
            public.print_template_default_content('shift_close_report')
          )->'blocks'
        );
      ELSE
        v_out := v_out || jsonb_build_array(v_render_block);
    END CASE;
  END LOOP;

  IF jsonb_array_length(v_out) = 0 THEN
    v_out := jsonb_build_array(
      jsonb_build_object('type', 'text', 'text', COALESCE(p_payload->>'kind', p_kind))
    );
  END IF;

  RETURN jsonb_build_object(
    'schema_version', 1,
    'template_id', COALESCE(p_template_id, 0),
    'template_version', COALESCE(p_template_version, 1),
    'paper_width_mm', COALESCE(p_paper_width_mm, 80),
    'font_profile', COALESCE(p_font_profile, 'thermal_vietnamese'),
    'blocks', v_out
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_shift_close_print(
  p_session_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid                 UUID;
  v_session             RECORD;
  v_branch              RECORD;
  v_cashier_name        TEXT;
  v_approver_name       TEXT;
  v_branch_tax          TEXT;
  v_printer_id          BIGINT;
  v_breakdown           JSONB;
  v_total_revenue       NUMERIC(15,2);
  v_item_breakdown      JSONB;
  v_total_item_quantity INT;
  v_payload             JSONB;
  v_idempotency         TEXT;
  v_job_id              BIGINT;
  v_now                 TIMESTAMPTZ := now();
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT id, tenant_id, branch_id, status, opening_cash, closing_cash,
         expected_cash, cash_difference, opened_at, closed_at, closed_by,
         note, variance_approval_note, variance_approver_user_id
  INTO v_session
  FROM public.pos_sessions
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_session.status <> 'closed' THEN
    RAISE EXCEPTION 'session not closed yet' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_permission_any('pos:close_shift') THEN
    RAISE EXCEPTION 'permission denied: pos:close_shift' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_branch FROM public.branches WHERE id = v_session.branch_id;

  SELECT full_name INTO v_cashier_name
  FROM public.profiles WHERE id = v_session.closed_by;

  IF v_session.variance_approver_user_id IS NOT NULL THEN
    SELECT full_name INTO v_approver_name
    FROM public.profiles WHERE id = v_session.variance_approver_user_id;
  END IF;

  SELECT value INTO v_branch_tax
  FROM public.system_settings
  WHERE tenant_id = v_session.tenant_id AND key = 'branch_tax_code';

  v_printer_id := public.resolve_branch_printer_for_type(
    v_session.tenant_id,
    v_session.branch_id,
    'shift_close_report'
  );

  IF v_printer_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_printer');
  END IF;

  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'method',  payment_method,
      'count',   cnt,
      'amount',  amount
    ) ORDER BY payment_method), '[]'::jsonb),
    COALESCE(SUM(amount), 0)
  INTO v_breakdown, v_total_revenue
  FROM (
    SELECT
      COALESCE(payment_method, 'unknown') AS payment_method,
      COUNT(*) AS cnt,
      SUM(total_amount) AS amount
    FROM public.orders
    WHERE pos_session_id = p_session_id
      AND tenant_id = v_session.tenant_id
      AND payment_status = 'paid'
      AND status <> 'cancelled'
    GROUP BY payment_method
  ) AS grp;

  WITH paid_items AS (
    SELECT
      oi.item_name,
      oi.quantity,
      oi.unit_price,
      CASE
        WHEN jsonb_typeof(oi.modifiers) = 'array' THEN oi.modifiers
        ELSE '[]'::jsonb
      END AS modifiers,
      CASE
        WHEN jsonb_typeof(oi.sides) = 'array' THEN oi.sides
        ELSE '[]'::jsonb
      END AS sides
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.pos_session_id = p_session_id
      AND o.tenant_id = v_session.tenant_id
      AND o.payment_status = 'paid'
      AND o.status <> 'cancelled'
      AND oi.status <> 'cancelled'
  ),
  item_unit_prices AS (
    SELECT
      pi.item_name,
      pi.quantity,
      pi.unit_price,
      pi.modifiers,
      pi.sides,
      COALESCE((
        SELECT SUM(COALESCE(NULLIF(m->>'price', '')::numeric, 0))
        FROM jsonb_array_elements(pi.modifiers) AS m
      ), 0) AS modifier_unit_sum,
      COALESCE((
        SELECT SUM(
          COALESCE(NULLIF(s->>'price', '')::numeric, 0)
          * COALESCE(NULLIF(s->>'quantity', '')::numeric, 1)
        )
        FROM jsonb_array_elements(pi.sides) AS s
      ), 0) AS side_unit_sum
    FROM paid_items pi
  ),
  main_agg AS (
    SELECT
      item_name AS name,
      'main'::TEXT AS source,
      COALESCE(SUM(COALESCE(quantity, 0)), 0)::INT AS qty,
      COALESCE(SUM(GREATEST(0, COALESCE(unit_price, 0) - modifier_unit_sum - side_unit_sum) * COALESCE(quantity, 0)), 0) AS revenue,
      1 AS source_order
    FROM item_unit_prices
    GROUP BY item_name
  ),
  side_agg AS (
    SELECT
      COALESCE(NULLIF(s->>'name', ''), NULLIF(s->>'side_item_name', ''), 'Side')::TEXT AS name,
      'side'::TEXT AS source,
      COALESCE(SUM(COALESCE(NULLIF(s->>'quantity', '')::numeric, 1) * COALESCE(pi.quantity, 0)), 0)::INT AS qty,
      COALESCE(SUM(
        COALESCE(NULLIF(s->>'price', '')::numeric, 0)
        * COALESCE(NULLIF(s->>'quantity', '')::numeric, 1)
        * COALESCE(pi.quantity, 0)
      ), 0) AS revenue,
      2 AS source_order
    FROM item_unit_prices pi
    CROSS JOIN LATERAL jsonb_array_elements(pi.sides) AS s
    GROUP BY COALESCE(NULLIF(s->>'name', ''), NULLIF(s->>'side_item_name', ''), 'Side')
  ),
  mod_agg AS (
    SELECT
      COALESCE(NULLIF(m->>'name', ''), 'Modifier')::TEXT AS name,
      'modifier'::TEXT AS source,
      COALESCE(SUM(COALESCE(pi.quantity, 0)), 0)::INT AS qty,
      COALESCE(SUM(COALESCE(NULLIF(m->>'price', '')::numeric, 0) * COALESCE(pi.quantity, 0)), 0) AS revenue,
      3 AS source_order
    FROM item_unit_prices pi
    CROSS JOIN LATERAL jsonb_array_elements(pi.modifiers) AS m
    GROUP BY COALESCE(NULLIF(m->>'name', ''), 'Modifier')
  ),
  all_items AS (
    SELECT name, source, qty, revenue, source_order FROM main_agg
    UNION ALL
    SELECT name, source, qty, revenue, source_order FROM side_agg
    UNION ALL
    SELECT name, source, qty, revenue, source_order FROM mod_agg
  )
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'name', name,
        'source', source,
        'qty', qty,
        'revenue', revenue
      )
      ORDER BY source_order, qty DESC, name
    ), '[]'::jsonb),
    COALESCE(SUM(qty), 0)::INT
  INTO v_item_breakdown, v_total_item_quantity
  FROM all_items;

  v_payload := jsonb_build_object(
    'kind',                  'shift_close_report',
    'branch_name',           COALESCE(v_branch.name, ''),
    'branch_address',        COALESCE(v_branch.address, ''),
    'branch_phone',          COALESCE(v_branch.phone, ''),
    'branch_tax_code',       COALESCE(v_branch_tax, ''),
    'session_id',            p_session_id,
    'cashier_name',          COALESCE(v_cashier_name, ''),
    'opened_at',             to_char(v_session.opened_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                     'YYYY-MM-DD"T"HH24:MI:SS'),
    'closed_at',             to_char(v_session.closed_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                     'YYYY-MM-DD"T"HH24:MI:SS'),
    'opening_cash',          v_session.opening_cash,
    'closing_cash',          v_session.closing_cash,
    'expected_cash',         v_session.expected_cash,
    'cash_difference',       v_session.cash_difference,
    'note',                  v_session.note,
    'variance_note',         v_session.variance_approval_note,
    'variance_approver',     v_approver_name,
    'paid_order_count',      (
      SELECT COUNT(*) FROM public.orders
       WHERE pos_session_id = p_session_id
         AND tenant_id = v_session.tenant_id
         AND payment_status = 'paid'
         AND status <> 'cancelled'
    ),
    'unpaid_order_count',    (
      SELECT COUNT(*) FROM public.orders
       WHERE pos_session_id = p_session_id
         AND tenant_id = v_session.tenant_id
         AND payment_status <> 'paid'
         AND status <> 'cancelled'
    ),
    'cancelled_order_count', (
      SELECT COUNT(*) FROM public.orders
       WHERE pos_session_id = p_session_id
         AND tenant_id = v_session.tenant_id
         AND status = 'cancelled'
    ),
    'payment_breakdown',     v_breakdown,
    'total_revenue',         v_total_revenue,
    'total_item_quantity',   COALESCE(v_total_item_quantity, 0),
    'item_breakdown',        COALESCE(v_item_breakdown, '[]'::jsonb),
    'printed_at',            to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                     'YYYY-MM-DD"T"HH24:MI:SS')
  );

  v_idempotency := 'session:' || p_session_id::TEXT || ':shift_close';

  INSERT INTO public.print_jobs (
    tenant_id, branch_id, printer_id, job_type,
    order_id, payload, idempotency_key, created_by
  ) VALUES (
    v_session.tenant_id, v_session.branch_id, v_printer_id, 'shift_close_report',
    NULL, v_payload, v_idempotency, v_uid
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET
    payload = EXCLUDED.payload,
    status  = CASE WHEN public.print_jobs.status IN ('failed', 'expired')
                   THEN 'pending' ELSE public.print_jobs.status END,
    last_error = NULL,
    claimed_by_agent = NULL,
    claimed_at = NULL
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'job_id',     v_job_id,
    'printer_id', v_printer_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_shift_close_print(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_shift_close_print(BIGINT) TO authenticated;

UPDATE public.print_template_versions
SET content = public.print_template_default_content(kind),
    updated_at = now()
WHERE kind IN ('kitchen_ticket', 'cancel_ticket', 'shift_close_report')
  AND (
    content = jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object('type', 'kitchenTicket')))
    OR content = jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object('type', 'cancelTicket')))
    OR content = jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object('type', 'shiftCloseReport')))
  );

COMMENT ON FUNCTION public.materialize_print_document(TEXT, JSONB, BIGINT, INT, INT, TEXT, JSONB) IS
  'Materialize active print templates into primitive schema_version=1 document blocks. New ticket layouts should be changed in print_template_versions, not in branch print-agent deployments.';

REVOKE ALL ON FUNCTION public.print_template_text_block(TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_template_row_block(TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_template_divider_block(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_template_spacer_block(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_template_money(NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_template_payload_number(JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_template_hhmm(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_template_datetime(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_template_duration(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_template_order_destination(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_template_diff_sign(NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_template_payment_label(TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_template_payload_text(JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_template_block_visible(JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_template_kitchen_item_blocks(JSONB, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_template_shift_cash_blocks(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_template_payment_breakdown_blocks(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_template_shift_summary_blocks(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_template_shift_item_breakdown_blocks(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_template_shift_variance_notice_blocks(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_template_variance_approval_blocks(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_template_shift_signature_blocks() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_template_default_content(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_template_interpolate(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.materialize_print_document(TEXT, JSONB, BIGINT, INT, INT, TEXT, JSONB) FROM PUBLIC;
