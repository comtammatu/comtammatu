# Operator Workspace Blueprint — Hợp nhất Cổng nhân viên + Branch Management (2026-06-29)

> Reconciled-through 49112fa17fec
>
> **North-star (vision + architecture of record), mobile-first.** Verify-through code @ working tree 2026-06-29 (HEAD `406d7c52`). Quyết định owner bền: `docs/plan/decisions.md` → **D050**. Doc này là thiết kế đích + lộ trình tách việc; không lặp lý lẽ đã ghi ở D050.
>
> Khớp với khung sẵn có: 2 họ chrome (D019.1), `/admin` owner-only + domain workspaces độc lập (D017), path-based routing `/br/[branchId]/*` (D009), role-route-matrix là SSoT route-home (D019.2), nav-là-data (D019.4). Office-side People/Branch IA do `task3-mgmt-ia-consolidation.md` sở hữu; HR đang rebuild ở D026/D027.

## 1. Một câu

Gộp "Cổng nhân viên" và "Branch Management" thành **một Operator Workspace mobile-first per-chi-nhánh**: nhân viên vào → chọn/được-gán 1 chi nhánh → một branch-context dùng chung → mọi việc làm được hiện ra dưới dạng **capability tiles gate theo role**, trên một họ chrome duy nhất (họ "Vận hành" của D019, làm chín).

## 2. Hiện trạng đã xác minh (3 nỗi đau)

1. **Họ "Vận hành" chưa chín.** `/employee/*` (PWA header + bottom-nav) và POS/KDS/Runner (`OperationalPwaProvider` full-screen) cùng họ chrome D019 nhưng **không chia khung**: nav viết tay (`NAV_ITEMS`), `MobileHeader`/bottom-nav copy giữa employee và inventory-mobile, không entry chung. Branch command/setup `/br/[branchId]/{dashboard,settings}` lại render trong họ "Quản trị" (`AppShell` desktop) → manager điều hành hằng ngày phải nhảy chrome.
2. **3 cơ chế branch-scope rời nhau.** Employee = `claims.branch_id` (cố định, không picker); Inventory = `?branchId=N` (query param); POS/KDS/Runner = segment `[branchId]`. Không có "current branch" thống nhất; mỗi page query lại bảng `branches`.
3. **Route operator rải rác.** Việc _tại_ chi nhánh nằm ở `/employee/*` + `/inventory/*` + `/br/[branchId]/*` — không một gốc.

Giữ được (tài sản tốt): design tokens OKLCH + Geist + Tailwind v4, `AppBottomNav`, primitive touch (`NumberPadSheet`, `InteractiveCard`, `size="touch-lg"`), realtime store (`useSyncExternalStore` + coalescer), `MODULE_ACL` + `has_permission` RPC, `resolveInventoryBranchScope` (bản branch-scope sạch nhất).

## 3. Hai mặt phẳng = 2 họ chrome D019 (không có họ thứ 3)

| Operator plane — họ "Vận hành" (matured) — `/br/[branchId]/*` (phone + tablet)                                                               | Office plane — họ "Quản trị" (`AppShell`, desktop)                    |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `/` Operator home — tiles theo role _(thay `/employee` home)_                                                                                | `/admin/*` L0 tenant command (owner-only, D017)                       |
| `/shift/*` clock · tasks · schedule · leave · payslip _(từ `/employee/_`)\*                                                                  | `/hr/*` nhân sự · ngày công · lương _(domain workspace độc lập)_      |
| `/pos` · `/kds` · `/runner` _(giữ UI, re-root)_                                                                                              | `/finance/*`                                                          |
| `/stock/*` count · receive · transfer · waste _(slice sàn của Kho)_                                                                          | `/menu` catalog món (tenant)                                          |
| `/menu-limits` _(giới hạn ngày, per-branch)_                                                                                                 | `/inventory/*` procurement · production · catalog · recipe · supplier |
| `/approvals` checkout + waste _(manager)_                                                                                                    | `/branches` list quản lý CN                                           |
| `/overview` doanh thu · cảnh báo _(manager/owner)_                                                                                           |                                                                       |
| `/dashboard` · `/pos-sessions` · `/settings/*` tables · pos · kds · printers _(branch command/setup/reconcile, kéo từ AppShell sang — D050)_ |                                                                       |

Cắt theo _ai-làm-ở-đâu_, không theo bảng dữ liệu:

- **Kho tách đôi:** việc sàn hằng ngày → Operator; back-office nặng (PO/production/catalog/report) → Office.
- **Menu tách Menu-Limits:** định nghĩa món = Office/tenant; giới hạn ngày = Operator/per-branch.

## 4. Branch Hub — entry duy nhất (device-aware)

Nâng cấp `resolvePostLoginRedirect` thành điểm quyết định duy nhất (thay fork `owner→/admin, else→/employee`). Không phá route-home matrix (D019.2):

1. Mở từ **station PWA đã cài** (start_url `/br/{id}/{pos,kds,runner}`, display-mode standalone) → vào thẳng station đó.
2. **Desktop + owner/office** → Office plane (`/admin/dashboard`).
3. Còn lại (phone/tablet, kể cả owner trên phone) → Operator plane:
   - `allowedBranches.length > 1` → branch picker → `/br/{chọn}`.
   - ngược lại (staff pin) → `/br/{branch được gán}` (Hub tự điền branchId, không hiện picker).
   - → Operator home (tiles theo role).

Owner landing theo thiết bị: desktop → Office; phone → Operator "Overview" của 1 CN.

## 5. Phone Operator shell — nav + capability tiles

**Capability registry = mở rộng `nav-config.ts`** (D019.4 "nav là data"), thêm metadata tile (`group`, `icon`, `requiredCaps`). Home render đúng tile role được phép (server-gated qua `canAccess`/`has_permission` — auth không đổi). Thay cả `NAV_ITEMS` viết tay của employee lẫn việc nhồi tier1/tier2. Route home vẫn canonical ở `role-route-matrix.md`.

**Bottom-nav** 4 anchor cố định cho mọi role: `Trang chủ · Ca · Thông báo · Hồ sơ` (bỏ hack `MAX_VISIBLE_ITEMS=5` đổi item cuối). Việc theo-CN vào qua tile, không nhồi nav.

**Smart card** = tái dùng `today-work-state`: chưa vào ca → "Chấm công vào"; trong ca → tiến độ việc; manager → "Cần duyệt N". Đổi theo trạng thái, **không** đổi nav.

**Capability matrix** (role → nhóm tile; mỗi ô vẫn gate server-side):

| Nhóm tile                                              | owner | branch_manager | warehouse_mgr | production_mgr | cashier | chef |
| ------------------------------------------------------ | :---: | :------------: | :-----------: | :------------: | :-----: | :--: | --- |
| Ca của tôi (chấm công · việc · lịch · phép · lương)    |   –   |       ✓        |       ✓       |       ✓        |    ✓    |  ✓   |
| Bán hàng (POS · bàn · đơn)                             |   ✓   |       ✓        |       –       |       –        |    ✓    |  –   |
| Bếp (KDS · runner)                                     |   ✓   |       ✓        |       –       |       –        |    –    |  ✓   |
| Kho (đếm · nhận · điều chuyển · hao hụt)               |   ✓   |       ✓        |       ✓       |       ✓        |    –    |  –   |
| Sản xuất (production)                                  |   ✓   |       ✓        |       –       |       ✓        |    –    |  –   |
| Điều hành CN (giới hạn món · duyệt · cài đặt · ca kíp) |   ✓   |       ✓        |       –       |       –        |    –    |  –   |
| Tổng quan (doanh thu · cảnh báo)                       |   ✓   |       ✓        |       –       |       –        |    –    |  –   | –   |

## 6. Branch-context — 1 provider thay 3 cơ chế

`resolveBranchContext()` (bọc `cache()`) ở `/br/[branchId]/layout.tsx` → `{ branchId, branch, allowedBranches, role, caps }`. Segment `[branchId]` = SSoT. Tổng quát hóa `resolveInventoryBranchScope` ra mọi operator route. Đổi CN = đổi segment (`BranchSwitcher` đã làm); staff pin → `allowedBranches` 1 phần tử → ẩn picker (khớp D031 "ẩn khi ≤1 CN").

**Auth không đổi:** proxy vẫn ép `routeBranchId === claims.branch_id` (owner cover-ca) + RLS + `MODULE_ACL`. Context chỉ là lớp đọc tiện lợi, không bao giờ là cổng gác.

## 7. Layout theo thiết bị (chung token + primitive)

- **Phone Operator** (≤ md): 1 cột, `max-w-lg`, sticky `MobileHeader` (brand + tên CN + chuông), tile/nội-dung, `AppBottomNav` 4 anchor, safe-area. Nền = tái dùng `EmployeePage`/`EmployeePanel`.
- **Counter Station** (tablet cố định, ngang): full-screen 1 việc, `OperationalPwaToolbar` + station header + branch badge, `size="touch-lg"`, `clamp()`. Nội bộ giữ nguyên.
- **Office** (desktop): giữ `AppShell` sidebar, giờ **chỉ office** → bỏ tier operator/branch → đơn giản hơn.
- Lift `MobileHeader` thành shared component, dùng chung mọi operator surface (hết copy-paste employee↔inventory).

## 8. Deltas từng surface

- **Kho:** slice sàn (đếm/nhận/điều chuyển/hao hụt) → Operator tiles `/br/[id]/stock/*`, tái dùng `NumberPadSheet`/`InteractiveCard` sẵn có. Back-office → Office `/inventory/*` desktop.
- **Menu vs Menu-Limits:** catalog → Office (tenant); giới hạn ngày → Operator "Điều hành CN" (khớp `task3` S4 `/br/[id]/settings/menu-limits`).
- **POS/KDS/Runner:** re-root lên BranchContext + Hub, đồng bộ chrome; **không đụng** orchestrator `pos-desktop-inner.tsx` (1745 LOC) lúc này.
- **Owner:** thêm surface "Overview" trên phone (nhỏ) = glance doanh thu/cảnh báo 1 CN, tái dùng data dashboard.

## 9. Amendment D019/D017 (sửa load-bearing — ghi ở D050)

- D019.1 hiện đặt _branch command/setup `/br/[branchId]/_`* trong họ "Quản trị" (`AppShell`). **Sửa:** branch dashboard + control + settings (tables/pos/kds/printers) + end-day POS reconciliation render trong họ "Vận hành" (Operator plane mobile/tablet). Office plane (`AppShell`) còn `/admin`+ domain workspaces +`/branches` list.
- D017.3 "Home BM = `/employee`; điều hành ở `/br/[branchId]/*`": vẫn đúng tinh thần; chỉ chuẩn hóa cả hai về một Operator plane (home BM = `/br/[branchId]` Operator home).

## 10. Quan hệ với work đang chạy

- **`task3-mgmt-ia-consolidation.md`** (owner-approved "gộp IA" People+Branch, Office-side): blueprint này **nhường** phần đó cho task3. menu-limits tile khớp task3 S4. Branch switcher khớp task3 S0 + D031.
- **D026/D027** (HR redesign per-shift, đang ở `codex/hrm-payroll-annual-leave`): My-shift migration (sub-project #3) **xếp sau** khi HR settle; không động file HR bây giờ.
- Shift-tasks/checklist config là workstream in-flight riêng; tile "Việc cần làm" của Operator home **tiêu thụ** output đó, không thiết kế lại config.

## 11. Lộ trình tách sub-project (mỗi cái 1 vòng spec→plan→build)

| #   | Sub-project                                                                                                                                   | Phụ thuộc                       | Rủi ro                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------- |
| 1   | **Foundation**: `resolveBranchContext` + capability registry (mở rộng `nav-config.ts`) + Branch Hub (device-aware `resolvePostLoginRedirect`) | –                               | thấp (plumbing, ẩn sau UI cũ) |
| 2   | Operator shell + phone nav (4 anchor + smart card) + tile Home                                                                                | 1                               | trung                         |
| 3   | Migrate My-shift (`/employee/*` → `/br/[id]/shift/*`) + redirect                                                                              | 1, 2, **HR settle (D026/D027)** | trung                         |
| 4   | Migrate Stock floor slices (`/br/[id]/stock/*`)                                                                                               | 1, 2                            | trung                         |
| 5   | Branch command+control+setup + Overview (dashboard, menu-limits, approvals, settings, glance)                                                 | 1, 2, task3                     | trung                         |
| 6   | Re-root station apps (POS/KDS/Runner) lên context + Hub                                                                                       | 1                               | thấp                          |
| 7   | Office plane cleanup (gỡ operator/branch khỏi `AppShell`)                                                                                     | 3–6, task3                      | thấp                          |

`#1` làm trước & chắc — cõng tất cả; ship được mà chưa gỡ UI cũ (additive). Mỗi lát đụng route phải đồng bộ `module-acl.ts`, `route-resolution.ts`, `route-map.ts`, `nav-config.ts`/`office-nav.ts`, và gate `protected-route-module-coverage.test.ts` (như task3 đã ghi).

## 12. Ràng buộc giữ nguyên

- Auth: proxy + RLS + `MODULE_ACL` + `has_permission` là cổng gác duy nhất; branch-context là lớp đọc.
- Migration: file → PR → owner apply prod → `pnpm db:types` (D015); agent KHÔNG apply prod, KHÔNG dev DB.
- Routing path-based `/br/[branchId]/*` (D009); route-home canonical `role-route-matrix.md` (D019.2); nav-là-data (D019.4); 1 padding owner `AppPage` (D019.3).
- 8 access buckets (D018); `/admin` owner-only (D017).
