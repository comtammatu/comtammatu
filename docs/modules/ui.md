# UI Module

## Overview

UI cua repo phai di truc tiep tren `shadcn/ui` preset hien hanh va baseline `matu-superapp` da promote app-wide. Khong con helper layer hay theme system rieng cua du an; generated `matu-*` tokens la token source/QA utility, con route code mac dinh dung semantic classes va `apps/web/app/components/surface.tsx`.

Source of truth:

1. `apps/web/components.json`
2. `packages/ui/components.json`
3. `packages/ui/src/styles/globals.css`
4. `apps/web/app/layout.tsx`
5. `docs/spec/design-system.md`
6. `tasks/regressions.md`

## Design System Contract

Doc chot: `docs/spec/design-system.md`.

Tat ca UI/UX rebuild phai di theo contract do truoc khi sua runtime. Design system cua repo la:

- shadcn preset hien hanh (`radix-lyra`, preset `b6G3vbGue`, `neutral`, `lucide`)
- Ma Tu Concept 01 brand tokens trong `packages/ui/src/styles/globals.css`
- matu-superapp tokens generated tu `packages/design-tokens/tokens.json` vao `packages/ui/src/styles/matu-tokens.css`
- matu-superapp typography: Be Vietnam Pro body/heading, JetBrains Mono operational data
- primitive source trong `packages/ui/src/components/*`
- brand assets trong `apps/web/public/brand/`
- runtime brand primitive trong `apps/web/app/components/brand.tsx`
- app surface adapters trong `apps/web/app/components/surface.tsx`
- compatibility/token QA adapters trong `apps/web/app/components/matu-surface.tsx`
- glossary/copy source trong `docs/ref/glossary.md` va shared label dictionaries
- toast/notification contract trong `docs/spec/toast-notification-system.md`

Mot design system hop le phai dam bao tat ca role co cung mot nen tang bat dau: radius, border, shadow, margin, padding, gap, font-size, font-weight, icon size, control height, density, viewport behavior, va status vocabulary. Gia tri di theo chuoi `token -> rhythm role -> primitive/adapter -> route composition`; route khong duoc tu gan gia tri rieng chi vi mot man hinh "can khac".

Khong duoc coi design system la mot layer moi tach rieng khoi shadcn. Neu can pattern moi, update `docs/spec/design-system.md` truoc, roi moi rollout vao code.

Read order cho agent khi lam UI:

1. `AGENTS.md`
2. `docs/spec/design-system.md`
3. `docs/modules/ui.md`
4. `tasks/regressions.md`
5. Domain docs lien quan den route dang sua

## Reset Contract

Reset hien tai duoc thuc hien bang `shadcn` preset `b6G3vbGue` / `radix-lyra` cho monorepo `apps/web` + `packages/ui`, sau do map token semantic sang Ma Tu Concept 01.

Dieu nay co nghia:

- foundation phai theo file do `shadcn` bootstrap sinh ra
- brand color/typography phai di qua semantic token va font variables chung
- body/content mac dinh dung `font-sans` (Be Vietnam Pro), heading/title dung `font-heading` (Be Vietnam Pro), operational data/code/id/price/qty dung `font-mono` (JetBrains Mono)
- `font-matu-body` va `matu-*` token utilities ton tai de QA/implement token-level work; route code uu tien semantic tokens (`bg-background`, `text-foreground`, `border-border`) truoc
- static public artifact nhu `docs/status/index.html` phai mirror font stack runtime ma artifact do hien thi; khong dung Geist hoac font rieng theo surface ngoai contract
- page/shell chi duoc compose tu primitives co san
- logo/brand lockup trong web runtime phai di qua `BrandMark` / `BrandLockup`
- khong duoc giu `app-*` helper classes
- khong duoc giu custom background/theme chrome o root

## Primitive Layer

Primitive source van song tai `packages/ui/src/components/*`, nhung phai tiep tuc theo cau truc shadcn:

- `button`
- `button-group` — related action groups and mixed button/input rows; size comes from child buttons and `ButtonGroupText size`
- `card`
- `sidebar`
- `badge` — semantic status/count chips; color from `variant`, geometry from `size`
- `table` — dense tabular data; row rhythm from `density`, header typography from `TableHead variant`
- `dialog` / `alert-dialog` — modal focus and interrupt decisions; `DialogContent` size/padding/scroll/placement props own geometry
- `sheet` / `drawer` — side, bottom, and mobile workflow panels; content size/height/surface props own geometry
- `tabs` — segmented route-local views; list chrome from `variant`, trigger height from `size`
- `toggle` / `toggle-group` — two-state and segmented state controls; size/spacing/flush shape come from primitive props
- `input`
- `input-group` — search/affix/action shell only; render control first in DOM, addons after, and choose height through `size`
- `select` — finite-choice picker; `SelectTrigger` height comes from `size`, never route-local `h-*`
- `native-select` — browser-native finite-choice picker for mobile/frontline and compact system controls; height comes from `size`, width from `width`
- `combobox` wrappers — searchable/autocomplete or multi-select pickers built from `Button` + `Popover` + `Command`; trigger height comes from `Button size`
- `popover` — short anchored contextual content; width and padding come from `PopoverContent` props, not route-local geometry classes
- `command` — searchable action/list primitive; list height comes from `CommandList maxHeight`, selected state from `CommandItem checked`
- `dropdown-menu` / `context-menu` / `menubar` — action-menu primitives; content width/density comes from props, destructive state from `variant="destructive"`, and toggle/exclusive state from checkbox/radio items
- `navigation-menu` — horizontal destination navigation only; root `size` and content `width` own trigger/link and panel geometry
- `pagination` — URL pagination links and client-state pagination buttons; table pagination composes these primitives instead of raw Button rows
- `progress` — bounded task/quota/distribution meter; height comes from `size`, semantic color from `tone`
- `radio-group` — visible one-of-many choice primitive; spacing and hit target come from `density`
- `checkbox` / `switch` / `slider` — binary/range inputs; touch targets and track/thumb geometry come from `size`
- `resizable` — desktop/tablet productivity panels; handle target comes from `ResizableHandle size`
- `scroll-area` — bounded vertical panel/list scroll; scrollbar mode and size come from props, while caller supplies layout bounds
- `empty` — tat ca empty-state UI (no-data, no-results, error, inline)
- `field` + `field-group` — form field composition (label, control, error, description); wrappers connect `aria-describedby` and never override primitive control height
- `item` + `item-group` — list rows with media/title/description/actions
- `spinner` — loading indicator (thay cho `Loader2 + animate-spin`)

Khong fork primitive theo surface.

## App Surface Adapters

`apps/web/app/components/surface.tsx` la adapter layer chinh cho cac pattern lap lai o app level:

- `AppPage` cho content container/width/scroll rhythm.
- `AppPageHeader` cho page heading, description, badge, action.
- `AppSection` cho card-backed section.
- `AppToolbar` cho filter/action toolbar.
- `AppEmptyState` cho empty/no-result/no-access/error state.
- `AppLinkCard` cho navigation/action card.

Domain wrappers nhu Inventory/Employee/Admin co the giu API rieng de tranh sua hang loat call site, nhung phai delegate ve cac adapter nay thay vi tu style lai `Card`, `Empty`, hoac page container.

`apps/web/app/components/matu-surface.tsx` la compatibility/showcase adapter cho token QA. No khong phai primitive layer moi va khong duoc copy thanh surface layer thu ba; route moi va route migrated dung `apps/web/app/components/surface.tsx`.

## Keyboard Shortcuts

Operational surfaces (POS, KDS) support keyboard shortcuts cho power users. Shortcut helper duy nhat: `useKeyboardShortcut` tai `apps/web/app/_lib/use-keyboard-shortcut.ts`.

Convention:

- Shortcut don phim (`T`, `D`, `/`) mac dinh KHONG fire khi focus dang o input/textarea/contenteditable.
- Shortcut co meta (`Cmd+Enter`, `Ctrl+K`) co the dung `fireInInput: true` de fire ca khi dang go.
- `Escape` de clear filter hoac dong dialog (Radix tu lo dong dialog).
- Hien thi hint voi `<Kbd>` (hoac `<KbdGroup>` khi nhieu phim) canh label button, `className="hidden md:inline-flex"` de an tren mobile.
- Them `aria-keyshortcuts="T"` tren button/toggle de screen reader doc duoc.

Shortcuts da wire:

- POS cart (`cart-pane.tsx`):
  - `Cmd/Ctrl + Enter` — mo dialog xac nhan gui bep (works khi dang go note)
  - `T` — chuyen sang Mang ve
  - `D` — chuyen sang Tai ban
- POS append draft (`append-draft-pane.tsx`):
  - Khong co shortcut rieng; append vao don cu phai qua nut `Gui mon them`, khong gui ngay khi cham mon.
- KDS (`kds-board.tsx`):
  - `Escape` — clear het filter (station + status + orderType) neu co filter nao dang bat

Khi them shortcut moi, update bang nay + cau hinh `aria-keyshortcuts` tuong ung.

## Toast And Notifications

Contract chi tiet: `docs/spec/toast-notification-system.md`.

- Toast la feedback ngan han cho action hien tai, di qua `toast` tu `@comtammatu/ui/components/sonner`.
- Notification la feed ben vung cho handoff, approval, escalation, SLA, hoac viec can role/branch khac xu ly.
- Khong dung toast thay audit/work queue. Khong tao notification cho success cuc bo cua form neu khong can nguoi khac xu ly.
- Copy phai an toan, tieng Viet, va khong bao gio expose raw Supabase/Postgres `error.message`.
- Notification producer moi phai co `kind`, `severity`, `target_roles`, optional `target_branch_id`, `action_url`, va `dedup_key` khi event co the lap lai.

## Form Helpers

App-local form helpers song tai `apps/web/app/components/form/`. Dung cho moi dialog/form moi:

- `TextField` — text Input + RHF useController
- `NumberField` — `FormattedNumberInput` (VND format) + RHF
- `MoneyVndInput` / `MoneyVndField` — VND integer amount, grouped display, raw numeric-string submit
- `QuantityInput` / `QuantityField` — inventory quantity, default 3 decimal places, grouped display
- `TaxRateBpsInput` / `TaxRateBpsField` — tax basis points integer, raw numeric-string submit
- `BusinessDateField` — RHF date picker, displays `dd/mm/yyyy`, stores `yyyy-mm-dd`, optional branch timezone note
- `SelectField` — Select voi `options={[{value, label}]}`
- `TextareaField` — Textarea + RHF
- `FormDialog` — generic Dialog + `useForm` + `zodResolver` + `useTransition`
- `valuesToFormData` — adapter de goi server actions `withFormAction`-wrapped

Import: `import { TextField, FormDialog, ... } from "@/components/form"`.

Schema: luon dung Zod 4 voi `{ error: "..." }` (khong dung `{ message }`).

### Form Mode Decision

- Dung RHF + Zod khi form co line array, hon 4 field, can inline validation truoc submit, hoac can pending/dirty submit UX. PO, GRN, transfer lines, stocktake, adjustment, va production forms thuoc nhom nay.
- Dung plain `<form action>` cho login, sign out, va single-reason confirm don gian khi state da reload qua redirect.
- Shared schema can import ca client va server thi dat tai `packages/shared/src/forms/<name>.ts`; schema chi dung noi bo route co the dat gan route.
- Validation field-level hien inline. Business error khong map duoc field thi hien toast/action message an toan, khong expose raw Supabase/Postgres error.

### Feedback Decision

- Sonner la feedback mac dinh cho success/action outcome: `Da luu`, `Da xac nhan GRN`, `Khong the tao phieu`.
- URL flash/search params khong dung cho non-auth success/error. Redirect den `/access-denied?reason=` chi dung cho permission, auth, hoac scope failure.
- Durable notification chi dung khi co follow-up cross-role/branch, SLA, approval, hoac exception can ton tai sau reload.

### Inventory Flow Decision

Inventory IA phai bam 3 luong chinh:

1. `Kiem soat ton` — Ton kho, Kiem ke, Han dung, Hao hut/dieu chinh, Bao cao.
2. `Nhap/Nhan/Doi soat` — Don dat hang, Phieu nhap/GRN, supplier invoice/price variance, receiving exception.
3. `Dieu phoi/San xuat` — Dieu chuyen, Lenh san xuat, BOM/recipe issue, yield.

Sidebar labels phai ngan va scan duoc trong rail co dinh. Ten day du cua luong dat trong page title, breadcrumb, tab, hoac empty state thay vi ep vao group label dai.

### Overlay Decision

- Page: long form, nhieu dong, keyboard-heavy workflow nhu GRN 20 line, transfer detail edit, stocktake session.
- Sheet: focused data entry/action ngan; bottom sheet tren mobile va side sheet tren desktop khi implementation can responsive surface.
- Dialog: short contextual task khong destructive.
- AlertDialog: destructive/irreversible confirm nhu void order, deactivate, inactive lifecycle transition.

### Audit And Permission Decision

- Detail page co audit nhu `Tabs [Overview | Lines | Lich su]`; `Lich su` filter `audit_logs` bang `entity_type` + `entity_id`, hien actor, action, timestamp, old/new diff khi co.
- Tenant-wide `/admin/audit` la compliance search surface, khong bat buoc cho Inventory Lite MVP.
- Neu user thieu quyen permanent thi hide action. Neu bi block tam thoi do business state, show disabled + explain inline/tooltip, vi du chua mo ca hoac ky da khoa.

## Composition Rules

Cho phep:

- wrapper nho de tap hop du lieu, nav, va structure
- wrapper domain delegate ve `apps/web/app/components/surface.tsx`
- dung `className` de sap xep layout co ban
- compose truc tiep tu shadcn primitives

Khong cho phep:

- helper class kieu `app-*`
- custom theme layer ngoai design-token source da document
- wrapper override visual contract cua primitive
- module tu tao lai page/header/section/toolbar/empty/link-card thay vi delegate ve `apps/web/app/components/surface.tsx`
- dung `div` / `span` / `p` thuong de gia lap `Card`, `Badge`, `Button`, `Table`, `Tabs`, `Input`, `Select`
- per-surface `theme.css`
- shell chrome tu che de thay cho stock shadcn structure

Quy tac review:

- neu UI trong giong `card` thi phai dung `Card`
- neu UI trong giong `badge/chip` thi phai dung `Badge`
- neu UI trong giong `button` thi phai dung `Button`
- neu UI trong giong bang du lieu thi phai dung `Table`
- neu UI la empty/error state thi phai dung `Empty` (hoac wrapper `EmptyStatePanel`/`TableEmptyStateRow`)
- neu UI la loading spinner thi phai dung `Spinner` (khong tu style `Loader2 + animate-spin`)
- neu UI la form field thi phai dung helpers tu `@/components/form` (`TextField`, `NumberField`, `SelectField`, `TextareaField`)
- neu UI la form dialog CRUD thi phai dung `FormDialog` wrapper
- neu khong co primitive phu hop, dung lai va thong nhat truoc khi them pattern moi

## UI Rebuild Gate

Truoc khi rebuild mot surface, agent phai ghi ro trong plan:

- surface va route family dang sua
- primary user job cua surface do
- UI thay doi thuoc nhom visual refactor, UX flow, copy, hay behavior
- primitives se dung (`Table`, `Tabs`, `Sheet`, `Dialog`, `Item`, `InputGroup`, ...)
- regression rules co nguy co cham vao

Rebuild theo wave nho:

1. Lock design system va rule.
2. Audit route family.
3. Chuan hoa shell/layout/state primitives.
4. Sua flow chinh.
5. Verify mobile first viewport + desktop density.
6. Update docs/regressions neu phat sinh rule moi.

Khong gom nhieu route family lon vao mot PR neu khong can thiet.

## Operational Surfaces

POS va KDS la surface van hanh, khong phai dashboard.

Dieu nay co nghia:

- first viewport tren mobile phai uu tien action chinh hoac hang doi song
- sau khi khoa context (ca, ban, tram, don), shell phai co gon de nhuong cho tac vu chinh
- analytics, hero copy, progress block chi la secondary content; khong duoc day queue/cart xuong duoi fold
- desktop co the them mat do thong tin, nhung khong duoc tao IA khac mobile
- neu control trong giong `Tabs`, `Badge`, `Button`, `Card`, `Sheet`, `Select`, `Progress` thi phai dung primitive that, khong tu style raw `div` / `button`

Review heuristic:

- POS/KDS truoc het phai giup nhan vien lam thao tac tiep theo nhanh hon
- mot workflow state chi nen co mot noi the hien chinh
- destructive action phai tach khoi primary action va co confirm / recovery
