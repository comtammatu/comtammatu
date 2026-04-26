# POS Pass 1 — Owner Decisions Required

> Audience: project owner (Ma Tu).
> Goal: 5 decisions in 1 sync, batched. Estimate ~25 phút.
> Output: each row gets a written answer in this file → updates `tasks/pos-qa-pass-1.md` "Open questions" section.

## TL;DR — DECIDED 2026-04-26

| # | Decision | Owner answer |
|---|---|---|
| D1 | Close shift while active orders exist | **Allow + carry forward** (đơn unpaid live qua ca sau); `expected_cash` filter `payment_status='paid'` |
| D2 | Comp meal (total=0) — note + approval gate | **No additional gate** (discount note ≥3 chars là đủ) |
| D3 | Variance threshold for close-shift approval | **Combo `max(50.000đ, 0.5% × expected_cash)`** → BM approval + note ≥10 chars |
| D4 | HĐĐT for total=0 (comp meal) | **Conditional on MST** — MST nhập → gửi MISA; không nhập → skip + flag `tax_invoice_status='not_required'` |
| D5 | Failed-print log: retry via `print_jobs` vs new table | **Reuse `print_jobs.status='failed'`** + query last 7d; "In lại" enqueue job mới với `original_job_id` link |

**Pass 1 status:** all blockers resolved. `09.01` automation unblocked. Engineering follow-up tasks listed at bottom.

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

## Owner answers — recorded 2026-04-26

- [x] **D1 — Option 2 + technical filter:** Cashier có thể "Chốt ca" trong khi còn đơn `active/preparing/served/unpaid`; đơn vẫn live, ca sau (next opener) nhìn thấy đơn. `close_pos_session` RPC sẽ filter `payment_status='paid'` khi tính `expected_cash` → đơn unpaid không tính vào ca đang close, tự cộng vào ca pay sau. Không cần BM PIN override; không cần block.

- [x] **D2 — Option 1:** Comp meal (total=0) đi qua bình thường. Discount note ≥3 chars (đã enforce ở `apply_order_discount` constraint) là audit trail đủ. Không thêm gate ở payment confirm; không cần BM approval; không cần audit-only flag riêng.

- [x] **D3 — Option 3:** Variance threshold = `max(50.000đ, 0.5% × expected_cash)`. Khi `|cash_difference|` vượt threshold → "Chốt ca" yêu cầu BM PIN + note ≥10 chars trước khi commit. Dưới threshold → close bình thường, variance vẫn được record.

- [x] **D4 — Option 3:** HĐĐT chỉ gửi MISA khi khách nhập MST trong invoice form. Không nhập MST → skip MISA call + set `tax_invoices.status='not_required'`. Áp dụng cho mọi total bao gồm total=0 (comp meal). Logic này nằm ở action layer (`createTaxInvoice` / orchestrator `confirmCashPaymentWithInvoice`), không phải RPC.

- [x] **D5 — Option 1:** Failed-print recovery dùng `print_jobs.status='failed'` thẳng. Admin UI query `WHERE status='failed' AND created_at > now() - interval '7 days'`. "In lại" enqueue job mới với column `original_job_id` link về fail row. Không tạo table `print_failures` riêng. Re-evaluate khi volume failed > 100/day.

---

## Engineering follow-up (separate from Pass 1 QA)

Mỗi decision sinh ra implementation work; không thuộc Pass 1 QA scope.

| # | Migration / change required | Priority |
|---|---|---|
| D1 | Edit `close_pos_session` RPC: SUM filter `AND payment_status='paid'`; add docs comment "carry-forward semantics per owner D1 2026-04-26" | P1 — unblocks 09.01 automation |
| D3 | Add `pos_sessions.variance_approver_user_id BIGINT NULL`, `variance_approval_note TEXT NULL`; UI gate at variance > threshold demands BM PIN | P1 — same PR as D1 nice |
| D4 | Edit `createTaxInvoice` orchestrator: short-circuit when `buyer_tax_id IS NULL`, mark `tax_invoices.status='not_required'`; UI shows "Không xuất HĐĐT (khách không nhập MST)" | P2 |
| D5 | Add `print_jobs.original_job_id BIGINT NULL REFERENCES print_jobs(id)`; admin "In lại" enqueue helper | P2 — defer to printer-hardware pass |
| D2 | None — already enforced by `orders_discount_metadata_paired` constraint | — |

**Recommend:** PR D1+D3 cùng một change (close-shift semantics tổng thể). PR D4 riêng. PR D5 cùng printer-hardware pass.
