# Hướng dẫn sử dụng (User Guides)

Tài liệu thao tác từng bước cho **nhân viên vận hành** — không phải tài liệu kỹ thuật.

## Đối tượng đọc

- Thu ngân, phục vụ, quản lý chi nhánh, quản lý kho, bếp.
- Đọc trên điện thoại trong giờ làm việc, hoặc dùng để đào tạo nhân viên mới.

## Định dạng

Mỗi flow gồm:

- **Tóm tắt:** vai trò, quyền cần, điều kiện trước, kết quả.
- **Các bước:** từng bước có mockup iPhone + mô tả thao tác + phản hồi hệ thống.
- **Tình huống ngoại lệ:** lỗi quyền, dữ liệu thiếu, mạng yếu, v.v.
- **Metadata mockup:** viewport, lệnh capture, ngày cập nhật ảnh — để biết khi nào tài liệu bị stale.

Mockup là **screenshot thật** chụp từ ứng dụng đang chạy (Playwright) rồi ghép khung iPhone + chú thích bên ngoài. Không vẽ tay, không dựng lại bằng Figma — để guide không bao giờ lệch UI thật.

## Module có sẵn

- [POS — Bán hàng tại quầy](pos/README.md) (đang phát triển)

## Quy ước viết

- Tiếng Việt thuần, không dùng từ kỹ thuật (`session`, `RPC`, `RLS`...). Khi bắt buộc phải dùng → giải thích trong dấu ngoặc.
- Câu mệnh lệnh ngắn ("Chạm...", "Gõ...", "Chọn..."), không dùng "vui lòng".
- Dùng số tiền VND có dấu chấm phân tách (`500.000đ`), không dùng dấu phẩy.
- Mọi cảnh báo/quy tắc nghiệp vụ quan trọng đặt trong block `> ⚠️` để người đọc không bỏ qua.

## Bảo trì

Khi UI thay đổi:

1. Cập nhật code POS như bình thường.
2. Chạy lại lệnh capture của flow bị ảnh hưởng (xem mục **Metadata mockup** ở cuối mỗi flow).
3. Đọc lại text trong flow xem có chỗ nào sai logic mới không.
4. Cập nhật ngày capture + commit SHA trong block metadata.

Chi tiết workflow capture: [pos/MAINTENANCE.md](pos/MAINTENANCE.md).
