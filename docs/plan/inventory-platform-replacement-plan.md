# Inventory replacement from matu-platform

> Status: investigation + planning only
> Date: 2026-05-26
> Target repo: `/Users/luongthebinh/Downloads/comtammatu`
> Source repo: `/Users/luongthebinh/matu-platform`

## Executive decision

Do not make `comtammatu` depend on `matu-platform` as a live write backend for
Inventory.

Chosen path:

1. Use `matu-platform` Inventory as the domain reference and data source.
2. Port/import the required schema, RPCs, seed/live data, and UI flows into
   `comtammatu`.
3. Treat `comtammatu` as the production source of truth after cutover.
4. Use an API bridge only as a temporary read-only preview/reporting path while
   the replacement is being built.

Rationale:

- `comtammatu` already has production-facing auth, ACL, route, tenant/branch,
  POS/KDS/print/payment, and audit contracts. Inventory writes must participate
  in that system.
- `matu-platform` Inventory is richer in operating model, but its runtime
  assumptions are different: UUID IDs, `warehouses`, PBAC permission codes,
  next-intl route tree, and several localStorage-backed UI states.
- A shared live write path would create two auth systems, two RLS models, two
  stock ledgers, and unclear ownership for transactions.
- A read-only API bridge is acceptable for short-term visibility, but it should
  not become the permanent Inventory system of record.

## Owner decisions locked on 2026-05-26

These are now target-contract decisions, not open questions:

1. Map `matu-platform.warehouses` into `comtammatu.inventory_locations`.
2. Replace the current `ingredients` domain with the `materials` domain.
3. Adopt `stock_lots` and FEFO in the first replacement cutover.
4. Migrate real data from `matu-platform`, not just the seed/domain design.

Implementation consequences:

- Every source UUID must be mapped to a target BIGINT or target natural key.
- `inventory_locations` remains the physical storage-location table in
  `comtammatu`; do not introduce a separate production `warehouses` table unless
  a future decision reverses this plan.
- User-facing Inventory should move toward `materials`, but dependent
  POS/KDS/order code must get compatibility views or staged refactors while
  current `ingredient_id` references are retired.
- FEFO changes the stock consumption contract. GRN, transfer send/receive,
  production consumption, POS consumption, stock counts, and adjustments must all
  pick or preserve lots consistently.
- Real-data migration requires a rehearsal import and reconciliation report
  before any production cutover.

## Evidence checked

### Current comtammatu contract

- Canonical route is `/inventory`; `/admin/inventory/*` is retired and mapped to
  an ACL-blocked `inventory_admin` module.
- ACL source of truth is `packages/shared/src/auth/module-acl.ts`.
- Route resolution source of truth is
  `packages/shared/src/auth/route-resolution.ts`.
- Current Inventory DB model includes:
  - `ingredients`
  - `inventory_locations`
  - `stock_levels`
  - `stock_movements`
  - `goods_received_notes` / `grn_items`
  - `purchase_orders` / `purchase_order_items`
  - `stock_transfers` / `stock_transfer_items`
  - `stocktake_sessions` / `stocktake_lines`
  - `production_orders` / `production_order_items`
  - `production_recipes`
  - `suppliers`
- Current reference doc keeps a WAC/location stock model and explicitly defers
  lot/FEFO semantics.
- Branch model already has `central_warehouse`, `central_kitchen`, and `branch`
  direction rules.

### matu-platform Inventory contract

- Main route tree:
  - `/inventory`
  - `/inventory/materials`
  - `/inventory/recipes`
  - `/inventory/suppliers`
  - `/inventory/warehouses`
  - `/inventory/purchase-orders`
  - `/inventory/receipts`
  - `/inventory/requisitions`
  - `/inventory/transfers`
  - `/inventory/production`
  - `/inventory/counts`
  - `/inventory/adjustments`
  - `/inventory/settings`
- Data model includes richer operating concepts:
  - `warehouses`
  - `materials`
  - `material_categories`
  - `stock_items`
  - `stock_lots`
  - `stock_lot_locations`
  - `inventory_requisitions`
  - `goods_receipts`
  - `recipes` / `recipe_items`
  - `stock_count_sessions` / `stock_count_items`
- Important RPCs/functions include:
  - `warehouse_stock`
  - `create_inventory_requisition`
  - `approve_inventory_requisition`
  - `sync_inventory_requisition_from_transfer`
  - `create_transfer`
  - `send_transfer`
  - `receive_transfer`
  - `post_goods_receipt`
  - `start_stock_count`
  - `complete_stock_count`
  - `can_access_warehouse`
  - `can_manage_warehouse`
- Product docs define the intended operating model:
  - Branches request stock through requisitions.
  - Central warehouse approves into exactly one linked draft transfer.
  - Requisitions do not mutate stock.
  - Transfer send/receive, production, counts, GRNs, and adjustments are the
    mutation points.
- No ready-made Inventory API route exists in `matu-platform`; Inventory pages
  mostly call Supabase directly from server code/actions.

## Schema comparison

| Area | comtammatu now | matu-platform | Migration implication |
| --- | --- | --- | --- |
| Primary IDs | BIGINT identity | UUID | Cannot copy rows directly; need deterministic mapping tables. |
| Location model | `inventory_locations` under branches | `warehouses` with `kind`, including kitchen semantics | Chosen: map source warehouses into target `inventory_locations`. |
| Item catalog | `ingredients` | `materials`, `material_categories`, units | Chosen: `materials` replaces `ingredients`; dependent code needs adapters/refactor. |
| Stock ledger | `stock_levels`, `stock_movements`; WAC model | `stock_items`, `stock_lots`, `stock_lot_locations`, movements | Chosen: adopt lots/FEFO in first cutover. |
| Requisitions | Not equivalent in current model | First-class branch request flow | High-value feature to port. |
| GRN | `goods_received_notes` | `goods_receipts` | Similar workflow, different naming and posting contracts. |
| Stock counts | `stocktake_sessions`, `stocktake_lines` | `stock_count_sessions`, `stock_count_items` | Can map, but completion RPC semantics must be compared. |
| Permissions | Role/module ACL | PBAC permission codes | Must translate into `module-acl.ts` and current auth claims. |
| UI scope | URL/proxy/JWT; no localStorage scope | Several Inventory surfaces use localStorage for filters/drafts | Must remove/adapt localStorage scope before porting. |
| Error handling | Must not expose raw DB error messages | Some source actions/pages return `error.message` | Must sanitize server action/API errors during port. |

## Option A: Replace/import Inventory into comtammatu

This is the recommended production path.

### Target shape

- Keep `/inventory` as the canonical route.
- Do not revive `/admin/inventory/*`.
- Keep `comtammatu` auth, ACL, tenant/branch, audit, and route contracts.
- Adopt the `matu-platform` Inventory operating model where it improves the
  product:
  - materials/catalog
  - warehouses/storage locations
  - branch requisitions
  - linked transfers
  - goods receipts
  - production
  - stock counts
  - adjustments
  - supplier management
- Adopt lot-level stock with FEFO in the first cutover.

### Chosen mapping contract

#### Locations

Source:

- `matu-platform.warehouses`
- UUID primary key
- `kind` is `warehouse | kitchen`
- `branch_id` may be `null` for central inventory locations

Target:

- `comtammatu.inventory_locations`
- BIGINT identity primary key
- Required `tenant_id` and `branch_id`
- `location_kind` currently supports `warehouse`, `kitchen`, `receiving`, and
  `production_storage`

Mapping rules:

- Create a migration mapping table such as
  `inventory_migration_location_map(source_warehouse_id uuid/text, target_location_id bigint)`.
- Source `warehouse.kind = 'warehouse'` maps to
  `inventory_locations.location_kind = 'warehouse'`.
- Source `warehouse.kind = 'kitchen'` maps to
  `inventory_locations.location_kind = 'kitchen'` unless the matched target
  branch is `central_kitchen`, where `production_storage` may be used to
  preserve existing production semantics.
- Source central warehouses with `branch_id is null` must map to a
  `comtammatu.branches` row with `branch_kind = 'central_warehouse'` or
  `central_kitchen` before an `inventory_locations` row can be created.
- Do not expose `warehouse` vs `kitchen` as two unrelated user concepts; keep it
  as workflow metadata.

#### Materials

Source:

- `matu-platform.materials`
- `material_categories`
- UUID primary key
- `kind = raw | semi_finished`
- base unit, purchase unit, purchase-to-base factor, cost, min stock

Target:

- Replace `comtammatu.ingredients` as the long-term domain.
- Keep compatibility only where existing POS/KDS/order/recipe code still
  depends on `ingredient_id`.

Mapping rules:

- Create a source material to target material mapping table.
- Preserve source SKU/code where possible; generate deterministic fallbacks only
  for collisions.
- Map `material.kind = raw` to raw inventory material.
- Map `material.kind = semi_finished` to production/output material.
- Preserve purchase/base unit conversion because FEFO lots and costing depend on
  base units.
- Create compatibility views or staged adapters before dropping/renaming old
  `ingredients` references.

#### Lots and FEFO

Source:

- `stock_lots`
- `stock_lot_locations`
- `stock_movements.lot_id`
- FEFO helpers such as `pick_lots_fefo`

Target:

- Add lot tables and lot-aware movement contracts to `comtammatu`.
- Existing `stock_levels` can remain as an aggregate cache only if it is kept in
  sync from lot-aware movements.

Mapping rules:

- Preserve source lot identity in a mapping table; target PK can remain BIGINT
  or be UUID only if the whole Inventory schema decision explicitly allows it.
- Preserve `code`, `received_at`, `expires_at`, `initial_quantity`,
  `remaining_quantity`, `unit_cost`, `status`, and source document references.
- `stock_lot_locations` quantities become the authoritative per-location
  on-hand stock.
- FEFO order is `expires_at asc nulls last`, then `received_at asc`, then stable
  lot identity.
- Negative movements must pick lots through the FEFO helper unless the workflow
  explicitly pins a lot.
- Transfer receive must preserve the source lot's expiry and cost.

### Work plan

1. Freeze current Inventory contract.
   - Snapshot current `/inventory` route tree.
   - Snapshot generated DB types and current migrations touching Inventory.
   - Classify current tables as keep, replace, map, archive, or delete.

2. Finalize the schema baseline for the chosen strategy.
   - Map source `warehouses` into target `inventory_locations`.
   - Replace `ingredients` with the `materials` domain.
   - Add `stock_lots`, `stock_lot_locations`, lot-aware `stock_movements`, and
     FEFO helper/RPC contracts.
   - Add compatibility views/adapters for dependent POS/KDS/order code before
     removing old `ingredient_id` paths.

3. Port database contracts.
   - Add migration files only; do not apply to production directly.
   - Port/rename RPCs into `comtammatu` naming and tenant/branch constraints.
   - Replace PBAC assumptions with current role/module ACL rules.
   - Ensure all multi-item writes go through RPCs.
   - Add pgTAP or SQL regression tests for branch visibility and stock mutation
     boundaries.

4. Build data migration.
   - Create source-to-target mapping tables for IDs.
   - Map `warehouses` into `inventory_locations`.
   - Map `materials` into the replacement material catalog.
   - Map opening balances from `stock_lots` / `stock_lot_locations` into the
     new lot-aware ledger.
   - Map suppliers, recipes, purchase orders, goods receipts, transfers, and
     counts in dependency order.
   - Treat `matu-platform` real data as the source import, while still auditing
     existing `comtammatu` production data before overwrite/archive rules.

5. Port server actions and UI.
   - Rebuild against the `comtammatu` design system and shadcn primitives.
   - Remove localStorage-backed scope. Scope must remain URL/proxy/JWT based.
   - Replace raw `error.message` exposure with safe user messages and server
     logging.
   - Keep app copy aligned with the simplified "Kho/Bếp are storage locations"
     terminology while preserving backend workflow kinds where needed.

6. Cut over by route.
   - Start with read-only catalog/location pages.
   - Then requisitions and transfers.
   - Then GRN/purchase orders.
   - Then stock counts and adjustments.
   - Then production recipes/orders.
   - Keep old pages reachable only if they are explicitly needed for audit or
     migration comparison.

7. Verification gates.
   - `pnpm typecheck`
   - `pnpm lint`
   - `pnpm build`
   - Inventory SQL/RPC tests.
   - Focused route smoke for `/inventory/*`.
   - End-to-end stock flow:
     supplier receipt -> stock available -> branch requisition -> central
     approval -> transfer send -> branch receive -> POS consumption -> reports.

## Option B: matu-platform API/connect bridge

This is viable only as a temporary read-only bridge unless a separate product
decision makes `matu-platform` the long-term Inventory backend.

### Acceptable bridge

- Add explicit Inventory API routes in `matu-platform`.
- Use server-to-server authentication, never browser-side direct access to the
  other Supabase project.
- Return normalized read models:
  - locations
  - materials
  - stock summaries
  - suppliers
  - requisition status
  - transfer status
- Cache in `comtammatu` if needed for dashboard responsiveness.
- Show bridge data in `comtammatu` as external/read-only unless write ownership
  is fully designed.

### Not recommended

- Direct browser access from `comtammatu` to the `matu-platform` Supabase client.
- Sharing service-role keys between apps.
- FDW/dblink as the primary production integration.
- Sending write operations from `comtammatu` into `matu-platform` without a
  complete transaction/audit/auth contract.

### Bridge work plan

1. Define read-only API contract in `matu-platform`.
2. Add server-to-server auth and rate limits.
3. Add API response schemas and integration tests.
4. Add `comtammatu` server-side connector module.
5. Render bridge data under an explicit "external source" state.
6. Use the bridge to validate data and workflows before the real migration.

## Recommended phase plan

### Phase 0: live evidence

- Query both dev/test databases for live Inventory row counts and representative
  rows.
- Confirm which `matu-platform` data is seed/demo and which is real operational
  data.
- Confirm whether `comtammatu` production already has Inventory data that must
  be preserved.

Exit criteria:

- Table-by-table data classification exists.
- Owner signs off on data authority: `matu-platform`, `comtammatu`, or merge.

### Phase 1: domain contract decision

Already decided:

- Adopt lot-level stock and FEFO now.
- Map `warehouses` into `inventory_locations`.
- Replace `ingredients` with `materials`.
- Migrate real data from `matu-platform`.

Still decide before writing migrations:

- Are requisitions mandatory for first cutover?
- Which roles can approve, send, receive, adjust, and count stock?
- Will target Inventory tables use BIGINT consistently, or will the lot/material
  subset keep UUIDs with compatibility adapters?
- What is the production archive policy for old `ingredients`, `stock_levels`,
  and non-lot `stock_movements`?

Exit criteria:

- One written schema target.
- One permission matrix.
- One end-to-end stock flow.

### Phase 2: prototype replacement in dev

- Add new migrations in `comtammatu`.
- Apply only to approved dev/test Supabase.
- Run `pnpm db:types` after schema application.
- Port the lowest-risk read surfaces first:
  - locations
  - materials
  - stock summary
  - suppliers

Exit criteria:

- Typecheck, lint, build pass.
- Read-only pages work under current auth/scope.

### Phase 3: operational writes

- Port RPC-backed mutation flows:
  - requisition create/approve
  - transfer create/send/receive
  - goods receipt post
  - stock count complete
  - adjustment post
  - production post
- Add server action validation with Zod.
- Add branch/RLS regression coverage.

Exit criteria:

- No multi-item write bypasses RPC.
- No raw database errors reach clients.
- Stock ledger balances reconcile after each flow.

### Phase 4: data migration rehearsal

- Import source data into dev/test.
- Reconcile counts and opening balances.
- Run stock movement flow after import.
- Produce rollback/archive instructions.

Exit criteria:

- Rehearsal import is repeatable.
- Diff report shows expected table counts and balance totals.

### Phase 5: cutover

- Freeze Inventory writes for the cutover window.
- Run final export/import.
- Run smoke tests.
- Keep old Inventory tables read-only or archived until audit sign-off.

Exit criteria:

- `/inventory` route family serves the new model.
- POS/KDS/order stock consumption still works.
- Owner signs off on reconciliation.

## Immediate next tasks

1. Produce table-by-table inventory data classification for both repos.
2. Query dev/test Supabase projects for real row counts, not just generated
   types and seed files.
3. Draft the first concrete migration design for:
   - `materials`
   - `material_categories`
   - `stock_lots`
   - `stock_lot_locations`
   - lot-aware stock movement/RPC changes
   - source-to-target mapping tables
4. Draft the data import order and reconciliation report format.
5. Draft a read-only bridge API contract only if the owner wants immediate
   visibility before replacement work lands.
6. Run the 4-agent debate before implementation begins, because this will be a
   feature/refactor with database and UI impact.

## Open questions

- Which environment is the approved dev/test Supabase target for applying the
  first replacement migrations?
- Is a temporary read-only bridge needed, or can we go straight to replacement
  in `comtammatu`?
- Are requisitions required in the first cutover, or can they land after
  materials/locations/lots are migrated?
- Which existing `comtammatu` Inventory data, if any, must be preserved,
  archived, or merged with `matu-platform` real data?
- Should target lot/material tables use BIGINT for consistency with
  `comtammatu`, or preserve UUIDs for migration fidelity?
