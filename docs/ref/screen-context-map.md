# Bản đồ mục tiêu màn hình & Luồng vận hành (Screen Context Map)

> **SSoT ngữ cảnh màn hình.** UI/route phải khớp actor, job và ranh giới thông tin tại đây. Không chắp vá ngoài mục tiêu màn hình.
>
> **Phân quyền tài liệu:** tài liệu này = actor / job / workflow / what-to-show. Layout & exemplar → [`docs/spec/page-archetypes.md`](../spec/page-archetypes.md). Visual/primitive → [`docs/spec/design-system.md`](../spec/design-system.md). Inventory plane `/br/*` → [`branch-route-inventory.md`](./branch-route-inventory.md). ACL → `packages/shared/src/auth/module-acl.ts`.

---

## 1. Cách dùng

Trước khi thiết kế/code, trả lời: **Why?** · **Ai?** · **Goal?** · **Workflow?** · **Show / NOT show?** · **Archetype?** (archetype thuộc `page-archetypes.md`). Không dùng map này để tự tạo layout/primitive mới.

**Product UX spine (lớp mỏng trước khi compose UI):** khóa *gia đình route*
(actor × việc × plane) ở §1A trước khi chọn archetype/block. Plane và Dual
Thesis lấy từ `docs/spec/architecture.md` + `docs/spec/design-system.md`; ACL
từ `packages/shared/src/auth/module-acl.ts` và `docs/spec/role-route-matrix.md`.
Tài liệu này **không** thay `DESIGN.md`, không nhân bản token/primitive, và
không invent second design system.

---

## 1A. Product UX spine — gia đình route

Mục đích: agent biết *màn hình thuộc việc gì* trước khi chọn chrome / density /
archetype. Chỉ dựa Dual Thesis + ACL hiện có — không thêm persona nghiên cứu giả.

### Persona × việc × plane

| Persona (ACL) | Việc chính | Plane |
| --- | --- | --- |
| Chủ sở hữu (`owner`) | Oversight L0: tài chính, HR, kho tổng, menu, đơn hàng, settings | `control_surface` |
| Kế toán (`accountant`) | Slice Finance (+ `/me` cá nhân khi không gắn CN) | `control_surface` (+ employee trên `/me`) |
| Kho Tổng / Bếp TT | Inventory L0 + stock site trung tâm | `control_surface` + `branch_surface` (site) |
| Quản lý chi nhánh (`branch_manager`) | Ca CN, đội, kho CN, settings CN, ngoại lệ trong ngày | `branch_surface` |
| Thu ngân / Bếp / Runner | Bán hàng · chế biến · giao món | `station_chrome` |
| NV ngoài Branch (Kế toán / Kho / Văn phòng) | Chấm công, lịch, phép, hồ sơ, phiếu lương | employee (`/me/*`) |
| Khách / hệ thống auth | Self-order, HĐĐT, feedback QR, đăng nhập / từ chối truy cập | `public` |

Owner **không** dùng `/me`. Role ACL `owner` ≠ tên plane; UI gọi nửa L0 là
**Quản trị** / `control_surface`.

### Chỉ mục gia đình route (parent)

Mỗi hàng là *gia đình* — chi tiết màn con nằm ở §2.x được trỏ. Khi compose UI:
đọc hàng này → khóa plane → mở § chi tiết → rồi `page-archetypes.md` / UI block.

| Gia đình | Actor chính | Việc (job) | Entry → success → recovery | Show / hide (tóm tắt) | Archetype / exemplar |
| --- | --- | --- | --- | --- | --- |
| **Inventory** `/inventory/*` (+ stock CN ở Branch) | Owner, Kế toán (PO/GRN), Kho Tổng, Bếp TT; BM trên `/br/…/stock` | Quyết định tồn, chứng từ mua/nhập/SX/DC/kiểm/hao — không dashboard bán hàng | Vào hub/list đúng plane → hoàn thành phiếu (nháp→chốt) → lỗi recoverable qua retry/confirm; lệch tồn qua stocktake/waste | Hiện tồn, trạng thái phiếu, ngoại lệ; ẩn doanh thu POS, lương, giá mua trên mặt Kho (giá thuộc Finance) | Parent §2.5–2.6; LIST + D1 document (`AppDialog variant="document"`); Branch touch `branch-touch-list`. Exemplar GRN list: `/inventory/grn`; stock home CN: `/br/[branchId]/stock` |
| **Finance** `/finance/*` | Owner, Kế toán | Kết quả KD theo kỳ, AP/NCC, chi phí, ngân hàng, chỉ tiêu | Chọn kỳ/phạm vi → đọc công thức / xử lý ngoại lệ → drill `/revenue` `/expenses` `/equipment` `/bank-transactions` `/supplier-invoices` `/targets`; thiếu coverage → không bịa số | Hiện KPI công thức, tiền mặt, AP; ẩn POS/KDS, bảng công, tạo order | Parent §2.9 + §2.7; DASHBOARD `/finance`; REPORT exemplar `finance/revenue/page.tsx`; LIST AP §2.7 |
| **HR** `/hr/*` | Owner (admin HR L0) | Hồ sơ · thời gian · lương · quy tắc · phân quyền | `/hr` strip **Cần xử lý** (chỉ khi có việc) → tab/profile → attendance/payroll/setup; blocker preflight trước khi chốt lương | Hiện hồ sơ/công/lương tiếng Việt; ẩn KPI bán hàng/kho, raw `pay_basis` | Parent §2.8–2.8d; LIST + SETTINGS-PANEL. Exemplar hồ sơ: `/hr` client |
| **Branch operator** `/br/[branchId]/*` (trừ station) | BM, staff theo bottom-nav; Owner khi vào shell CN | Việc ca: hub → đội/kho/shift/settings CN | `/br/[id]` → đúng tab/workflow → duyệt/hoàn thành; deep link recovery về owning route | Hiện queue ca, readiness, stock touch; ẩn mosaic KPI L0, `DataTable` control_surface trên phone | Parent §2.4A; LANDING hub. Exemplar hub: `br/[branchId]/(operator)/page.tsx`; `/dashboard` = REDIRECT-SHIM |
| **Station** POS / KDS / Runner | Cashier / chef / runner (+ BM hỗ trợ) | Một việc realtime: bán · bump · served | Mở station → queue/cart sống → success bump/pay/serve → recall/retry khi lỡ | Hiện món/bàn/thời gian; ẩn giá (KDS/Runner), lương, tồn kho, báo cáo tháng | Parent §2.1–2.3; BOARD + blocks `pos-board` / `realtime-board` / `runner-board`. Exemplar: `pos/session-gate.tsx`, `kds/page.tsx`, `runner/page.tsx` |
| **Public** `/login`, `/access-denied`, `/q/*`, `/r/*` | Khách hoặc người chưa vào đúng surface | Auth gate, gọi món token, HĐĐT, feedback QR | Token/URL → một CTA chính → xong hoặc fail-closed; hết hạn → trạng thái rõ, không sửa tiếp | Hiện bước giao dịch khách; ẩn shell Quản trị/CN, DataTable, dữ liệu nội bộ | Parent §2.10–2.12; `PUBLIC-WORKFLOW` / GATE. Blocks `public-transaction`, `public-feedback`, `system-gate`. Exemplar self-order: `q/[token]/page.tsx` |
| **Employee** `/me/*` | NV company không gắn Branch (Owner denied) | Hub hồ sơ / lịch / phép / lương / chấm công / thông báo — không phải nơi làm việc hàng ngày | Avatar → `/me` hub → child (`/notifications` dùng feed chung); punch từ `/` hoặc `/me/clock` | Hiện dữ liệu của mình; ẩn chọn NV/CN, duyệt đội, CTA `/work`, module L0 không được cấp | Parent §2.4B; LANDING ItemGroup. Exemplar: `me/page.tsx` |
| **Settings** `/settings/*` (+ `/br/…/settings`) | Owner (L0); BM trên settings CN | Cấu hình ít đụng hàng ngày — không phải việc ca | LANDING settings → panel general/payments/printers; CN: bàn/POS/KDS/máy in | Hiện form cấu hình; ẩn KPI vận hành, queue bán hàng, tồn kho sống | Parent §2.11; LANDING + SETTINGS-PANEL. Exemplar L0: `settings/(tenant)/general/page.tsx`; printers LANDING: `settings/printers/page.tsx`; CN: `br/…/settings/page.tsx` |

Chi tiết inventory routing CN: [`branch-route-inventory.md`](./branch-route-inventory.md). Menu / Khuyến mãi / Orders / Branches / Feedback L0 là sibling `control_surface` — cùng spine Quản trị; không nhân bản bảng ở đây trừ khi màn có contract riêng trong §2. `/branches` chỉ quản lý Chi nhánh (`branch_kind=branch`); không liệt kê Kho Tổng hay Bếp Trung Tâm.

---

## 2. Màn hình cốt lõi

### 2.1. POS — `/br/[branchId]/pos`

- **Gia đình:** Station (spine §1A); block `pos-board`. Entry mở ca/session-gate
  → chọn món → thanh toán/in → success; recovery: lịch sử đơn (không sửa cart
  đã gửi), đóng ca khi lệch tiền.
- **Archetype:** `BOARD`.
- **Actor:** `cashier`; `branch_staff` (Phục vụ) gần-thu-ngân; `branch_manager` / `owner` khi hỗ trợ.
- **Job:** Ghi đơn đúng, thu tiền đúng, đẩy KDS; kiểm soát ca & tiền mặt két.
- **Goal:** Order → thanh toán → in hóa đơn dưới ~30s.
- **Workflow:** Mở ca (tiền đầu) → chọn món/modifier → hình thức phục vụ → gửi KDS → thanh toán (tiền mặt/VietQR, mã giảm nếu có quyền) → kết ca & đối chiếu `cash variance`.
- **Ưu tiên data:** Grid món + cart + trạng thái in/két + CTA thanh toán touch. **Không:** báo cáo tháng, ca khác, lương, tồn nguyên liệu, chuông thông báo trên board. Hết món / duyệt hủy khi không đang bán: Cổng **Đơn bán** (`/br/{id}/orders`).
- **UX:** Mobile/tablet touch `≥44px`. Cart chỉ tạo đơn mới; sửa sau gửi/thanh toán qua Lịch sử đơn. **In tạm tính** chỉ Thu ngân / Quản lý / Chủ sở hữu — Phục vụ không thấy nút và server từ chối. **Đơn hoàn thành:** tìm theo số đơn hoặc mã thanh toán; đơn tiền mặt đã thu có thể đổi sang VietQR (`pos:confirm_payment`) rồi in mã QR thanh toán; đảo VietQR→tiền mặt ở Tài chính. **Giới hạn bán** (cùng drawer với `/menu-limits`) mở từ header POS, chỉ `branch_manager` và `owner` — chỉnh trần bán, cho phép bán thêm, bật/tắt món.

---

### 2.2. KDS — `/br/[branchId]/kds`

- **Gia đình:** Station (spine §1A); block `realtime-board`. Entry ticket realtime
  → bump ready → success; recovery: recall khi bump nhầm (không skeleton giả).
- **Archetype:** `BOARD`.
- **Actor:** `chef` / NV bếp.
- **Job:** Nhận ticket realtime từ POS; đúng món, đúng thứ tự; giảm sai/lãng phí.
- **Goal:** Biết món ưu tiên + số lượng; bump `ready` nhanh.
- **Workflow:** Ticket realtime → xếp theo thời gian/ưu tiên → gộp công suất → bump → Gọi số / in bill; `recall` nếu nhầm.
- **Ưu tiên data:** Thẻ order (món, SL, chờ, bàn/mã). **Không:** giá, PTTT, doanh thu, nút quản trị.
- **UX:** Tương phản cao/dark. Không skeleton giả; chỉ `PageSpinner` khi chưa có data thật.

---

### 2.3. Gọi số (`pickup_display`) — `/br/[branchId]/pickup`

- **Gia đình:** Station (spine §1A); block `runner-board`. Entry món ready →
  giao đúng bàn → served; recovery: chỉ giữ cửa sổ ngắn vừa giao, không lịch sử dài.
- **Archetype:** `BOARD`.
- **Actor:** Khách tại quán + shipper giao hàng (public read-only).
- **Job:** Nhìn số/bàn/đơn đã sẵn sàng để nhận món — không phải workflow nhân viên runner ghép đĩa.
- **Goal:** Biết đơn nào sẵn sàng lấy; tự nhận hoặc shipper lấy đúng mã.
- **Workflow:** Màn hình công khai cập nhật realtime → khách/shipper đối chiếu số/bàn → nhận món tại quầy.
- **Ưu tiên data:** Số đơn / bàn / trạng thái sẵn sàng, chữ lớn. **Không:** giá, kho, thao tác staff, lịch sử ca.
- **UX:** Chữ lớn (~2m), light mode; không nav nhân viên. Thiết bị chính:
  Android TV. Không dùng iPad.

---

### 2.4. Branch Dashboard — `/br/[branchId]/dashboard`

- **Archetype:** `REDIRECT-SHIM` → `/br/[branchId]` (Hôm nay).
- **Actor:** legacy deep links / bookmarks only.
- **Job:** Không còn cockpit riêng; ngoại lệ ngày sống trên hub §2.4A.
- **Note:** `/dashboard` chỉ còn chuyển hướng về Hôm nay. Hàng đợi `Cần xử lý` đọc `fetchBranchQueueCounts`. Buồng lái cũ đã xóa; cửa còn lại nằm trên tab **Công cụ** (`/settings`).

---

### 2.4. control_surface — `/`

- **Archetype:** `LANDING` (queue-first, ADR 0037).
- **Actor:** `owner`, `accountant`, `central_supply_ops`, `central_kitchen_lead`, và `self_service` có `self:access`. Role chi nhánh giữ `/br/...`.
- **Job:** «Hôm nay / Cần xử lý» — việc đang thiếu theo ACL, rồi deep-link vào mô-đun.
- **Goal:** Một cửa → xử lý việc hôm nay; vào mô-đun từ sidebar.
- **Ưu tiên data:** Hàng đợi `Cần xử lý` (counts + deep-link) trước; khi `count === 1` và bucket có DETAIL thì mở chứng từ (Finance / GRN / Việc). HR duyệt, PO, in, hoàn tiền giữ LIST. Office: `AppTodayCommandBar` trên hàng đợi khi cần chấm công. **Không** lưới Điều hành / Nền tảng / Phân hệ; **không** KPI mosaic / doanh thu trên `/`; **không** Kanban phòng ban; Owner không thấy thanh chấm công.
- **UX:** `AppPage` + `AppTodayCommandBar` (office) + một `AppSection` `Cần xử lý` + `ItemGroup` + `Item` + `Badge`. Empty: `Không có việc cần xử lý ngay` — sidebar/drawer vẫn vào mô-đun. 1 cột phone.

### 2.4A. Trung tâm vận hành Chi nhánh — `/br/[branchId]`

- **Gia đình:** Branch operator (spine §1A). Entry hub → chọn tab/trạm/workflow
  → hoàn thành duyệt hoặc việc kho; recovery = quay đúng owning route (không
  nhảy L0 Finance/HR).
- **Archetype:** `/br/[branchId]` dùng `LANDING`; `/shift` là màn ngày làm việc cá nhân; `/team` là `LIST` hub 2 tab peer (`Ca hôm nay` · `Nhân viên`) tối ưu phone. Phân ca / Chấm công / Duyệt kết ca / Duyệt nghỉ phép là full route dưới `/team/*` (mở từ strip công cụ trên board hoặc deep link); bookmark `/shift/*` cũ là Class C shim. **Entry** Phân công đếm + Phiếu đếm trên landing **Kho** (`/stock/count-assignments`, `/stock/count-slips`) — không trên Đội.
- **Đối tượng sử dụng chính:** Nhân viên trong ca, Quản lý chi nhánh (`branch_manager`) và Chủ cửa hàng (`owner`) theo đúng phạm vi từng tab.
- **Mục tiêu Nghiệp vụ (Why?):** Cho người vận hành đi từ việc cần xử lý đến đúng trạm hoặc đúng workspace trong một viewport ngắn.
- **Inventory plane:** mọi `page.tsx` dưới `/br/[branchId]` (class A / A- / B / C / D / E, Owner wrapper, shim, backlog fork) nằm ở [`branch-route-inventory.md`](./branch-route-inventory.md) — không nhân bản 66 dòng tại đây.
- **Quy chuẩn UX/UI:**
  - Bottom nav **chi nhánh** (`branch_kind=branch`) theo vai trò:
    - Nhân viên (`cashier` / `chef` / `branch_staff`): `Hôm nay` · `Ca` · `Lịch ca` · `Hồ sơ`.
    - Quản lý (`branch_manager`): `Hôm nay` · `Ca` · `Đội` · `Kho` · `Công cụ`. Owner vào shell CN: không tab `Ca` (`Hôm nay` · `Đội` · `Kho` · `Công cụ`). Tab **Kho** land `/stock` = cửa hàng hóa ngày (tồn / YCH / kiểm kê / hao / **đếm tồn**) rồi list phiếu giao nhận. Catalog / báo cáo / ngưỡng tồn vào **Công cụ**. Không Tiêu Hao SX. Badge queue live.
    - Chuông = unread inbox. Tab **Công cụ** (`/settings`) là cửa thật: Gọi số, Đối soát ca POS, Giới hạn bán (trang), **Báo cáo tổng hợp ngày** (Daily Summary 04:00: kết quả + món + ca POS drill + bấm ca; không Chốt ngày), Phản hồi, danh mục/báo cáo kho, thiết lập bàn/POS/KDS/máy in. Header `⋯` chỉ Owner → Quản trị + theme. Giới hạn bán vẫn CTA Drawer trên Hôm nay. Avatar header vẫn mở Hồ sơ.
  - Hub CN thứ tự: trạng thái ca (Ngày kinh doanh; ẩn khi `not_required`; CTA việc trong ca khi còn việc) → **Chỉ tiêu doanh thu** (manager-like; tháng | ngày KD 04:00; chấm mốc + nhãn Đã đạt/Chưa đạt) → **Cần duyệt** (khi > 0; preview + Xem thêm) → trạm **POS** / **KDS** (2 cột phone) → hàng **Giới hạn bán** + **Đơn hàng**. QL/Owner không Gọi số trên home (cửa **Công cụ**). Nhân viên: Gọi số là ô trạm 2, **Đơn hàng** hàng hai. Queue **không** GRN/SX (D093). **Giới hạn bán** là một `AppDrawer` (home + `/menu-limits` + header POS cho QL/Owner); Trần bán = nhập số, Cho phép bán thêm = Switch. Chỉ `branch_manager` và `owner` thấy và áp dụng.
  - **Exception hẹp (manager-like CN):** panel Doanh thu tháng | ngày + tiến độ chỉ tiêu với chấm mốc thưởng (sau trạng thái ca, trước queue). Cashier/chef/staff không thấy. Hub trung tâm không hiện doanh thu. Không badge chỉ tiêu trên hàng Đơn hàng.
  - `Ca` sở hữu ngày làm việc cá nhân (CN). Chấm công mở từ 60 phút trước giờ bắt đầu ca đã xếp (không nhầm thành chưa phân ca); việc trong ca nhóm **Đầu ca** / **Cuối ca** (ảnh minh chứng bắt buộc khi bật); Kết ca một thao tác trên cùng trang, chờ quản lý duyệt, tự chốt sau 2 giờ nếu quên. `Lịch ca` hiện ca đã xếp trên từng ngày lưới (không danh sách phụ); xin nghỉ gửi ngay trong ngăn ngày đã chọn. Owner không thấy tab này; truy cập trực tiếp route gốc chuyển về `Đội`. Nhân viên: `/shift/schedule` và `/profile` là tab riêng; QL giữ lịch dưới shortcut trong `Ca` + avatar.
  - `Đội` mở hub 2 tab (`Ca hôm nay`, `Nhân viên`). Trên board: panel **Cần duyệt** chỉ Duyệt kết ca / Duyệt nghỉ khi có pending; panel **Quản lý đội** luôn hiện Phân ca / Chấm công. Workflow sâu gắn bottom-nav Đội qua `/team/roster|attendance|checkout-approvals|leave-approvals` (shim `/shift/*` vẫn highlight Đội).

---

### 2.4B. Trang cá nhân — `/me/*`

- **Gia đình:** Personal plane (spine §1A). Avatar → `Trang cá nhân` → hồ sơ / lịch / phép / phiếu lương / thông báo. **Không** phải nơi đăng nhập; **không** phải hub việc hôm nay.
- **Archetype:** `LANDING` hub (profile-first). Chấm công giữ `/me/clock`, mở từ thanh lệnh trên `/`.
- **Đối tượng sử dụng chính:** Kế toán, Kho Tổng, Bếp Trung Tâm và nhân viên Văn phòng. Nhân viên cửa hàng tiếp tục `/br/[branchId]/shift/*` và `/br/[branchId]/profile/*`. Owner không dùng `/me`.
- **Mục tiêu Nghiệp vụ (Why?):** Một nơi tài khoản cá nhân mà không cấp quyền giả vào Tài chính, Kho hoặc Nhân sự.
- **Mục tiêu Người dùng (Goal):** Mở đúng hồ sơ / lịch / phép / lương / thông báo trong một đến hai thao tác.
- **Luồng thao tác:**
  1. Đăng nhập vào `/` (kể cả `self_service`).
  2. Avatar Footer → `Trang cá nhân` → `/me`.
  3. `/me` là hub liên kết `/me/profile`, `/me/schedule`, `/me/schedule/leave`, `/me/payslip`, `/notifications`; chấm công từ `/` hoặc `/me/clock`. Kết quả nghỉ phép / kết ca mở đúng `/me` (nhân viên cửa hàng hydrate sang `/br/{id}/shift/*`).
  4. Việc đến hạn nằm trên hàng đợi `/`, không CTA Work trên `/me`.
- **Thông tin hiển thị:** Hồ sơ, lịch của chính nhân viên, trạng thái phép, phiếu lương đã phát hành. **Không** stepper ngày làm việc, **không** danh sách việc Work, **không** duyệt đội.
- **KHÔNG hiển thị:** Chọn nhân viên, chọn Branch/site, hàng duyệt, quyền tài khoản của người khác, KPI bán hàng/kho.
- **Quy chuẩn UX/UI:**
  - `/me` ngang cấp `/inventory` / `/finance` / `/hr` nhưng không phải tab mô-đun; vào từ Avatar Footer.
  - Control Surface shell. Không bottom-nav `Phân hệ` rỗng khi không có mô-đun.
  - Không dashboard, KPI, hero, shell hoặc theme riêng. Punch error/offline/camera giữ copy phục hồi trên `/me/clock`.

---

### 2.4C. Công việc — `/work/*`

- **Gia đình / plane:** `control_surface` (ADR 0033). Cùng shell với `/finance` ·
  `/inventory` · `/hr` — không app/host riêng.
- **Archetype:** `/work` Inbox = `LIST` (queue); `/work/tasks/[id]` = `DETAIL`;
  `/work/projects` + `/work/team` = `LIST`; `/work/projects/[id]` = `DETAIL`;
  `?view=board` = compose `TASK_BOARD`; `?view=calendar` = `TASK_CALENDAR`;
  `?view=timeline` = `TASK_TIMELINE`. **Không** dùng archetype `BOARD` /
  `station_chrome` (KDS/POS).
- **Actor:** Thành viên `work_*` (membership) + Owner (`work:manage`). Candidate
  ACL `work` chỉ là cửa vào; RLS/RPC là authority.
- **Job:** Việc được giao / theo dõi liên phòng ban; sau đó board/calendar/
  timeline theo scope một phòng hoặc một dự án.
- **Goal:** Mở Inbox → đúng việc → đổi trạng thái / comment; lead mở board một
  scope — không tường Kanban cả công ty trên `/`.
- **Ưu tiên data:** Tên việc, trạng thái, người, hạn, dự án/phòng. **Không:**
  số tiền, tồn kho, lương; không trộn `position_shift_tasks` (Việc trong ca).
- **UX:** View switcher URL `view=`; filter trên URL; desktop primary cho board;
  mobile board = tab trạng thái + list. Copy: **Việc được giao** ≠ **Việc trong ca**.
- **SSOT:** ADR 0033; compose `docs/spec/page-archetypes.md` TASK_*.

---

### 2.4D. Khuyến mãi — `/promotions`

- **Gia đình / plane:** `control_surface` (ADR 0039). Owner-only catalog.
- **Archetype:** `/promotions` = `LIST`; `/promotions/new` và `/promotions/[id]` =
  `DOC-WORKFLOW` (kind-first sections).
- **Actor:** `owner` (`promo:read` / `promo:write` / `promo:issue`).
- **Job:** Tạo chiến dịch và mã (kể cả miễn phí ăn kèm và tặng món trên đơn);
  POS thu ngân/phục vụ nhập `Mã giảm` hoặc chọn ăn kèm từ offer tự động (`pos:use`).
  Khách QR gọi món tự nhập mã `order_pct` / `order_vnd` / `voucher_face` trên hoá đơn.
- **Ưu tiên data:** Tên, loại, trạng thái, mã, món điều kiện / ăn kèm tặng / món tặng.
  **Không:** CRM, loyalty, SKU voucher, xác minh Google review.
- **POS:** Chiết khấu thủ công = `pos:apply_discount`; tiền vẫn ghi cột discount
  hiện có (ADR 0034). `free_side` = N phần ăn kèm **/ phần món chính**; auto khi
  mỗi dòng chỉ một ăn kèm get, StationSheet khi nhiều lựa chọn get / dòng.
  `free_item` = nhân viên chọn số phần món **đã có trên hoá đơn** / đơn (tối đa
  `free_item_qty` hoặc không giới hạn); chỉ nhập mã; luôn mở StationSheet.
  Dòng món có chiết khấu hiện giá gốc gạch + net + `Chiết khấu món: -X`.

---

### 2.5. Kho hàng — `/inventory` & `/br/[branchId]/stock`

> On-hand exemplar context (tests may cite as comment only) — giữ section này.
> **Document gold bar** (control_surface): stock dialog + PO + GRN — title +
> `StatusBadge`; first viewport = tồn/trạng thái/công việc hiện tại (qty,
> ngưỡng, lần đếm hoặc dòng phiếu); WAC/giá trị và audit/`Lịch sử`/phiếu nhập
> liên kết nằm sau tab. Footer = Close → overflow → **một** CTA chính.
> Kho Tổng/Bếp TT không thấy tab Giá trị trên overlay tồn; Owner/Kế toán xem
> WAC sau nếp gấp. Compose: `docs/spec/page-archetypes.md` DETAIL.

- **Gia đình:** Inventory (spine §1A). Entry → success → recovery ở mức phiếu:
  mở list/hub đúng plane → nháp/kiểm nhận → chốt chứng từ; lệch/hủy qua dialog
  xác nhận hoặc vòng kiểm kê/hao hụt — không sửa tồn bằng UPDATE thô.
- **Planes (ADR 0012 / 0018):** Owner/Accountant/Kho Tổng/Bếp TT dùng
  `/inventory/*` (control_surface); operator stock của chi nhánh dùng
  `/br/[branchId]/stock/*`. Central roles bị khóa site theo JWT `branch_id` và
  dùng `/me/*` cho công việc cá nhân/chấm công.
- **Hợp đồng từng màn** (route / load / hiển thị / submit / hiện vs mục tiêu): §2.5A — không mở wiki song song.
- **Archetype:** `/inventory` dùng `LANDING` (queue-first `Cần xử lý` rồi lane chứng từ, danh mục dưới); `/br/[branchId]/stock` dùng `LANDING`; `/inventory/stock`, `/inventory/purchase-requests`, `/inventory/purchase-orders`, `/inventory/grn`, `/inventory/production`, `/inventory/menu-recipes`, `/inventory/consumption`, `/inventory/issues`, `/inventory/transfers`, `/br/[branchId]/stock/on-hand`, `/br/[branchId]/stock/issues`, `/br/[branchId]/stock/consumption`, `/br/[branchId]/stock/count-assignments`, `/br/[branchId]/stock/count-slips`, và `/br/[branchId]/stock/waste-approvals` là `LIST` nhưng khác presentation plane. `/inventory/transfers/new` và `/inventory/stock-requests/new` là `DOC-WORKFLOW`; `/inventory/waste/new` là `DOC-WORKFLOW`; `/inventory/issues` redirect vào `/inventory/consumption?view=waste`; `/inventory/supplier-invoices` là `REDIRECT-SHIM` (→ `/finance/supplier-invoices`, ADR 0018). `/inventory/operations` đã rút. Owner GRN và production detail là D1 document trên LIST (`/inventory/grn/[id]` và `/inventory/production/[id]` / `/new` = `REDIRECT-SHIM`). Branch GRN/consumption/issue detail thuộc `DETAIL`; form phiếu hao hụt Branch thuộc `DOC-WORKFLOW`; `/br/[branchId]/stock/reports` là Branch touch `REPORT` theo tín hiệu từng nguyên liệu.
- **Đối tượng sử dụng chính:** `/inventory` dành cho Chủ cửa hàng (`owner`),
  Kế toán, `central_supply_ops` và `central_kitchen_lead`; `/br/[branchId]/stock`
  dành cho `branch_manager` — plane touch, action bị permission giới hạn.
- **Mục tiêu Nghiệp vụ (Why?):**
  - Kiểm soát chính xác số lượng nguyên liệu tồn kho thực tế, tính toán giá vốn hàng bán (WAC), giảm thiểu hao hụt/thất thoát nguyên liệu và tối ưu hóa chi phí mua hàng.
- **Mục tiêu Người dùng (Goal):** Nhìn tồn để quyết định đúng việc cần làm, nhập kho nhanh và tạo lệnh sản xuất không sai lệch.
- **Luồng thao tác (Workflow):**
  - **Yêu cầu mua:** Kho trung tâm ghi nhu cầu mua ngoài; một yêu cầu có thể
    tạo nhiều đơn đặt hàng theo NCC.
  - **Đơn mua hàng:** Kế toán/Owner tạo từ Yêu cầu mua và duyệt. PO không chứa
    giá. Mỗi PO thuộc đúng một NCC và tạo GRN theo từng lần giao.
  - **Nhập kho:** `/inventory/grn` là hàng đợi **Chờ nhập hàng**. Mở GRN được
    tạo từ PO, kiểm nhận vật lý, nhập **Đơn giá** net, lưu nháp rồi xác nhận
    để cập nhật tồn và WAC.
  - **Sản xuất:** `/inventory/production` là LIST hai tab (Lệnh / Công thức). Tạo lệnh bằng `FormDialog`; mở lệnh bằng `AppDialog variant="document"` (`?runId=&mode=`). Công thức CRUD bằng `FormDialog`; BOM hơn 12 dòng escalate `AppSheet` (`?recipeSpecId=`). Chọn công thức đang dùng và sản lượng (kèm tồn/sản lượng tối đa) -> tạo lệnh snapshot tại Bếp TT; kho xuất/nhập lấy mặc định, không bắt chọn lại “Bếp và vị trí” -> Bắt đầu -> Nhập thực dùng và sản lượng thực tế -> Hoàn thành tại Bếp TT -> Điều chuyển riêng nếu cần giao chi nhánh.
  - **Định mức món bán:** `/inventory/menu-recipes` là LIST mọi `menu_item` đang bán. Hàng = phủ định mức + giá vốn/phần theo WAC Kho gốc (Nguồn hàng), không phải `Giá vốn món` đã ghi sổ. BOM chỉ trong `FormDialog`. Món chưa có định mức phải nhìn thấy khi POS đang trừ kho.
  - **Kiểm kê (Stocktake):** Mở phiên → đếm số đang có (không hiện sổ) → đối soát lệch → hoàn tất để ghi tồn. Nhân viên được giao trong ca dùng **Đếm tồn** (phiếu đếm, không tự sửa tồn).
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
  - Chi tiết phân vai: `docs/ref/inventory.md`.
  - `/br/[branchId]/stock` là **stock home** CN: 4 cửa hàng hóa (tồn / YCH / Kiểm kê / hao) **trên**, list phiếu fulfillment **dưới**. Không đặt Phân công đếm / Phiếu đếm làm cửa Kho (entry từ Đội). `/stock/transfer` store → redirect `/stock`. Pad nhận `/receive/[id]` tự mở phiên kiểm nhận khi `in_transit` (hiện danh sách đếm ngay, không splash CTA). YCH CN: tiến độ 4 bước (Gửi yêu cầu → Đã duyệt → Giao hàng → Xác nhận); không hiện chuẩn bị Kho Tổng/Bếp TT; chi tiết thao tác chỉ bước 1 và 4.
  - `/br/[branchId]/stock/on-hand` là LIST tồn touch-first. Attention theo `branch_kind`. Không Tiêu Hao SX trên primary CN.
  - `/br/[branchId]/stock/on-hand/[ingredientId]` là `DETAIL` touch-native: tồn/trạng thái → vị trí → biến động → ngưỡng; primary CTA kind-aware trên sticky footer; secondary trong `DropdownMenu`; back → on-hand. Không WAC/audit/control_surface chrome. `/stock/receive` chỉ dành cho phiếu chuyển nội bộ.
  - Branch `/br/[branchId]/stock/grn` ưu tiên nháp của người đang nhận hàng, sau đó là hàng đợi GRN có tìm kiếm/lọc trạng thái. Mỗi row chỉ hiển thị mã, NCC, ngày và trạng thái; chạm để tiếp tục/xem phiếu, bỏ nháp là action riêng có xác nhận. Không đưa tổng tiền, tên chi nhánh, `DataTable` hay long-press từ control_surface sang route này.
  - Branch `/br/[branchId]/stock/grn/new` và `/br/[branchId]/stock/grn/new/[supplierId]` chỉ là redirect tương thích: chi nhánh thường về Yêu cầu hàng; Kho Tổng/Bếp TT về Yêu cầu mua. Không tạo phiếu nhập ngoài PO.
  - Branch `/br/[branchId]/stock/grn/[id]` giữ review/receipt native: nháp cho phép kiểm nhận, thêm/sửa dòng trong bottom sheet rồi lưu/chốt; phiếu đã chốt chỉ hiển thị biên nhận và các dòng thực nhận. Không đưa audit, sửa sau chốt, stock correction, hóa đơn NCC, hoặc `GRNDetailClient` control_surface vào Branch.
  - Branch `/br/[branchId]/stock/stocktake` là `LIST` touch-native cho phiên kiểm kê của quản lý chi nhánh: ưu tiên phiên đang thực hiện, sau đó là lịch sử theo trạng thái. Không dùng `DataTable`, long-press drawer, branch picker, audit, hay action control_surface; `/stock/count` vẫn là phiếu đếm được giao riêng cho nhân viên.
  - Branch `/br/[branchId]/stock/stocktake/new` là `DOC-WORKFLOW` touch-native: URL khóa chi nhánh, kho warehouse mặc định, action sticky **Bắt đầu đếm** rồi sang count. Không chọn 5 chế độ daily/weekly/…, không lặp selector đổi chi nhánh hoặc `DocumentFormFrame` control_surface.
  - Branch `/br/[branchId]/stock/stocktake/[id]/count` là `DOC-WORKFLOW` đếm số đang có: first viewport là nguyên liệu đang đếm, đơn vị ghi nhận, number pad và lưu/đi tiếp; draft, zone lock và submit round giữ authority Server Action/RPC hiện có. Không tải hay hiển thị số tồn hệ thống trước khi phiên hoàn tất, và không đổi tablet thành bảng control_surface.
  - Branch `/br/[branchId]/stock/stocktake/[id]` là `DETAIL` touch-native: phiên đang thực hiện chỉ review tiến độ đếm và action tiếp tục/chốt theo quyền; khi hoàn tất mới hiển thị hệ thống, thực đếm và chênh lệch theo từng nguyên liệu. Không đưa audit history, report CTA, WAC, giá trị tồn hoặc control_surface detail chrome vào Branch.
  - Branch `/br/[branchId]/stock/issues` là `LIST` touch-native cho phiếu hao
    hụt (`writeoff`) đã tạo: scope chi nhánh chỉ lấy từ URL; tạo hao hụt mới
    qua `/stock/waste`, không picker `other`. Không lặp branch picker, tổng giá
    trị, export, `DataTable` hoặc audit control_surface.
  - Branch `/br/[branchId]/stock/issues/[id]` là `DETAIL` touch-native: nháp cho thêm/sửa/xóa một dòng nguyên liệu bằng bottom sheet, bắt buộc lý do và kiểm tra số lượng theo đơn vị đã chọn trước khi gọi Server Action; chốt/hủy là action sticky có xác nhận. Phiếu cuối chỉ đọc; WAC, giá trị, audit và correction thuộc control_surface.
  - Branch `/br/[branchId]/stock/consumption` là `LIST` touch-native với hai view tách bạch: ledger tiêu hao đã ghi và chứng từ thủ công cần rà soát. Row giữ loại nguồn (`pos`, `manual`, `hrm`, `import`, `other`), trạng thái và thời điểm; `/stock/consumption/[id]` chỉ mở detail đúng loại tiêu hao. Không import presenter control_surface hoặc đổi thành bảng desktop ở tablet.
  - Branch `/br/[branchId]/stock/count-assignments` và `/stock/count-slips` là hai `LIST` touch-native riêng cho quản lý (route stock, **entry từ Đội**): màn phân công nhóm nguyên liệu theo nhân viên; màn phiếu đếm review từng chênh lệch rồi duyệt/yêu cầu đếm lại trong bottom sheet có action sticky. Tồn sổ / thực đếm / lệch cùng đơn vị nhân viên chọn. Khác `/stock/stocktake` (phiên Kiểm kê). Không dẫn quản lý vào phiếu đếm cá nhân của chính họ và không dùng client control_surface.
  - control_surface `/inventory/count-assignments` và `/inventory/count-slips` giữ management list desktop-responsive bằng `DataTable`; chỉnh phân công và review dòng phiếu mở trong `AppDialog` với action hiển thị rõ. Không dùng swipe, long-press, drawer hoặc presenter Branch.
  - Branch `/br/[branchId]/stock/reports` là `REPORT` touch-native: branch URL và tháng hiện tại khóa phạm vi; first viewport là chênh lệch tiêu hao warning/critical, sau đó là các nguyên liệu biến động nhiều nhất. Mỗi quantity giữ nguyên unit của nguyên liệu và row chạm vào tồn thực tương ứng. Không đưa biểu đồ, KPI/tổng quantity chéo đơn vị, công nợ NCC, giá vốn, branch/date picker, export, `DataTable`, audit hoặc presenter control_surface vào phone/tablet.
  - Branch `/br/[branchId]/stock/waste` là `DOC-WORKFLOW` touch-native: vị trí kho và cảnh báo cap ở màn chính, danh sách dòng hao hụt chỉ hiển thị nguyên liệu, số lượng/đơn vị, tier và giá trị dự kiến; mỗi dòng sửa trong bottom sheet để giữ ngữ cảnh tồn, lý do và bằng chứng. URL khóa branch, không dùng branch picker, `DocumentFormFrame`, `DataTable`, header/toolbar control_surface, audit hoặc tổng quan chi phí control_surface. Server Action/RPC vẫn là authority cho WAC, tồn, tier và approval.
  - Branch `/br/[branchId]/stock/waste-approvals` là `LIST` touch-native: queue chỉ hiển thị phiếu chờ duyệt của branch URL, giá trị, người tạo, thời điểm, ca, số dòng và tier cao nhất; chạm một phiếu mở bottom sheet chứa dòng, lý do, ảnh bằng chứng và ghi chú duyệt. Phiếu do chính người dùng tạo vẫn xem được nhưng không có action; approve/reject xác nhận trước khi gọi Server Action hiện có. Không dùng branch picker, `DocumentFormFrame`, `DataTable`, control_surface card presenter, audit/export hoặc dữ liệu cross-branch.
  - Mọi hành động làm thay đổi số lượng tồn kho (Nhập, Xuất, Điều chuyển, Kiểm kê) bắt buộc phải tạo ra một dòng chứng từ `stock_movements` (chỉ ghi thêm - append-only) để phục vụ việc kiểm toán dữ liệu. Nghiêm cấm việc thay đổi trực tiếp số lượng tồn kho bằng lệnh UPDATE thô trong DB.

### 2.5A. Hợp đồng từng màn Inventory

Mỗi hàng = `page.tsx` (shim gộp vào cha). Adapter L0: `AppPage` / `DataTable` / `AppDialog variant="document"` / `FormDialog`. Branch: `BranchOperatorPage` + touch/`AppSheet`. Nguồn: `apps/web/app/(protected)/inventory/**` và `/br/[branchId]/(operator)/stock/**`. **Khóa:** mua chỉ PO; phiếu nhập ghi **Đơn giá**; HĐ NCC công nợ; một loại Điều chuyển (CN hai chiều); ẩn YCM + Yêu cầu hàng; hub = Điều chuyển; không drop bảng/RPC Wave này.

| Lane | Route (archetype · components) | Load → hiển thị → submit | Hiện → mục tiêu |
| --- | --- | --- | --- |
| Landing | `/inventory` LANDING · `AppSection` `Item` `AppLinkCard` | Đếm GRN/Đơn giá/Yêu cầu hàng/DC/hao → `Cần xử lý` + lane → chỉ điều hướng | Tách Yêu cầu hàng vs Điều chuyển + **Chờ đơn giá** → ẩn YCM/YCH |
| Landing | `/br/[branchId]/stock` LANDING · cửa + hub | Tile `branch_kind` + fulfillment → 4 cửa rồi list phiếu → mở phiếu | Cửa YCH → DC hai chiều; ẩn list YCH |
| Tồn | `/inventory/stock` LIST+D1 · `DataTable` `AppDialog` (`[id]` shim `?ingredientId=`) | `loadStockOnHandPageData` → tồn/Đơn vị chuẩn/ngưỡng; WAC sau nếp → điều chỉnh dialog | Giữ; Nguồn hàng ≠ vị trí tồn |
| Tồn | `/br/…/stock/on-hand` LIST + `[id]` DETAIL | Tồn site → cảnh báo, không WAC → CTA kind-aware / `AppSheet` | CTA YCH → tạo DC |
| Catalog | `/inventory/ingredients` LIST · `FormDialog` | `fetchIngredients`+đơn vị → kind, Nguồn hàng, Đơn vị chuẩn, Giá tham chiếu đọc → `save_ingredient_catalog` | Giữ form neo/TP; TP không mua; Nguồn hàng tick Kho Tổng và/hoặc Bếp TT (OD-4) |
| Catalog | `/inventory/suppliers` + `/[id]/items` LIST | NCC + `supplier_items` → gán NL/NCC ưu tiên → CRUD / gán | Catalog, không giá HĐ |
| Catalog | `/inventory/menu-recipes` LIST · `FormDialog` | Định mức + WAC công ty → phủ BOM → CRUD dòng | Giữ; không Giá vốn món đã ghi |
| Catalog | `/inventory/settings/*` SETTINGS (`/` và `/recipes` shim) | units/categories/`min_stock_level` → registry → CRUD | Neo trên form NL |
| Catalog | `/br/…/stock/catalog*` LANDING/LIST đọc | Cùng loader L0 → tra cứu → không ghi | CRUD Owner L0 |
| Mua | `/inventory/purchase-orders` LIST+D1 · tabs `AppDialog` ( `/purchase-requests` shim `tab=needs`) | **Tạo đơn** không YCM + tab Yêu cầu mua → `create_purchase_order` / `save_purchase_demand` / duyệt / gửi-đóng PO | Ẩn YCM+Phân bổ sau Wave 4 |
| Mua | `/br/…/stock/purchase-requests` LIST | Nhu cầu site → YCM → tạo nhu cầu | Ẩn khi PO-only |
| Nhập | `/inventory/grn` LIST+D1 (`[id]`/`new*` shim) | `loadGrnListPageData` → mã/NCC/trạng thái → SL, từ chối, **Đơn giá**, `grn_confirm` | **Chờ đơn giá**; HĐ không định giá |
| Nhập | `/inventory/supplier-invoices` shim | — | → `/finance/supplier-invoices` AP |
| Nhập | `/br/…/stock/grn` LIST + `[id]` DETAIL (`new*` shim) | Nháp người nhận → mã/NCC/ngày; kiểm nhận+Đơn giá → lưu/chốt | CN `branch` không tile GRN |
| Giao nhận | `/inventory/transfers` LIST hub · `DataTable` | `loadStockFulfillmentRows` → filter `work=` → fulfill/ship | Hub YCH+DC → chỉ DC |
| Giao nhận | `/inventory/transfers/new` DOC · `[id]` DETAIL | Site+NL / phiếu DC → tạo/xem → `stock_transfer_*` | Một loại DC |
| Giao nhận | `/inventory/stock-requests*` shim/DOC/DETAIL | NL nguồn Kho Tổng → YCH + DC liên kết → `stock_request_*` | Ẩn; DC hai chiều |
| Giao nhận | `/br/…/stock/transfer*` `/receive*` `/requests*` | Fulfillment / DC `in_transit` / YCH 4 bước → tạo/gửi/nhận | Ẩn YCH; CN tạo DC; nhận trên DC |
| SX | `/inventory/production` LIST 2 tab (`/new` `[id]` shim) | Runs+recipes → Lệnh/Công thức → tạo/bắt đầu/hoàn thành | TP không PO/GRN |
| SX | `/br/…/stock/production*` shim | — | CN không SX |
| Hao | `/inventory/consumption` LIST · `/[id]` DETAIL (`/issues` shim waste) | Ledger+phiếu → nguồn pos/manual → chốt/hủy | Giữ tách tiêu hao vs hao |
| Hao | `/inventory/waste/new` DOC · `/approvals` LIST | Cap + queue → dòng/lý do/ảnh/tier → tạo/duyệt | Giữ 4-eye |
| Hao | `/br/…/stock/consumption*` `/issues*` `/waste*` | Ledger/HH/cap site → không WAC → tạo/chốt/duyệt | Tạo HH qua `/waste` |
| Kiểm kê | `/inventory/stocktake*` LIST/DOC/DETAIL | Phiên + `get_stocktake_lines_blind` → đếm mù rồi lệch → `complete_stocktake` | Không 5 mode |
| Kiểm kê | `/inventory/count-assignments` `count-slips` LIST | Giao việc/phiếu đếm → chênh lệch → duyệt/đếm lại | Branch entry **Đội** |
| Kiểm kê | `/br/…/stock/stocktake*` `/count*` | Phiên site / phiếu giao → đếm mù → nộp/chốt | Phiếu đếm không cửa Kho |
| Báo cáo | `/inventory/reports` REPORT · `/br/…/stock/reports` | Kỳ/tháng + NL → chênh tiêu hao; L0 có AP nếu quyền → không ghi tồn | AP thuộc Finance |

---

### 2.6. GRN — `/inventory/grn` & `/inventory/grn/[id]`

- **Archetype:** control_surface list = `LIST` (`AppPage`…`DataTable`) + list-first **D1 document** (`AppDialog variant="document"` via `?grnId=&mode=view`). `/inventory/grn/[id]` = `REDIRECT-SHIM` → list overlay. Branch `/br/…/stock/grn/[id]` = touch `DETAIL` (không import `GRNDetailClient` control_surface).
- **Actor:** Quản lý kho / NV nhận hàng; tab **Chờ đơn giá** (phiếu đã chốt còn Đơn giá = 0) chỉ **Chủ sở hữu**.
- **Job:** Ghi thực nhận → cập nhật tồn + cơ sở WAC.
- **Goal:** Mở **Chờ nhập hàng** từ PO → ghi đúng → giải phóng xe.
- **Workflow:** Auto-GRN khi PO `sent|approved|partially_received` (1 nháp hoạt động/PO; partial → nháp kế hoặc **Đóng phần còn lại**) → kiểm nhận + **Đơn giá** net + từ chối (lý do+ảnh; thùng + hộp lẻ khi đơn vị PO có neo) → hệ thống suy trạng thái/đối chiếu PO theo Đơn vị chuẩn → `Xác nhận nhập kho` (số giữ ghi sổ theo Đơn giá; giao dư thì tăng SL dòng PO; chốt chặn khi Đơn giá = 0). Handoff PO→GRN dùng `returnTo` về `/inventory/purchase-orders?tab=orders&poId=&mode=view`; GRN→PO luôn kèm `tab=orders`.
- **Ưu tiên data:** GRN/NCC/PO/YCM/kho/ngày/SL đặt·đã nhận·còn·thực·từ chối·Đơn giá net theo đơn vị·áp dụng PO·thiếu·giữ thêm·ĐVT. Sau chốt = chỉ đọc. **Không:** VAT, giá ước tính PO, price-QC (so lệch HĐ), biểu đồ giá, quỹ tiền mặt.
- **UX:** control_surface L0 = LIST host + addressable document dialog (UI theo `grn.status`; không dùng `mode=receive`). Confirm/task phụ (`ReasonConfirmDialog` / `FormDialog` / bottom Sheet) chồng lên document — không đóng document URL. Branch = `BranchOperatorPage` + panel + `AppDetailFooter`; không khung L0/picker CN. CTA xác nhận + Dialog chống nhầm.

---

### 2.7. Hóa đơn NCC — `/finance/supplier-invoices`

- **Archetype:** `LIST`.
- **Actor:** `owner`.
- **Job:** Đối soát GRN ↔ HĐ NCC; chỉ trả đúng thực nhận + đơn giá chứng từ.
- **Goal:** Phát hiện lệch giá/lượng trước khi duyệt thanh toán.
- **Workflow:** Chọn GRN cùng NCC (HĐ mới bắt buộc gắn GRN) → ngày + VAT progressive + đính kèm tùy chọn → đối soát trước VAT (±1đ; VAT không so hàng; HĐ không vượt số giữ đã vào sổ) → lệch đơn giá là review AP (không viết lại WAC) → đính kèm HĐ GTGT trước thanh toán → thanh toán/giảm nợ/phân bổ ứng trước (không trừ tiền lần 2). Trả hàng không tự giảm nợ.
- **Ưu tiên data:** Loại HĐ, trước VAT/VAT/phải trả, liên kết GRN/PO, chênh lệch, trạng thái đối soát/công nợ/đính kèm, ứng trước NCC. **Không:** doanh thu bán, sơ đồ bàn, ca phục vụ.
- **UX:** Width `xwide`; detail `Sheet` phải. URL state: `?invoiceId&mode=view|pay|credit|advance` / `?mode=create&grnId`. Một overlay tại một thời điểm. Footer action theo `procurement:invoice_match` / `finance:ap_pay`.

---

### 2.8. Hồ sơ nhân sự — `/hr`

- **Gia đình:** HR (spine §1A). Entry → strip **Cần xử lý** (chỉ khi có việc) / Thêm NV → success
  onboard hoặc chuyển Thời gian/Lương/Quy tắc; recovery qua tab URL và deep
  link hồ sơ thiếu (không sửa lương tại attendance).
- **Planes:** Company HR (`/hr/*`) = hồ sơ/tài khoản/công/lương/setup tenant. People ops CN = `/br/.../team` + `/shift/*`. Self-service = `/me/*` (ADR 0015).
- **Archetype:** `LIST` + tab URL (`view=profile|accounts`).
- **Actor:** Owner / company HR theo ACL.
- **Job:** Tab **Hồ sơ nhân viên** = NLĐ, HĐLĐ, chế độ lương, site/vị trí (không sửa quyền). Tab **Tài khoản & quyền** = đăng nhập, bật/tắt login, phân quyền (không sửa HĐ/lương/hồ sơ NLĐ).
- **Goal:** Việc cần xử lý + onboard hồ sơ; chuyển **Tài khoản** để cấp quyền theo chức vụ hoặc tạo tài khoản độc lập.
- **Workflow:** Tab hồ sơ (strip **Cần xử lý** chỉ khi có việc → filter → bảng; **Thêm NV** gồm bước tạo đăng nhập) → tab accounts: **Cấp quyền cho hồ sơ** hoặc **Tạo tài khoản độc lập** → `/hr/staff/[id]/permissions` (`/hr/staff` redirect vào accounts).
- **Ưu tiên data:** Hồ sơ = tên/mã/vị trí/site/lương/HĐ/tình trạng. Tài khoản = tên/đăng nhập/quyền/trạng thái login; badge tài khoản độc lập khi chưa gắn `employees`. **Không:** KPI doanh thu/kho; bảng công tháng (`/hr/attendance`); raw `pay_basis`; sửa identity/chức vụ/CN của NV đã gắn hồ sơ từ tab Tài khoản.
- **UX:** Desktop bảng + dialog; cùng IA mobile. Workspace = deep nav; mode = `AppPageTabs` + URL; short edit = `FormDialog`. Cột hồ sơ là chữ; sửa vị trí/site/HĐ trong dialog, không Select trên hàng.

### 2.8a. Chấm công & ca — `/hr/attendance`

- **Archetype:** `LIST` + `tab` URL.
- **Actor:** company HR.
- **Job:** Vào/ra hôm nay; duyệt kết ca & phép; bảng công tháng; phân ca tuần (kể cả VP).
- **Goal:** Đầu ngày **Cần duyệt**; trong tháng **Bảng công**; gán ca trước khi NV chấm; không sửa lương.
- **Workflow:** `today` → `approvals` → `timesheet` → `roster` (BM peer: `/br/{id}/team/roster`). `tab=roster&branch=all` = LIST địa điểm (mở hàng ghi cùng `branch=`); site cụ thể = lưới tuần trong `AppListFrame`. `tab=approvals` = một LIST, toolbar đổi hàng đợi kết ca / phép (`panel`).
- **Show / NOT:** Pending trên Cần duyệt; site gồm VP; cảnh báo chưa phân ca. **Không:** phân quyền staff; chỉnh `pay_basis`; KPI bán; empty-state bắt chọn Phạm vi khi `all`; selector chi nhánh thứ hai.
- **UX:** Filter `date`/`site`/`tab`/`month`/`view`/`week` trên URL. Deep-nav đổi nhà; không Back về `/hr`.

### 2.8b. Bảng lương — `/hr/payroll`

- **Archetype:** `LIST` / document kỳ (`?month=YYYY-MM`).
- **Actor:** company HR có payroll capability.
- **Job:** Tạm tính → đối soát → chốt; phân biệt Theo công vs Lương tháng. Thanh toán = Finance.
- **Goal:** Preflight thiếu HĐ/`pay_basis`/entitlement → tính → điều chỉnh → chốt.
- **Workflow:** Chọn tháng → blocker (chỉ khi có) → mở kỳ → điều chỉnh → chốt. CTA chốt trên `AppPageHeader.actions`. Preview một site được; **chốt kỳ** cần `branch=all`.
- **Show / NOT:** Cột chế độ lương VI; khấu trừ nghỉ KL; link hồ sơ thiếu → `/hr?view=profile&salary=missing`; link công → `/hr/attendance?tab=timesheet`. **Không:** chấm giúp NV; đổi quyền; raw keys; preflight “sẵn sàng” khi không blocker.

### 2.8c. Thiết lập nhân sự — `/hr/setup`

- **Archetype:** `SETTINGS-PANEL` + `tab=leave|shifts|tasks`.
- **Actor:** company HR.
- **Job:** Quy tắc ít đụng hàng ngày — mỗi tab một chức năng.
- **Goal:** Chọn đúng mục; không cuộn nhiều section.
- **Workflow:** `leave` (default) → `shifts` → `tasks` (`position_shift_tasks` SSOT).
- **Show / NOT:** Preview việc NV; cảnh báo tắt ca đang gán. **Không:** stack nhiều section; phân ca tuần (ở attendance roster / `/br/*/team/roster`); bảng lương.

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

- **Gia đình:** Finance (spine §1A). Sibling oversight cùng plane: `/finance/revenue`
  (REPORT), `/finance/expenses`, `/finance/equipment`, `/finance/bank-transactions`, `/finance/targets`,
  và AP `/finance/supplier-invoices` (§2.7). Không dựng dashboard bán hàng/POS.
- **Archetype:** `DASHBOARD`.
- **Actor:** `owner`.
- **Job:** Công thức KQKD theo kỳ (hai dòng); khối **Tài sản** gồm quỹ hiện có, rồi Tổng tiền + tồn cuối kỳ + thiết bị (`capital`) = **Tổng giá trị**; Chi phí ban đầu đứng ngoài công thức đó.
- **Goal:** Doanh thu thuần sau giá vốn món / chi vận hành / biến động tồn; drill báo cáo chuyên biệt khi cần.
- **Workflow:** Chọn kỳ (`Nay`…`Năm`) → phạm vi (`Tất cả`/`Công ty`/`Toàn bộ CN`/`CN`) → đọc 2 dòng công thức → Tài sản (tiền mặt không theo bộ lọc; Tổng giá trị; chi phí ban đầu). Drill thiết bị → `/finance/equipment`. Ngoại lệ xử lý trên `/` và list Giao dịch / Chi phí / HĐĐT — không hàng đợi trên landing.
- **Ưu tiên data:** Hai dòng KPI kỳ; công thức quỹ; Tổng tiền + Tồn kho + Thiết bị = Tổng giá trị; Chi phí ban đầu ngoài tổng. Tháng/`mtd` + chỉ tiêu → Progress trên Doanh thu thuần; đua CN/pace/editor → `/finance/revenue` · `/finance/targets`. **Không lặp:** bảng tồn chi tiết (Inventory). Thiếu coverage giá vốn → không tính Lợi nhuận gộp/KQKD; chưa chi phí → không KQKD. **Không:** LN sau thuế khi chưa sổ/khóa sổ; nút order/KDS; mosaic GTGT; danh sách cần xử lý trên `/finance`.
- **UX:** `formatVND`. Desktop: dòng 1 = 3 card, dòng 2 = 4 card (khi có quyền tồn); khối Tài sản = công thức quỹ, công thức Tổng giá trị, rồi Chi phí ban đầu; tablet 2 cột; mobile 1 cột (`KpiCard`/`KpiRow`/`AppSection`). Chart chỉ `chart-1`…`chart-5`.

### 2.9a. Thiết bị — `/finance/equipment`

- **Gia đình:** Finance. Sibling của `/finance/expenses`.
- **Archetype:** `LIST`.
- **Actor:** `owner`, `accountant`.
- **Job:** Ghi nhận và theo dõi máy móc, thiết bị đã mua (`expenses.category = capital`).
- **Goal:** Thấy số tiền đã chi cho thiết bị; thêm/sửa khoản capital; không giả sổ TSCĐ.
- **Workflow:** Vào từ card Thiết bị trên `/finance` → lọc phạm vi → thêm khoản → thanh toán/khớp như sổ chi phí.
- **Ưu tiên data:** KPI all-time `capital`; danh sách khoản. **Không:** khấu hao, giá trị còn lại, đặt cọc.
- **UX:** Cùng LIST recipe với `/finance/expenses` (`AppListFrame` + overlay chứng từ).

---

### 2.10. HĐĐT khách — `/q/invoice/[token]`

- **Archetype:** `PUBLIC-WORKFLOW`.
- **Đối tượng sử dụng chính:** Khách hàng đã thanh toán.
- **Mục tiêu Nghiệp vụ (Why?):** Cho khách bổ sung thông tin doanh nghiệp và email nhận HĐĐT trong thời hạn tối đa hai giờ (đơn từ 22:00 giờ VN phát hành ngay, QR hết hạn) mà không yêu cầu thu ngân nhập dữ liệu.
- **Mục tiêu Người dùng (Goal):** Quét QR trên hoá đơn thanh toán, đối chiếu đơn và số tiền, tra cứu MST, kiểm tra tên đơn vị và địa chỉ, nhập email rồi xác nhận xuất HĐĐT.
- **Luồng thao tác (Workflow):**
  1. Quét QR trên hoá đơn thanh toán.
  2. Đối chiếu chi nhánh, mã đơn và số tiền trên khối tiêu đề gọn; mở Chi tiết hóa đơn cùng hàng khi cần đối chiếu từng dòng trên lưới cột (món, SL, đơn giá, GTGT, thành tiền).
  3. Chọn Doanh nghiệp hoặc Cá nhân; doanh nghiệp nhập MST rồi tra cứu.
  4. Kiểm tra tên đơn vị, địa chỉ; nhập email bắt buộc.
  5. Xác nhận một lần; màn hình chuyển sang trạng thái hoàn tất và không cho sửa tiếp.
  6. Nếu quá hạn, đã xác nhận hoặc HĐĐT đã đóng, chỉ hiển thị trạng thái tương ứng.
- **Thông tin hiển thị:**
  - **Nên hiển thị:** Chi nhánh, mã đơn, số tiền, dòng món kiểu phiếu trên cột (SL, đơn giá, GTGT, thành tiền; topping/món kèm tách dòng; giảm giá và phí dịch vụ ở chân), thời hạn, MST, tên đơn vị và địa chỉ do API trả về, email nhận HĐĐT, trạng thái tra cứu và kết quả xác nhận.
  - **KHÔNG hiển thị:** Thao tác thanh toán, dữ liệu POS/Self-Order nội bộ, mã nội bộ, dữ liệu nhà cung cấp HĐĐT hoặc khả năng sửa sau khi yêu cầu đã đóng.
- **Quy chuẩn UX/UI:** Mobile-first, khối tiêu đề một thẻ (đơn + số tiền + chi tiết mở/đóng cùng hàng), một hành động chính, control kích thước chạm, hỗ trợ bàn phím và thông báo lỗi/tra cứu bằng ngữ nghĩa truy cập được.

---

### 2.11. Cài đặt hệ thống & Chi nhánh — `/settings/*` & `/br/[branchId]/settings/*`

- **Gia đình / plane:** Settings thuộc Product UX spine §1A. L0 = `control_surface`;
  settings CN = `branch_surface` (cùng việc cấu hình, khác chrome).
- **Archetype:** L0 hub và printers group dùng `LANDING`; form tenant
  (`general`, `payments`, …) và nhiều panel CN dùng `SETTINGS-PANEL`; jobs máy
  in có thể là `LIST` trong family printers.
- **Đối tượng sử dụng chính:** Owner trên `/settings/*`; `branch_manager` (và
  Owner khi vào shell CN) trên `/br/[branchId]/settings/*`.
- **Mục tiêu Nghiệp vụ (Why?):** Đổi cấu hình ít thay đổi (thanh toán, máy in,
  bàn, trạm POS/KDS) mà không trộn vào việc bán hàng hay oversight tài chính
  trong ngày.
- **Mục tiêu Người dùng (Goal):** Tìm đúng nhóm cấu hình trong một đến hai
  chạm, lưu an toàn, quay lại việc ca / Quản trị.
- **Luồng Entry → success → recovery:**
  1. **Entry:** Owner từ `/` nhóm Nền tảng → `/settings`; BM từ overflow / hub
     CN → `/br/[id]/settings`.
  2. **Success:** Chọn card/panel → sửa → lưu (RHF+Zod) → toast/confirm rõ.
  3. **Recovery:** Validation inline; lỗi server không lộ raw Postgres; Back về
     LANDING settings, không đẩy user vào POS/Finance.
- **Thông tin hiển thị:**
  - **Nên hiển thị:** Nhóm cấu hình, trạng thái máy in/jobs khi đúng panel,
    form từng entity.
  - **KHÔNG hiển thị:** KPI doanh thu, queue KDS, tồn kho sống, bảng lương,
    tạo đơn hàng.
- **Quy chuẩn UX/UI:**
  - Exemplar L0 panel: `apps/web/app/(protected)/settings/(tenant)/general/page.tsx`.
  - Exemplar L0 LANDING: `apps/web/app/(protected)/settings/printers/page.tsx`
    và `apps/web/app/(protected)/settings/page.tsx`.
  - Exemplar CN LANDING: `apps/web/app/(protected)/br/[branchId]/(operator)/settings/page.tsx`
    (`BranchOperatorPage` + action links — không `AppSection` / `AppLinkCard`).
  - Inventory master data (`/inventory/settings/*`) thuộc gia đình Inventory,
    không phải Settings tenant.

---

### 2.12. Public / khách & cổng hệ thống — `/login`, `/access-denied`, `/q/*`, `/r/*`

- **Gia đình / plane:** Public trong spine §1A; plane `public` (utility
  `/access-denied` / auth không phải nửa Quản trị hay Vận hành).
- **Archetype:** Self-order và HĐĐT = `PUBLIC-WORKFLOW`; login / access-denied
  = `GATE/AUTH` (chrome-less). Feedback QR khách = public workflow / block
  `public-feedback` (không nhầm với Runner station).
- **Đối tượng sử dụng chính:** Khách (token bàn / hóa đơn / QR góp ý); nhân sự
  chưa đăng nhập hoặc bị từ chối đúng surface.
- **Mục tiêu Nghiệp vụ (Why?):** Cho khách hoàn thành một giao dịch hẹp không
  cần tài khoản nội bộ; cho hệ thống fail-closed khi session/ACL không đủ.
- **Mục tiêu Người dùng (Goal):** Một CTA rõ mỗi bước; xong thì dừng; lỗi thì
  hiểu và thoát an toàn.
- **Luồng Entry → success → recovery (theo nhánh):**
  1. **Login:** `/login` → xác thực → `login-destination` đúng role (Owner `/`,
     central `/inventory` hoặc `/finance`, CN `/br/[id]`, zero-module `/me`).
     Sai → message; không vào shell giả.
  2. **Access denied:** `/access-denied?reason=` → một giải thích + đường thoát
     (đăng nhập lại / về surface được phép).
  3. **Self-order:** `/q/[token]` → chọn món → giỏ → gửi → banner chờ duyệt trên
     menu (không dialog); `Hoá đơn` chỉ khi có yêu cầu chờ hoặc bill đang mở;
     sau duyệt, khách nhập `Mã khuyến mãi` trên hoá đơn; token hết hạn / invalid →
     `notFound` hoặc unavailable chung; offline/retry giữ giao dịch dở
     (`public-transaction`).
  4. **HĐĐT:** §2.10 — quét QR → MST/email → xác nhận một lần.
  5. **Feedback QR:** `/r/[token]` → gửi góp ý → xong; không mount Runner
     `station_chrome`.
- **Thông tin hiển thị:**
  - **Nên hiển thị:** Bước hiện tại, lỗi/tra cứu có ngữ nghĩa, trạng thái hết
    hạn.
  - **KHÔNG hiển thị:** `AppShell` / bottom-nav CN, `DataTable` Quản trị, giá
    vốn, phân quyền staff, dữ liệu chi nhánh khác.
- **Quy chuẩn UX/UI:**
  - Exemplar self-order: `apps/web/app/q/[token]/page.tsx` + `self-order-client.tsx`.
  - Exemplar HĐĐT: §2.10 / `apps/web/app/q/invoice/[token]/…`.
  - Exemplar gate: `apps/web/app/(public)/access-denied/page.tsx`; login:
    `apps/web/app/(public)/(auth)/login/page.tsx`.
  - Card section dùng `PublicSection`; không import chrome `control_surface`
    hay `BranchOperator*`.
