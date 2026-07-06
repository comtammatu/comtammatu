# Kho Hàng — Inventory Management

> Áp dụng: Hộ kinh doanh Cơm Tấm Má Tư — quản lý kho nguyên liệu và thành phẩm F&B
> Phạm vi: **nhập NCC tại chi nhánh/Kho Tổng/Bếp Trung Tâm + sản xuất tại Bếp Trung Tâm + luân chuyển tồn thật + tiêu hao chi nhánh + GRN + stocktake + báo cáo vận hành**. `supplier_invoice`, 3-way matching, payment status, và AP aging là Finance handoff; không phải gate đóng ngày Inventory.

---

## Cách đọc tài liệu này

Tài liệu này là contract vận hành Inventory hiện tại, không phải roadmap. Nếu một ý tưởng mới không nằm trong bảng dưới đây, mặc định không thuộc scope cho đến khi có quyết định riêng.

Card tổng quan, KPI, và report summary của Inventory phải đọc cùng
[operational-data-contract.md](operational-data-contract.md). Nếu một số liệu
kho không map được vào contract hiện có, cập nhật contract trước khi thêm UI.

## Current Contract

| Nội dung                        | Current contract                                                                                                                                                                                        | Boundary                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Nguyên liệu `ingredients`       | Master data nguyên liệu phục vụ PO, GRN, tồn kho, production, và recipe                                                                                                                                 | Không mở item master ERP nhiều lớp                     |
| Tồn kho `stock_levels`          | `current_quantity`, `avg_unit_cost`; valuation đọc theo WAC khi có dữ liệu                                                                                                                              | Không chuyển sang FIFO engine                          |
| Biến động `stock_movements`     | Append-only ledger cho `adjustment`, `count_adjustment`, `consumption`, `grn_receipt`, `transfer_*`, `production_*`                                                                                     | Không mở lot-first ledger / batch accounting           |
| Mô hình site                    | `branches.branch_kind IN ('branch', 'central_supply', 'central_kitchen')`; `branch` giữ Kho CN, `central_supply` là Kho Tổng, `central_kitchen` là Bếp Trung Tâm                                        | V1 không tạo bảng `inventory_sites`                    |
| PO / GRN / NCC                  | Bảng PO/GRN/NCC + RPC `confirm_goods_receipt_note`; QC và price variance là control trong luồng nhập                                                                                                    | Không mở PR workflow nhiều bước                        |
| Luân chuyển nội bộ              | `stock_transfers` dùng khi nơi nhận vẫn giữ tồn: trung tâm -> Kho CN, Kho CN -> trung tâm để return/rebalance, Kho Tổng <-> Bếp Trung Tâm, chi nhánh -> chi nhánh, hoặc Kho CN -> Bếp CN cùng chi nhánh | Không dùng `stock_transfer` cho tiêu hao/xuất hủy thật |
| HĐ NCC + 3-way matching         | `supplier_invoices` + matching logic là Finance handoff                                                                                                                                                 | Không mở payment proposal engine trong Inventory       |
| `recipes` + xuất kho theo order | `recipes` + RPC tiêu hao theo order                                                                                                                                                                     | Không mở multi-level BOM                               |
| Thành phẩm + production hub     | `item_kind`, `production_recipes`, `production_orders`, route production cho `central_kitchen`                                                                                                          | Không mở labor / overhead / WIP accounting đầy đủ      |
| Hao hụt / trả hàng / sự cố      | Waste (`/inventory/waste` + approvals), supplier return (`/inventory/supplier-returns`), issue log (`/inventory/issues`); nhập hàng đi qua `/inventory/receiving`                                       | Không mở claim/insurance workflow                      |

## Scope Boundary

Những thứ dưới đây không thuộc Inventory current contract dù có xuất hiện trong bộ ERP tham chiếu:

- bin location / barcode / label printing
- FIFO / FEFO costing engine
- `business_documents` workflow kernel
- vendor portal
- payment proposal batches / approval nhiều cấp
- labor, overhead, accounting giữa pháp nhân/nội bộ doanh nghiệp
- location hierarchy enterprise nhiều tầng

---

## 1. Mô hình kho hàng F&B — Cơm Tấm Má Tư

**Nguyên tắc vận hành:**

- **Chi nhánh (`branch_kind = 'branch'`):** giữ tồn vận hành tại **Kho CN** (`location_kind = 'warehouse'`) và **Bếp CN** (`location_kind = 'kitchen'`). `Kho CN -> Bếp CN` là luân chuyển nội bộ cùng chi nhánh, không làm giảm tổng tồn chi nhánh; chỉ phiếu xuất/tiêu hao/hủy hỏng mới làm giảm tồn.
- **Kho Tổng (`branch_kind = 'central_supply'`):** site giữ tồn phụ gia, nguyên liệu khô, vật tư và hàng cấp cho chi nhánh hoặc cấp sang Bếp Trung Tâm. Kho Tổng có thể nhập NCC qua PO/GRN và transfer thật về Kho CN hoặc Bếp Trung Tâm.
- **Bếp Trung Tâm (`branch_kind = 'central_kitchen'`):** site giữ tồn riêng cho đồ tươi/sản xuất trong ngày như thịt, đồ chua, thành phẩm sơ chế, và có thể nhận phụ gia/gia vị từ Kho Tổng. Bếp Trung Tâm có thể nhập NCC qua PO/GRN, nhận/trả hàng với Kho Tổng, tạo `production_order`, và transfer thật về Kho CN.
- **Phiếu luân chuyển tồn thật:** dùng state machine `draft -> confirmed_ship -> in_transit -> confirmed_receive -> received`. Hướng hợp lệ: `central_supply -> branch`, `central_kitchen -> branch`, `branch -> central_supply`, `branch -> central_kitchen`, `central_supply -> central_kitchen`, `central_kitchen -> central_supply`, `branch -> branch`, và same-branch `Kho CN -> Bếp CN`.
- **Tiêu hao chi nhánh:** nguyên liệu đã dùng để tạo doanh thu được ghi bằng `stock_movements.type = 'consumption'`, `movement_subtype = 'sale_consumption'`; đây mới là bước giảm tồn chi nhánh.

```
NCC → [PO/GRN] → Kho Tổng (`central_supply`) ── [stock_transfer] → Kho CN (`branch/warehouse`)
                         ⇅
                  [stock_transfer]
                         ⇅
NCC → [PO/GRN] → Bếp Trung Tâm (`central_kitchen`) ── [stock_transfer] → Kho CN
                         │
                         ├─ [production_order]
                         ▼
                  Tồn sản xuất / thành phẩm

Kho CN → [stock_transfer cùng chi nhánh] → Bếp CN (`branch/kitchen`)
Kho CN hoặc Bếp CN → [phiếu xuất/tiêu hao] → `stock_movements.consumption`
```

### 1b. Luân chuyển nội bộ (cùng state machine)

| Bước                           | Trạng thái (DB)     | Việc làm                                                                                                                     |
| ------------------------------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Tạo phiếu                      | `draft`             | Chọn chi nhánh **gửi** / **nhận** (ví dụ `chi nhánh -> chi nhánh` hoặc cùng chi nhánh để cấp Bếp CN), liệt kê mặt hàng và SL |
| Xác nhận xuất tại kho gửi      | `confirmed_ship`    | Trừ tồn tại `from_branch_id` (`transfer_out`), snapshot WAC vào dòng phiếu                                                   |
| Đang vận chuyển                | `in_transit`        | Theo dõi (biển số / ghi chú — tùy pha UI)                                                                                    |
| Bắt đầu kiểm nhận tại kho nhận | `confirmed_receive` | Kho nhận mở kiểm đếm (`receive_started_at`); chưa cộng tồn                                                                   |
| Xác nhận nhập tại kho nhận     | `received`          | Cộng tồn tại `to_branch_id` (`transfer_in`), ghi nhận SL thực nhận (lệch → điều chỉnh / lý do)                               |

Trạng thái `cancelled` khi hủy phiếu (theo quyền); không ghi nhận tồn nếu chưa từng `confirmed_ship` (hoặc hoàn tác theo policy nội bộ — ưu tiên tránh xóa bản ghi, dùng workflow hủy).

Với `Kho CN -> Bếp CN`, xác nhận cấp bếp ghi `transfer_out` ở Kho CN và `transfer_in` ở Bếp CN trong cùng chi nhánh; tổng tồn chi nhánh không giảm. Phiếu xuất/tiêu hao sau đó mới ghi `consumption/sale_consumption`.

### Các loại phiếu kho

| Loại phiếu                    | Mô tả                                                | `stock_movements.type`                                |
| ----------------------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| **Nhập từ NCC (GRN)**         | Tại chi nhánh                                        | `grn_receipt`                                         |
| **Xuất luân chuyển**          | Trừ kho gửi (`from_branch_id`) khi xác nhận xuất     | `transfer_out`                                        |
| **Nhận luân chuyển**          | Cộng kho nhận (`to_branch_id`) khi hoàn tất nhận     | `transfer_in`                                         |
| **Tiêu hao bán hàng thực tế** | Trừ Kho CN theo báo cáo tiêu hao đã duyệt            | `consumption` + `movement_subtype = sale_consumption` |
| **Tiêu hao sản xuất**         | Trừ nguyên liệu tại chi nhánh khi confirm production | `production_consumption`                              |
| **Nhập thành phẩm**           | Cộng tồn thành phẩm tại chi nhánh                    | `production_output`                                   |
| **Xuất theo bán**             | Theo recipe khi order `completed`                    | `consumption`                                         |
| **Điều chỉnh / hỏng / mất**   | Thủ công                                             | `adjustment`                                          |
| **Kiểm kê**                   | Điều chỉnh sau đếm                                   | `count_adjustment`                                    |

Ghi chú: `mv_food_cost` là dữ liệu recipe/theoretical để đối chiếu. Lãi gộp vận hành dùng actual food cost từ `stock_movements` consumption đã được duyệt.

---

## 2. Nguyên liệu (Ingredients)

### 2.1 Đơn vị nhập / Đơn vị tính

`ingredients` là nơi duy nhất khai báo đơn vị:

- **Đơn vị nhập (ĐVN) / `purchase_unit`:** đơn vị kho và mua hàng dùng để ghi `stock_levels`, `stock_movements`, PO, GRN, transfer, issue, waste, supplier return, stocktake và báo cáo kho.
- **Đơn vị tính (ĐVT) / `measure_unit`:** đơn vị định lượng nhỏ hơn cho BOM sản xuất tại chi nhánh.
- **Tỷ lệ quy đổi / `purchase_to_measure_factor`:** số ĐVT trong 1 ĐVN, ví dụ `1 thùng = 10 kg` thì factor = `10`.

> **Quy tắc:** người dùng chỉ nhập/chọn ĐVN, ĐVT và tỷ lệ quy đổi ở danh mục **Nguyên liệu**. Các nghiệp vụ kho tái sử dụng ĐVN tự động. Ngoại lệ duy nhất là `production_recipes` của chi nhánh: BOM nhập theo ĐVT, nhưng khi xác nhận production phải quy đổi về ĐVN trước khi trừ tồn và tính WAC.

### 2.2 Database — bảng `ingredients`

Master data **theo tenant** (đã có trong DB). `unit_cost` trên `ingredients` có thể phản ánh **giá mua gần nhất** (tham chiếu); **giá tồn kho** theo từng kho nằm ở `stock_levels.avg_unit_cost` (WAC).

- `item_kind = raw_material`: nguyên liệu đầu vào.
- `item_kind = finished_good`: thành phẩm sản xuất tại Bếp Trung Tâm hoặc hàng chuẩn bị sẵn được giữ ở stock-bearing site trước khi transfer về Kho CN.

### 2.3 Tồn kho theo chi nhánh — bảng `stock_levels`

- **Khóa:** theo `(tenant_id, branch_id, location_id, ingredient_id)` — flow mới chỉ cộng tồn vận hành từ stock-bearing locations.
- **`current_quantity`:** tồn thực theo **Đơn vị nhập (`ingredients.purchase_unit`)** — tên cột trong DB.
- **`avg_unit_cost`:** giá bình quân gia quyền (WAC) tại kho đó, cập nhật khi **GRN** (tại Kho CN của chi nhánh) và có thể dùng làm **đơn giá xuất nội bộ** khi một chi nhánh chuyển sang chi nhánh khác (policy mặc định: WAC tại thời điểm xuất).

---

## 3. Công thức (Recipes)

Định mức nguyên liệu theo `menu_item`. Dùng để **xuất kho** (`consumption`) khi đơn hàng chuyển sang `completed` (thực hiện bằng RPC, không lặp HTTP). Đây là nghiệp vụ kho/POS nên `recipes.quantity` và `recipes.unit` dùng **Đơn vị nhập** của nguyên liệu, không dùng ĐVT.

```sql
-- Mục tiêu schema (triển khai theo migration)
CREATE TABLE recipes (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES tenants(id),
  menu_item_id    BIGINT NOT NULL REFERENCES menu_items(id),
  ingredient_id   BIGINT NOT NULL REFERENCES ingredients(id),
  quantity        NUMERIC(15,3) NOT NULL,
  unit            TEXT NOT NULL,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (menu_item_id, ingredient_id, tenant_id)
);
```

### 3b. Công thức sản xuất & lệnh sản xuất (Bếp Trung Tâm)

Phần mở rộng cho chi nhánh dùng bộ bảng riêng:

- `production_recipes`: BOM cho **thành phẩm** (`finished_good_id`) và các **nguyên liệu đầu vào** (`ingredient_id`), có `yield_factor`. Đây là ngoại lệ dùng **Đơn vị tính** của nguyên liệu.
- `production_orders`: lệnh sản xuất tại site có `branch_kind = central_kitchen`.
- `production_order_items`: danh sách thành phẩm và số lượng thực hiện cho từng lệnh.

Workflow sản xuất chuẩn:

1. Bếp Trung Tâm nhận nguyên liệu tươi qua PO/GRN hoặc transfer thật nếu có.
2. Bếp Trung Tâm tạo `production_order` ở trạng thái `draft`.
3. `confirm_production_order()` kiểm tra:
   - site phải là `central_kitchen`,
   - item đầu ra phải có `item_kind = finished_good`,
   - có đủ `production_recipes`,
   - tồn kho nguyên liệu đủ để trừ sau khi quy đổi BOM từ ĐVT về ĐVN.
4. RPC ghi atomically:
   - `production_consumption` cho nguyên liệu đầu vào,
   - `production_output` cho thành phẩm đầu ra,
   - cập nhật `stock_levels`,
   - chốt `production_orders.status = completed`.

### 3c. Yield Factor — hao hụt sơ chế

> Boundary: đây là current Inventory control; không kéo theo multi-level BOM hay costing engine mới.

- `yield_factor` biểu diễn tỷ lệ giữ lại sau sơ chế.
- Mặc định `1.0` = không hao hụt; ví dụ `0.85` = 15% hao hụt.
- Khi áp dụng, lượng gross để mua / tiêu hao được tính:

```
gross_quantity = net_quantity / yield_factor
```

- Ứng dụng thực tế:
  - đặt hàng chính xác hơn cho nguyên liệu có hao hụt sơ chế,
  - giải thích chênh lệch giữa định mức net và lượng mua thực tế,
  - giữ WAC model hiện tại, không cần chuyển sang FIFO.

Ngoài phạm vi v1:

- sub-recipe nhiều tầng,
- labor / overhead costing,
- production variance engine đầy đủ.

---

## 4. Biến động tồn kho — `stock_movements`

- **Append-only** (không UPDATE/DELETE dòng movement).
- Các loại `type` mở rộng như bảng ở §1b.
- Liên kết tùy loại: `order_id`, `grn_id`, `transfer_id`, `unit_cost` (snapshot tại thời điểm ghi).

### POS food-cost boundary

Mặc định giá vốn món và tiêu hao nguyên liệu vẫn đến từ chứng từ vận hành
kho/bếp đã được xác nhận. Với chi nhánh bật `pos_stock_outcome_posting`, Sale
Runtime được phép ghi `stock_movements.consumption/sale_consumption` bằng RPC
atomic khi đơn đã `paid` + `completed`: line có KDS chờ `first_ready_at`, còn
line không có KDS chỉ được trừ sau khi đã dispatch qua phiếu bếp in.

---

## 5. Nhập kho — GRN

### 5.1 Quy trình

1. Thiết lập **NCC**, điều khoản thanh toán.
2. Tạo **PO** gắn **branch_id** = site nhận hàng (`branch`, `central_supply`, hoặc `central_kitchen`).
3. NCC giao hàng → kiểm đếm, QC.
4. Lập **GRN** (số thực nhận theo ĐVN, đơn giá theo ĐVN) → **xác nhận GRN** (RPC) → cập nhật tồn stock-bearing location + **WAC**.
5. Nếu Finance cần đối soát ngay: nhập **supplier_invoice** → **3-way matching** với PO & GRN (§7). Bước này là Finance P1/handoff, không chặn luồng tồn kho.

**Nguyên tắc:** Food cost nhập mua theo **GRN** (thực nhận), không theo số đặt PO. GRN chỉ được tạo tại site stock-bearing: `branch`, `central_supply`, hoặc `central_kitchen`.

### 5.2 Schema tham chiếu — `goods_received_notes` / `grn_items`

**`branch_id` trên GRN là inventory site nhận hàng.** Với `branch` thì GRN ghi vào Kho CN. Với `central_supply` thì GRN ghi vào Kho Tổng. Với `central_kitchen` thì GRN ghi vào Bếp Trung Tâm. Không tạo GRN trực tiếp vào Bếp CN chi nhánh.

---

## 6. Phương pháp tính giá xuất kho

- **v1 (đang hướng tới):** **Giá bình quân gia quyền (WAC)** trên từng `stock_levels`, cập nhật khi **xác nhận GRN** tại chi nhánh.
- **FIFO / FEFO theo lô:** hướng mở rộng sau (cần bảng lô/batch); phần mở đầu §6 cũ nhắc FIFO như **nguyên tắc thực phẩm**, không mâu thuẫn nếu ghi rõ **hệ thống v1 dùng WAC**.

Công thức WAC sau mỗi dòng nhập (đơn giản hóa):

```
Q_new = Q_old + Q_recv
WAC_new = (Q_old × WAC_old + Q_recv × đơn_giá_nhập) / Q_new   (khi Q_new > 0)
```

### 6.1 Price Variance — boundary cho v1

Hệ thống hiện tại không xây full `price governance engine`, nhưng cần vocabulary đủ rõ để operator không mua đắt mà không biết.

Điểm kiểm soát:

- **PO variance:** so giá PO với giá tham chiếu gần nhất hoặc giá NCC đang dùng.
- **Invoice variance:** so giá HĐ NCC với PO / GRN trong lúc 3-way matching.
- **WAC update:** chỉ cập nhật theo GRN đã confirm, không theo PO.

Ngưỡng gợi ý hiện hành:

| Mức lệch      | Ý nghĩa             |
| ------------- | ------------------- |
| `<= 2%`       | thông tin           |
| `> 2% đến 5%` | cảnh báo            |
| `> 5%`        | cần review thủ công |

Trong current operation:

- ưu tiên **alert + review thủ công**,
- không mở approval workflow nhiều tầng,
- không mở FX variance / price lock / standard cost engine.

---

## 7. 3-Way Matching (PO ↔ GRN ↔ Supplier Invoice) — Finance P1

Áp dụng cho **hàng mua về chi nhánh** (đầu vào VAT). Điều kiện thanh toán / kê khai: tham chiếu [einvoice-tax.md](einvoice-tax.md) §4.

Đây là Finance handoff. Inventory vẫn đóng ngày được nếu PO/GRN/WAC/stock ledger đã đúng nhưng supplier invoice/payment/AP chưa nằm trong daily operator path.

| Bước     | Kiểm tra         | Dung sai gợi ý       |
| -------- | ---------------- | -------------------- |
| PO ↔ GRN | SL nhận / SL đặt | ±5%                  |
| GRN ↔ HĐ | SL HĐ / SL GRN   | HĐ không > thực nhận |
| PO ↔ HĐ  | Đơn giá HĐ / PO  | ±2%                  |

`matching_status`: `pending` | `matched` | `discrepancy` | `approved` (ngoại lệ có duyệt).

**Phiếu luân chuyển nội bộ** không thuộc 3-way matching với NCC (trừ khi sau này có hóa đơn nội bộ — ngoài phạm vi v1).

### 7.1 AP Boundary — accounts payable tối thiểu

Các khái niệm nên coi là vocabulary chuẩn của Inventory/AP boundary:

- `payment_terms` trên `suppliers`: ví dụ `COD`, `NET7`, `NET14`, `NET30`
- `due_date` trên `supplier_invoices`
- `payment_status` trên `supplier_invoices`: `unpaid` | `partial` | `paid`
- `paid_amount`, `paid_at` nếu có flow đánh dấu thanh toán

Nguyên tắc:

- AP ở giai đoạn này vẫn là **tracking + báo cáo**, không phải payment engine đầy đủ.
- `due_date` được tính từ `invoice_date + payment_terms`.
- `AP aging` là report/query layer, không cần thêm bảng tổng hợp riêng ở v1.

Ngoài phạm vi v1:

- payment proposal batches,
- debit note / credit note engine đầy đủ,
- approval thanh toán nhiều cấp,
- AP giữa pháp nhân/nội bộ doanh nghiệp.

---

## 8. Kiểm kê kho (Stocktake)

> Route: `/inventory/stocktake` (list), `/inventory/stocktake/[id]` (chi tiết đếm/kết quả)

### 8.1 Quy trình

1. **Tạo phiên kiểm kê** (`startStocktake` → RPC `start_stocktake`): chọn chi nhánh, `location_id`, `mode` (`daily/weekly/monthly/quarterly/spot`), blind mode và ngưỡng variance → tạo `stocktake_sessions` + tự động tạo `stocktake_lines` từ `stock_levels` hiện có (snapshot `system_quantity`, gán `abc_class`).
2. **Đếm thực tế** (`getStocktakeLinesBlind` → RPC `get_stocktake_lines_blind`, `submitCountRound`, `saveStocktakeDraft`): nhập `counted_quantity` theo từng `round_no`; blind mode ẩn `system_quantity` cho người đếm. Zone lock chống đếm trùng dùng `acquireZoneLock` / `heartbeatZoneLock` / `releaseZoneLock`.
3. **Đóng vòng đếm** (RPC `close_recount_round`): so chênh lệch theo ngưỡng (chặt hơn cho `abc_class = 'A'`) → đánh `needs_recount` / `is_final` → mở `round_no` kế tiếp nếu còn dòng phải đếm lại; round hội tụ được post `count_adjustment` vào `stock_movements` + cập nhật `stock_levels`.

### 8.2 Bảng

- `stocktake_sessions`: `id, tenant_id, branch_id, location_id, started_at, completed_at, status, notes, created_by, mode, blind_mode, auditor_id, auditor_branch_id, is_unaudited, variance_threshold_pct/vnd (+ class_a), abc_snapshot_at, current_round, offline_enabled`
  - Status: `in_progress` | `completed` | `cancelled`; `current_round` 1..4
  - Partial unique: chỉ 1 phiên `in_progress` mỗi chi nhánh
- `stocktake_lines`: `id, tenant_id, session_id, ingredient_id, system_quantity, counted_quantity, variance (generated), variance_reason, round_no, counted_by, counted_at, needs_recount, is_final, abc_class`
  - `variance = counted_quantity - system_quantity` (generated column); `round_no` 1..4

### 8.3 UI

- **Danh sách phiên**: mã phiên (KK-{id}), chi nhánh, ngày, trạng thái. Tìm kiếm theo mã/tên CN.
- **Chi tiết đếm** (in_progress): bảng nguyên liệu + input số lượng đếm + lý do chênh lệch theo vòng đếm; blind mode ẩn SL hệ thống. Auto-save khi blur.
- **Kết quả** (completed): bảng SL hệ thống vs SL thực đếm + chênh lệch + color coding (xanh <1%, vàng 1-5%, đỏ >5%).
- **Tiến độ**: hiển thị `{đã đếm}/{tổng}` khi đang thực hiện.

### 8.4 ACL

- `branch_manager`, `warehouse_manager`: tạo + đếm + hoàn tất kiểm kê cho chi nhánh trong phạm vi của mình (`inventory:stocktake_create` / `inventory:stocktake_complete`).
- `owner`: tạo kiểm kê cho bất kỳ chi nhánh nào, xem toàn bộ lịch sử.

---

## 9. Cảnh báo tồn kho

### 9.1 Cảnh báo đặt hàng (Reorder Alerts)

> Hiển thị: card trên dashboard Tổng Quan (`/inventory`)

So sánh `stock_levels.current_quantity` với `ingredients.reorder_point` (theo từng chi nhánh, chỉ `is_active = true`).

- Card vàng khi có nguyên liệu dưới mức đặt hàng, xanh khi đủ tồn.
- Hiển thị top 5 nguyên liệu cần đặt + current/reorder ratio + đơn vị.
- Tính `suggested_order_qty = max_stock_level - current_quantity`.
- Branch scoping: `branch_manager` chỉ thấy chi nhánh mình.

### 9.2 Hạn sử dụng

Theo D060, Inventory v1 không vận hành sổ lô, FIFO/FEFO, cảnh báo hạn dùng, hoặc route `/inventory/expiry`.

- GRN ghi số thực nhận, đơn giá và QC; không yêu cầu lô/HSD.
- Stock control dùng WAC + tồn theo location; cảnh báo ưu tiên hiện tại là tồn thấp/reorder và phiếu đang mở.
- Khi cần quản lý hạn dùng thật, phải thiết kế lại thành lot ledger hoàn chỉnh, không bật cảnh báo naive từ `grn_items.expiry_date`.

> **Lưu ý:** Không block xuất kho hàng hết hạn (yêu cầu batch tracking — ngoài scope Phase 0). Chỉ cảnh báo + hỗ trợ xóa sổ thủ công.

### 9.3 GRN — Nhiệt độ nhận hàng

Cột `grn_items.receiving_temperature` (`NUMERIC(5,1)`, nullable) — chỉ hiển thị cho nguyên liệu lạnh/đông. UI ẩn cột nhiệt độ nếu không có dòng nào có giá trị.

---

## 10. Báo cáo (gợi ý truy vấn)

- **Food cost (chi nhánh):** lọc `stock_movements` `type = 'consumption'` theo `branch_id` và kỳ thời gian; join `ingredients`.
- **Giá trị tồn:** `sum(current_quantity * avg_unit_cost)` trên stock-bearing locations (hoặc `ingredients.unit_cost` nếu chưa có WAC tại kho).
- **AP aging:** nhóm `supplier_invoices` chưa `paid` theo bucket `current / 1-30 / 31-60 / 61-90 / >90 ngày` khi Finance handoff mở; không phải gate đóng ngày Inventory.
- **Consumption variance:** so sánh tiêu hao lý thuyết từ recipe (`mv_food_cost`) với actual approved consumption (`stock_movements.consumption/sale_consumption`) để tìm site lệch lớn.

> **Multi-chi nhánh consumption proxy:** `fetchPoSuggestions` scope tồn kho theo Kho CN của một chi nhánh được chọn, nhưng consumption vẫn lấy tenant-wide từ `stock_movements` (type=`consumption`) toàn bộ chi nhánh. Đây là proxy gần đúng cho tới khi có mapping `branch → primary_warehouse_id` (chưa build, defer). Với hai chi nhánh song song, `avg_daily_consumption` nên coi như upper-bound hint cho mỗi chi nhánh, không phải nhu cầu chính xác theo kho.

---

## 11. Quyền truy cập (ACL) — hướng dẫn

Doc source of truth cho module/route access vẫn là `packages/shared/src/auth/module-acl.ts`.
Business-action matrix chi tiết cho Inventory xem ở [inventory-rbac-matrix.md](inventory-rbac-matrix.md).

Tóm tắt quyền hiện tại:

- `owner`: full access Inventory tenant-wide — procurement, Kho CN, Kho Tổng, Bếp Trung Tâm, production, và giám sát; cũng xem qua `reports` / `finance`.
- `warehouse_manager`: role chính cho procurement, Kho Tổng/Kho CN, và outbound transfer.
- `production_manager`: role chính cho Bếp Trung Tâm và production.
- `branch_manager`: vận hành tồn Kho CN, nhận transfer, stocktake, và duyệt tiêu hao trong ngày; không vào procurement.
- `office`, `cashier`, `chef`: không có Inventory route theo ACL hiện tại.

Chi tiết enforcement: RLS + `packages/shared/src/auth/module-acl.ts`.

---

## Tài liệu liên quan

- [einvoice-tax.md](einvoice-tax.md) — VAT đầu vào, HĐ NCC
- [inventory-sop.md](inventory-sop.md) — SOP vận hành cho topology `tenant / Kho Tổng / Bếp Trung Tâm / chi nhánh / Kho CN / tiêu hao`
- [inventory-role-handoff.md](inventory-role-handoff.md) — bản handoff 1 trang cho training vận hành
- [inventory-rbac-matrix.md](inventory-rbac-matrix.md) — ma trận quyền Inventory theo boundary hiện tại
