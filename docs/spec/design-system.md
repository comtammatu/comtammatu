# Design System - Com Tam Ma Tu Web App

> Version: 14.7.0 | Updated: 2026-06-11 | Status: locked single source for UI agents

## Single Source Decision

This file is the single design-system contract for agents building or reviewing
UI in this repo. It defines the Com Tam Ma Tu Custom Theme: Ma Tu Concept 01
semantic tokens, typography, rhythm, brand usage, primitive roles, and app
surface adapters. Runtime files prove whether the contract is implemented, but
they do not authorize a second visual language.

If a runtime file, package description, generated token file, or external
reference disagrees with this file, treat that as drift. Do not copy the
exception into new UI. Either update this contract first or migrate the runtime
back to the contract.

This is intentionally **one source of truth**, not a source-of-truth bundle.
`docs/modules/ui.md`, `docs/agent/rules/ui.md`, `tasks/regressions.md`,
`components.json`, `globals.css`, primitives, and app adapters are supporting
evidence or enforcement. They must point back to this contract. If they conflict
with it, the conflict is a bug to resolve, not permission to choose whichever
file is convenient.

## Decision

The design system is the Com Tam Ma Tu Custom Theme contract implemented on top
of the current shadcn/Radix primitive baseline. The shadcn preset is the
primitive baseline and runtime conformance evidence, not the design-system
authority. It must never be used to overrule this file.

Custom Theme means the locked Ma Tu Concept 01 semantic tokens, typography,
spacing rhythm, component roles, brand primitives, and app surface adapters
documented here. It does not mean a route-local theme layer, a new component
library, a fork of shadcn primitives, or a parallel visual language.

Active runtime:

- custom theme: Com Tam Ma Tu Custom Theme / Ma Tu Concept 01
- token source: `packages/ui/src/styles/globals.css`
- `style`: `radix-lyra`
- resolved preset code: `buFywKm`
- `baseColor`: `neutral`
- `cssVariables`: `true`
- `iconLibrary`: `lucide`
- primitive baseline: Radix/shadcn
- brand assets: `/brand/logo-matu.png`, `/brand/logo-matu-seal.png`, `/brand/logo-matu-vertical.png`, `/brand/mascot/be-suon-tuoi-runner.png`
- web brand primitive: `apps/web/app/components/brand.tsx`
- web app surface adapters: `apps/web/app/components/surface.tsx`

Agents must preserve this decision unless the task explicitly asks to change the design system itself.

Legacy Inventory pilot artifacts have been retired from runtime app UI:

- removed `packages/design-tokens/tokens.json`
- removed `packages/ui/src/styles/matu-tokens.css`
- removed `apps/web/app/components/matu-surface.tsx`
- removed `apps/web/app/(protected)/admin/kitchen-sink/page.tsx`
- external design folders

New app UI must not import `matu-surface`, use `font-matu-body`, or use
`bg-matu-*`, `text-matu-*`, `border-matu-*`, `rounded-matu-*`,
`--spacing-matu-*`, or `--radius-matu-*`. If the owner explicitly reactivates
the pilot layer later, the design-system contract must be updated first.

## Authority Order

When deciding how to build UI, use this order:

1. Custom Theme contract: `docs/spec/design-system.md`
2. Runtime shadcn config and token evidence that must conform to it: `apps/web/components.json`, `packages/ui/components.json`, `packages/ui/src/styles/globals.css`, `apps/web/app/layout.tsx`
3. Primitive implementation that must conform to it: `packages/ui/src/components/*`
4. App adapter implementation that must conform to it: `apps/web/app/components/surface.tsx`
5. Implementation guide: `docs/modules/ui.md`
6. Negative rules: `tasks/regressions.md`
7. Product copy and terminology: `docs/ref/glossary.md`, `packages/shared/src/labels/vi.ts`, and domain dictionaries

The active shadcn preset is the first implementation baseline for primitives
after this contract has selected a pattern. It is never a higher authority than
this contract. Do not invent a local exception when the contract is unclear.
Pause and update the contract first.

## Product UX Thesis

Com Tam Ma Tu is an operational restaurant system. The UI should feel calm, fast, touch-safe, and business-specific.

- POS and KDS are frontline tools. The first viewport must expose the next safe action or live queue.
- Admin surfaces are dense management workspaces. They should prioritize tables, filters, forms, and review states over decorative summary chrome.
- Inventory surfaces are workflow-first. The user should see pending tasks, required documents, and exception states before secondary analytics.
- Employee surfaces are lightweight task portals. Keep them narrow, direct, and consistent with the shared shell.

The visual tone is rice-cream foundation, terracotta primary action, deep navy text, warm rice-yellow accents, restrained borders, semantic status colors, and strong spacing discipline.

## Token Contract

Allowed token families:

- Surface: `background`, `foreground`, `card`, `popover`, `muted`, `accent`, `border`, `input`, `ring`
- Action: `primary`, `secondary`, `destructive`
- State: `success`, `warning`, `info`, `destructive`
- Tier: `tier-elite`, `tier-note` for trust/variance/waste tier badges only
- Data: `chart-1` through `chart-5`
- Navigation: `sidebar-*`
- Radius: preset radius tokens only
- Typography: runtime font variables from `apps/web/app/layout.tsx` and `packages/ui/src/styles/globals.css`

Theme runtime:

- `packages/ui/src/components/theme-script.tsx` applies the initial `light`
  class before hydration.
- `packages/ui/src/components/theme-provider.tsx` is the only runtime theme
  state provider. Runtime theme is fixed to `light`; old `theme=dark` or
  `theme=system` browser preferences are ignored while light mode is forced.
  Scope, branch, workflow, and auth state must never use browser storage.
- Do not add route-level theme toggles, a second theme context, or a route-local
  theme storage key unless the design-system contract explicitly re-enables
  dark mode.

Approved project utilities:

- `max-h-dvh-95` and `max-h-dvh-80` are bottom-sheet height utilities for
  mobile dynamic viewport constraints.
- `pos-text-overlay` is limited to text over POS menu item photos.
- `pos-safe-top` / `pos-safe-bottom` are limited to POS PWA floating bars.
- `chrome-safe-pb` / `chrome-safe-bottom` are limited to fixed or sticky app
  shell chrome affected by mobile safe areas.
- New utilities require a design-system update first; prefer primitive props
  or app surface adapters when the pattern is reusable.

Forbidden for new app UI:

- `matu-*` Tailwind tokens.
- `--font-matu-body`, `font-matu-body`, or Be Vietnam Pro.
- `rounded-matu-*`, `--radius-matu-*`, or `--spacing-matu-*`.
- External DS token names copied from outside this repo.

Brand Concept 01 runtime mapping:

- `background`: kem gao foundation.
- `foreground` / dark mode foundation: xanh dam.
- `primary`: do gach.
- `ring` / chart accent: vang gao.
- `success`: xanh la diu.
- `muted-foreground` / supporting tone: nau go or xam am depending on theme.
- Heading font: Montserrat.
- Body font: Inter.
- Mono font: JetBrains Mono for tabular operational data.

## Typography Contract

Runtime typography source:

- `apps/web/app/layout.tsx` loads `Inter`, `Montserrat`, and `JetBrains_Mono` through `next/font/google`.
- `packages/ui/src/styles/globals.css` maps those font variables into Tailwind utilities.

Required utility mapping:

| Purpose           | Utility / variable                | Font           |
| ----------------- | --------------------------------- | -------------- |
| body/content text | `font-sans` / `--font-sans`       | Inter          |
| headings/titles   | `font-heading` / `--font-heading` | Montserrat     |
| operational data  | `font-mono` / `--font-mono`       | JetBrains Mono |

Rules:

- `--font-heading-runtime` is an internal `next/font` bridge in `apps/web/app/layout.tsx`; app code consumes only `font-heading` / `--font-heading`.
- Route/page headings, card titles, dialog titles, sheet titles, section titles, and brand lockup text use `font-heading` unless a shadcn primitive already applies it.
- Body text, controls, labels, descriptions, table text, and workflow copy inherit `font-sans`.
- Use `font-mono` only for tabular operational data, IDs, codes, receipt/order numbers, prices, quantities, timestamps, and audit hashes.
- Do not add route-specific `font-family`, custom font variables, or extra Google font families.
- Do not reintroduce `Be Vietnam Pro`, Geist, system-only stacks, `font-matu-body`, or per-surface typography exceptions unless the design-system contract is explicitly changed first.
- When changing typography runtime, update `apps/web/app/layout.tsx`, `packages/ui/src/styles/globals.css`, this contract, `docs/modules/ui.md`, `docs/agent/rules/ui.md`, and `tasks/regressions.md`.

Rules:

- Use semantic Tailwind token classes (`bg-background`, `text-muted-foreground`, `border-border`, `bg-success`, etc.).
- Use `BrandMark` / `BrandLockup` for web runtime logo rendering; do not reference `/brand/logo-*` directly from route components.
- Purpose-specific mascot assets may be used as decorative public images in customer-facing empty or splash states; they must not replace core workflow content.
- Do not hardcode raw palette classes for status meaning (`amber`, `emerald`, `zinc`, etc.) when a semantic token exists.
- Do not add arbitrary dimensions such as `text-[10px]`, `w-[200px]`, or `h-[3rem]`.
- Do not add static inline styles for presentation.
- Do not add per-route `theme.css` files.
- Do not create one-off color ramps for a module.
- Do not scale typography with viewport width.
- Do not change primitive radius, color, focus, or disabled behavior from a page wrapper.

If a new token is truly needed, it must be added to `packages/ui/src/styles/globals.css`, documented here, and checked against `tasks/regressions.md`.

## Rhythm Contract

Token Contract locks **what** values exist; Rhythm Contract locks **when** to use which value, so spacing, sizing, and density read consistently across modules instead of being a per-module judgment call.

A module that needs to deviate must update this contract first, not patch a single page.

### A. Spacing Rhythm

| Slot                         | Class                                | Notes                                 |
| ---------------------------- | ------------------------------------ | ------------------------------------- |
| Page outer padding (mobile)  | `p-3`                                | Set by `AppPage` density="compact"    |
| Page outer padding (default) | `p-4`                                | Set by `AppPage` default              |
| Card inner (default)         | `p-4`                                | Set by `Card` primitive               |
| Card inner (size="sm")       | `p-3`                                | Set by `Card data-size=sm`            |
| Toolbar inner                | `p-3`                                | Set by `AppToolbar`                   |
| Section vertical gap         | `gap-4` (default), `gap-3` (compact) | Set by `AppPage`                      |
| Within-section element gap   | `gap-2`                              | Default for inline rows / form fields |
| Compact toolbar chip gap     | `gap-1.5`                            | Filter chips, badge clusters          |
| Tight icon-label gap         | `gap-1`                              | Icon + 1–2 word label only            |

Allowed gap scale in app code: `1`, `1.5`, `2`, `3`, `4`, `6`. Avoid `5`, `7`, `8` for horizontal flow — they break vertical rhythm with the heading scale below.

Page padding MUST come from `AppPage` (not ad-hoc on the page root). Card padding MUST come from `Card` / `Card size="sm"` (not ad-hoc on `<CardContent>`). When a card body needs table-edge alignment or horizontal table scrolling, use the named primitive props `CardContent flush` and/or `CardContent scroll` instead of local `p-0` / `overflow-x-auto` overrides.

### B. Heading Scale (locked per role)

| Role                    | Class                                                                   | Source                                                                 |
| ----------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Page H1                 | `font-heading text-xl sm:text-2xl font-semibold tracking-tight`         | `AppPageHeader`                                                        |
| Section title           | `font-heading text-base font-semibold`                                  | `CardTitle`                                                            |
| Sub-section / list head | `font-heading text-sm font-semibold`                                    | `Item title` slot                                                      |
| Eyebrow / metadata      | `text-xs font-medium uppercase tracking-wide`                           | `AppPageHeader.eyebrow` (page-header lockup only)                      |
| Table column header     | `text-xs font-medium uppercase tracking-wider text-muted-foreground`    | `TableHead`                                                            |
| Dense eyebrow           | `text-2xs font-medium uppercase tracking-wider`                         | KDS chrome, audit row meta, mobile chrome labels                       |
| Numeric input echo      | `text-3xl font-semibold tabular-nums`                                   | Number pad readout, scale display                                      |
| Runner board header     | `text-runner-header font-semibold`                                      | Runner/KDS order board column headers, height-responsive display token |
| Runner board row text   | `text-runner-board font-semibold`                                       | Runner/KDS order board data cells, height-responsive display token     |
| Runner empty secondary  | `text-runner-empty-secondary font-semibold`                             | Runner/KDS empty-state secondary line, height-responsive display token |
| Runner board footer     | `text-runner-footer font-semibold`                                      | Runner/KDS order board footer, height-responsive display token         |
| Display call target     | `font-mono text-6xl sm:text-7xl lg:text-8xl font-semibold tabular-nums` | Customer-facing runner / queue display only                            |

`text-4xl`, `text-5xl` are NOT allowed in app surfaces. They live only in marketing/login splash. `text-3xl` is reserved for the numeric-input-echo role above (cashier number pad, scale display) and MUST be paired with `tabular-nums`. `text-3xs` is reserved for SVG axis labels and dense table micro-meta.

Display call targets are a separate operational display role, not headings. Use them only on customer-facing queue/runner screens where the primary job is reading a stable serving target from distance. The displayed value must be stable (`table_number` for dine-in, `order_number` / `kitchen_ticket_number` for fallback), never a volatile render index.

Runner/KDS customer boards must use Tailwind's built-in 12-column grid, not a custom percent grid: Đơn `col-span-4`, Số món `col-span-3`, Trạng thái `col-span-4`, Chờ `col-span-1`. The wait-time header is `Chờ`, not `Thời gian đợi`, because wait values are short and the label must not steal width from quantity/status. All four data cells use the same `text-runner-board` row typography. Runner display tokens scale with dynamic viewport height (`dvh`) and clamp between compact desktop and 2K/4K displays; they must not scale from viewport width. Compact desktop viewports must keep cell/header/footer padding below the `xl` breakpoint (`px-4 py-2`) so wrapped labels like `Mang về #041` and `2 món` do not collide with row dividers. The narrow wait-time column may use smaller horizontal padding than the other columns. Status cells MUST NOT add a separate `text-*` class on the data-text element; the label inherits row color so `tailwind-merge` cannot drop the shared row typography.

`font-bold` only for receipt totals, page headers in print mode, and emphasis inside body copy. Default heading weight is `font-semibold`. `font-black` is not allowed in the app.

Eyebrow tracking is locked per surface: `tracking-wide` for the single page-header eyebrow, `tracking-wider` for repeated dense / table / grid eyebrows. `tracking-tight` is allowed ONLY on `font-heading` titles — never on body, eyebrow, or `font-mono` text. Page H1 MUST come from `AppPageHeader`; hand-rolled `<h1>` headers (especially `sm:text-3xl`, which collides with the `text-3xl` numeric-echo reservation) are forbidden — route them through `AppPageHeader`.

### C. Icon Size by Role

| Slot                                | Class                                                            |
| ----------------------------------- | ---------------------------------------------------------------- |
| Inline badge / chip glyph           | `size-3`                                                         |
| Button `size="sm"` glyph            | `size-3.5`                                                       |
| Default (button, link, input affix) | `size-4`                                                         |
| Section / card title glyph          | `size-5`                                                         |
| Page-header eyebrow glyph           | `size-6`                                                         |
| Empty-state media                   | `size-8`–`size-12` (via `EmptyMedia variant="icon"`)             |
| Image / document thumbnail          | `size-12`–`size-16` with `object-cover` (img preview, not glyph) |

`size-7`, `size-9`, `size-11` are NOT allowed in app surfaces. `size-14`, `size-16` are NOT allowed outside `EmptyMedia`, brand lockup, splash imagery, or image/document thumbnails (photo upload preview, supplier doc thumbnail, GRN evidence). Inventory/POS hero glyphs MUST compose `EmptyMedia` or render through a primitive, not free-style `size-12` inside a card.

### D. Height Scale (lock to primitive)

`Button` is the single source of truth for button height. Variants:

| Variant    | Min height | When                                                                                     |
| ---------- | ---------- | ---------------------------------------------------------------------------------------- |
| `xs`       | `h-6`      | Inline metadata actions, tag pickers                                                     |
| `sm`       | `h-7`      | Compact toolbars, dialog footers                                                         |
| `default`  | `h-8`      | Standard CTA, form submit                                                                |
| `lg`       | `h-9`      | Primary CTA, page-header action                                                          |
| `touch`    | `min-h-12` | Mobile touch button (POS, KDS, mobile inventory) — meets WCAG 2.5.5 enhanced target size |
| `touch-lg` | `min-h-14` | Hero CTA / mobile action bar primary (POS bottom bar, KDS bump)                          |
| `icon-xs`  | `size-6`   | Icon-only inline                                                                         |
| `icon-sm`  | `size-7`   | Icon-only compact                                                                        |
| `icon`     | `size-8`   | Icon-only default                                                                        |
| `icon-lg`  | `size-9`   | Icon-only large                                                                          |

Fixed heights `h-10`, `h-11`, `h-12`, `h-14`, `h-16` MUST NOT be applied to `<button>`, `<Link>`, or `<Button>` acting as a button. Min-heights `min-h-12`, `min-h-14`, `min-h-16` MUST come from the `touch` / `touch-lg` variants — do not override on a different variant via `className`. Touch CTAs use `min-h-` rather than fixed `h-` so wrapped labels grow vertically without clipping.

If a new touch tier is genuinely needed (e.g. tablet KDS oversized chef glove targets), add a variant to `Button` cva once. Never fake a button by setting `<button className="min-h-12 ...">` outside the primitive.

`Input` (the bare primitive) is fixed at `h-7`. Composite form controls rendered through the `apps/web/app/components/form/*` layer use a taller `h-10` so labels, addons, and touch targets sit comfortably — set once in that layer, never per page.

| Control role                                                | Height | Source                                                                                          |
| ----------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| Bare text / number `Input` primitive                        | `h-7`  | `Input` primitive (`packages/ui`)                                                               |
| Form text / number field                                    | `h-10` | `form/text-field`, `form/number-field`                                                          |
| Field-trigger (select, combobox, multi-select, date-picker) | `h-10` | `form/select-field`, `form/combobox*`, `form/multi-select-combobox`, `form/business-date-field` |

`h-10` is permitted ONLY on these `form/*` field controls, applied through the shared wrapper. The forbidden fixed heights `h-10` / `h-11` / `h-12` / `h-14` / `h-16` above apply to elements acting as a **button CTA** (`<button>` / `<Link>` / `<Button>` used as an action) — a form-field control that holds input or opens a popover/list is governed by this table, not by the button-height ban. Do not hand-patch a raw `Input` or `SelectTrigger` to `h-10`; route it through the `form/*` wrapper so field height stays single-sourced. Vertical chrome should otherwise be controlled with `Field` / `FieldGroup` spacing, not ad-hoc height overrides.

### E. Radius Scale (4 tokens only)

| Token          | When                                                         |
| -------------- | ------------------------------------------------------------ |
| `rounded-md`   | Default for input, button, badge, chip, small surface card   |
| `rounded-lg`   | Card, sheet, dialog, drawer outer                            |
| `rounded-full` | Avatar, pill badge, circular icon container                  |
| `rounded-none` | Explicit reset only (table cell internals, edge-bleed media) |

`rounded` (no suffix), `rounded-sm`, `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-4xl` are NOT allowed in app code. The radius primitive token surface (`--radius-sm/md/lg/xl/2xl/3xl/4xl`) exists in `globals.css` for shadcn primitive compatibility — app surfaces consume them indirectly through Card/Sheet/etc., not directly.

### F. Density Modes

`AppPage density="compact"` and `Card size="sm"` are the two switches that move a surface from default to dense without rewriting spacing. POS/KDS/Inventory dense list views compose these. Per-module density classes (`*-dense`, `*-tight`) are not allowed.

### G. Motion Contract

Motion is functional only — it signals state change (loading, enter/exit, focus, attention), never decorates. The app uses Tailwind + Radix / `tw-animate-css` defaults; there is no animation library and none may be added.

**Duration.** App surfaces author only two transition durations; everything else is owned by the Radix / `tw-animate-css` primitive layer and must not be hand-set per page.

| Duration                      | Locked use                                                                            | Layer          |
| ----------------------------- | ------------------------------------------------------------------------------------- | -------------- |
| `duration-150`                | `transition-colors` / focus-ring / border feedback on interactive controls            | app + primitive |
| `duration-300`                | Overlay / dialog / sheet enter–exit (Radix `animate-in` / `animate-out`)              | app + primitive |
| `duration-100`, `duration-200`| Primitive-layer defaults inside `packages/ui/*` only — do not introduce in app code    | primitive only |
| `duration-500`                | Full-screen idle/empty visuals only (Runner idle board); never on interactive controls | app (exception) |

Arbitrary `duration-[…]` is NOT allowed in app code.

**Easing.** Use Tailwind defaults: bare `transition*` (default ease), `ease-out` for enter, `ease-linear` only for continuous indicators (spinner, progress). Arbitrary `ease-[cubic-bezier(…)]` is reserved for the shared primitive layer and is not allowed in app surfaces.

**Allowed animations.** `animate-spin` (only via `Spinner`), `animate-pulse` (skeleton / loading placeholders), `animate-in` / `animate-out` and `animate-accordion-*` (Radix-driven, via primitives), `animate-caret-blink` (input caret). No custom `@keyframes` outside `globals.css`.

**Press feedback.** `active:scale-[…]` (≥ `0.97`) is allowed on tap targets for tactile press feedback. `hover:scale-*` grow/shrink on hover is forbidden on ERP surfaces — it reads as decorative.

**Reduced motion (locked).** Any looping or attention-drawing animation (`animate-pulse` on non-skeleton elements, `animate-bounce`, urgency/age pulses, kinetic idle visuals) MUST be gated with `motion-safe:` (or a `prefers-reduced-motion` check) so it stops when the OS requests reduced motion. One-shot Radix enter/exit (`animate-in` / `animate-out`) and the loading `Spinner` are exempt — they are brief and non-looping. Prefer `motion-safe:` on the animated class over `motion-reduce:animate-none` on the static one.

**Forbidden:**

- Decorative, looping, kinetic, parallax, or scroll-reveal motion on any ERP surface (POS / KDS / Admin / Inventory / Employee).
- Animating layout/size properties that thrash (`width` / `height` / `top` / `left`); animate `transform` / `opacity` / `box-shadow` / `color` instead.
- Any third-party animation library (framer-motion, gsap, react-spring), or the reference's marketing-layer reveal curves (600–820 ms) and kinetic-text keyframes.

## Elevation / Shadow

The system is **border-first**: resting surfaces are separated by `--border`, not by shadow. Shadow is reserved for surfaces that genuinely float above the page. There is no `--shadow-*` token layer — elevation is expressed through the Tailwind shadow utilities below, locked per role.

| Rung          | Utility                    | Locked role                                                                                                                          |
| ------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Rest          | _(none — border only)_     | Base `Card`, page sections, table rows, resting tiles. `card.tsx` carries no shadow by design.                                       |
| Hover         | `shadow-sm`                | Interactive/clickable card adapters on hover only — data-table + inventory `interactive-card.tsx`, `AppLinkCard` (`surface.tsx`, `transition-[box-shadow,border-color]`). |
| Overlay       | `shadow-md`                | Popover-family floating layers: `popover`, `dropdown-menu`, `context-menu`, `menubar`, `navigation-menu`, `select`, `hover-card`.    |
| Modal / Sheet | `shadow-lg`                | `sheet`, dialogs, and CTAs **inside a genuinely sticky/fixed action bar** (e.g. GRN-create and transfer-receive `sticky chrome-safe-bottom` footers). |
| Ceiling       | `shadow-xl` / `shadow-2xl` | **Only** fixed surfaces floating over scrolling content: POS mobile action bar (`shadow-2xl`), KDS focus card / chart tooltip (`shadow-xl`). Nowhere else. |

**Non-elevation override.** `pos-text-overlay` (`globals.css`, `filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.6))`) and `drop-shadow-*` image filters (e.g. the runner mascot) are text/image legibility effects, **not** part of the elevation ladder, and must not be reused as surface shadows.

**Forbidden:**

- No drop shadow on a resting `Card`, section, or table row — separate with `--border` instead.
- No `--shadow-*` CSS variables or custom `box-shadow` values; use the utilities above.
- No `shadow-lg` / `xl` / `2xl` on a non-floating surface (e.g. a CTA in a non-sticky resting footer) to "make it pop."
- One rung per role: a popover is `shadow-md`, not `shadow-lg`.

## Component Authority

The only shared primitive layer is `packages/ui/src/components/*`.

App-level page, section, toolbar, empty-state, and link-card composition is centralized in `apps/web/app/components/surface.tsx`. These exports are adapters around the shared primitives, not a second primitive library.

Default primitive mapping:

| Need                  | Use                                                                         |
| --------------------- | --------------------------------------------------------------------------- |
| command/action        | `Button`, `Toggle`, `ToggleGroup`                                           |
| state label           | `Badge`                                                                     |
| framed repeated item  | `Card`                                                                      |
| dense data            | `Table`                                                                     |
| segmented view        | `Tabs`                                                                      |
| form input            | `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `Switch`           |
| dialog flow           | `Dialog`, `AlertDialog`, `Sheet`, `Drawer`                                  |
| empty/no result/error | `Empty` or approved wrappers around `Empty`                                 |
| loading               | `Spinner`, `Skeleton`, `Progress`                                           |
| list row              | `Item`, `ItemGroup`                                                         |
| search/filter shell   | `InputGroup`, `Combobox` helpers where appropriate                          |
| route context         | `Sidebar`, `Breadcrumb`, `Separator`                                        |
| keyboard hint         | `Kbd`, `KbdGroup`                                                           |
| transient feedback    | `Sonner`                                                                    |

Toast and durable notification behavior is specified in `docs/spec/toast-notification-system.md`.

### List Surface contract (lock to DataTable)

Responsive list/table surfaces use the shared `DataTable`
(`apps/web/app/components/data-table/data-table.tsx`): `mobileCardRender` for
the phone card list, the `Table` primitive for desktop, `AppEmptyState` /
`TableEmptyStateRow` for empty states, and shared pagination. Hand-maintained
twin JSX trees (`md:hidden` card list + `hidden … md:block` table) are frozen
by the `responsive-double-render` ratchet and migrate to `DataTable` per
route family. Mobile and desktop MUST expose the same fields, status colors,
and actions for the same row. The retired inventory copy of the data-table
suite must not be reintroduced.

Inline-edit document sheets (PO/transfer/issue lines) use the same adapter:
`render`/`mobileCardRender` receive `(row, index)` so per-line mutations
(`patchLine(index)`) work without a parallel tree, and document totals render
through `desktopFooter` (TableFooter rows) + `mobileFooter` (block under the
card list). Line inputs MUST be controlled (value from parent state) so the
breakpoint switch can remount them safely.

### Empty / Confirm (lock to adapters)

- Empty states render through `AppEmptyState` (page/section) or
  `TableEmptyStateRow` (inside a `Table`); the raw `Empty*` primitives are
  reserved for approved wrappers (`surface.tsx`, employee surface layer).
  `EmptyStatePanel` and the inventory `MobileEmptyState` are retired.
- A list surface renders ONE empty treatment per breakpoint — never a panel
  and a table row stacked on the same viewport.
- Simple yes/no destructive confirmation uses `confirm()` from
  `@comtammatu/ui/components/confirm-dialog` (provider mounted in the root
  layout). Native `window.confirm` / `window.alert` are forbidden (ratchet
  `no-native-dialog`). Hand-rolled `AlertDialog` stays only for flows that
  collect input (reason, quantity) before confirming.

### Status vocabulary (lock to StatusBadge)

Business-state labels and badge colors are single-sourced:

- Labels: `packages/shared/src/labels/vi.ts` (`*_STATUS_LABELS_VI`; keys are the DB CHECK vocabulary, never invented states).
- Variant + rendering: `apps/web/app/components/status-badge.tsx` (`StatusBadge`, `getStatusBadgeMeta`).
- New page-local `STATUS_*` label/variant maps are forbidden (ratchet `status-label-ssot`); register the domain instead.
- Unknown values render as the raw key with `outline` — never throw on DB data.
- Intentional exceptions: `pos/_lib/order-status-display.ts` (cashier 5-label collapse; variants must still match the registry), `kds/lib/status-config.ts` (hot path), `inventory/_lib/dictionary.ts` + `inventory/_lib/ui.ts` (per-entity re-model is a later wave).

### KPI / stat-value role (lock to KpiCard)

Dashboard and report metric values render through `KpiCard`
(`apps/web/app/components/kpi/kpi-card.tsx`): uppercase 2xs label, value
`text-2xl font-bold tabular-nums`, optional `CompareChip` delta and sparkline,
and a drill-down `href` per the owner Q-spec. Page-local
StatCard/SummaryCard/MetricCard definitions are ratcheted by `stat-card-ssot`;
register a variant on `KpiCard` instead of cloning the card.

### Numeric / money cells (lock to Table)

Money, quantity, unit-price, tax-rate, ID/code, and timestamp cells render with the operational-data font (`font-mono`), tabular figures, and right alignment so columns scan as a stable ledger.

| Cell role                       | Required class set                              |
| ------------------------------- | ----------------------------------------------- |
| Money / quantity / price / rate | `text-right font-mono tabular-nums`             |
| ID / code / order / receipt no. | `font-mono tabular-nums` (left-aligned allowed) |
| Right-aligned non-numeric label | `text-right` (no `tabular-nums`)                |

Money values render through `formatVND` from `@comtammatu/shared/format` (single style `45.000đ`); page-local VND formatters and raw `toLocaleString("vi-VN")` money calls are ratcheted by `vnd-format-ssot`. `font-mono` is mandatory on any numeric cell that participates in vertical column comparison (the Typography Contract applied to table bodies). A money/quantity cell written as `text-right tabular-nums` WITHOUT `font-mono` is contract drift — JetBrains Mono is the locked operational-data face, not Inter. These classes go on `TableCell` / `TableHead`, never on a page-specific Table clone; a shared numeric-cell wrapper is allowed only if it renders the shared `Table` primitive and emits exactly this class set. Forbidden: `text-left` money columns, numeric columns missing `tabular-nums`, money/quantity cells missing `font-mono`.

Allowed app wrappers:

- Data adapters that fetch, map, or validate domain data.
- Layout wrappers that arrange primitives without changing the visual contract and delegate to `apps/web/app/components/surface.tsx` when they represent page, header, section, toolbar, empty-state, or navigation-card patterns.
- Form wrappers in `apps/web/app/components/form/`.
- Domain wrappers that remove repetition while still rendering shadcn primitives.

Forbidden wrappers:

- Wrappers that restyle a primitive into a new visual system.
- Page-specific clones of `Button`, `Badge`, `Card`, `Table`, `Tabs`, `Input`, or `Select`.
- Page-specific clones of app page/header/section/toolbar/empty-state/link-card adapters.
- Compatibility shims for a removed design system.
- Helpers named like legacy `app-*` surface classes.
- Legacy pilot wrappers such as the removed `matu-surface` adapter.

## Surface Contracts

### POS

- Mobile-first.
- Main area is menu/search and cart creation.
- Cart is only for creating a new order.
- After submit, mutations happen through order detail or order history flows.
- Session, table, and branch context must compact after selection.
- Payment/destructive flows require confirmation or safe recovery.

### KDS

- Live kitchen queue is the primary content.
- Station, status, and order type filters must be compact and immediately reversible.
- Urgency/status has one visual source of truth per ticket.
- Use semantic state tokens; operational mode colors must still come from shared tokens.
- Bump/complete actions need large touch targets and clear focus states.

### Admin

- Use the shared admin shell, sidebar, breadcrumb, page heading rhythm, table/list/detail forms, and empty states.
- Prefer filters plus table/list views over dashboard-card mosaics.
- Page summaries are allowed only when they help decide the next management action.
- CRUD dialogs use shared form helpers and Zod 4 schemas.

### Inventory

- Workflow-first: receiving, issuing, transfers, stocktake, supplier documents, and exceptions come before analytics.
- Keep procurement and inventory terms aligned with `docs/ref/glossary.md`.
- Dense tables are expected, but row actions and destructive actions must stay visually separated.
- Route IA must stay anchored to three operator flows:
  1. Kiem soat ton: stock on hand, stocktake, expiry, waste/adjustment, reporting.
  2. Nhap/Nhan/Doi soat: purchase order, GRN, supplier invoice/price variance, receiving exceptions.
  3. Dieu phoi/San xuat: transfer, production order, BOM/recipe issue and yield.
- Sidebar group labels must be compact enough for the fixed rail. Use detail page headings and breadcrumbs for full workflow wording.
- Complex Inventory forms use RHF + Zod + app form helpers when they have line arrays, more than four fields, inline pre-submit validation, or pending submit UX. Plain `<form action>` is only for auth, sign out, or single-reason confirmations.
- Use Sonner for success/action-level feedback, inline field errors for validation, and `/access-denied?reason=` only for permission, auth, or scope failures.
- Entity audit history belongs inline on detail pages as a `Lich su` tab filtered by `audit_logs.entity_type` and `audit_logs.entity_id`. Tenant-wide audit search is a compliance surface, not the MVP detail-view default.
- Page is for long forms and line-heavy workflows, Sheet is for focused data entry, Dialog is for short contextual tasks, and AlertDialog is for destructive or irreversible confirmation.
- Inventory money, quantity, tax-rate, and business-date inputs must use the shared app form wrappers instead of ad hoc parsing or `type="number"`.
- Hide permanently unauthorized actions. Show disabled controls with explanatory copy only for temporary operational blockers such as missing shift, locked period, or incomplete prerequisite state.

### Employee

- Keep the surface narrow and task-led.
- Do not turn `/employee` into a second admin shell.
- Use the same typography, tokens, and state vocabulary as admin/POS/KDS.

## Layout Patterns

- Mobile layout is the baseline. Desktop may add density and faster scanning, but not a different information architecture.
- Use standard spacing/radius utilities and primitives before custom layout code.
- Prefer one clear toolbar per workflow.
- Search, filters, counts, and bulk actions should live together.
- Empty, loading, error, and blocked states must use approved primitives or wrappers.
- Do not repeat the same workflow state in header, rail, sidebar, gate, and board.

## Loading / Error / Not-found Frame

Route-level transition states are part of the design system, not per-page improvisation.

- Every route family exposes `loading.tsx` built from `PageSkeleton` / `PageSpinner` (`apps/web/app/components/page-skeleton.tsx`). Do not hand-roll new ad-hoc route skeleton layouts; POS keeps its purpose-built `PosPageSkeleton`.
- KDS, runner, and other realtime boards use `PageSpinner`, never a placeholder board skeleton — fake tickets on an operational screen are forbidden.
- Every route family exposes `error.tsx` delegating to `ErrorPanel` (`apps/web/app/components/error-panel.tsx`): `AppEmptyState mode="error"`, retry via `reset()`, and the error digest in small mono print. `apps/web/app/global-error.tsx` is the single surface allowed to use inline styles, because root CSS may be unavailable when it renders.
- Not-found renders through `NotFoundPanel` (`apps/web/app/components/not-found-panel.tsx`); `apps/web/app/not-found.tsx` covers the app, and per-family `not-found.tsx` exists only where `notFound()` is called and a shell is worth preserving.
- Copy for these frames comes from `@comtammatu/shared/messages` (`ACTIONS_VI`, `STATES_VI`, `ERRORS_VI`); do not inline new Vietnamese strings here.

## Copy Contract

- Internal UI copy is Vietnamese by default.
- Keep established acronyms: `POS`, `KDS`, `tenant`, `GRN`, `WAC`.
- Do not introduce new synonyms for business states or workflow objects.
- Copy source ladder: business meaning and spelling in `docs/ref/glossary.md`; shared domain labels in `packages/shared/src/labels/vi.ts`; generic actions/states/errors in `@comtammatu/shared/messages` or `apps/web/lib/messages/*`; legal-fixed labels in `packages/shared/src/labels/legal-fixed.ts`; route-specific adapters in the relevant domain dictionary.
- Before adding labels, update or consume the correct source in that ladder rather than adding ad-hoc inline synonyms.
- Utility copy beats marketing copy on app surfaces.

## Rebuild Rules For Agents

Before any UI rebuild task:

1. Read `AGENTS.md`, this file, `docs/modules/ui.md`, `tasks/regressions.md`, and the relevant domain docs.
2. Confirm whether any touched file imports `matu-surface` or uses `matu-*` tokens. This should be zero in runtime app code; if not, the task is a legacy pilot regression unless the owner explicitly says otherwise.
3. State the surface, primary user job, affected route family, and primitives to use.
4. Confirm whether the task is a visual refactor, UX flow change, copy change, or behavior change.
5. Keep each PR to one route family or one primitive rollout wave.
6. If the implementation needs a new pattern, update this contract before applying the pattern broadly.

Before marking a UI task complete:

- No fake primitives.
- No arbitrary Tailwind dimensions.
- No static presentation inline styles.
- No route-specific theme layer.
- No duplicated workflow state.
- No new vocabulary drift.
- Mobile first viewport still exposes the next action or live queue for POS/KDS.
- `pnpm typecheck && pnpm lint && pnpm build` passes before marking implementation complete.
