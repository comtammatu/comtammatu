# Web App Module

## Overview

Next.js 16.2 application with App Router. Serves four user surfaces: Admin (management), POS (cashier/waiter), KDS (chef), and Employee portal. Sprint 1 complete (S1–S6): admin shell, branches, staff, menu, tables/zones, and security polish are shipped. POS/KDS/Employee remain placeholders for Sprint 2a.

**Owner:** `apps/web/`

## Route Structure

```
apps/web/app/
├── layout.tsx              # Root: HTML, fonts (Be Vietnam Pro), metadata
├── page.tsx                # / → redirect to role default
├── globals.css             # Tailwind 4.2 base styles
│
├── (auth)/login/           # Public auth group
│   ├── page.tsx            # Login page
│   ├── login-form.tsx      # "use client" form
│   └── actions.ts          # Server action: login()
│
├── admin/                  # Tenant-level management
│   ├── layout.tsx          # AdminLayout (auth guard + sidebar)
│   ├── components/
│   │   └── admin-shell.tsx # Sidebar nav, header, role-based filtering
│   ├── dashboard/          # StatCard demo (hardcoded)
│   ├── menu/               # Menu management: categories, items, variants, modifiers, sides (S4)
│   ├── inventory/          # Placeholder
│   ├── orders/             # Placeholder
│   ├── staff/              # Staff CRUD with role hierarchy auth (S3)
│   ├── hr/                 # Placeholder (owner/super_manager only)
│   ├── crm/                # Placeholder
│   ├── finance/            # Placeholder (owner/super_manager only)
│   ├── reports/            # Placeholder
│   └── settings/
│       ├── general/        # System settings key/value (S2)
│       ├── branches/       # Branch CRUD + set_headquarters (S2)
│       └── tables/         # Tables & zones per branch (S5)
│
├── br/[branchId]/
│   ├── pos/                # POS (cashier, waiter, branch_manager)
│   │   ├── layout.tsx      # Auth + ACL check
│   │   └── page.tsx        # Placeholder
│   └── kds/                # KDS (chef, branch_manager)
│       ├── layout.tsx      # Auth + ACL check
│       └── page.tsx        # Placeholder
│
├── employee/               # Employee portal (all roles)
│   └── page.tsx            # Placeholder
│
└── api/
    ├── health/route.ts     # GET health check
    └── auth/signout/route.ts  # POST logout
```

## Key Components

### Admin Shell (`apps/web/app/admin/components/admin-shell.tsx`)

The main layout for all `/admin/*` routes. Renders:
- Collapsible sidebar with role-filtered navigation (reads `ADMIN_NAV_GROUPS` from `@comtammatu/shared/auth`)
- Header with user info and sign-out
- Responsive: sidebar collapses on mobile

Navigation groups filter by `canAccess(role, moduleKey)` — modules the user cannot access are hidden.

### Login Form (`apps/web/app/(auth)/login/login-form.tsx`)

"use client" component. Uses React Hook Form + Zod validation. Calls `login()` server action. Displays error toast via Sonner on failure.

### Login Action (`apps/web/app/(auth)/login/actions.ts`)

Server action with rate limiting (`loginRateLimit` from `@comtammatu/security`). Validates with Zod, calls `signInWithPassword()`, extracts claims, redirects to role default via `getDefaultRedirect()`.

## Request Lifecycle

```
Browser request
  → proxy.ts (auth + ACL)
    → Next.js route matching
      → layout.tsx (RSC — may do additional auth checks)
        → page.tsx (RSC or client component)
          → Server Action (if mutation)
            → Supabase PostgREST (RLS enforced)
```

## Import Rules

| File Type | Can Import |
|-----------|-----------|
| `page.tsx` (RSC) | `@comtammatu/database`, `@comtammatu/shared`, `@comtammatu/ui` |
| `layout.tsx` (RSC) | Same as page.tsx |
| `"use client"` components | `@comtammatu/database/supabase/client`, `@comtammatu/shared`, `@comtammatu/ui` |
| `actions.ts` (Server Actions) | `@comtammatu/database`, `@comtammatu/shared`, `@comtammatu/security` |

## Adding a New Admin Page

1. Create `apps/web/app/admin/{module}/page.tsx`
2. Add `ModuleKey` to `packages/shared/src/auth/module-acl.ts` with allowed roles
3. Add route mapping in `apps/web/proxy.ts` → `resolveModule()`
4. Add nav item in `packages/shared/src/auth/nav-config.ts`
5. Verify: proxy routes correctly, sidebar shows/hides by role

## Failure Modes

| Failure | Signal | Recovery |
|---------|--------|----------|
| "use client" barrel import | Turbopack build crash | Use `/supabase/client` import path |
| Missing module in proxy resolveModule() | 404 or no ACL check | Add URL pattern → ModuleKey mapping |
| Missing nav entry | Page exists but unreachable from sidebar | Add to `ADMIN_NAV_GROUPS` |
| Layout auth check mismatch with proxy | Double redirect or bypass | Proxy is source of truth — layout checks are defense-in-depth |

## Design Rationale

- **Proxy as single auth gate:** All auth enforcement happens in `proxy.ts` before any route code runs. Layout-level checks are defense-in-depth, not primary.
- **RSC by default:** Pages are React Server Components. Only interactive elements (forms, dropdowns) use "use client".
- **Remaining placeholders:** inventory, orders, hr, crm, finance, reports, POS, KDS, employee. These will be built in Sprint 2a–3.

<!-- ORACLE-META
Written by codebase-oracle (manual) | 2026-04-02
Data: Direct source reading
Audience: new engineer, feature owner | Confidence: 95%
Updated: Sprint 1 S6 complete (2026-04-03)
Unknowns: 0
-->
