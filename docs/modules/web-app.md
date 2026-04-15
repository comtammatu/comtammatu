# Phân hệ Web App

## Tổng quan

Ứng dụng Next.js 16.2 dùng App Router. Hệ phục vụ 5 bề mặt chính: quản trị, điều hành kho (`/inventory`), POS, KDS, và cổng nhân viên. M0 (Khung quản trị) + M1 (Thực đơn) + M2 (POS) + M3 (KDS) đã hoàn thành; Kho hàng hiện là bề mặt vận hành live cho HQ, bếp trung tâm, và chi nhánh.

**Phạm vi sở hữu:** `apps/web/`

## Cấu trúc route

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
├── admin/                  # ERP foundation + executive reporting shell
│   ├── layout.tsx          # AdminLayout (auth guard + sidebar)
│   ├── components/
│   │   └── admin-shell.tsx # Sidebar nav, executive shell, role-based filtering
│   ├── dashboard/          # ERP cockpit landing
│   ├── menu/               # Menu master data domain (reachable via domain map, not primary Admin nav)
│   ├── inventory/          # Legacy compatibility route tree only; canonical Inventory lives at /inventory
│   ├── orders/             # Legacy admin route; not part of primary Admin IA
│   ├── staff/              # Staff CRUD with role hierarchy auth (S3), excludes owner/super_manager
│   ├── hr/                 # Admin-side HR reporting entrypoints (deep links continue to /hr workspace)
│   ├── crm/                # Placeholder / deferred
│   ├── finance/            # Finance workflows + HĐĐT / VAS reporting, entered through reports
│   ├── reports/            # CEO/HQ reports hub
│   └── settings/
│       ├── layout.tsx      # Auth guard + role-aware SettingsNav for foundation controls
│       ├── page.tsx        # Redirect: branch_manager/area_manager → tables, others → branches
│       ├── general/        # System settings key/value — owner/super_manager only
│       ├── branches/       # Branch CRUD + set_headquarters — owner/super_manager only
│       └── tables/         # Tables & zones per branch — all settings roles (branch-scoped)
│
├── br/[branchId]/
│   ├── pos/                # POS (cashier, waiter, branch_manager) — M2 shipped
│   │   ├── layout.tsx      # Auth + ACL + branch validation
│   │   ├── page.tsx        # POS terminal UI
│   │   └── actions.ts      # Order CRUD, session management
│   └── kds/                # KDS (chef, branch_manager) — M3 shipped
│       ├── layout.tsx      # Auth + ACL + branch validation
│       ├── page.tsx        # KDS board — station tabs, realtime queue
│       ├── actions.ts      # bump/recall tickets, station CRUD, category mapping
│       ├── kds-board.tsx   # "use client" — realtime ticket board with Supabase subscription
│       └── order-card.tsx  # Individual order card with bump/recall buttons
│
├── employee/               # Employee portal (all roles)
│   └── page.tsx            # Limited surface; broader self-service remains M7 follow-up
│
├── inventory/              # Inventory operations cockpit (HQ / central_kitchen / branch)
│   ├── layout.tsx          # Inventory shell with site context + role-aware nav
│   ├── page.tsx            # Operations dashboard
│   ├── stock/              # Live stock levels by site
│   ├── transfers/          # Internal transfers
│   ├── stocktake/          # Stocktake list + detail
│   ├── reports/            # Inventory reporting with live data
│   └── production/         # Central kitchen production surface
│
└── api/
    ├── health/route.ts     # GET health check
    └── auth/signout/route.ts  # POST logout
```

## Thành phần chính

### Khung quản trị (`apps/web/app/admin/components/admin-shell.tsx`)

Layout chính cho toàn bộ route `/admin/*`. Thành phần này render:

- Collapsible sidebar with role-filtered navigation (reads `ADMIN_NAV_GROUPS` from `@comtammatu/shared/auth`)
- Lớp quản trị giữ nền tảng ERP và báo cáo điều hành, không phải menu gom mọi domain
- Header with user info and sign-out
- Responsive: sidebar collapses on mobile

Nhóm điều hướng được lọc qua `canAccess(role, moduleKey)` — phân hệ nào không có quyền sẽ bị ẩn.

### Form đăng nhập (`apps/web/app/(auth)/login/login-form.tsx`)

"use client" component. Uses React Hook Form + Zod validation. Calls `login()` server action. Displays error toast via Sonner on failure.

### Server action đăng nhập (`apps/web/app/(auth)/login/actions.ts`)

Server action with rate limiting (`loginRateLimit` from `@comtammatu/security`). Validates with Zod, calls `signInWithPassword()`, extracts claims, redirects to role default via `getDefaultRedirect()`.

## Vòng đời request

```
Browser request
  → proxy.ts (auth + ACL)
    → Next.js route matching
      → layout.tsx (RSC — may do additional auth checks)
        → page.tsx (RSC or client component)
          → Server Action (if mutation)
            → Supabase PostgREST (RLS enforced)
```

## Quy tắc import

| File Type                     | Can Import                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `page.tsx` (RSC)              | `@comtammatu/database`, `@comtammatu/shared`, `@comtammatu/ui`                 |
| `layout.tsx` (RSC)            | Same as page.tsx                                                               |
| `"use client"` components     | `@comtammatu/database/supabase/client`, `@comtammatu/shared`, `@comtammatu/ui` |
| `actions.ts` (Server Actions) | `@comtammatu/database`, `@comtammatu/shared`, `@comtammatu/security`           |

## Thêm một trang quản trị mới

1. Create `apps/web/app/admin/{module}/page.tsx`
2. Add `ModuleKey` to `packages/shared/src/auth/module-acl.ts` with allowed roles
3. Add route mapping in `apps/web/proxy.ts` → `resolveModule()`
4. Add nav item in `packages/shared/src/auth/nav-config.ts`
5. Verify: proxy routes correctly, sidebar shows/hides by role

## Các lỗi thường gặp

| Failure                                 | Signal                                   | Recovery                                                      |
| --------------------------------------- | ---------------------------------------- | ------------------------------------------------------------- |
| "use client" barrel import              | Turbopack build crash                    | Use `/supabase/client` import path                            |
| Missing module in proxy resolveModule() | 404 or no ACL check                      | Add URL pattern → ModuleKey mapping                           |
| Missing nav entry                       | Page exists but unreachable from sidebar | Add to `ADMIN_NAV_GROUPS`                                     |
| Layout auth check mismatch with proxy   | Double redirect or bypass                | Proxy is source of truth — layout checks are defense-in-depth |

## Lý do thiết kế

- **Proxy as single auth gate:** All auth enforcement happens in `proxy.ts` before any route code runs. Layout-level checks are defense-in-depth, not primary.
- **RSC by default:** Pages are React Server Components. Only interactive elements (forms, dropdowns) use "use client".
- **Admin is now narrower by design:** it keeps foundation controls and executive reporting, while deep domain workflows should live in dedicated workspaces.
- **Inventory is a standalone surface:** `/inventory` is the only live Inventory domain and should not be mirrored under `/admin/*`.
- **Remaining placeholders are narrower than before:** orders/hr/employee still have incomplete areas, while finance and reports now have live routes. CRM remains Post-v1.0.

<!-- ORACLE-META
Written by codebase-oracle (manual) | 2026-04-06
Data: Direct source reading
Audience: new engineer, feature owner | Confidence: 95%
Updated: Inventory ops + central kitchen production live (2026-04-14)
Unknowns: 0
-->
