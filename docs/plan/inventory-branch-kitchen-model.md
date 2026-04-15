# Inventory Branch Kitchen Model

> Date: `2026-04-14`  
> Status: `Approved for pilot contract`
> Ref: `docs/ref/inventory.md`, `docs/ref/inventory-sop.md`, `docs/spec/database-schema.md`

## 1. Problem

Business flow đã chốt:

- `HQ -> Bếp trung tâm -> Kho chi nhánh -> Bếp chi nhánh`
- `HQ -> Kho chi nhánh -> Bếp chi nhánh`
- `Kho chi nhánh -> Bếp chi nhánh`

Nhưng schema hiện tại vẫn hạch toán tồn kho theo `branch_id`, chưa có location ledger riêng cho `Kho chi nhánh` và `Bếp chi nhánh` trong cùng site `branch`.

## 2. Current System Boundary

Hiện codebase đang có:

- `stock_levels(tenant_id, branch_id, ingredient_id)`
- `stock_movements(..., branch_id, ...)`
- `stock_transfers(from_branch_id, to_branch_id, ...)`
- `stock_issues(branch_id, issue_type, ...)`

Điều này có nghĩa:

- `HQ`, `Bếp trung tâm`, `Chi nhánh` là các site thật trong schema.
- `Kho chi nhánh` và `Bếp chi nhánh` mới là hai điểm vận hành nội bộ trong cùng một `branch`.
- Hệ thống chưa thể giữ hai bucket tồn độc lập cho kho và bếp của cùng một chi nhánh.

## 3. Pilot Decision

### 3.1 Rule vận hành hiện tại

Trong pilot:

- `HQ -> Kho chi nhánh` dùng `stock_transfer`
- `Bếp trung tâm -> Kho chi nhánh` dùng `stock_transfer`
- `Kho chi nhánh -> Bếp chi nhánh` dùng `stock_issue` với `issue_type = kitchen_use`

### 3.2 Semantics

`stock_issue(issue_type = kitchen_use)` được coi là:

- chứng từ cấp phát nội bộ từ kho chi nhánh xuống bếp chi nhánh
- bước xác nhận hàng đã rời kho chi nhánh để vào vận hành bếp
- dấu vết audit cho tiêu hao nội bộ trước bán hàng

Nó **không** có nghĩa:

- đã có tồn kho riêng của bếp chi nhánh trong DB
- đã có transfer nội bộ 2 chiều giữa hai location riêng
- đã có stocktake riêng cho bếp chi nhánh

## 4. Why We Are Not Adding Sub-location Yet

Chưa nên nâng lên sub-location ledger ngay lúc này vì:

- hầu hết write path hiện tại đều bám `branch_id`
- tách ledger sẽ chạm `stock_levels`, `stock_movements`, `stocktake`, `consumption`, `issues`, `transfers`, reports, RLS, UI filters, và types
- pilot hiện cần semantics đúng và audit rõ trước, chưa cần double-ledger nội bộ tại từng chi nhánh

## 5. Upgrade Trigger

Chỉ nâng lên location-level ledger khi có ít nhất một nhu cầu thật sau:

1. Cần kiểm kê riêng `Kho chi nhánh` và `Bếp chi nhánh`
2. Cần đo variance riêng cho kho vs bếp trong cùng chi nhánh
3. Cần cấp phát nhiều lần/ngày giữa kho và bếp với kiểm soát tồn riêng
4. Cần báo cáo waste / over-portioning theo bếp chi nhánh thay vì theo toàn site

## 6. Future Target Model

Khi cần nâng cấp, hướng đề xuất là:

- thêm `inventory_locations`
- mỗi `branch` có thể có nhiều location nội bộ
- location kind tối thiểu:
  - `warehouse`
  - `kitchen`
  - `production_storage`
- chuyển dần ledger từ `branch_id` sang `location_id` ở các bảng tồn / movement / transfer / stocktake

Boundary của bước nâng cấp đó:

- đây là một project schema + RLS + app routing riêng
- không nên nhét vào patch pilot hiện tại

## 7. Immediate App Contract

Từ thời điểm này, team nên hiểu như sau:

- route transfer dùng cho luồng giữa các site thật: HQ, bếp trung tâm, chi nhánh
- route issue dùng cho luồng cấp phát nội bộ trong site chi nhánh
- copy trên UI cần nói rõ `kitchen_use = cấp phát bếp chi nhánh`, tránh wording mơ hồ kiểu chỉ ghi `Bếp`
