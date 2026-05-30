# Cổng nhân viên - Thiếu hồ sơ nhân viên - Đợt 5 - 2026-05-28

## T2 Self-Review

Surface: missing-profile states in `/employee/clock`, `/employee/schedule`, `/employee/attendance`, `/employee/payslip`, and `/employee/shift-register`.
Primary user job: nhân viên biết vì sao màn bị chặn và có đường quay về hồ sơ cá nhân để kiểm tra thông tin tài khoản.
Route family: `/employee/*`.
Change type: empty-state recovery UX only.
Primitives used: `EmployeePage`, shared employee empty-state wrapper, shadcn `Empty`, `Button`.

PM: The MVP is a consistent recovery state whenever employee context is missing. Acceptance is the same staff-readable message and a touch-safe link back to `/employee/profile`.

BA: Missing employee context still blocks clock, schedule, attendance, payslip, and shift registration. This wave does not create or repair employee records and does not change who can view payroll or permissions.

Senior Dev: Add one reusable Employee wrapper and replace duplicated empty-state markup. Do not touch `getEmployeeContext`, auth, ACL, RLS, payroll queries, attendance writes, or shift request actions.

QA/QC: Verify each no-context branch renders without DB writes, the CTA targets `/employee/profile`, copy comes from the employee dictionary, and the full repo gate passes.

## Wave 5 Acceptance

- Missing-profile states use one shared employee empty-state component.
- Blocked employee task pages link to `/employee/profile`.
- `/employee/shift-register` shows the same recovery state instead of redirecting away.
- Existing task behavior remains unchanged when employee context exists.
