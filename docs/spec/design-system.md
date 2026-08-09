# Design System - Com Tam Ma Tu Web App

> Version: 16.0.0 | Updated: 2026-08-09 | Status: Má Tư visual contract

## Visual Contract And Authority Map

This file owns the Má Tư visual language: semantic tokens, typography, density,
brand, visual states, elevation, and motion. It is the visual source of truth.

**3+1 read order** for UI work:

1. **This file** — visual tokens, rhythm, component authority, structural chrome.
2. **`docs/spec/page-archetypes.md`** — page/workflow composition recipes.
3. **`docs/ref/screen-context-map.md`** — audience, device, route context.
4. **`docs/modules/ui.md`** — thin implementation map (adapters, forms, overlay).

| Concern | Owner | Role |
| --- | --- | --- |
| Visual language | This file + `packages/ui/src/styles/globals.css` | Má Tư tokens and recipes |
| Headless behavior | Base UI | accessibility and interaction |
| Shared components | `packages/ui/src/components/*` | styled Má Tư implementations |
| Workflow composition | `docs/spec/page-archetypes.md` + target route | job, state, navigation, IA |
| Audience / device | `docs/ref/screen-context-map.md` | who, where, which plane |
| Runtime integration | `docs/modules/ui.md` | thin adapter / composition map |
| Regression proof | guards, focused tests, browser evidence | verify outcomes |

Surface/POS/KDS/Owner/Inventory workflow essays live in `page-archetypes.md` and
`screen-context-map.md`. This file keeps only visual and structural policy.

When owners disagree, resolve at the concern that owns it. Do not create a
second visual language.

## Decision

The design system is the **Má Tư Design System**, implemented as the Com Tam Ma
Tu Custom Theme through shared components in `@comtammatu/ui`. Base UI supplies
headless primitive behavior; lucide, Tailwind, and CVA are implementation
dependencies. They do not own Má Tư visual decisions.

Do not use the retired label “Concept 01” / “Ma Tu Concept 01”. The single
product name is **Má Tư Design System**.

Shadcn and Web Interface Guidelines are explicit comparison inputs. They may
identify missing component anatomy, accessibility, states, UX, or CSS motion.
They never create a preset, token source, or visual authority for this repo.

Active runtime:

- design system name: Má Tư Design System
- custom theme: Com Tam Ma Tu Custom Theme (implementation label under Má Tư DS)
- token source: `packages/ui/src/styles/globals.css`
- shared component source: `packages/ui/src/components/*`
- headless primitive behavior: Base UI
- brand assets: `/brand/*` (consume via `BrandMark` / `BrandLockup` /
  `BrandSymbol` / `BrandMascot` in `apps/web/app/components/brand.tsx`)
- web app surface adapters: `apps/web/app/components/surface.tsx`
- Stitch/agent mirror (non-SSOT): `.stitch/DESIGN.md` only; root `DESIGN.md`
  forbidden

Lookup before composition:

```bash
corepack pnpm audit:ui-components --component <component-or-block>
```

Agents must preserve this decision unless the task explicitly changes the design
system.

## Token Contract

Token **values** live in `packages/ui/src/styles/globals.css`. This section owns
policy: which families exist, theme runtime rules, and approved utilities.

Allowed token families:

- Surface: `background`, `foreground`, `card`, `popover`, `muted`, `accent`,
  `border`, `input`, `ring`
- Action: `primary`, `secondary`, `destructive`
- State: `success`, `warning`, `info`, `destructive`
- Tier: `tier-elite`, `tier-note` for trust/variance/waste tier badges only
- Data: `chart-1` through `chart-5`
- Navigation: `sidebar-*`
- Radius / typography: current semantic scale only (see globals.css)

Theme runtime:

- Two modes: `light` (day) and `night` (warm-dark "gạo cháy", `.dark` selector).
- `theme-script.tsx` applies class before hydration from `matu-theme` cookie
  (`light` | `night`); absent → night 18:00–06:00 local. Never
  `prefers-color-scheme` / `matchMedia`.
- `packages/ui/src/components/theme-provider.tsx` is the only runtime theme
  state provider. `setTheme` writes the cookie (SameSite=Lax, 1y). Theme is the
  only browser-stored UI preference.
- Single toggle: `ThemeToggle` in approved chrome slots only.

Approved project utilities (policy only; class bodies in globals.css):

- `max-h-dvh-95` and `max-h-dvh-80` are bottom-sheet height utilities for
  mobile dynamic viewport constraints.
- `pos-safe-bottom` is limited to POS PWA floating bottom bars.
- `pos-text-overlay` is limited to text over POS menu item photos.
- `workflow-safe-pb` / `workflow-safe-pt` for public workflow fixed bars.
- `chrome-safe-pt` / `chrome-safe-pb` / `chrome-safe-top` are limited to app
  shell roots and fixed or sticky chrome affected by mobile safe areas
  (`chrome-safe-pb` / `chrome-safe-top` pair out the vertical chrome insets).
  Side `SheetContent` owns its safe-area padding; do not put `chrome-safe-top`
  on the Sheet absolute close control.
- `chrome-tap`, `no-scrollbar`, mascot sprite utilities, `shadow-effect-*`,
  `bg-effect-scrim`, `drawer-scrim` — see globals.css and Elevation below.
- New utilities require a design-system update first.

### Tint Opacity Scale

| Step | Opacity | Role |
| --- | --- | --- |
| `fill` | `/10` | Default status-surface tint |
| `fill-strong` | `/15` | Callout / emphasis surface |
| `hairline-border` | `/20` | Hairline border/ring on a tint |

Prefer `/30` or `/50` for muted fills. Solid status backgrounds use the bare
token. Tint callout chrome routes through `Alert` or `NoteCallout` — never a
hand-rolled tinted bordered box. Canonical warning: `NoteCallout tone="warning"`.

`apps/web/app/global-error.tsx` is the sole inline-`style` presentation exception.

Contrast: non-text UI ≥3:1 (WCAG 1.4.11); body text AA ≥4.5:1. Prefer contrast
fixes over spacing-only patches. Forbidden: parallel token namespaces, custom
font variables outside `font-sans` / `font-heading` / `font-mono`, external DS
token names.

## Typography Contract

Runtime fonts load in `apps/web/app/layout.tsx` (Geist / Geist Mono); mappings
live in globals.css.

| Purpose | Utility | Font |
| --- | --- | --- |
| body/content | `font-sans` | Geist |
| headings/titles | `font-heading` | Geist |
| operational data | `font-mono` | Geist Mono |

Rules:

- Route/page headings, card/dialog/sheet/section titles, brand lockup →
  `font-heading` unless a shared component already applies it.
- Body, controls, labels, tables → `font-sans`.
- `font-mono` only for tabular operational data, IDs, codes, prices, quantities,
  timestamps, audit hashes.
- Use `BrandMark` / `BrandLockup` for logos; `BrandSymbol` for brand symbols;
  `BrandMascot` for `Cốt Lết`. Do not reference `/brand/logo-*`, `/brand/symbols/*`,
  or `/brand/mascot/cotlet*` from route components.
- `BrandSymbol` may be decorative `EmptyMedia` via `AppEmptyState` `symbol` prop.
- No Inter/Montserrat/JetBrains/system-only stacks; no viewport-width typography
  scaling; no per-route `theme.css`.

## Rhythm Contract

Token Contract locks **what** exists; Rhythm locks **when**. Values and class
strings that merely restate globals.css or shared-component defaults are not
repeated here — compose through `AppPage`, `Card`, `Button`, and adapters.

### A. Spacing Rhythm

Defaults: `AppPage` owns outer pad (`p-3` compact / `p-4` default); `Card` owns
inner pad; `AppListFrame` owns LIST flush edges; `AppToolbar` owns toolbar pad;
section gaps `gap-4` / `gap-3` compact. Prefer `gap` for stacks. Use
`CardContent flush` and `CardContent scroll` when they express the job (table/
list edge alignment and horizontal overflow). A route may compose equivalent
spacing when it does not create competing chrome.

### B. Heading Scale

| Role | Source |
| --- | --- |
| Page H1 | `AppPageHeader` (`text-xl sm:text-2xl`) |
| Section title | `CardTitle` (`text-base`) |
| Eyebrow / metadata | `AppPageHeader.eyebrow` (`text-xs` uppercase) |
| Panel / field / section label | `SectionLabel` (`text-xs`; dense KDS `text-2xs`) |
| Table column header | `TableHead` |
| Runner board tokens | `text-runner-*` (height-responsive `dvh` clamps) |
| Display call target | customer queue/runner only (`text-6xl`+) |

Uppercase labels are one locked role: `text-xs` (dense KDS `text-2xs`) — never
`text-sm`/`text-base` with `uppercase`. `text-4xl`/`text-5xl` marketing/login
only. Heading weight default `font-semibold`; `font-bold` reserved for receipt
totals, print headers, and POS menu item-name over photo.

On control_surface routes that mount `AppShell`,
`AppPageHeader.eyebrow` MUST NOT repeat the primary sidebar module
label or a marketing synonym — sidebar and deep-nav already own that context.

### C. Icon Size by Role

Inline `size-3`–`size-4`; section glyph `size-5`; page-header eyebrow `size-6`;
empty media `size-8`–`size-12` via `EmptyMedia`. Ban free-style `size-7/9/11`
and oversized heroes outside `EmptyMedia` / brand / thumbnails.

### D. Height Scale

`Button` owns button heights (`xs`→`touch-lg`, icon sizes, `tile`). Do not apply
fixed `h-10`–`h-16` to elements acting as button CTAs; touch mins come from
named variants. Form fields use `controlSize` / `useFormControlSize()`
(`responsive` → touch below `lg`, field from `lg`). `Combobox`, `Select`,
`Pagination` and related controls consume named sizes — never raw height patches
on CTA classNames.

### E. Radius Scale

Four tiers only: control `rounded-md`, card/page `rounded-lg`, pill
`rounded-full`, reset `rounded-none`.

### F. Density Modes

`AppPage density="compact"` and `Card size="sm"` are the only density switches.
No per-module `*-dense` / `*-tight` classes.

### G. Motion Contract

Functional feedback first. Prefer `--motion-*` / `--ease-*`. Honor global
`prefers-reduced-motion` reset; gate continuous/attention motion with
`motion-safe:`. `transition-all` prohibited. Press: `active:scale-[…]` ≥ 0.97;
no `hover:scale-*` on ERP surfaces.

## Elevation / Shadow

Border-first resting surfaces. Named recipes: `shadow-effect-card-resting` /
`card-hover` / `popover` / `dialog` / `drawer` / `tooltip`; toast via
`--effect-toast`; sticky CTA may use `shadow-lg` inside genuinely sticky footers;
`shadow-xl`/`shadow-2xl` only for fixed floaters (POS bar, KDS focus). Scrims:
`bg-effect-scrim` / `drawer-scrim`.

## Component Authority

Base UI is headless. The only shared styled layer is
`packages/ui/src/components/*`. App page/section/toolbar/empty/link-card
composition lives in `apps/web/app/components/surface.tsx` (adapters, not a
second library).

**Card roles:** `Card` = framed section; `KpiCard` = numeric/stat only; `Frame`
= inset box without Card flex/gap/pad. Other jobs: `AppSection`, `AppLinkCard`,
`OperationalBoardCard`, `InteractiveCard`, `DataTable.mobileCardRender`.

Default routing (essentials): `Button`/`Toggle*` for actions; `StatusBadge` for
business state; `DataTable` for searchable responsive data (raw `Table` only
inside approved adapters); `Combobox` for searchable sets; `Pagination` for
table navigation; form helpers for fields; `AppDialog`/`FormDialog`/`confirm()`
for overlays; `AppEmptyState` for empty/error; `KpiCard` for metrics only.

List/table: one hierarchy — `Table` primitive + `DataTable` adapter. No
`DataTableV2` / twin JSX trees. Branch-native touch LIST may use `Item`/
`ItemGroup` when named in page-archetypes; share loader/model/mutations with
control_surface.

Floating layers (`Select`, `Popover`, `DropdownMenu`, `Combobox`): fixed
positioning via `packages/ui/src/lib/floating-layer.ts`. Status labels from
`packages/shared/src/labels/vi.ts` + `StatusBadge`. Money/quantity cells:
`font-mono tabular-nums` (+ `text-right` for money). Formatters from
`@comtammatu/shared/format` and `@comtammatu/shared/time`.

### High-level shared-component import governance

`Card`, `Table`, `Dialog`, and `AlertDialog` are shared styled components.
Routes should reuse a matching adapter where one exists. Direct shared-component
composition is valid for a unique semantic job only after the component lookup
shows no matching adapter; it must still use Má Tư tokens and prove the relevant
behavior and states.

| Shared component import | Default route for new app code |
| --- | --- |
| `@comtammatu/ui/components/card` | `AppSection`, `AppLinkCard`, `KpiCard` (metrics), `InteractiveCard`, `OperationalBoardCard`, or route-scoped adapter |
| `@comtammatu/ui/components/table` | `DataTable`, `TableEmptyStateRow`, or documented document/line-sheet adapter |
| `@comtammatu/ui/components/dialog` | `AppDialog`, `FormDialog`, `Sheet`, Page flow, or approved exceptional dialog |
| `@comtammatu/ui/components/alert-dialog` | shared `confirm()`, `FormDialog` with reason, or approved destructive flow |

## Structural Governance

Assembly contract: which chrome shell, route home, nav source, and page padding.
Route IA: `docs/spec/role-route-matrix.md`. Nav data:
`packages/shared/src/auth/nav-config.ts`.

### A. Chrome Archetypes

Exactly one approved family per route:

1. **control_surface** — `AppShell` for L0 management routes. Sidebar + header;
   bottom nav below `lg`. Scroll: inset content region scrolls
   (`data-owner-shell-scroll`). `AppPageHeader` scrolls with page content
   (do not sticky/freeze it outside the scrollport). LIST filters stick via
   `AppListFrame` / `AppToolbar sticky` / `AppStickyFilterChrome` /
   `APP_PAGE_STICKY_FILTER_CLASSNAME` (`AppPageStickyChrome` is a compatibility
   alias).
2. **Branch runtime** — `/br/[branchId]/(operator)` layout; compact `AppPage` +
   `AppBottomNav`. Operator home skeleton below.
3. **station_chrome** — POS / KDS / Runner full-screen single-job surfaces.
4. **Standalone chrome-less** — closed set: `/notifications`, `/br` picker.

### B. Shell Composition

Prefer `AppHeader` / `AppBottomNav` for repeated chrome. Branch runtime,
Operations, and employee-lib MUST NOT import control_surface chrome
(`AppShell`, `ControlSurfaceShell`, `resolveControlSurface*`).

### C. Route Home + IA

One capability → one route home. Every protected `page.tsx` resolves to one
MODULE_ACL family and is reachable from nav (or is a declared redirect shim).

### C.1 Record Depth And Row Open

Every LIST row has exactly one **canonical view** and one **address**. Opening
a view changes the URL. Full table: ADR 0018.

- **D2** — DETAIL `{basePath}/{id}` for independent long-running workspaces.
- **D1** — addressable overlay `?<entity>Id=`; Owner Sheet/`AppDialog`, Branch
  bottom Sheet/Drawer at same depth.
- **D1 document** — list-first staged docs (`AppDialog variant="document"`) for
  purchase demand, PO, GRN, Owner/Ops YCH/Transfer fulfillment.
- **D1 task** — non-addressable `FormDialog` / short `AppDialog`.
- **D3** — line-array authoring only; never a row-open view target.
- **D0 queue** — card/decision surfaces; not tabular row-open.

Forbidden: two rendered views; view only in ephemeral state; body click vs
context/long-press to different destinations; `Popover` as record view. Three
doors share one `RowActionItem[]`. Planes declare the same depth.

#### Canonical operator-home skeleton (no KPI)

Branch home uses ONE ordered recipe:

1. **Primary CTA** — next safe action.
2. **Live queue panel** — active work.
3. **Curated job tiles** — next jobs.

Numbers appear as **badges on tiles/sections ONLY** — no KPI/stat cards on
operator surfaces. A landing that opens with a stat-card mosaic is drift.

### D. Navigation Single-Source

Nav is data from `nav-config.ts` via control-surface resolvers. No inline
`ShellNavGroup[]` literals. Active state via `isNavItemActive` only.

### E. Page Padding Authority

Outer pad applied once. `AppPage` is nesting-aware; inside `AppShell` main it
defers pad to the shell boundary.

### F. Page Archetypes

Every `page.tsx` declares exactly one archetype from
`docs/spec/page-archetypes.md`. Mapping gate in `scripts/check-ui-contract.mjs`.

### Enforcement

Runtime guard ownership lives in `scripts/check-ui-contract.mjs`,
`scripts/ui-contract-guard-reporting.mjs`, `scripts/ui-component-registry.mjs`,
and `scripts/ui-contract-scope.mjs`. Run `corepack pnpm audit:ui-components`
for current counts and findings. New runtime roots join report-only first, then
enter `UI_RUNTIME_SOURCE_ROOTS` after debt burns to zero. Exceptions require a
measured outcome and a documented reason — never grandfathered allowlists.

## Loading / Error / Copy (pointers)

- Loading: `PageSkeleton` / `PageSpinner`; KDS/runner use spinner only.
- Error: `ErrorPanel`; not-found: `NotFoundPanel`.
- Copy: Vietnamese default; ladder in `docs/ref/glossary.md` → shared labels →
  messages. Secondary copy budgets: page/section ≤~80 chars; KPI hint ≤~60.
- Toast/notifications: `docs/spec/toast-notification-system.md`.

## Rebuild Rules For Agents

1. Read AGENTS.md, this file, page-archetypes, screen-context-map, modules/ui
   (thin), and targeted regressions.
2. State surface, job, route family, shared components.
3. One route family or one shared-component wave per PR.
4. New patterns update this contract before broad rollout.
5. Complete only when `pnpm typecheck && pnpm lint && pnpm build` pass; no fake
   primitives, arbitrary dimensions, route theme layers, or vocabulary drift.
