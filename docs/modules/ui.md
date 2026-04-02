# UI Module

## Overview

Shared component library built on shadcn/ui (Radix primitives + Tailwind CSS 4.2). Provides 30+ pre-built components used across all surfaces (Admin, POS, KDS, Employee).

**Owner:** `packages/ui/`

## Components

All components live in `packages/ui/src/components/`. They are standard shadcn/ui components with minimal customization.

**Layout:** `accordion`, `card`, `collapsible`, `separator`, `sheet`, `sidebar`, `tabs`
**Form:** `button`, `checkbox`, `form`, `input`, `label`, `radio-group`, `select`, `switch`, `textarea`
**Data:** `badge`, `table`, `pagination`
**Overlay:** `alert-dialog`, `dialog`, `dropdown-menu`, `popover`, `tooltip`
**Navigation:** `breadcrumb`, `command`, `navigation-menu`
**Feedback:** `alert`, `sonner` (toast), `skeleton`
**Date:** `calendar`, `date-picker`
**Utility:** `avatar`, `chart`, `scroll-area`, `toggle`, `toggle-group`

## Exports

```
@comtammatu/ui              → src/index.ts (cn utility)
@comtammatu/ui/components/* → individual components
@comtammatu/ui/lib          → src/lib/utils.ts
@comtammatu/ui/hooks        → src/hooks/use-mobile.tsx
```

## Styling

- **Base color:** Stone (warm gray)
- **CSS variables:** Enabled for theming
- **Utility:** `cn()` — `clsx` + `tailwind-merge` for conditional class merging
- **Icons:** Lucide React (tree-shakeable)
- **Font:** Be Vietnam Pro (loaded in root layout)

## Adding a Component

```bash
# From packages/ui directory
npx shadcn@latest add <component-name>
```

Components auto-install to `src/components/` with correct aliases from `components.json`.

## Dependencies

- `@radix-ui/*` — Accessible primitives
- `class-variance-authority` — Variant props
- `cmdk` — Command palette
- `date-fns` — Date utilities
- `react-day-picker` — Calendar
- `sonner` — Toast notifications
- `tailwind-merge` — Class deduplication

Peer deps: `react >= 19`, `react-dom >= 19`

<!-- ORACLE-META
Written by codebase-oracle (manual) | 2026-04-02
Data: Direct source reading
Audience: new engineer | Confidence: 95%
Unknowns: 0
-->
