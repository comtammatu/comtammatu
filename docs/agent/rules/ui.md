# UI, UX, Route Surface, And Copy Rules

Read this file before UI, UX, route surface, styling, component, or copy changes.
It controls agent workflow. Má Tư visual contract, primitive behavior and route
workflow have separate owners; do not use one to overrule another concern.

## Authority

Read in order:

1. `docs/spec/design-system.md` — Má Tư tokens, typography, density, theme,
   visual state and motion recipes.
2. `docs/spec/page-archetypes.md` — page/workflow composition and UI Advisor Gate.
3. `docs/ref/screen-context-map.md` — audience, device, route context.
4. `docs/modules/ui.md` and `packages/ui/src/components/*` — Base behavior,
   adapters and implementation map.
5. Target route/component and targeted `tasks/regressions.md` rows.

Do not restate exact class strings, typography scales, theme storage, primitive
APIs, or page-archetype contracts here. Update their owner when runtime changes.

## Scope And UI Advisor Gate

Before editing, declare the surface, user job, device/viewport, route family,
change type, and authority granted by the task. Complete
`page-archetypes.md` § 0.1 before external design advice.

- If the archetype and visual contract already decide the shape, implement them.
- If a real hierarchy/interaction choice remains, use the smallest set of
  independent design reviewers that can add distinct evidence; their output is
  advisory.
- A typo/editorial copy change may be T1. Layout, hierarchy, state, navigation,
  interaction, or multi-surface changes follow `workflow.md` T2/T3.

## Operational UI Invariants

- Workflow and operator state come before dashboard decoration.
- Mobile/touch is the primary operational baseline; desktop may add density but
  not a different information architecture.
- One primary action per state. Secondary summaries do not duplicate the same
  control.
- Cart creates a new order; post-submit mutations live in order detail/history.
- POS and KDS use one vocabulary for the same workflow state.
- Destructive actions are separated from primary actions and require explicit
  confirmation or a safe recovery path.
- Use Má Tư DS primitives and approved surface adapters before route-local raw
  styling. A direct primitive composition is valid only when its semantic job
  is not covered by an adapter; do not invent fake primitives or a second theme.
- Accessibility basics are non-negotiable: keyboard reachability, visible focus,
  labels/names, semantic status not conveyed by color alone, and adequate touch
  targets.
- Never put agent notes, internal implementation commentary, or dev history into
  product UI.

## Copy And State

- Use operator language from shared dictionaries/glossary; one concept keeps one
  name across surfaces.
- Render explicit loading, empty, error, permission-denied, and recovery states
  appropriate to the workflow.
- Never expose raw database errors, SQLSTATE, secrets, or internal identifiers as
  user-facing copy.

## Verification

- Run `corepack pnpm lint:ui-contract` plus the repository hard gates.
- Inspect the changed route at its primary mobile viewport and the relevant
  desktop/tablet viewport when layout changes.
- Verify action, loading, empty, error, disabled, destructive, keyboard, and
  navigation states touched by the diff.
- Treat each authority owner as scoped to its concern. Guards and browser
  evidence prove outcomes; they do not create a competing visual contract.
