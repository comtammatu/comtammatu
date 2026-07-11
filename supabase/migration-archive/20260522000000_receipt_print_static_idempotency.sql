-- =========================================================================
-- B9 — Receipt print idempotency: epoch-based → static + ON CONFLICT UPDATE
--
-- Bối cảnh: `enqueue_receipt_print` hiện dùng key epoch-based
-- ('order:N:receipt:1714000000') → mỗi click "In lại hóa đơn" tạo 1 row mới
-- trong `print_jobs`. Hệ quả:
--   1. Bloat: cashier rage-click → 5-10 rows/order. Multi-branch + 1000
--      orders/ngày → bloat đáng kể (không có TTL/cleanup).
--   2. Ambiguity: query "đơn N nhận hóa đơn nào?" cần ORDER BY id DESC LIMIT 1
--      thay vì SELECT đơn giản.
--   3. Inconsistent với pattern khác: shift_close_print, cancel_ticket_print
--      đều dùng static key + ON CONFLICT.
--
-- Quyết định (4-agent debate):
--   - Đổi sang static key 'order:N:receipt'.
--   - ON CONFLICT DO UPDATE để revive job từ terminal states (failed/expired/
--     printed) — cashier click "In lại" sau paper jam = revive job cũ + reprint.
--   - KHÔNG động khi status IN ('processing', 'cancelled') — protect race với
--     agent đang in (race C trong QA debate) + admin-killed jobs.
--   - Cập nhật `printer_id` từ EXCLUDED — handle trường hợp branch đổi máy in
--     active giữa 2 lần in.
--   - `attempts` GIỮ accumulate (KHÔNG reset) — đó là retry counter của agent
--     cho ops/forensics, không phải reprint counter của cashier.
--
-- KHÔNG gói chung:
--   - `enqueue_provisional_bill` giữ epoch key — comment migration 20260426
--     line 393-397 giải thích deliberate design ("waiters legitimately
--     re-print when paper jams" — khách chưa thanh toán, can edit món).
--     Receipt khác: post-payment, immutable, reprint là exception path.
--
-- Defer:
--   - Audit log cho printReceipt action: receipt path chưa từng log_audit
--     hôm nay → refactor không gây regression. Audit là separate concern.
--   - Agent UPDATE-event subscription: agent hiện chỉ listen INSERT (xem
--     index.ts). Revival case (UPDATE pending) sẽ chờ 15s drainPending poll
--     thay vì realtime. Acceptable cho exception path; nếu pilot thấy chậm,
--     follow-up PR thêm UPDATE listener.
--
-- Schema check: `print_jobs.idempotency_key TEXT UNIQUE` đã tồn tại từ
-- migration 20260423140000 → đủ cho ON CONFLICT.
--
-- Backwards compat: jobs cũ với epoch keys (vd 'order:5:receipt:1714000000')
-- KHÔNG collide với key mới ('order:5:receipt') — không cần backfill.
-- =========================================================================

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
    'cash_received',    p_cash_received,
    'cash_change',      p_cash_change,
    'created_at',       to_char(v_order.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                'YYYY-MM-DD"T"HH24:MI:SS'),
    'printed_at',       to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                'YYYY-MM-DD"T"HH24:MI:SS')
  );

  -- B9: static key (1 canonical row per order receipt) thay cho epoch.
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
    -- Refresh payload (cashier có thể đã sửa note giữa 2 lần in).
    payload    = EXCLUDED.payload,
    -- Update printer_id: branch có thể đã đổi máy in active giữa 2 lần in.
    printer_id = EXCLUDED.printer_id,
    -- Revive từ terminal states. CHỈ những trạng thái đã "đóng" job mới
    -- được flip về pending để in lại:
    --   - failed/expired: agent từng fail → cashier muốn thử lại
    --   - printed: paper jam / khách xin bản sao → in lần 2 có chủ ý
    -- KHÔNG động:
    --   - processing: agent đang trong flight (race protection — payload
    --     đã refresh ở trên, agent in payload hiện tại nó đã claim)
    --   - cancelled: admin chủ động kill — yêu cầu unlock thủ công
    status = CASE
               WHEN public.print_jobs.status IN ('failed','expired','printed')
               THEN 'pending'
               ELSE public.print_jobs.status
             END,
    last_error       = NULL,
    claimed_by_agent = NULL,
    claimed_at       = NULL
    -- attempts: KHÔNG reset (giữ retry history của agent cho ops/forensics)
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'order_id',   p_order_id,
    'job_id',     v_job_id,
    'printer_id', v_printer_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.enqueue_receipt_print(bigint, numeric, numeric) TO authenticated;
