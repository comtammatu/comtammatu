# ADR 0013 — Receipt QR buyer window before HĐĐT issuance

**Status:** Accepted for implementation; Production activation gated

**Decision owner:** Owner, 2026-07-25

**Amended by:** ADR 0034 (zero-total orders: `not_required` invoice, no issue
job, receipt QR still prints, buyer page read-only). Owner, 2026-08-18: 22:00
VN skips the +2h buyer wait; a one-shot requeue may stamp
`allowBacklogSubmitDate` on already-blocked leftover drafts only. A one-shot
rebind may also stamp that flag on cloned drafts after an order-id vs
tax-invoice-id S-invoice uuid collision; it does not cancel the leftover's
Viettel original.

## Context

POS and Self-Order must not collect HĐĐT buyer details. Payment still needs one
immutable invoice draft immediately; the customer may supply tax identity from
the receipt QR for at most two hours. Same-day `invoiceIssuedDate` stays
`payments.paid_at`. A new draft whose Vietnam sale day has already passed
fail-closes with `invoice_issue_date_not_today`.

## Decision

Payment completion creates exactly one internal `tax_invoices` draft with the
full line/amount/payment-time snapshot. Default buyer is
`"Bán cho người tiêu dùng"`. POS and Self-Order have no buyer form and reject
buyer fields.

The buyer request closes on the first terminal event:

1. Customer confirms before the buyer deadline — lock buyer request → issue job
   → invoice; replace only the buyer snapshot; set
   `status = submitted`, `closed_at`, `close_reason = customer_submitted`; make
   the issue job eligible.
2. Deadline first — same lock order; keep consumer-default buyer; set
   `status = expired`, `close_reason = deadline_elapsed`.

The buyer deadline is `paid_at` when Vietnam local hour is `>= 22:00`;
otherwise `min(paid_at + 2 hours, Vietnam calendar day of paid_at at 23:55)`.
After 22:00 the QR window is already closed and the issue job is eligible at
payment time. Viettel MTT rejects `invoiceIssuedDate` on a later calendar day
(`INVOICE_ISSUE_DATE_INVALID_TT78`). Cron is every 5 minutes, so the same-day
ceiling before 22:00 leaves one cadence before midnight. Same-day issuance sends
`invoiceIssuedDate = payments.paid_at`. If that Vietnam date is already past,
the worker fail-closes unless the job payload has `allowBacklogSubmitDate`
from the one-shot leftover requeue — only then it restamps `invoiceIssuedDate`
to the submit instant. `tax_invoices.invoice_time` stays `paid_at`; no second
create; `signing`/`submitted` stay reconcile-only.

Email is mandatory for customer-confirmed invoices. Business name/address are
resolved server-side from the tax code. Once terminal, the request is immutable
and reprints omit the QR. The Server Action returns after atomic close and
schedules issuance via Next.js `after`; cron remains recovery.

The edit window closes exactly at `expires_at`. Scheduler delay never extends
the buyer window. `available_at` means eligibility, not FIFO.
Four bounded worker lanes claim with `FOR UPDATE SKIP LOCKED`.

Provider submission keeps deterministic transaction identity.
`signing`/`submitted` with unknown outcome → `reconcile_required`; never a
second `createInvoice`.

Customer confirmation and worker preparation are separate RPCs with the same
lock order; no DB lock across the Viettel HTTP call. Buyer table/RPCs are
service-role only; public route uses a 192-bit token (SHA-256 digest stored).

Live UI/workflow contract: `docs/ref/screen-context-map.md` § 2.10 and public
route `/q/invoice/[token]` (`PUBLIC-WORKFLOW`).

## Consequences

- Production activation requires written legal/tax confirmation, Viettel
  out-of-order proof, migration lineage + Preview replay, and authenticated
  smoke plus a rehearsed reconciliation path.
- If legal/Viettel gates fail, issue at `payments.paid_at` on the same Vietnam
  calendar day and use existing replacement/adjustment when buyer details
  arrive later — do not infer a two-hour legal grace period that crosses
  midnight. A leftover draft after that day stays fail-closed unless the
  one-shot requeue stamped `allowBacklogSubmitDate`.

## Verification

- One payment owns one active draft, buyer request, and issue job.
- Concurrent submits produce one buyer snapshot; post-deadline submit cannot
  replace the consumer-default buyer.
- Submit-versus-worker races close to exactly one terminal state; two workers
  cannot claim the same job.
- Unknown provider outcomes never create a second provider submission.
- Reprints keep a stable QR only while the request is open.
