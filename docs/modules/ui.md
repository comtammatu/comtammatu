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

Không được coi external UI scaffold CLI/preset là authority cao hơn Custom Theme
contract. Không được coi Custom Theme là một layer/fork mới tách riêng khỏi
`@comtammatu/ui` primitives. Nếu cần pattern mới, update
`docs/spec/design-system.md` trước, rồi mới rollout vào code.

Code mới phải dùng `apps/web/app/components/surface.tsx`, `BrandMark` /
`BrandLockup` / `BrandSymbol` / `BrandMascot`, semantic token classes, và font
utilities hiện hành cho app UI. Nếu cần visual layer mới, update
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
- `KpiRow` cho grid responsive (1/2/3 cột) bọc các `KpiCard`.
- `DescriptionList` cho cặp term/description (`<dl>`) ở trang chi tiết.
- `LinkCardGrid` cho grid responsive (1/2/3 cột) bọc các `AppLinkCard`.

Domain wrappers như Inventory/Employee/Admin có thể giữ API riêng để tránh sửa hàng loạt call site, nhưng phải delegate về các adapter này thay vì tự style lại `Card`, `Empty`, hoặc page container.

## Branch Operator Hub

Branch Hub là surface mobile-first cho nhân viên và quản lý chi nhánh ở
`/br/[branchId]`. Nó dùng lại contract Employee thay vì tạo style riêng:

- hub và màn chi tiết dùng `EmployeePage`, `EmployeePanel`,
  `EmployeeActionSection`, `EmployeeFrame`, `EmployeeStatusStrip`,
  `EmployeeActionBar`, và `EmployeeControlBar` trước khi nghĩ tới wrapper mới.
- mobile ẩn page header trùng bằng `hideHeaderOnMobile`; app chrome đã giữ tên
  app, chi nhánh, và bottom nav.
- hub là nhóm action rows theo việc cần mở; màn chi tiết giữ một primary action
  trong panel chính, không đặt CTA vận hành vào page header.
- branch wrapper chỉ đổi href/scope sang `/br/[branchId]/*`; không redirect vòng
  qua `/employee/*` và không fork lại layout.
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

- layout/card section → `AppSection`, `KpiCard`, `InteractiveCard`, hoặc adapter vận hành đã duyệt
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

- nếu UI trông giống `card` thì phải dùng `Card`
- nếu UI trông giống `badge/chip` thì phải dùng `Badge`
- nếu UI trông giống `button` thì phải dùng `Button`
- nếu UI trông giống bảng dữ liệu thì phải dùng `Table`
- nếu UI là empty/error state thì phải dùng wrapper đã được phê duyệt như `AppEmptyState` / `TableEmptyStateRow`; route code không dùng raw `Empty*` trực tiếp
- nếu UI là loading spinner thì phải dùng `Spinner`, không tự style `Loader2 + animate-spin`
- nếu UI là form field thì phải dùng helpers từ `@/components/form` (`TextField`, `NumberField`, `SelectField`, `TextareaField`)
- nếu UI là form dialog CRUD thì phải dùng `FormDialog` wrapper
- nếu không có primitive phù hợp, dừng lại và thống nhất trước khi thêm pattern mới

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
