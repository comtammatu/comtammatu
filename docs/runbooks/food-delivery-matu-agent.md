# Vận hành Má Tư Agent cho ShopeeFood

Má Tư Agent biến một máy Android thông thường thành điểm nhận phiếu ESC/POS của ShopeeFood. ShopeeFood gửi phiếu ảnh tới cổng `9100`; Agent đọc OCR trên máy, giữ hàng chờ cục bộ, chống trùng và chuyển đơn về POS/KDS. Agent không in giấy tại thiết bị Android và không giả làm phần cứng SUNMI.

## Cài đặt

1. Cài APK chính từ `tools/matu-agent/app/build/outputs/apk/debug/app-debug.apk` lên máy Android, ví dụ Redmi Note 13.
2. Chỉ cài một APK. Nếu Redmi từng cài APK phụ tương thích, gỡ APK phụ đó. Không gỡ dịch vụ máy in hệ thống trên máy SUNMI thật.
3. Trong mục **Chạy nền trên Redmi**, hoàn tất ba bước: bật **Tự khởi động**, đặt pin thành **Không hạn chế**, rồi cho phép thông báo và bật **Thông báo nổi** cho kênh **Đơn mới**.
4. Mở Má Tư Agent và nhập URL máy chủ POS, mã chi nhánh, Delivery Relay Secret; giữ cổng mặc định `9100`.
5. Giữ **Nhận lệnh in từ mạng LAN** tắt nếu ShopeeFood nằm cùng máy. Chỉ bật khi app gửi phiếu nằm trên thiết bị khác trong cùng mạng tin cậy.
6. Bật nguồn **ShopeeFood · máy in mạng**, rồi bấm **Bật nhận đơn**. Chỉ khi cổng mở thành công, trạng thái mới chuyển sang màu xanh.

## Chạy nền và cảnh báo đơn mới trên Redmi

Má Tư Agent 1.7.3 dùng foreground service thường trực và tự kiểm tra cổng `9100` mỗi 15 giây. Khi thu ngân đã bấm **Bật nhận đơn**, Agent ghi nhớ trạng thái này và tự mở lại sau khi điện thoại khởi động, APK được cập nhật, hoặc cổng máy in không trả lời. Khi màn hình tắt, Agent giữ tiến trình nhận phiếu hoạt động; nếu một địa chỉ listen lỗi, địa chỉ còn lại vẫn nhận phiếu. Phiên TCP của ShopeeFood được giữ như máy in mạng thật. Thông báo **Má Tư Agent đang nhận đơn** phải luôn có trong vùng thông báo khi dịch vụ đang chạy. Tổng quan hiện dòng **Máy in 127.0.0.1:9100 đang mở**.

Kênh **Đơn mới** phát âm thanh, rung và thẻ heads-up khi nhận phiếu ShopeeFood hợp lệ. Bấm **Gửi thử cảnh báo nổi** để xác nhận cấu hình mà không tạo đơn POS.

Trên HyperOS/MIUI, kiểm tra lần lượt:

1. **Tự khởi động**: bật cho Má Tư Agent.
2. **Pin**: chọn **Không hạn chế**.
3. **Thông báo → Đơn mới**: bật âm thanh, rung, màn hình khóa và thông báo nổi.
4. Khóa Má Tư Agent trong màn hình ứng dụng gần đây nếu máy có chức năng này.

Không chọn **Buộc dừng**. Vuốt đóng giao diện gần đây không phải **Buộc dừng**: foreground service vẫn tiếp tục chạy.

## Cấu hình ShopeeFood

- Cùng máy Android với Agent: IP `127.0.0.1`, cổng `9100`.
- Khác máy: bật Chế độ LAN trong Agent, dùng IP Wi-Fi của máy chạy Agent và cổng `9100`.
- Khi bật Chế độ LAN, Agent tự công bố tên máy in `Má Tư Agent` qua DNS-SD.
- Bật tự động in đơn mới nếu ShopeeFood hỗ trợ.

Khi thu ngân phải nhập tay đơn ShopeeFood trong thời gian Agent dừng, nhập bốn số cuối của mã đơn vào POS. Ví dụ `29086-503463626` được lưu và hiển thị là `3626`. Agent vẫn giữ mã đầy đủ để xác định ngày và chống phát lại.

Bấm **Kiểm tra cổng in** để xác nhận cổng cục bộ đang nhận kết nối. Thao tác này không tạo đơn giả trên POS và **không** chứng minh ShopeeFood đã nối tới Agent.

Bấm **Kiểm tra kết nối app sàn** hoặc xem dòng **Kết nối app sàn** trên Tổng quan. Chỉ khi Nhật ký có dòng `APP SÀN` mới coi ShopeeFood đã kết nối.

Thanh điều hướng chính tách bốn khu vực: **Tổng quan**, **Phiếu**, **Thiết bị** và **Nhật ký**. Trong **Phiếu**, hai tab **Đang chờ** và **Lịch sử** dùng cùng sổ đối chiếu.

Chạm một phiếu để mở chi tiết theo ba lớp dữ liệu độc lập:

1. **Ảnh gốc**: ảnh bitmap được giải mã từ lệnh raster ESC/POS.
2. **Văn bản**: ký tự in được bóc trực tiếp từ luồng ESC/POS.
3. **OCR**: chữ nhận dạng từ ảnh (ML Kit, đã phóng to và chừa chỗ dấu thanh tiếng Việt) rồi chuẩn hóa để phân tích đơn ShopeeFood. Trong **Thiết bị → Kiểm tra**, **Đối chiếu OCR phiếu đã lưu** đọc lại các phiếu còn giữ ảnh gốc.

Nếu phiếu không chứa một lớp nào đó, Agent phải báo rõ **không có dữ liệu**. Đơn gửi lỗi có thể chọn **Gửi lại ngay**. Nếu thu ngân đã nhập tay, chọn **Đã nhập tay**. Sau đó có thể chọn **Dọn dữ liệu đã xử lý** để xóa ảnh/OCR nặng; lịch sử đối chiếu vẫn được giữ.

## Nhận diện ShopeeFood

Agent chỉ gửi phiếu khi nhận diện được chữ ký ShopeeFood (`ShopeeFood`, `ShopeePay`, mã `SPF-...` hoặc mã đơn Shopee dạng `07096-...`). Phiếu không có chữ ký ShopeeFood được giữ với trạng thái **Chưa rõ sàn** và không được đẩy lên POS.

## Xử lý sự cố

| Sự cố | Cách xử lý |
| --- | --- |
| Đơn ShopeeFood cũ xuất hiện lại sau khi mở app | Dừng nhận đơn, đối chiếu mã bốn số và món/số lượng. Nếu thu ngân đã nhập tay, chọn **Đã nhập tay**; không xóa bản ghi nhận diện. |
| ShopeeFood không kết nối được | Kiểm tra Agent đang xanh, IP `127.0.0.1` và cổng `9100`. Nhật ký phải có `APP SÀN`. |
| ShopeeFood mất máy in | Cài 1.6.8 trở lên: Agent giữ phiên đến khi ShopeeFood tự ngắt. |
| Agent không chuyển sang xanh | Cổng đang bị chiếm; xem nhật ký rồi đổi cổng hoặc cắt ứng dụng chiếm cổng. |
| Agent tắt sau khi khóa màn hình | Mở **Chạy nền trên Redmi**, bật Tự khởi động, đặt pin Không hạn chế và không dùng **Buộc dừng**. |
| Không thấy cảnh báo đè trên ứng dụng khác | Cho phép thông báo, mở kênh **Đơn mới**, rồi bấm **Gửi thử cảnh báo nổi**. |
| POS không nhận đơn | Bấm **Kiểm tra POS**, kiểm tra Internet, URL, mã chi nhánh và Delivery Relay Secret. |
| ShopeeFood nằm trên máy khác | Bật Chế độ LAN và trỏ ShopeeFood đến IP Wi-Fi của máy Agent. |
| Chi tiết phiếu đã lên POS trống ảnh/OCR | Bản 1.6.9 xóa ảnh sau khi gửi. Bản 1.7.0 giữ ảnh/OCR cho đến khi bấm **Dọn dữ liệu đã xử lý**. |
