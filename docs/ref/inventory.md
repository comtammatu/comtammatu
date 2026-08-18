# Kho Hàng — Inventory Management

> Áp dụng: doanh nghiệp Cơm Tấm Má Tư — quản lý kho nguyên liệu và thành phẩm F&B
> Phạm vi: **Nhu cầu mua → xác định NCC → PO → GRN theo lần giao tại Kho Tổng /
> Bếp TT + sản xuất + tiêu hao + stocktake + báo cáo vận hành**.
> `supplier_invoice`, payment evidence (file HĐ GTGT) và AP aging là Finance
> handoff; không phải gate đóng ngày Inventory.

---

## Cách đọc tài liệu này

Contract vận hành Inventory hiện tại, không phải roadmap. Ý tưởng ngoài bảng dưới đây mặc định ngoài scope. Card/KPI/report summary đọc cùng [operational-data-contract.md](operational-data-contract.md); số liệu kho không map được thì cập nhật contract trước khi thêm UI.

## Current Contract

| Nội dung                        | Current contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Boundary                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Nguyên liệu `ingredients`       | Master: hàng mua (`raw_material`) phục vụ PO/GRN/NCC; thành phẩm (`finished_good`) chỉ SKU Bếp TT sản xuất có công thức                                                                                                                                                                                                                                                                                                | Không mở item master ERP nhiều lớp                                                                     |
| Tồn kho `stock_levels`          | `current_quantity`, `avg_unit_cost`; valuation account giữ book value chính xác và chiếu WAC hiện tại sang stock level                                                                                                                                                                                                                                                                                                                                                                | Không chuyển sang FIFO engine                                                                          |
| Biến động `stock_movements`     | Append-only quantity ledger; valuation events append-only giữ value adjustment và lineage qua receipt, transfer, production, consumption, waste và stocktake                                                                                                                                                                                                                                                                                                                          | Không mở lot-first ledger / batch accounting                                                           |
| Mô hình site                    | `branches` là site table Production; kinds active: `branch`, `central_supply` (Kho Tổng), `central_kitchen` (Bếp Trung Tâm). Mỗi site active có đúng một active `warehouse`, đồng thời là default receive/issue/consumption; Branch không có stock location Bếp.                                                                                                                                                                                                                      | `production_storage` chỉ dùng tường minh cho production trung tâm; V1 chưa đổi sang `operational_site` |
| Nhu cầu mua / PO / GRN / NCC    | Kho trung tâm lập `purchase_request` chỉ gồm nguyên liệu, số lượng, đơn vị và ngày cần. Nếu mỗi nguyên liệu còn thiếu chỉ có một NCC active, hệ thống tự lấy toàn bộ số lượng còn lại và tạo một PO/NCC. Kế toán chỉ chọn hoặc chia số lượng khi có nhiều NCC; dòng chưa có NCC bị chặn để bổ sung mapping. Một RPC tạo PO và một GRN nháp/PO. PO không chứa giá. Số giữ trên phiếu nhập viết lại SL dòng PO khi NCC giao dư (ADR 0042). Phiếu nhập ghi **Đơn giá** net (chưa VAT) cho nguyên liệu; đó là giá ghi sổ. Hóa đơn NCC chỉ công nợ + VAT. Một PO có nhiều GRN đã chốt nhưng tối đa một nháp hoạt động. | Không có promotion engine, duyệt nhiều cấp, OCR hoặc price-QC (so lệch giá HĐ) tại GRN               |
| QC nhận hàng                    | Kho nhập `received_quantity` và `rejected_quantity`; số đạt = thực nhận − từ chối. Có hàng từ chối thì bắt buộc lý do + ảnh. Trạng thái chỉ là giá trị hiển thị được suy ra.                                                                                                                                                                                                                                                                                                          | Không lưu status, tolerance, lot/HSD/nhiệt độ, price variance hoặc auto-approval                       |
| Luân chuyển nội bộ              | Transfer có chủ đích chỉ đi giữa các warehouse hợp lệ. Tiêu hao, write-off và production không được mô phỏng bằng transfer cùng site.                                                                                                                                                                                                                                                                                                                                                 | Không có target Kho↔Bếp trong cùng branch                                                              |
| HĐ NCC                          | `supplier_invoices` + đối soát GRN + thanh toán NCC là Finance handoff; thanh toán bắt buộc có file HĐ GTGT đính kèm (ADR 0017)                                                                                                                                                                                                                                                                                                                                                       | Không mở payment proposal engine trong Inventory                                                       |
| Định mức món bán (`recipes`)    | Menu recipe theo món bán + RPC tiêu hao theo order                                                                                                                                                                                                                                                                                                                                                                                                                                    | Không mở multi-level BOM                                                                               |
| Thành phẩm + production landing | `finished_good` chỉ SKU có công thức sản xuất; `production_recipes`, `production_runs`; branch dùng warehouse duy nhất, production trung tâm chỉ dùng `production_storage` khi workflow chọn tường minh                                                                                                                                                                                                               | Không thực hiện central-production cutover trong lát D091                                              |
| Hao hụt / sự cố                 | Waste/write-off + approvals và issue log; supplier return không còn daily surface                                                                                                                                                                                                                                                                                                                                                                                                     | Không mở claim/insurance workflow                                                                      |

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
- **Tiêu hao chi nhánh:** nguyên liệu đã dùng để tạo doanh thu hoặc tiêu hao
  vận hành đã ghi nhận tại Kho CN bằng `stock_movements.type = 'consumption'`,
  `movement_subtype = 'sale_consumption'`.

```
Kho trung tâm → Yêu cầu mua → PO theo NCC → GRN theo lần giao → `*/warehouse`

Site ── [production_run hiện hành] → trừ nguyên liệu, cộng thành phẩm
  (branch: warehouse; trung tâm: warehouse hoặc production_storage đã chọn)

Kho CN → [phiếu tiêu hao] → `stock_movements.consumption` / `sale_consumption`
Kho CN → [phiếu hao hụt HH / waste] → `writeoff` (không vào giá vốn món)
```

### 1b. Luân chuyển nội bộ

`stock_transfers` chỉ chuyển tồn giữa hai warehouse hợp lệ. Không có target
stock location Bếp trong cùng branch. Phiếu tiêu hao (`sale_consumption`) tại
warehouse mới là luồng giảm tồn gắn giá vốn món.

### Các loại phiếu kho

| Loại phiếu                    | Mô tả                                            | `stock_movements.type`                                |
| ----------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| **Nhập từ NCC (GRN)**         | Chỉ Kho Tổng / Bếp TT (không GRN tại chi nhánh)  | `grn_receipt`                                         |
| **Xuất luân chuyển**          | Trừ kho gửi (`from_branch_id`) khi xác nhận xuất | `transfer_out`                                        |
| **Nhận luân chuyển**          | Cộng kho nhận (`to_branch_id`) khi hoàn tất nhận | `transfer_in`                                         |
| **Tiêu hao bán hàng thực tế** | POS recipe hoặc phiếu tiêu hao đã xác nhận       | `consumption` + `movement_subtype = sale_consumption` |
| **Tiêu hao sản xuất**         | Trừ nguyên liệu tại site khi confirm production  | `production_consumption`                              |
| **Nhập thành phẩm**           | Cộng tồn thành phẩm tại site                     | `production_output`                                   |
| **Hao hụt / hủy hỏng**        | Phiếu HH qua luồng waste                         | `consumption` + `movement_subtype = writeoff`         |
| **Điều chỉnh / kiểm kê**      | Thủ công / sau đếm                               | `adjustment` / `count_adjustment`                     |

**Contract chứng từ thủ công (không còn `other`):**

| Việc vận hành | Surface tạo | `stock_issues.issue_type` | Finance |
| --- | --- | --- | --- |
| Tiêu hao | `/stock/consumption` (Branch) hoặc `/inventory/consumption` (Owner; tab Đã ghi nhận / Phiếu tiêu hao) | `consumption` | Tiêu hao vận hành — không vào Giá vốn món |
| Hao hụt | `/stock/waste` (Branch) hoặc `/inventory/waste/new` (Owner); Owner lịch sử trên tab Hao hụt của `/inventory/consumption?view=waste` (`/inventory/issues` redirect vào tab này) | `writeoff` | Waste — không vào giá vốn món |

Không có loại `other` / “Xuất khác”. UI: **phiếu tiêu hao** hoặc **hao hụt**.
Giá vốn lý thuyết `/finance/food-cost` = `fetchFoodCost` (định mức catalog × SL). Lãi gộp / Giá vốn món = chỉ POS `sale_consumption` tại `branch_kind=branch` (có `order_id`) khi cutover `active`. Không gồm phiếu tay, Kho Tổng, Bếp TT, writeoff/waste. Gửi hàng giữa site = điều chuyển.

### Mã chứng từ kho

Format `{PREFIX}-{DDMMYYYY}-{####}` (`Asia/Ho_Chi_Minh`, pad 4), atomic qua
`next_inventory_doc_number` / `tenant_inventory_doc_counters` (tenant + loại +
năm; không reset theo ngày). PO dùng `next_po_display_id`. Phiếu cũ giữ mã lịch sử.

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

Prefix là identifier; UI dùng nhãn Việt. Cột trên + generated types là contract hiện hành.

---

## 2. Nguyên liệu (Ingredients)

### 2.1 Hệ đơn vị

`units` là registry theo tenant. Mỗi nguyên liệu có 1–20 dòng `ingredient_units`
active và đúng một `is_base = true` (**Đơn vị chuẩn**). Đơn vị đầu tiên thêm tự
động là Đơn vị chuẩn; có thể đổi trong cùng danh sách.

`ingredients.receipt_unit_id` / `issue_unit_id` chỉ là gương tương thích của Đơn
vị chuẩn; `production_unit_id` để `NULL`. Runtime không đọc/hiển thị ba cột này
(xóa ở migration sau soak).

Editor: đơn vị không chuẩn neo qua `anchor_unit_id` + `anchor_factor` tới đơn vị
active cùng nguyên liệu; chuỗi neo kết thúc tại Đơn vị chuẩn, không tự trỏ/vòng
lặp. Ví dụ: `1 Thùng = 24 Chai`, `1 Chai = 250 ml` (`ml` = Đơn vị chuẩn).

RPC `save_ingredient_catalog` suy hệ số từ payload và xác nhận đồ thị ở biên DB.
Mỗi `anchor_unit_id` khác `NULL` phải khớp đúng một dòng active trong `p_units`
của chính nguyên liệu; Đơn vị chuẩn không có cạnh đi ra. Resolver đi theo cạnh
đã khai báo, chặn neo thiếu, tự trỏ, vòng lặp và `dimension` không tương thích.
Đơn vị không chuẩn bắt buộc
có neo; chỉ đơn vị chuẩn hệ thống không có neo mới được suy trực tiếp bằng
`standard_factor` khi cùng `dimension` với Đơn vị chuẩn của nguyên liệu.

`anchor_factor` phải biểu diễn chính xác bằng `numeric(18,9)` và
`to_base_factor` cuối cùng của mỗi dòng phải biểu diễn chính xác bằng
`numeric(18,12)`. RPC từ chối giá trị không hữu hạn, không dương, vượt miền hoặc
cần làm tròn; không âm thầm làm tròn payload gọi trực tiếp trước khi lưu.

`ingredient_units.to_base_factor` là hệ số hiệu lực (ledger/tồn/ngưỡng/giá vốn
chỉ dùng hệ số này). Hai đơn vị chuẩn cùng `dimension` mặc định lấy tỷ lệ từ
`units.standard_factor`. Khi đổi Đơn vị chuẩn, RPC quy đổi hệ số/số lượng/đơn giá
để giữ lượng vật lý và tổng giá trị tồn.

> **Quy tắc:** `stock_levels.current_quantity`, `stock_movements.quantity_change`
> và giá vốn BQ **lưu và hiển thị** theo **Đơn vị chuẩn**. Chứng từ chọn mọi
> `ingredient_units` active: YCM→PO kế thừa đơn vị mua; GRN persist được đơn vị lẻ/neo
> rồi so remaining theo Đơn vị chuẩn; điều chuyển/xuất/tiêu
> hao/hao hụt/kiểm kê/định mức/công thức chọn đơn vị active; lệnh SX dùng
> snapshot từ công thức. Mỗi dòng lưu snapshot đơn vị + factor. Đổi Đơn vị
> chuẩn: RPC quy đổi tồn, ngưỡng, WAC và valuation hiện hành trong cùng
> transaction; snapshot lịch sử không viết lại.

Đổi Đơn vị chuẩn sau khi đã có `stock_movements` không bị khóa. Chỉ từ chối khi
gỡ đơn vị vẫn được BOM/production recipe tham chiếu.

### 2.2 Database — bảng `ingredients`

Master theo tenant. `unit_cost` trên `ingredients` không phải nguồn giá kho;
**giá vốn bình quân** ở `stock_levels.avg_unit_cost` (theo Đơn vị chuẩn).
`units.code` = mã kỹ thuật; `units.name` = nhãn. Cần ít nhất một
`ingredient_units` base. `item_kind`: `raw_material` = hàng mua (PO/GRN);
`finished_good` = chỉ SKU Bếp TT sản xuất có công thức (kind khác: mục tiêu);
`category` / `category_id` là nhóm vận hành — đổi category cập nhật cả hai.

### 2.3 Tồn kho theo chi nhánh — bảng `stock_levels`

- **Khóa:** `(tenant_id, branch_id, location_id, ingredient_id)` — tồn từ stock-bearing locations.
- **`current_quantity`:** theo **Đơn vị chuẩn** (`is_base`).
- **`avg_unit_cost`:** **Giá vốn** — `company_wac` một số / NL mua (mọi
  site). Qty > 0: `book_value = qty × company_wac`. Qty 0/âm: giữ giá dương
  cuối. TP: **Giá vốn mẻ** một số mọi site — không GRN, điều chuyển không
  tạo giá thứ hai. Nhận phiếu không trộn `unit_cost_at_ship` với tồn âm
  tại CN. ADR 0040.

---

## 3. Định mức món bán (Menu recipes)

> `MenuRecipe`/“Định mức món bán” = tiêu hao cho `menu_item` (`recipes`,
> `/inventory/menu-recipes`). Không gọi `Recipe` trần trong source.
> `ProductionRecipe`/“Công thức sản xuất” = BOM thành phẩm
> (`production_recipes`, tab Công thức `/inventory/production`).
Định mức theo `menu_item`; xuất kho khi đơn `completed`. `entry_unit_id` →
Đơn vị chuẩn qua `to_base_factor` / `inv_to_base_for_tenant` (không Yield).
Ba đường số: POS `post_pos_sale_consumption_if_ready` ghi sổ theo WAC công ty
(thang ADR 0026/0040: company WAC → last-known movement → 0);
catalog + Finance **Định mức/phần** cùng `company_wac` (không hai giá Kho gốc / CN).
`Giá vốn món` = POS `sale_consumption` tại CN khi cutover `active`. Không bịa
gram. Gửi hàng Bếp/Kho Tổng → CN = điều chuyển, không phiếu tiêu hao.

### 3b. Công thức sản xuất & mẻ sản xuất (`production_runs`)

Bảng: `production_recipe_specs` (header, `needs_review | active | inactive`);
`production_recipes` (dòng NL + `recipe_spec_id`); `production_runs`
(`draft -> in_progress -> completed` / `cancelled`); `production_run_lines`
(snapshot). RPC từ `production-run-actions.ts`.

1. Bếp TT nhận NL qua GRN vào warehouse; không transfer giả cho production.
2. `create_production_run`: recipe `active` + sản lượng + location cùng Bếp TT → `draft` + snapshot.
3. `start_production_run`: `draft` → `in_progress`.
4. `complete_production_run`: production operator + `inventory:production_confirm`
   trên `branch_id`; lệnh `in_progress`, actual `> 0`, đủ snapshot; location cùng
   Bếp TT; tồn đủ sau quy đổi Đơn vị chuẩn → atomic `production_consumption` /
   `production_output` / `stock_levels` / `completed`.
5. Giao CN qua Điều chuyển riêng — cùng Giá vốn mẻ, không phiếu nhập NCC.

Kế hoạch (“Định làm”) điền sẵn tiêu hao; thực tế (“Thực ra”) chỉ điều khiển giá
vốn đầu ra — không co giãn tiêu hao đã ghi. Hao hụt tăng giá vốn TP, không tự
sinh phế phẩm. Complete kiểm tra tồn rồi ghi consumption/output/stock/status
cùng transaction.

`production_recipe_specs.output_quantity` > 0 theo `output_unit_id`;
`batch_ratio = planned_output / recipe_output_quantity`,
`planned_raw = batch_ratio × recipe_raw_quantity`. Ngoài v1: sub-recipe nhiều
tầng, labor/overhead, production variance engine.

---

## 4. Biến động tồn kho — `stock_movements`

Append-only. `type` như §1b. Liên kết: `order_id`, `grn_id`, `transfer_id`,
`unit_cost` (đơn giá ghi sổ snapshot theo Đơn vị chuẩn; không gọi WAC trên lịch sử).

POS: Sale Runtime ghi `consumption/sale_consumption` tại Kho CN khi đơn `paid` +
`completed` (KDS chờ `first_ready_at`; không KDS chờ dispatch phiếu bếp).
Gọi lại sau khi thêm định mức chỉ trừ NL chưa có dòng `sale_consumption` của đơn
đó. `pos_stock_outcome_posting` = switch Owner-only tắt trừ/rào tồn theo CN. Báo cáo
tiêu hao thủ công không ghi lại NL đã trừ từ POS.

---

## 5. Nhập kho — GRN

### 5.1 Quy trình

1. Thiết lập **NCC**, điều khoản và `supplier_items`.
2. Kho Tổng / Bếp TT tạo **Yêu cầu mua** (mua ngoài). **Yêu cầu hàng** = cấp nội bộ về CN.
3. Một NCC active/NL → **Duyệt & tạo đơn mua** tự gom PO/NCC; nhiều NCC thì Kế
   toán chọn/chia; thiếu mapping thì chặn. Mỗi PO = một YCM + một NCC (nhu cầu,
   NCC, SL, đơn vị — không giá).
4. PO `sent` → đúng một GRN nháp **Chờ nhập hàng** (copy dòng thiếu, khóa nháp
   thứ hai). Làm việc từ danh sách GRN.
5. Kho nhập thực nhận/từ chối (thùng + hộp lẻ khi có neo); confirm so remaining
   theo Đơn vị chuẩn, tăng tồn một lần theo số giữ. Chốt bắt buộc **Đơn giá** > 0
   cho số lượng nhập, gắn đúng đơn vị giá (`unit_cost_unit_id`) — không suy giá
   thùng thành giá hộp. Giá ghi sổ từ phiếu nhập (chưa VAT). Giao dư → tăng SL
   dòng PO cho khớp số giữ (ADR 0042). PO → `partially_received` / `received`;
   còn thiếu → GRN nháp kế tiếp hoặc `close_purchase_order`.
6. Finance ghi **Hóa đơn NCC** riêng (đối chiếu nhiều GRN/PO); thanh toán /
   giảm công nợ phân bổ nhiều-nhiều.

**Nguyên tắc nhận hàng theo PO (ADR 0042):** số giữ lại là sự thật.
`grn_items.po_applied_quantity` hoàn thành PO (đơn vị dòng PO). So sánh
remaining/áp dụng theo Đơn vị chuẩn. Nếu số giữ > remaining, tăng
`purchase_order_items.quantity` rồi áp dụng hết số giữ — một `grn_receipt`,
Đơn giá net trên toàn bộ số vào sổ (ADR 0041), theo đơn vị giá trên dòng
phiếu nhập. PO không là nguồn giá. Hóa đơn NCC không viết lại WAC.

PO mới chỉ dùng `supplier_items.is_active = true` với NCC của PO. GRN suy NCC từ
PO; không đổi NL/quy cách/NCC. Đối soát tiền: giá trị dòng HĐ trước VAT/chiết
khấu, phân bổ theo SL đã tính vào đơn (`po_applied` = số giữ sau chốt). HĐ
không vượt `po_applied`. Không sửa SL lịch sử GRN. `vat_amount` chỉ vào AP;
`vat_breakdown` 0%/5%/8%/10% suy ra header `subtotal` / `vat_amount` /
`total_amount`.

### 5.2 QC vật lý trên GRN
**`branch_id` trên GRN là inventory site nhận hàng.** GRN nhận vào active
warehouse duy nhất của site.

QC mỗi dòng:

- `received_quantity`: số lượng thực giao;
- `rejected_quantity`: số lượng không nhận, từ `0` đến `received_quantity`;
- số lượng đạt được suy ra bằng `received_quantity - rejected_quantity`;
- khi `rejected_quantity > 0`, bắt buộc lý do và ảnh trước confirm.

Toàn bộ từ chối → không tạo giao dịch mua/nhập tồn (hủy chứng từ chưa liên kết
PO). Không lưu `quality_status` (UI suy `accepted` / `partial` / `rejected`).
Không lưu lot/HSD/nhiệt độ, short-delivery action, price variance/baseline/
evidence hoặc quyết định review.

---

## 6. Phương pháp tính giá xuất kho

**Current:** `company_wac` / NL mua trên mọi location (ADR 0040 / 0041).
Phiếu nhập mang **Đơn giá** net; chốt ghi sổ và cập nhật WAC công ty. Hóa
đơn NCC không `invoice_reprice` tồn / định mức / giá vốn món. TP: giá mẻ =
Σ NL vừa trừ — không GRN. SKU chưa có giá ghi sổ thì không nấu/chuyển.
FIFO/FEFO theo lô = mở rộng sau.

---

## 7. Supplier Invoice Handoff — Finance

Hàng mua (VAT đầu vào); thanh toán/kê khai: [einvoice-tax.md](einvoice-tax.md) §4.
Finance handoff — Inventory đóng ngày được khi HĐ chưa về. Xác nhận HĐ chỉ
công nợ + VAT; không đổi số lượng hay giá trị tồn / giá vốn món (ADR 0041).
Payment không đổi giá trị tồn/food cost.

| Bước     | Kiểm tra       | Boundary             |
| -------- | -------------- | -------------------- |
| GRN ↔ HĐ | SL HĐ / SL GRN | HĐ không > `po_applied` (= số giữ sau chốt) |
| GRN ↔ HĐ | Đơn giá        | Lệch cần review rõ   |

`matching_status`: `pending` | `matched` | `discrepancy` | `approved`.

AP tối thiểu: `payment_terms` (`COD`/`NET7`/…), `due_date`, `payment_status`
(`unpaid`|`partial`|`paid`), `paid_amount`/`paid_at`. Tracking + báo cáo, không
payment engine. `due_date` = `invoice_date + payment_terms`. `AP aging` =
report layer. Ngoài v1: payment proposal, debit/credit note engine, approval
nhiều cấp, AP liên pháp nhân.

---

## 8. Kiểm kê kho (Stocktake)

Routes: `/inventory/stocktake`, `/inventory/stocktake/[id]`. Pad nhân viên `/me` là **Đếm tồn** (phiếu được giao), không phải phiên Kiểm kê thứ hai.

1. **Tạo:** kho warehouse của site. UI không chọn daily/weekly/monthly/quarterly/spot; phiên mới đếm số đang có, không hiện sổ (`spot`).
2. **Đếm** (`get_stocktake_lines_blind`): màn đếm là viewport đầu. Số sổ ẩn đến khi đếm đủ dòng.
3. **Đối soát:** lý do trên dòng lệch, rồi `complete_stocktake` ghi `count_adjustment`.

`stocktake_sessions`: `in_progress`|`completed`|`cancelled`, `current_round` 1..4.
`stocktake_lines.variance = counted_quantity - system_quantity`. ACL: BM trong
phạm vi; owner mọi CN.

---

## 9. Cảnh báo tồn kho

So sánh `current_quantity` với `ingredients.min_stock_level` (CN active). UI chỉ
**Tồn tối thiểu** (`reorder_point`/`max_stock_level` = cột cũ, ghi `NULL`).
Strip `/inventory/stock`; `suggested_order_qty = max(0, min_stock_level - current_quantity)`.
Không sổ lô/FIFO/FEFO/HSD/route `/inventory/expiry`. GRN: thực nhận/từ chối và
**Đơn giá** ghi sổ (chưa VAT).

---

## 11. Quyền truy cập (ACL) — hướng dẫn

Module/route: `packages/shared/src/auth/module-acl.ts`; coarse roles:
`inventory-roles.ts`. Mutation: permission keys + RLS/RPC. UI visibility is not
authorization. **D093** model: GRN chỉ Kho Tổng / Bếp TT; CN dùng Yêu cầu hàng →
fulfill → DC; CN không production.

Shell primary: BM → `/br/{branchId}`; Owner + Kế toán + central → L0
(`/inventory`, Accountant `/finance`). Central residual `/br/{pinnedSiteId}`
chỉ deep-link/pad; notification `/br/.../stock/*` resolve về L0 khi mở feed.

Tóm tắt vai (D093):

- `owner`: tenant-wide; catalog + `default_fulfill_site_kind`; WAC; oversight;
  checklist sẵn sàng: Nguồn hàng; NCC chỉ nguyên liệu mua (không thành phẩm).
- `accountant`: YCM đọc → PO/giá; GRN đọc (trung tâm); HĐ/AP. Không tồn/SX/
  định mức/yêu cầu CN/QC confirm.
- `central_supply_ops` / `central_kitchen_lead`: primary L0 `/inventory`; GRN
  tại site ghim; inbox yêu cầu theo nguồn; fulfill→DC (`transfer_create`);
  Bếp TT thêm production / ProductionRecipe. Soft-hide PO lifecycle; không tạo
  PO/giá; catalog chỉ đọc (Owner CRUD).
- `branch_manager`: hub `/br/{id}/stock` (tồn / YCH / kiểm kê / hao); nhận DC
  inbound; **không** GRN, PO, production, giá mua, `procurement:read` /
  `supplier_manage` / `supplier_return:*` (R08/R09); không tạo/ship DC.
- `cashier` / `chef` / `branch_staff`: chỉ đếm khi được gán.

Permission keys (D093):

| Key | Ai |
| --- | --- |
| `inventory:request_create/submit/cancel` | owner, branch_manager |
| `inventory:request_fulfill` | owner, central_supply_ops, central_kitchen_lead |
| `inventory:transfer_create` | owner, central_supply_ops, central_kitchen_lead |
| `procurement:grn_*` | central sites (+ owner); không BM |
| `procurement:read` / `supplier_manage` | owner, accountant (read), central ops; không BM |
| `supplier_return:*` | không BM; daily UI retired |
| `inventory:production_*` | central_kitchen (+ owner); không BM |

---

## Tài liệu liên quan

- [einvoice-tax.md](einvoice-tax.md) — VAT đầu vào, HĐ NCC
- [inventory-sop.md](inventory-sop.md) — SOP vận hành
- [screen-context-map.md](screen-context-map.md) — audience/device cho màn kho
