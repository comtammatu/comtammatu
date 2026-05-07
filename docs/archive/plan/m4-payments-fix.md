> ARCHIVED 2026-05-07 — In-place sprint; capability port in PROGRAM-READINESS.md §3 + 05-MODULE-CATALOG.md (Finance)

# M4 Payments Fix — Pre-Pilot Plan

> Created: 2026-04-28. Author: 4-perspective synthesis (PM/BA/Architect/Critic).
> Source: pre-pilot security review 2026-04-27 (5 P0 + 5 P1 in `tasks/todo.md`).
> Owner: Sr. Dev. Status: AWAITING IMPLEMENTATION.

## 0 · Why this plan exists

The `/cso` security audit on M4 Payments uncovered correctness gaps that make the cash + mock-VietQR/Momo flow unsafe to expose to a real chi nhánh:

- Refund flow flips a status flag but does not actually move money, restore stock, or post a GL reversal.
- MoMo webhook trusts `provider_ref` for tenant scope — single leaked `MOMO_SECRET_KEY` plus an order-ref collision is enough to forge a "paid" state in any tenant.
- Stock consumption silently fails on the payment hot path (commit `20260427130252_payment_stock_consumption_failsoft.sql` made it `BEGIN…EXCEPTION`).
- Server never recomputes `total_amount` at payment time — discounts and modifiers can be tampered before charge.
- Refund authorization has an `area_manager` scope hole and never checks `payment.status='completed'`.

Pilot is BLOCKED until the SHIP set below lands.

---

## 1 · Scope decision matrix (PM)

Each issue ranked SHIP / DEFER-WITH-MITIGATION / DEFER-AS-IS. Pilot constraint: 1 chi nhánh, < 5 nhân viên, cash-only path is in production today; VietQR/Momo are mock until real merchant credentials arrive.

| # | Issue | Decision | Rationale |
|---|---|---|---|
| P0-1 | `approveRefund` no GL/stock/payment-state RPC | **SHIP** | Refund table now exists (commit `7c8e635`); shipping the storage but not the reversal is worse than not having refunds at all. Pilot manager will trigger refund expecting money to flow back. |
| P0-2 | MoMo webhook tenant binding hole | **SHIP** | Single-tenant pilot does not feel the cross-tenant vector immediately, but the regression rule must land before tenant 2 onboards. Cost is ~30 LOC + verify path; cost of forgetting is total compromise of payments table. |
| P0-3 | Stock consumption fail-soft hot-path | **SHIP** | The `failsoft` migration shipped 4 days ago to unblock POS. Now the safety net is missing — webhook (Momo path) does not differentiate "paid + stock OK" from "paid + stock failed". Cashier and inventory diverge silently. Replace with explicit `stock_consumed_status` enum + alert path. |
| P0-4 | Server-recompute `total_amount` missing | **SHIP** | Pilot will exercise discounts (commit `20260430000000_pos_discount.sql`) and modifiers. A waiter editing `discount_amount` directly is a real attack surface, not theoretical. |
| P0-5 | Refund auth `area_manager` scope hole + `payment.status='completed'` precondition | **SHIP** | Both are ~5-LOC fixes; bundling with P0-1 because they live in the same file. |
| P1-A | Webhook idempotency table missing | **SHIP** | Free win once we touch the webhook for P0-2. Five extra lines of migration. |
| P1-B | POS calls provider before DB lock | **DEFER-WITH-MITIGATION** | Real risk only matters once real Momo credentials wire up. Mitigation now: log-and-alert on orphan-gateway-order vs orphan-DB-row mismatch in cleanup_abandoned_payments. Re-open before real Momo go-live. |
| P1-C | `payments` RLS does not honor `area_manager` scope | **DEFER-AS-IS** | Pilot has 1 chi nhánh. `area_manager` is not seeded for pilot tenant. Re-open at chi nhánh #2 onboarding. |
| P1-D | `console.error` leaks raw RPC error.message | **SHIP** | CLAUDE.md hard-rule violation. ~3 LOC: redact `error.message`, log only `error.code` + `rpc_name`. |
| P1-E | `branch_manager` with null `branch_id` widens to tenant-wide writes | **SHIP** | One guard at `withAction` level — safer than auditing every action. |

**MVP scope** = P0-1 .. P0-5 + P1-A + P1-D + P1-E. Targets: 8 fixes, 3 migrations, ~7 file edits.

### Acceptance criteria per SHIP fix

**P0-1 (refund reversal):**
- Manager X clicks "Phê duyệt hoàn tiền" on refund Y for cash payment Z (200,000 ₫).
- After click: `payments.id=Z` row has `status='refunded'`; one new `journal_entries` row debits revenue + credits cash for 200,000 ₫; `stock_movements` row of `type='refund_restore'` reverses the consume; `orders.id=Y.order_id` has `payment_status='refunded'`; `audit_logs` row records reverser, refund_id, before/after JSON.
- If ANY of those fails → entire refund is rolled back, manager sees a precise error (not "Không thể cập nhật"), refund row stays `status='approved'`-pending-reversal.
- Negative test: cashier (no `orders:refund-approve` permission) cannot trigger reversal.

**P0-2 (MoMo tenant binding):**
- Webhook payload missing `partnerCode` → 401 (do not silently process).
- Webhook payload `partnerCode != MOMO_PARTNER_CODE` env value → 401.
- Webhook payload `extraData` decoded JSON missing `tenant_id` field → 401.
- Webhook tenant in `extraData` ≠ payments row tenant_id → 401.
- Negative test: replay an old webhook signed with the real key but for tenant 1 against tenant 2 → 401.

**P0-3 (stock consume status):**
- After webhook completes, return `{stock_consumed: false, stock_error_code: ...}` causes webhook handler to RETURN 500 (not 200), preventing MoMo from marking order "settled" in their dashboard while we have no stock.
- Cashier sees toast "Thanh toán đã ghi nhận, tồn kho đang chờ kiểm tra" in cash path; admin gets `notifications` row of severity=`high`.
- Reconciliation report at `/admin/finance` shows count of payments where `stock_consumed=false`, with drilldown.

**P0-4 (server-recompute):**
- POS submits payment with `amount = X`. Server computes `recomputed_total = SUM(item.qty * item.price_at_order) - order.discount_amount + order.service_charge + order.tax_amount` (formula from `docs/ref/business-context.md` if present, else codified here).
- If `abs(amount - recomputed_total) > 1` (₫1 rounding) → reject with `amount_mismatch_recomputed` code.
- Comp/staff-meal orders: `recomputed_total=0`, `amount=0` accepted.
- Item price changed in menu after order submitted: use `price_at_order` from `order_items`, not `menu_items.price`.

**P0-5 (refund auth):**
- `area_manager` cannot create refund for branch outside their `area_branches` mapping.
- Refund creation rejects if `payment.status != 'completed'`.

**P1-A (webhook idempotency):**
- Same `request_id` arriving twice → second call returns 200 with cached result, no DB writes.
- Different `request_id` for same payment but different `amount` → second call rejects (already in terminal state).

**P1-D (error log):**
- Production logs contain only `{rpc: 'create_payment', code: 'PGRST116', branch_id: 5}` — never the full error message string.

**P1-E (manager null branch_id):**
- `withAction` for any role-restricted to `branch_manager` rejects if `claims.branch_id == null` with code `branch_scope_unset`.

### Sequencing

```
Round 1 (parallel — 1 migration each):
  M1: refunds_reverse_rpc.sql               (RPC + permission key + journal-entry posting rule)
  M2: webhook_events.sql                    (idempotency table + RLS)
  M3: payment_stock_consumed_status.sql     (replace failsoft with status enum)

Round 2 (sequential, depends on M1+M2):
  Edit refund-actions.ts                    (P0-1 + P0-5 — bundle)
  Edit api/webhooks/momo/route.ts           (P0-2 + P0-3 + P1-A — bundle)
  Edit payment-actions.ts                   (P0-4 + P1-D + P1-E)

Round 3 (after Round 2 verified):
  Add regression rules                      (REFUND-MUST-REVERSE-ATOMICALLY etc.)
  Update tasks/todo.md                      (clear P0 items, leave deferred ones)
  Smoke runbook update                      (docs/runbooks/payments/pre-pilot-qa.md — new file)
```

### Pilot kill-switch

| Fix | Kill-switch |
|---|---|
| P0-1 refund reversal | `REFUNDS_ENABLED=false` env var → admin UI hides "Phê duyệt", action returns `feature_disabled`. Existing pending refunds stay `pending`. |
| P0-2/P1-A webhook | `MOMO_WEBHOOK_STRICT_TENANT=false` env var → fall back to old behavior, log a `notifications` row of severity=`critical` whenever entered (never default `false`). |
| P0-3 stock status | `STOCK_CONSUME_STRICT=false` env var → revert to fail-soft 200. Same notifications alert on use. |
| P0-4 server-recompute | `PAYMENT_AMOUNT_RECOMPUTE=false` env var → trust client amount (current behavior). Never default `false`. |
| P0-5 + P1-E refund auth | No kill-switch — these are pure tightening, cannot revert without re-introducing the hole. |
| P1-D error log | No kill-switch. |

### Out-of-scope (explicit non-goals)

- Real VietQR/Momo merchant API wiring — blocked on credentials per roadmap P1/P2/P3.
- HĐĐT cancellation triggered by refund — separate ticket; current pilot uses cash-only HĐĐT, refund flow does not currently issue HĐĐT.
- Atomic `complete_payment_and_consume_stock` for Momo (P5 in roadmap) — already shipped (`20260423070000`); only the webhook-side check is missing.
- VietQR Supabase realtime listener (P4 in roadmap) — depends on real VietQR.
- Refund partial-method routing (50% cash + 50% Momo) — pilot accepts only single-method payments.
- Cross-period refund (refund triggered after GL period soft-closed) — Critic flag below; deferred to post-pilot M6 enhancement.

---

## 2 · Business rules (BA)

### Refund flow

**Create refund (action `createRefund`):**
- Order must be in status `completed` (not `pending`, `cancelled`, `void`).
- Payment must be in status `completed` (not `pending`, `failed`, `refunded`). NEW PRECONDITION.
- Time window: same business day OR within 7 calendar days (configurable per tenant via `system_settings.refund_window_days`, default 7). Older = block at action with code `refund_window_expired`.
- Cashier may create refund only for own branch. Branch manager may create. Area manager may create only for branches in own `area_branches`. Owner/super_manager: any branch in tenant.
- `amount` may be partial (less than `payment.amount`) but must be > 0.
- `reason` minimum 5 chars (already enforced by schema), max 500.

**Approve refund (action `approveRefund`):**
- Only owner/super_manager may approve. Branch manager CANNOT — escalation enforced by design.
- Refund must be `status='pending'`. Idempotent: approving a `status='approved'` refund returns success without re-running RPC.
- Approval triggers RPC `reverse_payment_and_post(p_refund_id)`. Atomic in one transaction:
  1. SELECT FOR UPDATE the refund row.
  2. SELECT FOR UPDATE the payment row.
  3. Verify payment.status='completed' (re-check; could have been refunded between create and approve).
  4. Verify refund.amount ≤ payment.amount - already-refunded total.
  5. UPDATE payments.status to 'refunded' if amount = payment.amount, else 'partially_refunded'.
  6. INSERT journal_entries: Debit `5111 Doanh thu bán hàng` (or refund-specific account 5111x), Credit `1111 Tiền mặt` (cash) or `1121 Tiền gửi ngân hàng` (VietQR/Momo). Use existing posting-rules pattern.
  7. INSERT stock_movements: type='refund_restore', for each `order_items` of the order, restore quantity * recipe coefficient, BUT only if stock had been consumed (`payments.stock_consumed=true`). If stock was never consumed, skip stock step.
  8. UPDATE orders.payment_status to 'refunded' or 'partially_refunded'.
  9. INSERT audit_logs: action='refund.approve', entity_type='refund', entity_id, old_data={status:'pending'}, new_data={status:'approved'}, user_id.
- On any step failure → ROLLBACK. Refund stays `status='pending'`, manager sees specific error code.

**Reject refund (action `approveRefund(approved=false)`):**
- Owner/super_manager only.
- Update refund.status = 'rejected', approved_by=current user.
- Audit log row.
- No GL/stock/payment changes.

**Partial refund:**
- Multiple refund rows may exist per payment. Sum of `amount` where `status='approved'` ≤ payment.amount.
- Order stays `payment_status='completed'` until full amount refunded → `payment_status='refunded'`.
- Stock restore: per-item. UI sends `refund_items: [{order_item_id, qty}]`. RPC restores only those rows. (Schema extension — `refund_line_items` table or JSON column on `refunds`. Architect picks.)
- For pilot v1: ACCEPT FULL-AMOUNT REFUND ONLY. Partial-item refund deferred to v1.1. Document this constraint in UI ("Hoàn tiền cả đơn — chưa hỗ trợ hoàn từng món").

**Multi-method payment:**
- Pilot DEFERS — accepts only single-method orders. Schema already supports multi-payment but UI does not. Add server-side guard: `createRefund` rejects with `multi_method_unsupported` if order has > 1 payment row. Reopen post-pilot.

**HĐĐT impact:**
- If `tax_invoices` row exists for this order with status in (`issued`, `published`): refund must trigger HĐĐT cancellation per NĐ70/2025. NOT IN SCOPE for pilot v1 — pilot uses cash-only HĐĐT manual flow. Block refund creation if tax_invoice is in `issued`/`published` state with error `refund_blocks_on_invoiced_order`. Manager will manually cancel HĐĐT first via existing flow, then retry refund.

### Stock fail-soft handling (P0-3)

**Current state:** `complete_payment_and_consume_stock` returns `{success: true, stock_consumed: BOOLEAN, stock_error: TEXT}`. Webhook + cash path both ignore `stock_consumed`.

**New contract:**
- Webhook (Momo): if `stock_consumed=false` → return HTTP 500 to MoMo. MoMo will retry; meanwhile create a `notifications` row of severity=`high` for branch manager + admin.
- Cash path (`confirmCashPayment`): if `stock_consumed=false` → succeed the payment (cashier already took cash, undoable damage), but show toast "Đã ghi nhận thanh toán. Tồn kho cần kiểm tra thủ công." and create the same notification.
- Distinction: `stock_error_code` enum (NEW column on payments? Or returned in provider_data? Architect picks):
  - `out_of_stock` — ingredient quantity insufficient. Manager alert.
  - `recipe_missing` — order item has no recipe. Data-quality alert.
  - `internal_error` — unexpected exception. Engineering alert.
- Reconciliation: `/admin/finance` shows a card "Thanh toán có tồn kho lệch (Y rows)" with drilldown.

### Server-recompute formula (P0-4)

```
recomputed_subtotal = SUM(order_items.qty * order_items.price_at_order)
                    + SUM(order_items.modifier_surcharge_at_order)  -- if modifier exists
recomputed_total = recomputed_subtotal
                 - order.discount_amount
                 + order.service_charge
                 + order.tax_amount

ALLOWED_ROUNDING = 1 ₫
if abs(payment.amount - recomputed_total) > ALLOWED_ROUNDING:
    REJECT with code 'amount_mismatch_recomputed'
```

- `price_at_order` is captured at order_items insert time — not affected by later menu price changes.
- Discount applied BEFORE service charge and VAT (Vietnamese F&B convention).
- VAT 10% on (subtotal - discount + service_charge).
- Comp/staff-meal: order.is_comp=true → recomputed_total=0; payment.amount must be 0.
- Modifier prices: stored per order_item; recompute uses stored value not current modifier price.

### MoMo cross-tenant minimum contract

Required env vars:
- `MOMO_PARTNER_CODE` (per tenant)
- `MOMO_ACCESS_KEY` (per tenant)
- `MOMO_SECRET_KEY` (per tenant)

Webhook validation order:
1. HMAC valid (existing — `verifyWebhookSignature`).
2. `payload.partnerCode === process.env.MOMO_PARTNER_CODE`.
3. `payload.extraData` is a base64 JSON object decodable, containing `{tenant_id: number}`.
4. SELECT payments WHERE provider_ref=payload.orderId AND tenant_id=extraData.tenant_id AND method='momo'. Single row required.
5. `payload.amount === payments.amount`.
6. `webhook_events` table: INSERT (provider, request_id, payload). On UNIQUE conflict → return 200 cached result.
7. Call RPC.

For multi-tenant (post-pilot): per-tenant secret key resolved via tenant_id from a `payment_provider_credentials` table (exists or to be added; out of scope for this fix).

### Authorization matrix (refund)

| Action | Cashier | Branch Manager | Area Manager | Owner / Super Manager |
|---|---|---|---|---|
| Create refund (own branch) | ✓ | ✓ | ✓ (within `area_branches`) | ✓ |
| Create refund (cross-branch) | ✗ | ✗ | ✗ (outside `area_branches`) | ✓ |
| Approve refund | ✗ | ✗ | ✗ | ✓ |
| Reject refund | ✗ | ✗ | ✗ | ✓ |
| View refunds (own branch) | ✓ | ✓ | ✓ | ✓ |
| View refunds (cross-branch) | ✗ | ✗ | ✓ (within area) | ✓ |

Permission keys involved: `orders:refund` (create), `orders:refund-approve` (NEW — to add to `permission_keys` catalog and seed for owner/super_manager templates).

### Compliance hooks

- **NĐ70/2025 HĐĐT:** if order has issued tax_invoice, refund must NOT proceed without invoice cancellation. Block at creation.
- **VAS chart of accounts:** refund journal entry uses VAS-compliant accounts (5111, 1111, 1121). Existing `posting_rules` already define these — reuse.
- **BHXH/PIT:** N/A — payments module does not touch payroll.

---

## 3 · Architecture (Sr. Dev)

### RPC inventory

#### `public.reverse_payment_and_post(p_refund_id BIGINT) RETURNS JSONB` (NEW)
- SECURITY DEFINER, owner-only via `has_permission_any('orders:refund-approve')`.
- In transaction:
  1. SELECT refunds FOR UPDATE WHERE id=p_refund_id AND tenant_id=auth_tenant_id().
  2. SELECT payments FOR UPDATE WHERE id=refund.payment_id AND tenant_id=refund.tenant_id.
  3. SELECT orders FOR UPDATE WHERE id=refund.order_id.
  4. Verify payment.status='completed', refund.status='pending'.
  5. UPDATE payments.status = CASE WHEN refund.amount = payment.amount THEN 'refunded' ELSE 'partially_refunded' END.
  6. SELECT FROM posting_rules WHERE event_type='refund_approve' — get GL accounts.
  7. INSERT journal_entries with computed lines (Dr revenue, Cr cash/bank).
  8. IF payment.stock_consumed = TRUE: PERFORM `restore_stock_for_order(refund.order_id, p_actor_id)`.
  9. UPDATE orders.payment_status accordingly.
  10. UPDATE refunds.status='approved', approved_by, approved_at.
  11. INSERT audit_logs.
- Return: `{success: true, refund_id, journal_entry_id, stock_restored: boolean, payments_new_status, orders_new_status}`.
- Error codes: `payment_not_completed`, `refund_window_expired`, `tax_invoice_must_cancel_first`, `multi_method_unsupported`, `concurrent_modification` (rollback).

#### `public.restore_stock_for_order(p_order_id BIGINT, p_actor_id UUID) RETURNS JSONB` (NEW)
- SECURITY DEFINER, internal-only (REVOKE EXECUTE FROM authenticated; only callable from `reverse_payment_and_post`).
- For each `order_items` × recipe ingredient: INSERT stock_movements type='refund_restore', positive quantity. NO consumption check on `stock_levels` (we already deducted; restoring may go above pre-order level — that's correct).
- Return: `{stock_movements_created: N, items: [...]}`.

#### `public.create_refund(p_payment_id BIGINT, p_amount NUMERIC, p_reason TEXT) RETURNS JSONB` (NEW — replaces direct insert in `refund-actions.ts`)
- SECURITY DEFINER, gated by `has_permission(branch_id, 'orders:refund')`.
- Validates: order status, payment status, refund window, amount ≤ payment.amount minus prior refunds, tax_invoice not issued.
- Verifies area_manager scope by joining `area_branches`.
- INSERT refunds row.
- INSERT audit_logs.
- Return `{refund_id}` or error code.

#### `public.confirm_cash_payment(...)` (existing — modified)
- Add server-recompute step BEFORE updating payment row.
- Add `stock_consumed_status` enum return value (replaces boolean `stock_consumed`).

#### `public.complete_payment_and_consume_stock(...)` (existing — modified)
- Add server-recompute step.
- Replace `stock_consumed BOOLEAN` return with `stock_consumed_status TEXT` enum (`ok`, `out_of_stock`, `recipe_missing`, `internal_error`). Migration backfills enum from boolean.

### Migration plan

| File | Purpose |
|---|---|
| `20260506000000_refund_reversal_foundation.sql` | Add `payments.stock_consumed_status TEXT`, `payments.refund_window_days_at_payment INT`, `refunds.approved_at TIMESTAMPTZ`, `orders.payment_status` enum extension to include `partially_refunded`. Add `permission_keys` row for `orders:refund-approve` and seed into owner/super_manager role templates. |
| `20260506010000_restore_stock_rpc.sql` | RPC `restore_stock_for_order`. REVOKE EXECUTE FROM authenticated. |
| `20260506020000_reverse_payment_and_post_rpc.sql` | RPC `reverse_payment_and_post`. Calls `restore_stock_for_order` internally. GRANT EXECUTE TO authenticated (gated via `has_permission_any('orders:refund-approve')` inside). |
| `20260506030000_create_refund_rpc.sql` | RPC `create_refund` replacing direct INSERT. |
| `20260506040000_webhook_events_table.sql` | `webhook_events(id, provider TEXT, request_id TEXT, tenant_id BIGINT, payment_id BIGINT, payload JSONB, processed_at, UNIQUE(provider, request_id))`. RLS: SELECT for owner/super_manager only. INSERT only via service-role. |
| `20260506050000_payment_recompute_total.sql` | Modify `confirm_cash_payment` and `complete_payment_and_consume_stock` to recompute total before updating payment status. Returns enum `stock_consumed_status` instead of boolean. |
| `20260506060000_posting_rule_refund_approve.sql` | INSERT posting_rules row for `event_type='refund_approve'` mapping to Dr 5111 / Cr 1111 (cash) or 1121 (transfer/momo). |

Apply via `supabase db push` per memory `feedback_claude_applies_migrations.md`.

### Code changes per file

| File | Change |
|---|---|
| `apps/web/app/orders/refund-actions.ts` | `createRefund`: replace `.insert()` with `supabase.rpc('create_refund', ...)`. Add `area_manager` scope branch (verify via `area_branches`). Add `payment.status='completed'` check. `approveRefund`: replace status flip + payment update with single `supabase.rpc('reverse_payment_and_post', ...)`. Map error codes to user-facing strings via `ERRORS_VI`. |
| `apps/web/app/api/webhooks/momo/route.ts` | Validation order: HMAC → partnerCode → extraData.tenant_id → payments lookup with tenant_id → amount match → idempotency check → RPC call. On `stock_consumed_status != 'ok'` from RPC → return 500. On idempotency hit → return 200 cached. |
| `apps/web/app/br/[branchId]/pos/payment-actions.ts` | Replace `console.error("[createPayment] rpc failed:", msg)` with `console.error('[createPayment] rpc failed', { rpc: 'create_payment', code: rpcError.code, branch_id })`. Same for confirm path. Add `branch_manager` null `branch_id` early-return. Make recompute call in `confirm_cash_payment` (server-side; client still sends amount for display, server overrides). |
| `apps/web/app/_lib/with-action.ts` | Add option `requireBranchScope: boolean` — when true and `claims.branch_id == null` for branch-restricted role, return `branch_scope_unset`. Apply to refund + payment actions. |
| `packages/shared/src/messages/errors.ts` | Add error keys: `payment.amount_mismatch_recomputed`, `refund.window_expired`, `refund.invoice_must_cancel_first`, etc. |
| `apps/web/app/admin/finance/payment-stock-divergence-card.tsx` | NEW component. Shows count of `payments.stock_consumed_status != 'ok'` with drilldown. |

### Webhook hardening contract (MoMo)

```
POST /api/webhooks/momo
  ├─ Step 1: HMAC verify (existing verifyWebhookSignature)
  ├─ Step 2: payload.partnerCode === MOMO_PARTNER_CODE  → else 401
  ├─ Step 3: decode payload.extraData JSON, require tenant_id  → else 401
  ├─ Step 4: SELECT payments WHERE provider_ref=orderId AND tenant_id=extraData.tenant_id AND method='momo'
  │           → row not found → 404
  ├─ Step 5: payload.amount === row.amount  → else 401 "amount_tampered"
  ├─ Step 6: INSERT INTO webhook_events (provider, request_id, tenant_id, payment_id, payload)
  │           ON CONFLICT (provider, request_id) DO NOTHING RETURNING id
  │           → conflict → return 200 with cached result from previous processing
  ├─ Step 7: rpc('complete_payment_and_consume_stock', ...)
  └─ Step 8: stock_consumed_status === 'ok'  → 200
            else                              → 500 + create high-severity notification
```

### Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | `reverse_payment_and_post` deadlocks under concurrent approve | Low | High | FOR UPDATE locks acquired in fixed order: refunds → payments → orders. Idempotency: re-approving an already-approved refund is a no-op. |
| 2 | `restore_stock_for_order` overshoots stock levels | Medium | Low | Acceptable — restoring above original level is correct (refund means we never owed that consumption). Document as expected behavior. |
| 3 | `posting_rules` row for `refund_approve` missing in production | High if migration order wrong | High (RPC fails) | Migration `20260506060000` is the LAST in order; if it fails, refund returns clear error code, no money moves. |
| 4 | Server-recompute disagrees with old `payments.amount` from before fix | High initially | High (all old orders fail to refund) | Backfill script: `UPDATE orders SET total_amount = (recompute) WHERE total_amount != (recompute)`. Run BEFORE the new RPC ships so the fix sees consistent data. |
| 5 | MoMo legitimate retry blocked by idempotency before original processed | Low | Medium | `webhook_events` row written BEFORE RPC. If RPC fails, row stays — Momo retry is a no-op cached result. Engineering must investigate the original. |
| 6 | `area_manager` for pilot has no `area_branches` mapping → all refunds rejected | Medium | High (UX) | Pilot has no `area_manager` seeded. Document precondition: before enabling area_manager role, must seed `area_branches`. |
| 7 | `tax_invoices` block on `issued`/`published` state stops valid refunds | High | Medium | Document workflow: cancel HĐĐT first, then refund. Surface in UI. |

### Backwards compat

- Existing `payments` rows: `stock_consumed_status` defaults to `'ok'` for status='completed' (assume historical data was good). Backfill migration sets default.
- Existing `orders.payment_status` enum: ALTER TYPE ADD VALUE 'partially_refunded' (additive — no breaking).
- Mock VietQR/Momo flows: continue to work; webhook hardening only kicks in when MOMO_PARTNER_CODE env is set. If unset (dev), skip strict checks with `console.warn`.
- Existing pending refunds (none expected — table just shipped today): handle gracefully — `reverse_payment_and_post` fails with `payment_not_completed` if payment got refunded outside our flow.

### Affected regression rules

Existing rules touched (verify after fix):
- `RLS-NOT-APPLIED-ON-MV` — refund views (none planned)
- `OFFLINE-NO-SILENT-CLIENTWINS` — N/A (refund is online-only)
- `TERMINOLOGY-SOURCE-OF-TRUTH` — error keys must come from `ERRORS_VI`
- `AUTH-V2-COMPLETE-CUTOVER` — refund RPCs use `has_permission_any` not `auth_role`

NEW rules to add:
- `REFUND-MUST-REVERSE-ATOMICALLY`
- `WEBHOOK-MUST-BIND-TENANT`
- `STOCK-CONSUME-MUST-CHECK-RESULT`
- `PAYMENT-AMOUNT-MUST-RECOMPUTE-SERVER`
- `REFUND-MUST-CHECK-PAYMENT-COMPLETED`
- `WEBHOOK-MUST-IDEMPOTENT`

---

## 4 · Test plan & quality gates (Critic)

### Test plan per P0

**P0-1 refund reversal:**
- *Golden:* Cashier creates refund 200,000 ₫ for paid order → owner approves → payment.status='refunded', orders.payment_status='refunded', stock_movements has refund_restore row, journal_entries posted, audit_logs row. Verify in psql.
- *Edge — concurrent approve:* Two owner sessions click Approve simultaneously. Expect: one succeeds, the other gets `concurrent_modification` (FOR UPDATE wins).
- *Edge — partial:* Approve refund of 100k against 200k payment. Expect: payment.status='partially_refunded', new refund row valid for remaining 100k.
- *Edge — RPC step fails:* Inject a `posting_rules` lookup miss. Expect: refund stays `pending`, no partial writes anywhere.
- *Negative:* Cashier (no `orders:refund-approve` permission) tries `supabase.rpc('reverse_payment_and_post')` directly. Expect: RLS denies.
- *Negative:* User from tenant A approves refund row from tenant B. Expect: SELECT FOR UPDATE returns no row (auth_tenant_id mismatch).

**P0-2 MoMo tenant binding:**
- *Golden:* Real-shaped MoMo webhook for tenant 1 → 200, payment marked completed.
- *Edge — wrong partnerCode:* 401.
- *Edge — extraData missing tenant_id:* 401.
- *Edge — extraData tenant_id ≠ payments.tenant_id:* 401.
- *Negative:* Replay attack — webhook for tenant 1 sent with tenant 2 forged in extraData (signature still valid because secret is shared in pilot). Expect: 401 because the payments lookup uses extraData.tenant_id and finds no row.

**P0-3 stock consume status:**
- *Golden:* Order with available stock → webhook returns 200, status='ok'.
- *Edge — out-of-stock:* Manually set ingredient stock to 0 before payment. Expect webhook 500, payment row stock_consumed_status='out_of_stock', notification created.
- *Edge — recipe missing:* Order an item with no recipe. Expect status='recipe_missing'.
- *Negative:* MoMo retries the 500. Same result. (Idempotency NOT applied to 500 path; only 200 caches.)

**P0-4 server-recompute:**
- *Golden:* POS sends amount = recomputed total → payment proceeds.
- *Edge — discount tampering:* POS modifies `discount_amount` after items added. Recompute uses stored `discount_amount`. If client also tampers `discount_amount`, recompute uses the tampered value too — IS THIS A REAL FIX? Yes: the protection is at PAYMENT time, the server reads `orders.discount_amount` from DB row, so a client cannot bypass by sending a different total to confirm_cash_payment. Add: only manager+ can update `orders.discount_amount` after submit.
- *Edge — modifier surcharge:* Order with extra-trứng modifier (5,000 ₫ surcharge). Recompute includes it.
- *Edge — comp meal:* `is_comp=true`, recomputed=0, payment.amount=0 → accepted.
- *Edge — VAT:* Order subtotal 100k, discount 10k, service charge 5k, VAT 10% on (100k - 10k + 5k) = 9.5k, total 104.5k. Verify formula matches biz rule.
- *Negative:* Client sends amount = 200k for an order recomputed to 100k. Reject with `amount_mismatch_recomputed`.

**P0-5 refund auth:**
- *Negative:* area_manager for branches [1,2] tries createRefund for branch 3 → reject.
- *Negative:* createRefund against payment.status='pending' → reject.
- *Golden:* area_manager for branches [1,2] creates refund for branch 1 → succeed.

**P1-A webhook idempotency:**
- *Golden:* Same request_id arrives twice → second returns 200 cached, no DB writes between calls.
- *Negative:* Different request_id same payment same amount → second processed (legitimate retry from MoMo with new request_id).

**P1-D error log:**
- Inspect production logs after a failure. Expect no raw RPC error messages, only structured `{rpc, code, branch_id}`.

**P1-E branch_manager null branch_id:**
- Manually set a `staff_grants` row with role=branch_manager but no branch_id grant. Try a refund action. Expect: rejected with `branch_scope_unset`.

### Pilot vs dev DB approach

- All RPCs MUST be tested in `psql` connected to dev DB before code edit.
- Each migration MUST apply cleanly on a dropped/recreated dev DB (test via `supabase db reset`).
- Manual smoke in dev: cash flow + refund flow end-to-end.
- No automated E2E for pilot (per roadmap D3 deferred).

### Regression risks per existing flow

| Flow | Risk after fix | Mitigation |
|---|---|---|
| Cash payment golden path | Recompute may reject orders with old discount logic | Backfill script before deploy |
| VietQR mock flow | Same recompute applies; mock provider does not call webhook | Mock test |
| Momo mock flow | Webhook hardening kicks in only when MOMO_PARTNER_CODE set | Skip-strict in dev |
| End-of-day reconciliation | New `partially_refunded` status not handled | Update reconciliation query |
| Partial-cancel kitchen ticket (28d0d6a) | Stock movements differ from refund-restore type | Review stock_movements triggers |
| HĐĐT cash path v1 (S9-A2) | Refund blocked when invoice issued | Document workflow; manager cancels HĐĐT first |
| HĐĐT issue/cancel state machine | No direct interaction; blocked at refund creation | OK |
| Stock consumption flow | Recompute does not affect stock | OK |

### NEW regression rules

```markdown
### REFUND-MUST-REVERSE-ATOMICALLY
**Symptom:** Refund row marked `approved` but payment still `completed`, or stock not restored, or no journal entry posted.
**Rule:** Refund approval MUST go through `reverse_payment_and_post(p_refund_id)` RPC. The action `approveRefund` in `apps/web/app/orders/refund-actions.ts` MUST NOT directly UPDATE payments or insert journal entries.
**Detection:** Grep `approveRefund` for `.update("payments")` or `.insert("journal_entries")` outside the RPC call.

### WEBHOOK-MUST-BIND-TENANT
**Symptom:** Cross-tenant payment forgery — webhook for tenant A processed against tenant B.
**Rule:** Every payment webhook handler MUST resolve tenant_id from a SIGNED, server-validated source (HMAC + extraData JSON), not from `provider_ref` lookup alone. The payments SELECT MUST include `.eq('tenant_id', extracted_tenant_id)`.
**Detection:** Grep `from("payments")` in webhook routes for any `.eq('provider_ref'`)` without `.eq('tenant_id'`)`.

### STOCK-CONSUME-MUST-CHECK-RESULT
**Symptom:** Money paid but stock not deducted; cashier sees nothing wrong.
**Rule:** Any caller of `complete_payment_and_consume_stock` MUST inspect `stock_consumed_status` enum return. If `!= 'ok'`: webhook returns 500, cash path surfaces toast, both create severity=high notification.
**Detection:** Grep `complete_payment_and_consume_stock` callers for missing `stock_consumed_status` check.

### PAYMENT-AMOUNT-MUST-RECOMPUTE-SERVER
**Symptom:** Discount/total tampering — POS sends arbitrary amount, server accepts.
**Rule:** `confirm_cash_payment` and `complete_payment_and_consume_stock` MUST recompute total from `order_items × price_at_order ± discount + service + tax` and reject if `abs(amount - recomputed) > 1 ₫`. Comp orders bypass with `is_comp=true`.
**Detection:** Grep payment RPCs for absence of `SUM(qty * price_at_order)` recompute step.

### REFUND-MUST-CHECK-PAYMENT-COMPLETED
**Symptom:** Refund created against payment in `pending`/`failed` status — negative-amount injection.
**Rule:** `create_refund` RPC MUST verify `payment.status='completed'`. Action wrapper MAY also check, but RPC is the source of truth.
**Detection:** Grep `create_refund` for `payment.status='completed'` precondition.

### WEBHOOK-MUST-IDEMPOTENT
**Symptom:** Replay or double-delivery overwrites `provider_data` or double-posts journal entry.
**Rule:** Every payment webhook MUST insert into `webhook_events(provider, request_id PRIMARY KEY)` before processing; UNIQUE conflict returns 200 with cached result.
**Detection:** Grep webhook routes for absence of `webhook_events` insert.
```

### Quality gates per commit

1. Migration smoke: `supabase db reset` then `supabase db push` — clean apply.
2. RPC test: psql call each new RPC with valid + invalid input, check return shape and side effects.
3. `pnpm typecheck && pnpm lint && pnpm build` green.
4. Manual smoke per acceptance criteria above (Round 1 cash path, Round 2 webhook path, Round 3 refund path).
5. `/cso` re-review on the modified files (refund-actions, momo/route, payment-actions, with-action).
6. Update `docs/runbooks/payments/pre-pilot-qa.md` (NEW file).

### Worst-case scenarios

1. *Refund RPC silently swallows out-of-stock during restore:* Assert restore RPC raises EXCEPTION on stock-table integrity errors; do not catch in caller.
2. *Server-recompute disagrees with old orders' stored total_amount:* Backfill `orders.total_amount` from items before deploy; run in same transaction as migration.
3. *MoMo idempotency blocks legitimate retry:* Document Momo retry semantics — request_id must be unique per attempt; if Momo reuses same request_id for retry, that IS the same event.
4. *Refund window misconfigured to 0:* Default `refund_window_days=7` server-side; UI toggle in admin settings; alarm if rows show window=0.
5. *Notifications flood:* Out-of-stock during a busy lunch creates 50 notifications. Add dedup: one notification per branch per hour for stock-related events.

### Production observability post-deploy

| Signal | Where | Trigger |
|---|---|---|
| `payments.stock_consumed_status != 'ok'` count | `/admin/finance` reconciliation card | > 0 → orange, > 5 → red |
| Refund approval failures | Notification feed | severity=high → all owners |
| Webhook 401 / 500 ratio | log-based metric (Vercel) | Alert if > 1% of webhooks |
| Server-recompute mismatches | log structured event | Alert if > 0 in production |

### Blind spots PM/BA/Architect missed

1. **Manual cash refund without webhook:** Refund flow does not depend on a webhook — pilot will exercise this path. Verify `confirm_cash_payment` recompute applies; refund flow's RPC does not need webhook idempotency.
2. **Refund days later when GL period soft-closed:** `journal_entries` insert from `reverse_payment_and_post` may fail due to S0-c(B) period_close trigger. Add: refund's journal entry uses CURRENT period (not original payment period) — issue a corrective entry rather than back-dating.
3. **HĐĐT cancellation race:** If invoice is mid-cancellation when refund approves, race may post refund journal before cancellation. Solution: in `reverse_payment_and_post`, SELECT FOR UPDATE on `tax_invoices` row if it exists, fail if state in (`issuing`, `cancelling`).
4. **Refund triggers on `cleanup_abandoned_payments`:** The 24h cleanup job flips payments to `failed` status. If refund is in flight when cleanup runs, FOR UPDATE serializes them. Document.
5. **`webhook_events` table size:** Will grow unboundedly in production. Add 90-day retention via pg_cron job in a follow-up commit.
6. **Mock providers:** dev environment may not have `MOMO_PARTNER_CODE` set. Hardening must skip with warn, not fail, when env missing — else dev breaks.

---

## 5 · Sequence summary (cheat sheet)

```
[ Migration round 1 ]
M0  20260506000000  refund_reversal_foundation         # cols + permission key + posting rule
M1  20260506010000  restore_stock_rpc                  # internal RPC
M2  20260506020000  reverse_payment_and_post_rpc       # depends M0+M1
M3  20260506030000  create_refund_rpc                  # depends M0
M4  20260506040000  webhook_events_table               # idempotency
M5  20260506050000  payment_recompute_total            # modifies existing RPCs
M6  20260506060000  posting_rule_refund_approve        # last — RPC needs this row

[ Code round 2 — independent edits, parallel-safe ]
E1  refund-actions.ts                  # P0-1 + P0-5
E2  api/webhooks/momo/route.ts         # P0-2 + P0-3 + P1-A
E3  payment-actions.ts                 # P0-4 + P1-D + P1-E
E4  with-action.ts                     # P1-E foundation
E5  errors.ts                          # error key dictionary
E6  payment-stock-divergence-card.tsx  # NEW finance widget

[ Verify round 3 ]
V1  pnpm typecheck && pnpm lint && pnpm build
V2  manual smoke per acceptance criteria
V3  /cso re-review
V4  update tasks/regressions.md (6 new rules)
V5  update tasks/todo.md (clear done items)
V6  write docs/runbooks/payments/pre-pilot-qa.md
```

## 6 · Out-of-scope (to track separately)

- Real VietQR/Momo merchant API wiring
- HĐĐT cancellation triggered by refund (auto-flow)
- Multi-method payment refund routing
- area_manager `payments` RLS scope (P1-C)
- Cross-period refund corrective journal entries
- 90-day retention on `webhook_events`
- Per-tenant MoMo credentials table
- Notifications dedup logic
