# ADR 0017 — AP and central operations

**Status:** Accepted (amended by ADR 0040 for goods-invoice vs stock value)

**Scope:** Production AP and operational-result boundary in `comtammatu`.

Runtime stock/PO/GRN: [`docs/ref/inventory.md`](../../ref/inventory.md).
Runtime AP payment/VAT: [`docs/modules/finance.md`](../../modules/finance.md).
This ADR owns the payables vs inventory-value split; do not implement WAC
from here (ADR 0040).

## Decision

1. Finance/AP owns supplier invoices, GRN quantity matching, due dates,
   payment evidence, and advances. Receiving goods increases inventory and
   payables; it is not an operating expense or food cost at receipt time.
2. Paying a supplier reduces cash and payables without creating a second
   expense. Any amount not allocated to invoices remains a supplier advance;
   later allocation is append-only and never creates another cash or bank
   movement. Only Owner may record supplier payments or allocate an existing
   advance. Accountant may create invoices, recompute matching, verify
   service evidence, and accept discrepancies.
3. Goods invoices may allocate multiple confirmed GRNs/POs from one supplier.
   Header subtotal, document discount, VAT, and total reconcile within
   `±1 VND`. GRN net unit price is the inventory book price (ADR 0040);
   invoice line price does not restate stock, company WAC, menu-recipe
   portion cost, or recorded food cost.
4. Service invoices have no GRN allocation and require reasoned document
   verification before payment.
5. Internal transfer changes inventory custody only. Central production moves
   eligible input cost into output inventory and does not recognize food cost
   before sale or approved consumption. Ending inventory is an operating
   asset and never enters operating result directly.
6. `Kết quả vận hành` is not `Lợi nhuận ròng`. Profit after CIT is available
   only after a complete accounting close under ADR 0016.
7. Central stock and production belong only to `central_kitchen`; branch
   runtime does not regain branch-level production.
8. Open periods receive value adjustments at the economic event date.
   Soft-closed and hard-closed periods remain unchanged; late differences
   post in the current period. This operational treatment does not create a
   statutory general ledger or period-reopen UI.

## Authority

- `docs/plan/decisions.md` D093, D099 and D101
- `docs/plan/adr/0016-joint-stock-company-operating-model.md`
- `docs/modules/finance.md`
- `docs/ref/inventory.md`
