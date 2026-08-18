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
| an open order exists, a live payment intent       | `Đang thanh toán`         | view bill, wait; add-more locked                                                 |
| two or more open orders exist, no pending request | `Cần nhân viên chọn bill` | browse, build cart, **`Gửi món`** for staff approval; bill opens without order details and payment stays hidden |
| `orders.payment_status = 'paid'`                  | `Đã thanh toán`           | see the receipt for this browser session only                                    |

**Open order** = `orders.table_id = <table>` AND `payment_status <> 'paid'` AND `status NOT IN ('completed','cancelled')`. Paid order leaves the snapshot immediately; `trg_order_release_table` returns the table to `available`.

## Flow

1. Scan QR → `/q/{token}` → browse, customize, cart.
2. **`Gửi món`** → one `self_order_requests` row, `status='pending'`. Pre-decision **`Gửi thêm món`** merges into that request; replay returns original outcome.
3. Staff badge → **`Duyệt`** → `create_order` → `route_order_to_kds`.
4. Post-approval add-more → `append_order_items` (no approval).
5. Bill sheet → `orders.items + totalAmount` → **`Thanh toán`** → `cash_call` | `vietqr` + optional HĐĐT buyer fields.
6. Payment settles → existing triggers complete order and release table.

**Already open:** one open order → submit appends (no approval). Two+ open orders → `pending`; staff pick destination; token never chooses a bill; guest cannot read bill or create payment intent until accept.

**Replay / rejected:** `clientOpId` tenant-scoped; same ID + different cart/note rejected. Direct appends persist an `accepted` request after `append_order_items`. Rejected cart returns only when browser supplies that request's `clientOpId`; reload without it → clean menu.

## Guest screens

### G0 · Unavailable

Static `BrandMascot` (`animated={false}`) + title + description. Causes: invalid token · `self_order_enabled = false` · POS session closed. No lockup, motion, or pattern wash.

### G1 Menu (only page)

Header: `Cơm Tấm Má Tư` above table label (H1); `ThemeToggle` + icon-touch `Gọi nhân viên` + primary `Hoá đơn` (terracotta `Button` + `Badge`: approved count or `Clock` while pending). No branch name. `Hoá đơn` opens full-viewport bottom `Sheet`, never auto-opens; unopened/multi-bill → safe empty bill, payment unavailable. `Gọi nhân viên` writes `self_order_staff_calls` (POS table badge `Gọi NV` + `pos-payment-call` beep).

Body: sticky category pills; default named `Cơm` else first non-empty non-`Khác`; `Tất cả` last. Horizontal item rows (image left); one column phone / two tablet+. Sold-out from `branch_menu_limit_availability` → `Hết suất`; finite quota → `Còn N phần`. Curated badges: `Sườn Cốt Lết` → `Truyền thống`; `Sườn Một Gang` → `Nên thử` + `Chờ 20 phút`. Trailing parenthetical in name → image `Badge` if no curated badge; cart/kitchen keep raw `menu_items.name`.

Prominence by **category name** (not `menu_categories.type`): named `Cơm` → large thumb (`h-32`, `text-2xl`/`text-xl`); else compact (`h-16`, `text-lg`). Motion: DS `transition-[transform,…] duration-150` + press scale only.

Footer: sticky cart button when cart non-empty (opens sheet; never submits). **No Tabs**, **no `StatusPill`**.

### G2 · Item sheet

Full-viewport bottom sheet (`max-w-2xl`). Image: phone `h-80`; `sm+` `aspect-video` with max-height caps. Close on image; title under image; variant · modifiers · sides · note; footer: total · quantity · add/update.

### G3 · Cart sheet

Full-viewport bottom sheet (`fullscreen`, same as G2/G6). Lines and shared note scroll; footer subtotal + send CTA stay pinned in `SheetFooter` so a long cart cannot cover **`Gửi món`**. Lines: name + tag, options, total, **`Sửa`** / stepper / remove.

CTA: not open → **`Gửi món`** + staff-confirm hint; awaiting / open → **`Gửi thêm món`** (merge pending or straight to kitchen). Only guest confirmation control; edit replaces entry in place (same `key`).

### G4 · Awaiting confirmation

One `AppDialog` after first pending submit this session: **`Đã gửi đơn`** / **`Vui lòng chờ nhân viên duyệt. Món vào bếp sau khi được duyệt.`** / **`Đã hiểu`** · **`Gọi nhân viên`**. Does not remount from poll/reload/later add-more. Bill: `Clock` + blurred pending overlay + static `BrandMascot`; no payable total.

### G5 · Rejected

One Sonner `toast.warning` + **`Gửi lại`** (reload rejected cart). No dialog, `revoked`, token rotation, or QR reprint.

### G6 · Bill sheet

`orders.items` + `totalAmount`; round history from `kitchen_send_batches`. One **`Thanh toán`** only when order unambiguous and open.

### G7 Payment step (in sheet)

Replaces bill with `cash_call` | VietQR + HĐĐT buyer fields; back → G6. Exactly one live intent; locks add-more, customize, buyer fields. VietQR reload uses stored amount/code/QR/bank/expiry — never rebuilds from current settings. Bank-app catalog stays visible. Handoff is **MB Bank only** (proven EMV payload). Other listed banks stay visible and disabled (`Sắp hỗ trợ`); guests scan the on-screen QR. MoMo never a Self-Order method. Guest may cancel exact active VietQR only; late verified SePay still settles. Cash cancel is staff-owned.

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
| New pending `self_order_requests` | `pos-self-order` | Distinct from ordinary POS beep |
| New active `self_order_payment_requests` (`cash_call` / `vietqr_pending`) | `pos-payment-call` | Distinct from QR-order and POS beeps |
| New pending `self_order_staff_calls` | `pos-payment-call` | Same “come to the table” attention as a cash call |

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

Runtime: `apps/web/app/q/[token]/{page,self-order-client}.tsx`, `self-order/{menu-panel,cart-sheet,bill-drawer,payment-panel}.tsx`, `…/pos/{pos-table-gate,self-order-actions}.tsx`, `packages/shared/src/messages/self-order.ts`.
