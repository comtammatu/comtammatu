# Kế hoạch hỗ trợ PDA SUNMI V3 cho POS

## Trạng thái và thiết bị mục tiêu

Thiết bị mục tiêu đã được Owner xác nhận là **SUNMI V3**. Trước khi mua hoặc viết tích hợp, vẫn phải xác nhận model trên tem máy, cấu hình RAM/ROM, GMS, NFC, scanner, phiên bản SUNMI OS và firmware máy in của đúng SKU.

Bằng chứng phần cứng, SDK và các biến thể SKU được tổng hợp riêng tại [Nghiên cứu thiết bị SUNMI V3](./sunmi-v3-device-research.md).

Mục tiêu là đưa POS hiện tại lên PDA cầm tay và dùng được máy in nhiệt tích hợp mà không tạo một ứng dụng POS Android thứ hai. Lựa chọn mặc định là giữ Next.js PWA, `print_jobs` và `@comtammatu/print-render`; chỉ thêm phần ghép thiết bị và cầu nối in SUNMI tối thiểu.

Nếu thử nghiệm trên máy thật không chứng minh được in im lặng và nhận kết quả vật lý đáng tin cậy qua Web Print SDK, dừng sau Đợt 0 để quyết định riêng về một Android bridge nhỏ. Không tự động mở rộng thành native app.

## Kết quả cần đạt

- Thu ngân đăng nhập và dùng `/br/[branchId]/pos` trên màn hình dọc 6,75 inch, hoàn thành tạo món, gửi bếp, thanh toán và in hóa đơn trong luồng hiện hữu.
- Biên lai, phiếu tạm tính và báo cáo đóng ca có thể đi tới máy in 58 mm tích hợp của đúng PDA đã ghép.
- Phiếu bếp và phiếu hủy tiếp tục đi tới máy in LAN/KDS cố định; không chuyển các phiếu này sang PDA di động trong MVP.
- Mọi lệnh in vẫn có bằng chứng trong `print_jobs`; retry không tạo đơn, thanh toán hoặc bản in trùng.
- Khi máy in hết giấy, mở nắp, dịch vụ SUNMI chưa chạy hoặc mất kết nối, thu ngân thấy trạng thái và cách khôi phục rõ ràng.
- Tắt hỗ trợ SUNMI tại chi nhánh phải đưa luồng về in LAN mà không mất dữ liệu nghiệp vụ.

## Giá trị và ranh giới MVP

### Trong phạm vi

- Một họ thiết bị: đúng SKU SUNMI V3 được mua để pilot.
- Chạy POS bằng Chrome/PWA trên Wi-Fi tại cửa hàng.
- Ghép một PDA với một đăng ký POS và một máy in tích hợp logic tại cùng tenant/chi nhánh.
- In `receipt`, `provisional_bill` và `shift_close_report` bằng máy in tích hợp.
- Kiểm tra responsive/touch, bàn phím mềm, safe area, font tiếng Việt, giấy 58 mm và vòng đời PWA.
- Theo dõi trạng thái lệnh in, hủy ghép, đổi máy và fallback về LAN.

### Ngoài phạm vi

- Native POS rewrite, offline-first hoặc cho phép bán hàng khi không có mạng.
- Mở POS từ 4G ngoài mạng cửa hàng; chính sách mạng chi nhánh hiện tại vẫn giữ nguyên.
- SoftPOS/thẻ chạm bằng NFC. Phần cứng NFC hoặc EMVCo PCD L1 không đồng nghĩa đã có chứng nhận, hợp đồng và SDK của đơn vị thanh toán tại Việt Nam.
- Tích hợp scanner khi chưa có luồng kinh doanh cụ thể cần quét mã.
- DMP, kiosk fleet management và phát hành APK diện rộng trong MVP.
- Một framework thiết bị tổng quát cho nhiều hãng. Chỉ thêm adapter SUNMI khi máy thật chứng minh cần thiết.

## Hiện trạng được tái sử dụng

- POS đã có layout touch dưới `1280px`, action dock theo safe area và các kiểm tra hồi quy cho mobile/touch.
- PWA hiện chỉ cache tài nguyên tĩnh; điều hướng bảo vệ, Server Action, Supabase và mọi write đều `NetworkOnly`. Vì vậy MVP không hứa bán offline.
- `pos_terminals.device_id` đã tồn tại nhưng hiện không phải bằng chứng ghép thiết bị và không được dùng làm quyền truy cập.
- `print_jobs` là hàng đợi bền vững; `@comtammatu/print-render` là nguồn chuẩn để tạo tài liệu/ESC/POS.
- Print agent hiện chỉ nhận `connection_type = 'lan'` và gửi raw TCP tới máy in chi nhánh. Đường này phải tiếp tục hoạt động không đổi.
- Một ca POS là ca dùng chung ở cấp chi nhánh; hỗ trợ PDA không biến ca thành ca riêng theo thiết bị.

## Mô hình đích tối thiểu

```text
SUNMI V3 / POS PWA
        │ tạo đơn, thanh toán, yêu cầu in
        ▼
Server Action + RPC có kiểm tra tenant/branch/quyền
        │
        ▼
print_jobs + tài liệu chuẩn từ @comtammatu/print-render
        │
        ├── printer=lan ─────────► branch print-agent ─► máy in LAN
        │
        └── printer=sunmi_builtin
                    │ claim bởi đúng PDA đã ghép
                    ▼
              SUNMI Web Print SDK
                    ▼
             máy in 58 mm tích hợp
                    │ kết quả vật lý
                    └────────────► complete/fail RPC
```

Trình duyệt không nhận `service_role`, không được tin `device_id` từ client và không tự chọn một `printer_id` ngoài phạm vi đã ghép. Một token ghép thiết bị ngắn hạn hoặc có thể thu hồi được phát sau thao tác của Owner/Quản lý chi nhánh, lưu phía trình duyệt bằng cookie `HttpOnly`, và chỉ dùng để chứng minh cặp `tenant + branch + terminal + printer`.

Không tạo một hệ thống hàng đợi thứ hai trong PDA. Server vẫn tạo và sở hữu `print_jobs`; PDA chỉ claim lệnh dành cho nó, nhận bytes đã render, gửi tới dịch vụ in cục bộ rồi báo kết quả.

## Quy tắc nghiệp vụ và an toàn

1. `device_id` chỉ là định danh cài đặt/quan sát, không phải quyền truy cập.
2. Owner hoặc `branch_manager` có `PRINTER_MANAGE` mới được ghép, hủy ghép hoặc đổi máy in cho PDA.
3. RPC claim phải suy ra tenant, branch và terminal từ session + binding đã xác minh; không tin các ID tự do do client gửi lên.
4. Một lệnh `sunmi_builtin` chỉ được claim bởi đúng binding; print agent LAN phải bỏ qua loại này trước khi claim.
5. Claim, lease, complete và fail phải nguyên tử, idempotent và kiểm tra transition ở Postgres.
6. Chỉ đánh dấu `printed` khi callback giao dịch của SDK xác nhận đầu ra vật lý. Callback “đã nhận lệnh” không đủ.
7. Hết lease hoặc rớt mạng sau khi gửi bytes là trạng thái cần đối soát, không tự in lại mù quáng.
8. Reprint tiếp tục append-only và giữ liên kết nguồn; không sửa job lịch sử để che bản in lại.
9. Tắt binding hoặc máy in phải chặn claim mới ngay lập tức; job chưa in được chuyển về hàng chờ/fallback bằng hành động có chủ đích.
10. Không trả raw Supabase/Postgres error cho client.

## UI Advisor Gate

- **Surface:** `/br/[branchId]/pos`; route family POS chi nhánh; thay đổi behavior, responsive và trạng thái phần cứng, không đổi design system.
- **Actor / job:** Thu ngân hoặc quản lý chi nhánh tạo đơn, gửi bếp, thu tiền và in trong dưới 30 giây.
- **Archetype:** `BOARD`, station chrome. Exemplar là POS hiện tại; không dựng một route PDA riêng.
- **Viewport bắt buộc:** real device 720×1600 vật lý và viewport gần 360×800 CSS ở portrait; kiểm tra thêm 390 px, tablet và desktop để tránh hồi quy.
- **Touch:** target chính tối thiểu 44 px, không phụ thuộc hover; action quan trọng vẫn nằm trong thumb zone.
- **Trạng thái mới:** chưa ghép, đã ghép, SDK không hỗ trợ, dịch vụ in chưa chạy, đang in, đã in, hết giấy, mở nắp/quá nhiệt, kết quả không chắc chắn, thất bại có thể thử lại và thiết bị bị thu hồi.
- **Copy:** tiếng Việt nghiệp vụ; giữ `POS` là nhãn ngắn. Không hiển thị thuật ngữ SDK, WebSocket hoặc raw error cho thu ngân.
- **Phục hồi:** mỗi lỗi có một CTA cụ thể như “Mở dịch vụ in”, “Lắp giấy”, “Thử lại trạng thái”, “Dùng máy in quầy”; không biến lỗi máy in thành lỗi thanh toán.

## Triển khai theo đợt

### Đợt 0 — Khóa SKU và spike trên máy thật

**Thời lượng:** 2–3 ngày kỹ thuật sau khi có thiết bị.

1. Ghi lại model code, SUNMI OS/Android, GMS, WebView, printer firmware, SDK/service version, cấu hình scanner/NFC và chính sách update của nhà cung cấp.
2. Cài PWA từ domain Preview và xác minh login, network gate, service worker update, keyboard, font scale, camera, sleep/resume và portrait.
3. Chạy demo Web Print SDK chính thức; thử text tiếng Việt, QR, bitmap/logo, cắt/xé giấy, 58 mm, 30 lệnh liên tiếp và khởi động lại thiết bị.
4. Xác minh SDK/package được phép phân phối, có version cố định và có thể bundle cùng ứng dụng; không tải runtime từ CDN bên thứ ba.
5. Ghi chính xác ý nghĩa callback khi thành công, hết giấy, mở nắp, quá nhiệt, mất dịch vụ và rớt mạng.
6. Chứng minh raw ESC/POS từ `@comtammatu/print-render` có thể được gửi qua SDK mà không tạo một renderer SUNMI thứ hai.

**Cổng dừng:** chỉ sang Đợt 1 khi máy thật in im lặng, font/QR đạt chuẩn và có tín hiệu đủ để phân biệt “đã in vật lý” với “đã gửi lệnh”. Nếu không đạt, lập quyết định riêng giữa plugin có hộp thoại, Android bridge nhỏ hoặc giữ máy in LAN; không tiếp tục schema/runtime theo giả định.

### Đợt 1 — Ghép thiết bị và cấu hình máy in additive

**Thời lượng:** 3–5 ngày.

1. Mở rộng loại kết nối máy in tối thiểu thành `lan | sunmi_builtin`; `lan_host/lan_port` chỉ bắt buộc với `lan`.
2. Gắn máy in tích hợp với `pos_terminals` bằng binding có thể thu hồi. Tái sử dụng bảng hiện tại trước; chỉ tách bảng binding riêng nếu migration review chứng minh vòng đời credential không thể biểu diễn an toàn bằng cột additive.
3. Thêm RPC ghép/hủy ghép/rotate credential và endpoint heartbeat hẹp; mọi write nhiều hàng nằm trong RPC.
4. Bổ sung màn quản lý máy in/đăng ký POS hiện tại bằng thao tác “Ghép PDA SUNMI”, mã dùng một lần, trạng thái lần cuối thấy và “Hủy ghép”.
5. Dùng `printers.is_active` và trạng thái binding hiện có làm kill switch. Chỉ thêm feature flag cấp chi nhánh nếu review chứng minh hai primitive này không thể cô lập pilot an toàn.
6. Cập nhật types sau khi migration đã apply đúng schema nguồn; rehearsal Preview phải qua kiểm tra migration ledger trước.

**Nghiệm thu:** binding không thể dùng chéo tenant/branch, token không hiện trong JS/log, revoke có hiệu lực ngay, và mọi máy in LAN hiện hữu vẫn lưu/in như trước.

### Đợt 2 — Claim, render và hoàn tất lệnh in trên PDA

**Thời lượng:** 5–8 ngày.

1. Thêm RPC claim hẹp cho `sunmi_builtin`, có lease và khóa row; chỉ trả một job dành cho binding hiện tại.
2. Render tài liệu trên server bằng `@comtammatu/print-render`, áp giới hạn kích thước và trả bytes/attempt token cho client đã xác minh.
3. Tạo module SUNMI nhỏ, chỉ được load trong POS khi có binding + máy in active và capability probe thành công; module gọi Web Print SDK, không chứa logic đơn hàng.
4. Hoàn tất/fail job qua RPC với attempt token; lưu mã lỗi chuẩn hóa như `service_unavailable`, `paper_out`, `cover_open`, `overheated`, `result_unknown`.
5. Sửa print agent để lọc `connection_type = 'lan'` trước claim/dispatch, không được claim rồi đánh fail job SUNMI.
6. Định tuyến `receipt`, `provisional_bill`, `shift_close_report` tới máy in tích hợp đã ghép; kitchen/cancel giữ LAN.
7. Giữ idempotency key hiện tại của tạo đơn/thanh toán; bổ sung kiểm tra recovery theo `order_id`/`print_job_id` khi tab resume hoặc request timeout.

**Nghiệm thu:** một yêu cầu chỉ tạo một job; callback lặp không làm transition lặp; rớt mạng ở từng điểm trước/sau commit không tạo bản in trùng; job `failed` có mã `result_unknown` bắt buộc người dùng đối chiếu trước khi reprint.

### Đợt 3 — Hoàn thiện UX, QA vật lý và vận hành

**Thời lượng:** 3–5 ngày kỹ thuật + 5–7 ngày pilot tại cửa hàng.

1. Thêm badge trạng thái đúng ngữ cảnh: với PDA dùng trạng thái dịch vụ/máy in tích hợp; với quầy LAN giữ heartbeat agent hiện tại.
2. Xác minh toàn bộ action dock/cart/menu/modal ở real device, gồm keyboard, font scale lớn, sleep/resume, mất Wi-Fi, đổi access point và PWA update.
3. Viết hướng dẫn một trang cho quản lý: ghép máy, thay giấy, mở dịch vụ in, hủy ghép, chuyển về máy in quầy.
4. Pilot một chi nhánh, một PDA, một loại giấy; giữ máy in LAN sẵn làm fallback trong toàn bộ pilot.
5. Theo dõi số job theo `printed/failed`, phân loại `error_code`, thời gian từ enqueue đến in và số reprint; không thêm dashboard mới nếu truy vấn vận hành hiện tại đủ dùng.

**Nghiệm thu:** hoàn tất một ngày vận hành thật từ đăng nhập → POS → thanh toán → KDS/phục vụ → in vật lý → HĐĐT → kho → đối soát → đóng ca; không có mất job hoặc bản in không truy vết.

### Đợt 4 — Mở rộng có điều kiện

Chỉ mở đợt này khi pilot tạo nhu cầu đo được:

- Android bridge nhỏ nếu Web SDK không đáp ứng silent print/status nhưng native SUNMI SDK có thể đáp ứng.
- Scanner khi có luồng cụ thể như tìm món, nhận hàng hoặc đối soát mã.
- Kiosk/DMP khi số thiết bị đủ lớn để cập nhật thủ công trở thành rủi ro vận hành.
- SoftPOS như một dự án thanh toán riêng có PSP/acquirer, chứng nhận đúng SKU/firmware và hồ sơ pháp lý.

## Ma trận lỗi in tối thiểu

| Tình huống                                      | Trạng thái hệ thống                                | Hành động thu ngân                          |
| ----------------------------------------------- | -------------------------------------------------- | ------------------------------------------- |
| Chưa chạy SUNMI print service                   | Giữ job chờ, không đánh `printed`                  | Mở dịch vụ rồi thử lại                      |
| Hết giấy / mở nắp / quá nhiệt                   | `failed` có mã lỗi chuẩn hóa                       | Khắc phục phần cứng rồi reprint append-only |
| Mất mạng trước khi claim                        | Job vẫn `pending`                                  | Kết nối lại, PDA claim tiếp                 |
| Mất mạng sau claim nhưng trước gửi bytes        | Lease hết hạn và có thể claim lại                  | Hệ thống tự phục hồi có kiểm soát           |
| Mất mạng sau gửi bytes, chưa có callback vật lý | `failed` với mã `result_unknown`; không auto-retry | Kiểm tra giấy thực tế trước khi reprint     |
| PDA bị revoke                                   | Từ chối claim/complete mới                         | Quản lý ghép lại hoặc dùng máy in LAN       |
| SDK/WebView không được hỗ trợ                   | Không bật đường SUNMI                              | Dùng máy in quầy; không chặn bán hàng       |

## Kế hoạch kiểm thử và bằng chứng

### Tự động

- Unit/static tests cho capability detection, chuẩn hóa lỗi, lựa chọn route in và mapping UI state.
- SQL tests cho pairing, cross-tenant/branch denial, claim concurrency, lease expiry, attempt replay, revoke và transition bất hợp lệ.
- Contract test chứng minh print agent LAN bỏ qua job SUNMI và job LAN không đổi behavior.
- Regression cho create order/payment idempotency, reprint append-only và PWA NetworkOnly.
- UI static/interaction tests tại 360 px cho action dock, modal, focus/keyboard và touch target.

### Máy thật

- Ít nhất 100 biên lai liên tiếp; chủ động tạo hết giấy, mở nắp, sleep, app kill, đổi Wi-Fi và rớt mạng ở từng mốc.
- Đối chiếu QR, dấu tiếng Việt, logo, tổng tiền, VAT/HĐĐT và độ rộng 58 mm.
- Test pin thấp, nhiệt độ sau in liên tục, thay cuộn giấy, camera và độ sáng ngoài quầy.
- Xác minh update PWA không làm mất phiên thanh toán hoặc job đang chờ.

### Cổng hoàn tất implementation

Các lát cắt schema/RPC/pairing/print evidence là T3; UI thuần responsive là T2 nhưng phải đi cùng cổng T3 của feature. Trước khi kết luận hoàn tất:

```bash
REVIEW_TIER=T3 corepack pnpm lint:review-tier
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build
corepack pnpm test
corepack pnpm verify
corepack pnpm lint:migration-lineage
codegraph index .
```

Không apply Production nếu chưa xác minh project ref/migration ledger và chưa có ủy quyền trực tiếp của Owner trong phiên đó.

## Rollout và rollback

1. Lab trên Preview với đúng thiết bị và giấy mua thực tế.
2. Pilot một chi nhánh trong 5–7 ngày, chỉ một binding và một máy in SUNMI active.
3. Trong pilot, máy in LAN vẫn active và có quy trình chuyển tuyến rõ ràng; không tự fan-out cùng một receipt tới cả hai máy.
4. Mở rộng từng chi nhánh sau khi tỷ lệ lỗi có mã `result_unknown` bằng 0 trong cửa sổ pilot và lỗi phần cứng có quy trình khôi phục đạt yêu cầu.
5. Rollback bằng cách deactivate máy in SUNMI, revoke binding và chuyển route receipt về LAN. Schema additive và lịch sử `print_jobs` được giữ lại; không xóa bằng chứng in.

## Ước lượng và phụ thuộc

Nếu có máy đúng SKU ngay từ đầu, phần kỹ thuật cốt lõi cần khoảng **13–21 ngày công**, sau đó pilot **5–7 ngày vận hành**. Ước lượng không bao gồm thời gian mua máy, nhận SDK/package từ SUNMI/nhà phân phối hoặc phê duyệt SoftPOS.

Phụ thuộc phải khóa trước Đợt 1:

1. Chốt model code và cấu hình cụ thể của SUNMI V3 trên tem máy hoặc báo giá.
2. Có ít nhất một máy thật, giấy thật và quyền truy cập SDK/service chính thức.
3. Nhà cung cấp xác nhận version, license/phân phối và chính sách update WebView/SUNMI OS.
4. Owner chấp nhận MVP chỉ dùng Wi-Fi cửa hàng, cash/VietQR hiện tại, không offline, không SoftPOS và không scanner.

## Tổng hợp rà soát PM / BA / Senior Dev / QA

### PM

Feature đáng làm nếu một PDA thay được thiết bị gọi món + máy in biên lai và giảm quãng đường của thu ngân. Phiên bản nhỏ nhất chỉ hỗ trợ đúng một SKU, đúng ba loại chứng từ và một pilot; scanner, SoftPOS và quản trị fleet chưa có giá trị đủ rõ để vào MVP.

### BA

Thiết bị không tạo thêm scope nghiệp vụ: tenant, branch, ca, đơn hàng và thanh toán vẫn theo mô hình hiện tại. Binding chỉ quyết định thiết bị nào được lấy job in nào. In lỗi không được đảo ngược thanh toán; reprint là một sự kiện mới có truy vết.

### Senior Dev

Tái sử dụng PWA, `print_jobs`, renderer và route máy in hiện tại. Phần mới tối thiểu là binding có thể thu hồi, connection type, RPC claim/complete và một module SDK cục bộ. Không đưa service key vào PDA, không dựng queue hay renderer thứ hai, không viết native wrapper trước khi spike chứng minh Web SDK thiếu năng lực bắt buộc.

### QA / Vận hành

Simulator không chứng minh được máy in. Gate phát hành cần máy thật, lỗi phần cứng chủ động, mất mạng ở từng điểm và một ngày vận hành đầy đủ. Fallback LAN và kill switch phải được diễn tập trước pilot.

### Quyết định tổng hợp

Tiến hành theo mô hình **PWA + SUNMI Web Print SDK + durable `print_jobs`**, với Đợt 0 là cổng go/no-go. Đây là thay đổi nhỏ nhất tận dụng được phần cứng V3 mà không phân đôi codebase POS. Chỉ cân nhắc Android bridge nếu máy thật chứng minh một yêu cầu bắt buộc không thể đạt qua SDK web.

## Nguồn kỹ thuật bên ngoài

- [SUNMI V3 Family](https://www.sunmi.com/en/v3-family/)
- [SUNMI V3 datasheet, model T5F1A](https://cdn.sunmi.com/public/generalfile/mgt_import/d855cb35f4274e58bae93ea15394dbf6.pdf)
- [SUNMI Developer Center](https://developer.sunmi.com/en-US/)
- [SUNMI Web Print SDK demo](https://h5.sunmi.com/printer-sdk/demo.html)
- [SUNMI built-in printer documentation](https://docs.sunmi.com/en-US/cdixeghjk491/xdideghjk524)
- [Android WebView security guidance](https://developer.android.com/develop/ui/views/layout/webapps/webview)
- [Chrome Web NFC scope](https://developer.chrome.com/docs/capabilities/nfc)
