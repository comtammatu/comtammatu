# Inventory & Stock UI Audit — 2026-07-08

> Reconciled-through 23500913b3da

A 7-lane swarm audit of the Inventory Hub (`/inventory`) and Stock Operator
(`/br/[branchId]/stock`) surfaces. Read-only investigation; no code changes.

## Reconciliation status — 2026-07-08

Re-verified against `23500913b3da` after the audit was written. This pass is
static code/schema verification only; browser/runtime smoke still belongs to the
individual fix PRs. The original issue list below remains a snapshot.

| ID | Current status | Evidence / next action |
|---|---|---|
| P0-1 | Confirmed | `dashboard-data.ts` preserves `NULL` as `0`; `dashboard-client.tsx` always renders `formatVND(totalStockValue)`. Fix in Bundle 1. |
| P0-2 | Confirmed | dashboard/price/count failures still degrade to `0`/empty without a visible degraded state. Fix in Bundle 1. |
| P0-3 | Confirmed | `recordSupplierPayment` calls `create_supplier_payment`; the RPC locks invoice/payment amount but does not gate `matching_status` or missing `grn_id`. T3 fix. |
| P0-4 | Confirmed | app pre-check exists, but schema only has non-unique `idx_supplier_returns_grn`; no partial-unique active-return guard. T3 fix. |
| P0-5 | Confirmed | `handleSave` marks every line clean when `okCount > 0`, including failed dirty rows. Fix in Bundle 2. |
| P0-6 | Confirmed with nuance | wizard keeps the raw buffer in local state, but incomplete decimals are not committed to `counts`/draft and arrow navigation can leave them unsaved. Fix in Bundle 7. |
| P0-7 | Confirmed | server counts `confirmed_ship/in_transit/confirmed_receive`; client open helpers include extra `draft/confirmed` variants. Fix in Bundle 1. |
| P0-8 | Confirmed, line refs stale | forbidden tint opacities still exist; some original line numbers moved. Burn down under Bundle 4. |
| P0-9 | Partially stale | supplier-invoice variance callouts now use `Alert`; production detail still has raw destructive tinted callout. Keep Bundle 4 scoped to remaining files. |
| P0-10 | Confirmed | `stockFilter` has Select controls plus an under-threshold toggle. Fix in Bundle 3. |
| P0-11 | Confirmed | Hub keeps `activeCategory`, and `StockMobileGrid` owns a separate category state. Fix in Bundle 3. |
| P0-12 | Confirmed | `CompactQueueSection` filters `rows` to `count > 0`; zero-count browse doors disappear. Fix in Bundle 5 or operator IA patch. |
| P0-13 | Confirmed | native receive sheet accepts `qty < sent` with no shortage note; desktop detail has shortage-note UI. Fix in Bundle 5. |
| P0-14 | Confirmed | native receive only accepts `confirmed_receive`; `confirmed_ship` shows not-ready and links to detail. Fix in Bundle 5. |
| P0-15 | Confirmed | native `confirm()` still exists in inventory stocktake/production paths while other paths use styled `confirm`. Fix in Bundle 5/design cleanup. |

P1 mechanical spot-checks that still reproduce: duplicate value systems,
hardcoded `"Chuyển Bếp"`, dashboard Vietnamese strings without a local allow
header, hand-rolled production form/math, hardcoded blind mode, assignment
drawer without search, stocktake input remount key, TS/SQL unit derivation
mirror, `appendBranchId` substring test, uncached owner-wide stock value query,
unused `showWasteApprovals`, dead `isProductionPath()`, hand-rolled receive
progress bar, missing operator-stock `loading.tsx`/`error.tsx`, hardcoded
catalog metric `"4"`, GRN Save-then-Confirm two-step, list/detail stock status
divergence, two recipe surfaces, and `taxAmount = 0`. Subjective P1/P2 items
such as sparse central-kitchen home and triple Stock entry need live route smoke
plus product decision before coding.

## PR1 T3 contract — money/data integrity

Skill plan: Supabase skill + `docs/agent/rules/database.md` + CodeGraph source
lookup; write migration file only, verify on local/preview before any production
apply. Supabase changelog check on 2026-07-08 found no relevant hosted API
breaking change for these existing RPC/index changes.

PM: scope is P0-3, P0-4, and P0-5 only. Done means supplier payments cannot
bypass 3-way match evidence, duplicate active supplier returns for the same GRN
are impossible under race, and failed GRN line saves remain visibly dirty.

BA: payable invoices require linked GRN evidence and `matching_status='matched'`
before payment. Supplier returns may have at most one non-cancelled return per
`tenant_id + grn_id`. GRN save is per-line partial success: a failed row must
continue blocking confirm until re-saved.

Senior Dev: enforce money rules inside `create_supplier_payment`, not only in
client UI; add a tenant-scoped partial unique index on active supplier returns;
map new RPC/index errors to existing Vietnamese action copy; keep GRN hook change
line-keyed by `lineId`.

QA/QC: extend static guards for supplier invoice payment and return uniqueness,
add a static guard for GRN dirty-line preservation, then run focused tests plus
`corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build`.

Attestation target: SQL/data rules must live in migration/RPC/index, while UI
and Server Actions only surface friendly errors. Out of scope: a manual
discrepancy approval workflow for supplier invoices.

## PR2 T2 contract — dashboard truth

Skill plan: project UI/data rules + CodeGraph source lookup; no new external
tooling. This is a single dashboard surface with server-data mapping and client
rendering only.

PM: scope is P0-1, P0-2, and P0-7. Done means cost-masked inventory value is
not displayed as zero, degraded dashboard subqueries are visible to the user,
and transfer KPI/list counts use the same open-state contract.

BA: `NULL` cost means permission-masked or unavailable, not 0 VND. Query/RPC
errors are degraded data states and must not be indistinguishable from an empty
tenant. Open transfers are draft/confirmed/confirmed_ship/in_transit/
confirmed_receive until completed or cancelled.

Dev: thread `canViewStockValue`, nullable `totalStockValue`, and
`dashboardWarnings` through `loadInventoryDashboardData` into
`DashboardClient`; centralize `isTransferOpen` and reuse it for KPI/list.

QA: add static dashboard tests for masked cost, warning propagation, and the
shared transfer predicate; run focused tests plus hard gate.

## PR3 T2 contract — stock filter contract

Skill plan: project UI rules + CodeGraph source lookup; no database or route
contract change. This is scoped to the stock list shared by Hub and Operator.

PM: scope is P0-10, P0-11, and the under-threshold badge/filter mismatch noted
in the smoke findings. Done means each facet has one visible control source,
operator mobile category chips stay synced with the parent list filter, and the
under-threshold count matches the rows shown by the "low" status filter.

BA: "Dưới ngưỡng" means reorder-risk: out, low, or at/below reorder point. It
is a read-only work signal; status filtering stays in the status control. Category
selection must not be split between a parent state and a child-local state.

Dev: remove category/status Selects from table headers, render desktop filters
through the toolbar, lift `StockMobileGrid` category state to the parent, and
reuse `isReorderRisk` for the "low" filter.

QA: add static guards for one-control filter ownership, parent-owned operator
category chips, and low-filter predicate alignment; run focused tests plus hard
gate.

## PR4 T2 contract — design-system cleanup

Skill plan: UI rules + CodeGraph/source lookup; no schema change. Scope is the
remaining design-system drift inside inventory surfaces.

PM: scope is P0-8, remaining P0-9, and hardcoded inventory dashboard/stock
copy called out in the audit. Done means inventory TS/TSX files do not use the
forbidden tint opacity scale, production shortage warnings use the shared
callout component, and reusable dashboard/stock copy is dictionary-backed.

BA: visual severity must come from approved `Alert`/badge/token semantics, not
ad hoc tinted containers. "Chuyển Bếp" and dashboard flow labels are product
copy and belong in `messages.inventory`.

Dev: replace `/5`, `/12`, `/35`, and non-muted semantic `/30` tint classes in
inventory code; convert the production shortage block to `Alert`; add
dictionary keys for kitchen transfer and dashboard flow/task labels.

QA: add static guards for tint scale, production callout routing, stock copy,
and dashboard copy; run focused tests plus hard gate.

## PR5 T2 contract — operator mobile field-worker

Skill plan: UI rules + workflow rules + CodeGraph/source lookup; no migration.
Scope is the operator hub queue and mobile field-worker stock surfaces.

PM: scope is P0-12, P0-13, P0-14, P0-15, P1-8, and missing
`/br/[branchId]/stock` route boundaries. Done means zero-count queue rows remain
usable browse doors, mobile receive cannot accept a short shipment without a
reason, transfer receive can proceed from `in_transit`, stuck `confirmed_ship`
states produce clear recovery copy instead of a desktop detour, stocktake cancel
uses the shared styled confirm dialog, and count-assignment drawers can search
large SKU lists.

BA: a shipment received short needs a human explanation. `confirmed_ship` means
the sender still owns the transit step; the receiver should not be told to open
a desktop screen that cannot change that permission boundary. Queue rows are
navigation doors even when there is no pending count.

Dev: keep transfer state transitions in Server Actions/RPCs, add client-side
shortage-note validation before posting `p_items`, preserve row visibility in
the hub queue, add search state to the drawer, and add shared route
`loading.tsx`/`error.tsx` boundaries.

QA: add static guards for queue row visibility, receive shortage-note payloads,
transfer state-machine handling, styled confirm usage, drawer search, and route
boundaries; run focused tests plus hard gate.

## PR6 T2 contract — counting, production, unit debt

Skill plan: UI rules + workflow rules + CodeGraph/source lookup; no migration.
Scope is the remaining counting correctness and unit/production helper debt that
can be fixed without changing persisted workflow semantics.

PM: scope is P0-6, P1-4, P1-7, P1-9, and the client-side production recipe math
called out in P1-11. Done means stocktake wizard cannot leave a half-typed
decimal uncommitted during row navigation, stocktake count respects the session
blind-mode setting, classic stocktake inputs do not remount on every saved
value refresh, duplicated unit option builders delegate to one helper, and the
production create UI consumes server-action recipe usage values instead of
repeating the recipe formula inline.

BA: blind mode is the session's operating choice, not a hardcoded UI posture.
Unit selection behavior must stay identical across purchase/count/issue/
production, but the sort/filter/default rule should have one source in code.
Production planned usage should be displayed from the recipe context contract,
so later formula changes do not require hunting through the UI.

Dev: add a shared `unit-options` helper while preserving existing exported API
names, validate/commit the wizard buffer before moving active rows, thread
`blind_mode` from `stocktake_sessions`, stabilize stocktake input keys by line
id, and add `default_usage_per_fg` in the production recipe context returned by
the Server Action.

QA: add static guards for the unit helper delegation, wizard commit-before-
navigation, blind-mode threading, stable stocktake input keys, and production
client formula removal; run focused tests plus hard gate.

## Method

Seven parallel lanes (code-explorer + code-reviewer subagents) covering:

1. Hub shell, navigation IA, and dashboard
2. Stock core view (`StockClient`, shared by Hub + Operator)
3. Inbound & procurement (GRN, PO, supplier invoices/returns)
4. Outbound & stocktake (transfers, issues, waste, counting)
5. Production, recipes, catalog/settings, unit system
6. Operator hub home & navigation layer
7. Cross-cutting design-system & UX consistency

Each lane produced a structured report with file:line references. This document
consolidates the findings into a ranked backlog.

## Surface architecture

```
┌─────────────────────────────────────────────────────────────┐
│  INVENTORY HUB (/inventory)  — office: owner, warehouse_mgr │
│  Shell 2 tiers: tier1 office + tier2 inventory (5 groups)   │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐   │
│  │Dashboard │ Stock    │ GRN/PO   │ Transfers│ Catalog  │   │
│  │ 3 render │ + detail │ +Invoice │ Stocktake│ Settings │   │
│  │ modes    │ + card   │ +Return  │ Waste    │ Recipes  │   │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘   │
│                       ↕ shared components                   │
├─────────────────────────────────────────────────────────────┤
│  STOCK OPERATOR (/br/[id]/stock) — branch: manager, staff   │
│  Each page = thin wrapper calling Hub *PageContent with      │
│  embedded=true + routeBranchId + branchStockBasePath         │
│  Hub home (/br/[id]): tiles + queue + overview (PWA)         │
└─────────────────────────────────────────────────────────────┘
```

Core pattern: ~52 operator pages are thin RSC wrappers that re-mount the Hub
client components with `embedded=true`. No business logic duplication — only
chrome differs. All state transitions live in PostgreSQL RPCs; the TS layer is
a thin auth/transport/validation wrapper.

## Architectural strengths (preserve these)

- **EMBED-WRAPPER pattern** (Hub↔Operator) is clean — no duplicated business logic.
- **RPC-first** for every state transition; TS layer stays thin.
- **`useSyncExternalStore`** for responsive layout is the sanctioned shape.
- **Primitives used consistently**: `AppPage` / `AppSection` / `DataTable` / `KpiCard` / `StatusBadge` / `DocumentFormFrame`.
- **Stocktake subsystem** (zone-lock + draft-saver + ABC + blind + 4-eye waste) is sophisticated and domain-correct.
- **WAC cost-gating** at the RPC layer (security-definer, NULL masking) is in the right place.

---

## P0 — Critical (correctness, data integrity, contract violations)

### Data correctness

| # | Issue | Location | Impact |
|---|---|---|---|
| P0-1 | `totalStockValue` shows "0 ₫" when user lacks cost permission — cannot distinguish genuine zero from masked | `dashboard-data.ts:220-223` → `dashboard-client.tsx:681-687` | branch_manager sees false numbers |
| P0-2 | Dashboard RPC/query errors silently coerced to 0 (identical to "no data yet") | `dashboard-data.ts:211-216` | Supabase outage looks like fresh tenant |
| P0-3 | **No payment gate** on supplier invoice — `matching_status="discrepancy"` can still be paid | `supplier-invoice-actions.ts:119` | Financial risk (3-way match advisory only) |
| P0-4 | `createSupplierReturnFromGrn` pre-check is racy — concurrent submissions can both pass | `supplier-return-actions.ts:247-260` | Double-returns possible |
| P0-5 | GRN line save partial-success: failed rows marked "clean" → confirm without realizing a line wasn't saved | `use-grn-line-actions.ts:58-102` | Data loss per line |
| P0-6 | Stocktake wizard drops typed-but-uncommitted buffer (e.g. "0.") on row navigation — never committed, never drafted | `stocktake-count-wizard.tsx:88-105,165-171` | Lost counts |
| P0-7 | `activeTransfers` count diverges: server (3 statuses) vs client (5 statuses) → KPI ≠ task list | `dashboard-data.ts:229` vs `dashboard-client.tsx:361` | Inconsistent numbers |

### Design-system contract violations

| # | Issue | Location | Contract |
|---|---|---|---|
| P0-8 | Forbidden tint opacities (`/5`, `/12`, `/35`, non-muted `/30`) | 9 files (see below) | design-system.md Tint Opacity Scale |
| P0-9 | Hand-rolled tinted callout chrome instead of `Alert`/`NoteCallout` | `production/[id]/production-detail-client.tsx:237`, `supplier-invoices/supplier-invoices-client.tsx:953,975` | design-system.md Callout routing |
| P0-10 | `stockFilter` exposed **3×** for one facet (toolbar Select + column-header Select + underThreshold toggle) | `stock-client.tsx:571,826,753` | ui.md "1 facet = 1 control" |
| P0-11 | `activeCategory` duplicated on Hub desktop (column header + toolbar) + `StockMobileGrid` uses local state **not synced** to parent | `stock-client.tsx:550,806` + `stock-mobile-grid.tsx:105` | 1 facet multiple controls + state drift |

#### P0-8 tint violation file list

- `inventory/_components/stocktake-mode-selector.tsx:102` — `bg-primary/5`
- `inventory/count-assignments/count-assignments-client.tsx:453` — `border-primary/30 bg-primary/5`
- `inventory/production/[id]/production-detail-client.tsx:237` — `border-destructive/30 bg-destructive/5`
- `inventory/purchase-orders/new/new-po-client.tsx:690` — `bg-info/5`
- `inventory/reports/reports-client.tsx:158-159` — `bg-destructive/12`, `bg-muted/35`
- `inventory/settings/thresholds/thresholds-client.tsx:330,394` — `bg-warning/5`
- `inventory/stocktake/[id]/stocktake-detail-client.tsx:585-587` — `bg-success/5`, `bg-warning/5`, `bg-destructive/5`
- `inventory/supplier-invoices/supplier-invoices-client.tsx:953,975` — variance callouts
- `inventory/suppliers/suppliers-client.tsx:40-42` — avatar ramp `bg-*/12`

Fix: migrate `/5` → `/10`, `/12` → `/10` (or `/15`), `/35` → `/30` or `/50`, replace `border-*/30` hairlines with `/20`.

### Operator UX

| # | Issue | Location |
|---|---|---|
| P0-12 | Queue rows hidden when count=0 — contradicts documented "persistent browse door" rule | `hub-queue-section.tsx:157` vs `data.ts:213-219` |
| P0-13 | Operator receive missing shortage-note — mobile can accept short shipments with no documented reason (desktop forces ≥3 chars) | `transfer-receive-client.tsx:86-107` |
| P0-14 | Transfer stuck at `confirmed_ship`: operator receive shows "not ready" with no recovery action; must switch to desktop | `transfer-actions.ts:657-669` + `transfer-receive-client.tsx:109-134` |
| P0-15 | Native `confirm()` used in some places, styled `confirm()` in others (mobile-shell break) | `stocktake-list-client.tsx:147` |

---

## P1 — Important (friction, tech debt, consistency)

1. **Two sources of truth for inventory value**: `get_inventory_dashboard` RPC (MV-backed) vs `fetchInventoryValueSystem`/`fetchInventoryValueByBranch` (JS aggregation) — different join sets, can drift.
2. **"Chuyển Bếp" hardcoded Vietnamese** not in dictionary — `stock-client.tsx:491,1108`, `quick-internal-transfer-dialog.tsx:32,48,100,105`.
3. **dashboard-client.tsx hardcodes 7 Vietnamese strings** with no `vi-allow` header — `:220,228,248,264,292,317,332`.
4. **5 near-identical unit selectors** (`count-units`, `issue-units`, `purchase-units`, `production-units` ×2) — 2 functions byte-identical.
5. **`production-new-client.tsx` does not use react-hook-form** (hand-rolled useState) while siblings use RHF+zod.
6. **Two parallel counting systems** (S13a wizard vs employee count-slip runtime) with no unified entry — branch can have both a stocktake session and pending slips simultaneously.
7. **Blind-mode hardcoded `true`** (`count-client.tsx:98`) though selector promises `defaultBlind:false` for daily/weekly — UI lies about mode.
8. **Count-assignment drawer has no search** — hundreds of SKUs require manual scrolling — `count-assignments-client.tsx:444-480`.
9. **Stocktake detail classic remounts input on every refresh** (key by value) → loses focus during fast counting — `stocktake-detail-client.tsx:487-498`.
10. **TS mirror of SQL `inv_derive_to_base_factor`** with "must sync manually" warning — drift footgun — `unit-derivation.ts:1-7`.
11. **`production-new-client` recomputes recipe math client-side** duplicating RPC — drift if formula changes — `production-new-client.tsx:87-101`.
12. **`appendBranchId` substring check** — false positive if unrelated query param contains "branchId=" — `dashboard-client.tsx:107`.
13. **Whole-tenant `totalValue` query** runs sequentially, uncached, on every owner page load — `stock/page.tsx:289-306`.
14. **`showWasteApprovals` prop threaded through shell → nav resolver but never used** — `inventory-nav.ts:31`.
15. **`isProductionPath()` dead code** always returns false — `inventory-shell.tsx:35-37`.
16. **Hand-rolled progress bar** with inline `style` instead of `Progress` primitive — `transfer-receive-client.tsx:150-157`.
17. **Hub queue row touch chrome reimplemented** instead of primitive — `hub-queue-section.tsx:127-153`.
18. **`/br/[id]/stock/**` missing `loading.tsx`/`error.tsx`** entirely (52 pages) — violates page-archetypes §1.
19. **Catalog flow card hardcodes metric `"4"`** instead of a real count — `dashboard-client.tsx:336`.
20. **GRN Confirm disabled-until-clean forces 2-step dance** (Save → Confirm); no "Save & Confirm" combined action.
21. **Status semantics diverge between list and detail**: list `computeStatus` ignores `reorder`; detail treats `qty <= reorder` as `low` — same ingredient shows different status badges.
22. **Two "recipe" concepts** with overlapping names: production recipe (BOM) vs menu recipe (costing) — confusing for contributors.
23. **`taxAmount` hardcoded to 0** in PO detail summary — `po-detail-client.tsx:193`.
24. **Central kitchen home may be too sparse** — only 4 stock tiles + 1 CTA; two tiles reuse the `Package` icon.
25. **Triple entry to Stock** for branch managers (home tiles + bottom nav + queue rows) — home grid doesn't earn its keep for that persona.

---

## P2 — Polish

- `space-y-*` used for section/card stacks in `production/[id]/…:133,165` and `production/new/…:164` (use `flex flex-col gap-*`).
- `production-detail-client.tsx:169-176,206-213` uses raw `<Input type="number">` instead of `QuantityField`.
- `font-bold` on report figures where `font-semibold` is the lock — `reports-client.tsx:174`.
- Partial uppercase label role without `tracking-wide` — `create-transfer-dialog.tsx:517`, `po-detail-client.tsx:870-985`.
- KPI grid columns shift between modes (`lg:grid-cols-3` only in procurement) — `dashboard-client.tsx:862`.
- Dashboard's secondary-action sprawl — up to 16 outline CTAs for a procurement owner.
- `StockLocationBreakdownLine` hardcodes "Kho"/"Bếp" while surrounding vocab is English.
- `underThresholdCount` includes `qty <= reorder` but `stockFilter="low"` filters on status — clicking the badge may show fewer rows than the count implies.
- ABC chip tooltip text hardcoded Vietnamese while the rest uses `ABC_CLASS_LABELS_VI` — `abc-class-chip.tsx:35-39`.
- Waste `ALWAYS_TIER_2` / `RISKY_REASONS` duplicated client-side, must hand-sync with DB trigger — `waste-reason-dropdown.tsx:16-28`.
- Count-slips approve confirm wrongly uses `variant: "destructive"` — `count-slips-client.tsx:240`.
- Draft-saver badge buried below the number pad in the wizard — easy to miss on phone.

---

## Optimization bundles (suggested PR groupings)

Each bundle is independently shippable because it touches a distinct surface.

### Bundle 1 — "Truthful numbers" (P0-1, P0-2, P0-7)

- Thread `canViewCost` from RPC → `InventoryDashboardData` → `DashboardProps`; hide/mask header stock value when false.
- Propagate dashboard RPC/query errors instead of coercing to 0 (degraded banner or error state).
- Unify `activeTransfers` definition in the server mapper so KPI and task list agree.

### Bundle 2 — "Financial gates" (P0-3, P0-4, P0-5)

- Block or warn-and-confirm payment when invoice `matching_status != "matched"` or `grn_id == null`.
- Add partial-unique index on `grn_id` for active supplier returns.
- Mark only actually-saved GRN rows clean; consider a transactional RPC for batch save.

### Bundle 3 — "Filter contract" (P0-10, P0-11)

- Pick one canonical home per facet (toolbar); remove column-header embedded Selects or repurpose as sort.
- Lift `StockMobileGrid` category state to parent, or remove parent's `activeCategory` plumbing on the embedded path.

### Bundle 4 — "Design-system cleanup" (P0-8, P0-9 + P1-2, P1-3)

- Burn tint opacity down to `/10`/`/15`/`/20`/`/30`/`/50`.
- Replace hand-rolled callout chrome with `Alert` / `NoteCallout`.
- Dictionary "Chuyển Bếp" + the 7 dashboard strings (or add `vi-allow` header with justification).

### Bundle 5 — "Operator mobile field-worker" (P0-13, P0-14, P0-15 + P1-8)

- Add shortage-note step in the receive `NumberPadSheet` when `value < sheetItem.qty`.
- Add recovery action for transfer stuck at `confirmed_ship` in the operator receive empty-state.
- Add search to count-assignment drawer; replace native `confirm()` with the styled dialog everywhere.

### Bundle 6 — "Unit system & tech debt" (P1-4, P1-10, P1-11)

- Collapse 5 unit selectors into one `getIngredientUnitOptions(ingredient, opts)`.
- Add contract test feeding identical inputs to TS and SQL derivation; assert equal output.
- Have production RPC return pre-computed `default_usage` per ingredient; drop client recompute.

### Bundle 7 — "Counting unification" (P1-6, P1-7, P1-9)

- Decide one counting taxonomy in navigation; document when to use which path.
- Honor `defaultBlind` from the selector or remove the promise.
- Switch stocktake detail classic to controlled inputs or debounced refresh.

---

## Lane reports (full detail)

Each lane's full structured report (flow maps, component trees, data flows,
file:line references) is held in the session context that produced this
document. Re-investigate a specific lane if you need its verbatim findings; the
consolidated tables above capture every actionable item.

## Verification approach for fixes

Per `docs/agent/rules/workflow.md`:

- T3 full debate for P0-3 (payment gate), P0-4 (return uniqueness), P0-5 (GRN
  atomicity) — money/RLS/data-integrity surface.
- T2 self-review for P0-1, P0-2, P0-7, P0-10, P0-11, design-system cleanup —
  single surface, clear contract.
- `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build`
  before marking any task complete.
- `corepack pnpm lint:ui-contract` catches the frozen-baseline tint and
  inline-chrome drift automatically (advisory-with-baseline).
