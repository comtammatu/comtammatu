# ADR 0044 — Restore production output valuation lineage

**Status:** Accepted

**Decision owner:** Owner, 2026-08-24 (chat confirmation of the P0
valuation repair)

**Review tier:** T3 — money path, valuation, migration

**Amends:** ADR 0026 shortfall posting and ADR 0040 company WAC as
implemented by `20260822143600` (the universal rewrite dropped the
production branch of `private.post_stock_movement_valuation`).

**Keeps:** ADR 0026 post-and-flag oversell; ADR 0040 (company WAC
projection and GRN book price); finished goods never purchased.

## Context

The universal shortfall rewrite kept only four branches: `transfer_in`,
`refund_restore`, generic positive, universal negative. Any positive
movement that is not `grn_receipt` now creates a `stocktake_found`
origin with a `stocktake_gain` event — including `production_output`.

Two breaks follow:

1. `private.ingredient_provisional_unit_cost` resolves finished-good
   cost only from origins with `source_kind = 'production_output'`.
   Those origins are never created anymore, so finished-good cost falls
   to account-WAC and last-movement guesses and diverges from the batch
   input cost.
2. `production_consumption` keeps parking value on
   `inventory_origin_balances` rows with `holder_kind = 'production_run'`,
   but nothing drains them. Value is trapped per run and the
   input→output lineage (`derived_origin_id`) is never recorded.

## Decision

1. **Restore the dedicated `production_output` branch** in
   `private.post_stock_movement_valuation`, ahead of the generic
   positive branch. It requires `production_run_id`, sums the run's
   holder balances, books that value as a new
   `source_kind = 'production_output'` origin into the stock pool,
   emits a `production_output` event, records `production_inventory`
   allocations carrying `derived_origin_id`, and zeroes the run holder
   balances. When the holder is empty, value falls back to
   `quantity × movement unit_cost` (baseline semantics).
2. **One-time backfill in the same migration** repairs the broken
   window (`20260822143600` → this migration): reclassify
   `stocktake_found` origins and `stocktake_gain` events whose source
   movement is `production_output`; then drain trapped
   `production_run` holder balances for those runs into lineage
   allocations. Booked values are **not** restated; only lineage and
   classification change.
3. **Guard test**: a pgTAP suite asserts that a production output
   movement creates a `production_output` origin and event, drains the
   run holder to zero, and keeps the valuation account total equal to
   consumption-in plus output-in.

## Consequences

- Finished-good provisional cost reads real batch cost again.
- Historical misposted outputs keep their booked value; consumption
  priced through the fallback ladder during the broken window is not
  repriced.
- Rollback is recreating the `20260822143600` function body; the
  backfill reclassification is not auto-reverted (origins would need a
  separate reconciliation).

## Verification

- pgTAP: `supabase/tests/production_output_valuation_lineage_test.sql`.
- After apply: no new `stocktake_gain` events reference a
  `production_output` movement; no `production_run` holder balance with
  `quantity > 0` remains for a run that has an output movement.
- `corepack pnpm db:types` after apply; full `corepack pnpm verify`
  before commit.
