# ADR 0034 — HĐĐT discount projection (post-discount gross, no itemDiscount)

**Status:** Accepted for implementation; Production activation gated

**Decision owner:** Owner, 2026-08-12

**Amends:** ADR 0013 (zero-total receipt QR remains; buyer page read-only)

## Context

POS stores VAT-inclusive menu prices and two discount layers (item + order).
The prior HĐĐT path allocated discounts proportionally onto legal lines and
sent Viettel `itemDiscount`. That complicated Sinvoice validators, allowed
item `%` discounts that drift under qty changes, and left
`service_charge > 0` and `total_amount = 0` poorly defined for issuance.

## Decision

### Projection (Má Tư → Viettel)

1. Expand `order_items` into legal lines (main, priced modifiers, sides) as today.
2. Apply item `discount_amount` (GROSS VND only) with **cheap-first waterfill**
   (sort by line GROSS ascending; stable tie-break). Bake into line `amount`;
   do not keep a separate discount field on the provider payload.
3. Apply `orders.order_discount_amount` (already whole VND; `%` materialized via
   `compute_discount_amount`) the same way across remaining lines.
4. If `service_charge > 0`, append one line `Phí dịch vụ` (GROSS =
   `service_charge`; VAT rate = modal non-cancelled item `vat_rate`, else `8`).
5. Omit lines with GROSS after discount `<= 0` from the provider payload.
   POS/`order_items` retain full history.
6. Fail closed if `Σ` projected GROSS `!== orders.total_amount`.
7. Viettel body: each line is **already post-discount GROSS**. Reverse NET with
   existing Sinvoice order (`netUnitPrice` whole VND first,
   `lineNet = qty * netUnitPrice`). VAT is residual `GROSS - NET` when
   validator 44 holds; leftover +/- 1 VND is absorbed onto another eligible
   line so `totalAmountWithTax === orders.total_amount`. Send
   `itemDiscount = 0` and
   `discount = 0` — no separate discount line and no provider discount fields.

VAT basis: discounts subtract from **VAT-inclusive** amounts, then NET/VAT are
derived. Never discount NET then re-add VAT.

### Item discount surface

Item-level discounts accept **VND only** end-to-end (schema CHECK, RPC,
normalize trigger, cart, UI). Order-level discounts keep `pct` | `vnd`.

### Zero-total (`orders.total_amount = 0`)

Payment still completes (including `cash_received = 0`). Upsert creates
`tax_invoices.status = not_required` and **does not** create an issue job or
call Viettel. Receipt print still attaches the buyer QR (option B). Public
`/q/invoice/[token]` shows a read-only “hóa đơn 0đ / không phát hành” state
with no buyer form; submit is rejected.

Payable invoices (`total_amount > 0`) keep ADR 0013 draft + queued job +
buyer window unchanged.

## Consequences

- Finance UI may show `not_required` again for zero-total paid orders.
- Proportional `applyInvoiceLineDiscount` is retired for issuance.
- Existing item `%` rows must be converted to VND before CHECK tighten.
- Production activation follows the same legal/Viettel gates as ADR 0013.

## Verification

- Cheap-first waterfill + omit-zero line tests; `Σ` matches `total_amount`
  including service charge.
- Sinvoice payload has zero `itemDiscount` / discount rate on issue lines.
- Item discount `%` rejected at action and RPC; order `%` still works.
- Zero-total: `not_required`, no issue job, QR opens read-only page, submit
  blocked.
- Payable path: ADR 0013 contracts still hold.
