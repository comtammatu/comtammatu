# Thiết kế: Hủy đơn / hoàn tiền sau thanh toán tại POS (void-after-paid)

> Reconciled-through 86136ae3

Ngày: 2026-06-28
Nguồn: đánh giá POS toàn diện 2026-06-28 (hạng mục rank 8) + debate T3 (Product / BA-HĐĐT / Senior Dev / QA).
Trạng thái: **Phase 1 ĐÃ VÀO REPO** — Q0–Q9 chốt (D048); migration thật + ACL TS + decision. Owner apply migration → `pnpm db:types` → backfill, rồi Phase 2 (Server Action/UI/test). Kế toán còn phải xác nhận mốc kê khai cho cross-period (Q3).

## TL;DR

- Khi thu ngân confirm nhầm đơn, hoặc khách trả món **sau khi đã thanh toán**, hiện không có đường xử lý trong hệ thống → nhân viên xử lý ngoài → lệch tiền mặt + HĐĐT.
- Tin tốt: **hạ tầng đã có sẵn trên prod** — engine hoàn tiền (`refunds`, `create_refund`, `reverse_payment_and_post`) và khả năng huỷ HĐĐT (`transition_tax_invoice_state`, `cancelTaxInvoice`). Việc còn lại chỉ là **một RPC wrapper POS** (gói tiền + HĐĐT trong 1 transaction, dưới 1 cổng manager) + nút trên màn bill. Không phải làm mới subsystem.
- **CHẶN GOVERNANCE:** tính năng này **đảo ngược quyết định D023** (`docs/plan/decisions.md:135-142` — *"KHÔNG đưa hủy/thay thế HĐĐT ra màn POS… Correction chỉ ở Owner + Kế toán"*). Theo `decisions.md:131-133`, phải ghi **quyết định thay thế** trong `decisions.md` **trước khi** code, nếu không review sẽ reject.
- Vì repo không có dev target, code gọi RPC mới **chỉ typecheck-xanh sau khi** owner apply migration + `pnpm db:types`. ⇒ feature bắt buộc **2 phase**.

---

## Phạm vi (v1)

**Trong phạm vi:** hủy **toàn phần** một đơn `per_order` có **một** khoản thanh toán completed (cash hoặc VietQR), tại màn bill, **manager-gated**, **bắt buộc lý do**, **atomic**. Đảo tiền + huỷ HĐĐT per_order + đưa đơn khỏi board + audit đầy đủ.

**Ngoài phạm vi v1 (defer — mỗi cái là subsystem/chính sách riêng):**
- Hoàn **một phần** / theo món (cần HĐ điều chỉnh giảm — chỉ kế toán làm trên portal).
- Đơn có **nhiều** khoản thanh toán (split).
- Đơn đã gộp vào **hóa đơn tổng hợp ngày (B2C daily_summary)** → RPC **chặn**, kế toán điều chỉnh trên portal.
- Huỷ HĐĐT **khác kỳ thuế đã kê khai** (cần hard-block period-close đang defer).
- Hoàn tiền tự động qua ví/bank — VietQR **hoàn thủ công**.

---

## Kiến trúc (đã verify code thật)

- RPC mới `refund_paid_order(p_order_id, p_reason)` — `SECURITY DEFINER`, `SET search_path TO ''`, atomic, theo style `create_refund`/`reverse_payment_and_post`.
- HĐĐT: huỷ HTTP của Viettel **không** chạy trong transaction DB. RPC chỉ flip trạng thái DB (nguồn sự thật = `cancelled`) + trả `invoice_action`; **Server Action** gọi provider **sau commit**, **fail-soft** (provider lỗi KHÔNG rollback tiền — bắn notification `pos.void_after_paid_unrefunded` để Finance retry).
- 4 nhóm trạng thái HĐĐT: `issued`→`cancel_issued` (có biên bản huỷ provider); `draft/signing/submitted`→`cancel_predispatch` (chỉ flip DB); không có/`not_required`→`none`; đã trong daily_summary→**RAISE** `order_in_daily_summary` (chặn).
- `orders.payment_status` giữ `'paid'` (D020; CHECK không có `'refunded'`); sự thật hoàn tiền = `payments.status='refunded'` + `refunds`. Đơn được set `status='cancelled'` để rời board + rớt khỏi doanh thu (`get_pos_session_report`/`close_pos_session` filter `status NOT IN ('cancelled')`).
- Idempotency: `pg_advisory_xact_lock(order_id)` + `FOR UPDATE` orders + payment; replay → lỗi sạch (`order_already_cancelled`/`already_refunded`), không double-reversal, không 500.

### ACL
- Thêm **key mới** `pos:void_paid_order` (KHÔNG tái dùng `pos:void_order` — key đó cashier/waiter đang có; không được cho cashier tự đảo tiền).
- `permissions.ts`: `POS_VOID_PAID_ORDER` + bump `PERMISSION_KEY_COUNT` 88→89.
- `posVoidPaidAuth` resolver: role = `['owner','branch_manager']`, grant `pos:void_paid_order`.
- ⚠️ **Backfill:** thêm key vào role_templates KHÔNG tự cấp cho manager đã tồn tại (grant per-user). Owner phải chạy `apply_template_to_user` backfill, nếu không manager bị `forbidden` (bài học sự cố `orders:refund_approve`).

---

## ✅ Quyết định đã CHỐT (owner — xem D048)

Owner đã chốt toàn bộ Q0–Q9 (`docs/plan/decisions.md` D048, giới hạn D023). Migration
thật: `supabase/migrations/20260628120000_pos_refund_void_after_paid.sql`.

| # | Ai quyết | Câu hỏi | Chốt |
|---|---|---|---|
| **Q0** | **Owner** | Đảo D023 (cho phép hủy/hoàn + huỷ HĐĐT ở màn POS, manager-gated)? | **RESOLVED** — đảo D023 ở phạm vi HẸP: chỉ **full void-after-paid** mở ra POS; partial / điều chỉnh / thay thế + daily_summary GIỮ owner+kế toán. Ghi ở D048. |
| **Q1** | Owner | "Manager-gated" = `owner + branch_manager` thôi? | **RESOLVED** — owner + branch_manager; key mới `pos:void_paid_order` (KHÔNG cashier, KHÔNG tái dùng `pos:void_order`). |
| **Q2** | **Kế toán** | Độ dài lý do tối thiểu 20 hay 10? | **RESOLVED** — 20 ký tự (trim ≥ 20, ≤ 500). |
| **Q3** | **Kế toán** | HĐĐT issued = HUỶ? cross-period có hard-block không? | **RESOLVED** — full void HĐĐT issued = **HUỶ**; cross-period **BLOCK** tại POS (`cross_period_invoice`, proxy theo tháng `issued_at < date_trunc('month', now())`). ⚠️ Kế toán phải xác nhận đúng mốc kê khai; hard-block period-close thật là item defer riêng. |
| **Q4** | **Owner** | branch_manager huỷ HĐĐT issued dưới `pos:void_paid_order` (inline flip) hay vẫn owner-only? | **RESOLVED** — branch_manager ĐƯỢC, RPC **inline flip** `tax_invoices` + ghi `tax_invoice_events`, KHÔNG gọi `transition_tax_invoice_state` (owner-only `settings:tenant`). |
| **Q5** | Owner/Kế toán | Cancel đơn hay dòng "refund trong ca" riêng? | **RESOLVED** — cancel đơn (`status='cancelled'`) → rời board + rớt khỏi doanh thu. |
| **Q6** | Owner | Refund thẳng `approved` (1 chạm) hay qua owner-approve? | **RESOLVED** — 1 chạm tại till (`status='approved'`, manager = requester + approver). |
| **Q7** | Owner | Re-pay = đơn mới hay re-charge đơn cũ? | **RESOLVED** — đơn mới. |
| **Q8** | Owner | Full-void đủ cho cả wrong-order lẫn returned-food? | **RESOLVED** — full-only v1; returned-food cần hoàn một phần = defer. |
| **Q9** | Owner | Đơn Má Tư không bao giờ có >1 thanh toán completed? | **RESOLVED** — xác nhận; RPC reject `multiple_payments`. |

---

## Phasing

- **Phase 0 (governance):** ghi quyết định thay thế D023 vào `docs/plan/decisions.md`.
- **Phase 1 (review được ngay):** migration draft (dưới) + ACL TS (`permissions.ts` + `posVoidPaidAuth`) — typecheck độc lập với RPC; + doc này. PR cho owner duyệt.
- **Phase 1.5 (owner):** apply migration lên prod → `pnpm db:types` → chạy backfill `apply_template_to_user`.
- **Phase 2 (sau khi có types):** Server Action `voidPaidOrder` (rpc + mapRpcError + provider cancel fail-soft + notification) + UI nút màn bill (manager-gated + dialog lý do). + tests. Chỉ compile xanh sau Phase 1.5.
- **Phase 3 (verify prod):** chạy oracle reconcile (`find_payment_order_desync`) trên 1 void thật; xác nhận `payment.status='refunded'`, `refunds.status='approved'`, `order.status='cancelled'`, HĐĐT `cancelled`/flagged, đơn rớt khỏi doanh thu + summary kế tiếp.

---

## Migration (Q1–Q4 ĐÃ CHỐT — owner duyệt + tự apply)

> Migration thật đã vào repo: `supabase/migrations/20260628120000_pos_refund_void_after_paid.sql`.
> File thật khác bản phác dưới ở các điểm đã chốt: `permission_keys` INSERT thêm
> `module='pos'` + `scope='branch'` (cột NOT NULL); grant role_templates qua
> `UPDATE … array_append` cho `position_code IN ('owner','branch_manager')`; thêm
> block `cross_period_invoice` (Q3); `order_in_daily_summary` lọc đúng
> `invoice_kind='daily_summary'`; bỏ `BEGIN/COMMIT` (Supabase CLI tự bọc
> transaction). Bản phác dưới giữ lại để tham chiếu thiết kế.

```sql
-- (phác thảo thiết kế — KHÔNG phải file áp dụng; xem file migration thật ở trên)
-- supabase/migrations/20260628120000_pos_refund_void_after_paid.sql
-- DRAFT — owner reviews + applies to PROD, then runs `pnpm db:types`. NOT auto-executed.
-- Reuses existing refund subsystem (refunds, create_refund, reverse_payment_and_post)
-- and the existing HĐĐT cancel capability (cancelTaxInvoice / transition_tax_invoice_state).
-- GOVERNANCE: reverses D023 — record the superseding decision in decisions.md BEFORE applying.
BEGIN;

-- 1. Permission key (mirror PERMISSION_KEYS in permissions.ts; bump COUNT 88->89).
INSERT INTO public.permission_keys (key, description)
VALUES ('pos:void_paid_order',
        'Reverse a paid POS order at the till (void-after-paid); manager-gated')
ON CONFLICT (key) DO NOTHING;

-- 2. Link a refund to the per_order HĐĐT it reverses (NULL = no active invoice).
ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS tax_invoice_id bigint REFERENCES public.tax_invoices(id);

-- 3. POS-facing atomic refund RPC. Manager-gated, reason >= 20, branch+tenant scoped.
CREATE OR REPLACE FUNCTION public.refund_paid_order(p_order_id bigint, p_reason text)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_order record; v_payment record; v_invoice record;
  v_refund_id bigint; v_in_summary boolean := false; v_invoice_action text := 'none';
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='28000'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 20 THEN RAISE EXCEPTION 'reason_too_short' USING ERRCODE='22023'; END IF;
  IF length(p_reason) > 500 THEN RAISE EXCEPTION 'reason_too_long' USING ERRCODE='22023'; END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT id, tenant_id, branch_id, status, payment_status INTO v_order
    FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found' USING ERRCODE='P0002'; END IF;
  IF v_order.tenant_id <> v_tenant THEN RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE='42501'; END IF;
  -- Q4: gate on the NEW pos:void_paid_order (recommended).
  IF NOT public.has_permission(v_order.branch_id, 'pos:void_paid_order') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF v_order.status = 'cancelled' THEN RAISE EXCEPTION 'order_already_cancelled' USING ERRCODE='P0001'; END IF;
  IF v_order.payment_status <> 'paid' THEN RAISE EXCEPTION 'order_not_paid' USING ERRCODE='P0001'; END IF;

  SELECT id, branch_id, amount, status, method, stock_consumed_status INTO v_payment
    FROM public.payments WHERE order_id = p_order_id AND tenant_id = v_tenant AND status = 'completed' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_completed_payment' USING ERRCODE='P0001'; END IF;
  PERFORM 1 FROM public.payments WHERE order_id = p_order_id AND tenant_id = v_tenant AND status='completed' AND id <> v_payment.id;
  IF FOUND THEN RAISE EXCEPTION 'multiple_payments' USING ERRCODE='P0001'; END IF;

  IF v_payment.amount > 0 THEN
    PERFORM 1 FROM public.refunds WHERE payment_id = v_payment.id AND status IN ('pending','approved');
    IF FOUND THEN RAISE EXCEPTION 'already_refunded' USING ERRCODE='P0001'; END IF;
  END IF;

  -- HĐĐT: block daily_summary; classify active per_order invoice.
  SELECT EXISTS (SELECT 1 FROM public.tax_invoice_orders tio JOIN public.tax_invoices ti ON ti.id = tio.tax_invoice_id
    WHERE tio.order_id = p_order_id AND ti.status NOT IN ('cancelled','replaced')) INTO v_in_summary;
  IF v_in_summary THEN RAISE EXCEPTION 'order_in_daily_summary' USING ERRCODE='P0001'; END IF;

  SELECT id, status, provider_ref, provider INTO v_invoice
    FROM public.tax_invoices WHERE order_id = p_order_id AND tenant_id = v_tenant
      AND invoice_kind = 'per_order' AND status IN ('draft','signing','submitted','issued')
    ORDER BY id DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    -- Q4: inline flip (manager gate is the authority) instead of transition_tax_invoice_state (owner-only edge).
    UPDATE public.tax_invoices SET status='cancelled', cancelled_at=now(),
        provider_data = COALESCE(provider_data,'{}'::jsonb) || jsonb_build_object('cancelled', jsonb_build_object('cancel_reason', p_reason, 'source','pos_void_paid_order')),
        updated_at = now() WHERE id = v_invoice.id;
    INSERT INTO public.tax_invoice_events (tax_invoice_id, tenant_id, from_status, to_status, actor_id, payload, note)
      VALUES (v_invoice.id, v_tenant, v_invoice.status, 'cancelled', v_actor,
              jsonb_build_object('cancel_reason', p_reason, 'source','pos_void_paid_order'), p_reason);
    v_invoice_action := CASE WHEN v_invoice.status = 'issued' THEN 'cancel_issued' ELSE 'cancel_predispatch' END;
  END IF;

  IF v_payment.amount > 0 THEN
    INSERT INTO public.refunds (tenant_id, branch_id, payment_id, order_id, amount, reason, status, created_by, approved_by, approved_at, tax_invoice_id)
      VALUES (v_tenant, v_payment.branch_id, v_payment.id, p_order_id, v_payment.amount, p_reason, 'approved', v_actor, v_actor, now(), v_invoice.id)
      RETURNING id INTO v_refund_id;
    IF v_payment.stock_consumed_status = 'ok' THEN PERFORM public.restore_stock_for_order(p_order_id, v_actor); END IF; -- D016: normally no-op
    UPDATE public.payments SET status='refunded', updated_at=now() WHERE id = v_payment.id;
  END IF;

  UPDATE public.orders SET status='cancelled', updated_at=now() WHERE id = p_order_id;
  UPDATE public.order_items SET status='cancelled', updated_at=now() WHERE order_id = p_order_id AND status <> 'cancelled';
  UPDATE public.kds_tickets SET status='cancelled', updated_at=now() WHERE order_id = p_order_id AND status NOT IN ('cancelled','served');

  PERFORM public.log_audit('refund.pos_void_after_paid', 'refund', COALESCE(v_refund_id, p_order_id), NULL,
    jsonb_build_object('order_id', p_order_id, 'payment_id', v_payment.id, 'amount', v_payment.amount,
      'method', v_payment.method, 'invoice_id', v_invoice.id, 'invoice_action', v_invoice_action, 'reason', p_reason));

  RETURN jsonb_build_object('status','refunded','refund_id',v_refund_id,'amount',v_payment.amount,'method',v_payment.method,
    'invoice_id',v_invoice.id,'invoice_action',v_invoice_action,'invoice_provider_ref',v_invoice.provider_ref,'invoice_provider',v_invoice.provider);
END; $$;

REVOKE ALL ON FUNCTION public.refund_paid_order(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_paid_order(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_paid_order(bigint, text) TO service_role;

COMMIT;
```

> Lưu ý kỹ thuật cho Phase 2: cho tới khi types regen, `supabase.rpc('refund_paid_order', …)` sẽ báo type đỏ (tiền lệ: `edit_pending_order_item` dùng cast trong `order-void-actions.ts`). Đừng coi type đỏ đó là bug; nó xanh sau `pnpm db:types`.

## Server Action / UI (Phase 2 — tóm tắt)

- `voidPaidOrder(branchId, orderId, reason)` trong `pos/order-void-actions.ts`, theo `withActionPositional` + `customAuth = posVoidPaidAuth`. Zod `reason.trim().min(20).max(500)`. Map mọi errcode → copy tiếng Việt cố định (không lộ `SQLERRM`). Sau success: nếu `invoice_action='cancel_issued'` → `invoiceProvider.cancelInvoice(...)`, lỗi → warning mềm + notification `pos.void_after_paid_unrefunded` (KHÔNG rollback). VietQR → warning "hoàn tiền thủ công".
- UI: nút "Hủy đơn đã thanh toán / Hoàn tiền" trên `bill-receipt-sheet.tsx`, chỉ hiện khi có `pos:void_paid_order`; dialog bắt buộc lý do (≥20, validate client khớp RPC), hiện số tiền + phương thức + cảnh báo VietQR thủ công. Voided order rời board.

## Test plan (Phase 2/3)
Happy path cash+issued; pre-dispatch invoice; no-invoice; daily-summary block; provider fail-soft (no rollback + notification); idempotency double-tap; race vs confirm replay; split rejected; no-completed-payment rejected; zero-total comp (skip money leg); permission (cashier forbidden, manager ok, cross-branch forbidden); reason validation; no raw error leak; VietQR manual-refund warning; revenue + next-summary exclusion.

## Rủi ro
- Tiền + HĐĐT — sai 1 nhánh là lệch sổ/thuế ⇒ chưa chốt Q0–Q4 thì chưa build.
- Provider cancel fail-soft là cố ý (tiền không bị giam vì provider lỗi) — bù bằng notification + retry Finance.
- Không có DB-level test harness trong apps/web ⇒ Phase 3 verify trên prod data là bắt buộc.
