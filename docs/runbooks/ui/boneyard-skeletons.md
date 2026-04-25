# Boneyard skeleton runbook

Use Boneyard for client-side loading regions where a manually measured skeleton
would drift from the real UI. Keep the project `Skeleton` primitive as the
fallback so screens still load before generated bones exist.

## Setup

- Runtime dependency: `boneyard-js` in `@comtammatu/web`.
- Config: `apps/web/boneyard.config.json`.
- Output: `apps/web/app/bones/registry.ts` and `*.bones.json`.
- App import: `BoneyardRegistry` in `apps/web/app/layout.tsx`.

## Generate

Start the app, sign in when capturing protected routes, then run:

```bash
pnpm --filter @comtammatu/web bones:build -- http://localhost:3000 --force
```

For protected routes, either keep a logged-in browser session and use Boneyard's
`--cdp` flow, or add temporary auth cookies through environment-backed config.
Do not commit real session tokens.

The default route list lives in `apps/web/boneyard.config.json`:

- `/employee/schedule`
- `/notifications`
- `/br/1/pos`

Change `/br/1/pos` to a real dev branch id before capture if branch `1` is not
present in the local seed.

## Wrapped Regions

- `employee-schedule-week`: employee weekly schedule transition.
- `notifications-list`: notification list and popover refresh state.
- `pos-page-shell`: POS Suspense fallback shell.
- `pos-order-detail-sheet`: POS order-detail initial load state.
- `pos-bill-receipt-payment`: bill receipt payment-method initial load state.
- `pos-bill-receipt-qr`: QR/payment-provider creation state.

The POS sheet/dialog wrappers are only mounted after the user opens those flows.
Capture them with a logged-in interactive browser/CDP session or by navigating
through POS during a Boneyard capture run.

## Rules

- Wrap only the region that is actually loading, not the full app shell.
- Provide a `fixture` that renders the same layout shape as real data.
- Keep `fallback` on every `AppBoneyardSkeleton` usage.
- Re-run the generator after changing a wrapped component layout.
