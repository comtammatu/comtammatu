# Inventory Route CTA Matrix

> Ma trận checklist cho audit UI/UX theo route, section, và CTA.
>
> Authority: `docs/ref/inventory.md`, `docs/ref/inventory-sop.md`, `docs/spec/design-system.md`, và ACL source trong `packages/shared/src/auth`.

Updated: `2026-07-06`

---

## Contract ngắn

- `/inventory/transfers` chỉ là phiếu hàng còn tồn tại ở site/location nhận.
- `/inventory/consumption` là tiêu hao thực tế của chi nhánh, tức bước làm giảm tồn.
- Hướng transfer hợp lệ: `central_supply -> branch`, `central_kitchen -> branch`, `branch -> central_supply`, `branch -> central_kitchen`, `central_supply -> central_kitchen`, `central_kitchen -> central_supply`, `branch -> branch`, và cùng chi nhánh `Kho CN -> Bếp CN`.
- `Kho CN -> Bếp CN` tạo transfer cùng chi nhánh; nếu URL cũ `?create=cap-bep` còn được gọi thì phải rẽ sang form tạo transfer.
- `/inventory/production` là happy path của `central_kitchen`.

## 1. Dashboard và shell

| Route        | Section              | CTA                     | Visible for role/site                                               | Expected behavior                                               | Severity |
| ------------ | -------------------- | ----------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------- | -------- |
| `/inventory` | Flow card nhập/nhận  | `Đơn đặt hàng`, `GRN`   | procurement roles tại `branch`, `central_supply`, `central_kitchen` | Mở PO/GRN cho site nhận hàng                                    | `P0`     |
| `/inventory` | Flow card branch     | `Phiếu đến`             | `branch_manager`                                                    | Mở transfer inbound cần nhận                                    | `P0`     |
| `/inventory` | Flow card điều phối  | `Nhận/điều chuyển hàng` | inventory roles                                                     | Mở `/inventory/transfers`                                       | `P0`     |
| `/inventory` | Flow card branch     | `Tiêu hao`              | branch site                                                         | Mở `/inventory/consumption`                                     | `P0`     |
| `/inventory` | Flow card production | `Lệnh sản xuất`         | `production_manager` tại `central_kitchen`, owner deep-link         | Mở `/inventory/production`                                      | `P0`     |
| `/inventory` | Shell nav            | site label              | mọi role                                                            | Hiển thị đúng `Kho chi nhánh`, `Kho Tổng`, hoặc `Bếp Trung Tâm` | `P1`     |

## 2. Stock

| Route              | Section        | CTA/state              | Expected behavior                                                            | Severity |
| ------------------ | -------------- | ---------------------- | ---------------------------------------------------------------------------- | -------- |
| `/inventory/stock` | Summary/table  | tồn hiện tại           | Cộng stock-bearing locations, gồm `warehouse` và `branch/kitchen` của Bếp CN | `P0`     |
| `/inventory/stock` | Row action     | `Điều chỉnh`           | Mở adjustment đúng ingredient/site                                           | `P0`     |
| `/inventory/stock` | Filters/search | status/category/search | Lọc đúng, counter rõ                                                         | `P1`     |

## 3. Procurement và GRN

| Route                             | Section | CTA                 | Expected behavior                                                      | Severity |
| --------------------------------- | ------- | ------------------- | ---------------------------------------------------------------------- | -------- |
| `/inventory/purchase-orders`      | Header  | `Tạo PO`            | Cho chọn site nhận thuộc `branch`, `central_supply`, `central_kitchen` | `P0`     |
| `/inventory/purchase-orders/[id]` | Footer  | `Sang bước tạo GRN` | Tạo GRN từ PO, giữ đúng site nhận                                      | `P0`     |
| `/inventory/grn/[id]`             | Footer  | `Chốt nhập kho`     | Tăng tồn stock-bearing location của site nhận, cập nhật WAC            | `P0`     |
| `/inventory/supplier-invoices`    | Detail  | `Tính lại đối soát` | Recompute matching; thanh toán NCC vẫn là Finance handoff              | `P1`     |

## 4. Transfers

| Route                                 | Section        | CTA                                        | Expected behavior                                                                             | Severity |
| ------------------------------------- | -------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------- | -------- |
| `/inventory/transfers`                | Header         | `Tạo phiếu`                                | Tạo transfer giữa hai site khác nhau theo hướng hợp lệ hoặc cùng chi nhánh `Kho CN -> Bếp CN` | `P0`     |
| `/inventory/transfers?create=cap-bep` | Compat URL     | redirect                                   | Rẽ sang `/inventory/transfers/new`, chọn luồng cấp Bếp CN bằng form transfer                  | `P0`     |
| `/inventory/transfers/[id]`           | Primary action | `Xác nhận xuất kho`                        | `draft -> confirmed_ship`, ghi `transfer_out` tại stock-bearing source                        | `P0`     |
| `/inventory/transfers/[id]`           | Primary action | `Bắt đầu kiểm nhận` / `Xác nhận nhận hàng` | Ghi `transfer_in` tại stock-bearing destination                                               | `P0`     |
| `/inventory/transfers`                | Tabs/list      | receive/dispatch/history                   | Không mở tab riêng `Cấp bếp`; cùng form transfer xử lý Bếp CN                                 | `P0`     |

## 5. Consumption

| Route                         | Section           | CTA/state            | Expected behavior                                                                                                    | Severity |
| ----------------------------- | ----------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------- | -------- |
| `/inventory/consumption`      | List              | tiêu hao             | Hiển thị phiếu/report tiêu hao; link detail qua `/inventory/consumption/[id]`                                        | `P0`     |
| `/inventory/consumption/[id]` | Header/breadcrumb | quay lại `Tiêu hao`  | Không dùng nhãn `Xuất kho nội bộ` cho tiêu hao bán hàng                                                              | `P1`     |
| Employee checkout approvals   | Action            | duyệt/apply tiêu hao | Chặn checkout khi report cần duyệt chưa `approved/applied`; apply tạo `stock_movements.consumption/sale_consumption` | `P0`     |

## 6. Production

| Route                   | Section             | CTA                 | Expected behavior                                   | Severity |
| ----------------------- | ------------------- | ------------------- | --------------------------------------------------- | -------- |
| `/inventory/production` | Header/form trigger | `Tạo lệnh sản xuất` | Chỉ tạo order cho `central_kitchen`                 | `P0`     |
| `/inventory/production` | Readiness           | dependency message  | Chỉ rõ thiếu finished good/BOM/nguyên liệu          | `P0`     |
| `/inventory/production` | Order list          | `Xác nhận`          | Ghi `production_consumption` và `production_output` | `P0`     |

## 7. Stocktake, waste, expiry, reports

| Route                                    | Section               | Expected behavior                                                                                                 | Severity |
| ---------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------- | -------- |
| `/inventory/stocktake`                   | create/count/complete | Tạo phiên, lưu số đếm, complete ghi `count_adjustment`                                                            | `P0`     |
| `/inventory/waste` / `/inventory/issues` | writeoff/adjustment   | Không dùng làm đường tiêu hao bán hàng thường ngày                                                                | `P1`     |
| `/inventory/expiry`                      | lot/date/site context | Hiển thị đủ lô/ngày/site để xử lý đúng hàng                                                                       | `P1`     |
| `/inventory/reports`                     | stock/food-cost cards | Tồn chi nhánh gồm Kho CN và Bếp CN; food cost actual lấy approved consumption, theoretical recipe chỉ để variance | `P0`     |

## 8. Hygiene

| Route                  | Expected behavior                                    | Severity |
| ---------------------- | ---------------------------------------------------- | -------- |
| Unknown `/inventory/*` | Không tự được coi là route live nếu chưa có contract | `P1`     |
| Placeholder CTA        | Phải ghi rõ placeholder hoặc bỏ khỏi daily UI        | `P1`     |
