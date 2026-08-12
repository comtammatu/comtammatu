# ADR 0036 — HRM workday credit, wage unit, and payroll alignment

**Status:** Accepted — Owner 2026-08-12 (Q1–Q3 resolved; August 2026 attendance
reset after Phase B).
**Decision owner:** Owner
**Review tier:** T3
**Amends:** ADR 0019 items 1 and 3; D027
**Supersedes:** Flat `0.5 công` per closed shift in attendance UI; dual-label
`pay_basis` (`attendance_prorated` vs `fixed_monthly`) when both already share
one proration formula.

## Context

Má Tư HRM spans roster, punch, month payroll, and BHXH/PIT. Owner workshop
2026-08-12 locked rules that several surfaces still drifted from: hour-ratio
work credit, optional extra shift same day, overnight credit on start
`work_date`, and a distinct daily-rate wage unit. This ADR does not change
BHXH/PIT rates (`docs/ref/payroll-pit.md`).

## Decision

### 1. Work credit (`công`) — one formula everywhere

**Unit:** SHIFT. For each **closed** attendance row with a frozen window
(`scheduled_start_at` / `scheduled_end_at` set at clock-in):

```text
shift_workdays = min(1.0, round_1dp(
  |(check_in, check_out) ∩ (scheduled_start, scheduled_end)| / scheduled_length
))
```

No `check_out` or missing `scheduled_*` → **0** (no 0.5 fallback). Full overlap
→ **1.0**. Early checkout is proportional (4h of 8h → **0.5**). `round_1dp` +
`min(1.0)` means ≤ ~5 minutes early on an 8h shift still yields **1.0**
(475/480). No daily cap: two closed shifts on the same `work_date` sum
independently. No auto-absent. Do not revive flat 0.5 * shift count in UI.

SSOT: `countShiftWorkdaysFromOverlap` /
`sumShiftWorkdaysFromAttendanceRecords` in
`apps/web/lib/staff-runtime/_lib/workday-math.ts`, mirroring SQL
`attendance_shift_workdays`.

UI copy: `Công = tỷ lệ giờ làm thực tế trong khung ca đã phân (tối đa 1,0 công/ca)`.

### 2. Roster — default one shift, optional extra same day

Default UX is one primary shift per employee per `work_date`. BM (own branch)
or Owner (all sites, including office `branch_id` null) may add extra
`(employee, work_date, shift_id)` rows. At most one `day_off` row
(`shift_id IS NULL`) per employee-day.

Schema: drop `shift_assignments_one_per_employee_day`; unique
`(tenant_id, employee_id, work_date, shift_id) NULLS NOT DISTINCT` plus a
partial unique for `day_off`. Clock-in resolves exactly one open assignment;
never wall-clock default. Unassigned → `shift_assignment_required`. Shift
leader (ADR 0023) unchanged.

### 3. Overnight shifts

`work_date` / attendance `date` = Vietnam calendar day the shift **starts**.
Payroll month bucketing uses that date, not `check_out`. Checkout past window
end adds no extra `công` (overlap capped by the frozen window).

### 4. Wage unit

Add `wage_unit` on `employment_contracts` (snapshot to `payroll_entries`).
Migrate `attendance_prorated` and `fixed_monthly` → `monthly`.

| `wage_unit` | Label VI | Rate | Base gross |
| --- | --- | --- | --- |
| `monthly` | `Lương tháng` | `gross_salary` | `round(gross_salary * payable_days / standard_days)` |
| `daily` | `Lương ngày` | `daily_rate` | `round(daily_rate * payable_days)` |
| `hourly` | `Lương giờ` | Deferred | — |

`payable_days`: monthly = `min(standard_days, working_days + paid_leave_days)`;
daily = `working_days + paid_leave_days` (no `standard_days` cap). Each paid
leave day = **1.0**. `working_days` = sum of `công` from §1. Mid-month contract
change: ADR 0019 §6 (period-end contract supplies rates). Keep `pay_basis` as
DB alias until a later drop.

### 5–8. Contracts, tax, OT

HR selects `wage_unit` explicitly. Typical: probation/indefinite `monthly`;
seasonal/part-time `daily`; fixed-term ≥ 1 month `monthly` or `daily`. After
base gross, `calculatePayrollEntry` is unchanged. OT / overtime
(`làm thêm giờ`) has no automated engine; use `payroll_adjustments`. Hourly
wage + OT engine is deferred.

## Cutover (Owner 2026-08-12, Q1)

No backfill. Delete attendance `date < 2026-08-01`. Reset all August 2026
attendance after Phase B (multi-shift roster + clock-in). HR re-rosters; staff
re-punch. Do not snapshot August payroll until calendar sum of `công` matches
preview. Runbook: `scripts/hr/p0-attendance-cutover-runbook.md`. Closed
pre-cutover payroll snapshots stay immutable.

## Consequences

- D027: hour-ratio `công` capped per shift; multi-shift roster; overnight
  credits start `work_date`; `wage_unit` drives base gross.
- ADR 0019 item 1 relaxed to “one default, extra allowed when scheduled.”
- Finance payment flow unchanged.

## Verification

Hour-ratio + rounding: `employee-workday-math.test.ts`,
`payroll-day-math.test.ts`. Multi-assign + clock-in:
`shift-roster-static.test.ts`,
`hrm-truc-ngay-cong-static.test.ts`. Guards:
`HRM-WORKDAY-HOUR-RATIO-SSOT`, `ROSTER-MULTI-ASSIGN-ONE-PER-SHIFT`. Migrations:
`20260812220000_*`, `20260812221000_*`.

Owner Accept 2026-08-12: Q1 cutover after Phase B; Q2 daily paid leave = 1.0;
Q3 CSV export in first release.

## Canonical

`docs/ref/payroll-pit.md`, `docs/ref/labor-contracts.md`, ADR 0019 / 0022 /
0023, `packages/shared/src/payroll/calculate.ts`
