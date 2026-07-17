# Architecture — Cơm Tấm Má Tư

## Hierarchy

```
Tenant (L0, single row: Hộ kinh doanh Cơm Tấm Má Tư)
  └── Branch (L1, multiple: Chi nhánh Q1, Q3, ...)
        └── Staff (profiles, role-based)
```

## System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Browser                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ Admin    │ │Inventory │ │ Finance  │ │ HR       │ │Notifs    │        │
│  │ /admin/* │ │/inventory│ │ /finance │ │ /hr      │ │/notifs.  │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ Orders   │ │ POS      │ │ KDS      │ │ Br Settings                    │
│  │ /orders  │ │ /br/*/pos│ │ /br/*/kds│ │ /br/[id]/settings/*           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ ┌──────────┐        │
│                                                       │Branch Hub│        │
│                                                       │/br/[id]  │        │
│                                                       └──────────┘        │
└────────────────────┬─────────────────────────────────────────────────────┘
                     │
              ┌──────▼──────┐
              │  proxy.ts   │  Auth + ACL routing
              └──────┬──────┘
                     │
              ┌──────▼──────┐
              │  Next.js 16 │  App Router (RSC + Server Actions)
              │  App Router │
              └──────┬──────┘
                     │
         ┌───────────┼───────────┐
         │           │           │
    ┌────▼────┐ ┌────▼────┐ ┌───▼────┐
    │Supabase │ │Supabase │ │Upstash │
    │  Auth   │ │PostgREST│ │ Redis  │
    │  + JWT  │ │  + RLS  │ │  Rate  │
    └─────────┘ └─────────┘ └────────┘
```

## Auth Flow

```
Login → signInWithPassword() → custom_access_token_hook (SECURITY DEFINER)
  → JWT minted with the claim shape owned by packages/shared/src/auth/types.ts
  → proxy.ts reads claims (from access_token, not user.app_metadata) → route to post-login target

Database access → RLS, authorized RPC, or trusted service-role boundary
```

**Auth layer:** `user_role` is derived from `positions.code` and kept for
backward compatibility (route-level `canAccess`). Permission-sensitive browser
writes use live grants through RLS/RPC; trusted service code derives scope from
server context. See `docs/modules/auth.md` and `docs/agent/rules/database.md`.

### Role → Post-Login/Fallback Target

Defined in `getDefaultRedirect(claims)` (`packages/shared/src/auth/scope.ts`).

| Role                | Route                                             |
| ------------------- | ------------------------------------------------- |
| `owner`             | `/`, rồi resolver mở branch khi chỉ có một branch |
| Branch-pinned staff | `/br/{branchId}`                                  |

Root `/` delegates to this same resolver; multiple active branches produce the
picker, while exactly one active branch opens its Branch Hub.

POS/KDS are not anyone's post-login fallback target — operators reach
`/br/[branchId]/pos` or `/br/[branchId]/kds` via Branch Hub or a direct link.

## RLS Pattern

```sql
-- Tenant-scoped (all tables)
USING (tenant_id = auth_tenant_id())

-- Branch-scoped (with tenant override)
USING (branch_id = auth_branch_id()
  OR auth_role() = 'owner')
```

## Package Dependencies

```
@comtammatu/web
  ├── @comtammatu/shared    (auth types, ACL, scope helpers)
  ├── @comtammatu/database  (Supabase clients)
  ├── @comtammatu/ui        (Má Tư DS primitives + token runtime)
  └── @comtammatu/security  (Upstash rate limiting)
```

## Operating Planes

The codebase should be navigated and changed by operating plane, not by folder name alone. Use these active planes before planning broad changes:

```mermaid
flowchart TB
    docs["Docs/Ops Plane<br/>docs/*, tasks/*, AGENTS.md"]
    control["Control Plane<br/>proxy.ts, module-acl, route-resolution, scope"]
    app["Execution Plane<br/>apps/web App Router + Server Actions"]
    domain["Domain Plane<br/>packages/shared"]
    data["Data Plane<br/>packages/database + supabase/*"]
    ui["UI Plane<br/>Custom Theme contract + packages/ui primitives"]
    edge["Branch Edge Plane<br/>apps/print-agent"]
    verify["Verification Plane<br/>Playwright, SQL tests, runbooks"]

    docs --> control
    control --> app
    app --> domain
    app --> data
    app --> ui
    app --> edge
    domain --> data
    data --> verify
    ui --> verify
    edge --> verify
    verify --> docs
```

Change ownership:

| Plane       | Owns                                                       | First files to inspect                                                                                                                             |
| ----------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Control     | Auth, ACL, host/surface routing, branch scope              | `apps/web/proxy.ts`, `packages/shared/src/auth/route-resolution.ts`, `packages/shared/src/auth/module-acl.ts`, `packages/shared/src/auth/scope.ts` |
| Execution   | Route behavior, Server Actions, realtime UI flows          | `apps/web/app/**`, route-local `actions.ts`, `apps/web/app/_lib/*`                                                                                 |
| Domain      | Business rules shared across routes/providers              | `packages/shared/src/**`                                                                                                                           |
| Data        | Schema, RLS, RPCs, generated types, Supabase clients       | `supabase/migrations/**`, `packages/database/src/**`                                                                                               |
| UI          | Custom Theme contract, reusable primitives, surface rhythm | `docs/spec/design-system.md`, `packages/ui/src/components/**`, `apps/web/app/components/surface.tsx`                                               |
| Branch Edge | Local print daemon and branch print/QR behavior            | `apps/print-agent/src/**`, branch settings surfaces                                                                                                |
| Docs/Ops    | Current source-of-truth, runbooks, active work state       | `docs/CODEBASE_MAP.md`, `docs/modules/**`, `docs/runbooks/**`, `tasks/**`                                                                          |

## Import Boundaries

| Context              | Import from                                | Reason                        |
| -------------------- | ------------------------------------------ | ----------------------------- |
| Server Actions / RSC | `@comtammatu/database/supabase/server`     | Request-scoped user client    |
| Privileged server    | `@comtammatu/database/supabase/service`    | Intentional RLS bypass        |
| proxy.ts             | `@comtammatu/database/supabase/middleware` | Session refresh boundary      |
| "use client"         | `@comtammatu/database/supabase/client`     | No server deps (next/headers) |

## Routing (path-based, single domain)

> Decision: D009 — path-based, không sub-domain. Sub-domain không nằm trong backlog hiện tại.

Top-level surfaces (see `module-acl.ts` for canonical role lists):

| Surface            | Route                        | Allowed roles (summary)                                      |
| ------------------ | ---------------------------- | ------------------------------------------------------------ |
| Admin              | `/admin/*`                   | owner                                                        |
| Inventory          | `/inventory/*`               | owner, branch_manager                                        |
| Finance            | `/finance/*`                 | owner                                                        |
| HR                 | `/hr/*`                      | owner, branch_manager                                        |
| Orders             | `/orders`                    | owner, branch_manager, cashier                               |
| Notifications      | `/notifications`             | all staff                                                    |
| POS                | `/br/[branchId]/pos`         | owner, cashier, branch_manager                               |
| KDS                | `/br/[branchId]/kds`         | owner, chef, branch_manager                                  |
| Branch dashboard   | `/br/[branchId]/dashboard`   | owner, branch_manager                                        |
| Branch settings    | `/br/[branchId]/settings/*`  | owner, branch_manager                                        |
| Branch menu limits | `/br/[branchId]/menu-limits` | owner, branch_manager                              |
| Staff day runtime  | `/br/[branchId]/shift/*`, `/br/[branchId]/profile/*` | branch-pinned roles                                 |
| Access denied      | `/access-denied`             | public (rendered with reason copy from `blocked-state.ts`)   |

Role/scope/route boundary is canonical in `docs/spec/role-route-matrix.md`.
Branch Manager branch setup belongs under `/br/[branchId]/*`, not new
tenant-admin routes.

## Infrastructure Strategy

```
Browser → proxy.ts → Next.js → Supabase Cloud
```

Local-First/offline đã LOẠI BỎ vĩnh viễn theo D012 (2026-06-10) — cloud + PWA là kiến trúc cuối.
