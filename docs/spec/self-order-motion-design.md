# Self-Order Loading & Feedback Polish — Design

**Surface:** `apps/web/app/q/[token]` (QR customer self-order, phone-first).
**Primary user job:** a customer scans a table QR, browses the menu, customizes items, submits a batch, and pays — on a phone, often on a slow connection.
**Route family:** public customer surface (no auth, no operator chrome).
**Change type:** UX polish — loading feedback, pending/error feedback, and one cart workflow-state fix. No new dependency, no new primitive component, no new motion utility.
**Related:** Guest brand + IA composition is owned by `docs/spec/self-order-guest-ui.md` (this file stays the loading/feedback contract).

## Context & Problem

The self-order surface ships its flows correctly but has weak loading and feedback states. Survey findings:

- No `loading.tsx` for the route — first paint blocks on the snapshot RPC with nothing shown.
- No spinner anywhere. Pending states (`isPending`, `isPaymentPending`) communicate only via text-label changes ("Submitting...") or button `disabled`.
- `useSnapshotSync` (`hooks.ts`) returns no `isRefreshing`; refresh failures are silently swallowed (`hooks.ts:35` only updates on `result.ok`).
- The floating submit-error alert (`self-order-client.tsx:384`, `fixed bottom-24 z-40`) can overlap the fixed cart bar (`cart-sheet.tsx:244`, `fixed bottom-0 z-30`).
- Cart `updateQuantity` (`self-order-client.tsx:132-142`) already floors quantity at 1, but the cart-line decrease button (`cart-sheet.tsx:119-127`) stays enabled at 1 and becomes a no-op. Removal should stay explicit through the trash button.

Existing DS affordances this surface underuses: `PageSkeleton` (`apps/web/app/components/page-skeleton.tsx`) for route `loading.tsx`, `Spinner` (`@comtammatu/ui/components/spinner`) for pending buttons, `Dialog` for workflow-changing guest states, and Sonner toast for non-blocking feedback. The Motion Contract already covers `Spinner`, `Skeleton`, Radix/Sheet enter-exit, and `transition-colors`; this pass does not widen it.

**Out of scope** (verified, not broken): the pending-payment confirm flow already uses the DS `confirm()` primitive (`@comtammatu/ui/components/confirm-dialog`, an `AlertDialog`), invoked at `self-order-client.tsx:188`. Sheet slide-in / Radix data-state enter-exit is handled by `tw-animate-css` and is sufficient. Category pill already has `transition-colors`. Sticky-category-header scroll hard-cut, image fade-in, cart badge bump, live-dot pulse, and order-summary expand animation are intentionally skipped until browser QA proves they solve a real usability problem.

## Approach

**Primitive-first, no new motion layer:**

- Adopt the existing `PageSkeleton`, `Spinner`, `Dialog`, and Sonner toast primitives/adapters.
- Do not add `@keyframes`, `--animate-*` tokens, local animation helpers, or a primitive component.
- Promote a pattern only when at least two surfaces reuse the same shape — not the case here.
- No `framer-motion` / `motion` dependency.

## Section 1 — Loading & pending feedback

**1.1 Route loading frame** — new file `apps/web/app/q/[token]/loading.tsx`.

- Default export renders `<PageSkeleton width="narrow" density="compact" mobile blocks={3} />`.
- No data fetch, no hand-rolled skeleton grid, no route-local visual contract.

**1.2 Refresh feedback** — `hooks.ts` + `self-order-client.tsx`:

- `useSnapshotSync` gains `isRefreshing: boolean`, `refreshError: string | null`, and `clearRefreshError`.
- `refreshSnapshot` sets `isRefreshing` with `try/finally`; on success it updates `snapshot` and clears `refreshError`; on failed response or thrown fetch it keeps the old snapshot and sets `refreshError`.
- No header refresh feedback. A failed refresh emits one deduplicated toast and
  the adaptive polling loop continues to recover on the next attempt.

**1.3 Submit / payment pending** — `cart-sheet.tsx`, `payment-panel.tsx`:

- Submit CTA (`CartSheet.SubmitCta`): when `isSubmitting`, render `<Spinner className="size-4" />` beside the label; keep the label text. The fixed cart action only opens the sheet and never submits.
- Payment buttons (`payment-panel.tsx:129-145`): when `isPending`, render `<Spinner className="size-4" />` beside each label; keep `disabled`.
- `Spinner` is always accompanied by its text label.

## Section 2 — Error feedback

**2.1 Submit-error alert in flow** — `self-order-client.tsx` + `cart-sheet.tsx`.

- Remove the `fixed bottom-24 z-40` floating alert (`self-order-client.tsx:384-391`).
- Pass `submitError` into `CartSheet`.
- Render the `Alert variant="destructive"` inside the open sheet footer. This keeps the error in the active checkout flow without turning the menu into a second submit surface.
- Clear `submitError` on the next submit attempt or when cart content changes through add/remove/quantity change.

**2.2 Refresh-error toast** — `self-order-client.tsx` + `hooks.ts`.

- When `refreshError !== null`, emit one Sonner error toast with
  `Không cập nhật được, đang dùng dữ liệu cũ`. Do not add a persistent header
  banner; a successful poll clears the dedupe key and a later failure may toast
  again.

## Section 3 — Cart decrement floor

`self-order-client.tsx` + `cart-sheet.tsx`:

- `updateQuantity` (`self-order-client.tsx:132-142`): keep the `Math.max(1, ...)` floor; remove the dead `.filter(item.quantity > 0)` for clarity.
- `CartLine` decrease button (`cart-sheet.tsx:119-127`): `disabled` when `item.quantity <= 1`.
- Removal remains only through the explicit trash button.

## Files touched

- `apps/web/app/q/[token]/loading.tsx` — route loading frame using `PageSkeleton`.
- `apps/web/app/q/[token]/self-order/hooks.ts` — `isRefreshing`, `refreshError`, `clearRefreshError`.
- `apps/web/app/q/[token]/self-order-client.tsx` — refresh-error toast,
  lower-right bill launcher after the first request, dialog guest states,
  submit-error wiring, `updateQuantity` cleanup.
- `apps/web/app/q/[token]/self-order/cart-sheet.tsx` — submit spinner, submit-error placement, decrease-button floor.
- `apps/web/app/q/[token]/self-order/payment-panel.tsx` — payment button spinner.
- `packages/shared/src/messages/self-order.ts` — refresh-error message/action copy.
- `apps/web/tests/qr-self-order-v2-phase1.test.ts` — static coverage for the above.

Explicitly not touched:

- `packages/ui/src/styles/globals.css`
- `docs/spec/design-system.md`
- `apps/web/app/q/[token]/self-order/menu-panel.tsx`
- `apps/web/app/q/[token]/self-order/status-pill.tsx`
- `apps/web/app/q/[token]/self-order/order-summary.tsx`

No new dependencies. No new primitive components. No database, RPC, or design-system contract changes.

## Verification

- `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build` before marking implementation complete (Critical Constraints).
- `corepack pnpm --filter @comtammatu/web test -- qr-self-order-v2-phase1.test.ts` or the nearest repo-supported targeted test command after adding static coverage.
- Browser/Playwright QA after implementation (per frontend-testing-debugging skill): mobile QR route with throttled network; offline refresh failure; retry failure leaves banner visible; successful retry clears banner; submit pending shows spinner+label; payment pending shows spinner+label; cart decrement disables at 1; no overlap between submit error and fixed cart bar.
- `prefers-reduced-motion`: no new custom motion to verify; existing DS backstop still covers `Spinner`, `Skeleton`, and Radix/Sheet motion.
