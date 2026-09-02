# ADR 0048: Branch Warehouse and Kitchen Inventory Split

- Status: Accepted
- Date: 2026-09-01
- Owners: Product Owner, Inventory, POS/KDS, Finance

## Context

A store branch historically owned one active warehouse that received external
transfers, feeds POS/KDS consumption, and hosts employee counts. This hides the
physical handoff from storage to preparation and makes warehouse reconciliation
indistinguishable from daily kitchen counting.

Reclassifying the historical warehouse as a kitchen would rewrite the meaning of
existing GRNs, transfers, movements, and valuation lineage. The split must
therefore be additive and ledger-driven.

## Decision

Every active store branch owns exactly one active `warehouse` and one active
`kitchen` location. This topology is mandatory, not a feature that an Owner
prepares, activates, disables, or rolls back. `central_supply` and
`central_kitchen` remain single-warehouse sites and do not own a store kitchen.

- The warehouse remains `default_receive` and `default_issue`.
- The kitchen is `default_consumption`.
- POS orders and daily-limit holds snapshot
  `stock_consumption_location_id`; the snapshot is immutable.
- Existing orders and holds are backfilled to the historical warehouse.
- Split orders inherit the source snapshot; orders may merge only when snapshots
  match.
- POS/KDS posting, cancellation waste, restoration, pending demand, and holds use
  the snapshot rather than the current branch default.

`stock_transfers.transfer_scope` separates two contracts:

- `inter_site`: distinct branches, warehouse endpoints, and the existing
  draft/ship/in-transit/check/receive lifecycle.
- `intra_site`: one store branch, distinct warehouse/kitchen endpoints, immediate
  `received` status, and no vehicle, transit, shortage-receive, or in-transit
  notification state.

`commit_intra_site_transfer` locks source stock in ingredient order, validates
the full payload, creates the document and lines, posts every `transfer_out`
before any `transfer_in`, and commits atomically. A shortage rolls back the full
document. The idempotency key is required and tenant-unique for intra-site
transfers.

Completed intra-site transfers are immutable. `reverse_intra_site_transfer`
creates a received transfer in the opposite direction and may reverse all or a
validated remaining quantity. The generic one-sided inventory correction RPC
rejects intra-site transfers.

## Provisioning and Cutover

`ensure_branch_inventory_location_defaults` creates or repairs both locations
when a store branch is created or reactivated. The database trigger is the
authority; application UI does not expose a topology toggle. A compatibility
flag remains enabled for routines introduced during the staged ADR 0048 rollout,
but attempts to disable or delete it fail closed.

Existing order and hold snapshots retain their historical location. Existing
warehouse balances also remain warehouse balances; operators supply the kitchen
through an auditable intra-site transfer before opening POS after migration.
There is no rollback to a single-location store model.

## Thresholds, Counts, and Reporting

Thresholds are keyed by location and store both `min_stock_level` and
`target_stock_level`. Kitchen replenishment is capped at warehouse availability.
Employee count assignments resolve to the kitchen. Warehouse
stocktakes require an explicit location and Manager/Owner authority.

Finance goods-in includes only `inter_site` transfers. Location reports expose
external transfer in/out separately from intra-site supply in/out. A branch-total
intra-site net is zero; branch quantity, company WAC, and book value do not change.
Low-stock notifications are deduplicated by branch, location, and ingredient;
their metadata and action URL preserve the matching warehouse or kitchen tab.

## Consequences

Historical documents keep their original endpoints and meaning. External
receiving remains operationally unchanged. The extra location and transfer scope
increase reporting and UI state, but eliminate one-sided corrections and make
the warehouse-to-kitchen custody handoff auditable.

Production apply requires explicit Owner delegation and an operational cutover
window so each existing branch can supply its kitchen before POS reopens.
