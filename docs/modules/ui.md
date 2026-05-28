# UI Module

## Overview

UI cua repo phai di truc tiep tren `shadcn/ui` preset hien hanh. Khong con helper layer hay theme system rieng cua du an.

Single source of truth for agent decisions:

1. `docs/spec/design-system.md`

Runtime config, primitives, adapters, and regression rules are evidence and
enforcement for that contract. They do not authorize a second design system:

- `apps/web/components.json`
- `packages/ui/components.json`
- `packages/ui/src/styles/globals.css`
- `apps/web/app/layout.tsx`
- `packages/ui/src/components/*`
- `apps/web/app/components/surface.tsx`
- `tasks/regressions.md`

Runtime files are evidence. If runtime comments, package metadata, or generated
tokens disagree with `docs/spec/design-system.md`, treat that as drift and fix
the contract/runtime before building new UI.

## Design System Contract

Doc chot duy nhat: `docs/spec/design-system.md`.

Tat ca UI/UX rebuild phai di theo contract do truoc khi sua runtime. Design system cua repo la:

- shadcn preset hien hanh (`radix-lyra`, resolved preset `buFywKm`, `neutral`, `lucide`)
- Ma Tu Concept 01 brand tokens trong `packages/ui/src/styles/globals.css`
- tier tokens `tier-elite` / `tier-note` chi dung cho trust/variance/waste tier badges
- Ma Tu Concept 01 typography: Inter body, Montserrat heading, JetBrains Mono operational data
- Runner/KDS customer board typography uses shared height-responsive theme tokens: `text-runner-header`, `text-runner-board` for all four data cells, `text-runner-empty-secondary`, and `text-runner-footer`. These tokens scale with `dvh` and clamp between compact desktop and 2K/4K displays; they must not scale from viewport width. Below `xl`, Runner cells/header/footer use compact `px-4 py-2` spacing so wrapped labels like `Mang về #041` and `2 món` do not collide with row dividers; the narrow wait-time column may use smaller horizontal padding. Status labels must use the same `RunnerOrderCell` typography as every other data cell and must not add a separate `text-*` class on the data-text element. Board columns use Tailwind's built-in 12-column grid: Đơn `col-span-4`, Số món `col-span-3`, Trạng thái `col-span-4`, Chờ `col-span-1`; wait-time header copy must be `Chờ`, not `Thời gian đợi`.
- Runner/KDS customer board empty state may use `/brand/mascot/be-suon-tuoi-runner.png` as a decorative mascot, while preserving the large primary empty-state copy, a smaller secondary line, and footer separation.
- primitive source trong `packages/ui/src/components/*`
- brand assets trong `apps/web/public/brand/`
- runtime brand primitive trong `apps/web/app/components/brand.tsx`
- app surface adapters trong `apps/web/app/components/surface.tsx`
- copy source ladder: `docs/ref/glossary.md` cho nghia/chinh ta, `packages/shared/src/labels/vi.ts` cho domain labels dung chung, `@comtammatu/shared/messages` hoac `apps/web/lib/messages/*` cho action/state/error chung, `packages/shared/src/labels/legal-fixed.ts` cho legal labels, va domain dictionary cho route adapters
- toast/notification contract trong `docs/spec/toast-notification-system.md`
- theme runtime trong `packages/ui/src/components/theme-script.tsx` +
  `packages/ui/src/components/theme-provider.tsx`; chi provider nay duoc luu
  user theme preference trong `localStorage`
- approved app utilities: `max-h-dvh-95`, `max-h-dvh-80`,
  `pos-text-overlay`, `pos-safe-top`, `pos-safe-bottom`, `chrome-safe-pb`,
  `chrome-safe-bottom`

Khong duoc coi design system la mot layer moi tach rieng khoi shadcn. Neu can pattern moi, update `docs/spec/design-system.md` truoc, roi moi rollout vao code.

### Legacy Pilot Layer Retirement

Cac artifact sau tu Inventory redesign pilot da bi retire khoi runtime app UI,
khong phai source of truth hien tai:

- removed `packages/design-tokens/tokens.json`
- removed `packages/ui/src/styles/matu-tokens.css`
- removed `apps/web/app/components/matu-surface.tsx`
- removed `apps/web/app/(protected)/admin/kitchen-sink/page.tsx`
- external design folders

Code moi KHONG duoc import `@/components/matu-surface`, KHONG dung
`font-matu-body`, va KHONG dung `bg-matu-*`, `text-matu-*`, `border-matu-*`,
`rounded-matu-*`, `--spacing-matu-*`, hoac `--radius-matu-*`. Neu cham vao
surface cu dang dung cac artifact nay, xem do la regression/migration task ve
`apps/web/app/components/surface.tsx` + semantic shadcn tokens, khong phai co
quyen khoi phuc layer pilot.

Read order cho agent khi lam UI:

1. `AGENTS.md`
2. `docs/spec/design-system.md`
3. `docs/modules/ui.md`
4. `tasks/regressions.md`
5. Domain docs lien quan den route dang sua

## Reset Contract

Reset hien tai duoc thuc hien bang `shadcn` resolved preset `buFywKm` / `radix-lyra` cho monorepo `apps/web` + `packages/ui`, sau do map token semantic sang Ma Tu Concept 01.

Dieu nay co nghia:

- foundation phai theo file do `shadcn` bootstrap sinh ra
- brand color/typography phai di qua semantic token va font variables chung
- body/content dung `font-sans` (Inter), heading/title dung `font-heading` (Montserrat), operational data/code/id/price/qty dung `font-mono` (JetBrains Mono)
- static public artifact nhu `docs/status/index.html` phai mirror cung font stack; khong dung lai Be Vietnam Pro, Geist, `font-matu-body`, hoac font rieng theo surface
- `--font-heading-runtime` chi la bien noi bo cua `next/font`; app UI chi dung `font-heading` / `--font-heading`
- page/shell chi duoc compose tu primitives co san
- logo/brand lockup trong web runtime phai di qua `BrandMark` / `BrandLockup`
- khong duoc giu `app-*` helper classes
- khong duoc giu custom background/theme chrome o root

## Primitive Layer

Primitive source van song tai `packages/ui/src/components/*`, nhung phai tiep tuc theo cau truc shadcn:

- `button`
- `card`
- `sidebar`
- `badge`
- `table`
- `dialog`
- `sheet`
- `tabs`
- `input`
- `select`
- `empty` — tat ca empty-state UI (no-data, no-results, error, inline)
- `field` + `field-group` — form field composition (label, control, error, description)
- `item` + `item-group` — list rows with media/title/description/actions
- `spinner` — loading indicator (thay cho `Loader2 + animate-spin`)

Khong fork primitive theo surface.

`CardContent` table/list exceptions phai di qua named primitive props:
`flush` cho table-edge/list-edge alignment va `scroll` cho horizontal table
scrolling. AppSection dung `contentFlush` / `contentScroll` cho cung vai tro.
Khong dung local `className="p-0"` hoac `className="overflow-x-auto"` tren
`CardContent` hay `AppSection contentClassName` o app code.

## App Surface Adapters

`apps/web/app/components/surface.tsx` la adapter layer duy nhat cho cac pattern lap lai o app level:

- `AppPage` cho content container/width/scroll rhythm.
- `AppPageHeader` cho page heading, description, badge, action.
- `AppSection` cho card-backed section.
- `AppToolbar` cho filter/action toolbar.
- `AppEmptyState` cho empty/no-result/no-access/error state.
- `AppLinkCard` cho navigation/action card.

Domain wrappers nhu Inventory/Employee/Admin co the giu API rieng de tranh sua hang loat call site, nhung phai delegate ve cac adapter nay thay vi tu style lai `Card`, `Empty`, hoac page container.

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
- custom theme layer
- retired pilot layer `matu-surface` / `matu-*`
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
