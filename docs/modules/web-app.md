# Phân hệ Web App

## Tổng quan

Ứng dụng Next.js App Router phục vụ **hai nửa sản phẩm** (Product Dual Thesis —
`docs/spec/architecture.md`):

1. **Quản lý hệ thống** — `control_surface` (L0 `/…`, `AppShell`, adapters `App*`)
2. **Vận hành bán hàng** — `branch_surface` + `station_chrome` (`/br/[branchId]/…`)

Plus public/auth. Package manifest sở hữu phiên bản framework; route runtime và
generated matrix sở hữu danh sách route hiện hành.

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
`docs/spec/role-route-matrix.md`: `/*` là L0 Tenant Command cho
owner; Branch Manager dùng L1 Branch Command dưới
`/br/[branchId]/*`.

| Surface           | Route family                                                                                                       | Entry point                      | Navigation / back contract                                                                                                                                                  | Breadcrumb / scope contract                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Root entry        | `/`                                                                                                                | Single-branch resolver           | `getDefaultRedirect(claims)`: branch-pinned staff → `/br/{branchId}`; Owner → `/`, rồi tự mở khi có đúng một active `branch` kind. Central kinds không phải operator scope. | Nhiều operating branch mới hiện picker; route scope sai fail closed.                                      |
| Public / auth     | `/login`, `/access-denied`, `/br/[branchId]/runner`, public health/webhook endpoints                               | `/login` hoặc Runner display URL | Không dùng app shell. Không giữ app back link.                                                                                                                              | Không đọc tenant/branch scope từ UI state. Runner display tự validate branch trong page.                  |
| control_surface   | L0 `/`, `/menu/*`, `/orders/*`, `/inventory/*`, `/finance/*`, `/hr/*`, `/branches/*`, `/settings/*`, `/feedback/*` | `/`                              | `ControlSurfaceShell` → `AppShell` (nav-as-data). `/` là LANDING; Settings và module con dùng deep-nav tương ứng. Actor theo `role-route-matrix`.                           | Breadcrumb root là `Quản trị` (`control_surface`); filter/tab state giữ trong URL, không lưu local state. |
| Utility           | `/notifications/*`                                                                                                 | Link kèm `returnTo`              | Không là product plane; dùng trang độc lập và quay lại context gọi.                                                                                                         | Không có sidebar riêng.                                                                                   |
| Branch operations | `/br/[branchId]/*`, gồm landing, dashboard, shift, profile, stock, pos, kds, runner, settings                      | `/br/[branchId]`                 | Branch runtime chrome hoặc operational chrome. POS/KDS ưu tiên hành động trong ca, không quay về Owner. Staff discovery vẫn có thể link sang Runner display public.         | `branchId` bắt buộc nằm trong URL; proxy enforce branch scope và network gate khi cần.                    |
| Staff day runtime | `/br/[branchId]/shift/*`, `/br/[branchId]/profile/*`                                                               | `/br/[branchId]/shift`           | Dùng Branch runtime bottom nav và shared Employee components; URL luôn mang `branchId`.                                                                                     | Breadcrumb nhẹ theo task runtime; không trộn HR admin/payroll thành hot path nhân viên.                   |

Quy tắc history: thay đổi route đưa người dùng giữa các trang phải dùng
`Link` / `router.push` thường để nút Back của trình duyệt quay lại route trước.
Chỉ dùng `router.replace` cho state tab/filter/search-param trong cùng trang,
nơi Back không nên duyệt qua từng lần chỉnh filter.

Không lưu cây filesystem thủ công trong tài liệu này. Dùng CodeGraph hoặc
`rg --files apps/web/app`, và regenerate `docs/spec/role-route-matrix.md` khi
route contract thay đổi.

## Thành phần chính

### Khung control_surface (`apps/web/app/components/control-surface-shell.tsx`)

Shell L0 duy nhất (nav-as-data) cho admin/menu/hr/orders/inventory/finance; render:

- Sidebar Quản trị đọc `CONTROL_SURFACE_NAV_GROUPS` từ `@comtammatu/shared/auth` qua
  `resolveControlSurfacePrimaryTabs` + `resolveControlSurfaceDeepNav`.
- `/` mở landing 1/2/3 cột; không thêm KPI khi chưa có data contract.
- Header với thông tin user và nút đăng xuất
- Responsive: sidebar thu gọn trên mobile

Nhóm điều hướng được lọc qua `canAccess(role, "owner")` trước khi
lọc capability của từng module. Branch Manager/Staff không nhận tenant nav.

### Form đăng nhập (`apps/web/app/(public)/(auth)/login/login-form.tsx`)

Component "use client". Dùng React Hook Form + Zod validation. Gọi server action `login()`. Hiện error toast qua Sonner khi thất bại.

### Server action đăng nhập (`apps/web/app/(public)/(auth)/login/actions.ts`)

Server action có rate limiting (`loginRateLimit` từ `@comtammatu/security`). Validate bằng Zod, gọi `signInWithPassword()`, trích xuất claims, redirect qua `resolvePostLoginRedirect()`.

## Inventory control_surface hiện tại

### Dual-plane IA (ADR 0012 / 0018)

- **control_surface** `/inventory/*` — AppShell + short sidebar; site filter mọi
  `branch_kind` ngang hàng (`branch`, `central_supply`, `central_kitchen`).
- **Branch Stock** `/br/[branchId]/stock/*` — plane ca riêng; không mirror
  control_surface shell/tile/primary CTA.
- Record Depth có thể khớp theo loại chứng từ; IA/nav/chrome **không** gộp.

### IA theo workflow

`resolveInventoryNav` + `flattenInventoryDeepNav` gom điều hướng Kho theo các
nhóm ổn định (UI sidebar vẫn flatMap một list ngắn):

- `0 · Nay`
- `1 · Kiểm soát tồn`: `Tồn kho`
- `2 · Nhập/Nhận/Đối soát`: `Nhập kho`, **Đơn mua hàng**, `Tiêu hao`, `Điều chuyển`
- `3 · Sản xuất`
- `4 · Danh mục & thiết lập`

Các nguyên tắc đang được code phản ánh:

- Canonical giao dịch Owner: `/inventory/grn`, `/inventory/purchase-orders`,
  `/inventory/consumption`, `/inventory/transfers`. `/inventory/operations` đã
  rút (không còn shim).
- Sidebar không quảng bá `Kiểm kê đối chiếu`, `Đếm tồn`, `Báo cáo` hoặc
  `Hóa đơn NCC`; route non-nav vẫn ACL/deep-link. Hóa đơn NCC canonical tại
  Finance; `/inventory/supplier-invoices` chỉ `REDIRECT-SHIM`.
- Supplier returns ngoài daily UI. Owner PO LIST theo ADR 0018 **C1** restore
  để xử lý PO tạo từ GRN; không có CTA tạo PO trực tiếp hoặc tạo GRN từ PO.
- Owner Production/GRN/stock theo site đang chọn trên filter (mọi kind);
  `branch_manager` vẫn Branch Stock + permission/scope riêng.
- `Tiêu hao` gom tiêu hao vận hành, hao hụt và xuất khác. Transfer có chủ đích
  chỉ đi giữa warehouse hợp lệ; không có same-branch Kho↔Bếp.
- `Ingredients / Suppliers / Định mức món bán` một cửa trong `Danh mục`.
- Prune: xóa helper chết (`receiving`/`expiry`); chuyển AP actions về Finance;
  rút shim tạm sau khi CTA đã canonical.

### Workflow đã wire thật ở UI

Các detail pages của Inventory không còn chỉ là read-only shells:

- `purchase-orders`: Inventory sidebar LIST **Đơn mua hàng** (ADR 0018 **C1**
  Owner restore) cho PO tạo từ GRN. Mỗi hàng mở read-only detail; action chỉ sửa
  giá và duyệt theo quyền, không có CTA tạo PO trực tiếp hoặc tạo GRN từ PO.
- `supplier-invoices`: Finance home at `/finance/supplier-invoices` with client
  under `finance/supplier-invoices/` (ADR 0018 Wave 2).
  `/inventory/supplier-invoices` is a `REDIRECT-SHIM` only.
- `grn/[id]`: có action chốt nhập kho (`confirmGrn`)
- `transfers/[id]`: đã wire đủ state machine `draft -> confirmed_ship -> in_transit -> confirmed_receive -> received`
- `supplier-returns`: không thuộc daily Inventory UI; stock-return/credit-note/AP đi qua quyết định riêng trước khi có CTA
- `stocktake/conflicts` và `stocktake/[id]/escalate`: conflict/recount/escalation không nằm trong daily UI; current stocktake flow là open/count/complete

Một số CTA vẫn được giữ là `sắp mở` có chủ đích khi chưa có input surface hoặc backend/reporting hoàn chỉnh, để tránh false promise.

## Vòng đời request

```
Browser request
  → proxy.ts (auth + ACL)
    → Next.js route matching
      → layout.tsx (RSC — trusts the proxy auth invariant)
        → page.tsx (RSC or client component)
          → Server Action (if mutation)
            → Supabase PostgREST (RLS enforced)
```

## Quy tắc import

| File Type                     | Can Import                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `page.tsx` (RSC)              | `@comtammatu/database/supabase/server`, `@comtammatu/shared`, `@comtammatu/ui`         |
| `layout.tsx` (RSC)            | Same as page.tsx                                                                       |
| `"use client"` components     | `@comtammatu/database/supabase/client`, `@comtammatu/shared`, `@comtammatu/ui`         |
| `actions.ts` (Server Actions) | Explicit server/service database subpath, `@comtammatu/shared`, `@comtammatu/security` |

## Thêm một trang quản trị mới

1. Tạo `apps/web/app/(protected)/{module}/page.tsx`
2. Thêm `ModuleKey` vào `packages/shared/src/auth/module-acl.ts` với các role được phép
3. Thêm URL mapping trong `packages/shared/src/auth/route-resolution.ts`
4. Thêm route family / chrome contract trong `packages/shared/src/auth/route-map.ts`
5. Thêm nav item trong `packages/shared/src/auth/nav-config.ts`
6. Xác minh: proxy route đúng, sidebar hiện/ẩn theo role, route family resolve về đúng surface dự kiến

## Các lỗi thường gặp

| Failure                            | Signal                                   | Recovery                                                                                          |
| ---------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| "use client" barrel import         | Turbopack build crash                    | Use `/supabase/client` import path                                                                |
| Missing module in route-resolution | 404 or no ACL check                      | Add URL pattern → ModuleKey mapping                                                               |
| Missing nav entry                  | Page exists but unreachable from sidebar | Add to `CONTROL_SURFACE_NAV_GROUPS`, unless the route is an intentional direct-only support route |
| Layout re-checks auth/ACL          | Double redirect or divergent gate        | Remove the duplicate check; proxy owns protected-route auth                                       |

## Lý do thiết kế

- **Proxy là cổng auth duy nhất:** Mọi enforcement auth xảy ra trong `proxy.ts`
  trước khi route code chạy; layout/page đọc invariant, không dựng gate thứ hai.
- **Mặc định RSC:** Các page là React Server Components. Chỉ phần tử tương tác (form, dropdown) dùng "use client".
- **control_surface là Owner-only:** giữ các control L0 cho Owner; Branch Manager dùng `/br/[branchId]/*` và workflow Branch-native.
- **Inventory là surface độc lập:** `/inventory` là domain vận hành Inventory canonical.
- **Staff runtime đã live:** profile, clock, attendance, schedule, leave request,
  và payslip nằm trong Branch. HR control_surface và `/hr/payroll/*` chỉ dành
  cho Owner.
- **Finance mặc định là tài chính vận hành:** doanh thu, giá trị tồn kho, food cost/lãi gộp, chi phí vận hành, tổng kết tiền mặt, và hỗ trợ HĐĐT đã live. Sổ kế toán doanh nghiệp, BCTC và đóng/mở lại kỳ chưa nằm trong app surface hiện tại.
- **Inventory settings are narrower now:** `/inventory/settings` chỉ giữ config danh mục nguyên liệu, đơn vị, một ngưỡng tồn `Min`, và QC; `page.tsx` redirect theo permission về categories/units/qc. Catalog pages canonical sống ở `/inventory/ingredients`, `/inventory/suppliers`, `/inventory/menu-recipes`. `/inventory/recipes` chỉ là redirect tương thích.
