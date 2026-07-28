# Inventory — Phân vai & luồng vận hành (D093)

> SSOT owner-facing cho chức vụ, chức năng, routing hiển thị và handoff.
> Authority kỹ thuật: `module-acl.ts`, `inventory-roles.ts`, permission keys,
> RLS/RPC. Không suy quyền chỉ từ tài liệu này.

## 1. Mô hình đã chốt

1. **GRN (nhập NCC)** chỉ tại Kho Tổng (`central_supply`) và Bếp Trung Tâm
   (`central_kitchen`). Chi nhánh **không** GRN.
2. Chi nhánh **Yêu cầu hàng** — một phiếu; mỗi dòng copy
   `ingredients.default_fulfill_site_kind`; bên nguồn thấy dòng của mình.
3. Đáp ứng yêu cầu → **điều chuyển (DC)** từ kho nguồn → chi nhánh nhận.
4. Chi nhánh: tồn kho, tiêu hao, kiểm kê, hao hụt, giao đếm — **không** sản xuất.
5. Nav/tile chỉ hiện chức năng được phép (fail closed).

## 2. Gap audit (trước cắt — tham chiếu)

Permission: `PROCUREMENT_ROLES` còn BM; `PRODUCTION_*` còn BM + kind `branch`;
`create_stock_transfer_draft` owner-only; thiếu `request_*` /
`default_fulfill_site_kind`; BM template còn `grn_*` + `production_*`.

UI: tile “Nhập hàng”/“Sản xuất”; on-hand CTA → `/stock/grn/new`; dashboard/queue
GRN·SX; inventory-nav lộ PO/recipes cho Kho Tổng; notification URL `/br/.../stock/grn`.

## 3. Ma trận RACI (ngắn)

| Nghiệp vụ | Owner | Kế toán | Kho Tổng | Bếp TT | QL CN | NV đếm |
| --- | --- | --- | --- | --- | --- | --- |
| Catalog + `default_fulfill_site_kind` | A/R | — | — | — | C (đọc) | — |
| GRN draft/confirm | A | C (đọc→PO) | R (Kho Tổng) | R (Bếp TT) | — | — |
| PO + giá | A | R | — | — | — | — |
| HĐ NCC / AP | A | R | — | — | — | — |
| Yêu cầu hàng | A | — | C (inbox) | C (inbox) | R | — |
| Fulfill → DC | A | — | R (dòng Kho Tổng) | R (dòng Bếp TT) | C (nhận) | — |
| Tồn / tiêu hao / kiểm kê / hao hụt CN | A | — | site mình | site mình | R | R (đếm) |
| Sản xuất | A | — | — | R | — | — |

## 4. Từng vai trò

### 4.1 Chủ sở hữu (`owner`)

- **Surface:** `/inventory/*`, `/finance/*`, oversight `/br/.../stock`
- **Làm:** full ops; gán `default_fulfill_site_kind`; WAC; tạo DC ad-hoc
- **Nav:** đầy đủ L0
- **Không giới hạn** trong phạm vi Inventory

### 4.2 Kế toán (`accountant`)

- **Surface:** `/finance/*`, `/inventory/grn`, `/inventory/purchase-orders`
- **Làm:** đọc GRN trung tâm → tạo/duyệt PO + giá; HĐ/AP
- **Nav hiện:** Nhập kho, Đơn mua hàng (+ Finance)
- **Không hiện / không làm:** tồn, SX, recipes, valuation, yêu cầu CN, QC confirm

### 4.3 Quản lý kho Tổng (`central_supply_ops`)

- **Surface:** `/inventory` (site `central_supply`)
- **Làm:** GRN Kho Tổng; tồn/kiểm kê/hao hụt site; inbox dòng yêu cầu
  `central_supply`; fulfill → DC; ship/receive tại site
- **Nav hiện:** Nay, Tồn, GRN, Yêu cầu (inbox), Điều chuyển, tiêu hao/hao hụt,
  NCC — **không** PO, Production, Recipes menu BOM
- **Không:** PO/giá; SX; branch stock UI

### 4.4 Bếp trưởng Bếp TT (`central_kitchen_lead`)

- Như Kho Tổng tại `central_kitchen` **+ Production** (+ production recipes)
- Inbox dòng `central_kitchen`; fulfill → DC
- **Không:** PO; tạo DC ad-hoc ngoài fulfill (trừ khi có grant); recipes menu BOM Owner

### 4.5 Quản lý chi nhánh (`branch_manager`)

- **Surface:** `/br/{id}/stock`
- **Tile hiện:** Tồn kho · Yêu cầu hàng · Tiêu hao · Kiểm kê · Hao hụt ·
  Giao đếm · Danh mục · nhận DC
- **Không hiện:** GRN, Sản xuất, PO, giá mua, WAC
- **Playbook yêu cầu:** tạo phiếu → thêm dòng (nguồn auto từ catalog) → gửi →
  theo dõi → nhận DC khi trung tâm xuất

### 4.6 Thu ngân / Bếp / NV CN

- Chỉ `/br/.../stock/count` khi được gán. Không yêu cầu / GRN / SX.

## 5. Luồng nghiệp vụ

### 5.1 Mua NCC (chỉ trung tâm)

1. Kho Tổng / Bếp TT tạo GRN draft (SL, đơn vị, từ chối + ảnh).
2. Kế toán/Owner tạo PO từ GRN, nhập giá, duyệt.
3. Kho confirm GRN (fail closed thiếu PO duyệt).
4. Finance nhập HĐ/AP.

### 5.2 Yêu cầu hàng CN → DC

1. QL CN tạo phiếu yêu cầu (draft).
2. Thêm dòng: hệ thống copy `default_fulfill_site_kind`; thiếu mapping → chặn.
3. Submit.
4. Kho Tổng / Bếp TT mở inbox (filter nguồn mình) → fulfill → tạo DC → ship.
5. QL CN nhận DC → tồn CN tăng.

### 5.3 Kiểm kê / hao hụt CN

Giữ flow hiện hành: QL gán → NV đếm mù → QL duyệt; hao hụt có lý do/ảnh.

## 6. Permission keys (D093)

| Key | Ai |
| --- | --- |
| `inventory:request_create` | owner, branch_manager |
| `inventory:request_submit` | owner, branch_manager |
| `inventory:request_cancel` | owner, branch_manager |
| `inventory:request_fulfill` | owner, central_supply_ops, central_kitchen_lead |
| `inventory:transfer_create` | owner, central_supply_ops, central_kitchen_lead (fulfill / logistics) |
| `procurement:grn_*` | không còn trên branch_manager; site GRN ∈ central only |
| `inventory:production_*` | không còn trên branch_manager; kind ∈ central_kitchen (+ owner) |

## 7. Tài liệu liên quan

- [inventory.md](inventory.md) §11
- [inventory-sop.md](inventory-sop.md)
- [screen-context-map.md](screen-context-map.md) §2.5–2.6
- `docs/plan/decisions.md` **D093**
- `docs/spec/role-route-matrix.md`

## 8. Ghi chú triển khai

- Migration đã apply Greenfield (`enloyfnuerqgaqderbwb`):
  `20260729140000_d093_central_grn_branch_stock_request.sql` +
  `20260729140100_d093_sync_stock_request_staff_permissions.sql`.
- Types: `corepack pnpm db:types` đã regenerate từ Greenfield.
- Catalog: Owner gán `default_fulfill_site_kind` trên form nguyên liệu trước
  khi CN thêm dòng yêu cầu (fail closed nếu thiếu).
- Static tests D093 khóa allowlist (nav, redirect GRN/SX CN, notification URL).
