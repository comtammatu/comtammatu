# Third-Party Integrations — Hệ Sinh Thái Bên Ngoài

> Vendor selection + integration guide. Nguyên tắc: hệ thống chuẩn bị data —
> filing/payment thực tế qua vendor.

## Vendors được chọn

| Nhóm | Vendor | Fallback | Module |
| --- | --- | --- | --- |
| QR thanh toán | VietQR (NAPAS) + SePay webhook | — | Payment |
| Card payment | VNPay | — | **Đã loại bỏ (D012)** |
| HĐĐT | Viettel S-invoice | — | Finance |
| BHXH | iBHXH / VNPT-BHXH | Manual portal | Nhân sự & tiền lương |
| TTS vận hành POS/KDS | Vercel AI Gateway `openai/tts-1` | Browser `speechSynthesis` | Operational audio |

## 1. Thanh toán — VietQR + SePay

| Thuộc tính | Giá trị |
| --- | --- |
| Loại | EMVCo/NAPAS bank-transfer payload |
| Generation | Payload cục bộ trong provider; không gọi VietQR image API |
| Settlement | SePay webhook hoặc cashier xác nhận theo quyền |
| Cấu hình | Tài khoản nhận trong Owner settings |

Mỗi đơn có `orders.payment_code` = `<prefix> + space + 12 ký tự`. Phiếu tạm
tính / POS tạo QR từ mã này. VietQR gốc không có push webhook — SePay là lớp
nhận biến động TK.

**SePay webhook** (`/api/webhooks/sepay`):

- Auth: HMAC-SHA256, raw body, `X-SePay-Signature` + `X-SePay-Timestamp`
- Idempotency: `webhook_events(provider='sepay', request_id=payload.id)` trước khi chốt
- Match: scan `content` / `description` / `code`, candidate hợp lệ dài nhất; `DH...` chỉ legacy
- Validate: `transferType='in'`, số tiền khớp, TK nhận khớp cấu hình VietQR Owner

**VNPay:** loại khỏi roadmap D012 — không tích hợp.

## 2. HĐĐT — Viettel S-invoice (provider duy nhất)

| Thuộc tính | Giá trị |
| --- | --- |
| API | REST — `api-vinvoice.viettel.vn` |
| Auth | `POST /auth/login` + Bearer |
| Runtime | Chỉ `ViettelSinvoiceProvider`; không MISA/meInvoice switch |

Flow: login → `InvoiceWS/createInvoice/{supplierTaxCode}` → reconcile
`InvoiceWS/searchInvoiceByTransactionUuid`.

```env
SINVOICE_USERNAME=<account_mst>
SINVOICE_PASSWORD=<api_password>
SINVOICE_BASE_URL=https://api-vinvoice.viettel.vn
SINVOICE_SANDBOX=false
```

MST / template / series sống trong `invoice_profiles` (versioned), không env.
Chi tiết schema: `docs/ref/einvoice-tax.md`.

## 3. Pháp lý & compliance (export only)

### BHXH

Không API trực tiếp. Portal `dichvucong.baohiemxahoi.gov.vn`; hỗ trợ iBHXH /
VNPT-BHXH. Hệ thống export CSV/Excel → kế toán/HR upload → nộp cổng BHXH.
Khuyến nghị format import iBHXH (xác nhận TS24).

### eTax / HTKK — GTGT

Không API trực tiếp. HTKK desktop hoặc `thuedientu.gdt.gov.vn`. Export tổng
đầu ra / đầu vào tháng → kế toán nộp 01/GTGT. SQL/chi tiết:
`docs/ref/einvoice-tax.md`.

## 4. Theo module + env

| Module | Tích hợp |
| --- | --- |
| Payment | Tiền mặt + VietQR |
| Finance | Viettel S-invoice |
| Nhân sự & tiền lương | Export BHXH / thuế TNCN (no API) |
| Đã loại bỏ | VNPay (D012) |
| POS/KDS voice | AI Gateway TTS, cached; missing key → browser TTS |

```bash
SEPAY_WEBHOOK_SECRET=    # HMAC-SHA256 trên SePay; VietQR bank/account trong Owner UI
SINVOICE_USERNAME=
SINVOICE_PASSWORD=
SINVOICE_BASE_URL=https://api-vinvoice.viettel.vn
SINVOICE_SANDBOX=false
AI_GATEWAY_API_KEY=      # giọng POS/KDS cloud; Sensitive trên Vercel chỉ có lúc chạy
OPERATIONAL_TTS_VOICE=nova
```

Secrets: Supabase Vault / Vercel env — **không commit**.

## Tài liệu liên quan

- `docs/ref/einvoice-tax.md` — HĐĐT, state machine, schema
- `docs/ref/payroll-pit.md` — BHXH, TNCN, export
- `docs/spec/architecture.md` — topology
