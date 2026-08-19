# Self-Order Loading And Feedback Contract

**Surface:** `apps/web/app/q/[token]` (public QR ordering, phone-first).
**Related:** `docs/spec/self-order-guest-ui.md` owns the guest workflow and data
contract. This document owns only loading, feedback, and motion boundaries.

## Interaction boundary

- The menu is the only guest page.
- `Hoá đơn` opens a drawer; the drawer switches between bill and payment.
- The in-flow cart action opens the cart sheet. Its footer is the only guest
  submit control.
- A pending request, rejection, live payment, or multi-bill ambiguity is shown
  through the snapshot-derived guest state. Awaiting confirmation is an in-flow
  `role="status"` banner on the menu, not an `AppDialog`. Live payment does not
  trap the guest in G7; they dismiss to the menu and reopen QR from the bill.
  Do not add a second state store, notification row, or realtime channel.

## Loading And Feedback

- Route loading uses the existing `PageSkeleton`; do not hand-roll a QR-specific
  skeleton.
- Pending submit and payment actions use the shared `Spinner` alongside their
  text label, and stay disabled until the request settles.
- Snapshot refresh and state transitions use the guest Sonner preset. Awaiting
  and rejected states emit one deduplicated warning toast; successful polling
  clears the corresponding toast key.
- Submit and payment errors stay inside the cart sheet or bill drawer that owns
  the action. They must not overlap the in-flow cart launcher or create a second
  menu CTA.
- Cart quantity never falls below one. Removal is explicit.

## Motion Boundary

- Reuse Sheet/Drawer transitions, `Spinner`, `PageSkeleton`,
  transform-only press (`active:scale` ≥ `0.97`, `duration-150`), and tokens
  already provided by the design system.
- Menu rows animate `transform` only. Do not animate background, border, or
  shadow on those rows, and do not nest a second scale on the photo.
- Pending bill overlay is an opaque surface over a faded list. Do not use
  `filter: blur` or `backdrop-filter` on this path (paint cost on the bill
  sheet).
- Do not add custom keyframes, animation tokens, Framer Motion, or a route-local
  motion helper.
- Adaptive polling is the freshness mechanism: 3 seconds while awaiting or
  paying, 15 seconds otherwise, with refresh on tab focus and bfcache restore.

## Verification

- Focused Self-Order static tests cover drawer-only bill/payment, cart-sheet
  submit, polling, and the absence of device/capability vocabulary.
- Run `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build` for
  implementation changes.
- Browser smoke, when a non-production runtime is available: QR menu, cart
  sheet, first request, staff decision, add-more, payment, and refresh recovery
  at `390x844`.
