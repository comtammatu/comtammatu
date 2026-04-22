# UI Module

## Overview

UI cua repo phai di truc tiep tren `shadcn/ui` preset hien hanh. Khong con helper layer hay theme system rieng cua du an.

Source of truth:

1. `apps/web/components.json`
2. `packages/ui/components.json`
3. `apps/web/app/globals.css`
4. `apps/web/app/layout.tsx`
5. `docs/spec/design-system.md`
6. `tasks/regressions.md`

## Design System Contract

Doc chot: `docs/spec/design-system.md`.

Tat ca UI/UX rebuild phai di theo contract do truoc khi sua runtime. Design system cua repo la:

- shadcn preset hien hanh (`radix-mira`, preset `b1GfmQMCm`)
- token runtime trong `apps/web/app/globals.css`
- primitive source trong `packages/ui/src/components/*`
- glossary/copy source trong `docs/ref/glossary.md` va shared label dictionaries

Khong duoc coi design system la mot layer moi tach rieng khoi shadcn. Neu can pattern moi, update `docs/spec/design-system.md` truoc, roi moi rollout vao code.

Read order cho agent khi lam UI:

1. `AGENTS.md`
2. `docs/spec/design-system.md`
3. `docs/modules/ui.md`
4. `tasks/regressions.md`
5. Domain docs lien quan den route dang sua

## Reset Contract

Reset hien tai duoc thuc hien bang `shadcn` preset `b1GfmQMCm` / `radix-mira` cho `apps/web`.

Dieu nay co nghia:

- foundation phai theo file do `shadcn` bootstrap sinh ra
- page/shell chi duoc compose tu primitives co san
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

## Keyboard Shortcuts

Operational surfaces (POS, KDS) support keyboard shortcuts cho power users. Shortcut helper duy nhat: `useKeyboardShortcut` tai `apps/web/app/_lib/use-keyboard-shortcut.ts`.

Convention:
- Shortcut don phim (`T`, `D`, `/`) mac dinh KHONG fire khi focus dang o input/textarea/contenteditable.
- Shortcut co meta (`Cmd+Enter`, `Ctrl+K`) co the dung `fireInInput: true` de fire ca khi dang go.
- `Escape` de clear filter hoac dong dialog (Radix tu lo dong dialog).
- Hien thi hint voi `<Kbd>` (hoac `<KbdGroup>` khi nhieu phim) canh label button, `className="hidden md:inline-flex"` de an tren mobile.
- Them `aria-keyshortcuts="T"` tren button/toggle de screen reader doc duoc.

Shortcuts da wire:

- POS cart (`cart-sidebar.tsx`):
  - `Cmd/Ctrl + Enter` — mo dialog xac nhan gui bep (works khi dang go note)
  - `T` — chuyen sang Mang ve
  - `D` — chuyen sang Tai ban
- KDS (`kds-board.tsx`):
  - `Escape` — clear het filter (station + status + orderType) neu co filter nao dang bat

Khi them shortcut moi, update bang nay + cau hinh `aria-keyshortcuts` tuong ung.

## Form Helpers

App-local form helpers song tai `apps/web/app/components/form/`. Dung cho moi dialog/form moi:

- `TextField` — text Input + RHF useController
- `NumberField` — `FormattedNumberInput` (VND format) + RHF
- `SelectField` — Select voi `options={[{value, label}]}`
- `TextareaField` — Textarea + RHF
- `FormDialog` — generic Dialog + `useForm` + `zodResolver` + `useTransition`
- `valuesToFormData` — adapter de goi server actions `withFormAction`-wrapped

Import: `import { TextField, FormDialog, ... } from "@/components/form"`.

Schema: luon dung Zod 4 voi `{ error: "..." }` (khong dung `{ message }`).

## Composition Rules

Cho phep:

- wrapper nho de tap hop du lieu, nav, va structure
- dung `className` de sap xep layout co ban
- compose truc tiep tu shadcn primitives

Khong cho phep:

- helper class kieu `app-*`
- custom theme layer
- wrapper override visual contract cua primitive
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
