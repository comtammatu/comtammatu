# Design System — Cơm Tấm Má Tư

> Version: 4.0.0 | Updated: 2026-04-10
> Stack: Next.js 16.2 · React 19.2 · Tailwind CSS 4.2 · shadcn/ui · TypeScript 6.0
> Base: shadcn/ui default + zinc neutral + Red accent

## Design Philosophy

Restaurant management app = **operational tool used 8+ hours/day** by staff in a hot kitchen, busy cashier counter, and back-office.

**Key constraints:**

- Touch-first for POS/KDS (large targets, high contrast)
- Data-dense for Admin/Inventory/Finance (tables, forms, stats — optimize readability)
- Vietnamese-first (typography must render diacritics beautifully)
- Font-size optimized per screen type

**Style direction:** Pure Minimal — White / Black / Red

- Default shadcn/ui aesthetic, no custom warm tinting
- Three-color palette: White background, Black text, Red accent
- Clean zinc-scale neutrals
- Maximum data density without sacrificing readability

## Governance

This file is the **single source of truth** for design decisions. Implementation must match `globals.css` `@theme`.

Rules:

1. No secondary design spec files. Tool outputs (`ui-ux-pro-max`, etc.) are input material — never commit as spec.
2. All tokens, typography, spacing, and interaction standards must match this spec and `apps/web/app/globals.css`.
3. Surface overrides (KDS/POS/Admin sections below) can narrow behavior by context, never break shared semantics.
4. ESLint rule `no-arbitrary-tailwind-value` enforces no `[Xpx]`/`[Xrem]` — extend `@theme` instead.

## Product Surface Overrides (v3)

### Admin surfaces

- Data-dense, calm hierarchy, low decorative noise.
- Reuse one spacing rhythm and one table/filter idiom.
- Keep warm accent usage subtle, mostly for action and status highlight.

### POS surfaces

- Touch-first with comfortable targets (44x44 minimum, 56x56 preferred).
- Fast scan hierarchy for menu/cart/payment flow.
- Strong state clarity for loading, disabled, and error feedback near action.

### KDS surfaces

- Dark-surface, high-contrast readability at distance.
- Status and urgency semantics are centralized and reused across badge, border, timer, and action cues.
- Avoid raw palette drift by mapping visual states to semantic tokens.

## Color Palette

Pure minimal: White / Black / Red. Zinc-scale neutrals, no warm tint.

### Light Mode

| Token                | OKLch                   | Hex Approx | Purpose                   |
| -------------------- | ----------------------- | ---------- | ------------------------- |
| `background`         | oklch(1 0 0)            | #FFFFFF    | Page background — pure    |
| `foreground`         | oklch(0.145 0 0)        | #171717    | Primary text — near-black |
| `primary`            | oklch(0.577 0.245 27.3) | #DC2626    | Brand red — CTAs, active  |
| `primary-foreground` | oklch(1 0 0)            | #FFFFFF    | Text on primary           |
| `secondary`          | oklch(0.961 0 0)        | #F5F5F5    | Neutral light gray        |
| `accent`             | oklch(0.961 0 0)        | #F5F5F5    | Same as secondary         |
| `muted`              | oklch(0.961 0 0)        | #F5F5F5    | Muted elements            |
| `muted-foreground`   | oklch(0.556 0 0)        | #8B8B8B    | Secondary text            |
| `card`               | oklch(1 0 0)            | #FFFFFF    | Card surfaces             |
| `border`             | oklch(0.918 0 0)        | #E5E5E5    | Borders — pure neutral    |
| `destructive`        | oklch(0.577 0.245 27.3) | #DC2626    | Error/delete (= primary)  |
| `success`            | oklch(0.6 0.18 155)     | #16A34A    | Success states            |
| `warning`            | oklch(0.75 0.15 85)     | #D97706    | Warnings                  |
| `info`               | oklch(0.6 0.15 240)     | #2563EB    | Info                      |

### Sidebar (Pure Dark)

| Token                | Value                   | Purpose               |
| -------------------- | ----------------------- | --------------------- |
| `sidebar`            | oklch(0.09 0 0)         | Near-black background |
| `sidebar-foreground` | oklch(0.96 0 0)         | Light text            |
| `sidebar-primary`    | oklch(0.577 0.245 27.3) | Red accent for active |
| `sidebar-accent`     | oklch(0.16 0 0)         | Dark gray hover       |
| `sidebar-border`     | oklch(0.2 0 0)          | Dark border           |

### Dark Mode (KDS)

Inverted luminance with same neutral hue. KDS gets `.dark` class automatically.

## Typography

### Font: Geist + Geist Mono

- **Geist**: Primary sans-serif. Clean, modern, excellent Latin/Vietnamese rendering.
- **Geist Mono**: Monospace for numbers, codes, financial data. Weight nudged to 500.
- Loaded via `next/font/google` with `display: swap`.

### Font-Size Strategy by Screen Type

All screens are data-heavy (tables, numbers, lists). Optimize for information density + readability.

**Custom token:** `text-data` = 13px/20px — the sweet spot between `text-xs` (12px) and `text-sm` (14px) for dense tables.

| Screen Type         | Base Body   | Table Data  | Headers     | Numbers                  |
| ------------------- | ----------- | ----------- | ----------- | ------------------------ |
| Admin/Inventory     | `text-sm`   | `text-data` | `text-base` | `tabular-nums`           |
| Finance/Reports     | `text-sm`   | `text-data` | `text-base` | `font-mono tabular-nums` |
| POS (touch-first)   | `text-base` | `text-sm`   | `text-lg`   | `tabular-nums`           |
| KDS (distance read) | `text-lg`   | `text-base` | `text-xl`   | `font-bold`              |
| Employee (mobile)   | `text-sm`   | `text-xs`   | `text-base` | `tabular-nums`           |

### Typography Hierarchy

| Context          | Weight | Size | Class                     |
| ---------------- | ------ | ---- | ------------------------- |
| Page titles      | 700    | 24px | `text-2xl font-bold`      |
| Section headers  | 600    | 18px | `text-lg font-semibold`   |
| Card titles      | 600    | 14px | `text-sm font-semibold`   |
| Body text        | 400    | 14px | `text-sm`                 |
| Data cells       | 400    | 13px | `text-data`               |
| Labels/captions  | 500    | 12px | `text-xs font-medium`     |
| Sidebar nav      | 500    | 14px | `text-sm font-medium`     |
| POS menu items   | 600    | 16px | `text-base font-semibold` |
| KDS ticket items | 700    | 20px | `text-xl font-bold`       |

**Rules:**

- Max 2 font sizes per section. No text smaller than 12px.
- Financial numbers: always `font-mono tabular-nums` for alignment.
- Table headers: `text-xs uppercase tracking-wider font-semibold`.

## Spacing, Elevation, and Radius

| Token       | Value | Notes                 |
| ----------- | ----- | --------------------- |
| `radius-sm` | 6px   | Inputs, small buttons |
| `radius-md` | 8px   | Cards, buttons        |
| `radius-lg` | 10px  | Modals, sheets        |
| `radius-xl` | 16px  | Large containers      |

**Spacing:** 4px base unit. Multiples: 4, 8, 12, 16, 24, 32, 48.

**Elevation scale (v3):**

- `elevation-0`: flat
- `elevation-1`: low emphasis cards
- `elevation-2`: raised controls and dropdowns
- `elevation-3`: modal/sheet

**Z-index scale (v3):** 10, 20, 30, 40, 50

## Spacing Rules

### Allowed spacing scale

Only these Tailwind values. Anything outside requires team review:

| Token | Value | Use for                             |
| ----- | ----- | ----------------------------------- |
| `0.5` | 2px   | Tight inline gaps (icon + text)     |
| `1`   | 4px   | Compact element spacing             |
| `1.5` | 6px   | Form field internal                 |
| `2`   | 8px   | Related element gaps, compact lists |
| `3`   | 12px  | Filter bar gaps, button groups      |
| `4`   | 16px  | Card grid gaps, section sub-gaps    |
| `6`   | 24px  | Page section spacing, card padding  |
| `8`   | 32px  | Major section breaks                |
| `12`  | 48px  | Page-level hero spacing             |

### Page layout spacing

All admin pages MUST follow:

| Element               | Class       | Value                   |
| --------------------- | ----------- | ----------------------- |
| Page sections         | `space-y-6` | 24px between sections   |
| Page header → content | (in above)  | Included in `space-y-6` |
| Stat card grid        | `gap-4`     | 16px                    |
| Table → next section  | (in above)  | Included in `space-y-6` |

### Card spacing

Never override Card internal padding with `className`. Use composition:

| Element     | Default    | Override allowed? |
| ----------- | ---------- | ----------------- |
| CardHeader  | `p-6`      | NO                |
| CardContent | `p-6 pt-0` | NO                |
| CardFooter  | `p-6 pt-0` | NO                |

If you need different padding, create a Card variant — don't `className` override.

### Dialog max-widths

One size per dialog type:

| Type               | Max-width      | When                    |
| ------------------ | -------------- | ----------------------- |
| Simple form        | `sm:max-w-lg`  | Default for all forms   |
| Wide table/complex | `sm:max-w-2xl` | Only with explicit need |

### Grid gaps

| Context         | Gap     | Example                |
| --------------- | ------- | ---------------------- |
| Stat cards      | `gap-4` | Dashboard stats grid   |
| Form fields     | `gap-4` | Form field grid        |
| Filter controls | `gap-3` | Filter bar items       |
| Compact list    | `gap-2` | Dropdown items, badges |
| Button group    | `gap-2` | Action button row      |

## Component Patterns

### Stat Cards (Dashboard)

- Icon in colored circle (`primary/10` bg)
- Large number: `text-2xl font-bold tabular-nums`
- Change pill: `rounded-full px-2 py-0.5` with success/destructive/10 bg

### Tables

- Header: `muted` bg, `text-xs uppercase tracking-wider font-semibold`
- Data cells: `text-data` for dense data, `text-sm` for standard
- Numbers: `font-mono tabular-nums` for column alignment
- Rows: `hover:bg-muted/40` transition-colors
- Dividers: `divide-border/60`

### Sidebar (Admin)

- Pure dark background (`sidebar` token — near-black)
- Active: red left indicator bar (3px rounded), `sidebar-accent` bg
- Groups: `text-xs uppercase tracking-widest`, 40% opacity
- Icons: 18px, red on active, dim on inactive

### POS

- Full viewport `h-dvh`, no scroll
- Touch targets: min 44x44px, prefer 56x56px
- Menu grid with category tabs
- Cart: sticky right panel

### KDS

- Dark mode `.dark` forced
- Ticket cards with age-based color coding
- Large text for readability at distance
- Station tabs for filtering

## Layout

### Admin Shell

```
+------------------+-------------------+
| Sidebar (256px)  | Header (56px)     |
| Dark bg          | Blur bg, sticky   |
|                  |-------------------|
| Brand + nav      | Content           |
| groups + user    | max-w-7xl padded  |
+------------------+-------------------+
```

### POS

```
+-----------------------------------+
| Full viewport (h-dvh)            |
| +----------------+---------------+|
| | Menu Grid      | Cart Panel    ||
| | (scroll)       | (fixed right) ||
| |                | Total + Pay   ||
| +----------------+---------------+|
+-----------------------------------+
```

## Anti-Patterns

- No emojis as functional icons — use Lucide SVG
- No color-only indicators — add text labels
- No raw hex colors — use CSS variables
- No text < 12px
- cursor-pointer on all clickable elements
- Transitions: 150-300ms ease
- No one-off spacing systems outside the 4px base rhythm
- No duplicated visual mapping for the same status in different components
- No `space-y-8` on admin pages — use `space-y-6`
- No CardHeader/CardContent `className` padding overrides — create variant instead
- No arbitrary dimension values `[Xpx]`, `[Xrem]` — extend `@theme` in globals.css
- No `py-32`, `py-24`, `py-16` empty state padding — use `EmptyState` component

## Checklist

- [x] Color contrast 4.5:1 WCAG AA
- [x] Hover + focus states on all interactive elements
- [x] Responsive: 375px, 768px, 1280px
- [x] Typography hierarchy consistent
- [x] Dark mode for KDS
- [x] Print styles for POS receipts
- [x] prefers-reduced-motion respected
- [x] Vietnamese diacritics render at all sizes
