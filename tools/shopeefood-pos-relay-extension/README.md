# ShopeeFood POS Relay — Chrome Extension

Tiện ích nhận dữ liệu đơn đầy đủ khi trang Shopee Partner tải đơn và chuyển về
POS. Phiên bản 1.2.0 bổ sung hàng đợi bền vững. Chưa xác minh tiếp nhận đơn
trực tiếp trên phiên Shopee Partner hiện hành; cần nghiệm thu trước khi dùng
tại quán.

## Phạm vi

- Nguồn trang: `partner.shopee.vn`, `partner.shopeefood.vn`,
  `merchant.shopeefood.vn` và các trang con `foodypos.com` đang được cấu hình.
- Chỉ nhận đơn có mã, danh sách món và số lượng hợp lệ. Danh sách tóm tắt
  không đủ món sẽ được bỏ qua, chờ trang tải chi tiết.
- Lưu đơn trước khi gửi. Khi mất mạng hoặc POS từ chối, giữ hàng đợi và thử
  lại sau 30 giây đến 5 phút. Trình duyệt phải đang chạy.
- Chỉ ghi nhận **đã nhận trên POS** khi máy chủ trả xác nhận kèm mã đơn POS.
  Đơn trùng được kiểm tra tại tiện ích và qua cơ chế chống trùng của POS.
- Chi nhánh và máy chủ được giữ theo cấu hình lúc nhận đơn. Đổi cấu hình sẽ
  giữ các đơn cũ chờ, không tự chuyển sang chi nhánh/máy chủ mới.
- Tiện ích không xác nhận, sửa, hủy, thanh toán đơn hoặc đồng bộ thực đơn
  trên sàn. Thu ngân vẫn thao tác bàn giao/thanh toán trên POS.
- beFood chưa có bộ nhận đơn trình duyệt được xác minh. Yêu cầu mở rộng được
  theo dõi tại `tasks/todo.md`; cần nguồn dữ liệu thực trước khi triển khai.

## Cài đặt và kiểm tra

1. Dùng Chrome/Edge từ phiên bản 120. Mở `chrome://extensions` hoặc
   `edge://extensions`, bật chế độ dành cho nhà phát triển và tải tiện ích
   chưa đóng gói từ `tools/shopeefood-pos-relay-extension`.
2. Mở popup. Dán địa chỉ POS có `/br/{mã chi nhánh}/pos` hoặc nhập địa chỉ
   HTTPS và mã chi nhánh chính xác. Môi trường thử nghiệm chấp nhận
   `http://localhost:3000`. Mã nhập riêng phải khớp mã trong đường dẫn.
3. Nhập khóa bảo mật của máy chủ, chọn **Lưu cấu hình** và
   **Kiểm tra kết nối**. Kiểm tra kết nối chỉ xác nhận máy chủ/khóa,
   không chứng minh trang Shopee Partner đang gửi đơn.
4. Mở trang đơn Shopee Partner và đăng nhập. Khi trang tải một đơn đầy đủ,
   tiện ích hiển thị số đơn chờ; popup chỉ liệt kê các đơn POS đã xác nhận.
5. Khi cập nhật, tải lại đúng tiện ích cùng ID rồi tải lại các tab Shopee.
   Giữ dữ liệu tiện ích để hàng đợi có thể tiếp tục.

## Xử lý đơn chờ

- **Không thể kết nối POS**: kiểm tra mạng và địa chỉ POS; đơn đã lưu sẽ
  tự thử lại.
- **POS từ chối xác thực**: cập nhật khóa bảo mật rồi lưu cấu hình.
- **Đơn cần kiểm tra trên POS**: đối chiếu mã đơn, món và giá kênh trên POS.
  Không nhập lại khi chưa đối chiếu đơn đã có.
- **Đơn đang giữ ở cấu hình cũ**: khôi phục đúng máy chủ và chi nhánh cũ để
  tiếp tục gửi; không đổi chi nhánh của đơn chờ.
- Hàng đợi giữ tối đa 300 đơn chưa xác nhận và không tự xóa các đơn này.
  Khi đầy hoặc không lưu được, huy hiệu báo lỗi; mở lại chi tiết đơn sau
  khi xử lý kết nối/dung lượng.
- Dấu xác nhận chống trùng được giữ tối đa 7 ngày/500 đơn; sau đó POS vẫn
  là nơi quyết định đơn đã tồn tại.

Chỉ dùng một nguồn nhận ShopeeFood cho mỗi chi nhánh. Không chạy đồng thời
tiện ích này với Má Tư Agent; xem
[`food-delivery-matu-agent.md`](../../docs/runbooks/food-delivery-matu-agent.md).
Phê duyệt tích hợp và nguồn dữ liệu theo
[`food-delivery-platform-onboarding.md`](../../docs/runbooks/food-delivery-platform-onboarding.md).
