# Self-Order Guest UI — Brand + IA Contract

**Surface:** `apps/web/app/q/[token]` (public QR customer self-order).
**Primary user job:** Scan table QR → browse menu → customize → submit batch → wait for staff approval → pay (cash call / VietQR) on a phone.
**Route family:** Standalone public customer surface (no auth, no operator chrome).
**Change type:** Phone-first IA refresh. Compact chrome. No mascot. No decorative brand lockup on the ordering surface.
**Primitives used:** `AppPage`, `AppSection`, `AppEmptyState`, `PageSkeleton`, `Button`, `Badge`, `Tabs`, `Sheet`, `Alert`, `NoteCallout`, `Spinner`, `Item`.

## Authority

- Design system: `docs/spec/design-system.md`
- Motion / loading polish: `docs/spec/self-order-motion-design.md` (still in force)
- Copy: `packages/shared/src/messages/self-order.ts` (`SELF_ORDER_VI`)

## Product thesis

Guest surface is a **touch-first ordering tool**, not a brand splash. First viewport = table + status + menu. Decorative chrome (mascot, pattern wash, logo lockup in header/bill) is forbidden on this route — it steals vertical space from the menu and cart CTA.

## IA map (state → primary chrome)

| Session / payment state        | Primary composition                                 | Menu                             | Bill                           | Cart bar                              |
| ------------------------------ | --------------------------------------------------- | -------------------------------- | ------------------------------ | ------------------------------------- |
| No session / fresh             | Compact header + menu                               | Primary                          | Empty bill copy                | Hidden until cart has items           |
| Cart drafting                  | Header + menu + sticky cart                         | Primary                          | Available                      | Sticky bottom CTA                     |
| `pending_approval`             | Compact warning callout + menu                      | Primary under banner             | Available                      | Sticky; CTA hard-disabled             |
| `active`                       | Header + menu; bill for pay                         | Primary for add-more             | Order summary + payment        | Sticky for add-more                   |
| Payment pending                | Bill destination                                    | Visible but add/customize locked | Primary; exact intent recovery | Sticky; submit hard-disabled          |
| Unbound second device          | Menu + approval-required state                      | Draft allowed                    | Active bill hidden             | Submit creates staff approval request |
| `revoked`                      | Compact destructive alert + rejected rounds on Bill | Optional                         | Primary (history)              | CTA disabled until staff rotates QR   |
| Token unavailable / POS closed | Plain unavailable card                              | N/A                              | N/A                            | N/A                                   |

`closed` sessions are **not** returned by the stable table QR snapshot (prevents next seating from seeing the previous paid bill). The printed table QR is lookup context only. An active seating bill, add-more, and payment require a seating-bound continuation capability.

### Navigation rule (Menu ↔ Bill)

- Keep **Thực đơn** / **Hoá đơn** via `Tabs` (one phone IA).
- Menu is default landing.
- Bill tab shows a count badge when an approved order exists.
- After first batch approval (`pending_approval` → `active` with order), auto-switch once to Bill.
- When a cash/VietQR intent becomes active or is recovered after reload, switch to Bill and keep the same intent visible.
- Approved devices keep the Bill tab visible. Public/pending devices keep the
  tab position stable but disabled until staff approval because no bill data is
  present by contract.

## Composition rules

### 1. Compact header

- Sticky: plain `bg-background` + border. No gradient, no `brand-pattern-caro`, no `BrandLockup` / `BrandMark` / `BrandMascot`.
- Left: branch name + `StatusPill`; H1 = table label.
- Below/Right: Menu | Bill `TabsList` (`h-11`). At narrow phone widths, table
  context/status stacks above a full-width tab list; horizontal composition is
  allowed only when both fit without truncation or overlap.

### 2. Menu as hero job

- Category pills + 2-column photo cards.
- Empty menu: `AppEmptyState` with `symbol="riceBowl"` only (static symbol, not mascot).

### 3. Session state panel

- Compact inline callout/alert only — no centered hero, no mascot.
- `pending_approval`: `NoteCallout tone="warning"` with title + short hint.
- `revoked`: `Alert variant="destructive"`.
- Paid/closed: one-line `NoteCallout tone="muted"` + optional touch `View Bill` button.
- No raw `Card`.

### 4. Cart

- Sticky bottom bar: cart open (touch) + subtotal (tap opens sheet) + primary `touch-lg` CTA.
- Keep bar short (`py-2`); put long disabled hints in the cart sheet CTA, not under the FAB.
- Submit errors in-flow above the bar / in sheet footer.

### 5. Bill / payment

- Bill primary content is canonical `order.items + order.totalAmount`; this is the payable truth after staff edits, voids, merges, and add-more.
- Round history from snapshot `batches` is secondary audit context:
  `Lượt N` + status badge (`Đang chờ duyệt` | `Đã duyệt` | `Đã huỷ`) + submitted lines.
- Rejected rounds stay visible (struck-through / muted) but never control the payable total.
- Payment / HĐĐT only when session is `active`, order exists, and `paymentStatus !== "paid"`.
- Payment state/action renders before optional HĐĐT buyer details. Buyer inputs
  are hidden after intent creation, use touch-height controls, per-field errors,
  `aria-invalid`, and focus the first invalid field.
- Guest VietQR creation is available only for canonical order status `ready` or `served`; cashier POS keeps the existing pay-before-ready contract.
- Exactly one active intent exists across `cash_call` and VietQR. Both lock add-more, item customization, buyer fields, and new payment creation.
- VietQR reload renders the stored amount, payment code, QR bytes, bank snapshot, and expiry; it never rebuilds an active QR from current settings.
- Guests cannot cancel or switch an active payment intent. The POS queue owns cancellation after staff verifies that money is not already in flight.
- Auto-open Bill when a new batch appears or session enters `pending_approval`.
- Orphan `pending_approval` (no pending batch) is healed to `revoked` in DB on snapshot/submit — not payload-only.

### 6. Seating capability boundary

- The server bootstraps an opaque HttpOnly device secret before the first mutable action; the database stores only its hash.
- The cookie is host-only, `SameSite=Lax`, scoped to `/api/self-order`, expires
  after 12 hours, and never enters URL/JSON/logs. Public responses are
  `private, no-store` and vary by cookie.
- The first submitted browser creates an `origin_pending` capability. Staff
  reads the short pairing code from the guest's screen; approval atomically
  creates/binds the canonical order, accepts the batch, and promotes the device.
- An unbound browser never receives the active order, bill, payment request, invoice payload, or seating realtime topic.
- On an active seating, an unbound browser may browse/draft, but its submit creates a normal staff approval request. Approval atomically appends the batch and binds that browser capability; rejection binds nothing.
- A second device may also request join-only access without submitting food;
  its pairing-code approval grants bill access but performs no cart mutation.
- Reloading a pending device may rotate its own pairing code through the
  bounded recovery endpoint; plaintext pairing codes are never stored.
- A missing/expired capability is recoverable through staff approval. It never falls back to token-only active bill access.
- Public snapshot, submit, and payment endpoints use bounded per-token/device/network rate limits and return one shared fail-closed recovery state.

### 7. Unavailable / loading

- Loading: `PageSkeleton` narrow/compact/mobile.
- Unavailable: plain centered `Item` with title/description. No brand assets.

## Brand placement

| Asset                                        | On `/q/[token]`             |
| -------------------------------------------- | --------------------------- |
| `BrandMascot`                                | **Forbidden**               |
| `BrandLockup` / `BrandMark` / `BrandLogoBox` | **Forbidden**               |
| `brand-pattern-caro`                         | **Forbidden**               |
| `BrandSymbol` via `AppEmptyState.symbol`     | Allowed for empty menu only |

## Non-goals

- No desktop IA fork.
- No change to `finalize_paid_order`, paid-order table release, KDS ticket/item status, or cashier POS pay-before-ready semantics.
- No new palette, typography, radius, elevation, or decorative token. The
  generic `workflow-safe-pb` utility is approved only for public workflow fixed
  action bars and bottom-sheet footers.
- No marketing hero / mascot / decorative logo chrome on the ordering surface.

## Runtime files

- `apps/web/app/q/[token]/self-order-client.tsx`
- `apps/web/app/q/[token]/self-order/session-state-panel.tsx`
- `apps/web/app/q/[token]/self-order/menu-panel.tsx`
- `apps/web/app/q/[token]/self-order/cart-sheet.tsx`
- `apps/web/app/q/[token]/self-order/payment-panel.tsx`
- `apps/web/app/q/[token]/page.tsx`
- `packages/shared/src/messages/self-order.ts`
