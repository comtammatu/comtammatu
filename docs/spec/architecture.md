# Architecture — Cơm Tấm Má Tư

## Hierarchy

```text
Tenant (L0, single operating tenant)
├── Operating sites persisted in `branches`
│   ├── `branch`
│   ├── `central_supply`
│   └── `central_kitchen`
└── Staff profiles and site assignments
```

`branches` remains the site table; `branch_id` is the technical scope key.
`Company` and `operational_site` are not runtime hierarchy levels.

## System Topology

```mermaid
flowchart LR
    client["Browser / installable PWA"] --> proxy["proxy.ts<br/>session + surface + scope + network gates"]
    proxy --> web["Next.js App Router<br/>RSC + Server Actions + route handlers"]
    web --> data["Supabase Cloud<br/>Auth + Postgres + PostgREST + RLS + Realtime + Storage"]
    web --> rate["Upstash Redis<br/>rate limiting"]
    web --> provider["External providers<br/>payments + HĐĐT"]
    data -->|"print_jobs Realtime + recovery polling"| agent["Branch print-agent<br/>Node.js Windows service"]
    agent --> printer["ESC/POS LAN printers"]
    agent -->|"heartbeat + claim/status"| data
    agent -->|"branch presence"| web
```

Two deployable runtimes: stateless web app + one branch-local print-agent per
active branch. Supabase Cloud is the system of record; the print-agent adapts
LAN printers only.

## Technical Specifications

| Concern              | Contract                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Product shape        | Single tenant, multiple branches, path-based surfaces on one web domain                                                                |
| Web runtime          | Node.js 24.x, Next.js App Router on Vercel; RSC, Server Actions, route handlers, and scheduled routes share one app                    |
| Data authority       | Supabase Cloud owns Auth, Postgres, PostgREST, RLS, Realtime, and Storage                                                              |
| Authorization        | `proxy.ts` gates session/surface/scope; RLS and authorized RPCs own data/action authority                                              |
| Mutation correctness | Server Action input is Zod-validated; multi-row correctness is implemented in one Postgres RPC                                         |
| Offline posture      | Cloud-first PWA; cached shell/static assets may degrade gracefully, but POS has no local-first transaction authority                   |
| Printing             | `print_jobs` is the durable queue; the branch agent claims idempotently, retries LAN delivery, and recovery-polls around Realtime gaps |
| Delivery             | Web deploys through Vercel; database and branch-agent releases have separate promotion gates                                           |

Framework versions: package manifests + `pnpm-lock.yaml`. Env/deploy/release:
`docs/modules/infrastructure.md`.

## Auth Flow

```
Login → signInWithPassword() → custom_access_token_hook (SECURITY DEFINER)
  → JWT minted with the claim shape owned by packages/shared/src/auth/types.ts
  → proxy.ts reads claims (from access_token, not user.app_metadata) → route to post-login target

Database access → RLS, authorized RPC, or trusted service-role boundary
```

`user_role` derives from `positions.code` (route-level `canAccess` compat).
Permission-sensitive writes use live grants via RLS/RPC. See `docs/modules/auth.md`
and `docs/agent/rules/database.md`.

### Role → Post-Login/Fallback Target

`getDefaultRedirect(claims)` (`packages/shared/src/auth/scope.ts`):

| Role                | Route                                             |
| ------------------- | ------------------------------------------------- |
| `owner`             | `/`, then branch resolver when only one branch exists |
| Branch-pinned staff | `/br/{branchId}`                                  |

Root `/` uses the same resolver (multi-branch → picker). POS/KDS are not
post-login fallbacks — reach via Branch home or direct link.

## Data Authorization Pattern

No generic role predicate to copy:

- Tenant: `auth_tenant_id()`
- Branch: `auth_branch_id()` + documented Owner path
- Revocable authority: `has_permission(branch_id, key)` / `has_permission_any(key)`
- `auth_role()` = compatibility route bucket / structural side guard only

Layer contract: `docs/modules/auth.md`. Policy rules: `docs/agent/rules/database.md`.

## Current Package Dependencies

```text
@comtammatu/web
  ├── @comtammatu/shared | @comtammatu/database | @comtammatu/ui
  ├── @comtammatu/security | @comtammatu/print-render → shared

@comtammatu/print-agent → @comtammatu/print-render → shared
```

Apps are graph leaves; packages never import apps. Use explicit `exports` and
`workspace:*`. New package only for a second runtime, trust boundary, or
independently built artifact.

## Code Placement

| Reuse/correctness boundary          | Location                        |
| ----------------------------------- | ------------------------------- |
| One route                           | Beside that route               |
| Multiple routes in one route family | The route-family `_lib`         |
| Multiple web route families         | `apps/web/lib/<domain>`         |
| Multiple runtimes or applications   | An existing `packages/*` export |
| Correctness across database rows    | Supabase RPC/migration          |

Route-local `_lib` is private to its family. `packages/shared` owns
runtime-neutral contracts only.

## Operating Planes

```mermaid
flowchart TB
    docs["Docs/Ops Plane<br/>docs/*, tasks/*, AGENTS.md"]
    control["Control Plane<br/>proxy.ts, module-acl, route-resolution, scope"]
    app["Execution Plane<br/>apps/web App Router + Server Actions"]
    domain["Domain Plane<br/>packages/shared"]
    data["Data Plane<br/>packages/database + supabase/*"]
    ui["UI Plane<br/>Má Tư Design System + packages/ui primitives"]
    edge["Branch Edge Plane<br/>apps/print-agent"]
    verify["Verification Plane<br/>Playwright, SQL tests, runbooks"]

    docs --> control
    control --> app
    app --> domain
    app --> data
    app --> ui
    data --> edge
    domain --> data
    data --> verify
    ui --> verify
    edge --> verify
    verify --> docs
```

| Plane       | Owns                                                       | First files to inspect                                                                                                                             |
| ----------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Control     | Auth, ACL, host/surface routing, branch scope              | `apps/web/proxy.ts`, `packages/shared/src/auth/{route-resolution,module-acl,scope}.ts` |
| Execution   | Route behavior, Server Actions, realtime UI flows          | `apps/web/app/**`, route-local `actions.ts`, `apps/web/app/_lib/*`                                                                                 |
| Domain      | Business rules shared across routes/providers              | `packages/shared/src/**`                                                                                                                           |
| Data        | Schema, RLS, RPCs, generated types, Supabase clients       | `supabase/migrations/**`, `packages/database/src/**`                                                                                               |
| UI          | Má Tư Design System, reusable primitives, surface rhythm   | `docs/spec/design-system.md`, `packages/ui/src/components/**`, `apps/web/app/components/surface.tsx`                                               |
| Branch Edge | Local print daemon and branch print/QR behavior            | `apps/print-agent/src/**`, branch settings surfaces                                                                                                |
| Docs/Ops    | Current source-of-truth, runbooks, active work state       | `docs/CODEBASE_MAP.md`, `docs/modules/**`, `docs/runbooks/**`, `tasks/**`                                                                          |

## Import Boundaries

| Context              | Import from                                | Reason                        |
| -------------------- | ------------------------------------------ | ----------------------------- |
| Server Actions / RSC | `@comtammatu/database/supabase/server`     | Request-scoped user client    |
| Privileged server    | `@comtammatu/database/supabase/service`    | Intentional RLS bypass        |
| proxy.ts             | `@comtammatu/database/supabase/middleware` | Session refresh boundary      |
| "use client"         | `@comtammatu/database/supabase/client`     | No server deps (next/headers) |

## Product Dual Thesis

Two product halves — structure, naming, chrome, and adapters must make both obvious.

| Product half (VI)               | Job                                                                     | Plane ID          | Route root                                                                                      | Shell                    | Adapter prefix    |
| ------------------------------- | ----------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------- | ------------------------ | ----------------- |
| **`Quản lý hệ thống`**            | Tenant/branch oversight, menu, central inventory, finance, HR, settings | `control_surface` | `/`, `/menu`, `/orders`, `/inventory`, `/finance`, `/hr`, `/branches`, `/settings`, `/feedback` | `AppShell` (nav-as-data) | `App*`            |
| **`Vận hành bán hàng` (ca)**      | Shift work, branch stock, team, branch settings                         | `branch_surface`  | `/br/[branchId]/*` (excl. stations)                                                             | Branch operator chrome   | `BranchOperator*` |
| **`Vận hành bán hàng` (station)** | Sell / kitchen / pickup queue                                           | `station_chrome`  | `/br/[branchId]/{pos,kds,pickup}`                                                               | Station chrome           | station adapters  |
| **Public / `khách`**              | Auth, guest order, feedback QR, pickup display                          | `public`          | `/login`, `/q`, `/r`, …                                                                         | none                     | —                 |

- UI copy for the L0 half: **`Quản trị`** / **`Hệ thống`**. Role ACL `owner` is not a plane name.
- Runtime plane id `RouteSurface: "owner"` remains a technical alias of
  **`control_surface`**. DOM scrollport is `data-control-surface-scroll`.
  Chrome component is `ControlSurfaceShell`. New docs/UI copy use
  `control_surface` / `Quản trị`.
- Dual-plane inventory keeps **two jobs** (`/inventory/*` oversight vs `/br/.../stock/*` shift work). Share implementation; do not merge URLs.
- Vocabulary detail: `docs/ref/glossary.md`. Chrome: `docs/spec/design-system.md`. Routes: `docs/modules/web-app.md`, `docs/spec/role-route-matrix.md`.

### Folder placement (Dual Thesis)

| Concern                                      | Lives under                                                     | Notes                                                                                                 |
| -------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **`Quản trị`** L0 routes                           | `apps/web/app/(protected)/{menu,orders,inventory,finance,hr,…}` | `App*` adapters; one `AppShell` + nav-as-data                                                         |
| Branch operations + stations                   | `apps/web/app/(protected)/br/[branchId]/…`                      | `BranchOperator*` / station chrome                                                                    |
| Branch settings UI (POS/KDS/tables/printers) | `apps/web/app/(protected)/br/_shared/settings/`                 | Not a fake L0 `branch-settings/` tree                                                                 |
| Dual-plane shared domain logic               | `apps/web/lib/inventory/*`                                      | Same core; different presenters                                                                       |

**Nav-as-data:** one `AppShell`; layouts import `ControlSurfaceShell`; deep nav
via `resolveControlSurfaceDeepNav`. Do not rewrite POS/KDS.

## Routing (path-based, single domain)

D009 — path-based, no sub-domain. Exact role/module mappings:
`docs/spec/role-route-matrix.md` (do not copy here).

| Surface (product) | Plane ID                            | Route families                                                                                  | Boundary                                                             |
| ----------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **`Quản lý hệ thống`**  | `control_surface`                   | `/`, `/menu`, `/orders`, `/inventory`, `/finance`, `/branches`, `/hr`, `/settings`, `/feedback` | L0 Tenant Command; runtime `RouteSurface: "owner"` is the code alias |
| **`Vận hành bán hàng`** | `branch_surface` + `station_chrome` | `/br/[branchId]/*`                                                                              | Module ACL + URL/JWT branch scope; PBAC/RLS owns actions and data    |
| Utility           | —                                   | `/notifications`, `/access-denied`                                                              | Explicit utility/public contracts, not a product plane               |

BM/Staff daily work stays under `/br/[branchId]/*`; `control_surface` is
L0-gated per ADR 0012.

## Infrastructure Strategy

Web + DB remain cloud-authoritative. D012 removes local-first POS / native
rewrite from scope; D062 PWA shell and branch print adapter remain. Topology,
secrets, CI, promotion: `docs/modules/infrastructure.md`.
