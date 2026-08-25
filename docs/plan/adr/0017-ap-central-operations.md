# ADR 0017 — AP and central operations

**Status:** Accepted (amended by ADR 0040 for §9 and §13)

**Scope:** Production roadmap for CTCP Chén Sứ in `comtammatu`.

## Context

Finance needs a supplier-payment workflow, while central inventory and
production remain separate from branch operations. These flows must not turn
cash movements into expenses or blur the boundary between operational Finance
and statutory accounting.

## Decision

1. Finance/AP owns supplier invoices, GRN reconciliation, due dates, payment
   proposals and payment evidence.
2. Receiving goods increases inventory and supplier payables; it is not an
   operating expense or food cost at receipt time.
3. Paying a supplier reduces cash and payables without creating a second
   expense.
4. Internal transfer changes inventory custody only. Central production moves
   eligible input cost into output inventory and does not recognize food cost
   before sale or approved consumption.
5. Sale or approved consumption recognizes food cost. Approved loss, damage
   and write-down use explicit adjustment reasons.
6. Ending inventory is an operating asset and never enters operating result
   directly.
7. `Kết quả vận hành` is not `Lợi nhuận ròng`. Profit after CIT is available
   only after a complete accounting close under ADR 0016.
8. Central stock and production belong only to `central_kitchen`; branch
   runtime does not regain branch-level production.
9. Goods supplier invoices may allocate multiple confirmed GRNs/POs from one
   supplier. Matching uses allocated receipt quantities and the invoice-line
   price/discount for AP and VAT. Header subtotal, document discount, VAT,
   and total reconcile within `±1 VND`. GRN net unit price is the inventory
   book price (ADR 0040); invoice line price does not restate stock.
10. Service supplier invoices have no GRN allocation and require a manual,
    reasoned document verification before payment.
11. Accountant may create invoices, recompute matching, verify service
    evidence, and accept discrepancies. Only Owner may record supplier
    payments or allocate an existing supplier advance.
12. Any payment amount not allocated to invoices remains visible as a supplier
    advance. Later allocation is append-only and never creates another cash or
    bank movement.
13. Confirmed goods invoices do not change inventory value, company WAC,
   menu-recipe portion cost, or recorded food cost (ADR 0040). Receipt
   quantity and historical movement snapshots stay immutable.
14. Open periods receive value adjustments at the economic event date.
    Soft-closed and hard-closed periods remain unchanged; late differences post
    in the current period. This operational treatment does not create a
    statutory general ledger or period-reopen UI.

## Delivery boundary

This ADR authorizes roadmap work in the existing `comtammatu` repository.
Implementation reuses and replaces current module seams. Production work
remains subject to this repository's review, Environment Registry, and owner
gates.

## Authority

- `docs/plan/decisions.md` D093, D099 and D101
- `docs/plan/adr/0016-joint-stock-company-operating-model.md`
- `docs/modules/finance.md`
- `docs/ref/inventory.md`
