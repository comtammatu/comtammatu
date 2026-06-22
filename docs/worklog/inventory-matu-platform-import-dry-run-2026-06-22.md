# Inventory Matu Platform Import Dry-Run

> **⚠️ SNAPSHOT (import closeout log) — Reconciled-through `637d0bbd` (2026-06-22).** Bản ghi một lần của dry-run/import closeout, không phải nguồn sự thật vận hành. Verify tồn/inventory thật vào prod + code trước khi dùng.

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

## Post-Merge Smoke

PR #99 landed on `main` as `0bc9ea2172fb030e61d27a54d09a39c65172dbaf`.

GitHub CI after merge passed:

- `baseline-replay`.
- `gates`: deps audit, baseline hygiene, typecheck, lint, test, and build.

Vercel production deployment `dpl_7MU1GEV6eESz56irp6kR6nwCmu7S` reached `READY`.

Read-only production Inventory smoke on project `iexwsuaqqenyjiskawoj`:

- `stock_transfers`: 352.
- `stock_transfer_items`: 551.
- `stock_movements`: 1,690.
- `stock_levels`: 124.
- `sale_consumption` movements: 359.
- `count_adjustment` movements: 229.
- `stock_levels` vs movement aggregate mismatches: 0.
- Negative `stock_levels`: 0.
- Stock rows on `location_kind = 'kitchen'`: 0.
- All imported stock transfers are `warehouse -> warehouse`.
- `trg_stock_movement_update_levels` is enabled.

Legacy `Kho CN -> Bếp CN` backfill audit:

- Command: `node --env-file=.env.local scripts/inventory-legacy-kitchen-backfill.mjs --tenant-id 1 --json`.
- Result: `legacyTransferCount=0`, `transferInMovementCount=0`, `phantomKitchenQuantity=0`, `phantomKitchenValue=0`, `dryRunCorrections=0`.
- No correction/backfill write is required.

Deployed route smoke after the next production deploy:

- Latest production deployment: `dpl_FAi4XnEzLed75pw2axHY7PDqqW6K`, `READY`, commit `ae9158a29d325b619bb3ae56c78e850b42723303`.
- The latest deployed commit is doc/CI-only; runtime Inventory behavior still comes from PR #99.
- Vercel Authentication direct fetch returns `401`; smoke used a temporary Vercel share cookie and performed no app login.
- `/api/health`: `200`, `{"status":"ok","db":"ok"}`.
- `/inventory/stock`: `200`, final URL `/login?returnTo=%2Finventory%2Fstock`.
- `/inventory/transfers`: `200`, final URL `/login?returnTo=%2Finventory%2Ftransfers`.
- `/inventory/consumption`: `200`, final URL `/login?returnTo=%2Finventory%2Fconsumption`.
- `/finance/food-cost`: `200`, final URL `/login?returnTo=%2Ffinance%2Ffood-cost`.

Read-only data smoke for route data:

- `stock_levels`: 124.
- Stock rows by location kind: `warehouse`: 124 rows, quantity `647098.754000`.
- `stock_levels` vs movement aggregate mismatches: 0.
- Negative `stock_levels`: 0.
- Stock rows on `location_kind = 'kitchen'`: 0.
- `stock_transfers`: 352.
- `stock_transfer_items`: 551.
- Transfer matrix: `warehouse -> warehouse`: 352.
- `sale_consumption` movements: 359.
- Actual food cost by branch: branch 2 = `40,760,298.68`, branch 3 = `180,972,110.83`.
- Actual food cost total from `sale_consumption`: `221,732,409.51`.

Authenticated UI smoke is still blocked until a safe smoke account is provided or explicitly created:

- `.env.test.local` is missing.
- `.env.local` has Supabase production credentials but no `E2E_CASHIER_EMAIL`, `E2E_CASHIER_PASSWORD`, `E2E_INVENTORY_MANAGER_EMAIL`, or `E2E_INVENTORY_MANAGER_PASSWORD`.

## Production Kitchen Location Cleanup

Review tier: T3, owner-approved production data cleanup.

Skill plan: repo rules = database + workflow; external skills = Supabase; runtime tools = Supabase MCP; skipped = no migration/PR because this was a two-row orphan data cleanup approved in-session.

PM: remove active branch-kitchen location rows that contradict the Inventory contract. Done means branch kitchens are no longer active `inventory_locations`.

BA: deletion is valid only when target locations have no FK references and no stock ledger rows. If any reference exists, stop.

Senior Dev: use one guarded `DELETE` against `inventory_locations` for `id in (6, 8)`, scoped to `tenant_id = 1`, `code = 'kitchen'`, `location_kind = 'kitchen'`, and `NOT EXISTS` checks for every FK table.

QA/QC: verify no `location_kind = 'kitchen'` remains, stock ledger still matches movement aggregate, no negative stock appears, and transfers remain `warehouse -> warehouse`.

Pre-delete FK audit for `location_id in (6, 8)`:

- `stock_issues.source_location_id`: 0.
- `stock_issues.target_location_id`: 0.
- `stock_levels.location_id`: 0.
- `stock_movements.location_id`: 0.
- `stock_transfers.from_location_id`: 0.
- `stock_transfers.to_location_id`: 0.
- `stocktake_sessions.location_id`: 0.

Deleted rows:

- `location_id = 6`, Đất Đỏ, `code = kitchen`, `location_kind = kitchen`.
- `location_id = 8`, Phước Hải, `code = kitchen`, `location_kind = kitchen`.

Post-delete verification:

- Remaining `inventory_locations`: 4.
- Remaining `kitchen` locations: 0.
- Remaining locations: Đất Đỏ warehouse `5`, Phước Hải warehouse `7`, Kho Tổng warehouse `9`, Bếp Trung Tâm warehouse `10`.
- `stock_levels`: 124.
- `stock_movements`: 1,690.
- `stock_levels` vs movement aggregate mismatches: 0.
- Negative `stock_levels`: 0.
- Transfer matrix: `warehouse -> warehouse`: 352.

## Reset And Reimport Guard Checkpoint

Review tier: T3, production data cleanup/backfill preparation. No production write was performed in this checkpoint.

Skill plan: repo rules = engineering + database + workflow; external skills = Supabase + Supabase Postgres best practices; runtime tools = CodeGraph, REST read-only dry-run, Node self-test, local SQL file generation.

PM: allow a clean rebuild of the previous smoke/import ledger without touching any future real Inventory data. Done means the script can emit a reset transaction only when target Inventory rows are all tagged import rows.

BA: reset is allowed only for previous `matu-platform import:` rows. Any real `stock_movements`, real `stock_transfers`, orphan transfer items, `stock_issues`, or `stocktake_sessions` must block reset generation.

Senior Dev: add `--write-reset-sql` to the operational import script. The script audits target rows through REST first, then the generated SQL repeats the guard inside a short transaction before deleting import rows and derived `stock_levels`.

QA/QC: self-test covers clean reset generation and dirty non-import movement blocking. Live dry-run must show zero reset blockers before a reset SQL file is written. Repo gate must pass.

Current target reset audit:

- `stock_movements`: 1,690 total, 1,690 import-tagged, 0 non-import.
- `stock_transfers`: 352 total, 352 import-tagged, 0 non-import.
- `stock_transfer_items`: 551 total, 0 orphan, 0 attached to non-import transfers.
- `stock_levels`: 124.
- `stock_issues`: 0.
- `stocktake_sessions`: 0.
- Reset blockers: none.

Current regenerated import dry-run after kitchen passthrough handling:

- Blockers before reset: `target operational inventory is not empty`, `target transfer number already exists`.
- Manual-review rows: 0.
- Missing mapping rows: 0.
- Ignored rows: 11.
  - `ignored_not_received`: 7.
  - `ignored_legacy_branch_kitchen_source`: 1.
  - `ignored_kitchen_passthrough_inbound`: 2.
  - `ignored_same_target_site`: 1.
- Real stock-bearing transfers: 354 transfers, 568 item rows, estimated cost 269,819,701.43.
- Sale consumption: 342 movement rows, estimated cost 217,488,973.38.
  - DD: 36,517,024.45.
  - PH: 180,971,948.95.
- Balance adjustments: 216 rows, estimated absolute value 396,914,995.08.
- Total planned `stock_movements`: 1,694.

Generated local reset SQL:

- Path: `/tmp/comtammatu-inventory-reset-import.sql`.
- Lines: 76.
- Applies no changes unless executed manually by an approved operator.
- Guard exceptions include `target_has_non_import_stock_movements`, `target_has_non_import_stock_transfers`, `target_has_stock_issues`, `target_has_stocktakes`, `target_has_non_import_stock_transfer_items`, and `target_has_stock_levels_without_import_ledger`.

Verification:

- `pnpm inventory:matu-platform:operational -- --self-test`.
- `pnpm inventory:matu-platform:operational -- --json`.
- `pnpm inventory:matu-platform:operational -- --write-reset-sql /tmp/comtammatu-inventory-reset-import.sql --json`.
- `git diff --check`.
- `pnpm typecheck && pnpm lint && pnpm build`.

## Production Reset And Reimport Apply Checkpoint

Review tier: T3, owner-approved production data cleanup and reimport.

Applied files:

- Reset SQL: `/tmp/comtammatu-inventory-reset-import.sql`.
- Reimport SQL: `/tmp/comtammatu-inventory-reimport.sql`.

Pre-reset guard:

- `stock_movements`: 1,690 total, 1,690 import-tagged, 0 non-import.
- `stock_transfers`: 352 total, 352 import-tagged, 0 non-import.
- Non-import/orphan transfer items: 0.
- `stock_levels`: 124.
- `stock_issues`: 0.
- `stocktake_sessions`: 0.

Reset apply result:

- `stock_movements`: 0.
- `stock_transfers`: 0.
- `stock_transfer_items`: 0.
- `stock_levels`: 0.
- `stock_issues`: 0.
- `stocktake_sessions`: 0.

Reimport generation result:

- Blockers: none.
- Manual-review rows: 0.
- Missing mapping rows: 0.
- Real stock-bearing transfers: 354.
- Transfer item rows: 568.
- Sale consumption movement rows: 342.
- Balance adjustment rows: 216.
- Total planned stock movement rows: 1,694.

Post-reimport smoke:

- `stock_transfers`: 354.
- `stock_transfer_items`: 568.
- `stock_movements`: 1,694.
- `stock_levels`: 124.
- `sale_consumption` movements: 342.
- `count_adjustment` movements: 216.
- `stock_levels` vs movement aggregate mismatches: 0.
- Negative `stock_levels`: 0.
- Stock rows on `location_kind = 'warehouse'`: 124.
- Stock rows on `location_kind = 'kitchen'`: 0.
- Active `kitchen` inventory locations: 0.
- Transfer matrix: `warehouse -> warehouse`: 354.
- Kitchen passthrough transfers imported as real stock-bearing passthrough: 2.
- `trg_stock_movement_update_levels` enabled: `O`.
- Import-tagged movement rows: 1,694; non-import movement rows: 0.
- Import-tagged transfer rows: 354; non-import transfer rows: 0.
- Actual food cost by branch:
  - branch 2: 36,517,029.78.
  - branch 3: 180,972,110.83.

## Closeout Reconciliation

Review tier: T1 doc-only reconciliation note. No schema, runtime, or data mutation.

Read-only reconciliation scope:

- Source project: `matu-platform` / `dyksphedgzqsqjqgxzog`.
- Target project: `comtammatu` / `iexwsuaqqenyjiskawoj`.
- Target commit: `637d0bbd`.
- Method: REST reads through `supabase-js`; no SQL write, RPC write, migration, or reset.

Target ledger counts:

- `stock_transfers`: 354.
- `stock_transfer_items`: 568.
- `stock_movements`: 1,694.
- `stock_levels`: 124.
- `sale_consumption` movement rows: 342.
- `count_adjustment` movement rows: 216.
- Active `location_kind = 'kitchen'` locations: 0.
- `stock_levels` on `location_kind = 'kitchen'`: 0.
- Non-import `stock_movements`: 0.
- Non-import `stock_transfers`: 0.
- Transfer matrix: `warehouse -> warehouse`: 354.

Planner closeout:

- Current dry-run blockers are expected because the import is already applied:
  `target operational inventory is not empty` and `target transfer number already exists`.
- Manual review rows: 0.
- Missing mapping rows: 0.
- Ignored source rows: 11.
  - `ignored_not_received`: 7.
  - `ignored_legacy_branch_kitchen_source`: 1.
  - `ignored_kitchen_passthrough_inbound`: 2.
  - `ignored_same_target_site`: 1.
- Phantom source Bep CN stock remains excluded from target operating stock:
  - `BEP-PH`: 180,971,948.96 estimated value.
  - `BEP-DD`: 35,962,024.43 estimated value.

Sample reconciliation:

| Flow | Source transfer | Source route | Target route | Quantity delta | Value delta |
| --- | --- | --- | --- | ---: | ---: |
| Kho Tổng -> Kho CN | `TRF20260514-000011` | `KHO-TONG -> KHO-DD` | `central_supply -> branch` | 0 | 0 |
| Bếp Trung Tâm -> Kho CN | `TRF20260514-000014` | `KHO-TT -> KHO-PH` | `central_kitchen -> branch` | 0 | -0.04 |
| Kho Tổng -> Bếp Trung Tâm | `TRF20260514-000006` | `KHO-TONG -> KHO-TT` via kitchen passthrough | `central_supply -> central_kitchen` | 0 | 48.70 |
| Bếp Trung Tâm -> Kho Tổng | `TRF20260515-000040` | `KHO-TT -> KHO-TONG` | `central_kitchen -> central_supply` | 0 | 0 |
| Branch -> central | `TRF-20260529-000388` | `KHO-PH -> KHO-TT` | `branch -> central_kitchen` | 0 | 0 |

Consumption sample check:

- 5 sampled source transfers from `Kho CN -> Bep CN` all map to
  `stock_movements.type = 'consumption'` and
  `movement_subtype = 'sale_consumption'`.
- Target branch kind is `branch`.
- Target location kind is `warehouse`.
- Quantity deltas are 0.
- Value deltas are only rounding noise from `numeric(15,2)` unit-cost columns.

Full-row reconciliation:

- Real stock-bearing transfer count: 354.
- Kitchen passthrough transfer count inside real transfers: 2.
- Branch consumption source transfers: 120.
- Target import transfers: 354.
- Target sale-consumption movement rows: 342.
- Missing transfer rows: 0.
- Transfer quantity mismatches: 0.
- Missing consumption rows: 0.
- Consumption quantity mismatches: 0.
- Extra target import transfers: 0.
- Extra target sale-consumption reasons: 0.

Known rounding:

- `stock_movements.unit_cost` and `stock_transfer_items.unit_cost_at_ship` are
  `numeric(15,2)`.
- Total transfer value delta vs raw source plan: +1,278.81 VND on
  269,819,701.43 VND.
- Total consumption value delta vs raw source plan: +167.23 VND on
  217,488,973.38 VND.
- Maximum per-transfer delta observed: 115.92 VND.
- Maximum per-consumption-transfer delta observed: 63.54 VND.

Closeout decision:

- Import mapping is accepted for operations.
- Bep CN is not stock-bearing in target.
- Former branch kitchen inbound transfers are actual branch consumption, not
  target `stock_transfers`.
- Kho Tong, Bep Trung Tam, branch warehouses, central-to-branch,
  central-to-central, branch-to-central, and branch-to-branch stock-bearing
  transfers remain valid as real transfers.
- A future T3 may decide whether unit-cost columns need higher precision than
  `numeric(15,2)` for raw per-gram/per-ml rates; this is not required to close
  the import milestone.
