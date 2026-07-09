# Self-Order Motion & UX Polish — Design

**Surface:** `apps/web/app/q/[token]` (QR customer self-order, phone-first).
**Primary user job:** a customer scans a table QR, browses the menu, customizes items, submits a batch, and pays — on a phone, often on a slow connection.
**Route family:** public customer surface (no auth, no operator chrome).
**Change type:** UX polish — loading feedback, CSS motion utilities, interaction animations, workflow-state fixes. No new dependency, no IA change, no new primitive component.

## Context & Problem

The self-order surface ships its flows correctly but has no motion or loading polish. Survey findings:

- Exactly one authored animation in the whole surface: `transition-colors` on the category tab pill (`menu-panel.tsx:83`).
- No `loading.tsx` for the route — first paint blocks on the snapshot RPC with nothing shown.
- No skeleton, no spinner anywhere. Pending states (`isPending`, `isPaymentPending`) communicate only via text-label changes ("Submitting…") or button `disabled`.
- `useSnapshotSync` (`hooks.ts`) returns no `isRefreshing`; the refresh button never spins; refresh failures are silently swallowed (`hooks.ts:35` only updates on `result.ok`).
- `status-pill` shows a static dot even for inherently live states (`vietqr_pending`, `cash_call`, active session).
- `order-summary` expand/collapse is an instant jump despite the `accordion-down/up` keyframes existing in the DS.
- The floating submit-error alert (`self-order-client.tsx:384`, `fixed bottom-24 z-40`) can overlap the fixed cart bar (`cart-sheet.tsx:244`, `fixed bottom-0 z-30`).
- Cart `updateQuantity` (`self-order-client.tsx:132-142`) filters items out when quantity reaches 0 — decrementing from 1 to 0 silently removes a line; only the trash button is an explicit remove.

Existing DS affordances this surface never adopts: `Skeleton` (`@comtammatu/ui/components/skeleton`, `animate-pulse rounded-md bg-muted`) and `Spinner` (`@comtammatu/ui/components/spinner`, `size-4 animate-spin`). Motion tokens `--motion-fast/base/overlay/drawer/progress/spinner` and `--ease-move/linear` are defined in `globals.css:373-381`. A global `prefers-reduced-motion` backstop (`globals.css:708`) neutralizes all animation/transition app-wide.

**Out of scope** (verified, not broken): the pending-payment confirm flow already uses the DS `confirm()` primitive (`@comtammatu/ui/components/confirm-dialog`, an `AlertDialog`), invoked at `self-order-client.tsx:188`. Sheet slide-in / Radix data-state enter-exit is handled by `tw-animate-css` and is sufficient. Category pill already has `transition-colors`. Sticky-category-header scroll hard-cut is intentionally skipped (cosmetic, outside the agreed priorities).

## Approach

**Hybrid (chosen over local-only and primitive-first):**

- Adopt the **existing** `Skeleton` and `Spinner` primitives for loading.
- Add a **small layer of motion utility classes + keyframes** to `globals.css` (alongside the existing `--motion-*`, `--ease-*`, `--animate-spin`, `--animate-cotlet-*`). Any surface may consume them; no primitive component is created.
- Promote a pattern to a primitive component **only** when ≥2 surfaces use the same shape — not the case here.
- No `framer-motion` / `motion` dependency (CSS/Tailwind only).

## Section 1 — Motion utilities (shared CSS layer)

Add to `packages/ui/src/styles/globals.css`, inside the existing `@theme inline` block at line 383, beside `--animate-spin` and the Cot Let mascot tokens:

| Utility (`animate-*`) | Keyframe | Used for | Duration |
|---|---|---|---|
| `fade-in` | `opacity: 0 → 1` | Menu image on load complete; submit-error banner appearance; order-summary extra rows on expand | `--motion-base` (150ms) |
| `rise-in` | `opacity: 0; translateY(4px) → normal` | Submit-error banner slide-up | `--motion-overlay` (200ms) |
| `bump` | `scale(1) → 1.06 → 1` (one-shot) | Cart quantity badge when it increases | `--motion-base` (150ms) |
| `pulse-dot` | box-shadow ring expand + fade (loop) | Status pill dot when live/pending | `--motion-progress` (300ms), infinite |

All four reuse the existing `--motion-*` / `--ease-move` tokens. All are neutralized automatically by the `prefers-reduced-motion` backstop. Looping utilities (`pulse-dot`) additionally opt in via `motion-safe:` at the call site, per the backstop comment (`globals.css:705-706`).

**Contract update (required, DS-contract-first):** add a "Motion Contract" subsection to `docs/spec/design-system.md` documenting these four utilities (duration, easing, one-shot vs loop, reduced-motion handling) — mirroring how `--motion-*` and the Cot Let mascot tokens are already documented there.

## Section 2 — Loading & feedback

**2.1 Route loading skeleton** — new file `apps/web/app/q/[token]/loading.tsx`. Default export rendered by App Router while `page.tsx` (server) awaits the snapshot RPC. Renders a header skeleton + a horizontal skeleton pill row + a 2-column skeleton card grid matching `MenuItemCard`'s `aspect-[4/5]`. Uses the `Skeleton` primitive only. No data fetch.

**2.2 Refresh feedback** — `hooks.ts` + `self-order-client.tsx`:
- `useSnapshotSync` gains `isRefreshing: boolean` and `refreshError: string | null` (+ `clearRefreshError`). Set `isRefreshing` around the fetch in a `try/finally`; on `result.ok === false`, set `refreshError` instead of swallowing.
- The refresh button (`self-order-client.tsx:305-313`) applies `animate-spin` to `IconRefresh` (the `--animate-spin` token) while `isRefreshing`, and is `disabled` during refresh to prevent double-tap.

**2.3 Submit / payment pending** — `cart-sheet.tsx`, `payment-panel.tsx`:
- Submit CTA (`CartSheet.SubmitCta` at `cart-sheet.tsx:173`, plus the FAB bar CTA at `cart-sheet.tsx:265`): when `isSubmitting`, render `<Spinner className="size-4" />` beside the label; keep the label text (never empty).
- Payment buttons (`payment-panel.tsx:129-145`): when `isPending`, render `<Spinner` beside the label; keep `disabled`.
- Rule: `Spinner` is always accompanied by its text label (screen-reader semantics; `role="status"` already on the primitive).

**2.4 Menu image fade-in** — `menu-panel.tsx` `MenuPhotoButton`:
- Wrap the `next/image` in a `Skeleton` fill background.
- On `onLoadingComplete`, add `animate-fade-in` to the `<Image>` and hide the skeleton background.
- The no-image fallback (`IconUtensils`) is unchanged.

## Section 3 — CSS interaction animations

**3.1 Status pill pulse** — `status-pill.tsx`. Add `live: boolean` to `PillConfig`. Pulse only for live/pending states: `vietqr_pending`, `cash_call`, and an active session that is not yet paid. Do **not** pulse for `pending_approval`, `closed`, or `paid` (terminal). The dot renders `<span className="motion-safe:animate-pulse-dot ...">` when `live`.

**3.2 Order summary expand fade** — `order-summary.tsx`. On expand, the rows beyond `COLLAPSE_THRESHOLD` (5) receive `animate-fade-in` with a staggered `animationDelay` via inline style. Collapse remains instant. (Chosen over adopting the Radix Accordion primitive — minimal structural change, no height measurement needed.)

**3.3 Cart add bump** — `cart-sheet.tsx`. The quantity `Badge` (FAB bar `cart-sheet.tsx:254` and inside the sheet `cart-sheet.tsx:287`) plays a one-shot `animate-bump` when `quantity` increases (not on decrease/remove). Implementation: track the previous quantity in state; on increase, set a transient `bumpKey` that applies the class, cleared after `--motion-base`.

## Section 4 — Workflow UX fixes

**4.1 Submit-error alert in flow (chosen option B)** — `self-order-client.tsx`. Remove the `fixed bottom-24 z-40` floating alert (`self-order-client.tsx:384-391`). Render the `submitError` `Alert variant="destructive"` inline at the end of the active tab content (menu tab and bill tab), so it appears where the customer is acting — near the CTA, not floating over the cart bar. It uses `animate-rise-in` (Section 1). It clears when `submitError` is cleared (on next submit attempt or explicit dismiss).

**4.2 Refresh-error banner** — `self-order-client.tsx` + `hooks.ts`. When `refreshError !== null`, render a compact warning below the header using `NoteCallout tone="warning"` (the canonical warning surface per `docs/agent/rules/ui.md`), with the message "Không cập nhật được, đang dùng dữ liệu cũ" and a "Thử lại" button that calls `refreshSnapshot` then `clearRefreshError`. Both realtime disconnects and poll failures surface through this single door (both go through `refreshSnapshot`).

**4.3 Cart decrement floor** — `self-order-client.tsx` + `cart-sheet.tsx`. Floor quantity at 1 via the decrement path; removal is only the explicit trash button:
- `updateQuantity` (`self-order-client.tsx:132-142`): remove the `.filter(item.quantity > 0)`; keep `Math.max(1, ...)`.
- `CartLine` decrease button (`cart-sheet.tsx:119-127`): `disabled` when `item.quantity <= 1`.

## Files touched

- `packages/ui/src/styles/globals.css` — 4 keyframes + 4 `--animate-*` tokens.
- `docs/spec/design-system.md` — Motion Contract subsection.
- `apps/web/app/q/[token]/loading.tsx` — new route loading skeleton.
- `apps/web/app/q/[token]/self-order/hooks.ts` — `isRefreshing`, `refreshError`, `clearRefreshError`.
- `apps/web/app/q/[token]/self-order-client.tsx` — refresh-button spin, in-flow submit-error alert, refresh-error banner, `updateQuantity` floor.
- `apps/web/app/q/[token]/self-order/menu-panel.tsx` — image fade-in + skeleton.
- `apps/web/app/q/[token]/self-order/cart-sheet.tsx` — submit/payment spinner, cart bump, decrease-button floor.
- `apps/web/app/q/[token]/self-order/payment-panel.tsx` — payment button spinner.
- `apps/web/app/q/[token]/self-order/status-pill.tsx` — live-dot pulse.
- `apps/web/app/q/[token]/self-order/order-summary.tsx` — expand fade.

No new dependencies. No new primitive components. No database, RPC, or contract changes. No copy additions beyond the two Vietnamese refresh-error strings (sourced from `@comtammatu/shared/messages`).

## Verification

- `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build` before marking complete (Critical Constraints).
- `corepack pnpm lint:ui-contract` must pass after the `design-system.md` Motion Contract addition.
- Manual: scan QR route with throttled network (DevTools Slow 3G) to confirm loading skeleton → image fade; trigger a refresh failure (offline) to confirm the warning banner; submit a batch to confirm spinner + in-flow error; decrease a cart line to 1 to confirm the decrease button disables.
- `prefers-reduced-motion`: enable macOS "Reduce Motion" and confirm all four utilities collapse to ~instant (backstop).
