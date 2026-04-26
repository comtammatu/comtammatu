# Danh sách flow POS

| ID | Tên | Vai trò | Quyền cần | Trạng thái guide |
| --- | --- | --- | --- | --- |
| [POS-01](flows/pos-01-open-session.md) | Mở ca POS | Thu ngân, Quản lý CN | `pos:open_cashbox` | ✅ Đã có guide |
| POS-02 | Chọn bối cảnh bán hàng (tại bàn / mang về) | Phục vụ, Thu ngân | `pos:use` | ⏳ Phase tiếp |
| POS-03 | Tạo đơn mới + gửi bếp | Phục vụ, Thu ngân | `pos:use` | ⏳ Phase tiếp |
| POS-04 | Thêm món vào đơn đang phục vụ | Phục vụ, Thu ngân | `pos:use` | ⏳ Phase tiếp |
| POS-05 | Thanh toán đơn (tiền mặt / VietQR / MoMo) | Thu ngân | `pos:confirm_payment` | ⏳ Phase tiếp |
| POS-06 | Đánh dấu món đã phục vụ | Phục vụ, Thu ngân | `pos:use` | 📋 Backlog |
| POS-07 | Hủy món / Hủy đơn / Chuyển bàn | Thu ngân, Quản lý CN | `pos:void_item`, `pos:cancel_order` | 📋 Backlog |
| POS-08 | Xử lý mất mạng + lỗi máy in | Tất cả | — | 📋 Backlog |
| POS-09 | Đóng ca POS + đối soát tiền | Thu ngân, Quản lý CN | `pos:close_shift` | 📋 Backlog |

## Quy ước ID

- `POS-XX` — flow chính, đường đi hằng ngày.
- `POS-XX/V-...` — variant ngoại lệ trong flow đó (ví dụ `POS-01/V-all-occupied`).

## Cách thêm flow mới

1. Đặt ID kế tiếp.
2. Tạo file `flows/pos-XX-{slug}.md` theo template của [pos-01](flows/pos-01-open-session.md).
3. Tạo capture spec `apps/web/e2e/guides/pos-XX-{slug}.guide.ts` theo template của `pos-01-open-session.guide.ts`.
4. Chạy `pnpm --filter @comtammatu/web guides:capture --grep="POS-XX"` để sinh ảnh.
5. Cập nhật bảng trên + thêm dòng vào `pos/README.md`.
