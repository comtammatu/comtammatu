# ADR 0013 — Receipt QR buyer window before HĐĐT issuance

**Status:** Accepted for implementation; Production activation gated

**Decision owner:** Owner, 2026-07-25

## Context

POS and Self-Order must not collect HĐĐT buyer details. A completed payment
still needs one immutable invoice draft immediately, while the customer may
provide a tax code, business name, address, and delivery email from the receipt
QR for at most two hours.

The internal draft is not proof that Viettel or the tax authority has accepted
the legal invoice. Backdating `invoiceIssuedDate` to `payments.paid_at` when the
provider call happens later remains a separate legal and provider release gate.

## Decision

Payment completion creates exactly one internal `tax_invoices` draft with the
full line, amount, and payment-time snapshot. Its default buyer is
`"Bán cho người tiêu dùng"`. The receipt may contain a buyer-information QR;
POS and Self-Order have no buyer form, and their payment contracts reject buyer
fields rather than silently accepting data from an old client.

The buyer request closes on the first terminal event:

1. The customer confirms before `paid_at + 2 hours`. The database locks the
   buyer request, issue job, and invoice in that order; replaces only the buyer
   snapshot; records `status = submitted`, `closed_at`, and
   `close_reason = customer_submitted`; then makes the issue job eligible.
2. The deadline is reached first. The worker uses the same lock order; preserves
   the consumer-default buyer; and records `status = expired`, `closed_at`, and
   `close_reason = deadline_elapsed`.

Email is mandatory for customer-confirmed invoices. Business name and address
are resolved again on the server from the tax code; browser-supplied identity
fields are not trusted.

Once terminal, the request cannot be edited and receipt reprints omit the QR.
The Server Action returns after the atomic close and schedules targeted issuance
with Next.js `after`; the existing cron remains the recovery path.

The edit window closes exactly at `expires_at`. Automatic provider dispatch
starts on the first eligible cron run, currently scheduled every five minutes;
that scheduler delay never extends or reopens the buyer window.

`available_at` means eligibility, not FIFO dependency. Four bounded worker lanes
claim one eligible row at a time with `FOR UPDATE SKIP LOCKED`. A slow invoice
does not pre-claim or prevent other eligible invoices from being processed.

Provider submission keeps the existing deterministic transaction identity.
`signing` or `submitted` with an unknown provider outcome is looked up by
`transactionUuid` (`searchInvoiceByTransactionUuid`). An `invoiceNo` is
reconciled through `reconcile_tax_invoice_provider_issued`. `not_found` or
`unknown` moves the job to `reconcile_required`. That path must not trigger
another `createInvoice` call.

## Transaction boundaries

Customer confirmation is one RPC transaction:

1. lock buyer request;
2. lock issue job;
3. lock invoice draft;
4. verify the request is open and before deadline;
5. update the buyer snapshot and terminal request audit;
6. set the job `available_at = now()`.

Worker preparation is a separate RPC transaction with the same lock order. It
commits the terminal request state and reserves the invoice as `signing` before
the external Viettel HTTP call. No database lock is held across that call.

The buyer table and its RPCs are service-role only. The public route receives a
192-bit token; only its SHA-256 digest is stored. The open-page header displays
the immutable order total returned by that token-scoped RPC; it never derives
or recomputes invoice money in the browser.

## Delivery sequence

1. Persist terminal request state and remove QR data from terminal reprints.
2. Return customer confirmation immediately and process claimed jobs with
   bounded parallel lanes.
3. Prove mandatory email, server-owned tax lookup, deadline behavior,
   submit-versus-expiry races, privilege boundaries, stable reprints, and
   single provider issuance.
4. Verify Cash, VietQR, and Self-Order end to end on an authenticated Preview.
5. Activate Production only after the legal, Viettel, migration-lineage, and
   operational reconciliation gates below all pass.

## UI Advisor Gate

- Surface: `/q/invoice/[token]`; route family: public receipt HĐĐT; plane:
  public; change: workflow and behavior.
- Context: `docs/ref/screen-context-map.md` § 2.10; actor: paid customer; job:
  add verified business details and the mandatory delivery email before the
  two-hour deadline.
- Journey: scan receipt QR → enter MST and trigger automatic lookup on blur → verify read-only business
  name/address → enter email → confirm once → terminal success. Recovery is a
  bounded lookup retry before the deadline; submitted, expired, and closed
  requests are read-only.
- Information order: order and total context, deadline, MST lookup, verified business
  identity, email, primary confirmation. Exclude payment actions, POS or
  Self-Order state, provider internals, and post-close editing.
- Pattern: `PUBLIC-WORKFLOW`; exemplar: `apps/web/app/q/[token]/page.tsx`;
  data display: one mobile-first transaction form.
- States: open, lookup loading/found/not-found/unavailable, validation error,
  submit pending, success, expired, closed, and invalid token.
- Components: `AppPage`, `Item`, `AppSection`, shared `Field`, `Input`,
  `Textarea`, `Button`, `Alert`, and `Spinner`; no new adapter.
- Responsive/accessibility: same information architecture on phone and
  desktop; touch and keyboard input; labelled fields, live lookup status,
  visible focus, and one primary action.
- Verification: public browser runtime at phone and desktop viewports against
  the disposable Preview schema, including open, lookup failure, success, and
  terminal states.

## Production gates

Production activation requires all of:

- written confirmation from accounting or the tax authority for the selected
  legal invoice time;
- proof on the exact Viettel account that out-of-order submission accepts that
  timestamp;
- migration lineage reconciliation and disposable Preview replay;
- authenticated workflow smoke and a rehearsed provider reconciliation path.

If the legal or Viettel gate fails, issue at `payments.paid_at` and use the
existing replacement or adjustment procedure when the customer later provides
buyer details. The product must not infer a general two-hour legal grace period.

## Verification

- One payment owns one active draft, buyer request, and issue job.
- Concurrent submit attempts produce one buyer snapshot.
- Submit at or after the deadline cannot replace the consumer-default buyer.
- A submit-versus-worker race closes to exactly one terminal state.
- Two workers cannot claim the same job.
- One slow provider call does not block all other claimed jobs.
- Unknown provider outcomes never create a second provider submission.
- Reprints keep a stable QR only while the request is open.
- Repository gates, SQL/RPC checks, provider tests, print tests, and
  authenticated Preview proof pass before release.
