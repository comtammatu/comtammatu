# Codebase Map — Cơm Tấm Má Tư

> **Audience:** New engineers onboarding, feature owners planning Sprint 1+
> **Primary tasks:** (1) Understand system structure and auth flow, (2) Know where to add new features, (3) Identify blast radius of changes
> **Decision horizon:** Sprint planning, onboarding, architecture review
> **Out of scope:** Business requirements (see `docs/ref/`), sprint details and feature specs (see `docs/plan/`, e.g. [`m2-order-lifecycle.md`](plan/m2-order-lifecycle.md))

## Status

- **Current version:** v1.0.0 — All modules shipped (M0–M7)
- **Next milestone:** v1.0.0 Pilot Launch at 1 branch
- **Tech stack:** Next.js 16.2 | React 19.2 | TypeScript 6.0 | Tailwind 4.2 | Zod 4 | Supabase | Turborepo 2.9

## Module Index

| Module         | Doc                                            | Purpose                                              | Risk Level                  |
| -------------- | ---------------------------------------------- | ---------------------------------------------------- | --------------------------- |
| Auth & ACL     | [auth.md](modules/auth.md)                     | JWT claims, role hierarchy, RLS, proxy routing       | **High** — gates all access |
| Database       | [database.md](modules/database.md)             | Supabase clients, types, migrations, RLS policies    | **High** — data integrity   |
| Web App        | [web-app.md](modules/web-app.md)               | Next.js routes, layouts, server actions, admin shell | Medium                      |
| UI             | [ui.md](modules/ui.md)                         | shadcn components, design tokens                     | Low                         |
| Security       | [security.md](modules/security.md)             | Rate limiting (Upstash Redis)                        | Medium                      |
| Infrastructure | [infrastructure.md](modules/infrastructure.md) | Monorepo, build, deploy, environment                 | Medium                      |

## Architecture Overview

```
Browser ──► proxy.ts (auth + ACL) ──► Next.js App Router ──► Supabase (PostgREST + Auth)
                                                         ──► Upstash Redis (rate limit)
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

### Module Dependency Graph

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

### Data Flow — Login to Dashboard

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
    A->>B: Redirect to role default
    B->>P: GET /admin/dashboard
    P->>P: extractClaims → canAccess("dashboard")
    P->>B: Dashboard page
```

## Hub Files (High Blast Radius)

These files have the most dependents. Changes here affect many parts of the system.

| File                                            | Importers                          | Impact                                                |
| ----------------------------------------------- | ---------------------------------- | ----------------------------------------------------- |
| `packages/shared/src/auth/module-acl.ts`        | proxy.ts, admin shell, all layouts | Adding/removing modules affects routing, nav, and ACL |
| `packages/shared/src/auth/types.ts`             | Every auth-aware file              | Changing roles or JWT shape breaks auth chain         |
| `packages/shared/src/auth/scope.ts`             | proxy.ts, layouts, server actions  | Changing claim extraction breaks session              |
| `packages/database/src/types/database.types.ts` | All server code                    | Auto-generated — regenerate with `pnpm db:types`      |
| `apps/web/proxy.ts`                             | Next.js middleware entry           | Single point of auth enforcement                      |

## Critical Unknowns

| #   | Unknown                                                     | Verification Step                                  | Impact                   |
| --- | ----------------------------------------------------------- | -------------------------------------------------- | ------------------------ |
| 1   | area_manager has tenant-wide access (no area scoping table) | Deferred — see roadmap H3                          | May need migration later |
| 2   | No integration tests exist yet                              | Add before v1.0.0 pilot                            | Regressions possible     |

## Priority Recommendations

1. **v1.0.0 Pilot Launch:** All modules M0–M7 shipped. Focus on QA, security review, and pilot at 1 branch.
2. **Watch hub files:** Any change to `module-acl.ts` or `types.ts` requires proxy + layout + nav verification.
3. **RLS pattern:** Every new table must follow the tenant-scoped RLS pattern with explicit GRANTs. See [database.md](modules/database.md).

<!-- ORACLE-META
Updated: 2026-04-08 (all modules M0–M7 shipped, v1.0.0)
Data: Direct source reading
Audience: new engineer, feature owner | Confidence: 95%
Unknowns: 2 items pending verification
-->
