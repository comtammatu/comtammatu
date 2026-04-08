# UI Audit Map - Unified Redesign

Updated: 2026-04-09

## Scope and conventions

- App surfaces are grouped by domain under `apps/web/app`.
- Shared design primitives live in `packages/ui/src/components`.
- Priority:
  - `P0`: direct daily operation and high-frequency screens.
  - `P1`: high-complexity backoffice surfaces.
  - `P2`: polish and secondary surfaces.

## Domain inventory

### Auth (`P0`)

- Routes and files:
  - `apps/web/app/(auth)/login/page.tsx`
  - `apps/web/app/(auth)/login/login-form.tsx`
  - `apps/web/app/(auth)/login/actions.ts`
- Risks:
  - Visual style is more standalone than operational surfaces.
  - Needs token-level alignment for typography, spacing, and interaction states.

### Branch POS (`P0`)

- Routes and files:
  - `apps/web/app/br/[branchId]/pos/layout.tsx`
  - `apps/web/app/br/[branchId]/pos/page.tsx`
  - `apps/web/app/br/[branchId]/pos/pos-menu.tsx`
  - `apps/web/app/br/[branchId]/pos/cart-sidebar.tsx`
  - `apps/web/app/br/[branchId]/pos/item-customizer.tsx`
  - `apps/web/app/br/[branchId]/pos/order-detail-sheet.tsx`
  - `apps/web/app/br/[branchId]/pos/order-history.tsx`
  - `apps/web/app/br/[branchId]/pos/session-gate.tsx`
  - `apps/web/app/br/[branchId]/pos/pos-table-gate.tsx`
  - `apps/web/app/br/[branchId]/pos/close-session-dialog.tsx`
  - `apps/web/app/br/[branchId]/pos/bill-receipt.tsx`
- Risks:
  - Touch-first targets and dense interaction states can drift from shared primitives.
  - Mixed custom classes and shared components can break consistency.

### Branch KDS (`P0`)

- Routes and files:
  - `apps/web/app/br/[branchId]/kds/layout.tsx`
  - `apps/web/app/br/[branchId]/kds/page.tsx`
  - `apps/web/app/br/[branchId]/kds/kds-board.tsx`
  - `apps/web/app/br/[branchId]/kds/order-card.tsx`
- Risks:
  - Forced dark mode and raw palette usage (`zinc/amber/emerald`) diverge from semantic tokens.
  - Repeated status/urgency visuals need one source of truth.

### Admin core (`P1`)

- Routes and files:
  - `apps/web/app/admin/layout.tsx`
  - `apps/web/app/admin/components/admin-shell.tsx`
  - `apps/web/app/admin/components/empty-state-panel.tsx`
  - `apps/web/app/admin/components/table-empty-state-row.tsx`
  - `apps/web/app/admin/dashboard/page.tsx`
  - `apps/web/app/admin/menu/page.tsx`
  - `apps/web/app/admin/orders/page.tsx`
  - `apps/web/app/admin/hr/page.tsx`
  - `apps/web/app/admin/staff/page.tsx`
  - `apps/web/app/admin/finance/page.tsx`
  - `apps/web/app/admin/reports/page.tsx`
  - `apps/web/app/admin/crm/page.tsx`
- Risks:
  - Page-level heading/spacing rhythm is not yet fully standardized.
  - Empty/filter/table patterns vary by feature module.

### Admin settings (`P1`)

- Routes and files:
  - `apps/web/app/admin/settings/layout.tsx`
  - `apps/web/app/admin/settings/settings-nav.tsx`
  - `apps/web/app/admin/settings/general/page.tsx`
  - `apps/web/app/admin/settings/branches/page.tsx`
  - `apps/web/app/admin/settings/areas/page.tsx`
  - `apps/web/app/admin/settings/tables/page.tsx`
  - `apps/web/app/admin/settings/payments/page.tsx`
  - `apps/web/app/admin/settings/pos/page.tsx`
  - `apps/web/app/admin/settings/kds/page.tsx`
- Risks:
  - Dialog/form/table sizing and spacing can drift across submodules.
  - State messaging and validation visuals are not fully unified.

### Admin inventory (`P1`)

- Routes and files:
  - `apps/web/app/admin/inventory/layout.tsx`
  - `apps/web/app/admin/inventory/inventory-sub-nav.tsx`
  - `apps/web/app/admin/inventory/page.tsx`
  - `apps/web/app/admin/inventory/suppliers/page.tsx`
  - `apps/web/app/admin/inventory/recipes/page.tsx`
  - `apps/web/app/admin/inventory/branch-ingredients/page.tsx`
  - `apps/web/app/admin/inventory/grn/page.tsx`
  - `apps/web/app/admin/inventory/purchase-orders/page.tsx`
  - `apps/web/app/admin/inventory/transfers/page.tsx`
  - `apps/web/app/admin/inventory/supplier-invoices/page.tsx`
- Risks:
  - Highest data density with many list/detail flows.
  - Layout hierarchy differs from settings, reducing cross-area consistency.

### Employee (`P2`)

- Routes and files:
  - `apps/web/app/employee/layout.tsx`
  - `apps/web/app/employee/page.tsx`
- Risks:
  - Narrow layout is intentional, but style language must still match global system.

## Shared UI foundation

- Core package:
  - `packages/ui/src/components/*`
  - `packages/ui/src/lib/utils.ts`
  - `packages/ui/src/index.ts`
- App-level tokens and global styles:
  - `apps/web/app/globals.css`
  - `docs/spec/design-system.md`

## Rollout order reference

1. `P0`: KDS + POS + Login
2. `P1`: Admin shell, settings, inventory
3. `P2`: Employee and cross-surface polish
