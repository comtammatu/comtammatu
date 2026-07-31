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

### 2.4A. Trung tâm vận hành Chi nhánh / Kho Tổng / Bếp TT — `/br/[branchId]`

- **Archetype:** `/br/[branchId]` dùng `LANDING`; `/shift` là màn ngày làm việc cá nhân; `/team` là `LIST` workspace **hai tab** (`Theo dõi ca`, `Nhân sự`). Phân công đếm nằm dưới Kho (`/stock/count-assignments`), không phải tab Team.
- **Đối tượng sử dụng chính:** Nhân viên trong ca, Quản lý chi nhánh (`branch_manager`), Quản lý kho Tổng (`central_supply_ops`), Bếp trưởng Bếp TT (`central_kitchen_lead`), Chủ cửa hàng (`owner`) theo đúng phạm vi từng tab/kind.
- **Mục tiêu Nghiệp vụ (Why?):** Cho người vận hành đi từ việc cần xử lý đến đúng trạm hoặc đúng workspace trong một viewport ngắn.
- **Quy chuẩn UX/UI:**
  - Bottom nav **chi nhánh** (`branch_kind=branch`): `Hôm nay` · `Ca` · `Đội` · `Kho` · `Phản hồi`. `Điều hành` và `Thiết lập` nằm trong overflow header.
  - Bottom nav **Kho Tổng**: `Hôm nay` · `Nhập` · `Tồn` · `Giao nhận` · `Thêm` (stock hub).
  - Bottom nav **Bếp TT**: `Bếp` · `Nhập` · `Sản xuất` · `Giao nhận` · `Thêm`.
  - Hub CN: hàng chờ > 0 rồi điểm vào bán hàng/bếp; queue **không** GRN/SX (D093).
  - Hub trung tâm: CTA chính (Nhận hàng / Tạo lệnh SX) + job tiles theo kind; không POS/KDS/Runner.
  - **Exception hẹp (manager-like CN):** trên `/br/[branchId]` (không phải Dashboard), `owner` và `branch_manager` được một strip hai tín hiệu `Doanh thu` (thuần MTD) + `Chỉ tiêu` … Cashier/chef/staff không thấy strip. Hub trung tâm không hiện strip doanh thu.
  - `Ca` sở hữu ngày làm việc cá nhân (CN). Owner không thấy tab này; truy cập trực tiếp route gốc chuyển về `Đội`.
  - `Đội` mở hai tab `Theo dõi ca` và `Nhân sự` (CN).

---

### 2.5. Phân hệ Kho hàng (Inventory Workspace) — `/inventory` & `/br/[branchId]/stock`

- **Planes (ADR 0012 / 0018):** Owner/Accountant `/inventory/*` (control_surface)
  và operator stock `/br/[branchId]/stock/*` (CN + Kho Tổng + Bếp TT) là hai
  plane tách chrome/IA. Owner filter site mọi `branch_kind` trên L0; operator
  hub pin theo kind/role.
- **Archetype:** `/inventory` dùng `DASHBOARD`; `/br/[branchId]/stock` dùng `LANDING`; `/inventory/stock`, `/inventory/purchase-requests`, `/inventory/purchase-orders`, `/inventory/grn`, `/inventory/consumption`, `/inventory/transfers`, `/br/[branchId]/stock/on-hand`, `/br/[branchId]/stock/issues`, `/br/[branchId]/stock/consumption`, `/br/[branchId]/stock/count-assignments`, `/br/[branchId]/stock/count-slips`, và `/br/[branchId]/stock/waste-approvals` là `LIST` nhưng khác presentation plane. `/inventory/transfers/new` và `/inventory/stock-requests/new` là `DOC-WORKFLOW`; `/inventory/issues`, `/inventory/issues/[id]`, và `/inventory/supplier-invoices` là `REDIRECT-SHIM` (invoices → `/finance/supplier-invoices`, ADR 0018). `/inventory/operations` đã rút. Detail GRN, consumption và issue Branch thuộc `DETAIL`; form phiếu hao hụt Branch thuộc `DOC-WORKFLOW`; `/br/[branchId]/stock/reports` là Branch touch `REPORT` theo tín hiệu từng nguyên liệu.
- **Đối tượng sử dụng chính:** `/inventory` dành cho Chủ cửa hàng (`owner`) và
  Kế toán; `/br/[branchId]/stock` dành cho `branch_manager`, `central_supply_ops`,
  `central_kitchen_lead` — plane touch, action bị permission + site kind giới hạn.
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
  - **Sản xuất:** Chọn thành phẩm và sản lượng -> Kiểm tra định mức/nguyên liệu khả dụng -> Tạo lệnh -> Bắt đầu -> Nhập thực dùng và sản lượng thực tế -> Hoàn thành lệnh.
  - **Kiểm kê (Stocktake):** Tạo đợt kiểm kê -> Nhân viên đi đếm thực tế (kiểm kê mù - blind stocktake) -> Quản lý đối chiếu chênh lệch -> Xác nhận cân đối kho.
  - **Điều chuyển (Transfer):** Chỉ chọn warehouse của site nguồn và đích;
    không có same-branch Kho↔Bếp. Quyền tạo/giao/nhận tiếp tục theo role matrix.
    Hub Giao nhận hiển thị một YCH thành một dòng với lane Kho Tổng/Bếp TT;
    DC liên kết không thành dòng độc lập. Bếp TT có CTA `Yêu cầu Kho Tổng` khi
    đúng site và chỉ chọn nguyên liệu nguồn Kho Tổng.
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
  - Branch `/br/[branchId]/stock/on-hand` là danh sách quyết định touch-first ở mọi viewport điện thoại/tablet, kể cả `1024px` landscape: nếu có hàng chạm ngưỡng, một khối `Cần bổ sung` đứng trước danh sách với đúng một CTA yêu cầu hàng; các hàng rủi ro luôn xếp đầu và nêu rõ `Hết hàng`/`Thấp`/`Chạm reorder`. Mỗi hàng chỉ giữ tên/SKU, loại hàng, tồn + đơn vị và chạm để xem chi tiết; tìm kiếm và bộ lọc cùng một trạng thái thu gọn trên phone/tablet. One-warehouse topology không hiển thị bộ lọc vị trí. Không đưa WAC, giá trị tồn hoặc KPI control_surface vào màn tra cứu trong ca.
  - Branch `/br/[branchId]/stock/on-hand/[ingredientId]` là `DETAIL` touch-native: ưu tiên trạng thái/tồn hiện tại, vị trí tồn, chuyển động gần đây, sau đó là ngưỡng và action được cấp quyền. Nhận từ NCC mở GRN, còn `/stock/receive` chỉ dành cho phiếu chuyển nội bộ; route không tải hoặc hiển thị WAC, giá trị tồn, audit/correction, hoặc control_surface detail chrome.
  - Branch `/br/[branchId]/stock/grn` ưu tiên nháp của người đang nhận hàng, sau đó là hàng đợi GRN có tìm kiếm/lọc trạng thái. Mỗi row chỉ hiển thị mã, NCC, ngày và trạng thái; chạm để tiếp tục/xem phiếu, bỏ nháp là action riêng có xác nhận. Không đưa tổng tiền, tên chi nhánh, `DataTable` hay long-press từ control_surface sang route này.
  - Branch `/br/[branchId]/stock/grn/new` dùng source list touch-native supplier-first: chọn NCC, giữ context chi nhánh từ route, và chuyển sang URL supplier Branch canonical. Không lặp branch picker, PO hoặc khung form control_surface tại bước chọn nguồn.
  - Branch `/br/[branchId]/stock/grn/new/[supplierId]` dùng form dòng touch-native: context NCC/kho nhận, các dòng đã thêm, tìm nguyên liệu và action sticky theo đúng thứ tự thao tác. Chỉ đổi nơi nhận trong chi nhánh đã khóa bởi URL; phone sửa dòng bằng bottom sheet, tablet landscape chỉ mở hai panel thay vì bảng hoặc side editor control_surface.
  - Branch `/br/[branchId]/stock/grn/[id]` giữ review/receipt native: nháp cho phép kiểm nhận, thêm/sửa dòng trong bottom sheet rồi lưu/chốt; phiếu đã chốt chỉ hiển thị biên nhận và các dòng thực nhận. Không đưa audit, sửa sau chốt, stock correction, hóa đơn NCC, hoặc `GRNDetailClient` control_surface vào Branch.
  - Branch `/br/[branchId]/stock/stocktake` là `LIST` touch-native cho phiên kiểm kê của quản lý chi nhánh: ưu tiên phiên đang thực hiện, sau đó là lịch sử theo trạng thái. Không dùng `DataTable`, long-press drawer, branch picker, audit, hay action control_surface; `/stock/count` vẫn là phiếu đếm được giao riêng cho nhân viên.
  - Branch `/br/[branchId]/stock/stocktake/new` là `DOC-WORKFLOW` touch-native: URL khóa chi nhánh, người quản lý chỉ chọn mode và vị trí, rồi action sticky mở phiên và chuyển thẳng sang count. Không lặp selector đổi chi nhánh hoặc `DocumentFormFrame` control_surface.
  - Branch `/br/[branchId]/stock/stocktake/[id]/count` là `DOC-WORKFLOW` số đếm mù: first viewport là nguyên liệu đang đếm, đơn vị ghi nhận, number pad và lưu/đi tiếp; draft, zone lock và submit round giữ authority Server Action/RPC hiện có. Không tải hay hiển thị số tồn hệ thống trước khi phiên hoàn tất, và không đổi tablet thành bảng control_surface.
  - Branch `/br/[branchId]/stock/stocktake/[id]` là `DETAIL` touch-native: phiên đang thực hiện chỉ review số đếm mù/đếm lại và action tiếp tục/chốt theo quyền; khi hoàn tất mới hiển thị hệ thống, thực đếm và chênh lệch theo từng nguyên liệu. Không đưa audit history, report CTA, WAC, giá trị tồn hoặc control_surface detail chrome vào Branch.
  - Branch `/br/[branchId]/stock/issues` là `LIST` touch-native cho hủy hỏng/xuất khác: scope chi nhánh chỉ lấy từ URL, hàng phiếu hiển thị mã, loại, ngày và trạng thái; tạo nháp là bottom sheet ngắn, không lặp branch picker, tổng giá trị, export, `DataTable` hoặc audit control_surface.
  - Branch `/br/[branchId]/stock/issues/[id]` là `DETAIL` touch-native: nháp cho thêm/sửa/xóa một dòng nguyên liệu bằng bottom sheet, bắt buộc lý do và kiểm tra số lượng theo đơn vị nhập trước khi gọi Server Action; chốt/hủy là action sticky có xác nhận. Phiếu cuối chỉ đọc; WAC, giá trị, audit và correction thuộc control_surface.
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
  2. **Nhập hóa đơn:** Ghi số hóa đơn và ngày; chọn một mức VAT (0/5/8/10) + tiền trước VAT (tiền VAT tự tính nếu để trống). Thêm mức thuế chỉ khi hóa đơn có nhiều suất. Có thể đính kèm HĐ GTGT ngay khi lưu (tùy chọn).
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
  - Popup ghi nhận: dòng đầu là Nhà cung cấp (suy ra từ GRN), Số hóa đơn, Ngày hóa đơn; sau đó là Phiếu nhập liên kết và Dòng hóa đơn. Chọn một hoặc nhiều GRN đã xác nhận cùng NCC, rồi nhập VAT progressive (một mức mặc định + thêm mức khi cần) và đính kèm tùy chọn.
  - Sheet detail: tiêu đề là số HĐ; khối `Item` “còn phải trả” + ứng trước NCC + đính kèm HĐ GTGT; meta ngày/hạn/VAT/tuổi nợ và toàn bộ GRN/PO trong `ItemGroup`; chỉ `Alert` khi thiếu xác minh/đối soát hoặc lệch. Footer chỉ hiện `Tính lại đối soát`/`Chấp nhận chênh lệch`/`Xác minh chứng từ` với `procurement:invoice_match`; `Thanh toán`/`Phân bổ ứng trước` chỉ hiện cho Owner có `finance:ap_pay`.
  - Form thanh toán hiển thị trước tổng trả, tổng phân bổ và phần ứng trước. URL là nguồn trạng thái của thao tác đang mở: `?invoiceId=...&mode=view|pay|credit|advance` và `?mode=create&grnId=...`. Mở hàng dùng history để Back đóng Sheet; chuyển mode dùng replace. Chỉ một overlay nghiệp vụ được mở tại một thời điểm.

---

### 2.8. Quản lý Nhân sự & Phân quyền — `/hr/staff`

- **Archetype:** `LIST`.
- **Đối tượng sử dụng chính:** Chủ cửa hàng (`owner`) (độc quyền phân quyền), Quản lý chi nhánh (chỉ xem hồ sơ nhân viên thuộc quyền).
- **Mục tiêu Nghiệp vụ (Why?):**
  - Quản lý thông tin NLĐ, gán đúng chức danh, chi nhánh làm việc và cấp đúng quyền truy cập hệ thống để bảo mật dữ liệu, tránh nhân viên xem hoặc sửa dữ liệu vượt cấp (ví dụ: Thu ngân sửa giá món, Bếp xem báo cáo doanh thu chuỗi).
- **Mục tiêu Người dùng (Goal):** Thêm nhân viên mới, gán chi nhánh và cấp quyền cho họ chỉ trong 3 bước.
- **Luồng thao tác (Workflow):**
  1. **Tạo hồ sơ:** Nhập thông tin cá nhân (Họ tên, SĐT, Số CCCD, Ngày sinh).
  2. **Gán vị trí:** Chọn chức danh (ví dụ: Thu ngân, Đầu bếp) -> Chọn chi nhánh hoạt động chính.
  3. **Cấp tài khoản:** Nhập email -> Hệ thống tạo tài khoản auth và chuyển thẳng đến bước xác nhận quyền.
  4. **Xác nhận quyền (Chỉ Owner):** Hệ thống đề xuất bộ quyền theo chức vụ và chi nhánh đã chọn; Owner xác nhận trước khi cấp, sau đó chỉ thêm quyền riêng khi công việc thực tế cần ngoại lệ.
- **Thông tin hiển thị:**
  - **Nên hiển thị:** Danh sách tài khoản nhân sự kèm chức danh và chi nhánh; bộ quyền theo chức vụ được chia theo nhóm công việc bằng tiếng Việt; quyền đang có, nguồn cấp, phạm vi và thời hạn.
  - **KHÔNG hiển thị:** Doanh thu, số lượng tồn kho nguyên liệu, chi tiết công nợ NCC.
- **Quy chuẩn UX/UI:**
  - Toàn bộ thao tác thay đổi phân quyền phải ghi nhận vào nhật ký phân quyền (`hr/staff/audit`) để phục vụ việc hậu kiểm an ninh hệ thống.
  - Không dùng `position_code`, `role_templates.name`, `permission_keys.module`, permission key hoặc mô tả kỹ thuật tiếng Anh làm nhãn chính trên UI. Mã kỹ thuật chỉ là dữ liệu nội bộ; quyền cấp riêng vẫn phải hiển thị bằng ngôn ngữ công việc.
  - `/br/[branchId]/shift/leave-approvals` là `LIST` touch-native cố định theo chi nhánh URL: tab trạng thái và full-row item phục vụ quét nhanh; chạm một yêu cầu mở bottom sheet có chi tiết ngày nghỉ, lý do và action duyệt/từ chối sticky. control_surface tiếp tục dùng bảng HR desktop; hai plane chỉ chia sẻ loader/model/action, không chia sẻ presenter.

---

### 2.9. Báo cáo Doanh thu & Chi phí — `/finance`

- **Archetype:** `DASHBOARD`.
- **Đối tượng sử dụng chính:** Chủ cửa hàng (`owner`).
- **Mục tiêu Nghiệp vụ (Why?):**
  - Cung cấp công thức kết quả vận hành rõ ràng theo kỳ, đồng thời tách số dư hiện có và giá trị tồn kho.
- **Mục tiêu Người dùng (Goal):** Nhìn một màn để biết doanh thu thuần còn lại bao nhiêu sau giá vốn món và chi phí vận hành; mở báo cáo chuyên biệt khi cần đối chiếu.
- **Luồng thao tác (Workflow):**
  1. **Chọn kỳ báo cáo:** Lọc theo ngày hôm nay / Tuần này / Tháng này / Chọn khoảng ngày.
  2. **Chọn phạm vi:** Lọc theo toàn chuỗi hoặc một chi nhánh cụ thể.
  3. **Xem kết quả:** Đọc năm card `Doanh thu thuần − Giá vốn món = Lợi nhuận gộp − Chi phí vận hành = Kết quả vận hành`.
  4. **Xem số dư:** Đọc tiền mặt theo sổ và tiền trong ngân hàng; hai số này không đổi theo bộ lọc.
  5. **Xem tồn kho:** Đọc giá trị tồn kho cuối kỳ theo bộ lọc.
  6. **Xử lý ngoại lệ:** Mở đúng route cho ca lệch, đối soát ngân hàng, thiếu giá vốn, chi phí chưa ghi nhận hoặc chứng từ cần xử lý.
- **Thông tin hiển thị:**
  - **Nên hiển thị:** Năm KPI kết quả theo kỳ, số dư hiện có, giá trị tồn kho cuối kỳ và danh sách cần xử lý ở cuối trang. Khi kỳ là tháng/`mtd` và đã có chỉ tiêu, KPI Doanh thu thuần được kèm tín hiệu tiến độ chỉ tiêu (Progress/%); đua chi nhánh, pace chart và editor chỉ tiêu thuộc `/finance/revenue` và `/finance/targets`. Biểu đồ, CSV, bảng doanh thu, giá vốn món, sổ chi phí và đối soát ngân hàng dùng cùng thuật ngữ tại các route chuyên biệt.
  - **Không lặp:** Finance chỉ hiển thị card Giá trị tồn kho cuối kỳ; bảng chi tiết tồn kho thuộc Inventory.
  - **Trạng thái thiếu dữ liệu:** Thiếu coverage giá vốn thì không tính Lợi nhuận gộp và Kết quả vận hành; chưa ghi nhận chi phí thì không tính Kết quả vận hành.
  - **KHÔNG hiển thị:** `Lợi nhuận sau thuế TNDN` khi chưa đủ sổ kế toán và khóa sổ, nút tạo order, hoặc các bước chế biến món ăn.
- **Quy chuẩn UX/UI:**
  - Mọi số liệu tiền tệ phải được định dạng chuẩn VND bằng hàm `formatVND` (ví dụ: `150.000đ`, không viết `150k` hay `150000`).
  - Desktop hiển thị năm card kết quả trên một hàng, có dấu `−` và `=` nối công thức; tablet hai cột; mobile một cột. Dùng lại `KpiCard`, `KpiRow` và `AppSection`.
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
