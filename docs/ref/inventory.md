# Kho Hàng — Inventory Management

> Áp dụng: Cơm Tấm Má Tư CTCP — quản lý kho nguyên liệu và thành phẩm F&B  
> Phạm vi: M5 Stock + M5-Ext — **Kho Tổng (nhập NCC) + Bếp trung tâm sản xuất thành phẩm + luân chuyển nội bộ + GRN + stocktake + báo cáo vận hành**. `supplier_invoice`, 3-way matching, payment status, và AP aging là Finance P1/handoff, không chặn Inventory pilot.

---

## Cách đọc tài liệu này

Tài liệu này cố ý gộp 3 lớp để dễ dùng trong pilot:

- `Hoàn thành now`: phần đã có nền rõ trong codebase hiện tại
- `Lean target`: phần nên có để pilot vận hành tốt hơn, nhưng chưa mặc định coi là đã ship
- `Deferred`: phần có giá trị nhưng cố ý hoãn để tránh biến Inventory thành ERP/WMS

Nếu một ý tưởng mới không rõ nằm ở lớp nào, mặc định coi là `deferred` cho đến khi có quyết định riêng.

## Trạng thái triển khai (doc ↔ codebase)

| Nội dung | Hoàn thành now | Lean target | Deferred / không làm lúc này |
| -------- | ----------- | ----------- | ---------------------------- |
| Nguyên liệu `ingredients` | Có — migration `20260406310000_stock.sql` | Thêm semantics rõ hơn cho hao hụt sơ chế | Không mở item master kiểu ERP nhiều lớp |
| Tồn kho `stock_levels` | Có — `current_quantity`, `avg_unit_cost` | Giữ WAC nhất quán ở mọi readout quan trọng | Không chuyển sang FIFO engine |
| Biến động `stock_movements` | Có — `adjustment`, `count_adjustment`, `consumption`, `grn_receipt`, `transfer_*`, `production_*` | Chuẩn hóa reason codes và report semantics | Không mở lot-first ledger / batch accounting |
| Mô hình site | Có — `central_warehouse`, `branch`, `central_kitchen` | Hỗ trợ linh hoạt `CW -> Bếp trung tâm`, `CW -> Kho chi nhánh`, `Bếp trung tâm -> Kho chi nhánh`, và tiêu hao tại bếp chi nhánh | Không mở tree `company -> region -> branch -> sub-location` |
| PO / GRN / NCC | Có — bảng + RPC `confirm_grn` | Thêm `price variance` semantics v1 | Không mở PR workflow nhiều bước |
| Luân chuyển nội bộ | Có — `stock_transfers` + workflow | Củng cố short-receipt / discrepancy semantics | Không mở full logistics module |
| HĐ NCC + 3-way matching | Có nền dữ liệu — `supplier_invoices` + matching logic | Finance P1/handoff sau khi stock loop ổn định | Không chặn Inventory pilot; không mở payment proposal engine |
| `recipes` + xuất kho theo order | Có — `recipes` + RPC tiêu hao | Hỗ trợ `yield_factor` | Không mở multi-level BOM |
| Thành phẩm + production hub | Có — `item_kind`, `production_recipes`, `production_orders`, route production | Giữ production ở mức central-kitchen pilot | Không mở labor / overhead / WIP accounting đầy đủ |

## Deferred rõ ràng

Những thứ dưới đây **không phải mục tiêu của Inventory v1/pilot**, dù có xuất hiện trong bộ ERP tham chiếu:

- bin location / barcode / label printing
- FIFO / FEFO costing engine
- `business_documents` workflow kernel
- vendor portal
- payment proposal batches / approval nhiều cấp
- labor, overhead, intercompany accounting
- location hierarchy enterprise nhiều tầng

---

## 1. Mô hình kho hàng F&B — Cơm Tấm Má Tư

**Nguyên tắc vận hành:**

- **Kho Tổng / CW (`branch_kind = 'central_warehouse'`):** là **điểm nhập** từ nhà cung cấp ngoài (có thể multi-instance). Mọi **PO**, **GRN**, và cập nhật **giá vốn (WAC)** đều gắn với các kho này. Hóa đơn NCC/3-way matching là Finance P1, không phải điều kiện mở pilot tồn kho.
- **Bếp Trung Tâm / CK (`branch_kind = 'central_kitchen'`):** nhận **nguyên liệu** từ CW, chạy **lệnh sản xuất**, trừ nguyên liệu theo BOM, và nhập **thành phẩm** vào tồn riêng của bếp (có thể multi-instance).
- **Chi nhánh vận hành (`branch_kind = branch`):** không tạo PO/GRN với NCC trong pilot. Mỗi chi nhánh hiện được vận hành theo hai điểm nội bộ: **Kho chi nhánh** (điểm nhận / giữ tồn) và **Bếp chi nhánh** (điểm tiêu hao cuối cùng cho bán hàng). Hai điểm này cùng nằm trong một site `branch` nhưng được tách bằng `inventory_locations`. Bước **Kho chi nhánh -> Bếp chi nhánh** hiện được chuẩn hóa bằng **intra-branch `stock_transfer`** từ location kho sang location bếp/default consumption.
- **Phiếu luân chuyển nội bộ giữa site thật:** dùng state machine `draft -> confirmed_ship -> in_transit -> confirmed_receive -> received`. Engine áp dụng cho các hướng hợp lệ trong pilot: **CW → CK**, **CW → Branch**, **CK → Branch**. Riêng bước **Kho chi nhánh -> Bếp chi nhánh** là intra-branch transfer một bước, không dùng state machine vận chuyển 5 bước. Transfer ngược (CK→CW, CW↔CW, CK↔CK, Branch→*) bị reject qua trigger.

```
NCC → [PO] → [GRN] → Tồn kho Kho Tổng (nguyên liệu)
                          │
             ┌────────────┴────────────┐
             ▼                         ▼
[CW → Bếp trung tâm]          [CW → Kho chi nhánh]
             │                         │
             ▼                         ▼
 Tồn nguyên liệu Bếp trung tâm     Tồn kho chi nhánh
             │                         │
             ▼                         ▼
 [Lệnh sản xuất / BOM / yield]   [Kho chi nhánh → Bếp chi nhánh]
             │                         │
             ▼                         ▼
Tồn thành phẩm Bếp trung tâm     Tiêu hao bán hàng / POS
             │
             ▼
[Bếp trung tâm → Kho chi nhánh]
             │
             ▼
      Tồn kho chi nhánh
             │
             ▼
   [Kho chi nhánh → Bếp chi nhánh]
             │
             ▼
      Tiêu hao bán hàng / POS

Ghi chú: `Kho chi nhánh` và `Bếp chi nhánh` là hai điểm vận hành trong cùng
site `branch`; chúng không phải hai branch/site riêng. Bước
`Kho chi nhánh -> Bếp chi nhánh` đi qua intra-branch `stock_transfer`
với `from_location_id` là location kho và `to_location_id` là
location bếp/default consumption. Legacy `stock_issue(issue_type = kitchen_use)` đã retired và không thuộc contract ship hiện hành.
```

### 1b. Luân chuyển nội bộ (cùng state machine)

| Bước                           | Trạng thái (DB)     | Việc làm                                                                                       |
| ------------------------------ | ------------------- | ---------------------------------------------------------------------------------------------- |
| Tạo phiếu                      | `draft`             | Chọn kho **gửi** / **nhận** (ví dụ `CW -> Bếp trung tâm`, `CW -> Kho chi nhánh`, `Bếp trung tâm -> Kho chi nhánh`), liệt kê mặt hàng và SL |
| Xác nhận xuất tại kho gửi      | `confirmed_ship`    | Trừ tồn tại `from_branch_id` (`transfer_out`), snapshot WAC vào dòng phiếu                     |
| Đang vận chuyển                | `in_transit`        | Theo dõi (biển số / ghi chú — tùy pha UI)                                                      |
| Bắt đầu kiểm nhận tại kho nhận | `confirmed_receive` | Kho nhận mở kiểm đếm (`receive_started_at`); chưa cộng tồn                                     |
| Xác nhận nhập tại kho nhận     | `received`          | Cộng tồn tại `to_branch_id` (`transfer_in`), ghi nhận SL thực nhận (lệch → điều chỉnh / lý do) |

Trạng thái `cancelled` khi hủy phiếu (theo quyền); không ghi nhận tồn nếu chưa từng `confirmed_ship` (hoặc hoàn tác theo policy nội bộ — ưu tiên tránh xóa bản ghi, dùng workflow hủy).

`Kho chi nhánh -> Bếp chi nhánh` **không** dùng state machine liên-site 5 bước, vì đây vẫn là điều phối nội bộ trong cùng một `branch`. Chứng từ hệ thống hiện hành cho bước này là intra-branch `stock_transfer` một bước, commit atomic từ location kho sang location bếp/default consumption.

### Các loại phiếu kho

| Loại phiếu                  | Mô tả                                            | `stock_movements.type` |
| --------------------------- | ------------------------------------------------ | ---------------------- |
| **Nhập từ NCC (GRN)**       | Tại Kho Tổng hoặc Bếp Trung Tâm                  | `grn_receipt`          |
| **Xuất luân chuyển**        | Trừ kho gửi (`from_branch_id`) khi xác nhận xuất | `transfer_out`         |
| **Nhận luân chuyển**        | Cộng kho nhận (`to_branch_id`) khi hoàn tất nhận | `transfer_in`          |
| **Tiêu hao sản xuất**       | Trừ nguyên liệu tại bếp trung tâm khi confirm production | `production_consumption` |
| **Nhập thành phẩm**         | Cộng tồn thành phẩm tại bếp trung tâm           | `production_output`    |
| **Xuất theo bán**           | Theo recipe khi order `completed`                | `consumption`          |
| **Điều chỉnh / hỏng / mất** | Thủ công                                         | `adjustment`           |
| **Kiểm kê**                 | Điều chỉnh sau đếm                               | `count_adjustment`     |

Ghi chú: phiếu `stock_issue(issue_type = kitchen_use)` đã retired. **Cấp phát từ kho chi nhánh xuống bếp chi nhánh** phải dùng intra-branch `stock_transfer`; ở mức movement ledger, bước này ghi `transfer_out` tại location kho và `transfer_in` tại location bếp/default consumption trong cùng `branch/site`.

---

## 2. Nguyên liệu (Ingredients)

### 2.1 Đơn vị nhập / Đơn vị tính

`ingredients` là nơi duy nhất khai báo đơn vị:

- **Đơn vị nhập (ĐVN) / `purchase_unit`:** đơn vị kho và mua hàng dùng để ghi `stock_levels`, `stock_movements`, PO, GRN, transfer, issue, waste, supplier return, stocktake và báo cáo kho.
- **Đơn vị tính (ĐVT) / `measure_unit`:** đơn vị định lượng nhỏ hơn cho BOM sản xuất tại Bếp Trung Tâm.
- **Tỷ lệ quy đổi / `purchase_to_measure_factor`:** số ĐVT trong 1 ĐVN, ví dụ `1 thùng = 10 kg` thì factor = `10`.

> **Quy tắc:** người dùng chỉ nhập/chọn ĐVN, ĐVT và tỷ lệ quy đổi ở danh mục **Nguyên liệu**. Các nghiệp vụ kho tái sử dụng ĐVN tự động. Ngoại lệ duy nhất là `production_recipes` của Bếp Trung Tâm: BOM nhập theo ĐVT, nhưng khi xác nhận production phải quy đổi về ĐVN trước khi trừ tồn và tính WAC.

### 2.2 Database — bảng `ingredients`

Master data **theo tenant** (đã có trong DB). `unit_cost` trên `ingredients` có thể phản ánh **giá mua gần nhất** (tham chiếu); **giá tồn kho** theo từng kho nằm ở `stock_levels.avg_unit_cost` (WAC).

- `item_kind = raw_material`: nguyên liệu đầu vào.
- `item_kind = finished_good`: thành phẩm do bếp trung tâm sản xuất hoặc hàng chuẩn bị sẵn được giữ ở kho chi nhánh trước khi cấp xuống bếp chi nhánh.

### 2.3 Tồn kho theo chi nhánh — bảng `stock_levels`

- **Khóa:** `(tenant_id, branch_id, ingredient_id)` — mỗi site (Kho Tổng, Bếp Trung Tâm, chi nhánh) một dòng tồn.
- **`current_quantity`:** tồn thực theo **Đơn vị nhập (`ingredients.purchase_unit`)** — tên cột trong DB.
- **`avg_unit_cost`:** giá bình quân gia quyền (WAC) tại kho đó, cập nhật khi **GRN** (tại CW hoặc CK) và có thể dùng làm **đơn giá xuất nội bộ** khi CW hoặc bếp trung tâm chuyển về kho chi nhánh (policy mặc định: WAC tại thời điểm xuất).

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

### 3b. Công thức sản xuất & lệnh sản xuất (Central Kitchen)

Phần mở rộng cho bếp trung tâm dùng bộ bảng riêng:

- `production_recipes`: BOM cho **thành phẩm** (`finished_good_id`) và các **nguyên liệu đầu vào** (`ingredient_id`), có `yield_factor`. Đây là ngoại lệ dùng **Đơn vị tính** của nguyên liệu.
- `production_orders`: lệnh sản xuất tại site có `branch_kind = central_kitchen`.
- `production_order_items`: danh sách thành phẩm và số lượng thực hiện cho từng lệnh.

Workflow sản xuất chuẩn:

1. HQ chuyển nguyên liệu sang bếp trung tâm qua `stock_transfers`.
2. Bếp trung tâm tạo `production_order` ở trạng thái `draft`.
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

> Boundary: đây là **lean extension** phù hợp với pilot; không kéo theo multi-level BOM hay costing engine mới.

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

### Quy tắc xuất kho tự động (khi có `recipes`)

Khi order → `completed`:

1. `order_items` × `recipes` × số lượng món → tổng nguyên liệu theo `branch_id` của order.
2. Trừ `stock_levels.current_quantity` tại location tiêu hao mặc định của site `branch`; về mặt vận hành đây là bước **Bếp chi nhánh -> bán hàng** sau khi hàng đã được cấp bằng intra-branch transfer. `stock_issue(issue_type = kitchen_use)` không còn hợp lệ trong runtime.
3. Cảnh báo nếu dưới `min_stock_level` (logic app / báo cáo).

> Thực hiện trong **Postgres RPC** (ví dụ gọi từ `transition_order_status` khi `served` → `completed`).

---

## 5. Nhập kho — GRN (tại Kho Tổng hoặc Bếp Trung Tâm)

### 5.1 Quy trình (SOP CW/CK)

1. Thiết lập **NCC**, điều khoản thanh toán.
2. Tạo **PO** gắn **branch_id** = Kho Tổng hoặc Bếp Trung Tâm nào sẽ nhập.
3. NCC giao hàng → kiểm đếm, QC.
4. Lập **GRN** (số thực nhận theo ĐVN, đơn giá theo ĐVN, lô/HSD nếu có) → **xác nhận GRN** (RPC) → cập nhật tồn CW/CK + **WAC**.
5. Nếu Finance cần đối soát ngay: nhập **supplier_invoice** → **3-way matching** với PO & GRN (§7). Bước này là Finance P1/handoff, không chặn luồng tồn kho.

**Nguyên tắc:** Food cost nhập mua theo **GRN** (thực nhận), không theo số đặt PO. GRN chỉ được tạo tại site có `branch_kind IN ('central_warehouse', 'central_kitchen')`.

### 5.2 Schema tham chiếu — `goods_received_notes` / `grn_items`

**`branch_id` trên GRN phải là site có `branch_kind = 'central_warehouse'` hoặc `branch_kind = 'central_kitchen'`**. Không tạo GRN cho chi nhánh vận hành từ NCC.

---

## 6. Phương pháp tính giá xuất kho

- **v1 (đang hướng tới):** **Giá bình quân gia quyền (WAC)** trên từng `stock_levels`, cập nhật khi **xác nhận GRN** tại Kho Tổng hoặc Bếp Trung Tâm.
- **FIFO / FEFO theo lô:** hướng mở rộng sau (cần bảng lô/batch); phần mở đầu §6 cũ nhắc FIFO như **nguyên tắc thực phẩm**, không mâu thuẫn nếu ghi rõ **hệ thống v1 dùng WAC**.

Công thức WAC sau mỗi dòng nhập (đơn giản hóa):

```
Q_new = Q_old + Q_recv
WAC_new = (Q_old × WAC_old + Q_recv × đơn_giá_nhập) / Q_new   (khi Q_new > 0)
```

### 6.1 Price Variance — boundary cho v1

Hệ thống v1 không xây full `price governance engine`, nhưng cần vocabulary đủ rõ để pilot không mua đắt mà không biết.

Điểm kiểm soát:

- **PO variance:** so giá PO với giá tham chiếu gần nhất hoặc giá NCC đang dùng.
- **Invoice variance:** so giá HĐ NCC với PO / GRN trong lúc 3-way matching.
- **WAC update:** chỉ cập nhật theo GRN đã confirm, không theo PO.

Ngưỡng gợi ý cho pilot:

| Mức lệch | Ý nghĩa |
| -------- | ------- |
| `<= 2%` | thông tin |
| `> 2% đến 5%` | cảnh báo |
| `> 5%` | cần review thủ công |

Trong pilot:

- ưu tiên **alert + review thủ công**,
- không mở approval workflow nhiều tầng,
- không mở FX variance / price lock / standard cost engine.

---

## 7. 3-Way Matching (PO ↔ GRN ↔ Supplier Invoice) — Finance P1

Áp dụng cho **hàng mua về Kho Tổng hoặc Bếp Trung Tâm** (đầu vào VAT). Điều kiện thanh toán / kê khai: tham chiếu [einvoice-tax.md](einvoice-tax.md) §4.

Đây là handoff Finance P1. Inventory pilot vẫn có thể ready-to-ship nếu PO/GRN/WAC/stock ledger đã đúng nhưng supplier invoice/payment/AP chưa nằm trong daily operator path.

| Bước     | Kiểm tra         | Dung sai gợi ý       |
| -------- | ---------------- | -------------------- |
| PO ↔ GRN | SL nhận / SL đặt | ±5%                  |
| GRN ↔ HĐ | SL HĐ / SL GRN   | HĐ không > thực nhận |
| PO ↔ HĐ  | Đơn giá HĐ / PO  | ±2%                  |

`matching_status`: `pending` | `matched` | `discrepancy` | `approved` (ngoại lệ có duyệt).

**Phiếu luân chuyển nội bộ** không thuộc 3-way matching với NCC (trừ khi sau này có hóa đơn nội bộ — ngoài phạm vi v1).

### 7.1 AP Boundary — accounts payable tối thiểu cho pilot

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
- intercompany AP.

---

## 8. Kiểm kê kho (Stocktake)

> Route: `/inventory/stocktake` (list), `/inventory/stocktake/[id]` (chi tiết đếm/kết quả)

### 8.1 Quy trình

1. **Tạo phiên kiểm kê** (`createStocktakeSession`): chọn chi nhánh → tạo `stocktake_sessions` + tự động tạo `stocktake_lines` từ `stock_levels` hiện có (snapshot `system_quantity`).
2. **Đếm thực tế** (`updateStocktakeLine`): nhập `counted_quantity` cho từng dòng. Chỉ cho phép khi phiên ở trạng thái `in_progress`.
3. **Hoàn tất** (`completeStocktake` → RPC `complete_stocktake`): kiểm tra tất cả dòng đã đếm → re-snapshot `stock_levels.current_quantity` mới nhất (tránh race condition) → tính chênh lệch → INSERT `stock_movements` (type=`count_adjustment`) → cập nhật `stock_levels` + `last_counted_at` qua trigger.
4. **Hủy phiên** (`cancelStocktake`): chỉ khi `in_progress`, chuyển sang `cancelled`.

### 8.2 Bảng

- `stocktake_sessions`: `id, tenant_id, branch_id, started_at, completed_at, status, notes, created_by`
  - Status: `in_progress` | `completed` | `cancelled`
  - Partial unique: chỉ 1 phiên `in_progress` mỗi chi nhánh
- `stocktake_lines`: `id, tenant_id, session_id, ingredient_id, system_quantity, counted_quantity, variance (generated), variance_reason`
  - `variance = counted_quantity - system_quantity` (generated column)

### 8.3 UI

- **Danh sách phiên**: mã phiên (KK-{id}), chi nhánh, ngày, trạng thái. Tìm kiếm theo mã/tên CN.
- **Chi tiết đếm** (in_progress): bảng nguyên liệu + input số lượng đếm + lý do chênh lệch. Auto-save khi blur.
- **Kết quả** (completed): bảng SL hệ thống vs SL thực đếm + chênh lệch + color coding (xanh <1%, vàng 1-5%, đỏ >5%).
- **Tiến độ**: hiển thị `{đã đếm}/{tổng}` khi đang thực hiện.

### 8.4 ACL

- `branch_manager`: tạo + đếm + hoàn tất kiểm kê cho chi nhánh của mình.
- `super_manager`/`owner`: tạo kiểm kê cho bất kỳ chi nhánh nào, xem toàn bộ lịch sử.

---

## 9. Cảnh báo tồn kho

### 9.1 Cảnh báo đặt hàng (Reorder Alerts)

> Hiển thị: card trên dashboard Tổng Quan (`/inventory`)

So sánh `stock_levels.current_quantity` với `ingredients.reorder_point` (theo từng chi nhánh, chỉ `is_active = true`).

- Card vàng khi có nguyên liệu dưới mức đặt hàng, xanh khi đủ tồn.
- Hiển thị top 5 nguyên liệu cần đặt + current/reorder ratio + đơn vị.
- Tính `suggested_order_qty = max_stock_level - current_quantity`.
- Branch scoping: `branch_manager` chỉ thấy chi nhánh mình.

### 9.2 Cảnh báo hạn sử dụng (Expiry Alerts)

> Route: `/inventory/expiry` (danh sách đầy đủ) + card trên dashboard Tổng Quan

Truy vấn `grn_items.expiry_date` (join `goods_received_notes` status=`confirmed`) trong cửa sổ 7 ngày.

- **Urgency**: `expired` (≤0 ngày), `critical` (≤3 ngày), `warning` (≤7 ngày).
- **Dashboard card**: đỏ nếu có hàng hết hạn, vàng nếu sắp hết, xanh nếu an toàn. Link đến `/inventory/expiry`.
- **Trang chi tiết**: bảng đầy đủ với tabs (Tất cả / Đã hết hạn / Sắp hết hạn) + tìm kiếm + lọc chi nhánh.
- **Xóa sổ (Write-off)**: nút "Xóa sổ" trên mỗi dòng → nhập số lượng → tạo `stock_movements` (type=`adjustment`, `quantityChange` âm, reason "Hết hạn sử dụng").

> **Lưu ý:** Không block xuất kho hàng hết hạn (yêu cầu batch tracking — ngoài scope Phase 0). Chỉ cảnh báo + hỗ trợ xóa sổ thủ công.

### 9.3 GRN — Nhiệt độ nhận hàng

Cột `grn_items.receiving_temperature` (`NUMERIC(5,1)`, nullable) — chỉ hiển thị cho nguyên liệu lạnh/đông. UI ẩn cột nhiệt độ nếu không có dòng nào có giá trị.

---

## 10. Báo cáo (gợi ý truy vấn)

- **Food cost (chi nhánh):** lọc `stock_movements` `type = 'consumption'` theo `branch_id` và kỳ thời gian; join `ingredients`.
- **Giá trị tồn:** `sum(current_quantity * avg_unit_cost)` (hoặc `ingredients.unit_cost` nếu chưa có WAC tại kho).
- **AP aging:** nhóm `supplier_invoices` chưa `paid` theo bucket `current / 1-30 / 31-60 / 61-90 / >90 ngày` khi Finance P1 mở; không phải pilot gate.
- **Consumption variance:** so sánh tiêu hao lý thuyết từ recipe với điều chỉnh/kiểm kê thực tế để tìm site lệch lớn.

> **Multi-CW consumption proxy:** `fetchPoSuggestions` scope tồn kho theo một Kho Tổng (CW) được chọn, nhưng consumption vẫn lấy tenant-wide từ `stock_movements` (type=`consumption`) toàn bộ chi nhánh. Đây là proxy gần đúng cho tới khi có mapping `branch → primary_warehouse_id` (chưa build, defer). Với hai CW song song, `avg_daily_consumption` nên coi như upper-bound hint cho mỗi CW, không phải nhu cầu chính xác theo kho.

---

## 11. Quyền truy cập (ACL) — hướng dẫn

Doc source of truth cho module/route access vẫn là `packages/shared/src/auth/module-acl.ts`.
Business-action matrix chi tiết cho Inventory xem ở [inventory-rbac-matrix.md](inventory-rbac-matrix.md).

Tóm tắt pilot hiện tại:

- `super_manager`: role chính cho procurement, Kho Tổng, bếp trung tâm, production.
- `area_manager`: vai trò giám sát inventory tenant-wide tạm thời; không vào procurement.
- `branch_manager`: vận hành tồn kho, nhận transfer, stocktake, và điều phối tồn giữa kho chi nhánh / bếp chi nhánh trong site của mình; không vào procurement.
- `owner`: xem qua `reports` / `finance`, không coi là operator Inventory hằng ngày.
- `office`, `cashier`, `waiter`, `chef`: không có Inventory route theo ACL hiện tại.

Chi tiết enforcement: RLS + `packages/shared/src/auth/module-acl.ts`.

---

## Tài liệu liên quan

- [einvoice-tax.md](einvoice-tax.md) — VAT đầu vào, HĐ NCC
- [inventory-sop.md](inventory-sop.md) — SOP vận hành pilot cho topology `HQ / Bếp trung tâm / Kho chi nhánh / Bếp chi nhánh`
- [inventory-role-handoff.md](inventory-role-handoff.md) — bản handoff 1 trang cho training vận hành
- [inventory-rbac-matrix.md](inventory-rbac-matrix.md) — ma trận quyền Inventory theo boundary hiện tại
- [../archive/ref/inventory-erp-gap-matrix.md](../archive/ref/inventory-erp-gap-matrix.md) — historical ERP mapping; không phải source of truth hiện tại
- [../archive/plan/sprint-3.md](../archive/plan/sprint-3.md) — gợi ý route admin
- [../archive/plan/backlog.md](../archive/plan/backlog.md) — waste, kiểm kê nâng cao (nếu tách bảng)
