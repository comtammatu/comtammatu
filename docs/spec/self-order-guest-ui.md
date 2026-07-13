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

The guest surface is a **touch-first ordering tool**, not a brand splash. First viewport = Má Tư, table name, and menu. The bill is a destination, not a peer of the menu.

Self-order owns no lifecycle of its own. A seating **is** an open POS order on a table. Staff gate the moment a table opens; after that, guests reach the kitchen unmediated.

## State model

Guest-visible state is **derived**, never stored. There is exactly one stored enum:
`self_order_requests.status ∈ {pending, accepted, rejected}`.

| Derived from                                      | Guest state               | Guest may                                                                        |
| ------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------- |
| no pending request, no open order on table        | `Chưa mở bàn`             | browse, build cart, **Gửi món** (first round)                                    |
| a `pending` request exists                        | `Chờ xác nhận`            | browse, build cart, **Gửi thêm món** into the same pending request               |
| the last request is `rejected`                    | `Bị từ chối`              | resubmit immediately (same cart)                                                 |
| an open order exists, no live payment intent      | `Bàn đang mở`             | **Gửi thêm món** (straight to KDS), view bill                                    |
| an open order exists, a live payment intent       | `Đang thanh toán`         | view bill, wait; add-more locked                                                 |
| two or more open orders exist, no pending request | `Cần nhân viên chọn bill` | browse, build cart, **Gửi món** for staff approval; bill opens without order details and payment stays hidden |
| `orders.payment_status = 'paid'`                  | `Đã thanh toán`           | see the receipt for this browser session only                                    |

An **open order** = `orders.table_id = <table>` AND `payment_status <> 'paid'` AND `status NOT IN ('completed','cancelled')`.

A paid order leaves the snapshot immediately. The next guest scanning the same printed QR sees a clean menu. `trg_order_release_table` (existing) returns the table to `available`.

## Flow, end to end

1. Guest scans the printed table QR → `/q/{token}`.
2. Browse menu, customize, add to cart.
3. **Gửi món** → one `self_order_requests` row, `status='pending'`.
4. Before staff decides, each **Gửi thêm món** operation merges into that same pending request; replaying an operation returns its original outcome without duplicating items.
5. Staff sees the badge on the POS table tile → **Duyệt** → `create_order(table_id, items)` → `route_order_to_kds` fires → the kitchen has it.
6. Guest adds more after approval → `append_order_items` directly. **No approval.** KDS receives it.
7. Guest opens the bill drawer → `orders.items + totalAmount` (the payable truth after staff edits, voids, merges) and presses **Thanh toán**.
8. The drawer switches to payment (`cash_call` | `vietqr`) + optional HĐĐT buyer fields; Back returns to the bill.
9. Payment settles → existing triggers complete the order and release the table.

### Table already has an open order

If the table already carries an open order — whether a staff member created it at the POS or a previous guest round did — a guest submit **appends to that order**. No approval. One table, one bill.

If the table carries **two or more** open orders (POS permits multi-bill), the submit falls back to `pending`. Staff pick the destination bill when approving. The system never guesses which bill owes the money.

The stable table token never chooses a bill in the multi-bill case. Until staff
accepts the pending request, the guest cannot read a bill or create a payment
intent for that table.

### Request replay and rejected carts

`clientOpId` is tenant-scoped. A replay returns the original request outcome;
reusing the same ID with a different canonical cart or customer note is rejected.
Pending add-more operations are retained in an RPC-only operation ledger before
their cart is merged, so retries remain stable even after the staff-facing
request payload changes. Direct appends also persist an `accepted` request row
after `append_order_items`, so replay remains stable even if the table state
changes.

A rejected cart is returned only when the browser supplies that request's
`clientOpId`. A reload without the in-memory ID returns a clean menu; the next
seating never inherits the previous guest's rejected cart.

## Guest screens

### G0 · Unavailable

Static `BrandMascot` (`animated={false}`) + title + description. Covers three causes, differing only in the description: invalid token · `self_order_enabled = false` · POS session closed. No lockup, no motion, no pattern wash.

### G1: Menu — the only page

Header is one compact block: `Cơm Tấm Má Tư` above the table label (H1), with
the shared `ThemeToggle` (Sáng/Tối) and a primary `Hoá đơn` button on the right.
It contains no branch name or workflow notification.

`Hoá đơn` sits in the header next to `ThemeToggle` as a primary (terracotta)
`Button` + `Badge` (approved item count, or a `Clock` icon while a request is
pending). It opens a `Drawer` and **never auto-opens**. An unopened or
multi-bill table shows the safe empty bill state; payment remains unavailable.

Body: category pills (sticky under the header, one scrollable row). The
default selected pill is the named `Cơm` category when present; otherwise the
first non-empty category that is not `Khác`. Category pills list named
categories first; `Tất cả` is last. Items render as horizontal rows — image on
the left, dish title + price on the right — in one column on phones and two
columns from tablet portrait within the existing guest frame. There is no per-item category eyebrow.
Sold-out / disabled items reuse the same
POS availability source (`branch_menu_limit_availability`) and render as
non-selectable with a destructive `Hết suất` badge on the image; finite
remaining quota shows `Còn N phần`. Curated image badges: `Sườn Cốt Lết` →
`Truyền thống`; `Sườn Một Gang` → `Nên thử` + `Chờ 20 phút`. A trailing
parenthetical note in the item name (for example `Cốt Lết (WOW)`) is stripped
from the title and shown as a short `Badge` on the top-left of the image when
no curated badge already covers it; cart, customizer, and kitchen payloads keep
the raw `menu_items.name`.

Visual prominence is keyed by **category name**, not `menu_categories.type`:

- named `Cơm` only → large thumb (`h-32`) row with `text-2xl` title and
  `text-xl` price; press uses `active:scale-[0.97]` plus a short image scale.
- every other category (including `Khác`, even if typed `main_dish`) → compact
  thumb (`h-16`) row with `text-lg` title/price.
- Motion stays inside the design-system contract: CSS
  `transition-[transform,…] duration-150` and press scale only — no Three.js,
  framer-motion, or custom keyframes.

Footer: one sticky cart button, rendered only when the cart holds items. It
opens the cart sheet; it never submits directly from the menu.

There are **no Tabs**. There is **no `StatusPill`**. There is no branch name in the header — the guest is sitting in the branch.

### G2 · Item sheet

Full-viewport bottom sheet (`max-w-2xl` on tablet/desktop). Dish image is a
tall phone hero (`h-80`); from `sm` up it uses `aspect-video` with caps
(`sm:max-h-64` → `md:max-h-48` → `lg:max-h-56`) so width scales without
dominating large screens. Close sits on the image. Title only under the image
(no customize hint). Then variant · modifiers · sides · note. Footer is one
row: total · quantity · add/update.

### G3 · Cart sheet

Bottom sheet (max ~90% viewport) for review. Lines are a quiet list with
separators — name + optional tag, option summary, line total, then one action
row: **Sửa** (reopens the item customizer with the cart draft), quantity
stepper, and remove. Shared customer note sits under the lines. Footer owns
subtotal + send CTA only.

CTA label follows table state:

- table not open → **Gửi món**, hint under the button: staff will confirm.
- table open → **Gửi thêm món**, no hint: it reaches the kitchen at once.

The cart-sheet CTA is the only guest confirmation control for either send path.
Editing a line replaces that cart entry in place (same `key`).

### G4 · Awaiting confirmation

After the first successful pending submit in this browser session, open one
`AppDialog` with title **Đã gửi đơn cho Thu Ngân**, description **Vui lòng chờ
quán ít phút để chuẩn bị nhé**, and actions **Gọi thêm** / **Đóng**. Both actions
return to the menu; the dialog does not remount from polling, reload, or a
later add-more submit. The cart CTA stays enabled as **Gửi thêm món** and its
next submit merges into the same pending request. The bill button shows a
`Clock` icon; the drawer keeps the pending round visible behind a blurred
state overlay with a static `BrandMascot`, and shows no payable total.

### G5 · Rejected

Emit one Sonner `toast.warning` with a **Gửi lại** action that reloads the
rejected cart verbatim. Same guest toaster preset as G4. No dialog. No
`revoked` state. No token rotation. No reprinting the table QR.

### G6 · Bill drawer

Primary content is `orders.items` + `orders.totalAmount`. Below it, the round
history reads from the existing `kitchen_send_batches` — self-order stores no
round table of its own. It contains one **Thanh toán** CTA only when the order
is unambiguous and open.

### G7: Payment (inside the drawer)

After **Thanh toán**, the drawer replaces the bill with `cash_call` | VietQR +
HĐĐT buyer fields; its back control returns to G6. Exactly one live intent
across both methods; a live intent locks add-more, item customization, and
buyer fields. VietQR reload renders the stored amount, payment code, QR bytes,
bank snapshot, and expiry — it never rebuilds an active QR from current
settings. Guests cannot cancel an intent; staff own cancellation after verifying
money is not already in flight.

### G8 · Paid

The receipt remains in the drawer for the current browser session only. A reload
returns to G1 with a clean menu, because a paid order is absent from the snapshot
by contract.

## Staff screens

### P1 · Table tile badge

`pos-table-gate.tsx` gains exactly one tone/badge: a table with a `pending` request renders `QR ⏳`. A badge, not a stat card.

### P2 · Approval sheet

Tapping a badged tile opens a sheet: table label, submission time, submitted lines with variants/modifiers/notes, customer note, provisional total.

- **Duyệt** → `create_order`, or `append_order_items` when the staff picks an existing bill.
- **Từ chối** → destructive, separated from the primary action, confirmed. No reason field.
- Two or more open bills → the sheet asks for the destination first: `[Bill #…]` `[Bill #…]` `[Tạo bill mới]`.

### P3: Payment intent cancellation

The bill sheet for a table in `Đang thanh toán` exposes **Huỷ yêu cầu**. This is the only path that frees a guest stuck behind an expired VietQR or a stale `cash_call`.

### P4 · Audio

On the open POS surface (device-local, ADR 0008):

| Event | Tone | Notes |
| --- | --- | --- |
| New pending `self_order_requests` row | `pos-self-order` | Distinct from ordinary POS order/sync beep |
| New active `self_order_payment_requests` (`cash_call` / `vietqr_pending`) | `pos-payment-call` | Distinct from QR-order and POS beeps |

Both honor the POS sound preference. First poll after mount seeds known ids without beeping. Neither writes `public.notifications` nor sends Telegram.

## Data contract

One new table:

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

RLS follows the existing self-order convention: direct table access is
staff-select only; `INSERT`, `UPDATE`, and `DELETE` are revoked and writes run
exclusively through `SECURITY DEFINER` RPCs.

`self_order_payment_requests` is keyed by `order_id`, not by a self-order
session. S1 makes the legacy `session_id` nullable for the compatibility window,
adds one-active-intent-per-order and sessionless-operation-id unique indexes, and
rewrites create/expire/cancel/order-close paths so new rows do not carry a
session. S6 removes the legacy column and foreign key after the runtime cutover.

Kept: `self_order_payment_requests`, `self_order_rate_buckets`, `tables.self_order_token`, `tables.self_order_enabled`. The `origin` and `join` values of `self_order_rate_buckets.purpose` die with device binding; `batch` and `payment` remain.

Deleted: `self_order_sessions`, `self_order_batches`, `self_order_session_devices`, `tables.self_order_capability_version`, `tables.realtime_topic_token`, every `self_order_*_v2` RPC, the `device_token` cookie and its 428 retry, `status-pill.tsx`, `device-access-panel.tsx`, `session-state-panel.tsx`, `SelfOrderApprovalSheet`.

Six RPCs survive:

| RPC                                                   | Caller | Effect                                                                                                   |
| ----------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| `self_order_get_snapshot(token, op_id?)`              | guest  | table + menu + unambiguous open order + pending request or this browser's rejected request + live intent |
| `self_order_submit(token, cart, note, op_id)`         | guest  | exactly one open order → `append_order_items`; otherwise insert `pending`                                |
| `self_order_create_payment_request(...)`              | guest  | same product flow, but binds directly to the only open order and rejects multi-bill ambiguity            |
| `self_order_accept_request(req_id, target_order_id?)` | staff  | `create_order` or `append_order_items`                                                                   |
| `self_order_reject_request(req_id)`                   | staff  | `status = 'rejected'`                                                                                    |
| `self_order_cancel_payment_request(...)`              | staff  | same product flow, keyed by request/order rather than session                                            |

The one-argument snapshot overload remains as a compatibility wrapper during
S1; it supplies no rejected request context. S3 calls the two-argument overload.

## Deployment boundary

S1 is additive at the table/column level but changes the public snapshot
contract. Land and verify its migration file locally first. Do not apply it to
production ahead of the S2-S5 runtime; production apply and the runtime deploy
belong to the same cutover window. S6 remains a later destructive cleanup.

## Freshness

Adaptive polling, no realtime. 3s while `Chờ xác nhận` or `Đang thanh toán`; 15s otherwise; refetch on tab focus and bfcache restore. The Supabase broadcast topic, its trigger, and its realtime policies are deleted.

## Trust boundary

Device binding is removed by owner decision. Anyone holding a photograph of a table's QR can read that table's bill and append items while the table is open. Staff approval gates _opening_ a table, not _appending_ to an open one. The dining room is the trust boundary; a wrong dish arriving at a table is visible to staff.

Public snapshot, submit, and payment endpoints keep bounded per-token and per-network rate limits (`self_order_rate_buckets`) and return one shared fail-closed recovery state. Responses stay `private, no-store`.

## Brand placement

| Asset                                        | On `/q/[token]`                                                             |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| `BrandMascot`                                | Static only in G0 unavailable and the G4 pending overlay. Never animated or interactive |
| `BrandLockup` / `BrandMark` / `BrandLogoBox` | **Forbidden**                                                               |
| `brand-pattern-caro`                         | **Forbidden**                                                               |
| `BrandSymbol` (`riceBowl`)                   | Empty menu (`AppEmptyState.symbol`) and missing item-photo placeholders     |

## Non-goals

- No desktop IA fork.
- No change to `finalize_paid_order`, paid-order table release, KDS ticket/item status, or cashier POS pay-before-ready semantics.
- No `is_featured` column on `menu_items`; the lead three derive from the
  existing `main_dish` type and menu order.
- No admin surface for toggling `self_order_enabled` or printing table QRs. None exists today; that gap is out of scope here.
- No new palette, typography, radius, elevation, or decorative token. `workflow-safe-pb` remains approved for public workflow fixed action bars and bottom-sheet footers.

## Runtime files

- `apps/web/app/q/[token]/page.tsx`
- `apps/web/app/q/[token]/self-order-client.tsx`
- `apps/web/app/q/[token]/self-order/menu-panel.tsx`
- `apps/web/app/q/[token]/self-order/cart-sheet.tsx`
- `apps/web/app/q/[token]/self-order/bill-drawer.tsx`
- `apps/web/app/q/[token]/self-order/payment-panel.tsx`
- `apps/web/app/(protected)/br/[branchId]/pos/pos-table-gate.tsx`
- `apps/web/app/(protected)/br/[branchId]/pos/self-order-actions.ts`
- `packages/shared/src/messages/self-order.ts`
