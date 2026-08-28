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

Agent operating order is the Decision Ladder in `docs/agent/rules/ui.md`
(plane → archetype → block → compose → verify). Compose follows the Layout
UI/UX Frame in `docs/spec/design-system.md` (shell → page → section/panel →
toolbar/footer → density). For T2/T3 UI work, these four fields are mandatory
and must be resolved **before compose**:

| Field | Required value |
| --- | --- |
| `plane` | `branch` / `control_surface` / `station_chrome` / `public` / `staff` (or chrome family equivalent) |
| `archetype` | id from § 2 / § 4 |
| `block` | `UI_BLOCK_REGISTRY` id, or `none` + one-line reason |
| `exemplar` | concrete repo path (prefer the block's `exemplar` field) |

Do not start layout or adapter composition while any of the four is unresolved.
Lookup: `corepack pnpm audit:ui-components --component <block|adapter>`.
PR review for T2/T3 UI work uses the **UI Review Checklist** in
`docs/agent/rules/ui.md` (Gate fields stay owned here; the checklist does not
duplicate this template).

```text
UI Advisor Gate
- Surface: <route>; route family: <id>; plane: <branch | control_surface | station_chrome | public | staff>; change: <visual | flow | copy | behavior>
- Context: <screen-context-map entry or nearest parent workflow>; actor: <role>; job: <outcome>
- Journey: <entry state> -> <decision> -> <primary action> -> <success>; recovery: <safe retry/undo/exit>
- Information order: 1) <first viewport> 2) <decision context> 3) <secondary detail>; exclude: <out-of-scope data>
- Pattern: <archetype>; exemplar: <path>; data display: <table | board | document | detail | ...>
- States: <loading | empty | error | success | partial | blocked | permission | offline, as applicable>
- Block: <registered UI block or none + reason>; components: <shared primitives/adapters>; fallback: <next approved composition if no exact match>
- Responsive/accessibility: <same-IA viewport changes>; input: <touch | keyboard | mixed>; risks: <focus/label/contrast/target>
- Verification: <routes, viewports, states, and browser evidence for meaningful runtime UI changes>
```

Decision order:

1. Use `docs/ref/screen-context-map.md` to lock the actor, job, workflow, data
   priority, and information that must stay out of the surface. If the exact
   route is absent, use its nearest parent workflow. Update the context map
   first only when the route introduces a materially different actor, job, or
   workflow.
2. Select the archetype and named exemplar in this file. The archetype owns
   page shape; the context map does not.
3. Select the closest UI block from `UI_BLOCK_REGISTRY` through
   `corepack pnpm audit:ui-components --component <block>`. A block is a
   composition recipe, not an import layer; use `none` when the route has
   no repeated block. Then look up the adapters named in the block `use` field
   (for example `AppListFrame`, `DocumentFormFrame`, `BranchOperatorPage`)
   before composing.
4. Select shared primitives and adapters from `docs/modules/ui.md` § Shared
   Component Layer / § App Surface Adapters. External design output may advise
   but cannot select or override the project contract.
5. If no exact component fits, compose existing primitives behind a
   route-scoped adapter. If the proposed fallback changes a shared visual role,
   token, or behavior, update `docs/spec/design-system.md` before adding or
   changing a shared adapter or primitive.
6. Do not start implementation while any gate field that affects hierarchy,
   workflow, state behavior, or component choice is unresolved.

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
- Exemplars: `apps/web/app/(protected)/inventory/grn/page.tsx` (LIST + D1
  document host), `apps/web/app/(protected)/inventory/transfers/[id]/page.tsx`
  (DETAIL), `apps/web/app/(protected)/inventory/transfers/new/page.tsx`
  (DOC-WORKFLOW), `apps/web/app/(protected)/br/[branchId]/(operator)/shift/clock/page.tsx`
  (`ClockPageContent` from `apps/web/lib/staff-runtime/clock/page.tsx`).
  Owner `/inventory/grn/[id]` is **REDIRECT-SHIM** only — not a DETAIL exemplar.

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

## 1.1 Control Surface Canonical Compose

`control_surface` routes under `apps/web/app/(protected)/**` (excluding
`br/**`) must compose through **exactly one** of five shapes. Archetype ids in
§ 2 still classify the page; this section binds adapters + runtime laws so
LIST/DETAIL/DOC/REPORT/DASHBOARD pages do not invent per-route chrome, data
lifetime, or row-open patterns.

| Compose shape | Folded archetypes | Required adapters |
| --- | --- | --- |
| **LIST** | LIST (management) | `AppPage width="xwide" density="compact"` → `AppPageHeader` (primary create **only** in `actions`) → `AppListFrame` + `AppToolbar variant="inline"` → `DataTable` + `mobileCardRender` |
| **DETAIL** | DETAIL | `AppPage` → `AppPageHeader` (code + `StatusBadge` + back) → `DescriptionList` + lines `DataTable` → history → stage actions in `AppDetailFooter` |
| **DOC** | DOC-WORKFLOW | Authoring: `DocumentFormFrame`. List-first D1 docs: LIST host + addressable `AppDialog variant="document"` |
| **DASHBOARD_REPORT** | DASHBOARD, REPORT, LANDING hub | Non-sticky period `AppToolbar` / `FilterBar` → optional `KpiRow` → charts / breakdown. Control home `/`: queue-first `AppSection` + attention rows, **no** module grid or KPI mosaic. Printers root: `AppSection` + link cards. Never wrap a cockpit in `AppListFrame` |
| **REDIRECT** | REDIRECT-SHIM | Redirect primitive only (≤ ~25 lines) |

Folds: SETTINGS-PANEL list body → LIST inside `SettingsPageFrame`; SETTINGS
single form → thin DETAIL; `/me` LANDING hub is the personal account plane
(Avatar → `Trang cá nhân`); punch stays at `/me/clock`.

**Runtime laws (LIST)**

- Data: RSC loads the list; page-level filters bind URL `searchParams`; after
  mutation prefer URL change or `revalidatePath` — not a silent client refetch
  loop that reimplements SWR.
- Row open is **exactly one** Record Depth path: D2 `router.push("{base}/{id}")`
  · D1 `?{entity}Id=` + Sheet/`AppDialog` · D1 document `AppDialog
  variant="document"` · D1 task `FormDialog` (no URL).
- Forbidden: sticky `AppToolbar` above a `KpiRow` / KPI mosaic; create CTA only
  on `AppSection.action`; twin `md:hidden` / `sm:hidden` list trees; inventing a
  second filter chrome outside the frame toolbar; mixing different height tiers
  in the same toolbar/action row (e.g. `h-10` next to `h-7`/`h-6`).
- Height & alignment parity: all controls in the same row/toolbar MUST share the
  same height tier (`h-8` desktop list toolbar, `h-10` form row, `min-h-12` touch)
  and align vertically with `items-center`.

Census: every control_surface `page.tsx` declares `composeShape` in
`scripts/page-archetypes.mjs` (`CONTROL_SURFACE_COMPOSE`). CI enforces LIST
frame presence, sticky-above-KPI ban, LIST create-not-on-`AppSection.action`,
D1 row-open via `?{entity}Id=` (FormDialog task CRUD exempt), and twin
`md:hidden` list trees (§ 4 allowlist remains for named exceptions).

Gold LIST exemplar: `apps/web/app/(protected)/inventory/grn/page.tsx` +
`grn-list-client.tsx`.

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

Control Surface Work compose shapes (ADR 0033 — not station BOARD):

| Compose id | Job |
| --- | --- |
| `TASK_BOARD` | Office Kanban columns by `work_tasks.status` for **one** department or project; HTML5 drag → status RPC + `expected_revision`; mobile = status tabs + list |
| `TASK_CALENDAR` | Month/week cells from `due_at` (Vietnam day); click → task DETAIL |
| `TASK_TIMELINE` | Single-project date bars (read-heavy MVP) |

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
  actions at both breakpoints. Page navigation through `DataTablePagination`.
- States: `TableEmptyStateRow` / `AppEmptyState` for empty/no-results;
  `PageSkeleton` loading; `ErrorPanel` error.
- Status/money/date: per § 1 shared vocabulary.
- Quick create/edit: overlay chooser (`FormDialog` on Owner; `AppSheet` on
  Branch). Row open follows Record Depth
  (`design-system.md` § C.1 / ADR 0018): D2 independent workspace →
  `{basePath}/{id}`; D1 view/document → addressable overlay
  (`?<entity>Id=`); D1 task → `FormDialog` / short `AppDialog` without a URL.
  Purchase demand, PO, GRN, production, and the YCH/Transfer journey are the
  named D1 document set on Owner/Ops and use `AppDialog variant="document"`.
  YCH and linked Transfers render once in the fulfillment hub. Branch retains
  its Page/fullscreen touch detail workflow.
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

This is the repo's second-largest archetype and its
hard rules are stricter than the other archetypes because its only job is
delegation:

- Branch runtime landing pages and landing roots MUST NOT use this archetype. A
  Branch plane entry such as `/br/[branchId]`, `/br/[branchId]/stock`, or
  `/br/[branchId]/orders` owns a native operator presentation first, then links
  into deeper workflow screens. Sharing data loaders is fine; wrapping the
  control_surface screen as the Branch entry UI is drift.
- Keep the wrapper delegation-only; its size is a review signal, not a line-count
  gate.
- Parse and validate `branchId` from `params`; `notFound()` on a bad id.
- Render the canonical `*PageContent` export (§ 1) with `routeBranchId`, a
  branch-scoped `basePath`, and `embedded` (suppresses the chrome the Branch
  runtime layout already owns — no double `AppPage`/eyebrow).
- **Forbidden:** any local `fetch`/Server Action call, any JSX beyond the
  delegation call, importing another family's client component directly
  (route through the exported `PageContent`, never the client under it).
- Navigation: the branch-scoped `basePath` this wrapper passes down IS its
  navigation contract — it does not carry its own `ROUTE_FAMILY_CONTRACTS`
  entry; the wrapped family's contract still governs back/breadcrumb behavior
  inside the embedded content.

#### Operator Embedded Presentation Contract

EMBED-WRAPPER re-mounts an control_surface/staff-runtime `PageContent` inside Branch
runtime chrome (`design-system.md` § Structural Governance § A.2). The
wrapper itself is delegation-only (above); this contract is what the
re-mounted `PageContent`'s own `embedded` branch must do so the operator
plane reads as one coherent V2 operator surface instead of control_surface chrome
leaking through a branch-scoped shell. It is subordinate to
`design-system.md` — it does not add tokens, rhythm, or primitives, it only
clarifies which existing contract choices apply inside an `embedded` branch.
The fix for every rule below lives **inside the shared `PageContent`/client
component via the `embedded` branch**, never as a forked operator-only
component — the same branch benefits both planes, and the control_surface plane
(`embedded=false`) must stay byte-identical.

- **R1 — No nested page header.** An embedded branch MUST NOT render
  `AppPageHeader`. The Branch runtime `(operator)/layout.tsx` chrome (title +
  branch context) already owns the page-header job; a second `AppPageHeader`
  inside the embedded content is a duplicate header. Gate `AppPageHeader`
  rendering on `!embedded`, or split it out of the shared `content` block so
  the embedded return path skips it entirely. Review the rendered operator
  surface for duplicate context before accepting the composition.
- **R2 — No nested page shell.** An embedded branch MUST NOT wrap its content
  in `AppPage` (or an `AppPage`-backed adapter such as
  `InventoryPageContent`) — the operator layout's own `AppPage
density="compact"` already owns width/padding. Return a bare flex
  container (`<div className="flex w-full flex-col gap-3">{content}</div>`)
  in the shared `PageContent`'s explicit `embedded` return path.
- **R3 — Touch-safe primary actions on the operator plane.** Primary actions
  (create/receive/submit CTAs a thumb must hit reliably) need the shared touch
  target at the rendered viewport. `size="touch"` is the usual primitive recipe;
  another composition is valid when it proves the same target and hierarchy.
- **R4 — DataTable, not twin trees.** List/table content inside an embedded
  branch renders through the shared `DataTable` `mobileCardRender`
  (`design-system.md` § Component Authority → List surface and the table
  system), never a hand-maintained
  `md:hidden`/`hidden md:block` pair. This is the existing repo-wide
  responsive-composition guard, restated here because an embedded branch is by
  construction always the narrow-column case.
- **R5 — Compact filters, no desktop toolbar bar.** An embedded branch must
  not render the full desktop `AppToolbar` filter row when the operator
  column is narrower than the toolbar needs.   Prefer the Branch touch LIST controls
  (`BranchOperatorPanel` + sheet/toggle filters on
  `branch-stock-on-hand-client.tsx`) or the shared `DataTable`
  `mobileCardRender` path on Owner management lists; do not add a second,
  operator-only toolbar implementation.
- **R6 — Back-link and breadcrumb target the operator section root.** Any
  back link, breadcrumb, or "list" href an embedded branch renders MUST use
  the branch-scoped `basePath` the wrapper passed down, not an control_surface module
  path. This is the EMBED-WRAPPER navigation rule above, restated for the
  presentation layer: the `basePath` prop IS the navigation contract inside
  `embedded`, so any hand-rolled back/list link must build off `basePath`,
  never off `ROUTE_FAMILY_CONTRACTS`' control_surface plane `breadcrumbRoot`.

### DETAIL

**Exemplar:** `apps/web/app/(protected)/inventory/transfers/[id]/page.tsx` +
`transfer-detail-client.tsx`.

Owner GRN is list-first D1 (`/inventory/grn` + `GrnDocumentDialogHost`);
`/inventory/grn/[id]` is **REDIRECT-SHIM** → `?grnId=&mode=view`. Do not cite
it as a DETAIL page exemplar. Branch GRN touch detail remains a separate
presenter under `/br/…/stock/grn/[id]`.

- `PageContent` takes a numeric/string id, calls `notFound()` on a miss or a
  branch-scope mismatch, and fetches `fetchEntityAuditLogs(entity, id)` for
  the history tab.
- Skeleton: `AppPage` → `AppPageHeader` (title = entity display code,
  `StatusBadge`, back link to the family's list `basePath`; **no** module-name
  eyebrow — the back link owns hierarchy) → `DescriptionList`
  metadata → lines/items via `DataTable` (`desktopFooter`/`mobileFooter` for
  totals) → a `Lịch sử` tab sourced from `audit_logs` filtered by
  `entity_type`/`entity_id` → `AppDetailFooter` for stage-transition actions.
- control_surface inventory documents (stock dialog, PO, GRN gold bar): title =
  code + `StatusBadge`; description = identity; body first viewport = qty /
  current job (`Item` KPI without WAC) then line `Item`s / DataTable; money,
  audit, and linked receipts sit behind `Tabs`; footer = Close → overflow →
  one primary. Catalog stays LIST + plane overlay (Owner `FormDialog`, Branch
  `AppSheet`).
- Status/money/date: per § 1.
- Navigation: per this family's `ROUTE_FAMILY_CONTRACTS` entry.

### DOC-WORKFLOW

**Exemplar:** `apps/web/app/(protected)/inventory/transfers/new/page.tsx`.

Owner GRN create routes (`/inventory/grn/new`, `/inventory/grn/new/[supplierId]`)
are **REDIRECT-SHIM** only (list-first GRN from PO). Do not use them as DOC
exemplars.

- Skeleton: `DocumentFormFrame`
  (`apps/web/app/components/surface/document-form-frame.tsx`) —
  header + scrollable body + footer, composing `AppPage`. **Mandatory for new
  DOC-WORKFLOW pages.**
- Form: RHF + Zod line-array form; line editing goes through the `DataTable`
  inline-edit adapter (`render`/`mobileCardRender` receive `(row, index)` so
  `patchLine(index)` works without a parallel tree); every line input is
  controlled so the responsive breakpoint switch can remount safely.
  Document totals render through `desktopFooter` (TableFooter rows) +
  `mobileFooter` (block under the card list).
- Sticky CTA: `sticky bottom-0 chrome-safe-pb` + `shadow-lg` per the Elevation
  contract's Sticky CTA rung.
- Branch touch variant: route pages under `/br/[branchId]` use
  `BranchOperatorPage`; their direct client owner composes
  `BranchOperatorPanel` sections and a sticky `AppDetailFooter`. The Branch
  variant uses progressive disclosure on phone, may expand to a two-column
  touch layout on tablet, keeps controls at least 44px high, and does not
  import `DocumentFormFrame`, `DataTable`, or an control_surface form presentation.
- Status/money/date: per § 1.
- Navigation: per this family's `ROUTE_FAMILY_CONTRACTS` entry.
- **Composition note:** control_surface uses the `DocumentFormFrame` recipe;
  Branch uses the touch recipe above in the route page and its direct client
  owner. A distinct workflow may compose directly when it preserves its plane,
  touch behavior, accessibility, and visual hierarchy.
- `employee/count` folds FORM-PAGE into this archetype: it collects a
  line-array count slip and is DOC-WORKFLOW in shape even though it does not
  yet use `DocumentFormFrame`.

### REDIRECT-SHIM

**Exemplar:**
`apps/web/app/(protected)/br/[branchId]/(operator)/stock/receive/page.tsx`.

- A redirect primitive only. No JSX, no data fetch beyond what a guard clause
  needs.
- Keep it small — the existing shims in this repo are all ≤ 25 lines.
- A selector outside every declared `MODULE_ACL` family must be registered in
  `ROUTE_MANIFEST_SELECTOR_ROUTES` (`scripts/check-ui-contract.mjs`). Selectors
  already inside an ACL family do not need that exception.

### LANDING

**Exemplars:** `apps/web/app/(protected)/page.tsx` and
`apps/web/app/(protected)/settings/printers/page.tsx`.

- Skeleton: `AppPage width="wide"` → `AppPageHeader` → `AppSection` per group
  → `LinkCardGrid` of `AppLinkCard` (`{title, description, href, icon, tone,
badge}`).
- Control home `/` (ADR 0037): queue-first LANDING — `AppPageHeader` → optional
  office `AppTodayCommandBar` → one `Cần xử lý` `AppSection` + `ItemGroup`.
  No module launcher grid, no KPI mosaic. Sidebar remains module entry.
- No data tables. No KPI values beyond a small count badge on a link card.
- Operator variant: `apps/web/app/(protected)/br/[branchId]/(operator)/settings/page.tsx`
  (`resolveBranchToolsGroups` + `buildSettingsLinks`) uses the Branch plane recipe:
  `BranchOperatorPage` → `BranchOperatorActionSection` from
  `@lib/branch-operator/components/branch-operator-page`. It does not render
  `AppPageHeader`, `AppSection`, `AppLinkCard`, or an control_surface `*PageContent`
  wrapper at the Branch landing/root level.
- Navigation: per this family's `ROUTE_FAMILY_CONTRACTS` entry.

### REPORT

**Exemplar:** `apps/web/app/(protected)/finance/revenue/page.tsx`.

- control_surface skeleton: `AppPage` → `AppPageHeader` → `AppToolbar` (period/branch filters)
  → `KpiRow` summary → chart (`chart-1`..`chart-5` tokens only) → `DataTable`
  breakdown → export action.
- Branch operator variant: `BranchOperatorPage` → mobile
  `BranchOperatorControlBar` → `BranchOperatorPanel` + full-row `ItemGroup`
  drill-ins. Not a control_surface cockpit: no branch picker, chart,
  `DataTable`, or export. **Stock qty REPORT** (thresholds, consumption lists):
  no money aggregation; every quantity stays with its ingredient unit.
  **Money REPORT** (`pos-sessions`, `close-day`): session or business-day
  totals via `ItemGroup` / status strip. `close-day` may use a date toolbar
  (`?date=`, 04:00 window) and stacked P&L totals; still no mosaic/`KpiRow`.
- Drill-down (where the report has one): a dated child route, e.g.
  `finance/revenue/[date]/page.tsx`.
- Status/money/date: per § 1.
- Navigation: per this family's `ROUTE_FAMILY_CONTRACTS` entry.

### DASHBOARD

**Exemplar:** `apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/page.tsx`.

- Skeleton: `BranchOperatorPage` → unresolved command/readiness lanes →
  `BranchOperatorPanel size="sm"` for live operations, end-of-day work, and
  explicit drill-down actions.
- This Branch command surface is task-first, not an executive dashboard. It
  MUST NOT render `KpiRow`, `KpiCard`, charts, financial aggregation, or a
  dashboard-card mosaic. Quantitative signals belong inside the actionable row
  they qualify and link directly to the owning workflow.
- Status/money/date: per § 1.
- Navigation: per this family's `ROUTE_FAMILY_CONTRACTS` entry.

### GATE/AUTH

**Exemplars:** `apps/web/app/(public)/(auth)/login/page.tsx` and
`apps/web/app/(public)/access-denied/page.tsx` (`?reason=` contract).

- No app chrome (these are Standalone chrome-less surfaces per
  `design-system.md` § Structural Governance § A.7, or pre-context screens that render
  before any chrome can mount).
- One decision, one forward action. No secondary navigation.

### BOARD

**Exemplar:** `apps/web/app/(protected)/br/[branchId]/kds/page.tsx`.

- station_chrome (no `AppShell`); a realtime channel drives the board.
- Data display: `OperationalBoardCard` / `OperationalTile`; touch sizes
  (`size="touch"` / `"touch-lg"`) on every actionable control.
- Loading: `PageSpinner` only — fake tickets on an operational screen are
  forbidden by `design-system.md` § Loading/Error/Not-found.
- Status: the archetype's own hot-path status config where one exists (e.g.
  `br/[branchId]/kds/lib/status-config.ts`) — an acknowledged exception to the
  `StatusBadge` registry lock, documented in `design-system.md` § Status
  vocabulary.

### PUBLIC-WORKFLOW

**Exemplar:** `apps/web/app/q/[token]/page.tsx` + `self-order-client.tsx`.

- Standalone, mobile-first customer workflow with no control_surface or Operations
  chrome. The route token establishes the workflow context; invalid or expired
  tokens fail closed through `notFound()` or one shared unavailable state.
- Skeleton: `AppPage mobile` or an equivalent full-height standalone frame;
  in-flow opaque header/footer outside one scrollport; touch-sized controls;
  one visible primary action per decision step.
- Data display follows the transaction journey rather than a control_surface list:
  browse/select → review cart → submit → success or recoverable failure. Reuse
  `Item`, shared form controls, money/date helpers, and status vocabulary; do
  not copy control_surface `DataTable`, page header, or shell composition into it.
- Loading/error/offline behavior must preserve the in-progress transaction and
  expose an explicit retry or safe exit. Route-local status, formatter, and
  empty/loading implementations remain forbidden by the shared guards.

### SETTINGS-PANEL

**Exemplar:** `apps/web/app/(protected)/settings/(tenant)/general/page.tsx`.

- Route-scoped settings frame (e.g. `SettingsPageFrame` /
  `SettingsFormSection`) + RHF + Zod `form/*` wrappers (§ 1 form layer).
- A list-shaped setting (units, categories, thresholds) renders its list body
  as a LIST inside the settings frame; CRUD overlay follows the plane chooser
  (`FormDialog` on Owner, `AppSheet` on Branch).
- `employee/clock` folds FORM-PAGE into this archetype: it is a single-action
  form (punch in/out) even though it is not a settings screen in the domain
  sense — its shape (one entity, one RHF form, no line array) matches this
  recipe, not DOC-WORKFLOW's.
- Navigation: per this family's `ROUTE_FAMILY_CONTRACTS` entry.

## 4. Named Exceptions

These 22 pages do not fit a single archetype cleanly. They are an explicit
allowlist, not a precedent for stretching another archetype's definition:

1. `apps/web/app/(protected)/br/[branchId]/(operator)/shift/page.tsx` — staff
   day-flow home; a LANDING/DASHBOARD hybrid. Classified **LANDING**.
2. `apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx` — branch
   portal home; the same LANDING/DASHBOARD hybrid inside Branch runtime chrome.
   Classified **LANDING**.
3. `apps/web/app/(protected)/inventory/page.tsx` — inventory capability hub
   (`LANDING` / compose `DASHBOARD_REPORT` hub variant): queue-first attention
   `Item` rows, then document lanes, then catalog/settings. Not a management
   LIST or KPI mosaic.
4. `apps/web/app/(protected)/inventory/stock/page.tsx` — master half of a
   master-detail pair with responsive composition. Classified **LIST**.
5. `apps/web/app/(protected)/inventory/stock/[ingredientId]/page.tsx` —
   legacy DETAIL URL; redirects to the LIST D1 overlay (`?ingredientId=`).
   Classified **REDIRECT-SHIM**.
6. `apps/web/app/(protected)/notifications/page.tsx` — feed list without
   `DataTable` (a chronological notification feed does not have tabular
   columns to display). Classified **LIST**.
7. `apps/web/app/(protected)/settings/printers/jobs/page.tsx` — a LIST
   living inside the printers SETTINGS-PANEL family with an added `KpiRow`
   summary. Classified **LIST**.
8. `apps/web/app/(protected)/inventory/waste/approvals/page.tsx` — 4-eye waste
   approval queue. A per-issue approve / reject card with a nested waste-line
   `ItemGroup`, tier badges, photo links, and an inline review-note field; the
   decision surface is the card, not a row. Classified **LIST** (queue
   variant); it uses the card decision surface instead of a tabular LIST recipe.
9. `apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/page.tsx`
   — Branch-runtime transfer queue. It uses `BranchOperatorPage`,
   `BranchOperatorPanel`, and full-row `Item` links because the supported
   phone/tablet runtime must keep one touch information architecture in both
   orientations. Classified **LIST** (Branch touch variant); the control_surface
   transfer route remains the canonical desktop `DataTable` LIST.
10. `apps/web/app/(protected)/br/[branchId]/(operator)/stock/on-hand/page.tsx`
    — Branch-runtime on-hand lookup. It shares the stock loader and pure filter
    model with control_surface but owns a full-row touch list that never changes into a
    desktop table at tablet landscape widths. Classified **LIST** (Branch touch
    variant); the control_surface stock route retains its responsive management LIST.
11. `apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/page.tsx`
    — Branch-runtime GRN queue. It shares the GRN list loader and pure filter
    model with control_surface but orders the operator's drafts before the touch queue,
    keeps delete as an explicit confirmed action, and never changes into the
    control_surface table at tablet landscape widths. Classified **LIST** (Branch touch
    variant); control_surface retains the management `DataTable` LIST.
12. `apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/new/page.tsx`
    — Redirect shim. A normal branch continues to `Yêu cầu hàng`; `Kho Tổng` and
    `Bếp Trung Tâm` continue to `Yêu cầu mua`. GRN drafts are created only from a
    sent PO and appear in the GRN queue.
13. `apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/new/[supplierId]/page.tsx`
    — Compatibility redirect shim with the same destination rules as the
    parent `/new` route. It never renders a receipt-entry form.
14. `apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/[id]/page.tsx`
    — Branch-runtime GRN review and receipt. It shares the detail loader,
    model, action hooks, and mutations with control_surface, but owns draft line review
    through touch sheets and renders confirmed documents as a read-only receipt.
    Audit history, post-confirm correction, stock correction, invoice linkage,
    and the control_surface `GRNDetailClient` remain outside the Branch route. Classified
    **DETAIL** (Branch touch variant).
15. `apps/web/app/(protected)/br/[branchId]/(operator)/stock/on-hand/[ingredientId]/page.tsx`
    — Branch-runtime ingredient lookup. It shares the scoped detail loader and
    pure stock movement/status model with control_surface, but loads no valuation and
    owns a touch detail composition for current stock, locations, recent
    movements, thresholds, and route-scoped actions. The control_surface management
    detail retains WAC/value, dense desktop controls, and its own presentation.
    Classified **DETAIL** (Branch touch variant).
16. `apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/page.tsx`
    — Compatibility redirect shim to `/inventory/production?branch=...`.
    Production has one canonical control surface and only accepts `Bếp TT` scope.
    Classified **REDIRECT-SHIM**.
17. `apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/new/page.tsx`
    and `/stock/production/[id]/page.tsx` — Compatibility redirect shims to the
    list-first overlay (`?runId=&mode=view` or the runs tab); both keep URL scope.
    Classified **REDIRECT-SHIM**.
18. `apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste/page.tsx`
    — Branch-runtime waste entry. It preserves the scoped location, tier,
    evidence, rolling-meter, and submit authority but owns a compact touch
    document workflow: line summaries in `ItemGroup`, one line editor at a time
    in a bottom sheet, and a sticky action footer. control_surface retains its desktop
    `WasteCreateClient`; neither plane imports the other's presenter. Classified
    **DOC-WORKFLOW** (Branch touch variant).
19. `apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste-approvals/page.tsx`
    — Branch-runtime waste approval queue. It locks review to the route branch,
    presents one touch row per pending issue, and opens evidence, lines, review
    note, and approve/reject actions in a bottom sheet. Self-created rows remain
    readable but cannot mutate; the existing approval action remains the
    authority. control_surface retains its desktop `WasteApprovalsClient`; neither plane
    imports the other's presenter. Classified **LIST** (Branch review variant).
20. `apps/web/app/(protected)/br/[branchId]/(operator)/stock/consumption/page.tsx`
    and `/stock/consumption/[id]` — Branch-native recorded-consumption list and
    typed detail. The list separates posted ledger consumption from manual
    documents, keeps source/status language explicit, and uses full-row touch
    navigation. Neither route imports the control_surface list/detail presenter.
    Classified **LIST** and **DETAIL** respectively.
21. `apps/web/app/(protected)/br/[branchId]/(operator)/stock/count-assignments/page.tsx`
    and `/stock/count-slips` — Branch-native manager assignment and review
    queues. Rows remain touch actions at phone and tablet widths; slip review
    and approve/request-recount actions live in a bottom sheet with a sticky
    decision footer. Classified **LIST** (assignment/review variants).
22. `apps/web/app/(protected)/br/[branchId]/(operator)/team/leave-approvals/page.tsx`
    — fixed-branch leave review queue with status tabs, full-row touch items,
    and approve/reject in a bottom sheet. control_surface retains its desktop HR table.
    Classified **LIST** (Branch review variant).
23. `apps/web/app/(protected)/br/[branchId]/(operator)/team/attendance/page.tsx`
    — fixed-branch attendance list using the shared attendance table, without a
    cross-branch selector. It exposes audited stale-shift closing only when the
    Branch capability is present. Classified **LIST** (Branch review variant).

## 5. Agent Lookup Flow

Before building or changing any `(protected)/**/page.tsx`:

1. Read `docs/agent/rules/ui.md` Decision Ladder, complete the UI Advisor
   Gate in § 0.1 (plane + archetype + block/none+reason + exemplar before
   compose), and keep the UI Review Checklist in that file for T2/T3 PR
   close-out.
2. Find the target route's archetype in § 2/§ 4, and read its
   composition recipe in § 3.
3. Query the registered block for the plane and job with
   `corepack pnpm audit:ui-components --component <block>`; use the archetype
   recipe directly when no block fits.
4. Read the recipe's named exemplar file(s) in full.
5. Run `codegraph explore "<adapter name>"` (or MCP `codegraph_explore`) for
   live usage of the adapters the recipe names (`DataTable`,
   `DocumentFormFrame`, `KpiCard`, …), or `pnpm audit:ui-components` for a
   route-family adoption/high-risk report. Query
   `scripts/ui-component-registry.mjs` for current ownership and usage; never
   answer "where is X used" from a hand-maintained list.
6. Build the new page from the exemplar's `PageContent` skeleton: swap the
   domain fetch/map, keep the shell shape.
7. Add the new page to the `PAGE_ARCHETYPES` map in
   `scripts/page-archetypes.mjs` with the correct archetype id. An
   undeclared page fails CI with a message pointing back at this file.
