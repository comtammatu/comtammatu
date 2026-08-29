# Vận hành Má Tư Agent cho app giao đồ ăn

Má Tư Agent biến một máy Android thông thường thành điểm nhận phiếu ESC/POS qua mạng. Trên Redmi Note 13, luồng đã xác nhận là ShopeeFood gửi phiếu trực tiếp đến Agent; Agent giữ hàng chờ cục bộ, chống trùng và chuyển đơn về POS/KDS. Agent không in giấy tại thiết bị Android và không giả làm phần cứng SUNMI.

## Cài đặt

1. Cài APK chính từ `tools/matu-agent/app/build/outputs/apk/debug/app-debug.apk` lên máy Android, ví dụ Redmi Note 13.
2. Chỉ cài một APK. Nếu Redmi từng cài APK phụ mang tên `Má Tư Agent · GreenSM/beFood`, gỡ APK phụ đó. Không gỡ dịch vụ máy in hệ thống trên máy SUNMI thật.
3. Cho phép Má Tư Agent chạy nền và tự khởi động. Tắt tối ưu pin nếu hệ điều hành thường dừng ứng dụng nền.
4. Mở Má Tư Agent và nhập URL máy chủ POS, mã chi nhánh, Delivery Relay Secret; giữ cổng mặc định `9100`.
5. Giữ **Nhận lệnh in từ mạng LAN** tắt nếu app sàn nằm cùng máy. Chỉ bật khi app gửi phiếu nằm trên thiết bị khác trong cùng mạng tin cậy.
6. Bấm **Bật nhận đơn**. Chỉ khi cổng mở thành công, trạng thái mới chuyển sang màu xanh.
7. Trong **Nguồn nhận phiếu**, Green SM Food và beFood phải hiện đúng trạng thái chưa hỗ trợ trực tiếp trên Redmi, không có công tắc bật giả.

## Cấu hình app sàn

Với Green SM Food trên Redmi:

- Green SM Merchant 1.0.30 tìm thấy dịch vụ PrinterX nhưng vẫn chọn luồng Bluetooth khi thiết bị báo hãng Xiaomi/Redmi.
- Má Tư Agent không thể thay đổi quyết định này của ứng dụng Green SM Merchant. Dùng máy in Bluetooth ngoài, máy SUNMI thật hoặc luồng tích hợp được Green SM hỗ trợ.
- Không cài APK giả lập SUNMI và không coi việc ứng dụng bind dịch vụ là bằng chứng đã nhận máy in.

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

Bấm **Kiểm tra cổng in** trong Agent để xác nhận cổng cục bộ đang nhận kết nối. Thao tác này không tạo đơn giả trên POS.

Mục **Sổ đối chiếu đơn** tách **Đang chờ** và **Lịch sử**. Chạm một đơn để xem mã
đơn sàn, mã phiếu POS, nội dung OCR và hướng xử lý lỗi. Đơn gửi lỗi có thể chọn
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
| Green SM Food yêu cầu Bluetooth | Đây là hành vi hiện tại trên Redmi. Dùng máy in Bluetooth ngoài/máy SUNMI hoặc chờ luồng tích hợp chính thức; không cài APK giả lập SUNMI. |
| beFood không thấy Agent | Giữ trạng thái chưa hỗ trợ; không bật bằng giả lập khi chưa có mẫu phiếu và kiểm thử xác nhận. |
| Đơn ShopeeFood cũ xuất hiện lại sau khi mở app | Dừng nhận đơn, đối chiếu mã bốn số và món/số lượng. Nếu thu ngân đã nhập tay, chọn **Đã nhập tay**; không xóa bản ghi nhận diện. |
| App máy in mạng không kết nối được | Kiểm tra Agent đang xanh, IP và cổng `9100`; cùng máy phải dùng `127.0.0.1`. |
| Agent không chuyển sang xanh | Cổng đang bị chiếm hoặc bind thất bại; xem nhật ký trong Agent rồi đổi cổng/cắt ứng dụng chiếm cổng. |
| Phiếu ở trạng thái Cần kiểm tra | Chụp/lưu mẫu phiếu, xác nhận app nguồn. Nếu đã nhập POS bằng tay, chọn **Đã nhập tay**; không đổi tay sang sàn khác rồi gửi lại. |
| POS không nhận đơn | Bấm **Kiểm tra POS**, kiểm tra Internet, URL, mã chi nhánh và Delivery Relay Secret. Phiếu hợp lệ sẽ tự gửi lại. |
| App sàn nằm trên máy khác | Bật Chế độ LAN và trỏ app sàn đến IP Wi-Fi của máy Agent; chỉ dùng trong mạng chi nhánh tin cậy. |

Mỗi sàn tại một chi nhánh chỉ dùng một luồng tiếp nhận để tránh chạy song song Agent và tiện ích trình duyệt.
