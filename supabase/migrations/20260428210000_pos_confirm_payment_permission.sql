-- =============================================================
-- pos:confirm_payment — tách quyền xác nhận thanh toán tiền mặt
--
-- Vấn đề (root cause):
--   confirm_cash_payment RPC (latest body @ 20260428200000_fix_confirm
--   _cash_payment_method_swap.sql) gate bằng:
--     has_permission_any('pos:payment') OR has_permission_any('pos:print')
--   Key 'pos:payment' KHÔNG có trong catalog (20260422120001) → fallback
--   pos:print là gate thật → waiter (có pos:print từ 20260423170000)
--   confirm được cash payment, vi phạm nguyên tắc cash-drawer = cashier-only.
--
-- Decision (P2 — 4-agent debate 2026-04-25):
--   - Cash chạm két vật lý → chỉ cashier/branch_manager+ mới confirm.
--   - VietQR/MoMo không chạm két → giữ pos:use ở app layer, waiter tại bàn
--     vẫn confirm e-wallet được (flow mobile-first, webhook là source of
--     truth).
--
-- Fix:
--   1. Thêm permission_keys.pos:confirm_payment (scope=branch)
--   2. Grant vào role_templates: cashier, quan_ly_CN, quan_ly_vung,
--      super_manager, owner (KHÔNG cấp cho waiter/chef/office)
--   3. Sync staff_permissions
--   4. Rewrite confirm_cash_payment gate → chỉ check pos:confirm_payment,
--      bỏ fallback pos:payment/pos:print. Body giữ nguyên từ migration
--      20260428200000_fix_confirm_cash_payment_method_swap.sql (slot-reuse
--      logic + method-swap fix); chỉ đổi permission check block.
-- =============================================================

-- 1. Catalog
INSERT INTO public.permission_keys (key, module, description, scope) VALUES
  ('pos:confirm_payment', 'pos', 'Xác nhận thanh toán tiền mặt', 'branch')
ON CONFLICT (key) DO NOTHING;

-- 2. role_templates: cashier, quan_ly_CN, quan_ly_vung, super_manager, owner
UPDATE public.role_templates
   SET permission_keys = ARRAY(SELECT DISTINCT UNNEST(permission_keys || ARRAY['pos:confirm_payment']))
 WHERE position_code IN ('cashier', 'quan_ly_CN', 'quan_ly_vung', 'super_manager', 'owner')
   AND NOT ('pos:confirm_payment' = ANY(permission_keys));

-- 3. Backfill staff_permissions từ template đã update
SELECT public.sync_missing_permissions_from_template();

-- 4. Replace confirm_cash_payment body — giữ slot-reuse + method-swap fix
--    từ 20260428200000_fix_confirm_cash_payment_method_swap.sql, chỉ swap
--    permission gate sang pos:confirm_payment.

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
  v_existing_id  BIGINT;
  v_existing_st  TEXT;
  v_payment_id   BIGINT;
  v_cash_change  NUMERIC(15,2);
  v_complete_res RECORD;
  v_receipt_res  JSONB;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  -- Lock the order row to serialize concurrent confirm attempts.
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  -- GATE: chỉ role có pos:confirm_payment (cashier/branch_manager+).
  -- KHÔNG fallback pos:print: waiter có pos:print để in bill/KDS nhưng
  -- KHÔNG được confirm cash (chạm két vật lý = single-point-of-cash).
  IF NOT public.has_permission_any('pos:confirm_payment') THEN
    RAISE EXCEPTION 'permission denied: pos:confirm_payment' USING ERRCODE = '42501';
  END IF;

  -- Hard guard: BLOCK under-payment. Employee meals / comps must use
  -- the order's discount_amount to zero the total first.
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

  -- Find the single non-failed payment row (if any). The partial unique
  -- index guarantees at most one. Lock it to serialize vs concurrent
  -- webhook / double-click.
  SELECT id, status INTO v_existing_id, v_existing_st
  FROM public.payments
  WHERE order_id = p_order_id
    AND status <> 'failed'
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_st = 'completed' THEN
    -- Idempotent retry or webhook-won race: payment already paid.
    -- Short-circuit with the existing payment_id. Receipt was already
    -- enqueued on the original completion path; do NOT re-enqueue here.
    v_payment_id := v_existing_id;
  ELSIF v_existing_id IS NOT NULL THEN
    -- Convert the pending slot (any method) to a cash pending row.
    -- Wipe provider_ref / provider_data — those belong to the
    -- abandoned QR attempt, not the cash transaction we're recording.
    UPDATE public.payments
       SET method        = 'cash',
           amount        = v_order.total_amount,
           status        = 'pending',
           provider_ref  = NULL,
           provider_data = NULL,
           updated_at    = now()
     WHERE id = v_existing_id;
    v_payment_id := v_existing_id;
  ELSE
    INSERT INTO public.payments (
      tenant_id, branch_id, order_id, method, amount, status, created_by
    ) VALUES (
      v_order.tenant_id, v_order.branch_id, p_order_id, 'cash',
      v_order.total_amount, 'pending', v_uid
    )
    RETURNING id INTO v_payment_id;
  END IF;

  -- Set orders.payment_method so reports + receipt payload are correct.
  -- complete_payment_and_consume_stock is webhook-shared and (correctly)
  -- does not touch payment_method. Set it here in the caller-specific
  -- wrapper.
  UPDATE public.orders
     SET payment_method = 'cash',
         updated_at     = now()
   WHERE id = p_order_id;

  -- Short-circuit for already-completed: skip stock/receipt double-run.
  IF v_existing_st = 'completed' THEN
    RETURN jsonb_build_object(
      'order_id',      p_order_id,
      'payment_id',    v_payment_id,
      'cash_received', COALESCE(v_order.cash_received, p_cash_received),
      'cash_change',   COALESCE(v_order.cash_change, v_cash_change),
      'print_job_id',  NULL,
      'idempotent',    true
    );
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

  -- Enqueue the final receipt in the same transaction. Rolls back on
  -- failure — user retries, no half-paid/no-receipt state.
  v_receipt_res := public.enqueue_receipt_print(
    p_order_id,
    p_cash_received,
    v_cash_change
  );

  RETURN jsonb_build_object(
    'order_id',      p_order_id,
    'payment_id',    v_payment_id,
    'cash_received', p_cash_received,
    'cash_change',   v_cash_change,
    'print_job_id',  v_receipt_res->>'job_id'
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.confirm_cash_payment(bigint, numeric) TO authenticated;

COMMENT ON FUNCTION public.confirm_cash_payment(bigint, numeric) IS
  'Atomic cashier confirm: validates cash >= total, reuses any existing '
  'pending payment slot (UPDATE in-place) or inserts fresh cash row, '
  'calls complete_payment_and_consume_stock (marks paid + consumes stock), '
  'sets orders.payment_method=''cash'', enqueues final receipt. '
  'Gated by pos:confirm_payment — cashier/branch_manager+ only; waiter blocked. '
  'Idempotent: if payment already completed, short-circuits without '
  're-enqueuing receipt. Blocks under-payment hard (use discount instead).';
