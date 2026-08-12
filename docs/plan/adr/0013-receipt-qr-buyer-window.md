# ADR 0013 — Receipt QR buyer window before HĐĐT issuance

**Status:** Accepted for implementation; Production activation gated

**Decision owner:** Owner, 2026-07-25

**Amended by:** ADR 0034 (zero-total orders: `not_required` invoice, no issue
job, receipt QR still prints, buyer page read-only)

## Context

POS and Self-Order must not collect HĐĐT buyer details. Payment still needs one
immutable invoice draft immediately; the customer may supply tax identity from
the receipt QR for at most two hours. Backdating `invoiceIssuedDate` to
`payments.paid_at` remains a separate legal/provider gate.

## Decision

Payment completion creates exactly one internal `tax_invoices` draft with the
full line/amount/payment-time snapshot. Default buyer is
`"Bán cho người tiêu dùng"`. POS and Self-Order have no buyer form and reject
buyer fields.

The buyer request closes on the first terminal event:

1. Customer confirms before `paid_at + 2 hours` — lock buyer request → issue job
   → invoice; replace only the buyer snapshot; set
   `status = submitted`, `closed_at`, `close_reason = customer_submitted`; make
   the issue job eligible.
2. Deadline first — same lock order; keep consumer-default buyer; set
   `status = expired`, `close_reason = deadline_elapsed`.

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
- If legal/Viettel gates fail, issue at `payments.paid_at` and use existing
  replacement/adjustment when buyer details arrive later — do not infer a
  general two-hour legal grace period.

## Verification

- One payment owns one active draft, buyer request, and issue job.
- Concurrent submits produce one buyer snapshot; post-deadline submit cannot
  replace the consumer-default buyer.
- Submit-versus-worker races close to exactly one terminal state; two workers
  cannot claim the same job.
- Unknown provider outcomes never create a second provider submission.
- Reprints keep a stable QR only while the request is open.
