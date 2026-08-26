# SUNMI POS V3 Virtual WiFi / LAN ESC/POS Printer Bridge

Ứng dụng Android chạy nền (Background Service) trên thiết bị **SUNMI POS V3** giúp tự động bắt luồng in hóa đơn từ **Shopee Partner** (và các app giao đồ ăn khác) qua cổng TCP **9100** và chuyển tiếp dữ liệu về hệ thống POS & KDS Bếp Cơm Tấm Má Tư, đồng thời gọi **SUNMI Printer SDK** AIDL để in ra đầu in nhiệt trên máy.

---

## 1. Kiến trúc Kỹ thuật

```text
[Shopee Partner App trên SUNMI V3]
       │
       ▼ (Gửi lệnh in qua TCP Socket 127.0.0.1:9100)
[VirtualWifiPrinterService (TCP ServerSocket 9100)]
       │
       ├──► 1. Hàng đợi SQLite Offline (OrderQueueDbHelper)
       │         └──► WebhookDispatcher (Gửi Webhook `/api/webhooks/shopeefood/relay` + Retry)
       │                 ├──► Màn hình KDS Bếp & In phiếu Bếp LAN
       │                 └──► Xếp hàng xuất HĐĐT MTT
       │
       └──► 2. SUNMI AIDL SDK (SunmiPrinterService.sendRAWData)
                 └──► Đầu in nhiệt SUNMI V3 (Bill giấy cho tài xế)
```

---

## 2. Hướng dẫn Biên dịch (Build APK)

Dự án sử dụng Gradle Wrapper tiêu chuẩn cho Android. Để build file APK cài đặt:

```bash
cd tools/sunmi-pos-relay
./gradlew assembleRelease
# Hoặc build bản Debug:
./gradlew assembleDebug
```

File APK đầu ra sẽ nằm tại: `tools/sunmi-pos-relay/app/build/outputs/apk/release/app-release.apk` (hoặc `app-debug.apk`).

---

## 3. Cấu hình & Thiết lập

1. **Trên ứng dụng Cơm Tấm Má Tư Bridge**:
   - `Backend URL`: URL máy chủ POS (ví dụ: `https://pos.comtammatu.vn` hoặc `http://192.168.1.100:3000`).
   - `Branch ID`: ID chi nhánh (mặc định `1`).
   - `Relay Secret`: Khóa bí mật `SHOPEE_RELAY_SECRET` cấu hình trong `.env`.
   - `Listen Port`: Cổng máy in mạng (mặc định `9100`).
   - `Chế độ LAN`: Mặc định **tắt** — cổng 9100 chỉ nhận lệnh in từ `127.0.0.1` (ứng dụng trên cùng máy). Chỉ bật khi Shopee Partner chạy trên thiết bị khác trong mạng LAN; khi đó cấu hình Shopee Partner trỏ về IP WiFi của máy SUNMI.
2. **Trên ứng dụng Shopee Partner**:
   - Vào **Cài đặt** $\rightarrow$ **Cài đặt máy in** $\rightarrow$ **Thêm máy in WiFi / Mạng LAN**.
   - IP: `127.0.0.1` (hoặc IP WiFi của máy khi bật Chế độ LAN), Cổng: `9100`, Khổ giấy: `58mm` / `80mm`.
   - Bật **Tự động in khi có đơn mới**.

---

## 4. Xử lý Chống Tắt Ứng Dụng & Chống Mất Đơn (Doze Mode & Reliability)

- Sử dụng **Foreground Service** với Notification ghim cố định `🟢 Cơm Tấm Má Tư Printer Bridge đang trực đơn`.
- Yêu cầu quyền `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` để không bị Android Doze Mode đóng băng tiến trình mạng khi tắt màn hình.
- Đăng ký `BootCompletedReceiver` để tự khởi chạy dịch vụ khi bật máy SUNMI V3 (cấu hình backend được đọc lại từ SharedPreferences khi dịch vụ tự khởi động).
- Hàng đợi **Offline Queue (SQLite - `OrderQueueDbHelper`)** tự động lưu trữ mọi đơn hàng khi nhận được luồng in và chạy vòng lặp retry ngầm với exponential backoff có trần 15 phút; đơn giữ trạng thái `PENDING` cho tới khi gửi thành công, không bao giờ bị đánh dấu bỏ cuộc.
- Mỗi đơn được claim nguyên tử (`PENDING → SENDING`) trước khi POST để luồng dispatch ban đầu và vòng lặp retry không gửi trùng song song; claim quá hạn được hoàn về `PENDING`.
- Luồng in vượt 256 KB bị ngắt kết nối để chống lạm dụng bộ nhớ.
