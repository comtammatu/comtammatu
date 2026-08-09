# Bản đồ mục tiêu màn hình & Luồng vận hành (Screen Context Map)

> **SSoT ngữ cảnh màn hình.** UI/route phải khớp actor, job và ranh giới thông tin tại đây. Không chắp vá ngoài mục tiêu màn hình.
>
> **Phân quyền tài liệu:** tài liệu này = actor / job / workflow / what-to-show. Layout & exemplar → [`docs/spec/page-archetypes.md`](../spec/page-archetypes.md). Visual/primitive → [`docs/spec/design-system.md`](../spec/design-system.md). Inventory plane `/br/*` → [`branch-route-inventory.md`](./branch-route-inventory.md). ACL → `packages/shared/src/auth/module-acl.ts`.

---

## 1. Cách dùng

Trước khi thiết kế/code, trả lời: **Why?** · **Ai?** · **Goal?** · **Workflow?** · **Show / NOT show?** · **Archetype?** (archetype thuộc `page-archetypes.md`). Không dùng map này để tự tạo layout/primitive mới.

---

## 2. Màn hình cốt lõi

### 2.1. POS — `/br/[branchId]/pos`

- **Archetype:** `BOARD`.
- **Actor:** `cashier`; `branch_manager` khi hỗ trợ.
- **Job:** Ghi đơn đúng, thu tiền đúng, đẩy KDS; kiểm soát ca & tiền mặt két.
- **Goal:** Order → thanh toán → in hóa đơn dưới ~30s.
- **Workflow:** Mở ca (tiền đầu) → chọn món/modifier → hình thức phục vụ → gửi KDS → thanh toán (tiền mặt/VietQR, mã giảm nếu có quyền) → kết ca & đối chiếu `cash variance`.
- **Ưu tiên data:** Grid món + cart + trạng thái in/két + CTA thanh toán touch. **Không:** báo cáo tháng, ca khác, lương, tồn nguyên liệu.
- **UX:** Mobile/tablet touch `≥44px`. Cart chỉ tạo đơn mới; sửa sau gửi/thanh toán qua Lịch sử đơn.

---

### 2.2. KDS — `/br/[branchId]/kds`

- **Archetype:** `BOARD`.
- **Actor:** `chef` / NV bếp.
- **Job:** Nhận ticket realtime từ POS; đúng món, đúng thứ tự; giảm sai/lãng phí.
- **Goal:** Biết món ưu tiên + số lượng; bump `ready` nhanh.
- **Workflow:** Ticket realtime → xếp theo thời gian/ưu tiên → gộp công suất → bump → Gọi số / in bill; `recall` nếu nhầm.
- **Ưu tiên data:** Thẻ order (món, SL, chờ, bàn/mã). **Không:** giá, PTTT, doanh thu, nút quản trị.
- **UX:** Tương phản cao/dark. Không skeleton giả; chỉ `PageSpinner` khi chưa có data thật.

---

### 2.3. Gọi số (`pickup_display`) — `/br/[branchId]/pickup`

- **Archetype:** `BOARD`.
- **Actor:** Khách tại quán + shipper giao hàng (public read-only).
- **Job:** Nhìn số/bàn/đơn đã sẵn sàng để nhận món — không phải workflow nhân viên runner ghép đĩa.
- **Goal:** Biết đơn nào sẵn sàng lấy; tự nhận hoặc shipper lấy đúng mã.
- **Workflow:** Màn hình công khai cập nhật realtime → khách/shipper đối chiếu số/bàn → nhận món tại quầy.
- **Ưu tiên data:** Số đơn / bàn / trạng thái sẵn sàng, chữ lớn. **Không:** giá, kho, thao tác staff, lịch sử ca.
- **UX:** Chữ lớn (~2m), light mode; không nav nhân viên.

---

### 2.4. Branch Dashboard — `/br/[branchId]/dashboard`

- **Archetype:** `DASHBOARD`.
- **Actor:** `branch_manager`, `owner`.
- **Job:** Ngoại lệ/readiness trong ngày — không phải dashboard tài chính thu nhỏ.
- **Goal:** Biết ổn định hay sự cố (lệch két, thiếu NL, chưa mở ca).
- **Workflow:** Đọc việc ưu tiên → mở workflow sở hữu (in/POS/NV/kho) → chốt ngày.
- **Ưu tiên data:** Lanes công việc + drill-down. **Không:** `KpiRow`/`KpiCard`, biểu đồ, doanh thu chuỗi, công nợ L0, phân quyền hệ thống.
- **UX:** Task queue first.

---

### 2.4. control_surface — `/`

- **Archetype:** `LANDING`.
- **Actor:** `owner`, `accountant`, `central_supply_ops`, `central_kitchen_lead`, và HR Control binding (JWT `self_service` + `hr:view_employee`). Role chi nhánh giữ `/br/...`.
- **Job:** «Hôm nay / Cần xử lý» — việc đang thiếu theo ACL, rồi deep-link vào mô-đun.
- **Goal:** Một cửa → xử lý việc hôm nay hoặc chọn đúng mô-đun.
- **Ưu tiên data:** Hàng đợi `Cần xử lý` (counts + deep-link) trước; Owner thêm launcher Điều hành / Nền tảng; role khác chỉ shortcut module được phép. **Không** KPI mosaic / doanh thu trên `/`.
- **UX:** `AppPage` + `AppSection` + `ItemGroup` + `Item` + `Badge`; không breadcrumb thừa. 1 cột phone / 2 cột tablet. Branch roles giữ `/br/...`; `self_service` thuần giữ `/me`.

### 2.4A. Trung tâm vận hành Chi nhánh — `/br/[branchId]`

- **Archetype:** `/br/[branchId]` = `LANDING`; `/shift` = ngày làm việc cá nhân; `/team` = `LIST` hub 2 tab (`Ca hôm nay` · `Nhân viên`). Phân ca / Chấm công / Duyệt kết ca / Duyệt nghỉ = full route `/shift/*` (strip hoặc deep link), không peer-tab Đội. Entry Phân công đếm + Phiếu đếm từ strip Đội; route vẫn `/stock/count-assignments` · `/stock/count-slips`.
- **Actor:** NV trong ca, `branch_manager`, `owner` theo phạm vi tab.
- **Job:** Từ việc cần xử lý → đúng trạm/workspace trong viewport ngắn.
- **Inventory plane:** mọi `page.tsx` dưới `/br/[branchId]` → [`branch-route-inventory.md`](./branch-route-inventory.md) (không nhân bản tại đây).
- **Bottom nav (`branch_kind=branch`):**
  - NV (`cashier`/`chef`/`branch_staff`): `Hôm nay` · `Ca` · `Lịch ca` · `Hồ sơ`.
  - QL (`branch_manager`; owner trong shell CN): `Hôm nay` · `Ca` · `Đội` · `Kho`. Tab **Kho** land `/stock` = 4 cửa (Kho hàng / Yêu cầu hàng / Kiểm kê phiên / Hao hụt) rồi list phiếu giao nhận; Phân công/Phiếu đếm từ **Đội**. Không Tiêu Hao SX. Badge queue live.
  - Chuông = unread inbox. `Điều hành` / `Phản hồi` / `Giới hạn bán` trong `⋯` (QL/owner). Avatar → Hồ sơ.
- **Hub CN:** trạng thái ca → **Cần duyệt** (khi >0) → trạm Bán hàng / Quầy Bếp → Giới hạn bán + Đơn hàng. Không Gọi số trên home. Queue **không** GRN/SX (D093). `/menu-limits` từ overflow.
- **Exception hẹp (manager-like):** panel KPI Doanh thu tháng|ngày + chỉ tiêu + mốc thưởng (sau trạng thái ca, trước queue). Cashier/chef/staff không thấy. Hub không hiện doanh thu. Không badge chỉ tiêu trên Đơn hàng.
- **Ca / Đội:** `Ca` = ngày làm việc cá nhân (Owner không tab; deep-link → `Đội`). NV: `/shift/schedule` + `/profile` tab riêng; QL: lịch shortcut trong `Ca`. `Đội`: board **Cần duyệt** (kết ca/nghỉ khi pending) + **Quản lý đội** (Phân công đếm / Phiếu đếm + Phân ca / Chấm công). Deep workflows: `matchPrefixes` `/shift/roster|attendance|checkout-approvals|leave-approvals`.

---

### 2.4B. Công việc cá nhân — `/me/*`

- **Archetype:** `EMBED-WRAPPER` mỏng vào shared staff-runtime — cổng ngày làm việc cá nhân, không dashboard/L0.
- **Actor:** KT, Kho Tổng, Bếp TT, VP không branch assignment. Cửa hàng dùng `/br/.../shift|profile`; Owner không dùng `/me`.
- **Job:** Chấm công / lịch / nghỉ / hồ sơ / phiếu lương mà không giả quyền Tài chính·Kho·HR.
- **Goal:** 1–2 thao tác → chấm công an toàn trên phone → quay lại trạng thái ngày.
- **Workflow:** Có mô-đun → Avatar → `Trang cá nhân` → `/me`; VP không mô-đun vào thẳng `/me`. CTA thích ứng: `Chấm công vào` → `Làm nhiệm vụ` → `Kết ca`. `Lịch` / `Xin nghỉ` / `Hồ sơ` / `Phiếu lương` = actor-only `/me/*`.
- **Ưu tiên data:** Ca hôm nay, vào/ra, tiến độ việc, lịch/phép/hồ sơ/phiếu lương của chính actor. **Không:** chọn NV/Branch, đội, duyệt, quyền người khác, HR nhạy cảm người khác.
- **UX:** Route ngang `/inventory`·`/finance`·`/hr` nhưng không tab mô-đun; vào qua Avatar. Control Surface shell; không bottom-nav `Mô-đun` rỗng. Adapter `Employee*`, task-led; không dashboard/KPI/theme riêng. CTA chính ≥44px; trạng thái lỗi/offline/camera có đường phục hồi.

---

### 2.5. Kho hàng — `/inventory` & `/br/[branchId]/stock`

> On-hand exemplar context (tests may cite as comment only) — giữ section này.

- **Planes (ADR 0012 / 0018):** BM daily → `/br`; Owner + KT + Kho Tổng/Bếp TT → L0 `/inventory` (KT slice `/finance`). Operator stock CN: `/br/[branchId]/stock/*`. Central còn residual deep-link/pad `/br/{pinnedSiteId}/stock/*` (GRN touch, giao nhận, kiểm nhận) — không daily hub; home `/br/{siteId}` → `/inventory`. Feed R14 rewrite stock → L0 cho Owner/KT/central; BM giữ `/br`. Site central theo JWT `branch_id`; việc cá nhân → `/me/*`. Chi tiết phân vai → `docs/ref/inventory.md` §11.
- **Archetype (tóm tắt):** `/inventory` = `LANDING` (workflow lanes từ inventory-nav; không redirect Tồn, không KPI «Nay»); `/br/.../stock` = `LANDING`; hầu hết list kho = `LIST` (khác presentation plane); form mới = `DOC-WORKFLOW`; detail GRN/consumption/issue Branch = `DETAIL`; `/stock/reports` = Branch `REPORT`; `/inventory/supplier-invoices` = shim → `/finance/supplier-invoices`; `/inventory/issues` → `/inventory/consumption?view=waste`. Chi tiết composition → `page-archetypes.md`.
- **Actor:** L0 = `owner`, KT (PO/GRN), `central_supply_ops`, `central_kitchen_lead`. `/br/.../stock` = `branch_manager` (+ residual pad central).
- **Job:** Tồn thực, WAC, giảm hao hụt, tối ưu mua.
- **Goal:** Nhìn tồn → đúng việc; nhập nhanh; SX không lệch.
- **Workflow (tóm tắt):** YCM → PO (1 NCC) → GRN kiểm nhận/WAC → SX Bếp TT (snapshot) → kiểm kê mù → DC theo warehouse site (không same-branch Kho↔Bếp; hub YCH 1 dòng + lane) → Issue/Waste Branch → từ chối trên dòng GRN → báo cáo Branch theo NL (không cộng chéo đơn vị).
- **Ưu tiên data:** NL + tồn khả dụng + ĐVT; trạng thái phiếu; cảnh báo dưới mức an toàn. **Không:** doanh thu bán lẻ, thẻ KH, lương.
- **UX plane CN (D093):** `/stock` home = 4 cửa (tồn / YCH / kiểm kê phiên / hao) trên + list fulfillment dưới. Không tile GRN/SX trên `branch` (redirect). Phân công/Phiếu đếm entry từ Đội. On-hand “Cần bổ sung” → Yêu cầu hàng (không GRN). Pad `/receive/[id]` tự mở kiểm nhận khi `in_transit`. YCH: 4 bước (Gửi → Duyệt → Giao → Xác nhận); chi tiết thao tác bước 1 & 4.
- **Touch Branch vs control_surface:** Branch routes = touch-native (`BranchOperatorPage` / bottom sheet / sticky footer); không `DataTable`, long-press drawer, branch picker, audit/WAC chrome control_surface. L0 `/inventory/count-*` = desktop `DataTable` + `AppDialog`. Mọi biến động tồn → append-only `stock_movements` (cấm UPDATE tồn thô).

---

### 2.6. GRN — `/inventory/grn` & `/inventory/grn/[id]`

- **Archetype:** list = `LIST` (`AppPage`…`DataTable`); detail = `DOC-WORKFLOW`.
- **Actor:** Quản lý kho / NV nhận hàng.
- **Job:** Ghi thực nhận → cập nhật tồn + cơ sở WAC.
- **Goal:** Mở **Chờ nhập hàng** từ PO → ghi đúng → giải phóng xe.
- **Workflow:** Auto-GRN khi PO `sent|approved|partially_received` (1 nháp hoạt động/PO; partial → nháp kế) → kiểm nhận + từ chối (lý do+ảnh) → hệ thống suy trạng thái/đối chiếu PO (Kho không nhập giá) → `Xác nhận nhập kho` (WAC phần PO; dư giá `0`).
- **Ưu tiên data:** GRN/NCC/PO/YCM/kho/ngày/SL đặt·đã nhận·còn·thực·từ chối·áp dụng PO·thiếu·dư·ĐVT. Sau chốt = chỉ đọc. **Không:** giá mua, price variance, biểu đồ giá, quỹ tiền mặt trên bề mặt Kho.
- **UX:** L0 = `DocumentFormFrame` + footer sticky CTA. Branch = `BranchOperatorPage` + panel + `AppDetailFooter`; không khung L0/picker CN. CTA xác nhận + Dialog chống nhầm.

---

### 2.7. Hóa đơn NCC — `/finance/supplier-invoices`

- **Archetype:** `LIST`.
- **Actor:** `owner`.
- **Job:** Đối soát GRN ↔ HĐ NCC; chỉ trả đúng thực nhận + đơn giá chứng từ.
- **Goal:** Phát hiện lệch giá/lượng trước khi duyệt thanh toán.
- **Workflow:** Chọn GRN cùng NCC (HĐ mới bắt buộc gắn GRN) → ngày + VAT progressive + đính kèm tùy chọn → đối soát trước VAT (±1đ; VAT không so hàng; dòng/dư giá `0` được thiếu trên HĐ) → xử lý lệch → đính kèm HĐ GTGT trước thanh toán → thanh toán/giảm nợ/phân bổ ứng trước (không trừ tiền lần 2). Trả hàng không tự giảm nợ.
- **Ưu tiên data:** Loại HĐ, trước VAT/VAT/phải trả, liên kết GRN/PO, chênh lệch, trạng thái đối soát/công nợ/đính kèm, ứng trước NCC. **Không:** doanh thu bán, sơ đồ bàn, ca phục vụ.
- **UX:** Width `xwide`; detail `Sheet` phải. URL state: `?invoiceId&mode=view|pay|credit|advance` / `?mode=create&grnId`. Một overlay tại một thời điểm. Footer action theo `procurement:invoice_match` / `finance:ap_pay`.

---

### 2.8. Hồ sơ nhân sự — `/hr`

Company HR (`/hr/*`) = hồ sơ/tài khoản/công/lương/setup tenant. People ops CN = `/br/.../team` + `/shift/*`. Self-service = `/me/*` (ADR 0012 / 0022). Scope list: `branch=all|office|<branchId>` (display; write re-derive). Deep nav: **Hồ sơ nhân viên** · **Chấm công & ca làm** · **Bảng lương** · **Thiết lập nhân sự**. Một lane `Cần xử lý` khi có việc; không KPI mosaic.

- **Archetype:** `LIST` + tab URL (`view=profile|accounts`).
- **Actor:** Owner / company HR theo ACL.
- **Job:** Tab **Hồ sơ nhân viên** = NLĐ, HĐLĐ, chế độ lương, site/vị trí (không sửa quyền). Tab **Tài khoản & quyền** = đăng nhập, bật/tắt login, phân quyền (không sửa HĐ/lương/hồ sơ NLĐ).
- **Goal:** Việc cần xử lý + onboard hồ sơ; chuyển **Tài khoản** để cấp quyền theo chức vụ hoặc tạo tài khoản độc lập.
- **Workflow:** Tab hồ sơ (strip Cần xử lý → filter → bảng; **Thêm NV** gồm bước tạo đăng nhập) → tab accounts: **Cấp quyền cho hồ sơ** hoặc **Tạo tài khoản độc lập** → `/hr/staff/[id]/permissions` (`/hr/staff` redirect vào accounts).
- **Ưu tiên data:** Hồ sơ = tên/mã/vị trí/site/lương/HĐ/tình trạng. Tài khoản = tên/đăng nhập/quyền/trạng thái login; badge tài khoản độc lập khi chưa gắn `employees`. **Không:** KPI doanh thu/kho; bảng công tháng (`/hr/attendance`); raw `pay_basis`; sửa identity/chức vụ/CN của NV đã gắn hồ sơ từ tab Tài khoản.
- **UX:** Desktop bảng + dialog; cùng IA mobile. Workspace = deep nav; mode = `AppPageTabs` + URL; short edit = `FormDialog`.

### 2.8a. Chấm công & ca — `/hr/attendance`

- **Archetype:** `LIST` + `tab` URL.
- **Actor:** company HR.
- **Job:** Vào/ra hôm nay; duyệt kết ca & phép; bảng công tháng; phân ca tuần (kể cả VP).
- **Goal:** Đầu ngày **Cần duyệt**; trong tháng **Bảng công**; gán ca trước khi NV chấm; không sửa lương.
- **Workflow:** `today` → `approvals` → `timesheet` → `roster` (BM peer: `/br/{id}/shift/roster`).
- **Show / NOT:** Pending trên Cần duyệt; site gồm VP; cảnh báo chưa phân ca. **Không:** phân quyền staff; chỉnh `pay_basis`; KPI bán.
- **UX:** Filter `date`/`site`/`tab`/`month`/`view`/`week` trên URL.

### 2.8b. Bảng lương — `/hr/payroll`

- **Archetype:** `LIST` / document kỳ (`?month=YYYY-MM`).
- **Actor:** company HR có payroll capability.
- **Job:** Tạm tính → đối soát → chốt; phân biệt Theo công vs Lương tháng. Thanh toán = Finance.
- **Goal:** Preflight thiếu HĐ/`pay_basis`/entitlement → tính → điều chỉnh → chốt.
- **Workflow:** Chọn tháng → blocker (chỉ khi có) → mở kỳ → điều chỉnh → chốt.
- **Show / NOT:** Cột chế độ lương VI; khấu trừ nghỉ KL; link hồ sơ thiếu → `/hr?view=profile&salary=missing`; link công → `/hr/attendance?tab=timesheet`. **Không:** chấm giúp NV; đổi quyền; raw keys; preflight “sẵn sàng” khi không blocker.

### 2.8c. Thiết lập nhân sự — `/hr/setup`

- **Archetype:** `SETTINGS-PANEL` + `tab=leave|shifts|tasks`.
- **Actor:** company HR.
- **Job:** Quy tắc ít đụng hàng ngày — mỗi tab một chức năng.
- **Goal:** Chọn đúng mục; không cuộn nhiều section.
- **Workflow:** `leave` (default) → `shifts` → `tasks` (`position_shift_tasks` SSOT).
- **Show / NOT:** Preview việc NV; cảnh báo tắt ca đang gán. **Không:** stack nhiều section; phân ca tuần (ở attendance roster / `/br/*/shift/roster`); bảng lương.

### 2.8d. Phân quyền — `/hr/staff/[id]/permissions` (+ audit)

- **Archetype:** `DETAIL` (list tài khoản ở `/hr?view=accounts`).
- **Actor:** `owner` (độc quyền phân quyền).
- **Job:** Cấp đúng quyền theo chức vụ; tránh vượt cấp.
- **Goal:** Áp mẫu chức vụ → xem quyền → ngoại lệ; lịch sử cá nhân; audit tenant từ overflow (`/hr/staff/audit`).
- **Workflow:** Tab Tài khoản → **Áp quyền theo chức vụ** → ngoại lệ dialog → tab **Lịch sử**.
- **Ưu tiên data:** Nhãn VI (`getStaffPermissionLabelVi`); audit nhóm việc + chức vụ khi `apply_template`. **Không:** doanh thu, tồn, công nợ, bảng công, `pay_basis`; không key EN làm nhãn chính.
- **UX:** Mọi đổi quyền → `permission_audit_log`. Branch leave-approvals = touch `LIST`; L0 = bảng HR desktop.

---

### 2.9. Tài chính — `/finance`

- **Archetype:** `DASHBOARD`.
- **Actor:** `owner`.
- **Job:** Công thức KQKD theo kỳ (hai dòng); tách số dư hiện có và giá trị tồn.
- **Goal:** Doanh thu thuần sau giá vốn món / chi phí VH / biến động tồn; drill báo cáo chuyên biệt khi cần.
- **Workflow:** Chọn kỳ (`Nay`…`Năm`) → phạm vi (`Tất cả`/`Công ty`/`Toàn bộ CN`/`CN`) → đọc 2 dòng công thức → tiền mặt hiện có (không theo bộ lọc) → giá trị tồn cuối kỳ → mở route ngoại lệ (ca lệch, bank match, thiếu giá vốn…).
- **Ưu tiên data:** Hai dòng KPI kỳ; 3 card tiền mặt; giá trị tồn cuối kỳ; danh sách cần xử lý. Tháng/`mtd` + chỉ tiêu → Progress trên Doanh thu thuần; đua CN/pace/editor → `/finance/revenue` · `/finance/targets`. **Không lặp:** bảng tồn chi tiết (Inventory). Thiếu coverage giá vốn → không tính Lợi nhuận gộp/KQKD; chưa chi phí → không KQKD. **Không:** LN sau thuế khi chưa sổ/khóa sổ; nút order/KDS.
- **UX:** `formatVND`. Desktop: dòng 1 = 3 card, dòng 2 = 4 card (khi có quyền tồn); tablet 2 cột; mobile 1 cột (`KpiCard`/`KpiRow`/`AppSection`). Chart chỉ `chart-1`…`chart-5`.

---

### 2.10. HĐĐT khách — `/q/invoice/[token]`

- **Archetype:** `PUBLIC-WORKFLOW`.
- **Actor:** KH đã thanh toán.
- **Job:** Bổ sung thông tin DN + email nhận HĐĐT trong ≤2h, không cần thu ngân nhập.
- **Goal:** Quét QR → MST → kiểm tra tên/địa chỉ → email → xác nhận.
- **Workflow:** QR → tra MST → kiểm tra → xác nhận một lần (khóa sửa) → quá hạn/đã xác nhận/đã đóng = chỉ trạng thái.
- **Ưu tiên data:** CN, mã đơn, hạn, MST, tên/địa chỉ API, email, trạng thái tra cứu/xác nhận. **Không:** thanh toán, POS/Self-Order, mã nội bộ, dữ liệu NCC HĐĐT, sửa sau khi đóng.
- **UX:** Mobile-first; một CTA chính; touch; a11y bàn phím/lỗi.
