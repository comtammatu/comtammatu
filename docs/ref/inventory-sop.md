# SOP Inventory — Kho Chi Nhánh / Bếp Chi Nhánh / Tiêu hao

> Áp dụng: Hộ kinh doanh Cơm Tấm Má Tư
> Phạm vi: luồng vận hành Inventory hiện tại cho nguyên liệu, thành phẩm, điều chuyển tồn thật, và tiêu hao chi nhánh.
> Mô hình: `branches` là site table; site active có `branch_kind = 'branch'` (`central_supply`, `central_kitchen` là giá trị enum lịch sử, không có site active).

---

## 0. Boundary

SOP này chỉ mô tả luồng Inventory đang vận hành. Không mở rộng sang ERP/WMS như batch-first, barcode/bin, vendor portal, approval nhiều cấp, payment run, labor/overhead costing, hoặc kế toán nhiều pháp nhân.

Khi SOP và quyền hệ thống có vẻ mâu thuẫn, đọc thêm:

- [inventory.md](inventory.md)
- [inventory-rbac-matrix.md](inventory-rbac-matrix.md)

## 1. Mục tiêu

- Chi nhánh giữ tồn vận hành tại Kho CN và Bếp CN.
- Chi nhánh tự sản xuất thành phẩm trong ngày bằng `production_runs` (D068).
- Chuyển Kho CN -> Bếp CN là luân chuyển nội bộ cùng chi nhánh; xuất/tiêu hao sau đó mới giảm tồn chi nhánh.
- Mọi bước đều có chứng từ rõ: PO/GRN, stock transfer thật, production order, consumption report, stocktake/adjustment.

## 2. Site và location

| Site      | `branch_kind` | Stock-bearing location                   | Vai trò                                                                  |
| --------- | ------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| Chi nhánh | `branch`      | `warehouse` = Kho CN; `kitchen` = Bếp CN | Nhận hàng, giữ tồn chi nhánh, sản xuất, kiểm kê, cấp bếp, xuất tiêu hao |

`location_kind = 'kitchen'` tại `branch` là stock-bearing Bếp CN và được cộng vào tồn vận hành của chi nhánh.

## 3. Chứng từ chuẩn

| Bước                                | Chứng từ / thao tác hệ thống    | Kết quả kho                                                     |
| ----------------------------------- | ------------------------------- | --------------------------------------------------------------- |
| NCC giao chi nhánh                  | `PO`, `GRN`                     | Tăng tồn Kho CN hoặc Bếp CN theo nơi nhập đã chọn               |
| Chi nhánh chuyển chi nhánh          | `stock_transfer`                | Chi nhánh gửi giảm, chi nhánh nhận tăng                         |
| Kho CN cấp Bếp CN                   | `stock_transfer` cùng chi nhánh | Kho CN giảm, Bếp CN tăng; tổng tồn chi nhánh không giảm         |
| Chi nhánh sản xuất                  | `production_runs`               | Nguyên liệu giảm, thành phẩm tăng                               |
| Chi nhánh dùng nguyên liệu bán hàng | consumption report duyệt/apply  | Kho CN giảm bằng `stock_movements.consumption/sale_consumption` |
| Kiểm kê                             | `stocktake` / `adjustment`      | Điều chỉnh về tồn thực tế                                       |

`stock_transfers` dùng khi hàng vẫn còn tồn tại ở nơi nhận. `Kho CN -> Bếp CN` là transfer nội bộ cùng chi nhánh; phiếu xuất/tiêu hao mới là bước giảm tồn.

## 4. Quy trình chuẩn

### 4.1 Nhập NCC

1. Tạo `PO` gắn với chi nhánh nhận hàng.
2. Khi hàng tới, tạo `GRN` tại stock-bearing location của site đó.
3. Kiểm số lượng, đơn giá, nhiệt độ nếu cần.
4. Xác nhận `GRN` để cộng tồn và cập nhật WAC.
5. Nếu Finance cần đối soát, nhập `supplier_invoice` để 3-way matching với `PO` và `GRN`; đây là Finance handoff, không chặn đóng ngày Inventory.

### 4.2 Điều chuyển tồn thật

Hướng hợp lệ:

- Cùng chi nhánh: Kho CN -> Bếp CN.
- Kho CN -> Kho CN của chi nhánh khác.

Luồng dùng state machine 5 bước: `draft -> confirmed_ship -> in_transit -> confirmed_receive -> received`.

Điểm kiểm soát:

- Không tạo transfer cùng `from_branch_id = to_branch_id`.
- Không dùng transfer để ghi tiêu hao chi nhánh.
- Nếu nhận thiếu, nhập số thực nhận và ghi lý do.

### 4.3 Sản xuất tại chi nhánh

1. Chi nhánh tạo `production_order`.
2. Chọn thành phẩm `finished_good` và số lượng cần sản xuất.
3. Hệ thống kiểm tra BOM (`production_recipes`) và tồn nguyên liệu.
4. Xác nhận lệnh sản xuất.
5. Hệ thống atomically:
   - trừ nguyên liệu bằng `production_consumption`,
   - cộng thành phẩm bằng `production_output`,
   - cập nhật giá vốn sản xuất.

Điểm kiểm soát:

- New production order tạo cho chi nhánh (`branch`) có Bếp CN stock-bearing.
- Nếu thiếu nguyên liệu hoặc thiếu BOM, không xác nhận lệnh.

### 4.4 Tiêu hao chi nhánh

1. Nhân viên/kíp bếp ghi báo cáo tiêu hao trong ngày từ Employee checkout flow.
2. Quản lý chi nhánh duyệt báo cáo trước khi checkout được hoàn tất.
3. Khi duyệt/apply, hệ thống trừ tồn tại Bếp CN nếu chi nhánh đã cấu hình kitchen; fallback Kho CN/default issue warehouse khi chưa có Bếp CN.
4. Movement sinh ra:
   - `stock_movements.type = 'consumption'`
   - `movement_subtype = 'sale_consumption'`
   - `source_type = 'hrm_consumption'`
   - `location_id` là stock-bearing Bếp CN hoặc Kho CN fallback.

Điểm kiểm soát:

- Checklist nhân viên không tự mutate tồn.
- Không trừ tồn khi mới cấp Bếp CN; chỉ phiếu xuất/tiêu hao được duyệt mới ghi giảm tồn.
- Nếu thiếu WAC hoặc không đủ tồn, không apply tiêu hao; phải xử lý tồn/GRN/adjustment trước.

### 4.5 Kiểm kê cuối ngày

1. Tạo phiên `stocktake` cho site cần đếm.
2. Nhập số lượng đếm thực tế.
3. Hoàn tất kiểm kê để hệ thống ghi `count_adjustment`.
4. OPS/owner xem báo cáo chênh lệch và xử lý nguyên nhân.

Điểm kiểm soát:

- Mỗi site chỉ có 1 phiên kiểm kê `in_progress` tại một thời điểm.
- Cộng tồn Bếp CN/kitchen vào tồn vận hành của chi nhánh.

## 5. Ngoại lệ và cách xử lý

| Tình huống                                    | Cách xử lý                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| NCC giao thiếu / giao dư                      | Ghi đúng số thực nhận trên `GRN`, không sửa PO để che lệch                  |
| Hàng cận date / hỏng                          | Dùng `adjustment` hoặc write-off theo lý do rõ ràng                         |
| Transfer nhận thiếu                           | Xác nhận theo số thực nhận, ghi chú chênh lệch để OPS đối soát              |
| Thiếu BOM cho thành phẩm                      | Không xác nhận sản xuất; cập nhật `production_recipes` trước                |
| Thiếu nguyên liệu ở Bếp CN khi duyệt tiêu hao | Không apply tiêu hao; kiểm transfer cấp bếp/GRN/stocktake trước             |
| Còn tồn ở Bếp CN/kitchen                      | Tính vào tồn chi nhánh; audit lịch sử riêng nếu số liệu nguồn cũ không khớp |

## 6. Checklist cuối ngày

- GRN trong ngày đã confirm.
- Lệnh sản xuất (`production_runs`) trong ngày đã `completed` hoặc `cancelled`.
- Đã nhận đủ transfer trong ngày; không có phiếu treo quá SLA.
- Báo cáo tiêu hao đã được quản lý duyệt/apply.
- POS đã chốt order đầy đủ.
- Stocktake trọng yếu đã hoàn tất nếu có biến động mạnh.

## 7. KPI vận hành gợi ý

- Tỷ lệ chênh lệch kiểm kê theo site.
- Số transfer treo quá SLA.
- Số production order fail do thiếu BOM hoặc thiếu nguyên liệu.
- Tỷ lệ nguyên liệu cận hạn / hết hạn.
- Actual food cost theo ngày từ approved consumption.
- Variance giữa recipe theoretical cost và actual approved consumption.

## 8. Tài liệu liên quan

- [inventory.md](inventory.md)
- [inventory-rbac-matrix.md](inventory-rbac-matrix.md)
- [operational-data-contract.md](operational-data-contract.md)
