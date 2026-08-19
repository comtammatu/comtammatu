# Web App Module

## Overview

Next.js App Router — two admin/operations planes plus self runtime
(`docs/spec/architecture.md`, ADR 0012):

1. **`Quản lý hệ thống`** — `control_surface` (L0 `/…`, `AppShell`, `App*`)
2. **`Vận hành bán hàng`** — `branch_surface` + `station_chrome` (`/br/[branchId]/…`)
3. **Personal self-service** — `self_surface` (`/me/*`); Owner explicitly excluded

Plus public/auth. Version: package manifest. Route list: runtime + generated matrix.

**Scope:** `apps/web/`

## Current Route Contract

Runtime: `packages/shared/src/auth/route-map.ts`. ACL:
`packages/shared/src/auth/module-acl.ts`. Role/scope/route:
`docs/spec/role-route-matrix.md` (`/*` L0 Owner; BM → `/br/[branchId]/*`).

`(protected)` / `(public)` are URL-neutral. Do not store the filesystem tree in this
doc — use CodeGraph or `rg --files apps/web/app`; regenerate role-route-matrix when
the contract changes.

| Surface | Route family | Entry | Nav / scope |
| --- | --- | --- | --- |
| Root | `/` | Single-branch resolver | `getDefaultRedirect`; multi-branch → picker; wrong scope fails closed |
| Public / auth | `/login`, `/access-denied`, `/br/…/pickup`, health/webhooks | `/login` or pickup display URL | No app shell; pickup page validates branch itself |
| control_surface | L0 `/`, `/menu/*`, `/promotions/*`, `/orders/*`, `/inventory/*`, `/finance/*`, `/hr/*`, `/work/*`, `/branches/*`, `/settings/*`, `/feedback/*` | `/` | `ControlSurfaceShell` → `AppShell`; breadcrumb `Quản trị`; filters/tabs in URL |
| Utility | `/notifications` | `returnTo` | LIST feed; device permission in toolbar; not a product plane |
| Branch ops | `/br/[branchId]/*` | `/br/[branchId]` | Branch/station chrome; `branchId` in URL; proxy scope + network gate |
| Staff day | `/br/…/shift/*`, `/profile/*` | `/br/…/shift` | Branch bottom nav; do not mix HR admin hot path |
| Self | `/me`, `/me/clock`, `/me/schedule`, `/me/profile`, `/me/payslip` | `/me` (not post-login; login → `/`) | Profile hub in Control shell (includes `/notifications`); punch `/me/clock`; site-pinned → Branch; Owner denied |

History: `Link` / `router.push` between pages; `router.replace` only for tab/filter
on the same page.

## Main Components

### control_surface shell

`apps/web/app/components/control-surface-shell.tsx` — sole L0 shell
(nav-as-data): sidebar from `CONTROL_SURFACE_NAV_GROUPS` via
`resolveControlSurfacePrimaryTabs` + `resolveControlSurfaceDeepNav`. `/` =
1/2/3-column landing; no KPI without data contract. Nav filters
`canAccess(role, "owner")` then module capability.

### Login

`login-form.tsx` (RHF + Zod) → `login()` action (rate limit `@comtammatu/security`)
→ `signInWithPassword` → `resolvePostLoginRedirect()`.

## Inventory control_surface

### Dual-plane (ADR 0012 / 0018)

- **control_surface** `/inventory/*` — AppShell; site filter for every `branch_kind`
- **Branch Stock** `/br/[branchId]/stock/*` — separate shift plane; do not mirror shell/CTA
- Record Depth may align; IA/nav/chrome **must not** merge

### Workflow IA

`resolveInventoryNav` + `flattenInventoryDeepNav`:

1. Stock control → `Tồn kho`
2. Receive/reconcile → GRN, **`Đơn mua hàng`**, consumption, transfers
3. Production
4. Catalog & setup

- Exact `/inventory` = `LANDING`: ACL-filtered workflow lanes from inventory-nav
  (keep `branchId`); Control home `"Hôm nay"` remains `/`.
- Canonical transactions: `/inventory/{grn,purchase-orders,consumption,transfers}`.
  `/inventory/operations` retired.
- Sidebar does not advertise stocktake reconciliation / count / reports / supplier invoices;
  supplier invoices canonical in Finance; `/inventory/supplier-invoices` = shim.
- Owner PO LIST (ADR 0018 **C1**) for PO from GRN — no direct PO create CTA
  or GRN-from-PO. Supplier returns outside daily UI.
- Consumption groups waste/shrinkage/other issues. Transfer only between valid warehouses;
  no same-branch warehouse↔kitchen. Catalog single door under `Danh mục`.

### Wired workflows

- PO: LIST read-only detail; price edit/approval by permission
- Supplier invoices: Finance home; inventory path = shim
- `grn/[id]`: `confirmGrn`; transfers: `draft → in_transit → … → received`
- Stocktake daily = open/count/complete; conflicts/escalate outside daily UI
- `sắp mở` CTA intentional when input/backend missing

## Request Lifecycle

```
Browser → proxy.ts (auth + ACL) → route → layout (trusts proxy) → page
  → Server Action (mutation) → PostgREST (RLS)
```

## Import Rules

| File Type | Can Import |
| --- | --- |
| `page.tsx` / `layout.tsx` (RSC) | `@comtammatu/database/supabase/server`, shared, ui |
| `"use client"` | `@comtammatu/database/supabase/client`, shared, ui |
| `actions.ts` | Explicit server/service DB subpath, shared, security |

## Adding A Control Surface Module Or Page

Same-surface only (ADR 0012 / 0033). A new **module** must hit every seam; a
new **page** inside an existing module still needs 1–5 + proof.

1. Route file under `apps/web/app/(protected)/{module}/`
2. `ModuleKey` + roles (`module-acl.ts`) and path → module (`route-resolution.ts`)
3. Surface/chrome (`route-map.ts`) + nav (`nav-config.ts`) + VI glossary
4. Screen-context + archetype census (`page-archetypes.md` / `.mjs`)
5. Role-route matrix (`gen:route-matrix`); UI contract/registry if chrome changes
6. Permission keys + seed lint; additive RLS/RPC; `db:types` after apply
7. Optional: control-home attention, `/me` CTA, same-origin notification URLs
8. No new host/cookie domain. Proof: ACL±, proxy, primary viewport

## Common Failures

| Failure | Signal | Recovery |
| --- | --- | --- |
| "use client" barrel import | Turbopack crash | `/supabase/client` |
| Missing route-resolution | 404 / no ACL | Add URL → ModuleKey |
| Missing nav | Unreachable from sidebar | Add to `CONTROL_SURFACE_NAV_GROUPS` (or intentional direct-only) |
| Layout re-checks auth | Double redirect | Remove; proxy owns gate |

## PWA

Installable identities, service-worker cache, and OS/browser support:
`docs/spec/pwa.md`. Distinct `id` / `start_url` / name per launcher; all keep
`scope: "/"` on purpose (OQ-3). Do not install the owner root app as the
branch station.

## Design Rationale

- **Proxy = sole auth gate** — layout/page reads invariant, no second gate
- **RSC by default** — `"use client"` only for interactive UI
- **control_surface Owner-only** — BM/Staff on `/br/[branchId]/*`
- **Inventory surface independent** — exact `/inventory` is a workflow LANDING
  (lanes); Control home for L0 roles is `/`
- **Shared staff runtime** — Branch for site-pinned; `/me/*` for accountant;
  HR/`/hr/payroll` Owner-only; Owner has no self runtime
- **Finance = operational finance** — not enterprise GL / financial statements / period close
- **Inventory settings narrow** — categories/units/Min/QC; catalog canonical at
  `/inventory/{ingredients,suppliers,menu-recipes}`; `/inventory/recipes` = compat redirect
