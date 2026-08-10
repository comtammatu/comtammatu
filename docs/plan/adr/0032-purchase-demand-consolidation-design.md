# ADR 0032 — Purchase demand consolidation entity and allocation

**Status:** Proposed design (blocks INV-9 build). Owner must Accept before
implementation.

**Decision owner:** Owner

**Review tier:** T2 — procurement aggregation, GRN allocation

## Context

ADR 0029 accepted the direction: multiple requests for the same ingredient and
supplier consolidate into one purchase order. Build was blocked until this
design ADR names the aggregation entity, short-delivery allocation rule, and
receiving shape.

## Decision (proposed)

### 1. Aggregation entity: keep `purchase_orders` as the consolidation row

Do not invent a third demand document. Consolidation is:

- Select open purchase-request (or stock-request→purchase) lines that share
  `supplier_id` + `ingredient_id` and are eligible for the same buy window.
- Create **one** `purchase_orders` header per supplier for that window.
- Create **one** `purchase_order_items` line per ingredient with
  `ordered_quantity = sum(contributing request line remaining quantities)`.
- Persist attribution in a junction table
  `purchase_order_item_sources` (name final at implement time):

  | Column | Meaning |
  | --- | --- |
  | `purchase_order_item_id` | Consolidated PO line |
  | `source_kind` | `purchase_request_item` (v1); stock-request path only after it already became purchase demand |
  | `source_item_id` | Contributing request line |
  | `allocated_quantity` | Quantity this source contributed to the PO line |

One PO line can therefore satisfy many request lines without rewriting request
headers.

### 2. Short delivery allocation: requester order, then pro-rata remainder

When GRN received quantity for a PO line is short of ordered:

1. Sort contributing sources by request `needed_by` ascending, then
   `source_item_id` ascending (stable, operator-predictable).
2. Fill each source up to its `allocated_quantity` in that order until the
   received quantity is exhausted.
3. If a later design needs fairness across equal `needed_by`, switch only the
   tie-break to pro-rata — do not ship without a named rule.

Each shorted source records its own shortfall outcome on the request line
(remaining open or closed short), so branches see their own result.

### 3. Receiving shape: one GRN line still maps through the PO line

- GRN remains central-only (D093). One GRN line posts against one PO line.
- Allocation back to sources runs inside the GRN confirm RPC using the junction
  table above — not as a separate operator worksheet.
- Operators do not pick per-branch splits at receive time in v1.

### 4. Out of scope for v1

- Cross-supplier consolidation.
- Auto-merge of already-sent POs.
- Changing who picks supplier or price (D099 / ADR 0017 remain).
- INV-10 suggested quantity (independent; may ship first).

## Consequences

- Implementation touches PO create-from-requests, junction persistence, and GRN
  confirm allocation together — no partial consolidation UI without the RPC.
- Transfer shortfall ownership (ADR 0028) is the pattern to mirror: no
  unattributed difference at the consolidated PO line.

## Open for Owner Accept

- Confirm junction naming and whether stock-request lines may appear as sources
  before becoming purchase demand.
- Confirm short-delivery rule (requester-order fill) vs strict pro-rata from day
  one.

## Canonical

- ADR 0029, ADR 0017, ADR 0030, D093, D099, `docs/ref/inventory.md`
