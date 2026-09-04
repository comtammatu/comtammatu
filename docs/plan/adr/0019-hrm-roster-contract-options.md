# ADR 0019 — HRM roster, attendance credit, and payroll alignment

**Status:** Accepted

**Decision owner:** Owner

**Amends:** D012 rostering clause (reversed), D026, D027.

Runtime: [`docs/ref/payroll-pit.md`](../../ref/payroll-pit.md) and
[`docs/ref/labor-contracts.md`](../../ref/labor-contracts.md). This ADR owns
roster-required punch, hour-ratio `công`, and `wage_unit`.

## Decision

1. **Roster required for clock-in.** Weekly `shift_assignments` per
   `work_date`. Extra `(employee, work_date, shift_id)` rows allowed. At most
   one `day_off` (`shift_id IS NULL`) per employee-day. Clock-in resolves
   exactly one open assignment at Vietnam-local time; never wall-clock default.
   Unassigned → `shift_assignment_required`. Remaining D012 bans stay: no
   auto-late, no auto-absent, no leave-balance enforcement, no multi-tier
   approval.

2. **Work credit (`công`) — one formula.** For each **closed** attendance row
   with a frozen window:
   `shift_workdays = min(1.0, round_1dp(overlap / scheduled_length))`.
   No `check_out` or missing `scheduled_*` → **0**. No daily cap: two closed
   shifts on the same `work_date` sum independently. SSOT:
   `countShiftWorkdaysFromOverlap` and SQL `attendance_shift_workdays`.

3. **Overnight.** `work_date` = Vietnam calendar day the shift **starts**.

4. **Wage unit** on `employment_contracts` (snapshot to `payroll_entries`):
   `monthly` → `round(gross_salary * payable_days / standard_days)`;
   `daily` → `round(daily_rate * payable_days)`; `hourly` deferred.
   `payable_days`: monthly = `min(standard_days, working_days +
   paid_leave_days)`; daily = `working_days + paid_leave_days`. Each paid
   leave day = **1.0**. Keep `pay_basis` as DB alias until a later drop.

5. **Contract revisions are append-only.** Compensation amendments are not a
   new contract sequence. Payroll uses the contract active at period-end;
   `công` proration is separate.

6. **Probation** follows `docs/ref/labor-contracts.md`. HR selects arrangement
   explicitly.

## Verification

Hour-ratio tests: `employee-workday-math.test.ts`,
`hrm-truc-ngay-cong-static.test.ts`. Guards: `HRM-WORKDAY-HOUR-RATIO-SSOT`,
`ROSTER-MULTI-ASSIGN-ONE-PER-SHIFT`.
