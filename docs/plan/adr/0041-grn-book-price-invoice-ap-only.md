# ADR 0041 — GRN book price; supplier invoice is AP and VAT only

**Status:** Accepted

**Decision owner:** Owner, 2026-08-18 (chat lock: option 3 + GRN unit price)

**Review tier:** T3 — money path, valuation, migration

**Amends:** ADR 0017 §9 and §13; ADR 0040 §2 (GRN unpriced / invoice
reprice); D099; D101.

**Amended by:** ADR 0042 (kept GRN quantity amends the PO line; the PO
stays unpriced).

**Keeps:** ADR 0017 remaining AP rules; ADR 0040 company WAC and
production WAC; finished goods never purchased (PO / GRN / NCC).

## Context

Putting raw-material and finished-good unit prices on the supplier
invoice restated remaining stock, production WAC, menu-recipe portion
cost, and recorded food cost. Warehouse practice books value on the
goods receipt (`phiếu nhập`). The tax invoice is payables and VAT and
often arrives later, with tax.

`purchase_order_items.unit_price_est` was a leftover estimated PO
price, not inventory “giá tạm”, and not POS “Tạm tính”.

## Decision

1. **GRN is the inventory valuation event for purchased ingredients.**
   Operators enter net unit price (no VAT) on the GRN line
   (`grn_items.unit_cost`, UI `Đơn giá`). Confirm requires
   `unit_cost > 0` for every accepted quantity. That price updates
   company WAC. Finished goods stay off GRN.
2. **The quote is bound to an ingredient unit.** `unit_cost` is VND per
   `grn_items.unit_cost_unit_id`, not silently per persist/entry qty
   unit. Book value is
   `accepted_qty × persist_to_base × unit_cost / price_to_base`.
   Pack+loose qty may persist in the loose unit while `Đơn giá` stays
   on the pack/PO unit. Changing persist qty unit does not rewrite the
   typed quote.
3. **Supplier invoice is AP + VAT only.** Confirm matches quantity and
   records payables / input VAT. It does **not** post `invoice_reprice`
   or change WAC, `Định mức/phần`, or food cost.
4. **PO carries no commercial price.** Drop `unit_price_est` and
   `line_total` on `purchase_order_items`. Do not reopen warehouse
   money entry on the PO.
5. Invoice vs GRN value difference is matching / AP review, not a
   stock restatement.

## Consequences

- Warehouse (GRN create/confirm) types book unit price; Owner /
  Accountant still own the tax invoice.
- Already-confirmed `cost_pending` receipts keep last provisional
  until a later repair; new confirms cannot book at 0.
- Rollback is revert the function migration and restore the two PO
  columns.

## Verification

- Confirm GRN with accepted qty and `unit_cost = 0` raises
  `grn_unit_price_required`.
- Confirm GRN with a positive unit price books that value; company WAC
  moves; invoice confirm does not append `invoice_reprice`.
- Persist 246 loose units at `unit_cost = 24000` quoted per pack (factor 24)
  books `246000`, not `246 × 24000`.
- PO insert/approve no longer reads `unit_price_est`.
- GRN pickers still omit finished goods.
