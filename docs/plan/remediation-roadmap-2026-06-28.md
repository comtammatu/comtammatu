# Lộ trình khắc phục hợp nhất — 2026-06-28

> Tài liệu này gộp **5 báo cáo audit** ngày 2026-06-28 thành **một chương trình
> khắc phục duy nhất** cho chủ Cơm Tấm Má Tư. Văn xuôi tiếng Việt; mọi định danh
> code, đường dẫn, tên bảng/hàm/cột, mã severity (P0/P1/P2/P3), finding id
> (SEC-1, RC-1, HC-01…), env var và SQL giữ **nguyên văn**.

**Nguồn (đọc bản đầy đủ tại `docs/worklog/`):**

| # | Báo cáo | File |
|---|---------|------|
| 1 | Fullstack (security/perf/platform) | [`docs/worklog/audit-2026-06-28-fullstack.md`](../worklog/audit-2026-06-28-fullstack.md) |
| 2 | UI — Admin | [`docs/worklog/audit-2026-06-28-ui-admin.md`](../worklog/audit-2026-06-28-ui-admin.md) |
| 3 | UI — Office (Finance/HR/Inventory) | [`docs/worklog/audit-2026-06-28-ui-office.md`](../worklog/audit-2026-06-28-ui-office.md) |
| 4 | Context & i18n | [`docs/worklog/audit-2026-06-28-context-i18n.md`](../worklog/audit-2026-06-28-context-i18n.md) |
| 5 | TODO triage | [`docs/worklog/audit-2026-06-28-todo-triage.md`](../worklog/audit-2026-06-28-todo-triage.md) |

---

## 1. Bức tranh tổng

### Verdict

- **KHÔNG có P0 ở bất kỳ báo cáo nào.** Hệ thống chạy được: package boundary
  sạch, RPC surface đã hardened, RLS đúng, shell layer khoẻ. Nợ là **kỹ thuật /
  nhất quán / tận-dụng-nền-tảng**, KHÔNG phải lỗi đúng-sai về nghiệp vụ.
- Hai đường leo thang quyền **an toàn hôm nay nhưng phụ thuộc convention**
  (AUTHZ-1 self-grant, AUTHZ-2 PostgREST RPC perimeter) — cần guard để không tái phát.
- **"context hardcode" phần lớn là báo động giả:** auth/scope sạch, 0 P0/P1 scope
  bug trong live code. Hai item từng bị flag (SCOPE-4 `notification-list.tsx`
  `tenant_id:1`, SCOPE-5 `printers-client.tsx` `branch_id ?? 0`) đã xác nhận
  **intentional-ok**. **NHƯNG** `HC-01 sellerName:""` trên mọi HĐĐT là việc thật,
  cần xác nhận + sửa sớm (đã verify còn nguyên tại 3 site).
- **i18n là vấn đề thật và đang phình:** baseline 341 dòng `.tsx`, eslint rule
  còn mù `.ts` / JSX expression-container / toast/throw, và **chưa có monotonicity
  guard** nên baseline tự lớn lên (đã từng 57→205→341).

### "Tâm chấn = inventory"

`inventory` là tâm chấn của **gần như mọi loại nợ** cùng lúc:

- **UI drift nặng nhất:** 4 `AppPage` width khác nhau trong một module; ~67 card-clone
  (RC-2) qua ~15 file; 0 lần dùng `chart-1..5` ramp; shell tự chế (2 `<header>`,
  pill nav, `mobile/*` family).
- **i18n epicenter:** 75 file / ~1,011 dòng inline; 34/75 file không wire dictionary nào.
- **scope silent-fallback:** 9 trang hardcode `claims?.tenant_id ?? 0` /
  `?? "branch_manager"` thay vì `loadAuthState()`.
- **unbounded-fetch:** phần lớn các `fetch*` không `.limit()` nằm ở inventory
  (B1/B2/B3/B5/B7/B9/B10/B11/B12).

→ Có **một chiến lược "inventory-first"** (mục 5) chạm UI+i18n+scope+fetch cùng lúc từng surface.

### Bảng tally toàn chương trình

| Loại | Số lượng | Ghi chú |
|------|---------:|---------|
| **P0** | **0** | Không tồn tại ở bất kỳ báo cáo nào |
| **P1** | 50 | Đa số là UI RC-1/RC-2/RC-3 (office+admin) + i18n guard + vài security S-effort |
| **P2** | ~95 | Khối lượng lớn nhất: burn-down fetch/form/i18n/RLS |
| **P3** | ~55 | Polish, làm cơ hội khi chạm route |
| **quick-win (S, rủi ro ~0)** | ~22 | Phase 0 (mục 4) |
| **owner-decision** | 13 | Mục 4 (8 triage + HC-01 confirm + D028 metric + 3 owner-decision khác) |
| **stale / đã xong** | 9 | 6 từ todo-triage (RC-1..RC-6) + SCOPE-4/SCOPE-5 + **INV-A1 (mới fix hôm nay, commit `2d3291b3`)** |

> **Delta so với báo cáo:** INV-A1 (`finance/invoices` `?queue=attention` bị void)
> ĐÃ FIX trong commit `2d3291b3` (2026-06-28, sau audit) — `queue` giờ được thread
> qua `fetchTaxInvoicesPage` + `InvoiceList`. Đã chuyển INV-A1 sang **stale**.
> Baseline i18n vẫn 341 (commit không thêm copy mới).

---

## 2. Tám Workstream

> Mỗi WS = một lằn ranh sở hữu. Burn-down chạy **song song theo WS**; trong WS UI
> thì **song song theo module**, inventory trước.

### WS1 — Security & Authz

**Vấn đề.** Không có lỗ thủng đang khai thác được, nhưng có **một đường self-grant
thật** (AUTHZ-1) và một loạt RPC hardening lệ thuộc convention. Perimeter thật =
RLS + per-RPC check; proxy ACL có thể bypass qua `/rest/v1/rpc/<fn>` trực tiếp.

**Cách xử lý.** Vá self-grant + NULL-branch + service-client gate ngay (S-effort);
phần còn lại là RLS/tenant-scope hygiene gom vào burn-down; guard CI nằm ở WS8.

**Effort tổng:** ~3 S + 6 M. **Phụ thuộc:** không (Phase 0/1). **Ai làm:** agent +
owner (config-only: SEC-1/SEC-2/SUP-7).

| ID | Sev | Việc | Evidence | Effort | Actor |
|----|-----|------|----------|--------|-------|
| AUTHZ-1 | P1 | Guard `target ≠ actor` cho `grant_permission`/`apply_template_to_user`/`revoke_permission` | `permissions/actions.ts:47,75,101`; chưa có `cannot_self_grant` trong code (verified) | S | agent |
| INV-A2 | P1 | Gate khối `createServiceClient()` sau `if (canManageEmployees)` | `hr/page.tsx:85-102` | S | agent |
| INV-B4 | P1 | Expiry page `redirect('/login')` thay vì render `tenantId=0` | `expiry/page.tsx:25-59` | S | agent |
| RT-1 | P1 | Thêm filter `tenant_id=eq.${tenantId}` cho channel `notification-popups` | `use-foreground-notifications.ts:78-91` | S | agent |
| RPC-1 | P2 | `update_pos_order_status`: đổi guard sang `v_prof_branch IS DISTINCT FROM v_order.branch_id` + role allow-list | NULL-branch office profile bypass | S | agent |
| SEC-1 | P2 | Bật leaked-password protection (HaveIBeenPwned) | Advisor `auth_leaked_password_protection` | S | owner |
| SEC-2 | P2 | Bật TOTP MFA cho owner/finance/permission roles | Advisor `auth_insufficient_mfa_options` | M | owner |
| AUTHZ-2 | P2 | `REVOKE EXECUTE FROM authenticated` các RPC never-direct + CI assertion (→ WS8) | `proxy.ts:268-270` | M | agent |
| RPC-2 | P3 | `recompute_supplier_invoice_matching`: thêm `has_permission(..., 'finance:invoice_match')` | granted to authenticated, no perm check | S | agent |
| RPC-4 | P3 | Chuẩn hoá `SET search_path TO ''`; 19 fn còn `pg_temp` | `log_audit`, `submit_inventory_count_slip`, `trg_notify_*` | M | agent |
| SEC-4 | P3 | `verify_branch_override_code`: check `p_branch_id` thuộc tenant caller | thiếu tenant guard sớm | S | agent |
| SEC-5 | P3 | Scope owner-bypass của `has_permission` về `pr.tenant_id = auth_tenant_id()` | harmless single-tenant | S | agent |
| AUTHZ-3 | P3 | Document `proxy.branch_id` là advisory, RLS authoritative; optional force token refresh | `proxy.ts:199-264` | S | owner |
| AUTHZ-4 | P3 | Test `/api/debug/claims` trả 404 khi `NODE_ENV=production` | `api/debug/claims/route.ts:22-28` | S | agent |
| DB-1 | P2 | Per-shell logging contract: log `error.code/details` server-side (never client) | `database.md` Known Failure Patterns; `finance/actions.ts:578` (42702) | L | agent |
| SEC-2(triage) | P2 | D043 completion-auth gap: `create_payment` chỉ gate `pos:use`, flip `paid` | `payment-actions.ts:596`; `confirm_cash_payment` cần `pos:confirm_payment` | M | **owner** (mục 3) |
| SEC-3(triage) | P3 | α4c: viết RLS regression test trước khi DROP `can_access_branch` (PROD count=1) | baseline 12 refs incl 4 RLS policies | M | agent |

### WS2 — Data & Performance

**Vấn đề.** Hàng chục **unbounded list fetch** suy giảm tuyến tính theo volume;
DB **over-indexed** (171 unused) gây write amplification; realtime fanout nặng nhất
ở finance owner-mode `payments` channel.

**Cách xử lý.** Eliminate unbounded fetch theo route (inventory trước); index
rebalance **validate bằng `hypopg`+`index_advisor`, đừng chase advisor count**;
giảm realtime fanout. Drop index/RPC **bị chặn bởi telemetry** (PERF-1/PERF-2 ops, mục 4).

**Effort tổng:** ~5 S + 12 M. **Phụ thuộc:** index/RPC drop chờ telemetry bật
(WS3/ops). **Ai làm:** agent + owner-apply (migration).

| ID | Sev | Việc | Evidence | Effort | Actor |
|----|-----|------|----------|--------|-------|
| INV-B1 | P1 | `fetchPurchaseOrders` unbounded → COUNT-only KPI + pagination | `purchase-order-actions.ts:39`; callers dashboard/PO/receiving | M | agent |
| INV-B2 | P1 | `fetchGrns` unbounded → `LIMIT 100`, count-only hub, `id+grn_number` cho dropdown | `grn-actions.ts:163` | M | agent |
| INV-B3 | P1 | `fetchIngredients select('*')` redundant 3× → narrow select + `cache()` helper | `ingredient-actions.ts:111` | M | agent |
| DB-2 | P1 | 171 unused index → confirm `pg_stat_user_indexes`, DROP theo batch (hot-write trước) | Advisor `unused_index x171` | M | agent+owner-apply |
| SUP-2 | P1 | 156 unindexed FK → covering index cho FK trong predicate thật | Advisor `unindexed_foreign_keys x156` | M | agent+owner-apply |
| RT-2 | P1 | Finance owner all-branch `payments` channel `router.refresh()` → 'finance dirty' trigger/summary | `use-finance-realtime-refresh.ts:45-62` | M | agent |
| INV-A3 | P2 | hr/staff: push filter xuống DB + `.limit(200)`/keyset | `hr/staff/page.tsx:37-79` | M | agent |
| INV-A6 | P2 | printers/jobs: gộp 4 count-query vào 1 RPC + keyset | `printers/jobs/page.tsx:127-143` | M | agent |
| INV-B5 | P2 | supplier-invoices: refetch theo ID, bỏ `fetchSupplierInvoices()` unbounded | `supplier-invoices-client.tsx:441` | M | agent |
| INV-B7 | P2 | `fetchStockIssues` `.limit(200)` + default 7-day window | `issue-actions.ts:63-86` | S | agent |
| INV-B9 | P2 | `fetchStockTransfers`: join `branches`, `.limit(100)` | `transfer-actions.ts:222-268` | S | agent |
| INV-B10 | P2 | Receiving hub: 3 fetch full → `count:'exact',head:true` | `receiving/page.tsx:21-23` | S | agent |
| INV-B11 | P2 | `fetchSupplierReturns` `.limit(100)` | `supplier-return-actions.ts:25-42` | S | agent |
| INV-B12 | P2 | `fetchStocktakeSessions` `.limit(50)` + aggregate count RPC | `actions.ts:94-135` | M | agent |
| RT-3 | P2 | Notifications bell: filter `target_branch_id=eq.${branchId}` cho branch roles | `use-notifications.ts:161-173` | M | agent |
| RT-4 | P2 | POS per-order channel → derive từ branch stream | `order-detail-sheet.tsx:513`, `bill-receipt-sheet.tsx:650` | M | agent |
| DB-3 | P2 | Triage 156 FK advisory (không blanket-index) | `idx_orders_created_by` vừa exist vừa unused | M | agent |
| DB-4 | P2 | 5 RLS init-plan → wrap `(select auth.uid())` | Advisor `auth_rls_initplan x5` | S | agent |
| DB-5 | P3 | 41 bảng multi-permissive SELECT → scope policy thứ 2 về command thật | Advisor x41, 0 hot table | M | agent |
| DB-6 | P3 | Auth conn pool → percentage-based (config) | Advisor `auth_db_connections_absolute` | S | owner |
| DB-1(perf) | P3 | `idx_refunds_order_id` khi refund volume materialize (0 rows hiện tại) | downgraded P1→P3 | S | agent |
| DB-7 | P3 | Finance MV staleness — no action unless intraday cần | `fold_managed_surfaces.sql:95` | S | owner |
| PERF-1(triage) | P3 | ~231 unused index — **chờ ops reset `pg_stat`** | `stats_reset = NULL` | S | **ops** (mục 4) |
| PERF-2(triage) | P3 | Dead-RPC drop wave 2 — **chờ `track_functions='all'`**; `get_daily_revenue` ứng viên mạnh | `track_functions='none'` | S | **ops** (mục 4) |

### WS3 — Platform (Vercel / Supabase / cron)

**Vấn đề.** Tính năng nền tảng quan trọng cho tablet-POS **vắng hẳn**: không
`maxDuration`, không Speed Insights, Suspense không stream, `'use cache'` = 0.
Advisor (528 lint) chưa bao giờ gate CI → hardening là khảo cổ thủ công.

**Cách xử lý.** Config-only quick wins ngay (PERF-1/PERF-2/PERF-7); streaming +
caching + decompose POS đi sau Speed Insights để đo INP thật.

**Effort tổng:** ~6 S + 7 M + 1 L. **Phụ thuộc:** PERF-6 sau PERF-2(Insights).
**Ai làm:** agent + owner + ops.

| ID | Sev | Việc | Evidence | Effort | Actor |
|----|-----|------|----------|--------|-------|
| PERF-1 | P1 | `export const maxDuration = 300` mọi cron route | `vercel.json` crons; `hddt-reconcile.ts:311` budget 240000 | S | agent |
| PERF-2 | P1 | Thêm `<SpeedInsights/>` + `<Analytics/>` vào `layout.tsx` | không có `@vercel/speed-insights` trong package.json | S | agent |
| PERF-3 | P1 | POS: chuyển fetch **vào trong** Suspense boundary để stream | `pos/page.tsx:56-140,187` | M | agent |
| SUP-1 | P1 | `get_advisors` diff CI gate (security+perf, baseline allowlist) → WS8 | `ci.yml` không có advisor step; 528 lint | M | agent |
| PERF-4 | P2 | `optimizePackageImports` thêm `"radix-ui"` (24 barrel import) | `next.config.ts:93` | S | agent |
| PERF-5 | P2 | `'use cache'`+`cacheTag` cho tenant-stable reads (branches/menu/settings) | `rg 'use cache' = 0` | M | agent |
| PERF-6 | P2 | Decompose `pos-desktop-inner.tsx` (2113 LoC) theo concern + lazy-load | only 4 modal code-split | L | agent |
| SUP-3 | P2 | `kds-maintenance` cron → `pg_cron`, xoá Vercel route | route chỉ gọi `cleanup_kds_tickets_as_system` | S | agent |
| SUP-4 | P2 | 3 bảng RLS-no-policy: thêm deny-default comment / narrow policy | `archive_run_log`, `order_daily_counters`, `reconcile_run_log` | S | agent |
| RT-5 | P2 | `REPLICA IDENTITY FULL` cho `order_status_history` | `relreplident='d'` vs peers `'f'` | S | agent+owner-apply |
| WS3-1 | P2 | Deploy print-agent v1.0.0 lên 3 branch (Phước Hải đang 0.2.0) | infra in baseline #109 | M | **ops** (mục 3) |
| WS3-2 | P2 | Verify D047 preview-branch billing + Supabase branching setting | PROD branch `main`=MIGRATIONS_FAILED (by design) | S | **owner** (mục 3) |
| WS3-4 | P2 | Migration `cron_run_log` + instrument cron + alert vào `notifications` | không có table (PROD `to_regclass=NULL`) | L | agent+owner-apply |
| PERF-7 | P3 | `import "server-only"` đầu `spreadsheet.ts` (exceljs ~900KB) | `app/_lib/spreadsheet.ts:1` | S | agent |
| PERF-8 | P3 | Verify cron gửi `Authorization: Bearer` hay dùng `x-vercel-cron` | 4 route alias `GET=POST` | S | ops |
| SUP-6 | P3 | print-agent poll `print_jobs` 15s — realtime primary, timer là safety-net | `index.ts setInterval(drainPending,15000)` | M | agent |
| RT-6 | P3 | Back off drain interval 15s→60s khi realtime SUBSCRIBED | `index.ts:319` | S | agent |
| WS3-3 | P3 | Đăng ký UptimeRobot ping `/api/health` | route 36 dòng built, thiếu wiring | S | **ops** (mục 3) |

### WS4 — UI & Design System

**Vấn đề.** Đây là **khối lượng lớn nhất chương trình** (Admin 22 + Office ~80 finding).
Shell layer khoẻ; drift nằm **một tầng dưới**: 4 root cause lặp lại family-wide —
**RC-1** field-idiom split (bare `Input` h-7 vs `form/*` h-10), **RC-2** card-in-card
panel, **RC-3** width/nav mismatch, **RC-4** gap-on-gap. Inventory là offender nặng nhất.

**Cách xử lý.** Theo Fix Order của contract: **token → shell → pages → enforcement**.
Phase A (shared shell/token/primitive — blast radius cao, **auto-resolve nhiều lá**)
→ Phase B (per-module `form/*` migration) → enforcement (WS8). UI-1/UI-4 là regression
nhỏ vá ngay ở Phase 0.

**Effort tổng:** rất lớn — ~40 S + ~25 M + ~6 L. **Phụ thuộc:** Phase A trước Phase B;
lint rule (WS8 C1-C4) **sau** burn-down. **Ai làm:** agent (đa số) + owner (ADM-SHELL-4,
ADM-CONSIST-5, INV-P-04 width decision).

**Root cause (chốt — sửa 4 cái này thì ~80% triệu chứng biến mất):**

| ID | Sev | Việc | Evidence | Effort | Actor |
|----|-----|------|----------|--------|-------|
| RC-1 | P1 | Migrate `payments-form`/`templates-client` sang `form/*` (h-10) | `payments-form.tsx:137-178`; `templates-client.tsx:469-657` | M | agent |
| RC-2 | P1 | Bỏ wrapper `rounded-md border p-4` card-in-card, để `AppSection` là surface duy nhất | `payments-form.tsx:108,186,216` | M | agent |
| RC-3 | P1 | Pin 1 width cho subtree Settings (nav + content cùng centered column) | `settings/layout.tsx:13`; `surface.tsx:40-45` | S | agent |
| RC-4 | P1 | Collapse gap-on-gap-on-gap; bỏ `mt-*/mb-*` ad-hoc | `settings/layout.tsx:13`; `payments-form.tsx:126,254` | S | agent |

**Phase A — shared shell/token/primitive (Office, làm cùng Admin):**

| ID | Sev | Việc | Evidence | Effort | Actor |
|----|-----|------|----------|--------|-------|
| SHELL-01 / INV-06 / INV-P-03/04 / INV-S-03 | P1 | **Inventory width policy A1**: 1 width, route qua `InventoryPageContent`, bỏ inner `mx-auto max-w-*` | 4 width khác nhau; `new-po-client.tsx:333` | M | agent |
| SHELL-02 / SHELL-03 / INV-01 | P1 | Inventory mobile/settings chrome: bỏ `<header>` thứ 2, settings nav non-pill | `app-shell.tsx:373-377`; `settings/layout.tsx:47` | M | agent |
| SHELL-05 / INV-08 / INV-P-07 / INV-S-05 / UI-2 | P1 | **Xoá `mobile/*` family**, migrate 4 consumer sang `AppPageHeader` (auto-resolve hand-rolled `<h1>`) | `mobile-section-header.tsx:43,60` | M | agent |
| SHELL-07 | P2 | `FinanceShell`/`InventoryShell` → route qua `ManagementShell` | `finance-shell.tsx:50-76`; `inventory-shell.tsx:121-147` | M | agent |
| SHELL-06 | P2 | `InventoryPageContent` default `scroll=false` | `inventory-page-layout.tsx:16` | S | agent |
| UI-3 / INV-04 / INV-S-07 / FIN-07 | P1/P2 | Chart tokens: map series → `chart-1..5`, bỏ kinetic hover, fix inline radius | `chart-primitives.tsx:42`; `heatmap-grid.tsx:44-51` | M | agent |
| INV-02 / INV-P-12 / INV-S-09/12 / FIN-02/06/09 / HR-10 | P1/P2 | Consolidate stat tile → `KpiCard`/`KpiRow` (auto-resolve missing `font-mono`) | `dashboard-client.tsx:638-661`; `po-detail-client.tsx:510-531` | M-L | agent |
| ADM-SHELL-3 | P2 | Bỏ inner `sticky top-0 z-10` trên `mobileTopBar` | `app-shell.tsx:373-377` | S | agent |

**Phase B — per-module `form/*` migration (sau primitive):**

| ID | Sev | Việc | Evidence | Effort | Actor |
|----|-----|------|----------|--------|-------|
| FIN-01 / FIN-08 | P1 | Finance FilterBar + invoice dialog → `form/*` | `filter-bar.tsx:181-317`; `invoice-list.tsx:921-970` | M | agent |
| HR-01/02/03 | P1 | Payroll standard-days, checklist-template builder, permissions datetime → `form/*` | `payroll-list-client.tsx:175`; `checklist-templates-table.tsx:461-640` | S-L | agent |
| HR-06 / HR-10 | P1 | Payroll detail `width="wide"`; split grid 7-col | `payroll/[periodId]/page.tsx:23,46` | S | agent |
| INV-05 | P1 | qc-settings + thresholds: `form/NumberField`, bỏ `h-8` override | `qc-settings-client.tsx:71-106`; `thresholds-client.tsx` | M | agent |
| INV-P-01 / INV-S-01 | P1 | ~23 procurement/stock-ops bare Input → `form/*` | `add-grn-line-dialog.tsx`, `grn-line-row.tsx`, … | M-L | agent |
| INV-P-02 / INV-S-02 | P1 | ~45 card-clone → `Card size="sm"` / `KpiCard` | `po-detail-client.tsx`, `supplier-invoices-client.tsx`, … | M-L | agent |
| INV-S-06 | P1 | Number-pad keys raw `<button>` → `Button size="touch"` | `number-pad-sheet.tsx:117-124` | S | agent |
| INV-P-11 | P1 | supplier-return detail: thêm `AppPage`+`AppPageHeader` | `supplier-return-detail-client.tsx:19,77` | S | agent |
| INV-03 | P1 | Reports page mosaic panel → `Card`/`AppLinkCard`/`Item` | `reports-client.tsx:138-291` | M | agent |
| F-01/02/03/04/09 | P1 | item-detail-dialog, PrinterForm, orders filter, order-sheet panel + width pin | `printers-client.tsx:391-498`; `order-detail-sheet.tsx:167,197-447` | M | agent |
| UI-1 | P1 | `hover:scale`→`active:scale`, bỏ chart hover motion | `issue-detail-client.tsx:560`; `chart-primitives.tsx:42` | S | agent |
| UI-4 | P1 | PO total qua `formatVND`, bỏ `₫` thừa | `new-po-client.tsx:875,922` | S | agent |
| RC-2 long-tail (HR-04/05, F-12/13, INV-13) | P2 | Card-clone replacement per module | nhiều site | S each | agent |
| RC-4 long-tail (HR-07/12, INV-P-05, INV-S-04, F-05/06) | P2 | `mt-*`/`space-y-*` → `gap-*` | nhiều site | S-M | agent |
| FIN-03 / FIN-04/05 | P1/P2 | Finance width align + bỏ `SectionHeading` + consolidate `formatCount` | `page.tsx:212`; `revenue-client.tsx:199-212` | S-M | agent |
| HR-08 / HR-09 / HR-11 | P2 | Shared `StatusBadge`, bỏ raw `<h3>`, bỏ `h-12` override | `checklist-coverage-panel.tsx:49`; `staff-table.tsx:235` | S-M | agent |
| INV-P-06 / INV-S-08 | P2 | Local status-badge map → shared registry | `_lib/ui.ts:29` | L | agent |
| TG-1 | P3 | Drop orphan `--radius-xl/2xl/3xl/4xl` (0 consumer) | `globals.css:66-69` | S | agent |
| UI-5 / INV-12 / các P3 polish | P3 | Tint ladder, `font-bold`→`font-semibold`, radius tier, `font-mono tabular-nums` | nhiều site | S each | agent |
| ADM-SHELL-4 / ADM-CONSIST-5 / INV-P-04 / SHELL-08 / TG-2 / F6 | P2/P3 | **Owner-decision** (mục 3): density policy, sub-nav idiom, width=full exception | — | — | **owner** |
| WS4-1 | P3 | WS-3 shell split + 8 DS surface tail visual verify (chờ D047 preview) | `pos-desktop-shell.tsx`, `order-detail-sheet.tsx` | M | agent |

> *(WS4 còn nhiều P2/P3 lá — danh sách đầy đủ ở 2 báo cáo UI; bảng trên gom theo nhóm để skimmable.)*

### WS5 — Context & Config

**Vấn đề.** Scope hardcode phần lớn báo động giả, nhưng **business-config hardcode**
là nợ thật: `sellerName:""` trên mọi HĐĐT (HC-01, **verified còn nguyên 3 site**),
tax code dual-source, waste cap copy-paste 4 file. Cộng 9 trang bypass `loadAuthState()`.

**Cách xử lý.** HC-01 vá sớm (sau xác nhận pháp danh — mục 3); SCOPE-3 migrate 9 trang
sang `loadAuthState()` **một lượt** giải quyết cả SCOPE-1/2; HC-02/03/05 externalize config.

**Effort tổng:** ~6 S + 5 M. **Phụ thuộc:** HC-01 chờ owner confirm pháp danh.
**Ai làm:** agent + owner (confirm HC-01).

| ID | Sev | Việc | Evidence | Effort | Actor |
|----|-----|------|----------|--------|-------|
| HC-01 | P1 | Plumb `tenants.legal_name` vào 3 site issue, thay `sellerName: ""` | `finance/actions.ts:307`, `replace-invoice-actions.ts:294`, `hddt-daily-summary.ts:142` (verified) | S | agent (sau owner confirm) |
| HC-02 | P1 | Đọc `tenants.tax_code` runtime; demote `COMPANY_TAX_CODE` thành bootstrap fallback | `finance/actions.ts:308`; `invoice-provider-init.ts:19` | M | agent |
| HC-03 | P1 | Thêm cột `shift_cap_vnd` vào `branch_daily_waste_cap`, xoá literal `1_500_000` (4 file) | `waste-actions.ts:377,379` | M | agent |
| SCOPE-3 | P2 | Migrate 9 inventory page sang `loadAuthState()` (auto-resolve SCOPE-1/2) | `expiry/page.tsx`, `drafts/page.tsx`, `stocktake/page.tsx`, … (9 file) | M | agent |
| SCOPE-1 | P2 | (auto-resolved bởi SCOPE-3) bỏ `?? 0` cho scope id | `expiry/page.tsx:58`; `grn/[id]/page.tsx:144` | M | agent |
| SCOPE-2 | P3 | (auto-resolved bởi SCOPE-3) bỏ `?? "branch_manager"` | `expiry/page.tsx:59` | S | agent |
| HC-04 | P2 | Extract `AGENT_OFFLINE_THRESHOLD_MS` (60s) về 1 constant | định nghĩa 4× | S | agent |
| HC-05 | P2 | Externalize default input VAT 8% (revert 10% sau 31/12/2026) | `supplier-invoice-actions.ts:23` `.default(8)` | S | agent |
| HC-06 | P2 | Extract `TRUST_IP_GRACE_MS` (30min) shared | `proxy.ts:304`; `network-config-dialog.tsx:50` | S | agent |
| HC-07 | P2 | Thêm `MOMO_BASE_URL` env override | `momo.ts:29-30` | S | agent |
| HC-10 | P3 | Extract anti-split window + `ADVISORY_THRESHOLD_VND` | `waste-actions.ts:411`; `invoice-form-section.tsx:17` | S | agent |
| INV-A4 | P2 | hr permissions/audit: embed `profiles(id, full_name)` qua RPC, bỏ round-trip 2 | `permissions/page.tsx:93-97` | M | agent |
| INV-B6 | P2 | `consumption/` re-export → 301 redirect về `/inventory/issues` (verified còn live) | `consumption/page.tsx:1` | S | agent |
| INV-B8 | P2 | Thêm `/inventory/waste` list page | waste/ chỉ có `approvals/`+`new/` | M | **owner** (mục 3) |
| INV-A5 / INV-A7 / INV-A8 | P3 | Extract `_lib/` helper; thêm `loading.tsx`; SSR-seed notifications | nhiều site | S each | agent |
| SCREEN-6 | P2 | checkout-approvals: thêm sub-module proxy ACL | `checkout-approvals/page.tsx:247-276` | S | agent |
| WS5-1 | owner-decision | grossProfit metric definition (D028) | `finance-cockpit.ts:173` | n/a | **owner** (mục 3) |

### WS6 — i18n Extraction

**Vấn đề.** i18n là vấn đề thật và đang phình: ~341 baselined `.tsx` / ~2,375 dòng;
inventory là epicenter (75 file / 1,011 dòng); thiếu **destination contract slot**
(TOAST_VI/VALIDATION_VI/COLUMNS_VI/EMPTY_STATE_VI) chặn mọi wave downstream.

**Cách xử lý.** W0 (tạo slot) → wave W1-W7 theo độ-hiển-thị, **re-baseline sau mỗi
wave để shrink count**. Guard monotonicity (WS8 I18N-04) phải đi TRƯỚC để cầm máu.

**Effort tổng:** W0 M; W1-W7 S/M/L. **Phụ thuộc:** W0 trước tất cả; I18N-04 guard
trước (Phase 0). **Ai làm:** agent.

| ID | Sev | Việc | Evidence | Effort | Actor |
|----|-----|------|----------|--------|-------|
| I18N-W0 | P1 | Tạo `TOAST_VI`/`VALIDATION_VI`/`COLUMNS_VI`/`EMPTY_STATE_VI` ở `packages/shared/src/messages/` | chưa tồn tại | M | agent |
| I18N-INV | P2 | **W1**: wire 34 file inventory chưa wire → `W4` Zod/COLUMNS → `W5` production cluster | `"Kho hàng" 19×`, `"Đơn vị"/"Chi nhánh" 6×` | L | agent |
| I18N-POS | P2 | **W2**: br/pos toast/notify (66 string) → `pos-feedback.ts`; **W3**: br/kds `order-grid.tsx:49-56` LABELS → `messages/kds.ts` | br/pos 407 dòng, br/kds 82 dòng | M | agent |
| I18N-CHROME | P2 | **W6**: `surface.tsx` empty-state defaults → `states.ts`; `office-module-shell.tsx` nav → `labels/vi.ts` | `surface.tsx:599-705` | S | agent |
| I18N-GROW | P2 | Sau I18N-04 guard, chạy wave để shrink count < 341 | baseline 57→205→341 | S | agent |
| (W7) | P2 | hr/finance/employee/menu/orders/branch-settings form-dialog + toast cluster | — | M-L | agent |

### WS7 — Backlog & Convention

**Vấn đề.** Backlog phình do **6 item stale/đã ship** (RC-1..RC-6 trong todo-triage).
Convention split: 4 nơi shared-code, 2 kiểu đặt tên action. Một số việc agent-doable
(payroll CSV export) và một số chờ owner quyết.

**Cách xử lý.** Đóng 6 stale ngay (no code); convention consolidation làm cơ hội +
lint nudge; agent-doable item theo capacity.

**Effort tổng:** ~5 S + 3 M + 2 L. **Phụ thuộc:** convention (ARCH-1/ARCH-4) cần owner
chốt 1 home. **Ai làm:** agent + owner.

| ID | Sev | Việc | Evidence | Effort | Actor |
|----|-----|------|----------|--------|-------|
| RC-1..RC-6 (triage) | stale | Đóng 6 checkbox stale trong `tasks/todo.md` (đã ship/applied) | PROD ledger khớp; code đã merge/xoá | n/a | **owner** (mục 4) |
| SCOPE-4 / SCOPE-5 | stale | Mark intentional-ok (skeleton fixture / guarded sentinel) | `notification-list.tsx:38`; `printers-client.tsx:287` | n/a | owner |
| WS7-1 | P2 | Build payroll-period CSV export (no DB change) | `hr/payroll-actions.ts:234`; 0 export hit | M | agent |
| WS7-2 | P2 | Root-cause CI e2e multi-spec hang, re-add 1 spec/PR (payment-vietqr trước) | `ci.yml` chỉ pin payment-cash; 7 spec un-gated | L | agent |
| WS7-3 | P2 | Live POS→print-agent→HĐĐT smoke (cần creds + máy in) | POS→KDS leg DONE (#110) | M | **owner** (mục 3) |
| ARCH-5 | P2 | Decompose `pos-desktop-inner.tsx` (2113) + split large `*actions.ts` theo concern | `payment-actions.ts:1486`, `menu/actions.ts:1400` | L | agent |
| ARCH-1 | P2 | Chốt 1 home shared-code (`app/components` vs `_components`; `lib/` vs `app/lib`) + lint | 364 vs 8 import; 3 lib root | L | **owner** (mục 3) |
| ARCH-2 | P3 | Rename `kds/{components,hooks,lib}` → `_`-private | bare `components/` có thể thành route | S | agent |
| ARCH-3 | P3 | Xoá `cn()` duplicate trong `app/lib/utils.ts`, repoint về `@comtammatu/ui` | 1 consumer | S | agent |
| ARCH-4 | P3 | Chốt 1 rule đặt tên action (`*-actions.ts` de-facto, 48 file) + lint nudge | 28 `actions.ts` vs 48 `*-actions.ts` | M | **owner** (mục 3) |
| ARCH-6 | P3 | `turbo.json` thêm `inputs` globs | `lint: {}`, `typecheck: {}` no inputs | S | agent |
| ARCH-7 | P3 | Repoint 5 consumer, xoá `app/_actions/*` shim (verify boundary trước) | 5 importer | S | agent |
| WS7-4..WS7-8 | owner-decision | split-invoice / HRM Đợt 3 / HRM IA / F-018 supplier 'Khác' / transfer_ownership | mục 3 | n/a | **owner** |

### WS8 — Guardrails (CI lint/test, chống tái phát)

**Vấn đề.** Nhiều báo cáo **độc lập** đề xuất "thêm 1 CI guard để không tái phát" →
gộp thành 1 workstream. Có 3 lỗ enforcement UI + i18n không monotonicity + thiếu
SECURITY DEFINER scan + thiếu advisor-diff + thiếu type-drift gate.

**Cách xử lý.** I18N-04 + maxDuration cầm máu Phase 0; advisor-diff/type-drift/secdef
scan ở Phase 1 (chống tái phát mọi finding khác); UI lint rule (C1-C4) **bật SAU**
burn-down để baseline khởi điểm gần 0.

**Effort tổng:** ~5 S + 8 M + 2 L. **Phụ thuộc:** UI lint sau WS4 burn-down.
**Ai làm:** agent.

| ID | Sev | Việc | Evidence | Effort | Actor |
|----|-----|------|----------|--------|-------|
| I18N-04 | P1 | **Monotonicity guard**: CI fail nếu baseline count > `origin/main` (cho shrink, cấm grow) | `update-i18n-baseline.mjs:50` regen no-compare | S | agent |
| I18N-01 | P1 | ESLint walk JSXExpressionContainer cho 4 attr whitelist; re-baseline once | `eslint.config.mjs:90-101` | M | agent |
| I18N-02 | P1 | Thêm config block enable rule trên `**/*.ts` (trừ test); re-baseline | `eslint.config.mjs:147` chỉ `**/*.tsx` | M | agent |
| I18N-03 | P2 | CallExpression visitor cho `toast`/`throw` args (~190 dòng) | `eslint.config.mjs:84-101` | M | agent |
| I18N-06 | P2 | `VI_TARGET_ATTRS` configurable + thêm `successMessage/label/heading/emptyText` | `eslint.config.mjs:31` | S | agent |
| I18N-05 | P3 | Pre-commit hook (lefthook/husky) chạy i18n rule trên staged | chỉ `*.sample` hook | S | agent |
| SEC-WS8-1 / SEC-1(triage) / WS8-1 | P1/P2 | Restore `security-definer-rpc-static.test.ts` + scan GRANT EXECUTE→authenticated thiếu authz | test không tồn tại (grep=0) | M | agent |
| SUP-WS8-1 / SUP-1 | P1 | Advisor-diff CI gate (security+perf vs baseline allowlist) | `ci.yml` no advisor step | M | agent |
| SUP-WS8-2 / SUP-5 | P2 | Type-drift gate: regen `database.types.ts` trên local stack + `git diff --exit-code` | `gen-types.mjs` hardcode PROD ref | M | agent |
| A2E-GUARD | P2 | `no-restricted-syntax` ban literal `tenant_id/branch_id` + `?? 0`/`?? "branch_manager"` ngoài auth layer | sau SCOPE-3 migration | S | agent |
| UI-WS8-1 | P2 | Mở rộng motion lint: `hover:scale-*`/`translate`/`brightness`/`rotate` | `UI-1` escaped CI | S | agent |
| C1 (ADM-ENFORCE-3 / INV-P-14 / F-16) | P2 | Bordered-panel-without-bg ratchet (bg-less escape inline-chrome gate) | `check-ui-contract.mjs:867-868` | M | agent |
| C1b (ADM-ENFORCE-4) | P2 | `p-4`/`p-3` + border + rounded card-clone gate | `check-ui-contract.mjs:810` | M | agent |
| C2 (ADM-ENFORCE-6) | P2 | Bare-`Input`-in-`*-form.tsx` gate (field-idiom) | `check-ui-contract.mjs:721` | M | agent |
| C3 (INV-07 / HR-08) | P2 | STATUS-map + KpiCard-clone ratchet | `expiry-list-client.tsx:72-85` | M | agent |
| C4 (ADM-ENFORCE-7) | P3 | Advisory page-width/density consistency per route family | no family-level check | L | agent |
| ADMIN-PG-05 / ADM-ENFORCE-7 | P3 | Reconcile 3 stale allowlist (space-y/gap-atypical/vnd-format) về actual | `check-ui-contract.mjs:794,845,295` | S | agent |
| RPC-3 / SUP-WS8 doc | P3 | Document 149 authenticated-definer WARN accepted ở `database.md` | 149/154 security lint | S | agent |

---

## 3. Cổng quyết định của owner

> **Đặt SỚM vì nhiều thứ chặn ở đây.** Mỗi câu hỏi chốt-1-lượt; cột "Mở khoá" cho biết
> việc bị chặn. Agent KHÔNG đoán intent kế toán/pháp lý/UX của owner.

| # | Câu hỏi chốt-1-lượt | Mở khoá | Ref |
|---|----------------------|---------|-----|
| 1 | **Pháp danh seller in trên HĐĐT là chuỗi nào?** (xác nhận để plumb `tenants.legal_name` vào `sellerName`) | HC-01 — vá `sellerName:""` trên mọi HĐĐT (việc cần làm sớm nhất về pháp lý) | WS5 |
| 2 | **"Doanh thu" = HĐĐT-issued (P&L) hay cash-collected? "Lãi gộp" trừ gì ngoài `ingredientCost`?** | WS5-1 (D028) — toàn bộ dashboard/finance polish | `finance-cockpit.ts:173` |
| 3 | **D043: yêu cầu `pos:confirm_payment` để complete cash payment, hay giữ deferred?** (operator `pos:use`-only đang flip `paid`) | SEC-2(triage) — đóng privilege gap thật hoặc xác nhận chấp nhận | `payment-actions.ts:596` |
| 4 | **Density policy Admin: compact hay comfortable đồng nhất?** (dashboard đang lệch) | ADM-CONSIST-5 + C4 width/density lint | `dashboard/page.tsx:75` |
| 5 | **Settings sub-nav: promote vào office deep-nav (1 sidebar) hay giữ in-content tabs?** | ADM-SHELL-4 — bỏ idiom Tabs song song | `nav-config.ts:35-60` |
| 6 | **`supplier-invoices` width=full có cố ý không?** (align PO/GRN detail hay ghi exception) | INV-P-04 — width policy A1 hoàn tất | `supplier-invoices-client.tsx:689` |
| 7 | **Chốt 1 home shared-code** (`app/components` vs `app/_components`; `lib/` vs `app/lib` vs `app/_lib`) | ARCH-1 — bắt đầu migrate + lint | 364 import |
| 8 | **Chốt 1 rule đặt tên action** (`*-actions.ts` de-facto 48 file?) | ARCH-4 — lint nudge | 28 vs 48 |
| 9 | **`/inventory/waste` cần list page riêng hay redirect về `/issues`?** | INV-B8 | waste/ thiếu root |
| 10 | **HRM Đợt 3: xác nhận "bỏ Excel payroll"?** | WS7-1 (CSV export) + WS7-5 | reconciliation view đã có |
| 11 | **HRM IA: payroll lên nav? `/admin/staff→/hr` xong chưa? selfie check-in giữ/bỏ?** | WS7-6 | Task3/D048 |
| 12 | **F-018: GRN supplier 'Khác' — (A) bắt supplier formal / (B) path 'Mua ngoài'+note / (C) generic 'Khác'?** | WS7-7 | GRN bắt positive supplierId |
| 13 | **split-invoice / `record_partial_payment` (D031c) — còn muốn build?** | WS7-4 | PROD count=0, well-specced |

> **Ops-toggle owner bật được ngay (không cần code, mở khoá lớn):** reset `pg_stat`
> (PERF-1 triage → unblock unused-index wave) + `track_functions='all'` (PERF-2 triage →
> unblock dead-RPC wave); bật leaked-password + TOTP MFA (SEC-1/SEC-2); Auth conn
> percentage-based (DB-6); verify D047 preview billing (WS3-2); deploy print-agent (WS3-1);
> đăng ký UptimeRobot (WS3-3).

---

## 4. Lộ trình phân kỳ

### Phase 0 — NGAY (ngày, S-effort, rủi ro ~0, cầm máu)

**Mục tiêu:** đóng đường leo thang thật + cầm máu i18n/telemetry + vá regression nhỏ.
Toàn bộ S-effort, gần như không đụng business logic.

| Task | WS | id | Effort | Actor |
|------|----|----|--------|-------|
| Monotonicity guard i18n baseline | WS8 | I18N-04 | S | agent |
| `maxDuration=300` mọi cron route | WS3 | PERF-1 | S | agent |
| Speed Insights + Analytics | WS3 | PERF-2 | S | agent |
| Self-grant guard `cannot_self_grant` | WS1 | AUTHZ-1 | S | agent |
| `sellerName` ← `tenants.legal_name` (sau owner confirm #1) | WS5 | HC-01 | S | agent |
| Notif popup filter `tenant_id` | WS1 | RT-1 | S | agent |
| `import "server-only"` trong `spreadsheet.ts` | WS3 | PERF-7 | S | agent |
| Expiry redirect on null session | WS1 | INV-B4 | S | agent |
| Gate hr service-client sau `canManageEmployees` | WS1 | INV-A2 | S | agent |
| `REPLICA IDENTITY FULL` `order_status_history` | WS3 | RT-5 | S | agent+owner-apply |
| `update_pos_order_status` NULL-branch hardening | WS1 | RPC-1 | S | agent |
| UI-1 (hover motion) + UI-4 (formatVND) | WS4 | UI-1/UI-4 | S | agent |
| Dọn 6 stale + SCOPE-4/5 (no code) | WS7 | RC-1..6 | n/a | owner |
| **Owner/ops toggles**: leaked-password + TOTP MFA + Auth conn; reset `pg_stat` + `track_functions='all'` | WS1/WS2 | SEC-1/SEC-2/DB-6/PERF-1/PERF-2 | S | owner/ops |

**Thứ tự lý do:** đóng escalation surface trước (AUTHZ-1), rồi cầm máu i18n/telemetry
(guard không chặn ai), rồi vá legal (HC-01 sau confirm). Telemetry bật ngay vì **một
cycle (gồm month-end) phải tích lũy** trước khi drop index/RPC ở Phase 2.

### Phase 1 — NỀN MÓNG (sửa gốc, auto-resolve nhiều lá)

**Mục tiêu:** sửa root cause để hàng chục triệu chứng tự khỏi; dựng guardrail chống tái phát.

| Task | WS | id | Effort | Actor |
|------|----|----|--------|-------|
| **UI Phase A**: token + hợp nhất shell (`finance-shell`/`inventory-shell`→`ManagementShell`), xoá `mobile/*`, inventory width policy A1 | WS4 | SHELL-01/02/05/07, RC-3, UI-3 | M each | agent |
| Migrate 9 trang inventory → `loadAuthState()` | WS5 | SCOPE-3 | M | agent |
| i18n W0: tạo 4 destination slot | WS6 | I18N-W0 | M | agent |
| Widen eslint i18n (`.ts` + JSX-expr + prop allowlist + toast/throw) + re-baseline | WS8 | I18N-01/02/03/06 | M | agent |
| Advisor-diff CI gate | WS8 | SUP-1/SUP-WS8-1 | M | agent |
| Type-drift gate (local stack) | WS8 | SUP-5/SUP-WS8-2 | M | agent |
| SECURITY DEFINER scan + restore `security-definer-rpc-static.test.ts` | WS8 | SEC-3/SEC-WS8-1/WS8-1 | M | agent |
| HC-02 tax-code single-source; HC-03 waste cap column | WS5 | HC-02/HC-03 | M each | agent+owner-apply |

**Thứ tự lý do:** UI Phase A có **blast radius cao nhất** (sửa shell → 4 module ổn);
SCOPE-3 mở khoá class scope bug; W0 chặn mọi extraction wave; CI guard **chống tái phát
mọi finding khác** nên ưu tiên cao.

**Auto-resolve khi Phase 1 xong:**
- Xoá `mobile/*` → tự khỏi hand-rolled `<h1>` ở 4 file (UI-2, INV-08, INV-P-07, INV-S-05).
- SCOPE-3 → tự khỏi SCOPE-1 (`?? 0`) + SCOPE-2 (`?? "branch_manager"`).
- Inventory width A1 → tự khỏi RC-3 width-jump cả module (INV-06, INV-P-03/04, INV-S-03).
- `KpiCard` adoption (kéo vào A6) → tự khỏi missing `font-mono` (FIN-05, INV-15).

### Phase 2 — BURN-DOWN (khối lượng, song song theo module, INVENTORY TRƯỚC)

**Mục tiêu:** giải quyết khối lượng P2 lớn nhất; chạy song song theo module nhưng
**dồn inventory trước** (tâm chấn — mục 5).

| Task | WS | id | Effort | Actor |
|------|----|----|--------|-------|
| Unbounded-fetch elimination (inventory + hr/staff + printers) | WS2 | INV-B1/B2/B3/B5/B7/B9/B10/B11/B12, A3/A6 | S-M each | agent |
| Per-module `form/*` migration (UI Phase B) | WS4 | RC-1/RC-2 per module, FIN-01/08, HR-01/02/03, INV-05/P-01/S-01 | M-L each | agent |
| i18n extraction waves W1-W5 (re-baseline sau mỗi wave) | WS6 | I18N-INV/POS/CHROME | S-M-L | agent |
| Index rebalance (validate `hypopg`, **đừng chase advisor**) | WS2 | DB-2/DB-3, SUP-2, PERF-1/PERF-2 | M | agent+owner-apply |
| Realtime fanout RT-2/3/4 | WS2 | RT-2/RT-3/RT-4 | M each | agent |
| RLS hygiene DB-4/DB-5 | WS2 | DB-4/DB-5 | S-M | agent |
| Streaming + caching PERF-3/PERF-5; KDS waterfall SCREEN-1; POS seed SCREEN-3 | WS3/WS4 | PERF-3/5, SCREEN-1/3 | M each | agent |

**Thứ tự lý do:** fetch elimination không phụ thuộc gì → làm incrementally per route;
form/* migration cần primitive Phase A trước; index drop cần telemetry Phase 0 tích lũy
≥1 cycle.

**Auto-resolve:**
- Bordered-panel ratchet (Phase 3) + `KpiCard` adoption → khoá RC-2 long-tail không tái sinh.
- Re-baseline sau mỗi i18n wave → shrink grandfathered count < 341.

### Phase 3 — KHÓA & ĐÁNH BÓNG

**Mục tiêu:** bật lint rule **sau** burn-down (baseline khởi điểm gần 0); hợp nhất
convention; dọn P2/P3 còn lại.

| Task | WS | id | Effort | Actor |
|------|----|----|--------|-------|
| Bật UI enforcement C1-C4 (bordered-panel, bare-Input, STATUS-map, width/density) | WS8 | C1/C2/C3/C4, ADM-ENFORCE-* | M each | agent |
| Scope/i18n ban (`A2E-GUARD`) + reconcile stale allowlist | WS8 | A2E-GUARD, ADMIN-PG-05 | S | agent |
| Convention consolidation (sau owner #7/#8) | WS7 | ARCH-1/2/3/4/6/7 | S-L | agent+owner |
| Decompose POS client theo concern | WS3/WS7 | PERF-6/ARCH-5 | L | agent |
| Dọn P2/P3 còn lại + surface inventory cleanup | WS4/WS5 | INV-B6/B8, UI-5, polish tail | S each | agent |
| DB-1 logging contract per-shell | WS1 | DB-1 | L | agent |

**Thứ tự lý do:** lint rule phải bật SAU khi burn-down để CI không đỏ rực; convention
chờ owner chốt home; POS decompose sau Speed Insights (Phase 0) để đo INP thật.

---

## 5. Chiến lược Inventory-first

> **Một track dọc** xuyên qua inventory, chạm **UI + i18n + scope + fetch CÙNG LÚC**
> từng surface — vì inventory là tâm chấn của cả 4 loại nợ.

### Vì sao dồn sức ở inventory lời nhất

| Loại nợ | Inventory chiếm | Nếu sửa rời từng loại | Nếu sửa dọc theo surface |
|---------|-----------------|----------------------|--------------------------|
| UI drift | 4 width, ~67 card-clone, shell tự chế | 3 lượt mở cùng file ở 3 WS khác nhau | 1 lượt chạm/file |
| i18n | 75 file / 1,011 dòng | wave riêng, mở lại file đã sửa UI | extract khi đang mở file |
| scope | 9 trang `?? 0` | migration riêng | gộp vào lượt UI |
| fetch | B1/B2/B3/B5/B7/B9/B10/B11/B12 | route riêng | gộp khi đụng action file |

→ Mở **một** file inventory một lần và xử lý cả 4 concern giảm số lượt chạm, giảm
merge-conflict, và mỗi surface "sạch toàn diện" thay vì sạch-một-nửa nhiều lần.

### Thứ tự surface (theo traffic + blast radius)

1. **Shell/width foundation** (Phase 1): A1 width policy + xoá `mobile/*` + chart token
   → mọi surface inventory sau đó đứng trên nền ổn định.
2. **Procurement hot path** (PO/GRN/receiving): fetch B1/B2/B10 + form INV-P-01/02 +
   i18n W1 cùng lúc — đây là surface nhập liệu nặng nhất.
3. **Stock-ops** (issues/transfers/stocktake/waste): fetch B7/B9/B11/B12 + form INV-S-01/02 +
   scope SCOPE-3 (expiry/stocktake) + i18n.
4. **Dashboard/reports**: INV-02/03 `KpiCard`/`AppLinkCard` + chart + i18n W5 production cluster.
5. **Settings/expiry**: INV-01 chrome + SCOPE-3 + INV-B6 consumption redirect.

> **Lưu ý guard-prod-DB:** mọi thay đổi schema (HC-03 `shift_cap_vnd`, index drop,
> `cron_run_log`) đi đường **migration file → PR → owner apply** (không có dev target;
> `scripts/guard-prod-db.mjs` enforce). Validate index bằng `hypopg`+`index_advisor`
> trên local stack, KHÔNG drop blindly từ advisor.

---

## 6. Phân công & nhịp thực thi

### Agent tự làm được vs cần owner/ops

| Agent tự làm (đa số) | Cần owner quyết | Cần owner/ops apply/toggle |
|----------------------|-----------------|----------------------------|
| Mọi WS8 guard; UI Phase A/B; fetch elimination; i18n waves; SCOPE-3; HC-02/04/05/06/07/10; RPC hardening; ARCH-2/3/6/7; payroll CSV; CI hang root-cause | 13 cổng mục 3 (pháp danh, D028, D043, density, sub-nav, width, shared-home, action-name, waste list, HRM Đợt 3/IA, F-018, split-invoice) | leaked-password/MFA/Auth-conn (SEC-1/2/DB-6); reset `pg_stat`+`track_functions` (PERF-1/2); migration apply (DB-2/SUP-2/HC-03/RT-5/cron_run_log); print-agent deploy (WS3-1); D047 preview verify (WS3-2); UptimeRobot (WS3-3) |

### Cadence (nhịp)

1. **Mỗi PR = 1 concern.** Không gộp fetch + form + i18n trong cùng PR dù cùng file —
   review theo concern, dễ revert.
2. **Full gate trước merge:** `pnpm lint && pnpm test` (lint nuốt exit code nếu pipe —
   chạy trực tiếp). Executor self-check (tsc+ui-contract) **bỏ sót** eslint
   `i18n/no-inline-vietnamese` + `protected-route-module-coverage.test.ts` → lead phải chạy full gate.
3. **Migration → PR → owner apply.** Không daemon với env thật (máy dev `.env.local` trỏ PROD branch).
4. **Worktree riêng trên `main`**, commit explicit-pathspec, fetch+rebase trước push.
5. **Re-baseline i18n sau mỗi wave** (`pnpm lint:i18n:baseline`); count phải ≤ trước (guard I18N-04 enforce).
6. **Review/verify lane tách khỏi author lane:** `code-reviewer`/`verifier` cho pass duyệt, không self-approve.

---

## 7. Phụ lục — Traceability

> Mỗi task ↔ source finding id ↔ report. (R1=fullstack, R2=ui-admin, R3=ui-office,
> R4=context-i18n, R5=todo-triage)

| Task / nhóm | Finding id | Report |
|-------------|-----------|--------|
| Self-grant guard | AUTHZ-1 | R1 |
| hr service-client gate | INV-A2 | R1 |
| Expiry redirect | INV-B4 | R1 |
| Notif popup filter | RT-1 | R1 |
| `update_pos_order_status` NULL-branch | RPC-1 | R1 |
| Auth config (leaked-pw/MFA/conn) | SEC-1, SEC-2, SUP-7, DB-6, RPC-5 | R1 |
| RPC/RLS hygiene | RPC-2/3/4, SEC-4/5, AUTHZ-2/3/4, DB-4/5 | R1 |
| Unbounded fetch | INV-B1/B2/B3/B5/B7/B9/B10/B11/B12, INV-A3/A6 | R1 |
| Index rebalance | DB-2/DB-3, SUP-2, DB-1, PERF-1(triage), PERF-2(triage) | R1, R5 |
| Realtime fanout | RT-2/RT-3/RT-4/RT-5/RT-6 | R1 |
| maxDuration / Insights / streaming / cache / decompose | PERF-1/2/3/4/5/6/7/8 | R1 |
| Platform supabase (advisor/cron/types/print-agent) | SUP-1/3/4/5/6 | R1 |
| KDS/POS screen | SCREEN-1..8 | R1 |
| RC-1 field idiom | RC-1, F1, F2, ADM-CONSIST-2, FIN-01/08, HR-01/02/03, INV-05/P-01/S-01, F-01/02/03 | R2, R3 |
| RC-2 card-in-card | RC-2, F3/4/5, INV-02/03/P-02/S-02, FIN-02, HR-04/05, F-04/12/13 | R2, R3 |
| RC-3 width/nav | RC-3, ADM-CONSIST-1, SHELL-01, INV-06/P-03/P-04/S-03, FIN-03, HR-06 | R2, R3 |
| RC-4 gap/margin | RC-4, F4, ADM-CONSIST/PG-02, HR-07/12, INV-P-05/S-04, F-05/06/14/15 | R2, R3 |
| Shell consolidation | SHELL-02/03/05/06/07/08, ADM-SHELL-2/3/4/5 | R2, R3 |
| Chart tokens | UI-3, INV-04/S-07, FIN-07 | R1, R3 |
| KpiCard consolidation | INV-02/P-12/S-09/S-12, FIN-02/06/09, HR-10, INV-15, FIN-05 | R3 |
| Motion/format regression | UI-1, UI-4, UI-5 | R1 |
| Tokens hygiene | TG-1, TG-2, F6 | R2, R3 |
| HĐĐт config | HC-01, HC-02, HC-05 | R4 |
| Waste cap / constants | HC-03, HC-04, HC-06, HC-07, HC-10 | R4 |
| Scope migration | SCOPE-1/2/3, SCOPE-4/5(stale) | R4 |
| Context routes | INV-A1(stale)/A4/A5/A7/A8, INV-B6/B8, SCREEN-6 | R1, R3 |
| i18n guards | I18N-01/02/03/04/05/06 | R4 |
| i18n waves | I18N-W0/INV/POS/CHROME/GROW | R4 |
| Advisor/type/secdef CI | SUP-1/SUP-5, SEC-3, SEC-WS8-1, SUP-WS8-1/2, WS8-1 | R1, R5 |
| UI lint ratchets | ADM-ENFORCE-3/4/6/7, INV-P-14, F-10/16, UI-WS8-1, ADMIN-PG-05 | R2, R3 |
| Convention | ARCH-1/2/3/4/5/6/7 | R1 |
| Backlog agent-doable | WS7-1/2, WS3-4, SEC-1(triage), SEC-3 | R5 |
| Backlog ops | WS3-1/3, PERF-1/2(triage), PERF-8 | R5 |
| Stale closed | RC-1..RC-6, SCOPE-4/5, **INV-A1 (fixed commit `2d3291b3`)** | R5, R4, R1 |
| Owner decisions | WS5-1, SEC-2(triage/D043), WS7-3/4/5/6/7/8, WS3-2, ADM-SHELL-4, ADM-CONSIST-5, INV-P-04, ARCH-1/4, INV-B8 | all |
