# ADR 0017 — AP and central operations

**Status:** Accepted, 2026-07-27

**Scope:** Greenfield roadmap in `comtammatu` after cutoff `baf3720f8`.

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

## Delivery boundary

This ADR authorizes roadmap work in the existing `comtammatu` repository.
Implementation reuses and replaces current module seams; it does not reactivate
or mutate `matu-prod`. Greenfield work remains subject to this repository's
review, Environment Registry, and owner gates.

## Authority

- `docs/plan/decisions.md` D082-D084
- `docs/plan/adr/0016-joint-stock-company-operating-model.md`
- `docs/modules/finance.md`
- `docs/ref/inventory.md`
