# T3 — SePay payment code: fixed soundbox token + 12-char random match key

> Reconciled-through 4fc28dda

Date: 2026-07-04. Tier: T3 (money / SePay reconciliation match key, format-check
constraint, receipt-print RPC). Owner-driven.

## Owner request

Transfer-content / payment code becomes `VQRLOAMB20260626100157757` + a random
12-char alphanumeric suffix, e.g. `VQRLOAMB20260626100157757 A1A2A3A4A5A6`.

Owner clarifications during scoping:
- `VQRLOAMB20260626100157757` is a **fixed** token (not a live timestamp): the MB
  "loa thông báo" (soundbox) recognises it to announce the incoming transfer.
- The random suffix is the **match key**: the SePay webhook reconciles on the full
  content string.
- Owner asserts MB imposes **no 25-char limit** on the transfer content (overriding
  the NAPAS ID-08 25-char minimum-spec concern raised below).

## Decision

New payment code = `VQRLOAMB20260626100157757 ` + 12 CSPRNG `[A-Z0-9]` = **38 chars**.
Uppercase alphabet so the memo survives SePay/bank case-folding (webhook and RPC
match case-insensitively).

The fixed token is a **literal**, not a `VQRLOAMB[0-9]{17}` shape (owner
correction): only the 12-char suffix varies, so the generator, the webhook match,
and the new-format alternative of each check use the exact string
`VQRLOAMB20260626100157757 [A-Z0-9]{12}`.

Backward-compat is scoped by prod reality (verified read-only): **zero orders are
open with an old-format code** — all `VQRLOAMB[0-9]{17}` (361) and `DH…` (~7700)
rows are already paid or cancelled. So:
- The **webhook** matches only the new literal (+ legacy `DH`); no open old order
  needs auto-matching.
- The **constraint** and the **receipt-print filter** keep `VQRLOAMB[0-9]{17}` as a
  GRANDFATHER branch only — a CHECK re-validates the (unchanged) stored code on any
  UPDATE, so dropping it would break updates/reprints of the 361 settled old orders.
  `VALIDATE` is safe: 0 rows violate the new check.

## Four perspectives

- **PM.** Scope = change the generated code format only; no new config surface
  (single-tenant, token hardcoded). Done = new orders get the format, SePay
  auto-match still works, receipt QR still renders, old in-flight orders still
  reconcile.
- **BA / data rules.** Match remains full-string equality (`confirm_sepay_payment`:
  `lower(payment_code)=lower(provider_ref)` — format-agnostic, unchanged). Uniqueness
  moves from timestamp+seq to the CSPRNG suffix; the existing 1..20 retry loop in
  `ensure_order_payment_code` + the unique index cover collisions. Backward-compat:
  the old `[0-9]{17}` alternative MUST stay in the CHECK, because any UPDATE to an
  existing old-format order row re-validates its stored code.
- **Senior dev.** Authoritative generator is SQL `generate_order_payment_code()`
  (the `orders.payment_code` column DEFAULT); the TS `generateVietQrPaymentCode()`
  is a fallback (overridden by the SQL code in `createPayment`) kept in sync. CSPRNG
  via `extensions.gen_random_bytes` (pgcrypto in `extensions`, verified present);
  `search_path=''` safe by precedent (all other builtins are pg_catalog). Constraint
  widened NOT VALID + VALIDATE (superset → validation cannot fail).
- **QA / security.** Entropy 36^12 (~62 bits); attacker also needs exact amount +
  account, so the code is not the sole gate. Fail-safe: if a payer bank strips the
  space, the webhook extracts nothing → cashier manual-confirm fallback (no
  wrong-match, no lost money). Tests updated + behaviour validated (below).

## Edit sites

Migration `supabase/migrations/20260706090000_mb_speaker_fixed_token_payment_code.sql`:
- `generate_order_payment_code()` → fixed token + 12 CSPRNG `[A-Z0-9]`.
- `orders_payment_code_format_check` → optional-suffix superset (DROP + ADD NOT VALID + VALIDATE).
- `print_vietqr_emvco(...)` → description cap 25 → 50 (verbatim otherwise; merchant name stays 25).
- `enqueue_receipt_print(...)` → `provider_ref` filter widened to the superset (verbatim otherwise).

Code:
- `packages/shared/src/providers/impl/vietqr.ts` → `MB_SPEAKER_FIXED_TOKEN`,
  `randomPaymentAlnum(12)`, description sanitize cap 25 → 50 (account name stays 25).
- `apps/web/app/api/webhooks/sepay/route.ts` → `SEPAY_PAYMENT_CODE_RE` widened.
- Tests: `vietqr-provider.test.ts`, `payment-hardening-static.test.ts` pins updated.

No `database.types.ts` change (no signature change) → no `db:types` needed.

## Verification

- Fidelity diff: `print_vietqr_emvco` and `enqueue_receipt_print` byte-identical to
  the deployed/baseline source except the one intended line each.
- `corepack pnpm typecheck && lint && test` → exit 0; `packages/shared` re-run fresh
  (cache-distrust) → 340 pass / 0 fail.
- Generator + widened constraint validated on PROD via read-only SELECT (new code
  20-char sample passed; new/old/DH accepted; garbage + 38-char-with-space rejected
  by the exact-shape check).
- Webhook regex behaviour validated against realistic SePay content (new, old,
  surrounding noise, multi-space, lowercase, false-positive edges, space-stripped) —
  all correct and fail-safe.

## Deploy coupling (owner action)

Both artifacts are backward-compatible. The webhook must tolerate the new format
**before** the generator emits it, so:
1. Merge → Vercel deploys the tolerant webhook to prod.
2. Owner applies the migration to prod (`apply_migration`, file order).
Applying the migration first while the old webhook is live would leave new orders'
transfers unmatched (manual-confirm fallback) until the deploy lands.

## Residual risk (monitored, owner-accepted)

Content is 38 chars > NAPAS ID-08 25-char minimum spec. A payer bank that truncates
the auto-filled memo to 25 drops the suffix → that transfer falls to cashier
manual-confirm (fail-safe; never a wrong match). Watch the SePay auto-match rate
after rollout.
