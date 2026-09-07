# ADR 0033 — Work module: hosting, UI compose, and authority

**Status:** Accepted (Owner 2026-08-11 hosting/domain; 2026-08-12 UI compose
Accept — Q1=A, Q2=A, Q3=include `/work/team`)

**Decision owner:** Owner

**Amended by:** ADR 0037 (`/me` stays `Trang cá nhân`; the Work CTA is removed;
due Work surfaces in the `/` Mine region, not a Work shell on `/`);
2026-09-06 Route consolidation: `/work/team` is a redirect shim to `/work`;
2026-09-07 Assignment visibility: read/write follow assignment RLS +
`created_by`; create is grantable `work:create`, not department membership.

Runtime compose: [`docs/spec/page-archetypes.md`](../../spec/page-archetypes.md)
TASK_* and [`docs/ref/screen-context-map.md`](../../ref/screen-context-map.md)
§2.4C. This ADR owns hosting and authority; do not implement UI recipes from
here.

## Decision

- Routes live under `apps/web` at `/work/*` inside Control Surface chrome. No
  `apps/workspace`, no `work.*` host, no second Production Vercel project, no
  Work-specific cookie domain.
- `ModuleKey` `work` with `path: "/work"`. Candidate roles may include all
  staff; live authority is `can_access_workspace()` + assignment RLS — not nav
  ACL or `work_department_members`.
- `/work` opens Inbox (`view=mine`). Inbox stays *my* assigned/supporting
  tasks (`list_my_work_tasks`). Org-wide Kanban is forbidden as default and on
  `/`. Filters never take `tenant_id` from the client. Task DETAIL is the
  `/work?task=` overlay (`/work/tasks/[id]` redirects). `/work/team` remains a
  redirect shim.
- Create is Owner, `work:manage`, or granted `work:create`. `work:manage`
  stays `is_delegable_to_staff=false` (settings + see-all). Settings grant
  creators, not department members.
- Read every task / filter people: Owner or `work:manage` only. Everyone else
  reads `created_by`, `assignee_id`, or `work_task_participants`.
  `can_read_work_task` does not inherit department or project membership.
- Assign fields (title, description, priority, due, people, department):
  `can_assign_work_task` (Owner, `work:manage`, `created_by`). Status,
  checklist, comment, attach: `can_write_work_task` (those plus
  assignee/supporter).
- Tasks may link to Finance/Inventory/HR records later but must not copy money,
  stock, or payroll payloads. Mutations use atomic RPCs + `expected_revision`.
  Never merge `work_tasks` into `position_shift_tasks`.
- Compose shapes `TASK_BOARD`, `TASK_CALENDAR`, `TASK_TIMELINE` are Control
  Surface recipes — not KDS `BOARD` / `station_chrome`.

## Non-goals

Separate Work deployable; org-wide Kanban wall on `/`; AI/wiki; Gantt;
time tracking; changing Branch KDS BOARD semantics; changing `/br/…/team`;
making `work:manage` delegable; dropping membership tables; a second Work
membership table; HR role-binding/AAL2 for `work:create`.

## Verification

Notification `action_url` values are same-origin `/work/tasks/[id]`. Domain
rollback: `docs/runbooks/work-module-pilot-rollback.md`.
