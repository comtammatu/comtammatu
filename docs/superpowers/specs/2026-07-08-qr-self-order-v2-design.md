# QR Self-Order V2 — Design Spec

> Status: Approved design (pending written-spec review)
> Date: 2026-07-08
> Builds on: QR Self-Order V1 (`docs/worklog/2026-07-08-qr-self-order-v1.md`)
> Review tier: T3 (touches public API surface, snapshot RPC, POS, payment, realtime)

## Context

QR Self-Order V1 is shipped end-to-end: customer page (`/q/[token]`), public API
(service-role + narrow RPCs), staff approval sheet, and table-token admin. The
backend is solid (server-side canonicalization, atomic cancel+append, realtime
broadcast + poll fallback). The weaknesses are in the UX layer:

- **A** No clear visual distinction between session states (pending approval /
  active / awaiting payment) — customer only sees one small `NoteCallout`.
- **B** Cart, note, and payment live in one long scrollable aside; no sticky
  total + submit CTA. On mobile the submit button is buried.
- **C** Notes are cart-level only; the per-item `note` contract
  (`contracts.ts:35`) is unused in UI.
- **D** Modifiers and sides are not exposed in UI (only default sides added
  silently), even though the contract and RPC already store them.
- **E** No view of the already-ordered items; `snapshot.order` has only
  total/count, no line items.
- **F** Staff approval sheet polls every 15s (no realtime push) and shows raw
  `batch.status` instead of Vietnamese labels.
- **G** Admin QR dialog has no print / download PNG — owner must screenshot.
- **H** "POS session closed" falls into the generic unavailable message.
- **I** CTA shows "Gọi thêm món" even while the first batch is still pending
  approval.

## Goal

V2 is a **UI/UX layer over V1**, not a backend rewrite. Three phases, each an
independent implementation plan, merged independently. Fixes all nine issues.

## Architecture & Boundaries

**Principle:** reuse V1 backend; additive only.

- P1 and P2 require **no new schema**. The `self_order_submit_batch` RPC already
  stores `modifiers` (server-validated), `sides`, and per-item `note`
  (`20260708031857_qr_self_order_v1.sql:391-428`). P1/P2 only surface them.
- P1 needs **one additive snapshot change**: add `order.items[]` to the output
  of `self_order_get_snapshot` (currently returns total/count only). This is the
  only SQL-touching change in P1; all existing consumers keep working.
- Realtime is reused. The customer topic `self-order:<token>` broadcast
  `session_changed` already exists. P3 adds the reverse direction: staff queue
  listens to the existing POS broadcast mechanism for `self_order_batch_created`.
- All new components use `@comtammatu/ui` primitives + `AppPage`/surface
  adapter. Copy strings live in `SELF_ORDER_VI` (new keys only, no edits to
  existing keys). No route-local theme.

**File split:** `self-order-client.tsx` (1058 lines, 6 inline subcomponents) is
split into a `self-order/` folder so P2/P3 edits don't collide:

```
app/q/[token]/
  page.tsx
  self-order-client.tsx        # orchestrator + state + realtime
  self-order/
    hooks.ts                   # useSnapshotSync (refresh + realtime + poll)
    menu-panel.tsx             # search, tabs, menu grid
    menu-item-card.tsx         # photo card (P2 adds customize trigger)
    cart-sheet.tsx             # FAB cart (P1) + cart line editor (P2)
    payment-panel.tsx
    order-summary.tsx          # "món đã gọi" (P1) + status pill
    status-pill.tsx
```

This is a targeted improvement (enables conflict-free phased delivery), not
gratuitous refactor.

### Phase boundary matrix

| Phase | Fixes | Touches | SQL migration? | Backend |
|-------|-------|---------|----------------|---------|
| **P1 — Customer flow** | A, B, E, I | `self-order-client.tsx` split, snapshot RPC | Yes, additive (1) | snapshot returns `order.items` |
| **P2 — Item customization** | C, D | menu-item-card, cart-sheet | No | None (RPC already persists) |
| **P3 — Staff / Owner** | F, G, H | approval-sheet, table-table QR dialog, page.tsx | No (F, H) | print job for G (confirm in plan) |

---

## Phase 1 — Customer Flow (fixes A, B, E, I)

### Layout decision: B — Status pill + FAB cart

Chosen over a 4-step stepper (option A) for maximum menu width and familiarity
with food-delivery app patterns. The status pill is compact; the cart is a round
FAB. A sticky bottom bar holds running total + primary CTA.

### P1.1 Status pill (fixes A)

A compact pill in the header reflects the current session state. It is the
single source of truth the customer glances at:

| Snapshot state | Pill text | Pill tone |
|----------------|-----------|-----------|
| `pending_approval` (first batch sent) | "Đang chờ nhân viên duyệt" | warning |
| `active`, no payment request | "Đang gọi món" | success |
| `active` + `vietqr_pending` | "Đang chờ thanh toán QR" | info |
| `active` + `cash_call` | "Đang chờ nhân viên thu tiền" | warning |
| `closed` | "Đã thanh toán" | muted |
| no session yet | (hidden) | — |

Replaces the current `SessionStatus` `NoteCallout`. New `SELF_ORDER_VI` keys:
`statusPendingApproval`, `statusActive`, `statusAwaitingVietQr`,
`statusAwaitingCash`, `statusClosed`.

### P1.2 FAB cart + sticky bottom bar (fixes B)

- **Mobile:** cart is a round FAB (bottom-right) showing item count. Tapping it
  opens a bottom sheet `CartSheet` with line items, note, subtotal, and the
  submit CTA. A slim sticky bottom bar above the FAB shows "Tạm tính · 125.000₫"
  + the primary CTA so submit is always one tap away.
- **Desktop (lg+):** keep the current right aside but pin subtotal + CTA to the
  bottom of the aside (`sticky bottom-0`), so scrolling the cart never loses the
  submit button.

### P1.3 Already-ordered summary (fixes E)

When `session.status === "active"`, show an "Món đã gọi" section above the menu
listing `order.items[]` (item name, variant, quantity, unit price, line total).
Requires the additive snapshot change (P1 SQL). Collapsed by default when more
than 5 items (shows first 5 + "xem thêm"); expand to see all. When 1–5 items,
show inline without a collapse control.

**Additive snapshot change:**
- Migration: alter `self_order_get_snapshot` to include `items` inside the
  `order` jsonb — select from `order_items` joined with `menu_items` for the
  session's `order_id`, same shape already used by POS line-item display.
- TypeScript: extend `PublicSelfOrderSnapshot["order"]` with
  `items: SelfOrderOrderLine[]`. `SelfOrderOrderLine = { name; variantName?; quantity; unitPrice; lineTotal }`.

### P1.4 CTA locking (fixes I)

Primary CTA state by session:

| State | CTA label | Enabled? |
|-------|-----------|----------|
| no session, empty cart | "Gửi nhân viên duyệt" | disabled (empty) |
| `pending_approval` (first batch pending) | "Đang chờ duyệt lô đầu" | disabled |
| `active`, no pending payment | "Gọi thêm món" | enabled if cart non-empty |
| `active` + `vietqr_pending` / `cash_call` | "Huỷ QR để gọi thêm" flow | locked (existing logic, made visually clear) |
| `closed` | hidden; show "Đã thanh toán, cảm ơn" | — |

The pending-approval lock is the key fix: today the button still reads "Gọi thêm
món" while the first batch is unapproved, tempting a second conflicting batch.

### P1 acceptance

- Customer always sees current state in the pill; no ambiguous NoteCallout.
- Submit CTA reachable within one tap on mobile and pinned on desktop.
- Already-ordered items visible when active; subtotal matches `order.totalAmount`.
- Cannot submit a second batch while first batch is `pending_approval`.

---

## Phase 2 — Item Customization (fixes C, D)

### Layout decision: A — Full bottom sheet

When a menu item has modifiers or non-default sides, tapping it opens a
stationary bottom sheet (`ItemCustomizeSheet`) instead of adding directly. Items
with no customization keep tap-to-add (fast path).

### P2.1 Customize sheet contents

1. **Item header** — large photo, name, base price.
2. **Modifier groups** — single-select pill rows per group (e.g. "Mức đỏ: Vừa /
   Nhiều +5.000 / Ít −2.000"). Selected pill is primary-toned.
3. **Sides** — checkbox list. Default sides pre-checked (from
   `menu_item_available_sides` where `is_default`). Optional sides show "+price".
   Each side has a quantity stepper (default 1).
4. **Per-item note** — text input (max 300 chars) → stored in `SelfOrderCartItem.note`.
5. **Quantity stepper** + **"Thêm vào giỏ · {lineTotal}₫"** CTA. `lineTotal`
  updates live as modifiers/sides/qty change (reuse existing `lineTotal` helper).

### P2.2 Cart line editor

Each cart line shows chosen modifiers/sides and note summary. Tapping a line
reopens `ItemCustomizeSheet` pre-filled for editing. The existing per-line qty
+/- and remove stay.

### P2.3 Data flow (no backend change)

`SelfOrderCartItem` already carries `modifiers[]`, `sides[]`, `note`
(`contracts.ts:25-36`). The sheet populates these; `postBatch` already sends
them; the RPC already validates/canonicalizes
(`20260708031857_qr_self_order_v1.sql:391-428`). P2 is pure UI.

### P2 acceptance

- Items with modifiers/sides open the sheet; plain items add directly.
- Modifier selection, side add/remove + qty, and per-item note all persist into
  the cart line and reach the RPC unchanged.
- Line total reflects choices live; cart subtotal aggregates correctly.
- Editing a cart line reopens the sheet pre-filled.

---

## Phase 3 — Staff / Owner (fixes F, G, H)

### P3.1 Staff realtime + Vietnamese labels (fixes F)

- **Realtime:** `self-order-approval-sheet.tsx` subscribes to the broadcast for
  `self_order_batch_created` (reuse the existing POS realtime channel pattern)
  and reloads the queue immediately on event. The 15s poll stays as fallback.
  Effect: customer submits → staff sees it in ~1s instead of ≤15s.
- **Labels:** replace raw `batch.status` (e.g. `pending_approval`) and
  `request.status` with `SELF_ORDER_VI` mapped labels. New keys:
  `staffStatusPending`, `staffStatusActive`, `staffStatusCashCall`,
  `staffStatusVietQrPending`. The existing `cashCallStaff` /
  `vietQrPendingStaff` keys are reused where they already fit.

### P3.2 QR print / download PNG (fixes G)

- **Download PNG:** `SelfOrderQrDialog` gains a "Tải PNG" button.
  `QRCode.toDataURL` already runs in the dialog (`table-table.tsx:422`); the
  button wraps it in `<a download="qr-ban-{number}.png">`.
- **Print QR:** adds an "In QR" button that enqueues a `print_jobs` row for the
  print-agent to print a QR label/sticker for the table.
  - **Dependency check (defer to implementation plan):** confirm print-agent
    supports a `qr-label` job type. If not, ship "Tải PNG" only in P3 and move
    "In QR" to a follow-up; do not block P3 on print-agent changes.

### P3.3 "POS session closed" label for customer (fixes H)

`server.ts:128` already maps `pos_session_closed` to a distinct message, but
`page.tsx` renders the generic `unavailableDescription` for every failure. Fix:
`page.tsx` branches on `snapshot.code === "pos_session_closed"` and renders
`SELF_ORDER_VI.posSessionClosed` ("Ca POS đang đóng. Vui lòng gọi nhân viên.")
with a lock/clock icon, distinct from the disabled-token icon.

### P3 acceptance

- Staff queue updates within ~1s of customer submission (not 15s).
- All queue statuses show Vietnamese labels, never raw enum values.
- Owner can download a QR PNG from the table QR dialog.
- Customer sees the dedicated "ca POS đang đóng" message (not generic
  unavailable) when the branch POS session is closed.

---

## Constraints & Compliance

- **Design system:** all UI uses `@comtammatu/ui` primitives + `AppPage` /
  surface adapter. No route-local theme, no new component library. Follow
  `docs/spec/design-system.md` rhythm/typography/token contract.
- **Copy:** all Vietnamese strings via `SELF_ORDER_VI` in
  `packages/shared/src/messages/self-order.ts`. New keys only; do not edit
  existing keys (would break V1 surfaces).
- **Data:** `supabase-js` only. Server Actions / route handlers validate with
  Zod. Never trust client names/prices (RPC already canonicalizes).
- **Scope in URL:** no `localStorage`/Context for scope.
- **File split** is part of P1 delivery to keep P2/P3 conflict-free.
- **Migration:** only the P1 additive snapshot change. Apply to dev/test only
  after verifying the target ref against the Environment Registry; production
  via PR → owner applies manually. Run `corepack pnpm db:types` after.

## Verification

Per phase implementation plan, but baseline gates for all phases:

- `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build`
- CodeGraph refresh after edits (`codegraph index .`).
- After P1 migration applied to type-source schema: `corepack pnpm db:types`.
- Targeted checks: public route allowlist (auth), shared auth tests, and a
  manual smoke of the customer → staff approval → payment flow per phase.

## Out of scope (V2)

- Admin UI for managing self-order beyond the existing table QR dialog.
- Multi-language customer UI (Vietnamese only).
- Customer self-cancel of submitted batches.
- Menu item images upload/management.
- Any rewrite of the V1 RPC security model or token scheme.
