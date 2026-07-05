# UI Rules

Use this file before changing UI, UX, route surfaces, styling, frontend copy, Má Tư DS components, or operational POS/KDS flows.

Also read `docs/agent/rules/skills.md` for skill/tool routing. The Custom Theme
contract below binds every external tool (Guardrails).

## Source Of Truth

There is exactly one UI design-system source of truth:

- `docs/spec/design-system.md`

That source defines the Com Tam Ma Tu Custom Theme. Má Tư DS primitives in
`@comtammatu/ui` are runtime evidence, not a higher design authority.

Everything else is evidence, implementation, or enforcement for that contract,
not a second authority:

- `docs/modules/ui.md` explains how to apply the contract.
- `tasks/regressions.md` records negative rules from past failures.
- `packages/ui/src/components/*` and `apps/web/app/components/surface.tsx` are
  runtime implementation and adapter evidence, not competing design systems.

Non-current visual-layer strings and non-current design-folder paths are blocked
by `scripts/check-ui-contract.mjs` / `corepack pnpm lint:ui-contract`. Any new visual
token layer requires a design-system contract change first.

These recently-locked contracts live in `docs/spec/design-system.md` — read them
there, do not restate them here:

- Uppercase label role (one role = one size, never viewport-scaled) and the KDS
  kitchen item-name scale: § Rhythm B (Heading Scale).
- Heading-weight lock (`font-semibold` default; `font-bold` = receipt totals +
  print-mode page headers; named POS-item-over-photo exception): § Rhythm B.
- Sticky operator action-bar `gap-2` and the operator section-stack density rule
  (no fresh `flex flex-col gap-*` stack; sections are `AppPage` children): § A
  Spacing Rhythm.
- Tint Opacity Scale (`/10` fill, `/15` fill-strong, `/20` hairline-border;
  muted `/30` `/50` only): § Token Contract → Tint Opacity Scale.
- Callout / tint-chrome routing (tinted bordered box → `Alert` / `NoteCallout`;
  canonical warning = `NoteCallout tone="warning"`): § Token Contract → Callout /
  tint chrome routing and § Component Authority.
- Canonical operator-home skeleton (`[primary CTA] → [live queue panel] →
  [curated job tiles]`, badges not KPI cards): § Structural Governance → C. Route
  Home + IA.

## Guardrails

- NEVER invent or redesign the UI outside the project's established design system.
- NEVER exceed authority when editing UI; only make UI changes explicitly requested or clearly required by the task.
- NEVER put agent notes, dev commit notes, implementation explanations, or internal commentary into user-facing UI.
- ALWAYS follow project UI rules and regressions before changing any interface.
- BEFORE adding or changing Admin, Inventory, Finance, Reports, or overview
  cards/titles/KPIs, read `docs/ref/operational-data-contract.md`. Every metric
  card must bind to a contract key or an existing workflow/entity contract; if
  no contract exists, update the contract before changing UI.
- USE Má Tư DS primitives from `@comtammatu/ui` and the app surface adapters as
  the default implementation path after `docs/spec/design-system.md` has
  selected the pattern.
- NEVER treat external UI scaffold output as authority to override the Custom Theme contract.
- NEVER treat `globals.css`, app wrappers, regression notes, external skill files, or worklogs as competing UI authorities.
- NEVER override the visual contract of core primitives through ad-hoc wrappers, custom themes, or parallel surface systems.
- USE `apps/web/app/components/surface.tsx` for repeated app-level page/header/section/toolbar/empty/link-card patterns; domain wrappers must delegate to it instead of cloning layout/chrome. No separate visual-token layer or compatibility wrapper for app UI.
- REMOVE stale UI rules; keep only live hard rails, workflows, contracts, or guards.
- BEFORE UI/UX rebuild work, read and follow `docs/spec/design-system.md` as the locked Custom Theme contract.
- BEFORE building or changing any page, consult `docs/spec/page-archetypes.md` (archetype recipe + exemplar) and the Shared Component Registry in `docs/modules/ui.md` § Shared Component Registry. Answer "where is component X used" with `codegraph_explore` / `codegraph_callers` or `pnpm audit:ui-components` — NEVER by grep-guessing or by cloning a component you found once.
- UI/UX rebuild PRs MUST state the surface, primary user job, route family, change type, and primitives used before implementation.

## Typography Rules

- Ma Tu Concept 01 typography is fixed: Geist for body/content and headings/titles, and Geist Mono for tabular operational data.
- Runtime source is `apps/web/app/layout.tsx` (the `geist` package) plus `packages/ui/src/styles/globals.css`; use `font-sans`, `font-heading`, and `font-mono` instead of raw `font-family`.
- NEVER add route-specific fonts, per-surface font variables, extra font families, or hardcoded fallback stacks.
- NEVER reintroduce `Be Vietnam Pro`, `Inter`, `Montserrat`, `JetBrains Mono`, system-only typography, or route-specific font variables unless the design-system contract is explicitly changed first.
- When changing typography, update `docs/spec/design-system.md`, `docs/modules/ui.md`, `tasks/regressions.md`, and runtime artifacts in the same change.

## Operational UI Philosophy

- Treat `/br/[branchId]/pos` and `/br/[branchId]/kds` as frontline operational surfaces, not dashboards.
- Mobile-first for operational routes: the first viewport must show the next safe action or the live queue, not decorative hero/status chrome.
- Once staff lock context such as session, table, station, or order, compact the UI and give space back to the primary task.
- One workflow state should have one visual source of truth. Do not repeat the same state in header, rail, sidebar, gate, and board.
- A list surface exposes exactly ONE filter control per facet — never chips AND Tabs for the same axis. A per-row status badge is item-state, not a filter, and does not count as a second control.
- Cart is for creating a new order only. After submit, order mutations MUST happen from order detail or order history flows.
- Desktop may add density, secondary insight, or faster scan surfaces, but MUST NOT create a different IA from mobile.
- Prefer real Má Tư DS primitives (`Tabs`, `Badge`, `Button`, `Card`, `Sheet`, `Select`, `Table`, `Dialog`) before styling raw `div` or `button` controls.
- Use a single vocabulary for the same workflow state across POS and KDS. Do not rename the same concept per surface.
- Keep destructive actions visually separated from primary actions and always require confirmation or a safe recovery path.

## Regression Rules To Recheck

Read `tasks/regressions.md` before UI work, especially:

Use targeted lookup instead of loading the whole file:

```bash
rg -n "DESIGN-SYSTEM|UI-|PRIMITIVE-FIRST|NO-PRIMITIVE|NO-FAKE|NO-ARBITRARY|NO-SURFACE|NO-STATIC|NO-RETIRED|APP-SURFACE|STATUS|DataTable|FORMDIALOG|EMPTY|LOADER|RAW-TABLE|PAGE-HEADER|RHYTHM|SHELL|NAV|PADDING" tasks/regressions.md
```

Separate the enforcement lane before acting: `DESIGN-SYSTEM-ONE-SOURCE-ONLY`
is a lint-anchor, many runtime/rhythm rules are covered by
`corepack pnpm lint:ui-contract`, and review-checklist rules still need route-family
inspection.

- `DESIGN-SYSTEM-CONTRACT-FIRST`
- `NO-ARBITRARY-DIMENSIONS`
- `NO-SURFACE-THEME-IMPORTS`
- `NO-STATIC-UI-INLINE-STYLES`
- `TERMINOLOGY-SOURCE-OF-TRUTH`
- `PRIMITIVE-FIRST-UI`
- `NO-PRIMITIVE-DESIGN-OVERRIDE`
- `DOCS-MUST-MATCH-RUNTIME`
- `NO-RETIRED-APP-HELPERS`
- `NO-FAKE-PRIMITIVES`
- `APP-SURFACE-ADAPTER-FIRST`
- `NO-INLINE-CHROME-REIMPL`
- `NO-RADIUS-TIER-MISALIGN`
- `NO-SPACE-Y-SECTION-STACK`

New machine-checked dimensions (frozen-baseline gates in
`scripts/check-ui-contract.mjs`, advisory-with-baseline like the others —
current debt is frozen per file and only burns down): `tint-opacity`,
`uppercase-label-scale`, the widened `inline-chrome-baseline`, and the widened
`stat-card-ssot` name set.
