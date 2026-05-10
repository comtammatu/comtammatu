# Module Card — HR & Employee

## Current State

Employee self-service and HR management are separate surfaces.

- Employee self-service: `/employee/*`
- Work discovery: `/portal`
- HR management: `/hr/*`
- Staff/admin permissions: `/admin/staff/*`

The Super App rebuild keeps `/employee` narrow and task-led.

## Cổng Nhân Viên Ownership

Employee routes:

- `/employee`: today page, clock state, next shift, self-service links.
- `/employee/clock`: clock in/out.
- `/employee/schedule`: own shift schedule.
- `/employee/attendance`: own attendance history.
- `/employee/payslip`: own released/paid payslips.
- `/employee/profile`: own profile and access summary.
- `/employee/permissions`: support/debug; do not put in primary navigation without a fresh decision.

Employee self-service must resolve employee identity server-side from `auth.uid()` and current claims. Do not accept `employeeId` from URL/client state.

## HR Ownership

HR routes:

- `/hr`
- `/hr/payroll`
- `/hr/payroll/[periodId]`

HR owns management workflows such as staff records, shifts, attendance management, contracts, payroll calculation, payroll release/payment, and reporting.

Do not put HR management, payroll approval, staff CRUD, or permission administration into `/employee`.

## Current Status

- Employee clock, attendance, schedule, profile, and payslip routes exist.
- Attendance is live.
- Payroll calculation is partial and has known compliance gaps.
- Employee payslip visibility must remain self-only and released/paid only.

## Known Risks

- Self-service data leakage if filtering relies only on app-layer employee IDs.
- Payroll draft/calculated data leaking to employee view.
- Branch manager with null `branch_id` widening writes tenant-wide.
- Daily HMAC clock-in code reusable all day.
- Salary fields missing audit coverage.

## What To Do Next

For Employee/HR work:

1. Decide whether the job is self-service or management.
2. Keep `/employee` first viewport focused on clock state, next shift, and next action.
3. Keep management links secondary and ACL-gated.
4. Verify self-scope with multiple users and branches.
