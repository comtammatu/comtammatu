# Bối cảnh nghiệp vụ — Doanh nghiệp Cơm Tấm Má Tư

> Last verified: 2026-07-27.

## Sản phẩm và chủ thể

**Bộ phần mềm quản lý vận hành và bán hàng** cho doanh nghiệp F&B vận hành
Cơm Tấm Má Tư theo loại hình **công ty cổ phần**, single-tenant,
multi-branch.

Tên pháp lý, mã số doanh nghiệp/mã số thuế, địa chỉ trụ sở và người đại diện
theo pháp luật phải lấy từ hồ sơ đăng ký thực tế của `tenant`; không suy từ
tên thương hiệu và không hardcode trong ứng dụng.

Hierarchy vận hành:

```text
Tenant (L0, doanh nghiệp) → Branch (L1, địa điểm vận hành)
```

`Branch` là phạm vi vận hành, không phải pháp nhân riêng. Tài sản, tiền, tồn
kho, công nợ, thuế và lợi nhuận của công ty tách khỏi tài sản cá nhân của cổ
đông.

## Ranh giới vai trò pháp lý

- `owner` là application role có quyền điều hành hệ thống; không tự đồng nghĩa
  với cổ đông, người đại diện theo pháp luật, Chủ tịch HĐQT hoặc Giám đốc.
- `tenants.representative` là dữ liệu người đại diện theo pháp luật trên chứng
  từ; không đồng bộ tự động với `owner_user_id`.
- Cổ đông góp vốn là giao dịch vốn chủ sở hữu, không phải doanh thu.
- Cổ tức là phân phối lợi nhuận sau thuế theo quyết định hợp lệ, không phải chi
  phí vận hành hoặc khoản rút tiền tùy ý.
- Thẩm quyền ký, phê duyệt và giao dịch với bên liên quan phải theo Điều lệ và
  ma trận ủy quyền đã được công ty phê duyệt.

## Ranh giới Finance

Finance hiện là **tài chính vận hành**, không phải sổ cái hoặc báo cáo tài chính:

- Nhập hàng: tăng tồn kho và công nợ/giảm tiền; chưa tự động là chi phí kỳ.
- Thanh toán NCC: giảm tiền và công nợ; không tạo chi phí lần hai.
- Giá trị tồn kho cuối kỳ là tài sản, không cộng/trừ trực tiếp vào kết quả.
- Bán/tiêu hao đã duyệt mới chuyển giá trị liên quan vào giá vốn.
- Hao hụt, hư hỏng, giảm giá được ghi nhận theo chứng từ điều chỉnh phù hợp.

```text
Kết quả vận hành
= Doanh thu thuần - Giá vốn món - Chi phí vận hành đã ghi nhận
```

Chỉ dùng **lợi nhuận sau thuế TNDN** khi kỳ đã có đầy đủ doanh thu, giá vốn,
chi phí, kết quả tài chính/khác, thuế TNDN, bút toán phân bổ và khóa sổ:

```text
Lợi nhuận sau thuế TNDN
= Doanh thu thuần
- Giá vốn
- Chi phí vận hành
+/- Kết quả tài chính và kết quả khác
- Thuế TNDN
```

## Nghĩa vụ chính

- Đăng ký doanh nghiệp, chủ sở hữu hưởng lợi, cổ đông và người đại diện theo
  pháp luật theo hồ sơ hiện hành.
- HĐĐT từ máy tính tiền cho hoạt động ăn uống/nhà hàng theo khung hiệu lực từ
  01/07/2026; giữ snapshot hóa đơn bất biến.
- GTGT theo phương pháp doanh nghiệp đã đăng ký; thuế suất theo từng hàng
  hóa/dịch vụ và ngày hiệu lực, không có một mức mặc định cho toàn công ty.
- TNDN theo thu nhập tính thuế và điều kiện ưu đãi thực tế; không suy từ UI.
- Chọn và áp dụng chế độ kế toán doanh nghiệp phù hợp; Finance vận hành chỉ
  xuất dữ liệu hỗ trợ cho tới khi có contract sổ kế toán đầy đủ.
- HĐLĐ, BHXH/BHYT/BHTN, khấu trừ TNCN tiền lương và mức lương tối thiểu theo
  hồ sơ người lao động.

Nguồn pháp lý: [legal-framework-2026.md](legal-framework-2026.md). Chi tiết
thuế/HĐĐT: [einvoice-tax.md](einvoice-tax.md).
