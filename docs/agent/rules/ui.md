# UI Rules

Use this file before changing UI, UX, route surfaces, styling, frontend copy, shadcn components, or operational POS/KDS flows.

## Source Of Truth

The current runtime UI has one frozen maintenance contract:

- `docs/spec/design-system.md`

That file is not UX rebuild authority. It describes the legacy runtime visual
system that exists today and is frozen until the owner approves a new UX
reference/direction.

For broad UX rebuild work, no design-system source of truth exists yet. Before
any runtime layout, component, token, or copy rebuild starts outside the scoped
Khung quản trị slice, agents must first update the authority set in one change:

- `docs/spec/design-system.md`
- `docs/agent/rules/ui.md`
- `docs/modules/ui.md`
- `tasks/regressions.md`
- `scripts/check-ui-contract.mjs`

Everything else is evidence, implementation, or enforcement for the active
contract, not a second authority:

- `docs/modules/ui.md` explains how to apply the contract.
- `tasks/regressions.md` records negative rules from past failures.
- `apps/web/components.json` and `packages/ui/components.json` are runtime
  shadcn config evidence that must conform to the contract.
- `packages/ui/src/components/*` and `apps/web/app/components/surface.tsx` are
  runtime implementation and adapter evidence, not competing design systems.

Legacy Inventory pilot artifacts are retired from runtime app UI and are not
authority for maintenance UI or rebuild UI:

- removed `packages/design-tokens/tokens.json`
- removed `packages/ui/src/styles/matu-tokens.css`
- removed `apps/web/app/components/matu-surface.tsx`
- removed `apps/web/app/(protected)/admin/kitchen-sink/page.tsx`
- external `~/Downloads/matu-superapp/DESIGN.md`

Frozen runtime references:

- Shadcn UI Docs: https://ui.shadcn.com/docs/
- Installation: https://ui.shadcn.com/docs/installation/
- Components: https://ui.shadcn.com/docs/components/
- Current `apps/web` runtime preset evidence: https://ui.shadcn.com/create?preset=buFywKm
- Current `apps/web` runtime preset command evidence: `pnpm dlx shadcn@latest init --preset buFywKm --template next --monorepo --base radix`

Approved scoped rebuild:

- Khung quản trị / shared management shell chrome may be rebuilt now under
  the scoped rebuild authority in `docs/spec/design-system.md`.
- Use installed shadcn primitives first.
- Do not run `shadcn init --preset b6FS5q9aq` until the owner chooses the
  switch mode: reinstall, merge, or skip.

## Guardrails

- NEVER start UX rebuild implementation from the frozen legacy runtime contract.
- NEVER patch current `AppShell`, `surface.tsx`, route layouts, typography,
  palette, spacing, or shell IA as a rebuild before the new authority set exists.
- NEVER invent or redesign the UI outside the owner-approved design-system contract.
  During the freeze, no broad rebuild contract is active; only the scoped
  Khung quản trị rebuild authority is active.
- NEVER exceed authority when editing UI; only make maintenance UI changes
  explicitly requested or clearly required by the task.
- NEVER put agent notes, dev commit notes, implementation explanations, or internal commentary into user-facing UI.
- ALWAYS follow project UI rules and regressions before changing any interface.
- For maintenance-only UI work, USE `shadcn/ui` components and the frozen
  current-runtime preset evidence as the default UI path.
- For UX rebuild work, USE `shadcn/ui` components only after the
  owner-approved authority reset defines the new preset/tokens/components.
- NEVER override the visual contract of core primitives through ad-hoc wrappers, custom themes, or parallel surface systems.
- For maintenance-only work, use `apps/web/app/components/surface.tsx` for repeated app-level page/header/section/toolbar/empty/link-card patterns; domain wrappers must delegate to it instead of cloning layout/chrome.
- NEVER use `matu-surface`, `font-matu-body`, `bg-matu-*`, `text-matu-*`, `border-matu-*`, `rounded-matu-*`, `--spacing-matu-*`, or `--radius-matu-*` for app UI. Treat any touched usage as a regression unless the owner explicitly reactivates that layer through `docs/spec/design-system.md`.
- BEFORE UI/UX rebuild work, treat `docs/spec/design-system.md` as frozen legacy runtime evidence and replace/update it after the owner-approved UX reference.
- UI/UX rebuild PRs MUST state the surface, primary user job, route family, change type, and primitives used before implementation.

## Typography Rules

- For maintenance-only work, Ma Tu Concept 01 typography is fixed: Inter for body/content, Montserrat for headings/titles, and JetBrains Mono for tabular operational data.
- Runtime source is `apps/web/app/layout.tsx` plus `packages/ui/src/styles/globals.css`; use `font-sans`, `font-heading`, and `font-mono` instead of raw `font-family`.
- Static public UI artifacts such as `docs/status/index.html` must mirror the same font stack with local CSS variables.
- NEVER add route-specific fonts, per-surface font variables, extra Google font families, or hardcoded fallback stacks.
- NEVER reintroduce `Be Vietnam Pro`, Geist, system-only typography, `font-matu-body`, or `font-heading → font-sans` unless the design-system contract is explicitly changed first.
- When changing typography for the rebuild, update `docs/spec/design-system.md`, `docs/modules/ui.md`, `tasks/regressions.md`, `scripts/check-ui-contract.mjs`, and runtime/static artifacts in the same authority-reset change.

## Operational UI Philosophy

- Treat `/br/[branchId]/pos` and `/br/[branchId]/kds` as frontline operational surfaces, not dashboards.
- Mobile-first for operational routes: the first viewport must show the next safe action or the live queue, not decorative hero/status chrome.
- Once staff lock context such as session, table, station, or order, compact the UI and give space back to the primary task.
- One workflow state should have one visual source of truth. Do not repeat the same state in header, rail, sidebar, gate, and board.
- Cart is for creating a new order only. After submit, order mutations MUST happen from order detail or order history flows.
- Desktop may add density, secondary insight, or faster scan surfaces, but MUST NOT create a different IA from mobile.
- Prefer real shadcn primitives (`Tabs`, `Badge`, `Button`, `Card`, `Sheet`, `Select`, `Table`, `Dialog`) before styling raw `div` or `button` controls.
- Use a single vocabulary for the same workflow state across POS and KDS. Do not rename the same concept per surface.
- Keep destructive actions visually separated from primary actions and always require confirmation or a safe recovery path.

## Regression Rules To Recheck

Read `tasks/regressions.md` before UI work, especially:

- `UX-REBUILD-NOT-ON-FROZEN-LEGACY-AUTHORITY`
- `UX-REBUILD-AUTHORITY-RESET-FIRST`

Rules that mention current spacing, typography, `AppPageHeader`, `AppEmptyState`,
`AppShell`, `surface.tsx`, `buFywKm`, or Ma Tu Concept 01 are frozen-runtime
maintenance guardrails only. They must not be used as the UX rebuild direction
or acceptance criteria after the owner-approved authority reset.

- `NO-ARBITRARY-DIMENSIONS`
- `NO-SURFACE-THEME-IMPORTS`
- `NO-STATIC-UI-INLINE-STYLES`
- `TERMINOLOGY-SOURCE-OF-TRUTH`
- `PRESET-FIRST-UI`
- `NO-PRIMITIVE-DESIGN-OVERRIDE`
- `DOCS-MUST-MATCH-RUNTIME`
- `NO-LEGACY-APP-HELPERS`
- `NO-FAKE-PRIMITIVES`
- `APP-SURFACE-ADAPTER-FIRST`
