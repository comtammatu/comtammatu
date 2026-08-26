# Hướng dẫn Vận hành Máy in Ảo SUNMI POS V3 (ShopeeFood / GrabFood Bridge)

> Tài liệu hướng dẫn thiết lập, cấu hình và vận hành dịch vụ Máy in Mạng LAN / WiFi Ảo (Virtual ESC/POS Network Printer) trên máy **SUNMI POS V3** cho chi nhánh Cơm Tấm Má Tư.

---

## 1. Tổng quan Kiến trúc Vận hành

Trên máy SUNMI POS V3 tại quầy thu ngân:
- Ứng dụng **Shopee Partner** (hoặc GrabMerchant) chạy trực tiếp trên máy.
- Ứng dụng **Cơm Tấm Má Tư POS Bridge Agent** chạy ngầm (Background Service), mở cổng TCP **9100** đóng vai trò là Máy in Mạng LAN / WiFi ảo.
- Khi có đơn hàng mới nổ trên Shopee Partner:
  1. Shopee Partner tự động gửi luồng in ESC/POS đến `127.0.0.1:9100`.
  2. Bridge Agent nhận luồng in $\rightarrow$ bóc tách món, giá, ghi chú $\rightarrow$ bắn Webhook về Cloud POS [`/api/webhooks/shopeefood/relay`](file:///c:/Users/thebi/Downloads/comtammatu/apps/web/app/api/webhooks/shopeefood/relay/route.ts).
  3. Đơn hàng hiện lên màn hình **KDS Bếp** và kích hoạt máy in bếp LAN.
  4. Bridge Agent đồng thời gọi **SUNMI SDK** để đầu in nhiệt trên máy V3 in ra bill giấy giao cho tài xế.

---

## 2. Hướng dẫn Cài đặt & Cấu hình (Dành cho Quản lý Quán / Kỹ thuật)

### Bước 1: Cài đặt ứng dụng Cơm Tấm Má Tư POS Bridge
1. Biên dịch và lấy file APK cài đặt (xem hướng dẫn build trong `tools/sunmi-pos-relay/README.md`) rồi cài vào máy SUNMI POS V3.
2. Mở ứng dụng để cài đặt.
3. Cấp các quyền cần thiết:
   - Cho phép chạy ngầm (Tắt tính năng Tối ưu hóa pin / Doze mode cho ứng dụng).
   - Cho phép tự khởi động khi mở máy (Autostart on boot).
4. Mở ứng dụng Bridge, nhập cấu hình:
   - **Địa chỉ máy chủ POS**: URL hệ thống (ví dụ: `https://pos.comtammatu.vn` hoặc `http://192.168.1.100:3000` trên mạng LAN).
   - **Mã chi nhánh (Branch ID)**: ID chi nhánh (ví dụ: `1` cho Nguyễn Hữu Thọ).
   - **Mã bảo mật (Relay Secret)**: Khóa bí mật `SHOPEE_RELAY_SECRET` được cấp cho chi nhánh.
   - **Chế độ LAN**: Mặc định **tắt** (cổng 9100 chỉ nhận lệnh in từ `127.0.0.1` trên cùng máy — an toàn nhất vì Shopee Partner chạy ngay trên máy V3). Chỉ bật khi máy in đơn nằm trên thiết bị khác trong mạng LAN chi nhánh.
5. Bấm **Bắt đầu Dịch vụ (Start Service)** $\rightarrow$ Màn hình hiển thị: `🟢 Virtual WiFi Printer running on port 9100`.

### Bước 2: Cấu hình Máy in trên App Shopee Partner
1. Mở ứng dụng **Shopee Partner** trên máy SUNMI V3.
2. Vào mục **Cài đặt (Settings)** $\rightarrow$ **Cài đặt máy in (Printer Settings)**.
3. Chọn **Thêm máy in mới** $\rightarrow$ Chọn loại kết nối: **Máy in Mạng LAN / WiFi (WiFi/LAN Thermal Printer)**.
4. Nhập thông tin kết nối:
   - **Địa chỉ IP**: `127.0.0.1` (chuẩn mặc định). Chỉ dùng IP WiFi cục bộ của máy SUNMI V3 khi đã bật **Chế độ LAN** trong app Bridge.
   - **Cổng (Port)**: `9100`.
   - **Khổ giấy**: `58mm` (hoặc `80mm` tùy dòng máy).
5. Bấm **In thử (Test Print)**:
   - Đầu in nhiệt SUNMI V3 sẽ in ra một phiếu in test.
   - Ứng dụng Bridge sẽ ghi nhận kết nối thành công.
6. Bật tùy chọn: **Tự động in khi có đơn mới (Auto-print on new order)** và **Số liên in: 1**.

---

## 3. Quy trình Vận hành Bán hàng Hàng ngày

### Quy trình khi Khách đặt đơn ShopeeFood
1. Khách đặt món trên ShopeeFood $\rightarrow$ App Shopee Partner trên máy SUNMI V3 phát chuông báo đơn mới.
2. Shopee Partner tự động nhận đơn (hoặc thu ngân bấm Xác nhận) $\rightarrow$ Lệnh in tự động phát ra.
3. **Tại quầy thu ngân**: Máy SUNMI V3 tự in ra bill giấy có mã đơn `SPF-xxx`.
4. **Tại khu vực Bếp**: Màn hình KDS Bếp lập tức hiển thị đơn hàng `[ShopeeFood SPF-xxx]` kèm danh sách món, số lượng, topping, ghi chú (ví dụ: *Nhiều mỡ hành, nướng cháy cạnh*) và cờ dụng cụ ăn uống. Máy in bếp LAN in phiếu chế biến.
5. **Tại quầy ra món**: Nhân viên kiểm tra đúng món, kẹp bill giấy ShopeeFood vào túi đồ ăn.
6. **Bàn giao tài xế**: Tài xế ShopeeFood đến đọc mã `SPF-xxx`, thu ngân đối chiếu và bàn giao túi món ăn.
7. **Trên POS Cơm Tấm Má Tư**: Đơn hàng nằm trong danh sách "Cần xử lý" ở trạng thái chưa thanh toán. Khi bàn giao cho tài xế, thu ngân bấm xác nhận thanh toán qua sàn (`confirm_platform_payment`) để hoàn tất đơn và xuất HĐĐT MTT.

---

## 4. Xử lý Sự cố Thường gặp (Troubleshooting)

| Sự cố | Nguyên nhân | Cách xử lý |
| :--- | :--- | :--- |
| **Shopee Partner báo không kết nối được máy in WiFi** | Dịch vụ Bridge Agent bị tắt, cổng 9100 bị chặn, hoặc sai chế độ mạng. | 1. Mở app Bridge Agent kiểm tra trạng thái xanh `🟢 Running`.<br>2. Kiểm tra lại IP `127.0.0.1` và Port `9100` trong Shopee Partner.<br>3. Nếu Shopee Partner nằm trên thiết bị khác, bật **Chế độ LAN** trong app Bridge rồi trỏ Shopee Partner về IP WiFi của máy V3.<br>4. Bấm In thử lại. |
| **Máy V3 in giấy nhưng KDS Bếp không nhận đơn** | Mất kết nối Internet hoặc sai `Relay Secret`. | 1. Kiểm tra kết nối WiFi của máy SUNMI V3.<br>2. Mở app Bridge Agent kiểm tra hàng đợi offline (Offline Queue). Các đơn chưa gửi sẽ tự động gửi lại khi có mạng.<br>3. Kiểm tra mã `Relay Secret` khớp với hệ thống. |
| **Đơn bị in lại (Reprint) có bị tạo trùng đơn trên POS không?** | Thu ngân bấm in lại bill trên Shopee Partner. | **Không**. Hệ thống đã có cơ chế Idempotency dựa trên mã đơn `SPF-xxx`. Khi nhận lại cùng mã đơn, POS sẽ phản hồi thành công mà không tạo thêm đơn mới. |
| **Khách hoặc Tài xế hủy đơn sau khi bếp đã làm xong** | Đơn bị hủy ngoài ý muốn. | 1. Giữ nguyên phần ăn đã làm + bill giấy có mã `SPF-xxx`.<br>2. Chụp ảnh rõ nét: Món ăn + Bill giấy.<br>3. Vào Shopee Partner $\rightarrow$ Trung tâm trợ giúp $\rightarrow$ Bồi thường đơn hàng bị hủy trong 24–48h để Shopee hoàn tiền vào Ví Quán.<br>4. Trên POS Cơm Tấm Má Tư: Quản lý thực hiện hủy đơn theo quy trình SOP hủy đơn giao hàng. |

---

## 5. Nguyên tắc Tránh Xung đột Kênh (No Dual-Run)

- **Nguyên tắc bắt buộc**: Mỗi sàn giao đồ ăn tại một chi nhánh **chỉ sử dụng 1 luồng tiếp nhận duy nhất**.
- Tại chi nhánh Nguyễn Hữu Thọ:
  - **ShopeeFood**: Tiếp nhận qua **SUNMI POS V3 Virtual WiFi Printer Bridge**. Tắt extension ShopeeFood trên trình duyệt máy tính thu ngân.
  - **GrabFood**: Tiếp nhận qua **Grab POS Relay Extension** trên máy thu ngân web (hoặc chuyển sang Bridge khi được kiểm duyệt).
