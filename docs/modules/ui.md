# UI Module

## Overview

UI của repo là Com Tam Ma Tu Custom Theme (Ma Tu Concept 01) chạy trên
Má Tư Design System primitives trong `@comtammatu/ui`. Radix, lucide, Tailwind,
và CVA là implementation dependencies, không phải source of truth cao hơn
contract.
Không còn helper layer hay theme system riêng theo route/surface.

Single source of truth for agent decisions:

1. `docs/spec/design-system.md`

File này là implementation guide: cách áp dụng contract vào app code, wrapper,
forms, keyboard shortcut, overlay, feedback, và rebuild flow. Không dùng file
này để override token, typography, rhythm, visual role, hoặc primitive authority
đã chốt trong `docs/spec/design-system.md`.

Runtime config, primitives, adapters, runbooks, worklogs, and regression rules
are evidence/enforcement for that contract. They do not authorize a second
design system:

- `packages/ui/src/styles/globals.css`
- `apps/web/app/layout.tsx`
- `packages/ui/src/components/*`
- `apps/web/app/components/surface.tsx`
- `tasks/regressions.md`

Runtime files are evidence. If runtime comments, package metadata, or generated
tokens disagree with `docs/spec/design-system.md`, treat that as drift and fix
the contract/runtime before building new UI.

## Contract Boundary

Tất cả UI/UX rebuild phải đi theo `docs/spec/design-system.md` trước khi sửa
runtime. Role split:

- `docs/spec/design-system.md`: Custom Theme authority; owns tokens, typography,
  rhythm, primitive roles, surface contracts, and forbidden compatibility names.
- `docs/modules/ui.md`: implementation guide; owns composition, form, overlay,
  feedback, shortcut, and rebuild workflow guidance.
- `docs/agent/rules/ui.md`: fast-loading guardrails for agents.
- `tasks/regressions.md`: negative rules from incidents; not an authority to
  invent new visual language.
- `docs/runbooks/*`: verification checklists only.
- `docs/worklog/README.md`: policy only; transient UI review notes belong in PR
  or task notes, then any durable contract is promoted to spec/modules/tasks.

Không được coi external UI scaffold output là authority cao hơn Custom Theme
contract. Pattern mới được route-scoped nếu vẫn giữ token, primitive, route
family, và workflow; chỉ sửa spec khi đổi contract hoặc shared adapter.

Code mới phải dùng `apps/web/app/components/surface.tsx`, `BrandMark` /
`BrandLockup` / `BrandSymbol` / `BrandMascot`, semantic token classes, và font
utilities hiện hành cho app UI. Nếu ý tưởng cần visual layer mới ở mức token,
chrome, primitive behavior, hoặc shared adapter, update
`docs/spec/design-system.md` trước khi rollout vào runtime.

Read order cho agent khi làm UI:

1. `AGENTS.md`
2. `docs/agent/rules/skills.md`
3. `docs/spec/design-system.md`
4. `docs/modules/ui.md`
5. `tasks/regressions.md`
6. Domain docs liên quan đến route đang sửa

## Primitive Baseline Contract

Baseline hiện tại: Má Tư DS primitives trong `packages/ui/src/components/*` cho
monorepo `apps/web` + `packages/ui`. Đây là primitive implementation baseline;
semantic token values và rhythm phải theo `docs/spec/design-system.md`.

Điều này có nghĩa:

- primitive structure phải theo file trong `packages/ui/src/components/*`
- semantic token values phải theo `docs/spec/design-system.md`
- brand color/typography phải đi qua semantic token và font variables chung
- page/shell chỉ được compose từ primitives có sẵn và app surface adapters
- logo/brand lockup, symbol, mascot trong web runtime phải đi qua `BrandMark` /
  `BrandLockup` / `BrandSymbol` / `BrandMascot`
- không được giữ `app-*` helper classes hoặc custom background/theme chrome ở root

## Primitive Layer

Primitive source vẫn sống tại `packages/ui/src/components/*`, và app code dùng các primitive này qua `@comtammatu/ui`:

- `button`
- `accordion`
- `card`
- `sidebar`
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
- `tag-input`
- `pagination`
- `resizable`
- `toolbar`
- `empty` — tất cả empty-state UI (no-data, no-results, error, inline)
- `field` + `field-group` — form field composition (label, control, error, description)
- `item` + `item-group` — list rows with media/title/description/actions
- `stat` — primitive-level DS parity; app dashboard metrics vẫn đi qua `KpiCard`
- `spinner` — loading indicator (thay cho `Loader2 + animate-spin`)

Không fork primitive theo surface.

`CardContent` table/list exceptions phải đi qua named primitive props:
`flush` cho table-edge/list-edge alignment và `scroll` cho horizontal table
scrolling. AppSection dùng `contentFlush` / `contentScroll` cho cùng vai trò.
Không dùng local `className="p-0"` hoặc `className="overflow-x-auto"` trên
`CardContent` hay `AppSection contentClassName` ở app code.

## App Surface Adapters

`apps/web/app/components/surface.tsx` là adapter layer duy nhất cho các pattern lặp lại ở app level:

- `AppPage` cho content container/width/scroll rhythm.
- `AppPageHeader` cho page heading, description, badge, action.
- `AppSection` cho card-backed section.
- `AppToolbar` cho filter/action toolbar.
- `AppEmptyState` cho empty/no-result/no-access/error state.
- `AppLinkCard` cho navigation/action card.
- `KpiRow` cho grid responsive (1/2/3 cột) bọc các `KpiCard` chỉ khi đó là
  metric/stat-value.
- `DescriptionList` cho cặp term/description (`<dl>`) ở trang chi tiết.
- `LinkCardGrid` cho grid responsive (1/2/3 cột) bọc các `AppLinkCard`.
- `DocumentFormFrame` cho khung trang document/line-form (header + body cuộn +
  footer) compose `AppPage`; là page-section adapter, không phải chrome shell.
- `AppDetailFooter` cho hàng footer leading/trailing ở trang chi tiết.

Domain wrappers như Inventory/Employee/Admin có thể giữ API riêng để tránh sửa hàng loạt call site, nhưng phải delegate về các adapter này thay vì tự style lại `Card`, `Empty`, hoặc page container.

Card không đồng nghĩa với `KpiCard`: `KpiCard` chỉ cho metric/stat-value; card
khác dùng `AppSection`, `AppLinkCard`, `OperationalBoardCard`,
`DataTable.mobileCardRender`, hoặc wrapper route-scoped có render `Card`.

## Branch Operator Hub

Branch Hub là surface mobile-first cho nhân viên và quản lý chi nhánh ở
`/br/[branchId]`. Nó dùng Branch operator adapter, không wrapper Office và
không gọi trực tiếp vocabulary Employee ở các route Branch:

- Branch và Office là hai mặt phẳng presentation khác nhau. Branch giữ
  mobile/tablet touch-first tại `/br/[branchId]/*`; Office giữ desktop
  management workspace responsive tại `/admin`, `/inventory`, `/finance`,
  `/hr`, `/menu`, `/orders`, `/branches`, và `/branch-settings`.
- data loader, Server Action, RPC và permission check có thể dùng chung giữa
  hai plane; presentation không được dùng chung nếu Office component tạo cảm
  giác desktop thu nhỏ trong Branch. Khi cần tách, Branch route dùng native
  `BranchOperator*` component và giữ Office route cho oversight/dense table.
- POS, KDS, Runner là station apps riêng dưới `/br/[branchId]/*`; không bọc vào
  Branch Hub bottom-nav và không dùng Office shell.

- hub và màn chi tiết dùng `BranchOperatorPage`, `BranchOperatorPanel`,
  `BranchOperatorActionSection`, và các Branch operator adapter tương ứng
  trước khi nghĩ tới wrapper mới.
- mobile ẩn page header trùng bằng `hideHeaderOnMobile`; app chrome đã giữ tên
  app, chi nhánh, và bottom nav.
- hub là nhóm action rows theo việc cần mở trong ngày; không đặt
  `Điều hành chi nhánh` hoặc `Cài đặt chi nhánh` như tile trong Hub.
- màn quản lý chi nhánh (`/dashboard`, `/settings`) dùng cùng Branch runtime
  chrome nhưng thuộc route family `branch_management`, mở qua bottom nav theo
  quyền quản lý.
- operator/operations/employee-lib không import hoặc render Management/Office
  chrome; guard `operator-office-shell-boundary` bắt mọi đường tắt qua
  `AppShell`, `OfficeModuleShell`, `FinanceShell`, hoặc `InventoryShell`.
- màn chi tiết giữ một primary action trong panel chính, không đặt CTA vận hành
  vào page header.
- staff-runtime wrapper chỉ đổi href/scope sang `/br/[branchId]/*`; workflow
  quản lý Branch phải sở hữu presenter touch-native và chỉ chia sẻ
  loader/model/action với Office. Không hồi sinh `/employee/*` compatibility
  routes.
- copy hiển thị sống trong `messages.employee.*`, `APP_COPY_VI`, hoặc registry
  domain tương ứng; route/component không hardcode copy vận hành mới.
- `/br/[branchId]/shift/leave-approvals` là Branch-native touch `LIST`: tab
  trạng thái + full-row items để quét nhanh, chi tiết và approve/reject nằm
  trong bottom `Sheet` có action sticky. Office giữ `LeaveRequestsTable`;
  Branch không import bảng hoặc page presenter HR Office.

Branch stock workflow áp dụng cùng ranh giới này:

- `/br/[branchId]/stock` là hub việc kho trong ca, không wrapper Office
  `StockPageContent`.
- list workflow native như `/br/[branchId]/stock/transfer` dùng archetype `LIST`
  với `BranchOperatorPage`/`BranchOperatorPanel`, action rows full-width trên
  mobile, và route-scoped href `/br/[branchId]/stock/*`.
- `/br/[branchId]/stock/on-hand` là Branch-native touch `LIST`: dùng shared
  `loadStockOnHandPageData` + pure filter model nhưng giữ `ItemGroup`/full-row
  touch presentation ở phone, tablet portrait và tablet landscape. Route này
  không đổi sang `DataTable` tại `1024px`, không hiển thị WAC/giá trị tồn/KPI,
  và mở thẻ kho qua `/br/[branchId]/stock/on-hand/[ingredientId]`.
- On-hand Branch là lookup surface, không lặp cụm mutation của Hub trên đầu
  danh sách. Nhận/điều chuyển/kiểm kê/hủy hỏng vẫn mở từ stock Hub; action theo
  nguyên liệu nằm trong thẻ kho chi tiết theo permission hiện có.
- `/br/[branchId]/stock/on-hand/[ingredientId]` là Branch-native touch `DETAIL`:
  dùng shared `loadStockIngredientDetailData` và pure movement/status model,
  nhưng tải `includeValuation: false` cho Branch. Thứ tự là tồn hiện tại/trạng
  thái, cân bằng theo vị trí, chuyển động gần đây, ngưỡng và action theo quyền;
  nhận NCC phải mở `/stock/grn/new`, không được trỏ vào `/stock/receive` là
  hàng chuyển nội bộ. Không đưa WAC, giá trị tồn, audit/correction, Office
  `AppPageHeader`, `DataTable`, hoặc Office detail presenter vào route này.
- `/br/[branchId]/stock/grn` là Branch-native touch `LIST`: dùng shared
  `loadGrnListPageData` + pure filter model, hiển thị nháp của người đang thao
  tác trước hàng đợi GRN, và giữ bỏ nháp là action có xác nhận. Danh sách Branch
  chỉ giữ mã phiếu, NCC, ngày và trạng thái; không hiển thị tổng
  tiền/tên chi nhánh, không dùng `DataTable` hoặc long-press, và không đổi sang
  Office presentation tại tablet landscape.
- `/br/[branchId]/stock/grn/new` là Branch-native touch `LIST` cho bước chọn
  nguồn: dùng shared `loadGrnSourcePageData` + pure source model, có tìm NCC,
  tạo NCC khi được cấp quyền, và không còn cửa PO. Supplier entry canonical tại
  `/br/[branchId]/stock/grn/new/[supplierId]`; màn
  source không render `DocumentFormFrame`, `DataTable`, hoặc Office picker.
- `/br/[branchId]/stock/grn/new/[supplierId]` là Branch-native touch
  `DOC-WORKFLOW`: dùng shared `loadGrnCreatePageData`,
  `useGrnCreateController`, và `GrnLineEditSheet`, nhưng route tự sở hữu bố cục
  `BranchOperatorPage`/`BranchOperatorPanel`, list dòng chạm để sửa, và
  `AppDetailFooter` sticky. Context NCC/kho nhận đứng trước danh sách dòng và
  tìm nguyên liệu; branch bị khóa bởi URL, tablet landscape chỉ mở grid panel
  chứ không đổi thành bảng hay desktop side editor. Route không import Office
  page/client, `DocumentFormFrame`, `DataTable`, `AppPageHeader`, hoặc
  `AppSection` trực tiếp.
- `/br/[branchId]/stock/grn/[id]` là Branch-native touch `DETAIL`: nháp dùng
  shared detail loader/model/action hooks nhưng tự sở hữu danh sách kiểm nhận
  chạm, bottom sheet sửa/thêm dòng, và `AppDetailFooter` sticky để lưu/chốt;
  phiếu không còn nháp là biên nhận chỉ đọc. Route không import Office
  `GRNDetailClient`, `embedded`, audit history, post-confirm correction, stock
  correction, hoặc liên kết hóa đơn NCC. Các tác vụ quản trị đó vẫn thuộc Office
  `/inventory/grn/[id]`.
- `/br/[branchId]/stock/stocktake` là Branch-native touch `LIST`: session
  stocktake của quản lý khác với `/stock/count` là count slip được giao cho
  nhân viên. Route dùng shared `loadBranchStocktakeListData`/model, full-row
  `ItemGroup` ở phone/tablet, và không dùng `DataTable`, long-press drawer,
  Office toolbar, branch picker, audit, hay report CTA.
- `/br/[branchId]/stock/stocktake/new` là Branch-native `DOC-WORKFLOW`: URL
  khóa branch, chỉ chọn mode và location, sau đó mở phiên qua action hiện có và
  chuyển vào count. Route dùng `BranchOperatorPage`/`BranchOperatorPanel` và
  `AppDetailFooter` sticky; không import `DocumentFormFrame` hoặc Office start
  presenter.
- `/br/[branchId]/stock/stocktake/[id]/count` là Branch-native touch
  `DOC-WORKFLOW`: number pad là entry point, cho phép chọn đơn vị ghi nhận ngay
  trên nguyên liệu active, giữ autosave draft/zone lock/round submit hiện có,
  và không đổi tablet thành `DataTable`. Payload blind không mang số tồn hệ
  thống; dữ liệu system/count/variance chỉ xuất hiện sau khi hoàn tất.
- `/br/[branchId]/stock/stocktake/[id]` là Branch-native touch `DETAIL`: active
  review chỉ nhận blind counts, count/recount status, continue, cancel, và
  complete theo permission; completed result dùng `ItemGroup` system/count/
  variance. Không đưa audit history, Office detail client, report CTA, WAC, hay
  giá trị tồn vào route này.
- `/br/[branchId]/stock/issues` là Branch-native touch `LIST` chỉ cho `writeoff`
  và `other`: branch bị khóa bởi URL, danh sách chỉ giữ mã phiếu, loại, ngày và
  trạng thái; tạo nháp mở trong bottom `Sheet`, không có branch picker,
  `DataTable`, export, audit hoặc tổng giá trị Office.
- `/br/[branchId]/stock/issues/[id]` là Branch-native touch `DETAIL`: nháp cho
  thêm/sửa/xóa từng dòng bằng bottom `Sheet` với đơn vị nhập, số lượng không vượt
  tồn và lý do bắt buộc; xác nhận/hủy dùng `AppDetailFooter` sticky và authority
  Server Action/RPC hiện có. Phiếu đã xác nhận/hủy chỉ đọc. Không đưa WAC, tổng
  giá trị, audit history, `DocumentStockCorrectionDialog`, Office detail client,
  hay branch/source picker vào Branch.
- `/br/[branchId]/stock/consumption` là Branch-native touch `LIST`: segmented
  view tách ledger tiêu hao đã ghi khỏi chứng từ thủ công, row giữ nguồn,
  trạng thái và thời điểm. `/stock/consumption/[id]` là typed `DETAIL` chỉ nhận
  record tiêu hao; cả hai route dùng Branch presenter và không import Office
  `DataTable`/page content.
- `/br/[branchId]/stock/count-assignments` và `/stock/count-slips` là hai
  Branch-native touch `LIST`: assignment nhóm theo nhân viên; review slip mở
  chênh lệch và approve/request-recount trong bottom `Sheet` với footer sticky.
  Không có CTA mở nhầm phiếu đếm cá nhân của quản lý, không nhận
  `routeBranchId`/`embedded` từ Office clients.
- Office `/inventory/count-assignments` và `/inventory/count-slips` là hai
  management `LIST` responsive độc lập: desktop dùng `DataTable`, thao tác hiển
  thị bằng nút và mở `AppDialog`; mobile fallback chỉ là card responsive của
  cùng table adapter. Office không dùng swipe, long-press, `Drawer`, `Sheet` hay
  presenter Branch.
- `/br/[branchId]/stock/waste` là Branch-native touch `DOC-WORKFLOW`: URL khóa
  chi nhánh, màn chính giữ location/cap và `ItemGroup` của các dòng đã chọn;
  điện thoại sửa một dòng trong bottom `Sheet`, tablet chỉ mở rộng thành hai
  panel cùng IA. Tier, ảnh bằng chứng, rolling meter, số lượng không vượt tồn
  và Server Action/RPC hiện có phải giữ nguyên. Không import
  `WasteNewPageContent`, `WasteCreateClient`, `DocumentFormFrame`, `DataTable`,
  hoặc chrome Office.
- `/br/[branchId]/stock/waste-approvals` là Branch-native touch `LIST`: queue
  khóa theo URL branch, mỗi row chạm mở bottom `Sheet` chứa line, reason, tier,
  evidence và review note. Duyệt/từ chối chỉ gọi `approveWaste`, giữ nguyên
  four-eye rule và xác nhận mutation; phiếu tự tạo chỉ đọc. Không import
  `WasteApprovalsPageContent`, `WasteApprovalsClient`, `DocumentFormFrame`,
  `DataTable`, hoặc chrome Office.
- Purchase orders và supplier returns đã rút khỏi UI hằng ngày ở cả Branch và
  Office theo D073. GRN supplier-first; hàng NCC bị từ chối đi qua Báo hao hụt.
  DB/RPC/history và integrity gate của chứng từ cũ vẫn được giữ, nhưng không có
  nav, route mutation hay presenter để tạo mới.
- `/br/[branchId]/stock/reports` là Branch-native touch `REPORT`: cố định đúng
  chi nhánh URL và tháng hiện tại, ưu tiên chênh lệch tiêu hao warning/critical
  rồi biến động của từng nguyên liệu có drill-in vào tồn thực. Mỗi số lượng luôn
  đi cùng đơn vị của nguyên liệu; không cộng chéo kg/lít/cái. Không dùng
  `ReportsPageContent`, `ReportsClient`, `DataTable`, biểu đồ, KPI tổng, công
  nợ NCC, giá vốn, export, audit hay branch/date picker. Office
  `/inventory/reports` giữ dashboard quản trị riêng, không còn `embedded` mode.
- Office `/inventory/stock` dùng cùng loader/model nhưng giữ management
  `StockClient`: compact cards khi viewport hẹp và dense `DataTable` trên
  desktop. Office client không có `embedded` mode hoặc Branch route branching.
- Office `/inventory/operations?tab=grn` dùng cùng GRN loader/model nhưng giữ
  `GrnListClient` management presentation: branch, tổng giá trị và desktop
  `DataTable` vẫn thuộc Office; client này không nhận diện `/br/` để đổi layout.
- Office `/inventory/grn/new/[supplierId]` giữ `DocumentFormFrame` và desktop
  line editor trong `GrnCreateClient`; Office và Branch chỉ chia sẻ loader,
  typed controller, line-editor primitive, và server action, không chia sẻ
  presentation mode hoặc route branching.
- detail điều chuyển trong Branch chỉ giữ thao tác giao/nhận và số lượng từng
  dòng; audit history và correction sau khi chốt thuộc Office management.
- tạo điều chuyển tại `/br/[branchId]/stock/transfer/new` là Branch-native
  `DOC-WORKFLOW`: phone mở dần nơi đi/nơi nhận → mặt hàng → ghi chú, tablet tăng thành hai
  cột, control tối thiểu 44px và CTA nằm trong `AppDetailFooter` sticky. Route
  Office `/inventory/transfers/new` giữ `DocumentFormFrame`; hai plane chỉ dùng
  chung loader, model, controller và `createStockTransfer`.
- EMBED-WRAPPER chỉ là transition cho deep workflow chưa tách presentation; khi
  route đã có native Branch presentation thì cập nhật `scripts/page-archetypes.mjs`
  khỏi `EMBED-WRAPPER` để guard không cho lùi lại.
- Branch route không link/redirect/revalidate vào Office roots cho cùng job của
  branch role; cầu nối Office chỉ là explicit owner context, không là tile vận
  hành mặc định.

## Management Shell Structure

Management chrome (`apps/web/app/components/app-shell.tsx`) render một sidebar
trong một `SidebarProvider`:

- Tab chính = mô-đun cross-module, single-sourced bởi `resolveOfficePrimaryTabs`.
- Sub-tab = deep nav của mô-đun đang mở (`tier2`), render lồng dưới tab chính
  đang active.

`AppShell` nhận `tier1` + `tier2` thay cho `navGroups[]`. `tier1` không được
trải phẳng mọi page con thành tab chính: Admin gom về một tab "Quản trị", branch
management gom về một tab "Quản lý chi nhánh", còn deep nav nằm trong sub-tab
của tab đang active. Trên mobile `<md`, bottom-nav ưu tiên `tier2` và chỉ có một
tab "Mô-đun" mở drawer sidebar đầy đủ. Từ tablet `md` trở lên, bottom-nav ẩn và
Management dùng một sidebar cố định.

Shell/nav registry drift bị chặn bởi `shell-registry-bespoke-main` và
`nav-shell-inline-literal`: route mới không tự dựng `<main>`, sidebar,
bottom-nav, hoặc inline `ShellNavGroup[]`; dùng `AppShell`, `OfficeModuleShell`,
`AppBottomNav` / `WorkspaceBottomNav`, và nav resolver đã có.

## Component Governance

`Card`, `Table`, `Dialog`, và `AlertDialog` là primitive composition cấp cao.
Code app mới không được mặc định import trực tiếp các primitive này từ
`@comtammatu/ui/components/*`; phải chọn adapter sở hữu workflow trước:

- layout/card section → `AppSection`, `AppLinkCard`, `KpiCard` cho metric,
  `InteractiveCard`, `OperationalBoardCard`, hoặc wrapper route-scoped
- table/list responsive → `DataTable` hoặc `TableEmptyStateRow`; document line-sheet cần adapter ghi rõ
- short non-form detail/task dialog → `AppDialog`; CRUD form dialog → `FormDialog`;
  form dài hoặc nhiều line dùng Page/Sheet theo Overlay Decision
- destructive confirm đơn giản → shared `confirm()`; confirm có input/reason dùng flow đã duyệt

`pnpm lint:ui-contract` khóa baseline import trực tiếp theo từng file bằng các
gate `raw-card-import-file-baseline`, `raw-table-import-file-baseline`,
`raw-dialog-import-file-baseline`, và `raw-alert-dialog-import-file-baseline`.
`pnpm audit:ui-components` nối các import này vào signal
`rawPrimitiveImportBaseline`; signal này phải khớp guard group
`frozenPrimitiveImportBaselines` trong `lint:ui-contract`.
Baseline chỉ được giảm. Nếu một file mới cần import trực tiếp primitive cấp cao,
phải update `docs/spec/design-system.md` hoặc module doc liên quan trước, không
thêm allowlist cục bộ để né guard.
Focus ring drift bị chặn bởi `focus-ring-contrast`: không dùng `ring-ring` /
`ring-ring/*` cho focus affordance; dùng `ring-foreground` để giữ contrast.
Radius và gap token drift bị chặn bởi `radius-scale`, `gap-scale`, và
`primitive-radius-scale`: app surface chỉ dùng radius/gap trong scale đã khóa;
primitive không thêm `rounded-xl` / `rounded-2xl` / `rounded-3xl` / `rounded-4xl`.
Radius tier debt bị chặn bởi `radius-tier-baseline`: icon-box và inset nhỏ dùng
`rounded-md`, card/container dùng `rounded-lg`, pill thật mới dùng `rounded-full`.
Tint opacity drift bị chặn bởi `tint-opacity`: status token chỉ dùng `/10`,
`/15`, `/20`; muted fill chỉ dùng `/30` hoặc `/50`; không tự pha `/5`, `/25`,
`/60`, `/95`, hoặc opacity khác.
Primitive motion drift bị chặn bởi `primitive-transition-all`: shared UI
primitive không dùng `transition-all`; ghi rõ property transition ở primitive.
Primitive/app sizing drift bị chặn bởi
`primitive-runtime-arbitrary-px-rem-sizing` và `app-arbitrary-sizing`: primitive,
app surface, và app adapter không thêm `text-[Npx]`, `w-[Npx]`, `h-[Npx]`, hoặc
raw arbitrary sizing; dùng token Tailwind/theme đã có.
Primitive shadow drift bị chặn bởi `primitive-arbitrary-shadow` và
`primitive-shadow-overrun`: không thêm `shadow-[...]` hoặc raw `shadow-xl` /
`shadow-2xl` trong primitive; dùng shadow token đã khóa theo overlay/card rung.
Card/AppSection layout override drift bị chặn bởi
`card-content-named-layout-props` và `app-section-content-named-layout-props`:
không thêm `p-0` hoặc `overflow-x-auto` trong `CardContent className` /
`AppSection contentClassName`; dùng `flush` / `scroll` hoặc `contentFlush` /
`contentScroll`.
Legacy Card className debt bị chặn bởi `card-content-classname-baseline` và
`card-title-classname-baseline`: không tăng override mới; dùng named props
(`flush`, `scroll`, `size`) hoặc adapter owning workflow.
ScrollArea collapse drift bị chặn bởi `scrollarea-no-max-height-only`: không
dùng `<ScrollArea>` chỉ với `max-h-*`; dùng height/flex constraint rõ ràng hoặc
để `DataTable` / layout thường tự sở hữu scroll.
Responsive hook drift bị chặn bởi `use-is-mobile-budget`: `useIsMobile` chỉ cho
composition-level switch như drawer/sheet, page width, hoặc wizard density;
list/table responsive dùng `DataTable.mobileCardRender` thay vì fork route-local,
trừ Branch-native touch `LIST` đã được khai báo trong
`docs/spec/page-archetypes.md` và dùng shared loader/model riêng presentation.
Motion drift trong app source bị chặn bởi `app-transition-all`: không thêm
`transition-all` hoặc `motion-safe:transition-all`; ghi rõ property transition.
Viewport accessibility drift bị chặn bởi `root-viewport-allows-zoom`: runtime
app không được set `maximumScale: 1`, `userScalable: false`, hoặc
`user-scalable=no`.
Route boundary drift bị chặn bởi `route-boundary-adapters`: `loading.tsx` dùng
`PageSkeleton` / `PageSpinner`, `error.tsx` dùng `ErrorPanel`.
Empty-state drift bị chặn bởi `raw-empty-import-route-code`: route code không
import raw `@comtammatu/ui/components/empty`; dùng `AppEmptyState` hoặc
`TableEmptyStateRow`.
Page-padding drift bị chặn bởi `page-padding`: page root không tự clone
`AppPage` bằng `max-w-* + p-*`; outer spacing đi qua `AppPage` density.
Action height drift bị chặn bởi `button-height-on-button`: action dùng
`Button`/`TouchButton` size (`touch`, `touch-lg`, `icon-touch`, `tile`) thay vì
raw `h-*` / `min-h-*` trên `<Button>`, `<button>`, hoặc `<Link>`.
Money formatter drift bị chặn bởi `vnd-format-ssot`: tiền VND hiển thị qua
`formatVND` từ `@comtammatu/shared/format`, không tự tạo page-local formatter
hoặc raw `toLocaleString("vi-VN")` cho money.
Number formatter drift bị chặn bởi `app-page-local-number-formatter`: app UI
dùng shared helpers như `formatVND` / `formatCount`, không tự tạo
`Intl.NumberFormat` hoặc raw `.toLocaleString()`.
Date/time formatter drift bị chặn bởi `date-format-ssot`: ngày giờ dùng
`@comtammatu/shared/time`, không tự tạo `Intl.DateTimeFormat` hoặc
`.toLocaleDateString()` / `.toLocaleTimeString()`.
`pnpm audit:ui-components` nối các formatter này vào signal
`pageLocalFormatter`; signal phải khớp guard group `formatterGuardBaselines`
trong `lint:ui-contract`.
Heading scale drift bị chặn bởi `heading-scale`: app surface không tự dựng
`text-4xl`, `text-5xl`, hoặc `font-black`; page H1 đi qua `AppPageHeader`, section
heading đi qua `CardTitle` / `AppSection`, và số lớn chỉ dùng role numeric echo
đã khóa trong design-system spec.
Icon size drift bị chặn bởi `icon-size`: glyph dùng role scale trong spec
(`size-3`→`size-6`, media qua `EmptyMedia` / thumbnail); không tự thêm
`size-7`, `size-9`, `size-11`, `size-14`, hoặc `size-16` trong app surface.
Uppercase label drift bị chặn bởi `uppercase-label-scale`: section/panel/field
eyebrow dùng `SectionLabel`, không inline `text-sm uppercase` /
`text-base uppercase`.
Hover elevation drift bị chặn bởi `hover-shadow-rung`: không thêm
`hover:shadow-md` / `lg` / `xl` / `2xl` trong app code; hover rung tối đa là
`shadow-sm` hoặc dùng border/tone theo adapter.
Primitive float shadow drift bị chặn bởi `app-effect-shadow-rung`: app surface
không dùng `shadow-effect-popover` / `dialog` / `drawer` / `tooltip` / `toast`;
các shadow này thuộc primitive overlay, không thuộc route card/section.
Resting shadow drift bị chặn bởi `resting-shadow-rung`: không thêm
`shadow-sm` / `md` / `lg` / `xl` / `2xl` tĩnh trong app code; trạng thái
selected/active dùng ring, border, và background thay vì elevation mới.
`resting-shadow-baseline` giữ tổng nợ không tăng, còn `custom-shadow-baseline`
chặn `shadow-[...]`, `boxShadow`, `box-shadow`, và route-local `--shadow-*`.
Motion duration drift bị chặn bởi `motion-color-duration`: `transition-colors`
không đi với `duration-300`; color/border feedback dùng `duration-150`, còn
`duration-300` chỉ dành cho overlay enter/exit.
Raw HTML `<table>` trong app source bị chặn bởi `raw-table-element`; dùng
adapter hoặc shared primitive đã duyệt thay vì dựng table semantics tại route.
Status chip wrapper route-local bị chặn bởi `status-chip-wrapper-baseline`:
không thêm `*StatusBadge` component hoặc `*_BADGE_VARIANT` map mới; đăng ký
domain vào `status-badge.tsx` hoặc dùng `getStatusBadgeMeta`.
POS/KDS touch reveal bị chặn bởi `pos-kds-touch-reveal-baseline`: không thêm
native lowercase HTML `title=` hoặc `<Tooltip>` để lộ nội dung bị ẩn; dùng copy
hiển thị, `NoteCallout`, Sheet/Drawer tap-to-expand, hoặc layout nhiều dòng.
Vertical rhythm drift bị chặn bởi `space-y-baseline`: không thêm `space-y-*`
cho section/page/dialog/client-root stack; dùng `flex flex-col gap-*` qua
`AppPage`, `AppSection`, `FieldGroup`, hoặc adapter sở hữu layout.
Geometry/chrome budget drift bị chặn bởi `raw-padding-baseline`,
`gap-atypical-baseline`, và `inline-chrome-baseline`: không thêm padding lớn,
gap lẻ, hoặc rounded+border card clone route-local; dùng `AppPage`,
`AppSection`, `Item`, `NoteCallout`, `Alert`, hoặc named adapter props.
Page heading drift bị chặn bởi `hand-rolled-page-heading-baseline`: không thêm
`<h1 className="font-heading ...">` route-local; dùng `AppPageHeader` cho
title/description/badge/action/tabs.
Operator route boundary bị chặn bởi `operator-office-route-boundary`: route
operator không link/redirect vào Office roots; giữ flow trong `/br/[branchId]`
hoặc shared non-office surface.
Operator embedded drift bị chặn bởi `operator-embedded-page-header-boundary` và
`operator-embedded-button-density`: embedded branch không render nested
`AppPageHeader`, và primary action dùng `size={embedded ? "touch" : "sm"}`
hoặc biến tương đương.

## Component Audit

Khi cần đào sâu UI/component debt theo từng route family, chạy:

```bash
pnpm audit:ui-components
pnpm audit:ui-components -- --family inventory
pnpm audit:ui-components -- --family hr --all
```

Audit này đọc code hiện tại trong scope khóa tại
`scripts/ui-contract-scope.mjs` (`apps/web/app`, Branch Operator adapter, và
Employee runtime) rồi in ra:

- route-family summary: số file/page, direct import `Card`/`Table`/`Dialog`/`AlertDialog`, adapter adoption gồm route transition frame, `STATUS` map, `useIsMobile`
- page archetype coverage: mọi `apps/web/app/**/page.tsx` phải có đúng một entry
  trong `PAGE_ARCHETYPES`; `missing` và `stale` luôn bằng `0`
- shared adapter adoption: file/hit cho `AppPage`, `DataTable`, `AppDialog`, `FormDialog`, `KpiCard`, `StatusBadge`, `PageSkeleton`, `ErrorPanel`, v.v.
- component selection coverage: toàn bộ primitive file được phân loại
  `direct`, `adapter-only`, `workflow-only`, hoặc `internal`; app/domain
  adapter exports cũng được kiểm tra tồn tại
- highest-risk files: file nào còn nhiều primitive composition trực tiếp hoặc signal drift
- UI/a11y/coverage signals: `transition-all`, native interactive element,
  icon/action aria-label risk, action height drift, surface clone risk,
  loading spinner risk, page-local formatter, route-local state copy risk đã
  có guard khi baseline sạch, và action/data copy risk cho `.ts` action/read
  files.

The audit has an `audit-to-guard map` in `scripts/audit-ui-components.mjs`.
Every `SIGNALS` entry must be classified as `blocking-zero`,
`blocking-baseline`, `blocking-mixed`, `blocking-exception`, or explicit
`advisory`, and every blocking signal must point at an existing
`lint:ui-contract` guard. `blocking-exception` requires a reason and means
"named implementation/composition exception", not debt that agents can copy.
It must also declare an `exceptionAllowlist` that matches the owning
`lint:ui-contract` guard allowlist exactly; adding a file to that list is a
contract change, not an audit-only tweak.
Signals that represent a guard family, such as `rawPrimitiveImportBaseline` and
`pageLocalFormatter`, must declare a `guardGroup` so the audit map and
`lint:ui-contract` cannot drift.
`rawPrimitiveImportBaseline` is `blocking-exception`: every remaining direct
high-level primitive import belongs to an exact registered adapter
implementation allowlist, and route code has no allowance. `pageLocalFormatter`
is `blocking-zero`: money, number, date, and time formatting drift has no
remaining baseline.
The audit prints this as `Signal Guard Coverage`; `lint:ui-contract` and the
static test block adding a new report column without either a guard or a
documented advisory/exception reason.

The reverse direction is owned by
`scripts/ui-contract-guard-reporting.mjs`. Every guard id detected in
`scripts/check-ui-contract.mjs` must be either referenced by an audit signal or
assigned to one explicit lint-only group with a reason. Baseline maintenance
ids are classified separately from runtime guards. The audit prints the result
as `Guard Reporting Closure`; `unclassified` must remain zero, so a new guard
cannot silently land outside the report inventory.

`Baseline Ratchet Truth` tách riêng `actual`, `allowed`, `delta`, `debt`, và
`permanent exception` cho toàn bộ baseline guard. `delta = actual - allowed`
phải bằng `0` sau khi hạ ratchet. Một hit chỉ được tính là permanent exception
khi policy trong `scripts/ui-contract-guard-reporting.mjs` chỉ rõ adapter hoặc
archetype nào sở hữu nó; mọi hit còn lại vẫn là debt dù lint đang xanh.

App presentation state-copy is blocked by `app-presentation-state-copy` across
the shared UI runtime scope: loading, empty, and error copy must come from
shared messages/adapters instead of route-local literals. Server action/data `.ts`
copy is reported as `actionDataStateCopy` and blocked by the zero-baseline
`app-action-data-state-copy` guard. Formatter drift is reported as
`pageLocalFormatter` and bound to `formatterGuardBaselines`: finance-local
formatters (`finance-page-local-formatter`), app-local number formatters
(`app-page-local-number-formatter`), VND formatter drift (`vnd-format-ssot`),
and date/time formatter drift (`date-format-ssot`).
Raw app loading spinner drift is blocked by `app-loading-spinner-ssot`: app
surfaces must use `Spinner`, `PageSpinner`, `PageSkeleton`, or approved loading
adapters instead of direct `Loader2`/`LoaderCircle` plus `animate-spin`.
Action height drift is reported by `audit:ui-components` and blocked by
`button-height-on-button`: action surfaces must use `Button`/`TouchButton` size
variants such as `touch`, `touch-lg`, `icon-touch`, or `tile` instead of
route-local `h-*` / `min-h-*` class patches.
Surface clone risk is reported by `audit:ui-components` and blocked by
`surface-clone-ssot`: it flags route-local component definitions
named like `*Table`, `*Dialog`, `*Header`, `*Toolbar`, `*EmptyState`,
`*Skeleton`, or metric/status adapters so agents must either collapse the code
into an existing Má Tư DS adapter or use a workflow-specific name. Adapter-backed
`*Section`, `*Toolbar`, `*Table`, and `*Dialog` wrappers are not counted when they already
route through `AppSection`, `BranchOperatorPanel`, `SettingsFormSection`,
`AppToolbar`, `PwaToolbar`, `DataTable`, `AppDialog`, `FormDialog`, or
`FileImportDialog`; dynamic import aliases such as
`const AdjustStockDialog = dynamic(...)` are also not counted as local dialog
clones.

`page-archetype` quét toàn bộ `apps/web/app/**/page.tsx`, không chỉ protected
routes. `route-boundary-coverage` buộc mỗi page resolve được `loading.tsx` và
`error.tsx` gần nhất; boundary thực tế tiếp tục bị
`route-boundary-adapters` khóa về `PageSkeleton`/`PageSpinner` và `ErrorPanel`.

Đây là công cụ định hướng review, không phải UI authority. Khi kết quả audit
mâu thuẫn với `docs/spec/design-system.md`, contract thắng; sửa runtime hoặc
guard để quay về contract.

## Má Tư Component Decision Matrix

Chọn component theo nhu cầu trước, không chọn theo primitive nhìn giống. Nếu
không khớp hàng nào, dừng ở route-scoped adapter và cập nhật contract trước khi
thêm primitive/wrapper mới.

| Need                          | Use                                                                        | Fallback                                                                 | Forbidden                                                         | Exemplar                             |
| ----------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------ |
| List / searchable table       | `DataTable`                                                                | `TableEmptyStateRow` trong table đã có sẵn                               | raw `Table`, double mobile/desktop JSX tree                       | inventory GRN, HR list               |
| Detail / record review        | `AppPage` + `AppPageHeader` + `AppSection` + `DescriptionList`             | route-scoped detail adapter delegate về surface components               | page-local card grid tự style                                     | inventory GRN detail                 |
| Document workflow / line form | `DocumentFormFrame`                                                        | `AppPage` + sticky `AppDetailFooter` nếu không phải document             | hand-rolled document shell, fixed footer tự do                    | GRN create, production run           |
| Form field                    | `Field` / `FieldGroup` + shared form controls                              | route field wrapper delegate về `Field`                                  | raw label/input spacing, missing `name` / label                   | shared form components               |
| Form dialog / CRUD            | `FormDialog`                                                               | Sheet/Page cho flow dài hoặc nhiều line                                  | raw `Dialog` + `useForm` + `zodResolver`                          | HR employee dialog                   |
| Detail / task dialog          | `AppDialog`                                                                | Sheet/Page nếu nội dung dài hoặc task nhiều bước                         | raw `DialogHeader` / `DialogContent` trong route                  | menu item detail, HR photo/checklist |
| Metric / stat                 | `KpiRow` + `KpiCard`                                                       | route metric adapter delegate về `KpiCard`                               | local `StatCard` / `SummaryCard` definitions                      | finance/HR KPI rows                  |
| Status                        | `StatusBadge` + shared label maps                                          | domain-specific variant map inside `status-badge.tsx`                    | page-local `STATUS_LABELS` / color maps                           | attendance, payroll, inventory       |
| Overlay / confirm             | shared `confirm()` for simple confirm; `FormDialog` for form               | approved contextual dialog for POS/KDS task flow                         | native `window.confirm/alert`                                     | delete/void/reason flows             |
| Empty / error                 | `AppEmptyState`                                                            | `TableEmptyStateRow` inside table                                        | raw Empty primitive in route code, local empty copy block         | DataTable empty state                |
| Loading                       | `Spinner`, `Skeleton`, or adapter skeleton                                 | `AppEmptyState mode="loading"` only when the page contract needs it      | `Loader2` + `animate-spin`, route-local loading panel drift       | data table / branch hub skeleton     |
| Operator embedded             | Branch operator adapters, `embedded` branch without nested `AppPageHeader` | shared canonical content with explicit `basePath` and touch-size actions | Office shell/header inside `/br/[branchId]`                       | operator stock / orders embeds       |
| Touch action                  | `Button size="touch"` / `touch-lg`                                         | `size={embedded ? "touch" : "sm"}` when sharing Office + Branch          | raw `h-*` action sizing, icon-only action without accessible name | branch runtime primary actions       |

## Shared Component Registry

Bảng tra cứu "component → vai trò → rule khóa" cho toàn bộ adapter layer đã
duyệt (D058 W5). Mọi rule cột cuối trỏ về section của
`docs/spec/design-system.md` (viết tắt DS); đây là bảng mô tả, không phải
authority — khi runtime lệch bảng, sửa runtime hoặc cập nhật DS trước.

`scripts/ui-component-registry.mjs` là inventory máy đọc được cho coverage:
mỗi file trong `packages/ui/src/components/` phải có `need`, `use`, `fallback`,
`forbidden`, `exemplar` và một access class. Registry cũng khóa các app adapter
được audit và toàn bộ export của Branch Operator / Employee adapter families.
Primitive file hoặc domain-adapter export mới chưa được phân loại làm
`lint:ui-contract` fail. Các bảng dưới đây là index ưu tiên cho con người, không
lặp lại toàn bộ inventory 1:1.

Trước khi build/sửa trang, đọc `docs/spec/page-archetypes.md` để biết page
đang sửa thuộc archetype nào và recipe khóa những component nào; bảng này trả
lời "component X đang khóa vai trò gì, rule ở đâu". Muốn biết "component X
đang dùng ở đâu trong repo", chạy `codegraph_explore` / `codegraph_callers`
hoặc `pnpm audit:ui-components` (xem § Component Audit ở trên) — không
grep-mò và không copy một file đã thấy làm mẫu.

### Shared Primitives (`packages/ui/src/components/`)

Các primitive có quyết định không hiển nhiên được nhấn mạnh tại đây. Danh sách
đủ và route dùng/fallback/forbidden nằm trong machine registry nói trên.

| Primitive (File)                   | Vai trò                                       | Rule khóa (DS)        | Khi nào dùng                                                             | Ngoại lệ                                                  |
| ---------------------------------- | --------------------------------------------- | --------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| `ContextMenu` (`context-menu.tsx`) | Menu ngữ cảnh mở bằng chuột phải (long press) | § Component Authority | Cung cấp action nâng cao trên hàng dữ liệu (grid/table) không làm rối UI | Không dùng thay `DropdownMenu` (click trái) hoặc `Select` |

### Page/surface adapters — `apps/web/app/components/surface.tsx`

Layer adapter app-level duy nhất cho pattern lặp lại.

| Export                    | Vai trò                                                                              | Rule khóa (DS)                                                        | Khi nào dùng                                            | Ngoại lệ                                         |
| ------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------ |
| `AppPage`                 | Content container: width/scroll/density, padding nesting-aware                       | § Rhythm A (page padding từ AppPage) + § Structural E                 | Wrapper ngoài cùng của trang nội dung                   | Không bọc các màn fullscreen (KDS/Runner/Login)  |
| `AppShellPaddingBoundary` | Đánh dấu `AppShell main` sở hữu padding để `AppPage` lồng bên trong bỏ padding riêng | § Structural E (padding áp dụng đúng 1 lần)                           | Dùng ở cấp Shell để AppPage con không bị X2 padding     |                                                  |
| `AppPageHeader`           | Page H1 lockup: eyebrow/title/badge/description/actions/breadcrumb/tabs/meta         | § Rhythm B (Page H1 PHẢI từ AppPageHeader)                            | Mọi header của AppPage                                  |                                                  |
| `AppSection`              | Card-backed section frame                                                            | § Card Roles + § Component Authority                                  | Bọc 1 khối nội dung (vd: form block, chi tiết)          |                                                  |
| `AppToolbar`              | Filter/action toolbar (search/filters/bulk/actions/reset)                            | § Layout Patterns (một toolbar/workflow)                              | Dải công cụ (tìm kiếm/lọc) phía trên danh sách          |                                                  |
| `AppEmptyState`           | Empty/no-results/no-access/error panel                                               | § Empty/Confirm lock                                                  | Thay thế nội dung chính khi không có dữ liệu / bị lỗi   | Trong bảng (Table) thì dùng `TableEmptyStateRow` |
| `AppLinkCard`             | Navigation/action card                                                               | § Card Roles + § Component Authority                                  | Card chứa link chuyển trang hoặc thao tác               |                                                  |
| `LinkCardGrid`            | Grid responsive (1/2/3 cột) bọc `AppLinkCard`                                        | § Component Authority                                                 | Danh sách các LinkCard                                  |                                                  |
| `KpiRow`                  | Grid responsive (1/2/3 cột) bọc `KpiCard`                                            | § Component Authority + § Metric Card Role                            | Thể hiện một dãy các chỉ số KPI                         |                                                  |
| `DescriptionList`         | `<dl>` term/description cho trang chi tiết                                           | § Component Authority                                                 | Hiển thị các cặp nhãn-giá trị (vd: thông tin KH)        |                                                  |
| `DocumentFormFrame`       | Khung trang document/line-form (header + body cuộn + footer), compose AppPage        | § Component Authority — page-section adapter, không phải chrome shell | Các trang tạo chứng từ có nhiều line (GRN, transfer, Kiểm kê) |                                                  |
| `AppDetailFooter`         | Hàng footer leading/trailing ở trang chi tiết                                        | § Component Authority                                                 | Action bar dưới cùng trang chi tiết (thường sticky)     |                                                  |
| `OperationalTile`         | Tile chọn được (Button-based) với tone + selected ring                               | § Card Roles; § Rhythm D `tile` size                                  | Nút bấm to như viên gạch (chọn khu vực, chọn bàn)       |                                                  |
| `OperationalBoardCard`    | Card board POS/KDS/runner, ring tone `current`                                       | § Card Roles + § Elevation Hover rung                                 | Card hiển thị món/đơn trên KDS hoặc POS                 |                                                  |

### Data display / status / metric

| Component                                                                                         | Vai trò                                                                                                                                                                      | Rule khóa (DS)                                                                                                 | Khi nào dùng                                     | Ngoại lệ                                            |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------- |
| `data-table/data-table.tsx` → `DataTable`, `DataTableColumn`, `DataTableFooterCell/Row`           | List/table responsive DUY NHẤT: desktop Table + `mobileCardRender`, empty state + pagination chung, `desktopFooter`/`mobileFooter`, `(row,index)` cho inline-edit line sheet | § List Surface contract — twin tree `md:hidden`/`md:block` bị khóa bởi `responsive-double-render` (baseline 0) | Mọi danh sách dữ liệu có cột (Office, Inventory) |                                                     |
| `data-table/interactive-card.tsx` → `InteractiveCard`                                             | Card row có thể click (hover elevation)                                                                                                                                      | § Card Roles + § Elevation Hover rung                                                                          | Dòng trong data-table ở chế độ mobileCard        |                                                     |
| `kpi/kpi-card.tsx` → `KpiCard`                                                                    | Metric/stat card DUY NHẤT: label 2xs uppercase, value `text-2xl font-bold tabular-nums`, CompareChip delta, sparkline, drill-down href                                       | § Metric Card Role — `STATUS_*`/StatCard/SummaryCard cục bộ bị `stat-card-ssot` ratchet                        | Thể hiện 1 con số KPI quan trọng                 | Không dùng bọc list hay nội dung không phải số liệu |
| `status-badge.tsx` → `StatusBadge`, `getStatusBadgeMeta`, `getStatusDotClassName`, `StatusDomain` | Nguồn duy nhất label+variant badge business-state, khóa theo DB CHECK vocabulary qua `packages/shared/src/labels/vi.ts`                                                      | § Status vocabulary — `STATUS_*` map cục bộ mới bị cấm (`status-label-ssot`)                                   | Hiển thị trạng thái (Đã xác nhận, Hoàn thành...) |                                                     |
| `table-empty-state-row.tsx` → `TableEmptyStateRow`                                                | Empty state BÊN TRONG Table                                                                                                                                                  | § Empty/Confirm lock                                                                                           | Khi DataTable không có dòng nào                  |                                                     |
| `audit-history-list.tsx` → `AuditHistoryList`                                                     | Lịch sử audit entity (tab "Lịch sử") lọc theo `audit_logs` entity                                                                                                            | § Inventory surface contract (audit inline ở trang chi tiết)                                                   | Hiển thị log thay đổi của 1 đối tượng            |                                                     |

### Route transition frames

| Component                                           | Vai trò                                                               | Rule khóa (DS)                                                                                           |
| --------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `page-skeleton.tsx` → `PageSkeleton`, `PageSpinner` | Khung `loading.tsx`; board realtime chỉ dùng PageSpinner              | § Loading/Error/Not-found — không hand-roll skeleton mới; POS giữ `PosPageSkeleton` là ngoại lệ duy nhất |
| `error-panel.tsx` → `ErrorPanel`                    | Khung `error.tsx`: AppEmptyState mode="error" + reset() + digest mono | § Loading/Error/Not-found                                                                                |
| `not-found-panel.tsx` → `NotFoundPanel`             | Khung `not-found.tsx`                                                 | § Loading/Error/Not-found                                                                                |

### Form wrapper layer — `apps/web/app/components/form/` (barrel `form/index.ts`)

| Export (file)                                                                             | Vai trò                                                                                                     | Rule khóa (DS)                                                                                                                            |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `TextField`, `TextareaField`                                                              | Input text có label, cao `h-10`                                                                             | § Rhythm D — `h-10` CHỈ cho phép trên form/\* control                                                                                     |
| `NumberField`, `FormattedNumberInput`                                                     | Nhập số có format VN                                                                                        | § Rhythm D + § Inventory (input tiền/số lượng/thuế/ngày PHẢI qua form wrapper)                                                            |
| `MoneyVndField`, `MoneyVndInput`, `QuantityField`, `QuantityInput` (domain-number-inputs) | Input tiền/số lượng theo domain                                                                             | Như trên + § Numeric cells (`formatVND` SSoT)                                                                                             |
| `NumberPadSheet`                                                                          | Sheet nhập số bằng bàn phím chạm (`text-3xl tabular-nums`)                                                  | § Rhythm B numeric-input-echo                                                                                                             |
| `BusinessDateField`                                                                       | Date picker theo business-date VN                                                                           | § Rhythm D field-trigger qua `Button size="field"`; `date-format-ssot`                                                                    |
| `FormField`                                                                               | Anatomy có label/help/error cho control controlled không dùng RHF                                           | Bắt buộc khi ghép `Select`/`Combobox`/`Textarea` controlled trực tiếp trong data-entry form; control con giữ `id` và ARIA state tương ứng |
| `SelectField`, `ComboboxField`, `MultiSelectCombobox`                                     | Select/searchable-select field trigger có RHF + error inline                                                | § Rhythm D field-trigger qua `size="field"` — không hand-patch raw trigger lên `h-10`                                                     |
| `Combobox`                                                                                | Searchable trigger controlled độc lập; phải nằm trong `FormField` khi là data-entry                         | Không dùng `Label` đứng cạnh mà không có `id`/field contract                                                                              |
| `AppDialog`, `FormDialog`, `FileImportDialog`, `valuesToFormData` (form-dialog)           | Khung dialog app: detail/task dùng `AppDialog`, CRUD dùng `FormDialog`, import file dùng `FileImportDialog` | § High-level primitive governance — raw `dialog` import route qua AppDialog/FormDialog/Sheet                                              |

### Chrome, navigation, brand, confirmation

| Component                                                                                                                                | Vai trò                                                                                  | Rule khóa (DS)                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `app-shell.tsx` → `AppShell` (+`AppShellHeaderConfig`)                                                                                   | Management chrome DUY NHẤT: một SidebarProvider, một sidebar (tier1 + tier2), một header | § Structural A/B — shell registry đóng băng baseline                                                            |
| `office-module-shell.tsx` → `OfficeModuleShell`, `OfficeModuleId`                                                                        | Wrapper Management chung cho admin/hr/menu/orders (không giữ client state riêng)         | § Structural B shell allowlist                                                                                  |
| `app-bottom-nav.tsx` → `AppBottomNav`, `AppBottomNavItem`, `BOTTOM_NAV_ITEM_CLASS`                                                       | Bottom-nav mobile chuẩn cho mọi chrome family                                            | § Structural B — bottom-nav PHẢI là primitive export, không tự impl lại                                         |
| `app-page-tabs.tsx` → `AppPageTabs` (+re-export `TabsContent`)                                                                           | Tab strip cấp page cho slot `AppPageHeader.tabs`                                         | § Rhythm — segmented view = Tabs                                                                                |
| `brand.tsx` → `BrandMark`, `BrandLogoBox`, `BrandLockup`, `BrandSymbol`, `BrandMascot`, `BRAND_*`                                        | Đường duy nhất tới logo/symbol/mascot asset                                              | § Typography rules — không reference `/brand/*` trực tiếp từ route component                                    |
| `workspace-bottom-nav.tsx` → `WorkspaceBottomNav`                                                                                        | Chiếu bottom-nav mobile của Management từ cùng tier model                                | § Structural A/D (nav single-source, `isNavItemActive`)                                                         |
| `row-actions-menu.tsx` → `RowActionsMenu`, `RowActionItem`                                                                               | Menu overflow action trên table row                                                      | § Inventory (row actions tách biệt hành động destructive)                                                       |
| `settings-form-section.tsx` → `SettingsFormSection`                                                                                      | Wrapper AppSection cho settings form                                                     | Ví dụ delegation pattern                                                                                        |
| `packages/ui/src/components/confirm-dialog.tsx` → `confirm()`, `ConfirmDialogProvider`, `ConfirmOptions` (+ `reason-confirm-dialog.tsx`) | Xác nhận destructive yes/no đơn giản, provider mount ở root layout                       | § Empty/Confirm — cấm `window.confirm/alert` (`no-native-dialog`); AlertDialog hand-roll chỉ cho flow cần input |

Domain layer đã duyệt nhưng chưa vào registry trước bản này:
`apps/web/lib/staff-runtime/components/staff-runtime-page.tsx` export 12 `Employee*`
adapter (Page/Panel/Frame/ControlBar/ActionBar/ActionGrid/InlineState/
BadgeList/StatusStrip/DetailList/ActionSection/MissingProfileEmpty). Branch
Hub/root import `BranchOperator*` từ
`apps/web/lib/branch-operator/components/branch-operator-page.tsx` để giữ biên
giới Branch plane riêng (xem § Branch Operator Hub ở trên). Từ bản này layer
adapter là một phần của registry, không phải wrapper ẩn.

## Keyboard Shortcuts

Operational surfaces (POS, KDS) support keyboard shortcuts cho power users.
Shortcut helper duy nhất: `useKeyboardShortcut` tại
`apps/web/app/_lib/use-keyboard-shortcut.ts`.

Convention:

- Shortcut đơn phím (`T`, `D`, `/`) mặc định KHÔNG fire khi focus đang ở input/textarea/contenteditable.
- Shortcut có meta (`Cmd+Enter`, `Ctrl+K`) có thể dùng `fireInInput: true` để fire cả khi đang gõ.
- `Escape` để clear filter hoặc đóng dialog (Radix tự lo đóng dialog).
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

Contract chi tiet: `docs/spec/toast-notification-system.md`.

- Toast là feedback ngắn hạn cho action hiện tại, đi qua `toast` từ `@comtammatu/ui/components/sonner`.
- Notification là feed bền vững cho handoff, approval, escalation, SLA, hoặc việc cần role/branch khác xử lý.
- Không dùng toast thay audit/work queue. Không tạo notification cho success cục bộ của form nếu không cần người khác xử lý.
- Copy phải an toàn, tiếng Việt, và không bao giờ expose raw Supabase/Postgres `error.message`.
- Notification producer mới phải có `kind`, `severity`, `target_roles`, optional `target_branch_id`, `action_url`, và `dedup_key` khi event có thể lặp lại.

## Theme Runtime

Contract đầy đủ (token value, giới hạn `.theme-light-only`): `docs/spec/design-system.md`
§ Token Contract → Theme runtime. Mục này chỉ tóm tắt cách agent thao tác với
runtime hai chế độ, không lặp lại hoặc override token value.

- Hai chế độ `light` (mặc định, ca ngày) và `night` (ấm-tối "gạo cháy", ca
  tối/đêm); `night` map vào class `.dark`. Không có cookie thì fallback theo
  giờ địa phương — `night` cho khung 18:00–06:00, còn lại `light` — không phụ
  thuộc `prefers-color-scheme`/`matchMedia`.
- `packages/ui/src/components/theme-script.tsx` set class trước hydrate đọc
  cookie `matu-theme`; `packages/ui/src/components/theme-provider.tsx` là
  runtime state provider duy nhất, `setTheme` ghi lại cookie đó
  (SameSite=Lax, 1 năm) — theme là UI preference duy nhất được phép lưu ở
  browser storage.
- `ThemeToggle` (`apps/web/app/components/theme-toggle.tsx`) là toggle duy
  nhất, mount ở `AppHeader`, operations PWA toolbar, employee header, và header
  guest self-order (`/q/[token]`). Không thêm theme context thứ hai, toggle
  route-local, hoặc key localStorage mới.
- Runner customer display ép về light token qua `.theme-light-only`
  (`apps/web/app/(protected)/br/[branchId]/runner/layout.tsx`); đây là escape
  hatch cấp token, không tắt `dark:` variant hay chart THEMES map bên trong —
  xem giới hạn đầy đủ trong design-system.md trước khi dùng lại pattern này.

## Form Helpers

App-local form helpers sống tại `apps/web/app/components/form/`. Dùng cho mọi dialog/form mới:

- `TextField` — text Input + RHF useController
- `NumberField` — `FormattedNumberInput` (VND format) + RHF
- `MoneyVndInput` / `MoneyVndField` — VND integer amount, grouped display, raw numeric-string submit
- `QuantityInput` / `QuantityField` — inventory quantity, default 3 decimal places, grouped display
- `BusinessDateField` — RHF date picker, displays `dd/mm/yyyy`, stores `yyyy-mm-dd`, optional branch timezone note
- `SelectField` — Select voi `options={[{value, label}]}`
- `ComboboxField` — searchable Select + RHF, label/help/error/required state chung; description/error được liên kết tới trigger
- `FormField` — label/help/error chung cho `Select`, `Combobox`, hoặc `Textarea` controlled ngoài RHF; đây là anatomy/layout wrapper, control con vẫn phải nhận `id`, `disabled`, và ARIA state phù hợp
- `Combobox` — control searchable độc lập; trong data-entry phải đặt trong `FormField` với `id` ổn định
- `TextareaField` — Textarea + RHF
- `AppDialog` — generic app Dialog shell for short non-form detail/task overlays
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

Inventory IA phải bám 3 luồng chính:

1. `Kiểm soát tồn` — Tồn kho, Kiểm kê, Hao hụt/điều chỉnh, Báo cáo.
2. `Nhập/Nhận/Đối soát` — Đơn đặt hàng, Phiếu nhập/GRN, supplier invoice/price variance, receiving exception.
3. `Điều phối/Sản xuất` — Điều chuyển, Lệnh sản xuất, BOM/recipe issue, yield.

Sidebar labels phải ngắn và scan được trong sidebar cố định. Tên đầy đủ của luồng đặt trong page title, breadcrumb, tab, hoặc empty state thay vì ép vào group label dài.

### Overlay Decision

- Page: long form, nhiều dòng, keyboard-heavy workflow như GRN 20 line, transfer detail edit, stocktake session.
- Sheet: focused data entry/action ngắn; bottom sheet trên mobile và side sheet trên desktop khi implementation cần responsive surface.
- `AppDialog`: short non-form detail/task overlay.
- Dialog primitive: approved exceptional contextual task only.
- AlertDialog: destructive/irreversible confirm nhu void order, deactivate, inactive lifecycle transition.

### Audit And Permission Decision

- Detail page có audit như `Tabs [Overview | Lines | Lịch sử]`; `Lịch sử` filter `audit_logs` bằng `entity_type` + `entity_id`, hiển thị actor, action, timestamp, old/new diff khi có.
- Tenant-wide `/admin/audit` là compliance search surface, không bắt buộc cho Inventory Lite MVP.
- Nếu user thiếu quyền permanent thì hide action. Nếu bị block tạm thời do business state, show disabled + explain inline/tooltip, ví dụ chưa mở ca hoặc kỳ đã khóa.

## Composition Rules

Cho phép:

- wrapper nhỏ để tập hợp dữ liệu, nav, và structure
- wrapper domain delegate về `apps/web/app/components/surface.tsx`
- dùng `className` để sắp xếp layout cơ bản
- compose trực tiếp từ Má Tư DS primitives

Không cho phép:

- helper class kiểu `app-*`
- custom theme layer
- parallel compatibility layer
- wrapper override visual contract của primitive
- module tự tạo lại page/header/section/toolbar/empty/link-card thay vì delegate về `apps/web/app/components/surface.tsx`
- dùng `div` / `span` / `p` thường để giả lập `Card`, `Badge`, `Button`, `Table`, `Tabs`, `Input`, `Select`
- per-surface `theme.css`
- shell chrome tự chế để thay cho shared primitive/surface structure

Quy tắc review:

- nếu UI trông giống `card` thì phải dùng `Card` qua đúng role/adapter; không
  ép card không phải số liệu vào `KpiCard`
- nếu UI trông giống `badge/chip` thì phải dùng `Badge`
- nếu UI trông giống `button` thì phải dùng `Button`
- nếu UI trông giống bảng dữ liệu thì phải dùng `Table`
- nếu UI là empty/error state thì phải dùng wrapper đã được phê duyệt như `AppEmptyState` / `TableEmptyStateRow`; route code không dùng raw `Empty*` trực tiếp
- nếu UI là loading spinner thì phải dùng `Spinner`, không tự style `Loader2 + animate-spin`
- nếu UI là form field thì phải dùng helpers từ `@/components/form` (`TextField`, `NumberField`, `SelectField`, `TextareaField`)
- nếu UI là form dialog CRUD thì phải dùng `FormDialog` wrapper
- nếu không có primitive phù hợp, dùng wrapper route-scoped; chỉ update spec khi
  đổi contract hoặc shared adapter

## UI Rebuild Gate

`docs/spec/page-archetypes.md` § 0.1 UI Advisor Gate là contract duy nhất cho
quyết định trước khi sửa surface. Không duy trì một checklist thứ hai tại đây.
Gate phải nối được screen context → actor/job/workflow → information order →
archetype/exemplar → primitive/fallback → state/responsive/browser QA trước khi
implementation bắt đầu.

Nếu không có component khớp hoàn toàn, đi theo thứ tự fallback đã khóa trong
gate: composition từ primitive hiện có → route-scoped adapter → cập nhật
`docs/spec/design-system.md` trước khi thay đổi shared visual role, token, hoặc
behavior. Thiếu context không phải lý do để cài thêm skill/plugin hay tạo
parallel design contract.

Rebuild theo wave nhỏ:

1. Hoàn thành UI Advisor Gate và khóa route family.
2. Audit exemplar, shared adapter usage, và regression liên quan.
3. Chuẩn hóa shell/layout/state primitives trong phạm vi surface.
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
- nếu control trông giống `Tabs`, `Badge`, `Button`, `Card`, `Sheet`, `Select`, `Progress` thì phải dùng primitive thật, không tự style raw `div` / `button`

Review heuristic:

- POS/KDS trước hết phải giúp nhân viên làm thao tác tiếp theo nhanh hơn
- một workflow state chỉ nên có một nơi thể hiện chính
- destructive action phải tách khỏi primary action và có confirm / recovery
