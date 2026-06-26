# Phân hệ Web App

## Tổng quan

Ứng dụng Next.js 16.2 dùng App Router. Các bề mặt chính: Admin (`/admin/*`), Inventory (`/inventory/*`), Finance (`/finance/*`), HR (`/hr/*`), Orders (`/orders`), Notifications (`/notifications`), Branch Command (`/br/[branchId]/dashboard`), POS (`/br/[branchId]/pos`), KDS (`/br/[branchId]/kds`), Runner customer display (`/br/[branchId]/runner`), Branch settings (`/br/[branchId]/settings/*`), Branch menu limits (`/br/[branchId]/menu-limits`), Trang nhân viên cho non-admin staff (`/employee/*`), plus public surfaces `/login`, `/access-denied`, `/payment/momo/return`. Khung quản trị + Thực đơn + POS + KDS đã hoàn thành; Kho hàng hiện là bề mặt vận hành live cho chi nhánh.

**Phạm vi sở hữu:** `apps/web/`

## Cấu trúc route

Route group `(protected)` và `(public)` là URL-neutral. Cây bên dưới tổ chức
theo runtime surface; file thực tế hiện nằm dưới
`apps/web/app/(protected)/*` cho các surface app đã đăng nhập và
`apps/web/app/(public)/*` cho các surface public/auth/return.

## Route contract hiện tại

Runtime route contract sống ở `packages/shared/src/auth/route-map.ts`, còn
quyền truy cập vẫn sống ở `packages/shared/src/auth/module-acl.ts`. Khi sửa
route hoặc shell, cập nhật cả hai nơi liên quan: ACL quyết định ai được vào;
route-map quyết định route thuộc surface nào, dùng chrome nào, và rời surface
theo quy tắc nào.

Role/scope/route boundary canonical sống ở
`docs/spec/role-route-matrix.md`: `/admin/*` là L0 Tenant Command cho
owner; Branch Manager dùng L1 Branch Command dưới
`/br/[branchId]/*`.

| Surface           | Route family                                                                                                 | Entry point                                               | Navigation / back contract                                                                                                                                                    | Breadcrumb / scope contract                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Root redirect     | `/`                                                                                                          | Shared role default                                       | Ủy quyền cho `getDefaultRedirect(claims)`: owner → `/admin/dashboard`; staff non-admin gồm cả Branch Manager → `/employee`.                                                   | Không có hub surface phụ. Scope nằm trong JWT + route params.                                |
| Public / auth     | `/login`, `/access-denied`, `/payment/momo/return`, `/br/[branchId]/runner`, public health/webhook endpoints | `/login`, external return URL, hoặc Runner display URL    | Không dùng app shell. Không giữ app back link.                                                                                                                                | Không đọc tenant/branch scope từ UI state. Runner display tự validate branch trong page.     |
| Admin foundation  | `/admin/dashboard`, `/admin/reports/*`, `/admin/staff/*`, tenant `/admin/settings/*`                         | `/admin/dashboard`                                        | `OfficeModuleShell` dùng admin sidebar và ẩn back link. Không dùng Admin như home chung cho mọi role hoặc nơi chứa branch setup mới.                                          | Breadcrumb root là `Quản trị`; OfficeModuleShell build breadcrumb từ active nav + path tail. |
| Domain workspaces | `/menu/*`, `/orders/*`, `/inventory/*`, `/finance/*`, `/hr/*`, `/notifications/*`                            | `MODULE_ACL[module].path`                                 | Workspace shell dùng sidebar/domain nav; link rời workspace phải đi qua `resolveRoleHomeLink(role)`. `/hr/payroll/*` là direct-support, không đưa vào discovery/nav mặc định. | Breadcrumb root là nhóm `Công việc`; filter/tab state giữ trong URL, không lưu local state.  |
| Branch operations | `/br/[branchId]/dashboard`, `/pos/*`, `/kds/*`, `/settings/*`, `/menu-limits/*` dưới cùng branch URL         | `/br/[branchId]/{dashboard,pos,kds,settings,menu-limits}` | Operational chrome hoặc in-flow controls. POS/KDS ưu tiên hành động trong ca, không quay về Admin. Staff discovery vẫn có thể link sang Runner display public.                | `branchId` bắt buộc nằm trong URL; proxy enforce branch scope và network gate khi cần.       |
| Employee portal   | `/employee/*`                                                                                                | `/employee`                                               | Employee dùng bottom/desktop nav trong surface; admin-level role không vào `/employee/*`.                                                                                     | Breadcrumb nhẹ theo task portal; không trộn HR admin/payroll thành hot path nhân viên.       |
| Compatibility     | `/admin/inventory*`, `/admin/finance*`                                                                       | Không có active entry point                               | `/admin/finance*` canonical redirect sang `/finance*`; `/admin/inventory*` bị chặn bởi `inventory_admin` empty ACL.                                                           | Docs/runtime không quảng bá URL compatibility như entry point.                               |

Quy tắc history: thay đổi route đưa người dùng giữa các trang phải dùng
`Link` / `router.push` thường để nút Back của trình duyệt quay lại route trước.
Chỉ dùng `router.replace` cho state tab/filter/search-param trong cùng trang,
nơi Back không nên duyệt qua từng lần chỉnh filter.

```
apps/web/app/
├── layout.tsx              # Root: HTML, fonts (Geist / Geist Mono via geist pkg), metadata
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
│   │   ├── food-cost/      # Food cost analysis
│   │   ├── expenses/       # HKD operating expense ledger
│   │   ├── invoices/       # Viettel S-invoice register
│   │   └── summary/        # B2C daily-summary trigger
│   └── employee/           # Non-admin staff portal; URL remains /employee/*
│
├── components/
│   └── office-module-shell.tsx # Shared Management shell (sidebar nav, role-based filtering) for admin/menu/hr/orders
│
├── admin/                  # Operations foundation + executive reporting shell
│   ├── layout.tsx          # AdminLayout (auth guard) — renders OfficeModuleShell
│   ├── dashboard/          # Operations cockpit landing
│   ├── inventory/          # Unsupported; blocked by inventory_admin ACL
│   ├── staff/              # Staff CRUD with role hierarchy auth, excludes owner
│   │   ├── audit/          # Permission audit log viewer
│   │   └── [id]/permissions/ # Per-user grant/revoke + template apply
│   ├── reports/            # CEO/tenant reports hub
│   │   ├── inventory-value/ # Inventory valuation reports
│   │   └── stock-movement/ # Stock movement reports
│   └── settings/
│       ├── layout.tsx      # Auth guard + role-aware SettingsNav for foundation controls
│       ├── page.tsx        # Redirect to tenant branch network
│       ├── general/        # System settings key/value — owner only
│       ├── branches/       # Branch CRUD — owner only
│       ├── payments/       # Tenant-level payment provider/system settings — owner only
│       └── printers/       # Tenant printer support hub: branch config links, templates, jobs
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
│   │   └── runner-realtime-refresh.tsx # "use client" — polling invalidation
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
│   ├── production/         # Central kitchen production surface (production_manager operator; owner deep-link oversight)
│   ├── stocktake/          # Stocktake list + count + [id] detail; new + conflicts + escalate child routes
│   ├── consumption/        # Consumption list + [id] detail for approved branch food cost
│   ├── issues/             # Compatibility stock issue list + [id] detail for consumption/writeoff/other
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
    ├── debug/claims/route.ts      # Dev: dump JWT claims (gated; not for prod use)
    ├── webhooks/momo/route.ts     # Momo webhook handler (HMAC-validated)
    └── webhooks/sepay/route.ts    # SePay bank-transfer webhook handler (HMAC-validated)
```

> Ngoài `api/`, còn 3 `route.ts` PWA manifest: `(protected)/br/[branchId]/pos/manifest.webmanifest/route.ts` + `(protected)/br/[branchId]/kds/manifest.webmanifest/route.ts` + `(protected)/br/[branchId]/runner/manifest.webmanifest/route.ts`.

## Thành phần chính

### Khung quản trị (`apps/web/app/components/office-module-shell.tsx`)

Shell Management dùng chung cho admin/menu/hr/orders; với route `/admin/*` thành phần này render:

- Sidebar thu gọn được với điều hướng lọc theo role (đọc `ADMIN_NAV_GROUPS` từ `@comtammatu/shared/auth`)
- Lớp quản trị giữ nền tảng vận hành và báo cáo điều hành, không phải menu gom mọi domain
- Header với thông tin user và nút đăng xuất
- Responsive: sidebar thu gọn trên mobile

Nhóm điều hướng được lọc qua `canAccess(role, moduleKey)` — phân hệ nào không có quyền sẽ bị ẩn.

### Form đăng nhập (`apps/web/app/(public)/(auth)/login/login-form.tsx`)

Component "use client". Dùng React Hook Form + Zod validation. Gọi server action `login()`. Hiện error toast qua Sonner khi thất bại.

### Server action đăng nhập (`apps/web/app/(public)/(auth)/login/actions.ts`)

Server action có rate limiting (`loginRateLimit` từ `@comtammatu/security`). Validate bằng Zod, gọi `signInWithPassword()`, trích xuất claims, redirect qua `resolvePostLoginRedirect()`.

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
- `Production` chỉ là happy path cho `central_kitchen`; `owner` có access kiểm tra/khẩn cấp nhưng không được UX dẫn như operator hằng ngày
- `Consumption` là actual branch food cost; `/inventory/transfers?create=cap-bep` chỉ còn là compat redirect sang `/inventory/consumption`
- `Ingredients / Suppliers / Định mức món bán` chỉ còn một cửa vào chính trong `Danh mục`

### Workflow đã wire thật ở UI

Các detail pages của Inventory không còn chỉ là read-only shells:

- `purchase-orders/[id]`: `draft` có thể gửi / hủy PO; `sent|partially_received` có thể tạo GRN từ PO
- `grn/[id]`: có action chốt nhập kho (`confirmGrn`)
- `transfers/[id]`: đã wire đủ state machine `draft -> confirmed_ship -> in_transit -> confirmed_receive -> received`
- `supplier-invoices`: có tạo hóa đơn NCC và tính lại đối soát; ghi nhận thanh toán là Finance/AP handoff, không phải action Inventory
- `supplier-returns`: không thuộc daily Inventory UI; stock-return/credit-note/AP đi qua quyết định riêng trước khi có CTA
- `stocktake/conflicts` và `stocktake/[id]/escalate`: conflict/recount/escalation không nằm trong daily UI; current stocktake flow là open/count/complete

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

1. Tạo `apps/web/app/(protected)/admin/{module}/page.tsx`
2. Thêm `ModuleKey` vào `packages/shared/src/auth/module-acl.ts` với các role được phép
3. Thêm URL mapping trong `packages/shared/src/auth/route-resolution.ts`
4. Thêm route family / chrome contract trong `packages/shared/src/auth/route-map.ts`
5. Thêm nav item trong `packages/shared/src/auth/nav-config.ts`
6. Xác minh: proxy route đúng, sidebar hiện/ẩn theo role, route family resolve về đúng surface dự kiến

## Các lỗi thường gặp

| Failure                               | Signal                                   | Recovery                                                                                |
| ------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------- |
| "use client" barrel import            | Turbopack build crash                    | Use `/supabase/client` import path                                                      |
| Missing module in route-resolution    | 404 or no ACL check                      | Add URL pattern → ModuleKey mapping                                                     |
| Missing nav entry                     | Page exists but unreachable from sidebar | Add to `ADMIN_NAV_GROUPS`, unless the route is an intentional direct-only support route |
| Layout auth check mismatch with proxy | Double redirect or bypass                | Proxy is source of truth — layout checks are defense-in-depth                           |

## Lý do thiết kế

- **Proxy là cổng auth duy nhất:** Mọi enforcement auth xảy ra trong `proxy.ts` trước khi bất kỳ code route nào chạy. Check ở tầng layout là defense-in-depth, không phải tuyến chính.
- **Mặc định RSC:** Các page là React Server Components. Chỉ phần tử tương tác (form, dropdown) dùng "use client".
- **Admin nay hẹp lại có chủ đích:** giữ các control nền tảng L0 và báo cáo điều hành cho owner, còn Branch Manager dùng `/br/[branchId]/*` và các workflow domain sâu nằm trong workspace riêng.
- **Inventory là surface độc lập:** `/inventory` là domain vận hành Inventory canonical. `/admin/inventory/*` không được hỗ trợ và bị chặn bởi `inventory_admin` với `allowedRoles` rỗng.
- **Employee portal đã live:** các page profile, clock, attendance, schedule, leave request, và payslip là surface nhân viên hiện hành. HR workspace mặc định mở nhân viên/ca/ngày công/nghỉ phép; `/hr/payroll/*` vẫn là direct-support cho owner để đối soát/chốt lương.
- **Finance mặc định là tài chính vận hành HKD:** doanh thu, giá trị tồn kho, food cost/lãi gộp, chi phí vận hành, tổng kết tiền mặt, và hỗ trợ HĐĐT đã live. Các route kế toán doanh nghiệp và đóng/mở lại kỳ không nằm trong app surface hiện tại.
- **Inventory settings are narrower now:** `/inventory/settings` chỉ giữ policy/config như expiry; catalog pages canonical sống ở `/inventory/ingredients`, `/inventory/suppliers`, `/inventory/recipes`, còn route settings cũ giữ redirect tương thích.
