# Khung pháp lý 2026 — Hộ Kinh Doanh (sổ đăng ký)

> Last verified: 2026-07-08.
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

## 1.1. Quản lý thuế

| Văn bản | Hiệu lực | Nội dung | Áp dụng ở |
| --- | --- | --- | --- |
| Luật Quản lý thuế 108/2025/QH15 | 01/07/2026 | Luật Quản lý thuế mới, nền cho quản lý kê khai/nộp thuế và HĐĐT/chứng từ điện tử | `einvoice-tax.md`, `business-context.md` |
| NĐ 252/2026/NĐ-CP | 01/07/2026 | Quy định chi tiết Luật Quản lý thuế 108/2025/QH15 | `einvoice-tax.md` §6 |

## 2. Thuế GTGT

| Văn bản | Hiệu lực | Nội dung | Áp dụng ở |
| --- | --- | --- | --- |
| Luật Thuế GTGT 48/2024/QH15 | — | Luật GTGT hiện hành | `einvoice-tax.md` |
| NQ 204/2025/QH15 + NĐ 174/2025/NĐ-CP | 01/07/2025 – 31/12/2026 | Giảm GTGT theo gói kích cầu; **hết hạn quay về mức gốc nếu không gia hạn**. Mức suất cụ thể cho dịch vụ ăn uống: xem `einvoice-tax.md` | `einvoice-tax.md` |

## 3. Hóa đơn điện tử (HĐĐT)

| Văn bản | Hiệu lực | Nội dung | Áp dụng ở |
| --- | --- | --- | --- |
| ~~NĐ 123/2020/NĐ-CP (sửa bởi NĐ 70/2025)~~ | **HẾT HIỆU LỰC 01/07/2026** (Điều 43.2 NĐ 254/2026) | HĐĐT khởi tạo từ máy tính tiền kết nối CQT; HKD doanh thu ≥ 1 tỷ/năm bán lẻ trực tiếp (gồm ăn uống) **bắt buộc** — nội dung này chuyển sang NĐ 254/2026 | `einvoice-tax.md` |
| [NĐ 254/2026/NĐ-CP](https://vanban.chinhphu.vn/?docid=218689&pageid=27160&typegroupid=4) | 01/07/2026 (thay NĐ 123/2020 + NĐ 70/2025) | Hướng dẫn Luật Quản lý thuế 108/2025/QH15 về HĐĐT/chứng từ điện tử. **Phụ lục mục 4b: khách lẻ không cung cấp tên/địa chỉ/số định danh → HĐ ghi "Bán cho người tiêu dùng"** (thay "Người mua không lấy hóa đơn"); HĐ không có thông tin người mua không dùng hạch toán chi phí/quyết toán thuế. [Bộ Tài chính trả lời ngày 23/07/2026](https://nif.mof.gov.vn/hoidapcstc/home/cthoidap/163784): với dịch vụ, thời điểm lập hóa đơn là khi hoàn thành hoặc khi thu tiền nếu thu trước/trong quá trình cung cấp; không có căn cứ về khoảng chờ hai giờ trong bằng chứng này | `einvoice-tax.md` §3 |
| TT 32/2025/TT-BTC | thay TT 78/2021 từ 01/06/2025 | Quy định HĐĐT | `einvoice-tax.md` |

## 4. Kế toán HKD

| Văn bản | Hiệu lực | Nội dung | Áp dụng ở |
| --- | --- | --- | --- |
| TT 152/2025/TT-BTC | thay TT 88/2021 từ 01/01/2026 | Chế độ kế toán HKD, sổ tổ chức theo nhóm doanh thu; export hệ thống phải đối chiếu được | `business-context.md`, `modules/finance.md` |

## 5. Thuế TNCN

| Văn bản | Hiệu lực | Nội dung | Áp dụng ở |
| --- | --- | --- | --- |
| Luật Thuế TNCN 109/2025/QH15 | Hiệu lực chung 01/07/2026; **quy định về thu nhập tiền lương/kinh doanh áp dụng từ kỳ tính thuế 2026 = 01/01/2026** | Biểu thuế lũy tiến **5 bậc** | `payroll-pit.md` §2 |
| NĐ 253/2026/NĐ-CP | 01/07/2026 | Quy định chi tiết Luật Thuế TNCN 109/2025/QH15; chốt chuyển tiếp kỳ 2026, khoản tiền ăn ca/trưa, người phụ thuộc, quyết toán/khấu trừ | `payroll-pit.md` |
| TT 87/2026/TT-BTC | 01/07/2026 | Hướng dẫn Luật Thuế TNCN và NĐ 253/2026; người phụ thuộc có thu nhập bình quân tháng không quá **3 triệu**; hồ sơ người phụ thuộc phải lưu để thanh tra/kiểm tra | `payroll-pit.md` |
| NQ 110/2025/UBTVQH15 | từ kỳ tính thuế 2026 (01/01/2026) | Giảm trừ gia cảnh **15,5tr bản thân / 6,2tr người phụ thuộc** | `payroll-pit.md`, `glossary.md` |

> **Hiệu lực biểu 5 bậc:** theo Luật 109/2025/QH15, biểu 5 bậc + giảm trừ mới áp
> dụng cho **cả kỳ tính thuế 2026 (từ 01/01/2026)**, không phải chỉ từ 01/07/2026.
> `legal-versions.ts` dùng `PIT_BRACKETS_2026` cho mọi kỳ từ 01/01/2026.

## 6. Lao động / BHXH

| Văn bản | Hiệu lực | Nội dung | Áp dụng ở |
| --- | --- | --- | --- |
| Luật BHXH 41/2024/QH15 + NĐ 158/2025 | chủ hộ KD kê khai thuế: BHXH bắt buộc từ 01/07/2025 (HKD khác: từ 01/07/2029) | Đối tượng + chế độ BHXH; chủ hộ tự đóng BHXH **25%** (3% ốm đau-thai sản + 22% hưu trí-tử tuất) + BHYT **4,5%** | `labor-contracts.md`, `payroll-pit.md` |
| NĐ 73/2024/NĐ-CP | 01/07/2024 – **30/06/2026** | Lương cơ sở 2,34tr → **trần BHXH 46,8tr/tháng** (20× lương cơ sở) | `payroll-pit.md`, `labor-contracts.md` |
| **NĐ 161/2026/NĐ-CP** (15/05/2026) | **01/07/2026** | **Lương cơ sở 2,34tr → 2,53tr** → **trần BHXH 46,8tr → 50,6tr/tháng** (20× lương cơ sở) | `payroll-pit.md`, `labor-contracts.md` |
| NĐ 293/2025/NĐ-CP | 01/01/2026 | Lương tối thiểu vùng mới (Vùng I 5.310.000 / Vùng II 4.730.000) | `labor-contracts.md` |

## Đồng bộ với mã nguồn

- Payroll engine `packages/shared/src/payroll/legal-versions.ts` được version theo
  `effectiveFrom`. Giảm trừ **15,5tr/6,2tr** áp dụng từ 01/01/2026 (NQ 110/2025).
  Trần BHXH bước theo NĐ 161/2026: version `2026-01-01` giữ `insuranceCap:
  46_800_000` (đến 30/06/2026), version `2026-07-01` nâng lên `insuranceCap:
  50_600_000` (lương cơ sở 2,53tr). Hai version này khác nhau **chỉ ở** `insuranceCap`.
- Biểu PIT: code tính **mọi kỳ từ 2026-01** bằng **5 bậc** (`PIT_BRACKETS_2026`),
  cả version `2026-01-01` lẫn `2026-07-01`. Kỳ ≤ 2025 (version `effectiveFrom` ≤
  `2024-07-01`) giữ 7 bậc cũ để quyết toán tái lập được. Test khoá:
  `packages/shared/src/payroll/__tests__/legal-versions.test.ts`; quy tắc
  regression `PAYROLL-2026-FIVE-BRACKET-AND-BHXH-CAP-STEP` (`tasks/regressions.md`).
  > **Lưu ý kế toán (không phải lỗi code):** mức khấu trừ hàng tháng H1-2026 có thể
  > chọn giữ biểu 7 bậc cũ chờ ngày hiệu lực chung 01/07 rồi true-up khi quyết
  > toán — nghĩa vụ cả năm không đổi. Nếu kế toán chọn vậy thì trỏ version
  > `2026-01-01` về `PIT_BRACKETS_2007` (một dòng), không đổi giảm trừ/trần.
- Mã số thuế HKD + pháp danh nằm ở `tenants.tax_code` / `tenants.legal_name`
  (dùng cho HĐĐT `sellerName` + chứng từ in). Không hardcode trong code app.
- Từ 01/07/2026, `payroll-pit.md` dùng NĐ 253/2026 + TT 87/2026 cho hai ngưỡng
  nghiệp vụ mới: tiền ăn ca/trưa chi bằng tiền chỉ tính thuế phần vượt
  1,2tr/người/tháng; người phụ thuộc có thu nhập bình quân tháng trong năm
  không quá 3tr.
