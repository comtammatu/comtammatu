# Reference Docs

Tài liệu tham chiếu dài hạn cho nghiệp vụ Cơm Tấm Má Tư. Không dùng thư mục này
để lưu session notes, backlog, checklist tạm, hoặc ghi chú agent.

## Đọc theo nhu cầu

| Khi cần | Đọc |
| --- | --- |
| Bối cảnh doanh nghiệp, mục tiêu sản phẩm, phạm vi không làm | `business-context.md` |
| Thuật ngữ và tên gọi canonical | `glossary.md` |
| Danh sách synonym cấm (lint) | `terminology-synonyms.json` |
| Kiến thức nền F&B và tài chính vận hành | `domain-encyclopedia.md` |
| Metric, KPI, card, workflow data contract | `operational-data-contract.md` |
| Thuế doanh nghiệp, GTGT, TNDN, HĐĐT, hóa đơn đầu vào/đầu ra | `legal-framework-2026.md` trước, rồi `einvoice-tax.md` |
| Tài sản, CCDC, khấu hao, luồng GTGT và thang lợi nhuận F&B | `finance-assets-vat-fnb.md` |
| Chế độ sổ kế toán TT133/TT99 và ranh giới product | `accounting-books-tt133-tt99.md` |
| Bằng chứng cấu hình HĐĐT CTCP hiện tại | `einvoice-tax-ctcp-evidence.md` sau `einvoice-tax.md` |
| TNCN từ lương, payroll, BHXH/BHYT/BHTN, HĐLĐ | `legal-framework-2026.md` trước, rồi `payroll-pit.md` và `labor-contracts.md` |
| Inventory | `inventory.md`, `inventory-sop.md`, `inventory-taxonomy-v1.md` |
| Vai trò và luồng kho theo site | `inventory-role-ops.md` sau `inventory.md` |
| Tích hợp bên thứ ba | `third-party-integrations.md` |
| Setup local project | `setup.md` |
| Screen context / UI workflow | `screen-context-map.md` |

## Hygiene

- Một fact chỉ có một source of truth. Nếu ref chuyên sâu đổi nghĩa, cập nhật
  file chuyên sâu thay vì thêm ghi chú cạnh tranh ở đây.
- Không giữ ref đã bị thay thế. Promote rule hiện hành vào file canonical hoặc
  xóa ghi chú cũ; git history là archive.
