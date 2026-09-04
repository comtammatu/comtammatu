# ADR 0028 — Transfer shortfall belongs to the shipping site

**Status:** Accepted

**Decision owner:** Owner

Runtime: [`docs/ref/inventory.md`](../../ref/inventory.md). This ADR owns
short-transfer attribution.

## Decision

1. Ship deducts the full shipped quantity at source. When received quantity is
   less than shipped and the receive is **not** in-transit damage, the
   difference stays at the **shipping site** as a `stock_movements` row
   (`transfer_source_variance`). It must not vanish and must not charge the
   receiving branch.

2. Only the operator path labelled `Nhận thiếu` records transit loss
   (`transfer_transit_loss`) instead of source variance. Mandatory reason;
   photo where GRN/waste evidence already applies.

3. Short receive cannot close without an explicit choice. Rejected: charging
   the receiving branch by default; unclassified short receive.

## Verification

A short receive without transit classification produces a source-side movement
equal to the difference. A `Nhận thiếu` receive produces transit-loss with a
reason and no source variance row. No transfer reaches `received` with an
unrecorded difference.
