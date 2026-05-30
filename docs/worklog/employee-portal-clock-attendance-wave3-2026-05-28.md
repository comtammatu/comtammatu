# Cổng nhân viên - Chấm công và ngày công - Đợt 3 - 2026-05-28

## T2 Self-Review

Scope: improve navigation and touch ergonomics between `/employee/clock` and `/employee/attendance`. This wave keeps GPS validation, branch code validation, attendance write behavior, RLS, and schema unchanged.

PM: The MVP is a clearer daily loop: staff can clock in/out from the action page and jump to their monthly attendance history without returning to the home screen. Acceptance is two-way navigation and touch-sized primary clock buttons.

BA: Clock remains the only page that writes today's check-in/check-out. Attendance remains read-only monthly history. Missing profile and missing branch GPS states keep their current blocking behavior.

Senior Dev: Reuse `EmployeePage`, existing clock/attendance actions, shadcn `Button`, and existing route data. Do not touch `clockIn`, `clockOut`, code generation, or attendance record queries except for UI composition.

QA/QC: Verify links point to the correct employee routes, CTA sizing stays on primitive variants, no new writes/auth helpers/storage were added, and the full repo gate passes.

## Wave 3 Acceptance

- `/employee/clock` exposes a direct "Ngày công" action.
- `/employee/attendance` exposes a direct "Chấm công hôm nay" action.
- Main clock buttons use touch-sized primitives.
- Existing check-in/check-out and attendance read behavior is unchanged.
