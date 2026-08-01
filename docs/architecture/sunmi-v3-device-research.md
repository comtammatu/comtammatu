# Nghiên cứu thiết bị SUNMI V3 cho POS cầm tay

**Ngày kiểm tra:** 2026-08-01
**Mục đích:** khóa các sự thật phần cứng và SDK trước khi triển khai [kế hoạch hỗ trợ PDA SUNMI V3](./sunmi-v3-pda-support.md).

## Kết luận

Thiết bị mục tiêu đã được Owner xác nhận là **SUNMI V3**. Vẫn cần đối chiếu báo giá và tem máy trước khi mua vì SUNMI dùng tên V3 cho nhiều dòng/SKU có cấu hình khác nhau.

Hướng khả thi nhỏ nhất là chạy POS Next.js/PWA hiện có và thử **SUNMI Web Print SDK/JS USDK** với máy in tích hợp. Chỉ cân nhắc Android WebView bridge nếu máy thật không đáp ứng silent print, printer status hoặc callback vật lý đáng tin cậy.

## Các dòng V3 không được đánh đồng

| Dòng                | Sự thật từ nguồn chính thức                                                                                                                          | Kết luận cho dự án                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| V3, model T5F1A     | Android 13 64-bit qua SUNMI OS; 3 GB + 32 GB; màn 6,75 inch 720×1600; máy in nhiệt 58 mm tối đa 80 mm/s, cuộn 50 mm; GMS, NFC và scanner là tùy chọn | Ứng viên đúng nhất cho pilot, nhưng phải chốt đúng option/SKU           |
| V3H                 | Được SUNMI gọi tên trong V3 Family/Tap to Pay; không tìm thấy datasheet độc lập đủ để phân biệt mọi cấu hình với V3                                  | Không suy diễn năng lực từ hậu tố H                                     |
| V3e                 | Màn 6,75 inch 420 nit, 384 g, CPU tối đa 2,0 GHz, front-exit printer                                                                                 | Trang công khai chưa đủ chi tiết về Android, GMS, khổ giấy, NFC/scanner |
| V3 PLUS, T5F2A      | Android 14/SUNMI OS 4.0; máy in 58–80 mm; Wi-Fi 6E; option GMS/NFC/scanner                                                                           | Là model khác; không dùng thông số PLUS để cam kết cho V3               |
| V3 MIX, T5701/T5711 | Màn 10,1 inch; bản 58 hoặc 80 mm; scanner/NFC                                                                                                        | Không phải form cầm tay 6,75 inch của yêu cầu                           |

## Điều đã xác minh về web và máy in

- V3 T5F1A có độ phân giải vật lý 720×1600, phù hợp để kiểm thử layout portrait gần 360×800 CSS tùy device pixel ratio.
- SUNMI không công bố version Chrome/Android System WebView cho từng SKU. GMS là tùy chọn, vì vậy khả năng cài Chrome và đường update phải kiểm tra trên đúng firmware khu vực.
- SUNMI có Web Print SDK/JS USDK cho web app điều khiển dịch vụ in cục bộ. Demo chính thức khởi chạy printer service rồi kết nối local service; API công khai gồm truy vấn trạng thái, text/line, QR, barcode, bitmap, raw ESC command và label/TSPL.
- Tài liệu built-in printer còn mô tả các đường native AIDL, remote dependency, virtual Bluetooth `InnerPrinter` và ESC/POS subset. Đây là fallback, không phải lựa chọn mặc định.
- Cần chứng minh trên máy thật callback nào chỉ báo “đã nhận lệnh” và callback nào báo kết quả vật lý sau transaction print. Không được dùng callback command-ack để đánh dấu `print_jobs.status = 'printed'`.
- Cần yêu cầu nhà cung cấp cung cấp package/version/license được hỗ trợ. Nếu dùng Web SDK, bundle và pin version cùng ứng dụng; không phụ thuộc runtime CDN.

## Scanner, NFC và quản trị thiết bị

- Camera của V3 có thể đọc 1D/2D; scanner laser và phím scan là option. Chưa có tài liệu chính thức bảo đảm scanner của SKU mua tại Việt Nam xuất keyboard-wedge vào Chrome.
- Web NFC của Chrome chỉ hỗ trợ NDEF và không cung cấp low-level ISO-DEP/NFC-A/B hay HCE để tự làm thanh toán thẻ.
- SUNMI quảng bá V3 Family cho SoftPOS, nhưng khả năng chấp nhận thẻ phụ thuộc đúng model, firmware, chứng nhận, quốc gia, PSP/acquirer và SDK production. Đây phải là dự án riêng.
- SUNMI OS/DMP/App Store có kiosk, OTA và quản trị ứng dụng, nhưng quyền silent install và fleet policy có thể cần license/OEM authorization. Chưa cần đưa vào MVP một thiết bị.

## Checklist bắt buộc với nhà cung cấp/máy mẫu

- Tên đặt hàng, model code/certification model, RAM/ROM và firmware khu vực.
- Android/SUNMI OS build, GMS, Chrome/WebView provider, version và update path.
- Printer firmware/SDK/service version; giấy 58 mm, đường kính cuộn, receipt/label, cutter/tear-bar.
- In dấu tiếng Việt, logo/bitmap, QR, giấy dài, 30 lệnh liên tục, paper-out, cover-open, overheat và reboot.
- Khả năng silent print, raw ESC/POS, transaction callback và hành vi khi app background/kill.
- Scanner keyboard-wedge, phím scan, camera và NFC option nếu báo giá có nêu.
- License Web Print SDK/JS USDK, App Store, DMP/kiosk, OTA và thời hạn security update.
- Với SoftPOS: mã chứng thư đúng model/firmware, PSP/acquirer hỗ trợ tại Việt Nam và SDK production.

## Nguồn chính thức

### SUNMI

- [SUNMI V3 Family](https://www.sunmi.com/en/v3-family/)
- [Datasheet SUNMI V3, model T5F1A](https://cdn.sunmi.com/public/generalfile/mgt_import/d855cb35f4274e58bae93ea15394dbf6.pdf)
- [SUNMI V3e](https://www.sunmi.com/en/v3e/)
- [SUNMI V3 PLUS](https://www.sunmi.com/en/v3-plus)
- [Datasheet SUNMI V3 PLUS](https://cdn.sunmi.com/public/generalfile/mgt_import/d8c741b5ded946099f397ff2834b6aed.pdf)
- [SUNMI V3 MIX](https://www.sunmi.com/en/v3-mix/)
- [SUNMI Developer Center](https://developer.sunmi.com/en-US/)
- [SUNMI Web Print SDK demo](https://h5.sunmi.com/printer-sdk/demo.html)
- [SUNMI built-in printer documentation](https://docs.sunmi.com/en-US/cdixeghjk491/xdideghjk524)
- [SUNMI built-in printer SDK PDF](https://cdn.sunmi.com/public/generalfile/mgt-document/841c6680d673447ba9c5d9b1e1131d01.pdf)
- [SUNMI SoftPOS](https://www.sunmi.com/en/softpos/)
- [SUNMI OS](https://www.sunmi.com/en/sunmi-os/)

### Android và Chrome

- [Android System WebView](https://developer.android.com/develop/ui/views/layout/webapps/jetpack-webkit-overview)
- [Android WebView bridge security](https://developer.android.com/develop/ui/views/layout/webapps/webview)
- [Chrome Web NFC scope](https://developer.chrome.com/docs/capabilities/nfc)

## Bằng chứng liên quan trong repo

- `apps/web/app/(protected)/br/[branchId]/_lib/operational-manifest.ts`
- `apps/web/app/(protected)/br/[branchId]/pos/manifest.webmanifest/route.ts`
- `apps/web/app/(protected)/br/[branchId]/pos/print-actions.ts`
- `apps/web/app/(protected)/br/[branchId]/pos/payment-actions.ts`
- `apps/web/app/sw.ts`
- `apps/print-agent/src/dispatch.ts`
- `packages/print-render/src/`
