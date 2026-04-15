# UI Module

## Overview

UI không còn chỉ là một thư viện primitive. Hệ hiện tại có 3 tầng:

1. `Foundation`
   Token, spacing, radius, elevation, motion, focus ring, touch target trong `apps/web/app/globals.css`
2. `Domain composition`
   Thin wrappers cho admin/inventory/blocked-state trong `packages/ui/src/components/`
3. `Shared UI package`
   Primitive và helper API trong `packages/ui/`

**Owners:** `apps/web/app/globals.css`, `packages/ui/src/components/`, `packages/ui/`

## Public APIs

### Primitive layer

Các component shadcn/ui sống ở `packages/ui/src/components/`.

### Domain composition layer

Shared thin wrappers:

- `@comtammatu/ui/components/admin-patterns`
- `@comtammatu/ui/components/inventory-patterns`
- `@comtammatu/ui/components/blocked-state-flash`

Shared composition contract:

- `PageContainer`
- `PageHeader`
- `FilterBar`
- `SectionCard`
- `EmptyState`
- `StatusBadge`
- `ActionIconButton`

## Surface model

Surface chính thức:

- `admin`
- `inventory`
- `pos`
- `kds`
- `employee`
- `auth`

Surface chỉ được khác nhau ở density, emphasis, contrast và interaction affordance. Không surface nào được tự định nghĩa token system riêng.

## Governance

- Single source of truth: `docs/spec/design-system.md` + `apps/web/app/globals.css`
- Không import `theme.css` theo domain/page
- Không thêm static inline style vào foundation, shell hoặc mobile/auth chrome
- Không tạo custom design system layer mới ngoài `packages/ui/src/components/*`
- Không thêm arbitrary Tailwind dimension value; mở rộng `@theme` thay thế khi thật sự cần

## Components

Primitive layer vẫn dựa trên shadcn/ui:

**Layout:** `accordion`, `card`, `collapsible`, `separator`, `sheet`, `sidebar`, `tabs`
**Form:** `button`, `checkbox`, `form`, `input`, `label`, `radio-group`, `select`, `switch`, `textarea`
**Data:** `badge`, `table`, `pagination`
**Overlay:** `alert-dialog`, `dialog`, `dropdown-menu`, `popover`, `tooltip`
**Navigation:** `breadcrumb`, `command`, `navigation-menu`
**Feedback:** `alert`, `sonner`, `skeleton`
**Date:** `calendar`, `date-picker`
**Utility:** `avatar`, `chart`, `scroll-area`, `toggle`, `toggle-group`

## Exports

```
@comtammatu/ui              → cn + design-system helpers
@comtammatu/ui/components/* → primitive components
@comtammatu/ui/lib/*        → low-level helpers
@comtammatu/ui/hooks/*      → shared hooks
```

## Dependencies

- `@radix-ui/*` — accessible primitives
- `cmdk` — command palette
- `date-fns` — date utilities
- `react-day-picker` — calendar
- `sonner` — toast notifications
- `tailwind-merge` — class deduplication

<!-- ORACLE-META
Written by codebase-oracle (manual) | 2026-04-02
Data: Direct source reading
Audience: new engineer | Confidence: 95%
Unknowns: 0
-->
