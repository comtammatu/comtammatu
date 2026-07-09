# Page Archetype Standard — Com Tam Ma Tu Web App

> Status: locked subordinate contract. Authority: `docs/spec/design-system.md`
> (see § Structural Governance § F there). On any conflict, `design-system.md`
> wins — this file never restates or overrides its tokens, rhythm, primitive
> roles, or Structural Governance chrome/shell/nav/padding rules; it only adds
> the page-level assembly layer on top of them.

## 0. What This File Is For

Every `apps/web/app/**/page.tsx` renders one of a fixed set of page archetypes.
An archetype is a locked recipe: layout skeleton, data-display idiom, state
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
- Surface: <route>; route family: <id>; plane: <Branch | Office | station | public>; change: <visual | flow | copy | behavior>
- Context: <screen-context-map entry or nearest parent workflow>; actor: <role>; job: <outcome>
- Journey: <entry state> -> <decision> -> <primary action> -> <success>; recovery: <safe retry/undo/exit>
- Information order: 1) <first viewport> 2) <decision context> 3) <secondary detail>; exclude: <out-of-scope data>
- Pattern: <archetype>; exemplar: <path>; data display: <table | board | document | detail | ...>
- States: <loading | empty | error | success | partial | blocked | permission | offline, as applicable>
- Components: <shared primitives/adapters>; fallback: <next approved composition if no exact match>
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
3. Select shared primitives and adapters from `docs/modules/ui.md` § Shared
   Component Registry. External design output may advise but cannot select or
   override the project contract.
4. If no exact component fits, compose existing primitives behind a
   route-scoped adapter. If the proposed fallback changes a shared visual role,
   token, or behavior, update `docs/spec/design-system.md` before adding or
   changing a shared adapter or primitive.
5. Do not start implementation while any gate field that affects hierarchy,
   workflow, state behavior, or component choice is unresolved.

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
- `routeBranchId` / `basePath` / `embedded` are optional props that exist so a
  Branch runtime chrome page can re-mount the same canonical `PageContent`
  instead of forking a second implementation. This is what makes the
  EMBED-WRAPPER archetype possible (§ 3) and is already live convention across
  inventory and staff-runtime screens — this file promotes it to law.
- Exemplars: `apps/web/app/(protected)/inventory/purchase-orders/page.tsx`
  (`PurchaseOrdersPageContent`), `apps/web/app/(protected)/inventory/purchase-orders/[id]/page.tsx`
  (`PODetailPageContent`), `apps/web/app/(protected)/inventory/transfers/new/page.tsx`,
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

| #   | Archetype       | Job                                                                       |
| --- | --------------- | ------------------------------------------------------------------------- |
| 1   | LIST            | Browse/filter/search a collection, row actions, quick CRUD                |
| 2   | EMBED-WRAPPER   | Branch-runtime re-mount of a canonical office/staff-runtime `PageContent` |
| 3   | DETAIL          | Single entity: metadata + lines/history + stage actions                   |
| 4   | SETTINGS-PANEL  | Single-entity or list-shaped configuration form                           |
| 5   | DOC-WORKFLOW    | Create/edit a line-array business document                                |
| 6   | REDIRECT-SHIM   | No-JSX route alias to the canonical home                                  |
| 7   | HUB             | Link-card menu into a group of capabilities                               |
| 8   | REPORT          | Filtered analytics: KPIs + chart + breakdown table                        |
| 9   | DASHBOARD       | Home-surface KPI summary with drill-downs                                 |
| 10  | GATE/AUTH       | Pre-context or terminal decision screen                                   |
| 11  | BOARD           | Realtime operational queue (full-screen Operations chrome)                |
| 12  | PUBLIC-WORKFLOW | Token-scoped customer transaction without Management chrome               |

## 3. Locked Recipes

### LIST

**Exemplar:** `apps/web/app/(protected)/inventory/purchase-orders/page.tsx` +
`purchase-orders-client.tsx`.

- Skeleton: `AppPage width="xwide"` → `AppPageHeader` (eyebrow = module name,
  `actions` = primary create CTA) → `AppToolbar` (search + status-count filter
  chips + branch filter live together, one toolbar) → `DataTable`. Every LIST
  page pins the one dense-data width tier `xwide` (`design-system.md` § Rhythm
  Contract — the single capped 1600px tier); a LIST on any other tier is drift.
  `scripts/check-ui-contract.mjs` enforces this against the `PAGE_ARCHETYPES`
  LIST entries so a page cannot re-enter on a narrower tier.
- Data display: `DataTable` with `mobileCardRender` for the phone card list
  and the `Table` primitive for desktop — same fields, status colors, and
  actions at both breakpoints. Cursor pagination through the shared
  `Pagination` primitive.
- States: `TableEmptyStateRow` / `AppEmptyState` for empty/no-results;
  `PageSkeleton` loading; `ErrorPanel` error.
- Status/money/date: per § 1 shared vocabulary.
- Quick create/edit: `FormDialog`. Row click → the family's canonical detail
  deep-link (`{basePath}/{id}`).
- Navigation: back/breadcrumb per this family's `ROUTE_FAMILY_CONTRACTS` entry.

### EMBED-WRAPPER

**Exemplar:** `apps/web/app/(protected)/br/[branchId]/(operator)/stock/purchase-orders/page.tsx`.

This is the repo's second-largest archetype (32 of the 135 pages) and its
hard rules are stricter than the other archetypes because its only job is
delegation:

- Branch runtime landing pages and hub roots MUST NOT use this archetype. A
  Branch plane entry such as `/br/[branchId]`, `/br/[branchId]/stock`, or
  `/br/[branchId]/orders` owns a native operator presentation first, then links
  into deeper workflow screens. Sharing data loaders is fine; wrapping the
  Office screen as the Branch entry UI is drift.
- **≤ 40 lines.**
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

EMBED-WRAPPER re-mounts an office/staff-runtime `PageContent` inside Branch
runtime chrome (`design-system.md` § Structural Governance § A.2). The
wrapper itself is delegation-only (above); this contract is what the
re-mounted `PageContent`'s own `embedded` branch must do so the operator
plane reads as one coherent V2 operator surface instead of Office chrome
leaking through a branch-scoped shell. It is subordinate to
`design-system.md` — it does not add tokens, rhythm, or primitives, it only
locks which existing contract choices apply inside an `embedded` branch.
The fix for every rule below lives **inside the shared `PageContent`/client
component via the `embedded` branch**, never as a forked operator-only
component — the same branch benefits both planes, and the office plane
(`embedded=false`) must stay byte-identical.

- **R1 — No nested page header.** An embedded branch MUST NOT render
  `AppPageHeader`. The Branch runtime `(operator)/layout.tsx` chrome (title +
  branch context) already owns the page-header job; a second `AppPageHeader`
  inside the embedded content is a duplicate header. Gate `AppPageHeader`
  rendering on `!embedded`, or split it out of the shared `content` block so
  the embedded return path skips it entirely. Gate
  `operator-embedded-page-header-boundary` catches shared `content` blocks that
  put `AppPageHeader` outside an explicit `embedded` branch.
- **R2 — No nested page shell.** An embedded branch MUST NOT wrap its content
  in `AppPage` (or an `AppPage`-backed adapter such as
  `InventoryPageContent`) — the operator layout's own `AppPage
density="compact"` already owns width/padding. Return a bare flex
  container (`<div className="flex w-full flex-col gap-3">{content}</div>`)
  per the `purchase-orders-client.tsx` exemplar (§ EMBED-WRAPPER exemplar's
  wrapped `PageContent`).
- **R3 — Touch-sized primary actions on the operator plane.** Primary action
  buttons (create/receive/submit CTAs a thumb must hit reliably) use
  `size="touch"` when `embedded`, not the office-density `size="sm"` /
  `size="xs"`. Branch through the `embedded` prop:
  `size={embedded ? "touch" : "sm"}`, or a locally computed variable
  (`stock-client.tsx`'s `isCompactLayout` pattern already does this for
  layout — reuse the same shape for size).
- **R4 — DataTable, not twin trees.** List/table content inside an embedded
  branch renders through the shared `DataTable` `mobileCardRender` (Rhythm
  Contract § List Surface contract), never a hand-maintained
  `md:hidden`/`hidden md:block` pair. This is the existing repo-wide
  `responsive-double-render` ratchet, restated here because an embedded
  branch is by construction always the narrow-column case.
- **R5 — Compact filters, no desktop toolbar bar.** An embedded branch must
  not render the full desktop `AppToolbar` filter row when the operator
  column is narrower than the toolbar needs. Prefer the existing responsive
  branch a client already uses for its own compact/mobile layout (e.g.
  `stock-client.tsx`'s `isCompactLayout`) so filters collapse into the
  compact/collapsible section instead of the inline desktop bar; do not add
  a second, operator-only toolbar implementation.
- **R6 — Back-link and breadcrumb target the operator section root.** Any
  back link, breadcrumb, or "list" href an embedded branch renders MUST use
  the branch-scoped `basePath` the wrapper passed down, not an office-module
  path. This is the EMBED-WRAPPER navigation rule above, restated for the
  presentation layer: the `basePath` prop IS the navigation contract inside
  `embedded`, so any hand-rolled back/list link must build off `basePath`,
  never off `ROUTE_FAMILY_CONTRACTS`' office-plane `breadcrumbRoot`.

### DETAIL

**Exemplar:** `apps/web/app/(protected)/inventory/purchase-orders/[id]/page.tsx` +
`po-detail-client.tsx`.

- `PageContent` takes a numeric/string id, calls `notFound()` on a miss or a
  branch-scope mismatch, and fetches `fetchEntityAuditLogs(entity, id)` for
  the history tab.
- Skeleton: `AppPage` → `AppPageHeader` (title = entity display code,
  `StatusBadge`, back link to the family's list `basePath`) → `DescriptionList`
  metadata → lines/items via `DataTable` (`desktopFooter`/`mobileFooter` for
  totals) → a `Lịch sử` tab sourced from `audit_logs` filtered by
  `entity_type`/`entity_id` → `AppDetailFooter` for stage-transition actions.
- Status/money/date: per § 1.
- Navigation: per this family's `ROUTE_FAMILY_CONTRACTS` entry.

### DOC-WORKFLOW

**Exemplar:** `apps/web/app/(protected)/inventory/transfers/new/page.tsx`.

- Skeleton: `DocumentFormFrame` (`apps/web/app/components/surface.tsx:476`) —
  header + scrollable body + footer, composing `AppPage`. **Mandatory for new
  DOC-WORKFLOW pages.**
- Form: RHF + Zod line-array form; line editing goes through the `DataTable`
  inline-edit adapter (`render`/`mobileCardRender` receive `(row, index)` so
  `patchLine(index)` works without a parallel tree); every line input is
  controlled so the responsive breakpoint switch can remount safely.
  Document totals render through `desktopFooter` (TableFooter rows) +
  `mobileFooter` (block under the card list).
- Sticky CTA: `sticky chrome-safe-bottom` + `shadow-lg` per the Elevation
  contract's Sticky CTA rung.
- Branch touch variant: route pages under `/br/[branchId]` use
  `BranchOperatorPage`; their direct client owner composes
  `BranchOperatorPanel` sections and a sticky `AppDetailFooter`. The Branch
  variant uses progressive disclosure on phone, may expand to a two-column
  touch layout on tablet, keeps controls at least 44px high, and does not
  import `DocumentFormFrame`, `DataTable`, or an Office form presentation.
- Status/money/date: per § 1.
- Navigation: per this family's `ROUTE_FAMILY_CONTRACTS` entry.
- **Guard note:** the DOC-WORKFLOW gate accepts the Office
  `DocumentFormFrame` recipe or the Branch touch recipe above in the route page
  and its direct client owner. The remaining hand-rolled baseline is outside
  Inventory and only shrinks as it migrates.
- `employee/count` folds FORM-PAGE into this archetype: it collects a
  line-array count slip and is DOC-WORKFLOW in shape even though it does not
  yet use `DocumentFormFrame`.

### REDIRECT-SHIM

**Exemplar:** `apps/web/app/(protected)/admin/page.tsx`.

- `redirect()` only. No JSX, no data fetch beyond what a guard clause needs.
- Keep it small — the existing shims in this repo are all ≤ 25 lines.
- Must be registered in `ROUTE_MANIFEST_SHIM_ROUTES`
  (`scripts/check-ui-contract.mjs`) so the route-manifest gate does not
  demand a `MODULE_ACL` family for a route that intentionally has none.

### HUB

**Exemplar:** `apps/web/app/(protected)/admin/settings/printers/page.tsx`.

- Skeleton: `AppPage width="wide"` → `AppPageHeader` → `AppSection` per group
  → `LinkCardGrid` of `AppLinkCard` (`{title, description, href, icon, tone,
badge}`).
- No data tables. No KPI values beyond a small count badge on a link card.
- Operator variant: `apps/web/app/(protected)/br/[branchId]/(operator)/settings/page.tsx`
  (`buildHubTiles`) uses the Branch plane recipe:
  `BranchOperatorPage` → `BranchOperatorActionSection` from
  `@lib/branch-operator/components/branch-operator-page`. It does not render
  `AppPageHeader`, `AppSection`, `AppLinkCard`, or an Office `*PageContent`
  wrapper at the Branch hub/root level.
- Navigation: per this family's `ROUTE_FAMILY_CONTRACTS` entry.

### REPORT

**Exemplar:** `apps/web/app/(protected)/finance/revenue/page.tsx`.

- Skeleton: `AppPage` → `AppPageHeader` → `AppToolbar` (period/branch filters)
  → `KpiRow` summary → chart (`chart-1`..`chart-5` tokens only) → `DataTable`
  breakdown → export action.
- Drill-down (where the report has one): a dated child route, e.g.
  `finance/revenue/[date]/page.tsx`.
- Status/money/date: per § 1.
- Navigation: per this family's `ROUTE_FAMILY_CONTRACTS` entry.

### DASHBOARD

**Exemplar:** `apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/page.tsx`.

- Skeleton: `BranchOperatorPage` → `KpiRow` of `KpiCard` (`{label, value,
delta, hint, icon, href}` — `href` drill-down is mandatory per the owner
  Q-spec) → `BranchOperatorPanel size="sm"` secondary panels.
- Every metric value binds to a key in
  `docs/ref/operational-data-contract.md`; do not add a metric card without a
  contract key.
- Status/money/date: per § 1.
- Navigation: per this family's `ROUTE_FAMILY_CONTRACTS` entry.

### GATE/AUTH

**Exemplars:** `apps/web/app/page.tsx` (work-location picker:
`AppPage` + `LinkCardGrid`) and `apps/web/app/(public)/access-denied/page.tsx`
(`?reason=` contract).

- No app chrome (these are Standalone chrome-less surfaces per
  `design-system.md` § Structural A.4, or pre-context screens that render
  before any chrome can mount).
- One decision, one forward action. No secondary navigation.

### BOARD

**Exemplar:** `apps/web/app/(protected)/br/[branchId]/kds/page.tsx`.

- Operations chrome (no `AppShell`); a realtime channel drives the board.
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

- Standalone, mobile-first customer workflow with no Management or Operations
  chrome. The route token establishes the workflow context; invalid or expired
  tokens fail closed through `notFound()` or one shared unavailable state.
- Skeleton: `AppPage mobile` or an equivalent full-height standalone frame;
  touch-sized controls; one visible primary action per decision step.
- Data display follows the transaction journey rather than a Management list:
  browse/select → review cart → submit → success or recoverable failure. Reuse
  `Item`, shared form controls, money/date helpers, and status vocabulary; do
  not copy Office `DataTable`, page header, or shell composition into it.
- Loading/error/offline behavior must preserve the in-progress transaction and
  expose an explicit retry or safe exit. Route-local status, formatter, and
  empty/loading implementations remain forbidden by the shared guards.

### SETTINGS-PANEL

**Exemplar:** `apps/web/app/(protected)/admin/settings/(tenant)/general/page.tsx`.

- Route-scoped settings frame (e.g. `SettingsPageFrame` /
  `SettingsFormSection`) + RHF + Zod `form/*` wrappers (§ 1 form layer).
- A list-shaped setting (units, categories, thresholds) renders its list body
  as a LIST inside the settings frame, with `FormDialog` for CRUD.
- `employee/clock` folds FORM-PAGE into this archetype: it is a single-action
  form (punch in/out) even though it is not a settings screen in the domain
  sense — its shape (one entity, one RHF form, no line array) matches this
  recipe, not DOC-WORKFLOW's.
- Navigation: per this family's `ROUTE_FAMILY_CONTRACTS` entry.

## 4. Named Exceptions

These 13 pages do not fit a single archetype cleanly. They are an explicit
allowlist, not a precedent for stretching another archetype's definition:

1. `apps/web/app/(protected)/br/[branchId]/(operator)/shift/page.tsx` — staff
   day-flow home; a HUB/DASHBOARD hybrid. Classified **HUB**.
2. `apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx` — branch
   portal home; the same HUB/DASHBOARD hybrid inside Branch runtime chrome.
   Classified **HUB**.
3. `apps/web/app/(protected)/inventory/page.tsx` — `KpiRow` + `LinkCardGrid`
   overview hybrid. Classified **DASHBOARD**.
4. `apps/web/app/(protected)/inventory/stock/page.tsx` — master half of a
   master-detail pair; already an allowlisted `use-is-mobile-budget`
   exception. Classified **LIST**.
5. `apps/web/app/(protected)/inventory/stock/[ingredientId]/page.tsx` —
   detail half of the same pair. Classified **DETAIL**.
6. `apps/web/app/(protected)/finance/summary/page.tsx` — REPORT plus a
   close-period form. Classified **REPORT**.
7. `apps/web/app/(protected)/notifications/page.tsx` — feed list without
   `DataTable` (a chronological notification feed does not have tabular
   columns to display). Classified **LIST**.
8. `apps/web/app/(protected)/admin/settings/printers/jobs/page.tsx` — a LIST
   living inside the printers SETTINGS-PANEL family with an added `KpiRow`
   summary. Classified **LIST**.
9. `apps/web/app/(protected)/inventory/count-slips/page.tsx` — manager review
   queue for submitted count slips. A per-slip approve / request-recount card
   with a nested line-variance `ItemGroup` and an inline review-note field; the
   decision surface is the card body, not a row. A `DataTable` cannot carry the
   nested lines + per-card actions, so the card/`ItemGroup` layout is correct.
   Classified **LIST** (queue variant); exempt from the LIST `DataTable` /
   `width="xwide"` gate.
10. `apps/web/app/(protected)/inventory/count-assignments/page.tsx` —
    per-employee ingredient-assignment editor (checkbox selection grouped by
    employee inside `AppSection`s), not a browsable collection of records. It
    edits a mapping, not a row list, so it has no tabular shape. Classified
    **LIST** (assignment variant); exempt from the LIST `DataTable` /
    `width="xwide"` gate.
11. `apps/web/app/(protected)/inventory/waste/approvals/page.tsx` — 4-eye waste
    approval queue. A per-issue approve / reject card with a nested waste-line
    `ItemGroup`, tier badges, photo links, and an inline review-note field; the
    decision surface is the card, not a row. Classified **LIST** (queue
    variant); exempt from the LIST `DataTable` / `width="xwide"` gate.
12. `apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/page.tsx`
    — Branch-runtime transfer queue. It uses `BranchOperatorPage`,
    `BranchOperatorPanel`, and full-row `Item` links because the supported
    phone/tablet runtime must keep one touch information architecture in both
    orientations. Classified **LIST** (Branch touch variant); the Office
    transfer route remains the canonical desktop `DataTable` LIST.
13. `apps/web/app/(protected)/br/[branchId]/(operator)/stock/on-hand/page.tsx`
    — Branch-runtime on-hand lookup. It shares the stock loader and pure filter
    model with Office but owns a full-row touch list that never changes into a
    desktop table at tablet landscape widths. Classified **LIST** (Branch touch
    variant); the Office stock route retains its responsive management LIST.

## 5. Agent Lookup Flow

Before building or changing any `(protected)/**/page.tsx`:

1. Read `docs/agent/rules/ui.md` Guardrails and complete the UI Advisor Gate in
   § 0.1.
2. Find the target route's archetype in § 2/§ 4, and read its
   locked recipe in § 3.
3. Read the recipe's named exemplar file(s) in full.
4. Run `codegraph explore "<adapter name>"` (or MCP `codegraph_explore`) for
   live usage of the adapters the recipe names (`DataTable`,
   `DocumentFormFrame`, `KpiCard`, …), or `pnpm audit:ui-components` for a
   route-family adoption/high-risk report — see `docs/modules/ui.md` § Shared
   Component Registry for the full component → role → locking-rule table and
   its usage-query instructions. Never answer "where is X used" by
   grep-guessing or by cloning a component you found once.
5. Build the new page from the exemplar's `PageContent` skeleton: swap the
   domain fetch/map, keep the shell shape.
6. Add the new page to the `PAGE_ARCHETYPES` map in
   `scripts/page-archetypes.mjs` with the correct archetype id. An
   undeclared page fails CI with a message pointing back at this file.

## 6. Census (verified against code, 2026-07-03)

135 `page.tsx` files under `apps/web/app` (131 protected + 3 public + 1 root).
The brief that seeded this file's first draft counted 134 pages — `main` had
moved by one page since; the count below is a fresh recount, not a copy of
that number.

| Archetype      | Count   |
| -------------- | ------- |
| EMBED-WRAPPER  | 32      |
| LIST           | 32      |
| SETTINGS-PANEL | 15      |
| DETAIL         | 13      |
| REDIRECT-SHIM  | 10      |
| DOC-WORKFLOW   | 10      |
| REPORT         | 7       |
| HUB            | 5       |
| DASHBOARD      | 4       |
| GATE/AUTH      | 4       |
| BOARD          | 3       |
| **Total**      | **135** |

This table is a point-in-time count, not a gate — the gate (§ 4 above,
mechanics in `scripts/check-ui-contract.mjs`) is the `PAGE_ARCHETYPES` mapping
itself. Do not hand-edit this table when adding a page; it goes stale the
moment a page is added and nobody re-derives it. Re-derive it from the gate's
map (`grep -c` per archetype id) if a future audit needs a fresh count.
