# Inventory Branch Kitchen Model

> Date: `2026-04-14`  
> Status: `Approved for pilot contract`
> Ref: `docs/ref/inventory.md`, `docs/ref/inventory-sop.md`, `docs/spec/database-schema.md`

## 1. Problem

Business flow đã chốt:

- `HQ -> Bếp trung tâm -> Kho chi nhánh -> Bếp chi nhánh`
- `HQ -> Kho chi nhánh -> Bếp chi nhánh`
- `Kho chi nhánh -> Bếp chi nhánh`

Nhưng schema hiện tại vẫn hạch toán tồn kho theo `branch_id`, chưa có location ledger riêng cho `Kho chi nhánh` và `Bếp chi nhánh` trong cùng site `branch`.

## 2. Current System Boundary

Hiện codebase đang có:

- `stock_levels(tenant_id, branch_id, ingredient_id)`
- `stock_movements(..., branch_id, ...)`
- `stock_transfers(from_branch_id, to_branch_id, ...)`
- `stock_issues(branch_id, issue_type, ...)`

Điều này có nghĩa:

- `HQ`, `Bếp trung tâm`, `Chi nhánh` là các site thật trong schema.
- `Kho chi nhánh` và `Bếp chi nhánh` mới là hai điểm vận hành nội bộ trong cùng một `branch`.
- Hệ thống chưa thể giữ hai bucket tồn độc lập cho kho và bếp của cùng một chi nhánh.

## 3. Pilot Decision

### 3.1 Rule vận hành hiện tại

Trong pilot:

- `HQ -> Kho chi nhánh` dùng `stock_transfer`
- `Bếp trung tâm -> Kho chi nhánh` dùng `stock_transfer`
- `Kho chi nhánh -> Bếp chi nhánh` dùng `stock_issue` với `issue_type = kitchen_use`

### 3.2 Semantics

`stock_issue(issue_type = kitchen_use)` được coi là:

- chứng từ cấp phát nội bộ từ kho chi nhánh xuống bếp chi nhánh
- bước xác nhận hàng đã rời kho chi nhánh để vào vận hành bếp
- dấu vết audit cho tiêu hao nội bộ trước bán hàng

Nó **không** có nghĩa:

- đã có tồn kho riêng của bếp chi nhánh trong DB
- đã có transfer nội bộ 2 chiều giữa hai location riêng
- đã có stocktake riêng cho bếp chi nhánh

## 4. Why We Are Not Adding Sub-location Yet

Chưa nên nâng lên sub-location ledger ngay lúc này vì:

- hầu hết write path hiện tại đều bám `branch_id`
- tách ledger sẽ chạm `stock_levels`, `stock_movements`, `stocktake`, `consumption`, `issues`, `transfers`, reports, RLS, UI filters, và types
- pilot hiện cần semantics đúng và audit rõ trước, chưa cần double-ledger nội bộ tại từng chi nhánh

## 5. Upgrade Trigger

Chỉ nâng lên location-level ledger khi có ít nhất một nhu cầu thật sau:

1. Cần kiểm kê riêng `Kho chi nhánh` và `Bếp chi nhánh`
2. Cần đo variance riêng cho kho vs bếp trong cùng chi nhánh
3. Cần cấp phát nhiều lần/ngày giữa kho và bếp với kiểm soát tồn riêng
4. Cần báo cáo waste / over-portioning theo bếp chi nhánh thay vì theo toàn site

## 6. Future Target Model

Khi cần nâng cấp, hướng đề xuất là:

- thêm `inventory_locations`
- mỗi `branch` có thể có nhiều location nội bộ
- location kind tối thiểu:
  - `warehouse`
  - `kitchen`
  - `production_storage`
- chuyển dần ledger từ `branch_id` sang `location_id` ở các bảng tồn / movement / transfer / stocktake

Boundary của bước nâng cấp đó:

- đây là một project schema + RLS + app routing riêng
- không nên nhét vào patch pilot hiện tại

## 7. Immediate App Contract

Từ thời điểm này, team nên hiểu như sau:

- route transfer dùng cho luồng giữa các site thật: HQ, bếp trung tâm, chi nhánh
- route issue dùng cho luồng cấp phát nội bộ trong site chi nhánh
- copy trên UI cần nói rõ `kitchen_use = cấp phát bếp chi nhánh`, tránh wording mơ hồ kiểu chỉ ghi `Bếp`

## 8. Auth v2 — Role canonical cho Kho ↔ Bếp (cập nhật 2026-04-23)

> Section này bổ sung sau khi audit Auth v2: RLS cutover đã 100%, nhưng template + server action còn drift với runtime. Source: `docs/ref/inventory-rbac-matrix.md`, memory `project_auth_v2_phase_1.md`.

### 8.1 Position canonical cho bếp trung tâm + kho

| Position code | Legacy role code | Scope mặc định trong model này |
| ------------- | ---------------- | ------------------------------ |
| `kho_truong` | `warehouse_manager` | Kho Trụ sở (`branch_kind = headquarters`) — procurement + outbound transfer |
| `thu_kho` | `warehouse_manager` | Kho Trụ sở — nhận hàng + stocktake, không outbound transfer |
| `bep_truong` | `production_manager` | Bếp trung tâm (`branch_kind = central_kitchen`) — sản xuất + ship ra chi nhánh |
| `quan_ly_cn` | `branch_manager` | Chi nhánh — nhận transfer, `kitchen_use` issue, stocktake nội bộ |

Các position này được seed khi tenant khởi tạo. Grant thực tế lưu ở `staff_permissions(user_id, branch_id, permission_key)`.

### 8.2 Workflow → permission key mapping

| Bước trong model | Permission key cần | Position mặc định thực thi |
| ---------------- | ------------------ | -------------------------- |
| NCC → [PO] tại HQ | `procurement:po_create` + `procurement:po_approve` | `kho_truong` tạo, `super_manager` duyệt (held) |
| NCC → [GRN] tại HQ | `procurement:grn_create` + `procurement:grn_confirm` | `kho_truong` |
| [HQ → Bếp trung tâm] transfer | `inventory:transfer_create` + `inventory:transfer_ship` (tại HQ) + `inventory:transfer_receive` (tại CK) | `kho_truong` ship, `bep_truong` receive |
| [HQ → Kho chi nhánh] transfer | Tương tự, nhận ở `quan_ly_cn` chi nhánh | `kho_truong` ship, `quan_ly_cn` receive |
| [Bếp trung tâm] lệnh sản xuất | `inventory:production_create` + `inventory:production_confirm` (+ `menu:read` xem BOM) | `bep_truong` |
| [Bếp trung tâm] CRUD công thức | `menu:write` (RLS `production_recipes` require `has_permission_any('menu:write')`) | `bep_truong` |
| [Bếp trung tâm → Kho chi nhánh] transfer | `inventory:transfer_create` + `inventory:transfer_ship` (tại CK) + `inventory:transfer_receive` (tại chi nhánh) | `bep_truong` ship, `quan_ly_cn` receive |
| [Kho chi nhánh → Bếp chi nhánh] `stock_issue(kitchen_use)` | `inventory:write` (tạo issue) | `quan_ly_cn` |

### 8.3 Known gaps (runtime ≠ intent) — scheduled fix

**Template `bep_truong` hiện thiếu 3 permission** để workflow §8.2 chạy đầy đủ:

- `menu:write` — không CRUD được `production_recipes` vì RLS require key này
- `inventory:transfer_create` — không tạo được phiếu ship CK → chi nhánh
- `procurement:read` — không xem được PO/GRN để biết nguyên liệu sắp về

Fix kèm migration + `sync_missing_permissions_from_template(bep_truong)` re-grant cho user đang hold template này.

**Server action `apps/web/app/inventory/production-actions.ts:10`** còn `PRODUCTION_ROLES = ["super_manager"]` hardcoded — bếp trưởng có đúng grant vẫn bị reject trước khi gọi RPC. Sẽ migrate sang `currentUserHasPermission("inventory:production_create")`.

**Phase 2-RPC** (17 SECURITY DEFINER functions còn gọi `auth_role()` trong body) chặn nhiều bước của model:

- `create_production_order`, `confirm_production_order`, `cancel_production_order`, `upsert_recipe_lines` — chặn bếp trưởng vận hành lệnh sản xuất + công thức
- `create_stock_transfer_draft`, `stock_transfer_list_branches` — chặn kho trưởng / bếp trưởng list branches đích
- `create_stocktake_session` — chặn role nào không nằm trong whitelist legacy

Các RPC này cần migrate sang `has_permission()` guards trước khi mở CK expansion. Xem [inventory-rbac-matrix.md §6](../ref/inventory-rbac-matrix.md).

### 8.4 Area scoping (H3) — SHIPPED-VIA-AUTH-V2

Roadmap H3 trước đây ghi DEFERRED; Auth v2 đã giải qua per-branch `staff_permissions` grants backfilled từ `area_branches`. Không cần thêm area-filtering RLS riêng cho mỗi table. Docs cũ (pre-2026-04-22) nói "area_manager tenant-wide tạm thời" đã lỗi thời khi user có đúng per-branch grants.
