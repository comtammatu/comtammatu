# Thiết kế lại "Việc trong ca" — gom lại & làm rõ (2026-06-29)

> Reconciled-through 0788614b0925
> Trạng thái: **Implementation in progress**.
> Quyết định nền: **D052** (`docs/plan/decisions.md`).
> Nguồn current-state: map 6 phân hệ verify trực tiếp với code + schema (HR templates,
> assignment/coverage, snapshot runtime, count, db schema, IA/naming).

## 1. Vấn đề (vì sao làm)

Hôm nay một "việc trong ca" phải cấu hình qua **6 surface + 2 module**, một khái niệm
mang **4 tên** khác nhau, và nhiều hành vi **ẩn ngầm** (cấu hình rồi mà không hiện,
không báo lý do). Tổng hợp pain points đã xác minh:

- **P1** — Config rải rác: Ca làm → Mẫu checklist → Nguyên liệu tiêu hao → Mặc định
  theo vị trí → Override theo nhân viên → Tình trạng áp checklist (HR) + Giao đếm
  (Inventory). Thiếu 1 bước → hỏng âm thầm.
- **P3** — 1 khái niệm 4 tên: "Việc trong ca" / "Việc" / "Checklist" / "Mẫu checklist".
- **P4** — Hiển thị ẩn ngầm: Tiêu hao chỉ hiện khi có item `consumption_report` được
  snapshot; Kiểm kê chỉ hiện khi `countAssignmentCount > 0`; scope `weekly` **không bao
  giờ** được materialize lúc vào ca.
- **P6** — Template lỗi/ngoài scope → vào ca với checklist **rỗng**, `requiredRemaining=0`
  → **kết ca khống** mà nhân viên không hề biết.
- **P7** — "Ca mở/đóng" suy ra bằng MIN/MAX `start_time` lúc vào ca (không lưu cờ) → 2 ca
  trùng giờ hoặc ca thứ 3 cho kết quả bất ngờ.
- **P8** — 2 cơ chế chặn-kết-ca cho Tiêu hao (cờ `is_done` ở SQL + check status ở TS
  `approveCheckoutRequest`) có thể lệch nhau.
- **P9** — Per-employee override sinh trạng thái nhiễu "Checklist riêng" owner phải triage.

## 2. Quyết định nền (owner chốt — D050)

| # | Quyết định |
|---|---|
| 1 | **Gom + loại việc rõ ràng**: một khái niệm "Việc trong ca" duy nhất; mỗi việc có LOẠI rõ (Việc thường / Tiêu hao / Kiểm kê). **Tái dùng** engine Tiêu hao & Kiểm kê sẵn có, KHÔNG xây lại lõi inventory. |
| 2 | **Cấu hình trực tiếp theo vị trí** — bỏ khái niệm "Mẫu" rời + bước "gán mẫu". |
| 3 | **Lưới = vị trí × ca mở/đóng**, dùng **cờ ca tường minh**; 2 chi nhánh dùng chung 1 danh sách. |
| 4 | **Kiểm kê**: giao đếm vẫn ở Inventory (người × kho × nguyên liệu, giữ đếm mù); **tự hiện** thành 1 việc trong "Việc trong ca" khi nhân viên được giao. |
| 5 | **Bỏ override theo từng nhân viên** (cấu hình thuần theo vị trí). |
| 6 | **Giai đoạn còn 2**: `Đầu ca` / `Cuối ca` (bỏ `Trong ca`). |

## 3. Mô hình cốt lõi

"Việc trong ca" là khái niệm **duy nhất**. Mỗi việc thuộc **1 vị trí** và có:

| Thuộc tính | Giá trị | Ghi chú |
|---|---|---|
| **Loại** | `Việc thường` · `Tiêu hao` · (`Kiểm kê` = tự sinh) | Kiểm kê không nhập tay ở đây (§6) |
| **Áp dụng ca** | `Mỗi ca` · `Chỉ ca mở` · `Chỉ ca đóng` | Dựa cờ ca tường minh, không đoán theo giờ |
| **Giai đoạn** | `Đầu ca` · `Cuối ca` | Nhóm hiển thị cho nhân viên |
| **Bắt buộc** | có / không | Chặn kết ca nếu chưa xong |
| **Mô tả "xong"** | text (tuỳ chọn) | |
| **Thứ tự** | số | Sắp xếp trong giai đoạn |

**Loại bỏ khỏi mô hình**: "Mẫu checklist" rời, bước "gán mẫu cho vị trí", override theo
nhân viên, giai đoạn `Trong ca`, scope `weekly`.

## 4. Flow cấu hình mới — 6 bước → còn 2

Trong HR còn đúng 2 mục:

- **A. Ca làm** — mỗi ca đánh dấu **Ca mở / Ca đóng** tường minh (thay MIN/MAX).
- **B. Vị trí → Việc trong ca** — chọn vị trí (Thu ngân / Phục vụ / Bếp…) → sửa thẳng
  danh sách việc, **thêm/sửa/xoá từng việc một**. Việc loại `Tiêu hao` chọn nguyên liệu
  mặc định **ngay tại dòng đó** (gộp "Bước 3" cũ vào đây). Mục này còn hiển thị
  **trạng thái Kiểm kê** ("ai đang được giao đếm") + link sang Inventory.

## 5. Trải nghiệm nhân viên

Một màn **"Việc trong ca"** duy nhất, tự gom đúng việc của **(vị trí × ca hôm nay)**:

- Nhóm theo `Đầu ca` / `Cuối ca`.
- Việc `Tiêu hao` → form nhập tiêu hao ngay trong danh sách.
- Việc `Kiểm kê` (nếu được giao) → 1 dòng việc, bấm mở màn đếm; tick xong khi nộp phiếu.
- Xong hết việc **bắt buộc** mới kết ca được — **một** cơ chế chặn server-authoritative.

## 6. Kiểm kê & Tiêu hao — tái dùng nguyên lõi

**Tiêu hao** (`task_kind='consumption_report'`): chỉ **di dời UI** cấu hình nguyên liệu
mặc định vào dòng việc của vị trí. Lõi giữ nguyên: `attendance_consumption_reports` /
`_lines`, RPC submit/approve, ghi kho WAC.

**Kiểm kê** (giữ tách ở tầng dữ liệu, gom ở tầng trải nghiệm):
- Giao đếm vẫn ở `/inventory/count-assignments` (`inventory_count_assignments`, đếm mù
  enforce ở RLS, một active owner / ô).
- Lúc vào ca, nếu nhân viên có assignment active hợp lệ → **tự sinh** một item Kiểm kê
  vào `attendance_checklist_items` (loại mới, ví dụ `task_kind='inventory_count'`), để nó
  nằm trong danh sách + tham gia cổng kết-ca. Item này `is_done` khi phiếu đếm được
  nộp/duyệt.
- HR (mục Vị trí) chỉ **hiển thị trạng thái + link**, không cấu hình đếm tại đây.

## 7. Dẹp bẫy ẩn

| Pain | Cách xử lý |
|---|---|
| P7 | Cờ `is_opening`/`is_closing` trên `shifts`; "Áp dụng ca" tra cờ, không MIN/MAX. |
| P6 | Vị trí chưa cấu hình việc / cấu hình lỗi → **báo rõ** (coverage), không cho vào ca với danh sách rỗng rồi kết ca khống. Quyết định hành vi: chặn hay cảnh báo (xem §11). |
| P4 | Bỏ scope `weekly`. Tiêu hao/Kiểm kê hiện theo quy tắc tường minh ở trên. |
| P8 | Một cơ chế chặn duy nhất: cờ `is_done` của item (kể cả Tiêu hao/Kiểm kê) — bỏ check status trùng ở TS. |
| P9 | Bỏ override nhân viên → hết trạng thái "Checklist riêng". |

## 8. Chuẩn hoá tên

- "Checklist" / "Mẫu checklist" / "Việc" → **"Việc trong ca"** ở mọi surface (nav, HR,
  employee, messages SSoT `lib/messages/*`, `packages/shared/.../labels`).
- Loại: **Việc thường** · **Tiêu hao** · **Kiểm kê tồn**.
- Giai đoạn: **Đầu ca** / **Cuối ca**.

## 9. Schema & di trú (phác thảo — plan sẽ chốt chi tiết)

**Thêm/đổi:**
- `shifts`: thêm `is_opening boolean`, `is_closing boolean` (hoặc 1 enum `shift_role`).
- Việc theo vị trí: thay "template + cột `default_checklist_template_id`" bằng quan hệ
  việc-gắn-vị-trí. Phương án ưu tiên: bảng `position_shift_tasks`
  (`position_id`, `title`, `kind`, `shift_applicability`, `phase`, `is_required`,
  `done_definition`, `sort_order`). Plan đánh giá: bảng mới vs tái dùng
  `shift_checklist_template_items` với template 1:1 vị trí.
- `task_kind`: thêm `inventory_count` cho item Kiểm kê tự sinh. Phase enum: bỏ
  `during_shift`.
- Tiêu hao default ingredients (`shift_checklist_consumption_default_items`): re-key theo
  việc-của-vị-trí.

**Giữ nguyên (audit):** `attendance_checklist_items` (snapshot point-in-time),
`attendance_consumption_report_lines`, `inventory_count_slip_lines.system_quantity`.

**Di trú 1 lần:** template đang gán cho vị trí (`positions.default_checklist_template_id`)
→ đổ thành `position_shift_tasks` của vị trí đó (map `scope`→`shift_applicability`,
`phase` gộp `during_shift`→`start_of_shift` hoặc `end_of_shift` theo quy tắc plan chốt).
Override theo nhân viên hiện có: review thủ công, không tự đổ (đang bị bỏ).

**RPC chạm:** `employee_clock_in_with_checklist` (resolve theo vị trí + cờ ca + tự sinh
Kiểm kê), `upsert_shift_checklist_template` → đổi thành upsert việc-theo-vị-trí,
`employee_request_clock_out` (giữ, gate theo item). Tiêu hao/Kiểm kê submit/approve RPC
giữ nguyên.

## 10. KHÔNG đụng + ràng buộc bảo toàn

- **Không đụng**: lõi đếm mù + RLS/variance (Inventory), lõi duyệt Tiêu hao + ghi kho WAC,
  chấm công + duyệt kết ca (server-authoritative).
- **Bảo toàn**: tenant/branch scoping; snapshot immutability cho audit; ghi qua SECURITY
  DEFINER RPC; quyền `STAFF_MANAGE` (cấu hình việc theo vị trí — owner-only cho thao tác
  toàn cục), `inventory:count_assign` / `inventory:count_approve` giữ nguyên.

## 11. Câu hỏi mở (quyết trong plan / hỏi owner)

1. **Vị trí thiếu việc lúc vào ca**: **chặn** vào ca hay **cho vào + cảnh báo**? (Đề xuất:
   cho vào nhưng đánh dấu "chưa cấu hình", báo owner ở coverage; không cho kết-ca khống.)
2. **Tên loại item Kiểm kê tự sinh** ở DB (`inventory_count` vs khác) — cosmetic, chốt khi code.
3. **Bảng mới `position_shift_tasks` vs tái dùng template-items 1:1** — plan cân nhắc theo
   chi phí migration + RLS.
4. **Vị trí (`positions`) là tenant-level** → việc dùng chung 2 chi nhánh: xác nhận đúng
   thực tế vận hành (đã chốt ở quyết định #3, ghi lại để plan không hỏi lại).
