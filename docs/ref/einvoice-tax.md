# HĐĐT, thuế GTGT và thuế TNDN — Doanh nghiệp

> Áp dụng cho doanh nghiệp F&B loại hình công ty cổ phần.
> Last verified: 2026-07-27.

## 1. Ranh giới chứng từ

| Bề mặt | Ý nghĩa | Nguồn sự thật |
| --- | --- | --- |
| `/finance/invoices` | HĐĐT bán ra theo đơn | `tax_invoices` + Viettel S-invoice |
| `/finance/supplier-invoices` | Hóa đơn đầu vào, đối chiếu GRN và công nợ NCC | `supplier_invoices` |

Nhập hóa đơn NCC không tự động tạo chi phí; thanh toán NCC không tạo chi phí
lần hai. Giá trị hàng còn trong kho là tài sản. Việc ghi nhận giá vốn/chi phí,
GTGT đầu vào được khấu trừ và kỳ hạch toán phải theo chính sách kế toán đã chọn.

## 2. Thuế GTGT

- Không có `vatRate = 0` mặc định cho toàn doanh nghiệp.
- Mức luật định gồm 0%, 5%, 10%; hàng hóa/dịch vụ đủ điều kiện từ mức 10% được
  giảm còn 8% đến hết 31/12/2026 theo NQ 204/2025 và NĐ 174/2025.
- Điều kiện giảm và loại trừ xác định theo từng hàng hóa/dịch vụ, ngày giao
  dịch và hồ sơ thực tế. Đồ ăn, đồ uống, bia/rượu, phí dịch vụ, voucher, giao
  hàng và khuyến mại không được mặc định chung một mức.
- `menu_items.vat_rate` là cấu hình nghiệp vụ theo ma trận đã được kế toán
  duyệt; `order_items.vat_rate` là snapshot bất biến tại lúc bán.
- Phương pháp khấu trừ hay trực tiếp là cấu hình pháp lý cấp doanh nghiệp, không
  suy từ doanh thu, schema hoặc template có sẵn.
- Với phương pháp khấu trừ, VAT đầu ra là khoản phải nộp; VAT đầu vào chỉ được
  khấu trừ khi đủ điều kiện hóa đơn/chứng từ/thanh toán. Không coi VAT là doanh
  thu hoặc lãi.

## 3. HĐĐT từ máy tính tiền

Khung hiện hành từ 01/07/2026 là Luật 108/2025, NĐ 252/2026, NĐ 254/2026,
TT 90/2026 và TT 91/2026. Hoạt động ăn uống/nhà hàng thuộc nhóm bán trực tiếp
cho người tiêu dùng dùng HĐĐT từ máy tính tiền kết nối CQT.

Luồng sản phẩm giữ nguyên nguyên tắc:

```text
Payment hoàn tất
→ snapshot bất biến seller, branch, buyer, dòng món, thuế, tổng tiền, paid_at
→ phát hành/đối soát qua provider
→ hủy, điều chỉnh hoặc thay thế bằng workflow riêng
```

Hóa đơn đã phát hành không được dựng lại từ menu hoặc cấu hình hiện tại. Thay
đổi thuế suất/template/series chỉ áp dụng giao dịch mới. Provider response chưa
rõ phải đối soát bằng cùng idempotency identity, không tự phát hành hóa đơn mới.

### Dữ liệu dòng bắt buộc

- tên hàng hóa/dịch vụ thực;
- đơn vị tính, số lượng, đơn giá và chiết khấu;
- thuế suất/căn cứ thuế theo dòng khi phương pháp/template yêu cầu;
- tổng trước thuế, VAT và tổng thanh toán reconcile theo rounding đã duyệt;
- source order/payment, seller/buyer snapshot, thời điểm hóa đơn;
- template, series, provider reference, số hóa đơn và mã CQT/retrieval data.

Một đơn có thể có nhiều mức thuế. Không reverse-split toàn hóa đơn bằng một
`invoice_vat_rate`; tổng VAT là tổng số VAT đã làm tròn theo từng dòng/nhóm
thuế theo fixture provider được duyệt.

## 4. Hóa đơn đầu vào

Trước khi đưa vào export kế toán/khấu trừ:

1. Nhà cung cấp, số hóa đơn và thông tin người mua khớp hồ sơ doanh nghiệp.
2. Hàng thực nhận được đối chiếu với GRN/PO nếu có.
3. Số lượng, đơn giá, tổng tiền, thuế suất và VAT khớp chứng từ.
4. Điều kiện thanh toán không dùng tiền mặt và điều kiện khấu trừ khác được
   kiểm tra theo pháp luật áp dụng.
5. Kỳ ghi nhận, giá trị vào tồn kho/tài sản/chi phí và công nợ được xác định.

Hóa đơn đầu vào có nhiều mức thuế lưu một breakdown bất biến theo từng mức:
giá trị trước VAT và tiền VAT đúng như chứng từ. Tổng `subtotal`, `vat_amount`
và `total_amount` được suy ra từ breakdown; không dùng một thuế suất đại diện
để tính ngược toàn hóa đơn.

`is_vat_deductible` chỉ là kết quả phân loại có bằng chứng, không phải checkbox
mặc định.

## 5. Thuế TNDN

Thuế TNDN dựa trên thu nhập tính thuế, không phải doanh thu POS hoặc số dư tiền.
Theo pháp luật tại mốc kiểm tra, doanh nghiệp có thể thuộc diện miễn hoặc mức
15%, 17%, 20% tùy doanh thu, quan hệ liên kết và điều kiện ưu đãi. Công ty đăng
ký lần đầu và đáp ứng điều kiện doanh nghiệp nhỏ và vừa có thể được miễn ba năm.

Không hardcode ưu đãi. Finance chỉ hiển thị `thuế TNDN ước tính` khi có version
quy tắc, nguồn dữ liệu và trạng thái `estimated`. Chỉ hiển thị **lợi nhuận sau
thuế TNDN** sau kỳ kế toán đầy đủ và khóa sổ.

## 6. Nguồn pháp lý

Danh mục văn bản và ngày hiệu lực:
[legal-framework-2026.md](legal-framework-2026.md).
