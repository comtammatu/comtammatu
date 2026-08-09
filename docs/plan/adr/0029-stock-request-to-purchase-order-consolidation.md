# ADR 0029 — Consolidate demand into supplier purchase orders

**Status:** Accepted direction (Owner 2026-08-10) — schema design still open
before build. A design ADR fixing the aggregation entity and allocation rule
must land before implementation starts.

**Decision owner:** Owner

**Review tier:** T2 — procurement flow, demand aggregation, allocation

## Context

Today each stock or purchase request is treated in isolation. Two branches
asking for the same ingredient on the same day produce two independent paths to
a supplier instead of one purchase order. The result is more, smaller orders and
weaker supplier pricing on exactly the ingredients bought most often.

Consolidation is not a UI change. Aggregating demand across requests means one
purchase-order line can satisfy several requests, so receiving must allocate
the arriving quantity back to the contributing requests — including when the
delivery is short.

## Decision

### 1. Direction accepted

Demand from multiple requests for the same ingredient and supplier consolidates
into a single purchase order. This is the intended shape of procurement.

### 2. Schema is not yet decided, and build does not start without it

The following must be fixed in a design ADR before implementation:

- The **aggregation entity**: what row represents consolidated demand, and how
  it relates to `purchase_request` and the resulting purchase order.
- The **allocation model**: how a received quantity maps back to contributing
  requests, and how a **short delivery** is split — pro-rata, request priority,
  or requester order.
- The **receiving shape**: how one GRN line satisfying several requests is
  recorded so each requester sees their own outcome.

Building consolidation without an allocation rule would recreate, at the
purchase-order level, the same unattributed-difference gap that ADR 0028 just
closed for transfers.

### 3. Suggested quantity is independent and may ship first

The request editor does not prefill a suggested quantity even though
`min_stock_level`, `max_stock_level`, and `reorder_point` exist, so every
request is typed from memory (**INV-10**). This is independent of consolidation
and may ship on its own. The suggestion source must be named before it is
built, and the suggestion must remain editable.

## Consequences

- Procurement moves from one-request-to-one-order toward many-to-one, which
  touches request, purchase order, and receiving together.
- D099 already fixes supplier selection and pricing authority; this ADR sits
  upstream of it, at demand formation, and does not change who picks the
  supplier or who owns price.
- Until the design ADR lands, requests continue to flow one at a time; no
  partial consolidation should be shipped.

## Canonical

- `docs/ref/inventory.md` §11, D093, D099, ADR 0017, ADR 0030
