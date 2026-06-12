# Phân hệ Web App

## Tổng quan

Ứng dụng Next.js 16.2 dùng App Router. Snapshot 2026-06-10 tập trung vào các bề mặt chính: Admin (`/admin/*`), Inventory (`/inventory/*`), Finance (`/finance/*`), HR (`/hr/*`), Orders (`/orders`), Notifications (`/notifications`), Branch Command (`/br/[branchId]/dashboard`), POS (`/br/[branchId]/pos`), KDS (`/br/[branchId]/kds`), Runner customer display (`/br/[branchId]/runner`), Branch settings (`/br/[branchId]/settings/*`), Branch menu limits (`/br/[branchId]/menu-limits`), Trang nhân viên cho non-admin staff (`/employee/*`), plus public surfaces `/login`, `/access-denied`, `/payment/momo/return`. Khung quản trị + Thực đơn + POS + KDS đã hoàn thành; Kho hàng hiện là bề mặt vận hành live cho chi nhánh.

**Phạm vi sở hữu:** `apps/web/`

## Cấu trúc route

Route groups `(protected)` and `(public)` are URL-neutral. The tree below is
organized by runtime surface; the actual current files live under
`apps/web/app/(protected)/*` for authenticated app surfaces and
`apps/web/app/(public)/*` for public/auth/return surfaces.

## Route contract hiện tại

Runtime route contract sống ở `packages/shared/src/auth/route-map.ts`, còn
quyền truy cập vẫn sống ở `packages/shared/src/auth/module-acl.ts`. Khi sửa
route hoặc shell, cập nhật cả hai nơi liên quan: ACL quyết định ai được vào;
route-map quyết định route thuộc surface nào, dùng chrome nào, và rời surface
theo quy tắc nào.

Role/scope/route boundary canonical sống ở
`docs/spec/role-route-matrix.md`: `/admin/*` là L0 Tenant Command cho
owner/super_manager; Branch Manager dùng L1 Branch Command dưới
`/br/[branchId]/*`.

| Surface              | Route family                                                                                                 | Entry point                                               | Navigation / back contract                                                                                                                                                    | Breadcrumb / scope contract                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Root redirect        | `/`                                                                                                          | Shared role default                                       | Delegates to `getDefaultRedirect(claims)`: owner/super_manager → `/admin/dashboard`; non-admin staff including Branch Manager → `/employee`.                                  | No extra hub surface. Scope remains in JWT + route params.                                  |
| Public / auth        | `/login`, `/access-denied`, `/payment/momo/return`, `/br/[branchId]/runner`, public health/webhook endpoints | `/login`, external return URL, hoặc Runner display URL    | Không dùng app shell. Không giữ app back link.                                                                                                                                | Không đọc tenant/branch scope từ UI state. Runner display tự validate branch trong page.    |
| Admin foundation     | `/admin/dashboard`, `/admin/reports/*`, `/admin/staff/*`, tenant `/admin/settings/*`                         | `/admin/dashboard`                                        | `AdminShell` dùng admin sidebar và ẩn back link. Không dùng Admin như home chung cho mọi role hoặc nơi chứa branch setup mới.                                                 | Breadcrumb root là `Quản trị`; AdminShell build breadcrumb từ active nav + path tail.       |
| Admin direct support | `/admin/accounting/*`                                                                                        | Không có default nav entry                                | Direct-only route cho khóa/mở kỳ khi owner/super_manager cần, không quảng bá như workflow pilot hằng ngày.                                                                    | Vẫn đi qua Admin shell + ACL; không đưa vào `ADMIN_NAV_GROUPS`.                             |
| Domain workspaces    | `/menu/*`, `/orders/*`, `/inventory/*`, `/finance/*`, `/hr/*`, `/notifications/*`                            | `MODULE_ACL[module].path`                                 | Workspace shell dùng sidebar/domain nav; link rời workspace phải đi qua `resolveRoleHomeLink(role)`. `/hr/payroll/*` là direct-support, không đưa vào discovery/nav mặc định. | Breadcrumb root là nhóm `Công việc`; filter/tab state giữ trong URL, không lưu local state. |
| Branch operations    | `/br/[branchId]/dashboard`, `/pos/*`, `/kds/*`, `/settings/*`, `/menu-limits/*` dưới cùng branch URL         | `/br/[branchId]/{dashboard,pos,kds,settings,menu-limits}` | Operational chrome hoặc in-flow controls. POS/KDS ưu tiên hành động trong ca, không quay về Admin. Staff discovery vẫn có thể link sang Runner display public.                | `branchId` bắt buộc nằm trong URL; proxy enforce branch scope và network gate khi cần.      |
| Employee portal      | `/employee/*`                                                                                                | `/employee`                                               | Employee dùng bottom/desktop nav trong surface; admin-level role không vào `/employee/*`.                                                                                     | Breadcrumb nhẹ theo task portal; không trộn HR admin/payroll thành hot path nhân viên.      |
| Compatibility        | `/admin/inventory*`, `/admin/finance*`                                                                       | Không có active entry point                               | `/admin/finance*` canonical redirect sang `/finance*`; `/admin/inventory*` đi qua ACL retired module.                                                                         | Docs/runtime không quảng bá URL compatibility như entry point.                              |

History rule: route changes that move the user between pages should use normal
`Link` / `router.push` so browser Back returns to the previous route. Use
`router.replace` only for same-page tab/filter/search-param state where Back
should not step through every filter tweak.

```
apps/web/app/
├── layout.tsx              # Root: HTML, fonts (Inter/Montserrat/JetBrains Mono), metadata
├── page.tsx                # / → shared role default redirect
├── globals.css             # Tailwind 4.2 base styles
│
├── (public)/               # URL-neutral route group for unauthenticated / externally-returned surfaces
│   ├── (auth)/login/       # Public auth group; URL remains /login
│   │   ├── page.tsx        # Login page
│   │   ├── login-form.tsx  # "use client" form
│   │   └── actions.ts      # Server action: login()
│   ├── access-denied/      # Public — renders blocked-state copy; URL remains /access-denied
│   └── payment/momo/return/ # Public Momo redirect target after gateway flow; URL remains /payment/momo/return
│
├── (protected)/            # URL-neutral route group for authenticated app surfaces
│   ├── menu/               # Menu master data; URL remains /menu
│   ├── notifications/      # In-app notification inbox; URL remains /notifications
│   ├── orders/             # Cross-branch orders surface; URL remains /orders
│   ├── hr/                 # HR workspace; URL remains /hr; /hr/payroll/* is direct-support
│   ├── finance/            # Finance workspace; URL remains /finance/*
│   │   ├── revenue/        # Revenue rollups + [date] drilldown
│   │   ├── reconciliation/ # POS/subledger ↔ GL reconciliation
│   │   ├── chart-of-accounts/ # Chart of accounts management
│   │   ├── journal/        # Journal entries
│   │   ├── posting-rules/  # GL posting rules
│   │   ├── food-cost/      # Food cost analysis
│   │   ├── periods/        # Fiscal period management
│   │   ├── audit-trail/    # Finance audit log
│   │   └── statements/     # Financial statements
│   └── employee/           # Non-admin staff portal; URL remains /employee/*
│
├── admin/                  # Operations foundation + executive reporting shell
│   ├── layout.tsx          # AdminLayout (auth guard + sidebar)
│   ├── components/
│   │   └── admin-shell.tsx # Sidebar nav, executive shell, role-based filtering
│   ├── dashboard/          # Operations cockpit landing
│   ├── accounting/
│   │   └── periods/        # Direct-only period close/reopen support (owner/super_manager; ACCOUNTING_PERIOD_REOPEN gated)
│   ├── inventory/          # REMOVED — URL space maps to retired inventory_admin ACL only
│   ├── staff/              # Staff CRUD with role hierarchy auth, excludes owner/super_manager
│   │   ├── audit/          # Permission audit log viewer
│   │   └── [id]/permissions/ # Per-user grant/revoke + template apply
│   ├── finance/            # Compatibility redirect → /finance/* (also canonicalized in proxy + returnTo resolver)
│   ├── reports/            # CEO/tenant reports hub
│   │   ├── revenue/        # Revenue reports
│   │   ├── inventory-value/ # Inventory valuation reports
│   │   └── stock-movement/ # Stock movement reports
│   └── settings/
│       ├── layout.tsx      # Auth guard + role-aware SettingsNav for foundation controls
│       ├── page.tsx        # Redirect to tenant branch network
│       ├── general/        # System settings key/value — owner/super_manager only
│       ├── branches/       # Branch CRUD — owner/super_manager only
│       ├── tables/         # Tenant-admin compatibility; BM branch setup belongs under /br/[branchId]/settings
│       ├── pos/            # Tenant-admin compatibility; BM branch setup belongs under /br/[branchId]/settings
│       ├── kds/            # Tenant-admin compatibility; BM branch setup belongs under /br/[branchId]/settings
│       ├── payments/       # Tenant-admin compatibility; BM branch setup belongs under /br/[branchId]/settings
│       └── printers/       # Tenant-admin compatibility; BM branch setup belongs under /br/[branchId]/settings
│
├── br/[branchId]/
│   ├── dashboard/          # Branch Command landing for branch_manager
│   ├── pos/                # POS (cashier, waiter, branch_manager)
│   │   ├── layout.tsx      # Auth + ACL + branch validation
│   │   ├── page.tsx        # POS terminal UI
│   │   └── actions.ts      # Order CRUD, session management
│   ├── kds/                # KDS (chef, branch_manager)
│   │   ├── layout.tsx      # Auth + ACL + branch validation
│   │   ├── page.tsx        # KDS board — station tabs, realtime queue
│   │   ├── actions.ts      # bump/recall tickets, station CRUD, category mapping
│   │   ├── kds-board.tsx   # "use client" — realtime ticket board with Supabase subscription
│   │   └── order-card.tsx  # Individual order card with bump/recall buttons
│   ├── runner/             # Public Runner customer call screen; file path is URL-neutral
│   │   ├── layout.tsx      # Display shell only; no staff auth/account chrome
│   │   ├── page.tsx        # Read-only customer-facing queue display via server-only service client
│   │   └── runner-realtime-refresh.tsx # "use client" — realtime invalidation + poll fallback
│   ├── menu-limits/        # Daily sales limits per (branch, menu item) — branch_settings co-owners + cashier + chef
│   └── settings/           # Branch-scoped settings (kds, pos, pos-sessions, printers, tables)
│       ├── kds/
│       ├── pos/
│       ├── pos-sessions/
│       ├── printers/
│       └── tables/
│
├── inventory/              # Inventory operations cockpit (tenant / branch / branch)
│   ├── layout.tsx          # Inventory shell with site context + role-aware nav
│   ├── page.tsx            # Task-queue-first dashboard by role/site
│   ├── dashboard/          # Detailed dashboard view (separate from /inventory landing)
│   ├── ingredients/        # Ingredient master data (canonical catalog entry)
│   ├── recipes/            # Sales menu consumption recipe / Định mức món bán
│   ├── stock/              # Live stock levels by site (search + status filter)
│   ├── suppliers/          # Supplier directory (canonical catalog entry)
│   ├── supplier-invoices/  # Supplier invoice matching; AP payment is Finance handoff
│   ├── supplier-returns/   # QC at receiving + post-receipt returns (list + new + [id])
│   ├── purchase-orders/    # PO list + new + [id] detail
│   ├── receiving/          # tenant procurement hub (PO/GRN/invoice), not generic receiving
│   ├── grn/                # Goods received notes list + [id] detail, GRN confirm wired
│   ├── transfers/          # Internal transfers list + [id] detail
│   ├── production/         # Central kitchen production surface (super_manager/production_manager operator; owner deep-link oversight)
│   ├── stocktake/          # Stocktake list + count + [id] detail; new + conflicts + escalate child routes
│   ├── issues/             # Stock issue list + [id] detail for consumption/writeoff/other; Cấp bếp lives in transfers
│   ├── expiry/             # Expiry tracking
│   ├── waste/              # Waste flow — auto, new, approvals
│   ├── reports/            # Inventory reporting with live data
│   └── settings/           # Inventory-specific settings
│       ├── layout.tsx      # Settings nav
│       ├── page.tsx        # Redirect to expiry settings
│       ├── ingredients/    # Compatibility redirect → /inventory/ingredients
│       ├── recipes/        # Compatibility redirect → /inventory/recipes
│       ├── suppliers/      # Compatibility redirect → /inventory/suppliers
│       ├── expiry/         # Expiry alert thresholds
│       └── qc/             # QC config (rejection codes, photo policy)
│
└── api/
    ├── health/route.ts            # GET health check
    ├── auth/signout/route.ts      # POST logout
    ├── branch-presence/route.ts   # Branch presence beacon (POS/KDS heartbeats)
    ├── cron/hddt-archive/route.ts        # Cron: tải PDF/XML HĐĐT đã issued
    ├── cron/hddt-daily-summary/route.ts  # Cron: HĐĐT B2C daily summary (02:05 ICT)
    ├── cron/hddt-reconcile/route.ts      # Cron: poll CQT reconcile trạng thái HĐĐT
    ├── cron/kds-maintenance/route.ts     # Cron: KDS ticket maintenance/cleanup
    ├── cron/notifications-push/route.ts  # Cron: dispatch Web Push notifications
    ├── debug/claims/route.ts      # Dev: dump JWT claims (gated; not for prod use)
    └── webhooks/momo/route.ts     # Momo webhook handler (HMAC-validated)
```

> Ngoài `api/`, còn 2 `route.ts` PWA manifest: `(protected)/br/[branchId]/pos/manifest.webmanifest/route.ts` + `(protected)/br/[branchId]/kds/manifest.webmanifest/route.ts`.

## Thành phần chính

### Khung quản trị (`apps/web/app/(protected)/admin/components/admin-shell.tsx`)

Layout chính cho toàn bộ route `/admin/*`. Thành phần này render:

- Collapsible sidebar with role-filtered navigation (reads `ADMIN_NAV_GROUPS` from `@comtammatu/shared/auth`)
- Lớp quản trị giữ nền tảng vận hành và báo cáo điều hành, không phải menu gom mọi domain
- Header with user info and sign-out
- Responsive: sidebar collapses on mobile

Nhóm điều hướng được lọc qua `canAccess(role, moduleKey)` — phân hệ nào không có quyền sẽ bị ẩn.

### Form đăng nhập (`apps/web/app/(public)/(auth)/login/login-form.tsx`)

"use client" component. Uses React Hook Form + Zod validation. Calls `login()` server action. Displays error toast via Sonner on failure.

### Server action đăng nhập (`apps/web/app/(public)/(auth)/login/actions.ts`)

Server action with rate limiting (`loginRateLimit` from `@comtammatu/security`). Validates with Zod, calls `signInWithPassword()`, extracts claims, redirects through `resolvePostLoginRedirect()`.

## Inventory workspace hiện tại

### IA theo workflow

Inventory không còn dùng sidebar kiểu liệt kê chứng từ phẳng. `inventory-shell.tsx` hiện gom điều hướng theo nhịp vận hành thật:

- `Hôm nay`
- `Nhập hàng tenant`
- `Điều chuyển nội bộ`
- `Vận hành chi nhánh` hoặc `Tồn và xuất` tùy site
- `chi nhánh`
- `Kiểm soát`
- `Danh mục`

Các nguyên tắc đang được code phản ánh:

- `Receiving` là hub procurement của tenant, không phải hub nhận hàng chung cho chi nhánh
- `Production` chỉ hiện trên nav cho `super_manager` / `production_manager`; `owner` có access kiểm tra/khẩn cấp nhưng không được UX dẫn như operator hằng ngày
- `Issues` không còn là `Cấp bếp`; branch `Cấp bếp` đi qua intra-branch transfer tại `/inventory/transfers?create=cap-bep`
- `Ingredients / Suppliers / Định mức món bán` chỉ còn một cửa vào chính trong `Danh mục`

### Workflow đã wire thật ở UI

Các detail pages của Inventory không còn chỉ là read-only shells:

- `purchase-orders/[id]`: `draft` có thể gửi / hủy PO; `sent|partially_received` có thể tạo GRN từ PO
- `grn/[id]`: có action chốt nhập kho (`confirmGrn`)
- `transfers/[id]`: đã wire đủ state machine `draft -> confirmed_ship -> in_transit -> confirmed_receive -> received`
- `supplier-invoices`: đã có tạo hóa đơn NCC và tính lại đối soát; ghi nhận thanh toán là Finance/AP handoff, không phải action Inventory pilot
- `supplier-returns`: route family đã ẩn khỏi Inventory pilot; stock-return/credit-note/AP xử lý là deferred, không còn CTA daily UI từ dashboard hoặc GRN detail
- `stocktake/conflicts` và `stocktake/[id]/escalate`: S13b conflict/recount/escalation đã ẩn khỏi daily UI; pilot giữ open/count/complete

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

1. Create `apps/web/app/(protected)/admin/{module}/page.tsx`
2. Add `ModuleKey` to `packages/shared/src/auth/module-acl.ts` with allowed roles
3. Add URL mapping in `packages/shared/src/auth/route-resolution.ts`
4. Add route family / chrome contract in `packages/shared/src/auth/route-map.ts`
5. Add nav item in `packages/shared/src/auth/nav-config.ts`
6. Verify: proxy routes correctly, sidebar shows/hides by role, route family resolves to the intended surface

## Các lỗi thường gặp

| Failure                               | Signal                                   | Recovery                                                                                |
| ------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------- |
| "use client" barrel import            | Turbopack build crash                    | Use `/supabase/client` import path                                                      |
| Missing module in route-resolution    | 404 or no ACL check                      | Add URL pattern → ModuleKey mapping                                                     |
| Missing nav entry                     | Page exists but unreachable from sidebar | Add to `ADMIN_NAV_GROUPS`, unless the route is an intentional direct-only support route |
| Layout auth check mismatch with proxy | Double redirect or bypass                | Proxy is source of truth — layout checks are defense-in-depth                           |

## Lý do thiết kế

- **Proxy as single auth gate:** All auth enforcement happens in `proxy.ts` before any route code runs. Layout-level checks are defense-in-depth, not primary.
- **RSC by default:** Pages are React Server Components. Only interactive elements (forms, dropdowns) use "use client".
- **Admin is now narrower by design:** it keeps L0 foundation controls and executive reporting for owner/super_manager, while Branch Manager uses `/br/[branchId]/*` and deep domain workflows live in dedicated workspaces.
- **Inventory is a standalone surface:** `/inventory` is the canonical Inventory operations domain. `/admin/inventory/*` page files were removed; the URL space still maps to retired `inventory_admin` with empty `allowedRoles`, so no role passes the proxy ACL check.
- **Employee portal is live:** profile, clock, attendance, schedule, leave request, and payslip pages shipped. HR workspace defaults to nhân viên/ca/ngày công/nghỉ phép; `/hr/payroll/*` remains owner/super_manager direct-support for đối soát/chốt lương.
- **Finance default is HKD operating finance:** revenue, inventory value, food cost/gross profit, HĐĐT and support reconciliation are live; COA/journal/statements/period-close routes remain direct permissioned support, not default pilot navigation.
- **Inventory settings are narrower now:** `/inventory/settings` chỉ giữ policy/config như expiry; catalog pages canonical sống ở `/inventory/ingredients`, `/inventory/suppliers`, `/inventory/recipes`, còn route settings cũ giữ redirect tương thích.
