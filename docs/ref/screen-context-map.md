# Bản đồ mục tiêu màn hình & Luồng vận hành (Screen Context Map)

> **Trạng thái:** Tài liệu tham chiếu chuẩn nghiệp vụ (SSoT).  
> **Quy tắc bắt buộc:** Mọi thay đổi UI, thêm tính năng, hoặc tái cấu trúc trên các đường dẫn (route) tương ứng phải tuân thủ nghiêm ngặt mục tiêu nghiệp vụ, luồng thao tác và ranh giới thông tin được định nghĩa tại đây. Nghiêm cấm việc chắp vá UI (patchwork) hoặc thêm các trường dữ liệu/nút bấm nằm ngoài mục tiêu hoạt động của màn hình.

---

## 1. Hướng dẫn sử dụng Bản đồ Ngữ cảnh

Tài liệu này được tổ chức theo cấu trúc chuẩn hóa cho mỗi màn hình nhằm trả lời 6 câu hỏi cốt lõi trước khi lập trình hoặc thiết kế:

- **Tại sao màn hình này tồn tại?** (Mục tiêu nghiệp vụ - Business Purpose)
- **Ai là người ngồi trước màn hình này?** (Đối tượng sử dụng - Primary Actor)
- **Họ muốn đạt được kết quả gì nhanh nhất?** (Mục tiêu người dùng - User Goal)
- **Họ sẽ tương tác theo các bước nào?** (Luồng thao tác - Workflow)
- **Thông tin gì cần hiển thị để phục vụ mục tiêu đó?** (Thông tin hiển thị - What to Show / What NOT to Show)
- **Màn hình dùng cấu trúc trang nào?** (Archetype - do `docs/spec/page-archetypes.md` sở hữu)

Khi lập UI Advisor Gate, tài liệu này sở hữu actor, job, workflow và ranh giới
thông tin; `docs/spec/page-archetypes.md` sở hữu cấu trúc trang, exemplar và
fallback. Không dùng Screen Context Map để tự tạo layout hoặc primitive mới.

### 1.1. Ranh giới mặt phẳng sản phẩm

- Hệ thống xác thực chỉ có hai mặt phẳng: `Admin Dashboard` và `Branch`.
- `Admin Dashboard` chỉ dành cho Chủ quán (`owner`): chỉ số toàn hệ thống,
  đối chiếu nhiều chi nhánh, điều khiển, dữ liệu nền và thiết lập tenant. Quản
  lý chi nhánh và Nhân viên không dùng các route cấp cao này.
- `Branch` là nơi làm việc hằng ngày của Quản lý chi nhánh và Nhân viên; Chủ
  quán có thể vào cùng mặt phẳng để giám sát hoặc hỗ trợ.
- POS, KDS và Runner là các chế độ chrome toàn màn hình bên trong Branch, không
  phải mặt phẳng sản phẩm riêng. `/notifications` là tiện ích Branch cho mọi
  vai trò đã đăng nhập.
- Self-order và các route public nằm ngoài ranh giới sản phẩm đã xác thực.

---

## 2. Chi tiết các màn hình cốt lõi

### 2.1. Màn hình Bán hàng (POS) — `/br/[branchId]/pos`

- **Archetype:** `BOARD`.
- **Đối tượng sử dụng chính:** Thu ngân (`cashier`), Quản lý chi nhánh (`branch_manager`) (khi hỗ trợ).
- **Mục tiêu Nghiệp vụ (Why?):**
  - Ghi nhận đơn hàng bán ra chính xác, nhanh chóng, thu tiền đúng và truyền đạt lệnh chế biến tức thời đến bếp (KDS).
  - Bảo đảm tính toàn vẹn của doanh thu thông qua kiểm soát ca và kiểm soát dòng tiền mặt thực tế tại két.
- **Mục tiêu Người dùng (Goal):** Nhận order từ khách, chọn món, thanh toán và in hóa đơn trong vòng dưới 30 giây để tối ưu tốc độ phục vụ.
- **Luồng thao tác (Workflow):**
  1. **Khởi tạo:** Mở ca POS mới (nếu đầu ngày/đầu ca) -> Xác nhận số tiền mặt ban đầu tại két.
  2. **Chọn món:** Chọn danh mục món -> Chọn món ăn -> Thêm tùy chọn món (`modifier`) hoặc ghi chú nếu khách yêu cầu.
  3. **Xác nhận Order:** Chọn hình thức phục vụ (Ăn tại bàn + số bàn / Mang đi) -> Bấm gửi lệnh chế biến đến bếp (KDS).
  4. **Thanh toán:** Chọn phương thức thanh toán (Tiền mặt / VietQR) -> Áp dụng mã giảm giá (nếu có quyền) -> Xác nhận đã thu tiền -> Hệ thống tự động in hóa đơn giấy ra máy in quầy bar.
  5. **Kết ca:** Cuối ca, kiểm đếm số tiền mặt thực tế trong két -> Nhập số tiền thực tế -> Đóng ca và đối chiếu lệch dòng tiền (`cash variance`).
- **Thông tin hiển thị:**
  - **Nên hiển thị:** Danh sách món ăn dạng lưới (grid) với hình ảnh/tên ngắn dễ bấm; Giỏ hàng (Cart) hiện tại; Trạng thái kết nối máy in và két tiền; Nút thanh toán nổi bật, kích thước chạm (`size="touch"`).
  - **KHÔNG hiển thị:** Báo cáo doanh thu tháng, lịch sử chi tiết của các ca làm việc khác, thông tin lương nhân sự, hoặc danh sách nguyên liệu thô của kho.
- **Quy chuẩn UX/UI:**
  - Mobile-first và tối ưu cảm ứng (màn hình tablet/máy POS cầm tay). Các nút bấm phải đạt chuẩn touch-target (tối thiểu `44px`).
  - Giỏ hàng (Cart) chỉ dùng để tạo đơn mới. Khi đơn đã gửi hoặc thanh toán, mọi thay đổi phải thực hiện qua luồng Lịch sử đơn hàng, không chỉnh sửa trực tiếp trên giỏ hàng POS.

---

### 2.2. Màn hình Bếp (KDS) — `/br/[branchId]/kds`

- **Archetype:** `BOARD`.
- **Đối tượng sử dụng chính:** Đầu bếp (`chef`), Nhân viên bếp.
- **Mục tiêu Nghiệp vụ (Why?):**
  - Tiếp nhận danh sách món cần chế biến theo thời gian thực từ POS để bếp chế biến đúng món, đúng thứ tự, giảm thiểu sai sót và lãng phí nguyên liệu.
- **Mục tiêu Người dùng (Goal):** Biết ngay món nào cần làm trước, số lượng bao nhiêu, và đánh dấu hoàn thành nhanh chóng để chuyển ra cho khách.
- **Luồng thao tác (Workflow):**
  1. **Tiếp nhận:** KDS tự động nhận ticket món ăn mới từ POS qua kết nối realtime (Websocket).
  2. **Theo dõi:** Sắp xếp ticket theo thời gian (cũ nhất ở trước) hoặc theo độ ưu tiên.
  3. **Chế biến:** Bếp nhìn tổng lượng món cùng loại cần chế biến (ví dụ: "Tổng 5 Sườn cốt lết cần nướng") để tối ưu công suất bếp.
  4. **Hoàn thành:** Bấm vào món/ticket để đánh dấu "Đã làm xong" (`ready/bump`) -> Lệnh tự động chuyển sang màn hình Runner và in bill ra bàn ra món.
  5. **Hoàn tác:** Bấm "Thu hồi" (`recall`) nếu lỡ tay bấm nhầm ticket chưa hoàn thành.
- **Thông tin hiển thị:**
  - **Nên hiển thị:** Các thẻ order (`OperationalBoardCard`) chứa danh sách món, số lượng, thời gian chờ (đổi màu cảnh báo nếu quá giờ), số bàn/mã mang đi.
  - **KHÔNG hiển thị:** Giá tiền của món, phương thức thanh toán, thông tin doanh thu, hoặc bất kỳ nút bấm quản trị nào.
- **Quy chuẩn UX/UI:**
  - Sử dụng giao diện tối (Dark mode) hoặc độ tương phản cực cao để chống mỏi mắt trong môi trường bếp nóng và nhiều khói dầu.
  - Tuyệt đối không dùng dữ liệu giả lập (loading skeletons) khi tải KDS để tránh việc bếp làm nhầm đơn ảo; chỉ dùng vòng quay tải trang (`PageSpinner`) khi chưa có dữ liệu thật.

---

### 2.3. Màn hình Điều phối (Runner) — `/br/[branchId]/runner`

- **Archetype:** `BOARD`.
- **Đối tượng sử dụng chính:** Nhân viên chạy bàn (`runner`), Nhân viên điều phối ra món.
- **Mục tiêu Nghiệp vụ (Why?):**
  - Khớp đúng món ăn đã hoàn thành từ bếp với đúng bàn hoặc đúng khách hàng mang đi, tránh giao nhầm món, giao thiếu món hoặc làm nguội món.
- **Mục tiêu Người dùng (Goal):** Nhìn thấy món nào đã sẵn sàng, lấy đúng đĩa mang đến đúng bàn và đánh dấu "Đã giao" (`served`).
- **Luồng thao tác (Workflow):**
  1. **Nhận diện:** Runner nhìn danh sách món có trạng thái "Đã xong" (màu xanh lá) hiển thị trên màn hình.
  2. **So khớp:** Lấy đĩa thức ăn tương ứng kèm bill giấy đối chiếu số bàn/mã đơn.
  3. **Bàn giao:** Mang món ra bàn hoặc giao cho khách mang đi -> Bấm "Xác nhận đã giao" (`served`) trên màn hình Runner để đóng trạng thái món.
- **Thông tin hiển thị:**
  - **Nên hiển thị:** Danh sách món kèm số bàn, mã đơn hàng, tên món và số lượng, sắp xếp theo thời gian xong của bếp.
  - **KHÔNG hiển thị:** Giá tiền, thông tin nguyên liệu kho, lịch sử ca làm việc của nhân viên.
- **Quy chuẩn UX/UI:**
  - Giao diện siêu tinh gọn, chữ lớn để đọc được từ khoảng cách 2 mét.
  - Chỉ hiển thị các đơn đang chờ giao hoặc vừa giao xong trong vòng 5 phút, không kéo dài danh sách lịch sử để tránh quá tải thông tin.

---

### 2.4. Trung tâm vận hành Chi nhánh — `/br/[branchId]`, `/shift`, `/team`

- **Archetype:** `/br/[branchId]` dùng `HUB`; `/br/[branchId]/dashboard` là
  `REDIRECT-SHIM` về HUB này; `/shift` là màn ngày làm việc cá nhân; `/team` là
  `LIST` ba tab.
- **Đối tượng sử dụng chính:** Nhân viên trong ca, Quản lý chi nhánh (`branch_manager`), Chủ cửa hàng (`owner`) theo đúng phạm vi từng tab.
- **Mục tiêu Nghiệp vụ (Why?):** Cho người vận hành đi từ trạng thái ca, ngoại
  lệ hoặc việc quản lý cần xử lý đến đúng trạm hay luồng sở hữu trong một
  viewport ngắn. Đây là home duy nhất của Branch, không có dashboard chi nhánh
  song song.
- **Mục tiêu Người dùng (Goal):** Biết ngay việc tiếp theo, sự cố nào cần xử lý
  trong ngày và nơi mở đúng workflow mà không phải quét KPI hoặc thư mục tính
  năng.
- **Luồng thao tác (Workflow):**
  1. **Đọc trạng thái hiện tại:** Xem ca cá nhân và hành động an toàn tiếp theo.
  2. **Đọc hàng chờ/ngoại lệ:** Chỉ hiện việc có số lượng lớn hơn `0`; ngoại lệ
     quản lý chỉ hiện khi vai trò có quyền.
  3. **Mở luồng sở hữu:** Chạm trực tiếp hàng việc hoặc dùng một menu `Công cụ`
     theo quyền để vào POS/KDS/Runner, đơn hàng hay cài đặt Branch.
  4. **Kết ngày:** Đi tới chốt ca, duyệt lệch hoặc xử lý tồn đọng từ chính hàng
     việc liên quan.
- **Thông tin hiển thị:**
  - **Nên hiển thị:** trạng thái ca hiện tại, hàng chờ/ngoại lệ có đích xử lý rõ
    ràng và đúng một menu công cụ theo quyền.
  - **KHÔNG hiển thị:** `KpiRow`, `KpiCard`, biểu đồ, doanh thu tổng hợp,
    dashboard-card mosaic, báo cáo tài chính toàn hệ thống, công nợ NCC tổng,
    hoặc thiết lập phân quyền tenant.
- **Quy chuẩn UX/UI:**
  - `Nay` chỉ giữ trạng thái ca hiện tại và các hàng chờ có số lượng lớn hơn `0`; khi không có hàng chờ, hiển thị đúng một tín hiệu yên `Không có việc cần xử lý`. Readiness cấu hình thuộc `/settings`; trạng thái đã đạt hoặc đã có trong hàng chờ không được lặp lại ở `Nay`. Điểm vào POS/KDS/Runner, đơn hàng và cấu hình chi nhánh nằm trong đúng một menu `Công cụ` ở tiêu đề, không tạo thêm các section/card thư mục trong thân màn. Finance, HR, payroll và tenant settings thuộc Admin Dashboard, không nhét vào menu Branch. Không lặp lại `Đội`, `Tồn`, `Hồ sơ` hoặc route alias `/dashboard` ở điều hướng.
  - `Ca` sở hữu ngày làm việc cá nhân theo thứ tự `trạng thái/hành động hiện tại → checklist và đếm tồn đang làm → cảnh báo ca cũ → lịch ca trong ngày`. Quản lý chi nhánh chỉ thấy thẻ chấm công cá nhân và cảnh báo ca cũ; không tải hoặc lặp danh sách đội, hàng chờ duyệt hay lối vào `Đội`. Owner không thấy tab này; truy cập trực tiếp route gốc chuyển về `Đội`. Các route duyệt và chi tiết vẫn giữ nguyên ACL riêng.
  - `Đội` mở trực tiếp ba tab `Theo dõi ca`, `Nhân sự`, `Phân công`. Tab là URL navigation và server chỉ tải nội dung tab đang mở; tab không có quyền bị ẩn thay vì tải rồi trả `no-access`. Tab theo dõi ưu tiên `Cần xử lý`, rồi `Đang làm`, rồi toàn bộ; không hiển thị bộ lọc có kết quả bằng 0. Nghỉ phép đã duyệt thay thế trạng thái chấm công, không được hiện đồng thời với `Chưa vào ca`.
  - `Nhân sự` dùng hàng danh sách có trạng thái hiện tại; chạm một hàng mới mở chi tiết. Bỏ chip lọc bằng 0. `Phân công` là nội dung trần trong tab, không bọc thêm một page/panel khác; đưa nhân sự đã có mục kiểm kê lên trước nhưng không ẩn người chưa được phân công.
  - `Hồ sơ` dùng một hàng nhận diện gọn, một nhóm liên hệ và action chỉnh sửa; không dùng hero avatar hoặc panel lồng. Phiếu lương hiển thị danh sách kỳ và số thực nhận trước, chỉ mở breakdown của một kỳ trong sheet.

---

### 2.5. Phân hệ Kho hàng (Inventory Workspace) — `/inventory` & `/br/[branchId]/stock`

- **Archetype:** `/inventory` dùng `DASHBOARD`; `/br/[branchId]/stock` và `/inventory/stock` dùng `LIST` nhưng khác presentation plane. `/br/[branchId]/stock/on-hand` là `REDIRECT-SHIM` về route Tồn canonical. `/inventory/operations?tab=grn`, `/br/[branchId]/stock/grn`, bước chọn NCC `/br/[branchId]/stock/grn/new`, `/br/[branchId]/stock/issues`, `/br/[branchId]/stock/consumption`, `/br/[branchId]/stock/count-slips`, và `/br/[branchId]/stock/waste-approvals` là `LIST`. Detail consumption và issue Branch thuộc `DETAIL`; form dòng GRN và phiếu hao hụt Branch thuộc `DOC-WORKFLOW`; `/br/[branchId]/stock/reports` là Branch touch `REPORT` theo tín hiệu từng nguyên liệu.
- **Đối tượng sử dụng chính:** Admin Dashboard `/inventory/*` dành cho Chủ cửa
  hàng (`owner`). Branch `/br/[branchId]/stock/*` dành cho Quản lý chi nhánh
  (`branch_manager`), với Owner vào quan sát/hỗ trợ; mọi action tiếp tục bị
  permission + branch scope giới hạn.
- **Mục tiêu Nghiệp vụ (Why?):**
  - Kiểm soát chính xác số lượng nguyên liệu tồn kho thực tế, tính toán giá vốn hàng bán (WAC), giảm thiểu hao hụt/thất thoát nguyên liệu và tối ưu hóa chi phí mua hàng.
- **Mục tiêu Người dùng (Goal):** Nhìn tồn để quyết định đúng việc cần làm, nhập kho nhanh và tạo lệnh sản xuất không sai lệch.
- **Luồng thao tác (Workflow):**
  - **Nhập kho (GRN):** Tạo phiếu nhập kho từ nhà cung cấp -> Kiểm đếm thực tế -> Xác nhận nhập kho (cập nhật tồn kho và tính lại giá vốn).
  - **Sản xuất:** Chọn thành phẩm và sản lượng -> Kiểm tra định mức/nguyên liệu khả dụng -> Tạo lệnh -> Bắt đầu -> Nhập thực dùng và sản lượng thực tế -> Hoàn thành lệnh.
  - **Kiểm kê (Stocktake):** Tạo đợt kiểm kê -> Nhân viên đi đếm thực tế (kiểm kê mù - blind stocktake) -> Quản lý đối chiếu chênh lệch -> Xác nhận cân đối kho.
  - **Điều chuyển (Transfer):** Operator không mở điều chuyển Kho↔Bếp hay cross-branch mới (D078 — một kho/chi nhánh). Lịch sử transfer còn ở Admin Dashboard khi cần audit.
  - **Xuất nội bộ (Issue):** Mở phiếu hủy hỏng hoặc xuất khác tại chi nhánh -> thêm từng nguyên liệu với đơn vị, số lượng và lý do -> rà soát phiếu nháp -> xác nhận để ghi giảm tồn hoặc hủy trước khi chốt.
  - **Hao hụt thủ công (Waste):** Chọn đúng vị trí kho của chi nhánh -> thêm từng nguyên liệu trong một dòng chạm riêng -> nhập số lượng không vượt tồn, lý do và ảnh khi được yêu cầu -> xem cảnh báo cap theo ca/ngày -> tạo phiếu để ghi giảm hoặc chờ quản lý duyệt theo tier. WAC, đơn vị và bằng chứng được server kiểm tra lại khi submit.
  - **Hàng NCC bị từ chối:** Ghi nhận qua luồng Báo hao hụt; giao diện tạo phiếu trả NCC và PO đã rút khỏi sử dụng hằng ngày theo D073, nhưng lịch sử dữ liệu vẫn được giữ.
  - **Báo cáo kho (Branch Report):** Xem chênh lệch tiêu hao warning/critical và biến động tháng hiện tại theo từng nguyên liệu -> chạm để mở tồn thực của nguyên liệu cần xử lý. Không tổng hợp số lượng giữa các đơn vị.
- **Thông tin hiển thị:**
  - **Nên hiển thị:** Danh sách nguyên liệu kèm tồn khả dụng, đơn vị tính; Trạng thái các phiếu kho (Nháp / Đang giao / Hoàn thành); Cảnh báo tồn dưới mức an toàn.
  - **KHÔNG hiển thị:** Doanh thu bán hàng chi tiết, thông tin thẻ tín dụng của khách, bảng lương nhân sự.
- **Quy chuẩn UX/UI:**
  - Branch `/br/[branchId]/stock` là màn `Tồn` canonical: mở thẳng danh sách tồn thực; lượng hàng cần bổ sung chỉ là tín hiệu gọn ở tiêu đề và trên từng dòng, còn các action được cấp quyền (`Nhập hàng`, `Kiểm kê`, `Hao hụt`) nằm trong một menu thao tác. Không biến bottom tab thành thư mục tính năng hoặc xếp nhiều khối nghiệp vụ trước dữ liệu. Bộ lọc dùng URL-state để giữ ngữ cảnh khi reload hoặc quay lại từ chi tiết nhưng luôn thu gọn khi vào màn; `/stock/on-hand` chỉ redirect về route này.
  - Các list kho Branch giữ tab/tìm kiếm/bộ lọc trong URL (`Tồn`, GRN, phiếu xuất, tiêu hao, duyệt kiểm kê). Link vào detail hoặc flow tạo mới phải mang `returnTo` nội bộ đã kiểm tra để nút Back quay đúng ngữ cảnh; không dùng `localStorage` hay `router.back()` làm source of truth.
  - `/br/[branchId]/stock/production` là HUB/LIST Branch-native: ưu tiên lệnh đang sản xuất, sau đó lệnh nháp, CTA tạo lệnh và lịch sử hoàn tất. Không dùng `AppLinkCard` mosaic, `DataTable`, query-view trung gian hoặc presenter Admin Dashboard.
  - `/br/[branchId]/stock/production/new` là `DOC-WORKFLOW` Branch-native: URL khóa chi nhánh sản xuất; người dùng chọn thành phẩm/sản lượng, nơi xuất nguyên liệu và nơi nhận thành phẩm trong chính chi nhánh, kiểm tra định mức và tạo lệnh. Điện thoại giữ một cột; tablet ngang có panel thông tin và panel nguyên liệu. Không import `ProductionNewClient`, `DocumentFormFrame` hoặc `DataTable` Admin Dashboard.
  - `/br/[branchId]/stock/production/[id]` là `DETAIL` Branch-native: ưu tiên trạng thái, sản lượng dự kiến/thực tế, nguyên liệu thực dùng, thiếu hụt và đúng một hành động tiếp theo theo state machine. Lệnh nháp bắt đầu sản xuất; lệnh đang làm mới hoàn thành; hủy luôn xác nhận. Không import `ProductionDetailClient` hoặc presenter Admin Dashboard.
  - Admin Dashboard `/inventory/stock` dùng management list responsive: compact card một cột trên phone, hai cột từ tablet đến `1279px`, và `DataTable` từ `1280px` để đối chiếu WAC/giá trị tồn. Tín hiệu công việc chỉ đọc nằm cùng page header; toolbar giữ tìm kiếm, filter và action để không chồng lấn ở desktop rộng.
  - Branch `/br/[branchId]/stock` là danh sách quyết định touch-first ở mọi viewport điện thoại/tablet, kể cả `1024px` landscape: viewport đầu phải ưu tiên tên màn, tìm kiếm/bộ lọc gọn và các item tồn trong grid một cột trên phone, hai cột từ tablet portrait, ba cột từ tablet landscape; không có warning card, nested stock card, onboarding card hoặc task launcher đứng trước danh sách. Nguyên liệu có số lượng bằng `0` vẫn là dữ liệu tồn và phải hiện thành item `Hết hàng`, không được thay bằng empty state. Các item rủi ro luôn xếp đầu và nêu rõ `Hết hàng`/`Thấp`/`Chạm reorder`; mỗi item chỉ giữ tên/SKU, loại hàng, tồn + đơn vị và chạm để xem chi tiết. Bộ lọc URL luôn thu gọn khi vào màn, chỉ hiện bộ lọc vị trí khi chi nhánh thật sự có nhiều vị trí tồn. Không đổi sang `DataTable` hoặc đưa WAC, giá trị tồn hay KPI Admin Dashboard vào màn tra cứu trong ca.
  - Branch `/br/[branchId]/stock/on-hand/[ingredientId]` là `DETAIL` touch-native: ưu tiên trạng thái/tồn hiện tại, vị trí tồn, chuyển động gần đây, sau đó là ngưỡng và action được cấp quyền. Nhận từ NCC mở GRN, còn `/stock/receive` chỉ dành cho phiếu chuyển nội bộ; route không tải hoặc hiển thị WAC, giá trị tồn, audit/correction, hoặc Admin Dashboard detail chrome.
  - Branch `/br/[branchId]/stock/receive` là `LIST` tương thích chỉ cho các phiếu điều chuyển cũ đang chờ nhận. Không có tạo mới, gửi đi hoặc lịch sử; `/stock/transfer` redirect về queue này và `/stock/transfer/new` redirect về `Tồn`. Chi tiết nhận giữ state machine hiện có để hoàn tất dữ liệu đang dở, còn lịch sử transfer thuộc Admin Dashboard.
  - Branch `/br/[branchId]/stock/grn` ưu tiên nháp của người đang nhận hàng, sau đó là hàng đợi GRN có tìm kiếm/lọc trạng thái. Mỗi row chỉ hiển thị mã, NCC, ngày và trạng thái; chạm để tiếp tục/xem phiếu, bỏ nháp là action riêng có xác nhận. Không đưa tổng tiền, tên chi nhánh, `DataTable` hay long-press từ Admin Dashboard sang route này.
  - Branch `/br/[branchId]/stock/grn/new` dùng source list touch-native supplier-first: chọn NCC, giữ context chi nhánh từ route, và chuyển sang URL supplier Branch canonical. Không lặp branch picker, PO hoặc khung form Admin Dashboard tại bước chọn nguồn.
  - Branch `/br/[branchId]/stock/grn/new/[supplierId]` dùng form dòng touch-native: context NCC/kho nhận, các dòng đã thêm, tìm nguyên liệu và action sticky theo đúng thứ tự thao tác. Chỉ đổi nơi nhận trong chi nhánh đã khóa bởi URL; phone sửa dòng bằng bottom sheet, tablet landscape chỉ mở hai panel thay vì bảng hoặc side editor Admin Dashboard.
  - Branch `/br/[branchId]/stock/grn/[id]` giữ review/receipt native: nháp cho phép kiểm nhận, thêm/sửa dòng trong bottom sheet rồi lưu/chốt; phiếu đã chốt chỉ hiển thị biên nhận và các dòng thực nhận. Không đưa audit, sửa sau chốt, stock correction, hóa đơn NCC, hoặc `GRNDetailClient` Admin Dashboard vào Branch.
  - Branch `/br/[branchId]/stock/stocktake` là `LIST` touch-native cho phiên kiểm kê của quản lý chi nhánh: ưu tiên phiên đang thực hiện, sau đó là lịch sử theo trạng thái. Không dùng `DataTable`, long-press drawer, branch picker, audit, hay action Admin Dashboard; phiếu đếm cá nhân thuộc ngày làm việc tại `/shift/count`, còn `/stock/count` chỉ là redirect tương thích.
  - Branch `/br/[branchId]/stock/stocktake/new` là `DOC-WORKFLOW` touch-native: URL khóa chi nhánh, người quản lý chỉ chọn mode và vị trí, rồi action sticky mở phiên và chuyển thẳng sang count. Không lặp selector đổi chi nhánh hoặc `DocumentFormFrame` Admin Dashboard.
  - Branch `/br/[branchId]/stock/stocktake/[id]/count` là `DOC-WORKFLOW` số đếm mù: first viewport là nguyên liệu đang đếm, đơn vị ghi nhận, number pad và lưu/đi tiếp; draft, zone lock và submit round giữ authority Server Action/RPC hiện có. Không tải hay hiển thị số tồn hệ thống trước khi phiên hoàn tất, và không đổi tablet thành bảng Admin Dashboard.
  - Branch `/br/[branchId]/stock/stocktake/[id]` là `DETAIL` touch-native: phiên đang thực hiện chỉ review số đếm mù/đếm lại và action tiếp tục/chốt theo quyền; khi hoàn tất mới hiển thị hệ thống, thực đếm và chênh lệch theo từng nguyên liệu. Không đưa audit history, report CTA, WAC, giá trị tồn hoặc Admin Dashboard detail chrome vào Branch.
  - Branch `/br/[branchId]/stock/issues` là `LIST` touch-native cho xuất khác: scope chi nhánh chỉ lấy từ URL, hàng phiếu hiển thị mã, loại, ngày và trạng thái; tạo nháp chỉ tạo loại `other` trong bottom sheet ngắn. Writeoff cũ vẫn hiện để đọc lịch sử nhưng không được tạo từ route này; hao hụt mới luôn đi qua `/stock/waste` để giữ tier, ảnh và approval. Không lặp branch picker, tổng giá trị, export, `DataTable` hoặc audit Admin Dashboard.
  - Branch `/br/[branchId]/stock/issues/[id]` là `DETAIL` touch-native: nháp `other` cho thêm/sửa/xóa một dòng nguyên liệu bằng bottom sheet, bắt buộc lý do và kiểm tra số lượng theo đơn vị nhập trước khi gọi Server Action; chốt/hủy là action sticky có xác nhận. Writeoff cũ và phiếu cuối chỉ đọc; WAC, giá trị, audit và correction thuộc Admin Dashboard.
  - Branch `/br/[branchId]/stock/consumption` là `LIST` touch-native với hai view tách bạch: ledger tiêu hao đã ghi và chứng từ thủ công cần rà soát. Row giữ loại nguồn (`pos`, `manual`, `hrm`, `import`, `other`), trạng thái và thời điểm; `/stock/consumption/[id]` chỉ mở detail đúng loại tiêu hao. Không import presenter Admin Dashboard hoặc đổi thành bảng desktop ở tablet.
  - Phân công kiểm kê thuộc tab `Đội` tại `/br/[branchId]/team?tab=assignments`; `/stock/count-assignments` chỉ là redirect tương thích. `/stock/count-slips` vẫn là `LIST` touch-native để quản lý review từng chênh lệch rồi duyệt/yêu cầu đếm lại trong bottom sheet có action sticky. Không dẫn quản lý vào phiếu đếm cá nhân của chính họ và không dùng client Admin Dashboard.
  - Admin Dashboard `/inventory/count-assignments` và `/inventory/count-slips` giữ management list desktop-responsive bằng `DataTable`; chỉnh phân công và review dòng phiếu mở trong `AppDialog` với action hiển thị rõ. Không dùng swipe, long-press, drawer hoặc presenter Branch.
  - Branch `/br/[branchId]/stock/reports` là `REPORT` touch-native: branch URL và tháng hiện tại khóa phạm vi; first viewport là chênh lệch tiêu hao warning/critical, sau đó là các nguyên liệu biến động nhiều nhất. Mỗi quantity giữ nguyên unit của nguyên liệu và row chạm vào tồn thực tương ứng. Không đưa biểu đồ, KPI/tổng quantity chéo đơn vị, công nợ NCC, giá vốn, branch/date picker, export, `DataTable`, audit hoặc presenter Admin Dashboard vào phone/tablet.
  - Branch `/br/[branchId]/stock/waste` là `DOC-WORKFLOW` touch-native: vị trí kho và cảnh báo cap ở màn chính, danh sách dòng hao hụt chỉ hiển thị nguyên liệu, số lượng/đơn vị, tier và giá trị dự kiến; mỗi dòng sửa trong bottom sheet để giữ ngữ cảnh tồn, lý do và bằng chứng. URL khóa branch, không dùng branch picker, `DocumentFormFrame`, `DataTable`, header/toolbar Admin Dashboard, audit hoặc tổng quan chi phí Admin Dashboard. Server Action/RPC vẫn là authority cho WAC, tồn, tier và approval.
  - Branch `/br/[branchId]/stock/waste-approvals` là `LIST` touch-native: queue chỉ hiển thị phiếu chờ duyệt của branch URL, giá trị, người tạo, thời điểm, ca, số dòng và tier cao nhất; chạm một phiếu mở bottom sheet chứa dòng, lý do, ảnh bằng chứng và ghi chú duyệt. Phiếu do chính người dùng tạo vẫn xem được nhưng không có action; approve/reject xác nhận trước khi gọi Server Action hiện có. Không dùng branch picker, `DocumentFormFrame`, `DataTable`, Admin Dashboard card presenter, audit/export hoặc dữ liệu cross-branch.
  - Form hao hụt và ghi chú duyệt phải chặn cả reload lẫn điều hướng SPA từ bottom nav khi còn draft; xác nhận rời màn dùng cùng copy mất dữ liệu và không được tự động bỏ bản nháp.
  - Mọi hành động làm thay đổi số lượng tồn kho (Nhập, Xuất, Điều chuyển, Kiểm kê) bắt buộc phải tạo ra một dòng chứng từ `stock_movements` (chỉ ghi thêm - append-only) để phục vụ việc kiểm toán dữ liệu. Nghiêm cấm việc thay đổi trực tiếp số lượng tồn kho bằng lệnh UPDATE thô trong DB.

---

### 2.6. Lập phiếu nhập kho (GRN) — `/inventory/grn/new` & `/br/[branchId]/stock/grn/new`

- **Archetype:** Admin Dashboard dùng `DOC-WORKFLOW`; Branch source selection dùng touch `LIST`, sau đó mở form dòng touch `DOC-WORKFLOW` tại `/br/[branchId]/stock/grn/new/[supplierId]` và review/receipt touch `DETAIL` tại `/br/[branchId]/stock/grn/[id]`.
- **Đối tượng sử dụng chính:** Quản lý kho, Nhân viên nhận hàng.
- **Mục tiêu Nghiệp vụ (Why?):** Ghi nhận chính xác số lượng nguyên liệu thực tế nhận từ nhà cung cấp để cập nhật tồn kho tức thời và xác lập cơ sở tính giá vốn hàng bán chính xác.
- **Mục tiêu Người dùng (Goal):** Chọn NCC, ghi nhận đúng hàng thực giao và hoàn thành phiếu nhập kho nhanh nhất để giải phóng xe giao hàng.
- **Luồng thao tác (Workflow):**
  1. **Chọn nguồn:** Chọn nhà cung cấp; phạm vi chi nhánh lấy từ route.
  2. **Kiểm đếm:** Nhập số lượng thực nhận cho từng dòng nguyên liệu.
  3. **Xác lập giá:** Nhập đơn giá thực mua trên hóa đơn đi kèm.
  4. **Hoàn tất:** Bấm "Xác nhận nhập kho" -> Ghi tăng tồn kho tức thời, cập nhật giá vốn trung bình gia quyền (WAC) của nguyên liệu.
- **Thông tin hiển thị:**
  - **Nên hiển thị:** Admin Dashboard dùng khung form dòng (`DocumentFormFrame`); Branch hiển thị NCC/kho nhận, danh sách dòng chạm để sửa, tìm nguyên liệu, đơn vị quy đổi chuẩn và action sticky. Review Branch dùng sheet cho dữ kiện nhận hàng; biên nhận Branch sau chốt chỉ đọc.
  - **KHÔNG hiển thị:** Các biểu đồ phân tích xu hướng giá của năm, thông tin quỹ tiền mặt của chi nhánh.
- **Quy chuẩn UX/UI:**
  - Admin Dashboard bắt buộc dùng `DocumentFormFrame` (bố cục header cố định + thân cuộn chứa danh sách dòng + footer chứa tổng tiền và nút bấm xác nhận). Branch bắt buộc dùng `BranchOperatorPage` + `BranchOperatorPanel` + `AppDetailFooter` sticky; không render khung Admin Dashboard, bảng desktop, hoặc picker đổi chi nhánh.
  - Nút "Xác nhận nhập kho" phải nằm ở vị trí cố định dưới cùng bên phải và yêu cầu xác nhận lại qua Dialog để tránh bấm nhầm khi chưa kiểm đếm xong.

---

### 2.7. Đối soát hóa đơn NCC (Supplier Invoice Match) — `/inventory/supplier-invoices`

- **Archetype:** `LIST`.
- **Đối tượng sử dụng chính:** Chủ cửa hàng (`owner`).
- **Mục tiêu Nghiệp vụ (Why?):**
  - Đối soát phiếu thực nhập (GRN) với hóa đơn NCC gửi đến. Đảm bảo HKD chỉ thanh toán đúng lượng thực nhận và đơn giá trên chứng từ mua hàng, tránh thất thoát tài chính.
- **Mục tiêu Người dùng (Goal):** Phát hiện nhanh các dòng hóa đơn bị lệch giá hoặc lệch lượng để yêu cầu NCC điều chỉnh trước khi bấm duyệt thanh toán.
- **Luồng thao tác (Workflow):**
  1. **Nhập hóa đơn:** Tạo hồ sơ hóa đơn NCC mới (số hóa đơn, ngày, tổng tiền thuế).
  2. **Liên kết:** Chọn các phiếu nhập kho (GRN) tương ứng của hóa đơn đó.
  3. **Đối soát:** Hệ thống tự động so khớp từng dòng hóa đơn với số lượng và đơn giá thực nhận trên GRN.
  4. **Xử lý chênh lệch:** Đánh dấu "Hợp lệ" nếu khớp; hoặc ghi chú "Lệch giá" / "Lệch lượng" để kế toán làm việc lại với NCC.
  5. **Duyệt:** Bấm "Duyệt thanh toán" để chuyển trạng thái sang hàng chờ chi của phân hệ tài chính.
- **Thông tin hiển thị:**
  - **Nên hiển thị:** Giao diện so sánh song song các dòng mặt hàng; Ký hiệu cảnh báo đỏ tại các vị trí phát hiện chênh lệch đơn giá hoặc số lượng.
  - **KHÔNG hiển thị:** Doanh thu bán cơm tấm, sơ đồ bàn ăn, ca làm việc của nhân viên phục vụ.
- **Quy chuẩn UX/UI:**
  - Bố cục màn hình rộng (width `xwide` tối thiểu `1600px` trên desktop) để hiển thị đủ các cột đối chiếu mà không phải cuộn ngang quá nhiều gây mỏi mắt và dễ nhìn sót số liệu.

---

### 2.8. Quản lý Nhân sự & Phân quyền — `/hr/staff`

- **Archetype:** `LIST`.
- **Đối tượng sử dụng chính:** Admin Dashboard `/hr/*` dành riêng cho Chủ cửa
  hàng (`owner`) để quản lý tài khoản, quyền và lịch sử oversight. Quản lý chi
  nhánh chỉ dùng các màn `Đội`, hồ sơ và phê duyệt theo scope tại
  `/br/[branchId]/shift/*`; không vào `/hr/*`.
- **Mục tiêu Nghiệp vụ (Why?):**
  - Quản lý thông tin NLĐ, gán đúng chức danh, chi nhánh làm việc và cấp đúng quyền truy cập hệ thống để bảo mật dữ liệu, tránh nhân viên xem hoặc sửa dữ liệu vượt cấp (ví dụ: Thu ngân sửa giá món, Bếp xem báo cáo doanh thu chuỗi).
- **Mục tiêu Người dùng (Goal):** Thêm nhân viên mới, gán chi nhánh và cấp quyền cho họ chỉ trong 3 bước.
- **Luồng thao tác (Workflow):**
  1. **Tạo hồ sơ:** Nhập thông tin cá nhân (Họ tên, SĐT, Số CCCD, Ngày sinh).
  2. **Gán vị trí:** Chọn chức danh (ví dụ: Thu ngân, Đầu bếp) -> Chọn chi nhánh hoạt động chính.
  3. **Cấp tài khoản:** Nhập email -> Hệ thống tạo tài khoản auth và gán mẫu quyền (`role template`) tương ứng với chức danh.
  4. **Tùy chỉnh quyền (Chỉ Owner):** Thêm hoặc bớt một vài permission key cụ thể cho nhân sự đó nếu có yêu cầu đặc biệt.
- **Thông tin hiển thị:**
  - **Nên hiển thị:** Danh sách tài khoản nhân sự kèm chức danh và chi nhánh; Bảng danh sách các quyền truy cập hệ thống được chia nhóm trực quan kèm hộp kiểm (checkbox) bật/tắt quyền.
  - **KHÔNG hiển thị:** Doanh thu, số lượng tồn kho nguyên liệu, chi tiết công nợ NCC.
- **Quy chuẩn UX/UI:**
  - Toàn bộ thao tác thay đổi phân quyền phải ghi nhận vào nhật ký phân quyền (`hr/staff/audit`) để phục vụ việc hậu kiểm an ninh hệ thống.
  - `/br/[branchId]/shift/leave-approvals` là `LIST` touch-native cố định theo chi nhánh URL: tab trạng thái và full-row item phục vụ quét nhanh; chạm một yêu cầu mở bottom sheet có chi tiết ngày nghỉ, lý do và action duyệt/từ chối sticky. Admin Dashboard tiếp tục dùng bảng HR desktop; hai plane chỉ chia sẻ loader/model/action, không chia sẻ presenter.

---

### 2.9. Báo cáo Doanh thu & Chi phí — `/finance`

- **Archetype:** `DASHBOARD`.
- **Đối tượng sử dụng chính:** Chủ cửa hàng (`owner`).
- **Mục tiêu Nghiệp vụ (Why?):**
  - Cung cấp bức tranh tài chính chính xác về dòng tiền vào/ra, chi phí nguyên liệu, chi phí nhân sự và lợi nhuận gộp thực tế của HKD theo ngày/tháng để đưa ra quyết định kinh doanh.
- **Mục tiêu Người dùng (Goal):** Biết hôm nay lời hay lỗ bao nhiêu, tiền mặt thực tế đã khớp với tài khoản ngân hàng chưa, và xuất file cho kế toán thuế.
- **Luồng thao tác (Workflow):**
  1. **Chọn kỳ báo cáo:** Lọc theo ngày hôm nay / Tuần này / Tháng này / Chọn khoảng ngày.
  2. **Chọn phạm vi:** Lọc theo toàn chuỗi hoặc một chi nhánh cụ thể.
  3. **Xem KPIs:** Đọc các chỉ số doanh thu ròng, chi phí nguyên liệu (COGS), chi phí nhân sự, lợi nhuận gộp.
  4. **Đối soát dòng tiền:** Xem danh sách giao dịch SePay khớp tự động với VietQR -> Xác nhận các dòng chưa khớp.
  5. **Xuất bản:** Xuất báo cáo dạng file Excel/CSV phục vụ kê khai thuế theo Thông tư 152/2025/TT-BTC.
- **Thông tin hiển thị:**
  - **Nên hiển thị:** Biểu đồ xu hướng doanh thu; Bảng KPIs tài chính chuẩn hóa; Bảng kê chi tiết các giao dịch dòng tiền kèm mã tham chiếu giao dịch ngân hàng.
  - **KHÔNG hiển thị:** Nút bấm tạo order mới, danh sách các bước chế biến món ăn của bếp, hoặc các tính năng phân tích tài chính doanh nghiệp cổ phần phức tạp không áp dụng cho mô hình HKD.
- **Quy chuẩn UX/UI:**
  - Mọi số liệu tiền tệ phải được định dạng chuẩn VND bằng hàm `formatVND` (ví dụ: `150.000đ`, không viết `150k` hay `150000`).
  - Tất cả các biểu đồ tài chính chỉ được phép sử dụng bảng màu quy chuẩn từ `chart-1` đến `chart-5` trong token của hệ thống để đảm bảo tính đồng bộ thị giác.
