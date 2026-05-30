# Cổng nhân viên - Picker tuần và tháng - Đợt 6 - 2026-05-28

## T2 Self-Review

Surface: `/employee/schedule` week picker and `/employee/attendance` month picker.
Primary user job: nhân viên đổi tuần/tháng dễ bấm trên mobile và đọc cùng một bộ từ vựng trong cổng nhân viên.
Route family: `/employee/*`.
Change type: picker touch ergonomics and copy centralization only.
Primitives used: shadcn `Button`, `Badge`, `Empty`, `EmployeePanel`.

PM: The MVP is safer mobile navigation for weekly schedule and monthly attendance. Acceptance is touch-sized previous/next controls and user-facing copy owned by the employee message dictionary.

BA: Week/month navigation still fetches the same schedule and attendance ranges. Empty schedule still means no assigned shifts for the viewed week. No attendance/payroll/shift request business rules change.

Senior Dev: Keep existing URL param behavior and `fetchMySchedule` call. Move UI copy into `messages.employee` and reuse primitive button sizes instead of custom dimensions.

QA/QC: Verify month/week previous-current-next controls still route/fetch correctly, no new storage/query scope is introduced, copy lint stays clean, and the full repo gate passes.

## Wave 6 Acceptance

- Attendance month previous/next buttons use touch-sized primitives.
- Schedule week previous/next/retry controls use touch-sized primitives.
- Schedule and attendance picker copy lives in `apps/web/lib/messages/employee.ts`.
- Existing fetch and URL parameter behavior is unchanged.
