# Kho Hàng — Inventory Management

> Áp dụng: Hộ kinh doanh Cơm Tấm Má Tư — quản lý kho nguyên liệu và thành phẩm F&B
> Phạm vi: **nhập NCC tại chi nhánh + sản xuất tại chi nhánh + luân chuyển tồn thật + tiêu hao chi nhánh + GRN + stocktake + báo cáo vận hành**. `supplier_invoice`, 3-way matching, payment status, và AP aging là Finance handoff; không phải gate đóng ngày Inventory.

---

## Cách đọc tài liệu này

Tài liệu này là contract vận hành Inventory hiện tại, không phải roadmap. Nếu một ý tưởng mới không nằm trong bảng dưới đây, mặc định không thuộc scope cho đến khi có quyết định riêng.

Card tổng quan, KPI, và report summary của Inventory phải đọc cùng
[operational-data-contract.md](operational-data-contract.md). Nếu một số liệu
kho không map được vào contract hiện có, cập nhật contract trước khi thêm UI.

## Current Contract

| Nội dung                        | Current contract                                                                                                                                                                                                | Boundary                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Nguyên liệu `ingredients`       | Master data nguyên liệu phục vụ PO, GRN, tồn kho, production, và recipe                                                                                                                                         | Không mở item master ERP nhiều lớp                     |
| Tồn kho `stock_levels`          | `current_quantity`, `avg_unit_cost`; valuation đọc theo giá vốn BQ khi có dữ liệu, fallback giá nhập tham chiếu khi cần hiển thị                                                                                | Không chuyển sang FIFO engine                          |
| Biến động `stock_movements`     | Append-only ledger cho `adjustment`, `count_adjustment`, `consumption`, `grn_receipt`, `transfer_*`, `production_*`                                                                                             | Không mở lot-first ledger / batch accounting           |
| Mô hình site                    | `branches.branch_kind` enum giữ lịch sử; site active là chi nhánh (`branch`) với **một** location stock-bearing `warehouse` (Kho chi nhánh). `location_kind='kitchen'` (Bếp CN) và site `central_*` đã nghỉ vận hành (D078). | V1 không tạo bảng `inventory_sites`                    |
| PO / GRN / NCC                  | Bảng PO/GRN/NCC + RPC `confirm_goods_receipt_note`; QC và price variance là control trong luồng nhập                                                                                                            | Không mở PR workflow nhiều bước                        |
| Luân chuyển nội bộ              | Operator không mở Kho↔Bếp hay cross-branch mới (D078). `stock_transfers` lịch sử giữ trong DB/Office read-only.                                                                                                   | Không dùng `stock_transfer` cho tiêu hao/xuất hủy thật |
| HĐ NCC + 3-way matching         | `supplier_invoices` + matching logic là Finance handoff                                                                                                                                                         | Không mở payment proposal engine trong Inventory       |
| `recipes` + xuất kho theo order | `recipes` + RPC tiêu hao theo order                                                                                                                                                                             | Không mở multi-level BOM                               |
| Thành phẩm + production hub     | `item_kind`, `production_recipes`, `production_runs`, route production tại chi nhánh (`branch`, D068)                                                                                                           | Không mở labor / overhead / WIP accounting đầy đủ      |
| Hao hụt / trả hàng / sự cố      | Waste (`/inventory/waste` + approvals), supplier return (`/inventory/supplier-returns`), issue log (`/inventory/issues`); nhập hàng đi qua `/inventory/operations?tab=grn` + `/inventory/grn`                   | Không mở claim/insurance workflow                      |

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

- **Chi nhánh (`branch_kind = 'branch'`):** giữ toàn bộ tồn vận hành tại **Kho CN** (`location_kind = 'warehouse'`). `location_kind = 'kitchen'` là lịch sử đã nghỉ vận hành; chỉ phiếu xuất/tiêu hao/hủy hỏng mới làm giảm tồn. Chi nhánh nhập NCC qua GRN và tự sản xuất bằng `production_run` (D068, D078).
- **`central_supply`, `central_kitchen`:** giá trị enum lịch sử trong `branch_kind`; hiện không có site active thuộc các kind này.
- **Phiếu luân chuyển tồn thật:** chỉ giữ lịch sử; vận hành mới không mở Kho↔Bếp hay điều chuyển cross-branch từ operator (D078).
- **Tiêu hao chi nhánh:** nguyên liệu đã dùng để tạo doanh thu được ghi tại Kho CN bằng `stock_movements.type = 'consumption'`, `movement_subtype = 'sale_consumption'`; đây mới là bước giảm tồn chi nhánh.

```
NCC → [GRN] → Kho CN (`branch/warehouse`)

Chi nhánh ── [production_run] → trừ nguyên liệu, cộng thành phẩm tại chính chi nhánh

Kho CN → [phiếu xuất/tiêu hao] → `stock_movements.consumption`
```

### 1b. Luân chuyển nội bộ (cùng state machine)

| Bước                           | Trạng thái (DB)     | Việc làm                                                                                                                     |
| ------------------------------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Tạo phiếu                      | `draft`             | Lịch sử luân chuyển giữ nguồn và đích theo chi nhánh; vận hành mới không tạo phiếu từ operator |
| Xác nhận xuất tại kho gửi      | `confirmed_ship`    | Trừ tồn tại `from_branch_id` (`transfer_out`), snapshot WAC vào dòng phiếu                                                   |
| Đang vận chuyển                | `in_transit`        | Theo dõi (biển số / ghi chú — tùy pha UI)                                                                                    |
| Bắt đầu kiểm nhận tại kho nhận | `confirmed_receive` | Kho nhận mở kiểm đếm (`receive_started_at`); chưa cộng tồn                                                                   |
| Xác nhận nhập tại kho nhận     | `received`          | Cộng tồn tại `to_branch_id` (`transfer_in`), ghi nhận SL thực nhận (lệch → điều chỉnh / lý do)                               |

Trạng thái `cancelled` khi hủy phiếu (theo quyền); không ghi nhận tồn nếu chưa từng `confirmed_ship` (hoặc hoàn tác theo policy nội bộ — ưu tiên tránh xóa bản ghi, dùng workflow hủy).

Kho↔Bếp chỉ là lịch sử audit. Phiếu xuất/tiêu hao tại Kho CN mới ghi `consumption/sale_consumption`.

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

### 2.1 Hệ đơn vị

Đơn vị kho không còn nằm trên cột text của `ingredients`. Contract hiện tại:

- `units`: registry đơn vị dùng chung theo tenant, gồm đơn vị chuẩn và đơn vị đóng gói.
- `ingredient_units`: danh mục đơn vị cho từng nguyên liệu, có đúng một dòng `is_base = true`; UI gọi dòng này là **Đơn vị tồn chuẩn**.
- `entry_unit_id`: đơn vị người dùng nhập trên chứng từ; UI gọi là **Đơn vị nhập** trong PO/GRN/transfer/issue/waste và **Đơn vị đếm** trong kiểm kê; khóa tới `units.id`.
- `to_base_factor`: **Quy đổi về tồn chuẩn**, luôn hiểu là `1 đơn vị nhập/đếm = N đơn vị tồn chuẩn`; UI hiển thị canonical như `1 thùng = 24 chai`.

> **Quy tắc:** `stock_levels.current_quantity`, `stock_movements.quantity_change`, và giá vốn BQ luôn lưu theo **đơn vị tồn chuẩn**. Mọi chứng từ PO, GRN, transfer, issue, waste, stocktake, recipe và production có thể nhập theo `entry_unit_id`; RPC/action phải quy đổi qua `ingredient_units`, không tin unit text từ client.

### 2.2 Database — bảng `ingredients`

Master data **theo tenant** (đã có trong DB). `unit_cost` trên `ingredients` là **giá nhập tham chiếu**; **giá vốn bình quân** theo từng kho nằm ở `stock_levels.avg_unit_cost` và tính trên **đơn vị tồn chuẩn**.

- `item_kind = raw_material`: nguyên liệu đầu vào.
- `item_kind = finished_good`: thành phẩm sản xuất tại chi nhánh hoặc hàng chuẩn bị sẵn được giữ ở stock-bearing location của chi nhánh.

### 2.3 Tồn kho theo chi nhánh — bảng `stock_levels`

- **Khóa:** theo `(tenant_id, branch_id, location_id, ingredient_id)` — flow mới chỉ cộng tồn vận hành từ stock-bearing locations.
- **`current_quantity`:** tồn thực theo **đơn vị tồn chuẩn** của nguyên liệu trong `ingredient_units`.
- **`avg_unit_cost`:** **giá vốn bình quân** tại kho đó, tính theo **đơn vị tồn chuẩn**, cập nhật khi **GRN** (tại Kho CN của chi nhánh) và có thể dùng làm **đơn giá ghi sổ** khi một chi nhánh chuyển sang chi nhánh khác (policy mặc định: giá vốn BQ tại thời điểm xuất).

---

## 3. Công thức (Recipes)

Định mức nguyên liệu theo `menu_item`. Dùng để **xuất kho** (`consumption`) khi đơn hàng chuyển sang `completed` (thực hiện bằng RPC, không lặp HTTP). `recipes.quantity` là số lượng theo `recipes.entry_unit_id`; khi ghi movement phải quy đổi về base unit trước khi trừ tồn và tính WAC.

```sql
-- Mục tiêu schema (triển khai theo migration)
CREATE TABLE recipes (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES tenants(id),
  menu_item_id    BIGINT NOT NULL REFERENCES menu_items(id),
  ingredient_id   BIGINT NOT NULL REFERENCES ingredients(id),
  quantity        NUMERIC(15,3) NOT NULL,
  entry_unit_id   BIGINT REFERENCES units(id),
  note            TEXT,
  yield_factor    NUMERIC(15,6) NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (menu_item_id, ingredient_id, tenant_id)
);
```

### 3b. Công thức sản xuất & mẻ sản xuất (`production_runs`)

Sản xuất dùng bộ bảng riêng:

- `production_recipes`: BOM cho **thành phẩm** (`finished_good_id`) và các **nguyên liệu đầu vào** (`ingredient_id`), có `entry_unit_id` và `yield_factor`.
- `production_runs`: mẻ sản xuất tại chi nhánh (`branch_kind = 'branch'`); state machine `draft -> in_progress -> completed` (hoặc `cancelled`).

Workflow sản xuất chuẩn (RPC family gọi từ `apps/web/app/(protected)/inventory/production-run-actions.ts`):

1. Chi nhánh sản xuất nhận nguyên liệu qua GRN hoặc transfer thật nếu có.
2. Tạo mẻ bằng `create_production_run_with_locations` (trạng thái `draft`); `start_production_run` chuyển sang `in_progress`.
3. `confirm_production_run` kiểm tra:
   - caller là production operator (`is_inventory_production_operator()`) và có `inventory:production_confirm` trên đúng `branch_id`,
   - item đầu ra phải có `item_kind = finished_good`,
   - có đủ `production_recipes`,
   - tồn kho nguyên liệu đủ để trừ sau khi quy đổi BOM từ `entry_unit_id` về base unit; cho phép chốt actual quantity/actual ingredients lệch so với plan.
4. RPC ghi atomically:
   - `production_consumption` cho nguyên liệu đầu vào,
   - `production_output` cho thành phẩm đầu ra,
   - cập nhật `stock_levels`,
   - chốt `production_runs.status = completed`.

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
- Liên kết tùy loại: `order_id`, `grn_id`, `transfer_id`, `unit_cost` (**đơn giá ghi sổ** snapshot tại thời điểm ghi, theo đơn vị tồn chuẩn; không gọi là WAC trên lịch sử movement).

### POS food-cost boundary

Mặc định Sale Runtime ghi `stock_movements.consumption/sale_consumption` tại
Kho chi nhánh bằng RPC atomic khi đơn đã `paid` + `completed`: line có KDS chờ
`first_ready_at`, còn line không có KDS chỉ được trừ sau khi đã dispatch qua
phiếu bếp in. `pos_stock_outcome_posting` là một switch Owner-only để tắt riêng
một chi nhánh khi cần rollback; khi tắt, POS không trừ và không rào tồn. Báo
cáo tiêu hao thủ công không được ghi lại nguyên liệu đã trừ từ bán POS.

---

## 5. Nhập kho — GRN

### 5.1 Quy trình

1. Thiết lập **NCC**, điều khoản thanh toán.
2. Tạo **PO** gắn **branch_id** = chi nhánh nhận hàng (`branch`).
3. NCC giao hàng → kiểm đếm, QC.
4. Lập **GRN** (số thực nhận theo **đơn vị nhập**, đơn giá nhập theo **đơn vị nhập**) → **xác nhận GRN** (RPC) → quy đổi về đơn vị tồn chuẩn, cập nhật tồn stock-bearing location + **giá vốn BQ**.
5. Nếu Finance cần đối soát ngay: nhập **supplier_invoice** → **3-way matching** với PO & GRN (§7). Bước này là Finance P1/handoff, không chặn luồng tồn kho.

**Nguyên tắc:** Giá nhập theo **GRN** (thực nhận), không theo số đặt PO. `grn_items.unit_cost` là **Đơn giá nhập** (`₫ / đơn vị nhập`), không phải giá vốn BQ. GRN chỉ được tạo tại site stock-bearing (`branch`).

### 5.2 Schema tham chiếu — `goods_received_notes` / `grn_items`

**`branch_id` trên GRN là inventory site nhận hàng.** GRN nhận vào Kho CN (`warehouse`), location stock-bearing active duy nhất của chi nhánh.

---

## 6. Phương pháp tính giá xuất kho

- **v1 (đang hướng tới):** **Giá bình quân gia quyền (WAC)** trên từng `stock_levels`, cập nhật khi **xác nhận GRN** tại chi nhánh.
- **FIFO / FEFO theo lô:** hướng mở rộng sau (cần bảng lô/batch); phần mở đầu §6 cũ nhắc FIFO như **nguyên tắc thực phẩm**, không mâu thuẫn nếu ghi rõ **hệ thống v1 dùng WAC**.

Công thức WAC sau mỗi dòng nhập (đơn giản hóa):

```
Q_new = Q_old + Q_recv_base
WAC_new = (Q_old × WAC_old + Q_recv_base × đơn_giá_nhập_quy_đổi_về_tồn_chuẩn) / Q_new   (khi Q_new > 0)
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

- `owner`: full access Inventory tenant-wide — procurement, Kho CN, production, và giám sát; cũng xem qua `reports` / `finance`.
- `warehouse_manager`: role procurement và outbound transfer theo grant; không gắn site trực riêng (D073 §1).
- `production_manager`: role production theo grant; sản xuất hằng ngày chạy tại chi nhánh (D068).
- `branch_manager`: vận hành tồn Kho CN, nhận transfer, stocktake, và duyệt tiêu hao trong ngày; theo D068 có own-branch GRN (tạo/xác nhận), production (tạo/xác nhận), `procurement:read`, và tạo nhanh NCC (`procurement:supplier_manage`).
- `office`, `cashier`, `chef`: không có Inventory route theo ACL hiện tại.

Chi tiết enforcement: RLS + `packages/shared/src/auth/module-acl.ts`.

---

## Tài liệu liên quan

- [einvoice-tax.md](einvoice-tax.md) — VAT đầu vào, HĐ NCC
- [inventory-sop.md](inventory-sop.md) — SOP vận hành cho topology `tenant / chi nhánh / Kho CN / tiêu hao`
- [inventory-role-handoff.md](inventory-role-handoff.md) — bản handoff 1 trang cho training vận hành
- [inventory-rbac-matrix.md](inventory-rbac-matrix.md) — ma trận quyền Inventory theo boundary hiện tại
