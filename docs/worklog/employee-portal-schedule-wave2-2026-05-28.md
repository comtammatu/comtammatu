# Cổng nhân viên - Lịch ca và đăng ký ca - Đợt 2 - 2026-05-28

## T2 Self-Review

Scope: improve the IA bridge between `/employee/schedule` and `/employee/shift-register`. This wave keeps existing shift request actions, approval rules, ACL, RLS, and schema unchanged.

PM: The MVP is a clearer path from "xem lịch" to "đăng ký ca" without forcing staff to discover a separate route from the bottom nav. Acceptance is that schedule has a visible registration action and shift registration uses the same employee shell rhythm.

BA: Schedule remains read-only. Shift registration remains limited to the next 21 days and branch options already resolved by the page. Pending request cancel remains the only mutation exposed in the request list.

Senior Dev: Reuse `EmployeePage`, `EmployeePanel`, shadcn `Button`, and existing route actions. Remove nested app-page/card structure from shift registration so the employee layout stays the single page container.

QA/QC: Verify route links are correct, mobile CTAs use touch-sized buttons, no new storage/auth/data writes were introduced, and the full repo gate still passes.

## Wave 2 Acceptance

- `/employee/schedule` exposes a direct "Đăng ký ca" action.
- `/employee/shift-register` exposes a direct "Xem lịch ca" action.
- Shift registration no longer renders an app page inside the employee app page.
- Existing request submission and cancellation behavior is unchanged.
