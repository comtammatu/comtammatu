# ADR 0040 — Inventory valuation and purchasing contract

**Status:** Accepted (Owner 2026-08-17 → 2026-08-20; consolidated 2026-08-24
from ADR 0040 + 0041 + 0042 + 0043 — Git keeps the originals)

**Decision owner:** Owner

**Amends:** D099; D101 (site-pool WAC); ADR 0017 goods-invoice vs stock;
ADR 0026 Decision 4 first cost rung; `docs/ref/inventory.md` (do not merge
the three sites); cutover lock “1 PO = 1 NCC”.

Runtime contract: [`docs/ref/inventory.md`](../../ref/inventory.md). This ADR
owns company WAC, GRN book price, and multi-supplier PO identity.

## Decision

### 1. Company WAC vs production WAC

- **`company_wac` (purchased ingredient):** one unit cost per SKU across every
  stock-bearing location (`sum(book_value) / sum(quantity)` for `quantity > 0`).
  After each valuation event, write it onto every `stock_levels.avg_unit_cost`
  for the SKU and equalize `account.book_value = quantity × company_wac` via
  an append-only `company_wac_equalize` event. Document RPCs such as
  `execute_stock_transfer_receive` must not recompute site WAC from
  `unit_cost_at_ship` and on-hand qty (goes negative when oversold,
  ADR 0026).
- **`production_wac` (finished good):** a separate pool per FG SKU. Finished goods **never GRN**;
  they enter by `production_output` and move only by transfer. Output value
  is the **sum of ingredient book value just consumed**, not the recipe
  `raw_unit_cost` snapshot; never mix FG with purchase WAC. After every FG
  valuation event, equalize every location holding that FG code so site
  spread is rounding-only — a second price at Branch vs Kitchen for the same FG is a bug.
  `finished_good` is only a kitchen-produced SKU with a production recipe.
  Purchased bottles, lids, and similar stay `raw_material`.

### 2. GRN is the valuation event; net `Đơn giá` is book price

Operators enter net unit price (no VAT) on the GRN line
(`grn_items.unit_cost`). Confirm requires `unit_cost > 0` for every accepted
quantity; that price updates company WAC. `unit_cost` is VND per
`grn_items.unit_cost_unit_id`; changing persist qty unit does not rewrite the
typed quote. Supplier invoice is AP + VAT only — it does **not** post
`invoice_reprice`, change WAC, `Định mức/phần`, or food cost. PO carries no
commercial price (`unit_price_est` / `line_total` dropped).

### 3. Kept quantity is the PO truth

On GRN confirm, accepted base qty above remaining raises
`purchase_order_items.quantity` so `po_applied_quantity` equals the kept
amount. Shortage continues on the same GRN or `close_purchase_order` (status
`closed`). Gift is not a zero-price PO line; accepted GRN lines still require
`unit_cost > 0`. Transfers reject receive qty above shipped.

### 4. Multi-supplier PO; one shared GRN

PO lines carry `supplier_id`. Header supplier is nullable when lines mix NCC.
`confirm_goods_receipt_note(grn_id, supplier_id)` books only that supplier’s
unconfirmed lines. Invoice allocations match line NCC and may bill booked
lines while the GRN header is still draft; cap remains `po_applied_quantity`.

### 5. Provisional origin (legacy `cost_pending` receipts only)

New confirms always book a net unit price. The ladder applies only to
receipts confirmed `cost_pending` before that change, until owner repair:
last finalized `grn_receipt` origin; else last positive company WAC; else
block `transfer_out` and `production_consumption`
(`missing_provisional_unit_cost`). POS `sale_consumption` stays ADR 0026
post-and-flag. Finished-good provisional ignores `grn_receipt`. Invoice
confirm never reprices remaining raw stock, FG, or `food_cost`.

### 6. POS, menu-recipe catalog, and restatement

ADR 0026 ladder first rung is **company WAC**. Historical restatement is
append-only: owner-only `repair_company_wac_valuation`. Never `UPDATE
stock_movements SET unit_cost`.

## Consequences

Display WAC is one number per purchased SKU. Warehouse types book unit price;
Owner / Accountant own the tax invoice. Close remainder must not cancel a GRN
that already booked lines. First-ever SKU with no invoice and no prior WAC
cannot ship or cook until a price exists.

## Verification

- Confirm with `unit_cost = 0` raises `grn_unit_price_required`; a positive
  price books company WAC; invoice confirm does not append `invoice_reprice`.
- After equalize, purchased-SKU site WAC spread is rounding-only. Kitchen vs
  Branch WAC for the same FG code is rounding-only.
- Over-receipt: PO line quantity equals previously applied plus kept qty.
  Two-NCC PO → one GRN; confirm A must not stock B.
