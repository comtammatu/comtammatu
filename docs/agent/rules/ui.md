# UI Rules

Use this file before changing UI, UX, route surfaces, styling, frontend copy, shadcn components, or operational POS/KDS flows.

## Source Of Truth

There is exactly one UI design-system source of truth:

- `docs/spec/design-system.md`

Everything else is evidence, implementation, or enforcement for that contract,
not a second authority:

- `docs/modules/ui.md` explains how to apply the contract.
- `tasks/regressions.md` records negative rules from past failures.
- `apps/web/components.json` and `packages/ui/components.json` are runtime
  shadcn config evidence that must conform to the contract.
- `packages/ui/src/components/*` and `apps/web/app/components/surface.tsx` are
  runtime implementation and adapter evidence, not competing design systems.

The retired Inventory pilot visual layer (`matu-surface`, `matu-*` tokens,
`font-matu-body`, kitchen-sink route, external design folders) is enforced
out by `scripts/check-ui-contract.mjs` / `pnpm lint:ui-contract`. Treat any
new occurrence as a contract violation; do not reintroduce that layer unless
`docs/spec/design-system.md` is explicitly changed first.

External references:

- Shadcn UI Docs: https://ui.shadcn.com/docs/
- Installation: https://ui.shadcn.com/docs/installation/
- Preset: https://ui.shadcn.com/create?preset=buFywKm
- Components: https://ui.shadcn.com/docs/components/
- Preset command: `pnpm dlx shadcn@latest init --preset buFywKm --template next --monorepo --base radix`

## Guardrails

- NEVER invent or redesign the UI outside the project's established design system.
- NEVER exceed authority when editing UI; only make UI changes explicitly requested or clearly required by the task.
- NEVER put agent notes, dev commit notes, implementation explanations, or internal commentary into user-facing UI.
- ALWAYS follow project UI rules and regressions before changing any interface.
- USE `shadcn/ui` components and the project's active preset as the default UI path.
- NEVER override the visual contract of core primitives through ad-hoc wrappers, custom themes, or parallel surface systems.
- USE `apps/web/app/components/surface.tsx` for repeated app-level page/header/section/toolbar/empty/link-card patterns; domain wrappers must delegate to it instead of cloning layout/chrome.
- NEVER use `matu-surface`, `font-matu-body`, `bg-matu-*`, `text-matu-*`, `border-matu-*`, `rounded-matu-*`, `--spacing-matu-*`, or `--radius-matu-*` for app UI. Treat any touched usage as a regression unless the owner explicitly reactivates that layer through `docs/spec/design-system.md`.
- BEFORE UI/UX rebuild work, read and follow `docs/spec/design-system.md` as the locked design-system contract.
- UI/UX rebuild PRs MUST state the surface, primary user job, route family, change type, and primitives used before implementation.

## Typography Rules

- Ma Tu Concept 01 typography is fixed: Inter for body/content, Montserrat for headings/titles, and JetBrains Mono for tabular operational data.
- Runtime source is `apps/web/app/layout.tsx` plus `packages/ui/src/styles/globals.css`; use `font-sans`, `font-heading`, and `font-mono` instead of raw `font-family`.
- Static public UI artifacts such as `docs/status/index.html` must mirror the same font stack with local CSS variables.
- NEVER add route-specific fonts, per-surface font variables, extra Google font families, or hardcoded fallback stacks.
- NEVER reintroduce `Be Vietnam Pro`, Geist, system-only typography, `font-matu-body`, or `font-heading → font-sans` unless the design-system contract is explicitly changed first.
- When changing typography, update `docs/spec/design-system.md`, `docs/modules/ui.md`, `tasks/regressions.md`, and runtime/static artifacts in the same change.

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

- `DESIGN-SYSTEM-CONTRACT-FIRST`
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
