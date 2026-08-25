# ADR 0040 — Inventory valuation and purchasing contract

**Status:** Accepted (Owner 2026-08-17 → 2026-08-20; consolidated 2026-08-24 from ADR 0040 + 0041 + 0042 + 0043 — Git keeps the originals)

**Decision owner:** Owner — **Review tier:** T3 (money path, valuation
subledger, PO/GRN identity, multi-row RPC)

**Amends:** D099; D101 (site-pool WAC); ADR 0017 §9 and §13; ADR 0026
Decision 4 first cost rung; `docs/ref/inventory.md` §2.3 (do not merge the
three sites); cutover lock “1 PO = 1 NCC”.

**Keeps:** ADR 0017 remaining AP matching and closed-period posting; ADR
0028 transfer shortfall ownership; no `stock_movements.unit_cost` rewrite;
finished goods never purchased (PO / GRN / NCC); no branch PO/GRN;
dest-initiated DC for internal moves.

## Context

Purchased ingredients share one commercial price: the supplier invoice. GRN
booked forced `unit_cost = 0` until that invoice (`cost_pending`), collapsing
the receiving site’s WAC while same-day transfers and production booked 0 VND
into finished goods; site-local WAC then looked like three different purchase
prices. Warehouse books value on the goods receipt (`phiếu nhập`); the tax invoice is payables + VAT and often arrives later.
Warehouse buys by ingredient across several NCC on one shopping list;
header-level `purchase_orders.supplier_id` blocked a shared receipt, and
capping `po_applied_quantity` at the unordered remainder left over-receipts
unbilled.

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
1. Operators enter net unit price (no VAT) on the GRN line
   (`grn_items.unit_cost`, UI `Đơn giá`). Confirm requires `unit_cost > 0`
   for every accepted quantity; that price updates company WAC; finished
   goods stay off GRN.
2. **The quote is bound to an ingredient unit.** `unit_cost` is VND per
   `grn_items.unit_cost_unit_id`, not per persist/entry qty unit; book value
   is `accepted_qty × persist_to_base × unit_cost / price_to_base`. Changing
   persist qty unit does not rewrite the typed quote.
3. **Supplier invoice is AP + VAT only.** Confirm matches quantity and records
   payables / input VAT; it does **not** post `invoice_reprice`, change WAC,
   `Định mức/phần`, or food cost — invoice-vs-GRN difference is AP review, not a stock restatement.
4. **PO carries no commercial price.** `unit_price_est` and `line_total` on
   `purchase_order_items` are dropped; raising PO line quantity raises no money total.

### 3. Kept quantity is the PO truth
1. On GRN confirm, accepted base qty above remaining base qty raises
   `purchase_order_items.quantity` (PO entry unit) so `po_applied_quantity`
   equals the kept amount; invoice allocation bills the full receipt — no orphan over-receipt.
2. **Shortage must continue or close.** Auto-GRN still opens the next draft;
   `close_purchase_order` (status `closed`, not `cancelled`) cancels it and
   records `status_reason`. Warehouse with `procurement:grn_confirm` or
   accountant/Owner with `procurement:po_approve` may close.
3. **Gift is not a zero-price PO line.** Accepted GRN lines still require
   `unit_cost > 0`; a later invoice at 0 is an AP discrepancy. Internal
   receive does not create quantity: transfers reject receive qty above
   shipped, and POS does not type recipe grams.

### 4. Multi-supplier PO; one shared GRN
1. **PO lines carry `supplier_id`.** Header supplier is nullable: set when
   every line shares one NCC, else null; legacy rows copy the header value
   onto lines. Send still mints one Auto-GRN per PO; each `grn_items` row
   copies the PO line supplier.
2. **Confirm is per NCC.** `confirm_goods_receipt_note(grn_id, supplier_id)`
   books only unconfirmed lines of that supplier (stock, WAC,
   `po_applied_quantity` move only for those lines; others stay draft; line
   `confirmed_at` forbids a second `grn_receipt`; header becomes `confirmed`
   when none remain). **§3 applies per line:** excess kept qty raises that PO
   line; shortage leaves remainder on the same GRN as a new unconfirmed line.
3. **Invoice matches line NCC.** Allocations may bill booked lines even while
   the GRN header is draft; cap remains `po_applied_quantity`. Header PO
   supplier is not the match key when lines differ.

### 5. Provisional origin value (legacy `cost_pending` receipts only)
New confirms always book a net unit price, so new receipts never book 0; the
ladder applies only to receipts confirmed `cost_pending` before that change,
until owner repair: (1) last **finalized** `grn_receipt` origin unit
(`finalized_value / original_quantity`) for a purchased SKU; else (2) last
positive company WAC; else (3) block `transfer_out` and `production_consumption`
(`missing_provisional_unit_cost`); POS `sale_consumption` stays ADR 0026
post-and-flag. Finished goods skip GRN (provisional is last positive
`production_output` origin / production WAC / last `production_output`
movement); `provisional_value = qty × provisional_unit`, `cost_status =
provisional`; invoice confirm never reprices it, and kitchen may cook without
the invoice when one exists.

### 6. POS, menu-recipe catalog, and restatement
ADR 0026 ladder first rung is **company WAC** (then last-known movement, then
zero with a flag). Menu-recipe / Finance portion-cost use the same company
number — no dual source-site vs branch price. Historical restatement is
append-only: owner-only `repair_company_wac_valuation` is idempotent — ops
confirms pending supplier invoices; repair backfills `provisional_value = 0`
origins that now have a provisional unit, re-propagates, equalizes company
WAC, and values `pos_sale_shortfall` rows that booked 0. Never `UPDATE
stock_movements SET unit_cost`; UI may show document snapshot cost beside
current book cost.

## Consequences

- Display WAC is one number per purchased SKU; site value is `qty × company_wac` (tenant total conserved except rounding). Warehouse types book
  unit price; Owner / Accountant own the tax invoice; create UI is
  ingredient-first with per-row NCC prefill; warehouse confirms “giao NCC A” without booking NCC B.
- Close remainder must not cancel a GRN that already booked lines; it drops
  unconfirmed lines and confirms the header if bookings exist. PO line qty
  may increase at confirm; audit remains GRN lines and `stock_movements`. UI
  drops “orphan over-receipt” wording: excess is keep-and-raise PO qty, shortage is receive-again or close remainder.
- First-ever SKU with no invoice and no prior WAC cannot ship or cook until
  a price exists. Rollback reverts the function migrations (restore the two
  PO columns for §2.4; keep line `supplier_id` — legacy 1-NCC rows stay
  valid); restatement events reverse with an opposite reprice, never by
  deleting ledger rows; historical confirms that raised PO qty stay.

## Verification

- Confirm GRN with accepted qty and `unit_cost = 0` raises
  `grn_unit_price_required`; with a positive price it books that value,
  company WAC moves, invoice confirm does not append `invoice_reprice`.
  Persist 246 loose units at `unit_cost = 24000` per pack (factor 24) books `246000`, not `246 × 24000`.
- Pending GRN does not collapse WAC to 0 when a last invoice/WAC exists;
  after equalize, site WAC spread for a purchased SKU is rounding-only.
  Finished-good provisional ignores `grn_receipt`; last `production_output`
  wins; Kitchen vs Branch WAC for the same FG code is rounding-only;
  `finished_good` is recipe-produced only (purchased SKUs stay `raw_material`); output value equals consumed input book value.
- Over-receipt: PO line quantity equals previously applied plus kept qty; `po_applied_quantity` equals kept qty; PO can reach `received`. Shortage plus `close_purchase_order`: draft GRNs cancelled; PO `closed`.
- Two-NCC PO → one GRN, two line suppliers, null header supplier when mixed.
  Confirm A moves stock for A only; B unchanged; GRN stays draft; PO
  `partially_received`. Confirm B: GRN `confirmed`; PO `received` if fully
  applied; invoice for A cannot allocate B’s `po_applied`. One-NCC confirm
  with omitted `p_supplier_id` still works; PO insert/approve no longer reads `unit_price_est`; GRN pickers still omit finished goods.
- Owner repair restates `provisional_value = 0` origins append-only; invoice confirm never reprices remaining raw stock, FG, or `food_cost`.
