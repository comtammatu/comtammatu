# Onboarding tích hợp nền tảng giao đồ ăn

> Checklist xin quyền tích hợp GrabFood, beFood, ShopeeFood và Green SM Food.
> Nguồn được kiểm tra gần nhất ngày 02/08/2026; phải kiểm tra lại tài liệu và
> hợp đồng hiện hành trước khi thiết kế hoặc phát hành adapter.

## Kết luận

- **GrabFood** là nền tảng duy nhất hiện có đủ contract kỹ thuật công khai để
  ước lượng một adapter POS/ERP. Tài liệu công khai nhưng project, credential và
  Production vẫn phải được Grab duyệt.
- **beFood** có developer portal chính thức đang niêm yết `Food API`, nhưng
  trang chi tiết không trả được nội dung trong lần kiểm tra này. Chưa đủ bằng
  chứng để chốt endpoint, quyền truy cập hoặc sandbox.
- **ShopeeFood** xác nhận có tích hợp với các POS được nêu tên như Sapo,
  KiotViet, iPOS và Ocha. Không tìm thấy tài liệu API Food công khai hoặc quy
  trình self-service cho một POS mới; khả năng cao đây là chương trình đối tác
  được duyệt riêng.
- “**GreenSM**” tương ứng với tên hiện hành **Green SM Food**; dịch vụ ra mắt
  với tên **Green SM Ngon** và tài liệu merchant vẫn dùng cả hai tên. Chỉ thấy
  luồng qua ứng dụng Green SM Merchant, chưa thấy API/POS integration công khai.
- Vì vậy chưa nên viết bốn adapter. Việc có giá trị ngay là onboard Cơm Tấm Má
  Tư làm merchant trên từng nền tảng và xin bằng văn bản bộ tài liệu tích hợp,
  sandbox, điều kiện chứng nhận, SLA và quyền sử dụng dữ liệu.

## Ma trận bằng chứng

| Nền tảng      | API/integration được xác nhận                                                  | Order                                          | Menu, giá, còn/hết món                         | Trạng thái/hủy                                                    | Đối soát/payout                                                                                 | Sandbox/chứng nhận                                                |
| ------------- | ------------------------------------------------------------------------------ | ---------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| GrabFood      | Public docs, credential chỉ sau khi duyệt POS/SaaS partner                     | Webhook nhận đơn; API accept/reject, list/edit | Full/incremental sync, giá, stock/availability | Order-state webhook; ready time, ready, cancel; store pause/hours | `List Orders` hỗ trợ recovery; không thấy settlement API; payout qua ngân hàng/báo cáo merchant | Có Staging project, test case, pilot Production và phased rollout |
| beFood        | Developer portal có nhãn `Food API`, chi tiết và quyền truy cập chưa xác nhận  | beMerchant nhận tự động hoặc xác nhận tay      | beMerchant quản lý menu/hiển thị               | beMerchant có `Đã chuẩn bị`; API chưa rõ                          | Chuyển khoản theo lịch công bố; API chưa rõ                                                     | Chưa rõ                                                           |
| ShopeeFood    | Integration được xác nhận cho các POS được nêu tên; không thấy public API docs | POS nhận đơn, xác nhận/từ chối                 | Đồng bộ món, topping, giá, availability        | Ocha được phép hủy; contract API chưa công khai                   | Wallet và báo cáo; POS nhận số tiền thực nhận                                                   | Chưa rõ; kết nối merchant qua QR trên Shopee Partner              |
| Green SM Food | Chỉ xác nhận Green SM Merchant; không thấy public API/POS docs                 | App nhận tự động hoặc thủ công                 | App tạo/sửa/xóa món, topping, ngừng bán        | App có trạng thái đơn/cửa hàng; hủy API chưa rõ                   | Ví cửa hàng, lịch sử và rút tiền bằng OTP                                                       | Chưa rõ                                                           |

`Chưa rõ` nghĩa là nguồn chính thức đã kiểm tra không công bố đủ dữ liệu, không
có nghĩa tính năng chắc chắn không tồn tại.

## 1. GrabFood

### Đã xác nhận

Grab công bố [GrabFood Partner API (POS) Integration Guide
1.1.3](https://developer.grab.com/docs/grabfood/api/v1-1-3/) và liệt kê Việt Nam
trong vùng hỗ trợ. Đối tượng `Partner` là POS của merchant, không phải mỗi nhà
hàng tự nhận API key. POS/SaaS partner phải gửi [Grab Developer contact
form](https://developer.grab.com/contact-us), chọn `Food`; Grab kiểm tra, duyệt
và mời PIC vào Staging project.

Contract công khai hỗ trợ:

- Grab gọi webhook của partner để đẩy menu ban đầu, trạng thái tích hợp, yêu cầu
  lấy menu mới, trạng thái menu sync, đơn mới và trạng thái đơn.
- Partner gọi API để full/incremental menu sync, cập nhật item/modifier, giá,
  stock/availability; accept/reject, list/edit/cancel order, báo món sẵn sàng,
  cập nhật thời gian chuẩn bị; pause cửa hàng và quản lý giờ mở cửa. Campaign và
  loyalty là phạm vi mở rộng, không cần cho MVP.
- `List Orders` lấy lịch sử tối đa 30 ngày, hữu ích cho recovery/đối chiếu vận
  hành. Catalog công khai không nêu settlement/payout endpoint.

Auth dùng OAuth 2.0 `client_credentials`, scope `food.partner_api` và Bearer
token. Luồng là hai chiều: partner lấy token của Grab để gọi Grab; Grab lấy
token từ endpoint của partner để gọi webhook. Tài liệu yêu cầu HTTPS, TLS 1.2+
với AES-GCM cho webhook; menu-state webhook là at-least-once và có `requestID`
để loại trùng. Không thấy HMAC/signature riêng trong guide, nên không được tự
giả định có. IP allowlist được hỗ trợ nếu partner bật cấu hình này.

Quy trình phát hành là development → Staging test → pilot tại một cửa hàng ít
lưu lượng trên Production → phased rollout. Yêu cầu chất lượng gồm error rate
dưới 1%, xử lý 100% order submission/order-state update và webhook phản hồi
trong 10 giây. Grab ước lượng integration đầy đủ thường mất 1–2 tháng.

Merchant Việt Nam vẫn phải đăng ký riêng: giấy tờ người đại diện/chủ, thông tin
liên hệ, đăng ký kinh doanh nếu là HKD/công ty, ảnh cửa hàng và menu. Trang
[GrabFood Merchant Sign Up](https://www.grab.com/vn/en/merchant/) nói tiền được
chuyển vào tài khoản ngân hàng trong ba ngày làm việc và đối soát qua email cùng
GrabMerchant App.

### Còn phải lấy từ Grab

- Phê duyệt Cơm Tấm Má Tư/comtammatu là POS partner hay chỉ là tích hợp nội bộ
  cho chính chuỗi của mình; quyền rollout nhiều chi nhánh tại Việt Nam.
- Test pack hiện hành, Production credential, rate limit theo project và contact
  Integration Manager.
- Mẫu báo cáo payout/fee/tax; xác nhận liệu có settlement export dành cho chuỗi
  ngoài báo cáo email/app.

## 2. beFood

### Đã xác nhận

[Be for Developers](https://developers.be.com.vn/) là portal chính thức và
catalog được công cụ tìm kiếm ghi nhận có mục `Food API`. Tuy nhiên `/docs`
không trả danh mục/tài liệu chi tiết trong lần đọc ngày 02/08/2026; vì vậy chưa
thể xác nhận endpoint, webhook, auth, scope, rate limit, sandbox hay Production
access. Việc có tên tài liệu công khai không đồng nghĩa credential là
self-service.

Luồng merchant công khai dùng beMerchant. [Hướng dẫn vận hành mới của
beFood](https://beacademy.be.com.vn/merchant/articles/quan-moi-len-san-can-chuan-bi-nhung-gi)
xác nhận app quản lý menu, bật/tắt hiển thị món và xử lý đơn. [Hướng dẫn xử lý
đơn](https://beacademy.be.com.vn/merchant/articles/huong-dan-thao-tac-nhan-va-xu-ly-don-hang-tren-ung-dung-bemerchant)
cho phép tự động nhận hoặc xác nhận tay, đánh dấu `Đã chuẩn bị`, đối chiếu mã đơn
và bàn giao đúng tài xế. Đây là khả năng của app; chưa phải bằng chứng cho API.

Trang [Đăng ký gian hàng
beFood](https://be.com.vn/dang-ky-nha-hang-befood/) yêu cầu giấy đăng ký kinh
doanh, giấy ủy quyền nếu ký thay, giấy tờ người đại diện, ảnh mặt tiền, menu và
ảnh món; quy trình gồm tư vấn, tải beMerchant, xác nhận hồ sơ/ký hợp đồng rồi
kích hoạt. [Lịch thanh toán chính
thức](https://beacademy.be.com.vn/merchant/articles/lich-thanh-toan-doanh-thu-nha-hang-befood)
nêu doanh thu Thứ 2–5 được đi lệnh ngày làm việc kế tiếp; Thứ 6–Chủ nhật đi lệnh
Thứ 2, sau chiết khấu phải đạt 100.000 đồng, chuyển khoản có thể chậm 1–3 ngày.

### Còn phải hỏi beFood

- `Food API` dành cho merchant, POS/SaaS partner hay đối tác được chỉ định; cách
  xin tài liệu và credential.
- Toàn bộ capability order/menu/store/cancel/reconciliation; cơ chế webhook,
  chống trùng, auth/signature, sandbox, chứng nhận và SLA.
- Liên hệ qua form merchant hoặc tổng đài Nhà hàng `1900 23 23 59`; yêu cầu được
  chuyển tới đội API/POS integration và trả lời bằng văn bản.

## 3. ShopeeFood

### Đã xác nhận

Merchant phải cung cấp hồ sơ, ký hợp đồng rồi vận hành bằng Shopee Partner.
[Trang đăng ký chính thức](https://shopeefood.vn/merchant-register) liệt kê giấy
tờ cho cá nhân/HKD/công ty, thời gian mở quán dự kiến 5–15 ngày làm việc và kênh
hỗ trợ `hotroquan@support.shopeefood.vn`.

ShopeeFood công bố các hướng dẫn tích hợp cho POS cụ thể:

- [Kết nối Sapo](https://merchant.shopeefood.vn/edu/article/huong-dan-tich-hop-shopeefood-tren-sapo)
  chỉ áp dụng cho quán đã có trên ShopeeFood; Admin Sapo tạo QR, merchant quét
  bằng Shopee Partner và xác thực đúng cửa hàng.
- [Quản lý menu trên
  Sapo](https://merchant.shopeefood.vn/edu/article/quan-ly-menu-shopeefood-tren-sapo-dong-bo-mat-hang-topping-thuc-don)
  đồng bộ tên, giá, ảnh, mô tả, nhóm món và topping; cho phép bật/tắt/xóa món và
  đặt giá riêng cho kênh.
- [Xử lý đơn trên
  KiotViet](https://merchant.shopeefood.vn/edu/article/nhan-thong-bao-va-xu-ly-don-hang-shopeefood)
  nhận đơn, xác nhận/từ chối hoặc auto-accept, in bếp/hóa đơn; số tiền đồng bộ là
  tiền quán thực nhận sau chiết khấu.
- [Ocha POS](https://merchant.shopeefood.vn/edu/article/cac-tinh-nang-noi-bat-cua-ocha-pos)
  được mô tả có đồng bộ menu, quản lý đơn, chỉnh món/hết món và hủy đơn.

Những nguồn này xác nhận integration tồn tại nhưng không công bố API contract
hay chương trình đăng ký POS partner mới. Suy luận hợp lý là quyền kỹ thuật được
cấp cho đối tác được duyệt; không được coi QR merchant là API credential có thể
tái sử dụng ngoài flow chính thức.

ShopeeFood Merchant Wallet là công cụ đối soát và có thể ghi nhận tiền ngay sau
khi merchant xác nhận đơn. Chưa thấy settlement API, webhook/auth contract,
sandbox, certification hoặc SLA trong tài liệu công khai đã kiểm tra.

### Còn phải hỏi ShopeeFood

- comtammatu có thể trở thành direct POS partner hay phải đi qua POS/aggregator
  đang được ShopeeFood hỗ trợ.
- API order/menu/store/cancel, webhook delivery semantics, auth/signature,
  sandbox/UAT, chứng nhận, rollout nhiều chi nhánh và settlement export.
- Gửi yêu cầu từ tài khoản Shopee Partner và
  `hotroquan@support.shopeefood.vn`, xin chuyển tới đội POS integration.

## 4. Green SM Food / Green SM Ngon

### Tên sản phẩm và phạm vi đã xác nhận

Trang sản phẩm hiện hành gọi dịch vụ là [Green SM
Food](https://www.greensm.com/vn-vi/greensm-ngon). Thông cáo năm 2025 gọi tên
ra mắt là [Green SM
Ngon](https://www.greensm.com/vn-vi/news/ra-mat-dich-vu-giao-do-an-xanh-sm-ngon).
Do đó “GreenSM” trong yêu cầu nên được chuẩn hóa thành `Green SM Food`, đồng
thời giữ `Green SM Ngon` như alias khi làm việc với bộ phận merchant.

[Hướng dẫn đăng ký Green SM
Merchant](https://www.greensm.com/vn-vi/news/huong-dan-dang-ky-tro-thanh-doi-tac-cua-green-sm-merchant)
yêu cầu giấy tờ tùy thân, giấy phép kinh doanh cho HKD/công ty, giấy ủy quyền nếu
có, giấy ATTP bắt buộc với công ty và tài khoản ngân hàng đúng pháp nhân. Sau khi
gửi, bộ phận kinh doanh gọi lại để xử lý hồ sơ.

[Hướng dẫn Green SM
Merchant](https://www.greensm.com/vn-vi/news/huong-dan-su-dung-ung-dung-xanh-sm-merchant)
xác nhận app dùng số điện thoại + OTP; quản lý giờ/trạng thái cửa hàng, danh mục,
món, topping, ngừng bán, đơn mới/đã xác nhận/lịch sử, nhận đơn thủ công hoặc tự
động; ví cửa hàng có rút tiền bằng OTP và lịch sử giao dịch. Bồi hoàn đơn hủy
được xử lý qua hỗ trợ. Đây vẫn là app contract, không phải API contract.

Không tìm thấy developer portal, public Food API, POS integration guide,
webhook/auth contract, sandbox hoặc certification trong nguồn Green SM chính
thức đã kiểm tra. Liên hệ Food merchant qua hotline `0247 123 9999`, email
`cskh@xanhsm.com` hoặc [form Green SM
Merchant](https://www.greensm.com/vn-vi/greensm-merchant), yêu cầu chuyển tới đội
POS/API integration.

## Bộ câu hỏi bắt buộc gửi cả bốn nền tảng

1. Direct API có cho chuỗi tự tích hợp ERP của chính mình không, hay chỉ cấp cho
   POS/SaaS/aggregator thương mại?
2. Capability chính thức: new order, accept/reject, edit/cancel, ready/status,
   menu full/delta, price, availability/stock, store hours/pause, payout/report.
3. Webhook delivery: retry, ordering, replay window, idempotency key, recovery
   endpoint và retention.
4. Auth/security: OAuth scope, credential rotation, webhook verification,
   TLS/IP allowlist, PII retention và quyền dùng dữ liệu khách hàng.
5. Sandbox/UAT/certification: test case, test merchant, SLA, rate limit,
   Production pilot, multi-branch rollout và quy trình incident.
6. Commercial/legal: phí setup, commission, minimum volume, data-processing
   terms, payout statement, VAT invoice và thời hạn chấm dứt/thu hồi credential.

## Quyết định tạm thời

- Chỉ mở thiết kế kỹ thuật chi tiết cho **GrabFood** sau khi form partner được
  duyệt và nhận Staging project.
- Với **beFood**, **ShopeeFood** và **Green SM Food**, dừng ở merchant onboarding
  và partner discovery. Không viết schema/adapter từ ảnh app, hướng dẫn POS khác
  hoặc suy đoán payload.
- Nếu nền tảng không cấp direct API, đánh giá một aggregator/POS đã được chính
  nền tảng xác nhận; không reverse-engineer app merchant.
