# Inventory Adoption Matrix

> Dùng để theo dõi mức “đã thật sự sẵn sàng” của từng lát Inventory.
>
> Mục tiêu:
>
> - tránh tình trạng docs nói đã xong nhưng code/test chưa theo
> - giúp so với ERP docs theo dạng `adopt / adapt / defer`
> - làm input cho planning và QA sign-off

Date: `2026-04-16`

---

## 1. Rubric

| Cột | Ý nghĩa |
| --- | ------- |
| `Doc` | Tài liệu nội bộ đã rõ boundary, flow, ACL chưa |
| `Code` | Schema / route / RPC / UI đã tồn tại chưa |
| `Verify` | Đã có evidence typecheck/lint/build/smoke chưa |
| `Decision` | `Adopt`, `Adapt`, `Defer`, `Stable` |

---

## 2. Matrix

| Slice | Doc | Code | Verify | Decision | Ghi chú |
| ----- | --- | ---- | ------ | -------- | ------- |
| Core inventory model (`HQ`, `Bếp trung tâm`, `Kho chi nhánh`, `Bếp chi nhánh`) | ✅ | ✅ | ⚠️ | `Stable` | Doc đã cập nhật topology linh hoạt; contract hiện tại chốt `Kho chi nhánh -> Bếp chi nhánh` qua `stock_issue(kitchen_use)` trong cùng site `branch`; vẫn cần smoke evidence |
| Inventory UX / IA contract | ✅ | ✅ | ⚠️ | `Stable` | Sidebar đã chuyển sang nhóm workflow; dashboard chuyển sang `task queue first`; cần tiếp tục smoke theo role/site |
| Procurement (`PO -> GRN -> supplier_invoice`) | ✅ | ✅ | ⚠️ | `Stable` | PO send/cancel, tạo GRN từ PO, confirm GRN, invoice matching/payment đã wire; còn thiếu manual HQ smoke evidence |
| Transfer workflow | ✅ | ✅ | ⚠️ | `Stable` | Detail page đã wire đủ state machine; còn cần smoke theo từng hướng site |
| Branch operations (`Nhận transfer -> Cấp bếp -> Stocktake`) | ✅ | ✅ | ⚠️ | `Stable` | UI đã bỏ CTA `Receiving` cho branch và đổi `Issues` sang mental model `Cấp bếp` |
| Stocktake | ✅ | ✅ | ⚠️ | `Stable` | Cần evidence QA mỗi khi mở write flow mới |
| Production / central kitchen | ✅ | ✅ | ⚠️ | `Stable` | Nav đã ẩn với non-`super_manager`; vẫn cần smoke action boundary ở central kitchen |
| Inventory RBAC/action matrix | ✅ | ✅ | ⚠️ | `Stable` | ACL docs, route ownership, và nav hiện đã đồng bộ tốt hơn; vẫn cần verify định kỳ khi role/page guard đổi |
| Catalog canonical routes (`ingredients`, `suppliers`, `recipes`) | ✅ | ✅ | ⚠️ | `Stable` | Catalog đã canonical về `Danh mục`; routes cũ trong `Settings` chỉ còn redirect tương thích |
| Price variance tolerance | ✅ | ⚠️ | ❌ | `Adapt` | Semantics đã được chốt trong doc; code vẫn chưa là price engine đầy đủ |
| AP boundary (`payment_terms`, `due_date`, `payment_status`, aging`) | ✅ | ⚠️ | ❌ | `Adapt` | Vocabulary đã rõ trong doc; code/reporting vẫn cần hoàn tất |
| Readiness runbook | ✅ | n/a | ⚠️ | `Adopt` | Runbook đã cập nhật theo workflow/CTA hiện tại; còn cần dùng như gate thật trong manual smoke rounds |
| ERP platform schema ideas | ❌ | ❌ | n/a | `Defer` | Không phù hợp boundary hiện tại |

Legend:

- `✅` = đã có nền tốt
- `⚠️` = có một phần, cần chốt thêm
- `❌` = khoảng trống rõ ràng

---

## 3. Next Doc Moves

1. Khi role/page guard thay đổi, cập nhật cùng lúc [inventory-rbac-matrix.md](../../ref/inventory-rbac-matrix.md), [auth.md](../../modules/auth.md), và matrix này.
2. Khi code mở thêm `price variance`, `AP aging`, hoặc export/report actions thật, cập nhật cột `Code` và `Verify` ở matrix này.
3. Mỗi lần mở thêm flow Inventory hoặc thay đổi CTA quan trọng, chạy lại [pre-release-qa.md](../../runbooks/inventory/pre-release-qa.md) và cập nhật matrix này.
