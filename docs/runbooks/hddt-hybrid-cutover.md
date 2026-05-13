# HĐĐT Hybrid Cutover Runbook

> **Reference plan**: `docs/plan/hddt-hybrid-misa.md`
> **PR sequence**: PR-1 schema → PR-2 RPCs → PR-3 B2B refactor → PR-4 cron + actions → PR-5 admin UI → **PR-6 cutover (this)** → PR-7 regression rules
> **Owner**: ngocnghia128@gmail.com

## Preconditions (owner action items)

Trước khi flip flag, owner phải hoàn thành:

- [ ] **Đăng ký template HĐĐT với CQT qua MISA / Viettel Sinvoice portal**
  - MISA: `templateCode` + `invoiceSeries` (vd `01GTKT0/001` + `1C25TLL`)
  - Sinvoice: `templateCode` + `invoiceSeries` đăng ký riêng theo Sinvoice format
  - Leadtime: 3-7 ngày làm việc
  - **Pháp lý cần**: 1 template cho B2B realtime + 1 template cho HĐ tổng hợp B2C (TT 78/2021 §11.4)
- [ ] **Có account Sinvoice / MISA chính thức** với chứng thư số (CKS) phù hợp:
  - **Server cert**: account dùng cho gọi API tự động (cron + realtime)
  - **USB-Token / Cloud CA**: KHÔNG hỗ trợ trên test account; chốt loại CKS với BU khi mở account prod
- [ ] **Apply migrations** lên production DB (dev đã apply qua MCP):
  - `20260508053555_hddt_summary_schema.sql`
  - `20260508055046_hddt_summary_rpcs.sql`
  - `20260508055230_hddt_aggregate_rpc_fixes.sql`
  - File → PR → owner apply manually (CLAUDE.md prod migration policy)

## Environment variables

Set trong Vercel project settings (Settings → Environment Variables → Production).

### Common (cả MISA và Sinvoice)

```env
COMPANY_TAX_CODE=0100109106-899        # MST seller (= account login MST)
HDDT_DAILY_SUMMARY_ENABLED=true        # default false; flip true khi sẵn sàng (kill-switch cho cron + manual)
INVOICE_PROVIDER=viettel               # default từ 2026-05-13 (Viettel primary); set "misa" để dùng MISA
CRON_SECRET=<32+ char random>          # Bearer cho /api/cron/* — đã có sẵn theo feedback cron
```

> ⚠️ **`HDDT_STATE_MACHINE_ENABLED` không tồn tại trong code.** Plan ban đầu dự kiến có toggle nhưng thực tế ship state machine direct (xem `apps/web/app/finance/actions.ts:58-446`). Nếu cần rollback B2B refactor (PR-3) — revert commit + redeploy. Chỉ `HDDT_DAILY_SUMMARY_ENABLED` còn vai trò kill-switch cho B2C batch path.

> **Provider switch logic:** `apps/web/lib/invoice-provider-init.ts:22-55` đọc `INVOICE_PROVIDER` env tại boot, register đúng 1 singleton (MISA hoặc Sinvoice). Đổi env → cần redeploy hoặc edge function reload.

### Provider = `misa`

```env
INVOICE_PROVIDER=misa
MISA_API_KEY=<API key từ MISA portal>
MISA_API_BASE_URL=https://api.meinvoice.vn/api/v1   # prod (default)
# MISA_SANDBOX=true cho testapi.meinvoice.vn
```

### Provider = `viettel`

```env
INVOICE_PROVIDER=viettel
SINVOICE_USERNAME=<account_mst>        # vd: 0100109106-899
SINVOICE_PASSWORD=<api_password>
SINVOICE_TEMPLATE_CODE=2/001           # đăng ký với CQT (2/001 = HĐ bán hàng từ MTT cho F&B; 1/001 nếu cần HĐ GTGT B2B)
SINVOICE_INVOICE_SERIES=C26MAA         # đăng ký với CQT (Viettel cấp khi tạo account)
SINVOICE_BASE_URL=https://api-vinvoice.viettel.vn  # default; cùng URL test+prod
# SINVOICE_SANDBOX=true                # informational; URL không đổi
```

### Sinvoice test accounts (HDSD §I)

Cho smoke test trước cutover prod:
```
TK: 0100109106-501  /  504  /  505  /  507  /  899  → kiểm tra dữ liệu đầu vào
TK: 0100109106-509                                    → KHÔNG kiểm tra
MK chung: 2wsxCDE#
```

## Cutover sequence

Khuyến nghị chạy trên một sandbox VN cuối tuần (Sat sáng) trước khi prod thật.

### Bước 1 — Sandbox smoke (chi nhánh test, 1 ngày)

```bash
# 1. Set env Vercel preview environment
INVOICE_PROVIDER=viettel
SINVOICE_USERNAME=0100109106-509     # account "không kiểm tra" để test rộng
SINVOICE_PASSWORD=2wsxCDE#
SINVOICE_TEMPLATE_CODE=<test template>
SINVOICE_INVOICE_SERIES=<test series>
COMPANY_TAX_CODE=0100109106-509
HDDT_DAILY_SUMMARY_ENABLED=true

# 2. Trigger cron thủ công bằng curl với Bearer secret
curl -X POST https://<preview>.vercel.app/api/cron/hddt-daily-summary \
  -H "Authorization: Bearer $CRON_SECRET"

# 3. Expected response (ví dụ tenant 1 chi nhánh):
# {
#   "ok": true,
#   "summary_date": "2026-05-07",
#   "branches_processed": 1,
#   "issued": 0,           # nếu chưa có CQT code thì 0
#   "submitted": 1,        # invoiceNo trả về nhưng chờ CQT
#   "skipped": 0,
#   "failed": 0
# }
```

### Bước 2 — Verify queue + tax_invoices state

```sql
-- Kiểm tra queue row
SELECT id, branch_id, summary_date, status, trigger_source, last_error,
       tax_invoice_id, started_at, finished_at
FROM summary_run_queue
ORDER BY created_at DESC
LIMIT 5;

-- Expected: 1 row trigger_source='cron', triggered_by NULL,
--           status='issued' hoặc 'skipped' (nếu hôm trước không có order),
--           last_error NULL (success) hoặc reason ('no_eligible_orders'/'already_exists')

-- Kiểm tra tax_invoices kind='daily_summary'
SELECT id, branch_id, summary_date, status, summary_orders_count,
       subtotal, vat_rate, vat_amount, total_amount,
       provider, provider_ref, invoice_number, signing_started_at, issued_at
FROM tax_invoices
WHERE invoice_kind = 'daily_summary'
ORDER BY created_at DESC
LIMIT 5;

-- Expected: status IN ('submitted','issued') với provider='viettel',
-- invoice_number set, provider_ref = transactionUuid 32-char "HDDT...".

-- Kiểm tra junction
SELECT tax_invoice_id, COUNT(*) AS order_count, SUM(line_subtotal) AS total_net
FROM tax_invoice_orders
WHERE tax_invoice_id = (SELECT id FROM tax_invoices WHERE invoice_kind='daily_summary' ORDER BY id DESC LIMIT 1)
GROUP BY tax_invoice_id;

-- Expected: order_count khớp summary_orders_count;
-- total_net khớp tax_invoices.subtotal ±1₫ tolerance.

-- Kiểm tra audit events
SELECT tax_invoice_id, from_status, to_status, actor_id, payload, created_at
FROM tax_invoice_events
WHERE tax_invoice_id = (SELECT id FROM tax_invoices WHERE invoice_kind='daily_summary' ORDER BY id DESC LIMIT 1)
ORDER BY created_at;

-- Expected: chuỗi draft → signing → issued (3 events) hoặc draft → signing → submitted (2 events nếu CQT async).
-- actor_id NULL (trigger_source='cron' system actor).
```

### Bước 3 — Manual retry test

Vào `/finance/summary` (cần permission `settings:tenant`):
1. Chọn chi nhánh + date
2. Click "Chạy tổng hợp"
3. Expect toast "Đã bỏ qua: HĐ tổng hợp đã tồn tại" (UNIQUE chặn duplicate)

> **ACL note:** Route `/finance/summary` KHÔNG có entry trong `packages/shared/src/auth/module-acl.ts:89-93` (module `finance` chỉ list path `/finance` cho roles `owner`/`super_manager`). Cashier/branch_manager có thể thấy nav nhưng action `runDailySummaryForBranch` (`apps/web/app/finance/summary-invoice-actions.ts`) sẽ reject vì gate `settings:tenant` ở action level. Nếu cần hard-block tại route level → thêm entry `/finance/summary` vào `module-acl.ts` (defer đến formal admin panel restructure).

Hoặc cancel HĐ tổng hợp đã issued rồi retry:
```sql
SELECT public.transition_tax_invoice_state_as_system(
  <invoice_id>, 'cancelled', NULL, '{"cancel_reason":"smoke test"}'::jsonb,
  'cancel rồi tạo lại để verify retry path'
);
```
Sau đó UI "Chạy tổng hợp" lần 2 → expect HĐ mới issued.

### Bước 4 — Production cutover

Sau khi sandbox smoke 1-3 ngày green:

1. Set env Vercel production (Settings → Environment Variables → Production):
   - `INVOICE_PROVIDER=viettel` (hoặc `misa`)
   - Provider creds prod (KHÔNG dùng test account)
   - `HDDT_DAILY_SUMMARY_ENABLED=true`
2. Deploy main branch (cron entry trong `vercel.json` đã sẵn từ PR-6)
3. Cron sẽ tự chạy 02:05 ICT đêm hôm sau (`schedule: "5 19 * * *"` UTC)
4. Sáng hôm sau: kiểm tra `/finance/summary` queue có row `trigger_source='cron'` `status='issued'`

## Rollback

### Tier 1 — Disable B2C batch (nhẹ nhất)

Cron fail liên tục hoặc provider reject 100% trên path B2C summary:

```env
HDDT_DAILY_SUMMARY_ENABLED=false      # cron + manual đều return { skipped: "feature_flag_off" }
```

Redeploy hoặc Vercel env reload. B2B realtime path KHÔNG ảnh hưởng. Existing summary HĐ đã insert vẫn còn — không phá data.

### Tier 2 — Đổi provider

Nếu MISA fail nhưng Sinvoice OK (hoặc ngược lại):

```env
INVOICE_PROVIDER=viettel    # hoặc "misa"
# + set creds tương ứng (xem §Environment variables)
```

### Tier 3 — Revert B2B refactor (nặng nhất)

`HDDT_STATE_MACHINE_ENABLED` không tồn tại — phải revert commit PR-3 (`apps/web/app/finance/actions.ts:58-446`) + redeploy. Pre-PR-3 logic insert direct `status='issued'` không qua state machine. Cẩn thận: data đã insert qua state machine có `tax_invoice_events` rows — revert code không làm sạch events table, sẽ orphan.

Nếu cần rollback DB: cancel các HĐ tổng hợp issued sai qua `cancelTaxInvoice` action hoặc `transition_tax_invoice_state_as_system(.., 'cancelled', ..)`. Junction rows preserve theo regression rule HDDT-SUMMARY-CANCEL-PRESERVES-JUNCTION.

## Pilot launch gate — 7 ngày metrics

Theo dõi qua `/finance/summary` queue + Supabase logs:

| Metric | Target | SQL |
|---|---|---|
| % HĐ tổng hợp issued auto qua cron | ≥ 95% | `SELECT 100.0 * COUNT(*) FILTER (WHERE status='issued') / COUNT(*) FROM summary_run_queue WHERE trigger_source='cron' AND created_at > now()-interval '7 days';` |
| % manual retry sau cron fail | ≤ 5% | `SELECT 100.0 * COUNT(*) FILTER (WHERE trigger_source='manual') / COUNT(*) FROM summary_run_queue WHERE created_at > now()-interval '7 days';` |
| Avg cron run time | < 45s cho ≤ 3 chi nhánh | `SELECT avg(extract(epoch from finished_at - started_at)) FROM summary_run_queue WHERE trigger_source='cron' AND status IN ('issued','skipped');` |
| Orphan `signing` qua đêm | 0 rows | `SELECT count(*) FROM tax_invoices WHERE status='signing' AND signing_started_at < now()-interval '12 hours';` |
| Cross-day misalignment | 0 rows | `SELECT count(*) FROM tax_invoice_orders tio JOIN tax_invoices ti ON ti.id=tio.tax_invoice_id JOIN payments p ON p.order_id=tio.order_id WHERE ti.invoice_kind='daily_summary' AND p.status='completed' AND (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <> ti.summary_date;` |
| Double-issued HĐ (B2B + summary cùng order) | 0 rows | `SELECT order_id, count(*) FROM (SELECT order_id FROM tax_invoices WHERE invoice_kind='per_order' AND status IN ('submitted','issued') UNION ALL SELECT order_id FROM tax_invoice_orders tio JOIN tax_invoices ti ON ti.id=tio.tax_invoice_id WHERE ti.status NOT IN ('cancelled','replaced')) sub GROUP BY 1 HAVING count(*) > 1;` |

3-day red trên bất kỳ metric → halt cron (`HDDT_DAILY_SUMMARY_ENABLED=false`), switch admin-manual-only, log issue + investigate.

## Common Sinvoice errors (per HDSD doc v1)

Nếu queue row có `last_error` chứa các code dưới, tham chiếu cách xử lý:

| Code | Vấn đề | Action |
|---|---|---|
| `1517` Invoice serial inactive | Mẫu HĐ chưa kích hoạt | Kiểm tra thông báo phát hành đã đăng ký + active chưa |
| `1521`/`47` `INVOICE_NO_DUPLICATED` | Số HĐ trùng | Hệ thống lock UNIQUE — bình thường, retry sau 1 phút |
| `1520` Invalid supplier tax code | MST không khớp | Check `COMPANY_TAX_CODE` env có khớp account login |
| `OUT_OF_INVOICE_NO` | Hết số HĐ trong dải | Đăng ký dải mới với CQT (vd thêm `AB/21E` cạnh `AA/21E`) |
| `INVALID_USER_PASSWORD` / `USERNAME_NOT_FOUND` | Sai cred | Kiểm tra `SINVOICE_USERNAME` / `SINVOICE_PASSWORD` |
| `429` Too Many Requests | Rate limit | Cron retry next-cycle automatic |
| `503` Service Unavailable | Sinvoice maintenance | Đợi BU thông báo bảo trì xong |
| `TRANSACTION_IS_BEING_PROCESSED` | UUID đang xử lý | Thường gặp khi retry quá nhanh — đợi 1 phút |
| `INVALID_TRANSACTION_UUID` / `LENGTH_TRANSACTION_UUID` | UUID format sai | Code lỗi — báo dev fix `buildSinvoiceTransactionUuid` |

## Reference

- `docs/plan/hddt-hybrid-misa.md` — full plan + decisions D1-D7 (đã shipped)
- `docs/ref/einvoice-tax.md` — pháp lý + nghĩa vụ thuế (canonical reference, post-pilot)
- `apps/web/lib/hddt-daily-summary.ts:67+` — shared `executeSummaryRun(deps)` helper
- `apps/web/app/api/cron/hddt-daily-summary/route.ts` — cron handler
- `apps/web/app/finance/summary-invoice-actions.ts:45+` — admin server actions
- `apps/web/app/finance/summary/page.tsx` — admin UI page
- `apps/web/lib/invoice-provider-init.ts:22-55` — provider singleton init
- `packages/shared/src/providers/invoice.ts:48-93` — `InvoiceProvider` interface + `InvoiceResult`
- `packages/shared/src/providers/impl/viettel-sinvoice.ts:115-426` — Sinvoice impl + `buildSinvoiceTransactionUuid`
- `packages/shared/src/providers/impl/misa.ts:47-234` — MISA impl
- `packages/shared/src/auth/module-acl.ts:89-93` — `finance` module ACL (note `/finance/summary` gate ở action level)
- `tasks/regressions.md` — 16 named rules `HDDT-*` + `POS-HDDT-*`

### Migration files đã apply

```
20260425035346_tax_invoice_state_machine.sql
20260502000000_pos_hddt_not_required_d4.sql      ← deprecated bởi D2 (xem plan)
20260508053555_hddt_summary_schema.sql           ← PR-1
20260508055046_hddt_summary_rpcs.sql             ← PR-2
20260508055230_hddt_aggregate_rpc_fixes.sql      ← PR-2 hot-fix (bucket + advisory lock)
20260527020000_finance_dashboard_summary_rpc.sql ← dashboard /finance counters
```

---

## Reconcile cron (Path B, audit 2026-05-13)

Separate cron route giải quyết hóa đơn kẹt `signing` hoặc `submitted` — Viettel S-Invoice trả `invoiceNo` sync nhưng CQT code đến async; reconcile poll `getStatus` để chuyển `submitted → issued` khi CQT cấp số, hoặc `signing → cancelled` khi quá hạn 24h.

### Env vars (thêm)

```env
HDDT_RECONCILE_ENABLED=true        # default false; kill-switch riêng cho cron + manual force-resync
```

### Vercel cron schedule

```json
{
  "crons": [
    { "path": "/api/cron/hddt-reconcile", "schedule": "*/5 * * * *" }
  ]
}
```

Schedule 5 phút/lần. Vercel Pro 300s function timeout đủ cho ≤ 5 chi nhánh × 25 rows × ~2s `getStatus` = 250s (per `RECONCILE_CRON_BUDGET_MS = 240_000` budget timer trong helper).

### Smoke test sequence

```bash
# 1. Seed: tạo HĐ B2B với MST, để Sinvoice trả 'submitted' (chờ CQT)
#    (đã có flow này sẵn qua POS bill flow)

# 2. Trigger cron manually
curl -X POST https://<preview>.vercel.app/api/cron/hddt-reconcile \
  -H "Authorization: Bearer $CRON_SECRET"

# 3. Expected response shape
# {
#   "ok": true,
#   "elapsed_ms": 1234,
#   "totals": {
#     "branches_processed": 3,
#     "candidates": 5,
#     "transitioned": 4,
#     "no_change": 1,
#     "race_lost": 0,
#     "provider_error": 0,
#     "unknown_status": 0,
#     "giveup_24h": 0,
#     "budget_exceeded": false
#   },
#   "branches": [{ "branchId": 1, ... }, ...]
# }
```

### Verify via SQL

```sql
-- Audit trail per attempt
SELECT id, tax_invoice_id, before_status, after_status, outcome, provider_returned,
       attempt_age_seconds, error, created_at
FROM reconcile_run_log
WHERE created_at > now() - interval '15 min'
ORDER BY created_at DESC;

-- Stuck rows that reconcile is targeting
SELECT id, branch_id, status, invoice_kind, signing_started_at,
       extract(epoch from now() - signing_started_at) AS age_seconds
FROM tax_invoices
WHERE status IN ('signing','submitted')
  AND provider_ref IS NOT NULL
  AND signing_started_at < now() - interval '60 seconds'
ORDER BY signing_started_at ASC;
```

### Manual force-resync (per-invoice)

UI: `/finance/invoices` → row có status `Đang ký` hoặc `Chờ CQT` → nút "Đồng bộ lại". Server action `forceResyncTaxInvoice(invoiceId)` gate trên `settings:tenant` (owner/super_manager only) — siết hơn `finance:view` vì có thể trigger state transition.

### Rollback ladder

| Tier | Trigger | Action |
|---|---|---|
| Tier 0 | Cron mass-fail trên provider_error | `HDDT_RECONCILE_ENABLED=false` → redeploy; B2B realtime + B2C summary KHÔNG ảnh hưởng |
| Tier 1 | Bug ở mapping `pickReconcileDecision` | Revert commit của `packages/shared/src/hddt/reconcile-state.ts` (pure function) → redeploy |
| Tier 2 | Reconcile transition sai gây hỏng state | `transition_tax_invoice_state_as_system(.., 'draft', ..)` bằng tay; events table giữ audit |

### Pilot launch gate — bổ sung metrics cho reconcile

| Metric | Target | SQL |
|---|---|---|
| % reconcile outcomes là `transitioned` | ≥ 70% trong 7 ngày | `SELECT 100.0 * COUNT(*) FILTER (WHERE outcome='transitioned') / COUNT(*) FROM reconcile_run_log WHERE trigger_source='cron' AND created_at > now()-interval '7 days';` |
| Reconcile `provider_error` rate | ≤ 10% | `SELECT 100.0 * COUNT(*) FILTER (WHERE outcome='provider_error') / COUNT(*) FROM reconcile_run_log WHERE created_at > now()-interval '7 days';` |
| `giveup_24h` count | < 5 / tuần | `SELECT count(*) FROM reconcile_run_log WHERE outcome='giveup_24h' AND created_at > now()-interval '7 days';` |
| `race_lost` count | < 3 / tuần (lành tính — cashier race) | same shape |
| Stuck > 24h chưa được pick up | 0 rows | `SELECT count(*) FROM tax_invoices WHERE status IN ('signing','submitted') AND signing_started_at < now()-interval '24 hours' AND provider_ref IS NOT NULL;` |

`giveup_24h` > 5 / tuần → có thể là Sinvoice xuống cấp hoặc creds sai; halt + investigate trước khi tiếp tục.

---

## PDF/XML archive cron (Path D, audit 2026-05-13)

Yêu cầu pháp lý: TT78/2021 §10 + NĐ70/2025 yêu cầu lưu trữ HĐĐT (PDF đã ký + XML) trong 10 năm để phục vụ thanh tra thuế. Hệ thống cron tải về từ Viettel `getInvoiceRepresentationFile`, verify magic byte + SHA-256, upload vào Supabase Storage `hddt-archive` (private bucket), lưu storage path + hash vào `tax_invoices`.

### Env vars (thêm)

```env
HDDT_ARCHIVE_ENABLED=true        # default false; kill-switch riêng cho cron + manual force-archive + backfill
```

### Vercel cron schedule

```json
{
  "crons": [
    { "path": "/api/cron/hddt-archive", "schedule": "*/15 * * * *" }
  ]
}
```

Schedule 15 phút/lần. Viettel HDSD §III.7 lưu ý "request lấy file hóa đơn nên được thực hiện sau từ 2-5 giây sau khi phát hành" — 15 min thừa thoải mái, không race với realtime call.

### Smoke test sequence

```bash
# 1. Seed: cần ít nhất 1 invoice với status='issued' (qua Path B reconcile từ
#    submitted → issued, hoặc B2B realtime path nếu provider trả issued sync).

# 2. Trigger archive cron manually
curl -X POST https://<preview>.vercel.app/api/cron/hddt-archive \
  -H "Authorization: Bearer $CRON_SECRET"

# 3. Expected response shape
# {
#   "ok": true,
#   "elapsed_ms": 2345,
#   "totals": {
#     "branches_processed": 3,
#     "candidates": 5,
#     "archived": 4,
#     "provider_error": 0,
#     "storage_error": 0,
#     "invalid_payload": 0,
#     "hash_mismatch": 0,
#     "giveup": 0,
#     "no_change": 1,
#     "budget_exceeded": false
#   },
#   "branches": [{ "branchId": 1, ... }, ...]
# }
```

### Verify via SQL + Storage

```sql
-- Audit per-attempt
SELECT id, tax_invoice_id, outcome, attempt_number, pdf_bytes, xml_bytes,
       pdf_sha256, xml_sha256, error, created_at
FROM archive_run_log
WHERE created_at > now() - interval '30 min'
ORDER BY created_at DESC;

-- Rows ready for archive (cron candidate set)
SELECT id, branch_id, invoice_number, archive_attempts, issued_at
FROM tax_invoices
WHERE status = 'issued'
  AND pdf_url IS NULL
  AND archive_attempts < 5
ORDER BY issued_at ASC
LIMIT 25;

-- Successfully archived
SELECT id, pdf_url, xml_url, pdf_sha256, xml_sha256, archived_at
FROM tax_invoices
WHERE archived_at IS NOT NULL
ORDER BY archived_at DESC
LIMIT 10;
```

```bash
# Verify Storage object exists (psql từ admin)
SELECT name, metadata->>'size' AS size_bytes,
       metadata->>'mimetype' AS mime
FROM storage.objects
WHERE bucket_id = 'hddt-archive'
ORDER BY created_at DESC
LIMIT 10;
```

### Manual force-archive (per-invoice)

UI: `/finance/invoices` → row có `Đã lưu trữ` badge xuất hiện sau khi archive xong; row chưa archived hiển thị `Đồng bộ lại` từ Path B. Server action `forceArchiveTaxInvoice(invoiceId)` gate trên `settings:tenant`.

### Backfill cho rows pre-shipping

Owner action sau cutover archive: gọi `backfillArchiveByDateRange(branchId?, startDate, endDate)`:
- Quét tối đa 500 rows/lần với budget 60s
- Gate `settings:tenant` (owner/super_manager)
- Outcome counters trả về để theo dõi
- Idempotent: rows đã `archived_at` được skip tự động qua candidate filter

Example: backfill 1 tuần đầu pilot trên tenant pilot
```sql
-- Đếm trước
SELECT count(*) FROM tax_invoices
WHERE status='issued' AND pdf_url IS NULL
  AND issued_at BETWEEN '2026-05-08' AND '2026-05-13';
```

Sau đó gọi backfill từ admin UI (action `backfillArchiveByDateRange` chạy qua provider thật → khi quota OK chia nhỏ batch sau).

### Rollback ladder

| Tier | Trigger | Action |
|---|---|---|
| Tier 0 | Cron mass-fail trên provider_error / storage_error | `HDDT_ARCHIVE_ENABLED=false` → redeploy; reconcile + daily-summary + B2B realtime KHÔNG ảnh hưởng (archive độc lập) |
| Tier 1 | Sai logic SHA-256 hoặc magic byte | Revert commit của `packages/shared/src/hddt/archive-state.ts` → redeploy |
| Tier 2 | Bucket bị set public sai trong migration | Update RLS: `UPDATE storage.buckets SET public=false WHERE id='hddt-archive'`; xoá `getPublicUrl` calls nếu có |
| Tier 3 | Hash mismatch hàng loạt = data tampering | KHÔNG xoá file Storage; alert owner; isolated investigation từ `archive_run_log.outcome='hash_mismatch'` |

### Pilot launch gate — bổ sung metrics cho archive

| Metric | Target | SQL |
|---|---|---|
| % archive cron outcomes là `archived` | ≥ 90% trong 7 ngày | `SELECT 100.0 * COUNT(*) FILTER (WHERE outcome='archived') / COUNT(*) FROM archive_run_log WHERE trigger_source='cron' AND created_at > now()-interval '7 days';` |
| Provider_error rate | ≤ 5% | tương tự với `outcome='provider_error'` |
| Storage_error rate | 0 | `SELECT count(*) FROM archive_run_log WHERE outcome='storage_error' AND created_at > now()-interval '7 days';` |
| Invalid_payload count | 0 (= magic byte hoặc size sai) | `SELECT count(*) FROM archive_run_log WHERE outcome='invalid_payload';` |
| Hash_mismatch count | 0 (= corruption alert nếu > 0) | `SELECT count(*) FROM archive_run_log WHERE outcome='hash_mismatch';` |
| Giveup count | < 3 / tuần | `SELECT count(*) FROM archive_run_log WHERE outcome='giveup';` |
| Issued rows chưa archive sau 1h | 0 | `SELECT count(*) FROM tax_invoices WHERE status='issued' AND pdf_url IS NULL AND issued_at < now()-interval '1 hour';` |
| Storage volume tăng đều mỗi tuần | ~10 MB / 5 branches / tuần (pilot) | `SELECT count(*), sum((metadata->>'size')::bigint) FROM storage.objects WHERE bucket_id='hddt-archive';` |

`hash_mismatch` > 0 → halt + ops investigation NGAY (suspect corruption hoặc Viettel re-issued same number with different bytes).

---

## Replace flow (Path C, audit 2026-05-13)

Yêu cầu pháp lý: TT78/2021 §7 + NĐ70/2025 — thay thế hóa đơn khi có sai sót (sai MST, tên người mua, địa chỉ). Provider gọi cùng `createInvoice` endpoint với `adjustmentType=3` + original refs.

### Workflow

1. Owner/super_manager mở `/finance/invoices`, row có `status='issued'` hiển thị nút "Thay thế"
2. Modal nhập: Lý do (≥20 chars), Văn bản thỏa thuận, Ngày văn bản, Tên/MST/Địa chỉ người mua đã sửa
3. Server action `replaceTaxInvoice`:
   - Gọi RPC `replace_tax_invoice` (atomic): OLD `issued→replaced`, INSERT NEW draft, link `replaced_by/replaced_for`, audit events
   - Transition NEW: `draft → signing`
   - Gọi Viettel với `adjustmentType=3` + original refs
   - Transition NEW: `signing → issued|submitted|draft`
4. UI hiển thị HĐ thay thế mới với số HĐ mới (Viettel cấp incremental, vd C26MAA00000124)

### MVP constraints

- B2B per_order only (B2C summary replace deferred to v2 — junction copy logic chưa rõ)
- REPLACE only (adjustmentType=3); ADJUST (5) deferred
- Permission `settings:tenant` (owner/super_manager)
- Chain depth ≤ 3 (replace-of-replace-of-replace OK, sâu hơn reject)

### Smoke test

```sql
-- Pre-flight: pick an issued B2B invoice
SELECT id, invoice_number, status, buyer_tax_code, total_amount
FROM tax_invoices
WHERE status='issued' AND invoice_kind='per_order' AND replaced_by IS NULL
ORDER BY issued_at DESC LIMIT 5;
```

UI: click "Thay thế" → nhập form → "Tạo HĐ thay thế". Expected: 1 toast success với new invoice number; row cũ flip thành "Đã thay thế"; row mới xuất hiện trên list với buyer info đã sửa.

```sql
-- Post-flight verify
SELECT
  o.id AS old_id, o.status AS old_status, o.invoice_number AS old_num, o.replaced_by,
  n.id AS new_id, n.status AS new_status, n.invoice_number AS new_num, n.replaced_for
FROM tax_invoices o
JOIN tax_invoices n ON n.id = o.replaced_by
WHERE o.id = <old_id>;
-- Expected: old.status='replaced', old.replaced_by=new.id, new.replaced_for=old.id
-- new.status='issued' or 'submitted'

-- Audit events
SELECT tax_invoice_id, from_status, to_status, note, actor_id, created_at
FROM tax_invoice_events
WHERE tax_invoice_id IN (<old_id>, <new_id>)
ORDER BY created_at;
-- Expected: 2 rows on old (issued→replaced); 2+ rows on new (NULL→draft, draft→signing, signing→...)
```

### Rollback

| Tier | Trigger | Action |
|---|---|---|
| Tier 0 | Replace mass-fail từ Viettel | Owner ngừng dùng nút "Thay thế"; B2B realtime + B2C summary + reconcile + archive KHÔNG ảnh hưởng |
| Tier 1 | Bug ở `replace_tax_invoice` RPC | Revert migration `20260517020000`; existing replaced pairs unaffected |
| Tier 2 | Wrong replacement issued, cần undo | KHÔNG có flow auto-undo. Manual: gọi `cancelTaxInvoice(new_id, reason)` để hủy NEW; OLD vẫn ở `replaced`. Nếu cần phục hồi OLD, cần thay thế chuỗi: replace(NEW) với buyer info của OLD — tạo C nối B nối A |

### Pilot metrics

| Metric | Target | SQL |
|---|---|---|
| Replace volume | < 5 / tháng | `SELECT count(*) FROM tax_invoice_events WHERE to_status='replaced' AND created_at > now()-interval '30 days';` |
| Replace success rate (NEW issued thành công) | ≥ 95% | tỷ lệ NEW status='issued'/'submitted' sau replace |
| Chain depth distribution | mostly 1-2; alert ≥ 3 | `SELECT count(*) FROM tax_invoices WHERE replaced_for IS NOT NULL GROUP BY (SELECT count(*) FROM ...)` (manual query) |
| Replacement archived trong 1 ngày | 100% | join tax_invoices.archived_at vs issued_at |

`replace_failed` rate > 5% → halt + investigation (Viettel có thể reject vì biên bản format sai hoặc bị limit số HĐ trong series).

---

> **Last updated**: 2026-05-13 (Path C replace flow added; archive scope expanded to include replaced + cancelled)
> **Next**: Owner action items — đăng ký template với CQT, mở account provider prod, set env Vercel production (cả 3 flag `HDDT_{DAILY_SUMMARY,RECONCILE,ARCHIVE}_ENABLED=true`), run sandbox smoke 1-3 ngày, monitor 7-day pilot gate metrics. Replace flow không có flag riêng — gated qua permission `settings:tenant` ở action layer; owner chỉ trigger khi thực sự cần (rare ops).
