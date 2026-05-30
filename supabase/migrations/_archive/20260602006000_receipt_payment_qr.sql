-- ============================================================================
-- Receipt payment QR
--
-- Problem: `PHIẾU TẠM TÍNH` templates already include `paymentQr`, but
-- `HÓA ĐƠN THANH TOÁN` receipts do not. For operators, the payment receipt
-- should carry the same native VietQR scan payload when the tenant has bank
-- settings configured.
--
-- This keeps existing RPC signatures stable. New receipt print jobs receive
-- `payload.payment_qr.content` as native EMVCo data, so the existing print
-- document `paymentQr` renderer can print a scannable QR with no hosted-link
-- fallback.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.print_vietqr_bank_bin(p_bank_code TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
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

CREATE OR REPLACE FUNCTION public.print_vietqr_tlv(p_tag TEXT, p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(p_tag, '')
    || lpad(octet_length(COALESCE(p_value, ''))::TEXT, 2, '0')
    || COALESCE(p_value, '');
$$;

CREATE OR REPLACE FUNCTION public.print_vietqr_sanitize_ascii(
  p_value TEXT,
  p_max INT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT left(
    regexp_replace(
      trim(regexp_replace(COALESCE(p_value, ''), '[^0-9A-Za-z ]', ' ', 'g')),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    GREATEST(COALESCE(p_max, 0), 0)
  );
$$;

CREATE OR REPLACE FUNCTION public.print_vietqr_crc16(p_payload TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_payload TEXT := COALESCE(p_payload, '');
  v_crc INT := 65535;
  v_i INT;
  v_j INT;
BEGIN
  FOR v_i IN 1..length(v_payload)
  LOOP
    v_crc := v_crc # (ascii(substr(v_payload, v_i, 1)) << 8);
    FOR v_j IN 1..8
    LOOP
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

CREATE OR REPLACE FUNCTION public.print_vietqr_emvco(
  p_bank_code TEXT,
  p_account_no TEXT,
  p_amount NUMERIC,
  p_description TEXT,
  p_account_name TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_bin TEXT := public.print_vietqr_bank_bin(p_bank_code);
  v_account_no TEXT := trim(COALESCE(p_account_no, ''));
  v_amount TEXT := round(COALESCE(p_amount, 0))::BIGINT::TEXT;
  v_description TEXT := public.print_vietqr_sanitize_ascii(p_description, 25);
  v_merchant_name TEXT := public.print_vietqr_sanitize_ascii(p_account_name, 25);
  v_beneficiary TEXT;
  v_merchant_account_info TEXT;
  v_additional_data TEXT := '';
  v_payload TEXT;
BEGIN
  IF COALESCE(v_bin, '') = ''
     OR v_account_no = ''
     OR COALESCE(p_amount, 0) <= 0 THEN
    RETURN NULL;
  END IF;

  IF v_merchant_name = '' THEN
    v_merchant_name := 'MERCHANT';
  END IF;

  v_beneficiary := public.print_vietqr_tlv('00', v_bin)
    || public.print_vietqr_tlv('01', v_account_no);
  v_merchant_account_info := public.print_vietqr_tlv('00', 'A000000727')
    || public.print_vietqr_tlv('01', v_beneficiary)
    || public.print_vietqr_tlv('02', 'QRIBFTTA');

  IF v_description <> '' THEN
    v_additional_data := public.print_vietqr_tlv('62', public.print_vietqr_tlv('08', v_description));
  END IF;

  v_payload := public.print_vietqr_tlv('00', '01')
    || public.print_vietqr_tlv('01', '12')
    || public.print_vietqr_tlv('38', v_merchant_account_info)
    || public.print_vietqr_tlv('53', '704')
    || public.print_vietqr_tlv('54', v_amount)
    || public.print_vietqr_tlv('58', 'VN')
    || public.print_vietqr_tlv('59', v_merchant_name)
    || public.print_vietqr_tlv('60', 'VIETNAM')
    || v_additional_data
    || '6304';

  RETURN v_payload || public.print_vietqr_crc16(v_payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.print_template_add_receipt_payment_qr(
  p_content JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_blocks JSONB := p_content->'blocks';
  v_block JSONB;
  v_out JSONB := '[]'::jsonb;
  v_inserted BOOLEAN := false;
BEGIN
  IF v_blocks IS NULL OR jsonb_typeof(v_blocks) <> 'array' THEN
    v_blocks := '[]'::jsonb;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_blocks) AS b(value)
    WHERE b.value->>'type' = 'paymentQr'
  ) THEN
    RETURN p_content;
  END IF;

  FOR v_block IN SELECT value FROM jsonb_array_elements(v_blocks)
  LOOP
    IF NOT v_inserted AND v_block->>'type' = 'footer' THEN
      v_out := v_out || jsonb_build_array(
        jsonb_build_object('type', 'paymentQr', 'heading', 'QUÉT QR THANH TOÁN')
      );
      v_inserted := true;
    END IF;

    v_out := v_out || jsonb_build_array(v_block);
  END LOOP;

  IF NOT v_inserted THEN
    v_out := v_out || jsonb_build_array(
      jsonb_build_object('type', 'paymentQr', 'heading', 'QUÉT QR THANH TOÁN')
    );
  END IF;

  RETURN jsonb_set(COALESCE(p_content, '{}'::jsonb), '{blocks}', v_out, true);
END;
$$;

UPDATE public.print_template_versions
SET content = public.print_template_add_receipt_payment_qr(content),
    updated_at = now()
WHERE kind = 'receipt'
  AND is_active
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(content->'blocks') = 'array' THEN content->'blocks'
        ELSE '[]'::jsonb
      END
    ) AS b(value)
    WHERE b.value->>'type' = 'paymentQr'
  );

DROP FUNCTION public.print_template_add_receipt_payment_qr(JSONB);

CREATE OR REPLACE FUNCTION public.enqueue_receipt_print(
  p_order_id       bigint,
  p_cash_received  numeric DEFAULT NULL,
  p_cash_change    numeric DEFAULT NULL
)
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
  v_items        JSONB;
  v_payload      JSONB;
  v_idempotency  TEXT;
  v_job_id       BIGINT;
  v_now          TIMESTAMPTZ := now();
  v_qr_type      TEXT;
  v_vietqr_bank  TEXT;
  v_vietqr_acc   TEXT;
  v_vietqr_name  TEXT;
  v_qr_content   TEXT;
  v_payment_qr   JSONB;
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

  SELECT COALESCE(NULLIF(value, ''), 'vietqr') INTO v_qr_type
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'payment_qr_type';
  v_qr_type := COALESCE(v_qr_type, 'vietqr');

  IF v_qr_type = 'vietqr' AND COALESCE(v_order.total_amount, 0) > 0 THEN
    SELECT value INTO v_vietqr_bank
    FROM public.system_settings
    WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_bank_code';

    SELECT value INTO v_vietqr_acc
    FROM public.system_settings
    WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_account_no';

    SELECT value INTO v_vietqr_name
    FROM public.system_settings
    WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_account_name';

    v_qr_content := public.print_vietqr_emvco(
      v_vietqr_bank,
      v_vietqr_acc,
      v_order.total_amount,
      'DH ' || v_order.order_number,
      v_vietqr_name
    );

    IF COALESCE(v_qr_content, '') <> '' THEN
      v_payment_qr := jsonb_build_object(
        'type',          'vietqr',
        'content',       v_qr_content,
        'bank_code',     v_vietqr_bank,
        'header_label',  upper(v_vietqr_bank) || ' (BIN ' || public.print_vietqr_bank_bin(v_vietqr_bank) || ')',
        'account_no',    v_vietqr_acc,
        'account_name',  v_vietqr_name,
        'amount',        v_order.total_amount,
        'description',   'DH ' || v_order.order_number
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
$function$;

GRANT EXECUTE ON FUNCTION public.enqueue_receipt_print(bigint, numeric, numeric) TO authenticated;

COMMENT ON FUNCTION public.enqueue_receipt_print(bigint, numeric, numeric) IS
  'Receipt print enqueue. Static idempotency per order, fail-soft caller contract, and VietQR payment_qr included when tenant bank settings are configured.';

REVOKE ALL ON FUNCTION public.print_vietqr_bank_bin(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_vietqr_tlv(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_vietqr_sanitize_ascii(TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_vietqr_crc16(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_vietqr_emvco(TEXT, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC;
