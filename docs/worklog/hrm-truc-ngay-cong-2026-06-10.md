# HRM "1 trục Ngày công" — T3 contract (2026-06-10)

Owner phản hồi: HRM mơ hồ, các mảnh Nhân viên / Ca làm / Công việc / Nghỉ phép /
Chấm công rời rạc; quán chạy ca mặc định mỗi ngày nhưng app vẫn bắt đăng ký ca;
nghỉ phép thì "nhân viên hay cả quản lý đều không có quyền". Owner chốt:
**redesign "1 trục Ngày công"** + **bỏ hẳn flow Đăng ký ca**.

## Bằng chứng (prod `iexwsuaqqenyjiskawoj`, SELECT-only, 2026-06-10)

| Chỉ số | Giá trị |
| --- | --- |
| Grants `hr:request_leave` / `hr:approve_leave_request` trong `staff_permissions` | **0 / 0 user** |
| `leave_requests` | 0 dòng (chưa ai gửi được) |
| `shift_assignments` | 0 dòng từ trước tới nay |
| `shift_requests` | 0 dòng từ trước tới nay |
| `attendance_records` có `shift_id IS NULL` | 18/19 |
| Grants `hr:register_shift` (flow chết đầu duyệt) | 36 grants / 35 user |
| Grants `hr:approve_shift_request` | 8 grants / 7 user |

Root cause nghỉ phép: `20260610110000_employee_leave_requests.sql` chỉ seed 2 key
vào `role_templates` — mà template là **snapshot-only** (comment trong baseline:
"editing a template does NOT auto-update existing grants"), KHÔNG gọi
`sync_missing_permissions_from_template()`. User hiện hữu vĩnh viễn không có
quyền → RPC `submit_leave_request` / `approve_leave_request` đều fail ở
`has_permission`. Template trên prod ĐÃ có key (verify SELECT) — chỉ thiếu
backfill.

Root cause đăng ký ca: flow 2 đầu nhưng đầu duyệt (`ShiftRequestsTable`,
`hr/shift-requests-table.tsx`, 541 dòng) chưa từng được render ở trang nào
(dead code). Đầu gửi vẫn sống ở `/employee/shift-register` + Profile + nút trong
Lịch → yêu cầu (nếu có) rơi hố đen.

Ràng buộc phát hiện khi khảo sát: key `hr:approve_shift_request` đang được
**mượn làm quyền duyệt KẾT CA** (`employee/clock/actions.ts:601`,
`employee/checkout-approvals/page.tsx:152-155`, static test
`employee-daily-work-static.test.ts:233,257` enforce). KHÔNG được xóa key này.

## Debate 4 vai

**PM** — scope = (1) sửa nghỉ phép chạy được thật trên prod: backfill grants +
notification cho người duyệt + ngày nghỉ hiện trên Lịch nhân viên; (2) bỏ hẳn
flow Đăng ký ca (màn gửi, bảng, RPC, key `hr:register_shift`, dead code duyệt,
links); (3) Lịch thành 1 trục: ca phân (hiếm) + chấm công + nghỉ phép trên cùng
calendar, nút phụ trong Lịch đổi từ "Đăng ký ca" → "Xin nghỉ phép". Acceptance =
sau khi owner apply migration: nhân viên gửi được yêu cầu nghỉ, BM/owner thấy và
duyệt được ở `/hr`, có notification; không còn đường nào dẫn vào shift-register;
Lịch hiển thị ngày nghỉ đã duyệt/chờ duyệt. KHÔNG làm trong slice này: leave
balance/trừ phép, chặn chấm công ngày nghỉ, rename key approve_shift_request,
drop cột CTCP trên `employees` (form đã gọn ở slice trước), gom 7→3 permission
keys (blast radius RLS — để đợt sau).

**BA** — rules: (a) backfill phải additive-only (`sync_missing_permissions_from_template`
chỉ INSERT ... ON CONFLICT DO NOTHING — không thu hồi gì); (b) giữ nguyên mọi
business rule của leave v1 (future-only, không overlap, không tự duyệt, RLS
branch-scoped); (c) notification theo bucket: staff gửi → target
`branch_manager,super_manager,owner`; BM gửi → `super_manager,owner` (khớp
nguyên tắc không tự duyệt); `notifications.target_roles` mang access bucket,
không phải position code; (d) `hr:approve_shift_request` GIỮ NGUYÊN key + grants
(gate duyệt kết ca), chỉ đổi description cho khỏi gây hiểu lầm; (e) xóa
`shift_requests` an toàn vì 0 dòng prod — vẫn DROP ... IF EXISTS + drop enum
`shift_request_status` sau bảng; (f) Lịch đọc leave qua RLS self-select sẵn có,
không cần policy mới. Edge: user có `position` ngoài template → sync bỏ qua
(đúng — không bịa quyền); leave range chờm 2 tháng → query overlap
(`start_date <= monthEnd AND end_date >= monthStart`).

**Senior Dev** — approach: 1 migration data+DDL
`20260610234500_hrm_leave_grants_drop_shift_requests.sql`: (1) `SELECT
public.sync_missing_permissions_from_template();` (2) CREATE OR REPLACE
`submit_leave_request` v2 = v1 + INSERT notifications (pattern copy từ
`employee_request_clock_out`, dedup_key `hr.leave_request:<id>`, action_url
`/hr`) + REVOKE/GRANT lại như v1; (3) DROP 4 RPC shift_request theo đúng
signature baseline, DROP TABLE `shift_requests`, DROP TYPE
`shift_request_status`, DELETE grants + array_remove template + DELETE
`permission_keys` cho `hr:register_shift`, UPDATE description key approve.
App: xóa `employee/shift-register/` (3 file) + `hr/shift-request-actions.ts` +
`hr/shift-requests-table.tsx`; gỡ entry Profile; schedule/actions.ts thêm fetch
`leaves`; schedule-client per-day leave badge + SelectedDayDetail + nút "Xin
nghỉ phép" → `/employee/leave`; permissions.ts bỏ `HR_REGISTER_SHIFT`;
messages dọn `shiftRegister*`, thêm copy leave cho Lịch. Generated types: prod
chưa apply nên `db:types` chưa đổi — bảng `shift_requests` còn trong types là
vô hại (không ref); owner apply xong chạy `pnpm db:types`. Risk: types drift
(chấp nhận, ghi PR note); RPC drop sai signature (đã lấy từ baseline).

**QA/QC** — gates: focused static tests
(`employee-leave-requests-static`, `employee-daily-work-static` phải PASS
nguyên trạng — chứng minh không phá checkout-approval gate), sửa 1 assertion
`employee-mobile-app-ui` (href shift-register → leave), test static mới
`hrm-truc-ngay-cong-static.test.ts` khóa: migration có sync + notification +
DROP + giữ approve key; app không còn ref `/employee/shift-register`;
permissions.ts hết `HR_REGISTER_SHIFT`. Full `pnpm typecheck && pnpm lint &&
pnpm build` + web/shared test suites. Migration verify: KHÔNG apply prod
(owner-gated theo flow PR); dry-run = đọc-only predicates đã chạy trước trên
prod (template có key, 0 grants → sync sẽ chèn đúng phần thiếu; bảng 0 dòng →
drop không mất dữ liệu). Regression cần canh: duyệt kết ca (giữ key), RLS
leave không đổi, route `/employee/schedule` không vỡ khi leaves rỗng.

## Kết luận xung đột

- Dev muốn rename `hr:approve_shift_request` → key kết ca riêng; BA/QA bác:
  tăng blast radius RLS + backfill cho zero user value. Chốt: giữ key, đổi
  description, ghi chú trong permissions.ts.
- PM cân nhắc chặn chấm công ngày nghỉ approved; BA bác: HKD cần linh hoạt
  (nhân viên đổi ý đi làm vẫn chấm được), hiển thị là đủ. Chốt: chỉ hiển thị.

## Trạng thái

- [x] Contract viết trước khi code (file này).
- Migration + app + tests: xem `tasks/todo.md` entry cùng ngày.
- 2026-06-11: owner ủy quyền, cả 5 migration đã APPLY lên prod + `db:types` (chi
  tiết trong todo entry).

---

# Phase 2 — T3 contract (2026-06-11)

Owner chốt 3 việc: (1) tab Chấm công quản lý hiển thị ngày nhân viên nghỉ phép,
(2) gom permission keys HR, (3) tab Phân ca **bỏ hẳn**.

## Bằng chứng khảo sát

- `shift_assignments`: 0 dòng prod từ trước tới nay. Mọi điểm đọc đã map:
  HR tab Phân ca (`shift-assignments-table.tsx` + `shift-assignment-actions.ts`),
  3 RPC bulk (`bulk_upsert_shift_assignments`, `copy_shift_assignments_week`,
  `bulk_delete_future_shift_assignments`), nhánh override trong
  `employee_clock_in_with_checklist` (20260610211000:75–95), lookup phân ca khi
  clock-in (`employee/clock/actions.ts:202-212`), `nextShift` trong
  `today-work-state.ts:181-200` (nuôi home + clock-client), nguồn ca của Lịch
  (`employee/schedule/{page,actions}.ts`), đếm "phân ca tương lai" + guard xóa
  ca trong `hr/actions.ts:277,349`.
- 4 key HR **chết hẳn** (0 ref app code; UI contracts đã bị xóa ở slice trước):
  `hr:contract_create`, `hr:contract_sign`, `hr:terminate` (chỉ còn trong policy
  `contracts_write` trên `employment_contracts` — bảng còn được payroll ĐỌC,
  không ai ghi từ client), `hr:dependent_manage` (mồ côi hoàn toàn — RPC
  `update_my_dependents_count` tự guard self-service, không check key).
- `hr:approve_shift_request`: chỉ còn gate duyệt KẾT CA ở app
  (`clock/actions.ts:601`, `checkout-approvals/page.tsx:152,155`). RPC
  `branch_manager_approve_employee_clock_out` KHÔNG hardcode key (role-check
  theo bucket) → rename key không phải sửa RPC. 2 chỗ baseline hardcode key là
  RPCs đăng ký ca đã DROP ở phase 1.

## Debate 4 vai (condensed — đủ 4 góc)

**PM** — scope: (a) bỏ hẳn Phân ca tận gốc: tab + actions + bảng + 3 RPC bulk +
mọi nhánh đọc; Lịch và home lấy "ca" từ chấm công thực tế (ca mặc định là hợp
đồng vận hành); (b) keys HR 9 → 5: xóa 4 key chết, rename
`hr:approve_shift_request` → `hr:approve_checkout` cho khỏi mang tên flow đã
chết vĩnh viễn; (c) tab Chấm công thêm khối "Nghỉ phép đã duyệt trong tháng"
(nhân viên, từ–đến, loại) — pending KHÔNG hiện ở đây (đã có tab Nghỉ phép).
Acceptance: /hr còn 5 tab (Nhân viên/Ca/Checklist/Chấm công/Nghỉ phép); chấm
công tháng thấy được ai nghỉ phép ngày nào; không còn `shift_assignments` ở
DB lẫn code.

**BA** — rules: (a) drop bảng an toàn (0 dòng; FK shift_requests đã gone);
KHÔNG sửa baseline (immutable) — drop qua migration mới; (b) clock-in giữ
nguyên hành vi thực tế (assignments luôn rỗng nên lookup là dead path; bỏ đi
không đổi behavior, default-shift là đường duy nhất); (c) `attendanceRequired`
bỏ vế `hasTodayShift` — không đổi hành vi prod (luôn false xưa nay);
(d) rename key: INSERT key mới TRƯỚC (FK staff_permissions.permission_key →
permission_keys ON DELETE RESTRICT), UPDATE grants (unique
(user_id,branch_id,key) không va vì key mới chưa có dòng), array_replace
template, DELETE key cũ; (e) DROP policy `contracts_write` (không còn đường
ghi hợp lệ từ client; RLS enabled ⇒ mặc định deny; payroll vẫn ĐỌC qua policy
select hiện hữu; service_role bypass khi cần); (f) khối nghỉ phép trong Chấm
công: chỉ `approved`, overlap tháng đang xem, đọc qua permission
`hr:approve_leave_request` (đúng key của dữ liệu leave).

**Senior Dev** — 1 migration
`20260611103000_hrm_p2_drop_shift_assignments_lean_hr_keys.sql`:
(A) CREATE OR REPLACE `employee_clock_in_with_checklist` v4 (bỏ override
assignments — template = employee default, giữ validation + snapshot), DO-block
drop mọi overload 3 RPC bulk, DROP TABLE shift_assignments; (B) DROP POLICY
contracts_write; xóa grants/template/key của 4 key chết; rename key approve.
App: xóa 2 file Phân ca; hr-client bỏ tab (defaultTab fallback → "attendance");
clock/actions bỏ lookup assignments; today-work-state bỏ query `upcoming` +
field `nextShift`/`TodayShift`/`formatShiftRange`; employee/page +
clock-client đổi sang attendance-based shift display; schedule lấy ScheduleShift
từ attendance join shifts; hr/actions bỏ future_assignment_count + guard
assignments khi xóa ca; permissions.ts xóa 4 key + rename constant
HR_APPROVE_CHECKOUT; leave-request-actions thêm `fetchApprovedLeaveMonth`;
attendance-table render khối nghỉ phép; messages cập nhật. Risk chính: quên 1
điểm đọc shift_assignments → runtime error sau drop (đã quét bằng rg toàn repo,
chốt danh sách trên); key rename sót ref cũ (giữ bằng grep + static test).

**QA/QC** — gates: sửa `employee-daily-work-static.test.ts` (ref
shift-assignments-table + key rename), XÓA `hr-bulk-scheduling-static.test.ts`
(feature chết), cập nhật `hrm-truc-ngay-cong-static.test.ts` + thêm assertions
P2 (migration drop bảng + rename key + không còn ref `shift_assignments` trong
app + tab Phân ca biến mất + attendance hiển thị leave); full
typecheck/lint/build + web/shared suites; dọn eslint-i18n-baseline entries của
file xóa. Migration verify trên prod chỉ khi owner ủy quyền lại (mặc định
file→PR). Regression phải canh: clock-in (RPC v4), duyệt kết ca (key mới),
Lịch nhân viên (nguồn ca mới), tab Ca trong /hr (mất cột phân ca tương lai).

## Kết luận xung đột

- Dev đề xuất giữ `nextShift` interface trả null để đỡ sửa UI; BA/PM bác: field
  chết tạo "mạch ngầm" cho người sau — xóa hẳn, UI lấy ca từ attendance.
- BA cân nhắc giữ policy `contracts_write` trỏ `hr:manage_employee`; PM bác:
  không có UI ghi hợp đồng nào còn sống — giữ đường ghi mở là rủi ro thừa;
  DROP, khi nào cần contract module thật thì mở lại có chủ đích.

