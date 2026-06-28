# Task 3 — Hợp nhất IA Quản lý Người + Chi nhánh (đề xuất chờ duyệt)

Quyết định owner đã chốt: "Gộp IA + dựng lại luồng". Đây là đề xuất IA đích +
kế hoạch chia lát để owner duyệt trước khi dựng (đổi điều hướng hằng ngày).
Nguồn: T3 design workflow, verify ngược code thật.

## Hiện trạng (đã xác minh)

- **Quản lý người tách đôi:** `/admin/staff` (tài khoản/role/permission, owner-only,
  module `staff`) ↔ `/hr` (nhân viên/ca/chấm công/nghỉ phép/lương, owner+branch_manager,
  module `hr`/`hr_payroll`). Cùng người = `employees.profile_id = profiles.id`;
  `positions.code` drive cả staff-role (`staffRoleFromPositionCode`) lẫn nhãn HR.
- **Quản lý chi nhánh rải 3 chỗ:** `/admin/settings/(tenant)/branches` (list, 3 cấp),
  `/br/[branchId]/settings` (hub tile), `/br/[branchId]/menu-limits` (lạc ngoài hub).
- **Chrome:** `OfficeModuleShell` vs `BranchManagementShell` — ĐÃ cùng `AppShell` +
  `resolveOfficePrimaryTabs`; chỉ khác brand + nguồn tier2. KHÔNG đáng gộp về 1 shell.
- **Thiếu:** text-search ở list staff/branch (có sẵn pattern `InputGroup`+`matchesSearch`
  ở inventory để tái dùng); **không có** branch switcher.

## IA đích đề xuất

- **Người → 1 surface, lấy `/hr` làm nhà, đổi nhãn "Nhân sự"**, fold `/admin/staff/*`
  vào: `/hr/[employeeId]`, `/hr/[employeeId]/permissions`, `/hr/audit`, `/hr/positions`,
  + tab ca/chấm công/nghỉ/lương. Giữ `staff` ACL key (owner-only) tách biệt bên trong
  (ranh giới owner-only vs owner+manager là rule thật). Redirect `/admin/staff/* → /hr/*`
  (theo pattern `/admin/finance→/finance` ở `resolveLegacyRouteRedirectPath`).
- **Chi nhánh → gom:** list lên `/branches` (bỏ 3 cấp + route-group `(tenant)`);
  `menu-limits` vào hub `/br/[branchId]/settings/menu-limits`; còn lại giữ nguyên.
- **Branch switcher** mới trong `AppShell` (searchable combobox), ẩn khi ≤1 chi nhánh.
- **Search** thêm vào list Người + Chi nhánh (slot `search` của `AppToolbar`).

## Kế hoạch chia lát (mỗi lát ship độc lập, giữ URL cũ sống qua redirect)

| Lát | Phạm vi | Rủi ro |
|---|---|---|
| **S0** | Search 2 list + Branch switcher (additive, KHÔNG đổi route/ACL) | thấp nhất — ship ngay |
| **S1** | Dedup chrome (tách brand/breadcrumb dùng chung) | thấp (không đổi route) |
| **S2** | Người: `/admin/staff/* → /hr/*` + redirect + ACL/route-map/nav/coverage | trung |
| **S3** | Chi nhánh: `/admin/settings/branches → /branches` + redirect + key mới | trung |
| **S4** | `menu-limits` vào hub + sửa thứ tự contract/prefix | nhỏ nhưng dễ sập thứ tự — ship cuối |

Mỗi lát đụng route phải đồng bộ 5 chỗ: `module-acl.ts`, `route-resolution.ts`
(`resolveModuleFromPath` + prefix + `resolveLegacyRouteRedirectPath`), `route-map.ts`
(`ROUTE_FAMILY_CONTRACTS`, first-match → thứ tự quan trọng), nav (`nav-config.ts` +
`office-nav.ts` `resolveOfficeDeepNav`), và test `protected-route-module-coverage.test.ts`
(gate — như Task 1 đã bắt lỗi "no route family").

## Quyết định cần owner duyệt (5)

1. **Nhà của Người:** giữ `/hr` đổi nhãn "Nhân sự" (khuyến nghị) vs tạo `/admin/people` mới.
2. **Giữ `staff` ACL key tách biệt** (account/role admin owner-only, lồng trong `/hr`)
   vs gộp hẳn người về 1 scope `hr` (khuyến nghị: giữ tách).
3. **menu-limits:** chuyển vào hub settings đổi chrome + ai-truy-cập (cashier/chef hiện
   vào qua operational chrome) — xác nhận cashier/chef vẫn cần vào trong hub.
4. **Branch list:** module key mới `branches` vs tái dùng `settings`; `/branches` owner-only?
5. **Branch switcher:** chỉ owner vs mọi role đa-chi-nhánh (khuyến nghị: ẩn khi ≤1 CN).

## Trạng thái
- [ ] Owner duyệt hướng đích + 5 quyết định → ghi `docs/plan/decisions.md`.
- [ ] S0 (search + switcher) — additive, có thể ship ngay sau khi chốt switcher visibility.
- [ ] S1–S4 theo thứ tự, mỗi lát 1 PR, gate `protected-route-module-coverage.test.ts`.
