# UI, UX, Route Surface, And Copy Rules

Read this file before UI, UX, route surface, styling, component, or copy changes.
It controls agent workflow only. The Má Tư Design System SSOT, Base UI behavior,
and route workflow have separate owners; do not use one to overrule another.

## Authority

Read in order:

1. `docs/spec/design-system.md` — the Má Tư Design System SSOT: artifact ladder,
   Naming Standard, Base UI rule, tokens, Color Usage, typography, rhythm,
   elevation, motion, Date/Button/Overlay choosers, Layout UI/UX Frame, Copy
   Contract, and Structural Governance.
2. `docs/spec/page-archetypes.md` — page/workflow composition and UI Advisor Gate.
3. `docs/ref/screen-context-map.md` — audience, device, route context.
4. `docs/modules/ui.md` and `packages/ui/src/components/*` — thin
   implementation map (adapters and Base behavior).
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
  Forbidden: `Owner*`, `Ops*`, `Management*`, `Ds*`, `Matu*`, importable
  `*Block`, root `DESIGN.md`.
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
cannot override the SSOT owners above. Before calling T2/T3 UI work complete,
walk the **UI Review Checklist** below.

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
- Date, command, and overlay jobs use the chooser tables in
  `design-system.md` § Component Authority (`BusinessDateField` /
  `BusinessDatePicker`, `ResponsiveActionButton` on `control_surface`,
  `AppSheet` / `StationSheet`). Do not author `type="date"`, raw `Calendar`,
  or route-level `Sheet` / `Drawer`.
- Use Má Tư DS shared components and approved surface adapters before route-local raw
  styling. Before composing a new surface, run
  `corepack pnpm audit:ui-components --component <name>` for the closest shared
  component or adapter. A direct shared-component composition is valid only when its semantic job
  is not covered by an adapter; do not invent fake shared components or a second theme.
- No module-local style-constant files: a repeated composition becomes a
  registered adapter or a UI block recipe, not a per-module `*styles.ts` of
  class strings (existing exemplars stay frozen until promoted).
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

## UI Review Checklist

Durable review habit for **T2/T3 UI PRs** (layout, hierarchy, state, navigation,
interaction, or multi-surface). T1 typo/editorial copy may skip with an
explicit skip reason. Do not paste token tables here — owners stay in
`design-system.md` / `page-archetypes.md` / the registry.

### 1. Decision Ladder / UI Advisor Gate

Before compose, the PR or task note must carry the four Gate fields from
`page-archetypes.md` § 0.1 (do not fork a second template):

- [ ] `plane` — product plane / chrome family
- [ ] `archetype` — id from page-archetypes § 2 / § 4
- [ ] `block` — `UI_BLOCK_REGISTRY` id, or `none` + one-line reason
- [ ] `exemplar` — concrete repo path (prefer the block's `exemplar`)

Also confirm Dual Thesis / chrome family fit: density and chrome may differ by
plane; tokens, fonts, and status vocabulary must not. No parallel DS, root
`DESIGN.md`, inventable `*Block` imports, or `App*` chrome on `station_chrome`.

### 2. Foundations

Check only what the diff touches; evidence beats restating the SSOT.

- [ ] Contrast — text/icon/status remain readable in the themes the change
      affects (see design-system Contrast Targets)
- [ ] Rhythm / density — page and control density match the plane; no arbitrary
      gap/padding scale drift
- [ ] Typography — shared type roles; no ad-hoc display scale
- [ ] Motion — shared motion tokens only; honor
      `prefers-reduced-motion` (globals reset). **Route-local motion:** flag
      ad-hoc transition/stagger/animation that bypasses tokens; do not invent
      page-transition or list-stagger recipes in review

### 3. Station plane (`station_chrome` — POS / KDS / runner)

When the diff touches station routes or shared station adapters:

- [ ] Primary viewport = next action or live queue (not dashboard chrome)
- [ ] One vocabulary with the paired POS/KDS workflow state
- [ ] No `AppShell` / control_surface `App*` chrome leakage into the station
      plane; use station gold blocks (`pos-board`, `realtime-board`,
      `runner-board`) or an approved station adapter
- [ ] **Touch density on POS sheets** — Sheet/Drawer controls meet touch /
      `touch-lg` targets at the primary station viewport; review density only,
      do not redesign POS/KDS in the review pass
- [ ] **Browser contrast / density** — when station or sheet chrome changes,
      spot-check light + dark and touch density at the primary viewport
      (browser evidence when the change is meaningful)

### 4. Copy And Product Surface

- [ ] Vietnamese product copy follows glossary / shared dictionaries; one
      concept keeps one name
- [ ] No agent notes, implementation commentary, or dev history in product UI
- [ ] Loading / empty / error / permission / recovery states are explicit where
      the workflow requires them
- [ ] No raw Supabase/Postgres/`SQLSTATE` text, secrets, or internal ids as
      user-facing copy

### 5. Verification Pointers

- [ ] `corepack pnpm lint:ui-contract` (plus plane static guards the route
      family already has)
- [ ] Primary mobile viewport, and desktop/tablet when layout changes
- [ ] Action, loading, empty, error, disabled, destructive, keyboard, and
      navigation states touched by the diff
- [ ] `/ds-lab` when shared layout recipes, plane chrome, or foundation demos
      change (dev-only; production 404)
- [ ] Treat each authority owner as scoped to its concern — guards and browser
      evidence prove outcomes; they do not create a competing visual contract

W10+ token tweaks stay optional and only when a review or audit proves need;
passing this checklist is the default stop for a DS hygiene wave.
