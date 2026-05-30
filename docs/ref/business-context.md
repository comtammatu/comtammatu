# Bối cảnh nghiệp vụ — Cơm Tấm Má Tư CTCP

## Sản phẩm

**Bộ phần mềm quản lý vận hành và bán hàng** cho chuỗi cơm tấm Cơm Tấm Má Tư CTCP.

Phạm vi sản phẩm: POS, KDS, thực đơn, nhân sự, kho hàng, thanh toán, kế toán (HĐĐT/VAS), và nhân sự & tiền lương.
Nhiệm vụ hệ thống: bán đúng, bếp nhận đúng, thu tiền đúng, in/hóa đơn đúng,
kho trừ đúng, và chủ/quản lý nhìn được tình trạng vận hành thật theo ngày.
Đây là hệ thống quản lý vận hành nhà hàng chuyên biệt: gom lớp nền, báo cáo,
và các domain vận hành vào một kiến trúc thống nhất.
Không phải nền tảng nhiều merchant, không phải CRM độc lập, không phải ERP đa ngành, không phải phần mềm bán hàng đại trà.

## Mô hình pháp lý

Cơm Tấm Má Tư vận hành theo mô hình **Công ty Cổ Phần (CTCP)**. Nghĩa vụ pháp lý bắt buộc:

### 1. HĐĐT — hóa đơn điện tử (v0.3.0)

- **NĐ 70/2025**: mọi giao dịch B2C phải có hóa đơn điện tử
- Cần Edge Function `einvoice-submit`, hỗ trợ nhiều provider
- Bảng `tax_invoices` lưu trạng thái hóa đơn

### 2. Nhân sự & tiền lương CTCP (v0.5.0)

- **BHXH bắt buộc**: NLĐ đóng 8%, NSDLĐ đóng 17.5%
- **Thuế TNCN**: lũy tiến theo biểu thuế
- Quyết toán cuối năm
- Bảng lương hàng tháng

### 3. Báo cáo tài chính VAS (v0.5.0)

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

## Domain: chuỗi nhà hàng F&B

### Luồng mua hàng (v0.4.0)

```
PO (intent) → GRN (actual received) → Supplier Invoice (VAT)
                                        ↓
                                   3-way matching → VAT deduction
```

- **PO** = Purchase Order (đặt hàng)
- **GRN** = Goods Received Note (phiếu nhập kho — hàng thực nhận)
- **Supplier Invoice** = hóa đơn đầu vào (cho khấu trừ VAT)
- Giá vốn thực tế lấy từ GRN, KHÔNG lấy từ PO

### Luồng bán hàng (v0.3.0)

```
Waiter (POS) → KDS (realtime) → Chef bumps → Cashier pays → completed
```

### Vai trò nhân sự (8 cấp)

```
owner > super_manager > area_manager > branch_manager > cashier > waiter > chef > office
```

### Phương thức thanh toán (v0.3.0)

- Tiền mặt
- VietQR (bank transfer)
- Momo (e-wallet)
- VNPay (post-v1.0)
