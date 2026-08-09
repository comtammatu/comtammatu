# UI, UX, Route Surface, And Copy Rules

Read this file before UI, UX, route surface, styling, component, or copy changes.
It controls agent workflow only. The Má Tư Design System SSOT, Base UI behavior,
and route workflow have separate owners; do not use one to overrule another.

## Authority

Read in order:

1. `docs/spec/design-system.md` — the Má Tư Design System SSOT: artifact ladder,
   Naming Standard, Base UI rule, tokens, typography, rhythm, elevation, motion,
   and Structural Governance.
2. `docs/spec/page-archetypes.md` — page/workflow composition and UI Advisor Gate.
3. `docs/ref/screen-context-map.md` — audience, device, route context.
4. `docs/modules/ui.md` and `packages/ui/src/components/*` — adapters and the
   implementation map.
5. Target route/component and targeted `tasks/regressions.md` rows.

Do not restate class strings, typography scales, token values, theme storage,
shared-component APIs, or page-archetype contracts here. Update their owner when
runtime changes.

## Non-negotiable System Facts

- One system name: **Má Tư Design System**. One token set, one CSS entry
  (`packages/ui/src/styles/globals.css`). No second theme product, no version
  badge, no external design mirror.
- Base UI is the only headless layer. Only `packages/ui` imports
  `@base-ui/react`; app code imports `@comtammatu/ui`. Exceptions are the closed
  list in the SSOT § Base UI Rule — adding one is a contract change.
- Naming: semantic `--kebab-case` tokens, `kebab-case.tsx` ↔ PascalCase export,
  adapter prefixes `App*` / `BranchOperator*` / `Employee*`. `Frame` is the inset
  primitive; `AppListFrame` / `DocumentFormFrame` stay legal `App*` adapters.
  Forbidden: `Owner*`, `Ops*`, `Ds*`, `Matu*`, importable `*Block`, root
  `DESIGN.md`.
- Dual Thesis differs by density and chrome only — never by tokens, fonts, or
  status vocabulary.

## Decision Ladder (pointer)

One ladder before compose. Do not invent a parallel DS, root `DESIGN.md`, or
agent wiki. Follow pointers; do not paste token tables into the task note.

```text
1. Plane     → design-system.md § Structural Governance (control_surface |
               branch | station_chrome | public | staff)
2. Archetype → page-archetypes.md (§ 2/§ 4) + named exemplar path
3. Block     → `pnpm audit:ui-components --component <block>`
               (or `none` + one-line reason when no repeated recipe)
4. Compose   → Layout UI/UX Frame (shell → page → section → toolbar/footer
               → density) then adapters in the block `use` field
               (modules/ui.md + packages/ui); never invent *Block imports
5. Verify    → lint:ui-contract + plane static guards + primary viewport
```

SSOT owners (read, do not fork):

| Concern | Owner |
| --- | --- |
| Tokens, Base UI, Frame law, Dual Thesis, chrome families, Layout UI/UX Frame | `docs/spec/design-system.md` |
| Archetypes, UI Advisor Gate template, disposition | `docs/spec/page-archetypes.md` |
| Adapter/block recipes (`need`/`use`/`forbidden`/`exemplar`) | `scripts/ui-component-registry.mjs` |
| Implementation map + exemplar matrix | `docs/modules/ui.md` |
| Actor / device / route context | `docs/ref/screen-context-map.md` |
| Dev layout recipes (non-product) | `/ds-lab` (production 404) |

Station gold blocks: `pos-board`, `realtime-board`, `runner-board`.
Branch gold blocks: `branch-action-home`, `branch-touch-list`,
`branch-touch-detail`, `branch-touch-document`.

## Scope And UI Advisor Gate

Before editing, declare the surface, user job, device/viewport, route family,
change type, and authority granted by the task. Complete
`page-archetypes.md` § 0.1 before external design advice.

**T2/T3 UI work (layout, hierarchy, state, navigation, interaction, or
multi-surface) must declare all four before compose:**

1. `plane` — product plane / chrome family
2. `archetype` — page-archetypes id
3. `block` — registered UI block id, or `none` plus a one-line reason
4. `exemplar` — concrete repo path from the block/`page-archetypes` exemplar

Skip only for T1 typo/editorial copy with an explicit skip reason. If the
archetype and visual contract already decide the shape, implement them. If a
real hierarchy/interaction choice remains, use the smallest set of independent
design reviewers that can add distinct evidence; their output is advisory and
cannot override the SSOT owners above.

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
- A row has one canonical view and one address. Legacy DETAIL routes may only
  redirect to that address; they must not render a second view (Record Depth /
  ADR 0018).
- YCM, PO, and GRN are list-first documents opened in a URL-addressable
  `AppDialog variant="document"` on Owner/Ops. YCH and Transfer share one
  fulfillment hub and open canonical detail pages in their respective
  Owner/Ops or Branch route family. Keep queue, filters, pagination, and site
  scope in the URL.
- `Popover` is for pickers and compact anchored controls only — never a record
  view, never a multi-step workflow.
- An overflow affordance (`⋯`) must open a real menu built from the shared
  `RowActionItem[]`. An `⋯` that is a link, or a bare icon pair standing in for
  a menu, is drift.
- Use Má Tư DS shared components and approved surface adapters before route-local raw
  styling. Before composing a new surface, run
  `corepack pnpm audit:ui-components --component <name>` for the closest shared
  component or adapter. A direct shared-component composition is valid only when its semantic job
  is not covered by an adapter; do not invent fake shared components or a second theme.
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
