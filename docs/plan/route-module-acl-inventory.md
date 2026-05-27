# Route Module ACL Inventory

> Status: BASELINE PREP
> Date: 2026-05-26
> Scope: `apps/web/app` route tree, proxy routing, module ACL, and action/RLS
> guard model.

This inventory is for the next-project baseline package. It is not a UI rebuild
plan and does not change the active pilot runtime.

## Source Files

| Contract | Source |
| --- | --- |
| Route tree | `apps/web/app/**/{page.tsx,route.ts}` |
| Proxy perimeter | `apps/web/proxy.ts` |
| Path to module resolution | `packages/shared/src/auth/route-resolution.ts` |
| Route-level role ACL | `packages/shared/src/auth/module-acl.ts` |
| Permission catalog | `packages/shared/src/auth/permissions.ts` |
| Action auth wrapper | `apps/web/app/_lib/auth.ts`, `apps/web/app/_lib/with-action.ts` |
| Navigation surfaces | `packages/shared/src/auth/nav-config.ts` |

## Snapshot

| Area | Count |
| --- | ---: |
| Total routes/handlers scanned | 124 |
| Pages | 109 |
| Route handlers | 15 |
| Module-mapped routes/handlers | 104 |
| System/public/route-local handlers | 20 |

## Gate Model

1. Public app paths bypass session auth through `isPublicAppPath()`.
2. `proxy.ts` refreshes/reads the session and decodes JWT claims from the access
   token.
3. Retired route redirect runs before login/page ACL. Current redirect:
   `/admin/finance/*` -> `/finance/*`.
4. `resolveModuleFromPath()` maps URL path to `ModuleKey`.
5. `MODULE_ACL[moduleKey].allowedRoles` gates route access.
6. `inventory_procurement` also requires `procurement:read` in the proxy.
7. POS/KDS/Runner/branch settings/menu limits enforce URL branch scope.
8. POS/KDS/Runner additionally require an operational branch and production
   network gate when `POS_NETWORK_GATE` is not `off`.
9. Server Actions and RLS are the authoritative data/write gate through
   `has_permission` / `has_permission_any`.

## Module Summary

| Module | Count | Route families | Route ACL roles | Extra route gate | Baseline decision |
| --- | ---: | --- | --- | --- | --- |
| System / public / API-local | 20 | `/`, `/login`, `/access-denied`, `/payment/momo`, `/r/*`, `/api/*` | N/A | Route-local bearer/signature/session/env guards | Keep only explicit system endpoints; keep debug claims dev-only |
| `dashboard` | 2 | `/admin`, `/admin/dashboard` | owner, super_manager | `/admin` redirects to dashboard | Keep |
| `accounting` | 1 | `/admin/accounting/periods` | owner, super_manager | action-level period reopen permission | Keep if Finance close/reopen stays in pilot scope |
| `crm` | 1 | `/admin/crm` | owner, super_manager | action/RLS | Review before greenfield scope lock |
| `feedback` | 4 | `/admin/feedback/*` | owner, super_manager, area_manager, branch_manager | feedback permissions inside actions | Keep |
| `reports` | 4 | `/admin/reports/*` | owner, super_manager | action/RLS | Review for overlap with Finance/Inventory reports |
| `settings` | 10 | `/admin/settings/*` | owner, super_manager, area_manager, branch_manager | settings permissions inside actions | Keep, but split tenant vs branch settings clearly |
| `staff` | 3 | `/admin/staff/*` | owner, super_manager | staff permissions inside actions | Keep |
| `branch_settings` | 6 | `/br/[branchId]/settings/*` | owner, super_manager, area_manager, branch_manager | branch scope; owner/super/area cross-branch allowed | Keep |
| `branch_menu_limits` | 1 | `/br/[branchId]/menu-limits` | owner, super_manager, area_manager, branch_manager, cashier, chef | branch scope; owner/super/area cross-branch allowed | Keep |
| `pos` | 2 | `/br/[branchId]/pos`, manifest | cashier, waiter, branch_manager | branch scope, operational branch, network gate | Keep PWA-first |
| `kds` | 2 | `/br/[branchId]/kds`, manifest | chef, branch_manager | branch scope, operational branch, network gate | Keep |
| `runner` | 1 | `/br/[branchId]/runner` | cashier, waiter, chef, branch_manager | branch scope, operational branch, network gate | Keep |
| `employee` | 8 | `/employee/*` | all staff roles | action/RLS | Keep |
| `finance` | 13 | `/finance/*` | owner, super_manager | finance permissions inside actions | Keep; pilot first screen remains basic |
| `hr` | 3 | `/hr/*` | owner, super_manager | HR/payroll permissions inside actions | Keep if payroll/HR stays in scope |
| `inventory` | 24 | `/inventory`, stock, stocktake, transfers, issues, waste, supplier returns | owner, super_manager, area_manager, branch_manager, warehouse_manager, production_manager | action/RLS | Keep after POS inventory contract is resolved |
| `inventory_procurement` | 16 | ingredients, suppliers, PO, GRN, supplier invoices, recipes, receiving, settings | owner, super_manager, warehouse_manager, production_manager | proxy requires `procurement:read` | Keep as separate procurement lane |
| `menu` | 1 | `/menu` | owner, super_manager, area_manager, branch_manager | menu permissions inside actions | Keep |
| `notifications` | 1 | `/notifications` | all staff roles | action/RLS | Keep |
| `orders` | 1 | `/orders` | owner, super_manager, area_manager, branch_manager, cashier | order permissions inside actions | Keep |

## Retired URL Space

| URL | Current behavior | Greenfield decision |
| --- | --- | --- |
| `/admin/finance/*` | Redirects to `/finance/*` in both proxy return-to handling and route page | Keep only as a temporary external-link redirect if old QR/bookmarks/admin docs still point here |
| `/admin/inventory/*` | No active pages; resolves to `inventory_admin` with no allowed roles | Do not recreate in greenfield |

## System And API Route Inventory

| Route | Handler/page | Gate |
| --- | --- | --- |
| `/` | page | authenticated; redirects by role default |
| `/login` | page | public login; authenticated users bounce to default/returnTo |
| `/access-denied` | page | public blocked-state display |
| `/payment/momo/return` | page | public provider return |
| `/r/[token]` | page | public feedback QR token validation |
| `/r/[token]/thank-you` | page | public feedback token validation |
| `/api/health` | handler | public health |
| `/api/webhooks/momo` | handler | public path; MoMo signature/extraData binding inside handler |
| `/api/auth/signout` | handler | session sign-out + IP rate limit |
| `/api/ai/enrich-feedback` | handler | bearer `CRON_SECRET` |
| `/api/branch-presence` | handler | print-agent bearer token, SHA-256 registry, RPC |
| `/api/debug/claims` | handler | non-production + `ENABLE_DEBUG_CLAIMS=true` + `staff:assign_permission` |
| `/api/cron/*` | handlers | bearer `CRON_SECRET` |

## Route Families

| Family | Module | Routes |
| --- | --- | --- |
| Admin cockpit | `dashboard` | `/admin`, `/admin/dashboard` |
| Admin accounting | `accounting` | `/admin/accounting/periods` |
| Admin CRM | `crm` | `/admin/crm` |
| Admin feedback | `feedback` | `/admin/feedback`, `/admin/feedback/qr`, `/admin/feedback/reports`, `/admin/feedback/settings` |
| Admin reports | `reports` | `/admin/reports`, `/admin/reports/inventory-value`, `/admin/reports/revenue`, `/admin/reports/stock-movement` |
| Admin settings | `settings` | `/admin/settings`, `/admin/settings/areas`, `/admin/settings/branches`, `/admin/settings/general`, `/admin/settings/kds`, `/admin/settings/payments`, `/admin/settings/pos`, `/admin/settings/printers`, `/admin/settings/printers/jobs`, `/admin/settings/tables` |
| Admin staff | `staff` | `/admin/staff`, `/admin/staff/[id]/permissions`, `/admin/staff/audit` |
| Branch operations | `pos`, `kds`, `runner` | `/br/[branchId]/pos`, `/br/[branchId]/pos/manifest.webmanifest`, `/br/[branchId]/kds`, `/br/[branchId]/kds/manifest.webmanifest`, `/br/[branchId]/runner` |
| Branch configuration | `branch_settings`, `branch_menu_limits` | `/br/[branchId]/settings`, `/br/[branchId]/settings/kds`, `/br/[branchId]/settings/pos`, `/br/[branchId]/settings/pos-sessions`, `/br/[branchId]/settings/printers`, `/br/[branchId]/settings/tables`, `/br/[branchId]/menu-limits` |
| Employee self-service | `employee` | `/employee`, `/employee/attendance`, `/employee/clock`, `/employee/payslip`, `/employee/permissions`, `/employee/profile`, `/employee/schedule`, `/employee/shift-register` |
| Finance | `finance` | `/finance`, `/finance/audit-trail`, `/finance/chart-of-accounts`, `/finance/food-cost`, `/finance/invoices`, `/finance/journal`, `/finance/periods`, `/finance/posting-rules`, `/finance/reconciliation`, `/finance/revenue`, `/finance/revenue/[date]`, `/finance/statements`, `/finance/summary` |
| HR | `hr` | `/hr`, `/hr/payroll`, `/hr/payroll/[periodId]` |
| Inventory operations | `inventory` | `/inventory`, `/inventory/dashboard`, `/inventory/drafts`, `/inventory/expiry`, `/inventory/issues`, `/inventory/issues/[id]`, `/inventory/production`, `/inventory/reports`, `/inventory/stock`, `/inventory/stocktake`, `/inventory/stocktake/[id]`, `/inventory/stocktake/[id]/count`, `/inventory/stocktake/[id]/escalate`, `/inventory/stocktake/conflicts`, `/inventory/stocktake/new`, `/inventory/supplier-returns`, `/inventory/supplier-returns/[id]`, `/inventory/supplier-returns/new`, `/inventory/transfers`, `/inventory/transfers/[id]`, `/inventory/transfers/[id]/receive`, `/inventory/waste/approvals`, `/inventory/waste/auto`, `/inventory/waste/new` |
| Inventory procurement | `inventory_procurement` | `/inventory/ingredients`, `/inventory/settings`, `/inventory/settings/expiry`, `/inventory/settings/qc`, `/inventory/settings/thresholds`, `/inventory/suppliers`, `/inventory/purchase-orders`, `/inventory/purchase-orders/[id]`, `/inventory/purchase-orders/new`, `/inventory/grn`, `/inventory/grn/[id]`, `/inventory/grn/new`, `/inventory/grn/new/[supplierId]`, `/inventory/supplier-invoices`, `/inventory/recipes`, `/inventory/receiving` |
| Menu | `menu` | `/menu` |
| Orders | `orders` | `/orders` |
| Notifications | `notifications` | `/notifications` |

## Findings For Greenfield Baseline

1. `MODULE_ACL` is still role-first. Greenfield should keep route-level
   fast-fail but make permission/scope the target authority, matching the
   architecture blend decision.
2. `inventory_procurement` is the only module with a proxy-level permission
   check. That is a useful target pattern for high-risk module entry points.
3. POS/KDS/Runner already have the strongest perimeter: role ACL, branch match,
   operational branch kind, and optional production network gate.
4. Public feedback and MoMo webhook routes are intentionally outside module ACL.
   Their security contract is token/signature/body validation plus service-role
   constrained writes.
5. Cron/API routes need secret inventory in the next data-audit phase:
   `CRON_SECRET`, MoMo credentials, print-agent presence tokens, feedback host
   split, and provider callbacks.
6. `/admin/finance/*` and `/admin/inventory/*` are not greenfield surfaces.
   Treat them as redirect/block history only.
7. Inventory route count is the largest area. Before schema baseline work,
   resolve the POS stock/ledger contract and then decide which Inventory routes
   are pilot-critical versus later-stage.

## Next Inputs Needed

- Data-audit classification for every table, storage bucket, external provider
  ID, cron secret, and branch-device registry row.
- Owner decision on the POS payment/stock mutation contract.
- Route consolidation decision for reports, CRM, and advanced Finance surfaces
  before a clean greenfield route tree is generated.
