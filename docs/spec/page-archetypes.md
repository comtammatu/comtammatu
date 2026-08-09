# Page Archetype Standard — Com Tam Ma Tu Web App

> Status: subordinate contract. Authority: `docs/spec/design-system.md`
> (see § Structural Governance § F there). On any conflict, `design-system.md`
> wins — this file never restates or overrides its tokens, rhythm, primitive
> roles, or Structural Governance chrome/shell/nav/padding rules; it only adds
> the page-level assembly layer on top of them.

## 0. What This File Is For

Every `apps/web/app/**/page.tsx` renders one of a shared set of page archetypes.
An archetype is a workflow recipe: layout skeleton, data-display idiom, state
handling, and the shared status/money/date/navigation vocabulary it must use.
This file is the recipe book; `scripts/check-ui-contract.mjs` is the mapping
gate that keeps every page declared against it (see § 4).

This file does not own navigation facts (route home, back behavior,
breadcrumb root, primary nav). Those live in `ROUTE_FAMILY_CONTRACTS`
(`packages/shared/src/auth/route-map.ts`) — recipes below point at that
contract, never restate it.

## 0.1 UI Advisor Gate

Before a non-trivial UI change adds or changes a screen, workflow, layout,
data presentation, primary action, or responsive behavior, record this gate in
the task plan, task note, or owner-facing work summary. A pull request may
carry the same gate when one exists; a PR is not required. T1 typo-only changes
may skip it with the skip reason.

```text
UI Advisor Gate
- Surface: <route>; route family: <id>; plane: <branch_surface | control_surface | station_chrome | public>; change: <visual | flow | copy | behavior>
- Context: <screen-context-map entry or nearest parent workflow>; actor: <role>; job: <outcome>
- Journey: <entry state> -> <decision> -> <primary action> -> <success>; recovery: <safe retry/undo/exit>
- Information order: 1) <first viewport> 2) <decision context> 3) <secondary detail>; exclude: <out-of-scope data>
- Pattern: <archetype>; exemplar: <path>; data display: <table | board | document | detail | ...>
- States: <loading | empty | error | success | partial | blocked | permission | offline, as applicable>
- Block: <registered UI block or none>; components: <shared primitives/adapters>; fallback: <next approved composition if no exact match>
- Responsive/accessibility: <same-IA viewport changes>; input: <touch | keyboard | mixed>; risks: <focus/label/contrast/target>
- Verification: <routes, viewports, states, and browser evidence for meaningful runtime UI changes>
```

Decision order:

1. Lock actor/job/workflow/data priority via `docs/ref/screen-context-map.md`
   (nearest parent if route absent). Update the map first only for a materially
   different actor, job, or workflow.
2. Select the archetype and named exemplar here. Archetype owns page shape.
3. Pick the closest `UI_BLOCK_REGISTRY` block via
   `corepack pnpm audit:ui-components --component <block>` (`none` if no
   repeated block), then adapters named in the block `use` field.
4. Select shared primitives/adapters from `docs/modules/ui.md`. External design
   (including Stitch) may advise but cannot override the contract.
5. If no exact fit, compose primitives behind a route-scoped adapter. Shared
   visual role/token/behavior changes require `design-system.md` first.
6. Do not implement while hierarchy, workflow, state, or component-choice
   fields remain unresolved.

## 0.2 Page Disposition Gate

`scripts/page-archetypes.mjs` also assigns every route a `keep`, `tune`, or
`rebuild` disposition. The generated source-baseline default is deliberately
non-final: it records that the route has no source-level rebuild finding, not
that its rendered UI has passed review. A route becomes final only after the
applicable browser or authenticated runtime evidence; `scripts/check-ui-contract.mjs`
rejects a final disposition backed only by source or static implementation
evidence.

Evidence levels are monotonic:

1. `source-baseline`: archetype, component registry, boundaries, and static
   guards are clean; runtime remains open.
2. `implemented-static`: the route tranche was changed and its focused source,
   type, lint, and build gates are clean; runtime remains open.
3. `browser-runtime`: a public/system route was observed in a real browser;
   this is not enough for protected routes.
4. `authenticated-runtime`: the actor, state, viewport, keyboard/focus, and
   applicable accessibility checks were observed in a real authenticated
   session.

The UI component audit reports disposition totals and the final count. P6 is
not complete while any route remains non-final, even when its disposition is
`keep`. A protected route can become final only with `authenticated-runtime`;
a public/system route may use `browser-runtime`.

## 1. Universal Shell Rule

Every archetype (EMBED-WRAPPER excepted per its own hard rules in § 3) is
built from the same canonical page shape:

```tsx
export async function XPageContent(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  routeBranchId?: number;
  basePath?: string;
  embedded?: boolean;
}) {
  // fetch -> guard (branch scope / notFound) -> map -> render client
}

export default async function XPage({ searchParams }: { searchParams?: ... }) {
  return <XPageContent searchParams={searchParams} />;
}
```

- `XPageContent` is an `async` server component: it fetches data, resolves
  branch scope, calls `notFound()` on a bad id/scope mismatch, maps rows into
  the client component's props, and renders the client.
- The thin `default export` forwards `searchParams` and nothing else — no
  extra logic lives in the default export.
- `routeBranchId` / `basePath` / `embedded` are optional only where a Branch
  route deliberately re-mounts a shared staff-runtime `PageContent`. They do
  not authorize a Branch management workflow to reuse an control_surface presenter;
  those routes share loaders/models/actions and own a touch-native composition.
- Exemplars: `apps/web/app/(protected)/inventory/grn/page.tsx`,
  `apps/web/app/(protected)/inventory/grn/[id]/page.tsx`,
  `apps/web/app/(protected)/inventory/grn/new/[supplierId]/page.tsx`,
  `apps/web/app/(protected)/br/[branchId]/(operator)/shift/clock/page.tsx`
  (`ClockPageContent` from `apps/web/lib/staff-runtime/clock/page.tsx`).

**Shared state frames (all archetypes):**

- `loading.tsx` = `PageSkeleton` / `PageSpinner`
  (`apps/web/app/components/page-skeleton.tsx`); realtime boards (BOARD) use
  `PageSpinner` only — never a fake-data skeleton. POS keeps the one named
  `PosPageSkeleton` exception per `design-system.md` § Loading/Error/Not-found.
- `error.tsx` = `ErrorPanel` (`apps/web/app/components/error-panel.tsx`).
- `not-found.tsx` = `NotFoundPanel`, only where the family calls `notFound()`
  and a shell is worth preserving.

**Shared vocabulary (all archetypes) — never re-implement, always consume:**

- Status: `StatusBadge` / `getStatusBadgeMeta` (`apps/web/app/components/status-badge.tsx`).
- Money: `formatVND` (`@comtammatu/shared/format`).
- Dates/times: `@comtammatu/shared/time` (`formatVNDate`, `formatVNDateTime`, `formatVNTime`, …).
- Navigation contract (route home, back behavior, breadcrumb root, primary
  nav): `ROUTE_FAMILY_CONTRACTS` in `packages/shared/src/auth/route-map.ts`.
  A recipe below says "use the family's `ROUTE_FAMILY_CONTRACTS` entry" — it
  never repeats the actual `backBehavior` / `breadcrumbRoot` values, because
  those are per-family facts owned by that file, and a page can drift from a
  restated copy here.

## 2. Archetype Taxonomy

Twelve archetypes. `FORM-PAGE` from the original brief is **not** a
standalone archetype — the census found only 2 candidate pages, and both fit
an existing archetype better (a line-array create/edit flow is DOC-WORKFLOW;
a single-entity RHF+Zod edit is SETTINGS-PANEL), so it folds into those two
rather than staying a near-empty category.

| #   | Archetype       | Job                                                                              |
| --- | --------------- | -------------------------------------------------------------------------------- |
| 1   | LIST            | Browse/filter/search a collection, row actions, quick CRUD                       |
| 2   | EMBED-WRAPPER   | Branch-runtime re-mount of a canonical control_surface/staff-runtime `PageContent` |
| 3   | DETAIL          | Single entity: metadata + lines/history + stage actions                          |
| 4   | SETTINGS-PANEL  | Single-entity or list-shaped configuration form                                  |
| 5   | DOC-WORKFLOW    | Create/edit a line-array business document                                       |
| 6   | REDIRECT-SHIM   | No-JSX route selector to a canonical destination                                 |
| 7   | LANDING         | Link-card menu into a group of capabilities                                      |
| 8   | REPORT          | control_surface analytics or a fixed-scope Branch operational signal               |
| 9   | DASHBOARD       | Home-surface KPI summary with drill-downs                                        |
| 10  | GATE/AUTH       | Pre-context or terminal decision screen                                          |
| 11  | BOARD           | Realtime operational queue (full-screen station_chrome)                       |
| 12  | PUBLIC-WORKFLOW | Token-scoped customer transaction without control_surface chrome                   |

## 3. Shared Composition Recipes

### LIST

**Exemplar:** `apps/web/app/(protected)/inventory/grn/page.tsx` +
`grn-list-client.tsx`.

- Skeleton: an appropriate `AppPage` width → `AppPageHeader` (title = page job
  name, `actions` = primary create CTA; **no** module-name eyebrow — the
  control_surface sidebar + deep-nav already own module context) → a coordinated
  filter/control region → `DataTable` when values need tabular comparison.
  Owner management LIST / DETAIL default to `width="xwide"` (see
  `docs/modules/ui.md` AppPage width defaults); prove any other width in the
  rendered surface with the reading task that motivates it.
- Data display: `DataTable` with `mobileCardRender` for the phone card list
  and the `Table` primitive for desktop — same fields, status colors, and
  actions at both breakpoints. Cursor pagination through the shared
  `Pagination` primitive.
- States: `TableEmptyStateRow` / `AppEmptyState` for empty/no-results;
  `PageSkeleton` loading; `ErrorPanel` error.
- Status/money/date: per § 1 shared vocabulary.
- Quick create/edit: `FormDialog`. Row open follows Record Depth
  (`design-system.md` § C.1 / ADR 0018): D2 independent workspace →
  `{basePath}/{id}`; D1 view/document → addressable overlay
  (`?<entity>Id=`); D1 task → `FormDialog` / short `AppDialog` without a URL.
  Purchase demand, PO, GRN, and the YCH/Transfer journey are the named D1
  document set on Owner/Ops and use `AppDialog variant="document"`. YCH and
  linked Transfers render once in the fulfillment hub. Branch retains its
  Page/fullscreen touch detail workflow.
- **Row actions.** Build one `RowActionItem[]` per row
  (`apps/web/app/components/row-actions-menu.tsx`). Feed it to `RowActionsMenu`
  for the visible action cell and to `RowActionsContextMenuItems` through
  `DataTable renderRowContextMenu` for the right-click / long-press door. Any
  management LIST that renders an action cell MUST also wire
  `renderRowContextMenu` from the same array. Mobile cards expose the same
  array through the same `RowActionsMenu`. A LIST with **no action cell** is
  legal (ADR 0018 **C4**) — transfers/production may open via row body only;
  do not invent a menu when there are no row actions. ContextMenu is required
  only when an action cell is rendered.
- **Forbidden on LIST rows:** a route-local `DropdownMenu` assembled instead of
  `RowActionItem[]`; an overflow trigger that is actually a `Link` or bare icon
  row; a long-press destination that differs from the row body's destination;
  the context menu as the only path to any action.
- Navigation: back/breadcrumb per this family's `ROUTE_FAMILY_CONTRACTS` entry.

### EMBED-WRAPPER

**Exemplar:** `apps/web/app/(protected)/br/[branchId]/(operator)/shift/clock/page.tsx`.

Hard rules — job is delegation only:

- Branch runtime landing/root pages MUST NOT use this archetype. Entries such
  as `/br/[branchId]`, `/br/[branchId]/stock`, `/br/[branchId]/orders` own a
  native operator presentation first; sharing loaders is fine, wrapping
  control_surface as Branch entry UI is drift.
- Keep the wrapper delegation-only; size is a review signal, not a line-count
  gate.
- Parse/validate `branchId` from `params`; `notFound()` on a bad id.
- Render the canonical `*PageContent` (§ 1) with `routeBranchId`, branch-scoped
  `basePath`, and `embedded` (suppresses chrome Branch layout already owns —
  no double `AppPage`/eyebrow).
- **Forbidden:** any local `fetch`/Server Action; any JSX beyond the
  delegation call; importing another family's client directly (route through
  exported `PageContent`, never the client under it).
- Navigation: the branch-scoped `basePath` IS the navigation contract — no own
  `ROUTE_FAMILY_CONTRACTS` entry; the wrapped family's contract still governs
  back/breadcrumb inside embedded content.

#### Operator Embedded Presentation Contract

EMBED-WRAPPER re-mounts control_surface/staff-runtime `PageContent` inside Branch
runtime chrome (`design-system.md` § A.2). Wrapper is delegation-only; this
contract is what the remounted `PageContent`'s `embedded` branch must do so
the operator plane reads as one V2 surface. Subordinate to `design-system.md`.
Fixes live **inside the shared `PageContent`/client via `embedded`**, never a
forked operator-only component — `embedded=false` stays byte-identical.

- **R1 — No nested page header.** MUST NOT render `AppPageHeader` when
  `embedded`; Branch `(operator)/layout.tsx` already owns title + branch
  context. Gate on `!embedded` or skip it on the embedded return path.
- **R2 — No nested page shell.** MUST NOT wrap in `AppPage` (or
  `AppPage`-backed adapters). Return a bare flex container in the explicit
  `embedded` path; operator layout's `AppPage density="compact"` owns
  width/padding.
- **R3 — Touch-safe primary actions.** Thumb-hit create/receive/submit CTAs
  need the shared touch target; `size="touch"` is the usual recipe.
- **R4 — DataTable, not twin trees.** Use `DataTable` `mobileCardRender`; never
  a hand-maintained `md:hidden`/`hidden md:block` pair.
- **R5 — Compact filters, no desktop toolbar bar.** Do not render full desktop
  `AppToolbar` when the operator column is too narrow; reuse the client's
  existing compact/mobile filter branch (e.g. `isCompactLayout`).
- **R6 — Back/breadcrumb target operator section root.** Any back, breadcrumb,
  or "list" href MUST use the wrapper's branch-scoped `basePath`, never
  control_surface `ROUTE_FAMILY_CONTRACTS` `breadcrumbRoot`.

### DETAIL

**Exemplar:** `apps/web/app/(protected)/inventory/grn/[id]/page.tsx` +
`grn-detail-client.tsx`.

- `PageContent` takes id, `notFound()` on miss/scope mismatch, fetches
  `fetchEntityAuditLogs(entity, id)` for history.
- Skeleton: `AppPage` → `AppPageHeader` (title = entity display code,
  `StatusBadge`, back link to family list `basePath`; **no** module-name
  eyebrow — the back link owns hierarchy) → `DescriptionList` metadata →
  lines via `DataTable` (`desktopFooter`/`mobileFooter` for totals) → `Lịch sử`
  tab from `audit_logs` → `AppDetailFooter` for stage actions.
- Status/money/date: per § 1. Navigation: family's `ROUTE_FAMILY_CONTRACTS`.

### DOC-WORKFLOW

**Exemplar:** `apps/web/app/(protected)/inventory/grn/new/[supplierId]/page.tsx`.

- Skeleton: `DocumentFormFrame` — header + scrollable body + footer composing
  `AppPage`. **Mandatory for new DOC-WORKFLOW pages.**
- Form: RHF + Zod line-array; line edit via `DataTable` inline-edit adapter
  (`render`/`mobileCardRender` receive `(row, index)`); every line input
  controlled for safe remount. Totals via `desktopFooter` + `mobileFooter`.
- Sticky CTA: `sticky bottom-0 chrome-safe-pb` + `shadow-lg` per Elevation
  Sticky CTA rung.
- Branch touch variant: `/br/[branchId]` uses `BranchOperatorPage` +
  `BranchOperatorPanel` + sticky `AppDetailFooter`; progressive disclosure on
  phone, two-column touch on tablet, ≥44px controls; does not import
  `DocumentFormFrame`, `DataTable`, or control_surface form presentation.
- Status/money/date: per § 1. Navigation: family's `ROUTE_FAMILY_CONTRACTS`.
- control_surface uses `DocumentFormFrame`; Branch uses the touch recipe. Distinct
  workflows may compose directly when plane/touch/a11y/hierarchy hold.
- `employee/count` folds FORM-PAGE here (line-array count slip) even if it does
  not yet use `DocumentFormFrame`.

### REDIRECT-SHIM

**Exemplar:**
`apps/web/app/(protected)/br/[branchId]/(operator)/stock/receive/page.tsx`.

- `redirect()`-only. No JSX, no data fetch beyond a guard clause needs.
- Keep it small — existing shims are all ≤ 25 lines.
- A selector outside every declared `MODULE_ACL` family must be registered in
  `ROUTE_MANIFEST_SELECTOR_ROUTES` (`scripts/check-ui-contract.mjs`). Selectors
  already inside an ACL family do not need that exception.

### LANDING

**Exemplars:** `apps/web/app/(protected)/page.tsx` and
`apps/web/app/(protected)/settings/printers/page.tsx`.

- Skeleton: `AppPage width="wide"` → `AppPageHeader` → `AppSection` per group
  → `LinkCardGrid` of `AppLinkCard` (`{title, description, href, icon, tone,
badge}`).
- Compact Owner root (`/`): same groups/nav order; asymmetric desktop group
  grid with `AppSection` → `ItemGroup` of linked `Item` rows; one column on
  phone; no KPI or duplicate module controls.
- No data tables. No KPI beyond a small count badge on a link card.
- Operator variant: `br/[branchId]/(operator)/settings/page.tsx`
  (`buildSettingsLinks`): `BranchOperatorPage` →
  `BranchOperatorActionSection`. No `AppPageHeader`, `AppSection`,
  `AppLinkCard`, or control_surface `*PageContent` at Branch landing/root.
- Navigation: family's `ROUTE_FAMILY_CONTRACTS`.

### REPORT

**Exemplar:** `apps/web/app/(protected)/finance/revenue/page.tsx`.

- control_surface: `AppPage` → `AppPageHeader` → `AppToolbar` (period/branch filters)
  → `KpiRow` → chart (`chart-1`..`chart-5` only) → `DataTable` breakdown →
  export.
- Branch operator: `BranchOperatorPage` → mobile `BranchOperatorControlBar` →
  `BranchOperatorPanel` + full-row `ItemGroup` drill-ins. Fixed
  branch/current-period signal — no branch/date picker, KPI aggregation,
  chart, `DataTable`, export, financial values, or audit history. Quantities
  stay paired with ingredient units; never aggregate across ingredients.
- Drill-down: dated child route (e.g. `finance/revenue/[date]/page.tsx`).
- Status/money/date: per § 1. Navigation: family's `ROUTE_FAMILY_CONTRACTS`.

### DASHBOARD

**Exemplar:** `apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/page.tsx`.

- Skeleton: `BranchOperatorPage` → unresolved command/readiness lanes →
  `BranchOperatorPanel size="sm"` for live ops, end-of-day, drill-downs.
- Task-first Branch command surface — MUST NOT render `KpiRow`, `KpiCard`,
  charts, financial aggregation, or dashboard-card mosaic. Quantitative
  signals live inside the actionable row and link to the owning workflow.
- Status/money/date: per § 1. Navigation: family's `ROUTE_FAMILY_CONTRACTS`.

### GATE/AUTH

**Exemplars:** `apps/web/app/(protected)/page.tsx` (work-location picker:
`AppPage` + `LinkCardGrid`) and `apps/web/app/(public)/access-denied/page.tsx`
(`?reason=` contract).

- No app chrome (Standalone chrome-less per `design-system.md` § A.4, or
  pre-context screens before chrome can mount).
- One decision, one forward action. No secondary navigation.

### BOARD

**Exemplar:** `apps/web/app/(protected)/br/[branchId]/kds/page.tsx`.

- station_chrome (no `AppShell`); realtime channel drives the board.
- Data: `OperationalBoardCard` / `OperationalTile`; touch sizes
  (`size="touch"` / `"touch-lg"`) on every actionable control.
- Loading: `PageSpinner` only — fake tickets forbidden
  (`design-system.md` § Loading/Error/Not-found).
- Status: archetype hot-path config where one exists (e.g.
  `br/[branchId]/kds/lib/status-config.ts`) — acknowledged `StatusBadge`
  registry exception, documented in `design-system.md` § Status vocabulary.

### PUBLIC-WORKFLOW

**Exemplar:** `apps/web/app/q/[token]/page.tsx` + `self-order-client.tsx`.

- Standalone, mobile-first customer workflow; no control_surface/Operations chrome.
  Token establishes context; invalid/expired → `notFound()` or one shared
  unavailable state.
- Skeleton: `AppPage mobile` or full-height standalone frame; touch controls;
  one primary action per decision step.
- Display follows transaction journey, not control_surface list: browse → cart →
  submit → success/recoverable failure. Reuse `Item`, form controls,
  money/date helpers, status vocabulary; do not copy control_surface `DataTable`,
  page header, or shell composition.
- Loading/error/offline must preserve in-progress transaction and expose
  retry or safe exit. Route-local status/formatter/empty/loading remain
  forbidden.

### SETTINGS-PANEL

**Exemplar:** `apps/web/app/(protected)/settings/(tenant)/general/page.tsx`.

- Route-scoped settings frame (e.g. `SettingsPageFrame` /
  `SettingsFormSection`) + RHF + Zod `form/*` wrappers.
- List-shaped settings (units, categories, thresholds) render LIST body inside
  the settings frame with `FormDialog` for CRUD.
- `employee/clock` folds FORM-PAGE here: single-action punch form (one entity,
  one RHF form, no line array) — not DOC-WORKFLOW.
- Navigation: family's `ROUTE_FAMILY_CONTRACTS`.

## 4. Named Exceptions

Explicit allowlist (not a precedent). Path → classification:

1. `br/[branchId]/(operator)/shift/page.tsx` → **LANDING** (staff day-flow home).
2. `br/[branchId]/(operator)/page.tsx` → **LANDING** (branch portal home).
3. `inventory/page.tsx` → **REDIRECT-SHIM** to `/inventory/stock` (or GRN for accountant).
4. `inventory/stock/page.tsx` → **LIST** (master half, responsive master-detail).
5. `inventory/stock/[ingredientId]/page.tsx` → **DETAIL** (detail half).
6. `notifications/page.tsx` → **LIST** (chronological feed, no `DataTable`).
7. `settings/printers/jobs/page.tsx` → **LIST** (inside printers SETTINGS-PANEL + `KpiRow`).
8. `inventory/waste/approvals/page.tsx` → **LIST** (4-eye queue; card decision surface).
9. `br/.../stock/transfer/page.tsx` → **LIST** (Branch touch; control_surface keeps `DataTable`).
10. `br/.../stock/on-hand/page.tsx` → **LIST** (Branch touch on-hand lookup).
11. `br/.../stock/grn/page.tsx` → **LIST** (Branch touch GRN queue; drafts first).
12. `br/.../stock/grn/new/page.tsx` → **REDIRECT-SHIM** (YCH / purchase-request by branch type).
13. `br/.../stock/grn/new/[supplierId]/page.tsx` → **REDIRECT-SHIM** (compat; same rules as `/new`).
14. `br/.../stock/grn/[id]/page.tsx` → **DETAIL** (Branch touch GRN review/receipt).
15. `br/.../stock/on-hand/[ingredientId]/page.tsx` → **DETAIL** (Branch touch ingredient lookup).
16. `br/.../stock/production/page.tsx` → **REDIRECT-SHIM** to `/inventory/production?branchId=...`.
17. `br/.../stock/production/new` + `[id]` → **REDIRECT-SHIM** to canonical create/detail.
18. `br/.../stock/waste/page.tsx` → **DOC-WORKFLOW** (Branch touch waste entry).
19. `br/.../stock/waste-approvals/page.tsx` → **LIST** (Branch review queue).
20. `br/.../stock/consumption` + `[id]` → **LIST** / **DETAIL** (Branch-native recorded consumption).
21. `br/.../stock/count-assignments` + `count-slips` → **LIST** (assignment/review queues).
22. `br/.../shift/leave-approvals/page.tsx` → **LIST** (Branch leave review).
23. `br/.../shift/attendance/page.tsx` → **LIST** (Branch attendance; no cross-branch selector).

Paths above are under `apps/web/app/(protected)/` unless noted.

## 5. Agent Lookup Flow

Before building or changing any `(protected)/**/page.tsx`:

1. Read `docs/agent/rules/ui.md` Guardrails; complete UI Advisor Gate (§ 0.1).
2. Find archetype in § 2/§ 4; read its § 3 recipe and named exemplar(s).
3. Query block via `corepack pnpm audit:ui-components --component <block>`;
   use the recipe directly when no block fits.
4. Explore adapters (`codegraph explore` / `pnpm audit:ui-components` /
   `scripts/ui-component-registry.mjs`); never invent usage from memory.
5. Build from the exemplar's `PageContent` skeleton; declare the page in
   `scripts/page-archetypes.mjs` `PAGE_ARCHETYPES` (undeclared fails CI).
