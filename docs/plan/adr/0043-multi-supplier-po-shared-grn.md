# ADR 0043 — Multi-supplier PO; one shared GRN

**Status:** Accepted

**Decision owner:** Owner, 2026-08-20 (lock A: one PO, many NCC;
one GRN; confirm by supplier group)

**Review tier:** T3 — PO/GRN identity, stock booking, AP matching

**Amends:** Cutover lock “1 PO = 1 NCC”; ADR 0041 (GRN still books
net `Đơn giá`); ADR 0042 (kept qty remains PO-line truth).

**Keeps:** PO unpriced; `HĐ NCC` is AP/VAT only (no `invoice_reprice`);
finished goods never purchased; no branch PO/GRN; company WAC
(ADR 0040); dest-initiated DC for internal moves.

## Context

Warehouse buys by ingredient, not by remembering a supplier first.
Several NCC can sit on one shopping list. Splitting that list into
N header POs hid the work. Header `purchase_orders.supplier_id`
blocked a shared receipt.

## Decision

1. **PO lines carry `supplier_id`.** The header supplier is nullable:
   set when every line shares one NCC; otherwise null. Legacy rows
   keep the header value copied onto lines.
2. **Send still mints one Auto-GRN** for the PO. Each `grn_items`
   row copies the PO line supplier. GRN header supplier may be null.
3. **Confirm is per NCC (or the remaining priced set).**
   `confirm_goods_receipt_note(grn_id, supplier_id)` books only
   unconfirmed lines of that supplier. Stock, WAC, and
   `po_applied_quantity` move only for those lines. Other lines
   stay on the same draft GRN. `confirmed_at` on the line forbids
   a second `grn_receipt`. Header becomes `confirmed` when no
   unconfirmed lines remain.
4. **ADR 0042 still applies per line.** Excess kept qty raises that
   PO line. Shortage leaves remainder on the same GRN as a new
   unconfirmed line (no second GRN).
5. **Invoice matches line NCC.** Allocations may bill booked lines
   (`confirmed_at` set) even while the GRN header is still draft.
   Cap remains `po_applied_quantity`. Header PO supplier is not
   the match key when lines differ.

## Consequences

- Create UI is ingredient-first; each row picks/pre-fills NCC.
- Warehouse confirms “giao NCC A” without booking NCC B.
- Close remainder must not cancel a GRN that already booked lines;
  it drops unconfirmed lines and confirms the header if bookings
  exist.
- Rollback: revert the function migration; keep line `supplier_id`
  (legacy 1-NCC rows stay valid).

## Verification

- Create/send a two-NCC PO → one GRN, two line suppliers, null
  header supplier when mixed.
- Confirm A: stock moves for A only; B qty unchanged; GRN stays
  draft; PO `partially_received`.
- Confirm B: GRN `confirmed`; PO `received` if fully applied.
- Invoice for A cannot allocate B’s `po_applied`.
- One-NCC PO/GRN confirm with omitted `p_supplier_id` still works.
