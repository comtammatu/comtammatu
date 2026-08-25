# ADR 0019 — HRM roster, attendance credit, and payroll alignment

**Status:** Accepted (Owner 2026-08-01 roster/contract lock; 2026-08-12 workday/wage-unit lock consolidated from ADR 0036; merged 2026-08-24 — Git keeps the originals)

**Decision owner:** Owner — **Review tier:** T3

**Amends:** D012 rostering clause (reversed), D026, D027.

**Supersedes:** Flat `0.5 công` per closed shift in attendance UI; dual-label
`pay_basis` (`attendance_prorated` vs `fixed_monthly`) when both already
share one proration formula.

## Context

Má Tư HRM spans roster, punch, month payroll, and BHXH/PIT. Earlier
decisions prohibited rostering and kept attendance shift-based, and the
repository had unresolved proposals for contract revision history, probation
semantics, and payroll treatment when a contract changes mid-period. Owner
decisions on 2026-08-01 authorized rostering (hard-require clock-in,
hour-ratio `công`) and contract semantics; the 2026-08-12 workshop locked
the remaining drift: multi-shift roster, overnight credit on start
`work_date`, and a distinct daily-rate wage unit. This ADR does not change
BHXH/PIT rates (`docs/ref/payroll-pit.md`).

## Decision

### 1. Rostering = required for clock-in
Weekly `shift_assignments` assigns an employee to shifts per `work_date`.
Default UX is one primary shift per employee per `work_date`; BM (own
branch) or Owner (all sites, including office `branch_id` null) may add
extra `(employee, work_date, shift_id)` rows. At most one `day_off` row
(`shift_id IS NULL`) per employee-day. Schema: drop
`shift_assignments_one_per_employee_day`; unique `(tenant_id, employee_id,
work_date, shift_id) NULLS NOT DISTINCT` plus a partial unique for
`day_off`. Clock-in resolves exactly one open assignment at Vietnam-local
time; never wall-clock default. Unassigned → `shift_assignment_required`.
Shift leader (ADR 0023) unchanged. The “no rostering” clause of D012 is
lifted; the remaining D012 prohibitions stay: no auto-late, no auto-absent,
no leave-balance enforcement, no multi-tier approval.

### 2. Work credit (`công`) — one formula everywhere
**Unit:** SHIFT. For each **closed** attendance row with a frozen window
(`scheduled_start_at` / `scheduled_end_at` set at clock-in):

```text
shift_workdays = min(1.0, round_1dp(
  |(check_in, check_out) ∩ (scheduled_start, scheduled_end)| / scheduled_length
))
```

No `check_out` or missing `scheduled_*` → **0** (no 0.5 fallback). Full
overlap → **1.0**. Early checkout is proportional (4h of 8h → **0.5**).
`round_1dp` + `min(1.0)` means ≤ ~5 minutes early on an 8h shift still
yields **1.0** (475/480). No daily cap: two closed shifts on the same
`work_date` sum independently. No auto-absent. Do not revive flat 0.5 *
shift count in UI. SSOT: `countShiftWorkdaysFromOverlap` /
`sumShiftWorkdaysFromAttendanceRecords` in
`apps/web/lib/staff-runtime/_lib/workday-math.ts`, mirroring SQL
`attendance_shift_workdays`. UI copy: `Công = tỷ lệ giờ làm thực tế trong khung ca đã phân (tối đa 1,0 công/ca)`.

### 3. Overnight shifts
`work_date` / attendance `date` = Vietnam calendar day the shift **starts**;
payroll month bucketing uses that date, not `check_out`. Checkout past
window end adds no extra `công` (overlap capped by the frozen window).

### 4. Wage unit
`wage_unit` lives on `employment_contracts` (snapshot to `payroll_entries`);
`attendance_prorated` and `fixed_monthly` migrate to `monthly`.

| `wage_unit` | Label VI | Rate | Base gross |
| --- | --- | --- | --- |
| `monthly` | `Lương tháng` | `gross_salary` | `round(gross_salary * payable_days / standard_days)` |
| `daily` | `Lương ngày` | `daily_rate` | `round(daily_rate * payable_days)` |
| `hourly` | `Lương giờ` | Deferred | — |

`payable_days`: monthly = `min(standard_days, working_days +
paid_leave_days)` — do not also auto-deduct unpaid leave that is already
absent from `working_days`; daily = `working_days + paid_leave_days` (no
`standard_days` cap). Each paid leave day = **1.0**; `working_days` = sum
of `công` from §2. Manual adjustments remain. Keep `pay_basis` as DB alias
until a later drop. HR selects `wage_unit` explicitly — typical:
probation/indefinite `monthly`; seasonal/part-time `daily`; fixed-term ≥ 1
month `monthly` or `daily`. After base gross, `calculatePayrollEntry` is
unchanged. OT / overtime (`làm thêm giờ`) has no automated engine; use
`payroll_adjustments`. Hourly wage + OT engine is deferred.

### 5. Contract revisions are append-only
A revision creates a new `employment_contracts` row and marks the previous
one `expired`; history begins at the migration — do not synthesize rows
overwritten by the legacy in-place upsert. Compensation amendments are
separated from contract sequence (a salary change is not a new contract and
does not increment `contract_sequence`). A third consecutive fixed-term
warning counts two preceding consecutive fixed-term contracts (excluding
probation/amendment) and is a soft warning, not a block. A contract that
reaches `end_date` untouched transitions to `expired` via a natural-expiry
handler.

### 6. Probation semantics
Follow `docs/ref/labor-contracts.md`. 85% of the official salary is a
minimum, not a universal rate. BHXH is excluded only when probation is a
separate probation contract; probation as a clause inside an HĐLĐ remains
insured. HR selects `probation_arrangement`, `probation_end_date`, and
`probation_salary` explicitly; it is not inferred from the application role.

### 7. Payroll mid-month contract selection
Payroll evaluates base compensation using the contract active at the
period-end/snapshot date; no mid-period proration of contract changes.
Attendance `công` proration (§2) is separate.

## Cutover (Owner 2026-08-12, Q1)

No backfill. Delete attendance `date < 2026-08-01`. Reset all August 2026
attendance after Phase B (multi-shift roster + clock-in). HR re-rosters;
staff re-punch. Do not snapshot August payroll until calendar sum of `công`
matches preview. Runbook: `scripts/hr/p0-attendance-cutover-runbook.md`.
Closed pre-cutover payroll snapshots stay immutable.

## Consequences

- D012 rostering clause remains reversed; hard-require punch is in force.
  Writers use `hr:assign_shift`; BM assigns own branch, Owner all sites
  including office (`branch_id` null).
- D026/D027 attendance semantics follow §2–§4: hour-ratio `công` capped per
  shift; multi-shift roster; overnight credits start `work_date`;
  `wage_unit` drives base gross. Regression guard `D012-rostering` =
  “rostering required for clock-in”.
- Payroll guards (`PAYROLL-CALCULATE-MUST-BE-ATOMIC-RPC`,
  `PAYROLL-PRORATION-CAP-AT-STANDARD`,
  `PAYROLL-2026-FIVE-BRACKET-AND-BHXH-CAP-STEP`,
  `ATTENDANCE-INSERT-SERVICE-ROLE-ONLY`) remain; `công` source is
  hour-ratio on frozen windows. Finance payment flow unchanged.

## Verification

- Hour-ratio + rounding: `employee-workday-math.test.ts`,
  `payroll-day-math.test.ts`. Multi-assign + clock-in:
  `shift-roster-static.test.ts`, `hrm-truc-ngay-cong-static.test.ts`.
  Guards: `HRM-WORKDAY-HOUR-RATIO-SSOT`, `ROSTER-MULTI-ASSIGN-ONE-PER-SHIFT`;
  migrations `20260812220000_*`, `20260812221000_*`.
- Owner Accept 2026-08-12: Q1 cutover after Phase B; Q2 daily paid leave =
  1.0; Q3 CSV export in first release.

## Canonical

`docs/ref/payroll-pit.md`, `docs/ref/labor-contracts.md`, ADR 0022,
ADR 0023, `packages/shared/src/payroll/calculate.ts`
