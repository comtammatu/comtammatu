# Third-Party Integrations — Hệ Sinh Thái Bên Ngoài

> Mục đích: Vendor selection + integration guide cho toàn bộ hệ thống
> Nguyên tắc: "Hệ thống chỉ chuẩn bị data — filing/payment thực tế qua vendor"

---

## Tóm tắt nhanh — Vendors được chọn

| Nhóm              | Vendor chọn                    | Fallback      | Module                       |
| ----------------- | ------------------------------ | ------------- | ---------------------------- |
| **QR thanh toán** | VietQR (NAPAS) + SePay webhook | —             | Payment                      |
| **Card payment**  | VNPay                          | —             | Đã loại bỏ (D012 2026-06-10) |
| **HĐĐT**          | Viettel S-invoice              | —             | Finance                      |
| **BHXH**          | iBHXH / VNPT-BHXH              | Manual portal | Nhân sự & tiền lương         |
| **eTax / GTGT**   | Manual eTax portal             | HTKK desktop  | Nhân sự & tiền lương         |

---

## 1. Thanh Toán (Payments)

### 1.1 VietQR — Chuyển khoản QR ngân hàng

**Lựa chọn**: ✅ **Tích hợp Payment**

| Thuộc tính | Giá trị                                                      |
| ---------- | ------------------------------------------------------------ |
| Loại       | EMVCo/NAPAS bank-transfer payload                            |
| Generation | Sinh payload cục bộ trong provider; không gọi VietQR image API |
| Settlement | SePay evidence webhook hoặc cashier xác nhận theo quyền      |
| Cấu hình   | Tài khoản nhận tiền sống trong Owner settings                |

**Cách hoạt động**: Mỗi đơn có mã chuyển khoản cố định trong
`orders.payment_code`: `<configured prefix> + space + 12 ký tự chữ/số`. Phiếu
tạm tính và POS dùng mã này để tạo QR. Khách giữ nguyên nội dung chuyển khoản;
SePay đẩy evidence webhook, hoặc cashier xác nhận theo quyền khi cần.

**Lưu ý tích hợp**:

```
- VietQR gốc không có push webhook — Sepay webhook là lớp nhận biến động tài khoản ngân hàng
- QR của đơn mang amount + nội dung từ `orders.payment_code`; không dùng ảnh QR
  tĩnh làm settlement path cho POS
```

**SePay webhook settlement**:

```
- Endpoint: /api/webhooks/sepay
- Sepay auth: HMAC-SHA256, raw body, header X-SePay-Signature + X-SePay-Timestamp
- Idempotency: lưu webhook_events(provider='sepay', request_id=payload.id) trước khi chốt payment
- Match payment: scan `content`, `description` và `code`, rồi chọn candidate hợp
  lệ dài nhất; mã `DH...` chỉ được giữ để đọc legacy evidence
- Validate: transferType='in', số tiền khớp đơn, tài khoản nhận khớp cấu hình VietQR trong Owner
```

---

### 1.2 VNPay — Card & Gateway

**Lựa chọn**: ❌ **Đã loại bỏ (D012 2026-06-10)**

| Thuộc tính | Giá trị                                                             |
| ---------- | ------------------------------------------------------------------- |
| Loại       | Payment gateway (không phải direct bank)                            |
| API        | Gateway-based REST                                                  |
| Sandbox    | ✅ `sandbox.vnpayment.vn` (QR test không có trong sandbox miễn phí) |
| Phí        | 1.1% – 2.2% (thương lượng)                                          |
| Onboarding | 48h, cần MST + giấy phép KD + TmnCode                               |
| Best for   | Visa/Mastercard, du khách nước ngoài                                |

**Lý do loại bỏ**: Đã loại khỏi roadmap theo D012 (2026-06-10). Phức tạp onboarding, phí cao hơn; chưa có nhu cầu card payment đã được xác nhận.

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
- Một bộ `SINVOICE_*` env đơn giản hơn cho sản phẩm single-tenant hiện tại.

**Auth flow**:

1. `POST /auth/login` với JSON `{ username, password }`
2. Dùng Bearer token gọi `InvoiceWS/createInvoice/{supplierTaxCode}`
3. Reconcile dùng `InvoiceWS/searchInvoiceByTransactionUuid`

**Credentials runtime**:

```env
SINVOICE_USERNAME=<account_mst>
SINVOICE_PASSWORD=<api_password>
SINVOICE_BASE_URL=https://api-vinvoice.viettel.vn
SINVOICE_SANDBOX=false
```

MST người bán, template và series là dữ liệu versioned trong
`invoice_profiles`, không phải runtime env. Snapshot hóa đơn giữ nguyên profile
và pháp nhân bán kể cả khi cấu hình hiện hành thay đổi.

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

## 4. Thứ tự tích hợp theo Module

| Module                   | Tích hợp                                         |
| ------------------------ | ------------------------------------------------ |
| **Payment**              | Tiền mặt + VietQR                                |
| **Finance**              | Viettel S-invoice                                |
| **Nhân sự & tiền lương** | Xuất data BHXH / thuế TNCN (no API, just export) |
| **Đã loại bỏ**           | VNPay (D012 2026-06-10)                          |

---

## 6. Environment Variables cần thiết

```bash
# Payment
SEPAY_WEBHOOK_SECRET=    # Secret Key khi tạo webhook HMAC-SHA256 trên SePay
# VietQR bank/account/name thiết lập trong Owner > Thanh toán, không đặt ENV.

# HĐĐT
SINVOICE_USERNAME=
SINVOICE_PASSWORD=
SINVOICE_BASE_URL=https://api-vinvoice.viettel.vn
SINVOICE_SANDBOX=false

```

> Tất cả secrets phải được lưu trong Supabase Vault / Vercel Environment Variables — **KHÔNG commit vào code**.

---

## Tài liệu liên quan

- `docs/ref/einvoice-tax.md` — Chi tiết HĐĐT, state machine, DB schema
- `docs/ref/payroll-pit.md` — BHXH, thuế TNCN, export data cho kế toán
- `docs/spec/architecture.md` — Edge Functions, proxy layer
