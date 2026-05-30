# Cổng nhân viên - Cá nhân, lương, quyền hạn - Đợt 4 - 2026-05-28

## T2 Self-Review

Surface: `/employee/profile`, `/employee/payslip`, `/employee/permissions`.
Primary user job: nhân viên tự kiểm tra hồ sơ, người phụ thuộc, phiếu lương đã phát hành, và quyền truy cập hiện hành.
Route family: `/employee/*`.
Change type: UI/UX bridge and touch ergonomics only.
Primitives used: `EmployeePage`, `EmployeePanel`, `EmployeeActionList`, `EmployeeActionItem`, shadcn `Button`, `Empty`, `Item`, `Badge`.

PM: The MVP is a clearer self-service loop. Staff can move between profile, payslip, and permissions without returning to the home screen. Acceptance is explicit cross-links and touch-safe primary actions.

BA: Payslip visibility remains limited to paid payroll periods. Permissions remain read-only from current grants. Profile remains the only place for the dependents update flow.

Senior Dev: Reuse existing employee wrappers and message dictionary. Do not change permission fetches, payroll filters, dependents RPC, auth helpers, ACL, RLS, or schema.

QA/QC: Verify links target the correct employee routes, button sizes use primitive variants, no new storage/auth/query scope was introduced, and the full repo gate passes.

## Wave 4 Acceptance

- `/employee/profile` links to phiếu lương and quyền hạn.
- `/employee/payslip` links back to profile for người phụ thuộc.
- `/employee/permissions` links back to profile.
- Self-service action buttons are touch-safe on mobile.
- Existing payroll, permission, and dependents update behavior is unchanged.
