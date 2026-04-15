# Design System — Cơm Tấm Má Tư

> Version: 6.0.0 | Updated: 2026-04-15
> Stack: Next.js 16.2 · React 19.2 · Tailwind CSS 4.2 · shadcn/ui · TypeScript 6.0

## Source of Truth

Design system co dung mot nguon su that van hanh:

1. `apps/web/app/globals.css`
   Day la nguon compile/runtime cho token va utility classes.
2. Tai lieu nay
   Day la nguon quyet dinh san pham, governance va contract.

Hai noi nay phai khop 1:1.

## Design Direction

Huong chinh thuc la `Minimalist B/W + Orange Accent` (shadcn/ui based).

- Background: pure white (#ffffff)
- Foreground: near-black (#09090b, zinc-950)
- Brand accent: orange (#d35400) — mau duy nhat ngoai trang/den
- Neutral scale: zinc (zinc-50 → zinc-950)
- Semantic status: success / warning / info / destructive
- Typography: Be Vietnam Pro cho trai nghiem tieng Viet-first
- Muc tieu: doc nhanh, van hanh dai gio, tuong thich du lieu day va touch-first
- No gradients, no frosted glass, no backdrop-blur decorations
- Solid colors, clean borders, minimal shadows

## Architecture

Design system gom 3 tang:

### 1. Foundation (tokens + utilities)

Dinh nghia o `apps/web/app/globals.css`:

- Color tokens (zinc palette + orange accent)
- Typography scale (Be Vietnam Pro, Geist Mono)
- Spacing scale
- Radius
- Elevation (neutral shadows)
- Animations
- Focus ring
- Touch target utilities
- Safe-area utilities
- Vietnamese text utilities

### 2. Recipe Components

Shared recipe layer cho page-level composition:

- `PageContainer` — spacing container
- `PageHeader` — eyebrow, title, description, actions
- `FilterBar` — filter UI panel
- `SectionCard` — bordered card
- `EmptyState` — icon, title, description, action
- `StatusBadge` — semantic tone badges

Location: `apps/web/app/components/foundation/ui-patterns.tsx`

Recipe API su dung Tailwind utility classes truc tiep. Khong con surface/density helpers.

### 3. Primitives (shadcn/ui)

32+ shadcn/ui components based on Radix UI:
- Location: `packages/ui/src/components/`
- Export: `@comtammatu/ui/components/*`
- Only `cn` is exported from `@comtammatu/ui` barrel

## Token Contract

### Core colors

| Token | Value | Description |
|---|---|---|
| `background` | `#ffffff` | Pure white |
| `foreground` | `#09090b` | zinc-950 |
| `primary` | `#d35400` | Orange accent |
| `primary-foreground` | `#ffffff` | White on orange |
| `secondary` | `#f4f4f5` | zinc-100 |
| `secondary-foreground` | `#18181b` | zinc-900 |
| `accent` | `#f4f4f5` | zinc-100 |
| `accent-foreground` | `#18181b` | zinc-900 |
| `muted` | `#f4f4f5` | zinc-100 |
| `muted-foreground` | `#71717a` | zinc-500 |
| `card` | `#ffffff` | White |
| `card-foreground` | `#09090b` | zinc-950 |
| `border` | `#e4e4e7` | zinc-200 |
| `input` | `#e4e4e7` | zinc-200 |
| `ring` | `#d35400` | Orange focus ring |
| `destructive` | `#dc2626` | Red |
| `success` | `#16a34a` | Green |
| `warning` | `#d97706` | Amber |
| `info` | `#2563eb` | Blue |

### Sidebar tokens

| Token | Value |
|---|---|
| `sidebar` | `#fafafa` (zinc-50) |
| `sidebar-foreground` | `#09090b` |
| `sidebar-primary` | `#d35400` |
| `sidebar-primary-foreground` | `#ffffff` |
| `sidebar-accent` | `#f4f4f5` |
| `sidebar-accent-foreground` | `#18181b` |
| `sidebar-border` | `#e4e4e7` |
| `sidebar-ring` | `#d35400` |

### Surface semantics

| Token | Value |
|---|---|
| `surface-raised` | `#ffffff` |
| `surface-sunken` | `#f4f4f5` |
| `state-pending` | `#d97706` |
| `state-processing` | `#ea580c` |
| `state-ready` | `#16a34a` |
| `state-cancelled` | `#71717a` |

### Typography

- `font-sans`: Be Vietnam Pro
- `font-mono`: Geist Mono
- `text-data`: 13px (tables, lists)
- `text-label`: 10px (badges, chips)
- `text-caption`: 11px (captions)

### Layout

- Spacing: `space-1` (0.25rem) → `space-12` (3rem)
- Radius: `radius-sm` → `radius-xl`
- Elevation: neutral shadows, 3 levels
- Z-index: `z-overlay-1` → `z-overlay-5`

## Styling Patterns

### Standard panel
```tsx
className="rounded-lg border bg-card shadow-sm"
```

### Standard header
```tsx
className="sticky top-0 z-30 border-b bg-background"
```

### Standard sidebar
```tsx
className="border-r bg-sidebar"
```

### Stat card
```tsx
className="rounded-lg border bg-card p-5 shadow-sm"
```

### Status badge tones
```txt
success: "bg-green-50 text-green-700 border-green-200 text-xs font-medium"
warning: "bg-amber-50 text-amber-700 border-amber-200 text-xs font-medium"
danger:  "bg-red-50 text-red-700 border-red-200 text-xs font-medium"
info:    "bg-blue-50 text-blue-700 border-blue-200 text-xs font-medium"
neutral: "bg-muted text-muted-foreground border-border text-xs font-medium"
```

### KDS dark surface
```txt
Shell:  "min-h-screen bg-zinc-950 text-white"
Panel:  "rounded-lg border border-zinc-800 bg-zinc-900 text-white shadow-sm"
Header: "sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950 text-white"
```

### Hover lift
```tsx
className="transition-all hover:-translate-y-0.5 hover:shadow-md"
```

## Accessibility

- Moi control tuong tac phai co visible focus state
- Keyboard navigation bat buoc hoat dong
- Touch-first surfaces phai dat minimum touch target (44x44, uu tien 56x56)
- Reduced motion phai duoc ton trong
- Status colors phai giu contrast hop le

## Governance

1. Khong import `theme.css` o domain/page de override system.
2. Khong them static inline style vao foundation, shell hoac auth/mobile chrome.
3. Khi can token moi, them vao `globals.css` truoc roi moi dung o component.
4. Khong dung custom CSS classes — chi dung Tailwind utility classes + shadcn components.
5. `pnpm typecheck && pnpm lint && pnpm build` xanh truoc khi ship.

## Related Files

- `apps/web/app/globals.css`
- `apps/web/app/components/foundation/ui-patterns.tsx`
- `packages/ui/src/components/` (shadcn/ui primitives)
- `docs/modules/ui.md`
