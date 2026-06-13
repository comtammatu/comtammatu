# Khung pháp lý 2026 — Hộ Kinh Doanh (sổ đăng ký)

> Last verified: 2026-06-13.
>
> **SSoT** cho danh mục văn bản pháp lý áp dụng cho Cơm Tấm Má Tư (HKD). Các doc
> khác (`business-context.md`, `einvoice-tax.md`, `payroll-pit.md`,
> `labor-contracts.md`, `glossary.md`) THAM CHIẾU file này thay vì lặp lại bảng
> luật. Khi một văn bản thay đổi, sửa ở đây trước rồi mới chỉnh doc chuyên đề.
>
> File này chỉ liệt kê **căn cứ + hiệu lực + tác động**. Cách áp dụng chi tiết
> (công thức, cấu hình, DDL) nằm ở doc chuyên đề (cột "Áp dụng ở").

## 1. Đăng ký & mô hình thuế HKD

| Văn bản | Hiệu lực | Nội dung | Áp dụng ở |
| --- | --- | --- | --- |
| NĐ 168/2025/NĐ-CP | — | Đăng ký và mã số hộ kinh doanh | `business-context.md` |
| NQ 198/2025/QH15 | 01/01/2026 | Bỏ thuế khoán + miễn lệ phí môn bài cho HKD/CNKD | `business-context.md`, `einvoice-tax.md` |
| NĐ 68/2026/NĐ-CP | 05/03/2026 | Phân HKD thành 4 nhóm doanh thu (nghĩa vụ sổ sách/kê khai khác nhau) | `einvoice-tax.md` §1 |
| NĐ 141/2026/NĐ-CP | 29/04/2026 (hồi tố 01/01/2026) | Nâng ngưỡng doanh thu không chịu GTGT/TNCN của HKD lên **1 tỷ/năm** | `einvoice-tax.md` |

## 2. Thuế GTGT

| Văn bản | Hiệu lực | Nội dung | Áp dụng ở |
| --- | --- | --- | --- |
| Luật Thuế GTGT 48/2024/QH15 | — | Luật GTGT hiện hành | `einvoice-tax.md` |
| NQ 204/2025/QH15 + NĐ 174/2025/NĐ-CP | 01/07/2025 – 31/12/2026 | Giảm GTGT theo gói kích cầu; **hết hạn quay về mức gốc nếu không gia hạn**. Mức suất cụ thể cho dịch vụ ăn uống: xem `einvoice-tax.md` | `einvoice-tax.md` |

## 3. Hóa đơn điện tử (HĐĐT)

| Văn bản | Hiệu lực | Nội dung | Áp dụng ở |
| --- | --- | --- | --- |
| NĐ 123/2020/NĐ-CP (sửa bởi NĐ 70/2025) | Máy tính tiền từ 01/06/2025 | HĐĐT khởi tạo từ máy tính tiền kết nối CQT; HKD doanh thu ≥ 1 tỷ/năm bán lẻ trực tiếp (gồm ăn uống) **bắt buộc** | `einvoice-tax.md` |
| TT 32/2025/TT-BTC | thay TT 78/2021 từ 01/06/2025 | Quy định HĐĐT | `einvoice-tax.md` |

## 4. Kế toán HKD

| Văn bản | Hiệu lực | Nội dung | Áp dụng ở |
| --- | --- | --- | --- |
| TT 152/2025/TT-BTC | thay TT 88/2021 từ 01/01/2026 | Chế độ kế toán HKD, sổ tổ chức theo nhóm doanh thu; export hệ thống phải đối chiếu được | `business-context.md`, `modules/finance.md` |

## 5. Thuế TNCN

| Văn bản | Hiệu lực | Nội dung | Áp dụng ở |
| --- | --- | --- | --- |
| Luật Thuế TNCN 109/2025/QH15 | 01/07/2026 (biểu 5 bậc từ kỳ tính thuế 2026) | Biểu thuế lũy tiến **5 bậc** | `payroll-pit.md` §2 |
| NQ 110/2025/UBTVQH15 | từ kỳ tính thuế 2026 (01/01/2026) | Giảm trừ gia cảnh **15,5tr bản thân / 6,2tr người phụ thuộc** | `payroll-pit.md`, `glossary.md` |

## 6. Lao động / BHXH

| Văn bản | Hiệu lực | Nội dung | Áp dụng ở |
| --- | --- | --- | --- |
| Luật BHXH 41/2024/QH15 + NĐ 158/2025 | chủ hộ KD kê khai thuế: BHXH bắt buộc từ 01/07/2025 | Đối tượng + chế độ BHXH | `labor-contracts.md`, `payroll-pit.md` |
| NĐ 73/2024/NĐ-CP | 01/07/2024 | Lương cơ sở 2,34tr → **trần BHXH 46,8tr/tháng** (20× lương cơ sở) | `payroll-pit.md`, `labor-contracts.md` |
| NĐ 293/2025/NĐ-CP | 01/01/2026 | Lương tối thiểu vùng mới | `labor-contracts.md` |

## Đồng bộ với mã nguồn

- Payroll engine `packages/shared/src/payroll/legal-versions.ts` được version theo
  `effectiveFrom`. Giảm trừ **15,5tr/6,2tr** + trần BHXH **46,8tr** áp dụng từ
  01/01/2026 (NQ 110/2025).
- Biểu PIT: kỳ **2026-01 → 2026-06** tính **7 bậc** (`PIT_BRACKETS_2007`); kỳ
  **≥ 2026-07** tính **5 bậc** (`PIT_BRACKETS_2026`, version `effectiveFrom:
  2026-07-01`) theo Luật 109/2025/QH15 — owner xác nhận hiệu lực 01/07/2026.
  Test khoá: `packages/shared/src/payroll/__tests__/legal-versions.test.ts`.
- Mã số thuế HKD + pháp danh nằm ở `tenants.tax_code` / `tenants.legal_name`
  (dùng cho HĐĐT `sellerName` + chứng từ in). Không hardcode trong code app.
