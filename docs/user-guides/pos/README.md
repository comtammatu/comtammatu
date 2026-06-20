# Hướng dẫn POS — Bán hàng tại quầy

Hướng dẫn cho **thu ngân**, **phục vụ**, và **quản lý chi nhánh** vận hành màn hình POS hằng ngày.

## Trước khi đọc

- Bạn đã được tạo tài khoản và phân về một chi nhánh.
- Bạn biết URL/icon vào POS trên thiết bị (thường là biểu tượng "Bán hàng" trên trang nhân viên).
- Thiết bị đã đăng nhập wifi của quán.

## Cấu trúc tài liệu

| File                             | Nội dung                                           |
| -------------------------------- | -------------------------------------------------- |
| [flow-index.md](flow-index.md)   | Danh sách toàn bộ flow đã có guide                 |
| `flows/pos-XX-*.md`              | Hướng dẫn từng flow (mỗi file là một flow độc lập) |
| `mockups/pos-XX/*.png`           | Ảnh chụp iPhone của từng bước                      |
| [MAINTENANCE.md](MAINTENANCE.md) | Cách refresh ảnh khi UI POS đổi                    |

## Đọc theo vai trò

- **Thu ngân (cashier) mới vào ca:** đọc tuần tự `POS-01 → POS-02 → POS-03 → POS-05 → POS-09`.
- **Phục vụ (waiter):** chỉ đọc `POS-02 → POS-03 → POS-04`. Không đọc POS-01 (mở ca) và POS-05 (thanh toán).
- **Quản lý chi nhánh:** đọc tất cả + thêm `POS-08` (xử lý ngoại lệ) để training nhân viên.

## Phạm vi (đã hoàn thành)

### Đợt 1 — Đường đi hàng ngày

- [x] [POS-01 — Mở ca POS](flows/pos-01-open-session.md) (per-branch model D7)
- [x] [POS-02 — Chọn bối cảnh bán hàng (tại bàn / mang về)](flows/pos-02-select-context.md)
- [x] [POS-03 — Tạo đơn mới + gửi bếp](flows/pos-03-create-order.md)
- [x] [POS-04 — Thêm món vào đơn đang mở](flows/pos-04-append-items.md)
- [x] [POS-05 — Thanh toán đơn](flows/pos-05-payment.md)

### Đợt 2 — Vận hành nâng cao

- [x] [POS-07 — Sửa đơn (chuyển bàn / hủy / tách / gộp)](flows/pos-07-modify-order.md)
- [x] [POS-08 — Xử lý ngoại lệ (mất mạng / máy in / HĐĐT lỗi)](flows/pos-08-exceptions.md)
- [x] [POS-09 — Đóng ca POS + đối soát tiền](flows/pos-09-close-session.md)

**8 flows đã có guide. Tổng 39 mockup PNG.** Xem [flow-index.md](flow-index.md) để có ma trận quyền + status.
