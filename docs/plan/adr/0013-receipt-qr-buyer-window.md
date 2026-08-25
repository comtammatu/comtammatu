# ADR 0013 — HĐĐT issuance: buyer window, discount projection, zero-total

**Status:** Accepted for implementation; Production activation gated

**Decision owner:** Owner, 2026-07-25 (buyer window); 2026-08-12 (discount projection consolidated from ADR 0034; merged 2026-08-24 — Git keeps the original)

**Owner amendments:** 2026-08-18: 22:00 VN skips the +2h buyer wait; a
one-shot requeue may stamp `allowBacklogSubmitDate` on already-blocked
leftover drafts only, and a one-shot rebind may stamp that flag on cloned
drafts after an order-id vs tax-invoice-id S-invoice uuid collision (it does
not cancel the leftover's Viettel original). 2026-08-19: Self-Order G7 may
collect optional business VAT invoice details (MST lookup, company
name/address, email) and pass them as `p_invoice_payload`; POS stays
buyer-neutral; the receipt QR buyer window remains for later correction.

## Context

POS must not collect HĐĐT buyer details. Self-Order G7 may collect optional
business VAT invoice identity (MST lookup + email) into
`self_order_payment_requests.invoice_payload`; default remains
`"Bán cho người tiêu dùng"`. Payment still needs one immutable invoice
draft immediately; the customer may still supply or correct tax identity
from the receipt QR for at most two hours. Same-day `invoiceIssuedDate`
stays `payments.paid_at`; a new draft whose Vietnam sale day has already
passed fail-closes with `invoice_issue_date_not_today`. POS stores
VAT-inclusive menu prices and two discount layers (item + order); the prior
HĐĐT path allocated discounts proportionally onto legal lines and sent
Viettel `itemDiscount` — that complicated Sinvoice validators, allowed item
`%` discounts that drift under qty changes, and left `service_charge > 0`
with `total_amount = 0` poorly defined for issuance.

## Decision

### 1. Buyer window
Payment completion creates exactly one internal `tax_invoices` draft with
the full line/amount/payment-time snapshot. Default buyer is
`"Bán cho người tiêu dùng"`. POS has no buyer form and rejects buyer
fields; Self-Order G7 may send a business `invoice_payload` when the guest
checks `Xuất hoá đơn GTGT`.

The buyer request closes on the first terminal event: (1) customer confirms
before the buyer deadline — lock buyer request → issue job → invoice;
replace only the buyer snapshot; set `status = submitted`, `closed_at`,
`close_reason = customer_submitted`; make the issue job eligible.
(2) Deadline first — same lock order; keep consumer-default buyer; set
`status = expired`, `close_reason = deadline_elapsed`. The edit window
closes exactly at `expires_at`; scheduler delay never extends it.

The buyer deadline is `paid_at` when Vietnam local hour is `>= 22:00`;
otherwise `min(paid_at + 2 hours, Vietnam calendar day of paid_at at
23:55)`. After 22:00 the QR window is already closed and the issue job is
eligible at payment time. Viettel MTT rejects `invoiceIssuedDate` on a
later calendar day (`INVOICE_ISSUE_DATE_INVALID_TT78`). Cron is every 5
minutes, so the same-day ceiling before 22:00 leaves one cadence before
midnight. Same-day issuance sends `invoiceIssuedDate = payments.paid_at`;
if that Vietnam date is already past, the worker fail-closes unless the job
payload has `allowBacklogSubmitDate` from the one-shot leftover requeue —
only then it restamps `invoiceIssuedDate` to the submit instant.
`tax_invoices.invoice_time` stays `paid_at`; no second create;
`signing`/`submitted` stay reconcile-only.

Email is mandatory for customer-confirmed invoices; business name/address
are resolved server-side from the tax code. Once terminal, the request is
immutable and reprints omit the QR — except zero-total orders (§3), which
keep the buyer QR on a read-only page. The Server Action returns after
atomic close and schedules issuance via Next.js `after`; cron remains
recovery. `available_at` means eligibility, not FIFO; four bounded worker
lanes claim with `FOR UPDATE SKIP LOCKED`. Provider submission keeps
deterministic transaction identity: `signing`/`submitted` with unknown
outcome → `reconcile_required`; never a second `createInvoice`. Customer
confirmation and worker preparation are separate RPCs with the same lock
order; no DB lock across the Viettel HTTP call. Buyer table/RPCs are
service-role only; public route uses a 192-bit token (SHA-256 digest
stored). Live UI/workflow contract: `docs/ref/screen-context-map.md` §2.10
and public route `/q/invoice/[token]` (`PUBLIC-WORKFLOW`).

### 2. Discount projection (Má Tư → Viettel)
1. Expand `order_items` into legal lines (main, priced modifiers, sides) as
   today.
2. Apply item `discount_amount` (GROSS VND only) with **cheap-first
   waterfill** (sort by line GROSS ascending; stable tie-break). Bake into
   line `amount`; do not keep a separate discount field on the provider
   payload.
3. Apply `orders.order_discount_amount` (already whole VND; `%`
   materialized via `compute_discount_amount`) the same way across
   remaining lines.
4. If `service_charge > 0`, bake that GROSS into remaining legal lines
   (expensive-first, whole VND). Do **not** emit a `Phí dịch vụ` line;
   POS/`orders.service_charge` still records the surcharge.
5. Omit lines with GROSS after discount `<= 0` from the provider payload;
   POS/`order_items` retain full history.
6. Fail closed if `Σ` projected GROSS `!== orders.total_amount`.
7. Viettel body: each line is **already post-discount GROSS**. Reverse NET
   with existing Sinvoice order (`netUnitPrice` whole VND first,
   `lineNet = qty * netUnitPrice`). VAT is residual `GROSS - NET` when
   validator 44 holds; leftover +/- 1 VND is absorbed onto another eligible
   line so `totalAmountWithTax === orders.total_amount`. If absorb cannot
   move because every line has `qty > 1`, split 1 unit of the same real
   item onto a qty=1 sibling and retry (same name, VAT rate, conserved
   GROSS and qty). Never invent a rounding SKU and never issue with silent
   1–10 VND drift. Send `itemDiscount = 0` and `discount = 0` — no separate
   discount line and no provider discount fields.

VAT basis: discounts subtract from **VAT-inclusive** amounts, then NET/VAT
are derived; never discount NET then re-add VAT. Item-level discounts accept
**VND only** end-to-end (schema CHECK, RPC, normalize trigger, cart, UI);
order-level discounts keep `pct` | `vnd`.

### 3. Zero-total (`orders.total_amount = 0`)
Payment still completes (including `cash_received = 0`). Upsert creates
`tax_invoices.status = not_required` and **does not** create an issue job
or call Viettel. Receipt print still attaches the buyer QR (option B).
Public `/q/invoice/[token]` shows the read-only
`hóa đơn 0đ / không phát hành` state with no buyer form; submit is
rejected. Payable invoices (`total_amount > 0`) keep §1 draft + queued job
+ buyer window unchanged.

## Consequences

- Production activation requires written legal/tax confirmation, Viettel
  out-of-order proof, migration lineage + Preview replay, and authenticated
  smoke plus a rehearsed reconciliation path.
- If legal/Viettel gates fail, issue at `payments.paid_at` on the same
  Vietnam calendar day and use existing replacement/adjustment when buyer
  details arrive later — do not infer a two-hour legal grace period that
  crosses midnight. A leftover draft after that day stays fail-closed
  unless the one-shot requeue stamped `allowBacklogSubmitDate`.
- Finance UI may show `not_required` again for zero-total paid orders.
  Proportional `applyInvoiceLineDiscount` is retired for issuance. Existing
  item `%` rows must be converted to VND before CHECK tighten.

## Verification

- One payment owns one active draft, buyer request, and issue job.
  Concurrent submits produce one buyer snapshot; post-deadline submit
  cannot replace the consumer-default buyer. Submit-versus-worker races
  close to exactly one terminal state; two workers cannot claim the same
  job; unknown provider outcomes never create a second provider submission.
- Reprints keep a stable QR only while the request is open; zero-total
  receipts keep the read-only buyer QR.
- Cheap-first waterfill + omit-zero line tests; `Σ` matches `total_amount`
  including baked service charge; payload has no `Phí dịch vụ` line.
  Sinvoice payload has zero `itemDiscount` / discount rate on issue lines.
  Aggregated qty>1 residuals peel one real-item unit (Orders 691/695) and
  still match `orders.total_amount`; qty=2 lines that already hit GROSS
  are not split.
- Item discount `%` rejected at action and RPC; order `%` still works.
  Zero-total: `not_required`, no issue job, QR opens read-only page,
  submit blocked.
