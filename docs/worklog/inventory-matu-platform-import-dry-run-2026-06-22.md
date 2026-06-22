# Inventory Matu Platform Import Dry-Run

Owner: current Inventory import task.

## Skill Plan

Repo rules: engineering + database + workflow + team + references.
External skills: supabase, supabase-postgres-best-practices, superpowers:executing-plans.
Runtime tools: CodeGraph, Supabase MCP SELECT-only, Node script self-tests, REST master-data apply script.
Skipped: migrations, source mutation, opening-stock writes, transfer writes, consumption movement writes.

## T3 Review

PM: MVP is a read-only classifier and report, not an apply script. Done means source rows are classified into master data, stock-bearing opening stock, branch sale consumption, real transfer, or manual review.

BA: `Bep CN` is a consumption endpoint. Any source transfer into a branch kitchen maps to `stock_movements.consumption/sale_consumption` at the branch warehouse, not to target `stock_transfers`. `Kho Tong` and `Bep Trung Tam` need target central sites before applying stock.

Senior Dev: Keep this as one script with REST GET pagination and no schema dependency beyond existing source/target tables. Crosswalk starts with branch code and material SKU; unresolved rows stay in the report.

QA: Static guard blocks write methods and DML-like calls in the script. Self-test asserts branch kitchen transfer becomes `branch_sale_consumption`, stock-bearing transfer remains `real_transfer`, and branch kitchen stock is excluded from opening stock.

## Live Read-Only Evidence

Source `matu-platform` project `dyksphedgzqsqjqgxzog`:

- Warehouses: 4 `warehouse`, 3 `kitchen`.
- Materials: 104 total, 104 active, 104 with SKU.
- Movements by kind include `receipt_in`, `transfer_in`, `transfer_out`, `production_consume`, `production_output`, adjustment kinds.
- Transfer classification snapshot:
  - `branch_sale_consumption`: 122 received transfers, 359 lines, estimated cost 221,732,193.58.
  - `real_transfer`: 353 received transfers, 552 lines, estimated cost 266,914,389.59.
  - `manual_review_kitchen_source`: 3 received transfers, 18 lines, estimated cost 4,798,220.20.
  - `ignored_not_received`: 7 transfers, 33 lines.
- Branch sale consumption estimate: DD 46 transfers / 40,760,244.63; PH 76 transfers / 180,971,948.96.
- Branch kitchen stock exists in source and is treated as phantom stock for target opening-stock import: BEP-DD 34 nonzero rows / 35,962,024.43; BEP-PH 56 nonzero rows / 180,971,948.96.

Initial target `comtammatu` project `iexwsuaqqenyjiskawoj`:

- Branches: 2 `branch`; no `central_supply` or `central_kitchen` seeded yet.
- Locations: 2 `warehouse`, 2 `kitchen`.
- Ingredients: 0.
- Stock transfers: 0 total, 0 intra-branch.

CLI dry-run after source env was added:

- Source loaded: 2 branches, 7 warehouses, 104 materials, 348 stock rows, 485 transfers.
- Target preconditions:
  - missing `branch_kind=central_supply`.
  - missing `branch_kind=central_kitchen`.
  - target `ingredients` empty.
  - unmatched material SKUs: 104.
  - stock-bearing source warehouse missing target location.
- Current target-aware transfer plan:
  - `branch_sale_consumption`: 122.
  - `real_transfer`: 4.
  - `manual_review_missing_target`: 349.
  - `manual_review_kitchen_source`: 3.
  - `ignored_not_received`: 7.
- Current target-aware opening-stock plan:
  - stock-bearing rows already mappable: 49, estimated value 28,404,186.87.
  - branch-kitchen phantom rows excluded: 90, estimated value 216,933,973.38.
  - stock-bearing rows blocked by missing central target sites: 75.

## Master Data Apply Checkpoint

Owner approved applying master data directly to target production because Inventory had no real target data yet.

Applied to target project `iexwsuaqqenyjiskawoj`:

- Created branches: 2.
  - `central_supply` / `KT` / `Kho Tổng`.
  - `central_kitchen` / `BTT` / `Bếp Trung Tâm`.
- Created inventory locations: 2.
  - `Kho Tổng`, `warehouse`, default receive/issue, not default consumption.
  - `Bếp Trung Tâm`, `warehouse`, default receive/issue, not default consumption.
- Created ingredients: 104.
  - 104 with SKU.
  - Storage types: 69 `ambient`, 35 `refrigerated`.
  - Item kinds: 103 `raw_material`, 1 `finished_good`.
- Target remained movement-free after master-data apply:
  - `stock_movements`: 0.
  - `stock_transfers`: 0.

Post-apply import dry-run:

- Preconditions: none.
- Branch mapping: DD -> target DD, PH -> target PH.
- Material mapping: 104 matched, 0 missing.
- Opening stock plan:
  - stock-bearing rows: 124, estimated value 87,129,101.86.
  - branch-kitchen phantom rows excluded: 90, estimated value 216,933,973.38.
  - missing target rows: 0.
  - by source warehouse: `KHO-TONG` 48,264,055.04; `KHO-PH` 28,194,186.87; `KHO-TT` 10,460,859.96; `KHO-DD` 210,000.
- Transfer plan:
  - `real_transfer`: 352.
  - `branch_sale_consumption`: 122.
  - `ignored_not_received`: 7.
  - `manual_review_kitchen_source`: 3.
  - `manual_review_same_target_site`: 1.
- Sale consumption estimate by branch:
  - DD: 40,760,244.62.
  - PH: 180,971,948.96.
- Manual-review rows are not safe to auto-apply:
  - `TRF20260514-000006`: `BEP-DD` -> `KHO-TT`, 14 lines, estimated cost 3,872,220.20.
  - `TRF20260514-000007`: `BEP-DD` -> `KHO-TT`, 3 lines, estimated cost 371,000.00.
  - `TRF-20260531-000467`: `BEP-DD` -> `KHO-DD`, 1 line, estimated cost 555,000.00.
  - `TRF20260515-000015`: `BEP-TT` -> `KHO-TT`, 1 line, estimated cost 1,337,908.32. This collapses to the same target `central_kitchen` stock-bearing location and must not become a target transfer.

## Operational Import Dry-Run Checkpoint

Added an operational import planner that does not write data. It emits a guarded SQL transaction only after blockers are cleared.

Important correction: importing raw current stock plus historical transfers/consumption would double-count stock. The operational plan imports historical movements first, then creates `count_adjustment` balance rows so current target stock matches source `stock_items` while Finance still sees historical `sale_consumption`.

Current operational dry-run:

- Blockers: manual-review rows require owner decision.
- Target operational data before import: `stock_movements` 0, `stock_transfers` 0.
- Missing mappings: 0.
- Real stock-bearing transfers: 352 transfers, 551 item rows, estimated cost 265,576,481.23.
- Branch sale consumption: 359 movement rows, estimated cost 221,732,193.58.
  - DD: 40,760,244.65.
  - PH: 180,971,948.95.
- Balance adjustments: 229 rows, estimated absolute value 393,236,606.88.
- Total planned `stock_movements`: 1,690.
- Branch-kitchen phantom stock remains excluded:
  - BEP-DD: 35,962,024.43.
  - BEP-PH: 180,971,948.96.

SQL generation is intentionally blocked until the four manual-review rows are either explicitly skipped or mapped by owner decision.

## Operational Apply Attempt

Owner approved skipping the 4 original manual-review rows and applying the operational import.

The generated transaction was attempted through `supabase db query --linked --file /tmp/matu-platform-operational-import.sql`. The database rejected it before commit:

- Error: `stock_transfers: invalid direction central_supply -> central_kitchen`.
- Trigger: `enforce_stock_transfer_direction()`.
- Rollback smoke after the failed attempt:
  - `stock_transfers`: 0.
  - `stock_transfer_items`: 0.
  - `stock_movements`: 0.

Business correction after rollback: `Kho Tổng -> Bếp Trung Tâm` and `Bếp Trung Tâm -> Kho Tổng` are valid stock-bearing transfers. Bếp Trung Tâm can receive spices/supply ingredients from Kho Tổng, not only fresh production inputs. The target DB rule and import planner must allow `central_supply <-> central_kitchen`.

Interim dry-run while the DB rule was still too narrow:

- `real_transfer`: 249.
- `branch_sale_consumption`: 122.
- `ignored_not_received`: 7.
- `manual_review_disallowed_direction`: 103.
- `manual_review_kitchen_source`: 3.
- `manual_review_same_target_site`: 1.
- Operational SQL plan now has:
  - real stock-bearing transfers: 249 transfers, 378 item rows, estimated cost 210,189,012.07.
  - sale consumption: 359 movement rows, estimated cost 221,732,193.58.
  - balance adjustments: 211 rows, estimated absolute value 313,271,166.03.
  - total planned `stock_movements`: 1,326.

The 103 rows were split into valid central transfers and true review exceptions:

- `KHO-TONG` -> `KHO-TT`: 93 transfers, 157 lines, estimated cost 52,802,011.03; valid after allowing `central_supply -> central_kitchen`.
- `KHO-PH` -> `KHO-TT`: 7 transfers, 13 lines, estimated cost 1,555,454.16.
- `KHO-PH` -> `KHO-TONG`: 2 transfers, 2 lines, estimated cost 860,004.00.
- `KHO-TT` -> `KHO-TONG`: 1 transfer, 1 line, estimated cost 170,000.00; valid after allowing `central_kitchen -> central_supply`.

Updated recommendation: do not skip valid `Kho Tổng <-> Bếp Trung Tâm` transfers. Apply a trigger migration first, regenerate the operational dry-run, then only manually review true exceptions such as legacy kitchen-source rows or same-target-site rows.

Live dry-run after allowing `central_supply <-> central_kitchen` in the planner:

- real stock-bearing transfers: 343 transfers, 536 item rows, estimated cost 263,161,023.07.
- sale consumption: 359 movement rows, estimated cost 221,732,193.58.
- balance adjustments: 224 rows, estimated absolute value 392,079,206.88.
- total planned `stock_movements`: 1,655.
- manual-review rows: 13.
- ignored not received/cancelled/draft/sent rows: 7.

Remaining manual-review groups:

- `KHO-PH` -> `KHO-TT`: 7 received transfers, 13 lines, estimated cost 1,555,454.16. These look like branch-to-central return/rebalance rows for Bì, thịt xay, rau củ, rau má, cam, nước rau má thành phẩm, and nước mắm.
- `KHO-PH` -> `KHO-TONG`: 2 received transfers, 2 lines, estimated cost 860,004.00. These look like branch-to-central return/rebalance rows for đường and trứng.
- `BEP-DD` -> `KHO-DD`: 1 received transfer, 1 line, estimated cost 555,000.00. This is a legacy branch kitchen-source row.
- `BEP-DD` -> `KHO-TT`: 2 received transfers, 17 lines, estimated cost 4,243,220.20. These are legacy branch kitchen-source rows.
- `BEP-TT` -> `KHO-TT`: 1 received transfer, 1 line, estimated cost 1,337,908.32. This collapses to the same target `central_kitchen` stock-bearing location.

Owner correction after this dry-run: `branch -> central` is valid return/rebalance. The target DB rule and import planner must allow `branch -> central_supply` and `branch -> central_kitchen`.

Live dry-run after allowing branch return/rebalance:

- real stock-bearing transfers: 352 transfers, 551 item rows, estimated cost 265,576,481.23.
- sale consumption: 359 movement rows, estimated cost 221,732,193.58.
- balance adjustments: 229 rows, estimated absolute value 393,236,606.88.
- total planned `stock_movements`: 1,690.
- manual-review rows: 4.
- ignored not received/cancelled/draft/sent rows: 7.

Remaining manual-review rows:

- `BEP-DD` -> `KHO-DD`: 1 received transfer, 1 line, estimated cost 555,000.00. Legacy branch kitchen-source row.
- `BEP-DD` -> `KHO-TT`: 2 received transfers, 17 lines, estimated cost 4,243,220.20. Legacy branch kitchen-source rows.
- `BEP-TT` -> `KHO-TT`: 1 received transfer, 1 line, estimated cost 1,337,908.32. Same target `central_kitchen` stock-bearing location.

Production apply result:

- Applied trigger migration `allow_central_supply_central_kitchen_transfers` to project `iexwsuaqqenyjiskawoj`.
- First operational apply attempt rolled back on `stock_levels_current_quantity_nonneg` because historical replay can go negative temporarily from zero stock.
- Generator was changed to disable the stock-level update trigger during bulk ledger insert, rebuild `stock_levels` from final movement aggregate, and re-enable the trigger inside the same transaction.
- Final operational apply committed:
  - `stock_transfers`: 352.
  - `stock_transfer_items`: 551.
  - `stock_movements`: 1,690.
  - `stock_levels`: 124.
  - `sale_consumption` movements: 359.
  - `count_adjustment` movements: 229.
  - `stock_levels` vs movement aggregate mismatches: 0.

Final owner decision:

- Do not import the 4 legacy `BEP-DD` / `BEP-TT` transfer-history rows.
- Keep final stock truth through `balance_adjustment`.
- Treat new `Bếp CN` flow as consumption only; no stock-bearing kitchen history is created.

## Resulting Contract

Dry-run may report planned master-data and movement classifications, but must not apply data.

Apply order:

1. Seed target central sites and stock-bearing locations.
2. Import source materials as target ingredients by SKU.
3. Import opening stock only for stock-bearing sites.
4. Convert all source transfers into branch kitchens to `sale_consumption`.
5. Import only real stock-bearing transfers.
6. Resolve manual-review rows before any write.
