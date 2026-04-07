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
- **Kho từng chi nhánh vận hành:** **không** tạo PO/GRN với NCC. Mọi nhập tại chi nhánh là **nhận nội bộ từ Trụ sở** qua **phiếu luân chuyển** (có trạng thái xuất / vận chuyển / nhận).

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

### 1b. Luồng Trụ sở → chi nhánh (state machine)

| Bước                     | Trạng thái (DB)  | Việc làm                                                                            |
| ------------------------ | ---------------- | ----------------------------------------------------------------------------------- |
| Tạo phiếu                | `draft`          | Liệt kê nguyên liệu, SL, chi nhánh đích                                             |
| Xác nhận xuất tại Trụ sở | `confirmed_ship` | Trừ tồn HQ (`transfer_out`), ghi cost theo WAC tại HQ                               |
| Đang vận chuyển          | `in_transit`     | Theo dõi (biển số / ghi chú — tùy pha UI)                                           |
| Xác nhận nhập tại CN     | `received`       | Cộng tồn CN (`transfer_in`), ghi nhận SL thực nhận (lệch → điều chỉnh dòng / lý do) |

Trạng thái `cancelled` khi hủy phiếu (theo quyền); không ghi nhận tồn nếu chưa từng `confirmed_ship` (hoặc hoàn tác theo policy nội bộ — ưu tiên tránh xóa bản ghi, dùng workflow hủy).

### Các loại phiếu kho

| Loại phiếu                  | Mô tả                                | `stock_movements.type` |
| --------------------------- | ------------------------------------ | ---------------------- |
| **Nhập từ NCC (GRN)**       | Chỉ tại Trụ sở                       | `grn_receipt`          |
| **Xuất đi chi nhánh**       | Trừ HQ khi xác nhận xuất luân chuyển | `transfer_out`         |
| **Nhận từ Trụ sở**          | Cộng CN khi hoàn tất nhận            | `transfer_in`          |
| **Xuất theo bán**           | Theo recipe khi order `completed`    | `consumption`          |
| **Điều chỉnh / hỏng / mất** | Thủ công                             | `adjustment`           |
| **Kiểm kê**                 | Điều chỉnh sau đếm                   | `count_adjustment`     |

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

## 8. Kiểm kê kho

Quy trình: in phiếu → đếm thực tế → nhập chênh lệch → `count_adjustment` → cập nhật `last_counted_at`. Có thể làm riêng cho **Trụ sở** và **từng chi nhánh**.

---

## 9. Cảnh báo tồn kho

So sánh `stock_levels.current_quantity` với `ingredients.min_stock_level` / `max_stock_level` (theo từng chi nhánh). Cột trong báo cáo dùng `current_quantity` (không dùng tên `quantity` của bản draft SQL cũ).

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
