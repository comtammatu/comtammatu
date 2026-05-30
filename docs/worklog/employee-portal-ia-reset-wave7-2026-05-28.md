# Cổng nhân viên - IA reset - Đợt 7 - 2026-05-28

## T2 Self-Review

Surface: `/employee` home.
Primary user job: nhân viên mở cổng và thấy rõ phần nào là việc cá nhân của mình, phần nào là công cụ ca làm tại chi nhánh.
Route family: `/employee/*`.
Change type: IA/layout reset only; no auth redirect, ACL, RLS, schema, or business write-path change.
Primitives used: `AppPageHeader`, `AppSection` via Employee wrappers, shadcn `Button`, `Item`.

PM: The current home overreaches by mixing self-service, POS/KDS handoff, and management shortcuts. MVP is to make `/employee` a personal task portal again, not a second admin shell.

BA: Personal data includes today's clock status, own schedule, own attendance, own payslips, profile, and permissions. Branch operation tools are shared tools for a shift and must be visibly separate. Management/admin workspaces must not be advertised from the employee home.

Senior Dev: Keep existing route access and branch-scope gates intact. Remove management shortcut composition from the home page, reorder sections so personal self-service precedes branch tools, and reuse existing Employee wrappers that delegate to app surface adapters.

QA/QC: Verify bottom nav remains personal-only, `/employee` renders without management hub, branch POS/KDS/Runner links still appear only when allowed, and full repo gate passes.

## Wave 7 Acceptance

- `/employee` home no longer renders admin/management workspace shortcuts.
- Personal self-service links are grouped before branch operation tools.
- POS/KDS/Runner handoff remains role-filtered and visually separate from personal records.
- Redirect/default-route behavior is intentionally unchanged in this wave.
