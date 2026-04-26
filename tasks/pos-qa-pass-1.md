# POS QA Pass 1 — Unified Workflow

> Output of 4-agent debate (PM/BA/Sr.Dev/QA) on 2026-04-26.
> Hand this to a tester. Each scenario is independently runnable.

## Executive Summary

**Agreements:** Cash path is critical (open → order → kitchen → pay → close). Multi-order-per-table + cross-terminal realtime + recently shipped Discount/Split/Merge are MUST. Multi-role coverage (cashier/waiter/BM) on every step.

**Decisions:**
- POS-08 — software-only (offline gate, manifest, SW NetworkOnly) IN; printer hardware deferred.
- POS-06 (đánh dấu phục vụ) cut from Pass 1 — UI-only, no money risk.
- All 5 owner decisions resolved 2026-04-26 (`tasks/owner-decisions-pos-pass-1.md`). P0 spec gap on close-shift: closed.

**P0 BLOCKERS — escalate immediately if any fails:** `05.04`, `07.04`, `07.08`, `RT.01`. Historical money-loss / data-corruption / silent-sync paths.

**Automation required before pilot:** `05.03`, `05.04`, `07.04`, `07.08`, `RT.01`, `08.01`, `08.02`, `09.01`.

**Engineering pre-work** (out of QA scope but unblocks runs): D1 + D3 RPC change, D4 invoice orchestrator change — see `tasks/owner-decisions-pos-pass-1.md` follow-up table.

---

## Pre-flight environment

| Requirement | Value |
|---|---|
| Tenant/Branch | 1 tenant, 1 branch with **≥2 active terminals** |
| Menu | ≥10 items, 3 categories, 2 with BoM, 1 with modifiers |
| Tables | ≥1 dine-in zone, ≥6 tables |
| Test users | `cashier_a`, `waiter_b`, `bm_c`, `owner_d` with correct `staff_permissions` |
| Period | NOT soft-closed |
| VietQR / MoMo / MISA | **mock mode** (env flag) — real banking out |
| Payment test harness | VietQR/MoMo tests MUST exercise action/webhook path. Direct DB update fallback is invalid. |
| Skip on dev DB | real MISA push, SMS receipt, printer hardware |

---

## Test script (run in order)

> Format: **Role · Prep · Steps · Expected (UI + DB) · Catches regression · FAIL signal**.
> SQL verification queries are runnable post-action via service role.
>
> Layer tags: **Layer A** = automated regression candidate/requirement; **Layer B** = manual exploratory or concurrency/multi-terminal check; **Blocked** = do not execute as a pass/fail gate until the stated harness/spec gap is closed.

### POS-01 — Mở ca

**01.01 [Layer A] Cashier opens shift (happy)**
- *Cashier* · terminal A no open session · navigate `/br/1/pos`, pick terminal, type `500000`, tap "Mở ca POS".
- ✅ Toast green; redirect to POS shell with "Chốt ca" button. `pos_sessions` row `status=open, opening_cash=500000`.
- 🛑 FAIL: green toast but `pos_sessions` row missing (RLS silent fail).

**01.02 [Layer A] Waiter rides cashier session — no dead-end**
- *Waiter* (only `pos:use`) · cashier session from 01.01 still open · navigate `/br/1/pos`.
- ✅ Skips form; lands on POS main. **No "Chốt ca" button, no F10 active.** No new `pos_sessions` row.
- 📜 Catches: `POS-SESSION-SCOPE-PER-TERMINAL-NOT-PER-USER`, `POS-CLOSE-SHIFT-UI-GATED`.
- 🛑 FAIL: "Chưa có ca mở" dead-end OR "Chốt ca" visible to waiter.

**01.03 [Layer B] Multi-session picker on second terminal**
- *Cashier #2* · 2 terminals A+B both open · navigate `/br/1/pos`.
- ✅ Picker shows both cards, latest-opened first. URL param `?terminal=X` pins session.
- 🛑 FAIL: only one card shown or auto-redirects into wrong session.

### POS-02/03 — Tạo đơn + gửi bếp

**03.01 [Layer A] Dine-in send to kitchen**
- *Waiter* · bàn 5 `available` · tap bàn 5, add 2× sườn + 1× trà, "Gửi bếp".
- ✅ Bàn flips occupied. `orders(order_type=dine_in, status=active, payment_status=unpaid)`, 3 `order_items`, 1 `kds_tickets`, `print_jobs` enqueued.
- 📜 Catches: `POS-MULTI-ORDER-PER-TABLE-NEW-INTENT-EXPLICIT` (RPC must NOT block on `status=available`).
- 🛑 FAIL: "Bàn đã có khách" rejection OR table flips occupied with no `kds_tickets`.

**03.02 [Layer A] Takeaway no-table**
- *Cashier* · switch to "Mang về", add 1× cơm gà, "Gửi bếp".
- ✅ `orders.order_type=takeaway, table_id=NULL`. KDS ticket created.

### POS-04 — Multi-order on same bàn

**04.01 [Layer A] Explicit-occupied flag persistence**
- *Waiter* · bàn 5 has unpaid order from 03.01 · tap bàn 5 → `MultiOrderTablePicker` → "Tạo đơn mới" → add món → **wait 3s** (auto-clear timing trap) → "Gửi bếp".
- ✅ Selection persists through wait. Cart NOT auto-cleared. Submit succeeds. 2nd `orders` row on `table_id=5`.
- 📜 Catches: `POS-MULTI-ORDER-PER-TABLE-NEW-INTENT-EXPLICIT`.
- 🛑 FAIL: cart clears at wait OR RPC rejects "table not available".

**04.02 [Layer A] Append-items idempotency**
- *Cashier* · existing dine-in order with discount 10% · "Thêm món" 1× side 50k.
- ✅ `print_jobs` count for `kind=kitchen` stays at 1 across replay (idempotency key reuse). Discount auto-recomputed.
- 📜 Catches: `POS-DISCOUNT-RECOMPUTE-VIA-HELPER`.

### POS-05 — Thanh toán

**05.01 [Layer A] Cash happy** — order 100k → method=cash → cash_received=100000 → "Đã thanh toán".
- ✅ `payments` row method=cash status=completed; `orders(status=completed, payment_status=paid)`; `tables.status=available`. **Bill sheet auto-closes — no "Hoàn tất và trả bàn" button.**
- 📜 Catches: `PAYMENT-AUTO-COMPLETES-ORDER`, `POS-SERVED-NOT-TABLE-TERMINAL`.

**05.02a [Layer A] VietQR permission gate — waiter NOT blocked at picker** — *Waiter* (`pos:use` only), order 80k → open Bill Sheet → tap `vietqr` tab → tap "Tạo QR".
- ✅ Method tab enabled; "Tạo QR" button clickable; `createPayment` action returns 200 with a payment id (status=pending). No 403.
- 📜 Catches: `POS-CONFIRM-CASH-GATED-BY-POS-CONFIRM-PAYMENT` (waiter NOT blocked from QR creation — only cash gated).

**05.02b [Layer A][Blocked: payment harness] VietQR webhook → completed** — continuation of 05.02a.
- ⚠️ Do not use direct DB `UPDATE payments/orders` fallback. Land `/api/test/confirm-payment` endpoint or replace with an action-level/webhook mock that exercises `confirmPayment` → `confirm_payment_and_post` → `finalize_paid_order`.
- ✅ 1 active payments row vietqr/completed; finalize_paid_order ran; bàn released.
- 📜 Catches: webhook → finalize chain integrity.

**05.03 [Layer A][Expect-defect] Cash zero-total comp meal** — order with 100% pct discount → total=0 → method=cash → cash_received=0 → "Đã thanh toán".
- ⚠️ Current expected result: UI/action rejects before RPC because Bill Sheet gates on `totalAmount > 0` and server action Zod uses `.positive()`. File defect to align UI/Zod with RPC.
- ℹ️ Note for the defect ticket: rule `POS-CASH-ZERO-TOTAL-OK` covers the RPC contract only ("never tighten back to `cash_received <= 0 RAISE`"). The fix belongs at `bill-receipt-sheet.tsx` (`canConfirmPaid`) and `payment-actions.ts` (`cashConfirmSchema`), not at `confirm_cash_payment` RPC — the RPC is already correct.
- ✅ Target expected after fix: `payments(amount=0, status=completed)`; order completed.
- 📜 Catches: `POS-CASH-ZERO-TOTAL-OK`.
- 🛑 FAIL: "cash_received <= 0" raise → cashier locked out of comp meal.

**05.04 [Layer A] ⚠️ P0 — Tab-switch VietQR → Cash (the burned-7-payments scenario)**
- *Cashier* · order 150k no payment row · Bill Sheet → tab `vietqr` → "Tạo QR" (creates pending vietqr row) → switch back to `cash` tab → enter 150000 → tap "Đã thanh toán" → **panic-tap 11 more times**.
- ✅ At most ONE payments row status≠failed. Final: completed/cash. **Zero `duplicate key idx_payments_order_active` errors. No burned IDs.** `orders.payment_method=cash` (cash wrapper updated it).
- 📜 Catches: `POS-PAYMENT-REUSE-UNIQUE-SLOT`.
- 🛑 FAIL: 12× duplicate-key in logs; sequence jumps; `payment_method` still `vietqr`.
- 🔍 SQL: `SELECT count(*) FROM payments WHERE order_id=? AND status<>'failed'` must be ≤1.

**05.05 [Layer A] HĐĐT failure must NOT void payment**
- *Cashier* · order 200k, MISA mocked to throw 500 · fill MST + buyerName → "Đã thanh toán" cash → **edit buyerName while in-flight** → wait for invoice fail.
- ✅ `payments.status=completed` (NOT rolled back); `orders.status=completed`; `tax_invoices.status=failed`. **Submitted MST payload = snapshot at click, not post-edit.** Toast "Đã thu tiền — HĐĐT chưa xuất được, lưu nháp Finance xử lý".
- 📜 Catches: `HDDT-PAYMENT-FIRST-FAILSOFT-ORPHAN`, `HDDT-FORM-PAYLOAD-FREEZE-AT-CLICK`.

### POS-07 — Hủy / Discount / Split / Merge

**07.01 [Layer A] Cancel item with auto-waste non-fatal** — *Cashier* · waste mocked to throw permission error · swipe item → "Hủy món" → reason ≥3 chars.
- ✅ `order_items.status=void`; void succeeds. Yellow toast "auto-waste lỗi, admin sẽ xử lý".
- 📜 Catches: `AUTO-WASTE-NON-FATAL`.

**07.02 [Layer A] % discount + cart edit recompute** — order 100k → "Giảm giá" pct/10/"Khách quen" → verify total 90k → append side 50k → "Gửi bếp" → re-open Bill.
- ✅ `discount_amount=15000` (10% of 150k); `discount_type=pct, discount_value=10` unchanged; `total_amount=135000`.
- 📜 Catches: `POS-DISCOUNT-RECOMPUTE-VIA-HELPER`, `POS-DISCOUNT-PAIRED-NOTE-MIN-3`.

**07.03 [Layer A] Clear discount** — "Bỏ giảm giá".
- ✅ All 4 `discount_*` cols NULL atomically; `discount_amount=0`.

**07.04 [Layer A] ⚠️ P0 — Split preserve non-empty** — order with 2 items → tách → move BOTH (would empty source).
- ✅ Submit disabled with hint "còn lại 0 món". RPC never fires. If forced: raises `22023 split_would_empty_source`. NO new `print_jobs` for kitchen.
- 📜 Catches: `POS-SPLIT-PRESERVE-NON-EMPTY`, `POS-SPLIT-IN-PLACE-NO-REPRINT`.
- 🔍 SQL: `SELECT count(*) FROM print_jobs WHERE order_id IN (src,new) AND kind='kitchen'` unchanged after split.

**07.05 [Layer A] Merge same-table dine-in (happy)** — bàn 5 with 2 unpaid no-discount orders A+B → A → "Gộp đơn" → target B.
- ✅ Items move A→B in place (same row IDs). `A.merged_into_order_id=B.id`. KDS tickets follow. NO kitchen reprint.

**07.06 [Layer A] Merge cross-table MUST reject** — A on bàn 5, B on bàn 7 → picker `fetchSiblingOrdersForTable` returns empty for cross-table.

**07.07 [Layer A] Merge with % discount on either side MUST reject** — A pct 10%, B unpaid → destructive banner; submit disabled. Forced RPC raises `merge_pct_discount_blocked`. Variant: VND on both → cộng dồn into target, notes concat, auto-clamp.
- 📜 Catches: `POS-MERGE-PCT-DISCOUNT-BLOCK`.

**07.08 [Layer A + B] ⚠️ P0 — Cross-merge deadlock check** — 2 cashiers, 2 tabs, fire `merge(A→B)` and `merge(B→A)` within 50ms.
- ✅ One wins, the other queues then no-ops. **NO `40P01 deadlock detected` in `pg_log`.**
- 📜 Catches: `POS-MERGE-LOCK-LEAST-FIRST`.

### POS-08 — Software offline / SW

**08.01 [Layer A] Offline payments fully blocked; non-cash picker rejected** — DevTools → offline → tap vietqr tab, then attempt cash confirm.
- ✅ Non-cash method tap early-returns with offline toast. Cash confirm is also blocked while offline (`canConfirmPaid` gated by `isOnline`). **Any payment POST hits NetworkOnly rule, NEVER served from cache.**
- 📜 Catches: `PWA-OFFLINE-GATE-CASH-ONLY`, `PWA-SW-NETWORKONLY-MUTATIONS`.
- 🛑 FAIL: cached "Đã thanh toán" without RPC ran (silent double-charge).

**08.02 [Layer A] Manifest branchId integrity** — GET `/br/123abc/pos/manifest.webmanifest`.
- ✅ 404/rejects (not naive parseInt).
- 📜 Catches: `PWA-MANIFEST-BRANCHID-INTEGER`.

### POS-09 — Đóng ca

**09.01 [Layer A] Cashier closes shift (clean — no active orders)** — no live orders on session → header "Chốt ca" or F10 → enter closing cash matching expected → confirm.
- ✅ `pos_sessions(status=closed, closed_at, variance=0)`. Redirect to summary; new POS load shows fresh "Mở ca" form.
- 📜 Rule: per D1 2026-04-26.

**09.01-carry [Layer A] Close shift with active unpaid order — carry forward** — leave 1 dine-in order in `status=active, payment_status=unpaid` on the open session → close the shift → cashier #2 opens a new shift on same terminal.
- ✅ Close succeeds without blocking. `pos_sessions(status=closed, expected_cash = opening_cash + SUM(paid orders)`, **unpaid order NOT counted**, `variance ≈ 0` if cash matches paid revenue).
- ✅ The unpaid order is still visible in cashier #2's order list after they open the new shift. When cashier #2 takes payment for it, that revenue counts toward the **new** shift's `expected_cash`, not the closed one.
- 📜 Rule: per D1 2026-04-26 (Option 2 + paid-only filter on `expected_cash`).
- 🛑 FAIL: close blocked with active orders (regression to old "block" semantics); OR `expected_cash` includes unpaid (variance shows fake −200k); OR unpaid order disappears / orphans on close.

**09.01-variance [Layer A] Variance approval at threshold** — close shift with `|cash_difference|` deliberately above `max(50.000đ, 0.5% × expected_cash)`.
- ✅ "Chốt ca" demands BM PIN + note ≥10 chars before commit. Below threshold: closes silently.
- 📜 Rule: per D3 2026-04-26.

**09.02 [Layer A] Waiter cannot close** — inspect DOM, press F10, force-fire `closePosSession` from devtools.
- ✅ Button absent. F10 no-op. Server rejects with 403 (`POS_CLOSE_SHIFT`).
- 📜 Catches: `POS-CLOSE-SHIFT-UI-GATED`.

### Cross-cutting realtime

**RT.01 [Layer A + B] ⚠️ P0 — A→B sync within 2s** — 2 terminals on POS main, A creates order → B sees in <2s.
- 🔍 Pre-check: `SELECT claims_role FROM realtime.subscription` is NOT `anon` for B's row.
- 📜 Catches: `REALTIME-AWAIT-AUTH-BEFORE-SUBSCRIBE`, `REALTIME-PUB-NEEDS-REPLICA-IDENTITY-FULL`.
- 🛑 FAIL: B reports `SUBSCRIBED` but no row arrives (anon JWT pinned at subscribe); OR DELETE/cancel events lost (replica identity not FULL → `branch_id` missing from payload).

**RT.02 [Layer A + B] Disconnect-reconnect resync** — B offline 30s → A voids item → B back online.
- ✅ B's `useOrderSync` second `SUBSCRIBED` event triggers fresh snapshot fetch within 2s. Voided item reflects.
- 📜 Catches: `REALTIME-SUBSCRIBE-NEEDS-STATUS-CALLBACK`.
- 🛑 FAIL: stale state until 12-30s polling kicks in (or never).

---

## Exit criteria (hard gates)

1. All 7 included flows pass on **2 terminals × 3 roles** matrix.
2. Cross-terminal realtime: 5 consecutive add/edit cycles propagate <2s, zero stale UI.
3. Multi-order-per-table + split + merge: 3 scripted scenarios green.
4. ACL denial fires for **every** role × forbidden action pair (no silent allow).
5. Zero P0 (cash mismatch, ghost orders, double payment) and ≤2 P2 issues filed.
6. Layer A automation exists for: `05.03`, `05.04`, `07.04`, `07.08`, `RT.01`, `08.01`, `08.02`, `09.01` (or a documented blocker remains for `09.01` until owner resolves the spec gap).

---

## Decided by owner 2026-04-26

Full context in `tasks/owner-decisions-pos-pass-1.md`. TL;DR:

1. **D1** Close-shift with active orders — **Allow + carry forward**. `expected_cash` filters `payment_status='paid'` only; unpaid orders live across sessions.
2. **D2** Comp meal (total=0) — **No additional gate**; discount note ≥3 chars suffices.
3. **D3** Variance threshold — `max(50.000đ, 0.5% × expected_cash)` → BM PIN + note ≥10 chars.
4. **D4** HĐĐT for total=0 — **Conditional on MST**; no MST → skip MISA + `tax_invoices.status='not_required'`.
5. **D5** Failed-print log — **Reuse `print_jobs.status='failed'`** + 7-day query window; "In lại" links via `original_job_id`.

## Confirmed by code (no longer open)

1. Last-item void auto-cancels the whole order and releases bàn through terminal order status (`07.01`).
2. Waiter VietQR/MoMo confirm is intentionally allowed with `pos:use`; cash remains gated by `pos:confirm_payment` (`05.02`).
3. Payments idempotency currently relies on partial unique `idx_payments_order_active` plus row reuse; there is no separate payments idempotency-key column (`05.04`).

---

## References

- Regression rules cited: `tasks/regressions.md`
- POS flow inventory: `docs/user-guides/pos/flow-index.md`
- Existing e2e harness: `apps/web/e2e/` (specs + `guides/_lib/fixtures.ts`)
- Recent migrations: `supabase/migrations/20260430*_pos_*.sql`, `20260428200000_fix_confirm_cash_payment_method_swap.sql`, `20260428210000_pos_confirm_payment_permission.sql`, `20260429100000_transfer_order_table_allow_occupied.sql`, `20260426030000_auto_complete_paid_order.sql`
