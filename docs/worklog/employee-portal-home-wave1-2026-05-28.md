# Cổng nhân viên - Đợt 1 - 2026-05-28

## T2 Self-Review

Scope: refresh the `/employee` home surface only. This wave does not change ACL, RLS, payroll visibility, attendance write rules, or database schema.

PM: The MVP is a clearer staff home screen: show the next safe action for today, the next shift, and role-based operation shortcuts without turning the portal into an admin dashboard. Acceptance is a mobile-first first viewport that helps staff decide what to tap next.

BA: The home screen reads existing attendance, shift assignment, branch, and role ACL data. Missing employee profile or branch must remain explicit. POS/KDS/Runner links only appear when role and branch allow them. Payroll and detailed attendance rules remain on their existing child routes.

Senior Dev: Keep the route under `apps/web/app/(protected)/employee/page.tsx`, reuse `EmployeePage`, `EmployeePanel`, `EmployeeDetailList`, `EmployeeActionList`, `EmployeeActionItem`, and shadcn primitives. No new design system, no new auth helper, no localStorage/context scope.

QA/QC: Verify the diff stays UI/copy-only for this wave, responsive task grids do not force two columns on small screens, and the primary CTA still routes to profile, clock, or attendance according to employee context and clock state. Completion gate remains `pnpm typecheck && pnpm lint && pnpm build`.

## Wave 1 Acceptance

- `/employee` first panel is "today first", not a generic module list.
- The primary button is always one of: complete profile, clock in/out, or view attendance.
- Next shift information is visible inside the first workday panel.
- Operation tools and management links remain secondary and role-filtered.
- UI stays on the locked shadcn + AppSurface contract.
