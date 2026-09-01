# ADR 0048: Branch Warehouse and Kitchen Inventory Split

- Status: Accepted
- Date: 2026-09-01
- Owners: Product Owner, Inventory, POS/KDS, Finance

## Context

A store branch currently owns one active warehouse that receives external
transfers, feeds POS/KDS consumption, and hosts employee counts. This hides the
physical handoff from storage to preparation and makes warehouse reconciliation
indistinguishable from daily kitchen counting.

Reclassifying the historical warehouse as a kitchen would rewrite the meaning of
existing GRNs, transfers, movements, and valuation lineage. The split must
therefore be additive and ledger-driven.

## Decision

An activated store branch owns exactly one active `warehouse` and one active
`kitchen` location.

- The warehouse remains `default_receive` and `default_issue`.
- The kitchen becomes `default_consumption` after activation.
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

## Preparation and Cutover

`prepare_branch_kitchen_split` is Owner-only. It creates or reuses an inactive-
routing kitchen without changing defaults. The Owner then creates one intra-site
warehouse-to-kitchen transfer containing every positive warehouse balance.

`set_branch_kitchen_split` is Owner-only. Activation fails while the branch has
open POS work or holds, live KDS tickets, open inter-site transfers, open
stocktakes/count slips, or a non-zero warehouse balance. It atomically enables
the feature flag, moves active employee count assignments to the kitchen, and
switches consumption.

Rollback switches the default consumption location back to the warehouse. It
does not rewrite order/hold snapshots or balances. Stock returns through an
intra-site kitchen-to-warehouse transfer.

## Thresholds, Counts, and Reporting

Thresholds are keyed by location and store both `min_stock_level` and
`target_stock_level`. Kitchen replenishment is capped at warehouse availability.
Employee count assignments resolve to the kitchen after activation. Warehouse
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

Production apply and branch activation require explicit Owner delegation. The
application can deploy with every split flag disabled.
