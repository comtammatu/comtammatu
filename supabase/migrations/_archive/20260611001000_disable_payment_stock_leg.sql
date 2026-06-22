-- ============================================================================
-- 20260611001000_disable_payment_stock_leg
--
-- Thi hành chính sách owner 2026-05-28 "không trừ kho tại thời điểm thanh toán"
-- cho nhánh cuối cùng còn vi phạm: webhook MoMo (complete_payment_and_consume_stock
-- vẫn PERFORM consume_stock_for_order_service trong khi cash/VietQR đã bỏ từ lâu).
-- Đồng thời vá bug hoàn-kho-ảo trong reverse_payment_and_post.
--
-- ⚠️ THỨ TỰ DEPLOY BẮT BUỘC: deploy CODE trước (webhook handler đã bỏ nhánh
-- notify khi stock_consumed=false), RỒI owner mới apply migration này.
-- Nếu apply migration trước khi deploy code: handler cũ thấy completed +
-- stock_consumed=false → trả 500 + bắn notification "tồn kho" sai cho MỌI
-- thanh toán MoMo và MoMo retry vô hạn.
--
-- T3 debate (PM/BA/Dev/QA):
-- - PM: chính sách "không trừ kho" đã chạy thực tế từ 2026-05-28; tồn kho hệ
--   thống đang lẫn lộn theo phương thức thanh toán (chỉ MoMo trừ) → số tồn
--   không diễn giải được; stocktake tay là phòng thủ duy nhất. Outcome: tồn
--   kho đồng nhất "không tự trừ", hết desync MoMo (khách mất tiền ví nhưng
--   đơn treo khi trừ kho lỗi).
-- - BA: (1) complete_payment_and_consume_stock GIỮ NGUYÊN signature + shape
--   trả về (webhook caller không đổi contract); 'stock_failed' không bao giờ
--   trả về nữa; stock_consumed luôn FALSE; KHÔNG ghi stock_consumed_status
--   nữa (NULL = không trừ kho, đồng nhất với cash/VietQR).
--   (2) reverse_payment_and_post: bỏ COALESCE(stock_consumed_status,'ok') —
--   NULL không còn bị coi là 'ok' nên KHÔNG hoàn kho cho payment chưa từng
--   trừ kho (trước đây: refund payment cash/VietQR/NULL → restore_stock cộng
--   kho ảo). Payment 'ok' lịch sử (MoMo đã trừ kho thật) vẫn được hoàn kho.
-- - Dev: redefine từ ĐÚNG bản đang sống trên prod (pg_get_functiondef
--   2026-06-11, trùng baseline) — không dựng từ nguồn cũ. CREATE OR REPLACE
--   giữ nguyên GRANT/REVOKE hiện có. consume_stock_for_order_service và
--   restore_stock_for_order KHÔNG drop (drop wave riêng, owner-gated per-RPC).
-- - QA: không có dev project để replay (cả 2 dev ref đã xóa) → owner nên
--   recreate dev + replay trước khi apply prod; tối thiểu: sau khi apply,
--   smoke 1 thanh toán MoMo sandbox xác nhận completed + không notification
--   tồn kho + stock_movements không sinh dòng sale_consumption mới.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.complete_payment_and_consume_stock(p_payment_id bigint, p_expected_amount numeric DEFAULT NULL::numeric, p_provider_data jsonb DEFAULT NULL::jsonb, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(status text, payment_id bigint, order_id bigint, stock_consumed boolean, detail text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_payment          RECORD;
  v_order            RECORD;
  v_line_subtotal    NUMERIC(15,2) := 0;
  v_recomputed_total NUMERIC(15,2) := 0;
BEGIN
  SELECT p.id, p.order_id, p.tenant_id, p.branch_id, p.amount, p.status
  INTO v_payment
  FROM public.payments p
  WHERE p.id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'not_found'::TEXT, p_payment_id, NULL::BIGINT, FALSE,
      ('payment ' || p_payment_id || ' does not exist')::TEXT;
    RETURN;
  END IF;

  IF v_payment.status = 'completed' THEN
    RETURN QUERY SELECT
      'already_completed'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      'payment was previously completed; no-op'::TEXT;
    RETURN;
  END IF;

  IF v_payment.status <> 'pending' THEN
    RETURN QUERY SELECT
      'failed'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      ('payment status=' || v_payment.status || ' cannot transition to completed')::TEXT;
    RETURN;
  END IF;

  SELECT o.id, o.tenant_id, o.branch_id, o.tax_amount, o.service_charge,
         o.discount_amount, o.total_amount
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_payment.order_id
    AND o.tenant_id = v_payment.tenant_id
    AND o.branch_id = v_payment.branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'failed'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      'order_not_found'::TEXT;
    RETURN;
  END IF;

  SELECT COALESCE(SUM(oi.quantity::NUMERIC * oi.unit_price), 0)::NUMERIC(15,2)
  INTO v_line_subtotal
  FROM public.order_items oi
  WHERE oi.order_id = v_order.id
    AND oi.tenant_id = v_order.tenant_id
    AND oi.status <> 'cancelled';

  v_recomputed_total := ROUND(
    v_line_subtotal
    + COALESCE(v_order.tax_amount, 0)
    + COALESCE(v_order.service_charge, 0)
    - COALESCE(v_order.discount_amount, 0),
    2
  );

  IF ABS(v_payment.amount - v_recomputed_total) > 1 THEN
    UPDATE public.payments
       SET status = 'failed',
           provider_data = COALESCE(p_provider_data, provider_data),
           updated_at = now()
     WHERE id = v_payment.id;

    RETURN QUERY SELECT
      'amount_mismatch_recomputed'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      ('stored=' || v_payment.amount || ' recomputed=' || v_recomputed_total)::TEXT;
    RETURN;
  END IF;

  IF p_expected_amount IS NOT NULL AND ABS(p_expected_amount - v_recomputed_total) > 1 THEN
    UPDATE public.payments
       SET status = 'failed',
           provider_data = COALESCE(p_provider_data, provider_data),
           updated_at = now()
     WHERE id = v_payment.id;

    RETURN QUERY SELECT
      'amount_mismatch_recomputed'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      ('expected=' || p_expected_amount || ' recomputed=' || v_recomputed_total)::TEXT;
    RETURN;
  END IF;

  -- Nhánh trừ kho đã gỡ theo chính sách owner 2026-05-28 "không trừ kho khi
  -- thanh toán". stock_consumed_status để NULL (đồng nhất cash/VietQR =
  -- "không trừ kho"); 'stock_failed' không còn là kết quả khả dĩ.

  UPDATE public.payments
     SET status        = 'completed',
         paid_at       = COALESCE(paid_at, now()),
         provider_data = COALESCE(p_provider_data, provider_data),
         updated_at    = now()
   WHERE id = v_payment.id;

  UPDATE public.orders
     SET payment_status = 'paid',
         updated_at     = now()
   WHERE id = v_payment.order_id
     AND tenant_id = v_payment.tenant_id;

  PERFORM public.finalize_paid_order(v_payment.order_id, p_actor_id);

  RETURN QUERY SELECT
    'completed'::TEXT,
    v_payment.id,
    v_payment.order_id,
    FALSE,
    'stock=skipped_per_policy_2026-05-28'::TEXT;
END;
$function$;

COMMENT ON FUNCTION public.complete_payment_and_consume_stock(p_payment_id bigint, p_expected_amount numeric, p_provider_data jsonb, p_actor_id uuid) IS
  'Recomputes order total at payment time and marks paid. Stock leg REMOVED per owner policy 2026-05-28 (không trừ kho); stock_consumed always false, stock_consumed_status left NULL. Name kept for caller compatibility.';

-- ----------------------------------------------------------------------------
-- reverse_payment_and_post: chỉ hoàn kho khi stock_consumed_status = 'ok'
-- THẬT (payment MoMo lịch sử đã trừ kho). Bỏ COALESCE(...,'ok') — NULL nghĩa
-- là chưa từng trừ kho → không được cộng kho ảo khi refund.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reverse_payment_and_post(p_refund_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_refund          RECORD;
  v_payment         RECORD;
  v_order           RECORD;
  v_actor           UUID := auth.uid();
  v_tenant          BIGINT := public.auth_tenant_id();
  v_je_id           BIGINT;
  v_dr_account_id   BIGINT;
  v_cr_account_id   BIGINT;
  v_cr_account_code TEXT;
  v_entry_number    TEXT;
  v_stock_count     INT := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant claim missing' USING ERRCODE = '28000';
  END IF;

  SELECT id, tenant_id, branch_id, payment_id, order_id, amount, status
  INTO v_refund
  FROM public.refunds
  WHERE id = p_refund_id
    AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund % not found', p_refund_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_refund.branch_id, 'orders:refund_approve') THEN
    RAISE EXCEPTION 'permission denied: orders:refund_approve required'
      USING ERRCODE = '42501';
  END IF;

  IF v_refund.status = 'approved' THEN
    RETURN jsonb_build_object(
      'status', 'already_approved',
      'refund_id', v_refund.id
    );
  END IF;
  IF v_refund.status <> 'pending' THEN
    RAISE EXCEPTION 'refund cannot transition from % to approved', v_refund.status
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id, tenant_id, branch_id, amount, status, method,
         stock_consumed_status
  INTO v_payment
  FROM public.payments
  WHERE id = v_refund.payment_id
    AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment % not found', v_refund.payment_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_payment.status <> 'completed' THEN
    RAISE EXCEPTION 'payment status=% - refund requires completed',
      v_payment.status USING ERRCODE = 'P0001';
  END IF;
  IF v_refund.amount > v_payment.amount THEN
    RAISE EXCEPTION 'refund amount % exceeds payment amount %',
      v_refund.amount, v_payment.amount USING ERRCODE = 'P0001';
  END IF;

  SELECT id, tenant_id, branch_id, payment_status
  INTO v_order
  FROM public.orders
  WHERE id = v_refund.order_id
    AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', v_refund.order_id
      USING ERRCODE = 'P0002';
  END IF;

  v_cr_account_code := CASE
    WHEN v_payment.method = 'cash' THEN '1111'
    ELSE '1121'
  END;

  SELECT id INTO v_dr_account_id
  FROM public.chart_of_accounts
  WHERE tenant_id = v_tenant AND account_code = '5111'
  LIMIT 1;
  IF v_dr_account_id IS NULL THEN
    RAISE EXCEPTION 'chart_of_accounts: 5111 missing for tenant %',
      v_tenant USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_cr_account_id
  FROM public.chart_of_accounts
  WHERE tenant_id = v_tenant AND account_code = v_cr_account_code
  LIMIT 1;
  IF v_cr_account_id IS NULL THEN
    RAISE EXCEPTION 'chart_of_accounts: % missing for tenant %',
      v_cr_account_code, v_tenant USING ERRCODE = 'P0002';
  END IF;

  v_entry_number := 'JE-' || to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD') ||
                    '-RFN' || lpad(p_refund_id::TEXT, 4, '0');

  INSERT INTO public.journal_entries
    (tenant_id, branch_id, entry_number, entry_date, description,
     reference_type, reference_id, status, posted_by, posted_at, created_by)
  VALUES
    (v_tenant, v_payment.branch_id, v_entry_number, now(),
     'Refund reversal journal for refund #' || p_refund_id::TEXT,
     'refund', p_refund_id, 'posted', v_actor, now(), v_actor)
  RETURNING id INTO v_je_id;

  INSERT INTO public.journal_entry_lines
    (tenant_id, journal_entry_id, account_id, debit_amount, credit_amount, description)
  VALUES
    (v_tenant, v_je_id, v_dr_account_id, v_refund.amount, 0,
     'Reverse revenue (refund #' || p_refund_id::TEXT || ')'),
    (v_tenant, v_je_id, v_cr_account_id, 0, v_refund.amount,
     'Reverse cash/bank (refund #' || p_refund_id::TEXT || ')');

  -- Chỉ hoàn kho khi payment này THẬT SỰ đã trừ kho ('ok' — MoMo lịch sử
  -- trước migration này). NULL = chưa từng trừ kho → không hoàn.
  IF v_payment.stock_consumed_status = 'ok' THEN
    BEGIN
      v_stock_count := public.restore_stock_for_order(v_refund.order_id, v_actor);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'restore_stock_for_order failed: %', SQLERRM;
    END;
  END IF;

  UPDATE public.payments
     SET status = 'refunded', updated_at = now()
   WHERE id = v_payment.id;

  UPDATE public.orders
     SET payment_status = 'refunded', updated_at = now()
   WHERE id = v_order.id;

  UPDATE public.refunds
     SET status      = 'approved',
         approved_by = v_actor,
         approved_at = now(),
         updated_at  = now()
   WHERE id = v_refund.id;

  PERFORM public.log_audit(
    'refund.approve',
    'refund',
    v_refund.id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object(
      'status', 'approved',
      'journal_entry_id', v_je_id,
      'stock_movements_created', v_stock_count
    )
  );

  RETURN jsonb_build_object(
    'status', 'approved',
    'refund_id', v_refund.id,
    'journal_entry_id', v_je_id,
    'stock_movements_created', v_stock_count,
    'payment_new_status', 'refunded',
    'order_new_status', 'refunded'
  );
END;
$function$;

COMMENT ON FUNCTION public.reverse_payment_and_post(p_refund_id bigint) IS
  'Atomic refund reversal with branch-scoped orders:refund_approve permission. Locks refund/payment/order, posts GL reversal, restores stock ONLY when stock_consumed_status=''ok'' strictly (NULL = never consumed, per owner policy 2026-05-28), flips payment/order/refund, and audits.';
