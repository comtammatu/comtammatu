# Codebase Map — Cơm Tấm Má Tư

> **Đối tượng:** Kỹ sư mới onboard, người phụ trách feature, người lập kế hoạch sprint
> **Mục tiêu chính:** (1) Hiểu cấu trúc hệ thống và luồng auth, (2) biết nơi thêm tính năng mới, (3) ước lượng blast radius của thay đổi
> **Mốc quyết định:** Lập kế hoạch sprint, onboarding, rà soát kiến trúc
> **Ngoài phạm vi:** Yêu cầu nghiệp vụ (xem `docs/ref/`), task tracker chi tiết (xem `tasks/todo.md`)

## Trạng thái

- **Operating track:** production đang vận hành in-place trên repo `comtammatu`;
  Greenfield preparation is the active cleanup track. Current work lives only in
  `tasks/todo.md`; durable architecture choices live in active ADRs or the
  owning spec/ref/rule doc.
- **Current surface:** Auth, Admin, Master Data, Inventory, Orders, POS, KDS,
  Print, Payments (Cash + VietQR + Momo), Finance Basic, HR/payroll basics, and
  HĐĐT via Viettel S-invoice are the production surface to re-derive for
  Greenfield.
- **Current priority:** keep the production baseline factual, classify current
  dirty WIP, verify the Greenfield target, and rebuild only the minimal product
  spine. Historical backlog is not a work queue.
- **Tech stack:** Next.js 16.2 | React 19.2 | TypeScript 6.0 | Tailwind 4.2 | Zod 4 | Supabase | Turborepo 2.9

## Chỉ mục phân hệ

| Module         | Doc                                            | Purpose                                                 | Risk Level                  |
| -------------- | ---------------------------------------------- | ------------------------------------------------------- | --------------------------- |
| Auth & ACL     | [auth.md](modules/auth.md)                     | JWT claims, role hierarchy, RLS, proxy routing          | **High** — gates all access |
| Database       | [database.md](modules/database.md)             | Supabase clients, types, migrations, RLS policies       | **High** — data integrity   |
| Finance        | [finance.md](modules/finance.md)               | Finance Basic boundary, daily money, HĐĐT, payables     | **High** — cash/legal data  |
| Web App        | [web-app.md](modules/web-app.md)               | Next.js routes, layouts, server actions, surface shells | Medium                      |
| UI             | [ui.md](modules/ui.md)                         | Custom Theme application, Má Tư primitives, surfaces    | Low                         |
| Security       | [security.md](modules/security.md)             | Rate limiting (Upstash Redis)                           | Medium                      |
| Infrastructure | [infrastructure.md](modules/infrastructure.md) | Monorepo, build, deploy, environment                    | Medium                      |

## Documentation Index

Khi cần đi sâu hơn theo loại tài liệu:

- [docs/README.md](README.md) — cổng vào chung cho toàn bộ docs
- [agent/rules/skills.md](agent/rules/skills.md) — routing cho external skills, plugins, MCP/browser tools, và subagents
- [docs/ref/glossary.md](ref/glossary.md) — glossary chuẩn duy nhất cho toàn repo
- [docs/architecture/README.md](architecture/README.md) — kiến trúc hệ thống và cross-cutting docs
- [ref/README.md](ref/README.md) — canonical reference docs
- [runbooks/README.md](runbooks/README.md) — readiness và smoke gates
- [worklog/README.md](worklog/README.md) — worklog policy; no historical archive

## Tổng quan kiến trúc

```
Browser ──► proxy.ts (auth + ACL) ──► Next.js App Router ──► Supabase (PostgREST + Auth)
                                                         ──► Upstash Redis (rate limit)
```

### Operating Planes

Use this map as an orientation layer. Regenerate numeric counts with
`node scripts/project-snapshot.mjs`; do not treat local analysis artifacts as
source-of-truth inputs.

| Layer               | Operational role                                                                      |
| ------------------- | ------------------------------------------------------------------------------------- |
| Web App             | Route surfaces, Server Actions, realtime hooks, POS/KDS/Admin/Inventory/Finance/HR UI |
| Data Platform       | Supabase migrations, generated types, RLS, RPCs, database clients                     |
| Docs And Operations | Source-of-truth docs, runbooks, task tracker, agent rules, skill routing              |
| Shared Domain       | Business rules, auth helpers, provider contracts, formatting, labels                  |
| UI System           | Custom Theme contract, Má Tư Design System primitives, app surface components         |
| Tooling And Config  | Turborepo, lint/build/test config, deployment config, scripts                         |
| Print Agent         | ESC-POS print daemon, LAN bridge, receipt/QR rendering                                |
| Auth And Routing    | `proxy.ts`, route resolution, ACL, branch scope, auth tests                           |
| Tests               | Playwright route coverage and shared unit tests                                       |
| Core                | Repository metadata, E2E helpers, cross-cutting supporting files                      |

Generated checkout snapshot from 2026-07-02 (`node scripts/project-snapshot.mjs`):

| Area                                                  |             Count |
| ----------------------------------------------------- | ----------------: |
| `apps/web/app/**/page.tsx` routes (committed)         |               133 |
| API routes / route handlers                           |           10 / 13 |
| Generated DB tables / views / functions / enums       | 117 / 8 / 271 / 0 |
| Active SQL migrations (baseline-first; +543 archived) |                 3 |
| Test/spec files (`apps/web/e2e` + shared unit tests)  |                42 |
| Playwright specs / shared unit tests                  |           11 / 31 |

> Migrations are **baseline-first** since 2026-05-30 and were re-baselined on 2026-07-02: `supabase/migrations/00000000000000_baseline.sql` (canonical public+private schema install) plus the managed-surfaces fold migration and the branch-stock operator action migration not yet represented by prod, with the 543-file historical/squashed chain under `supabase/migrations/_archive/`. See `docs/spec/database-schema.md`.

The repo is not a flat "apps/packages" map. The operational shape is:

```mermaid
flowchart TB
    ops["Docs And Operations<br/>README, CODEBASE_MAP, runbooks, tasks"] --> plan["Feature / incident plan"]
    plan --> control["Control Plane<br/>proxy.ts + route-resolution + module-acl + scope"]
    control --> web["Execution Plane<br/>apps/web App Router + Server Actions"]
    web --> domain["Domain Plane<br/>packages/shared contracts"]
    web --> ui["UI Plane<br/>packages/ui + surface components"]
    web --> data["Data Plane<br/>packages/database + Supabase RLS/RPC"]
    web --> print["Branch Edge Plane<br/>apps/print-agent"]
    web --> rate["Security Edge<br/>packages/security + Upstash"]
    data --> verify["Verification Plane<br/>Playwright + SQL tests + smoke runbooks"]
    print --> verify
    verify --> ops
```

### Optimized Operating Flow

Use this flow before broad implementation work. It reduces route drift, UI drift, and database drift by forcing each change through its correct authority.

```mermaid
flowchart LR
    request["New feature / bug / refactor"] --> classify["Classify surface<br/>public, protected, branch, admin, finance, inventory, POS/KDS"]
    classify --> skills["Select skill plan<br/>docs/agent/rules/skills.md"]
    skills --> docs["Read source docs<br/>module doc + runbook + tasks/regressions"]
    docs --> auth["Check control plane<br/>proxy.ts, route-resolution.ts, module-acl.ts, scope.ts"]
    auth --> data{"Touches database?"}
    data -->|yes| rpc["Design RLS/RPC/migration first<br/>atomic multi-item writes via RPC"]
    data -->|no| route["Route/server-action boundary"]
    rpc --> route
    route --> ui{"Touches UI?"}
    ui -->|yes| design["Use Custom Theme contract<br/>docs/spec/design-system.md + Má Tư primitives"]
    ui -->|no| verify
    design --> verify["Verify narrow path<br/>typecheck/lint/build or docs-only validation"]
    verify --> update["Update source-of-truth docs/tasks with real state"]
```

Decision rules:

- Skill/plugin selection starts at `docs/agent/rules/skills.md`. Do not let an
  external skill override repo authority.
- Route behavior starts at `apps/web/proxy.ts` and `packages/shared/src/auth/route-resolution.ts`. Do not fix route drift inside pages first.
- ACL ownership starts at `packages/shared/src/auth/module-acl.ts`. Do not create parallel role maps in route components.
- Scope belongs in URL params and JWT claims. Do not persist branch/tenant scope in browser storage.
- Multi-row business writes belong in Supabase RPCs. Server Actions validate input and call the RPC; they do not orchestrate partial writes one query at a time.
- UI changes stay inside the Custom Theme contract in `docs/spec/design-system.md`. New primitives belong in `packages/ui`; page-specific composition belongs in `apps/web/app`.
- Operational docs are part of the workflow. If runtime behavior changes, update the module doc/runbook/task tracker in the same slice.

### Project Placement Matrix

Use this matrix when adding or moving files. It is the practical replacement for "where should this live?"

| Change type                                  | Primary location                                                    | Must check                                                                         | Avoid                                                  |
| -------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------ |
| New protected route                          | `apps/web/app/(protected)/...`                                      | `proxy.ts`, `route-resolution.ts`, `module-acl.ts`, module doc                     | Duplicating ACL in layouts/pages                       |
| New Server Action                            | Adjacent `actions.ts` under route family                            | Zod schema, `withAction`/auth helper, RLS/RPC contract                             | Returning raw Supabase error messages                  |
| New shared business rule                     | `packages/shared/src/<domain>/...`                                  | Existing package exports and tests                                                 | Importing app-only code into shared package            |
| New database mutation spanning multiple rows | `supabase/migrations/*.sql` RPC + typed caller                      | RLS, GRANTs, `pnpm db:types` after apply                                           | Multi-query partial writes in Server Actions           |
| New Supabase client usage                    | `packages/database/src/supabase/*` or server-only barrel            | Import boundary table below                                                        | `@comtammatu/database` barrel in `"use client"`        |
| New reusable UI primitive                    | `packages/ui/src/components/*`                                      | `docs/spec/design-system.md`, Má Tư DS primitives, `scripts/check-ui-contract.mjs` | Page-local one-off primitive clones                    |
| New route-specific UI composition            | `apps/web/app/**/_components` or route folder                       | `docs/spec/design-system.md`, Má Tư DS primitives, surface components              | New visual language outside design system              |
| New print behavior                           | `apps/print-agent/src/*` plus branch settings route if configurable | Branch-scoped config, no deploy-only layout changes                                | Hardcoded receipt/format changes per branch            |
| New skill/plugin/tool routing rule           | `docs/agent/rules/skills.md` plus relevant entrypoint docs          | `AGENTS.md`, `docs/agent/rules/references.md`, `docs/agent/rules/workflow.md`      | Divergent workspace-only rules, secrets, plugin caches |
| New operational rule/runbook                 | `docs/modules/*`, `docs/runbooks/*`, `tasks/*`                      | `docs/agent/rules/references.md`                                                   | Separate agent-only doc trees                          |

### Current Operating Model

```mermaid
flowchart LR
    supplier["Nhà cung cấp"] --> hq["Tenant"]
    hq -->|raw transfers| ck["chi nhánh"]
    ck -->|finished-good transfers| br["Chi nhánh"]
    br --> pos["POS / KDS / completed orders"]
```

### C4 Context Diagram

```mermaid
graph TB
    staff[Staff / Manager]
    browser[Browser]
    supabase[(Supabase<br/>Auth + PostgREST + RLS)]
    redis[(Upstash Redis<br/>Rate Limiting)]
    vercel[Vercel<br/>Next.js 16]

    staff -->|login + use| browser
    browser -->|HTTPS| vercel
    vercel -->|PostgREST API| supabase
    vercel -->|Rate limit check| redis
```

### Sơ đồ phụ thuộc phân hệ

```mermaid
graph LR
    web["@comtammatu/web"]
    shared["@comtammatu/shared"]
    db["@comtammatu/database"]
    ui["@comtammatu/ui"]
    sec["@comtammatu/security"]

    web --> shared
    web --> db
    web --> ui
    web --> sec
    shared -.->|types only| db
```

### Luồng dữ liệu — Đăng nhập vào mục tiêu sau đăng nhập

```mermaid
sequenceDiagram
    participant B as Browser
    participant P as proxy.ts
    participant A as Server Action
    participant S as Supabase Auth
    participant H as JWT Hook

    B->>P: GET /login
    P->>B: Login page (public)
    B->>A: POST login(email, password)
    A->>S: signInWithPassword()
    S->>H: custom_access_token_hook()
    H->>S: JWT + {tenant_id, branch_id, user_role}
    S->>A: Session + JWT
    A->>B: Redirect to post-login target
    B->>P: GET /finance or /br/{branchId}
    P->>P: extractClaims → canAccess(module)
    P->>B: Target page
```

Opening `/` after authentication follows the same shared default resolver.

## Hub Files (High Blast Radius)

Đây là các file có nhiều chỗ phụ thuộc nhất. Mọi thay đổi ở đây sẽ tác động rộng trong hệ thống.

| File                                            | Importers                          | Impact                                                |
| ----------------------------------------------- | ---------------------------------- | ----------------------------------------------------- |
| `packages/shared/src/auth/module-acl.ts`        | proxy.ts, admin shell, all layouts | Adding/removing modules affects routing, nav, and ACL |
| `packages/shared/src/auth/types.ts`             | Every auth-aware file              | Changing roles or JWT shape breaks auth chain         |
| `packages/shared/src/auth/scope.ts`             | proxy.ts, layouts, server actions  | Changing claim extraction breaks session              |
| `packages/database/src/types/database.types.ts` | All server code                    | Auto-generated — regenerate with `pnpm db:types`      |
| `apps/web/proxy.ts`                             | Next.js middleware entry           | Single point of auth enforcement                      |

## Critical Unknowns

| #   | Unknown                                                                                                                                                                     | Verification Step                                                                               | Impact                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1   | Owner has tenant-wide access without an intermediate scope table.                                                                                                           | ADR 0005 defines the owner identity source; any dual-source flip must be a new owner-gated task | May need migration later                            |
| 2   | Test coverage exists but is still concentrated around static/unit coverage; the full POS→payment→KDS/print→HĐĐT smoke and live provider behavior still need a safe runtime. | Expand route smoke + end-to-end runbooks before scale                                           | Refactor regressions possible on uncovered surfaces |

## Priority Recommendations

1. **Production operating surface:** Auth, Admin, Master Data, Inventory, Orders, POS, KDS, Print, Payments (Cash + VietQR + Momo), and HĐĐT run on the `tenant -> chi nhánh` model. Finance/HR/Notifications/Reporting work is governed by the live blockers in `tasks/todo.md`.
2. **Watch hub files:** Any change to `module-acl.ts` or `types.ts` requires proxy + layout + nav verification.
3. **RLS pattern:** Every new table must follow the tenant-scoped RLS pattern with explicit GRANTs. See [database.md](modules/database.md).

Inventory route ownership note:

- `/inventory` is the canonical Inventory surface.
- Route new Inventory features only under `/inventory/*` or approved branch-scoped wrappers.
