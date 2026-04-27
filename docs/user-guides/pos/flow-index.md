# Danh sách flow POS

| ID | Tên | Vai trò | Quyền cần | Trạng thái guide |
| --- | --- | --- | --- | --- |
| [POS-01](flows/pos-01-open-session.md) | Mở ca POS (per-branch model D7) | Thu ngân, Quản lý CN | `pos:open_cashbox` | ✅ Đã có guide |
| [POS-02](flows/pos-02-select-context.md) | Chọn bối cảnh bán hàng (tại bàn / mang về) | Phục vụ, Thu ngân | `pos:use` | ✅ Đã có guide |
| [POS-03](flows/pos-03-create-order.md) | Tạo đơn mới + gửi bếp | Phục vụ, Thu ngân | `pos:use` | ✅ Đã có guide |
| [POS-04](flows/pos-04-append-items.md) | Thêm món vào đơn đang phục vụ | Phục vụ, Thu ngân | `pos:use` | ✅ Đã có guide |
| [POS-05](flows/pos-05-payment.md) | Thanh toán đơn (tiền mặt / chuyển khoản + HĐĐT) | Thu ngân | `pos:confirm_payment` | ✅ Đã có guide |
| [POS-06](flows/pos-06-mark-served.md) | Đánh dấu đã phục vụ (audit, ≠ thanh toán) | Phục vụ, Thu ngân | `pos:use` | ✅ Đã có guide |
| [POS-07](flows/pos-07-modify-order.md) | Sửa đơn (chuyển bàn / hủy / tách / gộp) | Thu ngân, Quản lý CN | `pos:use`, `pos:cancel_order` | ✅ Đã có guide |
| [POS-08](flows/pos-08-exceptions.md) | Xử lý ngoại lệ (mất mạng / máy in / HĐĐT lỗi) | Tất cả | — | ✅ Đã có guide |
| [POS-09](flows/pos-09-close-session.md) | Đóng ca POS + đối soát tiền | Thu ngân, Quản lý CN | `pos:close_shift` | ✅ Đã có guide |

## Quy ước ID

- `POS-XX` — flow chính, đường đi hằng ngày.
- `POS-XX/V-...` — variant ngoại lệ trong flow đó (ví dụ `POS-01/V-all-occupied`).

## Cách thêm flow mới

1. Đặt ID kế tiếp.
2. Tạo file `flows/pos-XX-{slug}.md` theo template của [pos-01](flows/pos-01-open-session.md).
3. Tạo capture spec `apps/web/e2e/guides/pos-XX-{slug}.guide.ts` theo template của `pos-01-open-session.guide.ts`.
4. Chạy `pnpm --filter @comtammatu/web guides:capture --grep="POS-XX"` để sinh ảnh.
5. Cập nhật bảng trên + thêm dòng vào `pos/README.md`.
