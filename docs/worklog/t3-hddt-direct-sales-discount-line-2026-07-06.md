# T3 — HĐĐT direct-sales discount line (2026-07-06)

> Reconciled-through `f3f32966b`

REVIEW_TIER: T3 (money / HĐĐT provider payload).

Skill plan: repo rules = engineering + skills + database + workflow + HĐĐT docs; external = Supabase read-only evidence + Viettel API docs; runtime tools = CodeGraph, production SELECT/storage read, provider unit tests; skipped = no production write, no sandbox issue in this slice.

## Trigger

Production invoice `C26MAA4826` / CQT `M2-26-5RDBW-00000004826` archived XML showed fractional VND line totals because Viettel recalculated line discount from `discount` rate `22.93%`, despite the app also sending exact `itemDiscount` amounts.

## Four Perspectives

PM: done means new mẫu `2/...` HĐĐT payloads no longer send percentage discounts that can render fractional VND; issued invoices are not backfilled.

BA: direct-sales order discounts remain exact VND totals. Sold item lines stay gross/menu-price lines; the discount is represented as a separate `selection=3` goods discount line. Template `1/...` VAT behavior is out of scope and unchanged.

Senior Dev: fix the shared provider choke point `buildSinvoiceItemInfo` so POS, Finance reissue, and batch paths share the same direct-sales rule. Do not add schema, env flags, or route-specific branches.

QA: lock with provider tests, including a replay of `C26MAA4826` subtotal `785000`, discount `180000`, total `605000`; run targeted provider tests plus repo gates.

## Contract

1. For `direct_sales_gross`, normal item rows use `selection=1`, `discount=0`, `itemDiscount=0`, and gross menu prices.
2. If direct-sales discount total is positive, append one `selection=3` line named `Chiết khấu hàng hóa`, `isIncreaseItem=false`, amount equal to the total discount.
3. `summarizeInfo` keeps `sumOfTotalLineAmountWithoutTax` as gross goods total, `discountAmount` as discount total, and `totalAmountWithTax` as gross minus discount.
4. `vat_deductible_net` behavior remains unchanged.
5. No historical data update.
