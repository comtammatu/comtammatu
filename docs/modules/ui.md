# UI Module

## Overview

UI hien tai cua repo tiep tuc dua tren shadcn preset chung, nhung surface chrome da duoc rebuild lai de bo hẳn khung layout cu.

He thong gom 3 tang:

1. `Foundation`
   - `apps/web/app/globals.css`
2. `Primitives`
   - `packages/ui/src/components/*`
3. `App composition`
   - `apps/web/app/components/*`
   - route shells trong `apps/web/app/**/layout.tsx` va `*_shell.tsx`

## Owners

- `apps/web/app/layout.tsx`
  - font loading va root runtime wiring
- `apps/web/app/globals.css`
  - token, global background, safe-area helpers, shell helper classes
- `packages/ui/components.json`
  - UI package preset config
- `apps/web/components.json`
  - web preset config
- `packages/ui/src/components/*`
  - primitive layer
- `apps/web/app/components/patterns.tsx`
  - shared page composition wrappers
- `apps/web/app/components/workspace-shell.tsx`
  - shared workspace chrome cho admin/hr/inventory

## Runtime Contracts

### Typography

- `font-sans` = `Be_Vietnam_Pro`
- `font-heading` = `Lora`
- `font-code` = `IBM_Plex_Mono`

### Theme direction

- warm taupe background
- clay/orange `primary`
- muted green `accent`
- dark espresso sidebar
- global gradient + grid texture duoc set o root body

### Shared helper classes

Foundation export cac helper classes sau:

- `safe-top`
- `safe-bottom`
- `app-canvas`
- `app-shell`
- `app-panel`
- `app-subpanel`
- `app-kicker`
- `app-stat`
- `app-dock`

Chung duoc dung de xep bo cuc va shell presentation, khong thay the primitive.

## Public APIs

### Primitive layer

Primitive duoc governance chat:

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

### App composition layer

Wrapper contract dang ton tai:

- `PageContainer`
- `PageHeader`
- `SectionCard`
- `FilterBar`
- `EmptyState`
- `EmptyStatePanel`
- `StatusBadge`
- `ActionIconButton`
- `RouteStateCard`
- `WorkspaceShell`

Wrapper layer nay chi duoc composition lai primitive + token runtime. Khong duoc tu tao theme system rieng.

## Surface Coverage

Shell / chrome hien tai da duoc dua ve mot visual language chung cho:

- `auth`
- `employee`
- `admin`
- `hr`
- `inventory`
- `pos`
- `kds`

Moi surface co workflow rieng, nhung van phai bam cung:

- root token contract
- preset `radix-mira`
- shared helper classes
- primitive behavior cua `packages/ui`

## Governance

- Single source of truth: `components.json` + `globals.css` + `layout.tsx`
- Khong import theme file theo domain
- Khong them inline static styles vao shell/auth/mobile chrome
- Khong tao `components/v2` hoac primitive fork
- Khong viet docs marketing khac voi runtime thuc te
- Khi doi shell helper classes hoac font/token mapping, cap nhat docs cung luc
