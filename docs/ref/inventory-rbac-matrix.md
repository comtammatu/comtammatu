# Inventory RBAC Matrix

> Draft lean contract cho Inventory.
>
> Source of truth cho route/module access vẫn là `packages/shared/src/auth/module-acl.ts`.
> Tài liệu này chỉ làm rõ **business actions**, **scope**, và **data visibility** trong Inventory để docs, UI, và verify không drift nhau.

---

## 1. Vai trò áp dụng

| Role | Scope hiện tại | Ghi chú |
| ---- | -------------- | ------- |
| `owner` | Không dùng Inventory routes hằng ngày | Xem qua `reports` / `finance`; không coi là operator kho |
| `super_manager` | Tenant-wide | Vai trò chính cho procurement, HQ, bếp trung tâm |
| `area_manager` | Tenant-wide tạm thời | Chỉ nên dùng như vai trò giám sát cho đến khi H3 area scope hoàn tất |
| `branch_manager` | Own branch | Vai trò chính cho nhận hàng, tồn kho, stocktake, và điều phối kho chi nhánh / bếp chi nhánh |
| `office` | Không có Inventory route theo ACL hiện tại | Nếu cần AP read access sau này, phải thay đổi ACL riêng |
| `cashier` / `waiter` / `chef` | Không có Inventory route theo ACL hiện tại | Chỉ tác động tồn kho gián tiếp qua POS/KDS |

---

## 2. Nguyên tắc

- `inventory` và `inventory_procurement` là hai lớp quyền khác nhau.
- Procurement luôn hẹp hơn stock operations.
- Không tạo role mới chỉ để hợp thức hóa doc.
- Nếu doc cần quyền mà `module-acl.ts` chưa có, doc phải ghi rõ là `deferred`, không được giả định đã có.

---

## 3. Action Matrix

| Hành động | super_manager | area_manager | branch_manager | Ghi chú |
| --------- | ------------- | ------------ | -------------- | ------- |
| Xem dashboard tồn kho | ✅ | ✅ | ✅ | Branch manager chỉ scope chi nhánh mình |
| Xem reorder / expiry alerts | ✅ | ✅ | ✅ | Branch manager chỉ thấy branch mình |
| Xem lịch sử movement | ✅ | ✅ | ✅ | Area manager hiện vẫn tenant-wide do H3 chưa xong |
| Quản lý `ingredients` | ✅ | ❌ | ❌ | Master data vẫn nằm phía procurement |
| Quản lý `recipes` / `production_recipes` | ✅ | ❌ | ❌ | Chưa có vai trò bếp trung tâm riêng |
| Tạo / sửa `PO` | ✅ | ❌ | ❌ | Pilot: chỉ HQ nhập NCC |
| Confirm `GRN` | ✅ | ❌ | ❌ | `GRN` chỉ ở HQ |
| Nhập / xử lý `supplier_invoice` + matching | ✅ | ❌ | ❌ | Nếu sau này tách AP role, cập nhật ACL riêng |
| Tạo transfer `HQ -> Bếp trung tâm` | ✅ | ❌ | ❌ | Outbound từ HQ |
| Tạo transfer `HQ -> Kho chi nhánh` | ✅ | ❌ | ❌ | Flow hợp lệ, không bắt buộc qua bếp trung tâm |
| Tạo transfer `Bếp trung tâm -> Kho chi nhánh` | ✅ | ❌ | ❌ | Outbound từ bếp trung tâm |
| Confirm dispatch transfer | ✅ | ❌ | ❌ | Vai trò gửi hàng |
| Confirm receipt transfer tại chi nhánh đích | ✅ | ✅ | ✅ | Branch manager chỉ được xác nhận cho branch mình |
| Điều phối `Kho chi nhánh -> Bếp chi nhánh` | ✅ | ✅ | ✅ | Thao tác vận hành nội bộ trong site `branch`, branch manager chỉ branch mình |
| Tạo stocktake | ✅ | ✅ | ✅ | Branch manager chỉ branch mình |
| Complete stocktake | ✅ | ✅ | ✅ | Branch manager chỉ branch mình |
| Post adjustment / waste / expired write-off | ✅ | ❌ | ✅ | Branch manager chỉ branch mình và phải có reason |
| Tạo / confirm production order | ✅ | ❌ | ❌ | Giữ hẹp cho đến khi có central kitchen role riêng |
| Xem inventory value / AP aging | ✅ | ✅ | ⚠️ | Branch manager chỉ nên thấy nhánh mình nếu surface tồn tại |

---

## 4. Data Visibility

| Dữ liệu | super_manager | area_manager | branch_manager | Ghi chú |
| ------- | ------------- | ------------ | -------------- | ------- |
| On-hand quantity | ✅ | ✅ | ✅ | Scope theo branch |
| Average unit cost / WAC | ✅ | ✅ | ⚠️ | Chỉ hiển thị nếu UI thật sự cần; ưu tiên ẩn cho chi nhánh nếu không có use case |
| Supplier invoice detail | ✅ | ❌ | ❌ | Thuộc procurement/AP |
| Production BOM detail | ✅ | ❌ | ❌ | Không mở rộng sang branch manager trong pilot |
| Stocktake variance | ✅ | ✅ | ✅ | Branch manager chỉ branch mình |
| AP aging | ✅ | ❌ | ❌ | Nếu render ở reports/finance thì không phải Inventory route |

---

## 5. Route Ownership Gợi Ý

| Route family | Chủ vai trò |
| ------------ | ----------- |
| `/inventory` | `super_manager`, `area_manager`, `branch_manager` |
| `/inventory/production` | `super_manager` |
| `/inventory/stocktake` | `super_manager`, `area_manager`, `branch_manager` |
| `/inventory/expiry` | `super_manager`, `area_manager`, `branch_manager` |
| Procurement sub-surfaces (`NCC`, `PO`, `GRN`, `supplier_invoice`) | `super_manager` |

---

## 6. Open Questions

- Khi H3 hoàn tất, `area_manager` sẽ từ tenant-wide chuyển sang area-scoped. Tài liệu này phải cập nhật cùng lúc với RLS và ACL.
- Nếu xuất hiện vai trò vận hành riêng cho bếp trung tâm, quyền `production_order` nên tách khỏi `super_manager`.
- Nếu `office` cần AP read access, nên mở dưới `finance`/`reports` thay vì mở toàn bộ `inventory`.

---

## 7. Tài liệu liên quan

- [inventory.md](inventory.md)
- [inventory-sop.md](inventory-sop.md)
- [auth.md](../modules/auth.md)
- [inventory-erp-gap-matrix.md](inventory-erp-gap-matrix.md)
