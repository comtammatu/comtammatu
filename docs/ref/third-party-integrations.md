# Third-Party Integrations — Hệ Sinh Thái Bên Ngoài

> Cập nhật: 2026-05-23
> Mục đích: Vendor selection + integration guide cho toàn bộ hệ thống
> Nguyên tắc: "Hệ thống chỉ chuẩn bị data — filing/payment thực tế qua vendor"

---

## Tóm tắt nhanh — Vendors được chọn

| Nhóm              | Vendor chọn                    | Fallback      | Module                       |
| ----------------- | ------------------------------ | ------------- | ---------------------------- |
| **QR thanh toán** | VietQR (NAPAS) + SePay webhook | —             | Payment                      |
| **E-wallet #1**   | MoMo                           | —             | Payment                      |
| **Card payment**  | VNPay                          | —             | Đã loại bỏ (D012 2026-06-10) |
| **HĐĐT**          | Viettel S-invoice              | —             | Finance                      |
| **BHXH**          | iBHXH / VNPT-BHXH              | Manual portal | Nhân sự & tiền lương         |
| **eTax / GTGT**   | Manual eTax portal             | HTKK desktop  | Nhân sự & tiền lương         |

---

## 1. Thanh Toán (Payments)

### 1.1 VietQR — Chuyển khoản QR ngân hàng

**Lựa chọn**: ✅ **Tích hợp Payment**

| Thuộc tính    | Giá trị                                                            |
| ------------- | ------------------------------------------------------------------ |
| Loại          | NAPAS standard, bank-to-bank direct                                |
| API           | REST — `api.vietqr.vn`                                             |
| Sandbox       | ✅ Có (`api.vietqr.vn` test env)                                   |
| SDK           | Node.js SDK chính thức                                             |
| Phí/giao dịch | ~1,600 VND (Plus) hoặc % (Pro) — cần confirm với ngân hàng đối tác |
| Settlement    | Realtime                                                           |
| Webhook       | SePay webhook nếu bật; fallback là cashier xác nhận thủ công       |
| Onboarding    | Đăng ký qua ngân hàng hoặc QR service provider                     |

**Cách hoạt động**: Cashier chọn Chuyển khoản → Hệ thống tạo một payment pending với mã chuyển khoản ngẫu nhiên trong `payments.provider_ref` (ví dụ `DH 144777 AFFU2`) → Khách quét QR bằng app ngân hàng bất kỳ và giữ nguyên nội dung → Tiền về tài khoản merchant → SePay đẩy webhook vào hệ thống, hoặc cashier xác nhận thủ công khi webhook chưa bật.

**Lưu ý tích hợp**:

```
- VietQR gốc không có push webhook — Sepay webhook là lớp nhận biến động tài khoản ngân hàng
- Cần merchant ID từ ngân hàng đối tác (Vietcombank / VPBank / MB phổ biến nhất)
- Dynamic QR mỗi giao dịch khác nhau (có amount + nội dung) — KHÔNG dùng Static QR cho POS
```

**SePay webhook settlement**:

```
- Endpoint: /api/webhooks/sepay
- Sepay auth: HMAC-SHA256, raw body, header X-SePay-Signature + X-SePay-Timestamp
- Idempotency: lưu webhook_events(provider='sepay', request_id=payload.id) trước khi chốt payment
- Match payment: ưu tiên payload.code; fallback đọc nội dung chuyển khoản có mã dạng "DH 144777 AFFU2", khớp với payments.provider_ref
- Validate: transferType='in', số tiền khớp đơn, tài khoản nhận khớp cấu hình VietQR trong Admin
```

---

### 1.2 MoMo — E-wallet #1

**Lựa chọn**: ✅ **Tích hợp Payment**

| Thuộc tính       | Giá trị                                    |
| ---------------- | ------------------------------------------ |
| Thị phần         | ~69% người dùng VN, 80%+ F&B chấp nhận     |
| API              | REST — `developers.momo.vn/v3`             |
| Sandbox          | ✅ Có — Postman collection đầy đủ          |
| Phí merchant     | **MIỄN PHÍ** (MoMo không thu phí merchant) |
| Settlement       | Realtime                                   |
| Webhook          | ✅ POST JSON IPN khi giao dịch hoàn tất    |
| Webhook security | HMAC signature                             |
| Fallback         | Nếu timeout → gọi GET order status API     |

**Webhook payload mẫu**:

```json
{
  "orderId": "ORDER_ID",
  "requestId": "REQUEST_ID",
  "amount": 150000,
  "resultCode": 0,
  "message": "Thành công",
  "transId": "MOMO_TRANS_ID",
  "payType": "qr"
}
```

**Lưu ý tích hợp**:

```
- Luôn verify signature trước khi xử lý webhook
- POS QR phải dùng `qrCodeUrl`; không render `payUrl`/`deeplink` thành QR
- Luồng `autoCapture=true`: `resultCode = 0` hoặc `9000` → có thể chốt thanh toán; mã khác → thất bại / pending theo bảng result code
- IPN hợp lệ phải phản hồi HTTP 204 không body trong 15 giây
- Bảo vệ idempotency: ghi `webhook_events(provider, request_id)` trước khi gọi RPC chốt thanh toán
```

---

### 1.3 VNPay — Card & Gateway

**Lựa chọn**: ❌ **Đã loại bỏ (D012 2026-06-10)**

| Thuộc tính | Giá trị                                                             |
| ---------- | ------------------------------------------------------------------- |
| Loại       | Payment gateway (không phải direct bank)                            |
| API        | Gateway-based REST                                                  |
| Sandbox    | ✅ `sandbox.vnpayment.vn` (QR test không có trong sandbox miễn phí) |
| Phí        | 1.1% – 2.2% (thương lượng)                                          |
| Onboarding | 48h, cần MST + giấy phép KD + TmnCode                               |
| Best for   | Visa/Mastercard, du khách nước ngoài                                |

**Lý do loại bỏ**: Đã loại khỏi roadmap theo D012 (2026-06-10). Phức tạp onboarding, phí cao hơn; không có nhu cầu card payment trong mô hình HKD hiện tại.

---

## 2. Hóa Đơn Điện Tử (HĐĐT)

### 2.1 Viettel S-invoice — Provider duy nhất

**Lựa chọn**: ✅ **Tích hợp Finance — đang hoạt động**

| Thuộc tính     | Giá trị                           |
| -------------- | --------------------------------- |
| API            | REST — `api-vinvoice.viettel.vn`  |
| Auth           | `POST /auth/login` + Bearer token |
| Sandbox/test   | Dùng account test Sinvoice        |
| Phí/HĐ         | Theo hợp đồng Viettel             |
| Infrastructure | Tier 3, HSM, hàng triệu HĐ/ngày   |
| Onboarding     | 5–7 ngày làm việc                 |

**Lý do chọn Viettel S-invoice**:

- Provider pháp lý đang có và đang vận hành thực tế cho Cơm Tấm Má Tư.
- Runtime chỉ register `ViettelSinvoiceProvider`; không còn MISA/meInvoice implementation hay provider switch.
- Một bộ `SINVOICE_*` env đơn giản hơn cho single-tenant HKD.

**Auth flow**:

1. `POST /auth/login` với JSON `{ username, password }`
2. Dùng Bearer token gọi `InvoiceWS/createInvoice/{supplierTaxCode}`
3. Reconcile dùng `InvoiceWS/searchInvoiceByTransactionUuid`

**Config runtime**:

```env
COMPANY_TAX_CODE=<supplierTaxCode đã đăng ký với Viettel/CQT>
SINVOICE_USERNAME=<account_mst>
SINVOICE_PASSWORD=<api_password>
SINVOICE_TEMPLATE_CODE=<template đăng ký CQT>
SINVOICE_INVOICE_SERIES=<series Viettel cấp>
SINVOICE_BASE_URL=https://api-vinvoice.viettel.vn
SINVOICE_SANDBOX=false
```

Runtime hiện không gửi `sellerInfo` lên Vinvoice; người bán hiển thị theo hồ sơ
đã cấu hình trong S-invoice cho `supplierTaxCode`. Không thêm `SELLER_*` env
hoặc override thông tin người bán nếu chưa đối chiếu tài liệu/tài khoản Viettel
cụ thể.

Xem chi tiết schema trong `docs/ref/einvoice-tax.md`.

---

## 3. Pháp Lý & Compliance

### 3.1 BHXH — Bảo hiểm xã hội

**Lựa chọn**: 📋 **Manual workflow — Hệ thống chỉ xuất data**

| Thuộc tính      | Giá trị                          |
| --------------- | -------------------------------- |
| API trực tiếp   | ❌ Không có                      |
| Phần mềm hỗ trợ | iBHXH (TS24), VNPT-BHXH          |
| Portal          | `dichvucong.baohiemxahoi.gov.vn` |
| Mobile          | VssID app                        |

**Workflow thực tế**:

```
Hệ thống → Export báo cáo lương + BHXH (định dạng CSV/Excel)
         → Kế toán / HR upload vào iBHXH hoặc VNPT-BHXH
         → Nộp điện tử qua cổng BHXH
```

**Khuyến nghị**: Hệ thống xuất file đúng format mà **iBHXH chấp nhận import** — tránh phải nhập tay. Format chuẩn: xác nhận với TS24 (nhà phát triển iBHXH).

---

### 3.2 eTax / HTKK — Kê khai thuế GTGT

**Lựa chọn**: 📋 **Manual workflow — Hệ thống chỉ xuất data**

| Thuộc tính    | Giá trị                 |
| ------------- | ----------------------- |
| API trực tiếp | ❌ Không có             |
| Desktop       | HTKK v4.8.5+ (Windows)  |
| Web portal    | `thuedientu.gdt.gov.vn` |
| Mobile        | eTax Mobile app         |

**Workflow thực tế**:

```
Hệ thống → Export báo cáo thuế GTGT theo tháng (tổng đầu ra / đầu vào)
         → Kế toán mở HTKK hoặc portal eTax
         → Nhập số liệu + nộp tờ khai 01/GTGT
```

**Data hệ thống cần cung cấp cho kế toán** (xem SQL trong `docs/ref/einvoice-tax.md`):

- Tổng doanh thu / thuế GTGT đầu ra theo tháng
- Tổng chi mua nguyên liệu / thuế GTGT đầu vào có thể khấu trừ

---

## 4. Chi phí ước tính hàng tháng

Giả định: 500 order/ngày, 5 chi nhánh, ~15,000 order/tháng

| Service                | Volume     | Đơn giá    | Chi phí/tháng                           |
| ---------------------- | ---------- | ---------- | --------------------------------------- |
| Viettel S-invoice      | 15,000 HĐ  | Theo HĐ    | Theo hợp đồng Viettel                   |
| VietQR (qua ngân hàng) | 15,000 txn | ~1,600 VND | **24,000,000 VND**                      |
| MoMo                   | Variable   | **0%**     | **0 VND**                               |
| **Tổng**               |            |            | **Phụ thuộc hợp đồng Viettel + VietQR** |

> ⚠️ Phí VietQR là lớn nhất — cần negotiate với ngân hàng đối tác để có gói merchant tốt hơn. Nhiều ngân hàng có gói 0 VND/giao dịch cho SME khi đạt volume.

---

## 5. Thứ tự tích hợp theo Module

| Module                   | Tích hợp                                         |
| ------------------------ | ------------------------------------------------ |
| **Payment**              | VietQR + MoMo                                    |
| **Finance**              | Viettel S-invoice                                |
| **Nhân sự & tiền lương** | Xuất data BHXH / thuế TNCN (no API, just export) |
| **Đã loại bỏ**           | VNPay (D012 2026-06-10)                          |

---

## 6. Environment Variables cần thiết

```bash
# Payment
NEXT_PUBLIC_APP_URL=https://pos.comtammatu.vn # HTTPS public; MoMo gọi IPN vào URL này

SEPAY_WEBHOOK_SECRET=    # Secret Key khi tạo webhook HMAC-SHA256 trên SePay
# VietQR bank/account/name thiết lập trong Admin > Thanh toán, không đặt ENV.

MOMO_PARTNER_CODE=       # Mã đối tác do MoMo cấp
MOMO_ACCESS_KEY=         # Access key do MoMo cấp
MOMO_SECRET_KEY=         # Secret key dùng ký request + verify IPN
MOMO_SANDBOX=true        # true=test-payment.momo.vn, false/unset=production
MOMO_REDIRECT_URL=       # Optional trang khách sau thanh toán; không trỏ về POS

# HĐĐT
COMPANY_TAX_CODE=
SINVOICE_USERNAME=
SINVOICE_PASSWORD=
SINVOICE_TEMPLATE_CODE=
SINVOICE_INVOICE_SERIES=
SINVOICE_BASE_URL=https://api-vinvoice.viettel.vn
SINVOICE_SANDBOX=false

```

> Tất cả secrets phải được lưu trong Supabase Vault / Vercel Environment Variables — **KHÔNG commit vào code**.

---

## Tài liệu liên quan

- `docs/ref/einvoice-tax.md` — Chi tiết HĐĐT, state machine, DB schema
- `docs/ref/payroll-pit.md` — BHXH, thuế TNCN, export data cho kế toán
- `docs/spec/architecture.md` — Edge Functions, proxy layer
