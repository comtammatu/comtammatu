# Design System - Cơm Tấm Má Tư Web App

> Version: 10.0.0 | Updated: 2026-04-16
> Stack: Next.js 16.2 · React 19.2 · Tailwind CSS 4.2 · shadcn/ui · TypeScript 6.0

## Source of Truth

UI runtime cua repo phai duoc doc theo thu tu uu tien:

1. `packages/ui/components.json`
2. `apps/web/components.json`
3. `apps/web/app/globals.css`
4. `apps/web/app/layout.tsx`
5. Tai lieu nay

Tai lieu nay chi mo ta runtime dang ton tai. Neu code doi, docs phai doi cung luc.

## Active shadcn Preset

Preset hien tai cua du an:

- `style`: `radix-mira`
- `baseColor`: `taupe`
- `cssVariables`: `true`
- `menuColor`: `default`
- `menuAccent`: `subtle`
- primitive source: `packages/ui/src/components/*`

Primitive contract van tiep tuc di qua `button`, `card`, `sidebar`, `badge`, `table`, `dialog`, `sheet`, `tabs`, `input`, `select`.

## Runtime Typography

Runtime moi khong con map `font-sans` ve `Inter`.

- `apps/web/app/layout.tsx` load:
  - `Be_Vietnam_Pro` -> `--font-body`
  - `Lora` -> `--font-display`
  - `IBM_Plex_Mono` -> `--font-code`
- `apps/web/app/globals.css` map:
  - `--font-sans: var(--font-body)`
  - `--font-heading: var(--font-display)`

He qua:

- `font-sans` = `Be_Vietnam_Pro`
- `font-heading` = `Lora`
- `font-mono` / code contexts = `IBM_Plex_Mono`

## Runtime Theme Direction

Theme hien tai la warm editorial hospitality:

- nen tong the la tong giay ngam / taupe nhat
- `primary` nghieng sang cam dat nung
- `accent` nghieng sang xanh la muted
- `sidebar` la tong nau toi / espresso
- body dung gradient + grid texture o `globals.css`, khong dua vao page-level inline styles

Token exact values song trong `apps/web/app/globals.css`. Docs nay khong sao chep lai toan bo bang token; file CSS la canonical contract cho `background`, `foreground`, `card`, `primary`, `secondary`, `accent`, `success`, `warning`, `info`, `sidebar`, chart tokens, va radius scale.

## Shared Surface Helpers

Runtime moi bo sung cac helper classes tai `apps/web/app/globals.css`:

- `safe-top`
- `safe-bottom`
- `app-canvas`
- `app-shell`
- `app-panel`
- `app-subpanel`
- `app-kicker`
- `app-stat`
- `app-dock`

Day la shared composition helpers, khong phai primitive layer moi. Chung chi duoc dung de xep surface chrome, shell framing, va presentation nhat quan cho app web.

## Shell Architecture

App web hien tai co 3 tang:

### 1. Foundation

Song trong `apps/web/app/globals.css`.

Chiu trach nhiem cho:

- CSS variables
- typography token mapping
- global background layers
- safe-area helpers
- shared surface helper classes

### 2. Primitives

Song trong `packages/ui/src/components/*`.

Nguon chuan cho:

- `Button`
- `Card`
- `Sidebar`
- `Badge`
- `Table`
- `Dialog`
- `Sheet`
- `Tabs`
- `Input`
- `Select`

Khong duoc fork primitive theo tung surface.

### 3. App Composition

Song trong app web:

- `apps/web/app/components/patterns.tsx`
- `apps/web/app/components/route-state-card.tsx`
- `apps/web/app/components/workspace-shell.tsx`
- cac shell route-level nhu admin, hr, inventory, employee, pos, kds

Composition layer duoc phep doi bo cuc va visual rhythm, nhung van phai dung primitive va token hien co.

## Surface Model

Surface chinh thuc hien tai:

- `auth`
- `employee`
- `admin`
- `hr`
- `inventory`
- `pos`
- `kds`

Khac biet giua cac surface phai di qua:

- route shell composition
- shared helper classes
- primitive variants san co

Khong duoc mo them theme.css theo domain/page.

## Governance Rules

1. `globals.css` + `layout.tsx` + `components.json` van la source of truth.
2. Khong tao primitive layer song song voi `packages/ui/src/components/*`.
3. Khong import `theme.css` theo surface.
4. Khong them static inline style vao foundation, shell, auth, mobile chrome.
5. Khong dung arbitrary Tailwind dimensions cho size/text/width/height.
6. Neu doi runtime foundation hoac shell contracts, phai cap nhat docs nay va `docs/modules/ui.md` trong cung thay doi.
