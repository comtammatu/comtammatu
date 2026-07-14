# Phân hệ Web App

## Tổng quan

Ứng dụng Next.js App Router có đúng hai mặt phẳng sản phẩm đã đăng nhập:
Admin Dashboard chỉ dành cho Owner và Branch dành cho công việc hằng ngày của
Branch Manager/Staff. POS, KDS và Runner là mode toàn màn hình của Branch;
public/auth nằm ngoài hai mặt phẳng này. Package manifest sở hữu phiên bản
framework; route runtime và generated matrix sở hữu danh sách route hiện hành.

**Phạm vi sở hữu:** `apps/web/`

## Cấu trúc route

Route group `(protected)` và `(public)` là URL-neutral. Cây bên dưới tổ chức
theo runtime surface; file thực tế hiện nằm dưới
`apps/web/app/(protected)/*` cho các surface app đã đăng nhập và
`apps/web/app/(public)/*` cho các surface public/auth/return.

## Route contract hiện tại

Runtime route contract sống ở `packages/shared/src/auth/route-map.ts`, còn
policy audience của surface và capability ACL sống ở
`packages/shared/src/auth/module-acl.ts`. Admission luôn theo thứ tự: xác định
surface → kiểm tra audience bằng `canAccessRouteSurface` → kiểm tra capability
bằng `canAccess` → kiểm tra branch scope/permission. Capability dùng chung như
`inventory` hay `orders` không tự cho phép role Branch đi vào URL Admin Dashboard.

Role/scope/route boundary canonical sống ở
`docs/spec/role-route-matrix.md`: `/admin/*`, `/menu/*`, `/orders/*`,
`/inventory/*`, `/finance/*`, `/hr/*`, `/branches/*` thuộc Admin Dashboard và
chỉ Owner được vào; Branch Manager/Staff làm việc dưới `/br/[branchId]/*`.

| Surface         | Route family                                                                                       | Entry point                                            | Navigation / back contract                                                                                                                                           | Breadcrumb / scope contract                                                              |
| --------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Root entry      | `/`                                                                                                | Plane/location picker                                  | Owner luôn thấy lựa chọn Admin Dashboard và các Branch, kể cả chỉ có một Branch. Role Branch có thể đi thẳng vào Branch được gán.                                    | Chỉ site `branch` đang hoạt động là operator scope; route scope sai fail closed.         |
| Admin Dashboard | `/admin/*`, `/menu/*`, `/orders/*`, `/inventory/*`, `/finance/*`, `/hr/*`, `/branches/*`           | `/finance` hiện là entry card từ picker                | `AdminDashboardModuleShell` hoặc domain shell dùng chung `AppShell`; toàn bộ surface chỉ Owner. `/hr/payroll/*` là direct-support, không quảng bá mặc định.          | Breadcrumb/deep nav đến từ `admin-dashboard-nav.ts`; filter/tab state ở URL.             |
| Branch          | `/br/[branchId]/*`, gồm Hub, shift, profile, stock, orders, team, settings, POS/KDS/Runner         | `/br/[branchId]`                                       | Branch Hub là home duy nhất. `/dashboard` chỉ redirect về Hub. Không đặt link Finance/HR/payroll/global menu trong Branch. POS/KDS/Runner dùng chrome toàn màn hình. | `branchId` bắt buộc ở URL; proxy enforce branch scope và network gate khi cần.           |
| Public / auth   | `/login`, `/access-denied`, `/payment/momo/return`, exact Runner display, health/webhook endpoints | `/login`, external return URL, hoặc Runner display URL | Không dùng app shell.                                                                                                                                                | Không đọc tenant/branch scope từ UI state; Runner display tự validate branch trong page. |

Quy tắc history: thay đổi route đưa người dùng giữa các trang phải dùng
`Link` / `router.push` thường để nút Back của trình duyệt quay lại route trước.
Chỉ dùng `router.replace` cho state tab/filter/search-param trong cùng trang,
nơi Back không nên duyệt qua từng lần chỉnh filter.

Không lưu cây filesystem thủ công trong tài liệu này. Dùng CodeGraph hoặc
`rg --files apps/web/app`, và regenerate `docs/spec/role-route-matrix.md` khi
route contract thay đổi.

## Thành phần chính

### Khung Admin Dashboard (`apps/web/app/components/admin-dashboard-module-shell.tsx`)

`AdminDashboardModuleShell` dùng chung cho admin/menu/hr/orders và chỉ render sau
khi proxy đã xác nhận role Owner:

- Sidebar/bottom-nav dùng `ADMIN_DASHBOARD_ITEMS` từ `@comtammatu/shared/auth`
- Lớp quản trị giữ nền tảng, chỉ số và control Owner, không trộn công việc trong ca
- Header với thông tin user và nút đăng xuất
- Responsive: bottom-nav + drawer ở `<lg`, fixed sidebar ở `≥lg`

Nav resolver kiểm tra surface Owner-only trước capability; ẩn link không thay thế
enforcement của proxy.

### Form đăng nhập (`apps/web/app/(public)/(auth)/login/login-form.tsx`)

Component "use client". Dùng React Hook Form + Zod validation. Gọi server action `login()`. Hiện error toast qua Sonner khi thất bại.

### Server action đăng nhập (`apps/web/app/(public)/(auth)/login/actions.ts`)

Server action có rate limiting (`loginRateLimit` từ `@comtammatu/security`). Validate bằng Zod, gọi `signInWithPassword()`, trích xuất claims, redirect qua `resolvePostLoginRedirect()`.

## Inventory trong Admin Dashboard

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

- `/inventory/operations` là hub giao dịch kho theo tab: GRN, điều chuyển nội bộ, phiếu xuất
- Purchase orders và supplier returns không còn surface hằng ngày; GRN bắt đầu từ NCC, còn DB/RPC/history cũ vẫn được giữ theo D073
- `Production` chạy tại chính chi nhánh; owner và `branch_manager` đi qua
  permission + branch scope hiện hành.
- `Consumption` là actual branch food cost; không tái mở same-branch Kho↔Bếp
  transfer.
- `Ingredients / Suppliers / Định mức món bán` chỉ còn một cửa vào chính trong `Danh mục`

### Workflow đã wire thật ở UI

Các detail pages của Inventory không còn chỉ là read-only shells:

- `purchase-orders/**`: chỉ còn compatibility redirect sang GRN supplier-first; không có PO mutation hoặc presenter
- `grn/[id]`: có action chốt nhập kho (`confirmGrn`)
- `transfers/[id]`: đã wire đủ state machine `draft -> confirmed_ship -> in_transit -> confirmed_receive -> received`
- `supplier-invoices`: có tạo hóa đơn NCC và tính lại đối soát; ghi nhận thanh toán là Finance/AP handoff, không phải action Inventory
- `supplier-returns`: không thuộc daily Inventory UI; stock-return/credit-note/AP đi qua quyết định riêng trước khi có CTA
- `stocktake/conflicts` và `stocktake/[id]/escalate`: conflict/recount/escalation không nằm trong daily UI; current stocktake flow là open/count/complete

Một số CTA vẫn được giữ là `sắp mở` có chủ đích khi chưa có input surface hoặc backend/reporting hoàn chỉnh, để tránh false promise.

## Vòng đời request

```
Browser request
  → proxy.ts (auth → route surface audience → module capability → branch scope)
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

1. Tạo route dưới root Admin Dashboard phù hợp.
2. Thêm hoặc tái sử dụng `ModuleKey` trong `module-acl.ts` cho capability.
3. Thêm URL mapping trong `route-resolution.ts` khi cần.
4. Khai báo route family với surface `admin_dashboard` trong `route-map.ts`.
5. Thêm nav item vào `ADMIN_DASHBOARD_ITEMS` trong `nav-config.ts`.
6. Test Owner được vào, mọi non-Owner bị đưa về Branch, đồng thời route Branch
   dùng chung capability vẫn hoạt động.

## Các lỗi thường gặp

| Failure                            | Signal                                   | Recovery                                                                                     |
| ---------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| "use client" barrel import         | Turbopack build crash                    | Use `/supabase/client` import path                                                           |
| Missing module in route-resolution | 404 or no ACL check                      | Add URL pattern → ModuleKey mapping                                                          |
| Missing nav entry                  | Page exists but unreachable from sidebar | Add to `ADMIN_DASHBOARD_ITEMS`, unless the route is an intentional direct-only support route |
| Layout re-checks auth/ACL          | Double redirect or divergent gate        | Remove the duplicate check; proxy owns protected-route auth                                  |

## Lý do thiết kế

- **Proxy là cổng auth duy nhất:** Mọi enforcement auth xảy ra trong `proxy.ts`
  trước khi route code chạy; layout/page đọc invariant, không dựng gate thứ hai.
- **Mặc định RSC:** Các page là React Server Components. Chỉ phần tử tương tác (form, dropdown) dùng "use client".
- **Admin Dashboard là Owner-only:** giữ chỉ số, control nền tảng L0 và các mô-đun cross-branch; Branch Manager/Staff không phải Admin user ít tab hơn.
- **Branch là mặt phẳng công việc hằng ngày:** Inventory/Orders/People flow cho role Branch đi qua route `/br/[branchId]/*`, không qua root Admin Dashboard.
- **Nhân viên làm việc trong Branch:** profile, clock, attendance, schedule, leave request và payslip nằm dưới `/br/[branchId]/*`; `/hr/*` và `/hr/payroll/*` chỉ dành cho Owner.
- **Finance mặc định là tài chính vận hành HKD:** doanh thu, giá trị tồn kho, food cost/lãi gộp, chi phí vận hành, tổng kết tiền mặt, và hỗ trợ HĐĐT đã live. Các route kế toán doanh nghiệp và đóng/mở lại kỳ không nằm trong app surface hiện tại.
- **Inventory settings are narrower now:** `/inventory/settings` chỉ giữ config danh mục nguyên liệu, đơn vị, ngưỡng cảnh báo, và QC; `page.tsx` redirect theo permission về categories/units/qc. Catalog pages canonical sống ở `/inventory/ingredients`, `/inventory/suppliers`, `/inventory/recipes`.
