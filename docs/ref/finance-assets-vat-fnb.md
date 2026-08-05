# Tài chính, tài sản, GTGT và lợi nhuận cho CTCP Chén Sứ

> Kiểm tra pháp lý và hiện trạng hệ thống: 2026-07-30
> (Asia/Ho_Chi_Minh).
>
> Tài liệu này là khung nghiệp vụ và định hướng sản phẩm dành cho Công ty Cổ
> phần Chén Sứ hoạt động F&B. Đây không phải tư vấn kế toán, thuế hoặc pháp lý.
> Phương pháp GTGT, chế độ kế toán, chính sách vốn hóa, thời gian khấu hao,
> phân bổ CCDC và thuế suất/ưu đãi TNDN phải được người đại diện, kế toán và tư
> vấn của Công ty xác nhận theo hồ sơ thực tế trước khi cấu hình Production.

## 1. Nhận định cuối

1. Thiết bị và dụng cụ phải có **một sổ “Tài sản & công cụ” cấp Công ty**.
   Đề xuất đặt sổ này tại `Tài chính > Tài sản & công cụ`. Chi nhánh chỉ là nơi
   giữ, sử dụng hoặc chịu chi phí; không phải chủ sở hữu pháp lý của tài sản.
2. Inventory tiếp tục quản lý nguyên liệu, bao bì, hàng hóa, vật tư và phụ tùng
   tồn kho. Không biến mọi máy móc, bàn ghế, máy POS hoặc dụng cụ bếp thành tồn
   kho nguyên liệu.
3. Mua thiết bị không tự động là chi phí vận hành. Khoản mua phải được phân
   loại thành TSCĐ, CCDC/chi phí chờ phân bổ, chi phí kỳ, hàng tồn kho, tài sản
   dở dang hoặc tài sản thuê/mượn trước khi tham gia kết quả.
4. GTGT đầu vào phải đi qua các trạng thái độc lập:
   **đã ghi nhận → chờ kiểm tra → đủ/không đủ điều kiện khấu trừ → đã đưa vào
   kỳ kê khai/đã điều chỉnh**. Có hóa đơn hoặc đã thanh toán chưa đồng nghĩa
   được khấu trừ.
5. GTGT đầu ra lấy từ hóa đơn đầu ra có hiệu lực, không lấy thẳng từ tiền thu
   hoặc tổng giá thanh toán. Hóa đơn MTT là một kênh phát hành; loại chứng từ và
   nội dung pháp lý của hóa đơn mới quyết định cách xử lý.
6. Card tổng hợp chỉ được ghi:

   ```text
   GTGT tạm tính
   = GTGT đầu ra trong kỳ
   - GTGT đầu vào đủ điều kiện đã đưa vào kỳ
   ± điều chỉnh được duyệt
   ```

   Khi thiếu kỳ khai, chứng từ, trạng thái khấu trừ hoặc điều chỉnh, card phải
   hiển thị `Chưa đủ dữ liệu`, không được gọi là `GTGT phải nộp`.
7. Công thức vận hành hiện tại chỉ tạo **Kết quả kinh doanh**. Chỉ được hiển thị
   **Lợi nhuận sau thuế** sau khi có giá vốn đầy đủ, khấu hao/phân bổ, kết quả
   tài chính, thu nhập/chi phí khác, đối chiếu thuế TNDN và khóa sổ kỳ.
8. Không hard-code thuế suất TNDN 15%, 17% hoặc 20%, cũng không tự bật miễn hay
   ưu đãi. Hệ thống chỉ dùng chính sách có ngày hiệu lực đã được kế toán duyệt.

## 2. Bốn lớp dữ liệu không được trộn

| Lớp | Trả lời câu hỏi | Ví dụ | Không được suy ra |
| --- | --- | --- | --- |
| Vận hành | Hôm nay bán, xuất kho, chi và thu thế nào? | Đơn hàng, tiêu hao nguyên liệu, chi phí điện nước | Nghĩa vụ thuế cuối kỳ hoặc BCTC đầy đủ |
| Tài sản và custody | Công ty đang sở hữu/kiểm soát gì, ở đâu, ai giữ? | Lò nướng, tủ đông, máy POS, bộ chén đĩa | TSCĐ chỉ từ tên món hàng hoặc giá mua |
| GTGT và hồ sơ thuế | Thuế nào đã ghi nhận, đủ điều kiện, thuộc kỳ nào? | Hóa đơn GTGT, chứng từ thanh toán, điều chỉnh | Khấu trừ chỉ từ file đính kèm hoặc trạng thái đã trả tiền |
| Kế toán và khóa sổ | Giá trị nào lên BCTC và lợi nhuận kỳ? | Nguyên giá, khấu hao, giá vốn, TNDN | Lợi nhuận từ dòng tiền hoặc số dư tồn kho |

Một giao dịch có thể tạo dữ liệu ở nhiều lớp nhưng mỗi lớp giữ một sự thật
riêng. Ví dụ mua tủ đông:

```text
Nhận tủ đông         → custody ghi đang ở Chi nhánh A
Nhận hóa đơn         → công nợ NCC + GTGT đầu vào đã ghi nhận
Kế toán phân loại    → TSCĐ/CCDC/chi phí kỳ
Thanh toán NCC       → giảm tiền + giảm công nợ
Đưa vào sử dụng      → bắt đầu lịch khấu hao/phân bổ theo policy
```

Không bước nào cho phép hệ thống tự kết luận tất cả các bước còn lại đã hợp lệ.

## 3. Phạm vi pháp nhân Công ty và chi nhánh

- CTCP Chén Sứ là chủ thể sở hữu tài sản, ghi nhận công nợ, doanh thu, chi phí,
  GTGT và TNDN.
- Chi nhánh/site là chiều phân tích vận hành: nơi đặt tài sản, người giữ, trung
  tâm chi phí, nơi tạo doanh thu hoặc nơi hưởng lợi.
- Điều chuyển thiết bị giữa hai chi nhánh trong cùng Công ty chỉ đổi custody và
  địa điểm. Nó không tạo doanh thu, giá vốn, GTGT đầu ra hoặc chi phí mới.
- Không nhân đôi một tài sản dùng chung cho từng chi nhánh. Một tài sản có thể
  có một custodian và một quy tắc phân bổ lợi ích/chi phí riêng.
- Tài sản do cổ đông, người sáng lập hoặc nhân viên đứng tên không tự động trở
  thành tài sản của Công ty. Cần hồ sơ góp vốn, chuyển giao, mua bán, cho thuê,
  cho mượn hoặc hoàn ứng hợp pháp; quyền khấu trừ GTGT cũng phải xét theo chứng
  từ của Công ty.
- Nếu một đơn vị trực thuộc có đăng ký, kê khai hoặc xuất hóa đơn riêng, đó là
  cấu hình pháp lý phải được xác nhận; không suy ra chỉ từ việc có `branch_id`.

## 4. Phân loại thiết bị, dụng cụ và khoản đầu tư

### 4.1 Cây quyết định tối thiểu

```text
Khoản mua có giữ lại để bán, chế biến hoặc tiêu hao?
├─ Có → Hàng tồn kho/vật tư/phụ tùng, theo Inventory
└─ Không
   ├─ Công trình hoặc hệ thống chưa nghiệm thu, chưa sẵn sàng sử dụng?
   │  └─ Có → Chi phí đầu tư/xây dựng dở dang
   └─ Đã sẵn sàng sử dụng
      ├─ Đủ đồng thời tiêu chí TSCĐ?
      │  ├─ Có → TSCĐ
      │  └─ Không
      │     ├─ Mang lại lợi ích qua nhiều kỳ?
      │     │  ├─ Có → CCDC/chi phí chờ phân bổ
      │     │  └─ Không → Chi phí kỳ
      │     └─ Thuê/mượn, không thuộc Công ty?
      │        └─ Theo dõi quyền sử dụng và custody riêng
```

Theo khung TSCĐ hiện hành được Bộ Tài chính xác nhận tiếp tục hiệu lực trong
năm 2026, một tư liệu lao động hữu hình chỉ là TSCĐ khi đồng thời:

1. Chắc chắn thu được lợi ích kinh tế trong tương lai;
2. Có thời gian sử dụng trên một năm;
3. Nguyên giá xác định tin cậy và từ 30.000.000 đồng trở lên.

Mốc 30 triệu không phải quy tắc duy nhất. Thiết bị 50 triệu chưa chắc là TSCĐ
nếu không thuộc quyền/kiểm soát của Công ty hoặc chưa sẵn sàng sử dụng; thiết
bị 10 triệu vẫn có thể cần gắn mã và kiểm kê dù được ghi nhận là CCDC.

Một hệ thống gồm nhiều bộ phận phụ thuộc chức năng phải được xét theo bản chất
của hệ thống; không tách dòng hóa đơn chỉ để mỗi phần thấp hơn 30 triệu. Phần
cải tạo mặt bằng thuê cũng phải tách khỏi kết cấu thuộc chủ nhà và được phân
loại theo quyền trong hợp đồng, thời gian hưởng lợi và kết luận của kế toán.

### 4.2 Ví dụ F&B

| Khoản mục | Phân loại ban đầu cần xem xét | Cách ảnh hưởng kết quả |
| --- | --- | --- |
| Lò, tủ đông, hệ thống hút khói | TSCĐ hoặc tài sản dở dang trước nghiệm thu | Khấu hao sau khi sẵn sàng sử dụng |
| Máy POS, tablet, máy in bếp | TSCĐ, CCDC hoặc chi phí kỳ tùy hồ sơ | Khấu hao, phân bổ hoặc chi phí kỳ |
| Bàn ghế, kệ, quầy | TSCĐ/CCDC; có thể thuộc gói thi công | Không đưa toàn bộ vào chi phí khi thanh toán |
| Chén, đĩa, dao, thớt, nồi nhỏ | CCDC, chi phí chờ phân bổ hoặc chi phí kỳ | Phân bổ hoặc chi phí; vẫn có thể kiểm kê số lượng |
| Gas, hóa chất vệ sinh, khăn giấy | Vật tư/chi phí tiêu hao | Chi phí khi xuất dùng theo policy |
| Motor, bo mạch, linh kiện dự phòng | Phụ tùng tồn kho trước khi dùng | Vào sửa chữa hoặc vốn hóa khi sử dụng và được duyệt |
| Tiền cọc thuê mặt bằng | Khoản phải thu/đặt cọc | Không phải chi phí thuê ngay |
| Tiền sửa chữa thông thường | Chi phí sửa chữa | Chi phí theo kỳ được ghi nhận |
| Nâng cấp làm tăng công suất/tuổi thọ | Xem xét tăng nguyên giá | Khấu hao phần được vốn hóa |
| Thi công chi nhánh chưa nghiệm thu | Tài sản dở dang | Chưa khấu hao, chưa đẩy toàn bộ vào chi phí |

### 4.3 Nguyên giá được công nhận

```text
Nguyên giá được công nhận
= giá mua/phần việc đủ điều kiện vốn hóa sau giảm trừ
+ chi phí trực tiếp cần thiết để đưa tài sản vào trạng thái sẵn sàng sử dụng
+ GTGT không được khấu trừ nếu policy và pháp luật cho phép tính vào nguyên giá
- chiết khấu, giảm giá, tín dụng/hoàn trả liên quan
```

GTGT đủ điều kiện khấu trừ không nằm trong nguyên giá. GTGT không được khấu trừ
không phải lúc nào cũng được vốn hóa: kế toán phải duyệt nó vào nguyên giá hoặc
chi phí theo bản chất và hồ sơ; phần không đủ điều kiện vì vi phạm chứng từ
thanh toán không dùng tiền mặt không được hệ thống tự đưa vào chi phí/nguyên
giá.

## 5. Quản lý thiết bị, dụng cụ ở đâu

### 5.1 Kiến trúc thông tin đề xuất

| Bề mặt | Quyền sở hữu dữ liệu | Chức năng |
| --- | --- | --- |
| `Tài chính > Tài sản & công cụ` | Sổ Công ty | Phân loại, nguyên giá, VAT, ngày sử dụng, khấu hao/phân bổ, giá trị còn lại, thanh lý |
| Màn hình chi nhánh | View custody | Thiết bị đang giữ, tình trạng, người phụ trách, yêu cầu chuyển/sửa chữa, kiểm kê |
| Procurement/AP | Hồ sơ mua | Yêu cầu mua, PO, nhận hàng/nghiệm thu, hóa đơn NCC, công nợ, thanh toán |
| Inventory | Vật tư tồn kho | Nguyên liệu, bao bì, hàng hóa, vật tư và phụ tùng trước khi sử dụng |
| `Tài chính > GTGT` | Workpaper Công ty | Đầu ra, đầu vào, review khấu trừ, kỳ kê khai, điều chỉnh |

Chỉ có một `asset_id`. Màn hình chi nhánh không tạo một bản sao sổ tài sản; nó
hiển thị subset theo địa điểm/custodian và liên kết về hồ sơ Công ty.

### 5.2 Trường tối thiểu của sổ

| Nhóm | Dữ liệu tối thiểu |
| --- | --- |
| Định danh | Mã tài sản/công cụ, tên, nhóm, serial, tag/QR, ảnh |
| Chủ thể | Công ty sở hữu/kiểm soát, nguồn hình thành, quyền sở hữu/thuê/mượn |
| Nguồn chứng từ | Yêu cầu mua, PO, biên bản nhận/nghiệm thu, hóa đơn NCC, thanh toán |
| Custody | Site, khu vực, custodian, ngày bàn giao, tình trạng |
| Phân loại | Chờ duyệt, dở dang, TSCĐ, CCDC, chi phí kỳ, thuê/mượn |
| Giá trị | Giá trước thuế, GTGT ghi nhận, nguyên giá được duyệt, giảm trừ |
| Sử dụng | Ngày sẵn sàng, ngày đưa vào dùng, tạm ngừng, ngừng ghi nhận |
| Khấu hao/phân bổ | Policy, thời gian, giá trị còn lại, đích chi phí, posting đã duyệt |
| Thuế | Phần GTGT chờ/được/không được khấu trừ; khấu hao được trừ TNDN |
| Vòng đời | Chuyển, sửa chữa, nâng cấp, hỏng/mất, thu hồi, bán/thanh lý |

Các trục trạng thái phải độc lập:

```text
classification:
  pending_review | construction_in_progress | fixed_asset
  | tool_equipment | period_expense | leased_or_borrowed

evidence:
  incomplete | under_review | verified | rejected

service:
  not_ready | in_service | out_of_service | derecognized

VAT declaration:
  unassigned | draft | declared | adjusted
```

Không dùng một trạng thái `approved` để đại diện cho cả quyền sở hữu, nghiệm
thu, khấu trừ GTGT, vốn hóa và thanh toán.

## 6. Luồng đầy đủ từ mua đến thanh lý

| Bước | Hồ sơ/sự kiện | Ảnh hưởng | Gate bắt buộc |
| --- | --- | --- | --- |
| 1. Đề nghị mua | Nhu cầu, site, mục đích, ngân sách | Chưa có tài sản/chi phí/GTGT | Người có thẩm quyền duyệt |
| 2. Đặt mua | PO/hợp đồng | Có cam kết mua; chưa phải chi phí | NCC, điều khoản, scope rõ |
| 3. Nhận/nghiệm thu | GRN cho hàng tồn kho hoặc biên bản nghiệm thu tài sản/dịch vụ | Có custody hoặc khối lượng được chấp nhận | Không bắt dịch vụ/thi công giả làm GRN nguyên liệu |
| 4. Nhận hóa đơn | Hóa đơn NCC và line/khối lượng | Tăng công nợ; ghi GTGT đầu vào ban đầu | Kiểm tra loại chứng từ, người bán, người mua |
| 5. Review GTGT | Hóa đơn, mục đích dùng, thanh toán | Chia chờ/được/không được khấu trừ | Kế toán duyệt bằng số tiền |
| 6. Phân loại | Biên bản phân loại/capitalization | TSCĐ, CCDC, dở dang hoặc chi phí | Không suy ra từ category `supplies` |
| 7. Thanh toán | Payment và allocation | Giảm tiền, giảm công nợ | Không tạo chi phí mới |
| 8. Sẵn sàng sử dụng | Nghiệm thu, `placed_in_service_at` | Cho phép bắt đầu khấu hao/phân bổ | Không dùng ngày hóa đơn hoặc ngày trả tiền thay thế |
| 9. Khấu hao/phân bổ | Posting kỳ đã duyệt | Chi phí kỳ hoặc chi phí sản xuất | Có đích chi phí, không ghi hai lần |
| 10. Custody/kiểm kê | Bàn giao, chuyển, kiểm kê | Đổi nơi giữ/tình trạng | Không đổi nguyên giá hay tạo VAT |
| 11. Sửa/nâng cấp | Hồ sơ công việc | Chi phí sửa chữa hoặc tăng nguyên giá | Kế toán phân loại theo lợi ích tăng thêm |
| 12. Hỏng/mất | Biên bản sự cố, bồi thường/bảo hiểm | Sửa chữa, tổn thất hoặc ngừng ghi nhận | Tách khoản thu hồi khỏi tổn thất |
| 13. Bán/thanh lý | Quyết định, hóa đơn đầu ra, thu tiền | Ngừng khấu hao, ghi giảm tài sản, kết quả khác và GTGT nếu áp dụng | Không xóa lịch sử tài sản |

## 7. Luồng GTGT đầu vào

### 7.1 Năm giá trị cần phân biệt

1. `GTGT trên chứng từ`: số người bán thể hiện.
2. `GTGT đầu vào đã ghi nhận`: hệ thống đọc/nhập và lưu snapshot.
3. `GTGT chờ kiểm tra`: chưa đủ kết luận.
4. `GTGT đủ điều kiện khấu trừ`: kế toán đã duyệt theo hồ sơ.
5. `GTGT đã đưa vào kỳ kê khai`: số thực sự tham gia workpaper của một kỳ.

```text
GTGT đầu vào đã ghi nhận
= chờ kiểm tra
+ đủ điều kiện khấu trừ
+ không đủ điều kiện khấu trừ
```

Đây là phép đối chiếu số tiền, không phải một enum duy nhất. Một hóa đơn dùng
cho cả hoạt động chịu thuế và không chịu thuế có thể bị chia thành nhiều phần.

### 7.2 Checklist review khấu trừ

- Công ty áp dụng phương pháp GTGT nào trong kỳ?
- Chứng từ có phải hóa đơn GTGT hợp pháp hay chứng từ được pháp luật chấp nhận?
- Tên, mã số thuế và thông tin người mua có đúng hồ sơ Công ty?
- Hàng hóa/dịch vụ có phục vụ hoạt động chịu GTGT của Công ty?
- Hóa đơn có hiệu lực, không bị thay thế/hủy và đã xử lý sai sót nếu có?
- Giá trị, thuế suất, tiền thuế và line hàng có khớp hợp đồng/nghiệm thu?
- Giao dịch từ 5 triệu đồng trở lên có chứng từ thanh toán không dùng tiền mặt
  theo điều kiện hiện hành?
- Các lần mua cùng một người bán trong cùng ngày có phải cộng lại để xét ngưỡng
  thanh toán không dùng tiền mặt không?
- Với trả chậm/trả góp: đã đến hạn thanh toán chưa; khi đến hạn có bằng chứng
  thanh toán hợp lệ không?
- Nếu nhân viên được ủy quyền thanh toán: có quy chế/ủy quyền, bằng chứng nhân
  viên thanh toán không dùng tiền mặt và Công ty hoàn trả không dùng tiền mặt
  theo điều kiện áp dụng không?
- Có sử dụng hỗn hợp cho hoạt động chịu thuế và không chịu thuế không?
- Hóa đơn thuộc kỳ nào; có điều chỉnh, thay thế hoặc khai bổ sung không?

Kể từ quy định có hiệu lực ngày 2026-06-20, hàng mua trả chậm/trả góp từ 5
triệu đồng trở lên có thể được khấu trừ trước khi đến hạn nếu đủ hợp đồng/hóa
đơn; đến hạn mà thiếu chứng từ thanh toán không dùng tiền mặt phải điều chỉnh
giảm, và có thể kê khai lại khi có chứng từ hợp lệ. Vì vậy trạng thái thanh
toán và trạng thái khấu trừ phải tách nhau.

### 7.3 Xử lý theo nguồn đầu vào

| Nguồn | Ghi nhận đúng |
| --- | --- |
| Nguyên liệu/bao bì | Hàng tồn kho theo giá chưa có GTGT được khấu trừ; GTGT đi workpaper |
| Điện, nước, thuê, dịch vụ | Chi phí/phải trả theo bản chất; GTGT review riêng |
| Thiết bị TSCĐ | Nguyên giá không gồm phần GTGT được khấu trừ |
| CCDC | Giá trị CCDC/chi phí chờ phân bổ không gồm phần GTGT được khấu trừ |
| Thi công chi nhánh | Ghi theo khối lượng được nghiệm thu vào dở dang; không vốn hóa cả hợp đồng tự động |
| Hàng nhập khẩu | Tách hồ sơ hải quan, thuế khâu nhập khẩu và chứng từ nộp |
| Hóa đơn bán hàng/phương pháp trực tiếp | Không tự tạo GTGT đầu vào được khấu trừ chỉ vì tổng tiền có “thuế” |
| Phiếu thu, bill, order slip | Là bằng chứng thương mại/thanh toán, không tự là hóa đơn GTGT |

### 7.4 Hóa đơn từ máy tính tiền

`MTT` mô tả kênh khởi tạo hóa đơn, không phải kết luận thuế.

- Nếu người bán áp dụng phương pháp khấu trừ và phát hành hóa đơn điện tử MTT
  có nội dung giá chưa thuế, thuế suất, tiền GTGT, tổng thanh toán, dữ liệu CQT
  và thông tin người mua theo quy định, hóa đơn có thể đi vào quy trình review
  khấu trừ như hóa đơn GTGT khác.
- Nếu là hóa đơn bán hàng của người bán theo phương pháp trực tiếp, phiếu tính
  tiền hoặc biên nhận, Công ty không tự ghi một khoản GTGT đầu vào được khấu
  trừ.
- Nhân viên mua hàng phải yêu cầu thông tin người mua của CTCP Chén Sứ khi
  cần; QR hoặc ảnh bill không thay cho XML/dữ liệu hóa đơn và hồ sơ thanh toán.
- Dữ liệu nên tách `document_kind` khỏi `issuance_channel = cash_register`.

## 8. Luồng GTGT đầu ra

```text
Đơn hàng/line bán
→ xác định mã hàng và thuế suất có ngày hiệu lực
→ lập HĐĐT/HĐĐT MTT
→ CQT tiếp nhận/cấp mã hoặc dữ liệu truy xuất theo loại hóa đơn
→ hóa đơn có hiệu lực tham gia GTGT đầu ra
→ thay thế/điều chỉnh/hủy được ghi bằng sự kiện tham chiếu hóa đơn gốc
→ khóa workpaper theo kỳ
```

Các nguyên tắc:

- Doanh thu và GTGT đầu ra tách nhau. Giá khách trả có thể đã gồm GTGT nhưng
  phần doanh thu kế toán là giá chưa GTGT.
- Thuế suất phải gắn với hàng hóa/dịch vụ và ngày hiệu lực, không gắn cứng một
  mức cho toàn đơn hoặc toàn Công ty.
- Chính sách giảm từ 10% xuống 8% cho nhóm đủ điều kiện đang có hiệu lực đến
  hết 2026; danh mục loại trừ vẫn phải xét. Không giả định mọi món F&B đều 8%.
- Đồ uống/hàng hóa có chế độ thuế khác phải được phân loại theo catalog pháp
  lý đã duyệt; không suy ra từ tên hiển thị tự do.
- Hóa đơn nháp, lỗi, bị thay thế hoặc chưa đủ trạng thái hiệu lực không được
  cộng như hóa đơn hợp lệ.
- Hóa đơn đã phát hành phải giữ snapshot bất biến theo từng dòng và
  `vat_breakdown`. Hóa đơn thay thế/điều chỉnh phải dựng từ snapshot chứng từ
  gốc, không tính lại từ menu hoặc order có thể đã đổi.
- Trạng thái provider chưa rõ phải đi đối chiếu; không tự gửi lại và không tự
  cộng vào đầu ra như đã phát hành.
- Khuyến mại, biếu/tặng, tiêu dùng nội bộ, suất ăn nhân viên, hoàn tiền và hủy
  món phải có rule riêng; không chỉ trừ tiền khỏi doanh thu rồi bỏ qua hóa đơn.

## 9. Card GTGT và workpaper kỳ

### 9.1 Card ngoài `/finance`

Đặt một card tóm tắt ở cuối owner/management overview, không trộn vào nhóm card
lợi nhuận:

```text
┌──────────────────────────────────────────────────────────────┐
│ GTGT tạm tính · Tháng 07/2026                  [Chờ kiểm tra] │
│                                                              │
│ GTGT đầu ra                         80.000.000 đ              │
│ GTGT đầu vào đã ghi nhận            50.000.000 đ              │
│   ├─ Đủ điều kiện, đã vào kỳ        42.000.000 đ              │
│   └─ Chờ kiểm tra                    8.000.000 đ              │
│ Điều chỉnh được duyệt               +3.000.000 đ              │
│ ──────────────────────────────────────────────────────────── │
│ GTGT tạm tính                       41.000.000 đ              │
│ 12 chứng từ cần xử lý                 [Mở workpaper GTGT]     │
└──────────────────────────────────────────────────────────────┘
```

Số `GTGT đầu vào đã ghi nhận` là thông tin đối chiếu; chỉ phần đủ điều kiện đã
đưa vào kỳ mới đi vào phép trừ. Nếu có số được khấu trừ chuyển kỳ trước, hoàn
thuế, phân bổ hỗn hợp hoặc khai bổ sung, workpaper phải trình bày thành dòng
riêng theo policy; không giấu chúng trong một số “điều chỉnh” không truy vết.

Nếu kết quả âm, hệ thống hiển thị `Còn được khấu trừ tạm tính`, không suy ra
đương nhiên được hoàn thuế.

### 9.2 Màn hình `Tài chính > GTGT`

```text
[Tổng quan] [Đầu ra] [Đầu vào] [Chờ kiểm tra] [Điều chỉnh] [Kỳ kê khai]

Kỳ: 07/2026   Phương pháp: Chưa xác nhận   Độ tin cậy: Chưa đủ dữ liệu

Đầu ra có hiệu lực | Đầu vào ghi nhận | Đủ điều kiện | Chờ xử lý | Tạm tính

Danh sách ngoại lệ
- Hóa đơn trên 5 triệu chưa có chứng từ thanh toán phù hợp
- Hóa đơn MTT thiếu thông tin người mua/XML
- Hóa đơn dùng hỗn hợp chưa phân bổ
- Hóa đơn thay thế chưa liên kết bản gốc
- Chênh lệch PO/nghiệm thu/hóa đơn
```

Chỉ Accountant được review và đưa số tiền vào kỳ; Owner duyệt policy/khóa kỳ
theo ma trận thẩm quyền. Người vận hành có thể bổ sung chứng từ nhưng không tự
đổi `deductible_amount`.

## 10. Khấu hao TSCĐ và phân bổ CCDC

### 10.1 Hai khái niệm khác nhau

| Nội dung | TSCĐ | CCDC/chi phí chờ phân bổ |
| --- | --- | --- |
| Giá trị theo dõi | Nguyên giá, khấu hao lũy kế, giá trị còn lại | Giá trị chờ phân bổ, đã phân bổ, còn lại |
| Ghi nhận kỳ | Khấu hao | Phân bổ hoặc chi phí trực tiếp |
| Điều kiện bắt đầu | Sẵn sàng/đưa vào sử dụng theo policy | Bắt đầu hưởng lợi theo policy |
| Thuế TNDN | Khấu hao kế toán và phần được trừ có thể khác | Phần phân bổ được trừ vẫn cần hồ sơ |

```text
Khấu hao lũy kế
= tổng posting khấu hao sổ sách đã duyệt

Giá trị còn lại
= nguyên giá được công nhận
- khấu hao lũy kế
```

Không tính khấu hao từ tháng hóa đơn hoặc tháng thanh toán nếu tài sản chưa sẵn
sàng sử dụng. Quy ước trích giữa kỳ, thời gian sử dụng, giá trị thu hồi và
phương pháp phải là policy có ngày hiệu lực do kế toán duyệt.

### 10.2 Đích chi phí là bắt buộc

Không đưa toàn bộ khấu hao vào `Chi phí vận hành`.

```text
Khấu hao/phân bổ kỳ
= phần vào chi phí bán hàng/quản lý
+ phần vào chi phí sản xuất
+ đích khác đã được duyệt
```

- Thiết bị FOH, bán hàng hoặc văn phòng thường đi vào chi phí kỳ phù hợp.
- Thiết bị Bếp Trung tâm phục vụ sản xuất có thể đi vào chi phí sản xuất chung,
  sau đó vào tồn kho/thành phẩm và giá vốn khi bán.
- Thiết bị dùng hỗn hợp cần cơ sở phân bổ đã duyệt.
- Vị trí đang đặt tài sản không tự quyết định đích chi phí.

Inventory hiện tại chưa có mô hình đầy đủ cho nhân công và sản xuất chung.
Vì vậy khấu hao thiết bị sản xuất phải ở trạng thái `Chưa phân bổ/Chưa đủ mô
hình giá vốn`, không được tạm đẩy toàn bộ vào OPEX rồi sau này cộng lại vào giá
vốn.

### 10.3 Khấu hao kế toán và TNDN

```text
Điều chỉnh khấu hao TNDN
= khấu hao sổ sách
- khấu hao được kế toán xác nhận đủ điều kiện tính thuế
```

Chênh lệch thuế không sửa nguyên giá hoặc giá trị còn lại trên sổ kế toán. Nó
đi vào bảng đối chiếu thu nhập tính thuế. Không nhân chênh lệch với thuế suất
TNDN cho đến khi policy thuế của kỳ được duyệt.

Không chạy cron tự ghi khấu hao ở giai đoạn đầu. Hệ thống tạo lịch dự kiến,
Accountant kiểm tra và ghi nhận posting theo kỳ; lịch không phải bút toán.

## 11. Lợi nhuận: gọi đúng tên và tính đúng tầng

### 11.1 Kết quả kinh doanh hiện tại

```text
Doanh thu thuần trước GTGT
- Giá vốn nguyên liệu có dữ liệu
= Lợi nhuận gộp vận hành

Lợi nhuận gộp vận hành
- Chi phí vận hành đã ghi nhận
+ Biến động tồn kho (Tồn cuối kỳ - Tồn đầu kỳ)
= Kết quả kinh doanh
```

Trong runtime hiện tại, `food cost` chủ yếu là giá trị nguyên liệu tiêu hao có
coverage. Nó chưa phải giá vốn kế toán đầy đủ nếu còn thiếu nhân công trực
tiếp, sản xuất chung, khấu hao thiết bị sản xuất, chênh lệch kiểm kê hoặc phân
bổ khác. Do đó:

- Giữ tên `Kết quả kinh doanh`;
- Hiển thị coverage/confidence;
- Không đổi nhãn thành `Lợi nhuận ròng`;
- Không cộng giá trị tồn kho cuối kỳ trực tiếp vào kết quả — chỉ cộng
  **biến động** (cuối − đầu) trong kỳ đã chọn.

Tồn kho cuối kỳ vẫn là tài sản trên section riêng. Biến động tồn trong công thức
kết quả là góc nhìn quản trị kỳ, chưa thay thế giá vốn kế toán đầy đủ.

### 11.2 Thang lợi nhuận đầy đủ

```text
Doanh thu bán hàng trước GTGT
- giảm trừ doanh thu
= Doanh thu thuần

Doanh thu thuần
- Giá vốn đầy đủ
= Lợi nhuận gộp

Lợi nhuận gộp
- Chi phí bán hàng/quản lý và chi phí vận hành phù hợp
= Kết quả hoạt động kinh doanh chính

Kết quả hoạt động kinh doanh chính
+ doanh thu tài chính
- chi phí tài chính
+ thu nhập khác
- chi phí khác
= Lợi nhuận kế toán trước thuế

Lợi nhuận kế toán trước thuế
± điều chỉnh thuế
- lỗ được chuyển theo hồ sơ
= Thu nhập tính thuế

Thu nhập tính thuế
× thuế suất có hiệu lực đã được duyệt
- miễn/giảm/ưu đãi đủ điều kiện
= Thuế TNDN hiện hành

Lợi nhuận kế toán trước thuế
- chi phí thuế TNDN hiện hành/hoãn lại theo chế độ áp dụng
= Lợi nhuận sau thuế
```

`Thu nhập tính thuế` không bằng mặc định `Lợi nhuận trước thuế`. `Thuế TNDN`
không phải `Lợi nhuận trước thuế × 20%` cho mọi Công ty. Khung hiện hành có
trường hợp miễn và các mức 15%, 17%, 20% tùy doanh thu, quan hệ liên kết và
điều kiện; ưu đãi phải được xác nhận bằng hồ sơ.

| Candidate policy từ 2026 | Điều kiện cấp cao cần kiểm tra |
| --- | --- |
| Miễn TNDN | Doanh nghiệp/tổ chức Việt Nam có tổng doanh thu năm không quá 1 tỷ đồng theo cách xác định và loại trừ tại NĐ 141/2026 |
| Thuế suất 15% | Tổng doanh thu năm không quá 3 tỷ đồng và không thuộc trường hợp bị loại trừ |
| Thuế suất 17% | Tổng doanh thu năm trên 3 tỷ đến không quá 50 tỷ đồng và không thuộc trường hợp bị loại trừ |
| Thuế suất 20% | Mức chung khi không thuộc mức khác/ưu đãi hợp lệ |

Doanh thu làm căn cứ có thể lấy từ kỳ trước, phải annualize kỳ ngắn và xét
quan hệ liên kết theo quy định. Hệ thống chỉ tạo candidate; Accountant phải
duyệt `revenue_basis_period`, `revenue_basis_amount`, `exemption_status`,
`statutory_rate`, căn cứ và ngày hiệu lực.

Không dùng nhãn mơ hồ `Chi phí hợp lý`. Cần tách:

- `Chi phí kế toán`: bản chất kinh tế và kỳ ghi nhận;
- `Chi phí được trừ TNDN`: phần đáp ứng điều kiện thuế;
- `Chi phí không được trừ/điều chỉnh tăng`: vẫn có thể là chi phí kế toán nhưng
  được cộng lại khi xác định thu nhập tính thuế.

### 11.3 Khi nào được hiển thị “Lợi nhuận sau thuế”

Chỉ hiển thị khi kỳ đã có:

- Doanh thu/HĐĐT đầu ra đầy đủ và các điều chỉnh đã đối chiếu;
- Giá vốn đầy đủ, kiểm kê và coverage đạt gate;
- Chi phí đã phân loại, không còn khoản mua tài sản nằm sai trong OPEX;
- Khấu hao/phân bổ đã posting, không còn đích chi phí chưa xử lý;
- Doanh thu/chi phí tài chính và khoản khác;
- Đối chiếu GTGT, công nợ, ngân hàng và tiền;
- Bảng đối chiếu thu nhập tính thuế, policy TNDN và thuế đã duyệt;
- Trạng thái khóa sổ có người và thời điểm chịu trách nhiệm.

Trước đó, card phải dùng `Kết quả kinh doanh` hoặc `Lợi nhuận kế toán tạm tính`
kèm phạm vi loại trừ rõ ràng.

## 12. Những việc không làm thay đổi lợi nhuận ngay

| Sự kiện | Ảnh hưởng đúng |
| --- | --- |
| Nhập nguyên liệu chưa dùng | Tăng tồn kho và công nợ/giảm tiền |
| Thanh toán NCC | Giảm công nợ và tiền |
| Mua TSCĐ/CCDC được vốn hóa/phân bổ | Tăng tài sản/chi phí chờ phân bổ và công nợ/giảm tiền |
| Điều chuyển nội bộ | Đổi địa điểm/custody |
| Tồn kho cuối kỳ còn nguyên | Nằm ở tài sản, không cộng vào lợi nhuận |
| Ghi nhận GTGT đầu vào được khấu trừ | Tăng khoản thuế được khấu trừ, không phải doanh thu |
| Thu GTGT đầu ra của khách | Tăng nghĩa vụ thuế, không phải doanh thu của Công ty |

Lợi nhuận và dòng tiền là hai góc nhìn khác nhau. Một tháng có lợi nhuận nhưng
thiếu tiền vì tồn kho/công nợ; một tháng thu nhiều tiền đặt cọc vẫn chưa chắc
có doanh thu hoặc lợi nhuận tương ứng.

## 13. Bộ báo cáo Công ty F&B cần có

| Nhịp | Báo cáo | Mục đích |
| --- | --- | --- |
| Hằng ngày | Doanh thu, thu tiền, lệch ca, hủy/hoàn, HĐĐT lỗi | Kiểm soát bán hàng và tiền |
| Hằng ngày/tuần | Tiêu hao, tồn kho, hao hụt, coverage giá vốn | Kiểm soát nguyên liệu |
| Hằng tuần | Công nợ NCC, hóa đơn thiếu, khoản đến hạn | Kiểm soát dòng tiền/AP |
| Hằng tuần/tháng | Tài sản/CCDC theo site, hỏng/mất, chưa phân loại | Kiểm soát custody và vốn |
| Theo kỳ GTGT | Đầu ra, đầu vào, chờ review, điều chỉnh, chứng từ thanh toán | Workpaper GTGT |
| Hằng tháng | Kết quả kinh doanh theo Công ty/chi nhánh | Quản trị kinh doanh |
| Hằng tháng | Lợi nhuận kế toán, bảng cân đối, lưu chuyển tiền | Chỉ khi Accounting close đủ dữ liệu |
| Theo kỳ TNDN | Đối chiếu kế toán–thuế, khấu hao được trừ, ưu đãi | Workpaper TNDN |
| Hằng quý/năm | BCTC, tờ khai/quyết toán và hồ sơ kiểm toán nếu áp dụng | Nghĩa vụ pháp định |

Chi nhánh có thể xem kết quả quản trị theo site. GTGT, TNDN, tài sản và lợi
nhuận pháp định vẫn phải hợp nhất theo chủ thể Công ty, trừ cấu hình pháp lý
được xác nhận khác.

## 14. Vai trò và kiểm soát

| Vai trò | Được làm | Không tự được làm |
| --- | --- | --- |
| Người đề nghị mua | Tạo nhu cầu, mô tả mục đích/site | Duyệt vốn hóa hoặc khấu trừ |
| Người nhận/custodian | Xác nhận số lượng, serial, tình trạng, bàn giao | Sửa nguyên giá/policy |
| Quản lý chi nhánh | Xem tài sản đang giữ, báo hỏng, yêu cầu chuyển | Bán/thanh lý hoặc đổi ownership |
| Accountant | Review hóa đơn, phân loại, VAT, khấu hao/phân bổ, kỳ thuế | Tự thay policy cần Owner/HĐQT duyệt |
| Owner/người có thẩm quyền | Duyệt policy, ngoại lệ, khóa kỳ, thanh lý | Xóa audit history |

Các sự kiện phân loại, VAT, khấu hao, chuyển, mất và thanh lý phải append-only
hoặc có version/audit trail. Điều chỉnh phải tham chiếu sự kiện/chứng từ gốc,
người duyệt, lý do và kỳ ảnh hưởng.

## 15. Hiện trạng sản phẩm tại ngày kiểm tra

| Năng lực | Hiện trạng |
| --- | --- |
| Finance landing | Có năm card Finance Basic và confidence gate |
| Kết quả kinh doanh | Có; không phải báo cáo lợi nhuận pháp định |
| Giá vốn | Có giá nguyên liệu theo coverage; chưa là full COGS |
| Chi phí vận hành | Có ghi nhận expense và snapshot GTGT |
| Hóa đơn NCC/AP/payment | Có, nhưng matching hiện tại chưa phải three-way matching line-level đầy đủ |
| GTGT đầu vào | Chỉ có `input_vat_recorded`; chưa có review khấu trừ/kỳ/điều chỉnh |
| GTGT đầu ra | Có dữ liệu HĐĐT theo luồng bán; chưa có workpaper GTGT hợp nhất |
| `GTGT tạm tính` | Chưa có nguồn đủ điều kiện để tính |
| Sổ TSCĐ/CCDC | Chưa có |
| Khấu hao/phân bổ/giá trị còn lại | Chưa có |
| Accounting close | Có phần hỗ trợ DB, chưa có bề mặt ứng dụng đầy đủ |
| Lợi nhuận sau thuế | Chưa đủ nguồn và không được phép suy ra |

Hai rủi ro hiện hữu cần chặn trước khi thêm card:

1. Expense hiện có thể nhận một khoản mua thiết bị dưới category vận hành như
   `supplies`; chưa có gate kỹ thuật bắt phân loại tài sản.
2. Khấu hao thiết bị sản xuất chưa có đích giá vốn. Ghi toàn bộ vào OPEX sẽ làm
   sai thời điểm hoặc cộng trùng khi mô hình sản xuất chung được bổ sung.

Các bất nhất khác đã phát hiện trong audit, nhưng không sửa trong tài liệu này:

- Quyền Accountant thanh toán AP khác nhau giữa docs/Server Action và RPC;
- Fallback định giá tồn kho cần hiển thị confidence thay vì im lặng dùng giá trị
  hiện tại cho đầu kỳ/cuối kỳ;
- Route docs còn chỗ ghi Owner-only hoặc “four-card” không khớp runtime;
- Chưa có route `/finance/vat` hoặc `/finance/assets`.

## 16. UI đề xuất

### 16.1 Finance

```text
TÀI CHÍNH
[Tổng quan] [Doanh thu] [Giá vốn] [Chi phí] [Công nợ NCC]
[GTGT] [Tài sản & công cụ]

Doanh thu thuần | Giá vốn có coverage | Lợi nhuận gộp | Chi phí vận hành
Kết quả kinh doanh

────────────────────────────────────────────────────────────────
Ngoại lệ cần xử lý
- 7 khoản chi có dấu hiệu là thiết bị nhưng chưa phân loại
- 12 hóa đơn GTGT chờ review
- 3 tài sản đã nghiệm thu chưa có ngày đưa vào sử dụng
- 2 posting khấu hao chưa có đích chi phí
```

Không thêm card `Lợi nhuận sau thuế` vào layout này cho đến khi gate khóa sổ
đầy đủ. Có thể hiển thị một ladder giải thích những tầng còn thiếu.

### 16.2 Tài sản & công cụ

```text
TÀI SẢN & CÔNG CỤ
[Chờ phân loại] [TSCĐ] [CCDC] [Dở dang] [Thuê/mượn] [Kiểm kê]

Tìm kiếm...  Site...  Nhóm...  Tình trạng...  Custodian...

Mã      Tên            Phân loại  Site       Tình trạng  Giá trị còn lại
TS001   Tủ đông A      TSCĐ       CN Q1      Đang dùng   48.000.000
CC014   Máy in bếp     CCDC       CN Q3      Đang dùng    3.200.000
XD003   Thi công quầy  Dở dang    CN Q7      Chờ NT              —

Chi tiết
Thông tin | Chứng từ | Custody | Khấu hao/phân bổ | GTGT | Sự kiện
```

Giá trị còn lại chỉ hiển thị cho record có nguyên giá và posting hợp lệ. CCDC
đã ghi chi phí trực tiếp không được tạo “giá trị còn lại” giả chỉ để phục vụ
kiểm kê vật lý.

## 17. Lộ trình triển khai tối thiểu

### Giai đoạn 0 — Khóa policy và contract

- Kế toán xác nhận chế độ kế toán và phương pháp GTGT;
- Duyệt policy vốn hóa, TSCĐ, CCDC, ngày bắt đầu, thời gian, giá trị thu hồi;
- Duyệt ma trận chứng từ MTT/hóa đơn GTGT/hóa đơn bán hàng;
- Duyệt đích khấu hao: OPEX, sản xuất chung hoặc khác;
- Duyệt policy TNDN có ngày hiệu lực;
- Chốt metric contract, confidence và quyền.

Không làm UI tính toán trước giai đoạn này.

### Giai đoạn 1 — Sổ vật lý và phân loại

- Một register cho TSCĐ/CCDC/dở dang/thuê mượn;
- Link nguồn PO, nhận/nghiệm thu, hóa đơn và payment;
- Custody, tag, serial, chuyển, kiểm kê, hỏng/mất;
- Chặn expense có dấu hiệu tài sản cho đến khi được phân loại;
- Bổ sung loại nghiệm thu tài sản/dịch vụ, không ép qua GRN nguyên liệu.

### Giai đoạn 2 — Khấu hao và phân bổ

- Nguyên giá được duyệt, ngày sẵn sàng sử dụng;
- Lịch dự kiến và posting Accountant duyệt;
- Đích chi phí bắt buộc;
- Giá trị còn lại và đối chiếu khấu hao TNDN;
- Chưa tự động hóa cron ghi nhận.

### Giai đoạn 3 — Workpaper GTGT

- Reuse snapshot `vat_breakdown` từ expense và supplier invoice, không gộp mất
  nguồn;
- Review số tiền chờ/được/không được khấu trừ;
- Chứng từ thanh toán, mixed-use allocation, kỳ claim;
- Đầu ra theo hóa đơn có hiệu lực;
- Điều chỉnh append-only;
- `/finance/vat` và card ngoài `/finance`.

### Giai đoạn 4 — Accounting close và lợi nhuận đầy đủ

- Full COGS gồm production overhead được duyệt;
- Kết quả tài chính/khác;
- Đối chiếu ngân hàng, AP, tồn kho, tài sản và thuế;
- Workpaper TNDN;
- Khóa kỳ;
- Chỉ sau đó xem xét `Lợi nhuận kế toán trước thuế` và `Lợi nhuận sau thuế`.

Không cần xây một general ledger, tax filing engine hay approval engine tổng
quát chỉ để hoàn thành bốn giai đoạn trên. Nếu Công ty dùng phần mềm kế toán
pháp định bên ngoài, hệ thống vận hành có thể xuất workpaper và chứng từ đối
chiếu thay vì sao chép toàn bộ GL.

### Kiểm soát cuối tháng/quý

Cuối tháng:

- Cut-off GRN, nghiệm thu tài sản/dịch vụ, hóa đơn NCC, dở dang và ngày đưa vào
  sử dụng;
- Đối chiếu PO–nhận/nghiệm thu–hóa đơn–payment;
- Review GTGT, ngoại lệ đến hạn thanh toán, kỳ kê khai và điều chỉnh;
- Đối chiếu tài sản tăng/giảm/chuyển, tag, custodian và biên bản kiểm kê;
- Chỉ posting khấu hao/phân bổ sau khi khóa phân loại và đích chi phí;
- Đối chiếu tồn kho, giá vốn, AP, ngân hàng, tiền và control balance thuế;
- Accountant/Owner ký đóng kỳ; mở lại kỳ phải có audit trail.

Cuối quý bổ sung kiểm kê mở rộng, rà soát dở dang lâu ngày, hỏng/mất, downtime,
điều chỉnh GTGT và workpaper TNDN theo policy có hiệu lực.

## 18. Acceptance gate

Một triển khai được coi là đúng khi chứng minh được:

- Không khoản mua thiết bị nào vào OPEX khi chưa phân loại;
- Không ghi khấu hao trước ngày sẵn sàng sử dụng hoặc sau khi ngừng ghi nhận;
- Không cùng một khoản khấu hao đi cả OPEX và tồn kho/COGS;
- Không điều chuyển nội bộ nào tạo doanh thu, GTGT hoặc chi phí;
- Không file đính kèm nào tự biến thành GTGT được khấu trừ;
- Không hóa đơn thay thế nào tính lại từ dữ liệu bán hàng mutable hoặc tự retry
  khi trạng thái provider chưa rõ;
- Tổng GTGT ghi nhận bằng chờ + được + không được khấu trừ;
- Mọi số đã kê khai có kỳ, người duyệt và nguồn chứng từ;
- Mọi điều chỉnh tham chiếu bản gốc, không viết lại lịch sử;
- `GTGT tạm tính` fail closed khi thiếu dữ liệu;
- `Kết quả kinh doanh` không đổi nhãn thành `Lợi nhuận sau thuế`;
- Tồn kho, công nợ, tiền và tài sản không bị cộng trực tiếp vào lợi nhuận;
- Metric/card có formula, nguồn, loại trừ, freshness, confidence, permission và
  drilldown.

## 19. Ví dụ tổng hợp

### 19.1 Mua thiết bị

Thiết bị giá trước thuế 60.000.000 đồng, GTGT 4.800.000 đồng:

```text
Khi nhận đủ hồ sơ:
Tài sản/chờ phân loại       60.000.000
GTGT đầu vào đã ghi nhận     4.800.000
Công nợ NCC                64.800.000

Khi thanh toán:
Công nợ NCC               -64.800.000
Tiền                      -64.800.000
Kết quả kỳ                          0  (chưa có khấu hao)
```

Nếu đủ điều kiện khấu trừ, 4.800.000 đồng đi workpaper GTGT, không vào nguyên
giá. Nếu không được khấu trừ, kế toán quyết định phần được tính vào nguyên giá
hoặc chi phí theo hồ sơ. Khấu hao chỉ bắt đầu khi tài sản sẵn sàng sử dụng.

### 19.2 Thi công chi nhánh

Hợp đồng 500.000.000 đồng trước thuế, GTGT 40.000.000 đồng:

- Tạm ứng: khoản trả trước, chưa phải toàn bộ chi phí/tài sản;
- Nghiệm thu từng phần: ghi nhận khối lượng được chấp nhận vào dở dang;
- GTGT: review theo hóa đơn, khối lượng, mục đích và thanh toán;
- Khi hoàn thành: tách phần TSCĐ, CCDC và chi phí kỳ;
- Không khấu hao trước ngày sẵn sàng sử dụng;
- Không mặc định toàn bộ 540.000.000 đồng là nguyên giá.

### 19.3 CCDC

Bộ dụng cụ 12.000.000 đồng dùng nhiều kỳ:

- Vẫn có tag/nhóm/custodian để kiểm kê;
- Kế toán có thể duyệt phân bổ, ví dụ theo policy 12 kỳ;
- Mỗi posting phân bổ mới ảnh hưởng kết quả;
- “Đang giữ vật lý” và “còn giá trị phân bổ” là hai fact khác nhau.

### 19.4 GTGT tạm tính

```text
GTGT đầu ra có hiệu lực trong kỳ                  80.000.000
- GTGT đầu vào đủ điều kiện đã đưa vào kỳ        42.000.000
+ điều chỉnh tăng được duyệt                       3.000.000
= GTGT tạm tính                                   41.000.000
```

8.000.000 đồng đầu vào còn chờ review không được trừ. Con số 41.000.000 đồng
chưa được gọi là phải nộp nếu còn carry-forward, khai bổ sung, kỳ chưa khóa
hoặc policy chưa hoàn chỉnh.

## 20. Nguồn pháp lý chính

- [Luật GTGT 48/2024/QH15](https://vanban.chinhphu.vn/?classid=1&docid=212476&pageid=27160&typegroupid=3),
  [Luật 149/2025/QH15](https://vanban.chinhphu.vn/?docid=216588&orggroupid=1&pageid=27160)
  và [Luật 09/2026/QH16](https://vanban.chinhphu.vn/?classid=1&docid=218095&pageid=27160&typegroupid=3).
- [NĐ 181/2025/NĐ-CP](https://vanban.chinhphu.vn/?docid=214336&pageid=27160),
  [NĐ 359/2025/NĐ-CP](https://vanban.chinhphu.vn/?classid=1&docid=216388&orggroupid=2&pageid=27160)
  và [NĐ 144/2026/NĐ-CP](https://vanban.chinhphu.vn/?classid=1&docid=218020&pageid=27160&typegroupid=4).
- [NQ 204/2025/QH15](https://vanban.chinhphu.vn/?classid=1&docid=214209&pageid=27160)
  và [NĐ 174/2025/NĐ-CP](https://vanban.chinhphu.vn/?classid=1&docid=214310&pageid=27160&typegroupid=4)
  về giảm GTGT đến hết 2026 cho nhóm đủ điều kiện.
- [NĐ 254/2026/NĐ-CP](https://vanban.chinhphu.vn/?classid=1&docid=218689&orggroupid=2&pageid=27160)
  về hóa đơn điện tử/chứng từ điện tử, gồm nội dung HĐĐT MTT.
- [Luật TNDN 67/2025/QH15](https://vanban.chinhphu.vn/?docid=214607&pageid=27160),
  [NĐ 320/2025/NĐ-CP](https://vanban.chinhphu.vn/?classid=1&docid=216219&pageid=27160&typegroupid=4),
  [NĐ 141/2026/NĐ-CP](https://vanban.chinhphu.vn/?classid=1&docid=217960&pageid=27160&typegroupid=4)
  và [TT 20/2026/TT-BTC](https://vanban.chinhphu.vn/?docid=217191&orggroupid=4&pageid=27160).
- [TT 99/2025/TT-BTC](https://congbao.chinhphu.vn/van-ban/thong-tu-so-99-2025-tt-btc-46529/59634.htm)
  về chế độ kế toán doanh nghiệp từ năm tài chính áp dụng.
- [TT 45/2013/TT-BTC, đã được sửa đổi](https://congbao.chinhphu.vn/van-ban/thong-tu-so-45-2013-tt-btc-4118/2275.htm),
  [TT 30/2025/TT-BTC](https://vanban.chinhphu.vn/?classid=1&docid=213853&orggroupid=4&pageid=27160)
  và [QĐ 1760/QĐ-BTC](https://vanban.chinhphu.vn/?classid=0&docid=218751&pageid=27160)
  về quản lý, sử dụng và trích khấu hao TSCĐ.

Nguồn chi tiết và cách áp dụng trong repo tiếp tục được quản lý tại
`legal-framework-2026.md`, `einvoice-tax.md`, `operational-data-contract.md`,
`einvoice-tax-ctcp-evidence.md`, `business-context.md`, `inventory.md` và
`docs/modules/finance.md`.
