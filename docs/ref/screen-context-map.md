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

### 2.4. Bảng điều khiển Chi nhánh (Branch Dashboard) — `/br/[branchId]/dashboard`

- **Archetype:** `DASHBOARD`.
- **Đối tượng sử dụng chính:** Quản lý chi nhánh (`branch_manager`), Chủ cửa hàng (`owner`).
- **Mục tiêu Nghiệp vụ (Why?):**
  - Cho biết chi nhánh đang có ngoại lệ vận hành hoặc việc quản lý nào phải xử lý ngay trong ngày, không biến Branch runtime thành dashboard tài chính thu nhỏ.
- **Mục tiêu Người dùng (Goal):** Biết ngay chi nhánh có đang vận hành ổn định không, có sự cố nào cần xử lý khẩn cấp không (lệch tiền két, thiếu nguyên liệu, chưa mở ca POS).
- **Luồng thao tác (Workflow):**
  1. **Đọc việc cần xử lý:** Xem ngoại lệ hoặc readiness chưa đạt theo mức ưu tiên.
  2. **Giám sát vận hành:** Mở đúng workflow sở hữu trạng thái máy in, phiên POS, nhân sự hoặc kho.
  3. **Kết ngày:** Đi tới công việc chốt ca, duyệt lệch hoặc kiểm tra còn tồn đọng.
- **Thông tin hiển thị:**
  - **Nên hiển thị:** Lanes công việc có đích xử lý rõ ràng: vận hành đang mở, readiness, việc kết ngày và drill-down quản lý.
  - **KHÔNG hiển thị:** `KpiRow`, `KpiCard`, biểu đồ, doanh thu tổng hợp, dashboard-card mosaic, báo cáo tài chính chi tiết của cả chuỗi (L0), công nợ nhà cung cấp tổng, hoặc cấu hình phân quyền hệ thống.
- **Quy chuẩn UX/UI:**
  - Ưu tiên hiển thị danh sách công việc cần làm (`task queue first`) lên đầu để định hướng hành động cho Quản lý chi nhánh ngay khi mở trang.

---

### 2.4. control_surface — `/`

- **Archetype:** `LANDING`.
- **Đối tượng sử dụng chính:** Chủ sở hữu (`owner`).
- **Mục tiêu Nghiệp vụ (Why?):** Gom điểm vào điều hành, kiểm soát và thiết lập
  toàn hệ thống về một nơi rõ ràng, tách khỏi công việc hằng ngày của Chi nhánh.
- **Mục tiêu Người dùng (Goal):** Từ Chi nhánh mở một cửa control_surface, sau
  đó chọn đúng mô-đun cần kiểm soát mà không đi qua nhiều shortcut rời rạc.
- **Thông tin hiển thị:** Hai nhóm `Điều hành` và `Nền tảng`; hàng điều hướng
  cho Tài chính, Đơn hàng, Kho hàng, Thực đơn,
  Nhân sự, Chi nhánh và Cài đặt. Không hiển thị KPI khi chưa có contract dữ liệu
  Owner tương ứng.
- **Quy chuẩn UX/UI:** Dùng `AppPage` + `AppSection` + `ItemGroup` + `Item`;
  không có Header/Breadcrumb dư thừa, toàn bộ hàng là điểm vào mô-đun.
  Một cột trên phone, hai cột trên tablet dọc; desktop đặt nhóm Điều hành rộng
  hơn nhóm Nền tảng nhưng giữ cùng thứ tự thông tin.
  Chỉ Owner được vào mọi route top-level của control_surface.

### 2.4A. Trung tâm vận hành Chi nhánh — `/br/[branchId]`

- **Archetype:** `/br/[branchId]` dùng `LANDING`; `/shift` là màn ngày làm việc cá nhân; `/team` là `LIST` workspace với strip tab cuộn ngang: `Theo dõi ca` · `Nhân sự` luôn có, cộng `Phân ca` / `Chấm công` / `Duyệt kết ca` / `Duyệt nghỉ phép` theo quyền. Mỗi tab có chrome title + mô tả job phía trên nội dung. Phân công đếm nằm dưới Kho (`/stock/count-assignments`), không phải tab Team.
- **Đối tượng sử dụng chính:** Nhân viên trong ca, Quản lý chi nhánh (`branch_manager`) và Chủ cửa hàng (`owner`) theo đúng phạm vi từng tab.
- **Mục tiêu Nghiệp vụ (Why?):** Cho người vận hành đi từ việc cần xử lý đến đúng trạm hoặc đúng workspace trong một viewport ngắn.
- **Quy chuẩn UX/UI:**
  - Bottom nav **chi nhánh** (`branch_kind=branch`): `Hôm nay` · `Ca` · `Đội` · `Kho` · `Phản hồi`. Tab **Kho** land mặc định `/stock/on-hand` (danh sách tồn); `matchPrefixes` vẫn cover `/stock/*`. `Điều hành` và `Thiết lập` nằm trong overflow header.
  - Hub CN: hàng chờ > 0 rồi điểm vào bán hàng/bếp; queue **không** GRN/SX (D093).
  - **Exception hẹp (manager-like CN):** trên `/br/[branchId]` (không phải Dashboard), `owner` và `branch_manager` được một strip hai tín hiệu `Doanh thu` (thuần MTD) + `Chỉ tiêu` … Cashier/chef/staff không thấy strip. Hub trung tâm không hiện strip doanh thu.
  - `Ca` sở hữu ngày làm việc cá nhân (CN). Owner không thấy tab này; truy cập trực tiếp route gốc chuyển về `Đội`.
  - `Đội` mở workspace tab cuộn ngang (`Theo dõi ca`, `Nhân sự`, và tab quản lý theo quyền).

---

### 2.4B. Công việc cá nhân — `/me/*`

- **Archetype:** `EMBED-WRAPPER` mỏng vào shared staff-runtime; nội dung là cổng
  ngày làm việc cá nhân, không phải dashboard hay mô-đun L0.
- **Đối tượng sử dụng chính:** Kế toán, Kho Tổng, Bếp Trung Tâm và nhân viên
  Văn phòng công ty không có Branch assignment. Nhân viên cửa hàng tiếp tục dùng
  `/br/[branchId]/shift/*` và `/br/[branchId]/profile/*`; Owner không dùng `/me`.
- **Mục tiêu Nghiệp vụ (Why?):** Cho mọi nhân viên ngoài Branch một nơi thống
  nhất để chấm công, theo dõi lịch, xin nghỉ, xem hồ sơ và phiếu lương mà không
  phải cấp quyền giả vào Tài chính, Kho hoặc Nhân sự.
- **Mục tiêu Người dùng (Goal):** Mở đúng việc cá nhân trong một đến hai thao tác,
  hoàn thành chấm công an toàn trên điện thoại và quay lại đúng trạng thái ngày
  làm việc.
- **Luồng thao tác:**
  1. Nhân sự có mô-đun đăng nhập vào mô-đun mặc định; mở Avatar Footer →
     `Trang cá nhân` → `/me`.
  2. Nhân sự Văn phòng không có mô-đun đăng nhập thẳng `/me`.
  3. `/me` hiển thị trạng thái hôm nay và đúng một CTA thích ứng:
     `Chấm công vào` → `Làm nhiệm vụ` → `Kết ca`.
  4. `Lịch làm`, `Xin nghỉ`, `Hồ sơ` và `Phiếu lương` giữ route actor-only dưới
     `/me/*`.
- **Thông tin hiển thị:** Ca hôm nay, giờ vào/ra, tiến độ việc trong ca, lịch của
  chính nhân viên, trạng thái phép và dữ liệu hồ sơ/phiếu lương của chính actor.
- **KHÔNG hiển thị:** Chọn nhân viên, chọn Branch/site, danh sách đội, hàng duyệt,
  quyền tài khoản, dữ liệu HR nhạy cảm của người khác hoặc module không được cấp.
- **Quy chuẩn UX/UI:**
  - `/me` là route ngang cấp với `/inventory`, `/finance` và `/hr`, nhưng không là
    tab mô-đun; điểm vào nằm trong Avatar Footer.
  - Dùng Control Surface shell. Desktop giữ Sidebar/Avatar Footer; mobile dùng
    drawer khi có mô-đun. Khi không có mô-đun, không render bottom-nav `Mô-đun`
    rỗng; Avatar trên header mở cùng account menu.
  - Nội dung dùng adapter `Employee*`, cột hẹp và task-led. Không dựng dashboard,
    KPI, hero, shell hoặc theme riêng.
  - Một CTA chính trong viewport đầu; touch target tối thiểu 44px; trạng thái
    loading, offline, camera bị từ chối, submitting, success và recoverable error
    có copy và đường phục hồi rõ ràng.

---

### 2.5. Phân hệ Kho hàng (Inventory Workspace) — `/inventory` & `/br/[branchId]/stock`

- **Planes (ADR 0012 / 0018):** Owner/Accountant/Kho Tổng/Bếp TT dùng
  `/inventory/*` (control_surface); operator stock của chi nhánh dùng
  `/br/[branchId]/stock/*`. Central roles bị khóa site theo JWT `branch_id` và
  dùng `/me/*` cho công việc cá nhân/chấm công.
- **Archetype:** `/inventory` dùng `DASHBOARD`; `/br/[branchId]/stock` dùng `LANDING`; `/inventory/stock`, `/inventory/purchase-requests`, `/inventory/purchase-orders`, `/inventory/grn`, `/inventory/consumption`, `/inventory/issues`, `/inventory/transfers`, `/br/[branchId]/stock/on-hand`, `/br/[branchId]/stock/issues`, `/br/[branchId]/stock/consumption`, `/br/[branchId]/stock/count-assignments`, `/br/[branchId]/stock/count-slips`, và `/br/[branchId]/stock/waste-approvals` là `LIST` nhưng khác presentation plane. `/inventory/transfers/new` và `/inventory/stock-requests/new` là `DOC-WORKFLOW`; `/inventory/waste/new` là `DOC-WORKFLOW`; `/inventory/issues` redirect vào `/inventory/consumption?view=waste`; `/inventory/supplier-invoices` là `REDIRECT-SHIM` (→ `/finance/supplier-invoices`, ADR 0018). `/inventory/operations` đã rút. Detail GRN, consumption và issue Branch thuộc `DETAIL`; form phiếu hao hụt Branch thuộc `DOC-WORKFLOW`; `/br/[branchId]/stock/reports` là Branch touch `REPORT` theo tín hiệu từng nguyên liệu.
- **Đối tượng sử dụng chính:** `/inventory` dành cho Chủ cửa hàng (`owner`),
  Kế toán, `central_supply_ops` và `central_kitchen_lead`; `/br/[branchId]/stock`
  dành cho `branch_manager` — plane touch, action bị permission giới hạn.
- **Mục tiêu Nghiệp vụ (Why?):**
  - Kiểm soát chính xác số lượng nguyên liệu tồn kho thực tế, tính toán giá vốn hàng bán (WAC), giảm thiểu hao hụt/thất thoát nguyên liệu và tối ưu hóa chi phí mua hàng.
- **Mục tiêu Người dùng (Goal):** Nhìn tồn để quyết định đúng việc cần làm, nhập kho nhanh và tạo lệnh sản xuất không sai lệch.
- **Luồng thao tác (Workflow):**
  - **Yêu cầu mua:** Kho trung tâm ghi nhu cầu mua ngoài; một yêu cầu có thể
    tạo nhiều đơn đặt hàng theo NCC.
  - **Đơn mua hàng:** Kế toán/Owner tạo từ Yêu cầu mua, nhập giá và duyệt. Mỗi
    PO thuộc đúng một NCC và tạo GRN theo từng lần giao.
  - **Nhập kho:** `/inventory/grn` là hàng đợi **Chờ nhập hàng**. Mở GRN được
    tạo từ PO, kiểm nhận vật lý, lưu nháp rồi xác nhận để cập nhật tồn và WAC.
  - **Sản xuất:** Chọn công thức đang dùng và sản lượng -> tạo lệnh snapshot tại Bếp TT -> Bắt đầu -> Nhập thực dùng và sản lượng thực tế -> Hoàn thành tại Bếp TT -> Điều chuyển riêng nếu cần giao chi nhánh.
  - **Kiểm kê (Stocktake):** Tạo đợt kiểm kê -> Nhân viên đi đếm thực tế (kiểm kê mù - blind stocktake) -> Quản lý đối chiếu chênh lệch -> Xác nhận cân đối kho.
  - **Điều chuyển (Transfer):** Chỉ chọn warehouse của site nguồn và đích;
    không có same-branch Kho↔Bếp. Kho Tổng → Bếp TT / chi nhánh; Bếp TT →
    chi nhánh hoặc trả về Kho Tổng; chi nhánh ↔ chi nhánh / Bếp TT. Quyền
    tạo/giao/nhận tiếp tục theo role matrix. Hub Giao nhận hiển thị một YCH
    thành một dòng với lane Kho Tổng/Bếp TT; DC liên kết không thành dòng độc
    lập. Bếp TT có CTA `Yêu cầu Kho Tổng` khi đúng site và chỉ chọn nguyên
    liệu nguồn Kho Tổng.
  - **Xuất nội bộ (Issue):** Mở phiếu hủy hỏng hoặc xuất khác tại chi nhánh -> thêm từng nguyên liệu với đơn vị, số lượng và lý do -> rà soát phiếu nháp -> xác nhận để ghi giảm tồn hoặc hủy trước khi chốt.
  - **Hao hụt thủ công (Waste):** Chọn đúng vị trí kho của chi nhánh -> thêm từng nguyên liệu trong một dòng chạm riêng -> nhập số lượng không vượt tồn, lý do và ảnh khi được yêu cầu -> xem cảnh báo cap theo ca/ngày -> tạo phiếu để ghi giảm hoặc chờ quản lý duyệt theo tier. WAC, đơn vị và bằng chứng được server kiểm tra lại khi submit.
  - **Hàng NCC bị từ chối:** Ghi trực tiếp trên dòng GRN bằng số lượng từ chối,
    lý do và ảnh; giao diện tạo phiếu trả NCC vẫn nghỉ.
  - **Báo cáo kho (Branch Report):** Xem chênh lệch tiêu hao warning/critical và biến động tháng hiện tại theo từng nguyên liệu -> chạm để mở tồn thực của nguyên liệu cần xử lý. Không tổng hợp số lượng giữa các đơn vị.
- **Thông tin hiển thị:**
  - **Nên hiển thị:** Danh sách nguyên liệu kèm tồn khả dụng, đơn vị tính; Trạng thái các phiếu kho (Nháp / Đang giao / Hoàn thành); Cảnh báo tồn dưới mức an toàn.
  - **KHÔNG hiển thị:** Doanh thu bán hàng chi tiết, thông tin thẻ tín dụng của khách, bảng lương nhân sự.
- **Quy chuẩn UX/UI:**
  - CN `/br/[branchId]/stock` (D093): ưu tiên `Tồn kho` → `Yêu cầu hàng` →
    `Tiêu hao`; kiểm kê, hao hụt, giao đếm, danh mục ở nhóm sau. **Không** tile
    Nhập hàng (GRN) hay Sản xuất trên kind `branch` (route redirect). Nhận hàng
    nội bộ qua DC gắn yêu cầu.
  - Kho Tổng / Bếp TT `/br/[siteId]/stock`: tile GRN, Giao nhận, Yêu cầu mua,
    Tồn/Kiểm/Hao hụt; Bếp TT thêm Sản xuất. Route GRN/SX chỉ mount khi
    `branch_kind` trung tâm.
  - Branch `/br/[branchId]/stock/requests` — phiếu yêu cầu hàng (LIST/DOC);
    Bếp TT dùng cùng route để yêu cầu Kho Tổng.
  - On-hand CN “Cần bổ sung” CTA → Yêu cầu hàng (không mở GRN).
  - Chi tiết phân vai: `docs/ref/inventory-role-ops.md`.
  - `/br/[branchId]/stock/on-hand` là **stock home** (điểm vào mặc định khi bấm Kho/Tồn): LIST touch-first mọi viewport phone/tablet kể cả `1024px` landscape. Attention theo `branch_kind`: CN/Bếp TT “Cần bổ sung” → Yêu cầu hàng / Yêu cầu Kho Tổng; Kho Tổng “Cần nhập / mua” → Nhập kho (+ YCM khi được phép), CTA 1–2 nút lưới 2 cột. Toolbar: search + `ToggleGroup` trạng thái + Sheet bộ lọc (`MultiSelectCombobox` danh mục) + Sheet “Thêm chức năng kho” (grid 2 cột job phụ). Risk rows đầu list; không WAC/KPI/DataTable. One-warehouse topology không hiển thị bộ lọc vị trí.
  - `/br/[branchId]/stock` là hub **Thêm chức năng** (secondary): các section workflow xếp theo thứ tự D093 (luồng hàng ngày → kiểm kê → hao hụt/tiêu hao → danh mục), mỗi job có mô tả ngắn; không còn land mặc định của tab Kho và không dùng tab lưới trần. Back từ subflow về `/stock/on-hand`.
  - `/br/[branchId]/stock/on-hand/[ingredientId]` là `DETAIL` touch-native: tồn/trạng thái → vị trí → biến động → ngưỡng; primary CTA kind-aware trên sticky footer; secondary trong `DropdownMenu`; back → on-hand. Không WAC/audit/control_surface chrome. `/stock/receive` chỉ dành cho phiếu chuyển nội bộ.
  - Branch `/br/[branchId]/stock/grn` ưu tiên nháp của người đang nhận hàng, sau đó là hàng đợi GRN có tìm kiếm/lọc trạng thái. Mỗi row chỉ hiển thị mã, NCC, ngày và trạng thái; chạm để tiếp tục/xem phiếu, bỏ nháp là action riêng có xác nhận. Không đưa tổng tiền, tên chi nhánh, `DataTable` hay long-press từ control_surface sang route này.
  - Branch `/br/[branchId]/stock/grn/new` và `/br/[branchId]/stock/grn/new/[supplierId]` chỉ là redirect tương thích: chi nhánh thường về Yêu cầu hàng; Kho Tổng/Bếp TT về Yêu cầu mua. Không tạo phiếu nhập ngoài PO.
  - Branch `/br/[branchId]/stock/grn/[id]` giữ review/receipt native: nháp cho phép kiểm nhận, thêm/sửa dòng trong bottom sheet rồi lưu/chốt; phiếu đã chốt chỉ hiển thị biên nhận và các dòng thực nhận. Không đưa audit, sửa sau chốt, stock correction, hóa đơn NCC, hoặc `GRNDetailClient` control_surface vào Branch.
  - Branch `/br/[branchId]/stock/stocktake` là `LIST` touch-native cho phiên kiểm kê của quản lý chi nhánh: ưu tiên phiên đang thực hiện, sau đó là lịch sử theo trạng thái. Không dùng `DataTable`, long-press drawer, branch picker, audit, hay action control_surface; `/stock/count` vẫn là phiếu đếm được giao riêng cho nhân viên.
  - Branch `/br/[branchId]/stock/stocktake/new` là `DOC-WORKFLOW` touch-native: URL khóa chi nhánh, người quản lý chỉ chọn mode và vị trí, rồi action sticky mở phiên và chuyển thẳng sang count. Không lặp selector đổi chi nhánh hoặc `DocumentFormFrame` control_surface.
  - Branch `/br/[branchId]/stock/stocktake/[id]/count` là `DOC-WORKFLOW` số đếm mù: first viewport là nguyên liệu đang đếm, đơn vị ghi nhận, number pad và lưu/đi tiếp; draft, zone lock và submit round giữ authority Server Action/RPC hiện có. Không tải hay hiển thị số tồn hệ thống trước khi phiên hoàn tất, và không đổi tablet thành bảng control_surface.
  - Branch `/br/[branchId]/stock/stocktake/[id]` là `DETAIL` touch-native: phiên đang thực hiện chỉ review số đếm mù/đếm lại và action tiếp tục/chốt theo quyền; khi hoàn tất mới hiển thị hệ thống, thực đếm và chênh lệch theo từng nguyên liệu. Không đưa audit history, report CTA, WAC, giá trị tồn hoặc control_surface detail chrome vào Branch.
  - Branch `/br/[branchId]/stock/issues` là `LIST` touch-native cho phiếu hao
    hụt (`writeoff`) đã tạo: scope chi nhánh chỉ lấy từ URL; tạo hao hụt mới
    qua `/stock/waste`, không picker `other`. Không lặp branch picker, tổng giá
    trị, export, `DataTable` hoặc audit control_surface.
  - Branch `/br/[branchId]/stock/issues/[id]` là `DETAIL` touch-native: nháp cho thêm/sửa/xóa một dòng nguyên liệu bằng bottom sheet, bắt buộc lý do và kiểm tra số lượng theo đơn vị đã chọn trước khi gọi Server Action; chốt/hủy là action sticky có xác nhận. Phiếu cuối chỉ đọc; WAC, giá trị, audit và correction thuộc control_surface.
  - Branch `/br/[branchId]/stock/consumption` là `LIST` touch-native với hai view tách bạch: ledger tiêu hao đã ghi và chứng từ thủ công cần rà soát. Row giữ loại nguồn (`pos`, `manual`, `hrm`, `import`, `other`), trạng thái và thời điểm; `/stock/consumption/[id]` chỉ mở detail đúng loại tiêu hao. Không import presenter control_surface hoặc đổi thành bảng desktop ở tablet.
  - Branch `/br/[branchId]/stock/count-assignments` và `/stock/count-slips` là hai `LIST` touch-native riêng cho quản lý: màn phân công nhóm nguyên liệu theo nhân viên; màn phiếu đếm review từng chênh lệch rồi duyệt/yêu cầu đếm lại trong bottom sheet có action sticky. Không dẫn quản lý vào phiếu đếm cá nhân của chính họ và không dùng client control_surface.
  - control_surface `/inventory/count-assignments` và `/inventory/count-slips` giữ management list desktop-responsive bằng `DataTable`; chỉnh phân công và review dòng phiếu mở trong `AppDialog` với action hiển thị rõ. Không dùng swipe, long-press, drawer hoặc presenter Branch.
  - Branch `/br/[branchId]/stock/reports` là `REPORT` touch-native: branch URL và tháng hiện tại khóa phạm vi; first viewport là chênh lệch tiêu hao warning/critical, sau đó là các nguyên liệu biến động nhiều nhất. Mỗi quantity giữ nguyên unit của nguyên liệu và row chạm vào tồn thực tương ứng. Không đưa biểu đồ, KPI/tổng quantity chéo đơn vị, công nợ NCC, giá vốn, branch/date picker, export, `DataTable`, audit hoặc presenter control_surface vào phone/tablet.
  - Branch `/br/[branchId]/stock/waste` là `DOC-WORKFLOW` touch-native: vị trí kho và cảnh báo cap ở màn chính, danh sách dòng hao hụt chỉ hiển thị nguyên liệu, số lượng/đơn vị, tier và giá trị dự kiến; mỗi dòng sửa trong bottom sheet để giữ ngữ cảnh tồn, lý do và bằng chứng. URL khóa branch, không dùng branch picker, `DocumentFormFrame`, `DataTable`, header/toolbar control_surface, audit hoặc tổng quan chi phí control_surface. Server Action/RPC vẫn là authority cho WAC, tồn, tier và approval.
  - Branch `/br/[branchId]/stock/waste-approvals` là `LIST` touch-native: queue chỉ hiển thị phiếu chờ duyệt của branch URL, giá trị, người tạo, thời điểm, ca, số dòng và tier cao nhất; chạm một phiếu mở bottom sheet chứa dòng, lý do, ảnh bằng chứng và ghi chú duyệt. Phiếu do chính người dùng tạo vẫn xem được nhưng không có action; approve/reject xác nhận trước khi gọi Server Action hiện có. Không dùng branch picker, `DocumentFormFrame`, `DataTable`, control_surface card presenter, audit/export hoặc dữ liệu cross-branch.
  - Mọi hành động làm thay đổi số lượng tồn kho (Nhập, Xuất, Điều chuyển, Kiểm kê) bắt buộc phải tạo ra một dòng chứng từ `stock_movements` (chỉ ghi thêm - append-only) để phục vụ việc kiểm toán dữ liệu. Nghiêm cấm việc thay đổi trực tiếp số lượng tồn kho bằng lệnh UPDATE thô trong DB.

---

### 2.6. Kiểm nhận phiếu nhập kho (GRN) — `/inventory/grn` & `/inventory/grn/[id]`

- **Archetype:** danh sách là `LIST` theo composition `AppPage → AppPageHeader → AppPageTabs → AppListFrame → DataTable`; chi tiết là `DOC-WORKFLOW`.
- **Đối tượng sử dụng chính:** Quản lý kho, Nhân viên nhận hàng.
- **Mục tiêu Nghiệp vụ (Why?):** Ghi nhận chính xác số lượng nguyên liệu thực tế nhận từ nhà cung cấp để cập nhật tồn kho tức thời và xác lập cơ sở tính giá vốn hàng bán chính xác.
- **Mục tiêu Người dùng (Goal):** Mở phiếu **Chờ nhập hàng** đã tạo từ PO, ghi nhận đúng hàng thực giao và hoàn thành nhanh để giải phóng xe giao hàng.
- **Luồng thao tác (Workflow):**
  1. **Tạo phiếu:** Từ PO đã gửi hoặc nhận một phần, bấm `Tạo phiếu nhập`; hệ thống giữ tối đa một GRN nháp hoạt động cho PO và suy NCC từ PO.
  2. **Kiểm nhận vật lý:** Nhập số lượng thực nhận và số lượng từ chối. Nếu có
     hàng từ chối, bắt buộc lý do + ảnh; trạng thái được suy ra, không nhập tay.
  3. **Đối chiếu PO:** Hệ thống tính phần áp dụng PO, còn thiếu và dư ngoài đơn; Kho không nhập/xem giá mua.
  4. **Hoàn tất:** Bấm `Xác nhận nhập kho` để ghi tăng tồn, tính WAC cho phần áp dụng PO theo giá PO và ghi phần dư với giá `0`.
- **Thông tin hiển thị:**
  - **Nên hiển thị:** GRN, NCC, PO, YCM, kho nhận, ngày dự kiến, số đã đặt, đã nhận trước, còn phải giao, thực nhận, từ chối, hợp lệ, áp dụng PO, thiếu, dư và đơn vị quy đổi chuẩn. Sau khi chốt, phiếu chỉ đọc.
  - **KHÔNG hiển thị:** Giá mua, price variance, biểu đồ xu hướng giá hoặc thông
    tin quỹ tiền mặt tại bề mặt Kho.
- **Quy chuẩn UX/UI:**
  - control_surface bắt buộc dùng `DocumentFormFrame` (header `AppPageHeader`
    cuộn cùng nội dung + thân danh sách dòng + footer sticky chứa số dòng và CTA
    xác nhận — không sticky header ngoài scrollport). Branch bắt buộc dùng
    `BranchOperatorPage` + `BranchOperatorPanel` + `AppDetailFooter` sticky;
    không render khung control_surface, bảng desktop, hoặc picker đổi chi nhánh.
  - Nút "Xác nhận nhập kho" phải nằm ở vị trí cố định dưới cùng bên phải và yêu cầu xác nhận lại qua Dialog để tránh bấm nhầm khi chưa kiểm đếm xong.

---

### 2.7. Đối soát hóa đơn NCC (Supplier Invoice Match) — `/finance/supplier-invoices`

- **Archetype:** `LIST`.
- **Đối tượng sử dụng chính:** Chủ cửa hàng (`owner`).
- **Mục tiêu Nghiệp vụ (Why?):**
  - Đối soát phiếu thực nhập (GRN) với hóa đơn NCC gửi đến. Đảm bảo doanh nghiệp chỉ thanh toán đúng lượng thực nhận và đơn giá trên chứng từ mua hàng, tránh thất thoát tài chính.
- **Mục tiêu Người dùng (Goal):** Phát hiện nhanh các dòng hóa đơn bị lệch giá hoặc lệch lượng để yêu cầu NCC điều chỉnh trước khi bấm duyệt thanh toán.
- **Luồng thao tác (Workflow):**
  1. **Chọn phiếu nhập:** Chọn một hoặc nhiều GRN đã xác nhận của cùng NCC; hệ
     thống lấy NCC, PO/Yêu cầu mua, dòng hàng và số lượng còn được lập hóa đơn.
     Mỗi HĐ NCC mới trên màn này bắt buộc liên kết GRN.
  2. **Nhập hóa đơn:** Chọn ngày; chọn một mức VAT (0/5/8/10) + tiền trước VAT (tiền VAT tự tính nếu để trống). Thêm mức thuế chỉ khi hóa đơn có nhiều suất. Có thể đính kèm HĐ GTGT ngay khi lưu (tùy chọn).
  3. **Đối soát:** Sau khi lưu, so giá trị trước VAT cộng chiết khấu chứng từ
     với phần GRN áp dụng PO. Dòng PO giá `0` và phần dư giá `0` được phép không
     có trên hóa đơn. VAT không tham gia so giá trị hàng.
  4. **Xử lý chênh lệch:** Kế toán kiểm tra chứng từ khi số lượng hoặc giá trị
     không khớp; dung sai tự động là `±1đ`, không dùng ngưỡng price-QC của GRN.
  5. **Đính kèm HĐ GTGT:** Nếu chưa tải lúc tạo, tải lên ít nhất một file PDF/ảnh vào `vat_invoice_attachment_path` (bucket private) trước khi thanh toán. Owner có `procurement:invoice_create` hoặc `finance:ap_pay` được đính kèm.
  6. **Thanh toán/giảm công nợ:** Một thanh toán hoặc phiếu giảm công nợ có thể
     phân bổ nhiều hóa đơn cùng NCC. Phần thanh toán chưa phân bổ là ứng trước.
     Owner có thể phân bổ ứng trước về sau mà không trừ tiền lần thứ hai. Trả
     hàng không tự giảm công nợ.
- **Thông tin hiển thị:**
  - **Nên hiển thị:** Loại hóa đơn, tổng trước VAT, VAT, tổng phải trả, toàn bộ liên kết GRN/PO, giá trị hóa đơn dùng đối soát, giá trị nhận theo PO, chênh lệch/lý do, trạng thái đối soát và công nợ, trạng thái đính kèm HĐ GTGT, số dư ứng trước theo NCC; khi nhóm có nhiều hóa đơn thì chọn được từng hóa đơn trong nhóm.
  - **KHÔNG hiển thị:** Doanh thu bán cơm tấm, sơ đồ bàn ăn, ca làm việc của nhân viên phục vụ.
- **Quy chuẩn UX/UI:**
  - Bố cục màn hình rộng (width `xwide`); danh sách full-width. Chọn nhóm/hóa đơn mở `Sheet` phải (`sm:max-w-xl`) chứa chi tiết công nợ, HĐ GTGT, thanh toán và đối soát — không chiếm cột cố định cạnh bảng.
  - Popup ghi nhận: dòng đầu là Nhà cung cấp (suy ra từ GRN) và Ngày hóa đơn; sau đó là Phiếu nhập liên kết và Dòng hóa đơn. Chọn một hoặc nhiều GRN đã xác nhận cùng NCC, rồi nhập VAT progressive (một mức mặc định + thêm mức khi cần) và đính kèm tùy chọn. Không có trường Số hóa đơn trên luồng này.
  - Sheet detail: tiêu đề là số HĐ; khối `Item` “còn phải trả” + ứng trước NCC + đính kèm HĐ GTGT; meta ngày/hạn/VAT/tuổi nợ và toàn bộ GRN/PO trong `ItemGroup`; chỉ `Alert` khi thiếu xác minh/đối soát hoặc lệch. Footer chỉ hiện `Tính lại đối soát`/`Chấp nhận chênh lệch`/`Xác minh chứng từ` với `procurement:invoice_match`; `Thanh toán`/`Phân bổ ứng trước` chỉ hiện cho Owner có `finance:ap_pay`.
  - Form thanh toán hiển thị trước tổng trả, tổng phân bổ và phần ứng trước. URL là nguồn trạng thái của thao tác đang mở: `?invoiceId=...&mode=view|pay|credit|advance` và `?mode=create&grnId=...`. Mở hàng dùng history để Back đóng Sheet; chuyển mode dùng replace. Chỉ một overlay nghiệp vụ được mở tại một thời điểm.

---

### 2.8. Hồ sơ nhân sự — `/hr`

- **Archetype:** `LIST` + tab URL (`view=profile|accounts`).
- **Đối tượng sử dụng chính:** Chủ sở hữu (`owner`) — admin HR duy nhất trên control surface.
- **Mục tiêu Nghiệp vụ (Why?):** Quản lý hồ sơ NLĐ, HĐLĐ, chế độ lương (`Theo công` / `Lương tháng`), site/vị trí; cổng vào Thời gian / Lương / Quy tắc; tài khoản đăng nhập & phân quyền là tab phụ trên cùng màn.
- **Mục tiêu Người dùng (Goal):** Thấy việc cần xử lý (duyệt, thiếu HĐ/lương), onboard NV; chuyển tab Tài khoản để cấp quyền theo chức vụ.
- **Luồng thao tác (Workflow):**
  1. Tab **Hồ sơ** (`view=profile`, mặc định): strip **Cần xử lý** → filter → bảng hồ sơ; primary **Thêm nhân viên**.
  2. **Onboard:** Hồ sơ → Vị trí/site → HĐ + chế độ lương → Tài khoản (email/mật khẩu; quyền tinh chỉnh tại tab Tài khoản / `/hr/staff/[id]/permissions`).
  3. Tab **Tài khoản** (`view=accounts`, `staff` ACL): đăng nhập, trạng thái quyền (đã áp mẫu / chưa / ngoại lệ), overflow nhật ký; `/hr/staff` redirect về tab này.
- **Thông tin hiển thị:**
  - **Hồ sơ:** Tên, mã, vị trí, site, lương, loại HĐ, tình trạng làm việc.
  - **Tài khoản:** Tên, chức vụ, site, SĐT, trạng thái đăng nhập, trạng thái quyền.
  - **KHÔNG hiển thị:** KPI doanh thu/kho; bảng công tháng chi tiết (sang `/hr/attendance`); raw `pay_basis`.
- **Quy chuẩn UX/UI:** Deep nav chỉ Người · Thời gian · Lương · Quy tắc. Desktop bảng + dialog; cùng IA trên mobile.

### 2.8a. Thời gian / ngày công — `/hr/attendance`

- **Archetype:** `LIST` + tab URL (`tab`).
- **Đối tượng:** `owner`.
- **Mục tiêu Nghiệp vụ:** Theo dõi vào/ra ca hôm nay, hàng đợi duyệt kết ca & phép, bảng công tháng; phân ca tuần (kể cả Văn phòng).
- **Mục tiêu Người dùng:** Đầu ngày xử lý hàng đợi Duyệt; trong tháng xem Bảng công; gán ca trước khi NV chấm công; không sửa lương tại đây.
- **Luồng thao tác:**
  1. Tab **Hôm nay** — clock hôm nay (ẩn month/view switcher; cột ưu tiên NV · Ca · Vào · Ra · Ghi nhận).
  2. Tab **Duyệt** — queue kết ca nhúng + bảng phép (một bộ cột; filter trạng thái).
  3. Tab **Bảng công** — summary mặc định; toggle lịch / vào-ra trong tháng.
  4. Tab **Phân ca** (`tab=roster`) — lưới tuần theo site (chi nhánh + Văn phòng `branch_id` null); quyền `hr:assign_shift`.
- **Nên hiển thị:** Pending counts trên tab Duyệt; site gồm Văn phòng; cảnh báo khi chưa phân ca.
- **KHÔNG hiển thị:** Phân quyền staff; chỉnh `pay_basis`; KPI bán hàng; fallback chọn ca theo đồng hồ tường.
- **Quy chuẩn:** Filter `date`/`site`/`tab`/`month`/`view`/`week` trên URL. Duyệt tách khỏi cấu hình Setup. BM dùng `/br/{id}/shift/roster`.

### 2.8b. Lương — `/hr/payroll`

- **Archetype:** `LIST` / document kỳ.
- **Đối tượng:** `owner` (`hr_payroll`).
- **Mục tiêu Nghiệp vụ:** Tạm tính → đối soát → chốt kỳ; phân biệt chế độ Theo công vs Lương tháng.
- **Mục tiêu Người dùng:** Preflight thiếu HĐ/`pay_basis`/entitlement → tính → điều chỉnh → chốt.
- **Luồng thao tác:** Chọn tháng/kỳ → xem blocker (chỉ khi có) → mở kỳ → điều chỉnh → chốt (thanh toán thuộc Finance).
- **Nên hiển thị:** Cột chế độ lương tiếng Việt; khấu trừ nghỉ không lương; link hồ sơ thiếu → `/hr?view=profile&salary=missing`; link công → `/hr/attendance?tab=timesheet`.
- **KHÔNG hiển thị:** Chấm công giúp NV; đổi quyền; raw technical keys; section preflight “sẵn sàng” khi không blocker.

### 2.8c. Thiết lập nhân sự — `/hr/setup`

- **Archetype:** `SETTINGS-PANEL` + tab URL (`tab=leave|shifts|tasks`).
- **Đối tượng:** `owner`.
- **Mục tiêu Nghiệp vụ:** Cấu hình quy tắc ít đụng hàng ngày — mỗi tab một chức năng.
- **Mục tiêu Người dùng:** Chọn đúng mục cần chỉnh; không cuộn qua checklist nhiều section.
- **Luồng thao tác:**
  1. Tab **Phép** — ngày công chuẩn & phép tháng.
  2. Tab **Khung ca làm** — tên ca, giờ bắt đầu và giờ kết thúc.
  3. Tab **Việc trong ca** — việc theo chức danh hoặc mẫu riêng nhân viên (`position_shift_tasks`).
- **Nên hiển thị:** Preview việc NV sẽ thấy; cảnh báo tắt ca đang được gán.
- **KHÔNG hiển thị:** Stack nhiều section; phân ca tuần (đã chuyển `/hr/attendance?tab=roster` và `/br/*/shift/roster`); bảng lương.

### 2.8d. Phân quyền chi tiết — `/hr/staff/[id]/permissions` (+ audit)

- **Archetype:** `DETAIL` (list tài khoản nằm ở `/hr?view=accounts`).
- **Đối tượng sử dụng chính:** Chủ cửa hàng (`owner`) (độc quyền phân quyền).
- **Mục tiêu Nghiệp vụ (Why?):** Cấp đúng quyền truy cập hệ thống theo chức vụ; tránh NV xem/sửa vượt cấp.
- **Mục tiêu Người dùng (Goal):** Áp mẫu theo chức vụ trước, xem quyền đang có, thêm ngoại lệ khi cần; lịch sử cá nhân trên tab; nhật ký tenant từ overflow Tài khoản (`/hr/staff/audit`).
- **Luồng thao tác (Workflow):**
  1. Mở từ tab Tài khoản trên `/hr`.
  2. **Áp quyền theo chức vụ** (CTA chính) → xem quyền đang có → ngoại lệ qua dialog.
  3. Tab **Lịch sử** trên DETAIL; audit tenant secondary.
- **Thông tin hiển thị:**
  - Nhãn quyền / nhóm việc tiếng Việt (`getStaffPermissionLabelVi`); audit hiện nhóm việc + chức vụ mẫu khi `apply_template`.
  - **KHÔNG hiển thị:** Doanh thu, tồn kho, công nợ NCC, bảng công, chỉnh `pay_basis`; không dùng key/mô tả tiếng Anh làm nhãn chính.
- **Quy chuẩn UX/UI:**
  - Mọi thay đổi phân quyền ghi `permission_audit_log`.
  - `/br/[branchId]/shift/leave-approvals` giữ `LIST` touch-native Branch; control_surface dùng bảng HR desktop.

---

### 2.9. Báo cáo Doanh thu & Chi phí — `/finance`

- **Archetype:** `DASHBOARD`.
- **Đối tượng sử dụng chính:** Chủ cửa hàng (`owner`).
- **Mục tiêu Nghiệp vụ (Why?):**
  - Cung cấp công thức kết quả kinh doanh rõ ràng theo kỳ (hai dòng), đồng thời tách số dư hiện có và giá trị tồn kho.
- **Mục tiêu Người dùng (Goal):** Nhìn một màn để biết doanh thu thuần còn lại bao nhiêu sau giá vốn món, chi phí vận hành và biến động tồn kho; mở báo cáo chuyên biệt khi cần đối chiếu.
- **Luồng thao tác (Workflow):**
  1. **Chọn kỳ báo cáo:** Chọn `Nay`, `Hôm qua`, `Tuần`, `Tháng`, `Quý` hoặc `Năm`. Khi chọn kỳ lịch, chọn tiếp đúng tuần/tháng/quý/năm cần xem; kỳ hiện tại tính đến hôm nay, kỳ quá khứ lấy trọn kỳ.
  2. **Chọn phạm vi:** Chọn `Tất cả`, `Công ty`, `Toàn bộ Chi nhánh` hoặc `Chi nhánh`; khi chọn `Chi nhánh`, chọn tiếp một chi nhánh cụ thể. `Công ty` lấy bản ghi không gắn chi nhánh; `Toàn bộ Chi nhánh` loại các bản ghi cấp công ty; `Tất cả` cộng cả hai phạm vi.
  3. **Xem kết quả:** Đọc hai dòng công thức `Doanh thu thuần − Giá vốn món = Lợi nhuận gộp` rồi `Lợi nhuận gộp − Chi phí vận hành + Biến động tồn kho (Tồn cuối kỳ − Tồn đầu kỳ) = Kết quả kinh doanh`.
  4. **Xem số dư:** Đọc `Tiền mặt + Tiền tài khoản = Tổng tiền` trong section Tiền mặt hiện có; các số này không đổi theo bộ lọc.
  5. **Xem tồn kho:** Đọc giá trị tồn kho cuối kỳ theo bộ lọc (số tuyệt đối; biến động đã nằm trong công thức kết quả).
  6. **Xử lý ngoại lệ:** Mở đúng route cho ca lệch, đối soát ngân hàng, thiếu giá vốn, chi phí chưa ghi nhận hoặc chứng từ cần xử lý.
- **Thông tin hiển thị:**
  - **Nên hiển thị:** Hai dòng KPI kết quả theo kỳ, tiền mặt hiện có (ba card công thức), giá trị tồn kho cuối kỳ và danh sách cần xử lý ở cuối trang. Khi kỳ là tháng/`mtd` và đã có chỉ tiêu, KPI Doanh thu thuần được kèm tín hiệu tiến độ chỉ tiêu (Progress/%); đua chi nhánh, pace chart và editor chỉ tiêu thuộc `/finance/revenue` và `/finance/targets`. Biểu đồ, CSV, bảng doanh thu, giá vốn món, sổ chi phí và đối soát ngân hàng dùng cùng thuật ngữ tại các route chuyên biệt.
  - **Không lặp:** Finance chỉ hiển thị card Giá trị tồn kho cuối kỳ; bảng chi tiết tồn kho thuộc Inventory.
  - **Trạng thái thiếu dữ liệu:** Thiếu coverage giá vốn thì không tính Lợi nhuận gộp và Kết quả kinh doanh; chưa ghi nhận chi phí thì không tính Kết quả kinh doanh.
  - **KHÔNG hiển thị:** `Lợi nhuận sau thuế TNDN` khi chưa đủ sổ kế toán và khóa sổ, nút tạo order, hoặc các bước chế biến món ăn.
- **Quy chuẩn UX/UI:**
  - Mọi số liệu tiền tệ phải được định dạng chuẩn VND bằng hàm `formatVND` (ví dụ: `150.000đ`, không viết `150k` hay `150000`).
  - Desktop: dòng kết quả 1 ba card, dòng 2 bốn card (khi có quyền giá trị tồn); section tiền mặt hiện có ba card `Tiền mặt + Tiền tài khoản = Tổng tiền`; tablet hai cột; mobile một cột. Dùng lại `KpiCard`, `KpiRow` và `AppSection`.
  - Tất cả các biểu đồ tài chính chỉ được phép sử dụng bảng màu quy chuẩn từ `chart-1` đến `chart-5` trong token của hệ thống để đảm bảo tính đồng bộ thị giác.

---

### 2.10. Bổ sung thông tin nhận HĐĐT — `/q/invoice/[token]`

- **Archetype:** `PUBLIC-WORKFLOW`.
- **Đối tượng sử dụng chính:** Khách hàng đã thanh toán.
- **Mục tiêu Nghiệp vụ (Why?):** Cho khách bổ sung thông tin doanh nghiệp và email nhận HĐĐT trong thời hạn tối đa hai giờ mà không yêu cầu thu ngân nhập dữ liệu.
- **Mục tiêu Người dùng (Goal):** Quét QR trên hoá đơn thanh toán, tra cứu MST, kiểm tra tên đơn vị và địa chỉ, nhập email rồi xác nhận xuất HĐĐT.
- **Luồng thao tác (Workflow):**
  1. Quét QR trên hoá đơn thanh toán.
  2. Nhập MST và tra cứu thông tin doanh nghiệp.
  3. Kiểm tra tên đơn vị, địa chỉ; nhập email bắt buộc.
  4. Xác nhận một lần; màn hình chuyển sang trạng thái hoàn tất và không cho sửa tiếp.
  5. Nếu quá hạn, đã xác nhận hoặc HĐĐT đã đóng, chỉ hiển thị trạng thái tương ứng.
- **Thông tin hiển thị:**
  - **Nên hiển thị:** Chi nhánh, mã đơn, thời hạn, MST, tên đơn vị và địa chỉ do API trả về, email nhận HĐĐT, trạng thái tra cứu và kết quả xác nhận.
  - **KHÔNG hiển thị:** Thao tác thanh toán, dữ liệu POS/Self-Order, mã nội bộ, dữ liệu nhà cung cấp HĐĐT hoặc khả năng sửa sau khi yêu cầu đã đóng.
- **Quy chuẩn UX/UI:** Mobile-first, một hành động chính, control kích thước chạm, hỗ trợ bàn phím và thông báo lỗi/tra cứu bằng ngữ nghĩa truy cập được.
