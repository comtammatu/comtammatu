# Kho Hàng — Inventory Management

> Áp dụng: Cơm Tấm Má Tư CTCP — quản lý kho nguyên liệu F&B  
> Phạm vi: M5 Stock — **Kho Trụ sở (nhập NCC) + luân chuyển chi nhánh + GRN + 3-way matching + recipe/xuất bán (theo lộ trình triển khai)**

---

## Trạng thái triển khai (doc ↔ codebase)

| Nội dung                        | Tài liệu (mục tiêu)                                                        | Triển khai hiện tại                                                                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nguyên liệu `ingredients`       | §2                                                                         | Có — migration `20260406310000_stock.sql`                                                                                                              |
| Tồn kho `stock_levels`          | §2.3 — cột `current_quantity` (DB), không dùng tên `quantity` trong schema | Có — `current_quantity`; thêm `avg_unit_cost` (WAC) theo migration M5 mở rộng                                                                          |
| Biến động `stock_movements`     | §4 — đầy đủ FK, `unit_cost`                                                | MVP: `adjustment` / `count_adjustment` / `consumption`; mở rộng: `grn_receipt`, `transfer_out`, `transfer_in` + FK `grn_id`, `transfer_id`, `order_id` |
| Mô hình kho                     | §1 — **một Trụ sở nhận NCC**, chi nhánh chỉ nhận từ Trụ sở                 | Chi nhánh = `branches.is_headquarters = false`; Trụ sở = `true` (seed `Trụ sở chính`)                                                                  |
| PO / GRN / NCC                  | §5                                                                         | Bảng + RPC `confirm_grn` (theo migration M5 mở rộng)                                                                                                   |
| Luân chuyển Trụ sở → CN         | §1b (dưới đây)                                                             | Bảng `stock_transfers` + RPC workflow                                                                                                                  |
| HĐ NCC + 3-way matching         | §7                                                                         | Bảng `supplier_invoices` + logic khớp                                                                                                                  |
| `recipes` + xuất kho theo order | §3, §4                                                                     | Bảng `recipes` + RPC gọi khi order `completed` (theo migration)                                                                                        |

---

## 1. Mô hình kho hàng F&B — Cơm Tấm Má Tư

**Nguyên tắc vận hành:**

- **Kho Trụ sở (chi nhánh có `is_headquarters = true`):** là **điểm nhập duy nhất** từ nhà cung cấp ngoài. Mọi **PO**, **GRN**, cập nhật **giá vốn (WAC)** và **3-way matching** với **hóa đơn đầu vào** đều gắn với kho này.
- **Kho từng chi nhánh vận hành:** **không** tạo PO/GRN với NCC. Nhập/xuất giữa các kho nội bộ dùng **phiếu luân chuyển** (xuất tại kho gửi → vận chuyển → nhập tại kho nhận). Cho phép: **Trụ sở → chi nhánh**, **chi nhánh → Trụ sở**, **chi nhánh → chi nhánh** (không cho hai đầu cùng là Trụ sở).

```
NCC → [PO] → [GRN] → Tồn kho Trụ sở
                          │
                          ▼
              [Phiếu luân chuyển: xuất → VC → nhận]
                          │
                          ▼
                   Tồn kho chi nhánh → [Xuất theo công thức khi order completed] → …
                          ↑
                   Kiểm kê định kỳ, cảnh báo min/max
```

### 1b. Luân chuyển nội bộ (cùng state machine)

| Bước                           | Trạng thái (DB)     | Việc làm                                                                                       |
| ------------------------------ | ------------------- | ---------------------------------------------------------------------------------------------- |
| Tạo phiếu                      | `draft`             | Chọn kho **gửi** / **nhận** (TS↔CN hoặc CN↔CN), liệt kê nguyên liệu và SL                      |
| Xác nhận xuất tại kho gửi      | `confirmed_ship`    | Trừ tồn tại `from_branch_id` (`transfer_out`), snapshot WAC vào dòng phiếu                     |
| Đang vận chuyển                | `in_transit`        | Theo dõi (biển số / ghi chú — tùy pha UI)                                                      |
| Bắt đầu kiểm nhận tại kho nhận | `confirmed_receive` | Kho nhận mở kiểm đếm (`receive_started_at`); chưa cộng tồn                                     |
| Xác nhận nhập tại kho nhận     | `received`          | Cộng tồn tại `to_branch_id` (`transfer_in`), ghi nhận SL thực nhận (lệch → điều chỉnh / lý do) |

Trạng thái `cancelled` khi hủy phiếu (theo quyền); không ghi nhận tồn nếu chưa từng `confirmed_ship` (hoặc hoàn tác theo policy nội bộ — ưu tiên tránh xóa bản ghi, dùng workflow hủy).

### Các loại phiếu kho

| Loại phiếu                  | Mô tả                                            | `stock_movements.type` |
| --------------------------- | ------------------------------------------------ | ---------------------- |
| **Nhập từ NCC (GRN)**       | Chỉ tại Trụ sở                                   | `grn_receipt`          |
| **Xuất luân chuyển**        | Trừ kho gửi (`from_branch_id`) khi xác nhận xuất | `transfer_out`         |
| **Nhận luân chuyển**        | Cộng kho nhận (`to_branch_id`) khi hoàn tất nhận | `transfer_in`          |
| **Xuất theo bán**           | Theo recipe khi order `completed`                | `consumption`          |
| **Điều chỉnh / hỏng / mất** | Thủ công                                         | `adjustment`           |
| **Kiểm kê**                 | Điều chỉnh sau đếm                               | `count_adjustment`     |

---

## 2. Nguyên liệu (Ingredients)

### 2.1 Đơn vị tính

| Nhóm       | Đơn vị                     | Ghi chú                |
| ---------- | -------------------------- | ---------------------- |
| Khối lượng | `kg`, `g`                  | Thịt, rau, gạo         |
| Thể tích   | `lít`, `ml`                | Nước mắm, dầu, nước    |
| Số lượng   | `cái`, `hộp`, `gói`, `lon` | Trứng, đồ đóng gói     |
| Phần       | `phần`                     | Khi không cần chi tiết |

> **Quy tắc:** Lưu tồn theo **đơn vị cơ sở** (g, ml, cái). Nhập theo kg → quy đổi về đơn vị cơ sở trước khi ghi GRN.

### 2.2 Database — bảng `ingredients`

Master data **theo tenant** (đã có trong DB). `unit_cost` trên `ingredients` có thể phản ánh **giá mua gần nhất** (tham chiếu); **giá tồn kho** theo từng kho nằm ở `stock_levels.avg_unit_cost` (WAC).

### 2.3 Tồn kho theo chi nhánh — bảng `stock_levels`

- **Khóa:** `(tenant_id, branch_id, ingredient_id)` — mỗi chi nhánh (gồm Trụ sở) một dòng tồn.
- **`current_quantity`:** tồn thực (đơn vị cơ sở) — tên cột trong DB.
- **`avg_unit_cost`:** giá bình quân gia quyền (WAC) tại kho đó, cập nhật khi **GRN** (HQ) và có thể dùng làm **đơn giá xuất nội bộ** sang chi nhánh (policy mặc định: WAC tại thời điểm xuất).

---

## 3. Công thức (Recipes)

Định mức nguyên liệu theo `menu_item`. Dùng để **xuất kho** (`consumption`) khi đơn hàng chuyển sang `completed` (thực hiện bằng RPC, không lặp HTTP).

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

---

## 4. Biến động tồn kho — `stock_movements`

- **Append-only** (không UPDATE/DELETE dòng movement).
- Các loại `type` mở rộng như bảng ở §1b.
- Liên kết tùy loại: `order_id`, `grn_id`, `transfer_id`, `unit_cost` (snapshot tại thời điểm ghi).

### Quy tắc xuất kho tự động (khi có `recipes`)

Khi order → `completed`:

1. `order_items` × `recipes` × số lượng món → tổng nguyên liệu theo `branch_id` của order.
2. Trừ `stock_levels.current_quantity` tại chi nhánh đó; ghi `consumption` (âm `quantity_change`).
3. Cảnh báo nếu dưới `min_stock_level` (logic app / báo cáo).

> Thực hiện trong **Postgres RPC** (ví dụ gọi từ `transition_order_status` khi `served` → `completed`).

---

## 5. Nhập kho — GRN (chỉ Trụ sở)

### 5.1 Quy trình (SOP Trụ sở)

1. Thiết lập **NCC**, điều khoản thanh toán.
2. Tạo **PO** gắn **branch_id = Trụ sở** (kiểm tra `is_headquarters`).
3. NCC giao hàng → kiểm đếm, QC.
4. Lập **GRN** (số thực nhận, đơn giá, lô/HSD nếu có) → **xác nhận GRN** (RPC) → cập nhật tồn HQ + **WAC**.
5. Nhận **HĐ từ NCC** → nhập **supplier_invoice** → **3-way matching** với PO & GRN (§7).

**Nguyên tắc:** Food cost nhập mua theo **GRN** (thực nhận), không theo số đặt PO.

### 5.2 Schema tham chiếu — `goods_received_notes` / `grn_items`

Như đã mô tả trong các phiên bản trước của tài liệu; **`branch_id` trên GRN luôn là chi nhánh Trụ sở**. Không tạo GRN cho chi nhánh vận hành từ NCC.

---

## 6. Phương pháp tính giá xuất kho

- **v1 (đang hướng tới):** **Giá bình quân gia quyền (WAC)** trên từng `stock_levels`, cập nhật khi **xác nhận GRN** tại Trụ sở.
- **FIFO / FEFO theo lô:** hướng mở rộng sau (cần bảng lô/batch); phần mở đầu §6 cũ nhắc FIFO như **nguyên tắc thực phẩm**, không mâu thuẫn nếu ghi rõ **hệ thống v1 dùng WAC**.

Công thức WAC sau mỗi dòng nhập (đơn giản hóa):

```
Q_new = Q_old + Q_recv
WAC_new = (Q_old × WAC_old + Q_recv × đơn_giá_nhập) / Q_new   (khi Q_new > 0)
```

---

## 7. 3-Way Matching (PO ↔ GRN ↔ Supplier Invoice)

Áp dụng cho **hàng mua về Trụ sở** (đầu vào VAT). Điều kiện thanh toán / kê khai: tham chiếu [einvoice-tax.md](einvoice-tax.md) §4.

| Bước     | Kiểm tra         | Dung sai gợi ý       |
| -------- | ---------------- | -------------------- |
| PO ↔ GRN | SL nhận / SL đặt | ±5%                  |
| GRN ↔ HĐ | SL HĐ / SL GRN   | HĐ không > thực nhận |
| PO ↔ HĐ  | Đơn giá HĐ / PO  | ±2%                  |

`matching_status`: `pending` | `matched` | `discrepancy` | `approved` (ngoại lệ có duyệt).

**Phiếu luân chuyển nội bộ** không thuộc 3-way matching với NCC (trừ khi sau này có hóa đơn nội bộ — ngoài phạm vi v1).

---

## 8. Kiểm kê kho (Stocktake)

> Route: `/admin/inventory/stocktake` (list), `/admin/inventory/stocktake/[id]` (chi tiết đếm/kết quả)

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

> Hiển thị: card trên dashboard Tổng Quan (`/admin/inventory`)

So sánh `stock_levels.current_quantity` với `ingredients.reorder_point` (theo từng chi nhánh, chỉ `is_active = true`).

- Card vàng khi có nguyên liệu dưới mức đặt hàng, xanh khi đủ tồn.
- Hiển thị top 5 nguyên liệu cần đặt + current/reorder ratio + đơn vị.
- Tính `suggested_order_qty = max_stock_level - current_quantity`.
- Branch scoping: `branch_manager` chỉ thấy chi nhánh mình.

### 9.2 Cảnh báo hạn sử dụng (Expiry Alerts)

> Route: `/admin/inventory/expiry` (danh sách đầy đủ) + card trên dashboard Tổng Quan

Truy vấn `grn_items.expiry_date` (join `goods_received_notes` status=`confirmed`) trong cửa sổ 7 ngày.

- **Urgency**: `expired` (≤0 ngày), `critical` (≤3 ngày), `warning` (≤7 ngày).
- **Dashboard card**: đỏ nếu có hàng hết hạn, vàng nếu sắp hết, xanh nếu an toàn. Link đến `/admin/inventory/expiry`.
- **Trang chi tiết**: bảng đầy đủ với tabs (Tất cả / Đã hết hạn / Sắp hết hạn) + tìm kiếm + lọc chi nhánh.
- **Xóa sổ (Write-off)**: nút "Xóa sổ" trên mỗi dòng → nhập số lượng → tạo `stock_movements` (type=`adjustment`, `quantityChange` âm, reason "Hết hạn sử dụng").

> **Lưu ý:** Không block xuất kho hàng hết hạn (yêu cầu batch tracking — ngoài scope Phase 0). Chỉ cảnh báo + hỗ trợ xóa sổ thủ công.

### 9.3 GRN — Nhiệt độ nhận hàng

Cột `grn_items.receiving_temperature` (`NUMERIC(5,1)`, nullable) — chỉ hiển thị cho nguyên liệu lạnh/đông. UI ẩn cột nhiệt độ nếu không có dòng nào có giá trị.

---

## 10. Báo cáo (gợi ý truy vấn)

- **Food cost (chi nhánh):** lọc `stock_movements` `type = 'consumption'` theo `branch_id` và kỳ thời gian; join `ingredients`.
- **Giá trị tồn:** `sum(current_quantity * avg_unit_cost)` (hoặc `ingredients.unit_cost` nếu chưa có WAC tại kho).

---

## 11. Quyền truy cập (ACL) — hướng dẫn

| Hành động                                 | Gợi ý role                                                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Xem tồn                                   | `chef`, `branch_manager` trở lên (theo branch)                                                              |
| PO / GRN / NCC / luân chuyển xuất từ HQ   | `owner`, `super_manager`, `area_manager`, hoặc `branch_manager` **tại Trụ sở** (tuỳ policy JWT `branch_id`) |
| Xác nhận **nhận hàng** luân chuyển tại CN | `branch_manager` chi nhánh đích                                                                             |
| HĐ NCC + matching                         | `owner`, `super_manager`, kế toán (khi có module)                                                           |
| Sửa `ingredients` / `recipes`             | `super_manager`, `owner`                                                                                    |

Chi tiết enforcement: RLS + `packages/shared/src/auth/module-acl.ts`.

---

## Tài liệu liên quan

- [einvoice-tax.md](einvoice-tax.md) — VAT đầu vào, HĐ NCC
- [../plan/sprint-3.md](../plan/sprint-3.md) — gợi ý route admin
- [../plan/backlog.md](../plan/backlog.md) — waste, kiểm kê nâng cao (nếu tách bảng)
