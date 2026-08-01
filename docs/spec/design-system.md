# Design System - Com Tam Ma Tu Web App

> Version: 15.1.0 | Updated: 2026-07-25 | Status: Má Tư visual contract

## Mục lục / Decision Index

- [Visual Contract And Authority Map](#visual-contract-and-authority-map)
- [Authority Order](#authority-order)
- [Artifact Ladder And Delivery Flow](#artifact-ladder-and-delivery-flow)
- [Product UX Thesis](#product-ux-thesis)
- [Token Contract](#token-contract)
- [Contrast Targets (WCAG)](#contrast-targets-wcag)
- [Typography Contract](#typography-contract)
- [Component Naming Convention](#component-naming-convention)
- [Rhythm Contract (Spacing, Heading, Icon, Height, Radius, Motion)](#rhythm-contract)
- [Elevation / Shadow](#elevation--shadow)
- [Component Authority & Roles](#component-authority)

## Visual Contract And Authority Map

This file owns the Má Tư visual language: semantic tokens, typography, density,
brand, visual states, elevation, and motion recipes. It is the visual source of
truth; it does not own every behavioral or workflow decision in the UI system.

| Concern              | Owner                                            | Role                                   |
| -------------------- | ------------------------------------------------ | -------------------------------------- |
| Visual language      | This file + `packages/ui/src/styles/globals.css` | Má Tư tokens and recipes               |
| Headless behavior    | Base UI                                          | accessibility and interaction          |
| Shared components    | `packages/ui/src/components/*`                   | styled Má Tư component implementations |
| Workflow composition | `docs/spec/page-archetypes.md` + target route    | job, state, navigation, responsive IA  |
| Runtime integration  | `docs/modules/ui.md`                             | migration and adapter map              |
| Regression proof     | guards, focused tests, browser evidence          | verify outcomes, not prose wording     |

When owners disagree, resolve the decision at the concern that owns it. Do not
copy an exception into a new route and do not create a second visual language.

## Decision

The design system is the **Má Tư Design System**, implemented as the Com Tam Ma
Tu Custom Theme through shared components in `@comtammatu/ui`. Base UI supplies
headless primitive behavior; lucide, Tailwind, and class-variance-authority are
implementation dependencies. They do not own Má Tư visual decisions.

Do not use the retired label “Concept 01” / “Ma Tu Concept 01” in new docs,
comments, or Stitch briefs. The single product name is **Má Tư Design System**.

Shadcn and Web Interface Guidelines are explicit comparison inputs. They may
identify missing component anatomy, accessibility, states, UX, or CSS motion.
They never create a preset, token source, or visual authority for this repo.

Custom Theme means the established Má Tư Design System semantic tokens,
typography, spacing rhythm, component roles, brand components, and app surface
adapters documented here. It does not mean a route-local theme layer, a new
component library outside `@comtammatu/ui`, or a parallel visual language.

Active runtime:

- design system name: Má Tư Design System
- custom theme: Com Tam Ma Tu Custom Theme (implementation label under Má Tư DS)
- token source: `packages/ui/src/styles/globals.css`
- shared component source: `packages/ui/src/components/*`
- headless primitive behavior: Base UI
- component styling dependencies: lucide, Tailwind CSS 4, CVA
- brand assets: `/brand/logo-matu.png`, `/brand/logo-matu-seal.png`, `/brand/logo-matu-vertical.png`, `/brand/mascot/be-suon-tuoi-runner.png`, `/brand/mascot/cotlet.png`, `/brand/mascot/cotlet.spritesheet.webp`, `/brand/mascot/cotlet.pet.json`, `/brand/symbols/*.svg`
- web brand component: `apps/web/app/components/brand.tsx`
- web app surface adapters: `apps/web/app/components/surface.tsx`
- Stitch/agent mirror (non-SSOT): `.stitch/DESIGN.md`

Agents must preserve this decision unless the task explicitly asks to change the design system itself.

## Authority Order

Choose the owner for the decision first, then read the implementation evidence.
The visual contract selects Má Tư expression; Base UI primitives select headless
behavior; shared components select styled implementation; archetypes and routes select the workflow; tests and browser
evidence prove the result. Product copy remains owned by `docs/ref/glossary.md`,
`packages/shared/src/labels/vi.ts`, and domain dictionaries.

## Artifact Ladder And Delivery Flow

Use one artifact ladder from intent to runtime. A lower layer cannot override a
higher authority, and a higher layer must reuse the lower implementation layer
before adding anything new.

| Layer          | Owner                                                            | Job                                                                                          |
| -------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Guideline      | this file + `docs/ref/screen-context-map.md`                     | lock visual language, actor, job, information boundary, and reusable rules                   |
| Stitch mirror  | `.stitch/DESIGN.md` (optional)                                   | agent/Stitch semantic mirror of Má Tư DS; never overrides this file alone                    |
| Primitive      | Base UI                                                          | provide headless behavior, semantics, focus, keyboard, and layering                          |
| Component      | `packages/ui/src/components/*`                                   | provide one styled, reusable Má Tư UI unit                                                   |
| Adapter        | `apps/web/app/components/*` and approved domain adapter families | translate components into an app or plane-specific semantic role                             |
| UI Block       | `UI_BLOCK_REGISTRY` in `scripts/ui-component-registry.mjs`       | name a production-ready composition recipe; import adapters/components, never a `*Block` package |
| Page archetype | `docs/spec/page-archetypes.md`                                   | define the complete route-level workflow recipe and state model                              |
| Screen         | target route                                                     | bind real data, authority, copy, actions, and recovery to one URL                            |

The delivery flow is:

```text
Screen context and user job
→ UI Advisor Gate
→ page archetype
→ registered UI block when one fits
→ registered adapters and components
→ optional Stitch prototype (seed from this file; sync `.stitch/DESIGN.md`)
→ route implementation
→ responsive, accessibility, and runtime verification
```

`UI Block` is recipe metadata, not a `blocks/` component library and not an
importable `*Block` component layer. Add a block recipe only when at
least two real consumers share the composition, or when a named critical
workflow needs one approved exemplar. When a composition becomes reusable code,
promote it to a registered **Adapter** (app or domain) — for example
`AppListFrame`, `DocumentFormFrame`, `SettingsPageFrame` — and keep the
UI block entry as the named recipe that points agents at that adapter chain. If
no block fits, follow the archetype and compose existing adapters behind a
route-scoped owner; do not add a speculative block or invent `apps/web/.../blocks/`.

Stitch is an optional design adapter and mirror. Seed it from the current
guideline, archetype, block, and semantic roles; keep `.stitch/DESIGN.md` as the
agent/Stitch mirror of **Má Tư Design System**. Stitch output never changes
tokens, typography, component APIs, route authority, or business behavior by
itself. Generated code is reference material until it is rebuilt from registered
Má Tư components and verified in the runtime. Root `DESIGN.md` is forbidden
(guarded); only `.stitch/DESIGN.md` is allowed. Do not upload secrets, customer
data, employee data, or production records.

Lookup before composition:

```bash
corepack pnpm audit:ui-components --component <component-or-block>
```

## Product UX Thesis

Com Tam Ma Tu is an operational restaurant system with **two product halves**
(see `docs/spec/architecture.md` § Product Dual Thesis):

- **Quản lý hệ thống** (`control_surface`): dense management — tables, filters,
  documents, review states. Adapters: `App*`.
- **Vận hành bán hàng** (`branch_surface` + `station_chrome`): touch-first shift
  work and live queues (POS/KDS/Runner). Adapters: `BranchOperator*` / station.

Same Má Tư Design System tokens; different density and chrome per half.

- POS and KDS are frontline tools. The first viewport must expose the next safe action or live queue.
- control_surface routes are dense management workspaces. They should prioritize tables, filters, forms, and review states over decorative summary chrome.
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
- Radius: documented radius token scale only
- Typography: runtime font variables from `apps/web/app/layout.tsx` and `packages/ui/src/styles/globals.css`

Theme runtime:

- Two modes: `light` (default, day shift) and `night` (warm-dark "gạo cháy",
  evening/night shift). `night` maps to the `.dark` CSS selector so existing
  `dark:` variants and the chart THEMES map resolve correctly.
- `packages/ui/src/components/theme-script.tsx` applies the initial class before
  hydration. It reads the `matu-theme` cookie (`light` | `night`); when absent
  it falls back to local hour — `night` for 18:00–06:00, otherwise `light`.
  The script must not depend on `prefers-color-scheme` or `matchMedia`; the
  shift-aware decision is timezone-stable and OS-preference-independent.
- `packages/ui/src/components/theme-provider.tsx` is the only runtime theme
  state provider. `setTheme` writes the `matu-theme` cookie (SameSite=Lax,
  1-year max-age). Scope, branch, workflow, and auth state must never use
  browser storage; theme is the only browser-stored UI preference.
- The single theme toggle is the `ThemeToggle` component (`apps/web/app/components/theme-toggle.tsx`)
  mounted in `AppHeader`, the operations PWA toolbar, the employee header, and
  the public self-order guest header (`/q/[token]`).
  Do not add a second theme context, a route-local toggle, or a localStorage
  theme key.

Approved project utilities:

- `max-h-dvh-95` and `max-h-dvh-80` are bottom-sheet height utilities for
  mobile dynamic viewport constraints.
- `pos-text-overlay` is limited to text over POS menu item photos.
- `pos-safe-bottom` is limited to POS PWA floating bottom bars.
- `workflow-safe-pb` is limited to public workflow fixed action bars and
  bottom-sheet footers that sit above a mobile home indicator;
  `workflow-safe-pt` protects public workflow headers below standalone-PWA
  status chrome.
- `chrome-safe-pt` / `chrome-safe-pb` / `chrome-safe-top` are limited to
  app shell roots and fixed or sticky chrome affected by mobile safe areas. Side
  `SheetContent` owns its top/bottom safe-area inset padding by default.
  Side sheets are full width below `sm`; their shared desktop width is `size="lg"`
  by default, while focused entry and action tasks use `size="md"`.
  Do NOT put `chrome-safe-top` on the Sheet absolute close control — its
  `max(0.5rem, …)` floor drops the X below `SheetTitle` on zero-inset
  viewports; Sheet close uses `top-[env(safe-area-inset-top,0px)]` instead.
- The global skip link targets exactly one rendered `#main-content` landmark per
  route plane. The target keeps `tabIndex={-1}` so fragment navigation also
  moves keyboard focus without adding it to the normal Tab order.
- `chrome-tap` disables the mobile tap-highlight/callout flash on app chrome
  (nav, tiles, headers, buttons) so the installed operator PWA doesn't read as
  a website; do not apply it to data content that must stay selectable
  (tables, detail text, copyable IDs).
- `no-scrollbar` hides scrollbars on horizontally scrolling chrome rails
  (sidebar, command list, bottom-nav, filter rails) without disabling scroll.
- `mascot-cotlet` + `animate-cotlet-idle` / `animate-cotlet-waiting` /
  `animate-cotlet-waving` render the Cốt Lết sprite-sheet status loops; limited
  to the runner idle board (the documented § G full-screen idle exception) and
  always gated with `motion-safe:`.
- `shadow-effect-*` (popover / dialog / drawer / tooltip / card-hover),
  `bg-effect-scrim`, and `drawer-scrim` are the Má Tư DS depth utilities backed by
  the `--effect-*` token family (see § Elevation). The `--motion-*` / `--ease-*`
  motion tokens (see § G Motion) are consumed inside `packages/ui` components via
  `duration-[var(--motion-*)]` / `ease-[var(--ease-*)]`. These were
  adopted **into** this contract from the Má Tư Design System; they are therefore the
  current semantic contract, not a "parallel namespace" or "external DS token names"
  per the Forbidden list below.
- New utilities require a design-system update first; prefer shared-component props
  or app surface adapters when the pattern is reusable.

## Contrast Targets (WCAG)

Dual Thesis keeps **one token set**; density differs by half. Non-text UI
components (borders, cards, focus rings) must meet **WCAG 1.4.11** (≥3:1 vs
adjacent background). Text stays AA (≥4.5:1 for body).

| Pair (light) | Target | Notes |
| ------------ | ------ | ----- |
| `foreground` / `background` | ≥4.5:1 | Primary reading |
| `muted-foreground` / `background` and `/muted` | ≥4.5:1 | Secondary copy |
| `border`/`input` / `background` | ≥3:1 | Tables, fields, card edges |
| `ring` / `background` | ≥3:1 | Focus visibility |
| `card` / `background` | Visible hierarchy | Prefer border when ΔL is small |

| Pair (night `.dark`) | Target | Notes |
| -------------------- | ------ | ----- |
| `card`/`popover`/`sidebar` / `background` | Clear lift | Raise card L before decorative shadow |
| Borders (alpha on cream) | Readable hairlines | Prefer stronger alpha if cards merge |

Audit 2026-07-29 (pre-tune): light border ~1.25:1, card ~1.07:1, ring ~2:1;
night card ~1.07:1. Token tune deepens light border/ring/primary and lifts night
card/sidebar — re-check screenshots after change. Prefer contrast fixes over
spacing-only “fixes”.

Forbidden for new app UI:

- Parallel Tailwind token namespaces outside the current semantic contract.
- Custom font variables or font utility classes outside `font-sans`, `font-heading`, and `font-mono`.
- Custom radius or spacing variable namespaces outside the current semantic contract.
- External DS token names copied from outside this repo.

Brand Má Tư Design System runtime mapping:

- `background`: kem gao foundation.
- `foreground` / dark mode foundation: xanh dam.
- `primary`: do gach.
- `ring` / chart accent: vang gao.
- `success`: xanh la diu.
- `muted-foreground` / supporting tone: nau go or xam am depending on theme.
- Heading font: Geist.
- Body font: Geist.
- Mono font: Geist Mono for tabular operational data.
- Night mode: warm-dark "gạo cháy" palette (see Theme runtime); auto 18:00–06:00 local or via `matu-theme` cookie override.

### Tint Opacity Scale

Status-token tints start from a three-step opacity scale so a "10% surface tint"
reads consistently across the app:

| Step              | Opacity | Role                                           |
| ----------------- | ------- | ---------------------------------------------- |
| `fill`            | `/10`   | Default status-surface tint (`bg-warning/10`)  |
| `fill-strong`     | `/15`   | Callout / emphasis surface (`bg-warning/15`)   |
| `hairline-border` | `/20`   | Hairline border/ring on a tint (`border-…/20`) |

- Applies to `(bg|border|ring|text|fill|stroke)-(warning|success|destructive|info|primary|accent|secondary)`.
- Prefer `/30` or `/50` for neutral muted fills (`bg-muted/30`, `bg-muted/50`).
- Start solid status backgrounds from the bare token (`bg-success`). A different
  opacity is valid when it has a semantic role and preserves contrast in both
  themes; review the rendered state instead of maintaining a class allowlist.

### Callout / tint chrome routing

Any bordered / rounded `div` carrying a `bg-(warning|destructive|success|info)/N` tint MUST route through a shared component, not hand-rolled chrome:

- `Alert` (icon + message + action) for actionable alerts.
- `NoteCallout` (labeled note) for informational notes. The canonical warning callout is `NoteCallout tone="warning"` (`bg-warning/15`, no border).
- No hand-rolled tinted callout chrome (a raw tinted, bordered, rounded box). See § Component Authority.

### Sanctioned inline-style exception

`apps/web/app/global-error.tsx` is the single file allowed to use inline `style` for presentation, because Tailwind / semantic tokens are unavailable there by Next.js necessity (root CSS may not have loaded when it renders). Its hex literals should align to Má Tư Design System — background = kem gạo, text = xanh đậm, and a muted-foreground tone — not neutral greys. This is a named exception, not license for inline styles anywhere else (see § Loading / Error / Not-found Frame).

## Typography Contract

Runtime typography source:

- `apps/web/app/layout.tsx` loads `GeistSans` and `GeistMono` through the `geist` package (next/font/local under the hood; full Vietnamese glyph coverage, self-hosted, offline). Geist serves headings and body/content; Geist Mono serves operational data.
- `packages/ui/src/styles/globals.css` maps those font variables into Tailwind utilities.

Required utility mapping:

| Purpose           | Utility / variable                | Font           |
| ----------------- | --------------------------------- | -------------- |
| body/content text | `font-sans` / `--font-sans`       | Geist          |
| headings/titles   | `font-heading` / `--font-heading` | Geist          |
| operational data  | `font-mono` / `--font-mono`       | Geist Mono     |

Rules:

- The `geist` package exposes `--font-geist-sans` / `--font-geist-mono`. `globals.css` binds both `--font-sans` and `--font-heading` to `--font-geist-sans`, and `--font-mono` to `--font-geist-mono`. App code consumes only `font-sans` / `font-heading` / `font-mono`.
- Route/page headings, card titles, dialog titles, sheet titles, section titles, and brand lockup text use `font-heading` unless a Má Tư DS shared component already applies it.
- Body text, controls, labels, descriptions, table text, and workflow copy inherit `font-sans`.
- Use `font-mono` only for tabular operational data, IDs, codes, receipt/order numbers, prices, quantities, timestamps, and audit hashes.
- Do not add route-specific `font-family`, custom font variables, or extra font families.
- Do not reintroduce `Inter`, `Montserrat`, `JetBrains Mono`, system-only stacks, custom font variables, or per-surface typography exceptions. The complete roster is Geist for headings/body and Geist Mono for data.
- When changing typography runtime, update `apps/web/app/layout.tsx`, `packages/ui/src/styles/globals.css`, this contract, `docs/modules/ui.md`, `docs/agent/rules/ui.md`, and `tasks/regressions.md`.

Rules:

- Use semantic Tailwind token classes (`bg-background`, `text-muted-foreground`, `border-border`, `bg-success`, etc.).
- Use `BrandMark` / `BrandLockup` for web runtime logo rendering; do not reference `/brand/logo-*` directly from route components.
- Use `BrandSymbol` for Má Tư brand symbol assets and `BrandMascot` for the Cốt Lết mascot; do not reference `/brand/symbols/*` or `/brand/mascot/cotlet*` directly from route components.
- Purpose-specific mascot assets may be used as decorative public images in customer-facing empty or splash states; they must not replace core workflow content.
- `BrandSymbol` is approved as decorative, static `EmptyMedia` content for any `AppEmptyState` (any surface, ERP included) via the adapter's `symbol` prop; it is not a mascot and carries no motion.
- The three brand patterns (`ke-caro`, `hat-gao`, `vong-to`) ship as tileable SVG under `/brand/patterns` with the `brand-pattern-caro` / `brand-pattern-hat-gao` / `brand-pattern-vong-to` and `brand-strip` utilities in `globals.css`. Use them only as decorative footer strips, packaging trim, or section separators — never as a background behind body text. Sanctioned placements: the login brand panel footer and the Runner display footer.
- Do not hardcode raw palette classes for status meaning (`amber`, `emerald`, `zinc`, etc.) when a semantic token exists.
- Do not add arbitrary dimensions such as `text-[10px]`, `w-[200px]`, or `h-[3rem]`.
- Do not add static inline styles for presentation.
- Do not add per-route `theme.css` files.
- Do not create one-off color ramps for a module.
- Do not scale typography with viewport width.
- Do not change shared-component radius, color, focus, or disabled behavior from a page wrapper.

If a new token is truly needed, it must be added to `packages/ui/src/styles/globals.css`, documented here, and checked against `tasks/regressions.md`.

## Rhythm Contract

Token Contract locks **what** values exist; Rhythm Contract locks **when** to use which value, so spacing, sizing, and density read consistently across modules instead of being a per-module judgment call.

A module that needs to deviate must update this contract first, not patch a single page.

### A. Spacing Rhythm

| Slot                         | Class                                | Notes                                 |
| ---------------------------- | ------------------------------------ | ------------------------------------- |
| Page outer padding (mobile)  | `p-3`                                | Set by `AppPage` density="compact"    |
| Page outer padding (default) | `p-4`                                | Set by `AppPage` default              |
| Card inner (default)         | `p-4`                                | Set by `Card` shared component        |
| Card inner (size="sm")       | `p-3`                                | Set by `Card data-size=sm`            |
| LIST flush card              | `py-0` (untitled) / `pb-0` (titled); edge surfaces `rounded-t-lg` / `rounded-b-lg` matching Card | Set by `AppListFrame`; Card stays `overflow-visible` for sticky bleed / Select |
| Toolbar inner (inline LIST)  | `px-3 py-2`                          | Set by `AppToolbar variant="inline"`  |
| Toolbar inner (card)         | Card `size="sm"` content pad         | Set by `AppToolbar` default variant   |
| Table column header height   | `h-8`                                | Set by `TableHead` (matches dense body) |
| DataTable pagination         | `px-3 py-2`                          | Set by `DataTablePagination`          |
| Section vertical gap         | `gap-4` (default), `gap-3` (compact) | Set by `AppPage`                      |
| Within-section element gap   | `gap-2`                              | Default for inline rows / form fields |
| Compact toolbar chip gap     | `gap-1.5`                            | Filter chips, badge clusters          |
| Tight icon-label gap         | `gap-1`                              | Icon + 1–2 word label only            |
| Sticky operator action bar   | `gap-2`                              | Touch CTA stack in a sticky footer    |

The values above are the default rhythm recipes, not a static utility allowlist.
Use the smallest named spacing token that preserves hierarchy, touch targets and
scanability; review rendered density when a route needs another value.

`AppPage` owns the default outer rhythm and `Card` owns its default inner
rhythm. Route-local composition may differ when it has a distinct workflow or
responsive need; review the rendered hierarchy, touch targets, and density
instead of comparing utility strings. Prefer `gap` for compositional stacks,
but do not treat a utility name or a local wrapper as a defect by itself.

`AppPage mobile` constrains content to the public workflow width; it does not
reserve space for fixed chrome. The fixed/sticky action owner must provide its
own content clearance and safe-area padding.

Use `CardContent flush` and `CardContent scroll` when they express the job. A
route may compose equivalent spacing or overflow when the shared recipe does
not fit its content, provided it does not create competing visual chrome.

### B. Heading Scale (locked per role)

| Role                                    | Class                                                                                                                                   | Source                                                                                                                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page H1                                 | `font-heading text-xl sm:text-2xl font-semibold tracking-tight`                                                                         | `AppPageHeader`                                                                                                                                                                              |
| Section title                           | `font-heading text-base font-semibold`                                                                                                  | `CardTitle`                                                                                                                                                                                  |
| Sub-section / list head                 | `font-heading text-sm font-semibold`                                                                                                    | `Item title` slot                                                                                                                                                                            |
| Eyebrow / metadata                      | `text-xs font-medium uppercase tracking-wide`                                                                                           | `AppPageHeader.eyebrow` (page-header lockup only)                                                                                                                                            |
| Panel / field / section uppercase label | `text-xs font-medium uppercase tracking-wide text-muted-foreground` (dense KDS chrome: `text-2xs font-medium uppercase tracking-wider`) | `SectionLabel` (default + `density="dense"`; use `as="h2"` / `"h3"` / `"h4"` when the visible label participates in heading hierarchy); page-header eyebrow stays on `AppPageHeader.eyebrow` |
| Table column header                     | `text-xs font-medium uppercase tracking-wider text-muted-foreground`                                                                    | `TableHead`                                                                                                                                                                                  |
| Dense eyebrow                           | `text-2xs font-medium uppercase tracking-wider`                                                                                         | KDS chrome, audit row meta, mobile chrome labels                                                                                                                                             |
| KDS kitchen item-name                   | `text-base font-semibold leading-6 xl:text-lg xl:leading-6`                                                                             | KDS ticket item-name (wall boards scale up at `xl`)                                                                                                                                          |
| Numeric input echo                      | `text-3xl font-semibold tabular-nums`                                                                                                   | Number pad readout, scale display                                                                                                                                                            |
| Runner board header                     | `text-runner-header font-semibold`                                                                                                      | Runner/KDS order board column headers, height-responsive display token                                                                                                                       |
| Runner board row text                   | `text-runner-board font-semibold`                                                                                                       | Runner/KDS order board data cells, height-responsive display token                                                                                                                           |
| Runner empty secondary                  | `text-runner-empty-secondary font-semibold`                                                                                             | Runner/KDS empty-state secondary line, height-responsive display token                                                                                                                       |
| Runner board footer                     | `text-runner-footer font-semibold`                                                                                                      | Runner/KDS order board footer, height-responsive display token                                                                                                                               |
| Display call target                     | `font-mono text-6xl sm:text-7xl lg:text-8xl font-semibold tabular-nums`                                                                 | Customer-facing runner / queue display only                                                                                                                                                  |

Uppercase eyebrow, panel, field, and section labels default to
`text-xs font-medium uppercase tracking-wide text-muted-foreground`; dense KDS
chrome may use `text-2xs font-medium uppercase tracking-wider`. Change the
scale only when the route's reading distance or hierarchy needs it, then review
the rendered label rather than policing a utility pair.

`text-4xl`, `text-5xl` are NOT allowed in app surfaces. They live only in marketing/login splash. `text-3xl` is reserved for the numeric-input-echo role above (cashier number pad, scale display) and MUST be paired with `tabular-nums`. `text-3xs` is reserved for SVG axis labels and dense table micro-meta.

Display call targets are a separate operational display role, not headings. Use them only on customer-facing queue/runner screens where the primary job is reading a stable serving target from distance. The displayed value must be stable (`table_number` for dine-in, `order_number` / `kitchen_ticket_number` for fallback), never a volatile render index.

Runner/KDS customer boards must use one responsive semantic grid, not duplicate mobile and desktop markup or a custom percent grid. Below `sm`, the four fields form a two-column, two-row grid so the wait value remains readable on 320–390 px screens. From `sm`, preserve the built-in 12-column contract: Đơn `col-span-4`, Số món `col-span-3`, Trạng thái `col-span-4`, Chờ `col-span-1`. The wait-time header is `Chờ`, not `Thời gian đợi`, because wait values are short and the label must not steal width from quantity/status. All four data cells use the same `text-runner-board` row typography. Runner display tokens scale with dynamic viewport height (`dvh`) and clamp between compact desktop and 2K/4K displays; they must not scale from viewport width. Compact desktop viewports must keep cell/header/footer padding below the `xl` breakpoint (`px-4 py-2`) so wrapped labels like `Mang về #041` and `2 món` do not collide with row dividers. The narrow wait-time column may use smaller horizontal padding than the other columns. Status cells MUST NOT add a separate `text-*` class on the data-text element; the label inherits row color so `tailwind-merge` cannot drop the shared row typography.

Heading-weight lock: the default heading weight is `font-semibold`. `font-bold` is reserved for receipt totals and print-mode page headers ONLY. One owner-approved named exception: **POS menu item-name over photo → `font-bold` permitted** (legibility over the `pos-text-overlay` drop-shadow). Emphasis inside body copy may still use `font-bold` inline. `font-black` is not allowed in the app.

Prefer `tracking-wide` for the page-header eyebrow and `tracking-wider` for
repeated dense/table/grid eyebrows. On control_surface routes that mount
`AppShell`, `AppPageHeader.eyebrow` MUST NOT repeat the primary sidebar module
label or a marketing synonym of it — the sidebar and deep-nav already own that
context. Reserve the eyebrow for real non-module context (site kind, drill-down
parent when a back link is absent). `AppPageHeader` is the default management
page H1 because it keeps context and actions coordinated; a bespoke header must
keep one semantic H1, a clear hierarchy, and responsive action behavior.
For a standalone public/GATE page whose visible `AppSection` title is the
canonical page title, set `headingLevel="h1"`. Nested operational sections keep
the default non-heading card label unless the route has established a valid
heading hierarchy.

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

`size-7`, `size-9`, `size-11` are NOT allowed in app surfaces. `size-14`, `size-16` are NOT allowed outside `EmptyMedia`, brand lockup, splash imagery, or image/document thumbnails (photo upload preview, supplier doc thumbnail, GRN evidence). Inventory/POS hero glyphs MUST compose `EmptyMedia` or render through a shared component, not free-style `size-12` inside a card.

### D. Height Scale (lock to shared components)

`Button` is the single source of truth for button height. Variants:

| Variant      | Min height                         | When                                                                                     |
| ------------ | ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `xs`         | `h-6`                              | Inline metadata actions, tag pickers                                                     |
| `sm`         | `h-7`                              | Compact toolbars, dialog footers                                                         |
| `default`    | `h-8`                              | Standard CTA, form submit                                                                |
| `lg`         | `h-9`                              | Primary CTA, page-header action                                                          |
| `field`      | `h-10`                             | Composite form trigger only (`form/*` date/combobox/multi-select popover buttons)        |
| `touch`      | `min-h-12`                         | Mobile touch button (POS, KDS, mobile inventory) — meets WCAG 2.5.5 enhanced target size |
| `touch-lg`   | `min-h-14`                         | Hero CTA / mobile action bar primary (POS bottom bar, KDS bump)                          |
| `icon-xs`    | `size-6`                           | Icon-only inline                                                                         |
| `icon-sm`    | `size-7`                           | Icon-only compact                                                                        |
| `icon`       | `size-8`                           | Icon-only default                                                                        |
| `icon-lg`    | `size-9`                           | Icon-only large                                                                          |
| `icon-touch` | `size-12`                          | Icon-only touch target (POS header overflow) — 48px WCAG 2.5.5 enhanced                  |
| `tile`       | `min-h-32`→`min-h-44` (responsive) | Oversized selectable tile (POS table-gate); `min-h-` so wrapped labels grow              |

Fixed heights `h-10`, `h-11`, `h-12`, `h-14`, `h-16` MUST NOT be applied to `<button>`, `<Link>`, or `<Button>` acting as a button. Min-heights `min-h-12`, `min-h-14`, `min-h-16` MUST come from the `touch` / `touch-lg` variants — do not override on a different variant via `className`. Touch CTAs use `min-h-` rather than fixed `h-` so wrapped labels grow vertically without clipping.

If a new touch tier is genuinely needed (e.g. tablet KDS oversized chef glove targets), add a variant to the owning shared primitive once. Never fake a button by setting `<button className="min-h-12 ...">` outside that primitive. The `tile` (POS table-gate selectable tile) and `icon-touch` (48px icon-only) `Button` sizes, the `touch` / `touch-lg` sizes on the `Toggle` / `ToggleGroup` cva (POS segmented service-mode control), and `TabsList size="touch"` (48px minimum tab triggers inside a 56px strip) were added under this rule — consume them via `size=`, never a raw `h-*` / `min-h-*` on the group or item `className`. The `button-height-on-button` gate (below) enforces this for `<Button>`. The bare form-control primitives `Select` (trigger), `Switch`, `Checkbox`, and `RadioGroupItem` expose a `touch` value on their own cva `size` prop (`min-h-12` trigger / enlarged 20px box + ≥44px hit area), added under this same rule for POS/KDS order-flow controls — consume via `size="touch"`, never a raw `h-*` / `size-*` on the control `className`.

`Input` defaults to `controlSize="default"` (`h-7`) and also exposes `controlSize="field"` / `controlSize="touch"`; native `size` is omitted and is not a visual-density API. The RHF-backed `TextField`, `NumberField`, `SelectField`, and `ComboboxField` wrappers default to `controlSize="responsive"`: they resolve to `touch` below the Owner shell's `lg` (1024px) cutover and `field` from `lg` upward. An explicit `field` or `touch` caller remains fixed at that density. A touch-sized Combobox also propagates touch density to its visible popup search input and options; do not enlarge only the trigger.

| Control role                                                | Below `lg` | `lg` and above | Source                                                        |
| ----------------------------------------------------------- | ---------- | -------------- | ------------------------------------------------------------- |
| Bare text / number `Input` primitive (default)              | `h-7`      | `h-7`          | `Input` primitive (`packages/ui`)                             |
| Responsive form text / number field                         | `min-h-12` | `h-10`         | `form/text-field`, `form/number-field`                        |
| Responsive select / combobox field and visible popup inputs | `min-h-12` | `h-10`         | `form/select-field`, `form/combobox-field`, shared `Combobox` |
| Fixed-density multi-select / date-picker field trigger      | `h-10`     | `h-10`         | `form/multi-select-combobox`, `form/business-date-field`      |

`h-10` and `min-h-12` are permitted only through the named field-control sizes in the owning primitive or shared `form/*` wrapper. The forbidden fixed heights `h-10` / `h-11` / `h-12` / `h-14` / `h-16` above apply to elements acting as a **button CTA** (`<button>` / `<Link>` / `<Button>` used as an action) — a form-field control that holds input or opens a popover/list is governed by this table, not by the button-height ban. Do not hand-patch a raw `Input` or `SelectTrigger`; route it through the shared wrapper or consume its named size so field height stays single-sourced. Vertical chrome should otherwise be controlled with `Field` / `FieldGroup` spacing, not ad-hoc height overrides.

### E. Radius Scale (4 tiers, 4 tokens only)

Radius is a tier, not a free choice. Pick the token from the element's role:

| Tier                  | Token          | Roles                                                                                    |
| --------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| Control               | `rounded-md`   | Input, button, badge, chip, icon-box (square icon container), inset block, callout/Alert |
| Card / page-container | `rounded-lg`   | Card, Sheet, Dialog, Drawer outer; page-container surfaces                               |
| Pill                  | `rounded-full` | Avatar, pill badge, circular (truly round) icon container                                |
| Reset                 | `rounded-none` | Explicit reset only (table cell internals, edge-bleed media)                             |

These tiers are visual recipes, not a static class allowlist. Preserve a
component's semantic role and visual hierarchy; review non-standard radii in
the rendered surface instead of blocking a utility name in isolation.

### F. Density Modes

`AppPage density="compact"` and `Card size="sm"` are the two switches that move a surface from default to dense without rewriting spacing. POS/KDS/Inventory dense list views compose these. Per-module density classes (`*-dense`, `*-tight`) are not allowed.

### G. Motion Contract

Motion defaults to functional feedback: loading, enter/exit, focus and state
change. Má Tư may also use restrained brand expression where it does not hide
operational state or slow an operator task. Base UI supplies the behavior beneath
these recipes.

**Timing and easing.** Prefer Má Tư's shared `--motion-*` / `--ease-*` tokens
for reusable shared components and repeated feedback. A route may add a distinct timing
or easing when it has a clear interaction or brand-feedback role and the
rendered state is reviewed; move the recipe into the visual layer once it is
reused. Do not add arbitrary timing merely as decoration.

**Animation.** The visual layer may add CSS keyframes and one-shot motion for
feedback, transitions, and restrained brand expression. Keep continuous motion
off operational queues and next-action controls unless it conveys live state.
Profile motion on scrolling or high-frequency surfaces before broad rollout.

**Press feedback.** `active:scale-[…]` (≥ `0.97`) is allowed on tap targets for tactile press feedback. `hover:scale-*` grow/shrink on hover is forbidden on ERP surfaces — it reads as decorative.

**Reduced motion (locked).** A global `@media (prefers-reduced-motion: reduce)` reset in `packages/ui/src/styles/globals.css` neutralizes all animation and transition app-wide when the OS requests reduced motion — including one-shot primitive enter/exit (`animate-in` / `animate-out` or Base UI transition states), the loading `Spinner`, and `tw-animate-css` state animations. No animation is exempt at runtime; the reset is the backstop. Looping or attention-drawing animation (`animate-pulse` on non-skeleton elements, `animate-bounce`, urgency/age pulses, kinetic idle visuals) MUST still also be gated with `motion-safe:` as defense-in-depth and intent signalling. Prefer `motion-safe:` on the animated class over `motion-reduce:animate-none` on the static one.

**Performance and accessibility rules:**

- Prefer `transform`, `opacity`, `filter`, `color`, and named transition
  properties; do not animate layout properties on a hot operational path.
- Honor the global reduced-motion reset. Continuous or attention-drawing motion
  needs `motion-safe:` and must not conceal status or the next action.
- `transition-all` remains prohibited because its cost and affected properties
  are unknown at review time.
- A motion dependency or custom keyframe is acceptable only when it has a
  component-level reason, reduced-motion behavior, and a measured route impact.

## Elevation / Shadow

The system is **border-first**: a resting surface normally separates through
`--border`; elevation communicates a real layering relationship. The named
`--effect-*` depth tokens are Má Tư's default elevation recipes. A component may
use a different named recipe when its layered state is clear in the rendered UI
and does not make a resting data surface look interactive.

| Rung              | Utility                            | Locked role                                                                                                                                                                                  |
| ----------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rest              | border                             | Resting data surfaces are border-first. Elevation starts when a surface becomes interactive or floats above other content.                                                                   |
| Glass/chrome rest | `shadow-effect-card-resting`       | Floating translucent chrome only: login glass surfaces and `AppBottomNav`. Never apply it to a resting data `Card`.                                                                          |
| Hover             | `shadow-effect-card-hover`         | Interactive/clickable card adapters on hover only — data-table + inventory `interactive-card.tsx`, `AppLinkCard` + `OperationalBoardCard` (`surface.tsx`). Hairline ring + `0 1px 3px` drop. |
| Overlay           | `shadow-effect-popover`            | Popover-family floating layers: `popover`, `dropdown-menu`, `select`. Bakes the `--effect-ring-border` hairline + soft drop (replaces the old `shadow-md ring-1 ring-foreground/10`).        |
| Modal             | `shadow-effect-dialog`             | `dialog` content.                                                                                                                                                                            |
| Sheet / Drawer    | `shadow-effect-drawer`             | `sheet` content and `drawer` panel.                                                                                                                                                          |
| Tooltip           | `shadow-effect-tooltip`            | `tooltip` content.                                                                                                                                                                           |
| Toast             | `--effect-toast` (on `.cn-toast`)  | Sonner toasts — `box-shadow: var(--effect-toast)` is applied directly on `.cn-toast` in `globals.css`; there is no separate utility class.                                                   |
| Sticky CTA        | `shadow-lg`                        | CTAs **inside a genuinely sticky/fixed action bar** (e.g. GRN-create and transfer-receive `sticky bottom-0 chrome-safe-pb` footers).                                                         |
| Ceiling           | `shadow-xl` / `shadow-2xl`         | **Only** fixed surfaces floating over scrolling content: POS mobile action bar (`shadow-2xl`), KDS focus card / chart tooltip (`shadow-xl`). Nowhere else.                                   |
| Overlay scrim     | `bg-effect-scrim` / `drawer-scrim` | Dialog/Sheet backdrop = `bg-effect-scrim`; Drawer backdrop = `drawer-scrim` (scrim + `--effect-drawer-blur`).                                                                                |

**Non-elevation override.** `pos-text-overlay` (`globals.css`, `filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.6))`) and `drop-shadow-*` image filters (e.g. the runner mascot) are text/image legibility effects, **not** part of the elevation ladder, and must not be reused as surface shadows.

Avoid elevation that implies a false interactive or floating state. Use the
named recipes before adding a custom value; a custom shadow needs a component
reason and visual review. Dialog, drawer, popover and tooltip keep their own
layering semantics rather than borrowing a heavier role only to add emphasis.

## Component Naming Convention

Product Dual Thesis drives adapter prefixes (`docs/spec/architecture.md`):

| Prefix | Product half | Examples |
| ------ | ------------ | -------- |
| `App*` | Quản lý hệ thống (`control_surface`) | `AppPage`, `AppListFrame`, `AppToolbar` |
| `BranchOperator*` | Vận hành bán hàng (ca) | `BranchOperatorPage`, `BranchOperatorPanel` |
| (no prefix) | Shared primitives | `Button`, `Card`, `Frame` (inset) |

Suffix meanings (one job each):

| Suffix | Job |
| ------ | --- |
| `Shell` | Owns navigation chrome only (sidebar / header / bottom-nav) |
| `Page` | Route content rhythm (width, padding, scroll) — not chrome |
| `Section` | Card-backed region on `control_surface` (`AppSection`) |
| `Panel` | Same job inside `BranchOperator*` / `Employee*` families only |
| `Frame` | (a) `packages/ui` inset box **or** (b) registered workflow wrapper (`AppListFrame`, `DocumentFormFrame`) — never chrome |
| `Toolbar` / `Footer` / `Grid` / `Row` | Slots, not page roots |
| `Client` / `Presenter` | Route-local binding; promote to Adapter before registry |

Rules:

- New code must not invent `Owner*` / `Ops*` / `Management*` as product-plane prefixes for chrome. L0 chrome wiring is `ControlSurfaceShell` only (Wave2).
- Domain aliases (e.g. historic `InventoryListFrame`) must delegate 100% to a canonical adapter, stay registered, and prefer converging consumers onto `AppListFrame`.
- Do not add a third parallel page-kit family beside `App*` and `BranchOperator*` / `Employee*` without an ADR.
- UI block recipe ids stay kebab-case metadata; never ship importable `*Block` components.

## Component Authority

Base UI is the headless primitive layer. The only shared styled component layer
is `packages/ui/src/components/*`.

App-level page, section, toolbar, empty-state, and link-card composition is centralized in `apps/web/app/components/surface.tsx`. These exports are adapters around the shared components, not a second component library.

Tinted callout chrome routes through a shared component: any bordered / rounded `div` carrying a `bg-(warning|destructive|success|info)/N` tint MUST be an `Alert` (icon + message + action) or a `NoteCallout` (labeled note), never a hand-rolled tinted box. The canonical warning callout is `NoteCallout tone="warning"` (`bg-warning/15`, no border). See § Token Contract → Callout / tint chrome routing and Tint Opacity Scale.

Shared layout components also exported from `surface.tsx`:

- `KpiRow` — responsive grid (1/2/3/4 columns) wrapping `KpiCard` metric tiles.
- `DescriptionList` — `<dl>` term/description pairs for detail-page metadata.
- `LinkCardGrid` — responsive grid (1/2/3 columns) wrapping `AppLinkCard` entries.
- `DocumentFormFrame` — page frame for document/line-form workflows (header +
  scrollable body + footer) composing `AppPage`; a page-section adapter, not a
  chrome shell.
- `AppDetailFooter` — leading/trailing footer row for detail pages.

### Card Roles

`Card` is the shared frame component (card-role, `rounded-lg`). `KpiCard` is only for
numeric/stat values. `Frame` is the layout-free inset-tier surface
(`rounded-md border bg-card`, no flex/gap/padding) for a plain bordered box
whose caller owns its layout and content flow — the delegation target when a box
must not inherit `Card`'s flex/gap/padding (e.g. inline-flow note boxes). Other
card jobs use `AppSection`, `AppLinkCard`, `OperationalBoardCard`,
`OperationalTile`, `InteractiveCard`, `DataTable.mobileCardRender`, or a
route-scoped adapter that still renders `Card`.

Default component routing:

| Need                              | Use                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------ |
| command/action                    | `Button`, `Toggle`, `ToggleGroup`                                              |
| business state label              | `StatusBadge`; `Badge` for generic metadata                                    |
| framed section/panel              | `AppSection`                                                                   |
| navigation card                   | `AppLinkCard`                                                                  |
| selectable card-shaped row        | `InteractiveCard` with a semantic render target                                |
| disclosure                        | `Accordion` or `Collapsible`                                                   |
| searchable responsive data        | `DataTable`; raw `Table` only inside an approved table adapter                 |
| segmented view                    | `Tabs`                                                                         |
| standard app form field           | helpers from `@/components/form`; shared controls compose inside those helpers |
| short detail or list-first document | `AppDialog` (`variant="document"` for the latter) or `FormDialog`             |
| simple destructive confirmation   | shared `confirm()`; `ReasonConfirmDialog` when a reason is required            |
| contextual or long overlay        | `Drawer`, `Sheet`, or Page flow according to the workflow                      |
| empty/no result/error             | `AppEmptyState`, `TableEmptyStateRow`, `ErrorPanel`, or `NotFoundPanel`        |
| loading                           | `PageSkeleton`, `PageSpinner`, or the approved route wrapper                   |
| list row                          | `Item`, `ItemGroup`                                                            |
| search/filter shell               | `InputGroup`, `Combobox` helpers where appropriate                             |
| section/panel/field eyebrow label | `SectionLabel` (`density="default"` / `"dense"`)                               |
| route context                     | `Sidebar`, `Breadcrumb`, `Separator`                                           |
| keyboard hint                     | `Kbd`, `KbdGroup`                                                              |
| transient feedback                | `Sonner`                                                                       |
| table navigation                  | `Pagination`                                                                   |
| split pane                        | `Resizable`                                                                    |
| filter/action row                 | `AppToolbar` or `DataTable` toolbar slots                                      |
| metric block                      | `KpiCard` for numeric/stat values                                              |

Toast and durable notification behavior is specified in `docs/spec/toast-notification-system.md`.

### List Surface contract (lock to DataTable)

Responsive list/table surfaces normally use the shared `DataTable`
(`apps/web/app/components/data-table/data-table.tsx`): `mobileCardRender` for
the phone card list, the `Table` shared component for desktop, `AppEmptyState` /
`TableEmptyStateRow` for empty states, and shared pagination. Avoid
hand-maintained twin JSX trees (`md:hidden` card list + `hidden … md:block`
table): they duplicate state and can drift. Mobile and desktop MUST expose the
same fields, status colors, and actions for the same row.

### Table component system (one hierarchy, no V2)

`Table` is a semantic desktop component; `DataTable` is the only shared
responsive data-table adapter. They are one system, not alternatives. Do not
add `DataTableV2`, `DesktopTable`, `MobileTable`, or a module-specific table
wrapper that recreates the same responsibilities.

| Layer                                                                                    | Owner                                                          | Responsibility                                                                              | Direct route use                                    |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableRow`, `TableHead`, `TableCell` | `packages/ui/src/components/table.tsx`                         | Semantic desktop table markup and base density                                              | No, except a documented document/line-sheet adapter |
| `DataTable`                                                                              | `apps/web/app/components/data-table/data-table.tsx`            | One row model rendered as a desktop table and, when supplied, the matching mobile card list | Yes                                                 |
| `DataTablePagination`                                                                    | `apps/web/app/components/data-table/data-table-pagination.tsx` | Page controls for `DataTable`; never imported by a route                                    | No                                                  |
| `TableEmptyStateRow`                                                                     | `apps/web/app/components/table-empty-state-row.tsx`            | Empty/no-result treatment inside the desktop table                                          | No                                                  |
| `AppToolbar`                                                                             | `apps/web/app/components/surface.tsx`                          | Page-level query controls and page actions                                                  | Yes, as the sibling before `DataTable`              |

`DataTable` has composition recipes, not a runtime `variant` prop:

| Recipe                   | Composition                                                                                                                                                            | Required boundary                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Management LIST          | `AppToolbar` → `DataTable` with `mobileCardRender`                                                                                                                     | Route/loader owns URL query, business ordering, server filtering, and cursor pagination for unbounded data |
| Document lines           | `DataTable` with `render(row, index)`, `mobileCardRender`, and `desktopFooterRows` / `mobileFooter`                                                                    | Document controller owns line mutation by index; finite document lines do not need list pagination         |
| Report breakdown         | `DataTable`, optionally with read-only footer totals                                                                                                                   | Report query owns period/branch and ordering; totals never replace row-level values                        |
| Local inline table       | `DataTable` may use its inline search/filter/action slots only when the state is local to that one table and there is no page-level `AppToolbar` for the same controls | Do not duplicate a page toolbar inside the table                                                           |
| Branch-native touch list | `Item` / `ItemGroup`, not `DataTable`, where a named Branch exception requires one phone/tablet information architecture                                               | Shares loader, model, status vocabulary, and mutation authority with the control_surface counterpart         |

Each `DataTableColumn` is an operational field, not layout filler: it has a
stable non-empty header (an action column uses visually hidden `Thao tác`), a
stable key, and one responsibility. Identity and labels align left; money,
counts, dates, and codes align right where appropriate with `font-mono`
`tabular-nums`; workflow state stays in its own status column. Do not merge
separately filterable or auditable values into a prose cell. `DataTable` does
not invent a generic sort: the route loader supplies the business order before
rendering, such as urgency → branch → display name for an exception queue.

`mobileCardRender` exposes the same row fields, status meaning, and actions as
the desktop columns. `mobileBreakpoint` changes presentation only; it never
changes authority, data scope, sorting, or available actions. `hideOnMobile`
is not a supported column contract because mobile cards are explicit row
presentations rather than a hidden-column desktop table.

Branch runtime has one explicit presentation-plane exception: a declared
Branch-native touch `LIST` under `/br/[branchId]/*` may use `Item`/`ItemGroup`
at every supported phone/tablet width when the corresponding control_surface route owns
the dense `DataTable`. The two planes MUST share the server loader, pure model,
status vocabulary, and mutation authority; Branch MUST NOT maintain separate
mobile/tablet JSX trees or switch to the control_surface table at tablet landscape.
Each exception is named in `docs/spec/page-archetypes.md` § Named Exceptions.

Inline-edit document sheets (PO/transfer/issue lines) use the same adapter:
`render`/`mobileCardRender` receive `(row, index)` so per-line mutations
(`patchLine(index)`) work without a parallel tree, and document totals render
through `desktopFooter` (TableFooter rows) + `mobileFooter` (block under the
card list). Line inputs MUST be controlled (value from parent state) so the
breakpoint switch can remount them safely.

### Empty / Confirm

- Empty states normally render through `AppEmptyState` (page/section) or
  `TableEmptyStateRow` (inside a `Table`); the raw `Empty*` shared components remain
  available to a wrapper with a distinct workflow role.
- A list surface renders ONE empty treatment per breakpoint — never a panel
  and a table row stacked on the same viewport.
- Simple yes/no destructive confirmation uses `confirm()` from
  `@comtammatu/ui/components/confirm-dialog` (provider mounted in the root
  layout). Native `window.confirm` / `window.alert` are blocked by the
  `no-native-dialog`). Hand-rolled `AlertDialog` stays only for flows that
  collect input (reason, quantity) before confirming.

### Floating Layer

Anchored floating surfaces resolve their geometry against the viewport, not
against whichever ancestor happens to clip. The contract is single-sourced in
`packages/ui/src/lib/floating-layer.ts` and applies to four primitives:
`Select`, `Popover`, `DropdownMenu`, and `Combobox` (single + multi-select).

| Rule                | Contract                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| Position method     | Positioner `positionMethod` = `FLOATING_POSITION_METHOD` (`"fixed"`)                                        |
| Collision boundary  | Positioner `collisionBoundary` = `floatingCollisionBoundary()` (`document.documentElement`, SSR-safe)       |
| Portal              | Content renders inside the primitive's `Portal`; a floating layer never stays in the anchor's DOM subtree   |
| Stacking            | Positioner owns `isolate z-50`; callers do not raise `z-index` to escape a clip                             |
| Elevation           | `shadow-effect-popover` per § Elevation / Shadow                                                            |

`clipping-ancestors` is not an accepted boundary for these primitives: a `Card`
or toolbar with `overflow-hidden` would otherwise force the panel to flip back
over its own trigger. A component may override `positionMethod` or
`collisionBoundary` only when the anchor is inside a scroll container that must
carry the panel with it, and the override stays local to that component.

Fixing an anchored-panel clip by changing tokens, `z-index`, or ancestor
`overflow` at the call site is drift — correct it at this contract. Route- and
adapter-level application notes (LIST toolbars, `AppListFrame`, `AppToolbar`
slots and sizing) live in `docs/modules/ui.md`.

### Status vocabulary

Business-state labels and badge colors are single-sourced:

- Labels: `packages/shared/src/labels/vi.ts` (`*_STATUS_LABELS_VI`; keys are the DB CHECK vocabulary, never invented states).
- Variant + rendering: `apps/web/app/components/status-badge.tsx` (`StatusBadge`, `getStatusBadgeMeta`).
- Reuse `StatusBadge` and `getStatusBadgeMeta` when the workflow maps to an
  existing domain. A distinct workflow may compose its own presentation after
  verifying the shared DB vocabulary, contrast, and unknown-value state.
- Unknown values render as the raw key with `outline` — never throw on DB data.
- Intentional exceptions: `pos/_lib/order-status-display.ts` (cashier 5-label collapse; variants must still match the registry), `kds/lib/status-config.ts` (hot path), `inventory/_lib/dictionary.ts` + `inventory/_lib/ui.ts` (per-entity re-model is a later wave).

### Metric Card Role

Dashboard and report metric values render through `KpiCard`
(`apps/web/app/components/kpi/kpi-card.tsx`): uppercase `text-xs font-medium`
label, value `text-2xl font-semibold tabular-nums`, optional `CompareChip` delta and sparkline,
and a drill-down `href` per the owner Q-spec. Prefer a `KpiCard` variant when
the reading task matches; a different workflow should compose its own metric
treatment only when it improves the rendered hierarchy.

This lock applies only to numeric/stat-value cards. Actions, exceptions,
documents, people, menu items, setup tasks, or narrative states are not KPI
surfaces and must not be forced into `KpiCard`.

### Numeric / money cells (lock to Table)

Money, quantity, unit-price, tax-rate, ID/code, and timestamp cells render with the operational-data font (`font-mono`), tabular figures, and right alignment so columns scan as a stable ledger.

| Cell role                       | Required class set                              |
| ------------------------------- | ----------------------------------------------- |
| Money / quantity / price / rate | `text-right font-mono tabular-nums`             |
| ID / code / order / receipt no. | `font-mono tabular-nums` (left-aligned allowed) |
| Right-aligned non-numeric label | `text-right` (no `tabular-nums`)                |

Money values render through `formatVND` from `@comtammatu/shared/format` on POS/menu/receipt surfaces (compact style such as `45.000đ`) and through `formatAccountingVND` on Finance, VAT, and HĐĐT detail surfaces (fixed-2 style such as `45.000,00đ`). Accounting entry uses `MoneyVndInput` / `MoneyVndField` with at most two decimal digits; whole-VND menu, POS, cash, VietQR, and shift settlement use `WholeVndInput` / `WholeVndField`. Counts render through `formatCount`; quantities/decimals through `formatQuantity` / `formatDecimal`; and percentage points through `formatPercent` (`12,5%`). Shared formatting guards keep currency, dates, and percentages semantically consistent while `scripts/audit-ui-components.mjs` reports the formatter family as `pageLocalFormatter`. Typed number drafts use `parseVietnameseNumericInput`; spreadsheet imports use the stricter `parseVietnameseNumericImport`, which accepts supported locale variants only when their magnitude is unambiguous and rejects unsafe integers rather than rounding an ID or amount. `font-mono` is required on any numeric cell that participates in vertical column comparison (the Typography Contract applied to table bodies). A money/quantity cell written as `text-right tabular-nums` without `font-mono` loses the operational-data reading role. These classes go on `TableCell` / `TableHead`; a shared numeric-cell wrapper is valid when it renders the shared `Table` component and preserves this semantic treatment. Avoid `text-left` money columns, numeric columns missing `tabular-nums`, and money/quantity cells missing `font-mono`.

Date and time values render through `@comtammatu/shared/time` (`formatVNBusinessDate`, `formatVNDate`, `formatVNDateTime`, `formatVNTime`, `getVNDateString`, …), which pin `Asia/Ho_Chi_Minh` so server-rendered receipts and reports never drift to the host zone. `BusinessDateField` displays `dd/mm/yyyy` and gives its calendar the `vi` locale; the shared chart tooltip defaults to `vi-VN`; print rendering uses the same shared money/time helpers and its `print-format-ssot` guard.

Allowed app wrappers:

- Data adapters that fetch, map, or validate domain data.
- Layout wrappers that arrange shared components without changing the visual contract and delegate to `apps/web/app/components/surface.tsx` when they represent page, header, section, toolbar, empty-state, or navigation-card patterns.
- Form wrappers in `apps/web/app/components/form/`.
- Domain wrappers that remove repetition while still rendering Má Tư DS shared components.

Forbidden wrappers:

- Wrappers that restyle a shared component into a new visual system.
- Page-specific clones of `Button`, `Badge`, `Card`, `Table`, `Tabs`, `Input`, or `Select`.
- Page-specific clones of app page/header/section/toolbar/empty-state/link-card adapters.
- Compatibility shims for non-current visual systems.
- Helpers named like `app-*` surface classes.
- Route-local app surface replacements.

### High-level shared-component import governance

`Card`, `Table`, `Dialog`, and `AlertDialog` are shared styled components.
Routes should reuse a matching adapter where one exists. Direct shared-component
composition is valid for a unique semantic job only after the component lookup
shows no matching adapter; it must still use Má Tư tokens and prove the relevant
behavior and states.

| Shared component import                  | Default route for new app code                                                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `@comtammatu/ui/components/card`         | App card role: `AppSection`, `AppLinkCard`, `KpiCard` for metrics only, `InteractiveCard`, `OperationalBoardCard`, or a route-scoped adapter |
| `@comtammatu/ui/components/table`        | `DataTable`, `TableEmptyStateRow`, or a documented document/line-sheet adapter                                                               |
| `@comtammatu/ui/components/dialog`       | `AppDialog` for short non-form detail/task overlays, `FormDialog` for CRUD forms, `Sheet`, Page flow, or an approved exceptional dialog      |
| `@comtammatu/ui/components/alert-dialog` | shared `confirm()`, `FormDialog` with reason input, or an approved destructive flow                                                          |

Adapters remain the default for repeated page patterns. Direct composition is
reviewed by its workflow, accessibility and visual result, not by a frozen file
allowlist.

## Surface Contracts

### POS

- Mobile-first.
- Main area is menu/search and cart creation.
- Cart is only for creating a new order.
- After submit, mutations happen through order detail or order history flows.
- Session, table, and branch context must compact after selection.
- Payment/destructive flows require confirmation or safe recovery.
- POS/KDS touch surfaces must not introduce hover-only reveal mechanisms. Use
  visible copy, `NoteCallout`,
  tap-to-expand Sheet/Drawer, or multi-line layout instead.

### KDS

- Live kitchen queue is the primary content.
- Station, status, and order type filters must be compact and immediately reversible.
- Urgency/status has one visual source of truth per ticket.
- Use semantic state tokens; operational mode colors must still come from shared tokens.
- Bump/complete actions need large touch targets and clear focus states.

### Owner

- Use the shared admin shell, sidebar, breadcrumb, page heading rhythm, table/list/detail forms, and empty states.
- Breadcrumb recovery uses `AppBackLink`; its shared contract keeps a minimum
  `44px` hit target, a visible keyline on keyboard focus, and an accessible
  fallback name for icon-only use.
- Prefer filters plus table/list views over dashboard-card mosaics.
- Page summaries are allowed only when they help decide the next management action.
- CRUD dialogs use shared form helpers and Zod 4 schemas.

### Inventory

- Workflow-first: receiving, issuing, transfers, stocktake, supplier documents, and exceptions come before analytics.
- Keep procurement and inventory terms aligned with `docs/ref/glossary.md`.
- Dense tables are expected, but row actions and destructive actions must stay visually separated.
- Route IA must stay anchored to three operator flows:
  1. Nhập hàng: GRN draft, physical rejection QC, Owner/Kế toán tạo + duyệt
     **Đơn mua hàng** từ GRN, rồi Kho confirm; Finance/AP handoff tại
     `/finance/supplier-invoices` (ADR 0018).
  2. Kiểm soát tồn: one-warehouse stock on hand, stocktake, count
     assignment/slip review, waste/adjustment and reporting.
  3. Sản xuất/tiêu hao: current branch production run, sale-consumption and
     write-off workflows.
- Branch receiving remains supplier-first. Do not introduce direct PO creation,
  PO-first receiving, supplier return, price-QC, lot/expiry, production order
  DETAIL, or same-branch warehouse-to-kitchen transfer into daily UI. Inventory
  sidebar stays the short daily set (stock, GRN, PO, consumption, transfers,
  production, catalog).
- Sidebar group labels must be compact enough for the fixed sidebar. Use detail page headings and breadcrumbs for full workflow wording.
- Complex Inventory forms use RHF + Zod + app form helpers when they have line arrays, more than four fields, inline pre-submit validation, or pending submit UX. Plain `<form action>` is only for auth, sign out, or single-reason confirmations.
- Use Sonner for success/action-level feedback, inline field errors for validation, and `/access-denied?reason=` only for permission, auth, or scope failures.
- Entity audit history belongs inline on detail pages as a `Lich su` tab filtered by `audit_logs.entity_type` and `audit_logs.entity_id`. Tenant-wide audit search is a compliance surface, not the MVP detail-view default.
- Overlay selection follows the plane-neutral Record Depth / Overlay Decision
  tree in `docs/modules/ui.md` (ADR 0018). Inventory keeps only surface-specific
  exceptions here.
- Count-assignment checklist editing is an approved Owner D1 `AppDialog`
  (Branch counterpart: bottom `Sheet` at the same depth) only when bounded to
  one employee and one clear/save assignment set; long stocktake or line-heavy
  forms still use Page/`DocumentFormFrame`.
- Purchase demand, PO, and GRN are approved list-first documents. Owner/Ops
  opens their canonical view in a URL-addressable
  `AppDialog variant="document"` while the LIST stays mounted. YCH and linked
  Transfers share one fulfillment journey and one URL-addressable document
  dialog on Owner/Ops. Branch keeps its canonical Page/fullscreen touch
  workflow. A linked Transfer never creates a second LIST row or overlay.
- Inventory money, quantity, tax-rate, and business-date inputs must use the shared app form wrappers instead of ad hoc parsing or `type="number"`.
- Hide permanently unauthorized actions. Show disabled controls with explanatory copy only for temporary operational blockers such as missing shift, locked period, or incomplete prerequisite state.

### Staff Runtime

- Keep the surface narrow and task-led.
- Do not turn `/br/[branchId]/shift/*` or `/br/[branchId]/profile/*` into a
  second admin shell.
- Use the same typography, tokens, and state vocabulary as admin/POS/KDS.

## Layout Patterns

- Mobile layout is the baseline. Desktop may add density and faster scanning, but not a different information architecture.
- Root viewport must allow user zoom. Do not set `maximumScale: 1`, `userScalable: false`, or equivalent `user-scalable=no` on runtime app surfaces.
- Use standard spacing/radius utilities and shared components before custom layout code.
- Prefer one clear toolbar per workflow.
- Search, filters, counts, and bulk actions should live together.
- Empty, loading, error, and blocked states must use approved shared components or wrappers.
- Do not repeat the same workflow state in header, rail, sidebar, gate, and board.

## Structural Governance

Everything above governs how a surface looks. This section governs how a surface
is assembled: which chrome shell it mounts, where its route lives, where its
navigation comes from, and who owns page padding. The contract is outcome-led:
the enforcement script protects measurable navigation, route, accessibility,
and plane boundaries without freezing filenames, utility strings, or one narrow
layout recipe.

Route IA ownership (which family owns which capability, role gating) is governed
by `docs/spec/role-route-matrix.md`; navigation data is single-sourced in
`packages/shared/src/auth/nav-config.ts`. This section does not restate those —
it defines the UI assembly contract on top of them. Guards and browser review
prove the observable outcomes; they do not turn implementation detail into a
second source of truth.

### A. Chrome Archetypes (approved families)

Every route mounts exactly one approved chrome family. A new chrome family is a
contract change; route-local chrome outside this list is drift.

1. control_surface chrome — the shared `AppShell`
   (`apps/web/app/components/app-shell.tsx`) with a multi-group
   sidebar and one top header for L0 routes. Covers `/`, `/inventory`, `/orders`, `/hr`,
   `/finance`, `/menu`, `/branches`, `/settings`, and `/feedback`. One shell, one sidebar, one header.
   Access follows `role-route-matrix` (not Owner-role-exclusive).
   The single control_surface sidebar renders primary module tabs
   first and nests the active module's deep nav as sub-tabs under that active
   primary tab. control_surface bottom nav shows on phone and tablet portrait (`<lg`); only
   desktop (`≥lg`) uses the fixed sidebar. Tablet portrait therefore gets the
   bottom nav + `Mô-đun` drawer instead of a desktop sidebar crammed onto a
   narrow width. The
   sidebar's drawer-vs-fixed cutover is driven by `useIsMobile(1024)` in
   `app-shell.tsx`; responsive control_surface `DataTable` adapters use the same 1024px
   default. The phone breakpoint (`useIsMobile()` = 768) still governs
   toaster/POS unless a route supplies an explicit override.
   Scroll: the inset `SidebarInset` card is viewport-bounded; the sidebar
   background and rounded panel frame stay fixed while only the inset content
   region scrolls (`data-owner-shell-scroll`). `AppPageHeader` scrolls with page
   content (do not sticky/freeze it outside the scrollport — that reserves empty
   body chrome and crushes dashboard aesthetics). control_surface LIST filters stick at
   the top of the shell scrollport via `AppListFrame`
   toolbar (automatic stuck-state shell bleed), `AppToolbar sticky`, or
   `AppStickyFilterChrome` /
   `APP_PAGE_STICKY_FILTER_CLASSNAME` (`AppPageStickyChrome` is a compatibility alias). Negative sticky `top` cancels Owner shell
   top pad so the filter pins flush to the inset panel top (not below `pt-3` /
   `pt-4`). While stuck, the filter also cancels horizontal pad so it flushes to
   the inset panel edges; scrolling back to the top restores the LIST card
   inset. Do not sticky a page-level filter that sits above KPI/dashboard cards
   (e.g. Finance `FilterBar`) — stuck chrome will crush the next section while
   scrolling.
2. Branch runtime chrome — the branch-scoped operator layout
   (`apps/web/app/(protected)/br/[branchId]/(operator)/layout.tsx`). Covers the
   branch home, staff daily work under `/br/[branchId]/shift/*`, stock action
   entry points under `/br/[branchId]/stock/*`, and branch management
   (`/br/[branchId]/dashboard`, `/br/[branchId]/settings/*`) when reached from
   the branch runtime. It uses the shared brand components, compact `AppPage`,
   and `AppBottomNav`; `branch_management` is a route family inside this chrome,
   not a reason to enter control_surface chrome or add another shell.
3. station_chrome — purpose-built, full-screen, single-job surfaces that
   legitimately cannot wear the management sidebar: POS (`/br/[branchId]/pos`),
   KDS and Runner (`/br/[branchId]/{kds,runner}`). These keep bespoke layout,
   but consume the same tokens,
   typography, status vocabulary, header lockup, and bottom-nav components as
   control_surface — a different layout, never a second visual language.
   (Historical docs alias: Operations chrome.)
4. Standalone chrome-less surfaces — a named, closed exception, not a fourth
   general-purpose shell: `/notifications` and `/br` (the branch picker). Both
   are reachable from more than one plane (`/notifications` from control_surface,
   Branch runtime, and station_chrome via `?returnTo=`; `/br` is reached before any
   branch context — and therefore any Branch runtime chrome — exists) so they
   deliberately mount no sidebar, header lockup, or bottom nav; they render
   `AppPage`/`AppPageHeader` only and rely on an explicit in-page back link
   (`returnTo` / role-home) instead of persistent chrome. Adding a fourth
   general-purpose chrome family for cross-plane utility pages remains drift —
   new candidates for this exception need an owner decision and a name here.

A new chrome composition needs a clear plane, a distinct operator or customer
job, and a review of navigation ownership. It must not duplicate another
plane's authority or turn navigation into route-local data.

### B. Shell Composition

"Shell" means a component that owns chrome (sidebar, header, full-screen frame,
or outer padding). Existing `AppShell`, Branch runtime, station_chrome, and public
frames are the reference implementations, not a frozen filename registry.

- Prefer `AppHeader` and `AppBottomNav` for repeated non-sidebar chrome. Create
  another shared chrome composition only when its job cannot be expressed by an
  existing frame and its navigation owner is explicit.
- Branch runtime, Operations, and employee-lib surfaces MUST NOT import or render
  control_surface chrome (`AppShell`, `ControlSurfaceShell`,
  `resolveControlSurface*`, `control-surface-nav`, retired `owner-nav`). They must
  use the approved operator/operations chrome, shared `AppHeader` /
  `AppBottomNav`, `EmployeePage`, or an `embedded` branch of the canonical
  `PageContent`.
- File naming and the use of `<main>` or `SidebarProvider` are implementation
  details, not CI policy. Verify the rendered navigation source, responsive IA,
  and plane boundary instead.

### C. Route Home + IA

- One capability has exactly one route home; the home per family is defined in
  `docs/spec/role-route-matrix.md`. A second page rendering another family's
  client is drift (e.g. a `/br/[branchId]/settings/*` page importing an
  `/settings/*` client, or a duplicate periods page).
- A route that loses its single home must not keep a parallel copy or stub.
- Every `(protected)/**/page.tsx` MUST resolve to exactly one route family and
  be reachable from at least one navigation entry. Orphan routes (live page,
  zero inbound link) are drift; triage to either wire nav or delete, after
  confirming there is no dynamic-only entry (`router.push`, redirect,
  `revalidatePath`).
- Gate (Stage 0): a route-manifest reachability check globs the route tree and
  asserts (a) each page resolves via `module-acl` to one family, (b) each
  navigable leaf has an inbound nav entry, (c) no two nav items in a shell share
  an `href`.

### C.1 Record Depth And Row Open

Every LIST row represents a record. A record has exactly one **canonical view**
and exactly one **address** for that view. Opening a record view always changes
the URL. Tasks that end (short CRUD, confirm) are not views and are not
addressable. Full decision table: ADR 0018.

Declare each record's depth once per family:

- **D2 (independent workspace)** — DETAIL route `{basePath}/{id}`; row click
  navigates there. Use it for long-running sessions whose list is no longer the
  operator's working context, such as stocktake or production.
- **D1 (addressable overlay)** — no DETAIL route; view opens in an overlay bound
  to one list query parameter (`?<entity>Id=`), hydrated from the server on
  first load, and cleared on close. Row open uses `router.push`; mode changes
  and close use `router.replace`. Owner may use side `Sheet` or `AppDialog`;
  Branch may use bottom `Sheet` / `Drawer` at the same depth.
- **D1 document (addressable overlay)** — a list-first staged document may
  render lines and a state-transition footer in
  `AppDialog variant="document"` when each state exposes exactly one primary
  action. This named tier applies to purchase demand, PO, GRN, and the
  Owner/Ops YCH/Transfer fulfillment journey; it is not a generic exception
  for long-running authoring.
- **D1 task (non-addressable)** — `FormDialog` / short `AppDialog` for master
  CRUD or a single bounded decision that ends.
- **D3** — line-array authoring only; never a row-open target for an existing
  record's canonical view.
- **D0 queue** — named card/decision surfaces (for example Owner waste
  approvals) where the card is the work, not a tabular row open. Owner chrome
  is `AppPage` + `AppSection` decision cards — never `InventoryListFrame` /
  `DataTable`.

A record escalates from D1 view to D2 when the record itself becomes an
independent, long-running workspace, or when a state requires more than one
primary action. A line array or stage-transition footer alone does not escalate
an approved D1 document. Recipes that remain D1 task (`FormDialog`) escalate
when BOM lines **> 12** (ADR 0018 **C3**).

**Forbidden:** a record with two rendered views (a legacy DETAIL redirect is
allowed); a record view reachable only from ephemeral component state; a row
whose body click and whose context/long-press lead to different destinations;
`Popover` as a record view.

**Three doors** share one `RowActionItem[]`: row body, `RowActionsMenu` action
cell, and `renderRowContextMenu`. Context menu is additive only. Zero-action
LIST rows (no action cell) are legal when the row body alone is the view path
(ADR 0018 **C4**).

**Planes:** Owner and Branch MUST declare the same depth for the same record and
MAY use different frames at that depth. A depth mismatch across planes is drift.

#### Canonical operator-home skeleton (no KPI)

The Branch branch home — the only branch home kind — uses ONE ordered home
recipe (owner-approved):

1. **Primary CTA** — the single next safe action for this landing.
2. **Live queue panel** — the landing's active work, live.
3. **Curated job tiles** — the landing's next jobs, as tiles.

The recipe varies only in which slots and data populate it, never in the
structure. Numbers appear as **badges on tiles / sections ONLY** — there are NO
KPI / stat cards on operator surfaces (reaffirms the operator no-KPI rule: an
operator home is job-first, not a dashboard). A landing that opens with a stat-card
mosaic instead of `[primary CTA] → [live queue panel] → [curated job tiles]` is
drift.

### D. Navigation Single-Source

- Navigation is data, not per-shell code. Every control_surface route renders
  the same primary tabs from `resolveControlSurfacePrimaryTabs`
  (`apps/web/app/lib/control-surface-nav.ts`, projected from
  `packages/shared/src/auth/nav-config.ts` via `resolveControlSurfaceNavGroups`). Deep nav
  comes from `resolveControlSurfaceDeepNav` (core / inventory / finance
  resolvers). Inline `ShellNavGroup[]` literals inside a shell are forbidden
  (gate `nav-shell-inline-literal`).
- Tablet/desktop sidebar and mobile bottom-nav render from the same resolved
  model for a role; they may differ in density and item count, never in
  membership source.
- Active-state matching uses the single `isNavItemActive` helper
  (`apps/web/app/lib/shell-primitives.ts`); per-surface `startsWith` / `isActive`
  reimplementations are forbidden.
- The matrix → ACL → nav-config chain is a deliberate mirror. A Stage-0
  `nav-acl` check asserts every rendered nav `href` resolves to a known
  `MODULE_ACL` path and that nav-config covers the matrix families, so the
  matrix is materialized, not aspirational.

### E. Page Padding Authority

- Outer page padding is applied once and should not compound. `AppPage`
  (`apps/web/app/components/surface.tsx`) supplies the default scale and is
  nesting-aware.
- The control_surface frame padding is applied once by `AppShell` `<main>`;
  `AppPage` defers to it through `AppShellPaddingBoundary`. An `AppPage` mounted
  inside `AppShell` main drops its own padding while keeping its centered
  max-width; an `AppPage` mounted inside another `AppPage` drops both padding and
  max-width; a standalone `AppPage` (operations, employee, public) applies both
  itself. Surfaces therefore never double-pad.
- A page can compose local padding or width when the workflow needs it. Review
  the rendered outer edge and ensure it does not visually duplicate a parent
  container; do not enforce this with a class-string or file allowlist.

### F. Page Archetypes

Every `apps/web/app/**/page.tsx` renders exactly one page archetype — a shared
recipe for its layout skeleton, data-display idiom, states, and shared
status/money/date/navigation vocabulary. The archetype taxonomy and
per-archetype recipes live in `docs/spec/page-archetypes.md`, a subordinate
contract under this file (on conflict, this file wins). A new archetype is a
contract change here first, the same rule that governs Chrome Archetypes in
§ A. Enforcement is a mapping-presence gate in `scripts/check-ui-contract.mjs`
(`PAGE_ARCHETYPES`): every route page must be declared with a valid archetype
id, and an undeclared new page fails CI pointing at the spec. Public customer
transactions use the `PUBLIC-WORKFLOW` recipe; offline/pre-context screens use
`GATE/AUTH`.

### Enforcement

Runtime guard ownership lives in `scripts/check-ui-contract.mjs`,
`scripts/ui-contract-guard-reporting.mjs`, `scripts/ui-component-registry.mjs`,
and `scripts/ui-contract-scope.mjs`. Run `corepack pnpm audit:ui-components`
for current counts and findings. This contract does not preserve dated audit
results, guard inventories, exception history, or open-debt snapshots; use the
scripts, current source, task tracker, and git history.

#### Measured exception semantics

An exception is valid only when a guard measures a real outcome and the source
has a documented reason. It is not entitlement to preserve an implementation.
Dynamic counts and the current classification belong to
`scripts/ui-contract-guard-reporting.mjs` and `corepack pnpm audit:ui-components`.

## Loading / Error / Not-found Frame

Route-level transition states are part of the design system, not per-page improvisation.

- Every route family exposes `loading.tsx` built from `PageSkeleton` / `PageSpinner` (`apps/web/app/components/page-skeleton.tsx`). Do not hand-roll new ad-hoc route skeleton layouts; POS keeps its purpose-built `PosPageSkeleton`.
- KDS, runner, and other realtime boards use `PageSpinner`, never a placeholder board skeleton — fake tickets on an operational screen are forbidden.
- Every route family exposes `error.tsx` delegating to `ErrorPanel` (`apps/web/app/components/error-panel.tsx`): `AppEmptyState mode="error"` with retry via `reset()` as the sole primary action at `size="touch"`. Sign-out is not a peer of retry: `ErrorPanel` renders it only under the opt-in `allowSignOut` prop, at subordinate weight (`variant="ghost" size="sm"`), and only the app-wide boundary `apps/web/app/error.tsx` enables it. Station and route-family boundaries (POS, KDS, runner, operator stock/settings, and the owner families) stay retry-only so a mis-tap cannot end a session mid-service. `apps/web/app/global-error.tsx` is the single surface allowed to use inline styles, because root CSS may be unavailable when it renders; its raw retry control still keeps the `44px` minimum touch target.
- Not-found renders through `NotFoundPanel` (`apps/web/app/components/not-found-panel.tsx`); `apps/web/app/not-found.tsx` covers the app, and per-family `not-found.tsx` exists only where `notFound()` is called and a shell is worth preserving.
- Copy for these frames comes from `@comtammatu/shared/messages` (`ACTIONS_VI`, `STATES_VI`, `ERRORS_VI`); do not inline new Vietnamese strings here.
- `app-presentation-state-copy` keeps route-local loading/empty/error copy in shared messages/adapters across `apps/web/app/**/*.tsx`. Payment/action/data `.ts` copy is reported as `actionDataStateCopy` by `audit:ui-components` and blocked by `app-action-data-state-copy`.

## Copy Contract

- Internal UI copy is Vietnamese by default.
- Keep established acronyms: `POS`, `KDS`, `tenant`, `GRN`, `WAC`.
- Do not introduce new synonyms for business states or workflow objects.
- Copy source ladder: business meaning and spelling in `docs/ref/glossary.md`; shared domain labels in `packages/shared/src/labels/vi.ts`; generic actions/states/errors in `@comtammatu/shared/messages` or `apps/web/lib/messages/*`; legal-fixed labels in `packages/shared/src/labels/legal-fixed.ts`; route-specific adapters in the relevant domain dictionary.
- Before adding labels, update or consume the correct source in that ladder rather than adding ad-hoc inline synonyms.
- Utility copy beats marketing copy on app surfaces.
- Secondary copy budget: page/`AppSection` description ≈ one idea, ≤ ~80 characters; KPI/field hint ≈ ≤ ~60 characters. Drop the prop when it restates the title or does not change the next action. Destructive confirm copy (refund, void, SePay) keeps the risk meaning; only trim fluff.
- Layout safety: `AppSection` descriptions use `line-clamp-2`; `AppPageHeader` descriptions clamp to two lines on `max-sm` (and stay hidden when `compactOnMobile`); `CompareChip` hints truncate. Do not clamp `FieldDescription` — shorten the copy instead. `CardDescription` primitive stays unclamped so dialogs can show full text.

## Rebuild Rules For Agents

Before any UI rebuild task:

1. Read `AGENTS.md`, this file, `docs/modules/ui.md`, `tasks/regressions.md`, and the relevant domain docs.
2. Confirm whether touched files use current app surface adapters, semantic tokens, and approved font utilities.
3. State the surface, primary user job, affected route family, and shared components to use.
4. Confirm whether the task is a visual refactor, UX flow change, copy change, or behavior change.
5. Keep each PR to one route family or one shared-component rollout wave.
6. If the implementation needs a new pattern, update this contract before applying the pattern broadly.

Before marking a UI task complete:

- No fake shared components.
- No arbitrary Tailwind dimensions.
- No static presentation inline styles.
- No route-specific theme layer.
- No duplicated workflow state.
- No new vocabulary drift.
- Mobile first viewport still exposes the next action or live queue for POS/KDS.
- `pnpm typecheck && pnpm lint && pnpm build` passes before marking implementation complete.
