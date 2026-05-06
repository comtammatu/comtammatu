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

## Frozen surfaces (do NOT touch in any wave)

1. `apps/web/app/orders/refund-actions.ts` + `apps/web/app/orders/refunds-client.tsx` — M4 P0-1 RPC chưa wire
2. `apps/web/app/finance/audit-trail/*` — leak risk
3. `apps/web/app/admin/settings/payments/*` — credentials leak
4. `apps/web/app/finance/invoice-list.tsx` cancel flow — HĐĐT compliance
5. `apps/web/app/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx` — pendingDetailReopenRef + click-snapshot
6. `apps/web/app/br/[branchId]/kds/order-card.tsx` + `apps/web/app/br/[branchId]/kds/_hooks/use-kds-realtime.ts` — memo + token-refresh

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

## Open / deferred decisions

- Dashboard v1 (`/inventory`) vs v2 (`/inventory/dashboard`) — debate in progress (background agent). Outcome lands before Wave 3.
- Whether `app-shell.tsx` is still used as bridge or fully retired — investigate during Wave 1 (notifications uses it? admin uses it via admin-shell wrap?).
