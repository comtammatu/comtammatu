# POS Side Dish Stock Outcome

> Reconciled-through `b667f3f8`

Skill plan: repo rules = engineering + database + workflow + regressions; external skills = supabase + supabase-postgres-best-practices; runtime tools = CodeGraph + CLI; skipped = new UI because the defect is in SQL outcome helpers.

## T3 Contract

PM: scope is stock truth parity for side dishes stored in `order_items.sides`. Done means future paid/ready and cancel-after-ready orders post stock movements for both main and side recipes, without adding another reservation system.

BA: side quantity is `order_item.quantity * side.quantity`, defaulting side quantity to `1`. Side dishes without recipes remain unconsumed and therefore still require recipe configuration. Historical sale backfill is scoped to pilot-window `sale_consumption` movements after `pos_stock_outcome_posting` was enabled; historical ready-cancel backfill is intentionally excluded because order and KDS line statuses are overwritten to `cancelled` after the helper runs.

Senior Dev: update only `post_pos_sale_consumption_if_ready` and `post_pos_cancelled_ready_waste`; reuse the existing recipe/unit conversion path by expanding main and side menu items into `consumption_lines`. Backfill computes expected main+side consumption, updates underposted existing movements when side and main share an ingredient, and inserts missing movements when the side ingredient had no movement; the stock-level trigger handles inserted rows, while underposted movement updates adjust `stock_levels` directly by the missing delta.

QA/QC: static guard checks side expansion, pilot-window backfill scope, same-ingredient underpost updates, and no tenant-implicit conversion helper. SQL acceptance fixture asserts main and side stock movements for both sale consumption and cancelled-after-ready waste.

## Verification

- `corepack pnpm exec tsx --test tests/pos-stock-outcome-contract.test.ts tests/inventory-dashboard-count-slips-static.test.ts tests/inventory-count-slip-notifications-static.test.ts`
