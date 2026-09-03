# Vận hành Má Tư Agent cho app giao đồ ăn

Má Tư Agent biến một máy Android thông thường thành điểm nhận phiếu ESC/POS qua mạng. Trên Redmi Note 13, luồng đã xác nhận là ShopeeFood gửi phiếu trực tiếp đến Agent; Agent giữ hàng chờ cục bộ, chống trùng và chuyển đơn về POS/KDS. Agent không in giấy tại thiết bị Android và không giả làm phần cứng SUNMI.

## Cài đặt

1. Cài APK chính từ `tools/matu-agent/app/build/outputs/apk/debug/app-debug.apk` lên máy Android, ví dụ Redmi Note 13.
2. Chỉ cài một APK. Nếu Redmi từng cài APK phụ mang tên `Má Tư Agent · GreenSM/beFood`, gỡ APK phụ đó. Không gỡ dịch vụ máy in hệ thống trên máy SUNMI thật.
3. Trong mục **Chạy nền trên Redmi**, hoàn tất ba bước: bật **Tự khởi động**, đặt pin thành **Không hạn chế**, rồi cho phép thông báo và bật **Thông báo nổi** cho kênh **Đơn mới**.
4. Mở Má Tư Agent và nhập URL máy chủ POS, mã chi nhánh, Delivery Relay Secret; giữ cổng mặc định `9100`.
5. Giữ **Nhận lệnh in từ mạng LAN** tắt nếu app sàn nằm cùng máy. Chỉ bật khi app gửi phiếu nằm trên thiết bị khác trong cùng mạng tin cậy.
6. Bấm **Bật nhận đơn**. Chỉ khi cổng mở thành công, trạng thái mới chuyển sang màu xanh.
7. Trong **Nguồn nhận phiếu**, Green SM Food và beFood phải hiện đúng trạng thái chưa hỗ trợ trực tiếp trên Redmi, không có công tắc bật giả.

## Chạy nền và cảnh báo đơn mới trên Redmi

Má Tư Agent 1.6.8 dùng foreground service thường trực. Khi thu ngân đã bấm **Bật nhận đơn**, Agent ghi nhớ trạng thái này và tự mở lại sau khi điện thoại khởi động hoặc APK được cập nhật. Khi màn hình tắt, Agent giữ tiến trình nhận phiếu hoạt động; nếu một địa chỉ listen lỗi, địa chỉ còn lại vẫn nhận phiếu, và Agent tự mở lại cổng khi không còn socket nào. Phiên TCP của app sàn được giữ như máy in mạng thật: Agent không đóng vì im lặng, chỉ đóng khi ShopeeFood tự ngắt, lỗi I/O, hoặc thu ngân bấm **Dừng nhận đơn**. Thông báo **Má Tư Agent đang nhận đơn** phải luôn có trong vùng thông báo khi dịch vụ đang chạy.

Kênh **Đơn mới** là kênh riêng có mức ưu tiên cao. Khi nhận một phiếu mới hợp lệ, Agent phát âm thanh, rung và hiện thẻ heads-up trên ứng dụng đang mở. Android 14 không cho ứng dụng bán hàng thông thường chiếm toàn màn hình như ứng dụng gọi điện/báo thức, vì vậy Agent dùng heads-up chính thức thay cho full-screen intent. Bấm **Gửi thử cảnh báo nổi** để xác nhận cấu hình mà không tạo đơn POS.

Trên HyperOS/MIUI, kiểm tra lần lượt:

1. **Tự khởi động**: bật cho Má Tư Agent.
2. **Pin**: chọn **Không hạn chế**; không dùng chế độ tiết kiệm pin cho máy vận hành.
3. **Thông báo → Đơn mới**: bật âm thanh, rung, màn hình khóa và thông báo nổi.
4. Khóa Má Tư Agent trong màn hình ứng dụng gần đây nếu phiên bản HyperOS của máy có chức năng này.

Không chọn **Buộc dừng** trong thông tin ứng dụng. Android coi đây là lệnh chủ động của người dùng và chặn mọi receiver tự khởi động cho đến khi mở lại ứng dụng. Vuốt đóng giao diện gần đây không phải **Buộc dừng**: foreground service vẫn tiếp tục chạy.

## Cấu hình app sàn

Với Green SM Food trên Redmi:

- Green SM Merchant 1.0.30 tìm thấy dịch vụ PrinterX nhưng vẫn chọn luồng Bluetooth khi thiết bị báo hãng Xiaomi/Redmi.
- Má Tư Agent trên **cùng điện thoại** không thể làm máy in Bluetooth của Green SM: Bluetooth cần hai thiết bị. Cổng `9100` và dòng `APP SÀN` chỉ dành cho app máy in mạng như ShopeeFood.
- Không cài APK giả lập SUNMI và không coi việc ứng dụng bind dịch vụ là bằng chứng đã nhận máy in.
- Đơn Green SM nhập tay trên POS. Nếu Agent lỡ giữ phiếu, chọn **Đã nhập tay**. Bấm **Kiểm tra Green SM Food** để xác nhận app đang cài và không đi cổng nhận phiếu.

Với beFood trên Redmi:

- Chưa xác nhận luồng gửi phiếu trực tiếp tới Agent. Giữ trạng thái chưa hỗ trợ cho đến khi có kiểm thử thực tế với phiên bản beMerchant đang dùng.

Với app dùng cấu hình máy in mạng/Wi-Fi, gồm ShopeeFood:

- Cùng máy Android với Agent: IP `127.0.0.1`, cổng `9100`.
- Khác máy: bật Chế độ LAN trong Agent, dùng IP Wi-Fi của máy chạy Agent và cổng `9100`.
- Khi bật Chế độ LAN, Agent tự công bố tên máy in `Má Tư Agent` qua DNS-SD.
  App sàn có hỗ trợ dò máy in mạng có thể tự hiển thị tên này; app không hỗ trợ
  DNS-SD vẫn phải nhập IP/cổng theo hướng dẫn của chính app sàn.
- Bật tự động in đơn mới nếu app sàn hỗ trợ.

Khi thu ngân phải nhập tay đơn ShopeeFood trong thời gian Agent dừng, nhập bốn số cuối của mã đơn vào POS. Ví dụ `29086-503463626` được lưu và hiển thị là `3626`. Agent vẫn giữ mã đầy đủ trong dữ liệu nguồn để xác định ngày và chống phát lại.

Nếu dữ liệu cũ chỉ còn mã ShopeeFood bốn số, POS chỉ xác nhận trùng khi tìm thấy đúng một đơn cùng chi nhánh, cùng ngày trên mã đầy đủ và khớp toàn bộ món/số lượng. Trường hợp không khớp hoặc có nhiều ứng viên phải giữ ở **Đang chờ** để đối chiếu, tuyệt đối không tự tạo đơn mới.

Bấm **Kiểm tra cổng in** trong Agent để xác nhận cổng cục bộ đang nhận kết nối. Thao tác này không tạo đơn giả trên POS và **không** chứng minh ShopeeFood đã nối tới Agent.

Bấm **Kiểm tra kết nối app sàn** hoặc xem dòng **Kết nối app sàn** trên Tổng quan. Chỉ khi Nhật ký có dòng `APP SÀN` (hỏi trạng thái máy in hoặc gửi phiếu) mới coi app sàn đã kết nối. Nếu chưa thấy, mở ShopeeFood, xác nhận máy in `127.0.0.1` cổng `9100`, rồi in thử một đơn.

Thanh điều hướng chính tách bốn khu vực: **Tổng quan**, **Phiếu**, **Thiết bị** và
**Nhật ký**. Trên điện thoại, các khu vực nằm ở thanh điều hướng dưới; trên màn
hình Android rộng, chúng chuyển thành thanh điều hướng cạnh. Trong **Phiếu**, hai
tab **Đang chờ** và **Lịch sử** luôn dùng cùng sổ đối chiếu.

Chạm một phiếu để mở chi tiết theo ba lớp dữ liệu độc lập:

1. **Ảnh gốc**: ảnh bitmap được giải mã từ lệnh raster ESC/POS.
2. **Văn bản**: ký tự in được bóc trực tiếp từ luồng ESC/POS, không phải kết quả OCR.
3. **OCR**: chữ được ML Kit nhận dạng từ ảnh và chuẩn hóa để phân tích đơn.

Phần tóm tắt hiển thị số byte gốc, kích thước bitmap và số ký tự của từng lớp.
Nếu phiếu không chứa một lớp nào đó, Agent phải báo rõ **không có dữ liệu**, không
tự lấy lớp khác thay thế. Chi tiết vẫn hiển thị mã đơn sàn, mã phiếu POS và hướng
xử lý lỗi. Đơn gửi lỗi có thể chọn
**Gửi lại ngay**. Nếu thu ngân đã nhập tay, chọn **Đã nhập tay**: Agent đưa đơn
khỏi hàng chờ nhưng vẫn giữ mã đơn và dấu nhận diện để chặn phiếu cũ xuất hiện lại.
Sau đó có thể chọn **Dọn dữ liệu đã xử lý** để xóa ảnh/OCR nặng; lịch sử đối chiếu
và dấu chống trùng vẫn được giữ.

## Nhận diện và chuyển phiếu

Agent chỉ gửi phiếu khi nguồn đó vừa được nhận diện duy nhất, vừa có luồng tiếp nhận
đang được hỗ trợ. Bảng dưới mô tả khả năng nhận diện nội dung, không đồng nghĩa app
sàn có thể kết nối trực tiếp trên Redmi:

| Nguồn | Chữ ký ví dụ |
| --- | --- |
| ShopeeFood | `ShopeeFood`, `ShopeePay`, mã `SPF-...` |
| GreenSM Food | `GreenSM Food`, `Xanh SM`, mã `GSM-...` |
| beFood | `beFood`, `Be Food`, mã `BE-...` hoặc `BF-...` |

Phiếu không có chữ ký hoặc chứa chữ ký xung đột được giữ tại hàng đợi với trạng thái **Chưa rõ sàn** và không được đẩy lên POS. Kỹ thuật cần xem nhật ký và bổ sung mẫu nhận diện bằng bài kiểm thử trước khi mở rộng.

## Xử lý sự cố

| Sự cố | Cách xử lý |
| --- | --- |
| Green SM Food yêu cầu Bluetooth | Đây là hành vi hiện tại trên Redmi. Không chờ `APP SÀN`. Nhập tay trên POS; máy in Bluetooth ngoài hoặc máy SUNMI thật chỉ in giấy, không đưa đơn vào Agent. |
| beFood không thấy Agent | Giữ trạng thái chưa hỗ trợ; không bật bằng giả lập khi chưa có mẫu phiếu và kiểm thử xác nhận. |
| Đơn ShopeeFood cũ xuất hiện lại sau khi mở app | Dừng nhận đơn, đối chiếu mã bốn số và món/số lượng. Nếu thu ngân đã nhập tay, chọn **Đã nhập tay**; không xóa bản ghi nhận diện. |
| App máy in mạng không kết nối được | Kiểm tra Agent đang xanh, IP và cổng `9100`; cùng máy phải dùng `127.0.0.1`. **Kiểm tra cổng in** xanh chưa đủ: Nhật ký phải có `APP SÀN`. |
| ShopeeFood mất máy in, không gửi phiếu | Phân biệt hai lớp: cổng listen `9100` và phiên TCP của ShopeeFood. Nhật ký `hết thời gian chờ trước khi có dữ liệu` sau `APP SÀN` là bản cũ đã đóng phiên. Cài 1.6.8 trở lên: Agent giữ phiên đến khi ShopeeFood tự ngắt. `Lỗi cổng nhận phiếu` / `Đang tự mở lại cổng` là listen socket; chờ Agent mở lại nếu Tổng quan vẫn bật nhận đơn. |
| Agent không chuyển sang xanh | Cổng đang bị chiếm hoặc bind thất bại; xem nhật ký trong Agent rồi đổi cổng/cắt ứng dụng chiếm cổng. |
| Agent tắt sau khi khóa màn hình | Mở **Chạy nền trên Redmi**, bật Tự khởi động, đặt pin Không hạn chế và không dùng **Buộc dừng**. Xác nhận thông báo thường trực của Agent còn hiển thị. |
| Không thấy cảnh báo đè trên ứng dụng khác | Cho phép thông báo Android, mở kênh **Đơn mới**, bật Thông báo nổi/âm thanh/rung rồi bấm **Gửi thử cảnh báo nổi**. |
| Phiếu ở trạng thái Cần kiểm tra | Chụp/lưu mẫu phiếu, xác nhận app nguồn. Nếu đã nhập POS bằng tay, chọn **Đã nhập tay**; không đổi tay sang sàn khác rồi gửi lại. |
| POS không nhận đơn | Bấm **Kiểm tra POS**, kiểm tra Internet, URL, mã chi nhánh và Delivery Relay Secret. Phiếu hợp lệ sẽ tự gửi lại. |
| App sàn nằm trên máy khác | Bật Chế độ LAN và trỏ app sàn đến IP Wi-Fi của máy Agent; chỉ dùng trong mạng chi nhánh tin cậy. |

Mỗi sàn tại một chi nhánh chỉ dùng một luồng tiếp nhận để tránh chạy song song Agent và tiện ích trình duyệt.
