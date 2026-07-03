# "Đội hôm nay" — Branch Team Board Spec (2026-07-03)

> Reconciled-through 42695ad6d90f
> Status: **Spec only — no code changes in this worklog.**
> Decision context: D052 (Việc trong ca redesign), D059 (Branch-complete).
> Read first: `docs/plan/decisions.md` D052/D058/D059, `docs/spec/page-archetypes.md`,
> `docs/agent/rules/ui.md`, `docs/ref/operational-data-contract.md`,
> `docs/plan/viec-trong-ca-redesign-2026-06-29.md`,
> `docs/worklog/branch-hub-gap-audit-2026-07-03.md`.

## Tóm tắt điều hành (Tiếng Việt)

Owner phàn nàn đúng: `branch_manager` hiện quản nhân sự chi nhánh nhưng
**không có màn nào cho biết "ai đang làm gì hôm nay"**. `/br/[branchId]/dashboard`
(Branch Command) chỉ có 1 con số tổng — `setupActiveStaff` (đếm nhân viên active)
— không có danh sách theo người. HR (`/hr`) có bảng chấm công per-employee
nhưng đó là bàn văn phòng, tháng-theo-tháng, không phải "hôm nay, tại chi
nhánh của tôi, ai đang thiếu việc".

Spec này thiết kế **"Đội hôm nay"** — 1 route mới `/br/[branchId]/team`, archetype
**LIST** (không phải DASHBOARD — đây là danh sách người, không phải KPI). Mỗi
dòng = 1 nhân viên hôm nay: ca đã đăng ký/đã chấm công, tiến độ Việc-trong-ca
(Đầu ca/Cuối ca theo D052), trạng thái Kiểm kê nếu được giao, trạng thái nghỉ
phép. Bấm vào dòng mở chi tiết người đó hoặc điều hướng sang cửa hành động có
sẵn (Duyệt kết ca, Duyệt kiểm kê) — **không** tạo hành động mới nào ở đây.

**Phát hiện quan trọng nhất:** mọi nguồn dữ liệu cần (chấm công, checklist
item, count assignment/slip, leave request) đã có RLS mở cho `branch_manager`
đọc TOÀN BỘ nhân viên tại chi nhánh của mình — xác nhận trực tiếp 4 policy
trong `00000000000000_baseline.sql`. **Không cần RPC mới, không cần đổi RLS.**
Đây là tier **T2** (đọc-tổng-hợp qua RLS có sẵn + 1 aggregate query mới), KHÔNG
phải T3. Duy nhất thiếu là 1 aggregate READ mới gộp 4 nguồn theo `employee_id`
— chưa tồn tại ở bất kỳ đâu trong code hiện tại.

**Câu hỏi cần owner quyết (tối đa 3):**
1. Route home `/br/[branchId]/team` hay gộp vào tab thứ 2 của `/br/[branchId]/dashboard`?
2. WM/PM ở central site có xem "Đội hôm nay" của site mình không, hay tile này chỉ owner/BM tại `branch_kind='branch'`?
3. "Vị trí thiếu cấu hình Việc trong ca" (P6 trong D052 design doc) — chặn hiển thị dòng đó là lỗi, hay chỉ cảnh báo nhẹ trong board này?

---

## 1. Surface Definition

### Route

**`/br/[branchId]/team`** (not `/staff` — `staff` is a reserved office-only
ModuleKey per `module-acl.ts:90-94`, owner-only account/role/permission
management; using `/staff` here would collide with that concept and violate
the D058 §9 "one door per job" rule by implying account-management scope this
surface does not have).

Follows the `EMBED-WRAPPER` + canonical `*PageContent` convention
(`docs/spec/page-archetypes.md` § 1, § 3 LIST): a canonical
`TeamBoardPageContent({ searchParams?, routeBranchId?, basePath?, embedded? })`
lives once, the operator route at `/br/[branchId]/(operator)/team/page.tsx`
re-mounts it embedded. No office-plane twin exists or is needed — this is a
branch-native-only surface (D059 §1: native surface, not an office_bridge tile).

### Archetype

**LIST**, not DASHBOARD. Justification against `docs/spec/page-archetypes.md`
§ 2/§ 3:

- The job is "browse today's staff, scan status, act on exceptions" — the
  literal LIST recipe job description ("Browse/filter/search a collection,
  row actions, quick CRUD" — read here as quick *drilldown*, not CRUD, matching
  the `notifications` § 4 named-exception precedent for a LIST without CRUD).
- It is **not** DASHBOARD: DASHBOARD's locked recipe (§ 3) is `KpiRow` of
  `KpiCard` with `href` drill-down — aggregate numbers, not row-level people
  data. `/br/[branchId]/dashboard` already owns that KPI job (revenue, paid
  orders, tables, kitchen orders) and MUST NOT be extended with a people-list
  — mixing an aggregate KPI page with a per-person roster violates "one
  workflow state, one visual source of truth" (`docs/agent/rules/ui.md`
  Operational UI Philosophy).
- Table shape: `DataTable` with `mobileCardRender` (phone-first, per D059 §6
  "mobile-first from Branch"), one row per employee, status badges per
  column-group (shift, checklist phase progress, count, leave). This is the
  same shape as `hr/attendance-table.tsx` (already proven per-employee,
  per-branch, `mobileCardRender`-covered per the D059 gap audit note "55
  office tables already mobileCardRender") — reuse its column/status pattern,
  do not invent a new visual language.
- No "8 named exceptions" precedent needed — this is a plain LIST once
  DASHBOARD is correctly ruled out for the reason above.

### Hub Tile Placement

Add to **`my_shift`** group (`packages/shared/src/auth/nav-config.ts:119-149`)
— NOT `approvals` (this board is read/browse, the actual approve actions stay
on `checkout-approvals` and `count-slips`) and NOT a new group (D058 §6 caps
`office_bridge` at ≤6 and this isn't a bridge tile at all — it's branch-native).
`my_shift` today only has "Chấm công" (self clock) and "Việc trong ca" (self
checklist) — both self-scoped. Adding "Đội hôm nay" as a manager-scoped view
inside the same group is consistent with the group's job ("today's shift
reality") while the `canAccess` gate (see Roles below) keeps it invisible to
cashier/chef, who only see the self-scoped two items already there.

New `OPERATOR_TILE_ITEMS` entry:

```ts
{
  moduleKey: "branch_team", // new ModuleKey — see § 5 build estimate
  icon: "Users",
  group: "my_shift",
  hrefTemplate: "/br/{branchId}/team",
  label: "Đội hôm nay",
}
```

### Roles

- **`owner` + `branch_manager`**: full read, same shape as `/br/[branchId]/dashboard`'s
  existing ACL (`branch_dashboard` ModuleKey pattern, `module-acl.ts:152-156`).
  New `ModuleKey` `branch_team` follows the same `allowedRoles: ["owner", "branch_manager"]`
  shape — this is a manager surface, not a floor-staff surface (cashier/chef
  do not get a peer-monitoring view; matches D012 "không thêm nghi thức quản
  trị" — floor staff already see their own state via "Việc trong ca").
- **`warehouse_manager` / `production_manager`** at central sites: **OPEN
  QUESTION #2**. Their site has staff too (a central kitchen has cooks/production
  staff on shift), and D055 already gives them `operator_home` at their central
  site. Recommendation: extend `branch_team` ACL to include them, scoped to
  their own `branch_id` (central site), since the underlying data (attendance,
  checklist, leave) is branch-agnostic in schema — but this needs an owner call
  because it's a scope expansion beyond D052's original branch_manager framing.
- **`office`**: no operator hub at all (D055 §3) — out of scope, unreachable regardless.

---

## 2. Row Model

One row per **employee with any signal today** (attendance record OR active
count assignment OR approved leave overlapping today OR — if Q1 is resolved
toward "warn on missing config" — a position with expected-but-unconfigured
tasks). Not every active employee at the branch — an employee with zero
signal today (not scheduled, no attendance, no assignment, no leave) does not
appear, since there is no forward schedule to compare against (see § 3, no
`shift_assignments` data — D012 confirmed, still 0 rows in prod today).

| Column | Source | Values |
|---|---|---|
| Nhân viên | `employees` + `profiles.full_name` | name, position label |
| Ca | `attendance_records.shift_id` → `shifts.name`, or "Chưa chấm công" if no record today | per-shift row if the employee clocked into >1 shift today (`TodayShiftEntry[]` shape from `today-work-state.ts:53-60` is the reference model for "multiple shifts today") |
| Chấm công | `attendance_records.check_in` / `check_out` / `checkout_requested_at` / `checkout_approved_at` | Chưa vào ca / Đang làm / Chờ duyệt kết ca / Đã kết ca |
| Việc trong ca | `attendance_checklist_items` aggregated `requiredDone/requiredRemaining` per D052 phase (Đầu ca/Cuối ca) | "3/5 việc bắt buộc" + phase badge |
| Kiểm kê | `inventory_count_assignments` (active) joined to today's `inventory_count_slips.status` | Không giao / Chưa nộp / Đã nộp / Đã duyệt |
| Nghỉ phép | `leave_requests` where `status='approved'` and today between `start_date`/`end_date` | badge only, row still shows (an employee on approved leave who also has a stale open shift from yesterday is exactly the "staleOpenShift" signal `today-work-state.ts:72` already models) |

### Tap → Action

**This board is read/browse only — it does not host new mutations.** Row tap
opens a **person detail** (secondary sheet/drawer, or a `?employee=` deep
param on the same route — implementation detail for the build slice, not
this spec) showing the same data as `today-work-state.ts`'s `TodayWorkState`
shape but for the tapped employee instead of `auth.uid()`. From person detail:

- **Chờ duyệt kết ca** → link to `/br/[branchId]/shift/checkout-approvals`
  (existing canonical action surface, D058 §5 ratifies this as canonical) —
  do NOT add an inline approve button on the board itself; that duplicates a
  door D058 §5 already canonicalized.
  - **Note on scope creep the board must reject:** `checkout-approvals/page.tsx`
    (21 lines) already re-keys to `employee_checkout_approvals` per D058 §5 —
    that page's own aggregate list of pending checkouts stays the single
    approval queue. Đội hôm nay is a *situational awareness* surface that
    happens to show the same underlying signal per-row; it must link out,
    never fork a second mutation path.
- **Kiểm kê chưa nộp/chưa duyệt** → link to `/br/[branchId]/stock/count-slips`
  (existing tile, `approvals` group) for approve, or `/inventory/count-assignments`
  office bridge for reassignment (count-assignments is still a monolith per
  the gap audit — REFACTOR-FIRST-M, out of scope here).
- **Nghỉ phép** → no action from this board; leave approval already lives at
  `/hr` (office plane, `hr:approve_leave_request`) — D059 §4 lists "HR
  approvals seam" (leave/attendance-correction) as a **future** extraction
  target (M-size), not yet native to the branch. Đội hôm nay reads leave
  status but does not attempt to front-run that extraction with a duplicate
  approve action.
- **"Nhắc" (nudge)**: explicitly **not in scope** for this board's first
  slice. A nudge is a new write path (notification insert) this spec has not
  designed a contract for (no `notifications.md`-compliant producer defined
  here) — flagging as a candidate for a later slice, not blocking this spec.

---

## 3. Data Contract

### Reuse (no new RLS, no new RPC)

All four reads below already pass RLS for `branch_manager` at their own
branch, confirmed directly against `supabase/migrations/00000000000000_baseline.sql`:

| Source | Table(s) | RLS policy (file:line) | Condition satisfied by branch_manager |
|---|---|---|---|
| Attendance | `attendance_records` | `attendance_select`, baseline.sql:39706-39708 | `has_permission(branch_id, 'hr:view_employee')` — BM has this grant (`role-route-matrix.md:196`) |
| Checklist items | `attendance_checklist_items` | `attendance_checklist_items_select`, baseline.sql:39657-39659 | same `hr:view_employee` condition, mirrored via `attendance_records` join |
| Count assignments | `inventory_count_assignments` | `inventory_count_assignments_select`, baseline.sql:40284-40286 | `has_permission(branch_id, 'inventory:count_assign')` OR `'inventory:count_approve'` — BM has both (`role-route-matrix.md:193`) |
| Count slips | `inventory_count_slips` | `inventory_count_slips_select`, baseline.sql:40314-40316 | `has_permission(branch_id, 'inventory:count_approve')` — BM has it |
| Leave requests | `leave_requests` | `leave_requests_select`, baseline.sql:40488-40490 | `has_permission(branch_id, 'hr:approve_leave_request')` OR `has_permission_any('hr:view_employee')` — BM has both |

Precedent for "read via RLS user-client, not service client" already proven
by `hr/actions.ts:fetchAttendance` (`apps/web/app/(protected)/hr/actions.ts:832-878`)
— it queries `attendance_records` through the plain RLS-scoped `supabase`
client (not `createServiceClient()`) and already joins `employees`, `profiles`,
`shifts`, `shift_checklist_templates`, `attendance_checklist_items` in one
query, filtered by `branch_id` + date range, for ALL employees at that branch.
**This is the direct template to adapt** — same shape, narrowed to
`date = today` instead of a month range, plus two more joins (count
assignment/slip, leave).

### New (one aggregate read, T2)

No existing function assembles all 4 sources keyed by `employee_id` for "today,
one branch." Build one new Server Action, e.g. `fetchTeamBoard(branchId, date?)`
in a new `apps/web/app/(protected)/br/[branchId]/(operator)/team/data.ts`
(or `apps/web/app/(protected)/team/actions.ts` if the canonical `*PageContent`
lives office-adjacent — build-slice decision, not spec-locked), following the
`withAction({ roles: [...], schema })` wrapper convention `hr/actions.ts` uses
(`roles: ["owner", "branch_manager"]`, branch-match guard identical to
`fetchAttendance`'s `claims.branch_id !== data.branchId` check at
`hr/actions.ts:836-839`).

Shape: 4 parallel queries (attendance+checklist in one joined query per the
`fetchAttendance` precedent, count-assignments+slips in a second joined query,
leave-requests in a third), keyed by `employee_id`, merged in TS into one
row array — same "fail-soft per metric, `Promise.all`" pattern
`fetchBranchDayStatus` uses (`dashboard/data.ts:65-158`, `Promise.all` of 12
queries). This is a **read aggregation in TS**, not a new SQL view/RPC —
consistent with D052's "reuse the engines, don't rebuild the core" mandate
and avoids a T3 migration.

**Person-detail** (row tap) can reuse `today-work-state.ts`'s internal query
shapes almost directly, but `getTodayWorkState()` itself is hard-scoped to
`auth.uid()` via `getEmployeeContext()` (`employee/_lib/today-work-state.ts:1,150`)
— it cannot take an arbitrary `employee_id`. The build slice needs either (a)
a parallel `getEmployeeWorkState(employeeId)` variant gated by manager
permission, reusing the same query logic minus the self-only assumption, or
(b) accept that person-detail is a lighter read than the full state machine
(just the row's already-fetched fields, no need to duplicate `today-work-state.ts`'s
resolution logic for shift-selection edge cases). Recommend (b) for the first
slice — avoid forking the self-service state machine for a manager read
surface; only build (a) if person-detail needs live mutation capability later.

### Performance Shape

**One aggregate query per data source, not N+1.** All three new joined
queries (attendance+checklist, count-assignment+slip, leave) filter by
`branch_id` + date directly at the DB, matching the existing
`fetchAttendance`/`fetchBranchDayStatus` pattern — never loop per-employee.
Expected row count is small (single-branch daily headcount, typically <20
employees per D012's HKD-scale framing), so no pagination is needed for v1;
`DataTable`'s cursor pagination primitive stays available if branch headcount
ever grows, per the LIST archetype recipe.

### Schema Gap Confirmed

No forward schedule exists — `shift_assignments` has 0 rows in prod (D012)
and no roster/assignment table populates "who SHOULD be on shift today" ahead
of a clock-in event. This board can only show **observed** state (who has
clocked in, who has a count assignment, who is on approved leave) — it
cannot show a "no-show" row for someone who was expected but never showed,
because there is no expectation source. This is a hard data-availability
constraint, not a UI choice — flag as a known limitation in the row model
(§ 2), not something a build slice can silently work around.

---

## 4. What It Does NOT Do

- **No roster/schedule editing.** There is no `shift_assignments` write path
  to build here (D012 explicitly excludes rostering from the HKD support-tool
  funnel; re-opening that is a separate decision, not this spec's job).
- **No payroll.** Payroll stays at `/hr/payroll`, owner-only (`module-acl.ts:100-104`).
  This board never shows salary, `base_salary`, or PIT/BHXH figures.
- **No config.** Position × shift task configuration (D052 §B, "Vị trí → Việc
  trong ca") stays at `/hr` office plane. This board reads *today's instance*
  of that config (per-employee checklist item completion), it never edits the
  template.
- **No new approval action.** Every "duyệt" (approve) action this board
  surfaces links to an existing canonical door (`checkout-approvals`,
  `count-slips`) — see § 2 Tap → Action. Building an inline approve here would
  fork D058 §5's "canonical approvals surface" rule.
- **No employee CRUD.** Adding/editing/deactivating an employee stays at
  `/hr` under the `staff` ModuleKey (owner-only, `module-acl.ts:90-94`).

---

## 5. Build Estimate + Slice Plan

**Tier: T2** (new read aggregation + new route + new ModuleKey/tile wiring;
NOT T3 — no new RPC, no RLS policy change, no migration). If Q2 (WM/PM
inclusion) resolves toward "yes," the ACL wiring grows by one role but stays
T2 — it does not touch RLS since the policies above are keyed on
`has_permission(branch_id, ...)`, not on a role literal.

Slice order, one PR per slice per D058's "one concern per PR, worktree per
PR" discipline:

1. **Data slice** — `fetchTeamBoard(branchId, date?)` Server Action +
   supporting types, following `hr/actions.ts:fetchAttendance` shape almost
   directly (add count-assignment/slip join + leave join). Unit-testable in
   isolation against a seeded branch. No UI yet.
2. **UI slice** — `TeamBoardPageContent` (canonical, per page-archetypes.md
   § 1), LIST archetype: `AppPage` → `AppPageHeader` → `AppToolbar` (date
   picker defaulting to today, maybe a shift/status filter chip) →
   `DataTable` with `mobileCardRender`. Row tap opens person-detail
   (sheet/drawer — reuses fetched row data per § 3 recommendation (b), no
   extra query).
3. **Wrapper slice** — `/br/[branchId]/(operator)/team/page.tsx`
   EMBED-WRAPPER (≤40 lines per page-archetypes.md § 3 hard rule), new
   `ModuleKey` `branch_team` in `module-acl.ts` (`allowedRoles: ["owner",
   "branch_manager"]`, path `/br/*/team`), `protected-route-module-coverage.test.ts`
   update (per D058 "every route-touching slice syncs 5 places" rule: `module-acl.ts`
   + `route-resolution.ts` + `route-map.ts` (`ROUTE_FAMILY_CONTRACTS` entry) +
   nav config + the coverage test).
4. **Tile slice** — add the `my_shift`-group `OPERATOR_TILE_ITEMS` entry (§ 1)
   + i18n label in `lib/messages`/`vi.ts` per `TERMINOLOGY-SOURCE-OF-TRUTH`.

Each slice ships independently and is additive (no existing surface is
removed or altered) — matches D050/D059's "additive, ship-able mid-flight"
rollout discipline.

---

## Open Questions Needing Owner Input

1. **Route shape**: standalone `/br/[branchId]/team` (this spec's default) vs.
   a second tab inside `/br/[branchId]/dashboard`? Spec recommends standalone
   per the LIST-vs-DASHBOARD archetype split (§ 1) — a tab would blur the
   "one workflow state, one visual source" rule since Dashboard's KPI cards
   and a people-roster are different jobs.
2. **WM/PM inclusion**: should `warehouse_manager`/`production_manager` at
   central sites see "Đội hôm nay" scoped to their own site's staff? The data
   model is branch-agnostic (works identically for `central_supply`/`central_kitchen`),
   but D052's original framing was branch_manager-only. Recommend yes, scoped
   by `branch_id` like every other central-site tile, but this is a scope call.
3. **Missing-config handling** (D052 design doc § 11 open question, still
   unresolved there): if a position has no configured "Việc trong ca" for
   today's shift, should this board show the row as blank/warned, or should
   it be excluded entirely? Recommend surfacing a "chưa cấu hình" badge
   (matches D052's own recommended default of "cho vào nhưng đánh dấu") so
   the board doubles as an early-warning surface for the coverage gap P6
   describes — but this repeats an already-open question from D052 and
   should be resolved once, not re-litigated per surface.
