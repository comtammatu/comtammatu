# Inventory Adoption Matrix

> Dùng để theo dõi mức “đã thật sự sẵn sàng” của từng lát Inventory.
>
> Mục tiêu:
>
> - tránh tình trạng docs nói đã xong nhưng code/test chưa theo
> - giúp so với ERP docs theo dạng `adopt / adapt / defer`
> - làm input cho planning và QA sign-off

Date: `2026-04-14`

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
| Procurement (`PO -> GRN -> supplier_invoice`) | ✅ | ✅ | ⚠️ | `Stable` | Nên bổ sung semantics AP rõ hơn |
| Transfer workflow | ✅ | ✅ | ⚠️ | `Stable` | Cần tiếp tục giữ state machine nhất quán giữa doc và UI |
| Stocktake | ✅ | ✅ | ⚠️ | `Stable` | Cần evidence QA mỗi khi mở write flow mới |
| Production / central kitchen | ✅ | ✅ | ⚠️ | `Stable` | Nên thêm boundary rõ hơn về ai được confirm production |
| Inventory RBAC/action matrix | ✅ | ⚠️ | ❌ | `Adopt` | Doc đã có; cần tiếp tục đồng bộ với ACL và page guards |
| Price variance tolerance | ✅ | ⚠️ | ❌ | `Adapt` | Semantics đã được chốt trong doc; code vẫn chưa là price engine đầy đủ |
| AP boundary (`payment_terms`, `due_date`, `payment_status`, aging`) | ✅ | ⚠️ | ❌ | `Adapt` | Vocabulary đã rõ trong doc; code/reporting vẫn cần hoàn tất |
| Readiness runbook | ✅ | n/a | ❌ | `Adopt` | Runbook đã có; cần bắt đầu dùng như gate thật cho mỗi lát Inventory |
| ERP platform schema ideas | ❌ | ❌ | n/a | `Defer` | Không phù hợp boundary hiện tại |

Legend:

- `✅` = đã có nền tốt
- `⚠️` = có một phần, cần chốt thêm
- `❌` = khoảng trống rõ ràng

---

## 3. Next Doc Moves

1. Đồng bộ ACL thật trong code với [inventory-rbac-matrix.md](../../ref/inventory-rbac-matrix.md) khi role/page guards thay đổi.
2. Khi code mở thêm `price variance` hoặc `AP aging`, cập nhật cột `Code` và `Verify` ở matrix này.
3. Mỗi lần mở thêm flow Inventory, chạy lại [pre-release-qa.md](../../runbooks/inventory/pre-release-qa.md) và cập nhật matrix này.
