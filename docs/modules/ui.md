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

## Branch Hub

Branch Hub là surface mobile-first cho nhân viên và quản lý chi nhánh ở
`/br/[branchId]`. Nó dùng Branch operator adapter, không wrapper Admin Dashboard và
không gọi trực tiếp vocabulary Employee ở các route Branch:

- Branch và Admin Dashboard là hai mặt phẳng presentation khác nhau. Branch giữ
  mobile/tablet touch-first tại `/br/[branchId]/*`; Admin Dashboard là mặt phẳng
  quản trị chỉ Owner được vào tại `/admin`, `/inventory`, `/finance`, `/hr`,
  `/menu`, `/orders`, và `/branches`.
- data loader, Server Action, RPC và permission check có thể dùng chung giữa
  hai plane; presentation không được dùng chung nếu component Admin Dashboard tạo cảm
  giác desktop thu nhỏ trong Branch. Khi cần tách, Branch route dùng native
  `BranchOperator*` component và giữ route Admin Dashboard cho oversight/dense table.
- POS, KDS, Runner là station apps riêng dưới `/br/[branchId]/*`; không bọc vào
  Branch Hub bottom-nav và không dùng shell Admin Dashboard.

- hub và màn chi tiết dùng `BranchOperatorPage`, `BranchOperatorPanel`,
  `BranchOperatorActionSection`, và các Branch operator adapter tương ứng
  trước khi nghĩ tới wrapper mới.
- mobile ẩn page header trùng bằng `hideHeaderOnMobile`; app chrome đã giữ tên
  app, chi nhánh, và bottom nav.
- hub là nhóm action rows theo việc cần mở trong ngày; không đặt
  `Điều hành chi nhánh` hoặc `Cài đặt chi nhánh` như tile trong Hub.
- `/br/[branchId]/settings/*` dùng cùng Branch runtime chrome theo quyền quản lý;
  `/br/[branchId]/dashboard` chỉ là alias tương thích redirect về Branch Hub,
  không phải màn điều hành thứ hai.
- operator/operations/employee-lib không import hoặc render chrome Admin
  Dashboard; guard `operator-admin-dashboard-shell-boundary` bắt mọi đường tắt
  qua `AppShell`, `AdminDashboardModuleShell`, `FinanceShell`, hoặc
  `InventoryShell`.
- màn chi tiết giữ một primary action trong panel chính, không đặt CTA vận hành
  vào page header.
- staff-runtime wrapper chỉ đổi href/scope sang `/br/[branchId]/*`; workflow
  quản lý Branch phải sở hữu presenter touch-native và chỉ chia sẻ
  loader/model/action với Admin Dashboard. Không hồi sinh `/employee/*` compatibility
  routes.
- copy hiển thị sống trong `messages.employee.*`, `APP_COPY_VI`, hoặc registry
  domain tương ứng; route/component không hardcode copy vận hành mới.
- `/br/[branchId]/shift/leave-approvals` là Branch-native touch `LIST`: tab
  trạng thái + full-row items để quét nhanh, chi tiết và approve/reject nằm
  trong bottom `Sheet` có action sticky. Admin Dashboard giữ
  `LeaveRequestsTable`; Branch không import bảng hoặc page presenter HR của
  Admin Dashboard.

Branch stock workflow áp dụng cùng ranh giới này:

- `/br/[branchId]/stock` là hub việc kho trong ca, không wrapper Admin Dashboard
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
  hàng chuyển nội bộ. Không đưa WAC, giá trị tồn, audit/correction,
  `AppPageHeader`, `DataTable`, hoặc detail presenter Admin Dashboard vào route này.
- `/br/[branchId]/stock/grn` là Branch-native touch `LIST`: dùng shared
  `loadGrnListPageData` + pure filter model, hiển thị nháp của người đang thao
  tác trước hàng đợi GRN, và giữ bỏ nháp là action có xác nhận. Danh sách Branch
  chỉ giữ mã phiếu, NCC, ngày và trạng thái; không hiển thị tổng
  tiền/tên chi nhánh, không dùng `DataTable` hoặc long-press, và không đổi sang
  presentation Admin Dashboard tại tablet landscape.
- `/br/[branchId]/stock/grn/new` là Branch-native touch `LIST` cho bước chọn
  nguồn: dùng shared `loadGrnSourcePageData` + pure source model, có tìm NCC,
  tạo NCC khi được cấp quyền, và không còn cửa PO. Supplier entry canonical tại
  `/br/[branchId]/stock/grn/new/[supplierId]`; màn
  source không render `DocumentFormFrame`, `DataTable`, hoặc picker Admin Dashboard.
- `/br/[branchId]/stock/grn/new/[supplierId]` là Branch-native touch
  `DOC-WORKFLOW`: dùng shared `loadGrnCreatePageData`,
  `useGrnCreateController`, và `GrnLineEditSheet`, nhưng route tự sở hữu bố cục
  `BranchOperatorPage`/`BranchOperatorPanel`, list dòng chạm để sửa, và
  `AppDetailFooter` sticky. Context NCC/kho nhận đứng trước danh sách dòng và
  tìm nguyên liệu; branch bị khóa bởi URL, tablet landscape chỉ mở grid panel
  chứ không đổi thành bảng hay desktop side editor. Route không import Admin Dashboard
  page/client, `DocumentFormFrame`, `DataTable`, `AppPageHeader`, hoặc
  `AppSection` trực tiếp.
- `/br/[branchId]/stock/grn/[id]` là Branch-native touch `DETAIL`: nháp dùng
  shared detail loader/model/action hooks nhưng tự sở hữu danh sách kiểm nhận
  chạm, bottom sheet sửa/thêm dòng, và `AppDetailFooter` sticky để lưu/chốt;
  phiếu không còn nháp là biên nhận chỉ đọc. Route không import Admin Dashboard
  `GRNDetailClient`, `embedded`, audit history, post-confirm correction, stock
  correction, hoặc liên kết hóa đơn NCC. Các tác vụ quản trị đó vẫn thuộc Admin Dashboard
  `/inventory/grn/[id]`.
- `/br/[branchId]/stock/stocktake` là Branch-native touch `LIST`: session
  stocktake của quản lý khác với `/stock/count` là count slip được giao cho
  nhân viên. Route dùng shared `loadBranchStocktakeListData`/model, full-row
  `ItemGroup` ở phone/tablet, và không dùng `DataTable`, long-press drawer,
  toolbar Admin Dashboard, branch picker, audit, hay report CTA.
- `/br/[branchId]/stock/stocktake/new` là Branch-native `DOC-WORKFLOW`: URL
  khóa branch, chỉ chọn mode và location, sau đó mở phiên qua action hiện có và
  chuyển vào count. Route dùng `BranchOperatorPage`/`BranchOperatorPanel` và
  `AppDetailFooter` sticky; không import `DocumentFormFrame` hoặc start presenter Admin Dashboard
  presenter.
- `/br/[branchId]/stock/stocktake/[id]/count` là Branch-native touch
  `DOC-WORKFLOW`: number pad là entry point, cho phép chọn đơn vị ghi nhận ngay
  trên nguyên liệu active, giữ autosave draft/zone lock/round submit hiện có,
  và không đổi tablet thành `DataTable`. Payload blind không mang số tồn hệ
  thống; dữ liệu system/count/variance chỉ xuất hiện sau khi hoàn tất.
- `/br/[branchId]/stock/stocktake/[id]` là Branch-native touch `DETAIL`: active
  review chỉ nhận blind counts, count/recount status, continue, cancel, và
  complete theo permission; completed result dùng `ItemGroup` system/count/
  variance. Không đưa audit history, detail client Admin Dashboard, report CTA, WAC, hay
  giá trị tồn vào route này.
- `/br/[branchId]/stock/issues` là Branch-native touch `LIST` chỉ cho `writeoff`
  và `other`: branch bị khóa bởi URL, danh sách chỉ giữ mã phiếu, loại, ngày và
  trạng thái; tạo nháp mở trong bottom `Sheet`, không có branch picker,
  `DataTable`, export, audit hoặc tổng giá trị Admin Dashboard.
- `/br/[branchId]/stock/issues/[id]` là Branch-native touch `DETAIL`: nháp cho
  thêm/sửa/xóa từng dòng bằng bottom `Sheet` với đơn vị nhập, số lượng không vượt
  tồn và lý do bắt buộc; xác nhận/hủy dùng `AppDetailFooter` sticky và authority
  Server Action/RPC hiện có. Phiếu đã xác nhận/hủy chỉ đọc. Không đưa WAC, tổng
  giá trị, audit history, `DocumentStockCorrectionDialog`, detail client Admin Dashboard,
  hay branch/source picker vào Branch.
- `/br/[branchId]/stock/consumption` là Branch-native touch `LIST`: segmented
  view tách ledger tiêu hao đã ghi khỏi chứng từ thủ công, row giữ nguồn,
  trạng thái và thời điểm. `/stock/consumption/[id]` là typed `DETAIL` chỉ nhận
  record tiêu hao; cả hai route dùng Branch presenter và không import Admin Dashboard
  `DataTable`/page content.
- `/br/[branchId]/stock/count-assignments` và `/stock/count-slips` là hai
  Branch-native touch `LIST`: assignment nhóm theo nhân viên; review slip mở
  chênh lệch và approve/request-recount trong bottom `Sheet` với footer sticky.
  Không có CTA mở nhầm phiếu đếm cá nhân của quản lý, không nhận
  `routeBranchId`/`embedded` từ client Admin Dashboard.
- Admin Dashboard `/inventory/count-assignments` và `/inventory/count-slips` là hai
  management `LIST` responsive độc lập: desktop dùng `DataTable`, thao tác hiển
  thị bằng nút và mở `AppDialog`; mobile fallback chỉ là card responsive của
  cùng table adapter. Admin Dashboard không dùng swipe, long-press, `Drawer`, `Sheet` hay
  presenter Branch.
- `/br/[branchId]/stock/waste` là Branch-native touch `DOC-WORKFLOW`: URL khóa
  chi nhánh, màn chính giữ location/cap và `ItemGroup` của các dòng đã chọn;
  điện thoại sửa một dòng trong bottom `Sheet`, tablet chỉ mở rộng thành hai
  panel cùng IA. Tier, ảnh bằng chứng, rolling meter, số lượng không vượt tồn
  và Server Action/RPC hiện có phải giữ nguyên. Không import
  `WasteNewPageContent`, `WasteCreateClient`, `DocumentFormFrame`, `DataTable`,
  hoặc chrome Admin Dashboard.
- `/br/[branchId]/stock/waste-approvals` là Branch-native touch `LIST`: queue
  khóa theo URL branch, mỗi row chạm mở bottom `Sheet` chứa line, reason, tier,
  evidence và review note. Duyệt/từ chối chỉ gọi `approveWaste`, giữ nguyên
  four-eye rule và xác nhận mutation; phiếu tự tạo chỉ đọc. Không import
  `WasteApprovalsPageContent`, `WasteApprovalsClient`, `DocumentFormFrame`,
  `DataTable`, hoặc chrome Admin Dashboard.
- Purchase orders và supplier returns đã rút khỏi UI hằng ngày ở cả Branch và
  Admin Dashboard theo D073. GRN supplier-first; hàng NCC bị từ chối đi qua Báo hao hụt.
  DB/RPC/history và integrity gate của chứng từ cũ vẫn được giữ, nhưng không có
  nav, route mutation hay presenter để tạo mới.
- `/br/[branchId]/stock/reports` là Branch-native touch `REPORT`: cố định đúng
  chi nhánh URL và tháng hiện tại, ưu tiên chênh lệch tiêu hao warning/critical
  rồi biến động của từng nguyên liệu có drill-in vào tồn thực. Mỗi số lượng luôn
  đi cùng đơn vị của nguyên liệu; không cộng chéo kg/lít/cái. Không dùng
  `ReportsPageContent`, `ReportsClient`, `DataTable`, biểu đồ, KPI tổng, công
  nợ NCC, giá vốn, export, audit hay branch/date picker. Admin Dashboard
  `/inventory/reports` giữ dashboard quản trị riêng, không còn `embedded` mode.
- Admin Dashboard `/inventory/stock` dùng cùng loader/model nhưng giữ management
  `StockClient`: compact cards khi viewport hẹp và dense `DataTable` trên
  desktop. Client Admin Dashboard không có `embedded` mode hoặc Branch route branching.
- Admin Dashboard `/inventory/operations?tab=grn` dùng cùng GRN loader/model nhưng giữ
  `GrnListClient` management presentation: branch, tổng giá trị và desktop
  `DataTable` vẫn thuộc Admin Dashboard; client này không nhận diện `/br/` để đổi layout.
- Admin Dashboard `/inventory/grn/new/[supplierId]` giữ `DocumentFormFrame` và desktop
  line editor trong `GrnCreateClient`; Admin Dashboard và Branch chỉ chia sẻ loader,
  typed controller, line-editor primitive, và server action, không chia sẻ
  presentation mode hoặc route branching.
- detail điều chuyển trong Branch chỉ giữ thao tác giao/nhận và số lượng từng
  dòng; audit history và correction sau khi chốt thuộc Admin Dashboard.
- tạo điều chuyển tại `/br/[branchId]/stock/transfer/new` là Branch-native
  `DOC-WORKFLOW`: phone mở dần nơi đi/nơi nhận → mặt hàng → ghi chú, tablet tăng thành hai
  cột, control tối thiểu 44px và CTA nằm trong `AppDetailFooter` sticky. Route
  Admin Dashboard `/inventory/transfers/new` giữ `DocumentFormFrame`; hai plane chỉ dùng
  chung loader, model, controller và `createStockTransfer`.
- EMBED-WRAPPER chỉ là transition cho deep workflow chưa tách presentation; khi
  route đã có native Branch presentation thì cập nhật `scripts/page-archetypes.mjs`
  khỏi `EMBED-WRAPPER` để guard không cho lùi lại.
- Branch route không link/redirect/revalidate vào Admin Dashboard roots cho cùng
  job của branch role; Admin Dashboard chỉ là ngữ cảnh Owner tách biệt, không là
  tile vận hành mặc định.

## Admin Dashboard Shell Structure

Admin Dashboard chrome (`apps/web/app/components/app-shell.tsx`) render một sidebar
trong một `SidebarProvider`:

- Tab chính = mô-đun cross-module, single-sourced bởi
  `resolveAdminDashboardPrimaryTabs`.
- Sub-tab = deep nav của mô-đun đang mở (`tier2`), render lồng dưới tab chính
  đang active.

`AppShell` nhận `tier1` + `tier2` thay cho `navGroups[]`. `tier1` không được
trải phẳng mọi page con thành tab chính: Admin gom về một tab "Quản trị", branch
management gom về một tab "Quản lý chi nhánh", còn deep nav nằm trong sub-tab
của tab đang active. Trên mobile và tablet portrait `<lg`, bottom-nav ưu tiên
`tier2` và chỉ có một tab "Mô-đun" mở drawer sidebar đầy đủ. Từ `lg` trở lên,
bottom-nav ẩn và Admin Dashboard dùng một sidebar cố định.

Shell/nav registry drift bị chặn bởi `shell-registry-bespoke-main` và
`nav-shell-inline-literal`: route mới không tự dựng `<main>`, sidebar,
bottom-nav, hoặc inline `ShellNavGroup[]`; dùng `AppShell`,
`AdminDashboardModuleShell`, `AppBottomNav` / `AdminDashboardBottomNav`, và nav
resolver đã có.

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

Contract duy nhất: `docs/spec/toast-notification-system.md`. Tài liệu này chỉ
chọn component UI; không định nghĩa lại producer, dedup, routing hoặc severity.

## Theme Runtime

Contract đầy đủ và runtime owner sống ở `docs/spec/design-system.md` § Token
Contract. Không thêm theme context, toggle hoặc browser-storage key thứ hai.

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

Inventory IA bám ba luồng hiện hành:

1. `Nhập hàng` — NCC trực tiếp → GRN → stock movement; hóa đơn NCC handoff sang
   Finance/AP.
2. `Kiểm soát tồn` — một Kho CN mỗi branch, kiểm kê, hao hụt/điều chỉnh và báo
   cáo.
3. `Sản xuất/tiêu hao` — workflow/RPC đang có tại branch, sale-consumption và
   write-off có nguồn rõ.

Không tái đưa PO, supplier return, lot/expiry, production order hoặc same-branch
Kho↔Bếp transfer vào daily IA.

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
