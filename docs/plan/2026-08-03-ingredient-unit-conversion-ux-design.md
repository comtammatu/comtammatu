# Cho phép quy đổi nguyên liệu qua đơn vị trung gian

Tài liệu này mô tả luồng thêm, sửa và gỡ đơn vị trên nguyên liệu. Mỗi đơn vị có thể quy đổi sang một đơn vị khác đã chọn, trong khi hệ thống vẫn tính và lưu hệ số về đơn vị chuẩn.

## Mục tiêu và phạm vi

Owner cấu hình quy cách thực tế như `1 Thùng = 24 Chai` và `1 Chai = 250 ml`. Form hiển thị kết quả suy ra `1 Thùng = 6.000 ml` để Owner kiểm tra trước khi lưu.

Thay đổi áp dụng cho form tạo và sửa nguyên liệu tại `/inventory/ingredients` trên desktop và tablet. Phạm vi gồm chọn đơn vị chuẩn, thêm đơn vị, sửa quan hệ quy đổi, gỡ đơn vị và đổi đơn vị chuẩn.

Thay đổi không sửa cách sổ kho lưu số lượng, giá vốn bình quân hoặc snapshot trên chứng từ. `ingredient_units.to_base_factor` vẫn là hệ số hiệu lực về đơn vị chuẩn.

## Mô hình quy đổi

Mỗi đơn vị không phải đơn vị chuẩn khai báo một quan hệ:

```text
1 [đơn vị nguồn] = [hệ số] [đơn vị đích]
```

Đơn vị đích phải thuộc cùng nguyên liệu. Chuỗi quy đổi phải kết thúc tại đơn vị chuẩn hoặc tại một đơn vị đo chuẩn cùng hệ đo có thể suy ra đơn vị chuẩn.

Ví dụ hợp lệ:

```text
1 Thùng = 24 Chai
1 Chai = 250 ml
ml = Đơn vị chuẩn
```

Hệ thống suy ra và lưu:

```text
1 Thùng = 6.000 ml
1 Chai = 250 ml
1 ml = 1 ml
```

Hệ thống từ chối quan hệ tự trỏ, chuỗi thiếu đích và vòng lặp như `Thùng → Chai → Thùng`.

## Luồng giao diện

Phần **Đơn vị và quy đổi** dùng một danh sách duy nhất. Mỗi dòng hiển thị tên đơn vị và một trong hai trạng thái:

- Đơn vị chuẩn: nhãn **Đơn vị chuẩn**, không có trường hệ số
- Đơn vị quy đổi: trường số lượng và bộ chọn **Quy đổi sang**

Mỗi dòng quy đổi có dạng:

```text
Thùng    1 Thùng = [24] [Chai ▾]
          Suy ra: 1 Thùng = 6.000 ml
```

Bộ chọn đích chỉ hiển thị các đơn vị đã thêm vào nguyên liệu. Bộ chọn loại đơn vị hiện tại và các lựa chọn tạo vòng lặp. Server vẫn kiểm tra lại toàn bộ chuỗi khi lưu.

Form dùng một hành động chính là **Tạo** hoặc **Cập nhật**. Hành động gỡ đơn vị nằm riêng ở cuối dòng và có tên truy cập đầy đủ cho bàn phím, trình đọc màn hình và vùng chạm.

## Thêm đơn vị

Owner chọn một đơn vị từ danh mục dùng chung. Form thêm dòng mới và yêu cầu chọn đơn vị đích nếu hệ thống không thể tự suy ra quan hệ.

Nếu đơn vị mới và đơn vị chuẩn đều là đơn vị đo chuẩn cùng hệ đo, form mặc định dùng hệ số hệ thống. Dòng hiển thị nhãn **Tự động** và kết quả suy ra. Owner vẫn có thể chọn một đơn vị đích khác trong nguyên liệu; khi đó form chuyển dòng sang quy đổi đã khai báo.

Đơn vị đầu tiên của nguyên liệu trở thành đơn vị chuẩn. Khi có từ hai đơn vị, Owner có thể chọn lại đơn vị chuẩn trong cùng danh sách.

## Sửa quy đổi

Form đọc và giữ nguyên `anchor_unit_id` cùng `anchor_factor` đã lưu. Mở lại nguyên liệu có chuỗi `Thùng → Chai → ml` phải hiển thị đúng chuỗi đó, không chuyển thành hai quan hệ trực tiếp về `ml`.

Khi Owner thay hệ số hoặc đơn vị đích, form tính lại kết quả về đơn vị chuẩn cho dòng đó và mọi dòng phụ thuộc. Các bản xem trước cập nhật trước khi Owner lưu.

Nếu một dòng chưa có hệ số hợp lệ hoặc chưa có đơn vị đích, form đánh dấu đúng dòng và chặn hành động lưu. Thông báo dùng tên đơn vị và hành động khắc phục.

## Gỡ đơn vị

Nếu không có dòng nào quy đổi tới đơn vị cần gỡ, form gỡ dòng khỏi bản nháp. Owner có thể đóng form để bỏ toàn bộ thay đổi chưa lưu.

Nếu đơn vị là đích của dòng khác, form không gỡ ngay. Form chỉ ra các đơn vị phụ thuộc và yêu cầu Owner đổi đích của chúng trước.

Nếu đơn vị đang được định mức món bán hoặc công thức sản xuất tham chiếu, server từ chối khi lưu. UI hiển thị thông báo nghiệp vụ và giữ form mở để Owner chọn cách xử lý khác.

## Đổi đơn vị chuẩn

Khi Owner chọn đơn vị chuẩn mới, form giữ nguyên mọi tỷ lệ vật lý đã suy ra trước đó. Form áp dụng các quy tắc sau:

1. Gỡ quan hệ đi ra từ đơn vị chuẩn mới và đặt hệ số hiệu lực của nó thành `1`
2. Giữ các quan hệ hiện có nếu chuỗi của chúng vẫn đi tới đơn vị chuẩn mới
3. Nối trực tiếp các chuỗi không còn đường tới đơn vị chuẩn mới bằng tỷ lệ đã quy đổi lại
4. Hiển thị bản xem trước của mọi dòng bị thay đổi

Ví dụ khi đổi đơn vị chuẩn từ `ml` sang `Chai`:

```text
1 Thùng = 24 Chai
Chai = Đơn vị chuẩn
1 ml = 0,004 Chai
```

Hành động lưu tiếp tục gọi RPC danh mục hiện tại. RPC quy đổi tồn, ngưỡng và giá vốn theo hợp đồng đang có.

## Dữ liệu và biên xử lý

Client gửi mỗi dòng với `unit_id`, `is_base`, `anchor_unit_id` và `anchor_factor`. Client có thể gửi `to_base_factor` để kiểm tra trước, nhưng RPC là nguồn xác nhận hệ số hiệu lực.

RPC duyệt chuỗi neo, nhân hệ số qua từng bước và ghi `to_base_factor`. RPC phải giữ các kiểm tra tenant, quyền danh mục, đơn vị thiếu, sai hệ đo và vòng lặp.

Thiết kế không cần thêm cột dữ liệu. Phần đọc nguyên liệu đã trả về `anchor_unit_id` và `anchor_factor`; phần form hiện bỏ qua hai giá trị này và phải được sửa để giữ quan hệ đã lưu.

Tài liệu `docs/ref/inventory.md` phải thay hợp đồng hình sao bằng chuỗi neo không vòng lặp. Đơn vị chuẩn vẫn là điểm quy chiếu cuối cho tồn kho và giá vốn.

## Trạng thái và thông báo lỗi

Form phải xử lý các trạng thái sau:

- Đang tải dữ liệu đơn vị dùng chung
- Không còn đơn vị nào để thêm
- Dòng mới chưa chọn đơn vị đích
- Hệ số bằng `0`, âm, không phải số hoặc vượt độ chính xác cho phép
- Quan hệ tự trỏ hoặc tạo vòng lặp
- Đơn vị đích đã bị gỡ khỏi nguyên liệu
- Sai hệ đo giữa các đơn vị chuẩn
- Đơn vị đang được định mức hoặc công thức tham chiếu
- Lưu thất bại và cho phép thử lại mà không mất dữ liệu đã nhập

UI không hiển thị mã lỗi PostgreSQL hoặc thông báo thô từ cơ sở dữ liệu.

## Kiểm thử và bằng chứng

Kiểm thử mô hình form phải chứng minh:

- `Thùng → Chai → ml` tạo hệ số hiệu lực `6.000`, `250` và `1`
- Mở lại dữ liệu giữ nguyên đơn vị đích và hệ số đã nhập
- Sửa `Chai` từ `250 ml` thành `330 ml` cập nhật bản xem trước của `Thùng`
- Quan hệ tự trỏ, vòng lặp hai bước và vòng lặp nhiều bước bị chặn
- Gỡ một đơn vị đích bị chặn cho đến khi các dòng phụ thuộc được đổi đích
- Đổi đơn vị chuẩn giữ nguyên tỷ lệ vật lý
- Quy đổi tự động `kg ↔ g` và `l ↔ ml` vẫn đúng
- Payload có đúng một đơn vị chuẩn và mọi đơn vị khác có chuỗi hợp lệ

Kiểm thử giao diện cần bao phủ thao tác bàn phím, tên truy cập, thông báo lỗi theo dòng và vùng chạm trên tablet. Kiểm thử tích hợp cần xác nhận RPC lưu chuỗi neo và trả lại đúng quan hệ khi mở form lần sau.

## Tiêu chí hoàn thành

Luồng hoàn thành khi Owner có thể lưu ví dụ `1 Thùng = 24 Chai`, `1 Chai = 250 ml`, xem kết quả `1 Thùng = 6.000 ml`, đóng rồi mở lại form mà quan hệ không bị chuyển về đơn vị chuẩn. Các thay đổi hệ số, gỡ đơn vị và đổi đơn vị chuẩn phải giữ dữ liệu nhất quán hoặc trả về hướng khắc phục cụ thể.

## Phạm vi triển khai dự kiến

Các thay đổi tập trung tại mô hình form, dialog nguyên liệu, thông báo Inventory và kiểm thử liên quan. Hợp đồng Inventory được cập nhật để phản ánh chuỗi neo đã được RPC hỗ trợ. Thiết kế không yêu cầu migration mới.
