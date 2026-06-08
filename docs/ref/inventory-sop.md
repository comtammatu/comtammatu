# SOP Inventory — Lean Flat-Branch (Hộ Kinh Doanh)

> ## ⚠️ LEAN HKD REFRAME (2026-06) — đọc trước
>
> SOP gốc bên dưới viết cho mô hình multi-warehouse cũ (Kho Tổng / Bếp Trung Tâm / Kho chi nhánh / Bếp chi nhánh + luân chuyển + production). **Mô hình đó đã CUT.**
>
> **SOP hiện hành (flat-branch):** mỗi chi nhánh tự thực hiện trọn vòng: **GRN (nhập trực tiếp từ NCC) → cập nhật `stock_levels` → cảnh báo tồn → kiểm kê định kỳ (stocktake-variance) → điều chỉnh/xóa sổ thủ công.** Không có luân chuyển nội bộ, PO, 3-way matching, production order, hay trừ kho theo đơn bán. Roles: `owner`, `manager`, `staff`, `chef`.
>
> Phần SOP multi-warehouse bên dưới là tham chiếu lịch sử; chỉ các bước GRN + stocktake + alert còn áp dụng.

> Áp dụng: Hộ Kinh Doanh Cơm Tấm Má Tư  
> Phạm vi: Luồng vận hành kho-lean (GRN + stocktake) cho nguyên liệu, theo chi nhánh ngang hàng

---

## 0. Boundary

SOP này chỉ mô tả **luồng vận hành pilot**.

- Dùng để hướng dẫn thao tác và điểm kiểm soát.
- Không phải source of truth cho ACL module/route.
- Không mở rộng scope sang ERP/WMS như batch-first, vendor portal, approval nhiều cấp, hoặc payment engine.

Khi SOP và quyền hệ thống có vẻ mâu thuẫn, ưu tiên đọc thêm:

- [inventory.md](inventory.md)
- [inventory-rbac-matrix.md](inventory-rbac-matrix.md)

---

## 1. Mục tiêu

- Chuẩn hóa luồng nhập, sản xuất, luân chuyển, cấp phát nội bộ cho bếp chi nhánh, bán hàng, và kiểm kê.
- Giảm lệch tồn kho giữa hệ thống và thực tế.
- Đảm bảo mỗi bước đều có chứng từ và điểm kiểm soát rõ ràng.

## 2. Vai trò vận hành

Các nhãn dưới đây là **vai trò vận hành** để training.
Mapping với role thật trong hệ thống:

- HQ procurement / HQ inventory operator: chủ yếu map vào `super_manager`
- Central kitchen operator: hiện vẫn map vào `super_manager`
- Branch receiving / stocktake operator: map vào `branch_manager`
- Oversight: `area_manager` hoặc `super_manager` tùy scope hiện tại

Nếu cần chi tiết quyền xem/tạo/xác nhận, xem [inventory-rbac-matrix.md](inventory-rbac-matrix.md).

| Vai trò                            | Trách nhiệm chính                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| Thủ kho Kho Tổng / CW              | Nhập hàng từ NCC, GRN, quản lý tồn nguyên liệu CW, xuất hàng sang bếp trung tâm hoặc kho chi nhánh |
| Bếp trưởng / Quản lý bếp trung tâm | Nhận nguyên liệu, tạo lệnh sản xuất, xác nhận thành phẩm, xuất thành phẩm sang kho chi nhánh       |
| Quản lý chi nhánh                  | Nhận hàng vào kho chi nhánh, cấp phát xuống bếp chi nhánh, xác nhận chênh lệch, kiểm kê cuối ngày  |
| Kế toán / OPS                      | Đối soát giá vốn, hóa đơn NCC, luân chuyển nội bộ, báo cáo chênh lệch                              |

## 3. Chứng từ chuẩn

| Bước                                     | Chứng từ / thao tác hệ thống  | Kết quả kho                                                                          |
| ---------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| Mua từ NCC                               | `PO`, `GRN`                   | Tăng tồn nguyên liệu tại CW hoặc CK                                                  |
| CW cấp phát cho bếp trung tâm            | `stock_transfer`              | CW giảm, bếp trung tâm tăng nguyên liệu                                              |
| CW cấp phát cho kho chi nhánh            | `stock_transfer`              | CW giảm, kho chi nhánh tăng tồn                                                      |
| Bếp trung tâm sản xuất                   | `production_order`            | Bếp giảm nguyên liệu, tăng thành phẩm                                                |
| Bếp trung tâm cấp phát cho kho chi nhánh | `stock_transfer`              | Bếp giảm thành phẩm, kho chi nhánh tăng tồn                                          |
| Kho chi nhánh cấp phát cho bếp chi nhánh | intra-branch `stock_transfer` | Kho chi nhánh giảm; bếp chi nhánh/default consumption tăng trong cùng site chi nhánh |
| Chi nhánh bán hàng                       | POS / order completed         | Site chi nhánh giảm tồn theo tiêu hao                                                |
| Kiểm kê                                  | `stocktake` / `adjustment`    | Điều chỉnh về tồn thực tế                                                            |

## 4. Quy trình chuẩn

### 4.1 Nhập nguyên liệu về Kho Tổng hoặc Bếp Trung Tâm

1. Tạo `PO` cho nhà cung cấp, gắn với CW hoặc CK.
2. Khi hàng tới, tạo `GRN` tại CW hoặc CK.
3. Kiểm số lượng, đơn giá, batch, hạn dùng, nhiệt độ nhận hàng nếu cần.
4. Xác nhận `GRN` để cộng tồn CW/CK và cập nhật WAC.
5. Nếu Finance cần đối soát ngay, nhập `supplier_invoice` để làm 3-way matching với `PO` và `GRN`; đây là handoff Finance P1, không chặn Inventory pilot.

Điểm kiểm soát:

- GRN chỉ được tạo tại site có `branch_kind IN ('central_warehouse', 'central_kitchen')`.
- Không tạo `GRN` ở chi nhánh vận hành.
- Nếu thực nhận khác PO, vẫn ghi theo số thực nhận trên `GRN`.

### 4.2 Xuất hàng từ Kho Tổng

CW có thể cấp phát theo hai hướng hợp lệ trong pilot:

- **CW → Bếp trung tâm** khi cần sản xuất tập trung.
- **CW → Kho chi nhánh** khi hàng không cần qua bếp trung tâm.

#### 4.2.a CW -> Bếp trung tâm

1. Thủ kho CW tạo `stock_transfer` từ CW sang bếp trung tâm.
2. Xác nhận xuất để hệ thống trừ tồn CW.
3. Bếp trung tâm xác nhận nhận hàng để hệ thống cộng tồn nguyên liệu tại bếp.

Điểm kiểm soát:

- Chỉ chuyển nguyên liệu đầu vào ở bước này.
- Nếu có thiếu hụt khi nhận, ghi nhận theo số thực nhận và lý do.

#### 4.2.b CW -> Kho chi nhánh

1. Thủ kho CW tạo `stock_transfer` từ CW sang kho chi nhánh.
2. Xác nhận xuất để hệ thống trừ tồn CW.
3. Quản lý chi nhánh xác nhận nhận hàng để hệ thống cộng tồn tại site chi nhánh.

Điểm kiểm soát:

- Đây là flow hợp lệ, không bắt buộc phải đi qua bếp trung tâm.
- Dùng cho nguyên liệu hoặc hàng phù hợp vận hành chi nhánh.
- Nếu có thiếu hụt khi nhận, ghi đúng số thực nhận và lý do.

### 4.3 Sản xuất tại bếp trung tâm

1. Bếp trưởng tạo `production_order`.
2. Chọn thành phẩm `finished_good` và số lượng cần sản xuất.
3. Hệ thống kiểm tra BOM (`production_recipes`) và tồn nguyên liệu.
4. Xác nhận lệnh sản xuất.
5. Hệ thống atomically:
   - trừ nguyên liệu bằng `production_consumption`,
   - cộng thành phẩm bằng `production_output`,
   - cập nhật giá vốn sản xuất.

Điểm kiểm soát:

- Chỉ site `central_kitchen` mới được xác nhận lệnh sản xuất.
- Nếu thiếu nguyên liệu hoặc thiếu BOM, không xác nhận lệnh.

### 4.4 Xuất thành phẩm từ bếp trung tâm sang kho chi nhánh

1. Bếp trung tâm tạo `stock_transfer` từ bếp sang kho chi nhánh.
2. Xác nhận xuất để trừ tồn thành phẩm tại bếp.
3. Chi nhánh xác nhận nhận hàng để cộng tồn tại site chi nhánh.

Điểm kiểm soát:

- Chỉ chuyển `finished_good` ở bước này.
- Không coi bước này là con đường bắt buộc cho mọi hàng đi chi nhánh; HQ có thể chuyển thẳng về kho chi nhánh nếu phù hợp.

### 4.5 Kho chi nhánh cấp phát cho bếp chi nhánh

1. Quản lý chi nhánh điều phối hàng từ kho chi nhánh xuống bếp chi nhánh theo nhu cầu bán.
2. Tạo intra-branch `stock_transfer` từ location kho chi nhánh sang location bếp chi nhánh/default consumption.
3. Commit phiếu một bước để hệ thống trừ tồn location kho, cộng tồn location bếp, và lưu audit trail cấp phát nội bộ.
4. Không nhập hàng NCC trực tiếp tại bước này.

Điểm kiểm soát:

- Đây là bước nội bộ trong cùng site `branch`; không dùng state machine vận chuyển 5 bước.
- `stock_issue(issue_type = kitchen_use)` đã retired và không được dùng cho pilot.
- Không dùng fallback silent sang location khác; thiếu location bếp/default consumption là lỗi cấu hình phải sửa trước khi bán.
- Không bỏ qua ghi nhận luồng nội bộ nếu dẫn tới lệch giữa kho chi nhánh và bếp chi nhánh.

### 4.6 Bán hàng và tiêu hao tại chi nhánh

1. Chi nhánh nhận hàng vào kho chi nhánh.
2. Kho chi nhánh cấp phát xuống bếp chi nhánh.
3. POS / KDS xử lý bán hàng.
4. Khi order `completed`, hệ thống ghi tiêu hao tồn theo công thức vận hành hiện có.

Điểm kiểm soát:

- Nếu phát hiện thiếu hụt thực tế, không sửa tay vào tồn; dùng kiểm kê hoặc adjustment đúng luồng.

### 4.7 Kiểm kê cuối ngày

1. Tạo phiên `stocktake` cho từng site cần đếm.
2. Nhập số lượng đếm thực tế.
3. Hoàn tất kiểm kê để hệ thống ghi `count_adjustment`.
4. Kế toán / OPS xem báo cáo chênh lệch và xử lý nguyên nhân.

Điểm kiểm soát:

- Mỗi site chỉ có 1 phiên kiểm kê `in_progress` tại một thời điểm.
- Không bỏ qua kiểm kê khi có chênh lệch kéo dài nhiều ngày.

## 5. Ngoại lệ và cách xử lý

| Tình huống                          | Cách xử lý                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| NCC giao thiếu / giao dư            | Ghi đúng số thực nhận trên `GRN`, không sửa PO để che lệch                     |
| Hàng cận date / hỏng                | Dùng `adjustment` hoặc write-off theo lý do rõ ràng                            |
| Chi nhánh nhận thiếu hàng từ bếp    | Xác nhận theo số thực nhận, ghi chú chênh lệch để OPS đối soát                 |
| Chi nhánh nhận hàng trực tiếp từ HQ | Flow hợp lệ, không cần tạo bước qua bếp trung tâm chỉ để hợp thức hóa chứng từ |
| Thiếu BOM cho thành phẩm            | Không xác nhận sản xuất; cập nhật `production_recipes` trước                   |
| Thiếu nguyên liệu ở bếp trung tâm   | Tạo transfer bổ sung từ HQ, không âm kho thủ công                              |

## 6. Checklist cuối ngày

### Kho Tổng / CW

- Tất cả `GRN` trong ngày đã confirm.
- `supplier_invoice` mới được ghi nhận nếu Finance P1 đang vận hành; không coi là điều kiện đóng ngày của Inventory pilot.
- Không còn transfer CW → bếp trung tâm hoặc CW → kho chi nhánh bị treo vô lý.

### Bếp trung tâm / CK

- Tất cả `production_order` trong ngày đã ở `completed` hoặc `cancelled`.
- Không còn transfer đi chi nhánh treo vô lý.
- Thành phẩm sản xuất xong đã được xuất hoặc còn tồn hợp lệ.

### Chi nhánh

- Đã nhận đủ transfer trong ngày.
- Đã điều phối hợp lý từ kho chi nhánh xuống bếp chi nhánh nếu có.
- POS đã chốt order đầy đủ.
- Đã kiểm kê các mặt hàng trọng yếu nếu có biến động mạnh.

## 7. KPI vận hành gợi ý

- Tỷ lệ chênh lệch kiểm kê theo site.
- Số transfer treo quá SLA.
- Số production order bị fail do thiếu BOM hoặc thiếu nguyên liệu.
- Tỷ lệ nguyên liệu cận hạn / hết hạn.
- Số ngày AP outstanding với NCC.

## 8. Deferred Trong SOP Này

Những thứ dưới đây không nằm trong SOP pilot hiện tại:

- FIFO / FEFO vận hành theo lô
- bin location / barcode / label
- approval nhiều cấp cho PO hoặc thanh toán
- payment proposal / payment run
- labor / overhead production costing

## 9. Tài liệu liên quan

- [inventory.md](inventory.md)
- [inventory-rbac-matrix.md](inventory-rbac-matrix.md)
- [inventory-role-handoff.md](inventory-role-handoff.md)
- [../runbooks/inventory/pre-release-qa.md](../runbooks/inventory/pre-release-qa.md)
- [einvoice-tax.md](einvoice-tax.md)
