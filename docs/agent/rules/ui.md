# UI Rules

Use this file before changing UI, UX, route surfaces, styling, frontend copy, shadcn components, or operational POS/KDS flows.

## Source Of Truth

- `docs/spec/design-system.md`
- `docs/modules/ui.md`
- `tasks/regressions.md`
- `apps/web/components.json`
- `packages/ui/components.json`

External references:

- Shadcn UI Docs: https://ui.shadcn.com/docs/
- Installation: https://ui.shadcn.com/docs/installation/
- Preset: https://ui.shadcn.com/create?preset=b6G3vbGue
- Components: https://ui.shadcn.com/docs/components/
- Preset command: `pnpm dlx shadcn@latest init --preset b6G3vbGue --template next --monorepo --base radix`

## Guardrails

- NEVER invent or redesign the UI outside the project's established design system.
- NEVER exceed authority when editing UI; only make UI changes explicitly requested or clearly required by the task.
- NEVER put agent notes, dev commit notes, implementation explanations, or internal commentary into user-facing UI.
- ALWAYS follow project UI rules and regressions before changing any interface.
- USE `shadcn/ui` components and the project's active preset as the default UI path.
- NEVER override the visual contract of core primitives through ad-hoc wrappers, custom themes, or parallel surface systems.
- BEFORE UI/UX rebuild work, read and follow `docs/spec/design-system.md` as the locked design-system contract.
- UI/UX rebuild PRs MUST state the surface, primary user job, route family, change type, and primitives used before implementation.

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

