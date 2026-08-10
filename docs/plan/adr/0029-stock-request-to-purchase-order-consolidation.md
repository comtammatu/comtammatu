# ADR 0029 — Consolidate demand into supplier purchase orders

**Status:** Accepted direction (Owner 2026-08-10) — schema design proposed in
ADR 0032; Owner must Accept ADR 0032 before INV-9 build starts.

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

### 2. Schema is decided in ADR 0032 before build

ADR 0032 proposes the aggregation entity (PO + source junction), short-delivery
allocation (requester-order fill), and GRN receiving shape. Until the Owner
Accepts ADR 0032, requests continue one at a time; no partial consolidation.

### 3. Suggested quantity ships independently (INV-10)

The request editor prefills an editable quantity from
`max(0, min_stock_level - current_quantity)` (`docs/ref/inventory.md` §9).
`max_stock_level` / `reorder_point` remain retired UI columns.

## Consequences

- Procurement moves from one-request-to-one-order toward many-to-one, which
  touches request, purchase order, and receiving together.
- D099 already fixes supplier selection and pricing authority; this ADR sits
  upstream of it, at demand formation, and does not change who picks the
  supplier or who owns price.
- Until ADR 0032 is Accepted, requests continue to flow one at a time; no
  partial consolidation should be shipped.

## Canonical

- ADR 0032, `docs/ref/inventory.md` §11, D093, D099, ADR 0017, ADR 0030
