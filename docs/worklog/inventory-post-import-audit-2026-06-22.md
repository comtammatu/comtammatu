# Inventory Post-Import Audit

> **SNAPSHOT (post-import baseline) — Reconciled-through `2decaa5a` (2026-06-23 ICT).** One-time production audit for the `matu-platform` Inventory import. Re-run the live audit before using these figures for future decisions.

Owner: current Inventory import task.

## Scope

Review tier: T1 doc-only plus read-only production audit/browser smoke. No schema, runtime, or data mutation.

Skill plan: repo rules = engineering + database + workflow + skills; external skills = Playwright; runtime tools = Vercel deployment lookup + `supabase-js` read-only REST calls from `apps/web` + browser smoke; skipped = migrations, reset, import writes.

Target project: `comtammatu` production Supabase ref `iexwsuaqqenyjiskawoj`.

Audit time: `2026-06-23 00:48 ICT` (`2026-06-22T17:48:48.338Z`).

## Mapping Baseline

- `Bếp CN` is not a stock-bearing target site.
- Former source `Kho CN -> Bếp CN` inventory flows are target `stock_movements.type = 'consumption'` with `movement_subtype = 'sale_consumption'`.
- Target consumption location is the branch warehouse, not a kitchen location.
- `Kho Tổng` is `branches.branch_kind = 'central_supply'`.
- `Bếp Trung Tâm` is `branches.branch_kind = 'central_kitchen'`.
- `stock_transfers` now represents only real stock-bearing transfers where the receiver keeps inventory.

## Current Site And Location Map

| Branch id | Code | Name | Branch kind | Location id | Location code | Location kind | Active |
| ---: | --- | --- | --- | ---: | --- | --- | --- |
| 2 | DD | Đất Đỏ | branch | 5 | main_warehouse | warehouse | yes |
| 3 | PH | Phước Hải | branch | 7 | main_warehouse | warehouse | yes |
| 15 | KT | Kho Tổng | central_supply | 9 | main_warehouse | warehouse | yes |
| 16 | BTT | Bếp Trung Tâm | central_kitchen | 10 | main_warehouse | warehouse | yes |

No active `location_kind = 'kitchen'` locations remain in target Inventory.

## Ledger Counts

| Table / subset | Rows |
| --- | ---: |
| `branches` | 4 |
| `inventory_locations` | 4 |
| `stock_transfers` | 356 |
| `stock_transfer_items` | 570 |
| `stock_movements` | 1,710 |
| `stock_levels` | 129 |
| `stock_issues` | 0 |
| `stocktake_sessions` | 0 |
| `sale_consumption` movements | 353 |
| `count_adjustment` movements | 217 |

## Integrity Checks

| Check | Result |
| --- | ---: |
| Active kitchen locations | 0 |
| `stock_levels` on kitchen locations | 0 |
| Negative `stock_levels` | 0 |
| `stock_levels` vs movement aggregate mismatches | 0 |
| Non-import `stock_movements` | 0 |
| Non-import `stock_transfers` | 0 |
| Orphan `stock_transfer_items` | 0 |

Movement aggregate reconciliation is keyed by `tenant_id + location_id + ingredient_id`. `branch_id` is not part of the stock-level identity because location already carries site scope.

## Stock Baseline

| Branch kind | Location kind | Stock rows | Quantity | Inventory value |
| --- | --- | ---: | ---: | ---: |
| branch | warehouse | 50 | 41,909.500 | 23,739,567.43 |
| central_kitchen | warehouse | 37 | 110,783.550 | 10,261,703.17 |
| central_supply | warehouse | 42 | 501,659.000 | 51,133,946.32 |
| **Total** |  | **129** | **654,352.050** | **85,135,216.91** |

## Transfer Matrix

| Route | Transfers |
| --- | ---: |
| branch:warehouse -> branch:warehouse | 4 |
| branch:warehouse -> central_kitchen:warehouse | 7 |
| branch:warehouse -> central_supply:warehouse | 2 |
| central_kitchen:warehouse -> branch:warehouse | 130 |
| central_kitchen:warehouse -> central_supply:warehouse | 2 |
| central_supply:warehouse -> branch:warehouse | 116 |
| central_supply:warehouse -> central_kitchen:warehouse | 95 |
| **Total** | **356** |

These directions match the accepted operating contract: central-to-branch, central-to-central, branch return/rebalance to central, and branch-to-branch stock-bearing transfers are valid.

## Actual Sale Consumption

| Branch | Rows | Actual food cost |
| --- | ---: | ---: |
| DD / Đất Đỏ | 117 | 36,063,029.78 |
| PH / Phước Hải | 236 | 184,632,882.28 |
| **Total** | **353** | **220,695,912.06** |

### Daily Actual Food Cost

| Branch | Date | Actual food cost |
| --- | --- | ---: |
| DD | 2026-05-20 | 7,365,671.11 |
| DD | 2026-05-22 | 40,000.00 |
| DD | 2026-05-23 | 182,000.00 |
| DD | 2026-05-25 | 108,500.00 |
| DD | 2026-05-26 | 229,500.00 |
| DD | 2026-05-28 | 27,000.00 |
| DD | 2026-05-30 | 15,377,299.61 |
| DD | 2026-05-31 | 2,670,165.12 |
| DD | 2026-06-01 | 2,830,848.96 |
| DD | 2026-06-02 | 376,783.36 |
| DD | 2026-06-03 | 2,318,810.32 |
| DD | 2026-06-04 | 2,313,710.32 |
| DD | 2026-06-08 | 713,682.18 |
| DD | 2026-06-09 | 1,509,058.79 |
| PH | 2026-05-19 | 23,903,057.23 |
| PH | 2026-05-26 | 247,000.00 |
| PH | 2026-05-30 | 54,704,714.88 |
| PH | 2026-06-06 | 9,977,504.67 |
| PH | 2026-06-07 | 7,391,021.66 |
| PH | 2026-06-08 | 4,646,897.16 |
| PH | 2026-06-09 | 7,646,097.13 |
| PH | 2026-06-10 | 526,721.58 |
| PH | 2026-06-11 | 4,773,620.75 |
| PH | 2026-06-12 | 14,203,942.60 |
| PH | 2026-06-13 | 8,559,730.80 |
| PH | 2026-06-14 | 7,205,323.26 |
| PH | 2026-06-15 | 6,833,725.01 |
| PH | 2026-06-16 | 1,328,009.20 |
| PH | 2026-06-17 | 195,006.00 |
| PH | 2026-06-18 | 2,241,583.82 |
| PH | 2026-06-19 | 13,626,472.28 |
| PH | 2026-06-20 | 8,645,904.42 |
| PH | 2026-06-21 | 2,979,862.60 |
| PH | 2026-06-22 | 4,996,687.24 |

## UI Smoke

Deployment: `comtammatu-o38wiun34-matu-platforms.vercel.app` (`2decaa5a`, production latest at audit time).

Artifact folder: `apps/web/output/playwright/prod-inventory-smoke-2026-06-23/`.

| Route | Result | Evidence |
| --- | --- | --- |
| `/inventory/stock` | 200 | Shows `85.135.217đ`, no `Bếp CN` text |
| `/inventory/transfers` | 200 | Shows transfer list, no `Bếp CN` text |
| `/inventory/consumption` | 200 | Shows imported sale consumption rows, no `Bếp CN` text |
| `/finance` | 200 | Shows inventory value and June actual food cost `115.841.004đ` |
| `/finance/inventory-value` | 200 | Shows `85.135.217đ` |
| `/finance/food-cost` | 200 | Still theoretical/reference food cost; actual gross profit stays on `/finance` |

## Operational Conclusion

The imported Inventory baseline is coherent for current operations:

- Target Inventory contains only import-tagged operational rows.
- No target stock is held in branch kitchen locations.
- Branch sale consumption is represented as actual `sale_consumption` movements.
- Stock levels reconcile to the movement ledger.
- The import script should not be run again against this target unless a reset/idempotency guard is used, because target operational Inventory is no longer empty.

Next useful work should move to operator-facing Inventory workflows and reporting, starting with `/inventory/stock`, `/inventory/consumption`, and food-cost variance.
