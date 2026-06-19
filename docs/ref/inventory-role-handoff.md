# Inventory Role Handoff — 1 Trang

> Dùng cho training nhanh đội vận hành  
> Mô hình vận hành: `chi nhánh`, `Kho CN`, `Bếp CN`

---

## 0. Cách dùng

Tài liệu này là bản training 1 trang.

- Dùng để nhắc đúng flow và các lỗi không được làm.
- Không dùng tài liệu này để suy ra quyền truy cập hệ thống.
- Quyền thật xem ở [inventory-rbac-matrix.md](inventory-rbac-matrix.md).

---

## 1. Luồng chuẩn

1. chi nhánh nhập nguyên liệu từ nhà cung cấp bằng `PO` và `GRN`.
2. chi nhánh có thể chuyển hàng sang chi nhánh khác hoặc nhập thẳng về Kho CN bằng `stock_transfer`.
3. Nếu sản xuất tập trung, chi nhánh tạo `production_order` để sản xuất thành phẩm.
4. chi nhánh có thể chuyển thành phẩm sang chi nhánh khác bằng `stock_transfer`.
5. Kho CN cấp phát xuống Bếp CN theo nhu cầu bán.
6. Cuối ngày các site kiểm kê và xử lý chênh lệch nếu có.

## 2. Thủ kho chi nhánh

Trong hệ thống hiện tại, vai trò này thường map vào `warehouse_manager`.

### Việc phải làm

- Tạo `PO` cho nhà cung cấp.
- Tạo và xác nhận `GRN` khi hàng tới tại chi nhánh.
- Kiểm đúng số lượng, đơn giá, batch, hạn dùng.
- Tạo transfer từ chi nhánh sang chi nhánh khác hoặc nhập về Kho CN.

### Không được làm

- GRN chỉ được tạo tại site `branch_kind = 'branch'`.
- Không sửa tay tồn kho nếu lệch số.
- Không ép mọi flow phải qua chi nhánh khác nếu hàng được nhập thẳng vào Kho CN.

### Checklist cuối ngày

- Tất cả `GRN` đã confirm.
- Không còn transfer chi nhánh → chi nhánh hoặc Kho CN → Bếp CN bị treo bất thường.
- Hóa đơn NCC mới đã được chuyển cho kế toán / OPS nếu có.

## 3. Bếp trưởng / Quản lý chi nhánh

Trong hệ thống hiện tại, flow này do `production_manager` thao tác.

### Việc phải làm

- Xác nhận nhận nguyên liệu từ chi nhánh.
- Tạo `production_order` đúng thành phẩm và đúng số lượng.
- Chỉ confirm sản xuất khi BOM đầy đủ và nguyên liệu đủ.
- Tạo transfer thành phẩm sang chi nhánh khác.

### Không được làm

- Không xác nhận lệnh sản xuất khi thiếu nguyên liệu hoặc thiếu BOM.
- Không xuất thành phẩm đi chi nhánh trước khi lệnh sản xuất hoàn tất.
- Không dùng chi nhánh như điểm bán trực tiếp trong flow Inventory.

### Checklist cuối ngày

- Tất cả `production_order` đã ở `completed` hoặc `cancelled`.
- Không còn transfer đi chi nhánh treo bất thường.
- Thành phẩm còn tồn phải có lý do rõ ràng.

## 4. Quản lý chi nhánh

Trong hệ thống hiện tại, vai trò này map vào `branch_manager`.

### Việc phải làm

- Xác nhận nhận hàng từ chi nhánh.
- Xác nhận nhận hàng trực tiếp từ chi nhánh khác khi có.
- Theo dõi tồn tại Kho CN và cấp phát xuống Bếp CN.
- Đảm bảo order/POS được chốt đúng luồng.
- Kiểm kê cuối ngày cho các mặt hàng trọng yếu.

### Không được làm

- Không tự nhập nguyên liệu từ NCC trong flow Inventory của quản lý chi nhánh.
- Không chỉnh tay tồn kho để “khớp số”.
- Không bỏ qua chênh lệch kiểm kê lặp lại nhiều ngày.

### Checklist cuối ngày

- Tất cả transfer đến đã được nhận hoặc ghi rõ lý do treo.
- POS đã chốt đủ order.
- Chênh lệch lớn đã được báo lại cho OPS.

## 5. Kế toán / OPS

Trong hệ thống hiện tại, phần AP/reporting có thể đi qua `owner` hoặc các module `finance` / `reports`, không mặc định là Inventory operator riêng.

### Việc phải làm

- Đối soát `PO -> GRN`; `supplier_invoice` là Finance handoff khi được bật.
- Theo dõi transfer treo và chênh lệch kiểm kê.
- Theo dõi giá vốn; AP aging là Finance handoff, không phải daily Inventory gate.
- Báo lại các site nếu có số liệu bất thường.

### Theo dõi mỗi ngày

- Transfer treo quá SLA.
- Production order fail do thiếu BOM hoặc thiếu nguyên liệu.
- Chênh lệch kiểm kê theo site.
- Hàng cận date / hết hạn.

## 6. Xử lý nhanh khi có sự cố

| Sự cố                  | Hành động đúng                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------- |
| NCC giao thiếu         | Ghi đúng thực nhận trên `GRN`                                                       |
| Bếp thiếu nguyên liệu  | Tạo transfer bổ sung từ Kho CN xuống Bếp CN                                          |
| Chi nhánh cần hàng gấp | Có thể nhận trực tiếp từ chi nhánh khác tùy loại hàng và vận hành thực tế           |
| Thiếu BOM              | Dừng confirm sản xuất, cập nhật BOM trước                                           |
| Chi nhánh nhận thiếu   | Xác nhận theo thực nhận và ghi chú chênh lệch                                       |
| Lệch tồn cuối ngày     | Dùng `stocktake` / `adjustment`, không sửa tay                                      |

## 7. Mở đúng tài liệu khi cần

- Chi tiết nghiệp vụ: [inventory.md](inventory.md)
- Ma trận quyền: [inventory-rbac-matrix.md](inventory-rbac-matrix.md)
- SOP đầy đủ: [inventory-sop.md](inventory-sop.md)
- Roadmap và phạm vi hiện tại: [../../tasks/todo.md](../../tasks/todo.md)
