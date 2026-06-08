# Bối cảnh nghiệp vụ — Hộ Kinh Doanh Cơm Tấm Má Tư

## Sản phẩm

**Bộ phần mềm quản lý vận hành và bán hàng** cho **Hộ Kinh Doanh** Cơm Tấm Má Tư (các chi nhánh ngang hàng).

Phạm vi sản phẩm (lean HKD): POS (pay-after + giảm giá theo món), KDS, thực đơn, kho-lean (GRN + kiểm kê), thanh toán, HĐĐT, chấm công + xếp lịch (`shift_assignments`), sổ quỹ, và công nợ nhà cung cấp.
Nhiệm vụ hệ thống: bán đúng, bếp nhận đúng, thu tiền đúng, in/hóa đơn đúng,
và chủ/quản lý nhìn được tình trạng vận hành thật theo ngày.
Đây là hệ thống quản lý vận hành nhà hàng chuyên biệt: gom lớp nền, báo cáo,
và các domain vận hành vào một kiến trúc thống nhất.
Không phải nền tảng nhiều merchant, không phải CRM độc lập, không phải ERP đa ngành, không phải phần mềm bán hàng đại trà.

> **Đã CUT khỏi lean HKD baseline:** kế toán GL/VAS/BCTC, engine tiền lương (BHXH/PIT), kho nặng (luân chuyển/xuất/hủy/sản xuất/PO/định mức/QC/ABC), trừ kho theo từng đơn bán, feedback/CRM/telegram/AI, và mô hình vùng (area + area_manager).

## Mô hình pháp lý

Cơm Tấm Má Tư là **Hộ Kinh Doanh** (household business), không phải công ty cổ phần. Theo TT 88/2021, hộ kinh doanh dùng **sổ sách kế toán đơn giản** (không lập BCTC/VAS đầy đủ); bảng lương cho dưới ~5 nhân sự xử lý ngoài hệ thống (Excel). Vì vậy các nghĩa vụ phụ thuộc kế toán hình thức (BCTC VAS, payroll engine BHXH/PIT) **không** thuộc phạm vi sản phẩm hiện tại.

### Nghĩa vụ vẫn áp dụng: HĐĐT — hóa đơn điện tử

- **NĐ 70/2025**: mọi giao dịch B2C phải có hóa đơn điện tử.
- Tích hợp Viettel S-invoice (provider hiện hành).
- Bảng `tax_invoices` / `tax_invoice_orders` / `tax_invoice_events` lưu trạng thái hóa đơn.

## Yêu cầu pháp lý cho bảng `tenants`

`tenant_id` được giữ có chủ đích làm khóa scope (single-tenant: một hộ kinh doanh), không phải hạ tầng multi-tenant thừa.

```
legal_name TEXT       — Tên đăng ký hộ kinh doanh
tax_code TEXT UNIQUE  — MST hộ kinh doanh
legal_address TEXT    — Địa chỉ đăng ký kinh doanh
representative TEXT   — Người đại diện (chủ hộ) — free-text trên giấy tờ, không phải user identity
```

## Domain: chuỗi nhà hàng F&B

### Luồng mua hàng (lean — flat-branch, không PO/3-way)

```
NCC → GRN (mỗi chi nhánh tự nhập) → stock_levels theo chi nhánh
                                   → công nợ NCC (supplier_invoices / supplier_payments)
```

- **GRN** = Goods Received Note (phiếu nhập kho — hàng thực nhận tại từng chi nhánh).
- Không có Purchase Order, không 3-way matching, không Kho Tổng — mỗi chi nhánh nhập hàng trực tiếp từ NCC.
- Đối soát tồn bằng **kiểm kê định kỳ (stocktake-variance)**, không trừ kho theo từng đơn bán.
- Công nợ NCC được theo dõi qua `supplier_invoices` + `supplier_payments`.

### Luồng bán hàng

```
Staff (POS, pay-after + giảm giá món) → KDS (realtime) → Chef bumps → thu tiền → completed
```

### Vai trò nhân sự (4 cấp — lean HKD)

```
owner > manager > staff > chef
```

(8–10 cấp cũ — `super_manager`, `area_manager`, `branch_manager`, `cashier`, `waiter`, `office` — đã gỡ; `office` map về `staff`.)

### Phương thức thanh toán

- Tiền mặt
- VietQR (bank transfer)
- Momo (e-wallet)
- VNPay (post-v1.0)
