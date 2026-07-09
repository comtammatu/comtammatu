# Self-Order Guest UI — Brand + IA Contract

**Surface:** `apps/web/app/q/[token]` (public QR customer self-order).
**Primary user job:** Scan table QR → browse menu → customize → submit batch → wait for staff approval → pay (cash call / VietQR) on a phone.
**Route family:** Standalone public customer surface (no auth, no operator chrome).
**Change type:** Phone-first IA refresh. Compact chrome. No mascot. No decorative brand lockup on the ordering surface.
**Primitives used:** `AppPage`, `AppSection`, `AppEmptyState`, `PageSkeleton`, `Button`, `Badge`, `Tabs`, `Sheet`, `Alert`, `NoteCallout`, `Spinner`, `Item`, `confirm`.

## Authority

- Design system: `docs/spec/design-system.md`
- Motion / loading polish: `docs/spec/self-order-motion-design.md` (still in force)
- Copy: `packages/shared/src/messages/self-order.ts` (`SELF_ORDER_VI`)

## Product thesis

Guest surface is a **touch-first ordering tool**, not a brand splash. First viewport = table + status + menu. Decorative chrome (mascot, pattern wash, logo lockup in header/bill) is forbidden on this route — it steals vertical space from the menu and cart CTA.

## IA map (state → primary chrome)

| Session / payment state | Primary composition | Menu | Bill | Cart bar |
| --- | --- | --- | --- | --- |
| No session / fresh | Compact header + menu | Primary | Empty bill copy | Hidden until cart has items |
| Cart drafting | Header + menu + sticky cart | Primary | Available | Sticky bottom CTA |
| `pending_approval` | Compact warning callout + menu | Primary under banner | Available | Sticky; CTA hard-disabled |
| `active` | Header + menu; bill for pay | Primary for add-more | Order summary + payment | Sticky for add-more |
| Payment pending | Bill destination | Reachable for cancel-then-add | Primary | Sticky; submit stays clickable |
| `revoked` | Compact destructive alert + rejected rounds on Bill | Optional | Primary (history) | CTA disabled until staff rotates QR |
| Token unavailable / POS closed | Plain unavailable card | N/A | N/A | N/A |

`closed` sessions are **not** returned by the stable table QR snapshot (prevents next seating from seeing the previous paid bill). Active paid orders still surface via `order.paymentStatus === "paid"` while the session remains `active` until close RPC runs.

### Navigation rule (Menu ↔ Bill)

- Keep **Thực đơn** / **Hoá đơn** via `Tabs` (one phone IA).
- Menu is default landing.
- Bill tab shows a count badge when an approved order exists.
- After first batch approval (`pending_approval` → `active` with order), auto-switch once to Bill.
- Do not hide the Bill tab.

## Composition rules

### 1. Compact header

- Sticky: plain `bg-background` + border. No gradient, no `brand-pattern-caro`, no `BrandLockup` / `BrandMark` / `BrandMascot`.
- Left: branch name + `StatusPill`; H1 = table label.
- Right: Menu | Bill `TabsList` (`h-11`).

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

- Bill primary content is **round history** from snapshot `batches`:
  `Lượt N` + status badge (`Đang chờ duyệt` | `Đã duyệt` | `Đã huỷ`) + cart lines.
- Rejected rounds stay visible (struck-through / muted) — never disappear after staff reject.
- Payment / HĐĐT only when session is `active`, order exists, and `paymentStatus !== "paid"`.
- Auto-open Bill when a new batch appears or session enters `pending_approval`.
- Orphan `pending_approval` (no pending batch) is healed to `revoked` in DB on snapshot/submit — not payload-only.

### 6. Unavailable / loading

- Loading: `PageSkeleton` narrow/compact/mobile.
- Unavailable: plain centered `Item` with title/description. No brand assets.

## Brand placement

| Asset | On `/q/[token]` |
| --- | --- |
| `BrandMascot` | **Forbidden** |
| `BrandLockup` / `BrandMark` / `BrandLogoBox` | **Forbidden** |
| `brand-pattern-caro` | **Forbidden** |
| `BrandSymbol` via `AppEmptyState.symbol` | Allowed for empty menu only |

## Non-goals

- No desktop IA fork.
- No API/RPC/POS approval changes.
- No new design-system tokens.
- No marketing hero / mascot / decorative logo chrome on the ordering surface.

## Runtime files

- `apps/web/app/q/[token]/self-order-client.tsx`
- `apps/web/app/q/[token]/self-order/session-state-panel.tsx`
- `apps/web/app/q/[token]/self-order/menu-panel.tsx`
- `apps/web/app/q/[token]/self-order/cart-sheet.tsx`
- `apps/web/app/q/[token]/self-order/payment-panel.tsx`
- `apps/web/app/q/[token]/page.tsx`
- `packages/shared/src/messages/self-order.ts`
