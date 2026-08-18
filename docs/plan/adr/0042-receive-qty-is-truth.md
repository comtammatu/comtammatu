# ADR 0042 — Kept receipt quantity is the PO truth

**Status:** Accepted

**Decision owner:** Owner, 2026-08-18 (implement plan Accept)

**Review tier:** T3 — stock ledger correctness, PO status, AP quantity cap

**Amends:** ADR 0041 (PO remains qty-only and unpriced; this ADR
changes how GRN kept quantity relates to the PO line).

**Keeps:** ADR 0041 GRN book price and AP-only invoices; ADR 0028
transfer shortfall ownership; finished goods never purchased; no
branch PO/GRN.

## Context

`confirm_goods_receipt_note` already stocks every accepted quantity,
including over-receipt. It capped `po_applied_quantity` at the
unordered remainder, so extra stock could not be billed (`save_supplier_invoice_draft`
caps billed qty at `po_applied_quantity`). Shortage opened the next
Auto-GRN draft with no warehouse-facing close on some roles.

The PO carries no commercial price (ADR 0041). Raising the PO line
quantity does not raise a PO money total.

## Decision

1. **Kept quantity is the PO truth.** On GRN confirm, if accepted base
   qty exceeds remaining base qty, raise `purchase_order_items.quantity`
   (PO entry unit) so `po_applied_quantity` equals the kept amount.
   Invoice allocation can then bill the full receipt. There is no
   orphan over-receipt.
2. **Shortage must continue or close.** Auto-GRN still opens the next
   draft. `close_purchase_order` (status `closed`, not `cancelled`)
   cancels that draft and records `status_reason`. Warehouse with
   `procurement:grn_confirm` or accountant/Owner with
   `procurement:po_approve` may close.
3. **Gift is not a zero-price PO line.** Accepted GRN lines still
   require `unit_cost > 0`. A later invoice at 0 is AP discrepancy.
4. **Internal receive does not create quantity.** Transfers still
   reject receive qty above shipped. POS does not type recipe grams.

## Consequences

- PO line quantity may increase at confirm; audit remains GRN lines
  and `stock_movements`.
- UI drops “orphan over-receipt” wording. Excess copy is keep-and-raise
  PO qty. Shortage copy is receive-again or close remainder.
- Rollback is revert the function migration; historical confirms that
  already raised PO qty stay as written.

## Verification

- Over-receipt: PO line quantity equals previously applied plus kept
  qty; `po_applied_quantity` equals kept qty; PO can reach `received`.
- Shortage plus `close_purchase_order`: draft GRNs cancelled; PO
  `closed`.
- `unit_cost = 0` on accepted qty still raises `grn_unit_price_required`.
