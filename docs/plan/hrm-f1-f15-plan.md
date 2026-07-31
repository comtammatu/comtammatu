# Kế hoạch HRM trục Người · Ngày công (F1–F15)

Bản đầy đủ, chi tiết từng vấn đề. Đã qua codex T3 review (GPT-5.6 High, 298k tokens) + em verify trực tiếp các claim mấu chốt. Nguồn: codebase + Greenfield chain (`enloyfnuerqgaqderbwb`); KHÔNG đụng Production (`iexwsuaqqenyjiskawoj`). Mỗi phase = 1 PR, verify `corepack pnpm typecheck && lint && build && test` + SQL test; migration áp Greenfield (cần owner delegate trong session áp, theo `docs/agent/rules/database.md`).

Owner đã chốt scope: **rostering mới (đảo D012)**, **HĐLĐ đầy đủ**, **hồ sơ tối thiểu**, **toàn bộ F1–F15**.

---

## 0. Quy ước kỹ thuật (cross-cutting)

- RPC mới: `SECURITY DEFINER` + `SET search_path TO ''` + schema-qualify mọi object.
- Gọi RPC qua **authenticated `supabase` client** (KHÔNG `createServiceClient`) để `auth.uid()`/`has_permission_any` chạy.
- Revoke direct DML → mutations RPC-only.
- RLS tenant-safe + **negative IDOR test**.
- Không leak raw Postgres error: mapper table-driven.
- Copy tiếng Việt ở `apps/web/lib/messages/hr.ts`.
- Cập nhật generated DB types + E2E fixtures + permission catalog + regression guards + route-matrix **trong cùng PR owning**.
- **ACL checks theo permission-key (KHÔNG hardcode role)**: mọi RPC lifecycle mới (`provision_employee_record`, `create_contract_revision`, `terminate_contract`, `offboard_employee`) dùng `public.has_permission_any(auth.uid(), ARRAY['<key>'])` khớp với `packages/shared/src/auth/module-acl.ts` + `packages/shared/src/auth/permissions.ts` — mirror pattern `snapshot_payroll_calculation` (`baseline.sql:39509` `IF NOT public.has_permission_any('finance:payroll_calculate')`). Permission key mới (vd `hr:manage_roster`) thêm vào `permissions.ts` + seed `permission_keys` catalog trong cùng PR. KHÔNG check `auth_is_owner()` trực tiếp làm cổng duy nhất.

### 0.1. Verify claim mấu chốt (đã kiểm tra trực tiếp)

| Claim | Bằng chứng |
|---|---|
| Entitlement prorate `13 − month` (Dec31→1) | `migration-archive/20260626102342:12-16` |
| RLS `shift_checklist_consumption_default_items_select` phụ thuộc 100% legacy template tables | `baseline.sql:62739-62755` |
| `employment_contracts` grant DML cho `anon`+`authenticated` (hole) | `baseline.sql:67624-67625` |
| `employees` KHÔNG có `exit_date`/`exit_reason` | grep baseline |
| `attendance_records` KHÔNG có flag force-close | grep baseline |
| `shift_assignments` từng tồn tại rồi bị xóa (precedent domain term) | `migration-archive/20260611103000` |

---

## 1. Bước 0 — ADR 0019 ✅ ĐÃ ACTIVATE (2026-08-01)

**Bản chi tiết đầy đủ:** `docs/plan/hrm-d100-proposal.md`. **ADR chính thức:**
`docs/plan/adr/0019-hrm-roster-contract-options.md` — **Status: Accepted**
(owner phê chuẩn 2026-08-01). P5 (rostering) và P6A/P6B (contract/probation)
**được phép code**.

Nội dung decision (chi tiết trong `hrm-d100-proposal.md` + ADR 0019):

- Đảo **clause rostering của D012** (GIỮ cấm: auto-late/auto-absent/leave-balance-enforcement/multi-tier-approval).
- Amend **D026 IA** + **D027** chỗ restates no-rostering (`decisions.md:119,125-129`).
- Rostering = **optional overlay** (ưu tiên assignment, fallback default-shift resolver); mandatory-reject = decision riêng sau, sau operational proof.
- **Contract/probation semantics**:
  - 85% = mức tối thiểu (không universal).
  - BHXH chỉ loại trừ hợp đồng thử việc RIÊNG; thử việc trong HĐLĐ vẫn đóng BHXH.
  - HR chọn job category/duration tường minh.
  - "HĐ lần 3" = 2 HĐXĐT liên tiếp trước (không `contract_sequence=3`).
  - Tách contract sequence khỏi compensation amendment.
- F15 = D027 accepted (timestamps → display hours; pay = 0.5 công/credited shift; KHÔNG hourly payroll).
- F13 deferral: address/gender/residence/ID-issue (bắt buộc HĐLĐ `labor-contracts.md:37-49`) hoãn P9 với owner-approve tường minh.
- Cập nhật `tasks/regressions.md` (guard D012-rostering).

**P5 (rostering) ĐƯỢC CODE** (ADR 0019 đã Accepted 2026-08-01).

---

## 2. Vấn đề F1–F15 (mô tả chi tiết)

### F1 🔴 — Không seed `annual_leave_entitlements` khi tạo nhân viên
`createEmployeeAccount` (`hr/actions.ts:281-479`) tạo auth+profile+employees+contract nhưng **không insert `annual_leave_entitlements`**; không trigger seed. Hệ quả: nhân viên mới `entitlementDays=null` → payroll `annualEntitlementForCalculation=0` (`payroll-actions.ts:581-600`) → phần annual leave vượt monthly bucket (default 2 ngày) trôi sang unpaid. Không UI admin set quota từng nhân viên.
**Sửa ở P1.**

### F2 🟡 — `|| true` debug bypass trong position-task filter
`position-tasks-actions.ts:205-209`: `hasStaffOrTasks = ... || true` làm nhánh `if (!hasStaffOrTasks) return []` thành dead code. Filter "chỉ position có staff/task" bị tắt.
**Cảnh báo codex**: kích hoạt filter sẽ ẩn position TRƯỚC khi có staff — đúng lúc cần config. **Xóa hẳn dead machinery, cố ý show tất cả assignable positions** (không chỉ bỏ `|| true`).
**Sửa ở P8.**

### F3 🔴 — Consumption report RPC có nhưng KHÔNG wire UI
`employee_submit_consumption_report` + `branch_manager_approve_consumption_report` có RPC đầy đủ nhưng zero caller trong `apps/web`. `consumption_report` render thành checkbox thường (`tasks-client.tsx:184-243`), tick chỉ set `is_done`. Pipeline consumption→inventory chết ở UI.
**Sửa ở P2.**

### F4 🟠 — 2 hệ checklist template mâu thuẫn (di sản D052)
`shift_checklist_templates`/`shift_checklist_template_items`/`default_checklist_template_id` là di sản (D052 đã thay bằng `position_shift_tasks`). Clock-in chỉ snapshot `position_shift_tasks` (`baseline.sql:15681-15701`). `buildChecklistCoverage` không có prod caller (chỉ test).
**Sửa ở P4** (code-first + destructive migration KHÔNG CASCADE vì RLS consumption phụ thuộc legacy).

### F5 🟠 — 2 đường onboarding lệch dữ liệu
`createStaff` (`/hr/staff`) tạo auth+profile nhưng KHÔNG `employees` row → `staff-runtime-context.ts:25-32` trả null → vô hình với payroll/attendance runtime. `createEmployeeAccount` là superset.
**Cảnh báo codex**: filter chỉ UI là không đủ — phải enforce server trong `createStaff`+`updateStaff`; banner phải có CTA repair (gọi RPC provisioning), không chỉ thông báo.
**Sửa ở P3.**

### F6 ⚪ — (đã REFUTE) Trigger handle_new_user giờ xử lý central/accountant
D088 migration đã sửa `handle_new_user`. Chỉ còn UX: lỗi trigger báo mù "Không thể tạo tài khoản".
**Giảm ưu tiên, map lỗi ở P3.**

### F7 🟡 — Các gap nhỏ
`bank_name` dead column, `default_checklist_template_id` không field form, `seasonal` enum mismatch, `during_shift` không render, `shiftSchema` không validate time-ordering, không re-activate shift, stale comment create-only.
**Sửa ở P8** (seasonal→P6, during_shift render trước cleanup).

### F8 🔴 — Force-close công-math bug (MỚI)
RPC `force_close_stale_attendance` set `check_out = check_in` (comment "không tính công" `baseline.sql:18658`) nhưng TS `buildCompletedWorkdays` (`payroll-day-math.ts:66-91`) đếm bất kỳ record `check_out IS NOT NULL` → vẫn **0.5 công**, mâu thuẫn trực tiếp ý intent.
**Codex REFUTE sentinel `check_out > check_in`**: không phân biệt force-close với manual 0-duration khác. **Dùng cột tường minh `attendance_records.counts_for_workday`** (default true, force-close set false) + backfill audited.
**Sửa ở P1.**

### F9 🟠 — Không workflow terminate/expire HĐLĐ (MỚI)
Cột `terminated_at`/`termination_notice_date`/`termination_reason`/`probation_end_date`/`document_url`/`contract_sequence` tồn tại (`baseline.sql:46590-46613`) nhưng **không code nào ghi**. `upsertActiveContract` (`actions.ts:122-153`) OVERWRITE in-place → mất history.
**Sửa ở P6A (history/append) + P6B (terminate).**

### F10 🟠 — Không salary-history UI; drift base_salary (MỚI)
Không `salary_history` table/UI. `updateEmployee` ghi `employees.base_salary` rồi trigger `trg_contract_sync_insurance` ghi đè từ contract → edit trực tiếp bị nuốt im.
**Sửa ở P6A** (period-effective payroll + history).

### F11 🟠 — Probation chỉ là label (MỚI)
Không logic 85%/no-BHXH/probation_end_date.
**Codex REFUTE universal "85%+no BHXH"**: 85%=min, BHXH chỉ loại hợp đồng thử việc riêng.
**Sửa ở P6B** (theo luật).

### F12 🟠 — contract_sequence không tăng; "HĐ lần 3" unimplemented (MỚI)
Feature cảnh báo HĐXĐT lần 3 không hoạt động.
**Codex**: "lần 3"=2 HĐXĐT liên tiếp trước, không `contract_sequence=3`. Tách khỏi compensation amendment.
**Sửa ở P6B.**

### F13 🔴 — Hồ sơ NV compliance-thin (MỚI)
Không địa chỉ/giới tính/ID-issue/emergency-contact; `profiles` chỉ full_name/phone/avatar_url/birth_date. Không employee detail page (chỉ list+edit). Không offboarding ngoài toggle is_active. Không document storage. Owner chọn "tối thiểu".
**Sửa ở P7** (detail+offboarding+DOB/bank); address/gender/residence/ID-issue hoãn P9 (ADR deferral).

### F14 — Rostering absent (D012 intentional)
Không `shift_assignments`; auto-derive shift tại clock-in (`default-shift.ts:120-166`).
**Owner chọn đảo D012. Sửa ở P5** (optional overlay).

### F15 — Hours chỉ timestamp; payroll dùng shift-count (D027)
Payroll = 0.5 công/shift, không dùng giờ. Force-close → 0 giờ (consistent display).
**Đóng tường minh = D027 accepted** ở ADR + regression test.

---

## 3. Chi tiết phase triển khai

### Phase 1 — Blocker lương (PR #1)

**1A. Migration `supabase/migrations/20260801090000_hr_employee_lifecycle.sql`**

RPC `provision_employee_record(p_profile_id uuid, p_employee jsonb, p_contract jsonb, p_entitlement_year int) RETURNS jsonb`:
- Assert actor = active owner + `hr:manage_employee`.
- `SELECT ... FROM profiles ... WHERE id=p_profile_id AND tenant_id=auth_tenant_id() FOR UPDATE`.
- `INSERT employees` (typed params/`jsonb_to_record`, KHÔNG `jsonb_to_recordset` cho object đơn).
- `INSERT annual_leave_entitlements` công thức đúng: `start_date < năm-01-01 → 12`; `> năm-12-31 → 0`; else `GREATEST(0, 13 − EXTRACT(MONTH FROM start_date))`. `ON CONFLICT (tenant_id, employee_id, year) DO NOTHING`.
- Nếu `p_contract`: `INSERT employment_contracts` (NOT NULL per baseline:46590-46614), rely trigger `trg_contract_sync_insurance` + gọi `sync_insurance_base` trong tx, check kết quả, raise nếu fail.

RPC `seed_annual_leave_entitlement_year(p_year int) RETURNS jsonb`: idempotent backfill/rollover năm mới cho mọi employee active (hoặc thiếu row năm trước). Owner-gated + log_audit.

**F8 cột tường minh**: `ALTER TABLE attendance_records ADD COLUMN counts_for_workday boolean DEFAULT true NOT NULL;` RPC `force_close_stale_attendance` set `counts_for_workday=false`. Backfill SQL set false cho row `check_out = check_in` rõ ràng; **audit** (SELECT count + sample) timestamp bằng nhau không khớp force-close → report owner trước khi backfill mù.

**1B. `hr/actions.ts`**:
- `createEmployeeAccount` (281-479): giữ `admin.createUser` (GoTrue không join PG — boundary bù đắp, comment 276-280), sau trigger tạo profile gọi **1 RPC `provision_employee_record`** qua authenticated `supabase` client. Giữ `deleteUser` rollback duy nhất. Mô tả chính xác "DB-atomic provisioning" (không "fully atomic onboarding"). Xóa `upsertActiveContract` inline.

**1C. Công-math fix**: `payroll-day-math.ts:66-91` `buildCompletedWorkdays` + `workday-math.ts` + `hr/actions.ts:1340-1341`: chỉ đếm record `counts_for_workday === true` (thay `check_out IS NOT NULL`). Giữ `check_out IS NOT NULL` cho "completed" nhưng cộng `counts_for_workday` cho "credited công".

**1D. UI admin entitlement**: thêm section "Phép năm" vào `hr/employee-form-dialog.tsx`: `annualLeaveDays` (0-60, default 12) + year selector. Action `upsert_annual_leave_entitlement` RPC (owner + `hr:manage_employee`). Cho sửa năm trước (final-pay cần).

**1E. Payroll preflight `missing_entitlement`**: `payroll-preflight.ts` thêm kind `'missing_entitlement'` (BLOCKER_ORDER=3), `PayrollPreflightInput.missingEntitlementEmployeeIds` = employees không có entitlement row cho `input.year`. `payroll-actions.ts:741-764` tính list. `payroll-list-client.tsx:163-204` case + copy. `canSnapshot` chặn.

**1F. Inactive-vanish fix** (`payroll-actions.ts:557-559`): predicate payable-in-period = `workdaysByEmployee` ∪ `approvedLeaveByEmployee` ∪ `adjustmentsByEmployee` ∪ `finalizedByEmployee` (KHÔNG chỉ contract — tránh sống lại NV nghỉ việc có contract active stale). Giữ `is_active` cho badge "Đã nghỉ (tính kỳ này)".

**1G. Tests**: SQL + unit: force-close (0 công), normal (0.5), 2 ca (1.0), missing-entitlement preflight blocks, prorate boundary (Jan1=12/Dec31=1/mid-year).

---

### Phase 3 — /hr/staff rút gọn + server guard + orphan repair (PR #2)

- **Server enforcement** (không chỉ UI): trong `createStaff` + `updateStaff` (`hr/staff/actions.ts`), reject khi `requiredBranchKindForPositionCode(position_code) !== null` (chỉ role tenant-level: accountant; owner đã loại). UI `hr/staff/page.tsx:81-96` filter đồng bộ.
- **Orphan repair CTA**: trong `/hr/staff` list, phát hiện profile không có `employees` row (join) → banner + nút "Tạo hồ sơ nhân viên" gọi `provision_employee_record` cho profile tồn tại (audited). Hoặc RPC backfill 1 lần.
- **`mapCreateUserError`** table-driven (mirror `mapPositionTaskError`): map 9 markers `handle_new_user` (`d088_b_full_ops_roles.sql:261-394`) — nhưng **preflight trước** (position tồn tại, role_template tồn tại) và giữ opaque fallback vì GoTrue có thể trả generic "database error creating user".

---

### Phase 2 — Consumption đầy đủ (PR #3) — land SAU P1/P3, TRƯỚC P4

**2A. Migration `supabase/migrations/20260801100000_hr_consumption_link.sql`**:
- `ALTER TABLE attendance_checklist_items ADD COLUMN position_task_id bigint REFERENCES position_shift_tasks(id) ON DELETE SET NULL;` + index `(tenant_id, position_task_id)`.
- Redefine `employee_clock_in_with_checklist` (`baseline.sql:15681-15701`): snapshot thêm `t.id AS position_task_id`; redefine `search_path TO ''` + schema-qualify.
- Sửa `employee_submit_consumption_report` (`baseline.sql:15978-15989`): validate `default_item_id` qua `ci.position_task_id = d.position_task_id` (KHÔNG `template_item_id`). Redefine `search_path TO ''`.
- **Notification trong RPC** (không action): sau write report/lines, INSERT `notifications` (trusted tenant/branch/roles, dedup key stable, action_url route approval) — theo `docs/spec/toast-notification-system.md:147-150,239-244`.
- **Recreate RLS `shift_checklist_consumption_default_items_select`** (`baseline.sql:62739-62755`): đổi join sang `position_shift_tasks` qua `position_task_id` (hiện phụ thuộc 100% legacy template tables).
- **Xử lý active attendance post-deployment (gemini)**: tại thời điểm migration, các `attendance_records` đang mở (`check_out IS NULL`) có `attendance_checklist_items.position_task_id IS NULL` (snapshot cũ không lưu `t.id`). Để không block NV đang trong ca nộp consumption sau deploy:
  - **Backfill**: UPDATE `attendance_checklist_items` set `position_task_id` từ join lại `position_shift_tasks` theo `(position_id hiện tại của employee, title/phase/applicability)` cho các row thuộc attendance đang mở. Chỉ backfill row `position_task_id IS NULL` AND attendance `check_out IS NULL`.
  - **Fallback check trong `employee_submit_consumption_report`**: nếu dòng checklist `position_task_id IS NULL`, re-derive default items từ `position_id` hiện tại của employee (qua `employees.profile_id = auth.uid()` → `profiles.position_id` → `position_shift_tasks` kind=`consumption_report`) thay vì reject. Document đây là backward-compat cho snapshot cũ; snapshot mới (post-migration) luôn có `position_task_id`.
  - Test: NV clock-in trước migration, submit consumption sau migration → pass (qua fallback); NV clock-in sau migration → `position_task_id` được lưu.

**2B. Staff submit** (mirror `lib/staff-runtime/count/`): `lib/staff-runtime/consumption/{actions.ts,page.tsx,consumption-client.tsx}`. Validate: positive bounded quantity, duplicate ingredient, note ≤500, no-consumption mode, resubmission. Decision tường minh: **1 consumption_report task/attendance** (document).

**2C. Tasks integration**: `tasks-client.tsx:184-243` thêm nhánh `consumption_report` (CTA "Nhập tiêu hao" thay checkbox).

**2D. Manager approval** (mirror `inventory/count-slips/`): `/br/[branchId]/(operator)/shift/consumption-approvals/` — loader + Sheet review + Approve (`branch_manager_approve_consumption_report`, quyền `HR_APPROVE_CHECKOUT`) + Send-back (RPC mới `request_consumption_revision` → `submitted→needs_changes`). Cross-branch denial, idempotency, inventory shortage mapping.

**2E. Route registration đầy đủ**: `module-acl.ts` + `route-map.ts`/`route-resolution.ts` + `nav-config.ts` + generated route-matrix (không chỉ nav copy).

**2F. Tests**: e2e (submit → approve → `stock_movements` có row) + SQL test (position_task_id link, validation).

---

### Phase 4 — Drop legacy template, chia 2

**P4a — code-first (PR #4)** (KHÔNG migration, DB column còn đó):
- Xóa `hr/checklist-coverage.ts` + test `tests/hr-checklist-coverage.test.ts` (orphan, no prod caller).
- `hr/actions.ts`: xóa `loadChecklistTemplateBranch` (174-187), `default_checklist_template_id` khỏi `EMPLOYEE_SELECT_OWNER`/create/update, 2 attendance join (971, 1032).
- `hr/_types.ts:19,37`; `hr/attendance-table.tsx:106,905`; `br/[branchId]/(operator)/team/data.ts` (8 site); `attendance_checklist_items.template_item_id` read ở `today-work-state.ts:295-311` (quyết định: discard template provenance — document).
- Sửa 3 static test `packages/shared/src/auth/__tests__/` (employee-daily-work, canonical-auth-cleanup, hr-permission-contract).
- Verify build pass.

**P4b — destructive migration (PR #5, sau deploy P4a)**: `supabase/migrations/20260801110000_drop_legacy_checklist_templates.sql` — KHÔNG CASCADE. Thứ tự:
1. Redefine `upsert_position_shift_tasks` (bỏ nhánh `template_item_id`, `baseline.sql:44613-44625`).
2. Recreate `shift_checklist_consumption_default_items_select` (đã ở P2).
3. Gỡ index/FK (`idx_..._template`, `uq_shift_checklist_consumption_default_items_active`).
4. DROP COLUMN `attendance_records.checklist_template_id`, `employees.default_checklist_template_id`, `positions.default_checklist_template_id`, `attendance_checklist_items.template_item_id`, `shift_checklist_consumption_default_items.template_item_id` (+ relax CHECK `parent_present` → yêu cầu `position_task_id IS NOT NULL`).
5. DROP FUNCTION `upsert_shift_checklist_template`.
6. DROP TABLE `shift_checklist_template_items`, `shift_checklist_templates` (KHÔNG CASCADE).
7. `corepack pnpm db:types`.

---

### Phase 6A — Contract history + append + period-effective payroll (PR #6)

**Migration `supabase/migrations/20260801120000_hr_contract_history.sql`**:
- RPC `create_contract_revision(p_employee_id, p_new_contract jsonb, p_effective_date) RETURNS jsonb`: append hợp đồng mới + mark cũ `expired` (status + end_date=effective) atomic; khóa row employee; **partial unique constraint** 1 active contract/employee (`CREATE UNIQUE INDEX uq_one_active_contract ON employment_contracts (tenant_id, employee_id) WHERE status='active'`).
- **KHÔNG synthesize history cũ**: mỗi row hiện tại = baseline immutable; document trong ADR "history begins at migration".
- **Tách compensation amendment khỏi contract sequence**: salary change KHÔNG tạo contract mới, KHÔNG tăng `contract_sequence`. Chỉ re-sign/gia hạn/từ loại = revision.
- RPC `list_contract_history(p_employee_id) RETURNS table(...)`.
- **Payroll period-effective (BẮT BUỘC đi cùng)**: sửa `payroll-actions.ts:314-323` chọn contract effective cho kỳ (status active OR expired-with-overlap), KHÔNG chỉ `status='active'`. Không có cái này, mark-expire làm historical draft payroll fallback sai `employees.base_salary`.
- **Quy tắc chọn contract khi revision giữa tháng (gemini)**: Payroll V1 đánh giá base compensation theo **contract active tại period end date / snapshot date** — không prorate giữa các contract trong cùng kỳ. Ví dụ: thử việc kết thúc 15/06, HĐ mới từ 16/06 → kỳ 06 dùng HĐ active tại `2026-06-30` (HĐ mới). Rationale: giữ đơn giản cho V1; nếu sau này cần prorate giữa tháng sẽ là decision riêng (Payroll V2). Document quy tắc này trong ADR D0XX (mục contract/probation semantics). Test: revision giữa tháng → kỳ dùng contract tại period-end, không fallback `employees.base_salary`.
- UI tab "Hợp đồng" trong employee detail (P7) — list history + create revision + view từng row.
- Tests: append+expire atomic, period-effective payroll, immutable snapshot, regression PIT/cap pass.

---

### Phase 6B — Terminate + probation + sequence warning (PR #7)

**Migration `supabase/migrations/20260801130000_hr_contract_lifecycle.sql`**:
- RPC `terminate_contract(p_contract_id, p_terminated_at, p_notice_date, p_reason_code, p_reason_note, p_immediate boolean) RETURNS jsonb`: set `status='terminated'` + `terminated_at`/`termination_notice_date`/`termination_reason`; **notice-period validation theo `labor-contracts.md` §4.1** + exception/waiver path audited (immediate-termination exceptions §4.1 `labor-contracts.md:91-103`).
- RPC `expire_contracts_reaching_end_date()` (cron hoặc manual): contract chạm `end_date` không touched → `status='expired'` (natural expiry handler).
- **Probation (theo luật, không universal)**: HR chọn `probation_arrangement` (none/separate_contract/probation_clause) + `probation_end_date` + `probation_salary` tường minh. Payroll: nếu `separate_contract` + trong thời thử việc → dùng `probation_salary`, **không trừ BHXH** (`labor-contracts.md:28-33`); nếu `probation_clause` trong HĐLĐ → **vẫn đóng BHXH**. Logic trong `packages/shared/src/payroll/legal-versions.ts`/`calculate.ts`.
- **3rd-fixed-term warning (soft, không block)**: trước khi tạo HĐXĐT, đếm **2 HĐXĐT liên tiếp trước** (không tính probation/amendment); nếu đúng → warning UI. KHÔNG `contract_sequence=3`.
- **REVOKE direct DML** (RLS hole, `baseline.sql:67624-67625`): `REVOKE INSERT,UPDATE,DELETE ON employment_contracts FROM anon, authenticated;` → lifecycle mutations RPC-only.
- Tests: closed-period payroll regression, boundary-date (probation end), concurrent revision/terminate, immutable snapshot. Regression `PAYROLL-2026-FIVE-BRACKET-AND-BHXH-CAP-STEP` pass.

---

### Phase 7 — Hồ sơ tối thiểu vận hành (PR #8)

**Migration `supabase/migrations/20260801140000_hr_employee_profile.sql`**:
- `ALTER TABLE employees ADD COLUMN exit_date date, ADD COLUMN exit_reason text;` (đã verify thiếu).
- RPC `offboard_employee(p_employee_id, p_exit_date, p_reason) RETURNS jsonb`: **1 atomic RPC** — deactivate `employees.is_active` + `profiles.is_active` + terminate active contract (gọi logic 6B trong tx) + revoke permissions + kill sessions (**reuse logic `update_staff_profile` ở `d088.sql:43888-43973`** trong tx, không chain action).
- Mở rộng update boundary: `update_my_profile` nhận `birth_date`; `update_employee`/`provision_employee_record` nhận `bank_name`.
- **Employee detail page** `apps/web/app/(protected)/hr/employees/[id]/page.tsx`: dossier chỉ-đọc (identity/work/contract history (6A)/salary/attendance summary phân trang/permissions link qua `profile_id`). Owner-only auth, PII masking trong log.
- UI: offboard button trong detail → dialog (exit_date, reason) → `offboard_employee`. `bank_name` + DOB field trong edit dialog.
- **Compliance deferral** đã ở Bước 0 (ADR).
- Tests: owner-only detail auth (negative IDOR), offboard atomic proof, PII log masking.

---

### Phase 6C — Document upload (PR #9)

**Migration `supabase/migrations/20260801150000_hr_document_storage.sql`**:
- Storage bucket `hr-documents` (RLS: owner full, employee read-own qua `profile_id`).
- `employment_contracts.document_url` = **immutable object path** (tenant/employee/contract-scoped), KHÔNG signed URL. Signed URL sinh read-time sau auth.
- Upload: size/MIME limit, no overwrite, compensating object deletion nếu DB linkage fail.
- UI upload HĐLĐ PDF/CCCD scan trong contract tab (6A) + detail page.

---

### Phase 8 — Dọn nợ phụ (PR #10)

- **F2**: xóa hẳn dead machinery `hasStaffOrTasks` (`position-tasks-actions.ts:191-207`), cố ý show tất cả assignable positions (KHÔNG chỉ bỏ `|| true` — filter active sẽ ẩn position trước khi có staff).
- **F7 shift validation**: `shiftSchema` (`hr/actions.ts:735-743`) + `shift-form-dialog.tsx`: reject `start===end`, **cho phép `end<start`** (overnight đã support `default-shift.ts:105-116`).
- **F7 re-activate shift**: `shifts-table.tsx` thêm nút re-activate (gọi `updateShift({isActive:true})`); account future roster references (P5).
- **F7 stale comment**: xóa comment "create-only" sai `employee-form-dialog.tsx:78-84`.
- **`seasonal`**: move sang P6 (contract model change — runtime chỉ 3 type `hr/actions.ts:33`, DB còn seasonal `baseline.sql:46612` → cleanup ở 6B).
- **`during_shift`**: render/migrate **trước** cleanup (move sang owning phase, không P8).

---

### Phase 5 — Rostering optional overlay (PR #11) — ADR 0019 ĐÃ ACTIVATE

**Migration `supabase/migrations/20260801160000_hr_shift_assignments.sql`**:
- Bảng **`shift_assignments`** (domain term đúng, precedent `migration-archive/20260611103000`): `(id, tenant_id, branch_id, employee_id, shift_id, work_date date, status, assigned_by, assigned_at, cancelled_at, note)`, UNIQUE active `(tenant_id, employee_id, work_date, shift_id) WHERE status='active'`. RLS: employee self-read, manager branch-read, owner full. Audit fields. ACL permission mới `hr:manage_roster`.
- RPC `upsert_shift_assignments(p_branch_id, p_week_start date, p_entries jsonb) RETURNS jsonb`: **atomic set-reconciliation** cho tuần (advisory lock branch/week), validate shift active + thuộc branch, cancel-vs-delete (status='cancelled' không hard delete).
- **Clock-in enforcement TRONG RPC** (không TS): `employee_clock_in_with_checklist` — nếu có assignment cho `(employee, date)` → ưu tiên shift đó; policy optional → cho clock-in ngoài ca (warning); mandatory (decision sau) → reject `shift_not_assigned`. **Branch_manager direct insert path** (`clock/actions.ts:316-329`) cũng cover.
- **Match assignment theo `business_date` (KHÔNG calendar_date) — gemini**: clock-in RPC nhận `p_business_date` đã được resolve overnight ở TS (`default-shift.ts:30-76` `resolveShiftBusinessDate`: clock-in 23:30 hoặc 01:30 → business_date có thể lùi 1 ngày). Phải join `shift_assignments` trên `WHERE employee_id=p_employee_id AND work_date=p_business_date AND shift_id=p_shift_id AND status='active'` — dùng chính `p_business_date` truyền vào, KHÔNG dùng `CURRENT_DATE`/calendar date trong RPC. Test: ca đêm (vd 22:00–02:00) clock-in lúc 01:30 với business_date lùi 1 ngày → khớp assignment đúng ca đêm, không khớp ca sáng hôm sau.
- **UI**: mở rộng route schedule hiện có `apps/web/lib/staff-runtime/schedule/` (KHÔNG tạo view thứ hai) — thêm forward schedule từ assignments. Manager: `/br/[branchId]/(operator)/shift/roster/` (weekly grid × employee × shift). Owner: `/hr/attendance` thêm tab "Lịch ca" read-only tổng.
- **Edge cases**: concurrent weekly editors (advisory lock), overnight business_date, edit sau shift start, inactive shift với future assignment, multi-shift days, employee transfer branch.
- Tests: e2e (assign → clock-in ưu tiên assignment) + SQL test (concurrent, cancel-vs-delete, enforcement).

---

### Phase 9b — Tenant-level staff workflow (accountant + central) (PR #12)

Điều tra bổ sung phát hiện: accountant (tenant-level, `branch_id = NULL`) và central roles (site-pinned) có workflow HRM đứt đoạn ở nhiều điểm. Owner chốt xử lý 4 vấn đề + câu hỏi định tuyến.

**Bối cảnh (đã verify):**
- **Accountant**: `branch_id = NULL` (by-design, `check_branch_required` raise nếu gán branch). ACL `/hr`, `/hr/payroll` = `["owner"]` → accountant không vào được. Login redirect → `/finance`. Hiện **KHÔNG có surface nhân viên nào** (không chấm công — by-design OK; nhưng cũng không xem payslip/lịch/phép của chính mình).
- **Central roles**: central site (`Kho Tổng`, `Bếp Trung Tâm`) là record trong `branches` với `branch_kind = central_supply|central_kitchen` → là "branch" vận hành. Chấm công/schedule/leave **OK** ở central site. Bug: onboarding `/hr/staff` không tạo `employees` row.

**9b.1 Payroll fixed-salary path (F-new, accountant):**
- Vấn đề: `fetchPayrollPreview` (`payroll-actions.ts:272-302, 557-559`) load accountant vào kỳ lương, prorate theo `workingDays=0` (accountant không chấm công) → `proratedSalary=0` (`payroll-actions.ts:628-630`). Kỳ lương méo.
- Sửa: thêm flag `is_salaried_fixed` (hoặc detect tenant-level role qua `profiles.position_id` → role `accountant`) → skip proration, dùng `gross_salary` nguyên tháng (`payableDays = standardDays`). Cập nhật `calculate.ts` branch "fixed-salary" hoặc filter ở `buildPayrollPreview`. Document: tenant-level salaried staff không prorate theo attendance (theo `labor-contracts.md` — staff văn phòng hưởng lương tháng).

**9b.2 Tenant-level leave path (F-new, accountant):**
- Vấn đề: `submitLeaveRequest` (`lib/staff-runtime/leave/actions.ts:21`) đòi `branchId: z.coerce.number().positive()` + RPC `submit_leave_request` (`baseline.sql:41449-41518`) đòi `p_branch_id` → accountant không xin nghỉ được.
- Migration: RPC `submit_leave_request_tenant(p_start_date, p_end_date, p_leave_type, p_reason)` — cho roles `branch_id IS NULL`, resolve employee qua `profile_id = auth.uid()`, không đòi branch. Quota dùng cùng `annual_leave_entitlements`. Approval routing → owner (không có branch_manager).
- Action `submitLeaveRequestTenant` + UI trong `/me/leave` (xem 9b.4).

**9b.3 Align role_template D088 vs fixture (F-new):**
- Vấn đề: prod template (`d088_b_full_ops_roles.sql:88-92`) cho accountant chỉ `['procurement:read']`; ACL `finance` cho phép `["owner","accountant"]` → accountant vào `/finance` nhưng thiếu quyền (`finance:view`, `finance:ap_pay`, `finance:expense_approve`, `finance:expense_create`). Central roles cũng mismatch (fixture thêm transfer/request keys).
- Migration `align_accountant_central_role_templates.sql`: UPDATE `role_templates` cho accountant/central_supply_ops/central_kitchen_lead khớp ACL thực + `permissions.ts` catalog. Audit log. Quyết định: align theo **fixture** (đầy đủ) hay **ACL thực tế cần** — cần owner chọn trong implementation (em đề xuất align theo ACL thực tế được dùng bởi `/finance`/`/inventory`).

**9b.4 Central onboarding consistency (F-new):**
- Vấn đề: central roles onboard qua `/hr/staff` (`createStaff`) không tạo `employees` row → staff-runtime-context null → không chấm công/schedule/leave. Qua `/hr` (`createEmployeeAccount`) thì có.
- Sửa: cùng hướng P3 — restrict `/hr/staff` chỉ tenant-level (accountant); central roles CHỈ tạo qua `/hr`. Hoặc: `createStaff` gọi `provision_employee_record` khi position là operational. Owner chốt hướng trong P9b (thống nhất với P3).

**9b.5 Tenant-level self surface `/me/*` (accountant, F-new):**
- Vấn đề: accountant không có nơi chấm công (OK by-design) NHƯNG cũng không xem được payslip/lịch phép/contract của chính mình. Câu hỏi owner: "Employee sẽ vào đâu để chấm công, lịch, xem ca làm, lương".
- Trả lời thiết kế: tạo **`/me/*` surface tenant-level** (không branch-scoped):
  - `/me/payslip` — payslip của chính user (đã có logic `lib/staff-runtime/payslip/`, route hiện `/br/[branchId]/...` — extract ra tenant variant).
  - `/me/leave` — xin nghỉ + history (gọi `submit_leave_request_tenant` 9b.2).
  - `/me/contract` — xem HĐLĐ của chính user (read-only).
  - `/me/schedule` — **KHÔNG áp dụng** accountant (không có ca) → ẩn hoặc hiện "Không áp dụng (hưởng lương tháng)".
  - Chấm công: **KHÔNG** — accountant by-design không chấm công (hưởng lương tháng). Surface này không có clock-in.
- Route ACL: `module-acl.ts` thêm `moduleKey "me"` allowedRoles mọi role đã có employees row. Nav thêm vào top-bar cho non-branch roles.
- Tests: accountant xem được payslip (fixed-salary 9b.1), leave tenant path, contract read-only, IDOR (accountant không xem được của người khác).

**9b.6 Tests:** payroll fixed-salary (accountant = nguyên tháng), leave tenant (submit + owner approve), role_template align (accountant có đủ finance keys), central onboarding (qua /hr có employees row), `/me/*` IDOR.

---

### Phase 10 — Việc trong ca: override theo NV + cải thiện UX (PR #13, sau P5)

Owner chốt (2026-08-01): giữ **position_shift_tasks làm SSOT** (a) + thêm **(b) override theo NV** (scoped: thêm/bớt/tắt, KHÔNG tạo list riêng) + cải thiện UX cả 2 surface. Làm **SAU P5** vì snapshot logic cần đồng bộ với rostering.

**Bối cảnh (đã verify điều tra UI):**
- Ca làm (`shifts-table.tsx`/`shift-form-dialog.tsx`): switch mở/đóng ca mơ hồ không label; không re-activate (F7); form không validate `start===end`/qua đêm (F7); mobile card thiếu info; không preview.
- Việc trong ca (`position-tasks-client.tsx`): dropdown ồn do `|| true` (F2); không reorder UI dù có `sort_order`; `consumption_report` chết runtime (F3); không preview NV thấy gì; không copy giữa position; không `during_shift`.
- Hiện hành: task theo position → snapshot vào `attendance_checklist_items` khi clock-in (`baseline.sql:15681-15701`). KHÔNG có override-per-NV (D052 gỡ rồi), KHÔNG có UI chỉnh snapshot trực tiếp (chỉ toggle `is_done`).

**10A. UX ca làm (`shifts-table.tsx` + `shift-form-dialog.tsx` + P5 rostering UI):**
- **Re-activate ca** (F7): `shifts-table.tsx` thêm nút bật lại cho ca inactive (gọi `updateShift({isActive:true})` — RPC đã hỗ trợ).
- **Validate giờ** (F7): `shiftSchema` (`hr/actions.ts:735-743`) + `shift-form-dialog.tsx` reject `start===end`, **cho phép `end<start`** (overnight đã support `default-shift.ts:105-116`).
- **Label switch mở/đóng ca**: thêm tooltip/help text giải thích switch `is_opening`/`is_closing` gating gì (drives `position_shift_tasks.applicability` `opening`/`closing`).
- **Preview ca**: khi sửa/tạo ca, hiển thị "ca này áp dụng mọi chi nhánh (global)" + list position nào có task `opening`/`closing` sẽ bị ảnh hưởng.
- **Mobile card**: hiện switch mở/đóng + nút sửa trực tiếp (không giấu trong drawer).

**10B. UX việc trong ca (`position-tasks-client.tsx`):**
- **Reorder UI**: thêm drag-handle (hoặc up/down arrow) cho task row, persist `sort_order` (đã có sẵn).
- **Dọn `|| true`** (F2, P8 move sang đây): xóa dead machinery `hasStaffOrTasks` (`position-tasks-actions.ts:205-209`), cố ý show tất cả assignable positions.
- **Preview "NV sẽ thấy gì"**: thêm panel mock hiển thị task list theo phase (đầu ca/cuối ca) cho 1 NV mẫu của position đó.
- **Copy task giữa position**: nút "sao chép từ position khác" để tái dùng bộ task.
- **`during_shift`** (F7): render phase giữa ca ở cả config lẫn runtime (`tasks-client.tsx:27` thêm `'during_shift'` vào `CHECKLIST_PHASES`).
- **`consumption_report` runtime** (F3): wire form nhập tiêu hao (P2 đã cover phần RPC/UI submit; ở đây đảm bảo runtime tasks-client hiển thị CTA đúng cho `consumption_report` thay checkbox).

**10C. Override theo NV (F-new, core của Phase 10):**
- Migration `supabase/migrations/20260802000000_hr_employee_task_override.sql`:
  - Bảng **`employee_task_overrides`**: `(id, tenant_id, employee_id, position_task_id bigint NULL, action text CHECK in {add,skip,replace}, override_title text NULL, override_done_definition text NULL, is_active bool, note text, created_by, created_at, updated_at)`. RLS: owner full, self read, manager branch-scoped.
    - `action='add'`: thêm task ad-hoc (position_task_id NULL, override_title NOT NULL).
    - `action='skip'`: ẩn 1 task position (position_task_id NOT NULL) cho NV này.
    - `action='replace'`: đổi title/done_definition (position_task_id NOT NULL + override fields).
  - RPC `upsert_employee_task_overrides(p_employee_id, p_entries jsonb)`: set-reconciliation per-NV, advisory lock employee.
- **Snapshot logic mở rộng**: `employee_clock_in_with_checklist` (`baseline.sql:15681-15701`) khi snapshot `position_shift_tasks` → apply overrides: skip task bị `skip`, replace title/done_definition cho `replace`, append `add` task. Result: `attendance_checklist_items` snapshot đã phản ánh override (bất biến sau clock-in).
- **UI override**: trong employee detail page (P7 `/hr/employees/[id]`), thêm tab "Việc trong ca" — list task position hiện tại + nút "bỏ qua"/"đổi tên"/"thêm task riêng". Preview effect.
- **Policy**: override chỉ owner + branch_manager (same branch). Document: override là ngoại lệ, không thay position mặc định; có audit.

**10D. KHÔNG làm** (owner chọn (a)+(b), bỏ (c)(d)):
- (c) template rời (`shift_checklist_templates`): P4 drop, KHÔNG xây.
- (d) chỉnh snapshot trực tiếp (`attendance_checklist_items` post-clock-in): KHÔNG làm — override (10C) cover nhu cầu cá nhân hóa trước clock-in; snapshot sau clock-in giữ bất biến.

**10E. Tests:** override add/skip/replace → snapshot đúng; reorder persist; `during_shift` render; preview match runtime; IDOR override (manager chỉ sửa branch mình).

---

## 4. Thứ tự triển khai cuối

```
Bước 0: ADR (activate 0019 — đảo D012 rostering clause + amend D026/D027 + contract/probation semantics)
P1 (blocker lương) → P3 (/hr/staff + orphan repair) → P2 (consumption, land trước P4)
→ P4a (code-first) → [deploy P4a] → P4b (destructive migration)
→ P6A (contract history + period-effective payroll) → P6B (terminate+probation+sequence)
→ P7 (detail + offboarding) → P6C (document) → P8 (dọn nợ)
→ P5 (rostering optional overlay — ADR 0019 ĐÃ ACTIVATE; mandatory = decision riêng sau)
→ P9b (tenant-level staff workflow: accountant fixed-salary + tenant leave + role_template align + /me surface)
→ P10 (việc trong ca: override theo NV + UX ca làm + UX position tasks)
```

**P9b đặt sau P8** (phụ thuộc P1/P6A/P7). **P10 đặt sau P5** (snapshot logic cần
đồng bộ rostering; override tab nằm trong employee detail page P7). **P5 giờ
được code** — ADR 0019 đã Accepted.

## 5. Rủi ro chính đã address

- F8 sentinel → cột tường minh `counts_for_workday` + backfill audited.
- Entitlement prorate → công thức đúng (13−month, Dec31→1).
- Inactive-payable → union attendance/leave/adjustments/finalized (không contract-only).
- Contract history → preserve baseline, KHÔNG synthesize; period-effective payroll bắt buộc đi cùng.
- Probation → theo luật (85% min, BHXH theo arrangement), không universal.
- Drop template → KHÔNG CASCADE, recreate RLS consumption trước.
- Roster → optional overlay + fallback, mandatory = decision sau.
- Contract DML hole → revoke anon/authenticated, RPC-only.
- Mọi bảng/RPC mới → grants + RLS + revoke DML + tenant-safe + negative IDOR test + SQL test.
- Mỗi phase DB → cập nhật generated types + fixtures + catalog + guards + route-matrix trong cùng PR.

### Rev 3 (sau điều tra tenant-level roles)
- **P9b mới** (§3): tenant-level staff workflow — accountant fixed-salary payroll, tenant-level leave, align role_template D088 vs fixture, central onboarding consistency, surface `/me/*` cho non-branch staff (payslip/leave/contract). Phát hiện từ điều tra: accountant hiện KHÔNG có surface nhân viên nào (không vào được /hr /hr/payroll ACL owner-only, branch_id NULL chặn route /br/*).

---

## 6. Changelog

- **Rev 2 (sau review Gemini)**: bổ sung 4 điểm kỹ thuật —
  1. **P2 active attendance post-deployment** (§3 Phase 2 2A): backfill `position_task_id` cho attendance đang mở + fallback re-derive trong submit RPC.
  2. **P6A mid-month contract revision** (§3 Phase 6A): quy tắc Payroll V1 = contract active tại period-end/snapshot date (không prorate giữa tháng).
  3. **P5 overnight business_date matching** (§3 Phase 5): match `shift_assignments` qua `p_business_date` (resolve overnight), không `CURRENT_DATE`.
  4. **Cross-cutting ACL theo permission-key** (§0): mọi RPC lifecycle mới dùng `has_permission_any(auth.uid(), ARRAY['<key>'])` khớp `module-acl.ts`/`permissions.ts`, không hardcode role.
- **Rev 3 (sau điều tra tenant-level roles)**: P9b mới — accountant fixed-salary payroll, tenant-level leave, align role_template D088, central onboarding consistency, surface `/me/*` cho non-branch staff.
- **Rev 4 (owner chốt 2026-08-01)**: (1) **ADR 0019 activated** (Parked → Accepted) — P5/P6A/P6B được code. (2) **Phase 10 mới** — việc trong ca: giữ position làm SSOT + override theo NV (bảng `employee_task_overrides`, action add/skip/replace) + cải thiện UX cả 2 surface (ca làm: re-activate/validate/label/preview; position tasks: reorder/preview/copy/during_shift/consumption runtime). KHÔNG làm template rời (c) hay chỉnh snapshot post-clock-in (d).
