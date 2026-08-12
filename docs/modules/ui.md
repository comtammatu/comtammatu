# UI Module

Thin implementation map for the Má Tư Design System: where the code lives, which
adapter serves which plane, and the runtime details that exist only in source.

## Scope

This file answers "which file do I import and what does it already do". It does
not own policy. On any conflict the owner below wins.

| Concern | Owner |
| --- | --- |
| Tokens, typography, rhythm, elevation, motion, Naming Standard, Base UI rule, Frame law, Dual Thesis, Structural Governance, Component Authority, record depth | `docs/spec/design-system.md` |
| Archetypes, UI Advisor Gate template, composition workflow | `docs/spec/page-archetypes.md` |
| Actor, device, route context, what a role may see | `docs/ref/screen-context-map.md` |
| Adapter/block recipes (`need` / `use` / `fallback` / `forbidden` / `exemplar`) | `scripts/ui-component-registry.mjs` |
| Agent guardrails, Decision Ladder, UI Review Checklist | `docs/agent/rules/ui.md` |
| Toast, notification, severity, routing | `docs/spec/toast-notification-system.md` |
| Negative rules from incidents | `tasks/regressions.md` |

Do not restate token values, class recipes, copy budgets, or archetype contracts
here. Update the owner instead.

## Where Code Lives

| Layer | Path | Import specifier |
| --- | --- | --- |
| Shared primitives | `packages/ui/src/components/*` | `@comtammatu/ui/components/<name>` |
| Shared utilities | `packages/ui/src/lib/*` | `@comtammatu/ui/lib/<name>` |
| Single CSS entry | `packages/ui/src/styles/globals.css` | — |
| App surface adapters | `apps/web/app/components/surface/*` | `@/components/surface` |
| Responsive table adapter | `apps/web/app/components/data-table/*` | `@/components/data-table` |
| KPI adapters | `apps/web/app/components/kpi/*` | `@/components/kpi` |
| Form helpers | `apps/web/app/components/form/*` | `@/components/form` |
| control_surface chrome | `apps/web/app/components/app-shell.tsx`, `control-surface-shell.tsx` | `@/components/*` |
| Branch operator adapters | `apps/web/lib/branch-operator/components/branch-operator-page.tsx` | — |
| Employee adapters | `apps/web/lib/staff-runtime/components/staff-runtime-page.tsx` | — |
| Settings shell | `apps/web/app/(protected)/settings/settings-page-frame.tsx` | — |
| Dev-only layout lab (production 404) | `apps/web/app/(dev)/ds-lab/` | — |

`@/components/surface` re-exports only; each adapter is one file under
`surface/`. Domain wrappers may keep their own API but must delegate to these
adapters instead of restyling `Card`, `Empty`, or a page container.

## Shared Primitives

`packages/ui/src/components/`: `alert`, `alert-dialog`, `avatar`, `badge`,
`breadcrumb`, `button`, `calendar`, `card`, `checkbox`, `collapsible`,
`combobox`, `context-menu`, `dialog`, `drawer`, `dropdown-menu`, `empty`,
`field`, `frame`, `input`, `input-group`, `interactive-card`, `item`, `kbd`,
`label`, `note-callout`, `popover`, `progress`, `radio-group`, `scroll-area`,
`section-label`, `select`, `separator`, `sheet`, `skeleton`, `slider`, `sonner`,
`spinner`, `switch`, `table`, `tabs`, `textarea`, `theme-provider`,
`theme-script`, `toggle`, `toggle-group`, `toolbar`, `tooltip`.

`packages/ui/src/lib/`: `cva`, `field-trigger`, `floating-layer`, `notify`,
`render`, `theme-cookie`, `utils`.

Notes that are not obvious from the filename:

- `empty` covers every empty state (no-data, no-results, error, inline).
- `field` exports both `Field` and `FieldGroup`; there is no `field-group` file.
- `item` exports `Item` and `ItemGroup` for list rows with media, title,
  description, and actions.
- `spinner` replaces every `Loader2 + animate-spin` pair.
- `interactive-card` is `direct`: routes import it straight from
  `@comtammatu/ui/components/interactive-card` with no app adapter in between.

Do not fork a shared primitive per surface. Every primitive must have at least
one consumer outside `packages/ui`; the gate lives in
`apps/web/tests/ui-design-system-primitives.test.ts`.

## Runtime Contracts

Facts that live in code and cannot be read off the spec:

- Only `packages/ui` imports `@base-ui/react`. App code imports
  `@comtammatu/ui`. The exception list is in `design-system.md` § Base UI Rule.
- `Select` keeps the compound API. The shared root converts `SelectItem`
  children into Base UI `items` so `SelectValue` resolves the label. An explicit
  `items` prop always wins; routes must not build a second label resolver.
- Brand rendering goes through `BrandMark` / `BrandLockup` / `BrandSymbol` /
  `BrandMascot`.
- `Table` is the semantic desktop primitive. Routes compose it directly only
  through a registered document or line-sheet adapter.
- `DataTable` is the only responsive table adapter: one row model, desktop
  columns and `mobileCardRender` carrying the same fields, states, and actions.
  `DataTablePagination` and `TableEmptyStateRow` are internal to it.
- Prefer named props over ad-hoc classes: `flush` for table/list edge alignment,
  `scroll` for horizontal table scroll; `AppSection` uses `contentFlush` /
  `contentScroll` for the same roles.
- Theme runtime is single-source in `packages/ui/src/lib/theme-cookie.ts`. No
  second theme context, toggle, or storage key.

## Plane To Adapter

Composition ladder and plane definitions: `design-system.md` § Layout UI/UX
Frame and § Structural Governance. This table only maps plane to code.

| Plane | Adapters |
| --- | --- |
| `control_surface` | `AppPage` → `AppPageHeader` → `AppListFrame` / `AppSection` / `DocumentFormFrame` → `AppToolbar` / `AppDetailFooter` |
| Branch operator | `BranchOperatorPage`, `BranchOperatorPanel`, `BranchOperatorActionSection`, `ItemGroup` |
| Station | `StationSection`, `Frame`, `OperationalBoardCard` |
| Public | `AppPage` + `PublicSection` / `AppEmptyState` |
| Employee self-service | `EmployeePage`, `EmployeePanel`, `EmployeeActionSection`, and the rest of the `Employee*` exports in `staff-runtime-page.tsx` |

Cross-plane imports are guarded. Branch, station, and staff-runtime routes must
not import `AppShell`, `ControlSurfaceShell`, `resolveControlSurface*`,
`control-surface-nav`, or the removed L0 shell names (`OwnerModuleShell`,
`FinanceShell`, `InventoryShell`); the guard is
`operator-owner-shell-boundary`.

## Exemplar Matrix

Full lookup: `corepack pnpm audit:ui-components`. This is the gold path per
block.

| Block | Plane | Exemplar |
| --- | --- | --- |
| `management-list` | control_surface | `apps/web/app/(protected)/inventory/grn/page.tsx` |
| `management-detail` | control_surface | `apps/web/app/(protected)/inventory/transfers/[id]/page.tsx` |
| `management-document` | control_surface | `apps/web/app/(protected)/inventory/transfers/new/page.tsx` |
| `pos-board` | station | `apps/web/app/(protected)/br/[branchId]/pos/session-gate.tsx` |
| `realtime-board` | station | `apps/web/app/(protected)/br/[branchId]/kds/page.tsx` |
| `runner-board` | station | `apps/web/app/(protected)/br/[branchId]/pickup/page.tsx` |
| `branch-action-home` | branch | `apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx` |
| `branch-touch-list` | branch | `apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/page.tsx` |
| `branch-touch-detail` | branch | `apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/[id]/page.tsx` |
| `branch-touch-document` | branch | `apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste/page.tsx` |
| `employee-self-service` | staff | `apps/web/lib/staff-runtime/page.tsx` |
| `public-transaction` | public | `apps/web/app/q/[token]/page.tsx` |
| `system-gate` | public | `apps/web/app/(public)/access-denied/page.tsx` |
| Layout lab | dev | `apps/web/app/(dev)/ds-lab/ds-lab-client.tsx` |

## Control Surface Canonical Compose

Owner: `docs/spec/page-archetypes.md` § 1.1. control_surface pages
(`apps/web/app/(protected)/**` excluding `br/**`) compose through one of five
shapes — LIST, DETAIL, DOC, DASHBOARD_REPORT, REDIRECT — plus `STAFF_EMBED`
for `/me/*`. Census: `CONTROL_SURFACE_COMPOSE` in
`scripts/page-archetypes.mjs`.

| Shape | Adapters (thin pointer) |
| --- | --- |
| LIST | `AppPage xwide+compact` → `AppPageHeader` → `AppListFrame` + inline `AppToolbar` → `DataTable` |
| DETAIL | `AppPage` → `AppPageHeader` → `DescriptionList` + lines → `AppDetailFooter` |
| DOC | `DocumentFormFrame` (or LIST host + document `AppDialog`) |
| DASHBOARD_REPORT | Non-sticky filters → optional `KpiRow` → charts/breakdown; hubs use link cards |
| REDIRECT | `redirect()` only |

## control_surface LIST Runtime

Canonical shape:

```text
AppPage → AppPageHeader → AppListFrame toolbar={<AppToolbar variant="inline" />} → DataTable
```

Spacing and edge rules are owned by `design-system.md` § Rhythm. What only the
code knows:

- `AppToolbar` goes before `DataTable` when filter, sort, branch, period, or
  action is page-level URL/server state. `DataTable`'s inline toolbar is for the
  table's own local state; never build two toolbars for one control.
- `AppListFrame` uses `overflow-visible`; `AppToolbar` keeps search at `z-0` and
  filters/actions at `z-10`. Filters belong in the `filters` slot, not `search`.
- `SelectContent` defaults to `position="popper"`, `positionMethod="fixed"`, and
  `collisionBoundary` = `document.documentElement`, so a menu inside a
  `Card` / `AppListFrame` does not flip into the search row.
- Filter control density comes from `useFormControlSize()`: `touch` below `lg`
  (1024), `field` from `lg` up. `size="default"` and `size="sm"` are not allowed
  in a LIST filter row. Operator and embedded surfaces force
  `useFormControlSize("touch")`. The header create CTA stays `lg`.
- Inventory filter widths live in
  `apps/web/app/(protected)/inventory/_components/inventory-list-filters.ts`
  (`inventoryListFilterSelectClassName`), not in a Frame alias.
- Desktop empty state renders through `DataTable`
  (`TableHeader` + `TableEmptyStateRow`). Swapping the whole table for
  `AppEmptyState` is only for error or load failure.

## Work Module Compose (`/work`)

Control Surface **Work** (`/work`) uses LIST at the route census; board, calendar,
and timeline are **TASK_*** compose recipes inside one `AppListFrame` (ADR 0035).

| Constant / component | Role |
| --- | --- |
| `work/_lib/compose-styles.ts` | SSOT Tailwind for inbox inset, Kanban columns, month cells, timeline rows |
| `WorkComposeShell` | `AppListFrame` + `data-page-archetype=TASK_*` wrapper |
| `WorkMonthGrid` + `WorkTaskChip` | Vietnam month grid from `getVNMonthCalendarCells` — **not** `ui/calendar` DayPicker |
| `WorkScopePicker` / `WorkScopeLabel` | URL scope for board (department or project), timeline (project only), calendar (optional) |

Registry blocks: `work-task-inbox`, `work-task-board`, `work-task-calendar`.
Exemplar: `/ds-lab` section 13.

## control_surface Shell Runtime

`apps/web/app/components/app-shell.tsx` (historical code ids
`ControlSurfaceShell`, `data-control-surface-scroll`) renders one sidebar inside
one `SidebarProvider`.

- `AppShell` takes `tier1` + `tier2`, not `navGroups[]`. `tier1` is L0 modules
  from `resolveControlSurfacePrimaryTabs`; `tier2` is deep nav of the active
  module. Do not flatten child pages into `tier1`.
- Below `lg` (`useIsMobile(1024)`) the bottom nav prefers `tier2` plus one
  "Mô-đun" tab that opens the full sidebar drawer. From `lg` up the bottom nav
  is hidden and the fixed sidebar takes over.
- `/me/*` is a personal peer route inside this shell (`design-system.md`
  § Structural Governance A.5). It is not part of `tier1` / `tier2`; the entry
  point is the avatar footer account menu. For office staff with no work module,
  `/me` is the landing: desktop keeps brand, notifications, and avatar footer
  without locked modules; mobile renders no empty "Mô-đun" tab and uses the
  header avatar as account trigger. Content uses `Employee*` adapters.

Scroll model (inset panel):

- `SidebarProvider` locks the viewport (`h-svh overflow-hidden`).
- `SidebarInset` keeps a fixed card frame (`overflow-hidden`; desktop `max-h`
  compensates the inset margin).
- Only the panel content scrolls (`overflow-y-auto overscroll-contain`,
  `data-control-surface-scroll`).
- `AppPageHeader` scrolls with content. Freezing it outside the scrollport
  reserves height and produces dead space on dashboards.
- `AppPage scroll` inside `AppShellPaddingBoundary` keeps `overflow-visible` so
  it does not create a second scrollport.

Sticky LIST filters have exactly three mechanisms: the `AppListFrame` toolbar
slot (self-sticky with stuck-state shell bleed), `AppToolbar sticky`, or
`AppStickyFilterChrome` / `APP_PAGE_STICKY_FILTER_CLASSNAME` for a custom bar. A
negative sticky `top` cancels the shell's vertical padding so the filter sits
flush; when stuck it also cancels horizontal shell padding, and returns to the
card surface at scroll top. Never make a filter sticky above KPI or dashboard
cards — it will cover the next section.

A new shell must prove a distinct chrome job, keep plane authority, and use the
existing navigation resolver.

## Branch And Station Presenter Boundaries

Branch and control_surface are separate presentation planes. Loaders, models,
Server Actions, RPCs, and permission checks are shared; presenters are not.
Branch routes own touch-native presentation and lock branch scope by URL.

Standing rule for every Branch route below: no `DataTable`, no
`DocumentFormFrame`, no `AppListFrame`, no `AppPageHeader`, no control_surface
page client, no branch picker, no WAC or stock valuation, no audit history, no
export. Detail and edit steps open a bottom `Sheet` with a sticky
`AppDetailFooter`.

| Route | Archetype | Branch-native shape |
| --- | --- | --- |
| `/stock` | LANDING | Stock home: fulfillment slips + four doors (`Kho hàng` / `Yêu cầu hàng` / `Kiểm kê` / `Hao hụt`). `/stock/transfer` for a store redirects here. |
| `/stock/on-hand` | LIST | `loadStockOnHandPageData` + filter model; `Item` separator rows, `ToggleGroup` status, filter `Sheet`. |
| `/stock/on-hand/[ingredientId]` | DETAIL | `loadStockIngredientDetailData` with `includeValuation: false`. Supplier receiving links to `/stock/grn/new`, never `/stock/receive`. |
| `/stock/grn` | LIST | `loadGrnListPageData`; own drafts first, then queue. Row shows code, supplier, date, status only. |
| `/stock/grn/new`, `/stock/grn/new/[supplierId]` | REDIRECT-SHIM | Compatibility redirects: store → `Yêu cầu hàng`; `Kho Tổng`/`Bếp TT` → `Yêu cầu mua`. No live create UI. |
| `/stock/grn/[id]` | DETAIL | Draft owns a touch receiving list and line sheet; confirmed slips are read-only. Post-confirm correction stays on control_surface `/inventory/grn?grnId=&mode=view`. |
| `/stock/stocktake` | LIST | `loadBranchStocktakeListData`; manager sessions, distinct from `/stock/count` slips. |
| `/stock/stocktake/new` | DOC-WORKFLOW | Mode + location only, then open the session and enter count. |
| `/stock/stocktake/[id]/count` | DOC-WORKFLOW | Number pad entry with unit choice, autosave draft, zone lock, round submit. Blind payload carries no system quantity. |
| `/stock/stocktake/[id]` | DETAIL | Active review takes blind counts and status actions; completed result uses `ItemGroup` system/count/variance. |
| `/stock/issues` | LIST | `writeoff` slips only. New shrinkage goes through `/stock/waste`. |
| `/stock/issues/[id]` | DETAIL | Draft line add/edit/delete in a `Sheet`; quantity capped by stock, reason required. |
| `/stock/waste` | DOC-WORKFLOW | Location/cap plus selected lines; tier, evidence photo, rolling meter, stock cap preserved. |
| `/stock/waste-approvals` | LIST | Queue locked to URL branch; review sheet calls `approveWaste` and keeps the four-eye rule. |
| `/stock/consumption` | LIST | Segmented ledger vs manual document; `/stock/consumption/[id]` is a typed DETAIL. |
| `/stock/count-assignments`, `/stock/count-slips` | LIST | Assignments group by employee; slip review approves or requests recount in a `Sheet`. |
| `/stock/transfer` | LIST | Incoming, history, and detail only. Branch has no create route or CTA. |
| `/stock/reports` | REPORT | URL branch and current month; consumption variance first, then per-ingredient movement with drill-in. Every quantity carries its ingredient unit. |
| `/shift/leave-approvals` | LIST | Status tabs plus full-row items; approve/reject in a bottom `Sheet`. |

control_surface counterparts keep their own management presenters
(`StockClient`, `GrnListClient`, `ReportsPageContent`, `LeaveRequestsTable`,
…) and no longer carry an `embedded` mode or `/br/` route branching. Owner GRN
create clients are retired — list-first GRN from PO only.

`EMBED-WRAPPER` is a transition archetype only. Once a route has native Branch
presentation, update `scripts/page-archetypes.mjs` so the guard prevents a
regression.

Station apps (POS, KDS, Runner) live under `/br/[branchId]/*` and use
`StationSection`, `Frame`, and `OperationalBoardCard`. They never mount the
Branch home bottom nav or control_surface shell.

Visible copy lives in `messages.*`, `APP_COPY_VI`, or the matching domain
registry; routes do not hardcode new operational copy.

## Form Helpers

`apps/web/app/components/form/`, imported as
`import { TextField, FormDialog } from "@/components/form"`.

| Helper | Job |
| --- | --- |
| `TextField` | Text input + RHF `useController` |
| `NumberField` | Generic `FormattedNumberInput` + RHF; not a substitute for a money or quantity adapter |
| `MoneyVndInput` / `MoneyVndField` | Accounting money, up to 2 decimals, `vi-VN` grouping, canonical `.` on submit |
| `WholeVndInput` / `WholeVndField` | Whole-dong money for menu/POS, cash, VietQR, shift count; no decimals |
| `QuantityInput` / `QuantityField` | Inventory quantity, 3 decimals, grouped display |
| `BusinessDateField` | RHF date picker; shows `dd/mm/yyyy`, stores `yyyy-mm-dd`, optional branch timezone note |
| `SelectField` | Select with `options={[{ value, label }]}` |
| `ComboboxField` | Searchable select + RHF; description and error wired to the trigger |
| `Combobox` | Standalone searchable control; inside data entry it must sit in a `FormField` with a stable `id` |
| `FormField` | Label/help/error anatomy for non-RHF or bespoke composition; the child control still owns `id`, `disabled`, and ARIA state |
| `TextareaField` | Textarea + RHF |
| `AppDialog` | Generic app dialog shell; `variant="document"` for list-first PO and GRN documents |
| `FormDialog` | Dialog + `useForm` + `zodResolver` + `useTransition` |
| `valuesToFormData` | Adapter for `withFormAction`-wrapped Server Actions |

Schemas use Zod 4 with `{ error: "..." }`, never `{ message }`. Schemas imported
by both client and server live in `packages/shared/src/forms/<name>.ts`.

Mode choice: use RHF + Zod for line arrays, more than four fields, inline
validation before submit, or pending/dirty submit UX (GRN, transfers,
stocktake, adjustments, production). Use a plain `<form action>` for login, sign
out, and single-reason confirms where a redirect reloads state.

## Overlay URL Handling

The overlay decision tree is owned by `design-system.md` § C.1 (ADR 0018) and
applied per archetype in `page-archetypes.md`. The implementation split:

- Dialog-only keys (`demandId`, `poId`, `grnId`, `mode`, client-only list
  filters) go through `useDocumentOverlayUrl` and the History API — push to
  open, replace for mode change and close — so the list RSC does not refetch.
- Scope keys that change the server dataset (`branchId`, server-backed
  pagination and filters) still use `router.push` / `router.replace`.

## AppPage Width Defaults

control_surface LIST and DETAIL default to `AppPage width="xwide"` (optionally
`density="compact"`); DOC-WORKFLOW defaults to `width="wide"`. `AppPage` is
nesting-aware — set width once per page. Deviation requires the UI Advisor Gate
to state the reading task behind it.

## Keyboard Shortcuts

Single helper: `useKeyboardShortcut` in
`apps/web/app/_lib/use-keyboard-shortcut.ts`.

- Single-key shortcuts (`T`, `D`, `/`) do not fire while focus is in an input,
  textarea, or contenteditable.
- Meta shortcuts (`Cmd+Enter`, `Ctrl+K`) may set `fireInInput: true`.
- `Escape` clears filters or closes overlays; Base UI owns close and focus
  return.
- Render hints with `<Kbd>` / `<KbdGroup>` next to the button label, with
  `className="hidden md:inline-flex"`, and set `aria-keyshortcuts`.

| Surface | Keys |
| --- | --- |
| POS cart (`cart-pane.tsx`) | `Cmd/Ctrl + Enter` send-to-kitchen confirm (fires while typing a note); `T` takeaway; `D` dine-in |
| POS append draft (`append-draft-pane.tsx`) | None — appending must go through the explicit send button |
| KDS (`kds-board.tsx`) | `Escape` clears station, status, and order-type filters |

Adding a shortcut means updating this table and the matching
`aria-keyshortcuts`.

## Discovery And Enforcement

```bash
corepack pnpm audit:ui-components                        # full report
corepack pnpm audit:ui-components --component AppListFrame
corepack pnpm audit:ui-components --component branch-touch-list
corepack pnpm lint:ui-contract
```

- `scripts/ui-component-registry.mjs` — component and block recipes.
- `scripts/check-ui-contract.mjs` + `scripts/ui-contract-guard-reporting.mjs` —
  guard policy and failure reporting.
- `scripts/ui-contract-scope.mjs` — route/surface scope.
- `scripts/page-archetypes.mjs` — route to archetype census.

A block recipe is a lookup entry, not an import layer: no `blocks/` directory,
no new package, no `*Block` component. Add one only with at least two real
consumers or one approved critical workflow. When a composition repeats and
needs shared code, promote or extend a registered adapter and point the block's
`use` field at it.

Do not persist counts, dated audit output, or per-component usage lists in this
document; the scripts and current source own those facts.
