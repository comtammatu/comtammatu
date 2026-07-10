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
  4. **Thanh toán:** Chọn phương thức thanh toán (Tiền mặt / VietQR / Momo) -> Áp dụng mã giảm giá (nếu có quyền) -> Xác nhận đã thu tiền -> Hệ thống tự động in hóa đơn giấy ra máy in quầy bar.
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
  - Cung cấp cái nhìn toàn diện về tình trạng vận hành thực tế của một chi nhánh trong ngày hôm nay: doanh thu tức thời, công suất bếp, trạng thái két tiền và nhân sự làm việc.
- **Mục tiêu Người dùng (Goal):** Biết ngay chi nhánh có đang vận hành ổn định không, có sự cố nào cần xử lý khẩn cấp không (lệch tiền két, thiếu nguyên liệu, chưa mở ca POS).
- **Luồng thao tác (Workflow):**
  1. **Đọc chỉ số nhanh:** Xem doanh thu, số đơn hàng, số lượng bàn đang hoạt động hôm nay.
  2. **Giám sát thiết bị/vận hành:** Kiểm tra trạng thái máy in hóa đơn (online/offline), phiên POS hiện tại có bị mở trễ không.
  3. **Xử lý công việc:** Nhìn danh sách "Việc cần xử lý hôm nay" (ví dụ: Có 2 yêu cầu duyệt nghỉ phép, 1 phiếu nhập kho GRN đang chờ xác nhận). Bấm vào để xử lý trực tiếp.
- **Thông tin hiển thị:**
  - **Nên hiển thị:** Hàng chỉ số KPI chính (`KpiRow` của `KpiCard`) gồm Doanh thu tạm tính, Số đơn, Số bàn trống. Hộp cảnh báo thiết bị; Lối tắt đến các tác vụ vận hành (menu limits, team, stocktake).
  - **KHÔNG hiển thị:** Báo cáo tài chính chi tiết của cả chuỗi (L0), công nợ nhà cung cấp tổng, hoặc cấu hình phân quyền hệ thống.
- **Quy chuẩn UX/UI:**
  - Ưu tiên hiển thị danh sách công việc cần làm (`task queue first`) lên đầu để định hướng hành động cho Quản lý chi nhánh ngay khi mở trang.

---

### 2.5. Phân hệ Kho hàng (Inventory Workspace) — `/inventory` & `/br/[branchId]/stock`

- **Archetype:** `/inventory` dùng `DASHBOARD`; `/br/[branchId]/stock` dùng `HUB`; `/inventory/stock`, `/br/[branchId]/stock/on-hand`, `/inventory/operations?tab=grn`, `/br/[branchId]/stock/grn`, bước chọn nguồn `/br/[branchId]/stock/grn/new`, `/br/[branchId]/stock/issues`, `/br/[branchId]/stock/supplier-returns`, và `/br/[branchId]/stock/waste-approvals` là `LIST` nhưng khác presentation plane. Form dòng GRN, phiếu hao hụt Branch và tạo supplier return Branch thuộc `DOC-WORKFLOW`; detail issue và supplier return Branch thuộc `DETAIL`; `/br/[branchId]/stock/reports` là Branch touch `REPORT` theo tín hiệu từng nguyên liệu.
- **Đối tượng sử dụng chính:** Quản lý kho (`warehouse_manager`), Quản lý bếp (`production_manager`), Quản lý chi nhánh (`branch_manager`), Chủ cửa hàng (`owner`).
- **Mục tiêu Nghiệp vụ (Why?):**
  - Kiểm soát chính xác số lượng nguyên liệu tồn kho thực tế, tính toán giá vốn hàng bán (WAC), giảm thiểu hao hụt/thất thoát nguyên liệu và tối ưu hóa chi phí mua hàng.
- **Mục tiêu Người dùng (Goal):** Nhập kho nhanh, kiểm kho không sai lệch, điều chuyển hàng giữa các chi nhánh mượt mà.
- **Luồng thao tác (Workflow):**
  - **Nhập kho (GRN):** Tạo phiếu nhập kho từ nhà cung cấp -> Kiểm đếm thực tế -> Xác nhận nhập kho (cập nhật tồn kho và tính lại giá vốn).
  - **Kiểm kê (Stocktake):** Tạo đợt kiểm kê -> Nhân viên đi đếm thực tế (kiểm kê mù - blind stocktake) -> Quản lý đối chiếu chênh lệch -> Xác nhận cân đối kho.
  - **Điều chuyển (Transfer):** Chọn đúng nơi đi/nơi đến còn giữ tồn: trung tâm cấp chi nhánh, Kho CN <-> Bếp CN, hoặc Bếp CN trả về Bếp Trung Tâm -> Vận chuyển khi khác site -> Bên nhận xác nhận thực nhận và ghi nhận hao hụt đường đi.
  - **Xuất nội bộ (Issue):** Mở phiếu hủy hỏng hoặc xuất khác tại chi nhánh -> thêm từng nguyên liệu với đơn vị, số lượng và lý do -> rà soát phiếu nháp -> xác nhận để ghi giảm tồn hoặc hủy trước khi chốt.
  - **Hao hụt thủ công (Waste):** Chọn đúng vị trí kho của chi nhánh -> thêm từng nguyên liệu trong một dòng chạm riêng -> nhập số lượng không vượt tồn, lý do và ảnh khi được yêu cầu -> xem cảnh báo cap theo ca/ngày -> tạo phiếu để ghi giảm hoặc chờ quản lý duyệt theo tier. WAC, đơn vị và bằng chứng được server kiểm tra lại khi submit.
  - **Trả NCC (Supplier Return):** Chọn GRN có hàng bị từ chối của đúng chi nhánh -> chọn cách xử lý/lý do -> tạo phiếu trả với các dòng bị từ chối -> gửi NCC -> ghi có, hoàn tiền hoặc hủy theo state machine hiện có.
  - **Báo cáo kho (Branch Report):** Xem chênh lệch tiêu hao warning/critical và biến động tháng hiện tại theo từng nguyên liệu -> chạm để mở tồn thực của nguyên liệu cần xử lý. Không tổng hợp số lượng giữa các đơn vị.
- **Thông tin hiển thị:**
  - **Nên hiển thị:** Danh sách nguyên liệu kèm tồn khả dụng, đơn vị tính; Trạng thái các phiếu kho (Nháp / Đang giao / Hoàn thành); Cảnh báo tồn dưới mức an toàn.
  - **KHÔNG hiển thị:** Doanh thu bán hàng chi tiết, thông tin thẻ tín dụng của khách, bảng lương nhân sự.
- **Quy chuẩn UX/UI:**
  - Bếp Trung Tâm tại `/br/[branchId]` với `branch_kind=central_kitchen` dùng cùng Branch Operator shell, không mở Office. Home ưu tiên theo thứ tự: tạo lệnh sản xuất -> hàng đợi nghiệp vụ Bếp -> bốn việc `Nhập kho`, `Sản xuất`, `Công thức`, `Xuất thành phẩm`. `Chấm công` và các luồng duyệt ca/nghỉ nằm trong tab `Nhân sự` riêng tại `/br/[branchId]/shift`; không xuất hiện trong hàng đợi hoặc action của home Bếp.
  - Bếp Trung Tâm dùng layout `Kitchen Workbench` với một IA cảm ứng xuyên suốt: điện thoại là một cột tập trung vào tác vụ; tablet dọc giữ cùng thứ tự và chỉ mở rộng metadata; tablet ngang được chia hai panel cho form phức tạp nhưng không đổi thành bảng hoặc form Office. Mọi viewport `390x844`, `768x1024` và `1024x768` giữ touch target tối thiểu `44px`, không cuộn ngang, và có action sticky riêng cho chứng từ đang thao tác.
  - `/br/[branchId]/stock/production` là HUB/LIST Branch-native: ưu tiên lệnh đang sản xuất, sau đó lệnh nháp, CTA tạo lệnh, lối vào Công thức và lịch sử hoàn tất. Không dùng `AppLinkCard` mosaic, `DataTable`, query-view trung gian hoặc presenter Office.
  - `/br/[branchId]/stock/production/new` là `DOC-WORKFLOW` Branch-native: URL khóa Bếp sản xuất; người dùng chọn thành phẩm/sản lượng, nơi xuất nguyên liệu, nơi nhận thành phẩm trong chính Bếp Trung Tâm, kiểm tra định mức và tạo lệnh. Sản xuất không nhập thẳng vào Bếp Chi nhánh; `/stock/transfer/new` là bước duy nhất xuất thành phẩm đi. Điện thoại giữ một cột; tablet ngang có panel thông tin và panel nguyên liệu. Không import `ProductionNewClient`, `DocumentFormFrame` hoặc `DataTable` Office.
  - `/br/[branchId]/stock/production/[id]` là `DETAIL` Branch-native: ưu tiên trạng thái, sản lượng dự kiến/thực tế, nguyên liệu thực dùng, thiếu hụt và đúng một hành động tiếp theo theo state machine. Lệnh nháp bắt đầu sản xuất; lệnh đang làm mới hoàn thành; hủy luôn xác nhận. Không import `ProductionDetailClient` hoặc presenter Office.
  - `/br/[branchId]/stock/production/recipes` là LIST Branch-native theo thành phẩm; `/recipes/new` và `/recipes/[finishedGoodId]` là editor route riêng. Điện thoại chỉnh từng nguyên liệu trong bottom sheet; từ tablet sheet trở thành panel bên phải; selection nằm trong URL và thay đổi chưa lưu có cảnh báo. Không dùng `ProductionRecipePanel`, `FormDialog` rộng hoặc `DataTable` Office.
  - `/br/[branchId]/stock/transfer/new` đổi nghĩa thành `Xuất thành phẩm` khi route thuộc Bếp Trung Tâm: nguồn ưu tiên `production_storage` và dùng `warehouse` hiện hữu khi site chưa tách kho thành phẩm vật lý; danh sách luôn chỉ có `finished_good`, và đích chỉ là Bếp của Chi nhánh đang hoạt động. Form vẫn dùng cùng một IA cảm ứng một cột/hai panel và action sticky; không dùng presenter hoặc bảng Office.
  - Office `/inventory/stock` dùng management list responsive: compact card khi hẹp và `DataTable` khi desktop cần đối chiếu WAC/giá trị tồn.
  - Branch `/br/[branchId]/stock/on-hand` dùng full-row touch list ở mọi viewport điện thoại/tablet, kể cả `1024px` landscape; chỉ hiển thị tên/SKU, tồn + đơn vị, vị trí và cảnh báo thiếu hàng. Không đưa WAC, giá trị tồn hoặc KPI Office vào màn tra cứu trong ca.
  - Branch `/br/[branchId]/stock/on-hand/[ingredientId]` là `DETAIL` touch-native: ưu tiên trạng thái/tồn hiện tại, vị trí tồn, chuyển động gần đây, sau đó là ngưỡng và action được cấp quyền. Nhận từ NCC mở GRN, còn `/stock/receive` chỉ dành cho phiếu chuyển nội bộ; route không tải hoặc hiển thị WAC, giá trị tồn, audit/correction, hoặc Office detail chrome.
  - Branch `/br/[branchId]/stock/grn` ưu tiên nháp của người đang nhận hàng, sau đó là hàng đợi GRN có tìm kiếm/lọc trạng thái. Mỗi row chỉ hiển thị mã, NCC, ngày, trạng thái và PO liên kết; chạm để tiếp tục/xem phiếu, bỏ nháp là action riêng có xác nhận. Không đưa tổng tiền, tên chi nhánh, `DataTable` hay long-press từ Office sang route này.
  - Branch `/br/[branchId]/stock/grn/new` dùng source list touch-native: chọn NCC hoặc PO chờ nhận, giữ context chi nhánh từ route, và chuyển sang URL supplier Branch canonical. Không lặp branch picker, tổng giá trị PO hoặc khung form Office tại bước chọn nguồn.
  - Branch `/br/[branchId]/stock/grn/new/[supplierId]` dùng form dòng touch-native: context NCC/kho nhận, các dòng đã thêm, tìm nguyên liệu và action sticky theo đúng thứ tự thao tác. Chỉ đổi nơi nhận trong chi nhánh đã khóa bởi URL; phone sửa dòng bằng bottom sheet, tablet landscape chỉ mở hai panel thay vì bảng hoặc side editor Office.
  - Branch `/br/[branchId]/stock/grn/[id]` giữ review/receipt native: nháp cho phép kiểm nhận, thêm/sửa dòng trong bottom sheet rồi lưu/chốt; phiếu đã chốt chỉ hiển thị biên nhận và các dòng thực nhận. Không đưa audit, sửa sau chốt, stock correction, hóa đơn NCC, hoặc `GRNDetailClient` Office vào Branch.
  - Branch `/br/[branchId]/stock/stocktake` là `LIST` touch-native cho phiên kiểm kê của quản lý chi nhánh: ưu tiên phiên đang thực hiện, sau đó là lịch sử theo trạng thái. Không dùng `DataTable`, long-press drawer, branch picker, audit, hay action Office; `/stock/count` vẫn là phiếu đếm được giao riêng cho nhân viên.
  - Branch `/br/[branchId]/stock/stocktake/new` là `DOC-WORKFLOW` touch-native: URL khóa chi nhánh, người quản lý chỉ chọn mode và vị trí, rồi action sticky mở phiên và chuyển thẳng sang count. Không lặp selector đổi chi nhánh hoặc `DocumentFormFrame` Office.
  - Branch `/br/[branchId]/stock/stocktake/[id]/count` là `DOC-WORKFLOW` số đếm mù: first viewport là nguyên liệu đang đếm, đơn vị ghi nhận, number pad và lưu/đi tiếp; draft, zone lock và submit round giữ authority Server Action/RPC hiện có. Không tải hay hiển thị số tồn hệ thống trước khi phiên hoàn tất, và không đổi tablet thành bảng Office.
  - Branch `/br/[branchId]/stock/stocktake/[id]` là `DETAIL` touch-native: phiên đang thực hiện chỉ review số đếm mù/đếm lại và action tiếp tục/chốt theo quyền; khi hoàn tất mới hiển thị hệ thống, thực đếm và chênh lệch theo từng nguyên liệu. Không đưa audit history, report CTA, WAC, giá trị tồn hoặc Office detail chrome vào Branch.
  - Branch `/br/[branchId]/stock/issues` là `LIST` touch-native cho hủy hỏng/xuất khác: scope chi nhánh chỉ lấy từ URL, hàng phiếu hiển thị mã, loại, ngày và trạng thái; tạo nháp là bottom sheet ngắn, không lặp branch picker, tổng giá trị, export, `DataTable` hoặc audit Office.
  - Branch `/br/[branchId]/stock/issues/[id]` là `DETAIL` touch-native: nháp cho thêm/sửa/xóa một dòng nguyên liệu bằng bottom sheet, bắt buộc lý do và kiểm tra số lượng theo đơn vị nhập trước khi gọi Server Action; chốt/hủy là action sticky có xác nhận. Phiếu cuối chỉ đọc; WAC, giá trị, audit và correction thuộc Office.
  - Branch `/br/[branchId]/stock/supplier-returns` là `LIST` touch-native cho phiếu trả NCC: route scope khóa theo URL; mỗi hàng chỉ cho mã, NCC, GRN gốc, ngày và trạng thái. Không đưa branch picker, `DataTable`, tổng giá trị, audit, export hoặc chrome Office vào phone/tablet.
  - Branch `/br/[branchId]/stock/supplier-returns/new` là `DOC-WORKFLOW` touch-native: chỉ chọn GRN có dòng bị từ chối, cách xử lý, lý do và ghi chú; action hiện có tự sao chép dòng bị từ chối và vẫn enforce branch/duplicate/permission ở server. Không đổi branch, không dùng form Office, và không hiển thị giá trị tiền.
  - Branch `/br/[branchId]/stock/supplier-returns/[id]` là `DETAIL` touch-native: ưu tiên dòng trả, NCC/GRN gốc, lý do, cách xử lý và trạng thái; gửi NCC/ghi có/hoàn tiền/hủy ở sticky footer theo authority state machine hiện có. Phiếu cuối chỉ đọc; tổng giá trị, audit, credit-note accounting detail và Office presenter thuộc Office.
  - Branch `/br/[branchId]/stock/reports` là `REPORT` touch-native: branch URL và tháng hiện tại khóa phạm vi; first viewport là chênh lệch tiêu hao warning/critical, sau đó là các nguyên liệu biến động nhiều nhất. Mỗi quantity giữ nguyên unit của nguyên liệu và row chạm vào tồn thực tương ứng. Không đưa biểu đồ, KPI/tổng quantity chéo đơn vị, công nợ NCC, giá vốn, branch/date picker, export, `DataTable`, audit hoặc presenter Office vào phone/tablet.
  - Branch `/br/[branchId]/stock/waste` là `DOC-WORKFLOW` touch-native: vị trí kho và cảnh báo cap ở màn chính, danh sách dòng hao hụt chỉ hiển thị nguyên liệu, số lượng/đơn vị, tier và giá trị dự kiến; mỗi dòng sửa trong bottom sheet để giữ ngữ cảnh tồn, lý do và bằng chứng. URL khóa branch, không dùng branch picker, `DocumentFormFrame`, `DataTable`, header/toolbar Office, audit hoặc tổng quan chi phí Office. Server Action/RPC vẫn là authority cho WAC, tồn, tier và approval.
  - Branch `/br/[branchId]/stock/waste-approvals` là `LIST` touch-native: queue chỉ hiển thị phiếu chờ duyệt của branch URL, giá trị, người tạo, thời điểm, ca, số dòng và tier cao nhất; chạm một phiếu mở bottom sheet chứa dòng, lý do, ảnh bằng chứng và ghi chú duyệt. Phiếu do chính người dùng tạo vẫn xem được nhưng không có action; approve/reject xác nhận trước khi gọi Server Action hiện có. Không dùng branch picker, `DocumentFormFrame`, `DataTable`, Office card presenter, audit/export hoặc dữ liệu cross-branch.
  - Mọi hành động làm thay đổi số lượng tồn kho (Nhập, Xuất, Điều chuyển, Kiểm kê) bắt buộc phải tạo ra một dòng chứng từ `stock_movements` (chỉ ghi thêm - append-only) để phục vụ việc kiểm toán dữ liệu. Nghiêm cấm việc thay đổi trực tiếp số lượng tồn kho bằng lệnh UPDATE thô trong DB.

---

### 2.6. Lập phiếu nhập kho (GRN) — `/inventory/grn/new` & `/br/[branchId]/stock/grn/new`

- **Archetype:** Office dùng `DOC-WORKFLOW`; Branch source selection dùng touch `LIST`, sau đó mở form dòng touch `DOC-WORKFLOW` tại `/br/[branchId]/stock/grn/new/[supplierId]` và review/receipt touch `DETAIL` tại `/br/[branchId]/stock/grn/[id]`.
- **Đối tượng sử dụng chính:** Quản lý kho, Nhân viên nhận hàng.
- **Mục tiêu Nghiệp vụ (Why?):** Ghi nhận chính xác số lượng nguyên liệu thực tế nhận từ nhà cung cấp để cập nhật tồn kho tức thời và xác lập cơ sở tính giá vốn hàng bán chính xác.
- **Mục tiêu Người dùng (Goal):** Đối chiếu hàng thực giao với phiếu đặt (PO), ghi nhận số lượng chênh lệch và hoàn thành phiếu nhập kho nhanh nhất để giải phóng xe giao hàng.
- **Luồng thao tác (Workflow):**
  1. **Chọn nguồn:** Chọn nhà cung cấp hoặc chọn từ một phiếu đặt hàng (PO) có sẵn để kế thừa dữ liệu dòng.
  2. **Kiểm đếm:** Nhập số lượng thực nhận cho từng dòng nguyên liệu. Hệ thống tự động tính chênh lệch so với PO (nếu có).
  3. **Xác lập giá:** Nhập đơn giá thực mua trên hóa đơn đi kèm.
  4. **Hoàn tất:** Bấm "Xác nhận nhập kho" -> Ghi tăng tồn kho tức thời, cập nhật giá vốn trung bình gia quyền (WAC) của nguyên liệu.
- **Thông tin hiển thị:**
  - **Nên hiển thị:** Office dùng khung form dòng (`DocumentFormFrame`); Branch hiển thị NCC/kho nhận, danh sách dòng chạm để sửa, tìm nguyên liệu, đơn vị quy đổi chuẩn và action sticky. Review Branch dùng sheet cho dữ kiện nhận hàng; biên nhận Branch sau chốt chỉ đọc. Cột so sánh PO vs thực nhận thuộc review/detail theo quyền.
  - **KHÔNG hiển thị:** Các biểu đồ phân tích xu hướng giá của năm, thông tin quỹ tiền mặt của chi nhánh.
- **Quy chuẩn UX/UI:**
  - Office bắt buộc dùng `DocumentFormFrame` (bố cục header cố định + thân cuộn chứa danh sách dòng + footer chứa tổng tiền và nút bấm xác nhận). Branch bắt buộc dùng `BranchOperatorPage` + `BranchOperatorPanel` + `AppDetailFooter` sticky; không render khung Office, bảng desktop, hoặc picker đổi chi nhánh.
  - Nút "Xác nhận nhập kho" phải nằm ở vị trí cố định dưới cùng bên phải và yêu cầu xác nhận lại qua Dialog để tránh bấm nhầm khi chưa kiểm đếm xong.

---

### 2.7. Đối soát hóa đơn NCC (Supplier Invoice Match) — `/inventory/supplier-invoices`

- **Archetype:** `LIST`.
- **Đối tượng sử dụng chính:** Chủ cửa hàng (`owner`), Kế toán/Văn phòng (`office`).
- **Mục tiêu Nghiệp vụ (Why?):**
  - Đối soát chéo 3 bên (3-way matching): Phiếu đặt hàng (PO) vs Phiếu thực nhập (GRN) vs Hóa đơn NCC gửi đến. Đảm bảo HKD chỉ thanh toán đúng số lượng thực nhận với đúng đơn giá đã thỏa thuận, tránh thất thoát tài chính.
- **Mục tiêu Người dùng (Goal):** Phát hiện nhanh các dòng hóa đơn bị lệch giá hoặc lệch lượng để yêu cầu NCC điều chỉnh trước khi bấm duyệt thanh toán.
- **Luồng thao tác (Workflow):**
  1. **Nhập hóa đơn:** Tạo hồ sơ hóa đơn NCC mới (số hóa đơn, ngày, tổng tiền thuế).
  2. **Liên kết:** Chọn các phiếu nhập kho (GRN) tương ứng của hóa đơn đó.
  3. **Đối soát:** Hệ thống tự động so khớp từng dòng: Số lượng trên hóa đơn vs Số lượng GRN thực nhận vs Đơn giá PO.
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
- **Đối tượng sử dụng chính:** Chủ cửa hàng (`owner`) (độc quyền phân quyền), Quản lý chi nhánh (chỉ xem hồ sơ nhân viên thuộc quyền).
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

---

### 2.9. Báo cáo Doanh thu & Chi phí — `/finance`

- **Archetype:** `DASHBOARD`.
- **Đối tượng sử dụng chính:** Chủ cửa hàng (`owner`) (độc quyền xem báo cáo tài chính tổng hợp), Văn phòng (`office`) (chỉ xem theo phân quyền).
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
