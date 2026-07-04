# T3 Inventory Unit RPC Contract - 2026-07-05

> Reconciled-through 9beaea23 plus the 2026-07-05 follow-up cleanup.

## Scope

Remove Inventory RPC dependence on client-supplied unit text/code. Transaction writes use `entry_unit_id`; persisted legacy `unit` text is derived server-side from the unit catalog only where existing tables still store it.

## Debate

- PM: Unit catalog is already the product source of truth. Forms must not send legacy `unit` for transaction writes; saved Inventory rows must derive it from `entry_unit_id` and ingredient unit configuration.
- BA: If `entry_unit_id` is missing, the valid default is the ingredient base unit, not an arbitrary client fallback. Invalid or inactive ingredient/unit pairs must fail loudly.
- Senior Dev: Add one tenant-explicit SQL helper that maps `ingredient_units.unit_id` to `units.code`, then replace affected RPC bodies. Drop the remaining live `create_expiry_writeoff(p_unit text, ...)` argument in a dedicated migration; deploy/apply in the same release window as the server action change.
- QA: Static tests must assert RPCs no longer validate/insert client `unit` text and that helper uses `unit_id`, not `ingredient_units.id`.

## Decision

Implement a new migration plus baseline mirror for the helper and affected RPC bodies. The first helper/RPC migration has already been applied and typed; the closeout migration removes the remaining expiry-writeoff `p_unit` argument and needs apply + `db:types` before the goal is fully closed.

## Apply And Verification State

- `written`: yes. `supabase/migrations/20260704200923_inventory_drop_expiry_writeoff_unit_arg.sql` drops the old `create_expiry_writeoff(..., p_unit text, ...)` signature and recreates the RPC without the unit argument.
- `baseline mirrored`: yes. `00000000000000_baseline.sql` now contains the no-`p_unit` signature for fresh installs.
- `prod-applied`: no. SELECT-only production evidence on `iexwsuaqqenyjiskawoj` still shows `create_expiry_writeoff(bigint,bigint,bigint,numeric,text,bigint,text,text[])`, and `supabase_migrations.schema_migrations` has no `inventory_drop_expiry_writeoff_unit_arg` row.
- `types generated`: no. `packages/database/src/types/database.types.ts` still reflects the production schema with `create_expiry_writeoff.Args.p_unit`. `waste-actions.ts` uses a temporary narrow RPC client type until the migration is applied to the type-source schema and `corepack pnpm db:types` can remove that shim.
- `local baseline replay`: blocked by local Docker availability (`Cannot connect to the Docker daemon at unix:///Users/luongthebinh/.docker/run/docker.sock`).
- `preview branch replay`: attempted on branch `inventory-unit-contract-closeout-20260705` (`xvuurourqhiaunigdjof`) after cost confirmation `$0.01344/hour`; Supabase branch replay ended `MIGRATIONS_FAILED` before the helper/RPC existed, so it could not validate this closeout migration. The branch was deleted.
- `prod apply order`: destructive cleanup must be applied only after the deployed code path no longer sends `p_unit`; otherwise old deployed callers can break. The safe order is code deploy first, then owner-delegated/apply migration, then `corepack pnpm db:types`, then remove the temporary type shim.

## Closeout Delta

- Removed `unit` from transaction write schemas: PO, GRN, stock issue, waste, transfer, menu recipe, production order, production recipe.
- Removed client payload `unit` from transaction callers, including expiry writeoff and quick stock issue.
- Kept UI-local `unit` state only where it drives picker display/draft row rendering; those values now use catalog labels (`unit_name`) rather than unit codes when a catalog option exists.
- Removed leftover action-side `unit` derivation from RPC-backed writes whose SQL now calls `inventory_entry_unit_code`: PO create, transfer create, waste create, production order, menu recipes, and production recipes. Direct table writes still derive `unit` in the server action until the legacy columns are removed.
- Added static tests that reject legacy `unit` in transaction action schemas/callers.
- Added migration `20260704200923_inventory_drop_expiry_writeoff_unit_arg.sql` and baseline mirror to drop `create_expiry_writeoff(..., p_unit text, ...)`.

## Inventory Shell Census

Legend: `ok` means route is already backed by approved primitives or delegates to another route content; `watch` means custom detail/form composition remains but is currently inside approved primitives; `layout` means wrapped by `inventory/settings/layout.tsx`.

| route | surface | primitives / owner | status |
| --- | --- | --- | --- |
| `/inventory` | dashboard hub | `AppPage`, `AppPageHeader`, `AppSection`, `DataTable`, `FormDialog` | ok |
| `/inventory/dashboard` | redirect | delegates to `/inventory` | ok |
| `/inventory/drafts` | redirect | delegates to `/inventory/grn?tab=drafts` | ok |
| `/inventory/consumption` | issue list alias | delegates to `IssuesPageContent` | ok |
| `/inventory/consumption/[id]` | issue detail alias | delegates to `IssueDetailPageContent` | ok |
| `/inventory/count-assignments` | count management | `AppPage`, `AppPageHeader`, `AppSection` | ok |
| `/inventory/count-slips` | count slips | `AppPage`, `AppPageHeader`, item primitives | ok |
| `/inventory/expiry` | expiry alerts | `AppPage`, `AppPageHeader`, `DataTable`, `FormDialog` | ok |
| `/inventory/grn` | GRN list | `AppPage`, `AppPageHeader`, `DataTable`, `AppPageTabs` | ok |
| `/inventory/grn/new` | GRN entry selector | `AppPage`, `AppPageHeader` | ok |
| `/inventory/grn/new/[supplierId]` | GRN form | `DocumentFormFrame`, `AppPageHeader`, `AppSection` | watch |
| `/inventory/grn/[id]` | GRN detail | `AppPage`, `AppPageHeader`, `AppSection`, `AppDetailFooter`, `AppPageTabs` | watch |
| `/inventory/ingredients` | catalog | `AppPage`, `AppPageHeader`, `DataTable`, `FormDialog` | ok |
| `/inventory/issues` | issue list | `AppPage`, `AppPageHeader`, `AppSection`, `DataTable`, `FormDialog` | ok |
| `/inventory/issues/[id]` | issue detail | `AppPage`, `AppPageHeader`, `AppSection`, `DataTable`, `FormDialog`, `AppPageTabs` | ok |
| `/inventory/production` | production hub | `ProductionHubClient` uses `AppPage`, `AppPageHeader` | ok |
| `/inventory/purchase-orders` | PO list | `AppPage`, `AppPageHeader`, `AppSection`, `DataTable` | ok |
| `/inventory/purchase-orders/new` | PO form | `DocumentFormFrame`, `AppPageHeader`, `AppSection`, `DataTable` | watch |
| `/inventory/purchase-orders/[id]` | PO detail | `AppPage`, `AppPageHeader`, `AppSection`, `DataTable`, `AppDetailFooter`, `AppPageTabs` | watch |
| `/inventory/recipes` | menu recipes | `AppPage`, `AppPageHeader`, `DataTable`, `FormDialog` | ok |
| `/inventory/reports` | reporting | `AppPage`, `AppPageHeader`, `AppSection` | ok |
| `/inventory/settings` | redirect | delegates to `/inventory/settings/expiry` | layout |
| `/inventory/settings/expiry` | settings child | wrapped by settings `AppPage`; embeds `ExpiryListClient` | layout |
| `/inventory/settings/categories` | settings child | `AppPageHeader`, `AppSection`, `DataTable`, `FormDialog` inside settings layout | layout |
| `/inventory/settings/qc` | settings child | `AppPageHeader`, `AppSection` inside settings layout | layout |
| `/inventory/settings/thresholds` | settings child | `AppPageHeader`, `AppSection`, `DataTable`, `FormDialog` inside settings layout | layout |
| `/inventory/settings/units` | settings child | `AppPageHeader`, `AppSection`, `DataTable`, `FormDialog` inside settings layout | layout |
| `/inventory/stock` | stock list | `AppPage`, `AppPageHeader`, `AppSection`, `DataTable`, `FormDialog` | ok |
| `/inventory/stock/[ingredientId]` | stock detail | `AppPage`, `AppPageHeader`, `AppSection` | ok |
| `/inventory/stocktake` | stocktake list | `AppPage`, `AppPageHeader`, `DataTable`, `FormDialog` | ok |
| `/inventory/stocktake/new` | stocktake form | `AppPage`, `AppPageHeader`, `AppSection` | ok |
| `/inventory/stocktake/[id]` | stocktake detail | `AppPage`, `AppPageHeader`, `AppSection`, `DataTable`, `AppPageTabs` | ok |
| `/inventory/stocktake/[id]/count` | count surface | `AppPage`, `AppPageHeader`, `AppSection` | ok |
| `/inventory/supplier-invoices` | invoices | `AppPage`, `AppPageHeader`, `AppSection`, `DataTable`, `FormDialog` | ok |
| `/inventory/supplier-returns` | returns list | `AppPage`, `AppPageHeader`, `DataTable` | ok |
| `/inventory/supplier-returns/new` | return form | `AppPage`, `AppPageHeader` | ok |
| `/inventory/supplier-returns/[id]` | return detail | `AppPage`, `AppPageHeader`, `AppSection`, `DataTable`, `AppPageTabs` | ok |
| `/inventory/suppliers` | supplier catalog | `AppPage`, `AppPageHeader`, `DataTable`, `FormDialog` | ok |
| `/inventory/transfers` | transfer list | `AppPage`, `AppPageHeader`, `AppSection`, `DataTable` | ok |
| `/inventory/transfers/new` | transfer form | `DocumentFormFrame`, `AppPageHeader` | ok |
| `/inventory/transfers/[id]` | transfer detail | `AppPage`, `AppPageHeader`, `AppSection`, `DataTable`, `AppDetailFooter`, `AppPageTabs` | watch |
| `/inventory/waste/approvals` | waste approvals | `AppPage`, `AppPageHeader`, item primitives | ok |
| `/inventory/waste/new` | waste form | `AppPage`, `AppPageHeader`, `AppSection` | ok |

Current shell drift is concentrated in rich detail/form surfaces (`GRN detail`, `PO detail`, `Transfer detail`, `GRN supplier form`, `PO new form`). They use approved page primitives but still carry custom local row/card/detail composition. No replacement wrapper should be added; trim only when an existing primitive can replace repeated local structure.
