# Third-Party Integrations — Hệ Sinh Thái Bên Ngoài

> Cập nhật: 2026-04-01
> Mục đích: Vendor selection + integration guide cho toàn bộ hệ thống
> Nguyên tắc: "Hệ thống chỉ chuẩn bị data — filing/payment thực tế qua vendor"

---

## Tóm tắt nhanh — Vendors được chọn

| Nhóm                  | Vendor chọn        | Fallback             | Module        |
| --------------------- | ------------------ | -------------------- | ------------- |
| **QR thanh toán**     | VietQR (NAPAS)     | —                    | M4 Payment    |
| **E-wallet #1**       | MoMo               | —                    | M4 Payment    |
| **E-wallet #2**       | ZaloPay            | —                    | Post-v1.0     |
| **Card payment**      | VNPay              | —                    | Post-v1.0     |
| **HĐĐT**              | MISA meInvoice     | ViettelSinvoice      | M6 Finance    |
| **OTP / Notify**      | Zalo ZNS           | SpeedSMS             | Post-v1.0     |
| **Email**             | Resend.com         | —                    | M6 Finance    |
| **Delivery dispatch** | Ahamove            | —                    | Post-v1.0     |
| **Delivery platform** | GrabFood           | ShopeeFood (partner) | Post-v1.0     |
| **BHXH**              | iBHXH / VNPT-BHXH  | Manual portal        | M7 Nhân sự & tiền lương |
| **eTax / GTGT**       | Manual eTax portal | HTKK desktop         | M7 Nhân sự & tiền lương |

---

## 1. Thanh Toán (Payments)

### 1.1 VietQR — Chuyển khoản QR ngân hàng

**Lựa chọn**: ✅ **Tích hợp M4 (Payment)**

| Thuộc tính    | Giá trị                                                            |
| ------------- | ------------------------------------------------------------------ |
| Loại          | NAPAS standard, bank-to-bank direct                                |
| API           | REST — `api.vietqr.vn`                                             |
| Sandbox       | ✅ Có (`api.vietqr.vn` test env)                                   |
| SDK           | Node.js SDK chính thức                                             |
| Phí/giao dịch | ~1,600 VND (Plus) hoặc % (Pro) — cần confirm với ngân hàng đối tác |
| Settlement    | Realtime                                                           |
| Webhook       | Polling qua API (không có push webhook chuẩn)                      |
| Onboarding    | Đăng ký qua ngân hàng hoặc QR service provider                     |

**Cách hoạt động**: Cashier tạo QR → Khách quét bằng app ngân hàng bất kỳ → Tiền về tài khoản merchant → Hệ thống poll trạng thái thanh toán.

**Lưu ý tích hợp**:

```
- VietQR không có push webhook — phải poll API hoặc dùng ngân hàng có notification riêng
- Cần merchant ID từ ngân hàng đối tác (Vietcombank / VPBank / MB phổ biến nhất)
- Dynamic QR mỗi giao dịch khác nhau (có amount + nội dung) — KHÔNG dùng Static QR cho POS
```

---

### 1.2 MoMo — E-wallet #1

**Lựa chọn**: ✅ **Tích hợp M4 (Payment)**

| Thuộc tính       | Giá trị                                         |
| ---------------- | ----------------------------------------------- |
| Thị phần         | ~69% người dùng VN, 80%+ F&B chấp nhận          |
| API              | REST — `developers.momo.vn/v3`                  |
| Sandbox          | ✅ Có — Postman collection đầy đủ               |
| Phí merchant     | **MIỄN PHÍ** (MoMo không thu phí merchant)      |
| Settlement       | Realtime                                        |
| Webhook          | ✅ POST JSON IPN khi giao dịch hoàn tất          |
| Webhook security | HMAC signature                                  |
| Fallback         | Nếu timeout → gọi GET order status API          |

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

### 1.3 ZaloPay — E-wallet #2

**Lựa chọn**: ⏳ **Post-v1.0**

| Thuộc tính   | Giá trị                                    |
| ------------ | ------------------------------------------ |
| Thị phần     | ~44% người dùng VN                         |
| API          | REST + SDK — `docs.zalopay.vn`             |
| Sandbox      | Liên hệ ZaloPay để lấy credentials         |
| Phí merchant | Không công bố — liên hệ                    |
| Webhook      | POST với `data` + `mac` (HMAC-SHA256 key2) |
| Onboarding   | Ký hợp đồng + Business Development team    |

**Lý do defer**: ZaloPay yêu cầu đàm phán hợp đồng, không tự onboard. Tích hợp sau khi hệ thống stable.

---

### 1.4 VNPay — Card & Gateway

**Lựa chọn**: ⏳ **Post-v1.0**

| Thuộc tính | Giá trị                                                             |
| ---------- | ------------------------------------------------------------------- |
| Loại       | Payment gateway (không phải direct bank)                            |
| API        | Gateway-based REST                                                  |
| Sandbox    | ✅ `sandbox.vnpayment.vn` (QR test không có trong sandbox miễn phí) |
| Phí        | 1.1% – 2.2% (thương lượng)                                          |
| Onboarding | 48h, cần MST + giấy phép KD + TmnCode                               |
| Best for   | Visa/Mastercard, du khách nước ngoài                                |

**Lý do defer**: Phức tạp onboarding, phí cao hơn. Cần khi có khách quốc tế hoặc cần card payment.

---

## 2. Hóa Đơn Điện Tử (HĐĐT)

### 2.1 MISA meInvoice — Provider chính

**Lựa chọn**: ✅ **Tích hợp M6 (Finance) — Provider ưu tiên**

| Thuộc tính      | Giá trị                                                 |
| --------------- | ------------------------------------------------------- |
| API             | REST — `doc.meinvoice.vn/api`                           |
| Auth            | OAuth 2.0 Bearer Token                                  |
| Sandbox         | ✅ `testapi.meinvoice.vn`                               |
| Phí/hóa đơn     | **300 VND/HĐ** (công khai, rõ ràng nhất)                |
| Phí setup       | 500,000 VND (miễn nếu dùng MISA accounting)             |
| Lưu trữ         | 10 năm miễn phí                                         |
| Onboarding      | 3–5 ngày làm việc                                       |
| Response format | `{ "Success": bool, "Data": any, "ErrorCode": string }` |

**Lý do chọn MISA meInvoice**:

- Giá/HĐ rõ ràng và rẻ nhất (300 VND vs "liên hệ" của ViettelSinvoice)
- Tài liệu REST API đầy đủ online, có sandbox thực sự
- Được tích hợp bởi hầu hết SaaS F&B VN: CukCuk, Sapo, KiotViet, iPOS → cộng đồng dev lớn
- OAuth 2.0 (modern auth) vs Base64 username/password của Viettel

**Headers mẫu**:

```http
Authorization: Bearer <access_token>
Content-Type: application/json
CompanyTaxCode: <MST_cua_tenant>
```

**Luồng tích hợp**:

```
1. POST /api/auth/token → lấy access_token
2. POST /api/invoices → tạo draft invoice
3. POST /api/invoices/{id}/issue → gửi CQT lấy mã
4. GET /api/invoices/{id} → poll trạng thái
5. GET /api/invoices/{id}/pdf → lấy file PDF
```

---

### 2.2 ViettelSinvoice — Fallback

**Lựa chọn**: 🔄 **Fallback / Tùy chọn tenant**

| Thuộc tính     | Giá trị                                      |
| -------------- | -------------------------------------------- |
| API            | REST — `sinvoice.viettel.vn:8443/InvoiceAPI` |
| Auth           | Base64(username:password) + IP Whitelist     |
| Sandbox        | ✅ `demo-sinvoice.viettel.vn:8443`           |
| Phí/HĐ         | Không công bố — liên hệ                      |
| Infrastructure | Tier 3, HSM, hàng triệu HĐ/ngày              |
| Onboarding     | 5–7 ngày làm việc                            |

**Lý do là fallback**: Tài liệu tốt nhưng auth cũ (Base64 + IP whitelist phức tạp hơn OAuth), phí không minh bạch. Tuy nhiên Viettel infrastructure rất ổn định — dùng nếu MISA có downtime hoặc tenant yêu cầu.

**Config trong `system_settings`**:

```
einvoice_provider = 'misa' | 'viettel' | 'vnpt'
```

Xem chi tiết schema trong `docs/ref/einvoice-tax.md`.

---

## 3. Thông Báo Khách Hàng (Notifications)

### 3.1 Zalo ZNS — Kênh chính

**Lựa chọn**: ⏳ **Post-v1.0 (Notifications)**

| Thuộc tính | Giá trị                                         |
| ---------- | ----------------------------------------------- |
| Phạm vi    | 75+ triệu user VN, 87% smartphone users         |
| Phí/tin    | 300 VND (standard), 400–600 VND (có CTA button) |
| Tốc độ     | 90% delivery trong 5 giây                       |
| Open rate  | 60–90% (vs SMS ~5–10%)                          |
| So với SMS | Rẻ hơn ~40%, nhanh hơn, readable hơn            |
| Template   | Phải pre-approve với Zalo trước khi gửi         |
| Sandbox    | Có sau khi đăng ký Zalo OA                      |

**Use cases**:

- ✅ OTP verification (thay SMS)
- ✅ Xác nhận đơn hàng
- ✅ Thông báo tích điểm loyalty
- ✅ Nhắc lịch đặt bàn
- ⚠️ Khuyến mãi (phải approve template trước, không spam)

**Yêu cầu onboarding**:

1. Đăng ký Zalo Official Account (OA) — có xác minh doanh nghiệp
2. Đăng ký ZNS service qua cổng Zalo Business
3. Submit và chờ approve từng template (~3–5 ngày/template)
4. Integrate API (trực tiếp hoặc qua Infobip)

**Lưu ý**: Zalo ZNS chỉ gửi được khi khách hàng đã từng tương tác với OA hoặc cung cấp số điện thoại. Nếu khách chưa dùng Zalo → fallback sang SpeedSMS.

---

### 3.2 SpeedSMS — SMS Fallback

**Lựa chọn**: ✅ **Fallback cho Zalo ZNS**

| Thuộc tính | Giá trị                              |
| ---------- | ------------------------------------ |
| Phí/tin    | 250–500 VND (tuỳ loại sender)        |
| API        | REST — POST /sms/send                |
| Batch      | Tối đa 100 số/request                |
| Onboarding | Tự đăng ký tại `connect.speedsms.vn` |
| Support    | 24/7 tiếng Việt                      |

**Luồng notification**:

```
Send notification
  → Có Zalo? → Zalo ZNS (300 VND)
  → Không có Zalo / Delivery failed → SpeedSMS (250–500 VND)
```

---

### 3.3 Resend.com — Transactional Email

**Lựa chọn**: ✅ **Email hóa đơn, xác nhận**

| Thuộc tính | Giá trị                                   |
| ---------- | ----------------------------------------- |
| Free tier  | 3,000 email/tháng                         |
| Trả phí    | $20/tháng cho 50k email                   |
| API        | REST, developer-friendly                  |
| SDK        | Node.js, Python, Go...                    |
| Use case   | Gửi PDF HĐĐT, xác nhận tài khoản, báo cáo |

**Không dùng Resend cho OTP** — quá chậm so với ZNS/SMS.

---

## 4. Giao Hàng (Delivery)

### 4.1 Ahamove — Dispatch nội bộ

**Lựa chọn**: ⏳ **Post-v1.0**

| Thuộc tính | Giá trị                                       |
| ---------- | --------------------------------------------- |
| API        | REST — `developers.ahamove.com`               |
| Sandbox    | ✅ Staging environment                        |
| Phí        | Theo công thức: Base + (Step × Km) + Stop fee |
| Mạng lưới  | 300,000+ shipper, 200k+ đơn/ngày              |
| Onboarding | Submit form → API Key qua email               |

**Use case**: Restaurant dispatch khi nhận order online/delivery, gọi Ahamove thay vì shipper nội bộ.

---

### 4.2 GrabFood — Nền tảng giao đồ ăn

**Lựa chọn**: ⏳ **Post-v1.0**

| Thuộc tính         | Giá trị                                         |
| ------------------ | ----------------------------------------------- |
| API                | REST + OAuth2 — `partner-api.grab.com/grabfood` |
| SDK                | Java, Python, Go                                |
| Commission         | 25–30%/đơn (25% năm đầu)                        |
| Phí đăng ký        | 1,200,000 VND (tại HCM/HN)                      |
| Integration time   | 7–10 ngày sau khi đăng ký                       |
| Direct integration | Cần partner status hoặc qua POS provider        |

**Lưu ý**: GrabFood thường integrate thông qua middleware (Deliverect, GetOrder...) thay vì direct API. Cần evaluate cost-benefit trước khi integrate.

---

### 4.3 ShopeeFood — Nền tảng giao đồ ăn #2

**Lựa chọn**: ⏳ **Post-v1.0 — Khó**

| Thuộc tính | Giá trị                                       |
| ---------- | --------------------------------------------- |
| API        | ❌ Không có public API                        |
| Access     | Restricted — chỉ large partners               |
| Onboarding | Liên hệ trực tiếp ShopeeFood merchant support |

**Kết luận**: ShopeeFood không có public API. Cần partnership negotiation riêng. Không prioritize trước GrabFood.

---

## 5. Pháp Lý & Compliance

### 5.1 BHXH — Bảo hiểm xã hội

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

### 5.2 eTax / HTKK — Kê khai thuế GTGT

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

## 6. Supabase Auth — OTP qua SMS

**Lựa chọn**: ✅ **Custom SMS Hook → SpeedSMS / Zalo ZNS**

Supabase Auth hỗ trợ SMS OTP natively nhưng chỉ qua Twilio/Vonage (quá đắt với VN).

**Giải pháp**: Dùng **Send SMS Hook** của Supabase để plug-in provider VN:

```typescript
// supabase/functions/custom-sms-hook/index.ts
// Trigger: auth.send_sms
// Payload: { user: { phone }, otp }

// Logic:
// 1. Thử Zalo ZNS nếu phone đã opt-in
// 2. Fallback: SpeedSMS API
// 3. Log delivery status
```

---

## 7. Chi phí ước tính hàng tháng

Giả định: 500 order/ngày, 5 chi nhánh, ~15,000 order/tháng

| Service                            | Volume      | Đơn giá    | Chi phí/tháng             |
| ---------------------------------- | ----------- | ---------- | ------------------------- |
| MISA meInvoice                     | 15,000 HĐ   | 300 VND    | **4,500,000 VND**         |
| Zalo ZNS (order confirm + loyalty) | 20,000 tin  | 300 VND    | **6,000,000 VND**         |
| SpeedSMS (OTP fallback ~10%)       | 2,000 tin   | 400 VND    | **800,000 VND**           |
| Resend email                       | 5,000 email | Free tier  | **0 VND**                 |
| VietQR (qua ngân hàng)             | 15,000 txn  | ~1,600 VND | **24,000,000 VND**        |
| MoMo                               | Variable    | **0%**     | **0 VND**                 |
| **Tổng**                           |             |            | **~35,300,000 VND/tháng** |

> ⚠️ Phí VietQR là lớn nhất — cần negotiate với ngân hàng đối tác để có gói merchant tốt hơn. Nhiều ngân hàng có gói 0 VND/giao dịch cho SME khi đạt volume.

---

## 8. Thứ tự tích hợp theo Module

| Module            | Tích hợp                                              |
| ----------------- | ----------------------------------------------------- |
| **M4 Payment**    | VietQR + MoMo                                         |
| **M6 Finance**    | MISA meInvoice + Resend email                         |
| **M7 Nhân sự & tiền lương** | Xuất data BHXH / thuế TNCN (no API, just export)      |
| **Post-v1.0**     | Zalo ZNS, SpeedSMS, ZaloPay, VNPay, GrabFood, Ahamove |

---

## 9. Environment Variables cần thiết

```bash
# Payment
NEXT_PUBLIC_APP_URL=https://pos.comtammatu.vn # HTTPS public; MoMo gọi IPN vào URL này

VIETQR_API_KEY=
VIETQR_BANK_ID=          # Mã ngân hàng đối tác
VIETQR_ACCOUNT_NO=       # Số tài khoản merchant
VIETQR_ACCOUNT_NAME=     # Tên chủ tài khoản hiển thị trên QR

MOMO_PARTNER_CODE=       # Mã đối tác do MoMo cấp
MOMO_ACCESS_KEY=         # Access key do MoMo cấp
MOMO_SECRET_KEY=         # Secret key dùng ký request + verify IPN
MOMO_SANDBOX=true        # true=test-payment.momo.vn, false/unset=production
MOMO_REDIRECT_URL=       # Optional trang khách sau thanh toán; không trỏ về POS

# HĐĐT
EINVOICE_PROVIDER=misa   # misa | viettel | vnpt
MISA_EINVOICE_USERNAME=
MISA_EINVOICE_PASSWORD=
MISA_EINVOICE_TAX_CODE=
MISA_EINVOICE_TEMPLATE=
MISA_EINVOICE_SERIES=

# Notifications
ZALO_OA_ACCESS_TOKEN=
ZALO_APP_ID=
SPEEDSMS_TOKEN=
RESEND_API_KEY=
```

> Tất cả secrets phải được lưu trong Supabase Vault / Vercel Environment Variables — **KHÔNG commit vào code**.

---

## Tài liệu liên quan

- `docs/ref/einvoice-tax.md` — Chi tiết HĐĐT, state machine, DB schema
- `docs/ref/payroll-pit.md` — BHXH, thuế TNCN, export data cho kế toán
- `docs/spec/architecture.md` — Edge Functions, proxy layer
