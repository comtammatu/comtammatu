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
INVOICE_PROVIDER=misa                  # hoặc "viettel"
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
SINVOICE_TEMPLATE_CODE=1/001           # đăng ký với CQT
SINVOICE_INVOICE_SERIES=C25TLL         # đăng ký với CQT
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

> **Last updated**: 2026-05-08 (post-PR-7 update)
> **Next**: Owner action items — đăng ký template với CQT, mở account provider prod, set env Vercel production, run sandbox smoke 1-3 ngày, flip `HDDT_DAILY_SUMMARY_ENABLED=true`, monitor 7-day pilot gate metrics.
