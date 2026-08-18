# ADR 0040 — Company WAC and append-only cost restatement

**Status:** Accepted (amended by ADR 0041: GRN books purchased unit
price; invoice no longer reprices stock)

**Decision owner:** Owner, 2026-08-17 (implement plan Accept)

**Review tier:** T3 — money path, valuation subledger, multi-row RPC

**Amends:** D101 site-pool WAC; ADR 0026 Decision 4 first cost rung;
`docs/ref/inventory.md` §2.3 (do not merge the three sites).

**Keeps:** ADR 0017 AP matching and closed-period posting; no
`stock_movements.unit_cost` rewrite. ADR 0041 moves book price to GRN
and stops invoice restatement.

## Context

Purchased ingredients share one commercial price: the supplier invoice.
GRN triggers still force movement `unit_cost = 0` until that invoice
(`cost_pending`). Origin `provisional_value` followed that 0, so the
receiving site’s WAC collapsed. Same-day transfers and production then
booked 0 VND into finished goods while other sites kept earlier batches.
Site-local WAC (`stock_levels.avg_unit_cost` per location) made that
spread look like three different purchase prices.

Invoice settlement already appends `invoice_reprice` and
`propagate_inventory_origin_reprice` to remaining stock, derived
finished-good origins, and terminal `food_cost` / `waste`. What was
missing: a non-zero provisional before the invoice, and one WAC per
purchased SKU across Central Supply, Central Kitchen, and Branch.

## Decision

### 1. Company WAC vs production WAC

- **`company_wac` (purchased ingredient):** one unit cost for the SKU
  across every stock-bearing location.
  `sum(account.book_value) / sum(account.quantity)` for `quantity > 0`.
  Quantity remains per location. After each valuation event, write that
  unit cost onto every `stock_levels.avg_unit_cost` for the SKU and
  equalize `account.book_value = quantity × company_wac` with an
  append-only `company_wac_equalize` event (origin balances follow so
  reconciliation still holds). Document RPCs such as
  `execute_stock_transfer_receive` must not recompute site WAC from
  `unit_cost_at_ship` and on-hand qty — that blend goes negative when
  the destination is oversold (ADR 0026).
- **`production_wac` (finished good):** a separate pool per FG SKU.
  Finished goods **never GRN**. They enter by `production_output` and
  move only by transfer (custody change). Output value is the **sum of
  ingredient book value just consumed**, not the recipe `raw_unit_cost`
  snapshot. Do not mix FG with purchase WAC. After every FG valuation
  event (output, transfer, input reprice), equalize every location that
  holds that **same FG code** so site WAC spread is rounding-only.
  A second price at Branch vs Kitchen for the same FG is a bug.
  `finished_good` is only a kitchen-produced SKU with a production
  recipe. Purchased bottles, lids, and similar stay `raw_material`.

### 2. Provisional origin value (GRN still has no commercial price)

Keep GRN commercial `unit_cost = 0` and `cost_pending` on the document.
Valuation does not wait at 0:

1. Last **finalized** `grn_receipt` origin unit
   (`finalized_value / original_quantity`) for a **purchased** SKU, else
2. Last positive company WAC, else
3. No provisional — block `transfer_out` and `production_consumption`
   for that SKU (`missing_provisional_unit_cost`). POS
   `sale_consumption` stays ADR 0026 post-and-flag (may still book 0
   with a follow-up).

Finished goods skip the invoice rung. Provisional is last positive
`production_output` origin / production WAC / last `production_output`
movement.

`provisional_value = qty × provisional_unit`, `cost_status =
provisional`. Invoice confirm delta is `net_invoice − provisional`
(no longer `net_invoice − 0`). Kitchen may cook without the invoice
when a provisional exists.

### 3. POS and menu-recipe catalog

ADR 0026 ladder first rung is **company WAC** (then last-known
movement, then zero with a flag). Menu-recipe / Finance portion-cost
use the same company number — no dual source-site vs branch price.

### 4. Historical restatement is append-only

Owner-only `repair_company_wac_valuation` is idempotent:

1. Ops confirms pending supplier invoices (ordinary settle +
   propagate).
2. Repair backfills `provisional_value = 0` origins that now have a
   provisional unit, re-propagates, equalizes company WAC, and values
   `pos_sale_shortfall` rows that booked 0.
3. Never `UPDATE stock_movements SET unit_cost`. UI may show document
   snapshot cost (can be 0) beside current book cost.

## Consequences

- Display WAC is one number per purchased SKU; site inventory **value**
  is `qty × company_wac` (value moves between sites on equalize;
  tenant total is conserved except rounding).
- First-ever SKU with no invoice and no prior WAC cannot ship or cook
  until a price exists.
- Rollback of Phases 1–2 is revert the function migration. Phase 3
  events reverse with an opposite reprice, never by deleting ledger
  rows.

## Verification

- Pending GRN does not collapse WAC to 0 when a last invoice/WAC
  exists; invoice confirm only posts the delta.
- After equalize, site WAC spread for a purchased SKU is rounding-only.
- Finished-good provisional ignores `grn_receipt`; last
  `production_output` wins. Kitchen vs Branch WAC for the same FG code
  is rounding-only (transfer does not mint a second price).
- `finished_good` is recipe-produced only; purchased SKUs stay
  `raw_material` (PO / GRN / NCC).
- Production output value equals consumed input book value.
- Reprice of remaining raw stock updates remaining FG and `food_cost`
  allocations.
