# Bản đồ mục tiêu màn hình & Luồng vận hành (Screen Context Map)

> **Trạng thái:** Tài liệu tham chiếu chuẩn nghiệp vụ (SSoT).  
> **Quy tắc bắt buộc:** Mọi thay đổi UI, thêm tính năng, hoặc tái cấu trúc trên các đường dẫn (route) tương ứng phải tuân thủ nghiêm ngặt mục tiêu nghiệp vụ, luồng thao tác và ranh giới thông tin được định nghĩa tại đây. Nghiêm cấm việc chắp vá UI (patchwork) hoặc thêm các trường dữ liệu/nút bấm nằm ngoài mục tiêu hoạt động của màn hình.

---

## 1. Hướng dẫn sử dụng Bản đồ Ngữ cảnh

Tài liệu này được tổ chức theo cấu trúc chuẩn hóa cho mỗi màn hình nhằm trả lời 5 câu hỏi cốt lõi trước khi lập trình hoặc thiết kế:
* **Tại sao màn hình này tồn tại?** (Mục tiêu nghiệp vụ - Business Purpose)
* **Ai là người ngồi trước màn hình này?** (Đối tượng sử dụng - Primary Actor)
* **Họ muốn đạt được kết quả gì nhanh nhất?** (Mục tiêu người dùng - User Goal)
* **Họ sẽ tương tác theo các bước nào?** (Luồng thao tác - Workflow)
* **Thông tin gì cần hiển thị để phục vụ mục tiêu đó?** (Thông tin hiển thị - What to Show / What NOT to Show)

---

## 2. Chi tiết các màn hình cốt lõi

### 2.1. Màn hình Bán hàng (POS) — `/br/[branchId]/pos`

* **Đối tượng sử dụng chính:** Thu ngân (`cashier`), Quản lý chi nhánh (`branch_manager`) (khi hỗ trợ).
* **Mục tiêu Nghiệp vụ (Why?):** 
  * Ghi nhận đơn hàng bán ra chính xác, nhanh chóng, thu tiền đúng và truyền đạt lệnh chế biến tức thời đến bếp (KDS). 
  * Bảo đảm tính toàn vẹn của doanh thu thông qua kiểm soát ca và kiểm soát dòng tiền mặt thực tế tại két.
* **Mục tiêu Người dùng (Goal):** Nhận order từ khách, chọn món, thanh toán và in hóa đơn trong vòng dưới 30 giây để tối ưu tốc độ phục vụ.
* **Luồng thao tác (Workflow):**
  1. **Khởi tạo:** Mở ca POS mới (nếu đầu ngày/đầu ca) -> Xác nhận số tiền mặt ban đầu tại két.
  2. **Chọn món:** Chọn danh mục món -> Chọn món ăn -> Thêm tùy chọn món (`modifier`) hoặc ghi chú nếu khách yêu cầu.
  3. **Xác nhận Order:** Chọn hình thức phục vụ (Ăn tại bàn + số bàn / Mang đi) -> Bấm gửi lệnh chế biến đến bếp (KDS).
  4. **Thanh toán:** Chọn phương thức thanh toán (Tiền mặt / VietQR / Momo) -> Áp dụng mã giảm giá (nếu có quyền) -> Xác nhận đã thu tiền -> Hệ thống tự động in hóa đơn giấy ra máy in quầy bar.
  5. **Kết ca:** Cuối ca, kiểm đếm số tiền mặt thực tế trong két -> Nhập số tiền thực tế -> Đóng ca và đối chiếu lệch dòng tiền (`cash variance`).
* **Thông tin hiển thị:**
  * **Nên hiển thị:** Danh sách món ăn dạng lưới (grid) với hình ảnh/tên ngắn dễ bấm; Giỏ hàng (Cart) hiện tại; Trạng thái kết nối máy in và két tiền; Nút thanh toán nổi bật, kích thước chạm (`size="touch"`).
  * **KHÔNG hiển thị:** Báo cáo doanh thu tháng, lịch sử chi tiết của các ca làm việc khác, thông tin lương nhân sự, hoặc danh sách nguyên liệu thô của kho.
* **Quy chuẩn UX/UI:** 
  * Mobile-first và tối ưu cảm ứng (màn hình tablet/máy POS cầm tay). Các nút bấm phải đạt chuẩn touch-target (tối thiểu `44px`).
  * Giỏ hàng (Cart) chỉ dùng để tạo đơn mới. Khi đơn đã gửi hoặc thanh toán, mọi thay đổi phải thực hiện qua luồng Lịch sử đơn hàng, không chỉnh sửa trực tiếp trên giỏ hàng POS.

---

### 2.2. Màn hình Bếp (KDS) — `/br/[branchId]/kds`

* **Đối tượng sử dụng chính:** Đầu bếp (`chef`), Nhân viên bếp.
* **Mục tiêu Nghiệp vụ (Why?):** 
  * Tiếp nhận danh sách món cần chế biến theo thời gian thực từ POS để bếp chế biến đúng món, đúng thứ tự, giảm thiểu sai sót và lãng phí nguyên liệu.
* **Mục tiêu Người dùng (Goal):** Biết ngay món nào cần làm trước, số lượng bao nhiêu, và đánh dấu hoàn thành nhanh chóng để chuyển ra cho khách.
* **Luồng thao tác (Workflow):**
  1. **Tiếp nhận:** KDS tự động nhận ticket món ăn mới từ POS qua kết nối realtime (Websocket).
  2. **Theo dõi:** Sắp xếp ticket theo thời gian (cũ nhất ở trước) hoặc theo độ ưu tiên.
  3. **Chế biến:** Bếp nhìn tổng lượng món cùng loại cần chế biến (ví dụ: "Tổng 5 Sườn cốt lết cần nướng") để tối ưu công suất bếp.
  4. **Hoàn thành:** Bấm vào món/ticket để đánh dấu "Đã làm xong" (`ready/bump`) -> Lệnh tự động chuyển sang màn hình Runner và in bill ra bàn ra món.
  5. **Hoàn tác:** Bấm "Thu hồi" (`recall`) nếu lỡ tay bấm nhầm ticket chưa hoàn thành.
* **Thông tin hiển thị:**
  * **Nên hiển thị:** Các thẻ order (`OperationalBoardCard`) chứa danh sách món, số lượng, thời gian chờ (đổi màu cảnh báo nếu quá giờ), số bàn/mã mang đi.
  * **KHÔNG hiển thị:** Giá tiền của món, phương thức thanh toán, thông tin doanh thu, hoặc bất kỳ nút bấm quản trị nào.
* **Quy chuẩn UX/UI:** 
  * Sử dụng giao diện tối (Dark mode) hoặc độ tương phản cực cao để chống mỏi mắt trong môi trường bếp nóng và nhiều khói dầu.
  * Tuyệt đối không dùng dữ liệu giả lập (loading skeletons) khi tải KDS để tránh việc bếp làm nhầm đơn ảo; chỉ dùng vòng quay tải trang (`PageSpinner`) khi chưa có dữ liệu thật.

---

### 2.3. Màn hình Điều phối (Runner) — `/br/[branchId]/runner`

* **Đối tượng sử dụng chính:** Nhân viên chạy bàn (`runner`), Nhân viên điều phối ra món.
* **Mục tiêu Nghiệp vụ (Why?):** 
  * Khớp đúng món ăn đã hoàn thành từ bếp với đúng bàn hoặc đúng khách hàng mang đi, tránh giao nhầm món, giao thiếu món hoặc làm nguội món.
* **Mục tiêu Người dùng (Goal):** Nhìn thấy món nào đã sẵn sàng, lấy đúng đĩa mang đến đúng bàn và đánh dấu "Đã giao" (`served`).
* **Luồng thao tác (Workflow):**
  1. **Nhận diện:** Runner nhìn danh sách món có trạng thái "Đã xong" (màu xanh lá) hiển thị trên màn hình.
  2. **So khớp:** Lấy đĩa thức ăn tương ứng kèm bill giấy đối chiếu số bàn/mã đơn.
  3. **Bàn giao:** Mang món ra bàn hoặc giao cho khách mang đi -> Bấm "Xác nhận đã giao" (`served`) trên màn hình Runner để đóng trạng thái món.
* **Thông tin hiển thị:**
  * **Nên hiển thị:** Danh sách món kèm số bàn, mã đơn hàng, tên món và số lượng, sắp xếp theo thời gian xong của bếp.
  * **KHÔNG hiển thị:** Giá tiền, thông tin nguyên liệu kho, lịch sử ca làm việc của nhân viên.
* **Quy chuẩn UX/UI:** 
  * Giao diện siêu tinh gọn, chữ lớn để đọc được từ khoảng cách 2 mét.
  * Chỉ hiển thị các đơn đang chờ giao hoặc vừa giao xong trong vòng 5 phút, không kéo dài danh sách lịch sử để tránh quá tải thông tin.

---

### 2.4. Bảng điều khiển Chi nhánh (Branch Dashboard) — `/br/[branchId]/dashboard`

* **Đối tượng sử dụng chính:** Quản lý chi nhánh (`branch_manager`), Chủ cửa hàng (`owner`).
* **Mục tiêu Nghiệp vụ (Why?):** 
  * Cung cấp cái nhìn toàn diện về tình trạng vận hành thực tế của một chi nhánh trong ngày hôm nay: doanh thu tức thời, công suất bếp, trạng thái két tiền và nhân sự làm việc.
* **Mục tiêu Người dùng (Goal):** Biết ngay chi nhánh có đang vận hành ổn định không, có sự cố nào cần xử lý khẩn cấp không (lệch tiền két, thiếu nguyên liệu, chưa mở ca POS).
* **Luồng thao tác (Workflow):**
  1. **Đọc chỉ số nhanh:** Xem doanh thu, số đơn hàng, số lượng bàn đang hoạt động hôm nay.
  2. **Giám sát thiết bị/vận hành:** Kiểm tra trạng thái máy in hóa đơn (online/offline), phiên POS hiện tại có bị mở trễ không.
  3. **Xử lý công việc:** Nhìn danh sách "Việc cần xử lý hôm nay" (ví dụ: Có 2 yêu cầu duyệt nghỉ phép, 1 phiếu nhập kho GRN đang chờ xác nhận). Bấm vào để xử lý trực tiếp.
* **Thông tin hiển thị:**
  * **Nên hiển thị:** Hàng chỉ số KPI chính (`KpiRow` của `KpiCard`) gồm Doanh thu tạm tính, Số đơn, Số bàn trống. Hộp cảnh báo thiết bị; Lối tắt đến các tác vụ vận hành (menu limits, team, stocktake).
  * **KHÔNG hiển thị:** Báo cáo tài chính chi tiết của cả chuỗi (L0), công nợ nhà cung cấp tổng, hoặc cấu hình phân quyền hệ thống.
* **Quy chuẩn UX/UI:** 
  * Ưu tiên hiển thị danh sách công việc cần làm (`task queue first`) lên đầu để định hướng hành động cho Quản lý chi nhánh ngay khi mở trang.

---

### 2.5. Phân hệ Kho hàng (Inventory Workspace) — `/inventory` & `/br/[branchId]/stock`

* **Đối tượng sử dụng chính:** Quản lý kho (`warehouse_manager`), Quản lý bếp (`production_manager`), Quản lý chi nhánh (`branch_manager`), Chủ cửa hàng (`owner`).
* **Mục tiêu Nghiệp vụ (Why?):**
  * Kiểm soát chính xác số lượng nguyên liệu tồn kho thực tế, tính toán giá vốn hàng bán (WAC), giảm thiểu hao hụt/thất thoát nguyên liệu và tối ưu hóa chi phí mua hàng.
* **Mục tiêu Người dùng (Goal):** Nhập kho nhanh, kiểm kho không sai lệch, điều chuyển hàng giữa các chi nhánh mượt mà.
* **Luồng thao tác (Workflow):**
  * **Nhập kho (GRN):** Tạo phiếu nhập kho từ nhà cung cấp -> Kiểm đếm thực tế -> Xác nhận nhập kho (cập nhật tồn kho và tính lại giá vốn).
  * **Kiểm kê (Stocktake):** Tạo đợt kiểm kê -> Nhân viên đi đếm thực tế (kiểm kê mù - blind stocktake) -> Quản lý đối chiếu chênh lệch -> Xác nhận cân đối kho.
  * **Điều chuyển (Transfer):** Tạo phiếu chuyển kho từ Kho Tổng sang Chi nhánh -> Vận chuyển -> Chi nhánh nhận hàng, xác nhận thực nhận và ghi nhận hao hụt đường đi.
* **Thông tin hiển thị:**
  * **Nên hiển thị:** Danh sách nguyên liệu kèm tồn khả dụng, đơn vị tính; Trạng thái các phiếu kho (Nháp / Đang giao / Hoàn thành); Cảnh báo tồn dưới mức an toàn.
  * **KHÔNG hiển thị:** Doanh thu bán hàng chi tiết, thông tin thẻ tín dụng của khách, bảng lương nhân sự.
* **Quy chuẩn UX/UI:** 
  * Sử dụng cấu trúc `DataTable` đồng nhất trên cả máy tính và điện thoại.
  * Mọi hành động làm thay đổi số lượng tồn kho (Nhập, Xuất, Điều chuyển, Kiểm kê) bắt buộc phải tạo ra một dòng chứng từ `stock_movements` (chỉ ghi thêm - append-only) để phục vụ việc kiểm toán dữ liệu. Nghiêm cấm việc thay đổi trực tiếp số lượng tồn kho bằng lệnh UPDATE thô trong DB.

---

### 2.6. Lập phiếu nhập kho (GRN) — `/inventory/grn/new`

* **Đối tượng sử dụng chính:** Quản lý kho, Nhân viên nhận hàng.
* **Mục tiêu Nghiệp vụ (Why?):** Ghi nhận chính xác số lượng nguyên liệu thực tế nhận từ nhà cung cấp để cập nhật tồn kho tức thời và xác lập cơ sở tính giá vốn hàng bán chính xác.
* **Mục tiêu Người dùng (Goal):** Đối chiếu hàng thực giao với phiếu đặt (PO), ghi nhận số lượng chênh lệch và hoàn thành phiếu nhập kho nhanh nhất để giải phóng xe giao hàng.
* **Luồng thao tác (Workflow):**
  1. **Chọn nguồn:** Chọn nhà cung cấp hoặc chọn từ một phiếu đặt hàng (PO) có sẵn để kế thừa dữ liệu dòng.
  2. **Kiểm đếm:** Nhập số lượng thực nhận cho từng dòng nguyên liệu. Hệ thống tự động tính chênh lệch so với PO (nếu có).
  3. **Xác lập giá:** Nhập đơn giá thực mua trên hóa đơn đi kèm.
  4. **Hoàn tất:** Bấm "Xác nhận nhập kho" -> Ghi tăng tồn kho tức thời, cập nhật giá vốn trung bình gia quyền (WAC) của nguyên liệu.
* **Thông tin hiển thị:**
  * **Nên hiển thị:** Khung form nhập liệu dòng dạng bảng (`DocumentFormFrame`); Cột so sánh số lượng PO vs Thực nhận; Đơn vị quy đổi chuẩn.
  * **KHÔNG hiển thị:** Các biểu đồ phân tích xu hướng giá của năm, thông tin quỹ tiền mặt của chi nhánh.
* **Quy chuẩn UX/UI:**
  * Bắt buộc dùng `DocumentFormFrame` (bố cục header cố định + thân cuộn chứa danh sách dòng + footer chứa tổng tiền và nút bấm xác nhận).
  * Nút "Xác nhận nhập kho" phải nằm ở vị trí cố định dưới cùng bên phải và yêu cầu xác nhận lại qua Dialog để tránh bấm nhầm khi chưa kiểm đếm xong.

---

### 2.7. Đối soát hóa đơn NCC (Supplier Invoice Match) — `/inventory/supplier-invoices`

* **Đối tượng sử dụng chính:** Chủ cửa hàng (`owner`), Kế toán/Văn phòng (`office`).
* **Mục tiêu Nghiệp vụ (Why?):** 
  * Đối soát chéo 3 bên (3-way matching): Phiếu đặt hàng (PO) vs Phiếu thực nhập (GRN) vs Hóa đơn NCC gửi đến. Đảm bảo HKD chỉ thanh toán đúng số lượng thực nhận với đúng đơn giá đã thỏa thuận, tránh thất thoát tài chính.
* **Mục tiêu Người dùng (Goal):** Phát hiện nhanh các dòng hóa đơn bị lệch giá hoặc lệch lượng để yêu cầu NCC điều chỉnh trước khi bấm duyệt thanh toán.
* **Luồng thao tác (Workflow):**
  1. **Nhập hóa đơn:** Tạo hồ sơ hóa đơn NCC mới (số hóa đơn, ngày, tổng tiền thuế).
  2. **Liên kết:** Chọn các phiếu nhập kho (GRN) tương ứng của hóa đơn đó.
  3. **Đối soát:** Hệ thống tự động so khớp từng dòng: Số lượng trên hóa đơn vs Số lượng GRN thực nhận vs Đơn giá PO.
  4. **Xử lý chênh lệch:** Đánh dấu "Hợp lệ" nếu khớp; hoặc ghi chú "Lệch giá" / "Lệch lượng" để kế toán làm việc lại với NCC.
  5. **Duyệt:** Bấm "Duyệt thanh toán" để chuyển trạng thái sang hàng chờ chi của phân hệ tài chính.
* **Thông tin hiển thị:**
  * **Nên hiển thị:** Giao diện so sánh song song các dòng mặt hàng; Ký hiệu cảnh báo đỏ tại các vị trí phát hiện chênh lệch đơn giá hoặc số lượng.
  * **KHÔNG hiển thị:** Doanh thu bán cơm tấm, sơ đồ bàn ăn, ca làm việc của nhân viên phục vụ.
* **Quy chuẩn UX/UI:**
  * Bố cục màn hình rộng (width `xwide` tối thiểu `1600px` trên desktop) để hiển thị đủ các cột đối chiếu mà không phải cuộn ngang quá nhiều gây mỏi mắt và dễ nhìn sót số liệu.

---

### 2.8. Quản lý Nhân sự & Phân quyền — `/hr/staff`

* **Đối tượng sử dụng chính:** Chủ cửa hàng (`owner`) (độc quyền phân quyền), Quản lý chi nhánh (chỉ xem hồ sơ nhân viên thuộc quyền).
* **Mục tiêu Nghiệp vụ (Why?):** 
  * Quản lý thông tin NLĐ, gán đúng chức danh, chi nhánh làm việc và cấp đúng quyền truy cập hệ thống để bảo mật dữ liệu, tránh nhân viên xem hoặc sửa dữ liệu vượt cấp (ví dụ: Thu ngân sửa giá món, Bếp xem báo cáo doanh thu chuỗi).
* **Mục tiêu Người dùng (Goal):** Thêm nhân viên mới, gán chi nhánh và cấp quyền cho họ chỉ trong 3 bước.
* **Luồng thao tác (Workflow):**
  1. **Tạo hồ sơ:** Nhập thông tin cá nhân (Họ tên, SĐT, Số CCCD, Ngày sinh).
  2. **Gán vị trí:** Chọn chức danh (ví dụ: Thu ngân, Đầu bếp) -> Chọn chi nhánh hoạt động chính.
  3. **Cấp tài khoản:** Nhập email -> Hệ thống tạo tài khoản auth và gán mẫu quyền (`role template`) tương ứng với chức danh.
  4. **Tùy chỉnh quyền (Chỉ Owner):** Thêm hoặc bớt một vài permission key cụ thể cho nhân sự đó nếu có yêu cầu đặc biệt.
* **Thông tin hiển thị:**
  * **Nên hiển thị:** Danh sách tài khoản nhân sự kèm chức danh và chi nhánh; Bảng danh sách các quyền truy cập hệ thống được chia nhóm trực quan kèm hộp kiểm (checkbox) bật/tắt quyền.
  * **KHÔNG hiển thị:** Doanh thu, số lượng tồn kho nguyên liệu, chi tiết công nợ NCC.
* **Quy chuẩn UX/UI:**
  * Toàn bộ thao tác thay đổi phân quyền phải ghi nhận vào nhật ký phân quyền (`hr/staff/audit`) để phục vụ việc hậu kiểm an ninh hệ thống.

---

### 2.9. Báo cáo Doanh thu & Chi phí — `/finance`

* **Đối tượng sử dụng chính:** Chủ cửa hàng (`owner`) (độc quyền xem báo cáo tài chính tổng hợp), Văn phòng (`office`) (chỉ xem theo phân quyền).
* **Mục tiêu Nghiệp vụ (Why?):** 
  * Cung cấp bức tranh tài chính chính xác về dòng tiền vào/ra, chi phí nguyên liệu, chi phí nhân sự và lợi nhuận gộp thực tế của HKD theo ngày/tháng để đưa ra quyết định kinh doanh.
* **Mục tiêu Người dùng (Goal):** Biết hôm nay lời hay lỗ bao nhiêu, tiền mặt thực tế đã khớp với tài khoản ngân hàng chưa, và xuất file cho kế toán thuế.
* **Luồng thao tác (Workflow):**
  1. **Chọn kỳ báo cáo:** Lọc theo ngày hôm nay / Tuần này / Tháng này / Chọn khoảng ngày.
  2. **Chọn phạm vi:** Lọc theo toàn chuỗi hoặc một chi nhánh cụ thể.
  3. **Xem KPIs:** Đọc các chỉ số doanh thu ròng, chi phí nguyên liệu (COGS), chi phí nhân sự, lợi nhuận gộp.
  4. **Đối soát dòng tiền:** Xem danh sách giao dịch SePay khớp tự động với VietQR -> Xác nhận các dòng chưa khớp.
  5. **Xuất bản:** Xuất báo cáo dạng file Excel/CSV phục vụ kê khai thuế theo Thông tư 152/2025/TT-BTC.
* **Thông tin hiển thị:**
  * **Nên hiển thị:** Biểu đồ xu hướng doanh thu; Bảng KPIs tài chính chuẩn hóa; Bảng kê chi tiết các giao dịch dòng tiền kèm mã tham chiếu giao dịch ngân hàng.
  * **KHÔNG hiển thị:** Nút bấm tạo order mới, danh sách các bước chế biến món ăn của bếp, hoặc các tính năng phân tích tài chính doanh nghiệp cổ phần phức tạp không áp dụng cho mô hình HKD.
* **Quy chuẩn UX/UI:**
  * Mọi số liệu tiền tệ phải được định dạng chuẩn VND bằng hàm `formatVND` (ví dụ: `150.000 ₫`, không viết `150k` hay `150000`).
  * Tất cả các biểu đồ tài chính chỉ được phép sử dụng bảng màu quy chuẩn từ `chart-1` đến `chart-5` trong token của hệ thống để đảm bảo tính đồng bộ thị giác.
