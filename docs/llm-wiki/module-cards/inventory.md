# Module Card — Inventory

## Current State

Inventory is the canonical stock/procurement/production workspace at `/inventory/*`. It is no longer an admin sub-module. `/admin/inventory/*` is a retired URL namespace; pages have been removed, and the resolver still maps it to `inventory_admin.allowedRoles = []` so old URLs do not become unclassified admin routes.

Current branch model uses:

- `central_warehouse`
- `central_kitchen`
- branch sites

The old singleton HQ mental model is stale for implementation planning.

## Route Ownership

Canonical route family: `/inventory/*`

Major route groups:

- `/inventory`: task-queue-first landing.
- `/inventory/stock`: stock levels.
- `/inventory/ingredients`, `/inventory/suppliers`, `/inventory/recipes`: catalogs.
- `/inventory/purchase-orders`, `/inventory/grn`, `/inventory/receiving`: procurement/GRN.
- `/inventory/supplier-invoices`: supplier invoice matching.
- `/inventory/transfers`: stock transfer state machine.
- `/inventory/production`: central kitchen production.
- `/inventory/stocktake`: sessions, count, detail, conflicts/escalation.
- `/inventory/issues`, `/inventory/waste`, `/inventory/expiry`, `/inventory/reports`, `/inventory/settings/*`.
- `/inventory/m/*`: mobile inventory flows.

## ACL Boundary

Route-level:

- `inventory`: owner, super_manager, area_manager, branch_manager, warehouse_manager, production_manager.
- `inventory_procurement`: owner, super_manager, warehouse_manager, production_manager plus permission gate.
- `inventory_admin`: retired.

Production is additionally guarded at action/RPC/RLS level. Do not rely on route ACL alone.

## Operational Rules

- Inventory scope belongs in URL query params such as `?branchId=`.
- Procurement/GRN and multi-line stock writes must be RPC-backed.
- Inventory mutation must respect period-close behavior when accounting-impacting.
- `Cấp bếp` is not the old `stock_issue(issue_type='kitchen_use')`; use intra-branch transfer flow.
- Blind stocktake must fetch through blind RPCs and never leak `system_quantity` to client payloads.

## Known Docs To Read

- `docs/ref/inventory.md`
- `docs/ref/inventory-sop.md`
- `docs/ref/inventory-rbac-matrix.md`
- `docs/runbooks/inventory/pre-release-qa.md`
- `docs/worklog/inventory/inventory-pilot-contract-v2.md`

## What To Do Next

For Inventory changes:

1. Identify the site kind and route scope first.
2. Check RBAC matrix and existing Server Actions/RPCs.
3. Avoid reviving retired `/admin/inventory/*`.
4. Keep workflow-first IA: receiving, transfers, stocktake, production, exceptions.
