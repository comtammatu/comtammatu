# Architecture — Cơm Tấm Má Tư

## Hierarchy

```
Tenant (L0, single row: Cơm Tấm Má Tư CTCP)
  └── Branch (L1, multiple: Chi nhánh Q1, Q3, ...)
        └── Staff (profiles, role-based)
```

## System Overview

```
┌─────────────────────────────────────────────────────┐
│  Browser                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ Admin    │ │ POS      │ │ KDS      │ │Employee│ │
│  │ /admin/* │ │ /br/*/pos│ │ /br/*/kds│ │/employee││
│  └──────────┘ └──────────┘ └──────────┘ └────────┘ │
└────────────────────┬────────────────────────────────┘
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
  → JWT minted with { tenant_id, branch_id, user_role }
  → proxy.ts reads claims → route to role's default page
```

### Role → Default Route

| Role                                               | Route                |
| -------------------------------------------------- | -------------------- |
| owner, super_manager, area_manager, branch_manager | `/admin/dashboard`   |
| cashier, waiter                                    | `/br/[branchId]/pos` |
| chef                                               | `/br/[branchId]/kds` |
| office                                             | `/employee`          |

## RLS Pattern

```sql
-- Tenant-scoped (all tables)
USING (tenant_id = auth_tenant_id())

-- Branch-scoped (with manager override)
USING (branch_id = auth_branch_id()
  OR auth_role() IN ('owner', 'super_manager', 'area_manager'))
```

## Package Dependencies

```
@comtammatu/web
  ├── @comtammatu/shared    (auth types, ACL, scope helpers)
  ├── @comtammatu/database  (Supabase clients)
  ├── @comtammatu/ui        (shadcn/ui components)
  └── @comtammatu/security  (Upstash rate limiting)
```

## Import Boundaries

| Context              | Import from                                | Reason                        |
| -------------------- | ------------------------------------------ | ----------------------------- |
| Server Actions / RSC | `@comtammatu/database`                     | Full barrel OK — server-only  |
| proxy.ts / Edge      | `@comtammatu/database/supabase/middleware` | No Node.js deps               |
| "use client"         | `@comtammatu/database/supabase/client`     | No server deps (next/headers) |

## Routing (path-based, single domain)

> Decision: D009 — path-based, không sub-domain. Sub-domain là Post-v1.0.

| Surface  | Route                | Roles                                              |
| -------- | -------------------- | -------------------------------------------------- |
| Admin    | `/admin/*`           | owner, super_manager, area_manager, branch_manager |
| POS      | `/br/[branchId]/pos` | cashier, waiter                                    |
| KDS      | `/br/[branchId]/kds` | chef                                               |
| Employee | `/employee/*`        | office                                             |

## Infrastructure Strategy

> Decision: D008 — cloud-first MVP, local-first Phase 2.

```
MVP (v1.0.0):
  Browser → proxy.ts → Next.js → Supabase Cloud
  + PWA Service Worker cache cho offline cơ bản

Post-v1.0 (nếu cần):
  Branch LAN: Mini PC + Bun + SQLite
    POS/KDS → local server (< 1ms)
    Sync worker → Supabase Cloud (mỗi 1-5 min)
```

| Module      | MVP runs on | Post-v1.0 option       |
| ----------- | ----------- | ---------------------- |
| Admin, Menu | Cloud       | Cloud (giữ nguyên)     |
| POS, KDS    | Cloud + PWA | Local-first per branch |
| Payment     | Cloud       | Local-first per branch |
| Stock       | Cloud       | Hybrid                 |
| Finance, HR | Cloud       | Cloud (giữ nguyên)     |
