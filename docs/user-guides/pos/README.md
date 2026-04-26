# Hướng dẫn POS — Bán hàng tại quầy

Hướng dẫn cho **thu ngân**, **phục vụ**, và **quản lý chi nhánh** vận hành màn hình POS hằng ngày.

## Trước khi đọc

- Bạn đã được tạo tài khoản và phân về một chi nhánh.
- Bạn biết URL/icon vào POS trên thiết bị (thường là biểu tượng "Bán hàng" trên trang nhân viên).
- Thiết bị đã đăng nhập wifi của quán.

## Cấu trúc tài liệu

| File | Nội dung |
| --- | --- |
| [flow-index.md](flow-index.md) | Danh sách toàn bộ flow đã có guide |
| `flows/pos-XX-*.md` | Hướng dẫn từng flow (mỗi file là một flow độc lập) |
| `mockups/pos-XX/*.png` | Ảnh chụp iPhone của từng bước |
| [MAINTENANCE.md](MAINTENANCE.md) | Cách refresh ảnh khi UI POS đổi |

## Đọc theo vai trò

- **Thu ngân (cashier) mới vào ca:** đọc tuần tự `POS-01 → POS-02 → POS-03 → POS-05 → POS-09`.
- **Phục vụ (waiter):** chỉ đọc `POS-02 → POS-03 → POS-04 → POS-06`. Không đọc POS-01 (mở ca) và POS-05 (thanh toán).
- **Quản lý chi nhánh:** đọc tất cả + thêm `POS-08` (xử lý ngoại lệ) để training nhân viên.

## Phạm vi đợt 1 (đang phát triển)

- [x] [POS-01 — Mở ca POS](flows/pos-01-open-session.md)
- [ ] POS-02 — Chọn bối cảnh bán hàng (tại bàn / mang về)
- [ ] POS-03 — Tạo đơn mới
- [ ] POS-04 — Thêm món vào đơn đang phục vụ
- [ ] POS-05 — Thanh toán

Phase sau: POS-06 (đánh dấu phục vụ), POS-07 (xử lý ngoại lệ), POS-08 (đóng ca).
