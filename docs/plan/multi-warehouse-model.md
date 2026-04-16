# Multi-Warehouse Inventory Model

> Status: **APPROVED** — 2026-04-16
> Scope: Inventory multi-warehouse, new roles, location-based ledger, transfer matrix rewrite

## Context

Current inventory model is single-warehouse (HQ-only procurement, limited transfer directions, no intra-branch location tracking). Need multi-warehouse model for scaling:

- **Kho Tổng** (warehouse) — multiple, by region. Can procure from NCC + transfer to any site.
- **Bếp Trung Tâm** (central_kitchen) — multiple, by region. Can procure, produce, transfer. Has its own stock.
- **Kho Chi Nhánh** (branch warehouse) — per branch. Receives transfers, issues to kitchen.
- **Kho Bếp/Bar** (branch kitchen) — per branch. Consumes for POS orders.

**Decisions:**
1. Rename `headquarters` → `warehouse` in `branch_kind`
2. Two new roles: `warehouse_manager` + `production_manager`
3. Intra-branch transfer (Kho CN ↔ Kho Bếp): simplified `draft → received` via `stock_transfers`
4. Implement all at once
5. Bếp TT has its own stock (already works — stock_levels keyed by branch_id)
6. Area scoping: warehouse/central_kitchen linked to area_id

---

## Part 1: Database Migrations

> User applies manually after PR merge. Write files to `supabase/migrations/`.

### Migration A: `YYYYMMDD_multi_warehouse_roles_and_schema.sql`

**1. New roles**
```sql
ALTER TYPE staff_role ADD VALUE 'warehouse_manager';
ALTER TYPE staff_role ADD VALUE 'production_manager';
```

**2. Rename `headquarters` → `warehouse`**
```sql
-- Relax CHECK, update data, re-tighten
ALTER TABLE branches DROP CONSTRAINT IF EXISTS branches_branch_kind_check;
UPDATE branches SET branch_kind = 'warehouse' WHERE branch_kind = 'headquarters';
ALTER TABLE branches ADD CONSTRAINT branches_branch_kind_check
  CHECK (branch_kind IN ('warehouse', 'branch', 'central_kitchen'));
```

**3. Remove single-central-kitchen constraint (allow multiple)**
```sql
DROP INDEX IF EXISTS idx_one_active_central_kitchen_per_tenant;
```

**4. Update sync trigger** — `is_headquarters` stays but syncs with `warehouse`:
```sql
-- is_headquarters = (branch_kind = 'warehouse') for backward compat
-- Old code reading is_headquarters will see ALL warehouses as "headquarters"
CREATE OR REPLACE FUNCTION sync_branch_kind_and_hq() ...
  NEW.is_headquarters = (NEW.branch_kind = 'warehouse');
```

**5. Relax area_id constraint** — allow `warehouse_manager` and `production_manager` to have area_id:
```sql
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS chk_area_id_for_area_manager;
ALTER TABLE profiles ADD CONSTRAINT chk_area_id_scope CHECK (
  role IN ('area_manager','warehouse_manager','production_manager')
  OR area_id IS NULL
);
```

**6. Relax operational role restriction on warehouse branches:**
- Current: operational roles (cashier, waiter, chef) blocked from HQ branches
- New: `warehouse_manager` and `production_manager` CAN be assigned to warehouse/central_kitchen

### Migration B: `YYYYMMDD_multi_warehouse_locations_and_rpcs.sql`

**1. Seed 2 locations per `branch` kind** (warehouse + kitchen):
```sql
-- For each branch with branch_kind = 'branch' that has only 1 location:
INSERT INTO inventory_locations (tenant_id, branch_id, code, name, location_kind,
  is_default_receive, is_default_issue, is_default_consumption)
SELECT tenant_id, id, 'kitchen', 'Kho Bếp', 'kitchen',
  false, false, true  -- consumption default
FROM branches WHERE branch_kind = 'branch'
  AND NOT EXISTS (SELECT 1 FROM inventory_locations il
    WHERE il.branch_id = branches.id AND il.location_kind = 'kitchen');

-- Update existing warehouse location: clear is_default_consumption
UPDATE inventory_locations
SET is_default_consumption = false
WHERE location_kind = 'warehouse'
  AND EXISTS (SELECT 1 FROM inventory_locations il2
    WHERE il2.branch_id = inventory_locations.branch_id
      AND il2.location_kind = 'kitchen');
```

**2. Backfill `location_id`** in stock_levels, stock_movements from default locations.

**3. Update RPCs:**

| RPC | Change |
|-----|--------|
| `enforce_po_branch_is_headquarters()` | → `branch_kind IN ('warehouse','central_kitchen')` |
| `confirm_goods_receipt_note()` | → same check |
| `enforce_transfer_from_hq()` trigger | → DROP (all directions allowed) |
| `create_stock_transfer_draft()` | → support `from_branch_id = to_branch_id` (intra-branch), require location_ids |
| `stock_transfer_confirm_ship()` | → for intra-branch: skip to `received` directly |
| `stock_transfer_receive()` | → location-aware stock updates |
| `confirm_stock_issue()` | → location-aware |
| `complete_stocktake()` | → location-aware |
| `consume_stock_for_order()` | → use `is_default_consumption` location |
| `set_headquarters()` | → rename to `set_branch_kind()` or deprecate |

---

## Part 2: Shared Package Changes

### `packages/shared/src/auth/types.ts`
- Add `'warehouse_manager'` and `'production_manager'` to `STAFF_ROLES`
- Add Vietnamese labels to `ROLE_LABEL_VI`:
  - `warehouse_manager: "Quản lý kho tổng"`
  - `production_manager: "Quản lý sản xuất"`

### `packages/shared/src/auth/inventory-roles.ts`
- `PROCUREMENT_ROLES`: add `warehouse_manager`, `production_manager`
- `INVENTORY_OPS_ROLES`: add `warehouse_manager`, `production_manager`
- `INVENTORY_CATALOG_ROLES`: add `warehouse_manager`, `production_manager`

### `packages/shared/src/auth/module-acl.ts`
- `inventory`: add `warehouse_manager`, `production_manager`
- `inventory_procurement`: add `warehouse_manager`, `production_manager`
- Consider new module key `inventory_production` for Bếp TT (production_manager only)

### `packages/shared/src/labels/vi.ts`
- `SiteKind`: rename `headquarters` → `warehouse`
- Label: `warehouse: "Kho tổng"`, keep `central_kitchen: "Bếp trung tâm"`

---

## Part 3: App Code Changes

### 3.1 Replace `is_headquarters` → `branch_kind` checks

**Critical files (25+ files):**

| File | Change |
|------|--------|
| `inventory/_lib/headquarters.ts` | Rename to `procurement-branches.ts`. `fetchHeadquartersBranchId()` → `fetchProcurementBranches()` returning `{id, name, branch_kind}[]` for `warehouse` + `central_kitchen` |
| `purchase-order-actions.ts` | Accept `branchId` param (warehouse/CK), remove hard-coded HQ |
| `grn-actions.ts` | Same — `createGrnDraft()` accepts `branchId` |
| `transfer-actions.ts` | Rewrite direction validation (see 3.2) |
| `dashboard-client.tsx` | `DashboardSiteKind`: rename `headquarters` → `warehouse` |
| `transfers/create-transfer-dialog.tsx` | Remove HQ-centric UI, allow all directions |
| `transfers/transfers-list-client.tsx` | Remove `hq` branch filtering |
| `production/page.tsx` | Add `production_manager` to allowed roles |
| `production-actions.ts` | Add `production_manager` to `PRODUCTION_ROLES` |
| `admin/settings/branches/` | Replace `is_headquarters` display with `branch_kind` |
| `admin/staff/` | Allow new roles in staff management |
| `proxy.ts` | Update `is_headquarters` references |
| `packages/shared/labels/vi.ts` | SiteKind rename |
| `inventory/_lib/branch-site-labels.ts` | Update labels |

### 3.2 Transfer Direction Matrix

**`transfer-actions.ts` rewrite:**

Replace discriminated union `hq_to_branch | branch_to_hq | branch_to_branch` with:

```typescript
const transferCreateSchema = z.object({
  fromBranchId: z.coerce.number().int().positive(),
  toBranchId: z.coerce.number().int().positive(),
  fromLocationId: z.coerce.number().int().positive().optional(),
  toLocationId: z.coerce.number().int().positive().optional(),
  isIntraBranch: z.boolean().default(false),
  notes: z.string().optional(),
  vehicleInfo: z.string().optional(),
});
```

**Validation rules:**

| From \ To | Kho Tổng | Bếp TT | Kho CN | Kho Bếp |
|-----------|----------|--------|--------|---------|
| Kho Tổng | — | ✅ | ✅ | ❌ |
| Bếp TT | ✅ | — | ✅ | ❌ |
| Kho CN | ✅ | ✅ | — | ✅ (cùng CN) |
| Kho Bếp | ❌ | ❌ | ✅ (cùng CN) | — |

**Intra-branch:** `draft → received` (simplified, no in_transit)

**Role-based access:**

| Role | Access |
|------|--------|
| `warehouse_manager` | Inter-branch transfers for their warehouse |
| `production_manager` | Inter-branch transfers for their central_kitchen |
| `branch_manager` | Inter-branch + intra-branch for their branch |
| `super_manager`/`owner` | All transfers |
| `area_manager` | View only (transfers within their area) |

### 3.3 PO/GRN Multi-Source

**`purchase-order-actions.ts`:**
- `createPurchaseOrder()`: accept `branchId` parameter
- Validate: `branch_kind IN ('warehouse', 'central_kitchen')`
- Role check: `warehouse_manager` can create for their warehouse, `production_manager` for their CK

**`grn-actions.ts`:**
- `createGrnDraft()`: accept `branchId` parameter
- Same validation pattern

### 3.4 Production Page

**`production/page.tsx`:**
- Allow `production_manager` role (currently only `super_manager`)
- `production_manager` scoped to their central_kitchen branch

### 3.5 Intra-Branch Transfer UI

New or extended UI in `/inventory/transfers/`:
- Detect `branch_kind = 'branch'` → show "Cấp bếp" / "Trả kho" buttons
- Simplified form: select ingredients + quantity, confirm
- No vehicle_info, no in_transit step

---

## Part 4: File-by-File Checklist

### Migrations (user applies)
- [ ] `supabase/migrations/YYYYMMDD_multi_warehouse_roles_and_schema.sql`
- [ ] `supabase/migrations/YYYYMMDD_multi_warehouse_locations_and_rpcs.sql`
- [ ] `pnpm db:types` after apply

### Shared packages
- [ ] `packages/shared/src/auth/types.ts` — STAFF_ROLES, ROLE_LABEL_VI
- [ ] `packages/shared/src/auth/inventory-roles.ts` — role groups
- [ ] `packages/shared/src/auth/module-acl.ts` — route permissions
- [ ] `packages/shared/src/auth/blocked-state.ts` — update blocked state
- [ ] `packages/shared/src/labels/vi.ts` — SiteKind rename

### Inventory actions
- [ ] `apps/web/app/inventory/_lib/headquarters.ts` → `procurement-branches.ts`
- [ ] `apps/web/app/inventory/purchase-order-actions.ts`
- [ ] `apps/web/app/inventory/grn-actions.ts`
- [ ] `apps/web/app/inventory/transfer-actions.ts` (major rewrite)
- [ ] `apps/web/app/inventory/issue-actions.ts`
- [ ] `apps/web/app/inventory/production-actions.ts`
- [ ] `apps/web/app/inventory/actions.ts` (stocktake location-aware)

### Inventory pages/components
- [ ] `apps/web/app/inventory/production/page.tsx`
- [ ] `apps/web/app/inventory/page.tsx` (dashboard)
- [ ] `apps/web/app/inventory/dashboard-client.tsx`
- [ ] `apps/web/app/inventory/transfers/create-transfer-dialog.tsx`
- [ ] `apps/web/app/inventory/transfers/transfers-list-client.tsx`
- [ ] `apps/web/app/inventory/transfers/transfers-client.tsx`
- [ ] `apps/web/app/inventory/issues/page.tsx`
- [ ] `apps/web/app/inventory/_lib/branch-site-labels.ts`
- [ ] `apps/web/app/inventory/_lib/branch-kind-schema.ts`
- [ ] `apps/web/app/inventory/_components/inventory-shell.tsx`

### Admin pages
- [ ] `apps/web/app/admin/settings/branches/actions.ts`
- [ ] `apps/web/app/admin/settings/branches/page.tsx`
- [ ] `apps/web/app/admin/settings/branches/branch-table.tsx`
- [ ] `apps/web/app/admin/settings/branches/branch-form-dialog.tsx`
- [ ] `apps/web/app/admin/staff/page.tsx`
- [ ] `apps/web/app/admin/staff/actions.ts`
- [ ] `apps/web/app/admin/staff/staff-table.tsx`

### Auth / Proxy
- [ ] `apps/web/proxy.ts`
- [ ] `packages/shared/src/auth/blocked-state.ts`

### Documentation
- [ ] `docs/ref/inventory.md` — update model description
- [ ] `docs/ref/inventory-sop.md`
- [ ] `docs/spec/database-schema.md`
- [ ] `CLAUDE.md` — update constraints section

---

## Verification

1. `pnpm typecheck` — must pass
2. `pnpm lint` — must pass
3. `pnpm build` — must pass
4. Manual smoke test:
   - Create warehouse branch, assign warehouse_manager
   - Create central_kitchen branch, assign production_manager
   - warehouse_manager creates PO + GRN at their warehouse
   - production_manager creates PO + GRN at their CK
   - Transfer: warehouse → central_kitchen
   - Transfer: central_kitchen → branch
   - Intra-branch: Kho CN → Kho Bếp (draft → received)
   - Intra-branch: Kho Bếp → Kho CN (return)
   - Production order at CK
   - Stocktake per location
   - Dashboard shows correct site kind labels

---

## Implementation Order

Since migrations must be applied before app code can use new columns/RPCs:

1. **Write migration SQL files** (PR → merge → owner applies)
2. **Write shared package changes** (types, roles, labels — can compile without migration)
3. **Write app code changes** (with compat patterns where needed until migration applied)
4. **After migration applied**: `pnpm db:types` → remove compat patterns → verify
