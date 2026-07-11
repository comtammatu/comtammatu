# HĐĐT Viettel S-invoice Operations

Runbook vận hành cho HĐĐT đang active qua Viettel S-invoice. Không dùng file
này làm source of truth cho luật thuế; business/legal contract nằm ở
`docs/ref/einvoice-tax.md`.

## Khi Chạy

- Smoke trước khi mở chi nhánh mới hoặc đổi cấu hình Viettel S-invoice.
- Reconcile khi invoice ở trạng thái `signing`, `submitted`, hoặc `failed` quá lâu.
- Kiểm tra lưu trữ PDF/XML trong bucket `hddt-archive`.
- Xử lý hủy/thay thế hóa đơn đã phát hành.

## Env Bắt Buộc

```env
COMPANY_TAX_CODE=<seller tax code>
SINVOICE_USERNAME=<viettel api username>
SINVOICE_PASSWORD=<viettel api password>
SINVOICE_TEMPLATE_CODE=<registered template>
SINVOICE_INVOICE_SERIES=<registered series>
SINVOICE_BASE_URL=https://api-vinvoice.viettel.vn
CRON_SECRET=<cron bearer secret>
HDDT_DAILY_SUMMARY_ENABLED=true
HDDT_ARCHIVE_ENABLED=true
```

Không commit secret. Owner cấu hình trong Vercel/Supabase theo môi trường.

## Smoke Realtime Invoice

1. Tạo đơn POS test và thanh toán bằng method được duyệt.
2. Yêu cầu HĐĐT hoặc dùng flow theo policy hiện hành.
3. Kiểm `tax_invoices`:

```sql
SELECT id, branch_id, order_id, status, provider, provider_ref,
       invoice_number, signing_started_at, issued_at, last_error
FROM tax_invoices
ORDER BY created_at DESC
LIMIT 10;
```

Kỳ vọng: provider là `viettel`, `provider_ref` có transaction UUID, trạng thái đi
tới `issued` hoặc có lỗi rõ để retry/reconcile. Không chấp nhận paid amount lệch
với tổng HĐĐT sau discount.

## Daily Summary

Ưu tiên action đã xác thực trong Finance. Chỉ gọi cron endpoint thủ công khi đã
ghi rõ target host/ref, branch/date/run, side effect dự kiến và cách kiểm tra
idempotency. Production issuance cần owner delegation rõ trong session hiện tại;
không dùng lệnh smoke non-prod để thử trên production.

Trigger có kiểm soát:

```bash
curl -X POST https://<target-host>/api/cron/hddt-daily-summary \
  -H "Authorization: Bearer $CRON_SECRET"
```

Kiểm queue:

```sql
SELECT id, branch_id, summary_date, status, trigger_source, last_error,
       tax_invoice_id, started_at, finished_at
FROM summary_run_queue
ORDER BY created_at DESC
LIMIT 10;
```

## Archive PDF/XML

Archive production cũng cần target host/ref và owner delegation rõ; xác nhận run
scope trước khi POST.

```bash
curl -X POST https://<target-host>/api/cron/hddt-archive \
  -H "Authorization: Bearer $CRON_SECRET"
```

Kiểm kết quả:

```sql
SELECT id, invoice_number, pdf_url, xml_url, pdf_sha256, xml_sha256, archived_at
FROM tax_invoices
WHERE status = 'issued'
ORDER BY issued_at DESC
LIMIT 20;

SELECT outcome, count(*)
FROM archive_run_log
WHERE created_at > now() - interval '7 days'
GROUP BY outcome
ORDER BY outcome;
```

Bucket `hddt-archive` phải private. Nếu archive lỗi hàng loạt, tắt
`HDDT_ARCHIVE_ENABLED`, redeploy, rồi reconcile từ `archive_run_log`.

## Lỗi Thường Gặp

| Lỗi | Nguyên nhân thường gặp | Xử lý |
| --- | --- | --- |
| CQT từ chối cấp mã | MST, template, series, hoặc payload sai | Kiểm env + dữ liệu người mua, retry sau khi sửa |
| Timeout provider | Viettel chậm hoặc network lỗi | Retry; giữ `provider_ref` để tránh duplicate |
| Duplicate invoice | Gọi API lại khi đã có transaction | Tra `provider_ref` và invoice state trước khi gọi lại |
| Kẹt `signing` | Provider ack chưa về | Chạy reconcile/manual inspect, không tạo invoice mới tùy tiện |
| Archive `storage_error` | Bucket/RLS/env storage lỗi | Kiểm bucket private, policy, service role, rồi retry archive |

## Verify Gate

Sau thay đổi HĐĐT/payment/discount/receipt, chạy:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Và smoke ít nhất một order paid → HĐĐT issued/reconciled → PDF/XML archived trong
dev/test/staging được owner duyệt.
