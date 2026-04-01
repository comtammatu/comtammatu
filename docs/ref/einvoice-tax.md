# HĐĐT & Thuế GTGT — Hóa Đơn Điện Tử & Giá Trị Gia Tăng

> Áp dụng: Cơm Tấm Má Tư CTCP — mô hình F&B multi-branch
> Khung pháp lý: NĐ 123/2020, NĐ 70/2025, TT 78/2021, Luật Thuế GTGT 2024

---

## 1. Tổng quan nghĩa vụ pháp lý

Cơm Tấm Má Tư CTCP là **doanh nghiệp đăng ký nộp thuế GTGT theo phương pháp khấu trừ**. Điều này có nghĩa:

- Thuế GTGT đầu ra (thu từ khách hàng) → kê khai + nộp cho Cục Thuế
- Thuế GTGT đầu vào (trả cho nhà cung cấp) → được **khấu trừ** khỏi thuế phải nộp
- Thuế GTGT phải nộp = Đầu ra − Đầu vào (nếu âm → được hoàn thuế)

**NĐ 70/2025**: kể từ 01/07/2025, mọi giao dịch B2C tại doanh nghiệp đã đăng ký HĐĐT phải xuất hóa đơn điện tử. Không được xuất hóa đơn giấy.

---

## 2. Thuế suất GTGT áp dụng cho F&B

| Loại hàng hóa / dịch vụ                    | Thuế suất | Ghi chú                                                        |
| ------------------------------------------ | --------- | -------------------------------------------------------------- |
| Thực phẩm chế biến tại chỗ (ăn uống)       | **8%**    | Áp dụng từ 01/07/2023, gia hạn đến 31/12/2025 theo NQ 142/2024 |
| Đồ uống có cồn                             | **10%**   | Bia, rượu                                                      |
| Đồ uống không cồn                          | **8%**    | Nước ngọt, trà, cà phê đóng chai                               |
| Nguyên liệu thực phẩm thô (rau, thịt, gạo) | **5%**    | Khi mua từ nhà cung cấp                                        |
| Dịch vụ vận chuyển nội địa                 | **8%**    | Phí giao hàng nếu có                                           |
| Xuất khẩu                                  | **0%**    | Không áp dụng                                                  |

> ⚠️ **Dev note**: Trường `vat_rate` trong bảng `tax_invoices` và `supplier_invoices` lưu dưới dạng `NUMERIC(5,2)` (ví dụ: `8.00`, `10.00`). Không lưu dưới dạng thập phân `0.08`.

---

## 3. HĐĐT Đầu Ra (bán hàng cho khách)

### 3.1 Quy trình xuất hóa đơn

```
Khách yêu cầu HĐ → Cashier nhập thông tin → Hệ thống tạo draft
     → Ký số (HSM của provider) → Gửi CQT (Cục Quản lý Thuế)
     → CQT cấp mã → Gửi HĐ cho khách (email / in QR)
```

**Thời hạn**: Hóa đơn phải được cấp mã bởi CQT **trước khi** giao cho khách. Không được giao HĐ chưa có mã.

### 3.2 Thông tin bắt buộc trên HĐĐT đầu ra

```
- Tên, địa chỉ, MST người bán (lấy từ bảng tenants)
- Tên, địa chỉ, MST người mua (nếu B2B; B2C có thể để trống MST)
- Số thứ tự hóa đơn (do CQT cấp / provider cấp)
- Ngày lập hóa đơn
- Tên hàng hóa, đơn vị, số lượng, đơn giá
- Thành tiền chưa thuế
- Thuế suất GTGT
- Tiền thuế GTGT
- Tổng tiền thanh toán
- Chữ ký số của người bán
```

### 3.3 Các trạng thái HĐĐT (state machine)

```
draft → signing → submitted → issued   ← trạng thái cuối (hợp lệ)
                             ↓
                          cancelled    ← hủy hợp lệ (phải lập biên bản)
                             ↓
                          replaced     ← thay thế bằng HĐ mới
```

| Trạng thái  | Mô tả              | Cho phép hủy?       |
| ----------- | ------------------ | ------------------- |
| `draft`     | Chưa ký, chưa gửi  | Có (xóa luôn)       |
| `signing`   | Đang ký số (async) | Không               |
| `submitted` | Đã gửi CQT, chờ mã | Không               |
| `issued`    | Đã có mã CQT       | Chỉ hủy có biên bản |
| `cancelled` | Đã hủy             | Không               |
| `replaced`  | Đã thay thế        | Không               |

### 3.4 Database — bảng `tax_invoices`

```sql
CREATE TABLE tax_invoices (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id           BIGINT NOT NULL REFERENCES tenants(id),
  branch_id           BIGINT NOT NULL REFERENCES branches(id),
  order_id            BIGINT REFERENCES orders(id),           -- B2C

  -- Trạng thái
  status              TEXT NOT NULL DEFAULT 'draft',          -- draft|signing|submitted|issued|cancelled|replaced

  -- Thông tin người mua (B2B)
  buyer_name          TEXT,
  buyer_tax_code      TEXT,
  buyer_address       TEXT,
  buyer_email         TEXT,

  -- Số liệu thuế
  subtotal            NUMERIC(15,2) NOT NULL,                 -- tiền trước thuế
  vat_rate            NUMERIC(5,2) NOT NULL DEFAULT 8.00,     -- 8.00 | 10.00 | 5.00
  vat_amount          NUMERIC(15,2) NOT NULL,                 -- subtotal * vat_rate / 100
  total_amount        NUMERIC(15,2) NOT NULL,                 -- subtotal + vat_amount

  -- Provider
  provider            TEXT NOT NULL,                          -- 'viettel' | 'misa' | 'vnpt'
  provider_invoice_id TEXT,                                   -- ID phía provider
  cqt_code            TEXT,                                   -- Mã CQT cấp (sau khi issued)
  invoice_number      TEXT,                                   -- Số hóa đơn (ký hiệu + số thứ tự)
  invoice_series      TEXT,                                   -- Ký hiệu mẫu, ví dụ: "1C25TLL"

  -- Tài liệu
  pdf_url             TEXT,                                   -- Link PDF đã ký
  xml_url             TEXT,                                   -- Link XML gốc

  -- Hủy / thay thế
  cancel_reason       TEXT,
  replaced_by_id      BIGINT REFERENCES tax_invoices(id),

  -- Timestamps
  issued_at           TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 4. HĐGT Đầu Vào (mua nguyên liệu từ nhà cung cấp)

### 4.1 Điều kiện để được khấu trừ VAT đầu vào

1. Hóa đơn hợp lệ (có mã CQT, đúng thông tin MST người mua)
2. Thanh toán qua ngân hàng cho giao dịch ≥ 20 triệu VND (TT 25/2018)
3. Hàng hóa thực sự nhận đủ (có GRN xác nhận)
4. Kê khai đúng kỳ thuế (trong tháng hoặc trước ngày 20 tháng sau)

> ⚠️ **3-way matching**: Hệ thống phải verify PO → GRN → Supplier Invoice trước khi cho phép kê khai VAT đầu vào. Chi tiết xem `docs/ref/inventory.md`.

### 4.2 Database — bảng `supplier_invoices`

```sql
CREATE TABLE supplier_invoices (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id           BIGINT NOT NULL REFERENCES tenants(id),
  supplier_id         BIGINT NOT NULL REFERENCES suppliers(id),
  grn_id              BIGINT REFERENCES goods_received_notes(id),
  po_id               BIGINT REFERENCES purchase_orders(id),

  invoice_number      TEXT NOT NULL,                          -- Số HĐ của nhà cung cấp
  invoice_date        TIMESTAMPTZ NOT NULL,

  subtotal            NUMERIC(15,2) NOT NULL,
  vat_rate            NUMERIC(5,2) NOT NULL,
  vat_amount          NUMERIC(15,2) NOT NULL,
  total_amount        NUMERIC(15,2) NOT NULL,

  -- Trạng thái khớp 3 chiều
  matching_status     TEXT NOT NULL DEFAULT 'pending',        -- pending|matched|discrepancy|approved
  matching_notes      TEXT,

  -- Thanh toán
  payment_status      TEXT NOT NULL DEFAULT 'unpaid',         -- unpaid|partial|paid
  payment_method      TEXT,                                   -- 'bank_transfer' | 'cash'
  paid_at             TIMESTAMPTZ,

  -- Kê khai thuế
  declared_period     TEXT,                                   -- 'YYYY-MM' kỳ kê khai
  is_vat_deductible   BOOLEAN NOT NULL DEFAULT false,

  pdf_url             TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(invoice_number, supplier_id, tenant_id)
);
```

---

## 5. Provider HĐĐT

Hệ thống hỗ trợ nhiều provider. Config lưu trong `system_settings` với key `einvoice_provider`.

| Provider        | API endpoint                       | Ghi chú              |
| --------------- | ---------------------------------- | -------------------- |
| ViettelSinvoice | `https://sinvoice.viettel.vn/api/` | Phổ biến nhất tại VN |
| MISA Meeinvoice | `https://ws.meeinvoice.com.vn/`    | Dùng nhiều trong SME |
| VNPT-Invoice    | `https://einvoice.vnpt.vn/`        | Tùy chọn             |

### Config cần thiết (lưu trong `system_settings`, encrypted)

```
einvoice_provider        = 'viettel' | 'misa' | 'vnpt'
einvoice_username        = [tài khoản đăng ký với provider]
einvoice_password        = [mật khẩu API]
einvoice_template_code   = [mã mẫu hóa đơn đã đăng ký, ví dụ: "01GTKT0/001"]
einvoice_series          = [ký hiệu hóa đơn, ví dụ: "1C25TLL"]
einvoice_cert_serial     = [serial chứng thư số]
```

### Edge Function `einvoice-submit`

```typescript
// Nhận: { invoice_id: number }
// Quy trình:
// 1. Load tax_invoice từ DB (status phải là 'draft')
// 2. Cập nhật status → 'signing'
// 3. Gọi provider API: POST /api/InvoiceAPI/createInvoice
// 4. Nhận response: { invoiceNo, reservationCode }
// 5. Gọi CQT để lấy mã: POST /api/InvoiceAPI/getInvoiceTransactionID
// 6. Cập nhật: status = 'issued', cqt_code, invoice_number, pdf_url
// 7. Nếu lỗi bất kỳ bước → status = 'draft', log error
```

---

## 6. Kê khai & báo cáo thuế

### Kê khai thuế GTGT hàng tháng (Tờ khai 01/GTGT)

- **Hạn nộp**: ngày 20 tháng tiếp theo (ví dụ: tháng 3 → nộp trước 20/4)
- **Dữ liệu cần**: tổng GTGT đầu ra (từ `tax_invoices WHERE status = 'issued'`) và tổng GTGT đầu vào (từ `supplier_invoices WHERE is_vat_deductible = true`)
- **Nộp qua**: eTax Mobile hoặc phần mềm kế toán — **không nộp trực tiếp từ hệ thống này**

### Dữ liệu hệ thống cung cấp cho kế toán

```sql
-- Tổng GTGT đầu ra theo tháng
SELECT
  DATE_TRUNC('month', issued_at) AS period,
  SUM(subtotal) AS total_before_vat,
  SUM(vat_amount) AS total_vat_out,
  SUM(total_amount) AS total_revenue
FROM tax_invoices
WHERE tenant_id = $1
  AND status = 'issued'
  AND issued_at BETWEEN $2 AND $3
GROUP BY 1 ORDER BY 1;

-- Tổng GTGT đầu vào có thể khấu trừ
SELECT
  declared_period,
  SUM(vat_amount) AS total_vat_in
FROM supplier_invoices
WHERE tenant_id = $1
  AND is_vat_deductible = true
GROUP BY 1 ORDER BY 1;
```

---

## 7. Xử lý lỗi thường gặp

| Lỗi                        | Nguyên nhân                    | Xử lý                                             |
| -------------------------- | ------------------------------ | ------------------------------------------------- |
| CQT từ chối cấp mã         | MST không hợp lệ, sai template | Kiểm tra `einvoice_template_code` trong settings  |
| Timeout khi gọi provider   | Mạng chậm                      | Edge Function retry 3 lần với exponential backoff |
| HĐ đã issued nhưng cần sửa | Sai thông tin người mua        | Hủy HĐ cũ + lập biên bản + xuất HĐ thay thế       |
| Provider trả lỗi duplicate | Gọi API 2 lần                  | Kiểm tra `provider_invoice_id` trước khi gọi lại  |

---

## 8. Quyền truy cập (ACL)

| Hành động          | Roles được phép                                                       |
| ------------------ | --------------------------------------------------------------------- |
| Xem danh sách HĐĐT | `branch_manager`, `cashier`, `area_manager`, `super_manager`, `owner` |
| Xuất HĐĐT mới      | `cashier`, `branch_manager` trở lên                                   |
| Hủy HĐĐT           | `branch_manager` trở lên                                              |
| Config provider    | `super_manager`, `owner`                                              |
| Xem báo cáo thuế   | `area_manager` trở lên                                                |

---

## Tài liệu liên quan

- `docs/ref/inventory.md` — 3-way matching GRN / PO / Supplier Invoice
- `docs/spec/database-schema.md` — Schema đầy đủ
- `docs/plan/sprint-3.md` — Sprint HĐĐT + Procurement
