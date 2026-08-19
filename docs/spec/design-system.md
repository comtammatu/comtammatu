# Má Tư Design System

> Status: source of truth for the Má Tư visual language and UI assembly
> contract. One system, one token set, one CSS entry.

## Decision Index

- [System Name And Authority](#system-name-and-authority)
- [Artifact Ladder](#artifact-ladder)
- [Naming Standard](#naming-standard)
- [Base UI Rule](#base-ui-rule)
- [Product Dual Thesis](#product-dual-thesis)
- [Token Contract](#token-contract)
- [Color Usage](#color-usage)
- [Contrast Targets (WCAG)](#contrast-targets-wcag)
- [Typography Contract](#typography-contract)
- [Rhythm Contract](#rhythm-contract)
- [Elevation / Shadow](#elevation--shadow)
- [Component Authority](#component-authority)
- [Surface Contracts](#surface-contracts)
- [Layout UI/UX Frame](#layout-uiux-frame)
- [Structural Governance](#structural-governance)
- [Loading / Error / Not-found Frame](#loading--error--not-found-frame)
- [Copy Contract](#copy-contract)
- [Enforcement](#enforcement)

## System Name And Authority

The design system is the **Má Tư Design System**. There is no second name, no
version badge, no theme-product label, and no external design mirror. Any other
system name found in code, comments, or docs is drift and must be removed.

Runtime bindings:

| Concern | Owner |
| --- | --- |
| Token values, utilities, keyframes | `packages/ui/src/styles/globals.css` (**the only CSS entry**) |
| Headless behavior, a11y, focus, layering | Base UI (`@base-ui/react`) |
| Styled shared components | `packages/ui/src/components/*` |
| App adapters (plane-specific roles) | `apps/web/app/components/*` and approved domain adapter families |
| Workflow composition | `docs/spec/page-archetypes.md` + target route |
| Implementation guide, adapter map | `docs/modules/ui.md` |
| Agent workflow | `docs/agent/rules/ui.md` |
| Product copy | `docs/ref/glossary.md`, `packages/shared/src/labels/vi.ts`, `@comtammatu/shared/messages` |
| Proof | guards, focused tests, browser evidence |

Má Tư DS runtime = single CSS entry `packages/ui/src/styles/globals.css` +
shared component source: `packages/ui/src/components/*` + app adapters under
`apps/web/app/components/*`. Nothing else may declare itself the design system.
No `ds.css`, per-route `theme.css`, or parallel token namespace.

Resolve every decision at the concern that owns it. A lower layer never
overrides a higher authority; a higher layer reuses the lower implementation
before adding anything new. Shadcn and the Web Interface Guidelines are
comparison inputs for anatomy, states, and accessibility — never a token source,
preset, or visual authority. Agents preserve this unless the task asks to change
the design system itself.

## Artifact Ladder

```text
Guideline → Base UI primitive → packages/ui Component → App adapter
          → UI Block recipe → Page archetype → Screen
```

| Layer | Owner | Job |
| --- | --- | --- |
| Guideline | this file + `docs/ref/screen-context-map.md` | visual language, actor, job, information boundary |
| Base UI primitive | `@base-ui/react` | headless behavior, semantics, focus, keyboard, layering |
| Component | `packages/ui/src/components/*` | one styled, reusable Má Tư unit |
| App adapter | `apps/web/app/components/*`, approved domain families | translate components into a plane-specific semantic role |
| UI Block recipe | `UI_BLOCK_REGISTRY` in `scripts/ui-component-registry.mjs` | name a proven composition; metadata only |
| Page archetype | `docs/spec/page-archetypes.md` | route-level workflow recipe and state model |
| Screen | target route | bind real data, authority, copy, actions, recovery to one URL |

Delivery flow:

```text
screen context and user job → UI Advisor Gate → page archetype
→ registered UI block when one fits → registered adapters and components
→ route implementation → responsive, accessibility, and runtime verification
```

A UI block is recipe metadata, never a `blocks/` directory and never an
importable `*Block` component. Add a recipe only when two real consumers share
the composition, or when a named critical workflow needs one approved exemplar.
When a composition becomes reusable code, promote it to a registered **adapter**
and point the block `use` field at that adapter. If no block fits, follow the
archetype and compose existing adapters behind a route-scoped owner.

Lookup before composition:

```bash
corepack pnpm audit:ui-components --component <component-or-block>
```

## Naming Standard

**Tokens.** Semantic `--kebab-case` CSS variables only (`--background`,
`--primary`, `--muted-foreground`, `--effect-popover`, `--motion-*`). No
parallel alias for a token that already exists, no external DS token names, no
per-module ramp.

**Files and exports.** `kebab-case.tsx` file ↔ PascalCase export
(`app-page.tsx` → `AppPage`). UI block recipe ids stay kebab-case metadata.

**Adapter prefixes.** Product Dual Thesis drives the prefix:

| Prefix | Plane | Examples |
| --- | --- | --- |
| `App*` | `Quản lý hệ thống` (`control_surface`) | `AppPage`, `AppSection`, `AppToolbar`, `AppListFrame` |
| `BranchOperator*` | `Vận hành bán hàng` (`branch_surface`) | `BranchOperatorPage`, `BranchOperatorPanel` |
| `Station*` | `station_chrome` (POS / KDS / Runner) | `StationSection` |
| `Employee*` | Employee/staff-runtime half | `EmployeePage`, `EmployeePanel` |
| `Public*` | Guest / system-gate sections | `PublicSection` |
| (none) | Shared primitives in `packages/ui` | `Button`, `Card`, `Frame` |

`AppPage` and `AppEmptyState` remain chrome-less adapters allowed on public
and system-gate surfaces; card sections on those planes use `PublicSection`.

**Suffixes** carry one job each:

| Suffix | Job |
| --- | --- |
| `Shell` | Owns navigation chrome only (sidebar / header / bottom-nav) |
| `Page` | Route content rhythm (width, padding, scroll) — not chrome |
| `Section` | Card-backed region — `AppSection` on `control_surface`, `StationSection` on `station_chrome`, `PublicSection` on public/system-gate |
| `Panel` | Same job inside `BranchOperator*` / `Employee*` families |
| `Toolbar` / `Footer` / `Grid` / `Row` | Slots, not page roots |
| `Client` / `Presenter` | Route-local binding; promote to adapter before registry |

**Frame law.** `Frame` is the inset primitive in
`packages/ui/src/components/frame.tsx` — a layout-free bordered box
(`rounded-md border bg-card`, no flex/gap/padding) whose caller owns content
flow. The name is reserved for that primitive. Workflow wrappers keep their
existing `App*` + descriptive-suffix names (`AppListFrame`, `DocumentFormFrame`,
`SettingsPageFrame`): they are legal `App*` adapters. Prose must not call them a
"Frame role", and no new component may introduce a local `Frame` prop or type
alias that competes with the primitive.

**Forbidden.** `Owner*`, `Ops*`, `Management*`, `Ds*`, `Matu*` as component or
plane prefixes; importable `*Block` components; a root `DESIGN.md`; a third
page-kit family beside `App*` / `BranchOperator*` / `Employee*` without an ADR.

## Base UI Rule

Base UI is the **only** headless layer. Every interaction, focus, dismissal,
portal, and keyboard behavior in `packages/ui` comes from `@base-ui/react`.
There is no hybrid headless layer, no hand-rolled focus trap, roving tabindex,
or dismiss manager living beside it.

- Only `packages/ui` may import `@base-ui/react`; app code imports
  `@comtammatu/ui`.
- Never replace a Base UI wrapper with raw DOM "to simplify". Restyle the
  wrapper instead.
- A new interactive primitive starts from the Base UI equivalent. If none
  exists, it needs an entry in the exception list below.

**Exceptions (closed list).** Each one exists because Base UI ships no
equivalent primitive, not because hand-rolling was convenient:

| Component | Reason |
| --- | --- |
| `sonner.tsx` | Base UI has no toast primitive; Sonner owns toast behavior. Guest/preset CSS stays an app concern. |
| `calendar.tsx` | DayPicker is a third-party domain widget, not a headless gap. |

`slider.tsx` uses the Base UI Slider. A primitive with zero runtime consumers is
drift, not coverage: `resizable.tsx`, `tag-input.tsx`, `stat.tsx`,
`accordion.tsx`, `date-picker.tsx`, and `pagination.tsx` (with
`lib/pagination.ts`) are retired. `Collapsible`, `Calendar` +
`BusinessDateField`, `KpiCard`, and `DataTablePagination` own those jobs. The
gate that keeps this true is the orphan-primitive check in
`apps/web/tests/ui-design-system-primitives.test.ts`.

Adding an exception requires a row in the table above in the same change set.

## Product Dual Thesis

Two product halves (see `docs/spec/architecture.md` § Product Dual Thesis):

- **`Quản lý hệ thống`** (`control_surface`) — dense management: tables, filters,
  documents, review states. Adapters: `App*`.
- **`Vận hành bán hàng`** (`branch_surface` + `station_chrome`) — touch-first
  shift work and live queues (POS/KDS/Runner). Adapters: `BranchOperator*` /
  station.

**Density note:** both halves share **one token set, one type scale, one status
vocabulary**. Only density and chrome differ — `AppPage density="compact"` /
`Card size="sm"` for dense management, `size="touch"` / `"touch-lg"` control
sizes for shift work. Never fork tokens, fonts, or status colors per half, and
never collapse the two halves into one dashboard shell.

Surface priorities:

- POS and KDS are frontline tools: the first viewport exposes the next safe
  action or the live queue.
- `control_surface` routes prioritize tables, filters, forms, and review states
  over decorative summary chrome.
- Inventory surfaces are workflow-first: pending tasks, required documents, and
  exceptions before analytics.
- Employee surfaces are lightweight task portals — narrow, direct, consistent
  with the shared shell.

Visual tone: rice-cream foundation, terracotta primary action, deep navy text,
warm rice-yellow accents, restrained borders, semantic status colors, strong
spacing discipline.

## Token Contract

Allowed token families:

- Surface: `background`, `foreground`, `card`, `popover`, `muted`, `accent`,
  `border`, `input`, `ring`
- Action: `primary`, `secondary`, `destructive`
- State: `success`, `warning`, `info`, `destructive`
- Tier: `tier-elite`, `tier-note` (trust/variance/waste tier badges only)
- Data: `chart-1` … `chart-5`
- Navigation: `sidebar-*`
- Depth: `--effect-*`; Motion: `--motion-*` / `--ease-*`
- Radius: the documented radius tier tokens only
- Typography: the runtime font variables from `apps/web/app/layout.tsx` and
  `globals.css`

Brand mapping: `background` = `kem gạo`; `foreground` = `xanh đậm`; `primary` =
`đỏ gạch`; `ring` / chart accent = `vàng gạo`; `success` = `xanh lá dịu`;
`muted-foreground` = `nâu gỗ` or `xám ấm` by theme.

### Theme runtime

- Two modes: `light` (day shift, default) and `night` (warm-dark `gạo cháy`).
  `night` maps to the `.dark` selector so `dark:` variants and the chart THEMES
  map resolve. Every semantic token ships a `:root` + `.dark` pair.
- `packages/ui/src/components/theme-script.tsx` applies the class before
  hydration: it reads the theme cookie (`light` | `night`) and otherwise falls
  back to local hour (`night` for 18:00–06:00). It must not depend on
  `prefers-color-scheme` or `matchMedia` — the shift-aware decision is
  timezone-stable and OS-preference-independent.
- `packages/ui/src/components/theme-provider.tsx` is the only runtime theme
  state provider; `setTheme` writes the cookie (SameSite=Lax, 1-year max-age).
  Theme is the only browser-stored UI preference — scope, branch, workflow, and
  auth state stay in the URL or the session.
- One toggle: `ThemeToggle` (`apps/web/app/components/theme-toggle.tsx`) mounted
  in `AppHeader`, the operations PWA toolbar, the employee header, and the guest
  self-order header. No second theme context, route-local toggle, or
  localStorage theme key.

### Approved project utilities

- `max-h-dvh-95` and `max-h-dvh-80` are bottom-sheet height utilities for mobile
  dynamic viewport constraints.
- `pos-text-overlay` is limited to text over POS menu item photos.
- `pos-safe-bottom` is limited to POS PWA floating bottom bars.
- `workflow-safe-pb` is limited to public workflow fixed action bars and
  bottom-sheet footers above a mobile home indicator; `workflow-safe-pt`
  protects public workflow headers below standalone-PWA status chrome.
- `chrome-safe-pt` / `chrome-safe-pb` / `chrome-safe-top` are limited to app
  shell roots and fixed or sticky chrome affected by mobile safe areas.
- `chrome-tap` disables the mobile tap-highlight/callout flash on app chrome; do
  not apply it to data content that must stay selectable.
- `no-scrollbar` hides scrollbars on horizontally scrolling chrome rails without
  disabling scroll.
- `brand-pattern-caro` / `brand-pattern-hat-gao` / `brand-pattern-vong-to` and
  `brand-strip` are decorative footer strips, packaging trim, or section
  separators — never a background behind body text.
- `mascot-cotlet` + `animate-cotlet-idle` / `animate-cotlet-waiting` /
  `animate-cotlet-waving` render the `Cốt Lết` sprite loops on the pickup idle
  board only, always gated with `motion-safe:`.
- `shadow-effect-*`, `bg-effect-scrim`, and `drawer-scrim` are the depth
  utilities backed by the `--effect-*` family (see § Elevation / Shadow).

Side `SheetContent` owns its own top/bottom safe-area padding; do not put
`chrome-safe-top` on the Sheet close control (its `max(0.5rem, …)` floor drops
the X below `SheetTitle` on zero-inset viewports — use
`top-[env(safe-area-inset-top,0px)]`). Side sheets are full width below `sm`;
desktop default is `size="lg"`, focused entry/action tasks use `size="md"`.

The global skip link targets exactly one rendered `#main-content` landmark per
route plane, keeping `tabIndex={-1}` so fragment navigation also moves focus.

Safe-area utilities are load-bearing and pinned by static tests. Do not delete
them; relocate only with a dedicated home and a passing gate.

New utilities require a design-system update first; prefer shared-component
props or app adapters when the pattern is reusable.

### Tint Opacity Scale

| Step | Opacity | Role |
| --- | --- | --- |
| `fill` | `/10` | Default status-surface tint (`bg-warning/10`) |
| `fill-strong` | `/15` | Callout / emphasis surface |
| `hairline-border` | `/20` | Hairline border or ring on a tint |

Applies to `(bg|border|ring|text|fill|stroke)-(warning|success|destructive|info|primary|accent|secondary)`.
Neutral muted fills prefer `/30` or `/50`. Solid status backgrounds start from
the bare token (`bg-success`); another opacity is valid when it has a semantic
role and preserves contrast in both themes.

Any bordered/rounded `div` carrying a status tint MUST route through `Alert`
(icon + message + action) or `NoteCallout` (labeled note). The canonical warning
callout is `NoteCallout tone="warning"` (`bg-warning/15`, no border). No
hand-rolled tinted callout chrome.

### Forbidden for new app UI

- Parallel Tailwind token namespaces outside this semantic contract.
- Custom font variables or font utilities outside `font-sans`, `font-heading`,
  `font-mono`.
- Custom radius or spacing variable namespaces.
- External DS token names copied from outside this repo.
- Raw palette classes for status meaning (`amber`, `emerald`, `zinc`, …) when a
  semantic token exists.
- Arbitrary dimensions (`text-[10px]`, `w-[200px]`, `h-[3rem]`).
- Static inline styles for presentation; per-route `theme.css`; one-off module
  color ramps; viewport-width type scaling; page wrappers overriding a shared
  component's radius, color, focus, or disabled behavior.

**Sanctioned inline-style exception:** `apps/web/app/global-error.tsx` is the
single file allowed to use inline `style`, because root CSS may not have loaded
when it renders. Its hex literals must still read as Má Tư (`kem gạo` background,
`xanh đậm` text, a muted supporting tone) and its retry control keeps the 44px
minimum touch target.

A genuinely new token is added to `globals.css`, documented here, and checked
against `tasks/regressions.md`.

## Color Usage

Terracotta (`primary`) is the **action** color, not a status color. Dual Thesis
halves share this map; density and chrome may differ, hues must not.

| Role | Token | Use | Forbidden |
| --- | --- | --- | --- |
| Primary CTA | `primary` | Exactly one solid primary control per view state | Status badges, large fills, decorative chrome |
| Safe secondary | `secondary` / `outline` / `ghost` | Cancel, back, extra actions | Destructive work |
| Destructive | `destructive` | Delete, void, reject, refund | Brand chrome, primary CTA |
| Done | `success` | Ready, approved, paid, printed | In-progress / waiting-on-person |
| Needs a person | `warning` | Pending review, risk, match needed | Hard-blocked failure |
| In flight | `info` | Sent, in transit, processing | Body text (must stay distinct from `foreground`) |
| Neutral | `secondary` / `outline` | Draft, history, metadata | Work that needs action now |
| Focus / trim | `ring` / `accent` | Focus ring, rice-yellow trim | Workflow meaning |
| Series | `chart-1` … `chart-5` | Charts only | Status on a row |

Dosage: status uses tint `/10` or `/15` plus token ink — never a solid
`primary` fill. `Badge variant="default"` is metadata or a CTA chip, not
workflow state (`StatusBadge`). Color is never the only cue. Light
`destructive` must not share the brick hue with `primary`; light `info` must
not equal `foreground`.

## Contrast Targets (WCAG)

One token set for both halves. Non-text UI (borders, cards, focus rings) meets
**WCAG 1.4.11** (≥3:1 against the adjacent background); text stays AA (≥4.5:1
for body).

| Pair (light) | Target |
| --- | --- |
| `foreground` / `background` | ≥4.5:1 |
| `muted-foreground` / `background` and `/muted` | ≥4.5:1 |
| `border` / `input` vs `background` | ≥3:1 |
| `ring` / `background` | ≥3:1 |
| `card` / `background` | Visible hierarchy — prefer a border when `ΔL` is small |
| `destructive` / `background` | Distinct hue from `primary` (~25 vs ~33); ≥4.5:1 for destructive text |
| `info` / `background` | Distinct from `foreground`; ≥4.5:1 for info text |

| Pair (night `.dark`) | Target |
| --- | --- |
| `card` / `popover` / `sidebar` vs `background` | Clear lift; raise card L before adding decorative shadow |
| Borders (alpha on cream) | Readable hairlines; strengthen alpha if cards merge |

Prefer contrast fixes over spacing-only "fixes", and re-check rendered
screenshots after any token tune.

## Typography Contract

`apps/web/app/layout.tsx` loads `GeistSans` and `GeistMono` through the `geist`
package (self-hosted, full Vietnamese coverage, offline). `globals.css` maps
those variables into Tailwind utilities.

| Purpose | Utility / variable | Font |
| --- | --- | --- |
| Body / content | `font-sans` / `--font-sans` | Geist |
| Headings / titles | `font-heading` / `--font-heading` | Geist |
| Operational data | `font-mono` / `--font-mono` | Geist Mono |

- `globals.css` binds `--font-sans` and `--font-heading` to `--font-geist-sans`,
  and `--font-mono` to `--font-geist-mono`. App code consumes only the three
  utilities.
- Root rem baseline: `html { font-size: 17px }` in `globals.css` `@layer base`
  (intentional runtime; all rem-derived type and spacing scale from this).
- Route/page headings, card, dialog, sheet, and section titles, and brand lockup
  text use `font-heading` unless a shared component already applies it.
- `font-mono` is for tabular operational data: IDs, codes, order/receipt
  numbers, prices, quantities, timestamps, audit hashes.
- Do not reintroduce `Inter`, `Montserrat`, `JetBrains Mono`, system-only
  stacks, or route-specific `font-family`. Typography runtime owners:
  `layout.tsx`, `globals.css`, this file, `docs/modules/ui.md`.

Brand assets render through `BrandMark` / `BrandLockup` / `BrandSymbol` /
`BrandMascot` — never a direct `/brand/*` path from a route component.
`BrandSymbol` is approved as decorative, static `EmptyMedia` content on any
`AppEmptyState` via the adapter's `symbol` prop; it carries no motion.

## Rhythm Contract

The Token Contract locks **what** values exist; this section locks **when** to
use which. A module that needs to deviate updates this contract, not one page.

### A. Spacing

| Slot | Value | Source |
| --- | --- | --- |
| Page outer padding | `p-4` default, `p-3` compact | `AppPage` |
| Card inner | `p-4` default, `p-3` at `size="sm"` | `Card` |
| LIST flush card | `py-0` (untitled) / `pb-0` (titled); edges `rounded-t-lg` / `rounded-b-lg` | `AppListFrame` (Card stays `overflow-visible` for sticky bleed / Select) |
| Item-row LIST inset | `px-3 py-3` + `gap-2` between rows | Dual Thesis: table/grid stays flush; Item cards inset under toolbar (`DataTable` mobile stack, or bare `ItemGroup` with the same pad) |
| Toolbar inner | `px-3 py-2` inline; Card `size="sm"` pad otherwise | `AppToolbar` |
| Table column header height | `h-8` | `TableHead` |
| DataTable pagination | `px-3 py-2` | `DataTablePagination` |
| Section vertical gap | `gap-4` default, `gap-3` compact | `AppPage` |
| Within-section gap | `gap-2` | Inline rows, form fields |
| Compact chip gap | `gap-1.5` | Filter chips, badge clusters |
| Tight icon-label gap | `gap-1` | Icon + 1–2 word label |

These are default recipes, not a static allowlist. Use the smallest named token
that preserves hierarchy, touch targets, and scanability. `AppPage` owns outer
rhythm and `Card` owns inner rhythm; route-local composition may differ for a
distinct workflow, reviewed by rendered density rather than utility strings.

`AppPage mobile` constrains content to the public workflow width. Public
workflow chrome is in-flow (`shrink-0`, opaque `bg-background`) outside the
single scrollport (`workflow-safe-pt` / `workflow-safe-pb`); do not overlay with `fixed`/`sticky` + `bg-*/95` `backdrop-blur`.

Use `CardContent flush` for table-edge or list-edge alignment and
`CardContent scroll` for a horizontally scrolling table instead of overriding
card padding with route-local utility strings.

### B. Heading Scale (locked per role)

| Role | Class | Source |
| --- | --- | --- |
| Page H1 | `font-heading text-xl sm:text-2xl font-semibold tracking-tight` | `AppPageHeader` |
| Section title | `font-heading text-base font-semibold` | `CardTitle` |
| Sub-section / list head | `font-heading text-sm font-semibold` | `Item` title slot |
| Page-header eyebrow | `text-xs font-medium uppercase tracking-wide` | `AppPageHeader.eyebrow` |
| Panel / field / section label | `text-xs font-medium uppercase tracking-wide text-muted-foreground` | `SectionLabel` (`density="dense"` → `text-2xs … tracking-wider`) |
| Table column header | `text-xs font-medium uppercase tracking-wider text-muted-foreground` | `TableHead` |
| KDS kitchen item-name | `text-lg font-semibold leading-6 xl:text-xl xl:leading-6` | KDS ticket |
| Numeric input echo | `text-3xl font-semibold tabular-nums` | Number pad, scale display |
| Runner board header / row / footer / empty secondary | `text-runner-header` / `text-runner-board` / `text-runner-footer` / `text-runner-empty-secondary` + `font-semibold` | Height-responsive display tokens |
| Display call target | `font-mono text-6xl sm:text-7xl lg:text-8xl font-semibold tabular-nums` | Customer-facing pickup / queue display only |

- `text-4xl` / `text-5xl` are not allowed in app surfaces (marketing/login splash
  only). `text-3xl` is reserved for the numeric-echo role and must pair with
  `tabular-nums`. `text-3xs` is for SVG axis labels and dense table micro-meta.
- Display call targets are an operational display role, not headings; the value
  must be stable (`table_number`, `order_number` / `kitchen_ticket_number`),
  never a render index.
- Runner/KDS customer boards use one responsive semantic grid, never duplicate
  mobile and desktop markup. Below `sm` the four fields form a 2x2 grid; from
  `sm` keep `Đơn` `col-span-4`, `Số món` `col-span-3`, `Trạng thái` `col-span-4`,
  `Chờ` `col-span-1`. Runner display tokens scale with `dvh`, never viewport width.
  Status cells must not add a separate `text-*` class, so `tailwind-merge`
  cannot drop the shared row typography.
- Heading weight defaults to `font-semibold`. `font-bold` is reserved for
  receipt totals, print-mode page headers, and the one named exception of POS
  menu item-name over a photo. `font-black` is not allowed.
- On control_surface routes that mount `AppShell`,
  `AppPageHeader.eyebrow` MUST NOT repeat the primary sidebar module
  label or a synonym of it — the sidebar and deep nav already own that context.
  Reserve it for real non-module context (site kind, drill-down parent when a
  back link is absent).

### C. Icon Size by Role

| Slot | Class |
| --- | --- |
| Inline badge / chip glyph | `size-3` |
| Button `size="sm"` glyph | `size-3.5` |
| Default (button, link, input affix) | `size-4` |
| Section / card title glyph | `size-5` |
| Page-header eyebrow glyph | `size-6` |
| Empty-state media | `size-8`–`size-12` via `EmptyMedia variant="icon"` |
| Image / document thumbnail | `size-12`–`size-16` with `object-cover` |

`size-7`, `size-9`, `size-11` are not allowed. `size-14` / `size-16` live only
in `EmptyMedia`, brand lockup, splash imagery, or thumbnails. Hero glyphs
compose `EmptyMedia` or a shared component, never a free-style `size-12` inside
a card.

### D. Height Scale (lock to shared components)

`Button` is the single source of truth for button height.

| Variant | Min height | When |
| --- | --- | --- |
| `xs` / `sm` | `h-6` / `h-7` | Inline metadata actions; compact toolbars, dialog footers |
| `default` / `lg` | `h-8` / `h-9` | Standard CTA; primary CTA, page-header action |
| `field` | `h-10` | Composite form trigger only (`form/*` date/combobox/multi-select) |
| `touch` / `touch-lg` | `min-h-12` / `min-h-14` | Mobile touch button; hero CTA / mobile action bar (WCAG 2.5.5) |
| `icon-xs` … `icon-lg` | `size-6` … `size-9` | Icon-only tiers |
| `icon-touch` | `size-12` | Icon-only 48px touch target |
| `tile` | `min-h-32`→`min-h-44` | Oversized selectable tile (POS table-gate) |

Fixed heights `h-10`, `h-11`, `h-12`, `h-14`, `h-16` must not be applied to a
`<button>`, `<Link>`, or `<Button>` acting as a button; `min-h-12` / `min-h-14`
must come from the `touch` variants. Never fake a button with
`<button className="min-h-12 …">`. A new touch tier is added once to the owning
primitive and consumed through `size=` — this is how `tile`, `icon-touch`, the
`Toggle` / `ToggleGroup` touch sizes, `TabsList size="touch"`, and the
`Select` / `Switch` / `Checkbox` / `RadioGroupItem` `touch` sizes were added.

Form controls follow their own table:

| Control role | Below `lg` | `lg`+ | Source |
| --- | --- | --- | --- |
| Bare text / number `Input` | `h-7` | `h-7` | `Input` primitive |
| Responsive form text / number field | `min-h-12` | `h-10` | `form/text-field`, `form/number-field` |
| Responsive select / combobox field and its popup inputs | `min-h-12` | `h-10` | `form/select-field`, `form/combobox-field`, `Combobox` |
| Fixed-density multi-select / date-picker trigger | `h-10` | `h-10` | `form/multi-select-combobox`, `form/business-date-field` |

RHF wrappers default to `controlSize="responsive"` (touch below the 1024px
`OWNER_SHELL_BREAKPOINT` cutover, field above). A touch Combobox propagates
touch density to its popup search input and options. `h-10` / `min-h-12` are
permitted only through these named sizes; do not hand-patch a raw `Input` or
`SelectTrigger`.

On `control_surface` and shared adapters, never hardcode
`size="touch"` / `icon-touch` / `touch-lg` (or the matching `triggerSize` /
`previewSize` / `controlSize` literals). Resolve density with
`useIsMobile(OWNER_SHELL_BREAKPOINT)` or `useFormControlSize` (header primary
CTA: touch|lg; body CTA: touch|default; icon: icon-touch|icon-sm). Hardcoded
touch remains legal on touch-first planes (`branch` / `station_chrome` / `q` /
staff-runtime) and mobile-only chrome (bottom nav, PWA toolbar, number pad).

### E. Radius Scale (4 tiers, 4 tokens)

| Tier | Token | Roles |
| --- | --- | --- |
| Control | `rounded-md` | Input, button, badge, chip, icon box, inset block, callout/Alert |
| Card / page container | `rounded-lg` | Card, Sheet, Dialog, Drawer outer; page containers |
| Pill | `rounded-full` | Avatar, pill badge, truly round icon container |
| Reset | `rounded-none` | Explicit reset only (table cell internals, edge-bleed media) |

### F. Density Modes

`AppPage density="compact"` and `Card size="sm"` are the two switches from
default to dense. Per-module density classes (`*-dense`, `*-tight`) are not
allowed.

### G. Motion Contract

Functional feedback only (loading, enter/exit, focus, state). Prefer
`--motion-*` / `--ease-*`. Gate looping motion with `motion-safe:`. Never
`transition-all`, page-transition, or list-stagger. Animate only `transform`,
`opacity`, `filter`, `color`, and named properties. `hover:scale-*` is forbidden
on ERP surfaces; `active:scale` ≥ `0.97` is allowed on tap targets.

| Job | Recipe | Forbidden |
| --- | --- | --- |
| Press | `active:scale` ≥ `0.97`, `--motion-fast` | `hover:scale-*` |
| Control color / border | `--motion-base`, `--ease-move` | `transition-all` |
| Dialog / menu enter | Base UI `data-[starting-style]`, `--motion-overlay` | `animate-in` keyframes on overlays |
| Sheet / Drawer | `--motion-drawer`, translate on the opening edge | Slide on POS/KDS ticket rows |
| New cart / KDS ticket | one-shot `motion-safe:fade-in` at `duration-150` | List stagger, slide-in |
| Live attention | `motion-safe:animate-pulse` + tint ring on station hot path | Pulse on management LIST |
| Spinner / skeleton | `--motion-spinner` / pulse, always `motion-safe:` | Fake KDS tickets |
| Cotlet mascot | `animate-cotlet-*` on pickup idle only | Mascot on POS / KDS / management |

## Elevation / Shadow

The system is **border-first**: a resting surface separates through `--border`;
elevation communicates a real layering relationship.

| Rung | Utility | Role |
| --- | --- | --- |
| Rest | border | Resting data surfaces |
| Glass/chrome rest | `shadow-effect-card-resting` | Floating translucent chrome only (login glass, `AppBottomNav`) |
| Hover | `shadow-effect-card-hover` | Interactive card adapters on hover |
| Overlay | `shadow-effect-popover` | `popover`, `dropdown-menu`, `select` |
| Modal | `shadow-effect-dialog` | `dialog` content |
| Sheet / Drawer | `shadow-effect-drawer` | `sheet` content, `drawer` panel |
| Tooltip | `shadow-effect-tooltip` | `tooltip` content |
| Toast | `--effect-toast` on `.cn-toast` | Sonner (applied in `globals.css`, no utility class) |
| Sticky CTA | `shadow-lg` | CTAs inside a genuinely sticky/fixed action bar |
| Ceiling | `shadow-xl` / `shadow-2xl` | Only fixed surfaces over scrolling content (POS mobile action bar, KDS focus card, chart tooltip) |
| Overlay scrim | `bg-effect-scrim` / `drawer-scrim` | Dialog/Sheet backdrop; Drawer backdrop (scrim + blur) |

`pos-text-overlay` and `drop-shadow-*` image filters are legibility effects, not
elevation rungs, and must never be reused as surface shadows. Avoid elevation
that implies a false interactive or floating state.

## Component Authority

Base UI is the headless layer; `packages/ui/src/components/*` is the only shared
styled component layer. App-level page, section, toolbar, empty-state, and
link-card composition is centralized in `apps/web/app/components/surface.tsx`
and its plane siblings — adapters, not a second component library.

### Card roles

`Card` is the shared card-role frame (`rounded-lg`). `KpiCard` is only for
numeric/stat values. `Frame` is the layout-free inset surface for a plain
bordered box whose caller owns layout. Other card jobs use `AppSection`,
`AppLinkCard`, `OperationalBoardCard`, `OperationalTile`, `InteractiveCard`,
`DataTable.mobileCardRender`, or a route-scoped adapter that still renders
`Card`.

### Default component routing

| Need | Use |
| --- | --- |
| command/action | `Button`, `Toggle`, `ToggleGroup` |
| business state label | `StatusBadge`; `Badge` for generic metadata |
| framed section/panel | `AppSection` / `StationSection` / `PublicSection` by plane (`BranchOperatorPanel` on operator) |
| navigation card | `AppLinkCard` |
| selectable card-shaped row | `InteractiveCard` with a semantic render target |
| disclosure | `Collapsible` |
| searchable responsive data | `DataTable`; raw `Table` only inside an approved adapter |
| segmented view | `Tabs` |
| standard app form field | helpers from `@/components/form` |
| short detail or list-first document | Overlay chooser (plane-specific) |
| simple destructive confirmation | shared `confirm()`; `ReasonConfirmDialog` when a reason is required |
| overlay (form / D1 / station / touch) | Overlay chooser below |
| empty / no result / error | `AppEmptyState`, `TableEmptyStateRow`, `ErrorPanel`, `NotFoundPanel` |
| loading | `PageSkeleton`, `PageSpinner`, or the approved route wrapper |
| list row | `Item`, `ItemGroup` |
| search/filter shell | `InputGroup`, `Combobox` helpers |
| section/panel/field eyebrow | `SectionLabel` |
| route context | `Sidebar`, `Breadcrumb`, `Separator` |
| keyboard hint | `Kbd`, `KbdGroup` |
| transient feedback | `Sonner` |
| table navigation | `DataTablePagination` |
| filter/action row | `AppToolbar` or `DataTable` toolbar slots |
| metric block | `KpiCard` (numeric/stat values only) |

Toast and durable notification behavior is specified in
`docs/spec/toast-notification-system.md`.

### Date / Calendar chooser

`calendar.tsx` is adapter-only internals. DayPicker is never a month heatmap.

| Job | Use | Forbidden |
| --- | --- | --- |
| Form field (RHF) | `BusinessDateField` | `type="date"`, raw `Calendar` |
| Filter / URL date | `BusinessDatePicker` | Native date input, cloned Popover+Calendar |
| Week / month / year period chrome | Compose `BusinessDatePicker` / `BusinessWeekPicker` + period buttons | Duplicate `dateToBusinessDate` helpers |
| Attendance / Work / roster month board | Named display adapter (`AttendanceMonthGrid`, `WorkMonthGrid`, `RosterWeek`) | DayPicker as a heatmap |

Display `dd/mm/yyyy` via `formatVNBusinessDate`. No `type="date"` exception.

### Button chooser

`Button` is a command. Size comes from named variants or
`ResponsiveActionButton` — never `className` height patches.

| Job | Use | Forbidden |
| --- | --- | --- |
| Command / submit / cancel | `Button` with `size=` | Native `<button>` outside closed exceptions |
| Owner LIST/DETAIL CTA | `ResponsiveActionButton` | `size="touch"` / `icon-touch` / `touch-lg` literals on `control_surface` |
| Form field density | `useFormControlSize` | Hand-patched `h-10` / `min-h-12` on `Button` |
| On/off chip or segmented choice | `Toggle` / `ToggleGroup` | `Button` as a chip |
| Month-board day cell | Inside the board adapter | Page-level `Button` grid |
| Selectable tile | `InteractiveCard` or Branch tile adapter | Raw `<button>` tile |

Native `<button>` only in closed chrome (`global-error`, `sidebar` via
`Button render={<button>}`). One-off `*Button` wrappers must wrap
`ResponsiveActionButton` + dialog and must not restyle.

### Overlay chooser

Job by plane. Same tokens; chrome/density only. Dual-plane forms share schema/action in `lib`; Owner `FormDialog`; Branch `FormSheet`.

| Job | Branch | Owner | Station |
| --- | --- | --- | --- |
| Short create/edit | `AppSheet` bottom, touch | `FormDialog` | `StationSheet` |
| D1 beside LIST | `AppSheet` | `AppSheet` or `AppDialog variant="document"` | `StationSheet` |
| Long workspace | DETAIL (D2) | DETAIL (D2) | not a sheet-as-page |
| Picker | `Popover` / `Select` / `Combobox` | same | same |

Forbidden: raw `Dialog`/`Sheet`/`Drawer` in a route; `FormDialog`/`DataTable` on Branch; `AppSheet`/`AppDialog`/`AppSection` on station; hardcoded `size="touch"` on `control_surface`. `sheet.tsx`/`drawer.tsx` adapter-only.

### List surface and the table system

`Table` is the semantic desktop component; `DataTable`
(`apps/web/app/components/data-table/data-table.tsx`) is the only shared
responsive data-table adapter. They are one system — no `DataTableV2`,
`DesktopTable`, `MobileTable`, or module-specific table wrapper.

| Layer | Owner | Direct route use |
| --- | --- | --- |
| `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableRow`, `TableHead`, `TableCell` | `packages/ui/src/components/table.tsx` | No, except a documented document/line-sheet adapter |
| `DataTable` | `apps/web/app/components/data-table/data-table.tsx` | Yes |
| `DataTablePagination` | `data-table-pagination.tsx` | No |
| `TableEmptyStateRow` | `table-empty-state-row.tsx` | No |
| `AppToolbar` | `surface.tsx` | Yes, as the sibling before `DataTable` |

Responsive list surfaces use `DataTable`: `mobileCardRender` for the phone card
list, `Table` for desktop, `AppEmptyState` / `TableEmptyStateRow` for empty
states, shared pagination. Hand-maintained twin JSX trees (`md:hidden` card list
+ `hidden md:block` table) duplicate state and drift. Mobile and desktop expose
the same fields, status colors, and actions for the same row; `mobileBreakpoint`
changes presentation only, never authority, scope, sorting, or actions.
`hideOnMobile` is not a supported column contract.

`DataTable` has composition recipes, not a runtime `variant` prop: management
LIST (`AppToolbar` → `DataTable` with `mobileCardRender`), document lines
(`render(row, index)` + `desktopFooter` / `mobileFooter`), report breakdown,
local inline table (only when the state is local to that table), and the
Branch-native touch list (`Item` / `ItemGroup`).

Each `DataTableColumn` is an operational field: stable non-empty header (action
columns use a visually hidden `Thao tác`), stable key, one responsibility.
Identity and labels align left; money, counts, dates, and codes align right with
`font-mono tabular-nums`; workflow state stays in its own status column.
`DataTable` does not invent a sort — the route loader supplies the business
order.

Inline-edit document sheets use the same adapter: `render` / `mobileCardRender`
receive `(row, index)` so `patchLine(index)` works without a parallel tree, and
line inputs stay controlled so the breakpoint switch can remount safely.

**Branch touch exception.** A declared Branch-native touch LIST under
`/br/[branchId]/*` may use `Item` / `ItemGroup` at every supported width when
the `control_surface` counterpart owns the dense `DataTable`. Both planes MUST
share the server loader, pure model, status vocabulary, and mutation authority;
Branch must not maintain separate mobile/tablet trees or switch to the
`control_surface` table at tablet landscape. Each exception is named in
`docs/spec/page-archetypes.md` § Named Exceptions.

### Empty / confirm

- Empty states render through `AppEmptyState` (page/section) or
  `TableEmptyStateRow` (inside a `Table`); raw `Empty*` primitives remain
  available to a wrapper with a distinct workflow role.
- One empty treatment per breakpoint — never a panel and a table row stacked on
  the same viewport.
- Simple yes/no destructive confirmation uses `confirm()` from
  `@/components/confirm-dialog` (provider mounted in the root
  layout). Native `window.confirm` / `window.alert` are blocked by the
  `no-native-dialog` gate. A hand-rolled `AlertDialog` stays only for flows that
  collect input (reason, quantity) before confirming.

### Floating layer

Anchored floating surfaces resolve geometry against the viewport, not whichever
ancestor clips. The contract is single-sourced in
`packages/ui/src/lib/floating-layer.ts` for `Select`, `Popover`,
`DropdownMenu`, and `Combobox`:

| Rule | Contract |
| --- | --- |
| Position method | `FLOATING_POSITION_METHOD` (`"fixed"`) |
| Collision boundary | `floatingCollisionBoundary()` (`document.documentElement`, SSR-safe) |
| Portal | Content renders inside the primitive's `Portal` |
| Stacking | Positioner owns `isolate z-50`; callers do not raise `z-index` |
| Elevation | `shadow-effect-popover` |

`clipping-ancestors` is not an accepted boundary — a `Card` or toolbar with
`overflow-hidden` would force the panel to flip over its own trigger. Fixing an
anchored-panel clip with tokens, `z-index`, or ancestor `overflow` at the call
site is drift; correct it at this contract. Adapter-level application notes live
in `docs/modules/ui.md`.

### Status vocabulary

- Labels: `packages/shared/src/labels/vi.ts` (`*_STATUS_LABELS_VI`; keys are the
  DB CHECK vocabulary, never invented states).
- Variant + rendering: `apps/web/app/components/status-badge.tsx`
  (`StatusBadge`, `getStatusBadgeMeta`).
- Unknown values render as the raw key with `outline` — never throw on DB data.
- Intentional exceptions: `pos/_lib/order-status-display.ts` (cashier may
  collapse `new` / `confirmed` / `preparing` as age; kitchen `ready` /
  `served` collapse to the unpaid `order-payment` domain via
  `getStatusBadgeMeta("order-payment", …)` — payment labels, never the
  waiter served `label_vi`), `kds/lib/status-config.ts` (hot path),
  `inventory/_lib/dictionary.ts` + `inventory/_lib/ui.ts`.

### Metric card role

Dashboard and report metric values render through `KpiCard`: uppercase
`text-xs font-medium` label, value `text-2xl font-semibold tabular-nums`,
optional `CompareChip` delta and sparkline, drill-down `href`. This lock applies
only to numeric/stat-value cards — actions, exceptions, documents, people, menu
items, setup tasks, and narrative states are not KPI surfaces.

### Numeric / money cells

| Cell role | Required classes |
| --- | --- |
| Money / quantity / price / rate | `text-right font-mono tabular-nums` |
| ID / code / order / receipt no. | `font-mono tabular-nums` (left align allowed) |
| Right-aligned non-numeric label | `text-right` (no `tabular-nums`) |

Money renders through `formatVND` (`@comtammatu/shared/format`) on
POS/menu/receipt surfaces and `formatAccountingVND` on Finance/VAT/HĐĐT
surfaces (two digits when non-zero; omit `,00`). Accounting entry uses
`MoneyVndInput` / `MoneyVndField`; whole-VND
menu, POS, cash, VietQR, and shift settlement use `WholeVndInput` /
`WholeVndField`. Counts use `formatCount`, quantities `formatQuantity` /
`formatDecimal`, percentages `formatPercent`. Typed drafts use
`parseVietnameseNumericInput`; spreadsheet imports use the stricter
`parseVietnameseNumericImport`. A money cell written as
`text-right tabular-nums` without `font-mono` loses the operational-data role.

Dates and times render through `@comtammatu/shared/time`, which pins
`Asia/Ho_Chi_Minh` so server-rendered receipts and reports never drift.
`BusinessDateField` displays `dd/mm/yyyy` with the `vi` calendar locale; print
rendering uses the same shared helpers under its `print-format-ssot` guard.

### Wrappers

Allowed: data adapters that fetch/map/validate; layout wrappers that arrange
shared components and delegate to the app surface adapters for page, header,
section, toolbar, empty-state, or navigation-card patterns; form wrappers in
`apps/web/app/components/form/`; domain wrappers that still render shared
components.

Forbidden: wrappers that restyle a shared component into a new visual system;
page-specific clones of `Button`, `Badge`, `Card`, `Table`, `Tabs`, `Input`,
`Select`, or of the app page/header/section/toolbar/empty-state/link-card
adapters; compatibility shims for non-current visual systems; helpers named like
`app-*` surface classes; route-local surface replacements.

Direct shared-component composition (`Card`, `Table`, `Dialog`, `AlertDialog`)
is valid for a unique semantic job only after the component lookup shows no
matching adapter, and it must still use Má Tư tokens and prove the relevant
states.

## Surface Contracts

**POS.** Mobile-first. The main area is menu/search and cart creation; the cart
only creates a new order, and post-submit mutations happen through order detail
or history. Session, table, and branch context compact after selection. Payment
and destructive flows require confirmation or safe recovery. POS/KDS must not
introduce hover-only reveal — use visible copy, `NoteCallout`, tap-to-expand
Sheet/Drawer, or multi-line layout.

**KDS.** The live kitchen queue is the primary content. Station, status, and
order-type filters stay compact and immediately reversible. Urgency/status has
one visual source of truth per ticket, using semantic state tokens. Bump and
complete actions need large touch targets and clear focus states.

**control_surface.** Use the shared shell, sidebar, breadcrumb, page heading
rhythm, table/list/detail forms, and empty states. Breadcrumb recovery uses
`AppBackLink` (44px minimum target, visible keyline on focus, accessible name
for icon-only use). Prefer filters plus table/list views over dashboard-card
mosaics; page summaries only when they help decide the next management action.
CRUD dialogs use shared form helpers and Zod 4 schemas.

**Inventory.** Workflow-first: receiving, issuing, transfers, stocktake,
supplier documents, and exceptions before analytics. Keep terms aligned with
`docs/ref/glossary.md`. Dense tables are expected, but row actions and
destructive actions stay visually separated. Route IA stays anchored to three
operator flows: `nhập hàng` (GRN → PO approval → confirm → Finance/AP handoff, ADR
0018), `kiểm soát tồn` (one-warehouse stock, stocktake, count review, waste and
reporting), and `sản xuất`/`tiêu hao`. Branch receiving stays supplier-first — no
direct PO creation, PO-first receiving, supplier return, price-QC, lot/expiry,
production order DETAIL, or same-branch warehouse-to-kitchen transfer in daily
UI. Complex Inventory forms use RHF + Zod + app form helpers. Entity audit
history is an inline `Lịch sử` tab filtered by `audit_logs.entity_type` /
`entity_id`. Hide permanently unauthorized actions; show disabled controls with
explanatory copy only for temporary operational blockers.

**Staff runtime.** Keep the surface narrow and task-led. Do not turn
`/br/[branchId]/shift/*` or `/br/[branchId]/profile/*` into a second admin
shell. Use the same typography, tokens, and state vocabulary as the other
planes.

**Layout baseline (all surfaces).** Mobile is the baseline; desktop densifies,
never a different IA. Root viewport must allow zoom. One toolbar per workflow;
never repeat the same state in header, rail, sidebar, gate, and board.

## Layout UI/UX Frame

Composition ladder for every new or rebuilt screen. Frame law stays intact:
`Frame` is the inset primitive; `AppListFrame` / `DocumentFormFrame` stay legal
`App*` adapters.

```text
1. Shell chrome     → § Structural Governance A (exactly one approved family)
2. Page rhythm      → AppPage (+ AppPageHeader): width, padding, scroll, density
3. Section / panel  → plane-correct card region (see Naming Standard prefixes)
4. Toolbar / footer → AppToolbar · AppListFrame toolbar · AppStickyFilterChrome
                      · AppDetailFooter · DocumentFormFrame footer slot
5. Content density  → Dual Thesis density only (same tokens / type / status)
```

Resolve plane → archetype → block → exemplar before composing (Decision Ladder
in `docs/agent/rules/ui.md`; Gate in `docs/spec/page-archetypes.md` § 0.1).
Visible recipes: `/ds-lab` (dev-only). Implementation map + gold paths:
`docs/modules/ui.md`.

### Page rhythm

- `AppPage` owns outer padding, max-width, section gap, and optional footer
  dock. Nesting and shell pad ownership: § Structural Governance E.
- `AppPageHeader` is the page H1 band; it scrolls with content — never a second
  sticky header competing with shell chrome.
- Default gaps/pads: § Rhythm Contract A. Dense management uses
  `density="compact"` (and usually `width="xwide"` on LIST/REPORT); do not invent
  `*-dense` / `*-tight` utility families (§ Rhythm F).

| `AppPage` width | Use |
| --- | --- |
| `narrow` | Staff / public task, single-column form |
| `default` | Standard DETAIL |
| `wide` | Comfortable management DETAIL |
| `xwide` | LIST / REPORT on `control_surface` |
| `full` | Station boards, edge-to-edge |

Sticky stack: at most **two** sticky bands (shell chrome + one filter/footer
band). `AppPageHeader` is not sticky. Do not stack KPI mosaics under a second
sticky filter.

### IA slots (ordered)

One workflow keeps one ordered slot stack. Desktop may densify; it must not
reorder or duplicate slots.

| Slot | Owner | Rule |
| --- | --- | --- |
| Shell nav | Approved chrome family | Sidebar / header / bottom-nav from nav-config — not route-local |
| Page header | `AppPageHeader` | One H1; no module-name eyebrow on `control_surface` |
| Sticky filters | `AppListFrame` toolbar / `AppToolbar sticky` / `AppStickyFilterChrome` | Stick inside shell scrollport only; never above KPI mosaics |
| Body regions | Section / Panel / board cards | Plane-correct prefix; one primary action per state |
| Sticky / docked footer | `AppDetailFooter` / `DocumentFormFrame` / `AppPage footer` | Primary stage action lives here on DETAIL/DOC — not in the header |

### Density by plane

| Plane | Density default | Section / list chrome |
| --- | --- | --- |
| `control_surface` | Compact + `xwide` on management LIST/REPORT | `AppSection` / `AppListFrame` + `DataTable` |
| `branch` (operator) | Touch-first comfortable | `BranchOperator*` panels; no `AppListFrame` / `DataTable` on touch queues |
| `station_chrome` | Board density; full-screen | `StationSection` + `Frame` / `OperationalBoardCard` — no `AppSection` / `AppListFrame` |
| `public` / system-gate | Comfortable, chrome-less | `PublicSection`; `AppPage` / `AppEmptyState` allowed |
| `staff` | Narrow task portal | `EmployeePage` / `EmployeePanel` |

Cross-links: Dual Thesis (§ Product Dual Thesis) · chrome families
(§ Structural Governance A) · archetypes (`page-archetypes.md`) · UI blocks
(`scripts/ui-component-registry.mjs`) · exemplars (`docs/modules/ui.md`).

## Structural Governance

Everything above governs how a surface looks and how agents compose page
rhythm; this section governs which chrome shell mounts, where the route lives,
where navigation comes from, and who owns page padding. Route IA ownership and
role gating live in `docs/spec/role-route-matrix.md`; navigation data is
single-sourced in `packages/shared/src/auth/nav-config.ts`.

### A. Chrome Archetypes (approved families)

Every route mounts exactly one approved chrome family. A new family is a
contract change; route-local chrome outside this list is drift.

1. **control_surface chrome** — the shared `AppShell`
   (`apps/web/app/components/app-shell.tsx`): one multi-group sidebar and one
   top header for L0 routes (`/`, `/inventory`, `/orders`, `/hr`, `/finance`,
   `/menu`, `/branches`, `/settings`, `/feedback`). Primary module tabs render
   first, with the active module's deep nav nested as sub-tabs. Bottom nav shows
   on phone and tablet portrait (`<lg`, `useIsMobile(1024)`); only desktop
   (`≥lg`) uses the fixed sidebar. Scroll: the inset `SidebarInset` card is
   viewport-bounded, the sidebar background and panel frame stay fixed, and only
   the inset content region scrolls. `AppPageHeader` scrolls with page content —
   never sticky outside the scrollport. LIST filters stick to the top of the
   shell scrollport via the `AppListFrame` toolbar slot, `AppToolbar sticky`, or
   `AppStickyFilterChrome`; negative sticky `top` cancels shell pad so the
   filter pins flush to the panel edge, and horizontal pad is cancelled while
   stuck. Do not sticky a page-level filter that sits above KPI/dashboard cards.
2. **Branch runtime chrome** — the branch-scoped operator layout
   (`apps/web/app/(protected)/br/[branchId]/(operator)/layout.tsx`). Covers the
   branch home, `/br/[branchId]/shift/*`, `/br/[branchId]/team/*`,
   `/br/[branchId]/stock/*`, and `/br/[branchId]/settings/*`. It uses shared
   brand components, comfortable `AppPage`, and `AppBottomNav`;
   `branch_management` is a route family inside this chrome, not a reason to
   enter `control_surface` chrome.
3. **station_chrome** — purpose-built, full-screen, single-job surfaces that
   cannot wear the management sidebar: POS, KDS, Runner under
   `/br/[branchId]/*`. Bespoke layout, same tokens, typography, status
   vocabulary, header lockup, and bottom-nav components. Station routes compose
   shared primitives (`StationSection`, `Frame`) and operational adapters; they must not
   import `AppSection`, `AppListFrame`, or other `control_surface` chrome.
   Board recipes: `pos-board`, `realtime-board` (KDS), `runner-board` (pickup / `Gọi số` board). Guest
   feedback at `/r/[token]` is `public`, not the pickup station.
4. **Public** — guest token workflows stay outside `control_surface` chrome.
   Public card sections use `PublicSection`; recipes `public-transaction`,
   `public-feedback`, `system-gate`.
5. **Employee self-service** — `/me/*` is a personal peer route that renders
   inside `control_surface` chrome, with `ControlSurfaceShell` resolving `me` as
   its own module. Content uses `Employee*` (`employee-self-service`); the shell
   is shared, so employee routes never build a second navigation source.
6. **control_surface dense tables** — finance/inventory LIST/REPORT use
   `management-list` / `management-report` (`AppPage` `xwide` + `compact`,
   `AppListFrame` or `AppSection contentFlush`, `DataTable`). Do not revive
   `InventoryListFrame` or `AppPageStickyChrome` aliases.
7. **Standalone chrome-less surfaces** — a named, closed exception:
   `/notifications` and `/br` (the branch picker). Both are reachable from more
   than one plane, so they mount no sidebar, header lockup, or bottom nav; they
   render `AppPage` / `AppPageHeader` only and rely on an explicit in-page back
   link (`returnTo` / role-home). New candidates need an owner decision and a
   name here.

### B. Shell composition

"Shell" means a component that owns chrome (sidebar, header, full-screen frame,
outer padding). `AppShell`, Branch runtime, station_chrome, and public frames
are the reference implementations, not a frozen filename registry.

- Prefer `AppHeader` and `AppBottomNav` for repeated non-sidebar chrome. Create
  another shared chrome composition only when its job cannot be expressed by an
  existing frame and its navigation owner is explicit.
- Branch runtime, station, and employee surfaces MUST NOT import or render
  `control_surface` chrome themselves (`AppShell`, `ControlSurfaceShell`,
  `resolveControlSurface*`, `control-surface-nav`). They use the approved
  operator chrome, shared `AppHeader` / `AppBottomNav`, `EmployeePage`, or an
  `embedded` branch of the canonical `PageContent`. `/me/*` is the one surface
  that sits under the shared `(protected)` layout (§ A.5): the layout owns the
  chrome, the route contributes `Employee*` content only and never imports a
  shell.
- File naming and the use of `<main>` or `SidebarProvider` are implementation
  details, not CI policy. Verify the rendered navigation source, responsive IA,
  and plane boundary instead.

### C. Route home + IA

- One capability has exactly one route home, defined in
  `docs/spec/role-route-matrix.md`. A second page rendering another family's
  client is drift, and a route that loses its home must not keep a stub.
- Every `(protected)/**/page.tsx` resolves to exactly one route family and is
  reachable from at least one navigation entry. Orphan routes are drift: wire
  nav or delete, after confirming there is no dynamic-only entry.
- Gate: a route-manifest reachability check asserts each page resolves via
  `module-acl` to one family, each navigable leaf has an inbound nav entry, and
  no two nav items in a shell share an `href`.

### C.1 Record Depth And Row Open

Every LIST row represents a record. A record has exactly one **canonical view**
and exactly one **address** for that view. Opening a record view always changes
the URL. Tasks that end (short CRUD, confirm) are not views and are not
addressable. Full decision table: ADR 0018.

- **D2 (independent workspace)** — DETAIL route `{basePath}/{id}`; row click
  navigates there. For long-running sessions such as stocktake.
- **D1 (addressable overlay)** — no DETAIL route; the view opens bound to one
  list query parameter (`?<entity>Id=`), hydrated from the server on first load
  and cleared on close. Row open uses `router.push`; mode change and close use
  `router.replace`. `control_surface` may use a side `Sheet` or `AppDialog`;
  Branch may use a bottom `Sheet` / `Drawer` at the same depth.
- **D1 document** — a list-first staged document may render lines and a
  state-transition footer in `AppDialog variant="document"` when each state
  exposes exactly one primary action. Named tier: purchase demand, PO, GRN,
  production, and the YCH/Transfer fulfillment journey.
- **D1 task (non-addressable)** — Overlay chooser: Owner `FormDialog` / short
  `AppDialog`; Branch `AppSheet`; station `StationSheet`.
- **D3** — line-array authoring only; never a row-open target.
- **D0 queue** — named card/decision surfaces where the card is the work, not a
  tabular row open; chrome is `AppPage` + `AppSection` decision cards.

A record escalates from D1 to D2 when it becomes an independent, long-running
workspace, or when a state requires more than one primary action. A line array
or stage footer alone does not escalate an approved D1 document; recipes that
stay D1 task escalate when BOM lines **> 12** to `AppSheet` `?recipeSpecId=` (ADR 0018 **C3**).

**Forbidden:** a record with two rendered views (a legacy DETAIL redirect is
allowed); a record view reachable only from ephemeral component state; a row
whose body click and context/long-press lead to different destinations;
`Popover` as a record view.

**Three doors** share one `RowActionItem[]`: row body, `RowActionsMenu` action
cell, and `renderRowContextMenu`. Context menu is additive only. Zero-action
LIST rows are legal when the row body alone is the view path (ADR 0018 **C4**).

**Planes:** `control_surface` and Branch declare the same depth for the same
record and may use different frames at that depth. A depth mismatch is drift.

#### Canonical operator-home skeleton (no KPI)

The Branch home — the only branch home kind — uses one ordered recipe: primary
CTA (the single next safe action) → live queue panel → curated job tiles. The
recipe varies only in which slots and data populate it, never in structure.
Numbers appear as badges on tiles or sections only; `KpiCard`, `KpiRow`, and
stat-card mosaics never render on an operator surface. A landing that opens with
a stat-card mosaic instead of that order is drift.

One named exception: the manager-only revenue-target strip
(`branch-revenue-target-strip.tsx`) sits between shift status and the queue as a
`BranchOperatorPanel`, not a card mosaic, and is hidden from cashier, chef, and
branch staff. Audience and placement are owned by `docs/ref/screen-context-map.md`
§ 2.4; this section owns only the component role. A new exception needs a row
here in the same change set.

### D. Navigation single-source

- Navigation is data, not per-shell code. Every `control_surface` route renders
  the same primary tabs from `resolveControlSurfacePrimaryTabs`
  (`apps/web/app/lib/control-surface-nav.ts`, projected from
  `packages/shared/src/auth/nav-config.ts`); deep nav comes from
  `resolveControlSurfaceDeepNav`. Inline `ShellNavGroup[]` literals inside a
  shell are forbidden (gate `nav-shell-inline-literal`).
- Sidebar and bottom nav render from the same resolved model for a role; they
  may differ in density and item count, never in membership source.
- Active-state matching uses the single `isNavItemActive` helper
  (`apps/web/app/lib/shell-primitives.ts`).
- A Stage-0 `nav-acl` check asserts every rendered nav `href` resolves to a
  known `MODULE_ACL` path and that nav-config covers the matrix families.

### E. Page padding authority

- Outer page padding is applied once and does not compound. `AppPage` supplies
  the default scale and is nesting-aware.
- `control_surface` frame padding is applied once by `AppShell` `<main>`;
  `AppPage` defers through `AppShellPaddingBoundary`. An `AppPage` inside
  `AppShell` main drops its own padding but keeps its centered max-width; an
  `AppPage` inside another `AppPage` drops both; a standalone `AppPage`
  (operator, employee, public) applies both.
- The control_surface scroll root uses `data-control-surface-scroll`. Sticky
  filter chrome bleeds against that scrollport; `AppPageHeader` scrolls with
  page content and must not become a second sticky header competing with shell
  chrome.
- A page may compose local padding or width when the workflow needs it; review
  the rendered outer edge rather than enforcing a class-string allowlist.

### F. Page archetypes

Every `apps/web/app/**/page.tsx` renders exactly one page archetype — a shared
recipe for layout skeleton, data-display idiom, states, and shared
status/money/date/navigation vocabulary. The taxonomy and per-archetype recipes
live in `docs/spec/page-archetypes.md`, a subordinate contract under this file
(on conflict, this file wins). A new archetype is a contract change here first.
Enforcement is a mapping-presence gate: every route page must be declared with a
valid archetype id in `scripts/page-archetypes.mjs`, and an undeclared page
fails CI pointing at the spec. Public customer transactions use
`PUBLIC-WORKFLOW`; offline/pre-context screens use `GATE/AUTH`.

## Loading / Error / Not-found Frame

Route-level transition states are part of the design system, not per-page
improvisation.

- `loading.tsx` is built from `PageSkeleton` / `PageSpinner`
  (`apps/web/app/components/page-skeleton.tsx`). POS keeps its purpose-built
  `PosPageSkeleton`. KDS, pickup, and other realtime boards use `PageSpinner` —
  fake tickets on an operational screen are forbidden.
- `error.tsx` delegates to `ErrorPanel`
  (`apps/web/app/components/error-panel.tsx`): `AppEmptyState mode="error"` with
  retry via `reset()` as the sole primary action at `size="touch"`. Sign-out is
  not a peer of retry — `ErrorPanel` renders it only under the opt-in
  `allowSignOut` prop at subordinate weight, and only the app-wide boundary
  enables it, so a mis-tap cannot end a session mid-service.
  `apps/web/app/global-error.tsx` is the single inline-style surface (see
  § Token Contract) and keeps the 44px minimum touch target.
- Not-found renders through `NotFoundPanel`; per-family `not-found.tsx` exists
  only where `notFound()` is called and a shell is worth preserving.
- Copy comes from `@comtammatu/shared/messages` (`ACTIONS_VI`, `STATES_VI`,
  `ERRORS_VI`); do not inline new Vietnamese strings.

## Copy Contract

- Internal UI copy is Vietnamese by default. Keep established acronyms: `POS`,
  `KDS`, `GRN`, `WAC`. Do not show `tenant` in product UI. Do not introduce new
  synonyms for business states or workflow objects.
- Copy source ladder: glossary spelling → `packages/shared/src/labels/vi.ts` →
  `@comtammatu/shared/messages` → `apps/web/lib/messages/*`. Denylist terms live
  in the glossary — do not duplicate those tables here.
- Verb lexicon (reuse, do not synonym): `Lưu` / `Tạo` / `Xác nhận` / `Hủy` /
  `Xóa {object}` / `Duyệt` / `Từ chối` / `Thanh toán`.
- Toast formula: success `Đã X`; failure `Không thể X`. Severity and routing
  stay in `docs/spec/toast-notification-system.md`.
- Utility copy beats marketing copy. Secondary budget: page / `AppSection`
  description ≈ one idea, ≤ ~80 characters; KPI or field hint ≤ ~60. Drop the
  prop when it restates the title. Destructive confirm keeps its risk meaning.
- Never put SOP, recovery policy, timers, agent notes, or implementation
  commentary into product UI (`docs/ref/**`). Clamp `AppSection` /
  `AppPageHeader` descriptions; shorten `FieldDescription`; leave `CardDescription`.

## Enforcement

Machine-owned enforcement and discovery live in scripts, not in prose:

| Script | Owns |
| --- | --- |
| `scripts/check-ui-contract.mjs` | blocking guard policy and failures |
| `scripts/ui-contract-guard-reporting.mjs` | guard classification and dynamic counts |
| `scripts/ui-component-registry.mjs` | shared-component / adapter / UI block registry |
| `scripts/ui-contract-scope.mjs` | enforced runtime source roots |
| `scripts/page-archetypes.mjs` | route → archetype mapping and disposition |

Run `corepack pnpm lint:ui-contract` and `corepack pnpm audit:ui-components`.
This contract never persists dated audit results or open-debt snapshots.

**Report-only onboarding.** A new runtime root is report-only until measured
debt is zero, then it joins `UI_RUNTIME_SOURCE_ROOTS`. Report-only never gains
allowlist entries. An exception is valid only when a guard measures a real
outcome and the source documents a reason.

**Before marking a UI task complete:** no fake shared components, no arbitrary
Tailwind dimensions, no static presentation inline styles, no route-specific
theme layer, no duplicated workflow state, no new vocabulary drift; POS/KDS
mobile still exposes the next action; `corepack pnpm verify` passes.
