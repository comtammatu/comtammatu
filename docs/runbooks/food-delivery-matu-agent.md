# Vận hành Má Tư Agent cho app giao đồ ăn

Má Tư Agent biến một máy Android thông thường thành máy in mạng ESC/POS ảo. ShopeeFood, GreenSM Food và beFood gửi phiếu in trực tiếp đến Agent; Agent nhận diện nguồn sàn, giữ phiếu trong hàng đợi cục bộ và chuyển đơn về POS/KDS. Không cần máy SUNMI và Agent không in giấy tại thiết bị Android.

## Cài đặt

1. Cài APK từ `tools/matu-agent/app/build/outputs/apk/debug/app-debug.apk` lên máy Android, ví dụ Redmi Note 13.
2. Cho phép ứng dụng chạy nền và tự khởi động. Tắt tối ưu pin cho Má Tư Agent nếu hệ điều hành thường dừng ứng dụng nền.
3. Mở Má Tư Agent và nhập URL máy chủ POS, mã chi nhánh, Delivery Relay Secret và cổng `9100`.
4. Giữ **Chế độ LAN** tắt nếu app sàn nằm cùng máy. Bật chế độ này chỉ khi app sàn nằm trên một thiết bị khác trong cùng mạng tin cậy.
5. Bấm **Bắt đầu máy in ảo**. Chỉ khi cổng đã bind thành công, trạng thái mới chuyển sang màu xanh.
6. Trong **Cấu hình từng sàn**, chỉ bật các sàn đang vận hành tại máy này. Phiếu
   của sàn đã tắt được giữ ở **Đang chờ** để kiểm tra và không chuyển lên POS.

## Cấu hình app sàn

Trong phần cài đặt máy in mạng/Wi-Fi của từng app sàn:

- Cùng máy Android với Agent: IP `127.0.0.1`, cổng `9100`.
- Khác máy: bật Chế độ LAN trong Agent, dùng IP Wi-Fi của máy chạy Agent và cổng `9100`.
- Khi bật Chế độ LAN, Agent tự công bố tên máy in `Má Tư Agent` qua DNS-SD.
  App sàn có hỗ trợ dò máy in mạng có thể tự hiển thị tên này; app không hỗ trợ
  DNS-SD vẫn phải nhập IP/cổng theo hướng dẫn của chính app sàn.
- Bật tự động in đơn mới nếu app sàn hỗ trợ.

Bấm **Kiểm tra cổng in** trong Agent để xác nhận cổng cục bộ đang nhận kết nối. Thao tác này không tạo đơn giả trên POS.

Mục **Đơn hàng** tách **Đang chờ** và **Đã xuất**. Chạm một đơn để xem nội dung
OCR, lỗi gần nhất và phản hồi POS; đơn đang chờ gửi có thể chọn **Gửi lại ngay**.

## Nhận diện và chuyển phiếu

Agent chỉ gửi phiếu khi nhận diện được duy nhất một nguồn:

| Nguồn | Chữ ký ví dụ |
| --- | --- |
| ShopeeFood | `ShopeeFood`, `ShopeePay`, mã `SPF-...` |
| GreenSM Food | `GreenSM Food`, `Xanh SM`, mã `GSM-...` |
| beFood | `beFood`, `Be Food`, mã `BE-...` hoặc `BF-...` |

Phiếu không có chữ ký hoặc chứa chữ ký xung đột được giữ tại hàng đợi với trạng thái **Chưa rõ sàn** và không được đẩy lên POS. Kỹ thuật cần xem nhật ký và bổ sung mẫu nhận diện bằng bài kiểm thử trước khi mở rộng.

## Xử lý sự cố

| Sự cố | Cách xử lý |
| --- | --- |
| App sàn không kết nối được | Kiểm tra Agent đang xanh, IP và cổng `9100`; cùng máy phải dùng `127.0.0.1`. |
| Agent không chuyển sang xanh | Cổng đang bị chiếm hoặc bind thất bại; xem nhật ký trong Agent rồi đổi cổng/cắt ứng dụng chiếm cổng. |
| Phiếu ở trạng thái Chưa rõ sàn | Chụp/lưu mẫu phiếu, xác nhận app nguồn và chuyển kỹ thuật bổ sung chữ ký. Không đổi tay sang sàn khác. |
| POS không nhận đơn | Bấm **Kiểm tra POS**, kiểm tra Internet, URL, mã chi nhánh và Delivery Relay Secret. Phiếu hợp lệ sẽ tự gửi lại. |
| App sàn nằm trên máy khác | Bật Chế độ LAN và trỏ app sàn đến IP Wi-Fi của máy Agent; chỉ dùng trong mạng chi nhánh tin cậy. |

Mỗi sàn tại một chi nhánh chỉ dùng một luồng tiếp nhận để tránh chạy song song Agent và tiện ích trình duyệt.
