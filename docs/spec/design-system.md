# Design System — Cơm Tấm Má Tư Web App V2

> Version: 8.0.0 | Updated: 2026-04-16
> Stack: Next.js 16.2 · React 19.2 · Tailwind CSS 4.2 · shadcn/ui · TypeScript 6.0

## Source of Truth

Design system co dung mot nguon su that van hanh:

1. `apps/web/app/globals.css`
   Day la nguon compile/runtime cho token va utility classes.
2. Tai lieu nay
   Day la nguon quyet dinh san pham, governance va contract.

Hai noi nay phai khop 1:1.

## Design Direction

Huong chinh thuc cua web app la `Restaurant Ops Ledger`.

- Typography chinh: `Be Vietnam Pro`
- Typography tieu de: `Lora`
- Typography mono: `IBM Plex Mono`
- Nen tong the: giay van hanh am (`paper`) co luoi in nhe va lop nhan do
- Accent thuong hieu: rust orange cho action va trang thai dang xu ly
- Surface grammar: panel bo tron lon, rail toi mau, chip thong tin, action-first
- Tonality: calm under load, role-aware, editorial nhưng van day nghiep vu
- Khong dung AI-generic layouts, khong ra nhieu mini theme rieng cho tung surface
- Cac surface duoc phep khac nhau o contrast, density, interaction rhythm; khong duoc tu tao token system rieng

## Architecture

Design system gom 3 tang:

### 1. Foundation (tokens + utilities)

Dinh nghia o `apps/web/app/globals.css`:

- Color tokens (warm ledger palette + rust accent)
- Typography scale (`Be Vietnam Pro`, `Lora`, `IBM Plex Mono`)
- Spacing scale
- Radius
- Elevation (neutral shadows)
- Animations
- Focus ring
- Touch target utilities
- Safe-area utilities
- Vietnamese text utilities

### 2. App-local V2 Composition

Composition layer moi song trong `apps/web/app/components/v2/`.

- V2 shells
- top context bars
- nav rails / drawers
- metric panels
- dense tables / mobile cards
- empty / loading / blocked states
- route recovery states

`packages/ui` giu vai tro primitive-only. Khong mo rong `admin-patterns` / `inventory-patterns` nhu contract chinh cho surface moi.

### 3. Primitives (shadcn/ui)

32+ shadcn/ui components based on Radix UI:

- Location: `packages/ui/src/components/`
- Export: `@comtammatu/ui/components/*`
- Only `cn` is exported from `@comtammatu/ui` barrel

## Token Contract

### Core colors

| Token                  | Value     | Description                 |
| ---------------------- | --------- | --------------------------- |
| `background`           | `#f5efe5` | Paper background            |
| `foreground`           | `#1f1916` | Primary ink                 |
| `primary`              | `#b85726` | Rust action                 |
| `primary-foreground`   | `#fff8f2` | Light ink on rust           |
| `secondary`            | `#eadcc8` | Warm neutral block          |
| `secondary-foreground` | `#23282d` | Dense neutral text          |
| `accent`               | `#d7cebf` | Highlighted control surface |
| `accent-foreground`    | `#171a1e` | Accent text                 |
| `muted`                | `#e6dfd3` | Quiet surface               |
| `muted-foreground`     | `#6c6c67` | Secondary text              |
| `card`                 | `#fff8ef` | Raised panel                |
| `card-foreground`      | `#241c17` | Panel text                  |
| `border`               | `#ccb8a1` | Warm divider                |
| `input`                | `#ccb8a1` | Input stroke                |
| `ring`                 | `#b85726` | Focus ring                  |
| `destructive`          | `#be3a2d` | Error                       |
| `success`              | `#197355` | Success                     |
| `warning`              | `#ab7218` | Warning                     |
| `info`                 | `#285fc0` | Info                        |

### Sidebar tokens

| Token                        | Value     |
| ---------------------------- | --------- |
| `sidebar`                    | `#12161a` |
| `sidebar-foreground`         | `#f6f2e9` |
| `sidebar-primary`            | `#c35a22` |
| `sidebar-primary-foreground` | `#fff8f2` |
| `sidebar-accent`             | `#1e2429` |
| `sidebar-accent-foreground`  | `#f6f2e9` |
| `sidebar-border`             | `#2a3238` |
| `sidebar-ring`               | `#c35a22` |

### Surface semantics

| Token              | Value     |
| ------------------ | --------- |
| `surface-raised`   | `#fbf8f1` |
| `surface-sunken`   | `#e8e1d5` |
| `panel-subtle`     | `#efe8dc` |
| `panel-strong`     | `#ddd2c2` |
| `shell`            | `#12161a` |
| `shell-foreground` | `#f6f2e9` |
| `state-pending`    | `#ab7218` |
| `state-processing` | `#c35a22` |
| `state-ready`      | `#197355` |
| `state-cancelled`  | `#767069` |

### Typography

- `font-sans`: Be Vietnam Pro
- `font-heading`: Lora
- `font-mono`: IBM Plex Mono
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
className = "surface-panel";
```

### Standard header

```tsx
className = "surface-panel-strong sticky top-3 z-30";
```

### Standard shell rail

```tsx
className = "surface-shell paper-grid-dark";
```

### Stat card

```tsx
className = "rounded-3xl border border-border/80 bg-card p-5 shadow-app-sm";
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
className = "transition-all hover:-translate-y-0.5 hover:shadow-md";
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
4. App-local V2 composition phai song trong `apps/web/app/components/v2/`.
5. `packages/ui` la primitive-first; khong coi `admin-patterns` / `inventory-patterns` la contract moi.
6. Copy phai di qua glossary/dictionary khi dung term nghiep vu.
7. `pnpm typecheck && pnpm lint && pnpm build` xanh truoc khi ship.

## Related Files

- `apps/web/app/globals.css`
- `apps/web/app/components/v2/`
- `packages/ui/src/components/blocked-state-flash.tsx`
- `packages/ui/src/components/` (shadcn/ui primitives)
- `docs/modules/ui.md`
