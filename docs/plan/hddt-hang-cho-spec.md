# Spec — HĐĐT "hàng chờ": nháp-local → phát hành theo lô

> Quyết định gốc: [D022](decisions.md#d022). Tier: **T3** (money + HĐĐT). Trạng
> thái: **chờ kế toán xác nhận thời điểm lập** trước khi bật; code có thể dựng sẵn
> sau `hddt_issuance_mode='realtime'` (mặc định = hành vi hiện tại).
>
> Đọc trước: `docs/ref/legal-framework-2026.md`, `docs/ref/einvoice-tax.md`,
> skill `tax-vn`. Không recite quy tắc thuế từ trí nhớ.

## 1. Mục tiêu / Non-goals

**Mục tiêu:** tạo cửa sổ sửa sai trước khi HĐĐT được phát hành chính thức — bằng
cách giữ hóa đơn ở trạng thái **nháp LOCAL** (chưa gọi provider) từ lúc thanh toán
đến khi **phát hành theo lô** cuối ngày (hoặc khi bấm "chốt"), dùng API
`createBatchInvoice` của Viettel S-invoice (trả mã CQT + số về cho HĐ máy tính
tiền).

**Non-goals:** không đổi luồng hủy/thay thế sau phát hành (giữ nguyên); không tự
động hóa HĐ điều chỉnh số tiền; không đổi cơ chế B2C daily summary hiện có ngoài
việc tái dùng; không xây promotion engine.

## 2. Hiện trạng (đã xác minh từ code)

- POS thanh toán → `confirmCashPaymentWithInvoice` / luồng bill →
  `createTaxInvoice` ([finance/actions.ts:62](../../apps/web/app/(protected)/finance/actions.ts)) →
  `ViettelSinvoiceProvider.createInvoice` ([viettel-sinvoice.ts:487](../../packages/shared/src/providers/impl/viettel-sinvoice.ts)) →
  POST `/InvoiceAPI/InvoiceWS/createInvoice/{taxCode}` **1-shot** (tạo + gửi CQT
  ngay; trả `submitted`/`signing`). Reconcile cron poll `getStatus`
  (`searchInvoiceByTransactionUuid`) tới `issued`; archive cron tải PDF/XML.
- Provider interface `InvoiceProvider` ([providers/invoice.ts:156](../../packages/shared/src/providers/invoice.ts)):
  `createInvoice`, `getStatus`, `cancelInvoice`, `downloadInvoice` — **không có**
  batch / draft.
- State machine `transition_tax_invoice_state` (mig `20260425035346`):
  `draft→signing→submitted→issued`; `issued→cancelled|replaced`. Mọi UPDATE status
  qua RPC.
- B2C daily summary đã có: `aggregate_daily_b2c_invoice` + cron 02:05
  (`hddt-daily-summary.ts`) — nhưng hiện không có order eligible vì per-order
  realtime đang bật.
- API v2.50 (tài liệu Viettel) có:
  - `InvoiceWS/createBatchInvoice/{taxCode}` — ≤50 HĐ/lô; HĐ MTT **trả `codeOfTax`
    (mã CQT) + số theo `transactionUuid`** (`createInvoiceOutputs`, `lstMapError`,
    `totalSuccess/Fail`).
  - `InvoiceUtilsWS/createInvoiceDraftPreview/{taxCode}` — trả PDF, **không lưu**.
  - `InvoiceWS/createOrUpdateInvoiceDraft` — ❌ KHÔNG dùng (phát hành thủ công trên
    web, số không sync về).
  - `cancelTransactionInvoice` — đã bỏ từ 01/06 (NĐ 70/2025); sau phát hành dùng
    điều chỉnh/thay thế.

## 3. Kiến trúc đích

```
[Thanh toán]            [Cửa sổ sửa, trong ngày]        [Cuối ngày / "chốt ca"]
order paid              order còn sửa được (*)          cron / action phát hành lô
  → tạo tax_invoices       → regenerate draft payload      → gom draft theo branch+ngày
    status='draft'           từ order khi order đổi          → provider.createBatchInvoice (≤50)
    (KHÔNG gọi provider)   → có thể xóa draft + huỷ          → map transactionUuid →
  → khách nhận receipt       hóa đơn nháp                      số + codeOfTax
                                                            → transition draft→signing→
                                                              submitted/issued (per kết quả)
                                                            → reconcile + archive cron như cũ
```

(*) Cần luồng **sửa/hoàn payment đã completed** (gap D-review trước) để thực sự sửa
được đơn trong cửa sổ. Đây là **prerequisite** — liệt kê ở §8.

Điều khiển bằng setting `hddt_issuance_mode`:
- `realtime` (mặc định, = hiện tại): giữ `createInvoice` per-order ngay.
- `deferred_batch`: bật hàng chờ. **Ngoại lệ:** khách yêu cầu HĐĐT có MST + cần
  ngay → vẫn cho phát hành realtime per-order (nút "Phát hành ngay") để không giữ
  khách B2B.

## 4. Thay đổi theo thành phần

### 4.1 Provider (packages/shared/src/providers)
- `invoice.ts`: thêm vào interface `InvoiceProvider`:
  - `createBatchInvoice(requests: InvoiceRequest[]): Promise<BatchInvoiceItemResult[]>`
    — mỗi phần tử `{ transactionUuid, status, invoiceNumber, codeOfTax?, providerData }`.
  - (tuỳ chọn) `previewInvoice(request: InvoiceRequest): Promise<InvoiceArtifact>` —
    map `createInvoiceDraftPreview`.
- `impl/viettel-sinvoice.ts`: implement 2 method trên.
  - `createBatchInvoice`: POST `/InvoiceAPI/InvoiceWS/createBatchInvoice/{taxCode}`;
    body = mảng item dùng lại đúng builder hiện có (`buildSinvoiceTransactionUuid`,
    `deriveInvoiceTypeFromTemplate`, `buildSinvoiceItemInfo`, `detectGrossInput`);
    tự chia ≤50/lô; parse `createInvoiceOutputs` ↔ `transactionUuid`; lỗi từng HĐ →
    `lstMapError` (không fail cả lô).
  - Tái dùng `authedFetch`/`ensureToken`. Giữ `createInvoice` cũ cho path realtime.
- `__tests__/viettel-sinvoice.test.ts`: thêm ca batch (map kết quả, lô >50 chia
  nhỏ, 1 HĐ lỗi giữa lô).

### 4.2 Server actions (apps/web/app/(protected)/finance + pos)
- Tách `createTaxInvoice` thành 2 chế độ (hoặc thêm action mới):
  - `createDraftTaxInvoice(orderId)` — INSERT `tax_invoices status='draft'`,
    `invoice_kind='per_order'`, `transactionUuid` (ổn định theo order), **không gọi
    provider**. Idempotent qua unique index `uq_tax_invoices_active_per_order`.
  - `issueDraftBatch(branchId, date)` — gom draft, gọi
    `provider.createBatchInvoice`, transition per HĐ:
    `draft→signing` (trước call) → `submitted|issued` (sau, theo kết quả) qua
    `transition_tax_invoice_state_as_system`. Reuse builder payload từ
    `finance/actions.ts` (request builder hiện tại).
- POS payment: trong `deferred_batch`, `confirmCashPaymentWithInvoice` (và VietQR)
  → gọi `createDraftTaxInvoice` thay vì `createTaxInvoice`. Giữ nút "Phát hành
  ngay" cho B2B-MST gọi `createTaxInvoice` cũ.
- (tuỳ chọn) `previewDraftInvoice(orderId)` cho UI xem trước.

### 4.3 Cron / job
- Cron phát hành lô cuối ngày (mẫu giống `aggregate_daily_b2c_invoice` cron 02:05
  hoặc cuối ca): loop branch active → `issueDraftBatch`. Hoặc trigger thủ công khi
  "chốt ca" (`/finance/summary` hoặc close-session).
- Reconcile cron (`hddt-reconcile.ts`) + archive cron (`hddt-archive.ts`): **không
  đổi** — vẫn poll `submitted→issued` + tải file.

### 4.4 Data model / migration (file → PR → owner; KHÔNG apply trực tiếp prod)
- Setting `hddt_issuance_mode` ('realtime'|'deferred_batch') trong `system_settings`
  (mặc định 'realtime' → zero behavior change khi merge).
- State machine: kiểm tra `draft→signing→submitted` đã đủ (đã có) → **có thể không
  cần migration state**. Nếu muốn trạng thái "queued" riêng (phân biệt draft-lỗi vs
  draft-chờ-lô) → thêm transition, T3.
- (tuỳ) cột `hold_until`/`queued_at` trên `tax_invoices` để cron biết draft nào sẵn
  sàng phát hành.
- Sau migration đụng type-source schema → `pnpm db:types`.

### 4.5 UI
- POS bill: ở `deferred_batch`, hiển thị "HĐĐT sẽ phát hành cuối ngày" + nút "Phát
  hành ngay" (B2B-MST). Bước **preview/confirm** trước khi phát hành ngay.
- `/finance/invoices`: tab "Chờ phát hành (nháp)" — xem/sửa/xóa draft + nút "Phát
  hành lô" thủ công.

## 5. Cổng pháp lý (BẮT BUỘC trước khi bật `deferred_batch`)
Kế toán + điều khoản đăng ký MTT với CQT xác nhận: **thời điểm lập HĐĐT khởi tạo từ
máy tính tiền cho dịch vụ ăn uống** — phát hành theo lô cuối ngày có hợp lệ không
(NĐ 123/2020 Đ9 sửa bởi **NĐ 70/2025**; **TT 32/2025**). Viettel cấp API batch cho
HĐ MTT (trả mã CQT) ⇒ kỹ thuật được hỗ trợ; *thời điểm lập* là quy tắc luật. Nếu
luật bắt realtime tại thời điểm bán → KHÔNG bật `deferred_batch`, chỉ dùng bước
preview/confirm (vẫn realtime).

## 6. T3 — bốn góc nhìn (điền trước khi code)
- **PM:** scope = cửa sổ sửa qua hàng chờ; MVP = setting + draft-local + batch cron
  + nút phát-hành-ngay; done = đơn B2C không phát hành tới cuối ngày, sửa được trong
  ngày, batch trả số/mã đúng.
- **BA:** quy tắc — 1 active invoice/order (unique index); B2B-MST realtime ngoại
  lệ; draft đổi theo order; lô ≤50; lỗi từng HĐ không fail cả lô; sau issued chỉ
  điều chỉnh/thay thế.
- **Dev:** provider batch method + tách create-draft/issue + cron + setting; rủi ro
  = map transactionUuid sai, double-issue (chặn bằng unique index + idempotent
  transactionUuid theo order).
- **QA:** test batch map, lô>50, 1 HĐ lỗi, idempotent re-run, đổi mode realtime↔
  deferred, reconcile sau batch, B2B realtime vẫn chạy.

## 7. Test
- Unit: `createBatchInvoice` (map theo transactionUuid, chia lô, lỗi lẻ);
  builder payload dùng lại đúng (so với realtime).
- Integration (sau owner apply, không có dev DB ⇒ owner smoke): tạo đơn B2C →
  draft (không gọi provider) → batch cuối ngày → có số + mã CQT → issued; reconcile
  + archive chạy; B2B-MST "phát hành ngay" vẫn ra HĐ realtime.
- Gates: `pnpm typecheck && pnpm lint && pnpm build` + test provider.

## 8. Prerequisite / liên đới
- **Luồng sửa/hoàn payment đã completed** (gap đã chẩn đoán): wire `createRefund`
  vào UI hoặc thêm "Hủy thanh toán nhầm" (void completed, đưa đơn về unpaid) — cửa
  sổ hàng chờ chỉ hữu dụng nếu sửa được đơn trong ngày. Nên làm **trước/cùng**.

## 9. Câu hỏi mở
- Phát hành lô theo **cron cuối ngày** hay theo **chốt ca** (per pos_session)? (ca
  hợp HKD 1 ca/ngày hơn — xem D012.)
- Draft đổi khi order đổi: **regenerate khi phát hành** (đơn giản, lấy order tại
  thời điểm batch) hay giữ snapshot? → nghiêng regenerate-at-issue.
- Có cần trạng thái `queued` riêng hay dùng `draft` là đủ? → mặc định dùng `draft`.
