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
- `docs/worklog/*`: temporary staging only; promote stable decisions back to
  spec/modules/tasks, then remove stale worklog claims.

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
`/br/[branchId]`. Nó dùng lại contract Employee thay vì tạo style riêng:

- hub và màn chi tiết dùng `EmployeePage`, `EmployeePanel`,
  `EmployeeActionSection`, `EmployeeFrame`, `EmployeeStatusStrip`,
  `EmployeeActionBar`, và `EmployeeControlBar` trước khi nghĩ tới wrapper mới.
- mobile ẩn page header trùng bằng `hideHeaderOnMobile`; app chrome đã giữ tên
  app, chi nhánh, và bottom nav.
- hub là nhóm action rows theo việc cần mở trong ngày; không đặt
  `Điều hành chi nhánh` hoặc `Cài đặt chi nhánh` như tile trong Hub.
- màn quản lý chi nhánh (`/dashboard`, `/settings`) dùng cùng Branch runtime
  chrome nhưng thuộc route family `branch_management`, mở qua bottom nav theo
  quyền quản lý.
- màn chi tiết giữ một primary action trong panel chính, không đặt CTA vận hành
  vào page header.
- branch wrapper chỉ đổi href/scope sang `/br/[branchId]/*`; không hồi sinh
  `/employee/*` compatibility routes và không fork lại layout.
- copy hiển thị sống trong `messages.employee.*`, `APP_COPY_VI`, hoặc registry
  domain tương ứng; route/component không hardcode copy vận hành mới.

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

## Component Governance

`Card`, `Table`, `Dialog`, và `AlertDialog` là primitive composition cấp cao.
Code app mới không được mặc định import trực tiếp các primitive này từ
`@comtammatu/ui/components/*`; phải chọn adapter sở hữu workflow trước:

- layout/card section → `AppSection`, `AppLinkCard`, `KpiCard` cho metric,
  `InteractiveCard`, `OperationalBoardCard`, hoặc wrapper route-scoped
- table/list responsive → `DataTable` hoặc `TableEmptyStateRow`; document line-sheet cần adapter ghi rõ
- CRUD form dialog → `FormDialog`; form dài hoặc nhiều line dùng Page/Sheet theo Overlay Decision
- destructive confirm đơn giản → shared `confirm()`; confirm có input/reason dùng flow đã duyệt

`pnpm lint:ui-contract` khóa baseline import trực tiếp theo từng file bằng các
gate `raw-card-import-file-baseline`, `raw-table-import-file-baseline`,
`raw-dialog-import-file-baseline`, và `raw-alert-dialog-import-file-baseline`.
Baseline chỉ được giảm. Nếu một file mới cần import trực tiếp primitive cấp cao,
phải update `docs/spec/design-system.md` hoặc module doc liên quan trước, không
thêm allowlist cục bộ để né guard.

## Component Audit

Khi cần đào sâu UI/component debt theo từng route family, chạy:

```bash
pnpm audit:ui-components
pnpm audit:ui-components -- --family inventory
pnpm audit:ui-components -- --family hr --all
```

Audit này đọc code hiện tại trong `apps/web/app` và in ra:

- route-family summary: số file/page, direct import `Card`/`Table`/`Dialog`/`AlertDialog`, adapter adoption, `STATUS` map, `useIsMobile`
- shared adapter adoption: file/hit cho `AppPage`, `DataTable`, `FormDialog`, `KpiCard`, `StatusBadge`, v.v.
- highest-risk files: file nào còn nhiều primitive composition trực tiếp hoặc signal drift

Đây là công cụ định hướng review, không phải UI authority. Khi kết quả audit
mâu thuẫn với `docs/spec/design-system.md`, contract thắng; sửa runtime hoặc
guard để quay về contract.

## Shared Component Registry

Bảng tra cứu "component → vai trò → rule khóa" cho toàn bộ adapter layer đã
duyệt (D058 W5). Mọi rule cột cuối trỏ về section của
`docs/spec/design-system.md` (viết tắt DS); đây là bảng mô tả, không phải
authority — khi runtime lệch bảng, sửa runtime hoặc cập nhật DS trước.

Trước khi build/sửa trang, đọc `docs/spec/page-archetypes.md` để biết page
đang sửa thuộc archetype nào và recipe khóa những component nào; bảng này trả
lời "component X đang khóa vai trò gì, rule ở đâu". Muốn biết "component X
đang dùng ở đâu trong repo", chạy `codegraph_explore` / `codegraph_callers`
hoặc `pnpm audit:ui-components` (xem § Component Audit ở trên) — không
grep-mò và không copy một file đã thấy làm mẫu.

### Shared Primitives (`packages/ui/src/components/`)

Các primitive cốt lõi từ thư viện UI chung, cần tuân thủ luật sử dụng thay vì bạ đâu dùng đó.

| Primitive (File) | Vai trò | Rule khóa (DS) | Khi nào dùng | Ngoại lệ |
|---|---|---|---|---|
| `ContextMenu` (`context-menu.tsx`) | Menu ngữ cảnh mở bằng chuột phải (long press) | § Component Authority | Cung cấp action nâng cao trên hàng dữ liệu (grid/table) không làm rối UI | Không dùng thay `DropdownMenu` (click trái) hoặc `Select` |

### Page/surface adapters — `apps/web/app/components/surface.tsx`

Layer adapter app-level duy nhất cho pattern lặp lại.

| Export | Vai trò | Rule khóa (DS) | Khi nào dùng | Ngoại lệ |
|---|---|---|---|---|
| `AppPage` | Content container: width/scroll/density, padding nesting-aware | § Rhythm A (page padding từ AppPage) + § Structural E | Wrapper ngoài cùng của trang nội dung | Không bọc các màn fullscreen (KDS/Runner/Login) |
| `AppShellPaddingBoundary` | Đánh dấu `AppShell main` sở hữu padding để `AppPage` lồng bên trong bỏ padding riêng | § Structural E (padding áp dụng đúng 1 lần) | Dùng ở cấp Shell để AppPage con không bị X2 padding | |
| `AppPageHeader` | Page H1 lockup: eyebrow/title/badge/description/actions/breadcrumb/tabs/meta | § Rhythm B (Page H1 PHẢI từ AppPageHeader) | Mọi header của AppPage | |
| `AppSection` | Card-backed section frame | § Card Roles + § Component Authority | Bọc 1 khối nội dung (vd: form block, chi tiết) | |
| `AppToolbar` | Filter/action toolbar (search/filters/bulk/actions/reset) | § Layout Patterns (một toolbar/workflow) | Dải công cụ (tìm kiếm/lọc) phía trên danh sách | |
| `AppEmptyState` | Empty/no-results/no-access/error panel | § Empty/Confirm lock | Thay thế nội dung chính khi không có dữ liệu / bị lỗi | Trong bảng (Table) thì dùng `TableEmptyStateRow` |
| `AppLinkCard` | Navigation/action card | § Card Roles + § Component Authority | Card chứa link chuyển trang hoặc thao tác | |
| `LinkCardGrid` | Grid responsive (1/2/3 cột) bọc `AppLinkCard` | § Component Authority | Danh sách các LinkCard | |
| `KpiRow` | Grid responsive (1/2/3 cột) bọc `KpiCard` | § Component Authority + § Metric Card Role | Thể hiện một dãy các chỉ số KPI | |
| `DescriptionList` | `<dl>` term/description cho trang chi tiết | § Component Authority | Hiển thị các cặp nhãn-giá trị (vd: thông tin KH) | |
| `DocumentFormFrame` | Khung trang document/line-form (header + body cuộn + footer), compose AppPage | § Component Authority — page-section adapter, không phải chrome shell | Các trang tạo chứng từ có nhiều line (PO, GRN, Kiểm kê) | |
| `AppDetailFooter` | Hàng footer leading/trailing ở trang chi tiết | § Component Authority | Action bar dưới cùng trang chi tiết (thường sticky) | |
| `OperationalTile` | Tile chọn được (Button-based) với tone + selected ring | § Card Roles; § Rhythm D `tile` size | Nút bấm to như viên gạch (chọn khu vực, chọn bàn) | |
| `OperationalBoardCard` | Card board POS/KDS/runner, ring tone `current` | § Card Roles + § Elevation Hover rung | Card hiển thị món/đơn trên KDS hoặc POS | |

### Data display / status / metric

| Component | Vai trò | Rule khóa (DS) | Khi nào dùng | Ngoại lệ |
|---|---|---|---|---|
| `data-table/data-table.tsx` → `DataTable`, `DataTableColumn`, `DataTableFooterCell/Row` | List/table responsive DUY NHẤT: desktop Table + `mobileCardRender`, empty state + pagination chung, `desktopFooter`/`mobileFooter`, `(row,index)` cho inline-edit line sheet | § List Surface contract — twin tree `md:hidden`/`md:block` bị khóa bởi `responsive-double-render` (baseline 0) | Mọi danh sách dữ liệu có cột (Office, Inventory) | |
| `data-table/interactive-card.tsx` → `InteractiveCard` | Card row có thể click (hover elevation) | § Card Roles + § Elevation Hover rung | Dòng trong data-table ở chế độ mobileCard | |
| `kpi/kpi-card.tsx` → `KpiCard` | Metric/stat card DUY NHẤT: label 2xs uppercase, value `text-2xl font-bold tabular-nums`, CompareChip delta, sparkline, drill-down href | § Metric Card Role — `STATUS_*`/StatCard/SummaryCard cục bộ bị `stat-card-ssot` ratchet | Thể hiện 1 con số KPI quan trọng | Không dùng bọc list hay nội dung không phải số liệu |
| `status-badge.tsx` → `StatusBadge`, `getStatusBadgeMeta`, `getStatusDotClassName`, `StatusDomain` | Nguồn duy nhất label+variant badge business-state, khóa theo DB CHECK vocabulary qua `packages/shared/src/labels/vi.ts` | § Status vocabulary — `STATUS_*` map cục bộ mới bị cấm (`status-label-ssot`) | Hiển thị trạng thái (Đã xác nhận, Hoàn thành...) | |
| `table-empty-state-row.tsx` → `TableEmptyStateRow` | Empty state BÊN TRONG Table | § Empty/Confirm lock | Khi DataTable không có dòng nào | |
| `audit-history-list.tsx` → `AuditHistoryList` | Lịch sử audit entity (tab "Lịch sử") lọc theo `audit_logs` entity | § Inventory surface contract (audit inline ở trang chi tiết) | Hiển thị log thay đổi của 1 đối tượng | |

### Route transition frames

| Component | Vai trò | Rule khóa (DS) |
|---|---|---|
| `page-skeleton.tsx` → `PageSkeleton`, `PageSpinner` | Khung `loading.tsx`; board realtime chỉ dùng PageSpinner | § Loading/Error/Not-found — không hand-roll skeleton mới; POS giữ `PosPageSkeleton` là ngoại lệ duy nhất |
| `error-panel.tsx` → `ErrorPanel` | Khung `error.tsx`: AppEmptyState mode="error" + reset() + digest mono | § Loading/Error/Not-found |
| `not-found-panel.tsx` → `NotFoundPanel` | Khung `not-found.tsx` | § Loading/Error/Not-found |

### Form wrapper layer — `apps/web/app/components/form/` (barrel `form/index.ts`)

| Export (file) | Vai trò | Rule khóa (DS) |
|---|---|---|
| `TextField`, `TextareaField` | Input text có label, cao `h-10` | § Rhythm D — `h-10` CHỈ cho phép trên form/* control |
| `NumberField`, `FormattedNumberInput` | Nhập số có format VN | § Rhythm D + § Inventory (input tiền/số lượng/thuế/ngày PHẢI qua form wrapper) |
| `MoneyVndField`, `MoneyVndInput`, `QuantityField`, `QuantityInput` (domain-number-inputs) | Input tiền/số lượng theo domain | Như trên + § Numeric cells (`formatVND` SSoT) |
| `NumberPadSheet` | Sheet nhập số bằng bàn phím chạm (`text-3xl tabular-nums`) | § Rhythm B numeric-input-echo |
| `BusinessDateField` | Date picker theo business-date VN | § Rhythm D field-trigger `h-10`; `date-format-ssot` |
| `SelectField`, `Combobox`, `ComboboxField`, `MultiSelectCombobox` | Select/searchable-select field trigger | § Rhythm D field-trigger — không hand-patch raw SelectTrigger lên `h-10` |
| `FormDialog`, `FileImportDialog`, `valuesToFormData` (form-dialog) | Khung dialog CRUD (RHF+Zod) | § High-level primitive governance — raw `dialog` import route qua FormDialog/Sheet |

### Chrome, navigation, brand, confirmation

| Component | Vai trò | Rule khóa (DS) |
|---|---|---|
| `app-shell.tsx` → `AppShell` (+`BrandConfig`, `PageHeaderConfig`) | Management chrome DUY NHẤT: một SidebarProvider, một sidebar (tier1 + tier2), một header | § Structural A/B — shell registry đóng băng baseline |
| `office-module-shell.tsx` → `OfficeModuleShell`, `OfficeModuleId` | Wrapper Management chung cho admin/hr/menu/orders (không giữ client state riêng) | § Structural B shell allowlist |
| `app-bottom-nav.tsx` → `AppBottomNav`, `AppBottomNavItem`, `BOTTOM_NAV_ITEM_CLASS` | Bottom-nav mobile chuẩn cho mọi chrome family | § Structural B — bottom-nav PHẢI là primitive export, không tự impl lại |
| `app-page-tabs.tsx` → `AppPageTabs` (+re-export `TabsContent`) | Tab strip cấp page cho slot `AppPageHeader.tabs` | § Rhythm — segmented view = Tabs |
| `brand.tsx` → `BrandMark`, `BrandLogoBox`, `BrandLockup`, `BrandSymbol`, `BrandMascot`, `BRAND_*` | Đường duy nhất tới logo/symbol/mascot asset | § Typography rules — không reference `/brand/*` trực tiếp từ route component |
| `management-chrome.tsx`, `branch-switcher.tsx`, `workspace-bottom-nav.tsx` | Helper chrome Management (scope/branch context) | § Structural A/D (nav single-source, `isNavItemActive`) |
| `row-actions-menu.tsx` → `RowActionsMenu`, `RowActionItem` | Menu overflow action trên table row | § Inventory (row actions tách biệt hành động destructive) |
| `settings-form-section.tsx` → `SettingsFormSection` | Wrapper AppSection cho settings form | Ví dụ delegation pattern |
| `packages/ui/src/components/confirm-dialog.tsx` → `confirm()`, `ConfirmDialogProvider`, `ConfirmOptions` (+ `reason-confirm-dialog.tsx`) | Xác nhận destructive yes/no đơn giản, provider mount ở root layout | § Empty/Confirm — cấm `window.confirm/alert` (`no-native-dialog`); AlertDialog hand-roll chỉ cho flow cần input |

Domain layer đã duyệt nhưng chưa vào registry trước bản này:
`apps/web/lib/staff-runtime/components/staff-runtime-page.tsx` export 12 `Employee*`
adapter (Page/Panel/Frame/ControlBar/ActionBar/ActionGrid/InlineState/
BadgeList/StatusStrip/DetailList/ActionSection/MissingProfileEmpty), branch
hub cũng dùng lại layer này (xem § Branch Operator Hub ở trên). Từ bản này nó
là một phần của registry, không phải wrapper ẩn.

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

## Form Helpers

App-local form helpers sống tại `apps/web/app/components/form/`. Dùng cho mọi dialog/form mới:

- `TextField` — text Input + RHF useController
- `NumberField` — `FormattedNumberInput` (VND format) + RHF
- `MoneyVndInput` / `MoneyVndField` — VND integer amount, grouped display, raw numeric-string submit
- `QuantityInput` / `QuantityField` — inventory quantity, default 3 decimal places, grouped display
- `BusinessDateField` — RHF date picker, displays `dd/mm/yyyy`, stores `yyyy-mm-dd`, optional branch timezone note
- `SelectField` — Select voi `options={[{value, label}]}`
- `TextareaField` — Textarea + RHF
- `FormDialog` — generic Dialog + `useForm` + `zodResolver` + `useTransition`
- `valuesToFormData` — adapter để gọi server actions `withFormAction`-wrapped

Import: `import { TextField, FormDialog, ... } from "@/components/form"`.

Schema: luôn dùng Zod 4 với `{ error: "..." }` (không dùng `{ message }`).

### Form Mode Decision

- Dùng RHF + Zod khi form có line array, hơn 4 field, cần inline validation trước submit, hoặc cần pending/dirty submit UX. PO, GRN, transfer lines, stocktake, adjustment, và production forms thuộc nhóm này.
- Dùng plain `<form action>` cho login, sign out, và single-reason confirm đơn giản khi state đã reload qua redirect.
- Shared schema cần import cả client và server thì đặt tại `packages/shared/src/forms/<name>.ts`; schema chỉ dùng nội bộ route có thể đặt gần route.
- Validation field-level hiển thị inline. Business error không map được field thì hiển thị toast/action message an toàn, không expose raw Supabase/Postgres error.

### Feedback Decision

- Sonner là feedback mặc định cho success/action outcome: `Đã lưu`, `Đã xác nhận GRN`, `Không thể tạo phiếu`.
- URL flash/search params không dùng cho non-auth success/error. Redirect đến `/access-denied?reason=` chỉ dùng cho permission, auth, hoặc scope failure.
- Durable notification chỉ dùng khi có follow-up cross-role/branch, SLA, approval, hoặc exception cần tồn tại sau reload.

### Inventory Flow Decision

Inventory IA phải bám 3 luồng chính:

1. `Kiểm soát tồn` — Tồn kho, Kiểm kê, Hạn dùng, Hao hụt/điều chỉnh, Báo cáo.
2. `Nhập/Nhận/Đối soát` — Đơn đặt hàng, Phiếu nhập/GRN, supplier invoice/price variance, receiving exception.
3. `Điều phối/Sản xuất` — Điều chuyển, Lệnh sản xuất, BOM/recipe issue, yield.

Sidebar labels phải ngắn và scan được trong sidebar cố định. Tên đầy đủ của luồng đặt trong page title, breadcrumb, tab, hoặc empty state thay vì ép vào group label dài.

### Overlay Decision

- Page: long form, nhiều dòng, keyboard-heavy workflow như GRN 20 line, transfer detail edit, stocktake session.
- Sheet: focused data entry/action ngắn; bottom sheet trên mobile và side sheet trên desktop khi implementation cần responsive surface.
- Dialog: short contextual task không destructive.
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

Trước khi rebuild một surface, agent phải ghi rõ trong plan:

- surface và route family đang sửa
- primary user job của surface đó
- UI thay doi thuoc nhom visual refactor, UX flow, copy, hay behavior
- primitives sẽ dùng (`Table`, `Tabs`, `Sheet`, `Dialog`, `Item`, `InputGroup`, ...)
- regression rules co nguy co cham vao

Rebuild theo wave nhỏ:

1. Lock design system và rule.
2. Audit route family.
3. Chuan hoa shell/layout/state primitives.
4. Sửa flow chính.
5. Verify mobile first viewport + desktop density.
6. Update docs/regressions nếu phát sinh rule mới.

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
