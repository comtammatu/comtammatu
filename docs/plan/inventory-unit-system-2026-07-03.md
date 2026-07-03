# Spec: Hệ đơn vị nguyên liệu 2 tầng (chuẩn + đóng gói), biết "họ" (2026-07-03)

> Reconciled-through b1b90967
> Trạng thái: **owner-approved design** (brainstorm 2026-07-03). Supersede phần đơn-vị của draft `docs/plan/inventory-multiunit-catalog-2026-06-29.md` (danh mục category giữ nguyên từ draft đó). Thi công owner-gated (migrations). Ngôn ngữ code/identifier/SQL: tiếng Anh.

## 1. Vấn đề (owner nêu)

Hệ hiện tại cho chọn đơn vị dạng **checklist per-nguyên-liệu** (`ingredient_units.allow_purchase/allow_issue/allow_production`, mặc định bật hết) + **mọi quy đổi nhập tay** qua `to_base_factor` phẳng. Bảng `units` global chỉ có `code`+`name` — **không biết** g và kg cùng họ khối lượng. Hệ quả:

- Cho phép nhập SAI: "1 kg = 5000 g" (không có gì chặn — đã xác minh schema).
- Bắt nhập lại kg↔g, ml↔l cho từng nguyên liệu (thừa, dễ sai chính tả/số).
- Checklist vai trò gây rối, mặc định all-on nên vô nghĩa.

## 2. Mô hình đích (owner-approved)

Hai tầng đơn vị:

**Tầng 1 — Đơn vị chuẩn (system-locked, 2 họ / dimension):**
- **mass**: g (canonical), kg, mg — hệ số cố định hệ thống (`kg → 1000 g`, `mg → 0.001 g`).
- **volume**: ml (canonical), l, cl — cố định (`l → 1000 ml`).
- Các hệ số này là **hằng số hệ thống**, người dùng KHÔNG được sửa. "1 kg = 5000 g" là bất khả.

**Tầng 2 — Đơn vị đóng gói (packaging, tenant-defined, không thuộc dimension):**
- bao, thùng, túi, phần, hộp, quả, chục, khay...
- Mỗi đơn vị đóng gói khai **đúng 1 quy đổi** về một đơn vị đã biết trong cùng chuỗi của nguyên liệu.

**Trong mỗi nguyên liệu:**
1. Owner chọn **1 base unit / nguyên liệu** (D-answer 2026-07-03). Vd: Gạo base = kg, Dầu base = l, Trứng base = "quả". Tồn kho (`stock_levels.current_quantity`) + WAC (`avg_unit_cost`) lưu theo base này.
2. Nếu base là đơn vị chuẩn (kg/g/ml/l) → nguyên liệu thuộc dimension đó; **mọi đơn vị chuẩn cùng dimension tự dùng được** với hệ số khóa (không nhập).
3. Thêm đóng gói = 1 dòng: "1 Bao = 50 kg". Hệ resolve kg→base (khóa) → tính `to_base_factor` của Bao và **suy bắc cầu** ra Bao↔mọi đơn vị khác.
4. Thêm "Phần" sau ("1 Phần = 200 g") → hệ **tự suy `1 Bao = 250 Phần`** (50000g / 200g), không nhập lại. Đây là yêu cầu gốc của owner, đã xác nhận toán đúng.
5. **Bỏ checklist vai trò**: mọi đơn vị của nguyên liệu dùng được cho nhập/xuất/chế biến; conversion luôn đúng nên không cần cấm (owner: "nhập Gạo theo Phần vẫn ra số đúng").
6. **Nguyên liệu đếm thuần** (Trứng, rau bó): base = 1 đơn vị đếm tự định (quả/bó, `is_base`, factor 1); đơn vị đếm khác neo tay vào base (1 chục = 10 quả). Không dimension chuẩn — đúng lựa chọn owner (chỉ 2 họ chuẩn: mass + volume; đếm xử như đóng gói).

**Ranh giới (owner nhấn mạnh):** hệ này CHỈ cho đơn vị nguyên liệu Kho. "Phần" bán trong **Thực đơn POS** = khẩu phần recipe/menu, khái niệm riêng — KHÔNG lẫn với "phần" đơn-vị-tồn-kho. Menu serving vẫn ở `menu_items`/`recipes`, độc lập.

## 3. Guardrails (đúng-đắn)

- Chuẩn↔chuẩn: hằng số hệ thống, không có ô nhập → không thể sai.
- Đóng gói phải neo vào đơn vị **cùng dimension** với base của nguyên liệu (cấm neo "bao" (mass) vào "l" (volume)). Validate ở cả UI lẫn RPC (fail-closed).
- Đúng 1 `is_base=true`/nguyên liệu (partial unique index đã có).
- Đơn vị chuẩn của nguyên liệu đếm thuần: N/A (base là count unit, không dimension).

## 4. Thay đổi dữ liệu

### 4.1 `units` (global registry) — thêm dimension + standard factor
```
units(
  id, tenant_id, code, name, is_active,           -- (đã có)
  dimension        TEXT NULL,      -- 'mass' | 'volume' | NULL (packaging/count)
  is_standard      BOOLEAN NOT NULL DEFAULT false, -- true = đơn vị chuẩn khóa
  standard_factor  NUMERIC(18,9) NULL,  -- 1 unit = ? canonical-của-dimension; chỉ set khi is_standard
  UNIQUE(code, tenant_id)
)
```
- Seed 2 dimension chuẩn: mass {g=1, kg=1000, mg=0.001}, volume {ml=1, l=1000, cl=10}. `is_standard=true`, không cho tenant sửa factor (UI khóa; RPC chặn).
- Packaging units: `dimension=NULL`, `is_standard=false`, `standard_factor=NULL`.

### 4.2 `ingredient_units` — bỏ cờ vai trò, giữ to_base_factor (derived)
```
ingredient_units(
  id, tenant_id, ingredient_id, unit_id,
  to_base_factor  NUMERIC(18,12) NOT NULL CHECK (>0),  -- DERIVED, không nhập trực tiếp cho standard units
  is_base         BOOLEAN NOT NULL DEFAULT false,
  -- allow_purchase / allow_issue / allow_production: DROP (Phase C) — mọi đơn vị dùng mọi thao tác
  anchor_unit_id  BIGINT NULL REFERENCES units,  -- packaging: neo vào đơn vị nào
  anchor_factor   NUMERIC(18,9) NULL,            -- packaging: 1 this = anchor_factor × anchor_unit
  sort_order, is_active, ...
  UNIQUE(ingredient_id, unit_id, tenant_id)
)
```
- `to_base_factor` cho đơn vị chuẩn = tra từ `units.standard_factor` (ratio về base's standard_factor) — hệ tính, không nhập.
- `to_base_factor` cho packaging = `anchor_factor × (anchor_unit.to_base_factor)` — hệ suy bắc cầu.
- Owner chỉ nhập `anchor_unit_id` + `anchor_factor` cho packaging. Standard units: chỉ tick "dùng đơn vị này".

### 4.3 Helper suy diễn (SQL + TS, dùng chung)
- `inv_to_base(ingredient_id, entry_unit_id, entry_qty)` — đã tồn tại, đọc `to_base_factor`; giữ nguyên chữ ký. Chỉ cần `to_base_factor` được điền đúng (derived) lúc lưu ingredient_units.
- Thêm hàm tính `to_base_factor` lúc upsert ingredient_units (TS trong catalog action + SQL trigger/RPC để nhất quán): resolve standard-ratio hoặc packaging-anchor-chain, fail-closed nếu anchor khác dimension hoặc chu trình.

## 5. Surfaces (đổi so với draft §5)

| Surface | Thay đổi |
|---|---|
| **Catalog** (`ingredient-dialog.tsx`, `ingredient-actions.ts`) | Lưới đơn vị: chọn base (dropdown standard theo dimension, hoặc count-base tự định); standard-units cùng dimension hiện tự động (tick dùng/không); packaging thêm dòng {unit, anchor_unit, anchor_factor}. BỎ 3 cột allow_*. Hiện preview quy đổi bắc cầu (1 Bao = 250 Phần) để owner thấy ngay. |
| **Đơn vị master** (`/inventory/settings/units`) | CRUD packaging units (code/name); standard units (mass/volume) hiện read-only, khóa factor. |
| **11 RPC** (Phase B) | Mọi RPC post ledger gọi `inv_to_base` trước khi tính (đã liệt kê draft §5). Không đổi so với draft — chỉ khác: to_base_factor giờ derived đúng, standard chuẩn xác. |
| **POS/menu** | KHÔNG đụng — "phần" menu tách biệt. |

## 6. Phased plan (owner: full A+B, B gắn nhập đầu kỳ)

- **Phase A — Registry + Catalog (additive, an toàn):** thêm cột `units.dimension/is_standard/standard_factor` + `ingredient_units.anchor_*`; seed 2 dimension chuẩn; form catalog 2 tầng + preview; màn units master; derivation helper (tính to_base_factor lúc lưu). Áp prod TRƯỚC khi code deploy (additive). Giao được "định nghĩa đơn vị đúng, không nhập sai kg↔g".
- **Phase B — Quy đổi ở 11 RPC + drop allow_* (gắn NHẬP ĐẦU KỲ):** cập nhật RPC dùng inv_to_base; **land NGAY TRƯỚC đợt nhập đầu kỳ của owner (D060 §5)** để số liệu mới đúng từ đầu. Kèm freeze-base-qty (audit #2) + verify_inventory_ledger nếu owner mở slice đó cùng lúc. Rủi ro cao nhất — test per-RPC, stock đang trống.
- **Phase C — Dọn (destructive):** drop `allow_purchase/issue/production` + cột legacy `purchase_unit/measure_unit/purchase_to_measure_factor/unit`. Deploy-coupling: code bỏ đọc cột cũ TRƯỚC, rồi apply.
- Mỗi phase: migration file → PR → owner apply.

## 7. Quyết định đã chốt (brainstorm 2026-07-03)

1. Base: **owner chọn per-nguyên-liệu** (không ép đơn vị nhỏ nhất).
2. Họ chuẩn: **2 (mass + volume)**; đếm xử như packaging tự nhập.
3. Vai trò: **bỏ checklist** allow_purchase/issue/production — mọi đơn vị mọi thao tác.
4. Chuẩn↔chuẩn: **hệ khóa**, không cho sửa (chặn 1kg=5000g).
5. Phạm vi: **spec đầy đủ A+B**; Phase B gắn nhập đầu kỳ.
6. POS "phần" ≠ inventory "phần": tách biệt.

## 8. Còn mở (không chặn spec)
- Danh sách packaging seed ban đầu (bao/thùng/túi/phần/hộp/quả/chục...) — owner rà khi làm Phase A.
- Category master: theo draft cũ §3.3 (giữ nguyên, orthogonal).

## 9. Rủi ro
- Phase B đụng 11 RPC tài chính/tồn — test fail-closed per-RPC; stock trống nên không hỏng dữ liệu cũ.
- Derivation bắc cầu sai → lệch tồn. Giảm: helper fail-closed (anchor khác dimension / chu trình = reject), preview trên UI, unit test cho chuỗi bao→kg→g→phần.
- Drop cột legacy phá deploy dormant → deploy-coupling Phase C cuối.
