# Office/Management UI Audit — Finance / HR / Inventory + Shared Office Shells + Alongside Modules

> Reconciled-through 49112fa17fec

Date: 2026-06-28
Scope: the OFFICE/MANAGEMENT chrome family beyond Admin — Finance, HR, Inventory
(core + procurement-docs + stock-ops), the shared office shells, and the modules
running alongside (menu, orders, branches, branch-settings, notifications).
Authority: `docs/spec/design-system.md` (the locked "Com Tam Ma Tu Custom Theme").
Method: read-only, file-by-file, 7 parallel lanes, each finding verified against
code + spec clause. Composes with the Admin pass (`audit-2026-06-28-fullstack.md`)
into one program.

## Executive Verdict

The office family is **structurally healthier than Admin at the shell layer and
materially drifted one layer down**. The Management chrome itself — `app-shell.tsx`
(one `SidebarProvider`, one header, padding owned once via `AppShellPaddingBoundary`,
gap-stacking solved by `AppPage` nesting-context) — is genuinely clean: RC-2 and RC-4
do **not** recur at shell level. `pnpm lint:ui-contract` is green and all four shell
files match the frozen `shell-registry` baseline. Yet the drift ships anyway, because
the gates do not cover it — exactly the enforcement holes the brief named.

The headline: **three of the four Admin root causes are now CONFIRMED family-wide**,
not Admin-local. RC-1 (field-idiom split) and RC-2 (card-in-card) recur in every
office module; RC-3 (width/nav mismatch) recurs hardest inside Inventory, the largest
module, where AppPage width jumps across 4 distinct values on sibling navigation — the
primary "lệch / bể layout" symptom. RC-4 (ad-hoc margins) is present but mostly P2/P3.
All three enforcement holes are confirmed: bg-less bordered card-clones, bare-Input-vs-
`form/*`, and `p-4` (vs `p-5+`) clones all ship green.

**Severity tally:** P0 = 0, P1 = 18, P2 = 31, P3 = 6 (after verifier downgrades —
several lane-proposed P1s were corrected to P2/P3; see per-lane notes). No real layout
break/overflow on a real viewport was confirmed (no P0). The most damaging confirmed
P1 class is RC-3 width-jump inside Inventory, and the nested-header / triple-header
composition bugs on Inventory mobile/settings.

---

## 1. Systemic vs Local Verdict (THE headline)

For each Admin root cause and each enforcement hole, the verdict below states whether
it is now **CONFIRMED family-wide** (with the count of modules affected) or **Admin-local**.

| Admin finding | Verdict | Modules confirmed | Evidence anchor |
| --- | --- | --- | --- |
| **RC-1 field-idiom split** (bare `Input`/`Select`/`Label` h-7 vs `form/*` h-10) | **CONFIRMED family-wide** | **6 modules**: finance, hr, inventory-core, inventory-docs, inventory-stockops, menu/orders/branches/branch-settings | FIN-01/08, HR-01/02/03, INV-05, INV-P-01, F-01/02/03 |
| **RC-2 card-in-card** (hand-rolled `rounded-md/lg border p-3/4` inside Card/AppSection) | **CONFIRMED family-wide** | **6 modules**: finance, hr, inventory (pervasive ~45 hits stock-ops + ~22 docs), orders, branch-settings | FIN-02/09, HR-04/05, INV-02/03, INV-P-02, INV-12, F-04/12/13 |
| **RC-3 width/nav mismatch** (AppPage width jumps on navigation) | **CONFIRMED family-wide, WORST in Inventory** | **3 modules**: inventory (4 distinct widths under one shell), finance (wide vs default), hr (list→detail jump) | SHELL-01, FIN-03, HR-06, INV-06, INV-P-03/04, INV-03 |
| **RC-4 gap-stack + ad-hoc margins** | **CONFIRMED family-wide but mostly P2/P3** | **5 modules**: finance, hr, inventory, orders, notifications | FIN-04, HR-07/12, INV-04, INV-P-05, F-05/06/10/14 |
| **Hole (a)** inline-chrome gate skips bg-less bordered panels | **CONFIRMED family-wide** | every module with RC-2 | INV-03 (regex `check-ui-contract.mjs:868` matches only `bg-card\|background`), F-16, INV-P-14 |
| **Hole (b)** no gate for bare-Input-vs-`form/*` | **CONFIRMED family-wide** | every module with RC-1 | FIN-10, F-16, SHELL-04 |
| **Hole (c)** raw-padding gate only flags `p-5+`, `p-4` clones escape | **CONFIRMED family-wide** | every module with RC-2 | SHELL-03 (`px-4 py-4 sm:px-5` override ships green), INV-P-14 |

### Parallel / competing shells (Shell Registry reality)

All 4 chrome shells match the frozen `shell-registry` baseline and are allowlisted by
spec §602–612; none is a hard violation. But two are **divergence vectors** and two
sub-chromes are genuine governance breaks:

| Shell / sub-chrome | Status | Verdict |
| --- | --- | --- |
| `app-shell.tsx` → `office-module-shell.tsx` → `management-chrome.tsx` | Canonical | Clean. admin/hr/menu/orders/branches all route through it. |
| `finance-shell.tsx` | Allowlisted parallel wrapper (§606–609, owns realtime channel) | **SHELL-07 P2**: hand-assembles `AppShell` directly instead of routing through `ManagementShell`; re-types brand/tier1/pageHeader — the divergence vector. |
| `inventory-shell.tsx` | Allowlisted parallel wrapper (owns branch nav + MobileTopBar) | **SHELL-07 P2** same; plus **SHELL-02 P1** injects a 2nd `<header>` (MobileTopBar) into AppShell's own sticky header. |
| `inventory/settings/layout.tsx` | **NO shell** — page-built sub-nav | **SHELL-03 P1**: 3rd-chrome clone — ad-hoc `AppSection contentClassName="px-4 py-4 sm:px-5"` + bare `<div>` + `rounded-full` pill nav. |
| `_components/mobile/*` family (mobile-page, mobile-section-header, mobile-top-bar) | Slated for deletion | **SHELL-05 / INV-08 P1/P2**: re-implements `AppPage` + `AppPageHeader` with hand-rolled `<h1>` (§236), forces `width="narrow"`. 4 real consumers. |
| `inventory-page-layout.tsx` | 2-line `AppPage` pass-through (NOT a competing shell) | **SHELL-06 P2**: defaults `scroll=true`, opting inventory into an inner overflow-auto the rest of the office does not use. |

---

## 2. Cross-Module Drift Matrix

Cells = actual value. **Bold** = mismatch against the de-facto family norm.

| Dimension | finance | hr | inventory | menu | orders | branches | branch-settings |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **AppPage width** | **wide + default mixed** (FIN-03) | wide, **detail=default** (HR-06) | **4 widths: wide/default/full/narrow** (SHELL-01) | default | default | default | **full (settings layout)** (SHELL-03) |
| **density** | compact (dash/rev), default (rest) | default | compact (dense lists), default | default | default | default | default |
| **section gap** | gap-4 + **SectionHeading extra layer** (FIN-04) | gap-4 + **mt-\* leaks ×9** (HR-07) | gap-4 + **mt-\* ×20** (INV-04) | gap-4 | gap-4 + **double-toolbar** (F-05) | gap-4 | gap-4 + **space-y-2 ×8** (F-10) |
| **card surface** | **Metric/CashVariance clones** (FIN-02) | **FormSection clones** (HR-04/05) | **~45+22 clones** (INV-02/03/P-02) | Card OK | **5 sheet clones** (F-04) | Card OK | **toggle-row clones** (F-12/13) |
| **input height idiom** | **bare h-7 + form/\* h-10** (FIN-01/08) | **bare + h-9 patch + raw datetime** (HR-01/02/03) | **bare h-7 + h-8 patch + form/\* h-10** (INV-05) | **bare + FormattedNumberInput** (F-01) | **bare filter inputs** (F-03) | **InputGroup h-12** (F-07) | **PrinterForm bare ×8** (F-02) |
| **chart tokens** | **HeatmapGrid stops at chart-3** (FIN-07) | n/a | **0× chart-1..5; semantic tokens + kinetic hover** (INV-04/07) | n/a | n/a | n/a | n/a |
| **parallel shell?** | finance-shell (allowlisted) | no | **inventory-shell + settings/layout + mobile/\*** | no | no | no | no (settings/layout owns sub-nav) |

The Inventory column is the densest red: 4 page widths under one shell, a chart library
that never touches the locked ramp, three parallel chrome surfaces, and the highest
RC-1/RC-2 counts. Inventory is the module that reads most "bể".

---

## 3. Per-Lane Sections

### 3a. Shared Office Shells + Module Layouts

The chrome every office module renders through is well-consolidated. RC-2/RC-4 do not
recur at shell level. The systemic drift lives one layer down in per-module/per-page
composition the shells fail to constrain. The verifier corrected SHELL-01 from P0→P1
(visible reflow, not an unusable break) and SHELL-04 from P1→P2 (latent drift, not a
confirmed visible-misalignment recurrence: most bare-Input usage is spec-permitted
filter bars).

| ID | Sev | Title | Evidence | Spec clause | Recurs | Recommendation | Effort |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SHELL-01 | P1 | Inventory pages disagree on AppPage width — max-width JUMPS on every nav | `stock-client.tsx:708` (responsive wide), `issues:695`/`po:211`/`stocktake:225`=wide; `count-slips:85`/`waste/approvals:61`/`waste/new:35`/`transfers/new:53`=default; `supplier-invoices:689`/`settings/layout:37`=full; `drafts:76`/`grn/new:132` (MobilePage)=narrow. 4 widths, deep-nav siblings under one shell | §668 Page Padding Authority / §627 Route-Home-IA | RC-3 | Pick one inventory body width (wide is the majority), route every page through InventoryPageContent with it; reserve full for genuine edge-bleed tables (supplier-invoices), document the exception | M |
| SHELL-02 | P1 | Inventory mobile renders two `<header>` + two stacked sticky-top-0 bands | `app-shell.tsx:309` (header sticky) wraps `:373-377` (mobileTopBar slot sticky) into which `inventory-shell.tsx:138-140` injects `mobile-top-bar.tsx:15` (`<header sticky top-0 z-30 h-14>` with own brand+signout) | §613 canonical header lockup MUST be exported primitive / §550 don't repeat workflow state | §613 (NOT RC-3) | MobileTopBar should not be a 2nd `<header>` with own sticky/brand; feed only content into the AppShell slot, or drop it and let AppShell own the single mobile header | M |
| SHELL-03 | P1 | `inventory/settings/layout.tsx` hand-built sub-chrome: ad-hoc padding override + bare div + pill nav | `settings/layout.tsx:47` `contentClassName="px-4 py-4 sm:px-5"` (RC-2 + escapes raw-pad gate which only flags p-5+), `:50` bare `<div>`; `settings-section-nav.tsx:38` `rounded-full border px-4 py-2` pills | §197/§207 (RC-2); §285 Radius (control tier = rounded-md); §646 Nav-Single-Source | RC-2 | Drop the contentClassName override; replace pill nav with link-based route nav at rounded-md (AppPageTabs is value-based, not a literal drop-in); remove bare div | S |
| SHELL-04 | P2 | RC-1 field-idiom split: 20 lane files import bare `Input` alongside `form/*` | 20 files import `@comtammatu/ui/components/input`; only `issues-client.tsx` co-locates bare Input with a true form/* control (and there dates are patched `h-10` to match). Most usage = spec-permitted filter/search bars | §252 Height Scale (filter bars MAY use compact bare Input; violation = mixing in one data-entry flow) | RC-1 | Per-surface decide which idiom wins; convert data-entry forms to `form/*`; add the missing bare-Input-vs-`form/*` gate | L |
| SHELL-05 | P2 | MobilePage / MobileSectionHeader re-implement AppPage + AppPageHeader (deletion-slated) | `mobile-section-header.tsx:60` hand-rolled `<h1 font-heading text-xl...>` + `:64` `mt-1`; `mobile-page.tsx:12` forces `width="narrow"`. Consumers: `drafts:77`, `grn/new:133`, `grn-create:316`, `transfer-receive:165` | §236 Page H1 MUST come from AppPageHeader; §209 (RC-4); §537 | RC-4 | Migrate 4 callers to AppPageHeader, remove forced narrow width, delete MobilePage/MobileSectionHeader | M |
| SHELL-06 | P2 | InventoryPageContent defaults `scroll=true` — inner overflow-auto the rest of the office doesn't use | `inventory-page-layout.tsx:16` `scroll=true` default; `surface.tsx:121` toggles `no-scrollbar overflow-auto`; finance/hr/menu use AppPage default `scroll=false` | §668 / §552 who owns the scroll frame | none | Default `scroll=false` to match the family; opt full-height boards into scroll explicitly, or lift the decision into AppShell main | S |
| SHELL-07 | P2 | Two parallel Management wrappers (FinanceShell, InventoryShell) hand-assemble AppShell instead of routing through ManagementShell | `finance-shell.tsx:50-76` + `inventory-shell.tsx:121-147` each re-type brand/tier1=resolveOfficePrimaryTabs/tier2/pageHeader directly | §597 Shell Registry (wrappers keep ONLY shell-scoped client state) / §646 | none | Route both through ManagementShell, keeping only genuinely shell-scoped client state (finance realtime, inventory branch nav) as wrappers | M |
| SHELL-08 | P3 | Office header description band set inconsistently across modules → per-module header height drift | `office-module-shell.tsx:88-117` hr/menu/orders/branches set `description`, admin omits; `finance-shell.tsx:64-66` sets it; `app-shell.tsx:368-372` renders it as an extra `mt-1` band | §211 Heading-per-role / §543 | none | Decide whether the Management header carries a description band; apply uniformly or move descriptions into AppPageHeader.description on the body | S |

### 3b. Finance

The healthiest office module. Shell, scaffolding, loading/error frames, chart ramp,
money cells, status vocabulary are correct. Five systemic issues remain (RC-1/2/3/4 +
a numeric-formatting pattern).

| ID | Sev | Title | Evidence | Spec clause | Recurs | Recommendation | Effort |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FIN-01 | P1 | RC-1: bare Input/Select/Label (h-7) alongside h-10 `form/*` in FilterBar + InvoiceList dialogs | `filter-bar.tsx:181,199,206,252,259,278,306,317`; `invoice-list.tsx:921,932,944,955,970` | §252 Height Scale | RC-1 | Replace bare Input+Label in date rows with `form/BusinessDateField`/`TextField`; route the 4 invoice AlertDialog bodies through `form/TextField` | M |
| FIN-02 | P1 | RC-2: hand-rolled `rounded-md border p-3` Metric tiles inside AppSection + bare-div CashVarianceCard | `work-queue-strip.tsx:60-84` (local Metric); `revenue-client.tsx:888-967` (CashVarianceCard `grid grid-cols-2 gap-3 sm:grid-cols-4`, value `text-lg` not KpiCard `text-2xl`) | §197/§207 (RC-2); §437-444 KpiCard | RC-2 | Replace Metric with KpiCard (compact); replace CashVarianceCard with KpiCard tiles in KpiRow | M |
| FIN-03 | P1 | RC-3: AppPage width jumps wide+compact (dash/revenue/food-cost) vs default (expenses/invoices/summary/inventory-value) within one shell | `page.tsx:212` wide compact; `revenue-client.tsx:556` wide compact; `food-cost/page.tsx:37`, `expenses/page.tsx:41`, `invoices/page.tsx:32`, `summary/page.tsx:21,47,65` (no width); `inventory-value/page.tsx:15` wide | §668 Page-Padding-Authority | RC-3 | Align all Finance routes to `width="wide" density="compact"` so content stays stable | S |
| FIN-04 | P2 | RC-4: hand-rolled SectionHeading adds an extra gap layer between KPI grids; ad-hoc mt-* in mobile Item cards | `revenue-client.tsx:199-212` SectionHeading used ×4 (`:588,675,714,857`); `invoice-list.tsx:672,678,681,695` mt-* on ItemContent | §209 (RC-4); §211 | RC-4 | Remove SectionHeading, use AppSection title/description; remove ad-hoc mt-* from ItemContent/ItemFooter | S |
| FIN-05 | P2 | Four duplicate local `formatCount` helpers + raw `.toLocaleString("vi-VN")` count cells missing `font-mono` | `page.tsx:50`, `work-queue-strip.tsx:38`, `food-cost-client.tsx:38`, `revenue-drill-tabs.tsx:37`; `revenue-client.tsx:426,472,516,544,615,752,805,839,895` | §446-456 numeric cells require font-mono tabular-nums | none | Consolidate behind one shared formatter; add font-mono to quantity/count cells | M |
| FIN-06 | P2 | `MetricInline` local stat primitive duplicates KpiCard compact use case | `page.tsx:61-83`, used ×4 in HddtComplianceBand `:115-132` (`text-sm` value vs KpiCard `text-2xl`) | §437-444 (stat-card-ssot ratchet) | none | Replace with `KpiCard size="sm"` or a registered compact variant | S |
| FIN-07 | P2 | HeatmapGrid only reaches chart-1..3 of the 5-token ramp; chart-4/5 are dead | `heatmap-grid.tsx:44-51` bucket4→chart-2, bucket5→chart-3 (comment says chart-5) | §89 Token Contract Data chart-1..5 | none | Extend FILL_VAR to chart-4 (bucket4) / chart-5 (bucket5) | S |
| FIN-08 | P1 | RC-1 epicenter: 7 bare Input+Label groups inside AlertDialog bodies | `invoice-list.tsx:921-970` (replace dialog 5 bare Inputs); `:739-751,782-797,830-860` cancel/refund/method-fix Label+Textarea | §252 (RC-1); §530 | RC-1 | Wrap replace dialog in FormDialog with `form/TextField`/`BusinessDateField`; cancel/refund use `form/TextareaField` | M |
| FIN-09 | P2 | CashVarianceCard uses `text-lg` numeric values vs KpiCard `text-2xl` (orphan client section) | `revenue-client.tsx:894,903-906,917,925` `text-lg font-semibold font-mono tabular-nums` | §437-444 | RC-2 | Replace hand-rolled blocks with KpiCard tiles in KpiRow | S |
| FIN-10 | P2 | Enforcement hole: FilterBar bare Select/Input escape both the form/* height gate and inline-chrome gate (no bg token, h-7 not h-10) | `filter-bar.tsx:176-354`; date Inputs `:306,317` | Hole (b) NO gate for bare-Input-vs-`form/*` | enforcement-hole | Add a gate flagging bare Input+Label patterns in non-form files; migrate filter-bar dates to `form/*` | L |

### 3c. HR

Structurally healthier than Admin: tables use DataTable, leave/attendance/payroll use
shared StatusBadge, main dialogs use FormDialog + `form/*`. Five systemic issues
remain, concentrated in the tool surfaces that bypassed FormDialog (payroll, checklist-
template builder, permissions). Verifier confirmed HR-06 (list→detail width jump) and
HR-10 (`md:grid-cols-7` overflow on tablet) as genuine P1.

| ID | Sev | Title | Evidence | Spec clause | Recurs | Recommendation | Effort |
| --- | --- | --- | --- | --- | --- | --- | --- |
| HR-01 | P1 | Payroll standard-days Input hard-patched to `h-9` instead of `form/number-field` | `payroll-list-client.tsx:175`; `payroll-detail-client.tsx:331` | §275-283 Height Scale (h-9 not a permitted form-control height) | RC-1 | Replace with `form/number-field` (h-10) in a shared `PayrollStandardDaysField` | S |
| HR-02 | P1 | Checklist-template builder dialog: ~10 bare Input/Label/Textarea (largest RC-1 site) | `checklist-templates-table.tsx:461-640` | §275-283 (form fields via form/*) | RC-1 | Migrate to FormDialog + Zod (`z.array()`), consume `TextField`/`SelectField` | L |
| HR-03 | P1 | permissions-client uses raw `<input type="datetime-local">` with ad-hoc border classes | `permissions-client.tsx:234-239,285-289` | §275 (route through form/* or Input); §285 (raw clone of Input styling) | RC-1 | Replace with `<Input type="datetime-local">` or `form/text-field`; remove hand-rolled border/bg | S |
| HR-04 | P2 | employee-form-dialog FormSection `rounded-lg border bg-muted/20 p-3` inside FormDialog | `employee-form-dialog.tsx:137` (×8 at runtime) | §197/§207 (RC-2) | RC-2 | Replace FieldGroup with `Card`/`CardContent size="sm"` or AppSection | S |
| HR-05 | P2 | Checklist-template per-item row `rounded-md border p-3` repeated N times | `checklist-templates-table.tsx:519` | §197 (RC-2); §285 (wrong radius tier) | RC-2 | Wrap each item in `<Card data-size="sm">`; companion to HR-02 | S |
| HR-06 | P1 | Payroll detail uses default AppPage width while list + HR main use `wide` — visible width jump | `payroll/[periodId]/page.tsx:23,46` (no width) vs `payroll/page.tsx:17` wide; 13-col DataTable compresses at default | §668 (RC-3) | RC-3 | Add `width="wide"`; confirm DataTable contentFlush/scroll props | S |
| HR-07 | P2 | Ad-hoc `mt-*` on mobile card sub-rows across attendance/leave/payroll/checklist (×9) | `attendance-table.tsx:601,609,745`; `leave-requests-table.tsx:246,269,274,277`; `checklist-templates-table.tsx:427`; `payroll-detail-client.tsx:462` | §209 (RC-4) | RC-4 | Group sub-elements under `flex flex-col gap-2`; batch-fix 9 instances | S |
| HR-08 | P2 | checklist-coverage-panel defines a LOCAL `StatusBadge`, shadowing the shared §427 primitive | `checklist-coverage-panel.tsx:49`; shared `@/components/status-badge` never imported | §427 StatusBadge SSoT | enforcement-hole | Add `domain="checklist-coverage"` to the shared registry; import shared, delete local | M |
| HR-09 | P2 | position-defaults-table + consumption-default-items-table use raw `<h3>` with `text-sm font-medium` (wrong heading role) | `position-defaults-table.tsx:124`; `consumption-default-items-table.tsx:143` | §211-218 (sub-section = font-heading text-sm font-semibold); §207 | none | Remove redundant `<h3>`; pass AppSection title/description | S |
| HR-10 | P1 | Payroll detail KpiCard grid `md:grid-cols-7` — 7 columns overflow narrow tablet | `payroll-detail-client.tsx:393` (7 KpiCards from 768px; 7×~140px = 980px min) | §543 mobile baseline; §300 Density (no overflow at any breakpoint) | none | Split into two responsive grids, or `md:grid-cols-3 xl:grid-cols-7` so 7-col only lands wide | S |
| HR-11 | P2 | staff-table InputGroup `h-12` on mobile — exceeds toolbar control height, not via touch variant | `staff-table.tsx:235` `h-12 sm:h-10` | §252-274 (min-h-12 must come from touch variant, not className) | RC-1 | Remove h-12; apply touch target via size="touch" on the input or container padding | S |
| HR-12 | P3 | permissions-client outer `flex flex-col gap-4` wraps AppSection children (gap-on-gap) | `permissions-client.tsx:188` | §209 (RC-4) | RC-4 | Remove the outer wrapper; let AppSection children stack under the page flex | S |

### 3d. Inventory-core (Chrome + Shared Widgets + Dashboard/Reports/Settings)

Inventory feels most "bể" because its analytics surfaces re-implement the design system
by hand instead of consuming adapters, and the settings IA stacks shells. Duplication
reality: most "duplicate" files are thin re-exports; the real parallel primitives are the
`mobile/*` family, `searchable-select`, and `chart-primitives`. KpiCard adoption is the
smoking gun: 7 hits across 184 inventory files vs finance 21 / hr 19. Verifier corrected
INV-01 from P0→P1 (AppPage IS nesting-aware so padding does NOT compound — the real bug
is three stacked H1s + a duplicate route home, not a triple-pad break), INV-06 from
P1→P2 (AppPage default is already `wide`, so the dominant claimed jump doesn't exist;
~6 width outliers remain), and INV-07 from P1→P3 (the status-label ratchet does not
actually fire on `URGENCY_META`; cosmetic drift).

| ID | Sev | Title | Evidence | Spec clause | Recurs | Recommendation | Effort |
| --- | --- | --- | --- | --- | --- | --- | --- |
| INV-01 | P1 | Settings route stacks three AppPageHeaders (3 H1s) + ExpiryListClient reused across two route homes | `settings/layout.tsx:38` "Chính sách kho" + `settings/expiry/page.tsx:56-60` + `expiry-list-client.tsx:352` "Hạn sử dụng"; same client is home for `/inventory/expiry` AND `/inventory/settings/expiry` | §629-635 Route Home (one capability one home); §670-678 (redundant headers). NOTE: padding does NOT compound (AppPage nesting-aware) | RC-3 | Pick one home (standalone `/inventory/expiry`); make settings/expiry a redirect shim (§633), or give ExpiryListClient a content-only embedded mode | M |
| INV-02 | P1 | Dashboard hand-rolls flow cards + KPI tiles instead of Card/AppLinkCard/KpiCard (card-in-card) | `dashboard-client.tsx:520-590` (flow card `rounded-lg border bg-card` p-4 with NESTED `rounded-md border bg-background/80` at `:556`); `:638-661` KPI tiles `text-2xl font-bold tabular-nums` | §437-444 KpiCard; §476-487 import-governance; §197-207 (RC-2) | RC-2 | Replace 4 KPI tiles with KpiCard in KpiRow; replace 3 flow cards with AppLinkCard (already used in this file); drop nested status panel | L |
| INV-03 | P1 | Reports page is a mosaic of bg-card/bordered panel clones inside AppSection | `reports-client.tsx:138-182,207-239,280-291`; module-wide 13 `rounded-lg border bg-card` + 7 bg-less `rounded-md border p-3/4` (bg-less escape inline-chrome gate, regex `check-ui-contract.mjs:868`) | §197/§207; §476-487 (RC-2) + Hole (a) | RC-2 | Render catalog tiles through Card/AppLinkCard; render AP-aging/variance rows as Item/ItemGroup or Card size=sm | M |
| INV-04 | P1 | Inventory charts use semantic tokens, 0× chart-1..5 ramp; arbitrary inline radius + decorative hover motion | `chart-primitives.tsx:42` (`duration-300 hover:-translate-y-0.5 hover:brightness-110`), `:47-52` inline `borderRadius "0.5rem"`; colors via `_lib/ui.ts:12-19`; `reports-client.tsx:86-104` legend dots bg-primary/success/destructive/info. chart-1..5 `globals.css:92-96` used 0× | §285-296 Radius (no arbitrary 0.5rem); §304-331 Motion (decorative hover forbidden on ERP); chart-1..5 ramp | none | Map series to `var(--chart-1..5)`; replace inline radius with rounded-md; remove hover brightness/translate | M |
| INV-05 | P1 | RC-1: bare-Input idiom (qc-settings) vs form/* idiom (thresholds), AND form/* fields hand-patched off h-10 | `qc-settings-client.tsx:71-106` (bare Label + FormattedNumberInput → h-7); `thresholds-client.tsx:260,275,290,416,427,438` (QuantityInput forced `h-8`) and `:496,503,510` (QuantityField form/* h-10 forced `h-8` via twMerge → h-8) | §275-283 Height Scale (do not hand-patch field height) | RC-1 | Route qc-settings through `form/NumberField`; drop the `h-8` overrides in thresholds; add a size variant to the form-field cva once if dense height is needed | M |
| INV-06 | P2 | AppPage width inconsistent across the module (~6 outliers from the `wide` default) | `settings/layout.tsx:37` + `supplier-invoices:689` = full; `count-slips:85`, `waste/approvals:61`, `waste/new:35`, `transfers/new:53` = default; rest = wide (AppPage default `surface.tsx:107`). Settings sub-nav and content render at SAME width (nesting collapses max-w) | §668-677 | RC-3 | Standardize one width per surface class; settings should match siblings, not full | M |
| INV-07 | P3 | Expiry urgency uses a page-local STATUS map with token-based className colors instead of StatusBadge | `expiry-list-client.tsx:72-85` URGENCY_META, reused `:96,105,280`. NOTE: `status-label-ssot` regex (`check-ui-contract.mjs:253`) does NOT match `URGENCY_META` — tool is silent | §427-435 Status vocab lock | none | Register an inventory/urgency domain in the shared status badge and route through it; cosmetic-consistency only | S |
| INV-08 | P1 | mobile/* family duplicates canonical header/page; MobileSectionHeader hand-rolls forbidden `<h1>` | `mobile-section-header.tsx:43` `<h1 font-heading text-xl font-semibold leading-tight tracking-tight>` (drops sm:text-2xl, adds leading-tight); consumers grn/new:133, grn-create:316, drafts:77, transfer-receive:165 | §236 Page H1 MUST come from AppPageHeader. NOTE: mobile-top-bar is spec-sanctioned (§606-609), keep it | none | Migrate 4 consumers to AppPageHeader; delete mobile-section-header/mobile-page; keep mobile-top-bar | L |
| INV-09 | P2 | Expiry urgency filters fake pill chips by overriding Button to `h-auto rounded-full` | `expiry-list-client.tsx:395,416,435` (`h-auto gap-1.5 rounded-full px-3 py-1` on Button size=xs); `:120,315` redundant `h-7`; `settings-section-nav.tsx:38` hand-rolled `rounded-full border px-4 py-2` | §271 Button height locked; §285-296 radius (control = rounded-md) | RC-1 | Use Toggle/ToggleGroup for urgency filters; drop h-auto/rounded-full; route settings nav through Tabs | M |
| INV-10 | P2 | searchable-select is a parallel combobox (Button h-8 field) vs form/combobox (h-10) | `searchable-select.tsx:59-76` (Popover+Command on default Button); `inventory-branch-filter.tsx:63` SelectTrigger forced `h-9` | §281-283 field-trigger h-10; §364-372 single adapter (RC-1) | RC-1 | Prefer form/combobox in-form; keep searchable-select for non-form chrome, document its height; align branch-filter to chrome control height | M |
| INV-11 | P2 | Inventory hero/icon glyphs free-style size-12 instead of EmptyMedia/primitive | `dashboard-client.tsx:671` (`size-12 rounded-full bg-success/15`); `reports-client.tsx:282` (`size-12 rounded-md`), `:212` (`size-10`) | §250 (Inventory hero glyphs MUST compose EmptyMedia); §238-248 | none | Render all-clear hero through AppEmptyState/EmptyMedia; standardize report-tile icon-boxes to one size token | S |
| INV-12 | P2 | `font-bold` used as body/label emphasis across dashboard/reports/stepper (40 hits) | `reports-client.tsx:159,216,227,289`; `timeline-stepper.tsx:22,39`; `dashboard-client.tsx:547` | §234 (font-bold only for receipt totals / print headers / body emphasis) | none | Use font-semibold for titles/values, font-medium for labels | S |
| INV-13 | P2 | QC settings double-centers content + hand-rolls footer/border inside AppPage | `qc-settings-client.tsx:59-61` (`mx-auto max-w-3xl` inside default AppPage), `:108` `rounded-md border p-3` panel, `:123` ad-hoc `<footer border-t pt-4>` | §668-677 (no inner re-center); §197/207 (RC-2); §209 (RC-4) | RC-2 | Remove inner mx-auto; render toggle row through Item/Field; route save bar through shared section/footer | S |
| INV-14 | P3 | mobile-top-bar overrides Button icon size off its locked variant | `mobile-top-bar.tsx:41` (`size="icon-lg"` then `size-10 rounded-md`; icon-lg = size-9) | §264-273 (no className size override) | none | Pick the variant that yields the intended size; drop size-10 override | S |
| INV-15 | P2 | Dashboard flow-card metric + KPI values miss font-mono on numeric cells | `dashboard-client.tsx:649-657` (KPI `font-bold tabular-nums` no font-mono); `reports-client.tsx:227,231` | §446-456 numeric cells require font-mono | none | Adopt KpiCard (covers INV-02); add font-mono to remaining inline numeric values | S |

### 3e. Inventory-docs-A (procurement / document surfaces — 14 files)

All four Admin root causes recur. RC-1 is most pervasive (bare controls alongside form/*
in 5 files); RC-2 card-in-card in 7 files (~22 instances); RC-3 surfaces as new-PO inner
`max-w-4xl` wrapper + supplier-invoices `width=full`.

| ID | Sev | Title | Evidence | Spec clause | Recurs | Recommendation | Effort |
| --- | --- | --- | --- | --- | --- | --- | --- |
| INV-P-01 | P1 | RC-1: bare Input/Label/Select (h-7) mixed with form/* (h-10) in 5 form files | `add-grn-line-dialog.tsx:202,229,240`; `grn-line-row.tsx:224,331`; `po-detail-client.tsx:309,313,332,350` (Input h-8); `new-po-client.tsx:554,577` (SelectTrigger h-7); `supplier-invoices-client.tsx:730,749` | §252-283 Height Scale | RC-1 | Route bare Input+Label through form/text-field/number-field/select-field | M |
| INV-P-02 | P1 | RC-2: hand-rolled `rounded-lg/md border bg-card` panels inside AppSection in 7 files (~22 instances) | `po-detail-client.tsx:511,517,525,607,890`; `supplier-invoices-client.tsx:849,857,868,876,889,899,911,925`; `supplier-return-detail-client.tsx:138,142,148,179`; `grn-line-row.tsx:76,144`; `grn-create-client.tsx:594,607,630,643` | §197/§207 (RC-2) | RC-2 | Replace KPI divs with KpiCard+KpiRow; replace summary sub-panels with AppSection/DescriptionList. bg-less variants escape the inline-chrome gate | M |
| INV-P-03 | P1 | RC-3: new-PO applies inner `mx-auto max-w-4xl` inside default AppPage — content-width jump | `new-po-client.tsx:333` inside AppPage (no width); PO list + detail `po-detail-client.tsx:443` use no width | §668 (RC-3) | RC-3 | Remove the inner wrapper; pass `width` to AppPage so list/new/detail agree | S |
| INV-P-04 | P1 | RC-3: supplier-invoices `width=full` vs PO detail default — related flows different widths | `supplier-invoices-client.tsx:689` full; `po-detail-client.tsx:443` default | §668 (RC-3) | RC-3 | Document the intentional width=full for supplier-invoices; align PO/GRN detail or record the decision | S |
| INV-P-05 | P2 | RC-4: `space-y-1.5` form stacks + mt-* inside AppSection across 4 files | `new-po-client.tsx:443,459`; `supplier-invoices-client.tsx:309,564,569,588`; `po-detail-client.tsx:313,976`; `grn-detail-client.tsx:180` | §209 (RC-4) | RC-4 | Replace space-y-1.5 with form/* field spacing; replace mt-* with gap-* on the parent stack | M |
| INV-P-06 | P2 | Local status-badge wraps a local variant map (_lib/ui.ts) instead of shared StatusBadge | `status-badge.tsx:6-8` imports from `../_lib/ui`; `_lib/ui.ts:29` private `STATUS_BADGE_VARIANTS` (~15 call sites) | §427-435 (spec-excepted later wave, but exception not shrinking) | none | Migrate into shared labels + status-badge; add a lint counting STATUS_BADGE_VARIANTS entries | L |
| INV-P-07 | P2 | GRN create uses deletion-slated MobileSectionHeader/MobilePage instead of AppPageHeader | `grn-create-client.tsx:32-33,315-316`; `mobile-section-header.tsx:43` hand-rolled h1 | §236 Page H1 from AppPageHeader | none | Migrate to AppPageHeader (useIsMobile already imported); remove mobile imports | S |
| INV-P-08 | P2 | timeline-stepper uses `rounded-full` on a sized square icon-box (size-10) | `timeline-stepper.tsx:22` (`size-10 ... rounded-full`) | §285-298 Radius (size-10 square = rounded-md; gate calls out rounded-full on size-8..16) | none | Change rounded-full → rounded-md | S |
| INV-P-09 | P2 | Local `formatQty` in _lib/format.ts uses raw `toLocaleString("vi-VN")` | `_lib/format.ts:14-20` (used by grn-list, supplier-returns) | §456-458 (quantity values via shared formatters) | none | Add formatQty to `@comtammatu/shared/format`; delete local | S |
| INV-P-10 | P2 | GRN create InputGroup `h-12 rounded-lg` — forbidden height + wrong radius tier | `grn-create-client.tsx:401` | §271 (no h-12 on inputs); §289-296 (control = rounded-md) | RC-1 | Remove h-12; change rounded-lg → rounded-md | S |
| INV-P-11 | P1 | supplier-return detail client renders without AppPage/AppPageHeader — missing page chrome | `supplier-return-detail-client.tsx:19,77` (only AppSection imported) | §236 Page H1 from AppPageHeader; §543 | RC-2 | Add AppPage + AppPageHeader; move heading/breadcrumb/status into header slots | S |
| INV-P-12 | P2 | PO detail 3 hand-rolled KPI summary cards should be KpiCard+KpiRow (stat-card-ssot escape) | `po-detail-client.tsx:510-531` (`rounded-lg border bg-card p-4` × 3, Badge label + text-xl/2xl value, no name → escapes ratchet) | §437-444 KpiCard; §197 (RC-2) | RC-2 | Replace with KpiRow + 3 KpiCard; add tabular-nums | S |
| INV-P-13 | P3 | new-po suggestion/line money cells use `font-mono` without `tabular-nums` | `new-po-client.tsx:732,735,738,1059,1065,1075,1102` | §446-456 (money/quantity = text-right font-mono tabular-nums) | none | Add tabular-nums to all font-mono numeric cells | S |
| INV-P-14 | P2 | Enforcement hole confirmed: bg-less bordered card-clones escape inline-chrome gate across all procurement files (~15 instances) | `supplier-invoices-client.tsx:849,857,868,876`; `supplier-return-detail-client.tsx:138,142,148`; `grn-line-row.tsx:76`; `po-detail-client.tsx:607`; `amend-owner-dialog.tsx:124` | Hole (a) + §197 (RC-2) | enforcement-hole | Extend check-ui-contract.mjs to flag `rounded-md/lg border p-3/4` even without a bg token; expand raw-padding gate from p-5+ | M |

### 3f. Inventory-docs-B (stock-ops & counting surfaces)

High density of RC-1/RC-2 — every Admin root cause is present and systemic. RC-1 ~23
locations across 10+ files; RC-2 ~45 hits across 15+ files. Two width-ownership
violations add a centered sub-container on top of the shell's centering. Number-pad,
chart-primitives, and mobile-top-bar all override primitive heights.

| ID | Sev | Title | Evidence | Spec clause | Recurs | Recommendation | Effort |
| --- | --- | --- | --- | --- | --- | --- | --- |
| INV-S-01 | P1 | RC-1: bare Input/Select (h-7) mixed with form/* (h-10) across 10+ form surfaces (~23 hits) | `po-detail-client.tsx:309,722,953`; `stocktake-detail-client.tsx:438,496`; `grn-line-row.tsx:224,331`; `production-order-form.tsx:152,325`; `recipe-line-dialog.tsx`; `create-transfer-dialog.tsx`; `waste-create-client.tsx` | §275-283 Height Scale | RC-1 | Route text/number inputs through form/text-field/number-field; use DataTable adapter render for inline rows | L |
| INV-S-02 | P1 | RC-2: ~45 hand-rolled `rounded-lg/md border bg-card` panels bypass AppSection/KpiCard across 15+ files | `po-detail-client.tsx:511,517,525,607,890`; `transfer-detail-client.tsx:396,406,453,547`; `grn-line-row.tsx:144`; `production-stats.tsx:153`; `inventory-value-panel.tsx:222`; `reports-client.tsx:280`; `waste-approvals-client.tsx:132`; `count-slips-client.tsx:215`; `issue-detail-client.tsx:508` | §207; §361; (RC-2) + Hole (a) | RC-2 | Replace panels with Card size="sm"; replace stat panels with KpiCard; convert grn-line-row mobile card to DataTable mobileCardRender | L |
| INV-S-03 | P1 | RC-3: new-po-client + qc-settings add own max-w-* centered container inside AppPage | `new-po-client.tsx:333` (`mx-auto max-w-4xl`); `qc-settings-client.tsx:61` (`mx-auto max-w-3xl`) | §668-685 Page Padding Authority (AppPage owns centering) | RC-3 | Remove inner wrappers; pass `width` to AppPage so centering is single-sourced | S |
| INV-S-04 | P2 | RC-4: ad-hoc mt-* double-meter AppSection rhythm in 20+ locations | `po-detail-client.tsx:515,527,785,913,976`; `supplier-invoices-client.tsx:309,564,569`; `transfer-detail-client.tsx:398`; `new-po-client.tsx:543,885` | §209 (RC-4) | RC-4 | Replace mt-*/mb-* with flex gap-N containers; freeze new space-y-* | M |
| INV-S-05 | P1 | MobileSectionHeader (deletion-slated) still active in 4 files — touch pages bypass AppPageHeader | `grn/new/page.tsx:133`; `grn-create-client.tsx:316`; `transfer-receive-client.tsx:165`; `drafts/page-client.tsx:77` | §597-625 Shell Registry; §211 Page H1 from AppPageHeader | none | Replace MobileSectionHeader with AppPageHeader; delete mobile/mobile-section-header.tsx once migrated | M |
| INV-S-06 | P1 | Number-pad numpad keys are raw `<button>` at h-16, not Button size="touch" | `number-pad-sheet.tsx:117-124` (12 raw buttons, fixed h-16) | §252-275 (fixed h-16 must not be on `<button>` outside Button; touch via size variant) | none | Replace each key with `<Button size="touch">`; del key ghost; keep 3×4 grid | S |
| INV-S-07 | P2 | chart-primitives uses per-module color map (not chart-1..5) + forbidden kinetic hover | `_lib/ui.ts:12-19` (INVENTORY_COLOR_VALUE → var(--primary)...); `chart-primitives.tsx:42` (`hover:-translate-y-0.5 hover:brightness-110`, `duration-300`) | §89 Data tokens chart-1..5; §325-333 Motion (no kinetic/decorative on ERP) | none | Use var(--chart-1..5); remove hover translate/brightness; no transition on resting bars | S |
| INV-S-08 | P2 | local status-badge builds its own variant map (_lib/ui.ts:29-72), duplicating shared registry | `status-badge.tsx:8` (getInventoryStatusBadgeVariant); `_lib/ui.ts:29-72` (20+ keys) | §427-435 (spec-noted intentional exception, later wave) | none | Register inventory statuses in shared getStatusBadgeMeta; delete local map (low urgency per spec) | M |
| INV-S-09 | P2 | production-stats hand-rolls a local stat-card grid (`rounded-md border min-h-24 p-3`) | `production-stats.tsx:153-165` (5-col grid, text-2xl tabular-nums, no KpiCard) | §437-444 (stat-card-ssot); §RC-2 | RC-2 | Replace with KpiRow + KpiCard; add a cols variant if 5-col needed | S |
| INV-S-10 | P2 | inventory-value-panel uses `tracking-widest` (forbidden) + `tracking-tight` on a non-heading value | `inventory-value-panel.tsx:223,227` | §236 (tracking-tight only on font-heading; tracking-widest not in allowed set) | none | tracking-widest → tracking-wider; remove tracking-tight from the value `<p>` | S |
| INV-S-11 | P2 | MobileTopBar icon-lg Button overridden to size-10 via className | `mobile-top-bar.tsx:40-41` (size="icon-lg" then `size-10`) | §252-275 (no className size override; icon-lg = size-9) | RC-1 | Remove size-10; add an icon-xl Button size if 40px is intended | S |
| INV-S-12 | P2 | po-detail stat cells + dashboard flow-cards are KpiCard clones; dashboard span uses font-heading AND font-mono | `po-detail-client.tsx:511-530`; `dashboard-client.tsx:520-560` (`:547` font-heading + font-mono on one span) | §437-444 (stat-card-ssot); §361; one font-family utility per element | RC-2 | Replace with KpiRow+KpiCard; remove font-heading from metric span (keep font-mono tabular-nums) | M |
| INV-S-13 | P2 | Sticky CTA footers on grn-create + transfer-receive missing shadow-lg | `grn-create-client.tsx:466`; `transfer-receive-client.tsx:352` (`sticky chrome-safe-bottom z-10`, no shadow) | §335-359 Elevation (Sticky CTA = shadow-lg) | none | Add shadow-lg to both sticky wrappers (and number-pad-sheet sticky bottom) | S |
| INV-S-14 | P2 | stocktake-detail bare Input forced to `h-8` in a DataTable column (RC-1 sub-case) | `stocktake-detail-client.tsx:438,496` (`h-8` override on bare Input next to FormattedNumberInput) | §275 (do not hand-patch; bare Input = h-7) | RC-1 | Use form/text-field (h-10) for inline-edit, or keep bare Input at h-7 without override | S |
| INV-S-15 | P2 | grn-line-row mobile card is a hand-rolled `rounded-lg border bg-card p-4` div, not DataTable mobileCardRender | `grn-line-row.tsx:144` (twin JSX tree, bare Input + FormattedNumberInput) | §394-411 (inline-edit sheets use DataTable adapter; responsive-double-render ratchet) | RC-2 | Migrate to DataTable adapter (render `<tr>`, mobileCardRender `<Item>`); remove standalone card | M |
| INV-S-16 | P3 | Local interactive-card barrel re-exports create dead-weight indirection (2 duplicate barrels) | `_components/interactive-card.tsx` + `_components/mobile/interactive-card.tsx` (both re-export the same shared component) | §469-474 (forbidden compatibility shims) | none | Delete both barrels; import InteractiveCard directly from the shared path | S |

### 3g. Alongside Office Modules (menu, orders, branches, branch-settings, notifications)

Materially better shape than Admin. Four classes of Admin RC recur. Most systemic: RC-1
in item-detail-dialog + PrinterForm + orders filter bar; RC-2 in order-detail-sheet (5
clones); RC-4 double-toolbar in orders/refunds. One genuine desktop layout issue (F-09:
order sheet has no max-width pin) is the closest thing to a layout break in this lane.

| ID | Sev | Title | Evidence | Spec clause | Recurs | Recommendation | Effort |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F-01 | P1 | RC-1: bare Input+Label (h-7) mixed with FormattedNumberInput inside item-detail-dialog | `item-detail-dialog.tsx:303,369,313,379,302,311` (flex items-end rows) | §252 Height Scale | RC-1 | Route the variant/modifier inline-edit row through form/* (TextField + NumberField) | M |
| F-02 | P1 | RC-1 + RC-4: PrinterForm uses bare Label+Input+Select with `space-y-2` stacks (×8), no form/* | `printers-client.tsx:391-498,449-453,399-409` | §275 (form/* wrapper); §209 (gap not space-y) | RC-1 | Extract PrinterForm to FormDialog/RHF + form/* (TextField/SelectField); replace space-y-2 with flex gap-2 | M |
| F-03 | P1 | RC-1: bare Input+Label in orders-client filter bar (h-7 dates beside SelectTrigger) | `orders-client.tsx:206-213,218-228,231-248` | §275-276 Height Scale | RC-1 | Use form/business-date-field + form/select-field for filter controls | S |
| F-04 | P1 | RC-2: 5 hand-rolled `rounded-md border p-3` card-clones inside order-detail-sheet (wrong radius tier) | `order-detail-sheet.tsx:197,216,276,395,447` (inside SheetContent) | §362 (framed item → Card); §207; §289 (card tier = rounded-lg) | RC-2 | Replace payment/totals/audit panels with Card/CardContent size="sm"; item lines with Item variant=outline | M |
| F-05 | P2 | RC-4: double AppToolbar gap-on-gap in orders-client | `orders-client.tsx:204,295` (two sequential AppToolbar inside `flex flex-col gap-4`, each adds p-3) | §209 (RC-4); §302 | RC-4 | Collapse the count/badge row into the first AppToolbar's actions/summary slot | S |
| F-06 | P2 | RC-4: refunds-client repeats double-toolbar + raw `div.grid` KPI row instead of KpiRow | `refunds-client.tsx:215,233`; `orders-client.tsx:185` | §367-369 (KpiRow); §209 (RC-4) | RC-4 | Replace raw grid with KpiRow; collapse double toolbar | S |
| F-07 | P2 | branch-table search InputGroup `h-12 sm:h-10` hardcoded (touch height via className) | `branch-table.tsx:211` | §252-276 (h-12 not via touch variant; breakpoint height jump) | RC-1 | Remove h-12/h-10 override; use size="touch" on the input if a larger target is needed | S |
| F-08 | P2 | item-detail-dialog: raw Dialog import + bare Label/Input outside form/* (import governance) | `item-detail-dialog.tsx:15,7-8`; `import-export-menu.tsx:19` | §476-492 (Dialog → FormDialog/Sheet for new app code) | enforcement-hole | Convert item-detail-dialog to FormDialog per tab; reduce the raw-dialog baseline | L |
| F-09 | P1 | order-detail-sheet SheetContent missing `sm:max-w-*` — sheet expands full-width on desktop | `order-detail-sheet.tsx:167` (`w-full overflow-y-auto`, no max-width) | §543 (use primitives before custom layout) | none | Add `sm:max-w-xl` (or lg) so the detail panel is a contextual panel, not a full-screen overlay | S |
| F-10 | P2 | printers PrinterForm `space-y-2` for field stacking inside AppSection (×8) | `printers-client.tsx:391,422,448,456,470,488,500,520` | §209 (gap not space-y) | RC-4 | Replace all 8 `div.space-y-2` with `flex flex-col gap-2` | S |
| F-11 | P2 | tables-client raw Tabs inside AppPage without AppSection wrapping each TabsContent | `tables-client.tsx:7-12,90-129` | §381 (segmented → Tabs); §476 (adapter first) | none | Wrap each TabsContent's content in AppSection contentFlush to restore the section boundary | S |
| F-12 | P2 | ingredient-stock-block-card hand-rolled `rounded-md border p-3` toggle row inside AppSection | `ingredient-stock-block-card.tsx:38` | §207 (RC-2); §289 (radius tier) | RC-2 | Replace with Item variant="outline" (ItemContent + ItemActions Switch) | S |
| F-13 | P2 | station-form-dialog category checklist uses `rounded-md border p-3` scroll container inside FormDialog | `station-form-dialog.tsx:145` | §207 (RC-2); §289 | RC-2 | Remove the outer border/p-3; rely on FormDialog padding; keep max-h-48 overflow-y-auto | S |
| F-14 | P3 | notifications-client raw `div.flex.flex-col.gap-3` client root vs AppPage-owned composition | `notifications-client.tsx:23` | §668 (no ad-hoc root gap container) | RC-4 | Remove the wrapping div; render children directly under AppPage gap | S |
| F-15 | P3 | menu item/category tables use `space-y-1` inside DataTable cell responsive sub-rows | `item-table.tsx:166`; `category-table.tsx:116,118` | §209 (gap not space-y) | RC-4 | Replace with flex flex-col gap-1 inside cell render | S |
| F-16 | P2 | Enforcement hole: RC-2 bg-less card-clones escape inline-chrome gate; RC-1 bare-Input escapes field-height gate | F-04, F-12, F-13 (bg-less `rounded-md border p-3`); F-01, F-03 (bare Input, no gate) | §552 enforcement holes (a) + (b) | enforcement-hole | Add a `raw-bordered-panel` ratchet (rounded-md/lg border p-[234] without bg/Card) and a `bare-input-in-form-context` rule | L |

---

## 4. Enforcement Gaps (union with Admin's)

The same three holes that let Admin ship green let this drift go family-wide. The lint
rules to add are a **union** with the Admin report's recommendations — implement once,
applied to every office module:

1. **Bordered-panel-without-bg ratchet (closes Hole a + c).** The current inline-chrome
   gate regex (`scripts/check-ui-contract.mjs:868`) matches only `bg-card`/`background`.
   Add a `raw-bordered-panel` ratchet that flags `rounded-md`/`rounded-lg` + `border` +
   `p-[2-4]` on a non-Card/Item JSX element **even when no bg token is present**, and
   expand the raw-padding gate from `p-5+` to also catch `p-3`/`p-4` card-clones and
   `contentClassName` padding overrides (SHELL-03's `px-4 py-4 sm:px-5` ships green today).
   Single highest-leverage rule: it would catch INV-03, INV-P-02/14, INV-S-02, HR-04/05,
   FIN-02, F-04/12/13 in one pass.

2. **Bare-Input-vs-form/* gate (closes Hole b).** No gate exists for the field-idiom
   split. Add a `bare-input-in-form-context` rule: flag a file that imports the bare
   `Input`/`Select`/`Label` primitive **and** also imports `FormDialog` or any `form/*`
   wrapper (data-entry context), while permitting bare Input in pure filter/search bars.
   Also flag any `className` height patch on a bare Input/SelectTrigger (`h-8`/`h-9`/`h-10`)
   and on `form/*` fields (the twin twMerge override in INV-05). Catches FIN-01/08/10,
   HR-01/02/03/11, INV-05, INV-P-01/10, INV-S-01/11/14, F-01/02/03/07.

3. **STATUS-map + KpiCard-clone ratchet (closes the silent-drift holes).** The
   `status-label-ssot` regex matches only identifiers containing `STATUS`, so
   `URGENCY_META` (INV-07) and other non-`STATUS`-named maps slip through; broaden the
   identifier match to any local label+variant record. The `stat-card-ssot` ratchet
   matches names like `StatCard`/`MetricCard`, so the unnamed `rounded-lg border bg-card`
   KPI grids (INV-02, INV-P-12, INV-S-09/12) escape; add a structural detector for a
   `text-2xl`/`text-xl` + `tabular-nums` value inside a hand-rolled bordered grid cell.

4. **Page-width-consistency check (defends RC-3).** Add a per-module advisory that lists
   every `AppPage width` used under one shell and warns when a module mixes more than one
   non-default width (Inventory: 4; Finance: 2). Not a hard gate, but it surfaces the #1
   "lệch / bể layout" source before review.

5. **Header-landmark / nested-`<header>` check (defends SHELL-02).** Flag any
   `<header>` rendered inside the AppShell `mobileTopBar` slot, and any re-implementation
   of the brand+signout lockup outside `app-shell.tsx`.

---

## 5. Fix Order

Sequenced by blast radius — shared shells + tokens + primitive consolidation first,
then per-module `form/*` migration, then lint. This composes with the Admin report's
Phase plan (see `audit-2026-06-28-fullstack.md`): the Admin pass's Phase 1 (shell/token)
and this report's Phase A are the **same** shared-infrastructure phase — do them together.

**Phase A — Shared shells, tokens, primitives (highest blast radius; do with Admin Phase 1).**
- A1. Fix the Inventory width policy (SHELL-01, INV-06, INV-P-03/04, INV-S-03): pick one
  inventory body width, route every page through InventoryPageContent, remove inner
  `mx-auto max-w-*` wrappers. **Auto-resolves** the RC-3 width-jump for the whole module.
- A2. Fix the Inventory mobile/settings chrome (SHELL-02, SHELL-03, INV-01): stop
  injecting a 2nd `<header>`, give settings/layout a non-pill route nav at rounded-md,
  make ExpiryListClient content-only / redirect-shim the duplicate home.
- A3. Delete the mobile/* family (SHELL-05, INV-08, INV-P-07, INV-S-05): migrate the 4
  consumers to AppPageHeader. **Auto-resolves** the hand-rolled-`<h1>` findings in 4 files.
- A4. Route FinanceShell/InventoryShell through ManagementShell (SHELL-07); default
  InventoryPageContent `scroll=false` (SHELL-06); uniform header description band (SHELL-08).
- A5. Fix chart tokens once (INV-04, INV-S-07, FIN-07): map series to chart-1..5, remove
  kinetic hover, fix inline radius.
- A6. Consolidate stat tiles into KpiCard (INV-02, INV-P-12, INV-S-09/12, FIN-02/06/09,
  HR-10). Adopting KpiCard **auto-resolves** the missing-`font-mono` numeric findings
  (FIN-05, INV-15) on those surfaces.

**Phase B — Per-module form/* migration (after primitives are in place).**
- B1. Finance: FilterBar + invoice dialogs (FIN-01/08).
- B2. HR: payroll standard-days, checklist-template builder, permissions datetime (HR-01/02/03).
- B3. Inventory: qc-settings + thresholds height (INV-05), procurement forms (INV-P-01,
  INV-S-01/14), number-pad keys (INV-S-06).
- B4. Alongside: item-detail-dialog, PrinterForm, orders filter bar (F-01/02/03), order
  sheet width pin (F-09).
- B5. RC-2 card-clone replacement and RC-4 margin cleanup per module (the long tail);
  most of these **auto-resolve** once the bordered-panel ratchet (Phase C) blocks new ones
  and the KpiCard adoption (A6) covers the stat tiles.

**Phase C — Lint (lock the gains so the family cannot re-drift).**
- C1. Bordered-panel-without-bg + p-4 ratchet (Gap 1).
- C2. Bare-Input-vs-form/* + height-patch gate (Gap 2).
- C3. STATUS-map + KpiCard-clone ratchet (Gap 3).
- C4. Page-width-consistency advisory + nested-header check (Gaps 4–5).

Do C **after** A and B land the burn-down, so the baselines start near zero. Phases A and
C are shared with Admin — running them once fixes both programs; B is the per-module work
unique to each report.
