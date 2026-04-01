# Business Context — Cơm Tấm Má Tư CTCP

## Mô hình pháp lý

Cơm Tấm Má Tư vận hành theo mô hình **Công ty Cổ Phần (CTCP)**. Nghĩa vụ pháp lý bắt buộc:

### 1. HĐĐT — E-invoicing (v0.3.0)

- **NĐ 70/2025**: mọi giao dịch B2C phải có hóa đơn điện tử
- Cần Edge Function `einvoice-submit`, multi-provider support
- Bảng `tax_invoices` lưu trạng thái hóa đơn

### 2. HR/Payroll CTCP (v0.5.0)

- **BHXH bắt buộc**: NLĐ đóng 8%, NSDLĐ đóng 17.5%
- **Thuế TNCN**: lũy tiến theo biểu thuế
- Quyết toán cuối năm
- Bảng lương hàng tháng

### 3. Finance Reporting VAS (v0.5.0)

- BCTC theo chuẩn **VAS** (Vietnamese Accounting Standards):
  - Bảng cân đối kế toán
  - Kết quả kinh doanh
  - Lưu chuyển tiền tệ

## Yêu cầu pháp lý cho tenants table

```
legal_name TEXT       — Tên đầy đủ pháp nhân
tax_code TEXT UNIQUE  — MST 10 hoặc 13 số
legal_address TEXT    — Địa chỉ đăng ký kinh doanh
representative TEXT   — Người đại diện pháp luật
```

## Domain: F&B Restaurant Chain

### Procurement Flow (v0.4.0)

```
PO (intent) → GRN (actual received) → Supplier Invoice (VAT)
                                        ↓
                                   3-way matching → VAT deduction
```

- **PO** = Purchase Order (đặt hàng)
- **GRN** = Goods Received Note (phiếu nhập kho — hàng thực nhận)
- **Supplier Invoice** = HĐĐT đầu vào (cho khấu trừ VAT)
- Actual food cost = từ GRN, KHÔNG từ PO

### Order Flow (v0.3.0)

```
Waiter (POS) → KDS (realtime) → Chef bumps → Cashier pays → completed
```

### Staff Roles (8 levels)

```
owner > super_manager > area_manager > branch_manager > cashier > waiter > chef > office
```

### Payment Methods (v0.3.0)

- Tiền mặt
- VietQR (bank transfer)
- Momo (e-wallet)
- VNPay (post-v1.0)
