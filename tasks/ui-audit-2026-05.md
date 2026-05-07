# UI Audit 2026-05 — Wave 0 Baseline

> Sinh tự động trong Wave 0 của UI/UX rebuild. Là baseline để đo grep telemetry sau mỗi wave.

## Adapter coverage telemetry (baseline)

| Adapter | File path | Caller count (grep) |
|---|---|---|
| AppPage | apps/web/app/components/surface.tsx | 4 |
| AppPageHeader | same | 5 |
| AppSection | same | 7 |
| AppToolbar | same | 9 |
| AppEmptyState | same | 18 |
| AppLinkCard | same | 3 |
| AppPageTabs | apps/web/app/components/app-page-tabs.tsx | 0 (just created) |
| AppShell | apps/web/app/components/app-shell.tsx | 6 |
| FormDialog | apps/web/app/components/form/form-dialog.tsx | 29 |
| MoneyVndField/QuantityField | apps/web/app/components/form/domain-number-inputs.tsx | 4 |

## Anti-pattern hit list (baseline)

| Pattern | Command | Count |
|---|---|---|
| Raw `<h1 className="font-heading text-2xl"` | `grep -rln 'font-heading text-2xl\|font-heading text-3xl' apps/web/app/**/*.tsx` | 23 |
| Raw `Loader2` | `grep -rln 'Loader2' apps/web/app/**/*.tsx` | 0 |
| `animate-spin` outside Spinner | `grep -rln 'animate-spin' apps/web/app/**/*.tsx` | 1 |
| `type="number"` outside form helpers | `grep -rln 'type="number"' apps/web/app/**/*.tsx` | 11 |
| Arbitrary dim `w-[`, `h-[`, `text-[` | `grep -rnE 'w-\[\|h-\[\|text-\[' apps/web/app/**/*.tsx` | 3 |
| Raw palette `text-amber\|emerald\|zinc\|rose\|sky\|slate-` | `grep -rnE '(text\|bg\|border)-(amber\|emerald\|zinc\|rose\|sky\|slate)-[0-9]' apps/web/app/**/*.tsx` | 0 |
| `redirect\(.*\?error=` (URL flash for non-auth) | `grep -rn 'redirect.*\?error=' apps/web/app/**/*.tsx` | 4 |
| Hand-rolled Empty `<Empty className="border bg-card` | `grep -rln 'Empty className="border bg-card' apps/web/app/**/*.tsx` | 6 |
| `PageHero` callers (legacy) | `grep -rln 'PageHero\|page-hero' apps/web/app/**/*.tsx` | 16 |

## Frozen surfaces

Status updated 2026-05-07 sau khi rebuild xong + post-rebuild verification per surface.

### Still FROZEN (do NOT touch)
2. ~~`apps/web/app/finance/audit-trail/page.tsx`~~ → **chrome migrated 2026-05-07 (commit a7e9ef2)**. Page.tsx now uses AppPage + AppPageHeader. Hard guard verified: zero `.select(`/`audit_logs`/`fetchAuditLogs` diff lines. `audit-trail-client.tsx` data fetch + `finance/actions.ts:fetchAuditLogs` helper untouched (rule AUDIT-LOG-SELECT-EXPLICIT-COLUMNS still hardened). **Continue freezing the data layer** — UI chrome at this surface is now compliant.
3. **`apps/web/app/finance/invoice-list.tsx` cancel flow** — HĐĐT NĐ70/2025 compliance. Rules HDDT-CANCEL-REASON-MIN-20 + HDDT-FORM-PAYLOAD-FREEZE-AT-CLICK. **Chrome verified compliant 2026-05-07 step 3** (no PageHero, no raw `font-heading text-2xl`, no `Loader2`, uses `Empty`/`Table`/`AlertDialog` primitives + `Badge` semantic variants + `formatVND` shared helper, char counter `{trimmedReason.length}/{CANCEL_REASON_MAX}` at line 286 intact, `disabled={isPending || !reasonValid}` button gate at line 293 intact, `cancelTaxInvoice` action call at line 35,93 intact, NĐ70/2025 user-facing notice at line 269 intact). **Freeze remains on cancel flow contract**: do NOT change `CANCEL_REASON_MIN`, the Zod schema in `actions.ts`, the char counter UI, the AlertDialog wrap, the action call signature, or the legal-notice copy. Unblock for non-chrome edits: M6 P0 (reconcile cron, replace flow, 3-way matching) + compliance review.
4. **`apps/web/app/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx`** — densest concentration of contract rules in repo. **Chrome verified compliant 2026-05-07 step 5** (0 PageHero, 0 raw `font-heading text-2xl`, 0 `Loader2/animate-spin`; 1293 LOC large file but no rebuild-style chrome migration needed). **7 rules verified intact via grep markers**: HDDT-FORM-PAYLOAD-FREEZE-AT-CLICK (`buildInvoicePayload(invoiceForm)` line 816 inside synchronous handleConfirmPaid body), POS-CONFIRM-CASH-GATED-BY-POS-CONFIRM-PAYMENT (`canConfirmCash` prop line 92 + threaded 401/409/481/528/544/940/952), PWA-OFFLINE-GATE-CASH-ONLY (`useIsOnline()` line 426; `canConfirmPaid = isOnline && ...` line 446; `handleSelectMethod` offline early-return line 678), POS-HDDT-CONDITIONAL-ON-MST (`not_required` toast branch lines 839-840), POS-DETAIL-REOPEN-AFTER-CUSTOMIZER (integration via pos-desktop-shell + sheet honors flow), POS-MOBILE-BUTTON-TOUCH-TARGET (primary CTA `h-20` 80px line 208/212), NO-CLAMP-ON-RECEIPT-LEGAL-FIELDS (`globals.css @media print` line 408 neutralizes line-clamp). **Freeze remains** on the rule cluster: do NOT remove `canConfirmCash`/`isOnline`/`canConfirmPaid` threading; do NOT move `buildInvoicePayload` inside async transition; do NOT add `not_required` to the `transition_tax_invoice_state` matrix. **M4 P0-3** (stock_consumed_status check on webhook hot-path) and **M4 P0-4** (server-recompute total_amount in confirm_cash_payment) are SERVER-SIDE pending — they need RPC body rewrite + migration apply, NOT chrome work. The bill-receipt-sheet UI's interface to those RPCs (cash branch via confirmCashPayment, e-wallet via createPayment + webhook) does not require chrome migration when those server slices land.
5. **`apps/web/app/br/[branchId]/kds/order-card.tsx` + `_hooks/use-kds-realtime.ts`** — Realtime correctness + peak-hour perf. Rules KDS-ORDERCARD-MEMO-PROPS, KDS-TRANSFER-TABLE-SYNC, REALTIME-CHANNEL-RESUBSCRIBE-ON-TOKEN-REFRESH, POS-RESUME-MUST-REFETCH. No P0 pending but no integration test infra — refactor without safety net = peak-hour reconcile sup, chef bưng nhầm bàn, dead realtime post 1h. Unblock: setup vitest/playwright + KDS perf test + token-refresh test + transfer realtime test.

### REMOVED from freeze list (verified low-risk)

- ~~`apps/web/app/admin/settings/payments/*`~~ — verified 2026-05-07 step 2: form persists ONLY non-secret fields (`PAYMENT_ENABLE_*` flags + bank account info publicly printed on QR codes) into `system_settings` table. Real secrets (`MOMO_SECRET_KEY`, `VIETQR_API_KEY`) live in env vars (`process.env.*`), only checked for existence — never persisted. ZERO `logAudit` call site. ZERO `provider_configs` table usage anywhere in codebase. Rule AUDIT-NEVER-LOG-CREDENTIALS does NOT apply here. Surface already uses AppSection + SettingsPageShell + RHF + Zod 4 + Sonner + Spinner. Original Critic freeze rationale was based on theoretical worst-case credential storage that does not match actual implementation. NO migration needed; this surface is already compliant.

- ~~`apps/web/app/orders/refund-actions.ts` + `refunds-client.tsx`~~ — verified 2026-05-07 step 4: M4 P0-1 + P0-2 RPC wiring DONE 2026-04-30 in commit `be4719d feat(orders): refund approval workflow qua RPC + per-branch permission probe`. `createRefund()` at refund-actions.ts:163-170 calls `supabase.rpc("create_refund", {...})`. `approveRefund()` at refund-actions.ts:228-233 calls `supabase.rpc("reverse_payment_and_post", { p_refund_id })` for the approve branch (reject branch flips status='rejected' directly — correct). APPROVE_ROLES = `["owner", "super_manager"]` (area_manager scope hole closed — area_manager NOT in approve list). Per-branch `probePermission(ORDERS_REFUND_APPROVE, refund.branch_id)` defense-in-depth at line 218. `mapRefundRpcError()` provides Vietnamese error mapping. `refunds-client.tsx` chrome zero violations (no PageHero, no raw `font-heading text-2xl`, no `Loader2`, uses Card/Empty/Table/Spinner primitives + Badge semantic variants). The freeze entry was based on stale `tasks/todo.md` body text (todo items already had `[x]` checkbox marking them done, but the body text retained the original "WAITING TS edit" justification). NO migration needed; rule REFUND-MUST-REVERSE-ATOMICALLY satisfied.

## Wave plan

| Wave | Scope | Target |
|---|---|---|
| 0 | Adapter API + retire dead code + audit doc | THIS PR |
| 1 | Foundation rollout: notifications, orders (NOT refunds), employee, hr landing, admin/dashboard | Next PR |
| 2 | Admin foundation: settings, staff, reports, feedback, accounting | After Wave 1 |
| 3 | Inventory workflow Part A + mobile fork merge | After Wave 2 |
| 4 | Inventory catalog + Finance/HR/Employee detail Tabs | After Wave 3 |

POS/KDS = FROZEN until M4 P0 closes.

## After Wave 1 (2026-05-07)

Surfaces migrated: notifications, orders (NOT refunds), hr landing, admin/dashboard.
Employee surfaces already delegated to AppPageHeader+AppSection via employee-page.tsx — no changes needed.

### Adapter coverage delta

| Adapter | Baseline | After Wave 1 | Delta |
|---|---|---|---|
| AppPage | 4 | 12 | +8 |
| AppPageHeader | 5 | 9 | +4 |
| AppSection | 7 | 9 | +2 |
| AppToolbar | 9 | 9 | 0 |
| AppEmptyState | 18 | 20 | +2 |
| AppLinkCard | 3 | 4 | +1 |
| AppPageTabs | 0 | 2 | +2 |

### Anti-pattern delta

| Pattern | Baseline | After Wave 1 | Delta |
|---|---|---|---|
| `AppPageHeader` callers | 5 | 9 | +4 ✓ |
| Hand-rolled Empty `border bg-card` | 6 | 5 | -1 ✓ |
| `PageHero` callers | 16 | 15 | -1 ✓ (orders migrated) |
| `redirect.*\?error=` | 4 | 4 | 0 (all in /inventory, Wave 3) |

### Regression rules added

10 new rules inserted at TOP of `tasks/regressions.md` (dated 2026-05-07):
UI-PAGE-HEADER-VIA-APP-PAGE-HEADER, UI-NO-COMPETING-CHROME-PRIMITIVE, UI-NO-RAW-TABLE-OUTSIDE-PRIMITIVE, UI-LOADER-VIA-SPINNER-PRIMITIVE, UI-EMPTY-STATE-VIA-APP-EMPTY-STATE, UI-NO-PALETTE-FOR-STATUS, UI-FORM-VIA-FORMDIALOG-FOR-CRUD, UI-TOAST-VIA-SONNER-NEVER-URL-FLASH, UI-AUDIT-LOG-EXPLICIT-COLUMNS-IN-UI, UI-PERMISSION-FLAGS-THREADED-NOT-SERVER-ONLY.

## 10 new regression rules to add

To be appended to `tasks/regressions.md` after Wave 0:

1. UI-PAGE-HEADER-VIA-APP-PAGE-HEADER
2. UI-NO-COMPETING-CHROME-PRIMITIVE (xoá page-hero.tsx sau Wave 1)
3. UI-NO-RAW-TABLE-OUTSIDE-PRIMITIVE
4. UI-LOADER-VIA-SPINNER-PRIMITIVE
5. UI-EMPTY-STATE-VIA-APP-EMPTY-STATE
6. UI-NO-PALETTE-FOR-STATUS
7. UI-FORM-VIA-FORMDIALOG-FOR-CRUD
8. UI-TOAST-VIA-SONNER-NEVER-URL-FLASH
9. UI-AUDIT-LOG-EXPLICIT-COLUMNS (codify existing rule into UI gate)
10. UI-PERMISSION-FLAGS-THREADED-NOT-SERVER-ONLY

(Land rules in Wave 1 PR, not Wave 0, so we have at least one wave's evidence first.)

## Mandatory detail-page Tabs

Per owner decision 2026-05-07: every detail page MUST use `AppPageTabs` with `[Tổng quan | Dòng | Lịch sử]` (or appropriate domain tab set). Routes affected:

- `/admin/staff/[id]/permissions` (Wave 2)
- `/inventory/{purchase-orders,grn,transfers,stocktake,production,issues}/[id]` (Wave 3)
- `/inventory/supplier-returns/[id]` (Wave 3)
- `/finance/revenue/[date]` (Wave 4)
- `/finance/journal/[id]` if any (Wave 4)
- `/hr/payroll/[periodId]` (Wave 4)

`Lịch sử` tab queries `audit_logs` filtered by `entity_type` + `entity_id` via `apps/web/app/admin/_lib/audit.ts` helper (RPC-only).

## Mobile fork merge plan (Wave 3)

Per owner decision 2026-05-07: `/inventory/m/*` (14 files) merge into responsive cùng URL. Approach:
- Each `m/...` route → its desktop counterpart accepts a `mobile` query param OR detects viewport via CSS-only.
- Prefer CSS-only responsiveness; only use `mobile` param when component-tree split is unavoidable.
- Routes to merge: `m/page.tsx`, `m/grn/`, `m/grn/new/[supplierId]/`, `m/stock/`, `m/transfers/`, `m/transfers/[id]/receive/`, `m/production/`, `m/drafts/`.

After merge, delete `m/` subtree.

## After Wave 2 (2026-05-07)

Surfaces migrated: staff list, staff audit, staff permissions detail (+ Tabs), reports (3 PageHero migrations), crm, feedback inbox/qr/reports/settings, accounting/periods.

New helper: `fetchEntityAuditLogs` added to `apps/web/app/admin/_lib/audit.ts` (explicit columns, entity filter, separate from frozen finance audit helper).

### Adapter coverage delta

| Adapter | Wave 1 | After Wave 2 | Delta |
|---|---|---|---|
| AppPage | 12 | ~20 | +8 |
| AppPageHeader | 9 | 21 | +12 |
| AppSection | 9 | 10 | +1 |
| AppToolbar | 9 | 10 | +1 |
| AppEmptyState | 20 | 20 | 0 (no net change; replaced raw empties with AppEmptyState) |
| AppPageTabs | 2 | 11 | +9 |

### Anti-pattern delta

| Pattern | Wave 1 | After Wave 2 | Target | Status |
|---|---|---|---|---|
| `AppPageHeader` callers (files) | 9 | 21 | ≥25 | partial — Wave 3 will add inventory |
| Hand-rolled Empty `border bg-card` | 5 | 5 | ≤4 | deferred — remaining instances outside Wave 2 scope |
| `PageHero` callers | 15 | 11 | ≤11 | ✓ met |
| `font-heading text-2xl\|text-3xl` raw | 22 | 19 | ≤17 | -3 progress; remainder in inventory/finance (Wave 3-4) |
| `AppPageTabs` usages | 5 | 11 | ≥1 | ✓ first detail-page Tabs live at /admin/staff/[id]/permissions |

### Key decisions made in Wave 2

- Detail-page Tabs pattern established at `/admin/staff/[id]/permissions[Tổng quan|Quyền|Lịch sử]`. History tab uses `permission_audit_log` (not generic `audit_logs` — staff permissions don't go through `logAudit` RPC).
- `fetchEntityAuditLogs` added for future entity-specific audit feeds in Wave 3+ detail pages.
- `canCloseOrReopen` threaded to `PeriodAdminClient` per rule UI-PERMISSION-FLAGS-THREADED-NOT-SERVER-ONLY.
- AlertDialog for close/reopen already in `PeriodCloseCard` (inventory primitive); `period-admin-client.tsx` delegates to it via `strictConfirm` prop.
- `feedback/settings/page.tsx` migrated from raw `Tabs` to `AppPageTabs`.

## After Wave 3a (2026-05-07)

Surfaces migrated: inventory shell (411 → 309 LOC, now delegates to `AppShell` via new `headerExtras` + `mobileTopBar` slots), all inventory list clients (PO, GRN, transfers, stocktake, issues, expiry, waste/{approvals,new}, supplier-invoices, receiving, production, dashboard v1), 5 inventory detail pages get first inventory `AppPageTabs[Tổng quan | Dòng | Lịch sử]` (PO, GRN, transfer, stocktake, issue), 1 URL-flash redirect converted (waste/new), 3 `type="number"` fixes in qc settings, 5 hand-rolled Empty migrations.

New helper: `apps/web/app/inventory/_components/audit-history-list.tsx` — shared `AuditHistoryList` component for inventory detail Lịch sử tabs. Uses `fetchEntityAuditLogs` (Wave 2 helper) with explicit columns, RPC-only.

### Telemetry delta vs Wave 2

| Pattern | Baseline | W1 | W2 | After W3a | Wave 4 target |
|---|---|---|---|---|---|
| AppPageHeader files | 5 | 9 | 21 | **44** | ≥50 |
| AppPageTabs files | 0 | — | 11 | **9** | ≥15 (count fluctuated; 9 distinct surfaces use it now) |
| Hand-rolled `Empty border bg-card` | 6 | 5 | 5 | **2** | 0 |
| PageHero callers | 16 | 15 | 11 | **11** | 1 (audit-trail frozen) |
| raw `font-heading text-2xl/3xl` | 23 | 22 | 19 | **10** | 0 |
| `redirect(?error=)` non-auth | 4 | 4 | 4 | **1** | 0 (only inventory/dashboard/page.tsx — retires Wave 3b) |
| `type="number"` | 11 | 11 | 11 | **10** | ≤4 |
| `Loader2 / animate-spin` | 1 | 1 | 1 | **1** | 0 (mv-staleness-banner Wave 4) |
| Raw palette leak | 0 | 0 | 0 | **0** | ✓ |

### Key decisions in Wave 3a

- Inventory detail Tabs `[Tổng quan | Dòng | Lịch sử]` ship with empty Lịch sử tabs by design — inventory action handlers do NOT currently call `logAudit` (zero hits in `apps/web/app/inventory/`). Tabs render `AppEmptyState mode="no-data"` until audit instrumentation lands (post-pilot or follow-up). Entity types used: `purchase_order`, `goods_receipt_note`, `stock_transfer`, `stocktake_session`, `stock_issue`.
- Inventory shell preserves `branchPickerLocked` (stocktake-session lock), 3-flow nav groups, branch filter URL-only flow (rule INVENTORY-BRANCH-FILTER-URL-ONLY), and `isBranchSite` label override ("Tồn cần xử lý").
- `inventory/waste/new/page.tsx`: redirect-with-flash → inline `AppEmptyState mode="no-access"` for missing branch context.
- Supplier-returns detail page Tabs migration deferred — Wave 4 cleanup.

## After Wave 4b (2026-05-07)

Surfaces migrated: 8 finance list/hub pages from `PageHero` → `AppPageHeader` + `AppPage` chrome (`chart-of-accounts`, `food-cost`, `invoices`, `journal`, `periods`, `posting-rules`, `reconciliation`, `statements`). Revenue detail `[date]/page.tsx` gets `AppPageTabs[Tổng quan | Theo giờ | Danh sách đơn]`. `finance/components/mv-staleness-banner.tsx` Loader2 + animate-spin replaced with `Spinner` primitive.

Note: `finance/page.tsx` has no PageHero (it `redirect()`s to `/finance/revenue?range=today`) — no change needed. `finance/revenue/page.tsx` passes directly to `<RevenueClient/>` with no PageHero wrapper — no change needed. Both are already clean.

### Telemetry delta vs Wave 3a (W4a baseline: AppPageHeader≈46, PageHero=11, Loader2/animate-spin=1, AppPageTabs=9)

| Pattern | W4a baseline | After W4b | Delta | Target met? |
|---|---|---|---|---|
| `AppPageHeader` files | ~46 | **58** | +12 | ✓ (target ≥52) |
| `PageHero` callers (files) | 11 | **3** | -8 | ✓ (target ≤3: page-hero.tsx itself + menu/Wave4c + audit-trail/frozen) |
| `Loader2 / animate-spin` | 1 | **0** | -1 | ✓ (target 0) |
| `AppPageTabs` files | 9 | **10** | +1 | ✓ (target ≥10: +1 for revenue/[date]) |
| Hand-rolled `Empty border bg-card` | 2 | **2** | 0 | unchanged (none in finance) |

### Detail Tabs added

- `/finance/revenue/[date]/page.tsx` — `AppPageTabs[Tổng quan | Theo giờ | Danh sách đơn]` with `paramKey="tab"`. `Lịch sử` tab SKIPPED: revenue data is computed/aggregated from `paid_at` order events; no `audit_logs` entries are written for revenue snapshots. Revenue bucketing logic (REVENUE-BUCKET-BY-PAID-AT-LOCAL-TZ) is untouched — `fetchOrdersForDay(branchId, date)` and `paid_hour` derivation preserved as-is.

### Journal detail route

No `finance/journal/[id]/page.tsx` exists — journal is a single-page list. No detail Tabs to add.

### Key decisions in Wave 4b

- `finance/audit-trail/page.tsx` deliberately left with `PageHero` — frozen per wave contract (HDDT compliance, leak risk). It is the sole finance PageHero caller remaining (plus `page-hero.tsx` itself and `menu/page.tsx` Wave 4c).
- `finance/invoice-list.tsx` untouched — frozen (HĐĐT compliance NĐ70/2025).
- `finance/revenue/[date]/page.tsx` early-exit states (invalid date, no-branch picker) left as minimal raw `div` — these are transient error states, not primary page surfaces.
- `mv-staleness-banner.tsx`: `Spinner` now renders when `isPending=true`, `RefreshCw` when idle. `cn` import retained — still used for outer container className.

## Open / deferred decisions

- Wave 3b: retire `inventory/dashboard/dashboard-client-v2.tsx` + 4 widgets (location-breakdown-table, alerts-drawer, dashboard-summary-cards, dashboard-refresh-button); redirect `dashboard/page.tsx` → `/inventory` (drops final `?error=` flash); port v2's `get_inventory_dashboard` MV-backed RPC into v1 data path; disable `inv_s12_dashboard_v2` flag; update e2e snapshot at `e2e/visual/theme-baseline.spec.ts:23`; merge `/inventory/m/*` mobile fork (14 files) into responsive routes.
- Inventory audit instrumentation (logAudit calls in inventory action handlers) — not in any wave; defer post-pilot.
- `app-shell.tsx` still in active use as inventory shell delegate target (intentional).
- Wave 4c: `menu/page.tsx` (last non-frozen PageHero caller), HR payroll, supplier-returns detail, inventory settings.
- `finance/audit-trail/page.tsx`: PageHero caller — will retire when audit-trail unfreeze lands (post-M4 P0 close). After that, `page-hero.tsx` can be deleted.

## After Wave 4c (final) (2026-05-07)

Surfaces migrated: HR payroll landing (`payroll/page.tsx`) + payroll detail (`[periodId]/page.tsx` with `AppPageTabs[Tổng quan | Đơn vị | Lịch sử]` + `fetchEntityAuditLogs("payroll_period", …)`), supplier-returns list + new + detail pages built from `notFound()` stubs (`[id]/page.tsx` with `AppPageTabs[Tổng quan | Dòng | Lịch sử]` + `fetchEntityAuditLogs("supplier_return", …)`), inventory settings expiry page (`/inventory/settings/expiry/page.tsx`) + QC settings page (`/inventory/settings/qc/page.tsx`) wrapped in `AppPage + AppPageHeader`, menu page (`apps/web/app/menu/page.tsx`) `PageHero` → `AppPageHeader`. New files: `supplier-returns-client.tsx` (list table), `supplier-return-detail-client.tsx` (detail table + meta cards).

### Telemetry delta vs Wave 4b

| Pattern | W4b baseline | After W4c (final) | Delta | Target | Status |
|---|---|---|---|---|---|
| `AppPageHeader` files | 58 | **66** | +8 | ≥62 | ✓ |
| `PageHero` callers (files) | 3 | **2** | -1 | 1 (+ page-hero.tsx itself) | ✓ — only `finance/audit-trail/page.tsx` + `page-hero.tsx` |
| `Loader2 / animate-spin` | 0 | **0** | 0 | 0 | ✓ |
| `AppPageTabs` files | 10 | **12** | +2 | ≥12 | ✓ |
| Hand-rolled `Empty border bg-card` | 2 | **2** | 0 | 0 | deferred — outside W4c scope |
| `font-heading text-2xl/3xl` raw | ~8 | **8** | 0 | ≤3 | internal primitive uses only |

### Wave-by-wave summary table (W0 baseline → W4c final)

| Metric | W0 baseline | W1 | W2 | W3a | W4a/b | W4c (final) |
|---|---|---|---|---|---|---|
| AppPageHeader files | 5 | 9 | 21 | 44 | 58 | **66** |
| AppPageTabs files | 0 | 2 | 11 | 9 | 10 | **12** |
| PageHero callers (files) | 16 | 15 | 11 | 11 | 3 | **2** |
| Hand-rolled `Empty border bg-card` | 6 | 5 | 5 | 2 | 2 | **2** |
| raw `font-heading text-2xl/3xl` | 23 | 22 | 19 | 10 | ~8 | **8** |
| Loader2 / animate-spin | 1 | 1 | 1 | 1 | 0 | **0** |

### Detail Tabs added in Wave 4c

| Route | Entity type string | Tabs |
|---|---|---|
| `/hr/payroll/[periodId]` | `payroll_period` | Tổng quan · Đơn vị · Lịch sử |
| `/inventory/supplier-returns/[id]` | `supplier_return` | Tổng quan · Dòng · Lịch sử |

### Remaining post-M4-unfreeze cleanup

- `apps/web/app/finance/audit-trail/page.tsx` — sole remaining non-self `PageHero` caller; frozen (HĐĐT/leak risk) until M4 P0 closes. After unfreeze: migrate to `AppPageHeader` + delete `apps/web/app/components/page-hero.tsx`.
- `Hand-rolled Empty border bg-card` — 2 remaining instances outside W4c scope; retire in follow-up PR.
- Inventory audit instrumentation (logAudit calls in inventory action handlers) — deferred post-pilot; `Lịch sử` tabs currently show `AppEmptyState mode="no-data"` for inventory entities.
