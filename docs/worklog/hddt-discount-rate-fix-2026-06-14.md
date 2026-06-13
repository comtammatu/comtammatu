# HĐĐT discount payload fix (Viettel DISCOUNT_INVALID) - 2026-06-14

Scope: `packages/shared/src/providers/impl/viettel-sinvoice.ts`. Fixes discounted
orders failing e-invoice issuance. T3 (money / tax / compliance).

## Symptom (prod evidence, 2026-06-14)

39 completed+paid June orders had no issued HĐĐT — all stuck at `tax_invoices.status
= 'draft'` because Viettel rejected `createInvoice`. By stored `provider_data`:

| Viettel error | Drafts | ₫ |
| --- | ---: | ---: |
| `DISCOUNT_INVALID` ("Chiết khấu không hợp lệ") | 30 | 4,824,000 |
| timeout | 5 | 381,000 |
| `GENERAL` | 3 | 204,000 |
| Viettel server in shutdown (Spring bean) | 1 | 35,000 |

Started ~2026-06-08 (the week branch-3 promotions began), concentrated on branch 3,
recurring daily. Pre-promotion weeks were 100% issued — only discounted orders fail.

## Root cause

Viettel Vinvoice `itemInfo.discount` is the discount **rate (% of the line,
0–100)**; `itemInfo.itemDiscount` is the **amount**. `buildSinvoiceItemInfo` set
**both** to the discount amount (`lineDiscount`). With no discount, `discount = 0`
(valid) — so non-discounted orders always issued. With a discount, `discount`
became the amount (e.g. 5000), which Viettel reads as `5000%` → DISCOUNT_INVALID.
This is why only discounted/promo orders failed.

The amount itself (`itemDiscount`, `itemTotalAmountAfterDiscount`, summary
`discountAmount`) was always correct; only the rate field was wrong.

## Fix

`discount` now = `lineDiscount / itemTotalAmountWithoutTax * 100` (the rate, always
in [0,100]); `itemDiscount` keeps the amount. Applied to both pricing modes
(`direct_sales_gross` MTT and `vat_deductible_net` GTGT). The unrounded ratio makes
`base × discount/100 == lineDiscount` exactly, so a Viettel that derives
after-discount from the rate OR from the amount both reconcile.

Tests (`viettel-sinvoice.test.ts`): the three assertions that encoded the bug
(`discount === 10_000`) corrected to the rate (`10`); added a `discount ∈ [0,100]`
guard in `assertValidators`, plus regression tests for a fixed-amount discount and
a 100% free item (the "miễn phí 1 phần nước" promo → rate 100). 28/28 pass.

## Verification

- `pnpm --filter @comtammatu/shared exec tsx --test viettel-sinvoice.test.ts` — 28/28.
- `pnpm typecheck` — pass.
- NOT yet verified against the live Viettel API. Authoritative confirmation =
  deploy, then re-issue one stuck `draft` and confirm acceptance. Optionally
  pre-check against the strict sandbox account (creds in the file header) before
  deploy.

## Follow-ups (owner-gated — tracked separately)

1. **Retry for `draft`**: a rejected `createInvoice` leaves `tax_invoices.status =
   'draft'` (there is no `failed` status) with the error in `provider_data`. The
   reconcile path does not re-attempt `draft`, so transient failures (timeout /
   Viettel restart — 9 here) also sit forever. Make reconcile cover `draft`.
2. **Re-issue the backlog**: after deploy, re-push the 30 DISCOUNT_INVALID + 9
   transient drafts (~5.4M ₫) so the sales get legal invoices.

## Related

D021 (inline per-item discount, shipped 2026-06-13) makes discounts far more
common, so this fix is a prerequisite for that feature not to multiply HĐĐT
failures.
