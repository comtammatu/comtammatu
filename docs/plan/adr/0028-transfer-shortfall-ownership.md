# ADR 0028 — Transfer shortfall belongs to the shipping site

**Status:** Accepted (Owner 2026-08-10).

**Decision owner:** Owner

**Review tier:** T3 — stock ledger correctness, cross-site loss attribution

## Context

A transfer deducts the **full shipped quantity** at the source site, then
credits only the **received quantity** at the destination and closes the
transfer as `received`
(`supabase/migrations/20260802162900_baseline.sql`). The difference disappears:
no `stock_movements` row, no `stock_issues` record, no reason code, and no
notification. Stock that left one site and never arrived is simply absent from
the ledger, and no site carries the loss.

The shipping site — central supply or central kitchen preparing ingredients or
finished goods for delivery — is the unit responsible for preparing and
shipping the correct quantity. A receiving branch counts what arrives; it has
no control over what was packed. Attributing a generic short shipment to the
branch would charge a branch for a central preparation error.

There is one genuine exception: goods damaged, broken, or lost **in transit**.
That is not a preparation error, and the receive step is where it is
discovered.

## Decision

### 1. Default: the shipping site owns the shortfall

Ship continues to deduct the full shipped quantity at source. When received
quantity is less than shipped quantity and the receive is **not** classified as
in-transit damage, the difference stays owned by the **shipping site** as
preparation and shipping variance.

The shortfall **must write a `stock_movements` row at the source**. It may not
silently vanish, and it may not be charged to the receiving branch.

### 2. Exception: `Nhận thiếu` — in-transit damage, breakage, or loss

Only when the receive path is explicitly marked as damage, breakage, or loss
during transit — the operator-facing case labelled `Nhận thiếu` — is the
difference recorded as a **transit-loss movement** instead of source variance.
Ownership is transit and operations loss, not branch fault.

This path requires a mandatory reason, plus photo evidence where the existing
GRN and waste evidence patterns already apply.

### 3. Classification happens at receive, and it is explicit

Short receive cannot close without the operator choosing between the default
(source variance) and `Nhận thiếu`-classified transit loss. There is no
unclassified short receive, because an unclassified difference is exactly the
silent gap this ADR closes.

Rejected: charging the receiving branch by default; closing a short transfer
with no ledger row; free-text-only classification.

## Consequences

- Every transfer now balances: shipped equals received plus a named,
  attributable difference.
- Central sites become visible owners of preparation accuracy, which is the
  behavior the owner wants measured.
- Receive gains one required choice on a phone-first branch flow, so the option
  set must stay short enough to pick one-handed.
- The reason vocabulary needed here is shared with stocktake variance and waste
  (**INV-12, open**): stocktake variance still captures only free text, so it
  cannot be aggregated or trended. A constrained `reason_code` set spanning
  transfer shortfall, stocktake variance, and waste remains unresolved.
- Whether receive becomes two steps (count, then accept) or stays one step with
  a discrepancy field (**INV-11, open**) is an implementation shape this ADR
  does not fix.

## Follow-up implementation pointers

Implementation is open work in `tasks/todo.md`.

- Write the shortfall movement at the source site on non-`Nhận thiếu` short
  receive, instead of closing the transfer with the difference unrecorded
  (`supabase/migrations/20260802162900_baseline.sql`, transfer ship/receive
  RPCs).
- Add the explicit classification step and its mandatory reason to the branch
  receive surface.
- Keep `Nhận thiếu` as the operator label only; the stored code stays an
  English identifier per `docs/agent/rules/language.md`, registered in
  `docs/ref/glossary.md`.

## Verification

- A short receive without transit classification produces a source-side
  `stock_movements` row equal to the difference.
- A `Nhận thiếu` receive produces a transit-loss movement with a reason, and no
  source variance row.
- No transfer can reach `received` with an unrecorded difference.

## Canonical

- `docs/ref/inventory.md`, `docs/ref/inventory-sop.md`, `docs/ref/glossary.md`,
  D091, D093
