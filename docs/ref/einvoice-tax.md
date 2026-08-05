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

Với phương pháp khấu trừ, chỉ dùng công thức sau khi đã khóa đúng kỳ và
điều chỉnh:

```text
GTGT phải nộp
= GTGT đầu ra
- GTGT đầu vào được khấu trừ
+/- điều chỉnh của kỳ
```

Không dùng công thức này cho phương pháp trực tiếp. `GTGT đầu ra` là tổng VAT
trên giao dịch bán ra thuộc kỳ theo chứng từ hiệu lực; không phải toàn bộ tiền
khách trả. Hóa đơn hủy, điều chỉnh hoặc thay thế phải đi theo quan hệ chứng từ,
không cộng cả bản cũ và bản mới.

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

Từ 01/07/2025, hàng hóa/dịch vụ mua vào từ 5 triệu đồng trở lên, đã gồm VAT,
phải có chứng từ thanh toán không dùng tiền mặt để đáp ứng điều kiện liên quan.
Các lần mua cùng một người bán trong cùng ngày và trường hợp trả chậm/trả góp
phải kiểm tra theo quy định chi tiết hiện hành; không tách hóa đơn hoặc dùng
trạng thái `đã nhập` để suy ra đủ điều kiện.

Hóa đơn đầu vào có nhiều mức thuế lưu một breakdown bất biến theo từng mức:
giá trị trước VAT và tiền VAT đúng như chứng từ. Tổng `subtotal`, `vat_amount`
và `total_amount` được suy ra từ breakdown; không dùng một thuế suất đại diện
để tính ngược toàn hóa đơn.

Phải tách bốn trạng thái nghiệp vụ:

| Trạng thái | Ý nghĩa |
| --- | --- |
| `input_vat_recorded` | VAT đúng như hóa đơn đầu vào đã nhập. |
| `input_vat_pending_review` | Chưa đủ kiểm tra hồ sơ, mục đích sử dụng, thanh toán hoặc phân bổ. |
| `input_vat_deductible` | Phần VAT đã có bằng chứng đáp ứng điều kiện khấu trừ. |
| `input_vat_non_deductible` | Phần VAT không được khấu trừ theo kết luận có căn cứ. |

Schema hiện lưu breakdown VAT trên hóa đơn NCC (`supplier_invoices`) và trên
khoản chi phí vận hành (`expenses.vat_breakdown`). Cả hai đều chỉ là
`input_vat_recorded`. Chưa có trạng thái, bằng chứng thanh toán/kê khai đủ,
phân bổ dùng chung, kỳ kê khai hoặc điều chỉnh để kết luận
`input_vat_deductible`; vì vậy UI không được gọi VAT đã nhập là **GTGT được
khấu trừ** hay tính **GTGT phải nộp**.

## 5. Thiết bị, công cụ và VAT đầu vào

Mua thiết bị không tự động là chi phí vận hành của kỳ:

- Thiết bị đồng thời có lợi ích kinh tế trong tương lai, thời gian sử dụng trên
  một năm và nguyên giá xác định tin cậy từ 30 triệu đồng là TSCĐ. Ghi nhận
  nguyên giá tài sản; chỉ khấu hao kỳ được phân bổ vào chi phí sản xuất, kinh
  doanh theo nơi sử dụng.
- Thiết bị không đủ cả ba tiêu chí là công cụ/vật dụng. Giá trị được ghi trực
  tiếp hoặc phân bổ dần vào chi phí theo chính sách kế toán và tính trọng yếu;
  vẫn có thể cần theo dõi hiện vật.
- Vật tư tiêu hao dùng trong kỳ mới là chi phí vận hành trực tiếp phù hợp.
- VAT đầu vào đủ điều kiện khấu trừ được theo dõi riêng, không cộng vào nguyên
  giá. VAT không được khấu trừ chỉ đưa vào nguyên giá/chi phí khi cách xử lý đó
  phù hợp pháp luật và chính sách kế toán đã chọn.

Finance hiện chưa có sổ TSCĐ/công cụ, ngày đưa vào sử dụng, nguyên giá, thời
gian phân bổ, khấu hao lũy kế hoặc giá trị còn lại. Do đó chưa hiển thị **Giá
trị thiết bị** như một số tài sản đáng tin cậy.

## 6. Thuế TNDN

Thuế TNDN dựa trên thu nhập tính thuế, không phải doanh thu POS hoặc số dư tiền.
Theo pháp luật tại mốc kiểm tra, doanh nghiệp có thể thuộc diện miễn hoặc mức
15%, 17%, 20% tùy doanh thu, quan hệ liên kết và điều kiện ưu đãi. Công ty đăng
ký lần đầu và đáp ứng điều kiện doanh nghiệp nhỏ và vừa có thể được miễn ba năm.

Không hardcode ưu đãi. Finance chỉ hiển thị `thuế TNDN ước tính` khi có version
quy tắc, nguồn dữ liệu và trạng thái `estimated`. Chỉ hiển thị **lợi nhuận sau
thuế TNDN** sau kỳ kế toán đầy đủ và khóa sổ.

## 7. Nguồn pháp lý

Danh mục văn bản và ngày hiệu lực:
[legal-framework-2026.md](legal-framework-2026.md).
