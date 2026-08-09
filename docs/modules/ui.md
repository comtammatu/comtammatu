# UI Module

## Overview

Repo UI is the **Má Tư Design System** (Custom Theme runtime) on shared
components `@comtammatu/ui`. Base UI is the behavioral primitive layer; lucide,
Tailwind, and CVA are implementation dependencies — not visual authority.

This file is a **thin implementation map**: adapters, forms, overlays, and composition
in app code. Do not override Má Tư tokens/roles; do not replace Base UI behavior.

## Contract Boundary

**3+1 read order** (required):

1. `docs/spec/design-system.md` — visual tokens, rhythm, structural chrome
2. `docs/spec/page-archetypes.md` — page/workflow recipes + UI Advisor Gate
3. `docs/ref/screen-context-map.md` — audience, device, route context
4. **This file** — thin impl map (`packages/ui` + `apps/web` adapters)

When needed: `docs/agent/rules/ui.md` (agent guardrails),
`tasks/regressions.md` (negative rules), domain docs for the route under change.

Branch operator landing / plane IA: see `docs/ref/screen-context-map.md` §2.4A,
`docs/spec/page-archetypes.md`, and `docs/ref/branch-route-inventory.md` — do not
duplicate mega-section landing content here.

External scaffold / Stitch does not outrank the Má Tư contract. New code uses
`apps/web/app/components/surface.tsx`, `BrandMark` / `BrandLockup` /
`BrandSymbol` / `BrandMascot`, semantic tokens, and current font utilities. New visual
layers → update `design-system.md` before rollout.

## Shared Component Runtime Contract

Current runtime: Má Tư DS shared components in
`packages/ui/src/components/*` for monorepo `apps/web` + `packages/ui`. Shared
components use Base UI for behavior; semantic tokens and visual recipes follow
`docs/spec/design-system.md`.

- Only `packages/ui` imports `@base-ui/react`; apps go through `@comtammatu/ui`
- `Select` keeps compound API; root maps `SelectItem` → Base UI `items` so
  `SelectValue` resolves label (explicit `items` preferred)
- Logo/symbol/mascot via brand components — no hardlink `/brand/*` from routes
- No `app-*` helper classes or separate theme chrome root

## Shared Component Layer

Source: `packages/ui/src/components/*` via `@comtammatu/ui` (`button`, `card`,
`table`, `dialog`, `sheet`, `tabs`, `input`, `select`, `combobox`,
`date-picker`, `pagination`, `resizable`, `toolbar`, `empty`, `field`, `item`,
`spinner`, …). Do not fork shared components per surface.

Prefer named props: `flush` for table-edge/list-edge alignment and
`scroll` for horizontal table scrolling; `AppSection` uses `contentFlush` /
`contentScroll` for the same roles. Surfaces with distinct workflows may compose
equivalent spacing/overflow when they do not create competing chrome.

## App Surface Adapters

`apps/web/app/components/surface.tsx` is the adapter layer for repeated patterns:

- `AppPage` — width / padding / scroll rhythm
- `AppPageHeader` — H1, description, badge, actions. On control_surface
  (AppShell), **do not** use `eyebrow` to repeat module name / sidebar synonym —
  sidebar + deep-nav already carry context. Eyebrow only when adding real context
  (site-kind, drill-down) that title/back link does not state.
  `AppPageHeader` scrolls with content inside the shell scrollport
  (`data-owner-shell-scroll`); no sticky header outside the scrollport.
- `AppSection` — card-backed section (`contentFlush` / `contentScroll`)
- `AppToolbar` — filter/action toolbar
- `AppEmptyState` — empty / no-result / error
- `DataTable` — sole responsive table adapter; `AppToolbar` precedes page-owned
  filter/URL state. Prefer
  `AppPage` → `AppPageHeader` → `AppListFrame toolbar={<AppToolbar variant="inline" />}`
  → `DataTable`. `InventoryListFrame` is a compatibility alias of `AppListFrame`.
- LIST filters stick via `AppStickyFilterChrome` /
  `APP_PAGE_STICKY_FILTER_CLASSNAME`. `AppPageStickyChrome` is a compatibility
  alias of that sticky filter chrome.
- `AppLinkCard` / `LinkCardGrid` / `KpiRow`+`KpiCard` (metric only) /
  `DescriptionList` / `DocumentFormFrame` / `SettingsPageFrame` /
  `AppDetailFooter`

Domain wrappers keep a separate API only when they delegate 100% to these adapters.
`KpiCard` is metric-only; other cards → `AppSection` / `AppLinkCard` /
`OperationalBoardCard` / `DataTable.mobileCardRender`.

## Component Selection

Registry executable: `scripts/ui-component-registry.mjs`. Guard runtime:
`scripts/check-ui-contract.mjs`, reporting
`scripts/ui-contract-guard-reporting.mjs`, scope
`scripts/ui-contract-scope.mjs`. Look up before composing:

```bash
corepack pnpm audit:ui-components --component <name-or-block>
```

Choose by semantic job. No match → check nearest adapter before adding shared API.
`interactive-card.tsx` under `data-table/` is only a re-export compatibility shim
for shared `InteractiveCard`.

UI block ids in the registry are recipe metadata (do not import `*Block`). Page
archetype + disposition: `docs/spec/page-archetypes.md`.

## Overlay Decision

Plane-neutral tree — ADR 0018 / `design-system.md` § C.1. Summary:

1. Destructive without input → `confirm()`; with reason → `ReasonConfirmDialog`
2. Task (ends) vs view (workplace) → task not addressable; view addressable
3. Task frame: fields → `FormDialog`; short decision → `AppDialog`; touch →
   bottom `Sheet`/`Drawer`
4. View: long workspace → Page (DETAIL/DOC-WORKFLOW); list-first → overlay
   `?<entity>Id=`; document list-first Owner/Ops →
   `AppDialog variant="document"`

`Popover` is not a record view / multi-step workflow.

## Form And Feedback (short)

- Complex forms: RHF + Zod + `apps/web/app/components/form/*`
- Plain `<form action>` only for auth / sign-out / single-reason confirm
- Success → Sonner; validation → inline field; permission → `/access-denied`
- Toast durable: `docs/spec/toast-notification-system.md`
- Theme: `ThemeToggle` + design-system Token Contract (no localStorage scope)

## Composition Rules

- Mobile baseline; desktop adds density without changing IA
- One primary action / state; destructive separated and confirmed
- POS/KDS share status vocabulary
- Empty / loading / error / denied must have clear treatment
- No agent notes / implementation commentary in product UI
