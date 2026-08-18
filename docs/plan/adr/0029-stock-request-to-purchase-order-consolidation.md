# ADR 0029 — Consolidate demand into supplier purchase orders

**Status:** Withdrawn (Owner 2026-08-18). Multi-request consolidation (INV-9)
is not being built. ADR 0032 was deleted without implementation. Suggested
quantity (INV-10) remains independent of this ADR.

**Decision owner:** Owner

**Review tier:** T2 — procurement flow

## Context

On 2026-08-10 the Owner accepted a direction: several request vouchers for the
same ingredient and supplier would consolidate into one purchase-order line,
with receiving allocating arrived quantity back to those sources. Schema was
deferred to a follow-up ADR. No consolidation code shipped.

On 2026-08-18 the Owner dropped INV-9. Target buying is PO-authored at the
warehouse (no `Yêu cầu mua` voucher), so there is no request-junction to
allocate.

## Decision

### 1. Multi-request consolidation is withdrawn

Do not add a request-to-PO-line allocation engine. One PO may still carry many
ingredient lines for one supplier; that is ordinary PO authorship.

### 2. Suggested quantity (INV-10) remains

Line pickers may prefill an editable quantity from
`max(0, min_stock_level - current_quantity)` (`docs/ref/inventory.md` §9).
`max_stock_level` / `reorder_point` remain retired UI columns.

## Canonical

- INV-10: `apps/web/lib/inventory/suggested-order-qty.ts`
- Current Production buy path: `docs/ref/inventory.md`
