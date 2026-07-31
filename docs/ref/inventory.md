# Kho Hàng — Inventory Management

> Áp dụng: doanh nghiệp Cơm Tấm Má Tư — quản lý kho nguyên liệu và thành phẩm F&B
> Phạm vi: **Nhu cầu mua → phân bổ NCC → PO → GRN theo lần giao tại Kho Tổng /
> Bếp TT + sản xuất + tiêu hao + stocktake + báo cáo vận hành**.
> `supplier_invoice`, payment evidence (file HĐ GTGT) và AP aging là Finance
> handoff; không phải gate đóng ngày Inventory.

---

## Cách đọc tài liệu này

Tài liệu này là contract vận hành Inventory hiện tại, không phải roadmap. Nếu một ý tưởng mới không nằm trong bảng dưới đây, mặc định không thuộc scope cho đến khi có quyết định riêng.

Card tổng quan, KPI, và report summary của Inventory phải đọc cùng
[operational-data-contract.md](operational-data-contract.md). Nếu một số liệu
kho không map được vào contract hiện có, cập nhật contract trước khi thêm UI.

## Current Contract

| Nội dung                        | Current contract                                                                                                                                                                                                                                                                | Boundary                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Nguyên liệu `ingredients`       | Master data nguyên liệu phục vụ GRN, tồn kho, production recipe và menu recipe                                                                                                                                                                                                  | Không mở item master ERP nhiều lớp                                                                     |
| Tồn kho `stock_levels`          | `current_quantity`, `avg_unit_cost`; valuation account giữ book value chính xác và chiếu WAC hiện tại sang stock level                                                                                                                                                         | Không chuyển sang FIFO engine                                                                          |
| Biến động `stock_movements`     | Append-only quantity ledger; valuation events append-only giữ value adjustment và lineage qua receipt, transfer, production, consumption, waste và stocktake                                                                                                                    | Không mở lot-first ledger / batch accounting                                                           |
| Mô hình site                    | `branches` là site table Production; kinds active: `branch`, `central_supply` (Kho Tổng), `central_kitchen` (Bếp Trung Tâm). Mỗi site active có đúng một active `warehouse`, đồng thời là default receive/issue/consumption; Branch không có stock location Bếp.                | `production_storage` chỉ dùng tường minh cho production trung tâm; V1 chưa đổi sang `operational_site` |
| Nhu cầu mua / PO / GRN / NCC    | Kho trung tâm lập `purchase_request` chỉ gồm nguyên liệu, số lượng, đơn vị và ngày cần. Kế toán phân bổ đúng đủ số lượng cho một hay nhiều NCC đang cung cấp nguyên liệu, rồi một RPC tạo một PO/NCC và một GRN nháp/PO. PO/GRN không chứa giá nhập từ Kho; giá thương mại chỉ đến từ Hóa đơn NCC. Một PO có nhiều GRN đã chốt nhưng tối đa một nháp hoạt động. | Không có promotion engine, duyệt nhiều cấp, OCR hoặc price-QC tại GRN                                   |
| QC nhận hàng                    | Kho nhập `received_quantity` và `rejected_quantity`; số đạt = thực nhận − từ chối. Có hàng từ chối thì bắt buộc lý do + ảnh. Trạng thái chỉ là giá trị hiển thị được suy ra.                                                                                                    | Không lưu status, tolerance, lot/HSD/nhiệt độ, price variance hoặc auto-approval                       |
| Luân chuyển nội bộ              | Transfer có chủ đích chỉ đi giữa các warehouse hợp lệ. Tiêu hao, write-off và production không được mô phỏng bằng transfer cùng site.                                                                                                                                           | Không có target Kho↔Bếp trong cùng branch                                                              |
| HĐ NCC                          | `supplier_invoices` + đối soát GRN + thanh toán NCC là Finance handoff; thanh toán bắt buộc có file HĐ GTGT đính kèm (ADR 0017)                                                                                                                                                 | Không mở payment proposal engine trong Inventory                                                       |
| Định mức món bán (`recipes`)    | Menu recipe theo món bán + RPC tiêu hao theo order                                                                                                                                                                                                                              | Không mở multi-level BOM                                                                               |
| Thành phẩm + production landing | `item_kind`, `production_recipes`, `production_runs`; branch dùng warehouse duy nhất, production trung tâm chỉ dùng `production_storage` khi workflow chọn tường minh                                                                                                           | Không thực hiện central-production cutover trong lát D091                                              |
| Hao hụt / sự cố                 | Waste/write-off + approvals và issue log; supplier return không còn daily surface                                                                                                                                                                                               | Không mở claim/insurance workflow                                                                      |

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

- **Chi nhánh (`branch_kind = 'branch'`):** tồn vận hành tại **Kho CN**
  (`location_kind = 'warehouse'`). Không có location tồn kho Bếp. Chi nhánh xin
  cấp hàng nội bộ bằng **Yêu cầu hàng**; không tạo Yêu cầu mua, PO hoặc GRN.
- **Kho Tổng (`central_supply`) và Bếp Trung Tâm (`central_kitchen`):** cùng happy
  path Yêu cầu mua → PO theo NCC → GRN theo lần giao; mỗi site active có đúng
  một `warehouse`.
  `production_storage` chỉ hợp lệ khi production trung tâm chọn tường minh,
  không làm fallback cho site/branch thiếu warehouse.
- **Tiêu hao chi nhánh:** nguyên liệu đã dùng để tạo doanh thu được ghi tại Kho CN bằng `stock_movements.type = 'consumption'`, `movement_subtype = 'sale_consumption'`.

```
Kho trung tâm → Yêu cầu mua → PO theo NCC → GRN theo lần giao → `*/warehouse`

Site ── [production_run hiện hành] → trừ nguyên liệu, cộng thành phẩm
  (branch: warehouse; trung tâm: warehouse hoặc production_storage đã chọn)

Kho CN → [phiếu xuất/tiêu hao] → `stock_movements.consumption`
```

### 1b. Luân chuyển nội bộ

`stock_transfers` chỉ chuyển tồn giữa hai warehouse hợp lệ. Không có target
stock location Bếp trong cùng branch. Phiếu consumption/sale-consumption tại
warehouse mới là luồng giảm tồn hiện hành.

### Các loại phiếu kho

| Loại phiếu                    | Mô tả                                            | `stock_movements.type`                                |
| ----------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| **Nhập từ NCC (GRN)**         | Tại CN / Kho Tổng / Bếp TT                       | `grn_receipt`                                         |
| **Xuất luân chuyển**          | Trừ kho gửi (`from_branch_id`) khi xác nhận xuất | `transfer_out`                                        |
| **Nhận luân chuyển**          | Cộng kho nhận (`to_branch_id`) khi hoàn tất nhận | `transfer_in`                                         |
| **Tiêu hao bán hàng thực tế** | Trừ Kho CN theo báo cáo tiêu hao đã duyệt        | `consumption` + `movement_subtype = sale_consumption` |
| **Tiêu hao sản xuất**         | Trừ nguyên liệu tại site khi confirm production  | `production_consumption`                              |
| **Nhập thành phẩm**           | Cộng tồn thành phẩm tại site                     | `production_output`                                   |
| **Xuất theo bán**             | Theo recipe khi order `completed`                | `consumption`                                         |
| **Điều chỉnh / hỏng / mất**   | Thủ công                                         | `adjustment`                                          |
| **Kiểm kê**                   | Điều chỉnh sau đếm                               | `count_adjustment`                                    |

Ghi chú: `mv_food_cost` là dữ liệu recipe/theoretical để đối chiếu. Lãi gộp vận hành dùng actual food cost từ `stock_movements` consumption đã được duyệt.

### Mã chứng từ kho

Mã phiếu mới dùng format `{PREFIX}-{DDMMYYYY}-{####}` (ngày
`Asia/Ho_Chi_Minh`, sequence pad 4 số), cấp atomic qua
`next_inventory_doc_number` / `tenant_inventory_doc_counters`. Sequence vẫn
theo tenant, loại phiếu và năm; không reset theo ngày. Phiếu cũ giữ nguyên mã
lịch sử (không rewrite). Đơn mua hàng dùng `next_po_display_id` và cùng format.

| Loại              | Prefix | Cột                                                         |
| ----------------- | ------ | ----------------------------------------------------------- |
| Đơn mua hàng NCC  | `PO`   | `purchase_orders.display_id`                                |
| Phiếu nhập        | `GRN`  | `goods_received_notes.grn_number`                           |
| Điều chuyển       | `DC`   | `stock_transfers.transfer_number`                           |
| Xuất kho thủ công | `PXK`  | `stock_issues.issue_number`                                 |
| Hao hụt           | `HH`   | `stock_issues.issue_number`                                 |
| Lệnh sản xuất     | `LSX`  | `production_runs.production_number`                         |
| Kiểm kê           | `KK`   | `stocktake_sessions.session_number`                         |
| Phiếu đếm         | `PD`   | `inventory_count_slips.slip_number`                         |
| Yêu cầu hàng      | `YC`   | `stock_requests.request_number`                             |
| Tiêu hao HRM      | `THB`  | `stock_issues.issue_number` = `THB-{report_id}` (không đổi) |

Prefix trong mã là identifier; câu UI vẫn dùng nhãn Việt (`phiếu nhập`, …).
Các cột trên và generated database types là contract hiện hành.

---

## 2. Nguyên liệu (Ingredients)

### 2.1 Hệ đơn vị

Đơn vị kho không còn nằm trên cột text của `ingredients`. Mỗi nguyên liệu có ba
vai trò, trong đó Nhập và Xuất là bắt buộc:

- **Đơn vị nhập:** đơn vị dùng khi nhận/mua nguyên liệu.
- **Đơn vị xuất:** đơn vị dùng để trừ tồn và nhập định mức món bán.
- **Đơn vị sản xuất:** chỉ bật cho item dùng trong BOM/lệnh sản xuất.
- Quy cách luôn theo `Nhập ≥ Xuất ≥ Sản xuất`; cùng đơn vị thì hệ số là `1`.

`units` vẫn là registry dùng chung theo tenant. `ingredients.receipt_unit_id`,
`issue_unit_id`, `production_unit_id` là source of truth của vai trò; không có
đơn vị thứ tư. `ingredient_units.is_base` là **Đơn vị xuất** khi không sản xuất,
hoặc **Đơn vị sản xuất** khi có. UI gọi nó là “tồn kho sẽ ghi nhận theo”, không
trộn với đơn vị người dùng đang nhập chứng từ.

Chọn đơn vị xuất đủ nhỏ cho bếp (ml/g khi chia nhỏ; chai/lon khi dùng nguyên).
SOP vận hành: [inventory-sop.md](inventory-sop.md) §2c.

> **Quy tắc:** `stock_levels.current_quantity`, `stock_movements.quantity_change`
> và giá vốn BQ lưu theo **đơn vị tồn chuẩn**. PO/GRN dùng Nhập; yêu cầu hàng,
> điều chuyển, xuất, tiêu hao, hao hụt và kiểm kê dùng Xuất; BOM/lệnh sản xuất
> dùng Sản xuất. Mỗi dòng chứng từ/movement lưu snapshot đơn vị + factor.
> Owner được thêm/đổi đơn vị và quy đổi bất kỳ lúc nào; khi đổi đơn vị tồn chuẩn,
> RPC `save_ingredient_catalog` quy đổi tồn hiện tại, ngưỡng, WAC và số lượng
> valuation hiện hành trong cùng transaction (tổng giá trị không đổi). Snapshot
> lịch sử không bị viết lại.

Đổi ladder sau khi đã có `stock_movements` không bị khóa. Chỉ từ chối khi gỡ
đơn vị vẫn đang được BOM/production recipe tham chiếu.

### 2.2 Database — bảng `ingredients`

Master data **theo tenant** (đã có trong DB). `unit_cost` trên `ingredients` không phải nguồn giá kho. **Giá vốn bình quân** theo từng kho nằm ở `stock_levels.avg_unit_cost` và tính trên **Đơn vị xuất**.

- `item_kind = raw_material`: nguyên liệu đầu vào.
- `item_kind = finished_good`: thành phẩm sản xuất tại chi nhánh hoặc hàng chuẩn bị sẵn được giữ ở stock-bearing location của chi nhánh.

### 2.3 Tồn kho theo chi nhánh — bảng `stock_levels`

- **Khóa:** theo `(tenant_id, branch_id, location_id, ingredient_id)` — flow mới chỉ cộng tồn vận hành từ stock-bearing locations.
- **`current_quantity`:** tồn thực theo **Đơn vị xuất** của nguyên liệu.
- **`avg_unit_cost`:** **giá vốn bình quân** tại kho đó, tính theo **Đơn vị xuất**, được cập nhật từ sổ định giá khi Hóa đơn NCC được xác nhận và có thể dùng làm **đơn giá ghi sổ** khi một chi nhánh chuyển sang chi nhánh khác (policy mặc định: giá vốn BQ tại thời điểm xuất).

---

## 3. Định mức món bán (Menu recipes)

> Contract thuật ngữ: `MenuRecipe`/“Định mức món bán” là định mức tiêu hao cho
> `menu_item`, lưu ở bảng lịch sử `recipes` và quản lý tại
> `/inventory/menu-recipes`. Không gọi miền này là `Recipe` trần trong source
> ứng dụng. `ProductionRecipe`/“Công thức sản xuất” là BOM thành phẩm riêng,
> lưu ở `production_recipes` và quản lý trong tab Công thức của
> `/inventory/production`.

Định mức nguyên liệu theo `menu_item`. Dùng để **xuất kho** (`consumption`) khi
đơn hàng chuyển sang `completed` (thực hiện bằng RPC, không lặp HTTP).
`recipes.quantity` luôn là lượng tiêu hao trực tiếp theo **Đơn vị xuất** của
nguyên liệu và `recipes.entry_unit_id` phải trỏ tới đơn vị đó. Định mức món bán
không có Yield.

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
  yield_factor    NUMERIC(15,6) NOT NULL DEFAULT 1, -- tương thích SQL; ứng dụng luôn dùng 1
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (menu_item_id, ingredient_id, tenant_id)
);
```

### 3b. Công thức sản xuất & mẻ sản xuất (`production_runs`)

Sản xuất dùng bộ bảng riêng:

- `production_recipes`: BOM cho **thành phẩm** (`finished_good_id`) và các **nguyên liệu đầu vào** (`ingredient_id`), có `entry_unit_id` và `yield_factor`.
- `production_runs`: mẻ sản xuất tại site; state machine
  `draft -> in_progress -> completed` (hoặc `cancelled`).

Workflow sản xuất chuẩn (RPC family gọi từ `apps/web/app/(protected)/inventory/production-run-actions.ts`):

1. Site nhận nguyên liệu qua GRN vào warehouse đang hoạt động; không tạo
   transfer giả để cấp nguyên liệu cho production.
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

Quy tắc kế hoạch so với thực tế:

- Số lượng kế hoạch (`planned output` / “Định làm”) chỉ điều khiển định mức và
  phần tiêu hao được điền sẵn.
- Số lượng thành phẩm thực tế (`actual output` / “Thực ra”) chỉ điều khiển giá
  vốn đơn vị đầu ra; không được dùng để tự co giãn tiêu hao đã ghi nhận.
- Người vận hành có thể chốt nguyên liệu và số lượng thực dùng khác kế hoạch.
  Hao hụt làm tăng giá vốn thành phẩm và không tự sinh một dòng phế phẩm.
- `confirm_production_run` phải kiểm tra tồn kho sau khi áp dụng bộ nguyên liệu
  thực tế rồi ghi consumption, output, stock level và trạng thái trong cùng một
  giao dịch.

### 3c. Yield Factor của công thức sản xuất — hao hụt sơ chế

> Boundary: đây là current Inventory control; không kéo theo multi-level BOM hay costing engine mới.

- `production_recipes.yield_factor` biểu diễn tỷ lệ giữ lại sau sơ chế; không áp dụng cho `recipes` của món bán.
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

1. Thiết lập **NCC**, điều khoản thanh toán và gán nguyên liệu NCC được phép
   cung cấp trong `supplier_items`.
2. Kho Tổng hoặc Bếp Trung Tâm tạo **Yêu cầu mua**. Đây là nhu cầu mua ngoài;
   **Yêu cầu hàng** vẫn chỉ dùng cho cấp hàng nội bộ về chi nhánh.
3. Kế toán hoặc Owner tạo một hay nhiều **PO** từ Yêu cầu mua. Mỗi PO thuộc đúng
   một Yêu cầu mua và một NCC; PO chỉ xác nhận nhu cầu, NCC, số lượng và đơn vị.
4. Khi PO chuyển sang `sent`, hệ thống tạo ngay đúng một GRN nháp
   **Chờ nhập hàng**, sao chép các dòng còn thiếu và khóa nháp thứ hai của cùng
   PO. Người nhận hàng làm việc trực tiếp từ danh sách GRN, không cần quay lại
   PO để tạo phiếu.
5. Kho nhập thực nhận và từ chối. Khi xác nhận, RPC khóa PO/GRN/dòng, tính phần
   áp dụng PO và ghi tăng số lượng đúng một lần. Giá tạm chỉ có thể lấy từ một
   Hóa đơn NCC đã xác nhận trước đó; nếu chưa có thì dòng chờ Hóa đơn NCC. PO
   chuyển `partially_received` hoặc `received` trong cùng transaction; nếu còn
   thiếu, hệ thống tự tạo GRN nháp kế tiếp.
6. Finance ghi nhận **Hóa đơn NCC** riêng, có thể đối chiếu nhiều GRN/PO cùng
   NCC; thanh toán và phiếu giảm công nợ phân bổ nhiều-nhiều với hóa đơn.

**Nguyên tắc nhận hàng theo PO:** `grn_items.po_applied_quantity` là phần thực nhận dùng
hoàn thành PO. Giá cuối cùng thuộc dòng Hóa đơn NCC đã xác nhận và được phân bổ
vào GRN; PO không là nguồn giá. Kho không được nhận monetary payload từ server.

PO mới chỉ dùng nguyên liệu có mapping `supplier_items.is_active = true` với NCC
của PO. Bỏ mapping không sửa chứng từ lịch sử. GRN mới suy NCC từ PO và không
cho đổi nguyên liệu, quy cách hoặc NCC.

Đối soát tiền dùng giá trị dòng Hóa đơn NCC trước VAT và chiết khấu chứng từ,
phân bổ theo số lượng thực nhận trên GRN. Nếu NCC tính tiền phần dư, Finance ghi
`unplanned_billed_quantity`; việc chấp nhận chênh lệch bắt buộc có lý do và
không sửa số lượng lịch sử GRN.
`vat_amount` chỉ cộng vào công nợ phải trả; không làm tăng giá trị hàng nhận
trong bước đối soát này. `supplier_invoices.vat_breakdown` giữ từng nhóm
0%/5%/8%/10% của chứng từ; header `subtotal`, `vat_amount` và `total_amount`
được suy ra từ tổng các nhóm.

### 5.2 Schema tham chiếu — `goods_received_notes` / `grn_items`

**`branch_id` trên GRN là inventory site nhận hàng.** GRN nhận vào active
warehouse duy nhất của site.

QC vật lý trên mỗi dòng chỉ có:

- `received_quantity`: số lượng thực giao;
- `rejected_quantity`: số lượng không nhận, từ `0` đến `received_quantity`;
- số lượng đạt được suy ra bằng `received_quantity - rejected_quantity`;
- khi `rejected_quantity > 0`, bắt buộc lý do và ảnh trước confirm.

GRN có toàn bộ số lượng bị từ chối không tạo giao dịch mua hay nhập tồn: giữ
chứng từ chưa liên kết PO để hủy, thay vì tạo PO giá trị bằng không.

Không lưu `quality_status`; UI suy ra `accepted` / `partial` / `rejected` để
hiển thị. GRN không lưu lot/HSD/nhiệt độ, short-delivery action, price
variance/baseline/evidence hoặc quyết định review.

---

## 6. Phương pháp tính giá xuất kho

- **Current:** **Giá bình quân gia quyền (WAC)** trên từng `stock_levels`, cập
  nhật từ sổ định giá khi Hóa đơn NCC được xác nhận.
- **FIFO / FEFO theo lô:** hướng mở rộng sau (cần bảng lô/batch); phần mở đầu §6 cũ nhắc FIFO như **nguyên tắc thực phẩm**, không mâu thuẫn nếu ghi rõ **hệ thống v1 dùng WAC**.

Công thức WAC sau mỗi dòng nhập (đơn giản hóa):

```
Q_new = Q_old + Q_recv_base
WAC_new = (Q_old × WAC_old + Q_recv_base × đơn_giá_nhập_quy_đổi_về_tồn_chuẩn) / Q_new   (khi Q_new > 0)
```

### 6.1 Kiểm soát giá

Kế toán hoặc Owner nhập và xác nhận đơn giá trên Hóa đơn NCC. Inventory không
tính ngưỡng lệch giá, không yêu cầu Kho giải trình/đính ảnh giá và không tạo
approval thứ hai tại GRN. Kết quả đối soát không thay đổi QC vật lý hay làm phát
sinh price-QC trong Inventory.

---

## 7. Supplier Invoice Handoff — Finance

Áp dụng cho **hàng mua về chi nhánh** (đầu vào VAT). Điều kiện thanh toán / kê khai: tham chiếu [einvoice-tax.md](einvoice-tax.md) §4.

Đây là Finance handoff. Inventory vẫn đóng ngày được khi Hóa đơn NCC chưa về.
Khi hóa đơn được xác nhận, valuation settlement phân bổ chênh lệch giữa tồn
còn lại, thành phẩm và các variance bucket mà không thay đổi số lượng. Late
invoice của kỳ đã đóng được ghi vào kỳ hiện tại; payment không thay đổi giá trị
tồn hoặc food cost.

| Bước     | Kiểm tra       | Boundary             |
| -------- | -------------- | -------------------- |
| GRN ↔ HĐ | SL HĐ / SL GRN | HĐ không > thực nhận |
| GRN ↔ HĐ | Đơn giá        | Lệch cần review rõ   |

`matching_status`: `pending` | `matched` | `discrepancy` | `approved` (ngoại lệ có duyệt).

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

- `branch_manager`: tạo + đếm + hoàn tất kiểm kê cho chi nhánh trong phạm vi của
  mình khi có permission tương ứng.
- `owner`: tạo kiểm kê cho bất kỳ chi nhánh nào, xem toàn bộ lịch sử.

---

## 9. Cảnh báo tồn kho

### 9.1 Cảnh báo ngưỡng tồn

> Hiển thị: card trên dashboard Tổng Quan (`/inventory`)

So sánh `stock_levels.current_quantity` với `ingredients.min_stock_level` (theo từng chi nhánh, chỉ `is_active = true`). UI, import/export và cài đặt chỉ công bố một trường **Tồn tối thiểu**; `reorder_point` và `max_stock_level` là cột tương thích cũ và được ghi `NULL` khi danh mục được cập nhật.

- Card vàng khi tồn chạm hoặc thấp hơn `Min`, xanh khi đủ tồn.
- Hiển thị top 5 nguyên liệu cần nhập + current/Min ratio + đơn vị.
- Tính `suggested_order_qty = max(0, min_stock_level - current_quantity)`.
- Branch scoping: `branch_manager` chỉ thấy chi nhánh mình.

### 9.2 Hạn sử dụng

Inventory v1 không vận hành sổ lô, FIFO/FEFO, cảnh báo hạn dùng, hoặc route
`/inventory/expiry`.

- GRN draft ghi số thực nhận / đơn vị nhập / số từ chối / lý do + ảnh khi có;
  giá chỉ được nhận từ Hóa đơn NCC đã xác nhận. Không ghi lô/HSD/nhiệt độ.
- Stock control dùng WAC + tồn theo location; cảnh báo ưu tiên hiện tại là tồn thấp/reorder và phiếu đang mở.
- Khi cần quản lý hạn dùng thật, phải thiết kế lại thành lot ledger hoàn chỉnh.

---

## 10. Báo cáo (gợi ý truy vấn)

- **Food cost (chi nhánh):** lọc `stock_movements` `type = 'consumption'` theo `branch_id` và kỳ thời gian; join `ingredients`.
- **Giá trị tồn:** `sum(current_quantity * avg_unit_cost)` trên stock-bearing locations.
- **AP aging:** nhóm `supplier_invoices` chưa `paid` theo bucket `current / 1-30 / 31-60 / 61-90 / >90 ngày` khi Finance handoff mở; không phải gate đóng ngày Inventory.
- **Consumption variance:** so sánh tiêu hao lý thuyết từ recipe (`mv_food_cost`) với actual approved consumption (`stock_movements.consumption/sale_consumption`) để tìm site lệch lớn.

---

## 11. Quyền truy cập (ACL) — hướng dẫn

SSOT phân vai / nav: [inventory-role-ops.md](inventory-role-ops.md) (**D093**).
Module/route: `packages/shared/src/auth/module-acl.ts`; coarse roles:
`inventory-roles.ts`. Mutation: permission keys + RLS/RPC.

Tóm tắt (D093):

- `owner`: tenant-wide; catalog + `default_fulfill_site_kind`; WAC; oversight.
- `accountant`: GRN đọc (trung tâm) + PO/giá + Finance; không QC/tồn/SX/yêu cầu CN.
- `central_supply_ops` / `central_kitchen_lead`: GRN tại site ghim; inbox yêu cầu
  theo nguồn; fulfill→DC (`transfer_create`); Bếp TT thêm production. Không PO.
  Được **xem** danh mục nguyên liệu (`/inventory/ingredients`); Owner CRUD.
- `branch_manager`: yêu cầu hàng + tồn/tiêu hao/kiểm kê/hao hụt/nhận DC; **không**
  GRN, PO, production, giá mua chuỗi.
- `cashier` / `chef` / `branch_staff`: chỉ đếm khi được gán.

---

## Tài liệu liên quan

- [inventory-role-ops.md](inventory-role-ops.md) — phân vai, routing, luồng D093
- [einvoice-tax.md](einvoice-tax.md) — VAT đầu vào, HĐ NCC
- [inventory-sop.md](inventory-sop.md) — SOP vận hành
