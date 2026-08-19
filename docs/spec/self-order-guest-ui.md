# Self-Order — Surface + Workflow Contract

**Guest surface:** `apps/web/app/q/[token]` (public QR self-order, no auth).
**Staff surface:** POS table map (`/br/[branchId]/pos`) — no new route.
**Primary user job:** Scan table QR → browse menu → submit cart → (first round only) staff opens the table → add more rounds straight to the kitchen → pay on the phone.
**Change type:** Full workflow rebuild. The parallel `self_order_sessions` lifecycle is deleted; the POS order is the single source of truth.

## Authority

- Design system: `docs/spec/design-system.md`
- Motion / loading polish: `docs/spec/self-order-motion-design.md`
- Audio alerts: `docs/plan/adr/0008-operational-audio-alerts.md`
- Owner decision: `docs/plan/decisions.md` § D075
- Copy: `packages/shared/src/messages/self-order.ts` (`SELF_ORDER_VI`)

## Product thesis

Touch-first ordering tool, not a brand splash. First viewport = Má Tư, table name, menu. Bill is a destination, not a peer of the menu. Self-order owns no lifecycle: a seating **is** an open POS order; staff gate opening, then guests reach the kitchen unmediated.

## State model

Guest-visible state is **derived**, never stored. One stored enum:
`self_order_requests.status ∈ {pending, accepted, rejected}`.

| Derived from                                      | Guest state               | Guest may                                                                        |
| ------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------- |
| no pending request, no open order on table        | `Chưa mở bàn`             | browse, build cart, **`Gửi món`** (first round)                                    |
| a `pending` request exists                        | `Chờ xác nhận`            | browse, build cart, **`Gửi thêm món`** into the same pending request               |
| the last request is `rejected`                    | `Bị từ chối`              | resubmit immediately (same cart)                                                 |
| an open order exists, no live payment intent      | `Bàn đang mở`             | **`Gửi thêm món`** (straight to KDS), view bill                                    |
| an open order exists, a live payment intent       | `Đang thanh toán`         | browse, add-more (cancels the live intent), reopen QR from the bill              |
| two or more open orders exist, no pending request | `Cần nhân viên chọn bill` | browse, build cart, **`Gửi món`** for staff approval; bill opens without order details and payment stays hidden |
| `orders.payment_status = 'paid'`                  | `Đã thanh toán`           | see the receipt for this browser session only                                    |

**Open order** = `orders.table_id = <table>` AND `payment_status <> 'paid'` AND `status NOT IN ('completed','cancelled')`. Paid order leaves the snapshot immediately; `trg_order_release_table` returns the table to `available`.

## Flow

1. Scan QR → `/q/{token}` → browse, customize, cart.
2. **`Gửi món`** → one `self_order_requests` row, `status='pending'`. Pre-decision **`Gửi thêm món`** merges into that request; replay returns original outcome.
3. Staff badge → **`Duyệt`** → `create_order` → `route_order_to_kds`.
4. Post-approval add-more → `append_order_items` (no approval).
5. Bill sheet → `orders.items + totalAmount` → **`Thanh toán`** → `cash_call` | `vietqr`.
6. Payment settles → existing triggers complete order and release table.

**Already open:** one open order → submit appends (no approval). Two+ open orders → `pending`; staff pick destination; token never chooses a bill; guest cannot read bill or create payment intent until accept.

**Replay / rejected:** `clientOpId` tenant-scoped; same ID + different cart/note rejected. Direct appends persist an `accepted` request after `append_order_items`. Rejected cart returns only when browser supplies that request's `clientOpId`; reload without it → clean menu.

## Guest screens

### G0 · Unavailable

Static `BrandMascot` (`animated={false}`) + title + description. Causes: invalid token · `self_order_enabled = false` · POS session closed. No lockup, motion, or pattern wash.

### G1 Menu (only page)

Header: `Cơm Tấm Má Tư` above table label (H1), truncated; icon-only `Gọi nhân viên` (`Button size="icon-touch"`, `aria-label` required). The primary `Hoá đơn` (terracotta `Button` + `Badge`: approved count or `Clock` while pending) only when a pending request or an open order exists — omit it on an empty table. No branch name, no `ThemeToggle`. `Hoá đơn` opens full-viewport bottom `Sheet`, never auto-opens; unopened/multi-bill → safe empty bill, payment unavailable. `Gọi nhân viên` writes `self_order_staff_calls` (POS table badge `Gọi NV` + `pos-staff-call` beep). Header, category pills, wait banner, and the cart bar are in-flow (`shrink-0`, opaque `bg-background`) outside the single menu scrollport — not `fixed`/`sticky` overlays and not `bg-*/95` + `backdrop-blur`.

Body: sticky category pills (in-flow above the menu scrollport; no `Hôm nay ăn gì?` prompt); default named `Cơm` else first non-empty non-`Khác`; `Tất cả` last. Horizontal item rows (image left); one column phone / two tablet+. Sold-out from `branch_menu_limit_availability` → `Hết suất`; finite quota → `Còn N phần`. Curated badges: `Sườn Cốt Lết` → `Truyền thống`; `Sườn Một Gang` → `Nên thử` + `Chờ 20 phút`. Trailing parenthetical in name → image `Badge` if no curated badge; cart/kitchen keep raw `menu_items.name`. In `Tất cả`, category titles may stick inside the list with opaque `bg-background`. Every card shows `+`; a simple item (≤1 variant, no modifiers, no sides) increments a matching uncustomized cart line and then shows a `- qty +` stepper; items with a guest choice still open G2 from `+` / the row. G2 opens only when the guest has a choice.

Prominence by **category name** (not `menu_categories.type`): named `Cơm` → large thumb (`h-32`, `text-2xl`/`text-xl`); else compact (`h-16`, `text-lg`). Motion: transform-only press (`active:scale-[0.97]`, `duration-150` / `--ease-move`); no nested photo scale, no `transition-all`.

Footer: sticky cart button when cart non-empty (in-flow; opens sheet; never submits). **No Tabs**, **no `StatusPill`**.

### G2 · Item sheet

Opens only when the item has a guest choice: 2+ variants, any modifier, or any side. Simple items never mount this sheet from the menu.

Full-viewport bottom sheet (`max-w-2xl`). Image: phone `h-80`; `sm+` `aspect-video` with max-height caps. Close on image; title under image; variant · modifiers · sides · note; footer: total · quantity · add/update.

### G3 · Cart sheet

Full-viewport bottom sheet (`fullscreen`, same as G2/G6). Lines and shared note scroll; footer subtotal + send CTA stay pinned in `SheetFooter` so a long cart cannot cover **`Gửi món`**. Lines: name + tag, options, total, **`Sửa`** / stepper / remove.

CTA: not open → **`Gửi món`** + staff-confirm hint; awaiting / open → **`Gửi thêm món`** (merge pending or straight to kitchen). Only guest confirmation control; edit replaces entry in place (same `key`).

### G4 · Awaiting confirmation

When derived state is `Chờ xác nhận`, an in-flow `role="status"` banner stays on the menu (not an `AppDialog`): **`Đã gửi đơn`** / kitchen starts after cashier **`Duyệt`** / secondary **`Gọi nhân viên`**. Guest does not dismiss to see status. After accept, the banner goes away and `Hoá đơn` remains. Bill: `Clock` + faded pending list under an opaque overlay + static `BrandMascot`; no filter/`backdrop-blur`. No payable total.

### G5 · Rejected

One Sonner `toast.warning` + **`Gửi lại`** (reload rejected cart). No dialog, `revoked`, token rotation, or QR reprint.

### G6 · Bill sheet

`orders.items` + `totalAmount`; round history from `kitchen_send_batches`. Progress (`Gửi` / `Chế biến` / `Phục vụ`) advances from pending request → accepted kitchen tickets → `orders.status` `ready`/`served` or any `kds_tickets.status` `ready`/`served` (not `first_ready_at`, which survives recall). Poll every 3s while an unpaid order is not fully served. One **`Thanh toán`** only when order unambiguous and open. After one open order and no live payment intent, guest enters **`Mã khuyến mãi`** in the bill footer (`order_pct` / `order_vnd` / `voucher_face`); picker kinds fail closed (**`Mã này cần nhân viên hỗ trợ`**). Item discount: struck gross + net + **`Khuyến mãi: -X`**. Order-level campaign stays in the footer, not faked per line. Line total already includes sides/modifiers; accompaniment names have no extra `+đ` so the guest does not double-count. Footer omits **`Tạm tính`**.

### G7 Payment step (drawer)

**`Thanh toán`** opens `AppDrawer` over the bill sheet (not a fullscreen payment `Sheet`). No restated payable total in the drawer body — that amount stays on the bill footer. Drawer body is `cash_call` | VietQR; closing the drawer returns to G6 or the menu. Live intent is recoverable, not a trap: reload keeps the guest on G1; bank-app return restores G7. Exactly one live intent. Add-more from the cart cancels that intent so the kitchen can keep moving. Promo apply/clear stays locked while the intent is live. Footer CTAs are **`Tiền mặt`** and **`Chuyển khoản`** (creates VietQR immediately — no select-then-continue). Optional **`Xuất hoá đơn GTGT`**: MST lookup fills company name/address; guest enters email; payload goes to `p_invoice_payload`. Unchecked stays consumer-default. VietQR reload uses stored amount/code/QR/bank/expiry — never rebuilds from current settings. After VietQR exists, the drawer shows a compact on-screen QR; MB Bank handoff and **`Huỷ mã QR`** stay pinned in the footer. Handoff is **MB Bank only** (proven EMV payload). Do not list disabled banks as peer CTAs. MoMo never a Self-Order method. Guest may cancel exact active VietQR only; late verified SePay still settles. Cash cancel is staff-owned.

### G8 · Paid

Receipt in sheet for this browser session only; reload → G1 clean menu.

## Staff screens

### P1 · Table tile badge

`pos-table-gate.tsx`: staff call → `Gọi NV`; else pending request → `QR ⏳` (not a stat card). Tapping the table acknowledges the staff call.

### P2 · Approval sheet

Table label, time, lines, note, provisional total. **`Duyệt`** → `create_order` or `append_order_items`. **`Từ chối`** → destructive, confirmed, no reason. Two+ bills → pick `[Bill #…]` or `[Tạo bill mới]` first.

### P3 · Cash/VietQR intent cancellation

`Đang thanh toán` bill sheet: **`Huỷ yêu cầu`** — only path to free expired VietQR / stale `cash_call`.

### P4 · Audio

Open POS surface (device-local, ADR 0008):

| Event | Tone | Notes |
| --- | --- | --- |
| New pending `self_order_requests` | `pos-self-order` | Distinct from ordinary POS beep; voice “Bàn {n} cần duyệt đơn” |
| New active `self_order_payment_requests` (`cash_call` / `vietqr_pending`) | `pos-payment-call` | Distinct from QR-order, staff-call, and POS beeps; voice “Bàn {n} gọi thanh toán” |
| New pending `self_order_staff_calls` | `pos-staff-call` | Distinct from payment-call; voice “Bàn {n} gọi nhân viên” |

Honor POS sound preference. First poll seeds ids without beep. Neither writes `public.notifications` nor Telegram.

## Data contract

```sql
create table public.self_order_requests (
  id bigint generated always as identity primary key,
  tenant_id bigint not null,
  branch_id bigint not null,
  table_id bigint not null references public.tables(id),
  cart_payload jsonb not null,
  customer_note text,
  client_op_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending','accepted','rejected')),
  order_id bigint references public.orders(id),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index self_order_requests_one_pending_per_table
  on public.self_order_requests (table_id) where status = 'pending';
create unique index self_order_requests_client_op_id_uidx
  on public.self_order_requests (tenant_id, client_op_id);
```

RLS: staff-select only; writes via `SECURITY DEFINER` RPCs.

`self_order_request_operations`: tenant-scoped `(tenant_id, client_op_id)` PK; while `pending`, `self_order_submit` merges into aggregate `cart_payload`; exact replay returns original outcome. Staff accept consumes aggregate `cart_payload`.

`self_order_payment_requests` keyed by `order_id` (not session). Kept: payment requests, rate buckets, `tables.self_order_token` / `self_order_enabled`. Rate `purpose` `batch`|`payment` remain; `origin`|`join` die with device binding.

Deleted: `self_order_sessions`, batches, session devices, capability/realtime tokens, `*_v2` RPCs, device cookie/428, `status-pill`, device/session panels, `SelfOrderApprovalSheet`.

| RPC                                                   | Caller | Effect                                                                                                   |
| ----------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| `self_order_get_snapshot(token, op_id?)`              | guest  | table + menu + unambiguous open order + pending/rejected-for-op + live intent |
| `self_order_submit(token, cart, note, op_id)`         | guest  | one open order → append; existing pending → merge; else insert pending |
| `self_order_create_payment_request(...)`              | guest  | binds to only open order; rejects multi-bill |
| `self_order_cancel_vietqr_payment(token, op_id)`      | guest  | cancel exact active VietQR; late SePay still settles |
| `self_order_accept_request(req_id, target_order_id?)` | staff  | `create_order` or `append_order_items` |
| `self_order_reject_request(req_id)`                   | staff  | `status = 'rejected'` |
| `self_order_cancel_payment_request(...)`              | staff  | keyed by request/order |
| `self_order_call_staff(token, op_id)`                 | guest  | one pending staff-call per table; 45s cooldown |
| `self_order_ack_staff_call(call_id)`                  | staff  | clears the table badge |
| `self_order_apply_promotion_code(token, op_id, code)` | guest  | order-level `order_pct` / `order_vnd` / `voucher_face` on the unique open bill; picker kinds fail closed |
| `self_order_clear_promotion(token, op_id)`            | guest  | clear those same guest-applied order-level kinds; staff comps stay |

One-arg snapshot overload is compatibility only (no rejected context).

## Deployment / freshness / trust

S1 additive at table/column level but changes public snapshot — land locally first; production apply + S2–S5 runtime same cutover. S6 later destructive cleanup.

Adaptive polling (no realtime): 3s while `Chờ xác nhận` or `Đang thanh toán`; 15s else; refetch on focus/bfcache. Broadcast topic/policies deleted.

Device binding removed: photo of QR can read bill and append while open. Staff gate opening only. Rate limits via `self_order_rate_buckets`; responses `private, no-store`.

## Brand / non-goals / runtime

| Asset | On `/q/[token]` |
| --- | --- |
| `BrandMascot` | Static only in G0 and G4 pending overlay |
| `BrandLockup` / `BrandMark` / `BrandLogoBox` / `brand-pattern-caro` | **Forbidden** |
| `BrandSymbol` (`riceBowl`) | Empty menu + missing item-photo placeholders |

Non-goals: no desktop IA fork; no change to `finalize_paid_order` / KDS / pay-before-ready; no `is_featured`; no admin for `self_order_enabled`/QR print; no new DS tokens (`workflow-safe-pb` remains approved).

Runtime: `apps/web/app/q/[token]/{page,self-order-client}.tsx`, `self-order/{menu-panel,cart-sheet,bill-drawer,promo-code-panel,payment-panel}.tsx`, `…/pos/{pos-table-gate,self-order-actions}.tsx`, `packages/shared/src/messages/self-order.ts`.
