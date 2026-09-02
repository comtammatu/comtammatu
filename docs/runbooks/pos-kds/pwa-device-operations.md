# Vận hành PWA trên thiết bị chi nhánh

Runbook này dùng để cài đúng launcher, kiểm tra khả năng khôi phục và xử lý
PWA bị hệ điều hành dừng. Quy tắc cache/offline và phạm vi thiết bị chuẩn nằm
trong `docs/spec/pwa.md`.

## Phạm vi thiết bị

- Android 13+ và Chrome 120+ là nền tảng chính cho POS và KDS.
- Pickup dùng URL kiosk trên Android TV/Chrome; launcher kiểu ứng dụng không
  được đảm bảo trên mọi Android TV.
- iOS Home Screen chỉ dùng cho `/me` và công việc quản lý chi nhánh trên điện
  thoại. Không dùng iPhone/iPad làm POS, KDS hoặc màn hình Pickup.
- Máy phải cắm nguồn trong ca. KDS và Pickup chỉ giữ màn hình thức khi trang còn
  hiển thị; Wake Lock không thể chống lại việc HyperOS dừng Chrome/PWA.

## Cài đúng launcher

1. Mở đúng URL theo vai trò và chi nhánh; không cài ứng dụng gốc `/` lên máy
   trạm của chi nhánh.
2. Cài launcher từ chính trang POS, KDS, Pickup hoặc `/me`. Kiểm tra tên và biểu
   tượng đúng vai trò trước khi đưa máy vào ca.
3. Mở launcher vừa cài và xác nhận URL vẫn thuộc đúng chi nhánh. Không suy ra
   chi nhánh từ tên cửa hàng hoặc vị trí trong danh sách.
4. Nếu có thông báo phiên bản mới, tải lại trước ca rồi kiểm tra lại màn hình
   chính. Không tiếp tục dùng nhiều tab cũ của cùng một trạm.

## Cấu hình Android và HyperOS

Tên mục có thể khác theo phiên bản HyperOS. Áp dụng cho Chrome và mục PWA nếu
hệ điều hành liệt kê PWA như một ứng dụng riêng:

1. Đặt pin thành **Không hạn chế**.
2. Bật **Tự khởi động** nếu thiết bị cung cấp công tắc này.
3. Cho phép giữ màn hình sáng hoặc đặt thời gian tắt màn hình phù hợp với ca.
4. Khóa launcher trong danh sách ứng dụng gần đây nếu HyperOS hỗ trợ.
5. Không dùng **Buộc dừng**. Sau khi người dùng buộc dừng, phải mở lại launcher
   bằng tay.

PWA không có foreground service như Má Tư Agent. Nếu Chrome/PWA vẫn bị dừng lặp
lại dù cấu hình đúng, ghi nhận sự cố và đánh giá trigger native Android theo
ADR 0038; không mở rộng cache để che lỗi hệ điều hành.

## Kiểm tra trước ca

1. Cắm nguồn, kết nối đúng Wi-Fi và mở duy nhất launcher của trạm.
2. Xác nhận không có banner mất mạng hoặc cập nhật đang chờ.
3. POS: mở danh sách đơn và đối chiếu một đơn đang hoạt động với server.
4. KDS: đối chiếu số phiếu đang chờ; thử âm thanh bằng luồng kiểm thử được phép.
5. Pickup: đối chiếu số đang chờ/đã gọi với KDS hoặc POS.
6. Mở Chrome DevTools khi chạy canary và lưu ảnh Network/WebSocket; không ghi
   token, nội dung thanh toán hoặc dữ liệu khách hàng vào biên bản.

## Ma trận kiểm thử canary

Chạy trên một chi nhánh được chọn bằng cấu hình tin cậy, không hardcode ID. Mỗi
kịch bản thực hiện năm vòng điều hướng hoặc resume để phát hiện channel/timer
tăng dần.

| Kịch bản | POS | KDS | Pickup / `/me` |
| --- | --- | --- | --- |
| Tắt Wi-Fi rồi bật lại | Đơn hội tụ sau refresh | Snapshot hội tụ, không phát chuông phiếu mới do recovery | Bảng hội tụ; `/me` tải lại được |
| Đưa app nền 2 phút rồi mở lại | Refresh ngay khi visible | Snapshot ngay khi visible | Refresh ngay khi visible |
| Tắt màn hình 10 phút rồi mở | Không giữ trạng thái cũ làm nguồn thật | Đối chiếu toàn bộ phiếu đang chờ | Đối chiếu toàn bộ bảng |
| Vuốt khỏi ứng dụng gần đây rồi mở launcher | Khởi động sạch, đúng chi nhánh | Khởi động sạch, đúng chi nhánh | Khởi động sạch |
| HyperOS dừng tiến trình | Mở lại bằng tay và đối chiếu | Mở lại bằng tay và đối chiếu | Mở lại bằng tay và đối chiếu |
| Có service-worker mới | Tải lại qua banner, không mất mutation | Tải lại và lấy snapshot | Tải lại đúng launcher |

Trong lúc có banner mất mạng hoặc dữ liệu chưa đối chiếu xong, không xác nhận
thanh toán, hoàn tất phiếu hoặc thực hiện thao tác tồn kho. PWA không có hàng đợi
mutation offline.

## Ghi bằng chứng

Với mỗi kịch bản, ghi thiết bị, phiên bản Android/iOS, phiên bản Chrome/Safari,
surface, thời điểm bắt đầu, thời điểm dữ liệu hội tụ và kết quả đúng/sai. QA có
thể đọc hai registry cục bộ sau trong Console:

```js
globalThis.__COMTAMMATU_BRANCH_OPS_METRICS__?.snapshot()
globalThis.__COMTAMMATU_REALTIME_METRICS__?.snapshot()
```

Đối với branch operator, `activeChannelCount` phải trở về số lượng đang dùng,
không tăng sau mỗi vòng điều hướng. Với POS/KDS/Pickup, dùng Network/WebSocket
để phát hiện kết nối hoặc subscribe tăng dần. Ghi số lần refetch, thời gian
recovery và mọi request lỗi; không đặt SLA cho đến khi có số liệu thiết bị thật.

## Khôi phục khi dữ liệu có vẻ cũ

1. Dừng thao tác nghiệp vụ và kiểm tra banner mạng.
2. Kết nối lại Wi-Fi, đưa PWA ra foreground và chờ lần refresh đầu tiên hoàn tất.
3. Đối chiếu danh sách với màn hình/server còn tin cậy. Nếu vẫn lệch, tải lại
   launcher một lần.
4. Nếu launcher bị dừng, mở lại bằng tay. Kiểm tra lại pin, tự khởi động và khóa
   ứng dụng gần đây.
5. Nếu lỗi lặp lại, lưu thời điểm, surface, phiên bản, ảnh Network/Console đã
   che dữ liệu nhạy cảm và kịch bản tái hiện. Chuyển ca lỗi vào quy trình
   Reproduction-First trước khi sửa code hoặc đổi polling.
