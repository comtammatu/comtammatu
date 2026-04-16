# Inventory Pre-release QA

> Smoke + readiness checklist trước khi coi một lát Inventory là “sẵn sàng dùng”.
>
> Dùng cho:
>
> - thay đổi docs ảnh hưởng Inventory scope
> - thay đổi route / server action / RPC / RLS / migrations liên quan Inventory
> - chốt một flow pilot mới như stocktake, transfer, production, expiry, AP readouts

---

## 1. Required Gates

### Gate A — Repo-wide verify

Chạy bắt buộc:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Fail một lệnh là chưa qua gate.

### Gate B — Inventory scope sanity

Kiểm tra ít nhất các surface sau còn mở được:

- `/inventory`
- `/inventory/transfers`
- `/inventory/issues`
- `/inventory/stocktake`
- `/inventory/expiry`
- `/inventory/reports`
- procurement surfaces đang active trong pilot: `/inventory/receiving`, `/inventory/purchase-orders`, `/inventory/grn`, `/inventory/supplier-invoices`
- `/inventory/production` nếu flow production bị ảnh hưởng
- verify old `/admin/inventory*` URLs fail as unsupported routes and no longer behave like a live surface

---

## 2. ACL Smoke

Kiểm theo đúng [inventory-rbac-matrix.md](../../ref/inventory-rbac-matrix.md):

| Role | Phải đúng |
| ---- | --------- |
| `super_manager` | Vào được Inventory + procurement + production |
| `area_manager` | Vào được Inventory read/ops surfaces, không vào procurement, không vào production |
| `branch_manager` | Vào được branch ops surfaces (`stock`, `transfers`, `issues`, `stocktake`, `expiry`, `reports`), không vào procurement, không vào production |
| `owner` | Có thể đi qua ACL ở một số inventory routes nhưng không được UX dẫn như operator hằng ngày |
| `office`, `cashier`, `waiter`, `chef` | Không vào Inventory route nếu ACL hiện tại chưa cho |

Đặc biệt kiểm:

- route bị cấm phải redirect/forbid đúng
- nav không lộ link sai role
- dashboard phải giữ mental model `task queue first`
- `Production` phải ẩn khỏi non-`super_manager` ngay từ nav
- `Ingredients / Suppliers / Recipes` không xuất hiện duplicate giữa menu chính và `Settings`
- không có page nào “vào được nhưng dữ liệu null im lặng” do thiếu `GRANT` hoặc RLS sai

---

## 3. Flow Smoke Checklist

### 3.1 Procurement at HQ

- Tạo / mở `PO`
- `draft` có thể `Gửi PO` / `Hủy PO`
- Từ `PO` đã gửi hoặc nhận dở, tạo `GRN` thật
- Confirm `GRN`
- Kiểm tra tồn HQ tăng đúng
- Nhập `supplier_invoice`
- Recompute matching
- Ghi nhận thanh toán
- Kiểm tra 3-way matching không drift vocabulary giữa UI và doc

### 3.2 HQ outbound transfer

- Smoke ít nhất một trong hai hướng đang bị ảnh hưởng:
- `HQ -> Bếp trung tâm`
- `HQ -> Kho chi nhánh`
- Tạo transfer
- Confirm ship
- Mark in transit
- Confirm receive
- Receive
- Kiểm tra `transfer_out` / `transfer_in` và tồn hai đầu

### 3.3 Production

- Chỉ `super_manager` thấy nav và vào được page
- Tạo `production_order`
- Fail đúng khi thiếu BOM hoặc thiếu nguyên liệu
- Confirm thành công khi đủ điều kiện
- Kiểm tra `production_consumption` + `production_output`

### 3.4 Bếp trung tâm -> Kho chi nhánh transfer

- Tạo transfer thành phẩm
- Confirm receipt ở chi nhánh
- Kiểm tra short-receipt / discrepancy flow nếu scope có hỗ trợ

### 3.5 Kho chi nhánh -> Bếp chi nhánh

- Kiểm tra flow `Cấp bếp` tại `/inventory/issues`
- Xác nhận branch dashboard dẫn đúng sang `transfers` và `issues`, không dẫn sang `receiving`
- Xác nhận luồng này không bị bỏ quên trong SOP / UI / báo cáo
- Nếu hiện đang hạch toán trong cùng `branch`, ghi rõ evidence và boundary

### 3.6 Stocktake

- Tạo phiên `stocktake`
- Nhập số đếm
- Complete session
- Kiểm tra `count_adjustment` và tồn mới

### 3.7 Alerts and reports

- Reorder alert hiển thị đúng khi dưới `reorder_point`
- Expiry alert hiển thị đúng theo window tài liệu quy định
- Nếu surface có `AP aging` hoặc inventory value, số liệu không lỗi obvious
- Các CTA chưa mở phải được ghi rõ `sắp mở` hoặc chuyển thành điều hướng thật; không để disabled button gây hiểu nhầm là đã có workflow

---

## 4. Regression Hotspots

| Hotspot | Vì sao dễ vỡ |
| ------- | ------------ |
| RLS + GRANT | Supabase có thể trả `{ data: null, error: null }` |
| `module-acl.ts` vs page-level guards | Rất dễ drift giữa nav, proxy, và page guard |
| WAC assumptions | Docs rất dễ vô tình lẫn với FIFO/lot semantics |
| HQ-only procurement | Chỉ cần một route/guard sai là chi nhánh có thể đi lệch pilot flow |
| Production permissions | Chưa có role riêng cho central kitchen, nên quyền đang phải giữ hẹp |
| False-promise CTA | UI rất dễ để lại nút giả sau refactor workflow, khiến docs và hành vi lệch nhau |

---

## 5. Evidence cần lưu

- Lệnh verify cuối cùng và kết quả
- Role nào đã smoke
- Flow nào đã smoke
- Bất kỳ deviation nào giữa docs và code

Nếu có chỗ phải defer:

- ghi rõ `deferred because ...`
- link lại doc scope liên quan
- không mark là shipped nếu chưa qua gate bắt buộc

---

## 6. Exit Criteria

Chỉ coi lát Inventory là ready khi:

- verify repo-wide xanh
- ACL smoke đúng với doc
- flow smoke đúng với scope thay đổi
- không còn mâu thuẫn giữa [inventory.md](../../ref/inventory.md), [inventory-sop.md](../../ref/inventory-sop.md), và [inventory-rbac-matrix.md](../../ref/inventory-rbac-matrix.md)
