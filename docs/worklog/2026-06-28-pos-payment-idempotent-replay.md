# POS payment idempotent-replay invoice fix (T3)

> Reconciled-through 49112fa17fec

Date: 2026-06-28
Branch: `fix/pos-payment-recovery`
Tier: T3 (money / HĐĐT). Four-perspective debate run before coding.

## Problem

On a flaky-Wi-Fi re-tap of "Đã thanh toán", the cash/VietQR RPC returns an
idempotent replay (no double charge). Both POS orchestrators then called
`createTaxInvoice` unconditionally; on an already-invoiced order that returns
`{success:false, error:"Đơn hàng đã có hóa đơn."}`, which the orchestrator
mapped to `invoice.status="failed"` and showed the cashier a false
"HĐĐT chưa xuất được" warning even though everything was fine.

## Chosen approach (debate verdict: GO_WITH_CONDITIONS)

POS-scoped *resolve-then-decide*, NOT making shared `createTaxInvoice`
idempotent (it has finance callers — manual create + `reissueAllDraftInvoices`
— that depend on the duplicate-invoice failure). On a detected replay, resolve
the existing invoice and short-circuit **only** when it is genuinely issued.

Decisive correction from the Senior Dev lens: VietQR's returned data has **no
`status` field** (`{payment_id, idempotent, print}`), so VietQR must key off
`idempotent === true`; cash keys off `status === "already_completed"`.
Implementing the literal "status === already_completed" for VietQR would have
been dead code and left the VietQR bug unfixed.

## Business rules (implemented)

- replay + existing **issued** invoice (issued|submitted|signing) → success via
  `mapTaxInvoiceOutcome` (the headline fix). — `payment-actions.ts` both orchestrators.
- replay + **draft-without-number** (provider-rejected orphan) → fall through to
  `createTaxInvoice`, which retries via `retryDraftInvoiceId`.
- replay + **no invoice row** (response lost after pay, before issuance) → fall
  through to `createTaxInvoice` to ISSUE the legally-required HĐĐT (NĐ70/2025).
- first tap (cash `completed`, VietQR `idempotent=false`) → unchanged.
- decision is made on the resolved row's status, never by matching the
  "Đơn hàng đã có hóa đơn." copy.
- shared `createTaxInvoice` semantics unchanged for finance callers.

## Files

- `apps/web/app/(protected)/finance/actions.ts` — new `resolveExistingInvoiceForOrder`
  (read-only, tenant-scoped, byte-identical existing-invoice filter, same auth as `createTaxInvoice`).
- `apps/web/app/_actions/finance.ts` — re-export wrapper (server boundary).
- `apps/web/app/(protected)/br/[branchId]/pos/payment-actions.ts` — `status?` on
  `CashPaymentResult`; import; replay branch in both `*WithInvoice` orchestrators.
- `apps/web/tests/pos-payment-idempotent-replay.test.ts` — static-contract + guard tests.

## Out of scope

- Shared `createTaxInvoice` return semantics; any migration/RPC change; the
  `stock_failed` / `amount_mismatch_recomputed` handling (stock_failed is live —
  RPC returns it at migration `20260625221432_...:712-714`; the earlier
  "dead branch" finding was wrong); any client/UI change.

## Verification

`pnpm typecheck && pnpm lint && pnpm build` pass; `pnpm --filter @comtammatu/web test`
251/251 (incl. 6 new). Manual preview QA still needed for the live success-toast
path (no DB-level test harness in apps/web).

## T3 attestation

- Test plan: static-contract + guard tests landed (wiring + finance-branch drift
  guard); pure-function/manual items noted; DB-level e2e deferred (no harness) — manual QA on preview.
- BA rules → files: all four replay cases implemented in `payment-actions.ts`
  both orchestrators + `resolveExistingInvoiceForOrder` in `finance/actions.ts`.
- Out-of-scope gaps: shared `createTaxInvoice` unchanged; no migration; concurrent
  true-double-tap may transiently show the old warning (degrades to existing
  failure-isolation, never a wrong money/compliance outcome).
