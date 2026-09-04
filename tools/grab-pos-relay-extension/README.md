# Grab POS Relay — Chrome Extension cho Cơm Tấm Má Tư

Tiện ích mở rộng Chrome/Edge giúp **tự động bắt đơn hàng từ GrabMerchant Web và đẩy thẳng sang KDS Bếp & Máy in Cơm Tấm Má Tư**, loại bỏ 100% việc nhân viên phải gõ lại đơn thủ công.

---

## 🚀 Hướng Dẫn Cài Đặt (30 Giây)

### Bước 1: Mở trang quản lý Tiện ích trên trình duyệt
* **Google Chrome / Cốc Cốc:** Mở tab mới, nhập `chrome://extensions` rồi nhấn Enter.
* **Microsoft Edge:** Mở tab mới, nhập `edge://extensions` rồi nhấn Enter.

### Bước 2: Bật "Chế độ cho nhà phát triển" (Developer mode)
* Gạt công tắc **Chế độ cho nhà phát triển (Developer mode)** ở góc trên bên phải màn hình sang **BẬT (ON)**.

### Bước 3: Tải tiện ích vào trình duyệt
1. Nhấn vào nút **Tải tiện ích đã giải nén (Load unpacked)** ở góc trên bên trái.
2. Chọn thư mục:
   `c:\Users\thebi\Downloads\comtammatu\tools\grab-pos-relay-extension`
3. Nhấn **Select Folder (Chọn thư mục)**.

---

## 🎯 Cách Sử Dụng Khi Bán Hàng

1. Đăng nhập vào trang quản lý quán: **[https://merchant.grab.com](https://merchant.grab.com)**.
2. Bạn sẽ thấy góc dưới cùng bên phải màn hình xuất hiện huy hiệu trạng thái:
   `🟢 Cơm Tấm Má Tư POS Relay: Đang trực đơn...`
3. Khi khách đặt món và Grab nổ chuông:
   * Tiện ích sẽ **ngay lập tức bắt lấy đơn hàng**, lấy đầy đủ món chính, món ăn kèm (topping), ghi chú (vd: "Hi quán").
   * Chuyển tiếp thẳng vào hệ thống Cơm Tấm Má Tư để **in bill bếp** và **hiện lên màn hình KDS**.
   * Huy hiệu đổi sang: `✅ Đã đẩy GF-725 vào Bếp & Máy in!`.

---

## ⚙️ Cấu Hình (Tùy Chọn)
* Bấm vào biểu tượng Tiện ích trên thanh công cụ Chrome:
  * **Địa chỉ máy chủ POS:** Mặc định `http://localhost:3000` (hoặc domain Production).
  * **Chi nhánh (Branch ID):** Nhập ID từ URL POS của đúng chi nhánh. Tiện ích sẽ không gửi đơn nếu chưa cấu hình.
  * Xem danh sách các đơn Grab vừa nhận gần nhất.

---

## Cập nhật phiên bản (quầy đang chạy)

Không Remove tiện ích và không Load unpacked đường dẫn khác — việc đó xóa `chrome.storage` và đẩy lại cả menu lên Grab.

1. Vào `chrome://extensions`, bấm **Reload** đúng tiện ích đang cài (cùng id).
2. Tải lại tab `merchant.grab.com` (F5) để `injected.js` khớp phiên bản mới.
3. Nếu ping POS thất bại sau bản 1.2.0 trở lên, mở popup bấm **Kiểm tra** một lần để cấp quyền origin máy chủ.
4. Bản **1.2.2** giảm tần suất gọi Grab API (poll an toàn 15 giây, hủy đơn 45 giây, backoff khi 403/429). Reload tiện ích rồi F5 tab Grab Merchant.
5. Bản **1.2.3** gửi lại header phiên/identity mà portal vừa dùng (GrabID, MFE, CSRF), không copy `x-request-id` cũ. Cần Reload + F5 nếu poll của tiện ích vẫn 403 trong khi portal chạy bình thường.
6. Bản **1.2.4** không lấy nhầm `v2`/`v3`/`v4` từ path API Grab làm merchant ID. Reload + F5 bắt buộc.
