# Operator Workspace — Sub-project #2 Implementation Plan

Reconciled-through 7f1e011d

Mục tiêu: sau foundation #1, dựng Operator shell + Branch Hub cutover đầu tiên để
người dùng có entry `/br` và `/br/[branchId]` thật, phone nav 4 anchor, Home bằng
capability tiles, và route/ACL coverage cho `/br/[id]`, `/br/[id]/shift`, `/br/[id]/stock`.
Không migrate nội dung `/employee/*` hay Kho sàn đầy đủ trong lát này; #2 chỉ tạo
đường ray, shell và placeholder/skeleton đủ gate.

## Quyết định Đã Chốt Cho #2

- **A — owner phone, `branch_id=null`:** đi `/br` branch picker, không tự chọn chi
  nhánh mặc định. Picker chỉ query site `branch_kind='branch'` và `is_active=true`;
  không hiện `central_kitchen` / `central_supply`.
- **B — `office`, `branch_id=null`:** không có Operator plane riêng trong #2.
  Giữ fallback hiện tại `/employee`; không đưa `office` vào `/br` picker, `/br/[id]`
  home, hay capability tiles.
- **Không thêm họ chrome thứ ba:** route mới dùng họ "Vận hành"; route-map có thể
  thêm `operator-bottom-nav` làm tên primary nav, nhưng surface vẫn thuộc nhánh vận
  hành, không mở shell độc lập mới.

## Phạm Vi

### Build

1. **Route shell không bọc station apps**
   - Tạo route group: `apps/web/app/(protected)/br/[branchId]/(operator)/layout.tsx`.
   - Tạo home: `apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx`.
   - Tạo skeleton route: `(operator)/shift/page.tsx`, `(operator)/stock/page.tsx`.
   - Không tạo `apps/web/app/(protected)/br/[branchId]/layout.tsx`; route này đang
     bị test cấm vì sẽ bọc POS/KDS/Runner.

2. **Branch picker**
   - Tạo `apps/web/app/(protected)/br/page.tsx` cho owner phone.
   - Dùng `resolveBranchContext`/branch query lọc `branch_kind='branch'`.
   - Branch scoped staff không dùng `/br`; nếu mở nhầm thì redirect theo
     `resolveBranchHubDestination`.

3. **Operator shell + 4-anchor nav**
   - Tách shared mobile header từ Employee nếu cần: tên chi nhánh, role/position,
     notification, profile.
   - Tạo `OperatorBottomNav` cố định:
     `Trang chủ` → `/br/[id]`, `Ca` → `/br/[id]/shift`, `Thông báo` →
     `/notifications`, `Hồ sơ` → `/employee/profile` cho tới khi #3 migrate profile.
   - Không dùng `MAX_VISIBLE_ITEMS` từ `WorkspaceBottomNav`.

4. **Home bằng capability tiles**
   - Dùng `resolveOperatorTiles(role, branchId)` từ foundation #1.
   - Render nhóm tile qua primitive sẵn có (`AppLinkCard`/`SurfaceLinkCard` nếu phù hợp).
   - Empty state phải là deny-by-absence; auth vẫn do proxy/RLS/MODULE_ACL.
   - Smart card lấy `getTodayWorkState` hiện có; nếu trạng thái không có branch thì
     hiển thị CTA về `/br/[id]/shift` thay vì tự sửa dữ liệu.

5. **Branch Hub cutover**
   - Mở rộng `resolvePostLoginRedirect(claims, returnTo, hubContext?)` để caller cũ
     không đổi hành vi khi không truyền `hubContext`.
   - `apps/web/proxy.ts` chỉ truyền `hubContext` ở login/default-landing path:
     owner desktop → `/admin/dashboard`; owner mobile/tablet → `/br`; staff có
     `branch_id` → `/br/[id]`; office → `/employee`.
   - `apps/web/app/page.tsx` chuyển từ `getDefaultRedirect` sang Branch Hub fallback
     server-side; test root-entry phải đổi theo.
   - Station PWA có `returnTo=/br/[id]/pos|kds|runner` vẫn ưu tiên returnTo qua ACL;
     không cần detect display-mode server-side trong #2.

6. **Route map / ACL / proxy coverage**
   - Thêm `operator_home` vào `MODULE_ACL`, allowed roles:
     `owner`, `branch_manager`, `warehouse_manager`, `production_manager`,
     `cashier`, `chef`; loại `office`.
   - `resolveModuleFromPath`:
     `/br` → `branch_picker` (owner-only picker),
     `/br/\d+` → `operator_home`,
     `/br/\d+/shift` → `employee`,
     `/br/\d+/stock` → `inventory`.
   - `ROUTE_FAMILY_CONTRACTS` thêm `branch-picker`, `operator-home`,
     `operator-shift`, `operator-stock`; `requiresBranchId=true` cho ba route có id.
   - `RoutePrimaryNav` thêm `operator-bottom-nav`.
   - Proxy branch-scope mismatch gate phải bao phủ `operator_home`, `/br/[id]/shift`,
     và `/br/[id]/stock`; owner được cross-branch, non-owner chỉ đúng
     `claims.branch_id`.
   - `/br/[id]/stock` phải check site active + `branch_kind='branch'` giống POS/KDS
     branch-surface gate, vì đây là việc sàn theo chi nhánh.

### Không Build Trong #2

- Không move `/employee/*` sang `/br/[id]/shift/*`; #3 làm migration + redirect.
- Không build Stock floor slices thật; #4 làm count/receive/transfer/waste.
- Không chuyển branch dashboard/settings khỏi AppShell trong #2; #5 làm.
- Không refactor POS/KDS/Runner orchestrator; #6 chỉ re-root context.
- Không đổi Office People/Branch IA; D048/task3 sở hữu.

## TDD / Verification Plan

1. **Route/static tests đỏ trước**
   - `packages/shared/src/auth/__tests__/operator-routes-static.test.ts`:
     `resolveModuleFromPath`, `resolveRouteFamilyContract`, `canAccess` cho
     `/br`, `/br/7`, `/br/7/shift`, `/br/7/stock`.
   - `apps/web/tests/operator-shell-static.test.ts`:
     route group exists, parent `/br/[branchId]/layout.tsx` không tồn tại,
     bottom nav có đúng 4 anchor và không có `MAX_VISIBLE_ITEMS`.
   - `apps/web/tests/branch-hub-cutover-static.test.ts`:
     proxy/root dùng Branch Hub helper, không hard-code `/employee` fallback cho
     non-owner chung chung.

2. **Implement nhỏ nhất để xanh**
   - ACL + route-map/resolution trước.
   - Shell/layout/page skeleton sau.
   - Branch Hub cutover cuối cùng, vì đây là thay đổi hành vi login.

3. **Behavioral checks**
   - `owner` desktop login không đổi: `/admin/dashboard`.
   - `owner` mobile login: `/br`.
   - `cashier`/`chef` có `branch_id=7`: `/br/7`.
   - `office` `branch_id=null`: `/employee`.
   - `/br/7/stock` với non-owner branch mismatch → access-denied.
   - `/br/7` không resolve cho `office`.

4. **Full gate**
   - Targeted tests ở shared + web.
   - `pnpm typecheck && pnpm lint && pnpm test`.
   - Nếu route/page mới làm tăng i18n baseline, chuyển copy vào `@lib/messages`
     thay vì inline trong `apps/web`.

## Rủi Ro Và Cách Chặn

- **Bọc nhầm station apps:** cấm parent layout `/br/[branchId]/layout.tsx`; dùng
  `(operator)/layout.tsx` và giữ POS/KDS/Runner ngoài route group.
- **Proxy hở branch scope cho `/shift`/`stock`:** thêm test proxy/static cho branch
  gate, không chỉ route-map.
- **`office` lọt vào Operator:** lock bằng test ACL (`canAccess("office",
  "operator_home") === false`) và Branch Hub fallback `/employee`.
- **Route coverage false-green:** `protected-route-module-coverage.test.ts` phải thấy
  page routes mới resolve được module + route family.
- **Owner picker lẫn central sites:** picker/helper test giữ `branch_kind='branch'`.

## Handoff Sang #3/#4

- #3 nhận `/br/[id]/shift` đã có shell + route contract, rồi move từng page
  `/employee/{clock,tasks,schedule,leave,payslip,profile}` và giữ legacy redirect.
- Prep nhỏ đã có thể làm trước HR settle: thêm các route shim
  `/br/[id]/shift/{clock,tasks,schedule,leave,payslip,profile}` redirect sang
  `/employee/{clock,tasks,schedule,leave,payslip,profile}`. Đây không phải move
  thật; chỉ khóa URL mới và giữ đường cũ chạy đến khi D026/D027 settle.
- #4 nhận `/br/[id]/stock` đã có shell + route contract, rồi đưa count/receive/
  transfer/waste sàn vào theo capability tile `stock`.
