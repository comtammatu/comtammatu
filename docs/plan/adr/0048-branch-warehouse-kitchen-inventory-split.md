# ADR 0048 — Branch warehouse and kitchen inventory split

**Status:** Accepted (2026-09-01)

Runtime: [`docs/ref/inventory.md`](../../ref/inventory.md). This ADR owns the
mandatory two-location store topology.

## Decision

Every active store branch owns exactly one active `warehouse` and one active
`kitchen`. Not a feature flag. `central_supply` and `central_kitchen` stay
single-warehouse sites.

- Warehouse: `default_receive` and `default_issue`.
- Kitchen: `default_consumption`.
- POS orders and daily-limit holds snapshot `stock_consumption_location_id`
  (immutable). Split orders inherit the snapshot; merge only when snapshots
  match.

`stock_transfers.transfer_scope`:

- `inter_site`: distinct branches, warehouse endpoints, ship/receive lifecycle.
- `intra_site`: one store, warehouse↔kitchen, immediate `received`, atomic
  `commit_intra_site_transfer`. Completed intra-site transfers are immutable;
  reverse via `reverse_intra_site_transfer`.

`ensure_branch_inventory_location_defaults` is the provisioning authority.
There is no rollback to a single-location store. Finance goods-in includes
only `inter_site`. Intra-site net quantity/WAC/book value at branch total is
zero. Employee counts resolve to the kitchen; warehouse stocktake is
Manager/Owner.
