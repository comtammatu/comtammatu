# Page Archetype Standard — Com Tam Ma Tu Web App

> Status: locked subordinate contract. Authority: `docs/spec/design-system.md`
> (see § Structural Governance § F there). On any conflict, `design-system.md`
> wins — this file never restates or overrides its tokens, rhythm, primitive
> roles, or Structural Governance chrome/shell/nav/padding rules; it only adds
> the page-level assembly layer on top of them.

## 0. What This File Is For

Every `(protected)/**/page.tsx` renders one of a fixed set of page archetypes.
An archetype is a locked recipe: layout skeleton, data-display idiom, state
handling, and the shared status/money/date/navigation vocabulary it must use.
This file is the recipe book; `scripts/check-ui-contract.mjs` is the mapping
gate that keeps every page declared against it (see § 4).

This file does not own navigation facts (route home, back behavior,
breadcrumb root, primary nav). Those live in `ROUTE_FAMILY_CONTRACTS`
(`packages/shared/src/auth/route-map.ts`) — recipes below point at that
contract, never restate it.

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
  inventory and employee — this file promotes it to law.
- Exemplars: `apps/web/app/(protected)/inventory/purchase-orders/page.tsx`
  (`PurchaseOrdersPageContent`), `apps/web/app/(protected)/inventory/purchase-orders/[id]/page.tsx`
  (`PODetailPageContent`), `apps/web/app/(protected)/inventory/transfers/new/page.tsx`,
  `apps/web/app/(protected)/employee/clock/page.tsx` (`ClockPageContent`).

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

| # | Archetype | Job |
|---|---|---|
| 1 | LIST | Browse/filter/search a collection, row actions, quick CRUD |
| 2 | EMBED-WRAPPER | Branch-runtime re-mount of a canonical office/employee `PageContent` |
| 3 | DETAIL | Single entity: metadata + lines/history + stage actions |
| 4 | SETTINGS-PANEL | Single-entity or list-shaped configuration form |
| 5 | DOC-WORKFLOW | Create/edit a line-array business document |
| 6 | REDIRECT-SHIM | No-JSX route alias to the canonical home |
| 7 | HUB | Link-card menu into a group of capabilities |
| 8 | REPORT | Filtered analytics: KPIs + chart + breakdown table |
| 9 | DASHBOARD | Home-surface KPI summary with drill-downs |
| 10 | GATE/AUTH | Pre-context or terminal decision screen |
| 11 | BOARD | Realtime operational queue (full-screen Operations chrome) |

## 3. Locked Recipes

### LIST

**Exemplar:** `apps/web/app/(protected)/inventory/purchase-orders/page.tsx` +
`purchase-orders-client.tsx`.

- Skeleton: `AppPage` → `AppPageHeader` (eyebrow = module name, `actions` =
  primary create CTA) → `AppToolbar` (search + status-count filter chips +
  branch filter live together, one toolbar) → `DataTable`.
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
- Status/money/date: per § 1.
- Navigation: per this family's `ROUTE_FAMILY_CONTRACTS` entry.
- **Baseline note:** only 1 of the repo's 9 current DOC-WORKFLOW pages
  (`transfers/new`) uses `DocumentFormFrame` today. The other 8
  (`grn/new`, `grn/new/[supplierId]`, `transfers/[id]/receive`,
  `stocktake/new`, `stocktake/[id]/count`, `purchase-orders/new`,
  `supplier-returns/new`, `waste/new`) hand-roll header+body+footer and are
  frozen as the migration baseline in the gate (§ 4) — the baseline only
  shrinks as they migrate, it never grows.
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
  (`buildHubTiles`) — same recipe, branch-scoped tile set.
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

**Exemplar:** `apps/web/app/(protected)/admin/dashboard/page.tsx`.

- Skeleton: `AppPage` → `KpiRow` of `KpiCard` (`{label, value, delta, hint,
  icon, href}` — `href` drill-down is mandatory per the owner Q-spec) →
  `AppSection size="sm"` secondary panels.
- Every metric value binds to a key in
  `docs/ref/operational-data-contract.md`; do not add a metric card without a
  contract key.
- Status/money/date: per § 1.
- Navigation: per this family's `ROUTE_FAMILY_CONTRACTS` entry.

### GATE/AUTH

**Exemplars:** `apps/web/app/(protected)/br/page.tsx` (branch picker:
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

These 8 pages do not fit a single archetype cleanly. They are an explicit
allowlist, not a precedent for stretching another archetype's definition:

1. `apps/web/app/(protected)/employee/page.tsx` — portal home; a HUB/DASHBOARD
   hybrid. Classified **HUB**.
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

## 5. Agent Lookup Flow

Before building or changing any `(protected)/**/page.tsx`:

1. Read `docs/agent/rules/ui.md` Guardrails (fast-loading pointer).
2. Come here, find the target route's archetype in § 2/§ 4, and read its
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

| Archetype | Count |
|---|---|
| EMBED-WRAPPER | 32 |
| LIST | 32 |
| SETTINGS-PANEL | 15 |
| DETAIL | 13 |
| REDIRECT-SHIM | 10 |
| DOC-WORKFLOW | 10 |
| REPORT | 7 |
| HUB | 5 |
| DASHBOARD | 4 |
| GATE/AUTH | 4 |
| BOARD | 3 |
| **Total** | **135** |

This table is a point-in-time count, not a gate — the gate (§ 4 above,
mechanics in `scripts/check-ui-contract.mjs`) is the `PAGE_ARCHETYPES` mapping
itself. Do not hand-edit this table when adding a page; it goes stale the
moment a page is added and nobody re-derives it. Re-derive it from the gate's
map (`grep -c` per archetype id) if a future audit needs a fresh count.
