# Kho Hàng — Inventory Management

> Áp dụng: Cơm Tấm Má Tư CTCP — quản lý kho nguyên liệu F&B
> Phạm vi: M5 Stock (stock cơ bản + GRN + 3-way matching)

---

## 1. Mô hình kho hàng F&B

Cơm Tấm Má Tư quản lý **kho nguyên liệu theo chi nhánh**. Mỗi chi nhánh có kho riêng. Không có kho trung tâm trong v1.0.

```
Nhà cung cấp → [PO] → [GRN] → Kho chi nhánh → [Xuất theo công thức] → Thành phẩm → Khách
                                      ↑
                              Kiểm kê định kỳ
                              Cảnh báo tồn min/max
```

### Các loại phiếu kho

| Loại phiếu                  | Mô tả                                   | DB table                                      |
| --------------------------- | --------------------------------------- | --------------------------------------------- |
| **Phiếu nhập kho (GRN)**    | Hàng nhận từ nhà cung cấp               | `goods_received_notes`                        |
| **Phiếu xuất kho tự động**  | Xuất theo công thức khi order completed | `stock_movements` (type = `consumption`)      |
| **Phiếu xuất kho thủ công** | Hỏng, mất, thử nghiệm                   | `stock_movements` (type = `adjustment`)       |
| **Phiếu kiểm kê**           | Đếm lại thực tế, điều chỉnh chênh lệch  | `stock_movements` (type = `count_adjustment`) |
| **Phiếu chuyển kho**        | Giữa chi nhánh (post-v1.0)              | —                                             |

---

## 2. Nguyên liệu (Ingredients)

### 2.1 Đơn vị tính

| Nhóm       | Đơn vị                     | Ghi chú                         |
| ---------- | -------------------------- | ------------------------------- |
| Khối lượng | `kg`, `g`                  | Thịt, rau, gạo                  |
| Thể tích   | `lít`, `ml`                | Nước mắm, dầu ăn, nước          |
| Số lượng   | `cái`, `hộp`, `gói`, `lon` | Trứng, đồ đóng gói              |
| Phần       | `phần`                     | Nếu không cần theo dõi chi tiết |

> **Quy tắc**: Lưu tồn kho theo đơn vị cơ sở (g, ml, cái). Khi nhập kho có thể nhập theo kg → hệ thống tự convert.

### 2.2 Database — bảng `ingredients`

```sql
CREATE TABLE ingredients (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id           BIGINT NOT NULL REFERENCES tenants(id),

  name                TEXT NOT NULL,
  sku                 TEXT,                        -- Mã nội bộ
  unit                TEXT NOT NULL,               -- Đơn vị cơ sở: 'g' | 'ml' | 'cái' | ...
  unit_cost           NUMERIC(15,2),               -- Giá mua gần nhất (per unit)
  category            TEXT,                        -- 'meat' | 'vegetable' | 'seasoning' | 'beverage' | ...

  -- Ngưỡng cảnh báo
  min_stock_level     NUMERIC(15,3) NOT NULL DEFAULT 0,  -- Cảnh báo thiếu
  max_stock_level     NUMERIC(15,3),                     -- Cảnh báo thừa (tùy chọn)
  reorder_point       NUMERIC(15,3),                     -- Điểm đặt hàng lại

  -- Bảo quản
  storage_type        TEXT DEFAULT 'ambient',      -- 'ambient' | 'refrigerated' | 'frozen'
  shelf_life_days     INT,                         -- Hạn sử dụng (ngày)

  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(sku, tenant_id),
  UNIQUE(name, tenant_id)
);
```

### 2.3 Tồn kho theo chi nhánh — bảng `stock_levels`

```sql
CREATE TABLE stock_levels (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id           BIGINT NOT NULL REFERENCES tenants(id),
  branch_id           BIGINT NOT NULL REFERENCES branches(id),
  ingredient_id       BIGINT NOT NULL REFERENCES ingredients(id),

  quantity            NUMERIC(15,3) NOT NULL DEFAULT 0,    -- Tồn kho hiện tại (đơn vị cơ sở)
  last_counted_at     TIMESTAMPTZ,                         -- Lần kiểm kê gần nhất
  last_counted_qty    NUMERIC(15,3),

  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(ingredient_id, branch_id, tenant_id)
);
```

---

## 3. Công thức (Recipes)

Định mức nguyên liệu cho mỗi món ăn. Dùng để **tự động xuất kho** khi order được hoàn thành.

```sql
CREATE TABLE recipes (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id           BIGINT NOT NULL REFERENCES tenants(id),
  menu_item_id        BIGINT NOT NULL REFERENCES menu_items(id),
  ingredient_id       BIGINT NOT NULL REFERENCES ingredients(id),

  quantity            NUMERIC(15,3) NOT NULL,    -- Lượng nguyên liệu cần (đơn vị cơ sở)
  unit                TEXT NOT NULL,             -- Phải khớp với ingredients.unit
  note                TEXT,                      -- Ví dụ: "thịt đã sơ chế"

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(menu_item_id, ingredient_id, tenant_id)
);
```

### Ví dụ thực tế

| Món          | Nguyên liệu | Định mức |
| ------------ | ----------- | -------- |
| Cơm tấm sườn | Gạo         | 200g     |
| Cơm tấm sườn | Sườn heo    | 150g     |
| Cơm tấm sườn | Nước mắm    | 30ml     |
| Cơm tấm sườn | Hành lá     | 5g       |

---

## 4. Biến động tồn kho — bảng `stock_movements`

```sql
CREATE TABLE stock_movements (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id           BIGINT NOT NULL REFERENCES tenants(id),
  branch_id           BIGINT NOT NULL REFERENCES branches(id),
  ingredient_id       BIGINT NOT NULL REFERENCES ingredients(id),

  type                TEXT NOT NULL,
  -- 'grn_receipt'      — Nhập từ GRN
  -- 'consumption'      — Xuất tự động theo order
  -- 'adjustment'       — Điều chỉnh thủ công (hỏng, mất, thử)
  -- 'count_adjustment' — Điều chỉnh từ kiểm kê
  -- 'transfer_in'      — Nhận từ chi nhánh khác (post-v1.0)
  -- 'transfer_out'     — Chuyển đến chi nhánh khác (post-v1.0)

  quantity_change     NUMERIC(15,3) NOT NULL,  -- Dương = nhập vào, Âm = xuất ra
  quantity_before     NUMERIC(15,3) NOT NULL,  -- Tồn kho trước khi biến động
  quantity_after      NUMERIC(15,3) NOT NULL,  -- Tồn kho sau biến động

  -- Liên kết nguồn gốc
  order_id            BIGINT REFERENCES orders(id),          -- Nếu type = 'consumption'
  grn_id              BIGINT REFERENCES goods_received_notes(id),  -- Nếu type = 'grn_receipt'

  unit_cost           NUMERIC(15,2),           -- Giá tại thời điểm biến động
  note                TEXT,
  created_by          UUID REFERENCES profiles(id),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Quy tắc xuất kho tự động

Khi 1 order chuyển sang `completed`:

1. Lấy danh sách `order_items` → tra `recipes` → tính tổng nguyên liệu cần
2. Cập nhật `stock_levels.quantity` (trừ đi)
3. Ghi `stock_movements` (type = `consumption`)
4. Nếu tồn kho sau < `min_stock_level` → tạo cảnh báo

> ⚠️ **Thực hiện bằng Postgres RPC** (không dùng nhiều roundtrip). Hàm: `rpc_consume_stock_for_order(order_id)`.

---

## 5. Nhập kho — Goods Received Notes (GRN)

### 5.1 Quy trình nhập kho

```
Tạo PO (đặt hàng) → Nhà CC giao hàng → Kiểm tra thực tế
    → Lập GRN (ghi số lượng thực nhận) → Nhập vào stock_levels
    → Nhận HĐGT từ NCC → 3-way matching (PO ↔ GRN ↔ HĐ)
```

**Nguyên tắc quan trọng**: Food cost tính từ **GRN** (hàng thực nhận), KHÔNG từ PO (hàng đặt). PO có thể bị giao thiếu/thừa/sai.

### 5.2 Database — bảng `goods_received_notes`

```sql
CREATE TABLE goods_received_notes (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id           BIGINT NOT NULL REFERENCES tenants(id),
  branch_id           BIGINT NOT NULL REFERENCES branches(id),
  po_id               BIGINT REFERENCES purchase_orders(id),
  supplier_id         BIGINT NOT NULL REFERENCES suppliers(id),

  grn_number          TEXT NOT NULL,
  received_date       TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_by         UUID REFERENCES profiles(id),

  status              TEXT NOT NULL DEFAULT 'draft',
  -- 'draft'     — đang nhập liệu
  -- 'confirmed' — đã xác nhận, đã cập nhật stock
  -- 'cancelled' — hủy (không cập nhật stock)

  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(grn_number, tenant_id)
);

CREATE TABLE grn_items (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id           BIGINT NOT NULL REFERENCES tenants(id),
  grn_id              BIGINT NOT NULL REFERENCES goods_received_notes(id),
  ingredient_id       BIGINT NOT NULL REFERENCES ingredients(id),

  -- Số lượng đặt vs thực nhận
  po_quantity         NUMERIC(15,3),            -- Số lượng trên PO (nếu có)
  received_quantity   NUMERIC(15,3) NOT NULL,   -- Thực tế nhận
  unit                TEXT NOT NULL,

  -- Giá
  unit_cost           NUMERIC(15,2) NOT NULL,
  total_cost          NUMERIC(15,2) NOT NULL,   -- received_quantity * unit_cost

  -- Chất lượng
  quality_status      TEXT DEFAULT 'accepted',  -- 'accepted' | 'rejected' | 'partial'
  rejected_quantity   NUMERIC(15,3) DEFAULT 0,
  rejection_reason    TEXT,

  -- Hạn sử dụng (FEFO)
  expiry_date         DATE,
  batch_number        TEXT,

  UNIQUE(grn_id, ingredient_id, tenant_id)
);
```

---

## 6. Phương pháp tính giá xuất kho

Hệ thống sử dụng **FIFO (First In First Out)** — hàng nhập trước xuất trước. Điều này phù hợp với thực phẩm (đặc biệt kết hợp FEFO — First Expired First Out).

Trong v1.0, đơn giản hóa: dùng **giá bình quân gia quyền** (weighted average) để tránh phức tạp FIFO nhiều batch:

```
Giá bình quân = (Tồn kho hiện tại × Giá bình quân cũ + Nhập mới × Giá nhập mới)
                ─────────────────────────────────────────────────────────────────
                                    Tổng tồn kho mới
```

Lưu `unit_cost` hiện tại trong `stock_levels` và cập nhật mỗi khi nhập GRN.

---

## 7. 3-Way Matching (PO ↔ GRN ↔ Supplier Invoice)

Điều kiện để hóa đơn đầu vào được **duyệt thanh toán** và **kê khai VAT khấu trừ**:

| Bước     | Kiểm tra                     | Kết quả lệch cho phép                |
| -------- | ---------------------------- | ------------------------------------ |
| PO ↔ GRN | Số lượng nhận / số lượng đặt | ±5% (do hao hụt vận chuyển)          |
| GRN ↔ HĐ | Số lượng HĐ / số lượng GRN   | ≤ GRN (không được HĐ nhiều hơn nhận) |
| PO ↔ HĐ  | Đơn giá HĐ / đơn giá PO      | ±2% (biến động giá thị trường)       |

Khi matching_status = `matched` → kế toán mới được duyệt thanh toán supplier.
Khi matching_status = `discrepancy` → cần notes giải thích + duyệt thủ công.

---

## 8. Kiểm kê kho

### Quy trình kiểm kê định kỳ

```
1. In phiếu kiểm kê (danh sách nguyên liệu + tồn kho hệ thống)
2. Đếm thực tế → nhập số liệu thực đếm
3. Hệ thống tính chênh lệch: Thực tế − Hệ thống
4. Ghi nhận nguyên nhân chênh lệch (hao hụt, mất, sai nhập liệu)
5. Xác nhận → hệ thống tạo stock_movements (type = count_adjustment)
6. Cập nhật stock_levels về số thực đếm
```

**Tần suất khuyến nghị**:

- Nguyên liệu giá cao (thịt, hải sản): hàng tuần
- Gia vị, nguyên liệu khô: hàng tháng
- Đồ uống đóng chai: hàng tháng

---

## 9. Cảnh báo tồn kho

| Loại cảnh báo              | Điều kiện                        | Hiển thị cho                               |
| -------------------------- | -------------------------------- | ------------------------------------------ |
| **Sắp hết**                | `quantity ≤ min_stock_level`     | Branch manager, area manager               |
| **Hết hàng**               | `quantity = 0`                   | Branch manager + tự động disable menu_item |
| **Sắp hết hạn**            | `expiry_date ≤ today + 3 ngày`   | Branch manager (post-v1.0)                 |
| **Tồn kho cao bất thường** | `quantity > max_stock_level × 2` | Branch manager                             |

**Tự động disable menu_item**: Khi bất kỳ nguyên liệu trong recipe của 1 món hết hàng → món đó không thể đặt trên POS/KDS.

---

## 10. Báo cáo kho

### Báo cáo food cost

```sql
-- Food cost thực tế theo kỳ
SELECT
  i.name,
  i.unit,
  SUM(ABS(sm.quantity_change)) AS total_consumed,
  AVG(sm.unit_cost) AS avg_cost,
  SUM(ABS(sm.quantity_change) * sm.unit_cost) AS total_cost
FROM stock_movements sm
JOIN ingredients i ON i.id = sm.ingredient_id
WHERE sm.tenant_id = $1
  AND sm.branch_id = $2
  AND sm.type = 'consumption'
  AND sm.created_at BETWEEN $3 AND $4
GROUP BY i.id, i.name, i.unit
ORDER BY total_cost DESC;
```

### Báo cáo giá trị tồn kho

```sql
-- Giá trị tồn kho hiện tại
SELECT
  i.name,
  sl.quantity,
  i.unit,
  i.unit_cost,
  sl.quantity * i.unit_cost AS inventory_value
FROM stock_levels sl
JOIN ingredients i ON i.id = sl.ingredient_id
WHERE sl.tenant_id = $1
  AND sl.branch_id = $2
ORDER BY inventory_value DESC;
```

---

## 11. Quyền truy cập (ACL)

| Hành động                   | Roles được phép                                            |
| --------------------------- | ---------------------------------------------------------- |
| Xem tồn kho                 | `chef`, `branch_manager` trở lên                           |
| Nhập GRN                    | `branch_manager` trở lên                                   |
| Điều chỉnh thủ công         | `branch_manager` trở lên                                   |
| Kiểm kê kho                 | `branch_manager` trở lên                                   |
| Xem báo cáo food cost       | `branch_manager`, `area_manager`, `super_manager`, `owner` |
| Quản lý ingredients/recipes | `super_manager`, `owner`                                   |

---

## Tài liệu liên quan

- `docs/ref/einvoice-tax.md` — 3-way matching và VAT đầu vào
- `docs/plan/sprint-2b.md` — Sprint stock cơ bản
- `docs/plan/sprint-3.md` — Sprint GRN + Procurement
