# Design System — Cơm Tấm Má Tư

> Version: 3.0.0 | Updated: 2026-04-09
> Stack: Next.js 16.2 · React 19.2 · Tailwind CSS 4.2 · shadcn/ui · TypeScript 6.0
> Research: UI/UX Pro Max skill (product, color, typography, style, UX domains)

## Design Philosophy

Restaurant management app = **operational tool used 8+ hours/day** by staff in a hot kitchen, busy cashier counter, and back-office.

**Key constraints:**

- Touch-first for POS/KDS (large targets, high contrast)
- Data-dense for Admin (tables, forms, stats)
- Warm & appetizing (food business identity)
- Vietnamese-first (typography must render diacritics beautifully)

**Style direction:** Warm Minimalism + Data-Dense Dashboard

- NOT cold tech/SaaS blue
- NOT playful/vibrant neon
- Professional warmth — like a well-designed restaurant interior

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

Based on UI Pro Max "Restaurant/Food Service" recommendation: warm red + gold.

### Light Mode

| Token                | OKLch                 | Hex Approx | Purpose                          |
| -------------------- | --------------------- | ---------- | -------------------------------- |
| `primary`            | oklch(0.52 0.2 25)    | #DC2626    | Brand red — CTAs, active states  |
| `primary-foreground` | oklch(0.98 0.005 80)  | #FEF2F2    | Text on primary                  |
| `secondary`          | oklch(0.95 0.008 75)  | #F5F0EB    | Warm light gray                  |
| `accent`             | oklch(0.72 0.16 85)   | #CA8A04    | Warm gold — highlights, badges   |
| `background`         | oklch(0.985 0.003 75) | #FAFAF8    | Page background — warm off-white |
| `card`               | oklch(1 0 0)          | #FFFFFF    | Card surfaces                    |
| `foreground`         | oklch(0.18 0.03 30)   | #1C1208    | Primary text — warm near-black   |
| `muted-foreground`   | oklch(0.5 0.02 55)    | #7A6A50    | Secondary text                   |
| `border`             | oklch(0.9 0.008 75)   | #E8E0D5    | Borders — warm tint              |
| `destructive`        | oklch(0.55 0.22 27)   | #DC2626    | Error/delete                     |
| `success`            | oklch(0.6 0.18 155)   | #16A34A    | Success states                   |
| `warning`            | oklch(0.75 0.15 85)   | #D97706    | Warnings                         |
| `info`               | oklch(0.6 0.15 240)   | #2563EB    | Info                             |

### Sidebar (Dark Warm)

| Token                | Value                | Purpose                      |
| -------------------- | -------------------- | ---------------------------- |
| `sidebar`            | oklch(0.22 0.035 30) | Dark brown-red background    |
| `sidebar-foreground` | oklch(0.88 0.01 75)  | Light text                   |
| `sidebar-primary`    | oklch(0.72 0.16 85)  | Gold accent for active items |
| `sidebar-accent`     | oklch(0.28 0.04 30)  | Hover/focus background       |

### Dark Mode (KDS)

Same hue family (30), inverted luminance. KDS gets `.dark` class automatically.

## Typography

### Font: Be Vietnam Pro

**Why this font?**

- Excellent Vietnamese diacritic rendering
- Google Fonts, free, fast CDN
- Multiple weights (300-700)
- Clean, modern, professional
- Already in brand identity

**Hierarchy:**

| Context          | Weight | Size | Class                     |
| ---------------- | ------ | ---- | ------------------------- |
| Page titles      | 700    | 30px | `text-3xl font-bold`      |
| Section headers  | 600    | 20px | `text-xl font-semibold`   |
| Card titles      | 600    | 16px | `text-base font-semibold` |
| Body text        | 400    | 14px | `text-sm`                 |
| Labels/captions  | 500    | 12px | `text-xs font-medium`     |
| Sidebar nav      | 500    | 14px | `text-sm font-medium`     |
| POS menu items   | 600    | 18px | `text-lg font-semibold`   |
| KDS ticket items | 700    | 20px | `text-xl font-bold`       |

**Rule:** Max 2 font sizes per section. No text smaller than 12px.

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
- Large number: `text-3xl font-bold tabular-nums`
- Change pill: `rounded-full px-2 py-0.5` with success/destructive/10 bg
- Decorative circle in top-right: `primary/5`, offset

### Tables

- Header: `muted` bg, `text-xs uppercase tracking-wider font-semibold`
- Rows: `hover:bg-muted/40` transition-colors
- Dividers: `divide-border/60`

### Sidebar (Admin)

- Dark warm background (`sidebar` token)
- Active: gold left indicator bar (3px rounded), `sidebar-accent` bg
- Groups: 11px uppercase `tracking-widest`, 40% opacity
- Icons: 18px, gold on active, dim on inactive

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
| Dark warm bg     | Blur bg, sticky   |
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
