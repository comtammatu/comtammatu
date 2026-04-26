# POS Pass 1 — Owner Decisions Required

> Audience: project owner (Ma Tu).
> Goal: 5 decisions in 1 sync, batched. Estimate ~25 phút.
> Output: each row gets a written answer in this file → updates `tasks/pos-qa-pass-1.md` "Open questions" section.

## TL;DR

| # | Decision | Recommend | Blocks Pass 1? |
|---|---|---|---|
| D1 | Close shift while active orders exist | **Manager override (Option 3)** | ✅ blocks `09.01` |
| D2 | Comp meal (total=0) — note + approval gate | **Audit log only (Option 3)** | partial `05.03` |
| D3 | Variance threshold for close-shift approval | **Combo 50k OR 0.5% (Option 3)** | partial `09.01` |
| D4 | HĐĐT for total=0 (comp meal) | **Conditional on MST (Option 3)** | partial `05.03 + 05.05` |
| D5 | Failed-print log: retry via `print_jobs` vs new table | **Reuse `print_jobs` (Option 1)** | defer to hardware pass |

**Hard blocker for Pass 1:** only D1. D2–D5 can defer if shipping pressure demands.

---

## D1 — Close-shift behavior with active orders (P0 SPEC GAP)

**Context:** Hôm nay `close_pos_session` RPC (`supabase/migrations/20260405100001_close_pos_session_rpc.sql:44-51`) chỉ filter `status NOT IN ('cancelled')` — đóng ca không quan tâm có đơn `active/preparing/served/unpaid` còn live hay không. Cashier có thể "Chốt ca" trong khi 3 đơn đang phục vụ → bàn vẫn occupied, đơn unpaid vẫn tồn tại, ca tiếp theo không kế thừa cleanly. `expected_cash` cũng tính theo orders non-cancelled → cộng cả unpaid → variance giả.

**Options:**
1. **Block strictly** — bất kỳ active/unpaid → "Chốt ca" disabled với toast "Còn N đơn chưa thanh toán". An toàn cho đối soát. Phá flow giao ca giữa shift khi cashier rời quầy đột xuất.
2. **Allow + flag** — cho phép close, set `pos_sessions.has_open_orders=true`, link active orders sang next session. Realistic cho late-night ops. Audit trail vẫn còn.
3. **Manager override** — block by default; BM PIN unlock với reason ≥10 chars; record `forced_close_by`. Compromise giữa (1) và (2).

**Recommend:** Option 3. Reason: cashier mới yếu thường skip step này vô tình; manager force biết hậu quả; audit trail rõ ràng.

**Nếu không quyết:** scenario `09.01` không thể là pass/fail gate; P0 spec gap remains; cashier có thể đóng ca với đơn live → bàn ghost, đối soát sai mà không ai biết.

---

## D2 — Comp meal (total=0): note + approval gate

**Context:** Sau khi fix `05.03` (UI/Zod align với RPC), cashier có thể thanh toán cash đơn `total=0` tạo ra từ discount 100%. `apply_order_discount` đã yêu cầu `discount_note ≥ 3 chars` (rule `POS-DISCOUNT-PAIRED-NOTE-MIN-3`). Câu hỏi: có cần thêm gate riêng tại payment confirm không?

**Options:**
1. **Tin discount note là đủ** — không thêm gate. Discount đã có note + paired-tuple constraint.
2. **Yêu cầu BM approval ở apply_discount=100%** — discount value 100% (pct) hoặc value ≥ subtotal (vnd) cần BM PIN trước khi RPC commit.
3. **Audit-only flag** — RPC tự set `pos_session_events.kind='comp_meal'` khi `total=0 + payment.amount=0`; Finance review qua dashboard, không block flow.

**Recommend:** Option 3. Cashier flow ngắn gọn (cashier mới không bị BM nhúng tay mỗi comp), Finance vẫn có audit trail; nếu phát hiện lạm dụng → tighten lên Option 2.

**Nếu không quyết:** comp meal đi qua không có flag riêng; lạm dụng (cashier "đền khách" giả để pocket món) khó phát hiện qua report.

---

## D3 — Variance threshold for close-shift manager approval

**Context:** Khi `cash_difference = closing_cash - expected_cash ≠ 0` cuối ca, ai cần approve? Hôm nay không có gate — variance được record nhưng không trigger approval workflow.

**Options:**
1. **Tuyệt đối VND** — `|variance| > 50.000đ` (≈ 1 món) → require BM approval với note ≥10 chars.
2. **Tỷ lệ %** — `|variance| / expected_cash > 1%` → require BM.
3. **Combo** — `max(50.000đ, 0.5% × expected_cash)` — handle ca lớn (cuối tuần 50tr+) vs ca nhỏ (sáng 5tr) với 1 rule.
4. **Hai tier** — cảnh báo soft tại 50k/0.5%, block hard tại 200k/2%.

**Recommend:** Option 3 cho v1; Option 4 nếu tích lũy đủ data ca size variance lớn.

**Nếu không quyết:** mọi variance qua mà không ai check → drift lâu dài, cashier ít trách nhiệm; báo cáo Finance khó dùng.

---

## D4 — HĐĐT cho hóa đơn total=0 (comp meal)

**Context:** `createTaxInvoice` precondition là `payment_status='paid'`. Sau khi fix `05.03`, comp meal pay 0đ vẫn `payment_status=paid`. Có nên gọi MISA xuất HĐĐT cho hóa đơn 0đ?

**Options:**
1. **Gửi MISA bình thường** — luật thuế VN: invoice 0đ vẫn legitimate; consistent với non-comp orders. Nhưng tốn MISA quota cho hóa đơn không ai cần.
2. **Skip** — flag `tax_invoice_status='not_required'`, save quota, không gửi MISA cho `total=0`.
3. **Conditional on MST** — nếu khách nhập MST trong invoice form → gửi (khách thực sự cần); không nhập MST → skip.

**Recommend:** Option 3. Khách comp meal hiếm cần HĐĐT; MST nhập = signal khách thực sự cần; matches existing UX (form HĐĐT đã optional).

**Nếu không quyết:** scenario `05.05` cross-flow với `05.03` chưa rõ expected behavior; invoice action có thể fail kỳ lạ với amount=0 nếu MISA sandbox reject.

---

## D5 — Failed-print log: dùng `print_jobs` retry hay table riêng

**Context:** Print job fail (printer offline, agent crash) hôm nay đã có `print_jobs.status='failed'`. Câu hỏi: có cần promote thành table `print_failures` cho "in lại on-demand" UI hay tận dụng schema sẵn?

**Options:**
1. **Reuse `print_jobs`** — query `WHERE status='failed' AND created_at > now() - 7d`; "In lại" enqueue job mới với `original_job_id` link. Simple.
2. **Table riêng `print_failures`** — promotion qua trigger từ `print_jobs.status=failed`; richer schema (recovery_attempts, manual_resolution_note, escalated_to_user_id).

**Recommend:** Option 1. Schema hiện đã đủ cho v1; thêm table = gấp đôi audit point. Upgrade khi volume failed > 100/day hoặc cần workflow phức tạp.

**Nếu không quyết:** scenario hardware-pass dependency không rõ; ảnh hưởng POS-08 hardware pass, không phải Pass 1 software.

---

## Owner answers (fill here)

- [ ] **D1:** _______
- [ ] **D2:** _______
- [ ] **D3:** _______
- [ ] **D4:** _______
- [ ] **D5:** _______

After answering: update `tasks/pos-qa-pass-1.md` Open Questions / P0 spec gap sections, then unblock `09.01` automation work.
