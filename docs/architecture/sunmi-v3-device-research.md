# Nghiên cứu thiết bị SUNMI V3 cho POS cầm tay

**Ngày kiểm tra:** 2026-08-02

**Mục đích:** khóa các sự thật phần cứng và SDK trước khi triển khai [kế hoạch hỗ trợ PDA SUNMI V3](./sunmi-v3-pda-support.md).

## Kết luận

Thiết bị mục tiêu đã được Owner xác nhận là **SUNMI V3 có máy in tích hợp, NFC, đầu quét chuyên dụng và GMS**. Không chấp nhận V3H, V3 PLUS, V3e hoặc V3 MIX làm thiết bị thay thế nếu chưa đánh giá lại.

Datasheet xác nhận V3 dùng model/chứng nhận `T5F1A`, nhưng GMS, NFC, đầu quét laser và hai nút quét đều là option. SUNMI không công bố một mã đặt hàng duy nhất chứng minh cả bốn option cùng có trên một SKU. Hơn nữa, tài liệu công bố hợp chuẩn dùng `T5F1A` cho cả V3/V3H và tách riêng bản NFC/non-NFC. Vì vậy tên “SUNMI V3 full option” hoặc tem `T5F1A` chưa đủ để nghiệm thu mua hàng.

Hướng khả thi nhỏ nhất là chạy POS Next.js/PWA hiện có và thử **SUNMI Web Print SDK/JS USDK** với máy in tích hợp. Chỉ cân nhắc Android WebView bridge nếu máy thật không đáp ứng silent print, printer status hoặc callback vật lý đáng tin cậy.

## Hợp đồng thiết bị mục tiêu

| Hạng mục       | Cấu hình đã khóa                                                             | Bằng chứng phải lấy trên máy mẫu                                                          |
| -------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Tên thương mại | SUNMI V3                                                                     | Hộp, báo giá và About cùng ghi V3                                                         |
| Model          | `T5F1A`                                                                      | Tem, serial, IMEI và factory/supplier configuration code                                  |
| OS             | SUNMI OS dựa trên Android 13 64-bit                                          | Build fingerprint, security patch, OTA channel, Chrome/WebView provider và version        |
| CPU / bộ nhớ   | Qualcomm hexa-core tối đa 2,4 GHz; datasheet V3 là 3 GB + 32 GB              | RAM/ROM thực; cấu hình 4/64 chỉ được chấp nhận khi BOM exact-SKU chứng minh               |
| Màn hình       | 6,75 inch IPS, 720×1600, 420 nit                                             | Viewport CSS, font scale, bàn phím mềm và độ sáng tại quầy                                |
| Máy in         | Nhiệt 58 mm, tối đa 80 mm/s, cuộn OD tối đa 50 mm, receipt + label           | Printable dot width, DPI, tear bar/cutter, cảm biến, printer firmware, tiếng Việt và QR   |
| Scanner        | Đầu quét laser nhận 1D/2D và hai phím scan                                   | Dedicated engine thực, engine/firmware, symbology, KeyEvent/broadcast, cả hai phím        |
| NFC            | Có trên cùng máy                                                             | NFC diagnostic, firmware, protocol matrix và hồ sơ `T5F1A` NFC; không suy diễn từ V3 PLUS |
| GMS            | Có trên cùng máy                                                             | Play Store là app hệ thống và `Play Store > Settings > About` báo `Device is certified`   |
| Kết nối        | 4G/3G/2G, Wi-Fi 2,4/5 GHz ac, Bluetooth đến 5.0 BLE, GPS đa hệ, hai Nano SIM | Band matrix Việt Nam, SIM thực và roaming Wi-Fi tại cửa hàng                              |
| Pin / cơ khí   | Pin tháo rời 7,7 V 3100 mAh; 5 V/2 A; 238×81,8×16,8 mm; 419 g                | Một ca thật có order + scan + in, nhiệt, thời gian sạc, pin thay thế và độ chắc nắp giấy  |

Datasheet V3 không công bố IP rating, drop rating, độ ẩm, thời lượng pin, printable dot width, auto-cutter, mã scan engine hoặc NFC protocol matrix exact-SKU. Không đưa các thông số này vào hợp đồng nếu nhà cung cấp không có bằng chứng áp dụng đúng máy.

## Các dòng V3 không được đánh đồng

| Dòng                | Sự thật từ nguồn chính thức                                                                                                                          | Kết luận cho dự án                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| V3, model T5F1A     | Android 13 64-bit qua SUNMI OS; 3 GB + 32 GB; màn 6,75 inch 720×1600; máy in nhiệt 58 mm tối đa 80 mm/s, cuộn 50 mm; GMS, NFC và scanner là tùy chọn | Ứng viên đúng nhất cho pilot, nhưng phải chốt đúng option/SKU           |
| V3H, model T5F1A    | Manual và hồ sơ hợp chuẩn dùng cùng model với V3; SUNMI còn công bố biến thể NFC và non-NFC                                                          | Không coi hậu tố H hoặc `T5F1A` là mã “full option”; không thay cho V3  |
| V3e                 | Màn 6,75 inch 420 nit, 384 g, CPU tối đa 2,0 GHz, front-exit printer                                                                                 | Trang công khai chưa đủ chi tiết về Android, GMS, khổ giấy, NFC/scanner |
| V3 PLUS, T5F2A      | Android 14/SUNMI OS 4.0; máy in 58–80 mm; Wi-Fi 6E; option GMS/NFC/scanner                                                                           | Là model khác; không dùng thông số PLUS để cam kết cho V3               |
| V3 MIX, T5701/T5711 | Màn 10,1 inch; bản 58 hoặc 80 mm; scanner/NFC                                                                                                        | Không phải form cầm tay 6,75 inch của yêu cầu                           |

Các hồ sơ EU Declaration of Conformity riêng cho `V3H & V3 T5F1A NFC` và `V3H & V3 T5F1A non-NFC` xác nhận model code bao phủ nhiều cấu hình. SUNMI cũng gọi V3/V3H là thiết bị GMS có NFC trong công bố Stripe, nhưng không nêu đầu quét, SKU, firmware hay khu vực bán hàng. Kết luận mua hàng vẫn phải dựa vào factory config code/BOM và máy mẫu cùng cấu hình.

## Điều đã xác minh về web và máy in

- V3 T5F1A có độ phân giải vật lý 720×1600, phù hợp để kiểm thử layout portrait gần 360×800 CSS tùy device pixel ratio.
- SUNMI không công bố version Chrome/Android System WebView cho từng SKU. GMS là tùy chọn, vì vậy khả năng cài Chrome và đường update phải kiểm tra trên đúng firmware khu vực.
- SUNMI có Web Print SDK/JS USDK cho web app điều khiển dịch vụ in cục bộ. Luồng chính thức cài `JS USDK` từ SUNMI App Store, tích hợp `sunmi-js-sdk`, gọi `launchPrinterService()` rồi `init()`. Demo mở deep link `sunmi://com.sunmi:8888/websdk`, kết nối `ws://localhost:7070/ws`; API gồm truy vấn trạng thái/info, text/line, QR, barcode, bitmap, raw ESC command và label/TSPL.
- `sendEscCommand` nhận mảng chuỗi hex hai ký tự. Đây là đường vận chuyển bytes khả thi, nhưng không có nghĩa output ESC/POS hiện tại đã phù hợp với V3.
- Renderer hiện tại cố định **576 dots / 48 ký tự** cho giấy 80 mm và encoder luôn thêm `feed(6)` cùng lệnh `GS V` partial cut. V3 dùng giấy 58 mm; manual mô tả dao xé giấy và tài liệu công khai không xác nhận auto-cutter. Không được gửi nguyên bytes 80 mm hiện tại sang V3.
- Hướng tích hợp đúng là giữ chung `PrintDocument` và template nghiệp vụ, rồi thêm đúng một profile `58mm/manual-tear` trong `@comtammatu/print-render`. Printable dots, số cột, QR size, feed và cutter phải lấy từ `QueryApi`/`getInfo()` và hiệu chuẩn trên giấy thật; profile 80 mm hiện tại giữ nguyên làm mặc định.
- Tài liệu built-in printer còn mô tả các đường native AIDL, remote dependency, virtual Bluetooth `InnerPrinter` và ESC/POS subset. Đây là fallback, không phải lựa chọn mặc định.
- Cần chứng minh trên máy thật callback nào chỉ báo “đã nhận lệnh” và callback nào báo kết quả vật lý sau transaction print. Không được dùng callback command-ack để đánh dấu `print_jobs.status = 'printed'`.
- Cần yêu cầu nhà cung cấp cung cấp package/version/license được hỗ trợ. Nếu dùng Web SDK, bundle và pin version cùng ứng dụng; không phụ thuộc runtime CDN.

## Scanner, NFC và quản trị thiết bị

- Camera của V3 có thể đọc 1D/2D; scanner laser và hai phím scan là option riêng. Không chấp nhận camera 5 MP được gọi thay là “scanner”. Datasheet/family page không công bố mã engine hoặc danh sách symbology exact-SKU.
- Hướng dẫn scanner SUNMI cho phép simulated keyboard/direct fill hoặc Android broadcast. Với PWA, thử KeyEvent/keyboard-wedge vào input đang focus trước; chỉ dùng broadcast/native khi một luồng kinh doanh cụ thể chứng minh chế độ bàn phím không đủ.
- Web NFC của Chrome chỉ hỗ trợ NDEF và không cung cấp low-level ISO-DEP/NFC-A/B hay HCE để tự làm thanh toán thẻ.
- SUNMI quảng bá V3 Family cho SoftPOS, nhưng khả năng chấp nhận thẻ phụ thuộc đúng model, firmware, chứng nhận, quốc gia, PSP/acquirer và SDK production. Đây phải là dự án riêng.
- SUNMI OS/DMP/App Store có kiosk, OTA và quản trị ứng dụng, nhưng quyền silent install và fleet policy có thể cần license/OEM authorization. Chưa cần đưa vào MVP một thiết bị.

## GMS và trạng thái chứng nhận

- Datasheet V3 ghi GMS là option. Danh sách thiết bị Google Play hiện có dòng `Sunmi | V3 | V3 | V3`; Google nêu chỉ thiết bị Play Protect certified mới được hỗ trợ.
- Danh sách Google không gắn dòng V3 với `T5F1A`, NFC, scanner hoặc firmware khu vực. Nghiệm thu phải mở `Play Store > Settings > About`, xác nhận `Device is certified`, rồi lưu build fingerprint, security patch, Chrome, Android System WebView và Google Play services version.
- Chưa xác minh base V3/T5F1A có chứng nhận Android Enterprise Recommended. Không dùng huy hiệu AER của V3 PLUS hoặc trạng thái Gold partner của hãng để mô tả V3.

## Checklist bắt buộc với nhà cung cấp/máy mẫu

Chỉ phát hành đơn mua lô khi mọi mục bắt buộc đạt trên **một SUNMI V3 mẫu có cùng part number, BOM và firmware với lô giao**.

### Danh tính và cấu hình

- [ ] Báo giá ghi `SUNMI V3`, `T5F1A`, supplier part number/factory config code và thị trường firmware; không chỉ ghi “full option”.
- [ ] BOM xác nhận cùng một máy có printer, NFC, dedicated laser scanner, hai scan keys và GMS.
- [ ] Lưu ảnh hộp, tem, serial, IMEI, `Settings > About`, RAM/ROM và build fingerprint.
- [ ] Nhà cung cấp cam kết không đổi model, BOM hoặc firmware của lô so với mẫu mà không tái nghiệm thu.

### GMS và lifecycle

- [ ] Play Store là app hệ thống, không phải sideload; mục Play Protect báo `Device is certified`.
- [ ] Chrome và Android System WebView cài/cập nhật được; ghi version và update channel.
- [ ] Nhà cung cấp ghi SUNMI OS/Android version, security patch cadence, OTA/EOL và cam kết hỗ trợ.
- [ ] Nếu hợp đồng yêu cầu AER, phải có listing/văn bản áp dụng đúng `T5F1A` và build.

### Máy in tích hợp

- [ ] Đo giấy 58 mm, printable dot width, DPI, tốc độ thực, OD cuộn, receipt/label mode và tear bar/cutter.
- [ ] In đạt dấu tiếng Việt, tiền, logo, QR, barcode, hóa đơn dài và ít nhất 30 lệnh liên tục.
- [ ] Chủ động tạo paper-out, cover-open, overheat, reboot, sleep, background và app kill; ghi status/callback thực tế.
- [ ] Cài được `JS USDK`; `launchPrinterService()`, `init()`, `QueryApi`/`getInfo()` và `sendEscCommand` chạy từ origin Preview.
- [ ] Hiệu chuẩn profile `58mm/manual-tear`; không gửi profile 576-dot/48-char/partial-cut của máy 80 mm sang V3.

### Scanner và NFC

- [ ] Quan sát được dedicated scan engine/laser guidance và cả hai phím scan; không nghiệm thu bằng camera scan.
- [ ] Quét 1D/2D trên giấy và màn hình vào input web bằng KeyEvent; ghi prefix/suffix, key code, engine/firmware và symbology.
- [ ] NFC diagnostic xác nhận phần cứng có mặt đồng thời với GMS/scanner; nhà cung cấp gắn đúng hồ sơ `T5F1A` NFC và protocol matrix exact-SKU.
- [ ] Nếu dùng SoftPOS, PSP/acquirer phải phê duyệt đúng model, build, firmware, ứng dụng production và Việt Nam; EMVCo PCD L1 family claim không đủ.

### Kết nối, pin và độ bền

- [ ] Có cellular band matrix exact-SKU và test SIM/roaming Wi-Fi trên mạng cửa hàng.
- [ ] Chạy đủ một ca thật với order + scan + in; ghi pin, nhiệt, thời gian sạc và khả năng cung ứng pin thay thế.
- [ ] Chỉ ghi IP/drop/humidity, UN38.3/MSDS và hồ sơ hợp quy Việt Nam khi có tài liệu áp dụng đúng SKU.
- [ ] Có warranty/RMA, thời gian đổi máy, phụ tùng và quyền dùng App Store/JS USDK/DMP nếu cần.

Loại ngay nếu không có factory config code/BOM; bốn option chỉ được trình diễn trên các máy khác nhau; Play Protect báo uncertified; scanner thực tế chỉ là camera; hoặc lô giao khác firmware/BOM với mẫu.

## Nguồn chính thức

### SUNMI

- [SUNMI V3 Family](https://www.sunmi.com/en/v3-family/)
- [Datasheet SUNMI V3, model T5F1A](https://cdn.sunmi.com/public/generalfile/mgt_import/d855cb35f4274e58bae93ea15394dbf6.pdf)
- [SUNMI V3H manual, model T5F1A](https://cdn.sunmi.com/public/generalfile/mgt_import/97133c7eade64b0b9f624f6166dd6c4c.pdf)
- [SUNMI EU Declaration of Conformity catalog](https://developer.sunmi.com/docs/read/en-US/maaeghjk480)
- [T5F1A NFC Declaration of Conformity](https://cdn.sunmi.com/public/generalfile/mgt-document/ff09384d11cd4114bdf6a8ea1837c69c.pdf)
- [T5F1A non-NFC Declaration of Conformity](https://cdn.sunmi.com/public/generalfile/mgt-document/ce130da899db4657b2e14e9beedbb5ef.pdf)
- [SUNMI–Stripe Tap to Pay announcement](https://www.sunmi.com/en/news/439)
- [SUNMI V3e](https://www.sunmi.com/en/v3e/)
- [SUNMI V3 PLUS](https://www.sunmi.com/en/v3-plus)
- [Datasheet SUNMI V3 PLUS](https://cdn.sunmi.com/public/generalfile/mgt_import/d8c741b5ded946099f397ff2834b6aed.pdf)
- [SUNMI V3 MIX](https://www.sunmi.com/en/v3-mix/)
- [SUNMI Developer Center](https://developer.sunmi.com/en-US/)
- [SUNMI Web Print SDK demo](https://h5.sunmi.com/printer-sdk/demo.html)
- [SUNMI JavaScript SDK overview](https://developer.sunmi.com/docs/en-US/cdixeghjk491/xdizeghjk557)
- [SUNMI scanner engine guide](https://developer.sunmi.com/docs/en-US/cdixeghjk491/xfareghjk568)
- [SUNMI built-in printer documentation](https://docs.sunmi.com/en-US/cdixeghjk491/xdideghjk524)
- [SUNMI built-in printer SDK PDF](https://cdn.sunmi.com/public/generalfile/mgt-document/841c6680d673447ba9c5d9b1e1131d01.pdf)
- [SUNMI SoftPOS](https://www.sunmi.com/en/softpos/)
- [SUNMI OS](https://www.sunmi.com/en/sunmi-os/)

### Android và Chrome

- [Android System WebView](https://developer.android.com/develop/ui/views/layout/webapps/jetpack-webkit-overview)
- [Android WebView bridge security](https://developer.android.com/develop/ui/views/layout/webapps/webview)
- [Chrome Web NFC scope](https://developer.chrome.com/docs/capabilities/nfc)
- [Google Play supported devices](https://storage.googleapis.com/play_public/supported_devices.html)
- [Google Play supported-device and certification guidance](https://support.google.com/googleplay/answer/1727131?hl=en)

## Bằng chứng liên quan trong repo

- `apps/web/app/(protected)/br/[branchId]/_lib/operational-manifest.ts`
- `apps/web/app/(protected)/br/[branchId]/pos/manifest.webmanifest/route.ts`
- `apps/web/app/(protected)/br/[branchId]/pos/print-actions.ts`
- `apps/web/app/(protected)/br/[branchId]/pos/payment-actions.ts`
- `apps/web/app/sw.ts`
- `apps/print-agent/src/dispatch.ts`
- `packages/print-render/src/`
