# Phân hệ Web App

## Tổng quan

Ứng dụng Next.js App Router phục vụ đúng hai plane đã đăng nhập: `Admin
Dashboard` dành riêng cho Owner và `Branch` dành cho vận hành theo chi nhánh.
POS/KDS là station mode bên trong Branch; public/auth, Self-Order và public
Runner display là boundary bên ngoài hai plane. Package manifest sở hữu phiên
bản framework; route runtime và generated matrix sở hữu danh sách route hiện hành.

**Phạm vi sở hữu:** `apps/web/`

## Cấu trúc route

Route group `(protected)` và `(public)` là URL-neutral. Cây bên dưới tổ chức
theo runtime surface; file thực tế hiện nằm dưới
`apps/web/app/(protected)/*` cho các surface app đã đăng nhập và
`apps/web/app/(public)/*` cho các surface public/auth/return.

## Route contract hiện tại

Runtime route contract sống ở `packages/shared/src/auth/route-map.ts`, còn
quyền truy cập vẫn sống ở `packages/shared/src/auth/module-acl.ts`. Khi sửa
route hoặc shell, giữ đúng hai lớp: `module-acl.ts` quyết định capability có thể
tái sử dụng, còn `route-map.ts` + `canAccessRouteSurface()` quyết định audience
của plane. Admin Dashboard luôn Owner-only; không sửa các capability dùng chung
chỉ để đạt ranh giới này.

Role/scope/route boundary canonical sống ở
`docs/spec/role-route-matrix.md`: mọi top-level management family (`/admin`,
`/finance`, `/branches`, `/menu`, `/orders`, `/inventory`, `/hr`) thuộc Admin
Dashboard Owner-only; Branch Manager và Staff dùng L1 Branch dưới
`/br/[branchId]/*`. `/notifications` là utility của Branch cho mọi staff role.

| Plane / boundary | Route family                                                                                                             | Entry point                 | Navigation / scope contract                                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plane picker     | `/`                                                                                                                      | `/`                         | Owner luôn thấy lựa chọn Branch và Admin Dashboard, kể cả chỉ có một chi nhánh. Role Branch có một chi nhánh được chuyển thẳng vào `/br/{branchId}`.                            |
| Admin Dashboard  | `/admin/*`, `/finance/*`, `/branches/*`, `/menu/*`, `/orders/*`, `/inventory/*`, `/hr/*`                                | `/finance`                  | Owner-only route surface. Dùng một Admin Dashboard shell/sidebar; tab/filter ở URL. Deep link của non-owner fail closed về Branch home.                                          |
| Branch           | `/br/[branchId]/*`, `/notifications`                                                                                    | `/br/[branchId]`            | Branch Manager & Staff làm việc hằng ngày tại đây. `branchId` ở URL; proxy enforce branch scope. Notification link của role Branch được chuẩn hoá về route `/br/{branchId}/...`. |
| Public boundary  | `/login`, `/access-denied`, `/q/[token]`, public Runner display, public health/webhook endpoints                         | Theo link công khai         | Không dùng authenticated product shell; không đọc scope từ UI state.                                                                                                             |

Quy tắc history: thay đổi route đưa người dùng giữa các trang phải dùng
`Link` / `router.push` thường để nút Back của trình duyệt quay lại route trước.
Chỉ dùng `router.replace` cho state tab/filter/search-param trong cùng trang,
nơi Back không nên duyệt qua từng lần chỉnh filter.

Không lưu cây filesystem thủ công trong tài liệu này. Dùng CodeGraph hoặc
`rg --files apps/web/app`, và regenerate `docs/spec/role-route-matrix.md` khi
route contract thay đổi.

## Thành phần chính

### Khung Admin Dashboard (`apps/web/app/components/admin-dashboard-module-shell.tsx`)

Shell Owner dùng chung cho admin/menu/hr/orders; với route `/admin/*` thành phần này render:

- Sidebar thu gọn được với điều hướng Owner-only (đọc `ADMIN_NAV_GROUPS` từ `@comtammatu/shared/auth`)
- Lớp quản trị giữ metric, master data, control và thiết lập toàn hệ thống
- Header với thông tin user và nút đăng xuất
- Responsive: sidebar thu gọn trên mobile

Nhóm điều hướng trước hết qua `canAccessRouteSurface(role,
"admin_dashboard")`, sau đó mới lọc capability bằng `canAccess(role,
moduleKey)`.

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

## Thêm một trang Admin Dashboard

1. Đặt page trong top-level family đang sở hữu job (`/finance`, `/inventory`,
   `/orders`, `/hr`, `/menu`, `/branches`, hoặc `/admin/settings`)
2. Tái sử dụng `ModuleKey` hiện có; chỉ thêm key vào `module-acl.ts` khi thật sự
   xuất hiện capability mới
3. Thêm URL mapping trong `packages/shared/src/auth/route-resolution.ts`
4. Khai báo route family với surface `admin_dashboard` trong
   `packages/shared/src/auth/route-map.ts`
5. Thêm nav item Owner-only trong `packages/shared/src/auth/nav-config.ts`
6. Xác minh Owner vào được, non-Owner deep link bị trả về Branch, và capability
   dùng chung của Branch không bị thu hẹp

## Các lỗi thường gặp

| Failure                            | Signal                                   | Recovery                                                                                |
| ---------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------- |
| "use client" barrel import         | Turbopack build crash                    | Use `/supabase/client` import path                                                      |
| Missing module in route-resolution | 404 or no ACL check                      | Add URL pattern → ModuleKey mapping                                                     |
| Missing route-surface contract      | Plane audience is not enforced           | Add the family to `route-map.ts`; keep Admin Dashboard `admin_dashboard`                |
| Missing nav entry                  | Page exists but unreachable from sidebar | Add to `ADMIN_NAV_GROUPS`, unless the route is an intentional direct-only support route |
| Layout re-checks auth/ACL          | Double redirect or divergent gate        | Remove the duplicate check; proxy owns protected-route auth                             |

## Lý do thiết kế

- **Proxy là cổng auth duy nhất:** Mọi enforcement auth xảy ra trong `proxy.ts`
  trước khi route code chạy; layout/page đọc invariant, không dựng gate thứ hai.
- **Mặc định RSC:** Các page là React Server Components. Chỉ phần tử tương tác (form, dropdown) dùng "use client".
- **Admin Dashboard Owner-only có chủ đích:** giữ metric/control/master data L0 cho Owner; Branch Manager dùng `/br/[branchId]/*` cho toàn bộ việc chi nhánh.
- **Inventory có hai presentation trong hai plane:** `/inventory` là management workspace của Owner; `/br/[branchId]/stock` là runtime canonical của Branch.
- **Staff runtime đã live trong Branch:** profile, clock, attendance, schedule, leave request và payslip nằm dưới `/br/[branchId]/*`. `/hr` và `/hr/payroll/*` là Admin Dashboard Owner-only.
- **HR oversight tách khỏi daily work:** lịch sử chấm công và ảnh check-in tạm
  thời chỉ Owner xem trong Admin Dashboard; Branch giữ `Hôm nay`, `Đội ngũ`, và
  các phê duyệt theo chi nhánh.
- **Refund là Owner control:** Admin Dashboard giữ queue/tạo/duyệt hoàn tiền;
  Branch Orders chỉ giữ đơn đang chạy, đơn gần đây, và chi tiết đơn.
- **Finance mặc định là tài chính vận hành HKD:** doanh thu, giá trị tồn kho, food cost/lãi gộp, chi phí vận hành, tổng kết tiền mặt, và hỗ trợ HĐĐT đã live. Các route kế toán doanh nghiệp và đóng/mở lại kỳ không nằm trong app surface hiện tại.
- **Inventory settings are narrower now:** `/inventory/settings` chỉ giữ config danh mục nguyên liệu, đơn vị, ngưỡng cảnh báo, và QC; `page.tsx` redirect theo permission về categories/units/qc. Catalog pages canonical sống ở `/inventory/ingredients`, `/inventory/suppliers`, `/inventory/recipes`.
