# ADR 0013 — HĐĐT issuance: buyer window, discount projection, zero-total

**Status:** Accepted; Production activation gated

**Decision owner:** Owner

Runtime: [`docs/ref/einvoice-tax.md`](../../ref/einvoice-tax.md) and
[`docs/ref/screen-context-map.md`](../../ref/screen-context-map.md) §2.10.
This ADR owns the buyer window, issuance projection, and zero-total rule.

## Decision

### 1. Buyer window

Payment creates exactly one `tax_invoices` draft with the line/amount/payment
snapshot. Default buyer is `"Bán cho người tiêu dùng"`. POS has no buyer form.
Self-Order G7 may send a business `invoice_payload` when the guest checks
`Xuất hoá đơn GTGT`.

The request closes on the first terminal event: customer confirm before
deadline, or deadline first (consumer-default buyer). Deadline is `paid_at`
when Vietnam local hour is `>= 22:00`; otherwise
`min(paid_at + 2 hours, Vietnam calendar day of paid_at at 23:55)`.
Same-day `invoiceIssuedDate` is `payments.paid_at`. A draft whose Vietnam sale
day has passed fail-closes unless one-shot `allowBacklogSubmitDate` is set.
No second create; `signing`/`submitted` stay reconcile-only. Public route:
`/q/invoice/[token]`.

### 2. Discount projection

Expand `order_items` into legal lines. Apply item `discount_amount` (GROSS VND
only) cheap-first waterfill, then `orders.order_discount_amount`, then bake
`service_charge` into remaining lines (expensive-first). Omit GROSS `<= 0`
lines from the provider payload. Fail closed if projected GROSS `!==
orders.total_amount`. Send `itemDiscount = 0` and `discount = 0`. Item
discounts are VND only; order-level may be `pct` or `vnd`.

### 3. Zero-total

`orders.total_amount = 0` still completes payment. Upsert
`tax_invoices.status = not_required`; no issue job and no Viettel call.
Receipt QR stays read-only; submit is rejected.

## Verification

One payment owns one draft, one buyer request, and one issue job. Concurrent
submits produce one buyer snapshot. Zero-total: `not_required`, no job, QR
read-only.
