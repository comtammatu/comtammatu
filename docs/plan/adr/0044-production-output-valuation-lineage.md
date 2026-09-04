# ADR 0044 — Restore production output valuation lineage

**Status:** Accepted

**Decision owner:** Owner

**Amends:** ADR 0026 shortfall posting and ADR 0040 as implemented by
`20260822143600` (that rewrite dropped the `production_output` branch of
`private.post_stock_movement_valuation`).

Runtime: [`docs/ref/inventory.md`](../../ref/inventory.md).

## Decision

1. Restore the dedicated `production_output` branch in
   `private.post_stock_movement_valuation`, ahead of the generic positive
   branch. Book run holder balances as `source_kind = 'production_output'`,
   emit a `production_output` event, record `production_inventory` allocations
   with `derived_origin_id`, and zero the run holder. Empty holder falls back
   to `quantity × movement unit_cost`.
2. One-time backfill reclassifies misposted `stocktake_found` /
   `stocktake_gain` for `production_output` movements. Booked values are not
   restated.

## Verification

pgTAP: `supabase/tests/production_output_valuation_lineage_test.sql`. No new
`stocktake_gain` on a `production_output` movement; no leftover
`production_run` holder with `quantity > 0` after output.
