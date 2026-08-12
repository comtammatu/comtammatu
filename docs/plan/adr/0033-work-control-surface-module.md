# ADR 0033 — Work module on Control Surface

**Status:** Accepted

**Decision owner:** Owner, 2026-08-11 (implement plan Accept)

**Review tier:** T2 — new Control Surface module, membership RLS, notifications

## Context

Office staff need cross-department assigned work (inbox, board, calendar,
timeline) without a second deployable or second auth cookie domain. PR #348 /
`codex/workspace-foundation` proposed `apps/workspace` + `work.comtammatu.com`;
Owner rejected separate-app hosting in favor of same Control Surface.

Canonical product/IA: `docs/ref/screen-context-map.md` § 2.4C.
Compose recipes: `docs/spec/page-archetypes.md` TASK_*.
Control Surface module seams: `docs/modules/web-app.md`.

## Decision

1. **Same Surface.** Routes live under `apps/web` at `/work/*` inside Control
   Surface chrome. No `apps/workspace`, no `work.*` host, no second Production
   Vercel project, no Work-specific cookie domain.

2. **Module ACL.** `ModuleKey` `work` with `path: "/work"` (web default; no
   `app: "workspace"`). Candidate roles may include all staff; live authority is
   `can_access_workspace()` + RLS membership.

3. **Landing.** `/work` opens Inbox (`view=mine` / assignee·participant). Full
   multi-department Kanban is forbidden as default.

4. **Views (URL only).** `view=board|calendar|timeline` with required scope
   (`project` or `department` for board/timeline). Compose shapes `TASK_BOARD`,
   `TASK_CALENDAR`, `TASK_TIMELINE` are Control Surface recipes — not KDS
   `BOARD` / `station_chrome`. Filters: `view`, `department`, `project`,
   `status`, `assignee`, `q`, `from`, `to`. Reject unknown enums; never take
   `tenant_id` from the client.

5. **Routes.** Inbox `/work`; task DETAIL `/work/tasks/[id]`; projects
   `/work/projects` + `/work/projects/[id]`; team `/work/team` (`work:manage`).

6. **Control home `/`.** Remains module attention hub; adds one attention row
   for due-today + overdue Work tasks → `/work`. Does not become a Work shell.

7. **`/me`.** Remains personal day (clock + `Việc trong ca`). When Work access
   exists, expose CTA to `/work`. Never merge `work_tasks` into
   `position_shift_tasks`.

8. **Domain.** Additive `work_*` tables: `work_departments`,
   `work_department_members`, `work_projects`, `work_project_members`,
   `work_tasks`, `work_task_participants`, `work_task_checklist_items`,
   `work_task_comments`, `work_task_attachments`, `work_task_events`.
   Status: `backlog | todo | in_progress | review | done | canceled`.
   Priority: `low | normal | high | urgent`. Tasks may link to
   Finance/Inventory/HR records later but must not copy money, stock, or
   payroll payloads. Mutations use atomic RPCs + `expected_revision`.

9. **Permission.** Tenant `work:manage` for Owner (department/member admin in
   MVP). Leads get authority from membership tables, not broad tenant grants.
   Pilot department label: `Văn phòng`.

10. **Supersession.** Separate-app design in PR #348 is not to be merged as
    runtime. Domain ideas (`work_*`, membership, inbox-first) stay in this ADR.

## Consequences

- W0–W5 code is on Production; remaining proof is member/non-member pilot smoke
  and the 7-day watch (`docs/runbooks/work-module-pilot-rollback.md`).
- Notification `action_url` values are same-origin `/work/tasks/[id]`.
- `login-destination` stays unchanged.
- Page-archetype census must register Work routes under LIST/DETAIL or TASK_*
  compose shapes — never under station BOARD.

## Non-goals

Separate Work deployable; org-wide Kanban wall on `/`; AI/wiki; Gantt leveling;
time tracking; changing Branch KDS BOARD semantics.
