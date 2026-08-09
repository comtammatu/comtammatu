# UI Module

## Overview

UI của repo là **Má Tư Design System**, chạy trên shared components trong
`@comtammatu/ui`. Base UI là headless layer duy nhất; lucide, Tailwind và CVA là
implementation dependencies, không phải visual authority. Chỉ có một CSS entry
(`packages/ui/src/styles/globals.css`); không có helper layer hay theme system
riêng theo route/surface.

File này là implementation guide: cách áp dụng visual contract vào app code,
forms, keyboard shortcut, overlay, feedback và migration flow. Không dùng file
này để override Má Tư token hoặc visual role; cũng không ghi đè Base UI behavior
bằng wrapper compatibility.

## Contract Boundary

Mọi UI/UX rebuild phải xác định owner của quyết định trước rồi mới đọc runtime.
Visual change đọc `design-system.md`; behavior/accessibility đọc Base UI và
shared component implementation;
workflow đọc archetype và route. Role split:

- `docs/spec/design-system.md`: SSOT của Má Tư Design System; owns artifact
  ladder, Naming Standard, Base UI rule (kèm exception list), token, typography,
  density, brand, states, elevation, motion và Structural Governance.
- `packages/ui/src/components/*`: shared styled components; Base UI behavior và
  accessibility contract được tích hợp ở đây.
- `docs/modules/ui.md`: implementation guide; owns composition, form, overlay,
  feedback, shortcut và migration matrix.
- `docs/spec/page-archetypes.md` + target route: workflow composition, job,
  state và responsive IA.
- `docs/agent/rules/ui.md`: fast-loading guardrails for agents.
- `tasks/regressions.md`: negative rules from incidents; not an authority to
  invent new visual language.
- `docs/runbooks/*`: verification checklists only.
- `docs/worklog/README.md`: policy only; transient UI review notes belong in PR
  or task notes, then any durable contract is promoted to spec/modules/tasks.

Không được coi external scaffold output là authority cao hơn Má Tư visual
contract. Shadcn được dùng để đối chiếu component anatomy, state, UX và motion;
không được dùng làm preset hay visual source.

Code mới phải dùng `apps/web/app/components/surface.tsx`, `BrandMark` /
`BrandLockup` / `BrandSymbol` / `BrandMascot`, semantic token classes, và font
utilities hiện hành cho app UI. Nếu ý tưởng cần visual layer mới ở mức token,
chrome, component behavior, hoặc shared adapter, update
`docs/spec/design-system.md` trước khi rollout vào runtime.

Read order cho agent khi làm UI:

1. `AGENTS.md`
2. `docs/agent/rules/skills.md`
3. `docs/spec/design-system.md`
4. `docs/modules/ui.md`
5. `tasks/regressions.md`
6. Domain docs liên quan đến route đang sửa

## Shared Component Runtime Contract

Runtime hiện tại: Má Tư DS shared components trong
`packages/ui/src/components/*` cho monorepo `apps/web` + `packages/ui`. Shared
components dùng Base UI primitives cho behavior, còn semantic token và visual
recipe vẫn theo `docs/spec/design-system.md`. Không giữ compatibility shim thay
thế visual contract hoặc component API cũ.

Điều này có nghĩa:

- shared component structure phải theo file trong `packages/ui/src/components/*`
- chỉ `packages/ui` được import `@base-ui/react`; app code đi qua
  `@comtammatu/ui`
- `Select` giữ compound API hiện hành; shared root chuyển `SelectItem` children
  thành Base UI `items` để `SelectValue` resolve đúng label. `items` truyền tường
  minh luôn được ưu tiên; route không tự dựng một label-resolution shim khác
- semantic token values phải theo `docs/spec/design-system.md`
- brand color/typography phải đi qua semantic token và font variables chung
- page/shell ưu tiên shared components có sẵn và app surface adapters; direct
  component composition được phép khi semantic job riêng không phù hợp adapter
  hiện có
- logo/brand lockup, symbol, mascot trong web runtime phải đi qua `BrandMark` /
  `BrandLockup` / `BrandSymbol` / `BrandMascot`
- không được giữ `app-*` helper classes hoặc custom background/theme chrome ở root

## Shared Component Layer

Shared component source sống tại `packages/ui/src/components/*`, và app code
dùng các component này qua `@comtammatu/ui`:

- `button`
- `accordion`
- `card`
- `badge`
- `table`
- `dialog`
- `sheet`
- `tabs`
- `input`
- `select`
- `combobox`
- `date-picker`
- `slider`
- `pagination`
- `toolbar`
- `empty` — tất cả empty-state UI (no-data, no-results, error, inline)
- `field` + `field-group` — form field composition (label, control, error, description)
- `item` + `item-group` — list rows with media/title/description/actions
- `spinner` — loading indicator (thay cho `Loader2 + animate-spin`)

Không fork shared component theo surface.

Ưu tiên named component props: `flush` cho table-edge/list-edge alignment và
`scroll` cho horizontal table scrolling; AppSection dùng `contentFlush` /
`contentScroll` cho cùng vai trò. Một surface có workflow riêng có thể compose
spacing hoặc overflow tương đương khi không tạo chrome cạnh tranh.

## App Surface Adapters

`apps/web/app/components/surface.tsx` là adapter layer duy nhất cho các pattern lặp lại ở app level.
Import luôn qua `@/components/surface`; file này chỉ re-export, phần triển khai
nằm trong `apps/web/app/components/surface/*.tsx` (mỗi adapter một file):

- `AppPage` cho content container/width/scroll rhythm.
- `AppPageHeader` cho page heading, description, badge, action. Description
  `line-clamp-2` trên `max-sm` (ẩn hẳn khi `compactOnMobile`). Trên
  control_surface (AppShell), **không** dùng `eyebrow` để lặp tên module /
  synonym sidebar (`Quản lý kho`, `Kho hàng`, …) — sidebar + deep-nav đã mang
  ngữ cảnh đó. Eyebrow chỉ khi thêm ngữ cảnh thật (ví dụ site-kind) mà title /
  back link chưa nói.
- `AppSection` cho card-backed section. `CardDescription` qua adapter dùng
  `line-clamp-2 break-words`; `headerHint` truncate. Secondary copy: page/section
  ≈ ≤80 ký tự, KPI/field hint ≈ ≤60; bỏ prop khi trùng title. `FieldDescription`
  không clamp — rút copy. Dialog hủy/hoàn tiền/SePay giữ đủ rủi ro.
- `AppToolbar` cho filter/action toolbar.
- `AppEmptyState` cho empty/no-result/no-access/error state.
- `Table` trong `packages/ui` chỉ là semantic desktop component; route không
  compose trực tiếp trừ document/line-sheet adapter đã được quy định.
- `DataTable` là responsive table adapter duy nhất: một row model, desktop
  columns và `mobileCardRender` cùng trường/trạng thái/action. `DataTablePagination`
  và `TableEmptyStateRow` là chi tiết nội bộ của adapter, route không import trực tiếp.
- `AppToolbar` đứng trước `DataTable` khi filter, sort, branch, kỳ hoặc action
  là URL/server state của trang. Inline toolbar của `DataTable` chỉ dành cho
  state local của chính bảng; không dựng hai toolbar cho cùng một control.
- control_surface LIST dùng `AppListFrame` (`AppSection` + `contentFlush` + slot
  `toolbar`):
  `AppPage` → `AppPageHeader` → `AppListFrame toolbar={<AppToolbar variant="inline" />}`
  → `DataTable`. Tra cứu: `audit:ui-components --component AppListFrame`
  hoặc `--component management-list`.
  Inline toolbar không tô nền riêng (`bg-muted/*`); cùng bề mặt card với bảng.
  `AppListFrame` untitled flush dọc (`py-0`); titled giữ pad trên header
  và `pb-0` để bảng sát đáy. Toolbar + body nằm trong một cột; cạnh flush
  bo `rounded-t-lg` / `rounded-b-lg` khớp Card (Card giữ `overflow-visible`
  cho sticky bleed / Select). Tách bằng `border-b` / `border-t`. Inline
  toolbar dùng `px-3 py-2` (không `p-3`).
  Desktop empty luôn qua `DataTable` (`TableHeader` + `TableEmptyStateRow`),
  không swap sang `AppEmptyState` thay cả bảng (trừ error/load-failed). Desktop
  filter `Select`/`InputGroup` dùng `size="field"` và độ rộng cố định
  `inventoryListFilterSelectClassName` (`w-44 shrink-0`; wide `w-56` khi label
  có count) trên Inventory. Header CTA LIST dùng `size="lg"` (operator/
  embedded giữ `touch`). `SelectContent` mặc định `position="popper"`,
  `positionMethod="fixed"`, và `collisionBoundary` = `document.documentElement`
  để menu không flip vào hàng Search trong `Card`/`AppListFrame` (tránh
  `clipping-ancestors`). `AppListFrame` dùng `overflow-visible`; `AppToolbar`
  giữ search `z-0` và filters/actions `z-10`. Filter phải vào slot `filters`,
  không nhét vào slot `search`. Filter card tách riêng chỉ khi filter scope
  nhiều section (ví dụ Finance dashboard).
- LIST filter density (Owner + shared `DataTable` toolbar): mọi
  `SelectTrigger` / `InputGroup` / Combobox trong hàng filter dùng
  `useFormControlSize()` → `touch` dưới `lg` (1024), `field` từ `lg` trở lên.
  Cấm `size="default"` / `size="sm"` trong hàng filter LIST. Operator /
  embedded ép `useFormControlSize("touch")`. Nút phụ cùng hàng (clear filter,
  threshold toggle) cùng `controlSize`. Header CTA tạo mới vẫn `lg` (khác vai
  trò filter).
- `AppLinkCard` cho navigation/action card.
- `KpiRow` cho grid responsive (1/2/3/4 cột) bọc các `KpiCard` chỉ khi đó là
  metric/stat-value.
- `DescriptionList` cho cặp term/description (`<dl>`) ở trang chi tiết.
- `LinkCardGrid` cho grid responsive (1/2/3 cột) bọc các `AppLinkCard`.
- `DocumentFormFrame` cho khung trang document/line-form (header + body cuộn +
  footer) compose `AppPage`; là page-section adapter, không phải chrome shell.
  Tra cứu: `audit:ui-components --component DocumentFormFrame` hoặc
  `--component management-document`.
- `SettingsPageFrame` cho shell settings Owner (`AppPage` + `AppPageHeader` +
  breadcrumb về `/settings`). Tra cứu: `--component SettingsPageFrame` hoặc
  `--component management-settings`.
- `AppDetailFooter` cho hàng footer leading/trailing ở trang chi tiết.

Domain wrappers như Inventory/Employee/Owner có thể giữ API riêng để tránh sửa hàng loạt call site, nhưng phải delegate về các adapter này thay vì tự style lại `Card`, `Empty`, hoặc page container.

Card không đồng nghĩa với `KpiCard`: `KpiCard` chỉ cho metric/stat-value; card
khác dùng `AppSection`, `AppLinkCard`, `OperationalBoardCard`,
`DataTable.mobileCardRender`, hoặc wrapper route-scoped có render `Card`.

## Component Selection

Registry tại `scripts/ui-component-registry.mjs` là executable index của visual
contract và implementation guide cho shared component, app adapter, domain
adapter và UI block. Tra cứu trước khi compose một surface mới:

```bash
corepack pnpm audit:ui-components --component Card
corepack pnpm audit:ui-components --component KpiCard
corepack pnpm audit:ui-components --component InteractiveCard
corepack pnpm audit:ui-components --component AppListFrame
corepack pnpm audit:ui-components --component DocumentFormFrame
corepack pnpm audit:ui-components --component BranchOperatorPage
corepack pnpm audit:ui-components --component branch-touch-list
```

Kết quả trả về `need`, `use`, `fallback`, `forbidden` và `exemplar`. Chọn layer
theo semantic job, không theo độ tiện của import. Nếu không có kết quả, kiểm tra
adapter gần nhất trước khi thêm shared API mới.

`apps/web/app/components/data-table/interactive-card.tsx` chỉ là compatibility
re-export của shared `InteractiveCard`, không phải một app adapter thứ hai.

## UI Block Selection

`UI_BLOCK_REGISTRY` trong `scripts/ui-component-registry.mjs` là index cho các
composition đã có thật. UI block đứng giữa archetype và adapter:

```text
actor/job → archetype → UI block (recipe) → adapter/component → route
```

- Archetype sở hữu shape và state model của cả page.
- UI block đặt tên cho một composition cụ thể theo plane, ví dụ
  `management-list`, `branch-touch-list`, `realtime-board`, `runner-board`,
  `pos-board`, `employee-self-service`, `public-transaction`, `public-feedback`.
- Adapter/component là code được import (`AppListFrame`,
  `DocumentFormFrame`, `BranchOperatorPage`, shared components…).
- Route gắn data, authority, copy và mutation thật.

UI block không tạo thư mục `blocks/`, package mới hoặc component `*Block`.
Nó là recipe tra cứu có `archetypes`, `planes`, `need`, `use`,
`fallback`, `forbidden`, `exemplar`; validator chặn source, exemplar, plane hoặc
archetype không còn hợp lệ. Chỉ thêm block recipe khi có ít nhất hai consumer
thật, hoặc một critical workflow có exemplar được chấp thuận. Khi composition
lặp cần code dùng lại: **promote Adapter** đã đăng ký (hoặc mở rộng adapter
hiện có), rồi cập nhật trường `use` của block recipe trỏ vào adapter đó — không
nâng recipe thành import layer. Nếu không có block phù hợp, dùng archetype +
route-scoped composition từ adapter hiện có.

control_surface LIST canonical (Inventory dùng cùng recipe):

```text
AppPage → AppPageHeader → AppListFrame toolbar={<AppToolbar variant="inline" />} → DataTable
```

control_surface DOC-WORKFLOW canonical: `DocumentFormFrame` (+ line `DataTable` /
form fields). Branch LIST canonical: `BranchOperatorPage` + panel/controls +
`ItemGroup` (không mang `DocumentFormFrame` / `DataTable` control_surface sang
branch).

## External Design Output

Bất kỳ prototype hay design output từ ngoài repo đều là tài liệu tham khảo, không
phải visual authority và không tạo mirror file riêng. Root `DESIGN.md` bị guard
chặn. Cách dùng: khóa actor/job/archetype/plane trong UI Advisor Gate trước, chỉ
lấy prototype để đối chiếu hierarchy, touch target, responsive IA và state
coverage, rồi implement lại bằng adapter/component đã đăng ký. Không copy token,
font, component API hoặc business behavior sinh ra bên ngoài vào runtime; chỉ
update contract khi finding thật sự dùng chung.

## Branch Operator Landing

Branch home là surface mobile-first cho nhân viên và quản lý chi nhánh tại
`/br/[branchId]`. Nó dùng Branch operator adapter, không wrapper
control_surface và không gọi trực tiếp vocabulary Employee ở các route Branch:

- Branch và control_surface là hai mặt phẳng presentation khác nhau. Operator
  plane giữ mobile/tablet touch-first tại `/br/[branchId]/*` cho cửa hàng;
  control_surface giữ management workspace
  responsive tại `/`, `/inventory`, `/finance`, `/hr`, `/menu`, `/orders`, và
  `/branches`. Mã dùng chung dưới `br/_shared/settings` chỉ
  là source directory, không phải route.
- `central_supply_ops` / `central_kitchen_lead` land trên `/inventory`; Control
  Surface khóa site theo JWT `branch_id`. Công việc cá nhân và chấm công nằm ở
  `/me`, không cần đi qua Branch operator IA.
- data loader, Server Action, RPC và permission check có thể dùng chung giữa
  hai plane; presentation không được dùng chung nếu control_surface component tạo cảm
  giác desktop thu nhỏ trong Branch. Khi cần tách, Branch route dùng native
  `BranchOperator*` component và giữ control_surface route cho oversight/dense table.
- POS, KDS, Runner là station apps riêng dưới `/br/[branchId]/*`. Section card
  trên station dùng `StationSection` (không `AppSection`); inset đơn giản dùng
  `Frame`. KDS ticket cards dùng `OperationalBoardCard` (`realtime-board`);
  Runner dùng recipe `runner-board`. Không bọc vào
  Branch home bottom-nav và không dùng control_surface shell.

- landing và màn chi tiết dùng `BranchOperatorPage`, `BranchOperatorPanel`,
  `BranchOperatorActionSection`, và các Branch operator adapter tương ứng
  trước khi nghĩ tới wrapper mới.
- mobile ẩn page header trùng bằng `hideHeaderOnMobile`; app chrome đã giữ tên
  app, chi nhánh, và bottom nav.
- landing là nhóm action rows theo việc cần mở trong ngày; không đặt
  `Điều hành chi nhánh` hoặc `Cài đặt chi nhánh` như tile trong Landing.
- màn quản lý chi nhánh (`/dashboard`, `/settings`) dùng cùng Branch runtime
  chrome nhưng thuộc route family `branch_management`, mở qua bottom nav theo
  quyền quản lý.
- operator/operations/staff-runtime không import hoặc render control_surface
  chrome; guard `operator-owner-shell-boundary` bắt mọi đường tắt qua
  `AppShell`, `ControlSurfaceShell`, hoặc các tên shell L0 đã gỡ
  (`OwnerModuleShell` / `FinanceShell` / `InventoryShell`). Staff-runtime dùng
  `EmployeePage` / `EmployeePanel` (recipe `employee-self-service`); không
  import `AppSection` trực tiếp ngoài adapter.
- Public/guest (`/q`, `/r`, login, access-denied): `AppPage` / `AppEmptyState`
  được phép; card section dùng `PublicSection` (không `AppSection`). Recipes:
  `public-transaction`, `public-feedback`, `system-gate`.
- màn chi tiết giữ một primary action trong panel chính, không đặt CTA vận hành
  vào page header.
- staff-runtime wrapper chỉ đổi href/scope sang `/br/[branchId]/*`; workflow
  quản lý Branch phải sở hữu presenter touch-native và chỉ chia sẻ
  loader/model/action với control_surface. Staff runtime chỉ dùng route mang `branchId`.
  routes.
- copy hiển thị sống trong `messages.employee.*`, `APP_COPY_VI`, hoặc registry
  domain tương ứng; route/component không hardcode copy vận hành mới.
- `/br/[branchId]/shift/leave-approvals` là Branch-native touch `LIST`: tab
  trạng thái + full-row items để quét nhanh, chi tiết và approve/reject nằm
  trong bottom `Sheet` có action sticky. control_surface giữ `LeaveRequestsTable`;
  Branch không import bảng hoặc page presenter HR control_surface.

Branch stock workflow áp dụng cùng ranh giới này:

- `/br/[branchId]/stock` là **stock home** (tab Kho land đây): list phiếu
  fulfillment + 4 cửa (Kho hàng / Yêu cầu hàng / Kiểm kê / Hao hụt). Không
  Tiêu Hao SX. `/stock/transfer` store redirect về `/stock`.
- `/br/[branchId]/stock/on-hand` là LIST tồn Branch-native touch dùng shared
  `loadStockOnHandPageData` + filter model (`categories[]`, status).
  Presentation: `Item` separator rows, `ToggleGroup` trạng thái, bottom `Sheet`
  lọc. Không `DataTable`/WAC/KPI; detail qua `/on-hand/[ingredientId]`.
  Central hub loại job đã có trên Bottom-Nav.
- list workflow native như `/br/[branchId]/stock/transfer` dùng archetype `LIST`
  với `BranchOperatorPage`/`BranchOperatorPanel`, action rows full-width trên
  mobile, và route-scoped href `/br/[branchId]/stock/*`.
- Attention/CTA on-hand theo `branch_kind` (CN/CK yêu cầu hàng; CS nhập/YCM).
  Job phụ mở từ Sheet trên list hoặc detail `DropdownMenu`, không bắt qua hub.
- `/br/[branchId]/stock/on-hand/[ingredientId]` là Branch-native touch `DETAIL`:
  dùng shared `loadStockIngredientDetailData` và pure movement/status model,
  nhưng tải `includeValuation: false` cho Branch. Thứ tự là tồn hiện tại/trạng
  thái, cân bằng theo vị trí, chuyển động gần đây, ngưỡng và action theo quyền;
  nhận NCC phải mở `/stock/grn/new`, không được trỏ vào `/stock/receive` là
  hàng chuyển nội bộ. Không đưa WAC, giá trị tồn, audit/correction, control_surface
  `AppPageHeader`, `DataTable`, hoặc control_surface detail presenter vào route này.
- `/br/[branchId]/stock/grn` là Branch-native touch `LIST`: dùng shared
  `loadGrnListPageData` + pure filter model, hiển thị nháp của người đang thao
  tác trước hàng đợi GRN, và giữ bỏ nháp là action có xác nhận. Danh sách Branch
  chỉ giữ mã phiếu, NCC, ngày và trạng thái; không hiển thị tổng
  tiền/tên chi nhánh, không dùng `DataTable` hoặc long-press, và không đổi sang
  control_surface presentation tại tablet landscape.
- `/br/[branchId]/stock/grn/new` là Branch-native touch `LIST` cho bước chọn
  nguồn: dùng shared `loadGrnSourcePageData` + pure source model, có tìm NCC,
  tạo NCC khi được cấp quyền, và không còn cửa PO. Supplier entry canonical tại
  `/br/[branchId]/stock/grn/new/[supplierId]`; màn
  source không render `DocumentFormFrame`, `DataTable`, hoặc control_surface picker.
- `/br/[branchId]/stock/grn/new/[supplierId]` là Branch-native touch
  `DOC-WORKFLOW`: dùng shared `loadGrnCreatePageData`,
  `useGrnCreateController`, và `GrnLineEditSheet`, nhưng route tự sở hữu bố cục
  `BranchOperatorPage`/`BranchOperatorPanel`, list dòng chạm để sửa, và
  `AppDetailFooter` sticky. Context NCC/kho nhận đứng trước danh sách dòng và
  tìm nguyên liệu; branch bị khóa bởi URL, tablet landscape chỉ mở grid panel
  chứ không đổi thành bảng hay desktop side editor. Route không import control_surface
  page/client, `DocumentFormFrame`, `DataTable`, `AppPageHeader`, hoặc
  `AppSection` trực tiếp.
- `/br/[branchId]/stock/grn/[id]` là Branch-native touch `DETAIL`: nháp dùng
  shared detail loader/model/action hooks nhưng tự sở hữu danh sách kiểm nhận
  chạm, bottom sheet sửa/thêm dòng, và `AppDetailFooter` sticky để lưu/chốt;
  phiếu không còn nháp là biên nhận chỉ đọc. Route không import control_surface
  `GRNDetailClient`, `embedded`, audit history, post-confirm correction, stock
  correction, hoặc liên kết hóa đơn NCC. Các tác vụ quản trị đó vẫn thuộc control_surface
  `/inventory/grn/[id]`.
- `/br/[branchId]/stock/stocktake` là Branch-native touch `LIST`: session
  stocktake của quản lý khác với `/stock/count` là count slip được giao cho
  nhân viên. Route dùng shared `loadBranchStocktakeListData`/model, full-row
  `ItemGroup` ở phone/tablet, và không dùng `DataTable`, long-press drawer,
  control_surface toolbar, branch picker, audit, hay report CTA.
- `/br/[branchId]/stock/stocktake/new` là Branch-native `DOC-WORKFLOW`: URL
  khóa branch, chỉ chọn mode và location, sau đó mở phiên qua action hiện có và
  chuyển vào count. Route dùng `BranchOperatorPage`/`BranchOperatorPanel` và
  `AppDetailFooter` sticky; không import `DocumentFormFrame` hoặc control_surface start
  presenter.
- `/br/[branchId]/stock/stocktake/[id]/count` là Branch-native touch
  `DOC-WORKFLOW`: number pad là entry point, cho phép chọn đơn vị ghi nhận ngay
  trên nguyên liệu active, giữ autosave draft/zone lock/round submit hiện có,
  và không đổi tablet thành `DataTable`. Payload blind không mang số tồn hệ
  thống; dữ liệu system/count/variance chỉ xuất hiện sau khi hoàn tất.
- `/br/[branchId]/stock/stocktake/[id]` là Branch-native touch `DETAIL`: active
  review chỉ nhận blind counts, count/recount status, continue, cancel, và
  complete theo permission; completed result dùng `ItemGroup` system/count/
  variance. Không đưa audit history, control_surface detail client, report CTA, WAC, hay
  giá trị tồn vào route này.
- `/br/[branchId]/stock/issues` là Branch-native touch `LIST` chỉ cho phiếu
  `writeoff` (hao hụt đã tạo): branch bị khóa bởi URL, danh sách chỉ giữ mã
  phiếu, ngày và trạng thái. **Tạo hao hụt mới** đi `/stock/waste`, không còn
  picker loại `other` / “Xuất khác”. Không có branch picker, `DataTable`, export,
  audit hoặc tổng giá trị control_surface.
- `/br/[branchId]/stock/issues/[id]` là Branch-native touch `DETAIL`: nháp cho
  thêm/sửa/xóa từng dòng bằng bottom `Sheet` với đơn vị nhập, số lượng không vượt
  tồn và lý do bắt buộc; xác nhận/hủy dùng `AppDetailFooter` sticky và authority
  Server Action/RPC hiện có. Phiếu đã xác nhận/hủy chỉ đọc. Không đưa WAC, tổng
  giá trị, audit history, `DocumentStockCorrectionDialog`, control_surface detail client,
  hay branch/source picker vào Branch.
- `/br/[branchId]/stock/consumption` là Branch-native touch `LIST`: segmented
  view tách ledger tiêu hao đã ghi khỏi chứng từ thủ công, row giữ nguồn,
  trạng thái và thời điểm. `/stock/consumption/[id]` là typed `DETAIL` chỉ nhận
  record tiêu hao; cả hai route dùng Branch presenter và không import control_surface
  `DataTable`/page content.
- `/br/[branchId]/stock/count-assignments` và `/stock/count-slips` là hai
  Branch-native touch `LIST`: assignment nhóm theo nhân viên; review slip mở
  chênh lệch và approve/request-recount trong bottom `Sheet` với footer sticky.
  Không có CTA mở nhầm phiếu đếm cá nhân của quản lý, không nhận
  `routeBranchId`/`embedded` từ control_surface clients.
- control_surface `/inventory/count-assignments` và `/inventory/count-slips` là hai
  management `LIST` responsive độc lập: desktop dùng `DataTable`, thao tác hiển
  thị bằng nút và mở `AppDialog` (D1, cùng depth với Branch bottom `Sheet`);
  mobile fallback chỉ là card responsive của cùng table adapter. Owner không
  dùng Branch presenter. Wave 3 (ADR 0018 **C2**) gắn D1 view có địa chỉ URL với
  `?assignmentId=` (employee id) và `?slipId=`; id không hợp lệ hoặc ngoài scope
  được gỡ khỏi URL. Owner `Sheet` vẫn hợp lệ cho D1 addressable overlay
  khác (ví dụ Finance supplier invoices — ADR 0018); không dùng `Drawer` làm
  Owner primary view path.
- `/br/[branchId]/stock/waste` là Branch-native touch `DOC-WORKFLOW`: URL khóa
  chi nhánh, màn chính giữ location/cap và `ItemGroup` của các dòng đã chọn;
  điện thoại sửa một dòng trong bottom `Sheet`, tablet chỉ mở rộng thành hai
  panel cùng IA. Tier, ảnh bằng chứng, rolling meter, số lượng không vượt tồn
  và Server Action/RPC hiện có phải giữ nguyên. Không import
  `WasteNewPageContent`, `WasteCreateClient`, `DocumentFormFrame`, `DataTable`,
  hoặc chrome control_surface.
- `/br/[branchId]/stock/waste-approvals` là Branch-native touch `LIST`: queue
  khóa theo URL branch, mỗi row chạm mở bottom `Sheet` chứa line, reason, tier,
  evidence và review note. Duyệt/từ chối chỉ gọi `approveWaste`, giữ nguyên
  four-eye rule và xác nhận mutation; phiếu tự tạo chỉ đọc. Không import
  `WasteApprovalsPageContent`, `WasteApprovalsClient`, `DocumentFormFrame`,
  `DataTable`, hoặc chrome control_surface.
- `/inventory/purchase-orders` là workspace **Mua hàng** duy nhất, gồm tab
  `Nhu cầu mua` và `Đơn mua`. Kho tạo nhu cầu không NCC/giá. Khi mỗi nguyên liệu
  còn thiếu chỉ có một NCC active, action `Duyệt & tạo đơn mua` tự lấy toàn bộ
  số lượng còn lại; dialog phân bổ chỉ mở cho ca nhiều NCC hoặc thiếu mapping.
  Một lần duyệt tạo PO và GRN nháp. Nhu cầu, PO và GRN mở bằng URL-addressable
  `AppDialog variant="document"`; route `/inventory/purchase-requests` chỉ
  redirect tương thích.
- `/inventory/transfers` là workspace **Giao nhận hàng** duy nhất. Một YCH là
  một dòng; DC có `stock_request_id` nằm trong lane nguồn của YCH và không tạo
  dòng riêng, còn DC thủ công vẫn là một dòng. Không dùng tabs hàng đợi; dùng
  filter URL `work`, `state`, `branchId`, `q`, `page`. Owner/Ops mở YCH/DC bằng
  một `AppDialog variant="document"` với `requestId`/`transferId`; chọn DC con
  thay nội dung trong cùng dialog. Branch giữ Page/fullscreen touch workflow.
- `/br/[branchId]/stock/reports` là Branch-native touch `REPORT`: cố định đúng
  chi nhánh URL và tháng hiện tại, ưu tiên chênh lệch tiêu hao warning/critical
  rồi biến động của từng nguyên liệu có drill-in vào tồn thực. Mỗi số lượng luôn
  đi cùng đơn vị của nguyên liệu; không cộng chéo kg/lít/cái. Không dùng
  `ReportsPageContent`, `ReportsClient`, `DataTable`, biểu đồ, KPI tổng, công
  nợ NCC, giá vốn, export, audit hay branch/date picker. control_surface
  `/inventory/reports` giữ dashboard quản trị riêng, không còn `embedded` mode.
- control_surface `/inventory/stock` dùng cùng loader/model nhưng giữ management
  `StockClient`: compact cards khi viewport hẹp và dense `DataTable` trên
  desktop. control_surface client không có `embedded` mode hoặc Branch route branching.
- control_surface `/inventory/grn` dùng cùng GRN loader/model nhưng giữ
  `GrnListClient` management presentation: branch, supplier, ngày, trạng thái và
  desktop `DataTable`; không có cột giá mua cho Kho. Client này không nhận diện
  `/br/` để đổi layout.
- control_surface `/inventory/grn/new/[supplierId]` giữ `DocumentFormFrame` và desktop
  line editor trong `GrnCreateClient`. Owner GRN create DOC composition:
  dense context (`Kho nhận` / receiving pickers) → single lines `AppSection`
  (`Mặt hàng trên phiếu` DataTable + **Thêm mặt hàng** action) → catalog search
  lives in progressive `AppDialog` (pick ingredient → desk panel / sheet editor)
  → sticky `AppDetailFooter` (count-only SSOT trước khi PO sync giá, confirm
  CTA). Do not
  stack a second always-on catalog `AppSection` under the lines table. Draft
  DETAIL (`/inventory/grn/[id]` draft) uses the same single-lines + add-dialog
  structure (`AddGrnLineDialog`). control_surface và Branch chỉ chia sẻ loader,
  typed controller, line-editor primitive, và server action, không chia sẻ
  presentation mode hoặc route branching.
- Branch `/br/[branchId]/stock/transfer` chỉ giữ hàng chờ nhận, lịch sử và detail
  điều chuyển; Branch không có route hoặc CTA tạo mới. Detail giữ số lượng từng
  dòng và thao tác nhận được cấp quyền; audit history, correction sau chốt và tạo
  phiếu tạo mới Owner đã rút (`/inventory/transfers/new` chỉ còn
  `REDIRECT-SHIM` về list).
- EMBED-WRAPPER chỉ là transition cho deep workflow chưa tách presentation; khi
  route đã có native Branch presentation thì cập nhật `scripts/page-archetypes.mjs`
  khỏi `EMBED-WRAPPER` để guard không cho lùi lại.
- Branch route không link/redirect/revalidate vào control_surface roots cho cùng job của
  branch role; cầu nối control_surface chỉ là explicit owner context, không là tile vận
  hành mặc định.

## control_surface Shell Structure

`control_surface` chrome (`apps/web/app/components/app-shell.tsx`; code IDs lịch
sử `ControlSurfaceShell` / `data-control-surface-scroll`) render một sidebar trong một
`SidebarProvider`:

- Tab chính = mô-đun L0, single-sourced bởi `resolveControlSurfacePrimaryTabs`.
- Sub-tab = deep nav của mô-đun đang mở (`tier2`), render lồng dưới tab chính
  đang active.

`AppShell` nhận `tier1` + `tier2` thay cho `navGroups[]`. `tier1` không được
trải phẳng mọi page con thành tab chính: plane gom về tab "Quản trị", branch
management gom về tab "Quản lý chi nhánh", còn deep nav nằm trong sub-tab
của tab đang active. Trên mobile/tablet portrait `<lg` (`useIsMobile(1024)`),
bottom-nav ưu tiên `tier2` và chỉ có một tab "Mô-đun" mở drawer sidebar đầy đủ.
Từ desktop `≥lg`, bottom-nav ẩn và `control_surface` dùng một sidebar cố định.

`/me/*` là personal peer route trong cùng Control Surface shell, không thuộc
Inventory và không được thêm vào `tier1`/`tier2`. Điểm vào là `Trang cá nhân`
trong Avatar Footer; mobile drawer dùng cùng account menu. Với nhân viên Văn
phòng không có work-module item, `/me` là landing: desktop giữ Brand, Thông báo
và Avatar Footer nhưng không hiện module bị khóa; mobile không render bottom-nav
`Mô-đun` rỗng và dùng Avatar header làm account-menu trigger. Nội dung tiếp tục
dùng registered `Employee*` adapters; không tạo shell hoặc personal dashboard
riêng.

Scroll model (inset panel): `SidebarProvider` khóa viewport (`h-svh overflow-hidden`);
`SidebarInset` giữ khung card cố định (`overflow-hidden`, desktop `max-h` bù
margin inset); chỉ vùng nội dung trong panel cuộn (`overflow-y-auto
overscroll-contain`, `data-control-surface-scroll`). `AppPageHeader` cuộn cùng nội dung
— không sticky/freeze ngoài scrollport (sẽ chiếm chiều cao cố định và tạo khoảng
trống / cuộn thừa trên dashboard). Filter LIST freeze ở đỉnh shell scrollport qua:
(1) `AppListFrame` toolbar slot (tự sticky + stuck-state
shell bleed), hoặc (2) `AppToolbar sticky`, hoặc (3) `AppStickyFilterChrome` /
`APP_PAGE_STICKY_FILTER_CLASSNAME` cho filter bar tùy
biến. Sticky `top` âm hủy pad dọc shell (`pt-3 md:pt-4`) để filter flush mép trên
panel (tránh hàng list lộ trong khe pad). Khi stuck, filter hủy thêm pad ngang
shell (`px-3 md:px-4`) để flush mép trái/phải; khi cuộn về đỉnh, trở lại bề mặt
Card. Không sticky filter nằm trên KPI/dashboard cards (ví dụ Finance
`FilterBar`) — sẽ đè section kế tiếp khi cuộn. `AppPage scroll` bên trong `AppShellPaddingBoundary` không tạo
scrollport thứ hai (giữ `overflow-visible`) để sticky filter neo đúng vào shell
scrollport. Không đổi chrome Branch / `station_chrome`.

Shell mới cần chứng minh job chrome riêng, giữ đúng plane authority, và dùng
navigation resolver hiện hành. Guard chỉ giữ outcome đo được: navigation không
trở thành inline data và Branch/`station_chrome` không rò `control_surface` chrome.

## Component Governance

`docs/spec/design-system.md` owns the visual contract. Machine-owned enforcement
and discovery live in:

- `scripts/check-ui-contract.mjs` and `scripts/ui-contract-guard-reporting.mjs`
  for guard policy and failures.
- `scripts/ui-component-registry.mjs` for shared-component ownership and usage.
- `scripts/ui-contract-scope.mjs` for route/surface scope.

Run `corepack pnpm audit:ui-components` for a current report. Do not persist
counts, dated audit output, per-component usage lists, or provenance in this
document; the scripts and current source own those facts.

## Keyboard Shortcuts

Operational surfaces (POS, KDS) support keyboard shortcuts cho power users.
Shortcut helper duy nhất: `useKeyboardShortcut` tại
`apps/web/app/_lib/use-keyboard-shortcut.ts`.

Convention:

- Shortcut đơn phím (`T`, `D`, `/`) mặc định KHÔNG fire khi focus đang ở input/textarea/contenteditable.
- Shortcut có meta (`Cmd+Enter`, `Ctrl+K`) có thể dùng `fireInInput: true` để fire cả khi đang gõ.
- `Escape` để clear filter hoặc đóng dialog (Base UI overlay behavior tự xử lý close/focus return theo contract).
- Hiển thị hint với `<Kbd>` hoặc `<KbdGroup>` khi nhiều phím, cạnh label button, `className="hidden md:inline-flex"` để ẩn trên mobile.
- Thêm `aria-keyshortcuts="T"` trên button/toggle để screen reader đọc được.

Shortcuts da wire:

- POS cart (`cart-pane.tsx`):
  - `Cmd/Ctrl + Enter` — mở dialog xác nhận gửi bếp (works khi đang gõ note)
  - `T` — chuyển sang Mang về
  - `D` — chuyển sang Tại bàn
- POS append draft (`append-draft-pane.tsx`):
  - Không có shortcut riêng; append vào đơn cũ phải qua nút `Gửi món thêm`, không gửi ngay khi chạm món.
- KDS (`kds-board.tsx`):
  - `Escape` — clear hết filter (station + status + orderType) nếu có filter nào đang bật

Khi thêm shortcut mới, update bảng này + cấu hình `aria-keyshortcuts` tương ứng.

## Toast And Notifications

Contract duy nhất: `docs/spec/toast-notification-system.md`. Tài liệu này chỉ
chọn component UI; không định nghĩa lại producer, dedup, routing hoặc severity.

## Theme Runtime

Contract đầy đủ và runtime owner sống ở `docs/spec/design-system.md` § Token
Contract. Không thêm theme context, toggle hoặc browser-storage key thứ hai.

## Form Helpers

App-local form helpers sống tại `apps/web/app/components/form/`. Dùng cho mọi dialog/form mới:

- `TextField` — text Input + RHF useController
- `NumberField` — `FormattedNumberInput` tổng quát + RHF; không dùng thay cho
  semantic adapter khi trường đã thuộc miền tiền hoặc số lượng
- `MoneyVndInput` / `MoneyVndField` — tiền kế toán tối đa 2 chữ số thập phân,
  hiển thị nhóm theo `vi-VN`, submit chuỗi canonical dùng dấu `.`
- `WholeVndInput` / `WholeVndField` — tiền nguyên đồng cho menu/POS, tiền mặt,
  VietQR và kiểm đếm ca; không chấp nhận phần thập phân
- `QuantityInput` / `QuantityField` — inventory quantity, default 3 decimal places, grouped display
- `BusinessDateField` — RHF date picker, displays `dd/mm/yyyy`, stores `yyyy-mm-dd`, optional branch timezone note
- `SelectField` — Select voi `options={[{value, label}]}`
- `ComboboxField` — searchable Select + RHF, label/help/error/required state chung; description/error được liên kết tới trigger
- `FormField` — label/help/error chung cho control ngoài RHF hoặc composition đặc thù; đây là anatomy/layout wrapper, control con vẫn phải nhận `id`, `disabled`, và ARIA state phù hợp
- `Combobox` — control searchable độc lập; trong data-entry phải đặt trong `FormField` với `id` ổn định
- `TextareaField` — Textarea + RHF
- `AppDialog` — generic app Dialog shell; `variant="document"` dành cho chứng
  từ list-first PO và GRN
- `FormDialog` — generic Dialog + `useForm` + `zodResolver` + `useTransition`
- `valuesToFormData` — adapter để gọi server actions `withFormAction`-wrapped

Import: `import { TextField, FormDialog, ... } from "@/components/form"`.

Schema: luôn dùng Zod 4 với `{ error: "..." }` (không dùng `{ message }`).

### Form Mode Decision

- Dùng RHF + Zod khi form có line array, hơn 4 field, cần inline validation trước submit, hoặc cần pending/dirty submit UX. GRN, transfer lines, stocktake, adjustment, và production forms thuộc nhóm này.
- Dùng plain `<form action>` cho login, sign out, và single-reason confirm đơn giản khi state đã reload qua redirect.
- Shared schema cần import cả client và server thì đặt tại `packages/shared/src/forms/<name>.ts`; schema chỉ dùng nội bộ route có thể đặt gần route.
- Validation field-level hiển thị inline. Business error không map được field thì hiển thị toast/action message an toàn, không expose raw Supabase/Postgres error.

### Feedback Decision

- Sonner là feedback mặc định cho success/action outcome: `Đã lưu`, `Đã xác nhận GRN`, `Không thể tạo phiếu`.
- URL flash/search params không dùng cho non-auth success/error. Redirect đến `/access-denied?reason=` chỉ dùng cho permission, auth, hoặc scope failure.
- Durable notification chỉ dùng khi có follow-up cross-role/branch, SLA, approval, hoặc exception cần tồn tại sau reload.

### Inventory Flow Decision

Inventory IA bám ba luồng hiện hành:

1. `Nhập hàng` — Kho lập PO không giá, hệ thống tách theo NCC → Kế toán duyệt
   hoặc trả lại → Kho xác nhận GRN → Kế toán nhập giá theo dòng Hóa đơn NCC;
   chỉ xác nhận GRN làm phát sinh tồn/WAC.
2. `Kiểm soát tồn` — đúng một warehouse cho mỗi site active, kiểm kê, hao
   hụt/điều chỉnh và báo cáo.
3. `Sản xuất/tiêu hao` — một surface `/inventory/production` tại Bếp TT;
   công thức sở hữu đơn vị, lệnh giữ snapshot và Điều chuyển phân phối là chứng
   từ riêng; sale-consumption và write-off có nguồn rõ.

Kế toán duyệt PO trước khi Kho nhận hàng. Không đưa supplier return, lot/expiry,
production order hoặc same-branch Kho↔Bếp transfer vào daily IA.

Sidebar labels phải ngắn và scan được trong sidebar cố định. Tên đầy đủ của luồng đặt trong page title, breadcrumb, tab, hoặc empty state thay vì ép vào group label dài.

### Overlay Decision

Plane-neutral tree (ADR 0018 / `design-system.md` § C.1). Answer in order; stop
at the first match.

1. **Destructive / irreversible, no input?** → `confirm()`. With a required
   reason → `ReasonConfirmDialog` / AlertDialog family.
2. **Is this a task (it ends) or a view (it is a place)?**
   - _Task_ → not addressable. Continue at 3.
   - _View_ → addressable. Continue at 4.
3. **Task frame:** structured fields → `FormDialog`. Single bounded decision,
   no form → `AppDialog`. Touch plane, one-at-a-time entry → bottom `Sheet` /
   `Drawer`. Raw `Dialog` requires an approved exception.
4. **View home:** phiên độc lập, kéo dài, danh sách không còn là ngữ cảnh làm
   việc → **Page** (DETAIL hoặc DOC-WORKFLOW). List-first view → **addressable
   overlay** bound to `?<entity>Id=`. Nhu cầu mua, PO và GRN là nhóm chứng từ
   list-first và dùng `AppDialog variant="document"` trên Owner/Ops. YCH và
   Transfer dùng một fulfillment hub; Owner/Ops mở cùng một document dialog,
   Branch giữ canonical Page/fullscreen touch workflow. Line array hoặc stage
   footer không tự động ép sang Page; mỗi state vẫn chỉ có một primary action.

**URL write split (perf):** dialog-only keys (`demandId`, `poId`, `grnId`,
`mode`, and client-only list filters) use History API via
`useDocumentOverlayUrl` — push to open, replace for mode change/close — so the
list RSC does not refetch. Scope keys that change the server dataset
(`branchId`, server-backed pagination/filters) still use App Router
`router.push` / `router.replace`.

`Popover` never renders a record view or a multi-step workflow. `Drawer` is a
touch-plane frame, not a second control_surface overlay tier.

### AppPage width defaults

control_surface management LIST and DETAIL default to `AppPage width="xwide"`
(optionally `density="compact"`), recipe `management-list` /
`management-detail`. DOC-WORKFLOW defaults to `width="wide"`
(`management-document`). Inventory LIST filter Select widths live in
`inventory/_components/inventory-list-filters.ts` — not a Frame alias.
Deviation is allowed when the UI Advisor Gate states the reading task that
motivates it. `AppPage` is nesting-aware — set width once per page.

### Audit And Permission Decision

- Detail page có audit như `Tabs [Overview | Lines | Lịch sử]`; `Lịch sử` filter `audit_logs` bằng `entity_type` + `entity_id`, hiển thị actor, action, timestamp, old/new diff khi có.
- Tenant-wide `/audit` là compliance search surface, không bắt buộc cho Inventory Lite MVP.
- Nếu user thiếu quyền permanent thì hide action. Nếu bị block tạm thời do business state, show disabled + explain inline/tooltip, ví dụ chưa mở ca hoặc kỳ đã khóa.

## Composition Rules

Cho phép:

- wrapper nhỏ để tập hợp dữ liệu, nav, và structure
- wrapper domain delegate về `apps/web/app/components/surface.tsx`
- dùng `className` để sắp xếp layout cơ bản
- compose trực tiếp từ Má Tư DS shared components

Không cho phép:

- helper class kiểu `app-*`
- theme layer riêng ngoài `globals.css`
- parallel compatibility layer
- wrapper override visual contract của shared component
- module tự tạo lại page/header/section/toolbar/empty/link-card thay vì delegate về `apps/web/app/components/surface.tsx`
- dùng `div` / `span` / `p` thường để giả lập `Card`, `Badge`, `Button`, `Table`, `Tabs`, `Input`, `Select`
- per-surface `theme.css`
- shell chrome tự chế để thay cho shared component/surface structure

Quy tắc review:

- nếu UI trông giống `card` thì phải dùng `Card` qua đúng role/adapter; không
  ép card không phải số liệu vào `KpiCard`
- nếu UI trông giống `badge/chip` thì phải dùng `Badge`
- nếu UI trông giống `button` thì phải dùng `Button`
- nếu UI trông giống bảng dữ liệu thì phải dùng `Table`
- nếu UI là empty/error state thì phải dùng wrapper đã được phê duyệt như `AppEmptyState` / `TableEmptyStateRow`; route code không dùng raw `Empty*` trực tiếp
- nếu UI là loading spinner thì phải dùng `Spinner`, không tự style `Loader2 + animate-spin`
- nếu UI là standard RHF form field thì dùng helper typed từ `@/components/form` (`TextField`, `NumberField`, `SelectField`, `TextareaField`)
- nếu UI là controlled field ngoài RHF hoặc composition đặc thù thì dùng `FormField` / shared `Field`; raw `Input` chỉ nằm bên trong anatomy đó, native date/month/file workflow, hoặc inline editor có semantic rõ
- search/filter dùng `DataTable` search props hoặc `AppToolbar` + `InputGroup`; không ghép icon và `Input` bằng raw flex wrapper
- nếu UI là form dialog CRUD thì phải dùng `FormDialog` wrapper
- nếu không có component phù hợp, dùng wrapper route-scoped; chỉ update spec khi
  đổi contract hoặc shared adapter

## UI Rebuild Gate

`docs/spec/page-archetypes.md` § 0.1 UI Advisor Gate là contract duy nhất cho
quyết định trước khi sửa surface. Không duy trì một checklist thứ hai tại đây.
Gate phải nối được screen context → actor/job/workflow → information order →
archetype/exemplar → component/fallback → state/responsive/browser QA trước khi
implementation bắt đầu.

Nếu không có component khớp hoàn toàn, đi theo thứ tự fallback đã khóa trong
gate: composition từ shared component hiện có → route-scoped adapter → cập nhật
`docs/spec/design-system.md` trước khi thay đổi shared visual role, token, hoặc
behavior. Thiếu context không phải lý do để cài thêm skill/plugin hay tạo
parallel design contract.

Rebuild theo wave nhỏ:

1. Hoàn thành UI Advisor Gate và khóa route family.
2. Audit exemplar, shared adapter usage, và regression liên quan.
3. Chuẩn hóa shell/layout/state components trong phạm vi surface.
4. Sửa flow chính theo information order và primary action đã chốt.
5. Verify mobile first viewport, desktop density, state coverage, và
   accessibility risk đã nêu trong gate.
6. Update contract/regression chỉ khi phát hiện rule dùng chung mới.

Không gom nhiều route family lớn vào một PR nếu không cần thiết.

## Operational Surfaces

POS và KDS là surface vận hành, không phải dashboard.

Điều này có nghĩa:

- first viewport trên mobile phải ưu tiên action chính hoặc hàng đợi sống
- sau khi khóa context (ca, bàn, trạm, đơn), shell phải co gọn để nhường cho tác vụ chính
- analytics, hero copy, progress block chỉ là secondary content; không được đẩy queue/cart xuống dưới fold
- desktop có thể thêm mật độ thông tin, nhưng không được tạo IA khác mobile
- nếu control trông giống `Tabs`, `Badge`, `Button`, `Card`, `Sheet`, `Select`, `Progress` thì phải dùng shared component thật, không tự style raw `div` / `button`

Review heuristic:

- POS/KDS trước hết phải giúp nhân viên làm thao tác tiếp theo nhanh hơn
- một workflow state chỉ nên có một nơi thể hiện chính
- destructive action phải tách khỏi primary action và có confirm / recovery
