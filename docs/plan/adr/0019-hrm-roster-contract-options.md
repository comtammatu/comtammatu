# ADR 0019 — HRM roster, attendance credit, and payroll alignment

**Status:** Accepted

**Decision owner:** Owner

**Amends:** D012 rostering clause (reversed), D026, D027.

Runtime: [`docs/ref/payroll-pit.md`](../../ref/payroll-pit.md) and
[`docs/ref/labor-contracts.md`](../../ref/labor-contracts.md). This ADR owns
roster-required punch, versioned quarter-day `công`, direct self-checkout, and
`wage_unit`.

## Decision

1. **Roster required for clock-in.** Weekly `shift_assignments` per
   `work_date`. Extra `(employee, work_date, shift_id)` rows allowed. At most
   one `day_off` (`shift_id IS NULL`) per employee-day. Clock-in resolves
   exactly one open assignment at Vietnam-local time; never wall-clock default.
   Unassigned → `shift_assignment_required`. Remaining D012 bans stay: no
   auto-late, no auto-absent, no leave-balance enforcement, no multi-tier
   approval.

2. **Work credit (`công`) — one versioned formula.** For each **closed**
   attendance row with a frozen window, credit is based on overlap with that
   window and capped at 1.0. Before 2026-09-01, preserve the historical
   `round_1dp(overlap / scheduled_length)` result. From 2026-09-01, count only
   completed quarters:
   `shift_workdays = min(1.0, floor(4 * overlap / scheduled_length) / 4)`.
   For an eight-hour shift, 2/4/6/8 hours yield 0.25/0.5/0.75/1.0; seven hours
   yield 0.75 and less than two hours yields 0. No `check_out` or missing
   `scheduled_*` → **0**. For split shifts (`is_split = true`), `scheduled_length`
   is the sum of interval 1 (`scheduled_end_at - scheduled_start_at`) and
   interval 2 (`scheduled_end_at_2 - scheduled_start_at_2`), and `overlap` is the sum
   of overlap in interval 1 (`check_in` to `window_1_out_at` or `check_out`) and
   interval 2 (`check_in_2` to `check_out`). Break duration between intervals is
   excluded. No daily cap: two closed shifts on the same
   `work_date` sum independently. Finalized payroll snapshots are not
   recalculated. SSOT: `countShiftWorkdaysFromOverlap` /
   `shiftWorkdaysFromAttendanceRecord` and SQL
   `attendance_shift_workdays` / `attendance_shift_workdays_for_record`.

3. **Direct self-checkout.** Active employees with no branch scope (office)
   and employees in canonical positions `branch_manager`, `hr_manager`,
   `central_supply_ops`, or `central_kitchen_lead` close their own current
   attendance immediately. All other employees keep the checkout-approval
   lifecycle. Direct checkout still enforces required checklist, photo, and
   assigned inventory-count evidence. Owner remains outside employee
   self-service. Application routing uses authenticated branch scope plus the
   canonical position code; `self_service_clock_out` rechecks the live profile
   and is the final database gate.

4. **Overnight.** `work_date` = Vietnam calendar day the shift **starts**.

5. **Wage unit** on `employment_contracts` (snapshot to `payroll_entries`):
   `monthly` → `round(gross_salary * payable_days / standard_days)`;
   `daily` → `round(daily_rate * payable_days)`; `hourly` deferred.
   `payable_days`: monthly = `min(standard_days, working_days +
   paid_leave_days)`; daily = `working_days + paid_leave_days`. Each paid
   leave day = **1.0**. Keep `pay_basis` as DB alias until a later drop.

6. **Contract revisions are append-only.** Compensation amendments are not a
   new contract sequence. Payroll uses the contract active at period-end;
   `công` proration is separate.

7. **Probation** follows `docs/ref/labor-contracts.md`. HR selects arrangement
   explicitly.

## Verification

Versioned work-credit and direct-checkout tests:
`employee-workday-math.test.ts`, `employee-branch-manager-tools.test.ts`, and
`hrm-truc-ngay-cong-static.test.ts`. Guards:
`HRM-WORKDAY-QUARTER-DAY-SSOT`, `ATTENDANCE-DIRECT-CHECKOUT-GUARDED`, and
`ROSTER-MULTI-ASSIGN-ONE-PER-SHIFT`.
