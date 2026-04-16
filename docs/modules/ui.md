# UI Module

## Overview

UI cua repo hien tai gom 3 tang ro rang, va phai bam sat shadcn preset dang co:

1. `Foundation`
   Song trong `apps/web/app/globals.css`
2. `Primitives`
   Song trong `packages/ui/src/components/*`
3. `App composition`
   Song trong `apps/web/app/components/patterns.tsx` va cac shell cua app web

Khong co app-local `components/v2` contract trong repo hien tai. Docs khong duoc noi nguoc voi state do.

## Owners

- `apps/web/app/globals.css` - token/runtime foundation
- `packages/ui/components.json` - shadcn preset config cho package UI
- `apps/web/components.json` - shadcn preset config cho web app
- `packages/ui/src/components/*` - primitive layer
- `apps/web/app/components/patterns.tsx` - composition wrappers dang ton tai

## Public APIs

### Root export

```
@comtammatu/ui -> cn
```

`@comtammatu/ui` hien tai chi export `cn`. Khong co design-system helpers public o barrel nay.

### Primitive layer

Primitive shadcn/ui song o `packages/ui/src/components/*`.

Nhung component duoc dung nhieu nhat trong governance UI:

- `button`
- `table`
- `sidebar`
- `card`
- `badge`
- `dialog`
- `sheet`
- `tabs`
- `input`
- `select`

### App composition layer

Composition hien tai song trong app web, khong song trong `packages/ui`.

Contract dang ton tai o `apps/web/app/components/patterns.tsx`:

- `PageContainer`
- `PageHeader`
- `SectionCard`
- `FilterBar`
- `EmptyState`
- `EmptyStatePanel`
- `StatusBadge`
- `ActionIconButton`

Composition layer nay chi duoc phep sap xep va gom usage nhat quan cua primitive hien co. No khong duoc dinh nghia token, preset, hay primitive behavior moi.

## Preset Contract

Preset hien tai cua du an:

- `style: radix-mira`
- `baseColor: taupe`
- `cssVariables: true`

Moi rule UI moi phai phuc tung preset nay. Bat ky wrapper, docs, hoac helper nao vuot qua preset deu la sai governance.

## Surface Model

Surface chinh thuc hien tai:

- `admin`
- `inventory`
- `hr`
- `pos`
- `kds`
- `employee`
- `auth`

Surface co the khac nhau o content, workflow, va muc do composition. Surface khong duoc tu tao primitive grammar, token system, hoac theme system rieng.

## Governance

- Single source of truth: `components.json` + `globals.css` + `layout.tsx`
- `docs/spec/design-system.md` la governance doc, nhung phai theo runtime
- Khong import `theme.css` theo domain/page
- Khong them static inline style vao foundation, shell, hoac auth/mobile chrome
- Khong them arbitrary Tailwind dimension value
- Khong tao custom design system layer moi vuot tren preset
- Khong mo rong `patterns.tsx` thanh mot preset song song

## Usage Guidance

Nen uu tien:

- dung primitive goc khi nhu cau da duoc primitive dap ung
- dung `patterns.tsx` khi can page/header/section/filter/empty/status/action co hinh dang lap lai

Khong nen:

- tao wrapper moi chi de doi `p-*`, `m-*`, `gap-*`, `size-*`
- fork `button`, `table`, `sidebar`, `card`, `badge` theo tung surface
- viet docs nhu the repo dang dung mot style/theme/preset khac

## Dependencies

- `@radix-ui/*` - accessible primitives
- `class-variance-authority` - variant composition
- `tailwind-merge` - class deduplication
- `clsx` - conditional classes
- `sonner` - toast notifications
- `cmdk` - command palette
- `date-fns` - date utilities
- `react-day-picker` - calendar
