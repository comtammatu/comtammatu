-- =========================================================================
-- Provisional bill + cash capture (PR-A: backend)
--
-- Business flow (CTCP F&B, confirmed with owner):
--   1. Khách ở bàn gọi "Tính tiền"
--   2. Phục vụ ấn "In tạm tính" → PHIẾU TẠM TÍNH (luôn có QR chuyển khoản)
--   3. Khách chọn trả: Tiền mặt | Chuyển khoản | MoMo
--   4. Thu ngân xác nhận thanh toán; nếu cash → nhập "Tiền nhận", hệ thống
--      auto-compute "Tiền trả khách"
--   5. In HOÁ ĐƠN CHÍNH THỨC (không có QR, có method + cash rows)
--
-- Changes:
--   - ALTER print_jobs.job_type CHECK → add 'provisional_bill'
--   - orders: add cash_received, cash_change NUMERIC(15,2) (audit trail)
--   - system_settings: add payment_qr_type + pos_provisional_bill_enabled
--   - CREATE OR REPLACE enqueue_receipt_print: add cash params, drop vietqr
--     block (receipts no longer carry QR — that moves to provisional bill);
--     persist cash values to orders in the same transaction
--   - NEW enqueue_provisional_bill(p_order_id, p_qr_content, p_qr_header_label)
--   - NEW confirm_cash_payment(p_order_id, p_cash_received) — atomic RPC
--     that validates cash ≥ total, computes change, creates payment row,
--     calls complete_payment_and_consume_stock, persists cash, enqueues
--     receipt job. BLOCKS under-payment (cash < total) hard.
--
-- Permissions: reuse POS_PRINT (pos:print) for both print RPCs, POS_PAYMENT
-- (pos:payment — existing) for confirm_cash_payment.
-- =========================================================================

-- ─── 1. Expand print_jobs.job_type CHECK ─────────────────────────────────

ALTER TABLE public.print_jobs
  DROP CONSTRAINT IF EXISTS print_jobs_job_type_check;

ALTER TABLE public.print_jobs
  ADD CONSTRAINT print_jobs_job_type_check CHECK (
    job_type IN (
      'kitchen_ticket',
      'receipt',
      'provisional_bill',
      'reprint',
      'cancel_ticket'
    )
  );

-- ─── 2. orders cash-capture columns ──────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cash_received NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS cash_change   NUMERIC(15,2);

COMMENT ON COLUMN public.orders.cash_received IS
  'Tiền mặt khách đưa (chỉ khi payment_method=cash). Null cho các method khác.';
COMMENT ON COLUMN public.orders.cash_change IS
  'Tiền trả lại khách = cash_received - total_amount. Null cho non-cash.';

-- ─── 3. system_settings: QR provider selector + feature flag ─────────────

INSERT INTO public.system_settings (tenant_id, key, value, description)
SELECT t.id, 'payment_qr_type', 'vietqr',
       'Loại QR in trên phiếu tạm tính: vietqr hoặc momo (momo: TODO future)'
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_settings
  WHERE tenant_id = t.id AND key = 'payment_qr_type'
);

INSERT INTO public.system_settings (tenant_id, key, value, description)
SELECT t.id, 'pos_provisional_bill_enabled', 'true',
       'Feature flag: cho phép in phiếu tạm tính từ POS. Set ''false'' để kill switch nhanh khi bug prod.'
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_settings
  WHERE tenant_id = t.id AND key = 'pos_provisional_bill_enabled'
);

-- ─── 4. enqueue_receipt_print — add cash params, drop vietqr block ───────

-- Postgres treats the signature as (types only), so adding two NEW parameters
-- creates a distinct function from the existing (bigint) version. Drop the
-- old single-arg signature so supabase-js `.rpc({p_order_id})` resolves
-- unambiguously to the new 3-arg variant with DEFAULT NULL for cash fields.
DROP FUNCTION IF EXISTS public.enqueue_receipt_print(bigint);

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

  -- Persist cash values onto the order row for audit/reporting (shift close
  -- reconciliation, "tiền quỹ chênh lệch" reports). Receipts re-printed
  -- later will read the same values back.
  IF p_cash_received IS NOT NULL OR p_cash_change IS NOT NULL THEN
    UPDATE public.orders
       SET cash_received = p_cash_received,
           cash_change   = p_cash_change
     WHERE id = p_order_id;
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
    'items',            v_items,
    'subtotal',         v_order.subtotal,
    'tax_amount',       v_order.tax_amount,
    'service_charge',   v_order.service_charge,
    'discount_amount',  v_order.discount_amount,
    'total_amount',     v_order.total_amount,
    'payment_method',   v_order.payment_method,
    'cash_received',    p_cash_received,
    'cash_change',      p_cash_change,
    'created_at',       to_char(v_order.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                'YYYY-MM-DD"T"HH24:MI:SS'),
    'printed_at',       to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
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

GRANT EXECUTE ON FUNCTION public.enqueue_receipt_print(bigint, numeric, numeric) TO authenticated;

-- ─── 5. enqueue_provisional_bill ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enqueue_provisional_bill(
  p_order_id         bigint,
  p_qr_content       text DEFAULT NULL,
  p_qr_header_label  text DEFAULT NULL
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

  -- Feature flag — kill switch for rapid rollback.
  SELECT value INTO v_flag_enabled
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'pos_provisional_bill_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RAISE EXCEPTION 'provisional bill printing is disabled' USING ERRCODE = 'P0001';
  END IF;

  -- Block provisional print on already-paid orders (BA guard).
  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'order already paid; cannot print provisional bill' USING ERRCODE = 'P0001';
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

  -- Build payment_qr block when caller supplied pre-built QR content.
  -- QR content (EMVCo for VietQR) is computed by the Server Action caller
  -- using packages/shared/src/providers/impl/vietqr.ts — keeps the crypto
  -- logic in TS, out of PL/pgSQL. If p_qr_content is NULL, provisional
  -- bill is printed without a QR block (cash-only quán is still fine).
  IF p_qr_content IS NOT NULL AND length(trim(p_qr_content)) > 0 THEN
    SELECT value INTO v_qr_type
    FROM public.system_settings
    WHERE tenant_id = v_order.tenant_id AND key = 'payment_qr_type';
    v_qr_type := COALESCE(v_qr_type, 'vietqr');

    -- Pull display metadata (account info) to show below the QR square.
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
  WHERE oi.order_id = p_order_id;

  v_payload := jsonb_build_object(
    'kind',             'provisional_bill',
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
    'items',            v_items,
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

  -- Epoch-based idempotency key — same-second duplicates collapse to 1 job
  -- (POS double-click guard); cross-second presses each create a fresh job
  -- (intentional — waiters legitimately re-print when paper jams).
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

GRANT EXECUTE ON FUNCTION public.enqueue_provisional_bill(bigint, text, text) TO authenticated;

-- ─── 6. confirm_cash_payment — atomic mark-paid + enqueue receipt ────────

CREATE OR REPLACE FUNCTION public.confirm_cash_payment(
  p_order_id       bigint,
  p_cash_received  numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid          UUID;
  v_order        public.orders%ROWTYPE;
  v_payment_id   BIGINT;
  v_cash_change  NUMERIC(15,2);
  v_complete_res RECORD;
  v_receipt_res  JSONB;
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
    public.has_permission_any('pos:payment')
    OR public.has_permission_any('pos:print')
  ) THEN
    RAISE EXCEPTION 'permission denied: pos:payment' USING ERRCODE = '42501';
  END IF;

  -- Hard guard: BLOCK under-payment. Employee meals / comps must use the
  -- order's discount_amount to zero the total first, not cash < total.
  IF p_cash_received IS NULL OR p_cash_received < v_order.total_amount THEN
    RAISE EXCEPTION 'cash_received (%) must be >= total_amount (%)',
      p_cash_received, v_order.total_amount
      USING ERRCODE = 'P0001';
  END IF;

  -- Sanity upper bound (guard against typo — 10× total, at least 50M VND).
  IF p_cash_received > GREATEST(v_order.total_amount * 10, 50000000) THEN
    RAISE EXCEPTION 'cash_received (%) exceeds sane upper bound for total (%)',
      p_cash_received, v_order.total_amount
      USING ERRCODE = 'P0001';
  END IF;

  v_cash_change := p_cash_received - v_order.total_amount;

  -- Locate or create the pending cash payment row for this order.
  SELECT id INTO v_payment_id
  FROM public.payments
  WHERE order_id = p_order_id
    AND method = 'cash'
    AND status = 'pending'
  ORDER BY id DESC
  LIMIT 1;

  IF v_payment_id IS NULL THEN
    INSERT INTO public.payments (
      tenant_id, branch_id, order_id, method, amount, status, created_by
    ) VALUES (
      v_order.tenant_id, v_order.branch_id, p_order_id, 'cash',
      v_order.total_amount, 'pending', v_uid
    )
    RETURNING id INTO v_payment_id;
  END IF;

  -- Atomic mark-paid + stock consumption. Rolls back on failure.
  SELECT * INTO v_complete_res
  FROM public.complete_payment_and_consume_stock(
    v_payment_id,
    v_order.total_amount,
    jsonb_build_object('cash_received', p_cash_received, 'cash_change', v_cash_change),
    v_uid
  );

  IF v_complete_res.status NOT IN ('completed', 'already_completed') THEN
    RAISE EXCEPTION 'payment completion failed: % (detail: %)',
      v_complete_res.status, v_complete_res.detail
      USING ERRCODE = 'P0001';
  END IF;

  -- Enqueue the final receipt in the same transaction. If the print job
  -- fails to insert, the whole call rolls back — user retries, no
  -- half-paid/no-receipt state.
  v_receipt_res := public.enqueue_receipt_print(
    p_order_id,
    p_cash_received,
    v_cash_change
  );

  RETURN jsonb_build_object(
    'order_id',       p_order_id,
    'payment_id',     v_payment_id,
    'cash_received',  p_cash_received,
    'cash_change',    v_cash_change,
    'print_job_id',   v_receipt_res->>'job_id'
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.confirm_cash_payment(bigint, numeric) TO authenticated;

COMMENT ON FUNCTION public.confirm_cash_payment(bigint, numeric) IS
  'Atomic cashier confirm: validates cash ≥ total, upserts cash payment row, '
  'calls complete_payment_and_consume_stock (marks paid + consumes stock), '
  'persists cash_received/cash_change on orders, enqueues final receipt. '
  'Rolls back if any step fails. Blocks under-payment hard (use discount instead).';
