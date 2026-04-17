# Phân hệ Web App

## Tổng quan

Ứng dụng Next.js 16.2 dùng App Router. Hệ phục vụ 5 bề mặt chính: quản trị, điều hành kho (`/inventory`), POS, KDS, và cổng nhân viên. M0 (Khung quản trị) + M1 (Thực đơn) + M2 (POS) + M3 (KDS) đã hoàn thành; Kho hàng hiện là bề mặt vận hành live cho HQ, bếp trung tâm, và chi nhánh.

**Phạm vi sở hữu:** `apps/web/`

## Cấu trúc route

```
apps/web/app/
├── layout.tsx              # Root: HTML, fonts (Inter), metadata
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
│   ├── orders/             # Legacy admin route; not part of primary Admin IA
│   ├── staff/              # Staff CRUD with role hierarchy auth (S3), excludes owner/super_manager
│   ├── hr/                 # Admin-side HR reporting entrypoints (deep links continue to /hr workspace)
│   │   └── payroll/        # Payroll periods list + [periodId] detail
│   ├── crm/                # Placeholder / deferred
│   ├── finance/            # Finance workflows + HĐĐT / VAS reporting
│   │   ├── chart-of-accounts/ # Chart of accounts management
│   │   ├── journal/        # Journal entries
│   │   ├── food-cost/      # Food cost analysis
│   │   └── statements/     # Financial statements
│   ├── reports/            # CEO/HQ reports hub
│   │   ├── revenue/        # Revenue reports
│   │   ├── inventory-value/ # Inventory valuation reports
│   │   └── stock-movement/ # Stock movement reports
│   └── settings/
│       ├── layout.tsx      # Auth guard + role-aware SettingsNav for foundation controls
│       ├── page.tsx        # Redirect: branch_manager/area_manager → tables, others → branches
│       ├── general/        # System settings key/value — owner/super_manager only
│       ├── branches/       # Branch CRUD + set_headquarters — owner/super_manager only
│       ├── areas/          # Area management — owner/super_manager only
│       ├── tables/         # Tables & zones per branch — all settings roles (branch-scoped)
│       ├── pos/            # POS terminal settings
│       ├── kds/            # KDS station settings
│       └── payments/       # Payment method configuration
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
│   ├── layout.tsx          # Employee shell with auth guard
│   ├── page.tsx            # Employee dashboard
│   ├── profile/            # Personal profile
│   ├── clock/              # Clock in/out
│   ├── attendance/         # Attendance history
│   ├── schedule/           # Work schedule
│   └── payslip/            # Payslip viewer
│
├── inventory/              # Inventory operations cockpit (HQ / central_kitchen / branch)
│   ├── layout.tsx          # Inventory shell with site context + role-aware nav
│   ├── page.tsx            # Task-queue-first dashboard by role/site
│   ├── ingredients/        # Ingredient master data (canonical catalog entry)
│   ├── recipes/            # Recipe management (BOM, procurement-scoped catalog entry)
│   ├── stock/              # Live stock levels by site (search + status filter)
│   ├── suppliers/          # Supplier directory (canonical catalog entry)
│   ├── purchase-orders/    # PO list + new + [id] detail
│   ├── receiving/          # HQ procurement hub (PO/GRN/invoice), not generic receiving
│   ├── grn/                # Goods received notes list + [id] detail, GRN confirm wired
│   ├── supplier-invoices/  # Supplier invoice matching + payment status actions
│   ├── transfers/          # Internal transfers list + [id] detail
│   ├── production/         # Central kitchen production surface (nav only for super_manager)
│   ├── stocktake/          # Stocktake list + [id] detail
│   ├── issues/             # Stock issue list + [id] detail, branch UX relabeled as "Cấp bếp"
│   ├── expiry/             # Expiry tracking
│   ├── reports/            # Inventory reporting with live data
│   └── settings/           # Inventory-specific settings
│       ├── layout.tsx      # Settings nav
│       ├── page.tsx        # Redirect to expiry settings
│       ├── ingredients/    # Compatibility redirect → /inventory/ingredients
│       ├── recipes/        # Compatibility redirect → /inventory/recipes
│       ├── suppliers/      # Compatibility redirect → /inventory/suppliers
│       └── expiry/         # Expiry alert thresholds
│
├── hr/                     # HR workspace (manager+)
│   ├── layout.tsx          # HR shell with auth guard
│   ├── page.tsx            # HR dashboard
│   └── payroll/            # Payroll periods list + [periodId] detail
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

## Inventory workspace hiện tại

### IA theo workflow

Inventory không còn dùng sidebar kiểu liệt kê chứng từ phẳng. `inventory-shell.tsx` hiện gom điều hướng theo nhịp vận hành thật:

- `Hôm nay`
- `Nhập hàng HQ`
- `Điều chuyển nội bộ`
- `Vận hành chi nhánh` hoặc `Tồn và xuất` tùy site
- `Bếp trung tâm`
- `Kiểm soát`
- `Danh mục`

Các nguyên tắc đang được code phản ánh:

- `Receiving` là hub procurement của HQ, không phải hub nhận hàng chung cho chi nhánh
- `Production` chỉ hiện trên nav cho `super_manager`
- `Issues` được đổi mental model ở branch thành `Cấp bếp`
- `Ingredients / Suppliers / Recipes` chỉ còn một cửa vào chính trong `Danh mục`

### Workflow đã wire thật ở UI

Các detail pages của Inventory không còn chỉ là read-only shells:

- `purchase-orders/[id]`: `draft` có thể gửi / hủy PO; `sent|partially_received` có thể tạo GRN từ PO
- `grn/[id]`: có action chốt nhập kho (`confirmGrn`)
- `transfers/[id]`: đã wire đủ state machine `draft -> confirmed_ship -> in_transit -> confirmed_receive -> received`
- `supplier-invoices`: đã có tạo hóa đơn NCC, tính lại đối soát, và ghi nhận thanh toán

Một số CTA vẫn được giữ là `sắp mở` có chủ đích khi chưa có input surface hoặc backend/reporting hoàn chỉnh, để tránh false promise.

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
- **Employee portal is live:** profile, clock, attendance, schedule, payslip pages shipped. HR workspace has payroll management.
- **Finance & reports expanded:** chart-of-accounts, journal, food-cost, statements, revenue, inventory-value, stock-movement all live.
- **Inventory settings are narrower now:** `/inventory/settings` chỉ giữ policy/config như expiry; catalog pages canonical sống ở `/inventory/ingredients`, `/inventory/suppliers`, `/inventory/recipes`, còn route settings cũ giữ redirect tương thích.
- **CRM remains Post-v1.0.**

<!-- ORACLE-META
Written by codebase-oracle (manual) | 2026-04-06
Data: Direct source reading
Audience: new engineer, feature owner | Confidence: 95%
Updated: Inventory IA/task queue sync + route tree refresh (2026-04-16)
Unknowns: 0
-->
