# ADR 0035 — Work UI compose, Layout Frame, and authority clarification

**Status:** Accepted — Owner 2026-08-12  
Accept: **Q1=A** (Inbox queue `Item`), **Q2=A** (lead ≡ member create),
**Q3=include** `/work/team` (W-UI-4).

**Decision owner:** Owner, 2026-08-12

**Review tier:** T2 — Control Surface UI compose, membership UX; W-UI-4 adds
membership RPCs (still no money/stock/payroll schema)

**Supplements:** ADR 0033 (hosting, domain, ACL remain). Does not reopen
separate-app hosting.

## Context

ADR 0033 shipped W0–W5 on Control Surface (`/work/*`). Investigation
(2026-08-12) confirmed:

- Product authority is RPC + membership (`can_access_workspace`,
  `create_work_task`, `can_write_work_task`), not nav ACL alone.
- `/` attention + `/me` CTA match screen-map § 2.4 / § 2.4B.
- `/work` UI is a functional pilot MVP: Inbox queue, Board/Calendar/Timeline,
  task DETAIL with checklist/comments — but it does **not** yet meet Má Tư
  Design System Layout UI/UX Frame gold for management LIST/DETAIL, and
  `/ds-lab` has no Work recipe.
- Gaps that block “done” for operators: no create CTA, filters parsed but not
  rendered, view toolbar outside `AppListFrame`, DETAIL without `StatusBadge`,
  census maps `/work` only as `LIST` while children mark `TASK_*`, no
  `/work/team` or `/work/projects` routes, `work:manage` is not staff-delegable.
- Without `/work/team`, pilot membership is only `ensure_pilot_work_department`
  (self as lead) or SQL/service — operators cannot onboard colleagues in-app.

## Decision

### 1. Keep ADR 0033 hosting and domain; redesign UI compose only

No second app/host. No `work_*` money/stock/payroll payloads. Atomic RPCs +
`expected_revision` stay mandatory.

### 2. Compose model for `/work`

| URL state | Compose shape | Required chrome |
| --- | --- | --- |
| `view=mine` (default) | **LIST** (queue variant — **Accepted Q1=A**) | `AppPage` xwide+compact → `AppPageHeader` (create in `actions`) → `AppListFrame` + `AppToolbar variant="inline"` → `Item` queue (not `DataTable` for this wave) |
| `view=board` + scope | **TASK_BOARD** | Same page shell; body is board; scope required (department **xor** project) |
| `view=calendar` | **TASK_CALENDAR** | Same shell; month via `month=` |
| `view=timeline` + `project=` | **TASK_TIMELINE** | Same shell; redirect to `view=mine` if project missing |
| `/work/tasks/[id]` | **DETAIL** | Header title = task title; `StatusBadge` for status; `AppBackLink`; primary save in `AppDetailFooter` |
| `/work/team` | **LIST** | Department-scoped membership admin (see § 7) |

**Census:** Keep `/work/page.tsx` compose entry as `LIST` for the route file
(CI LIST frame law). Register child `data-page-archetype` for TASK_* and add a
static guard that board/calendar/timeline bodies declare those markers. Do
**not** classify office Kanban as station `BOARD`. Register
`/work/team/page.tsx` as `LIST`.

**View switcher:** URL-driven `Button`/`Link` row inside the list toolbar slot
(or `AppPageHeader.tabs` only if it stays link-mode without embedding bodies).
Do not mount full `AppPageTabs`+`TabsContent` for Work views.

### 3. Create and assign (product)

1. **Create CTA** on Inbox (and optionally Board when scoped):
   `AppPageHeader.actions` → `FormDialog` → `createWorkTask`.
2. Create allowed for: Owner, `work:manage`, or **any active department
   member** (lead and member equal for create — **Accepted Q2=A**; do not
   invent lead-only create in this wave).
3. Assignee picker: department members of the selected department (UI). Server
   may still accept any active profile; UI stays narrower.
4. On assign (create or update): keep `work.task_assigned` notification.

### 4. Authority clarification (no silent widening)

| Action | Who (RPC today → keep unless noted) |
| --- | --- |
| Bootstrap pilot `Van phong` | Owner or `work:manage` via `ensure_pilot_work_department` |
| Create task | Owner · `work:manage` · active dept member (**Q2=A**) |
| Write/status/comment/checklist | `can_write_work_task` (Owner · manage · assignee · created_by · dept member · project lead/collaborator) |
| Membership admin `/work/team` | Owner · `work:manage` (W-UI-4 **in scope** — Owner 2026-08-12) |
| `work:manage` delegation to staff | Remains `is_delegable_to_staff=false` |

### 5. Control home `/` and `/me` (no redesign)

- One attention row `work:mine-due` only when count > 0.
- No Work Kanban or module tile forced into `/` operations grid.
- `/me` CTA when `can_access_workspace()` — unchanged.

### 6. Explicit non-goals for this ADR

Task `sort_order` inside board columns; Gantt; AI; `/ds-lab` Work recipe
(optional later); tightening create to lead-only; full `/work/projects` CRUD;
changing `work:manage` delegability; Branch `/br/…/team` semantics;
forcing Inbox onto gold `DataTable` in this wave.

### 7. `/work/team` MVP (W-UI-4 — included)

**Meaning:** Control Surface admin for **Work departments and their members**
(`work_departments` / `work_department_members`), not Branch operator team
rosters and not project rosters (`/work/projects` stays later).

**MVP scope:**

1. LIST of departments (pilot: `Van phong`); select one department via URL
   `?department=`.
2. Members of that department: name, role `lead|member`, active flag.
3. Owner / `work:manage` actions via new SECURITY DEFINER RPCs (tables stay
   SELECT-only for `authenticated`):
   - add/reactivate member with role
   - set role lead|member
   - deactivate member (respect one-active-department-per-user index)
4. Deep link from `/work` chrome (header secondary or toolbar) for entitled
   users only.
5. Census: `LIST` + `AppListFrame`; create/add via `FormDialog`.

**Out of W-UI-4 MVP:** project members, multi-department org chart, HR position
sync, staff self-join.

## Implement waves (Accepted package)

| Wave | Outcome | Proof |
| --- | --- | --- |
| **W-UI-1** | Create FormDialog + header CTA; DETAIL `StatusBadge` + title | Static + smoke create→inbox→detail |
| **W-UI-2** | Inline toolbar: view switcher + `status`/`q` filters; board scope in toolbar | URL round-trip static |
| **W-UI-3** | Compose/static guards for TASK_* markers; empty/error `AppEmptyState` | `lint:ui-contract` + work-module-static |
| **W-UI-4** | `/work/team` + membership RPCs | Static + smoke add member → member opens `/work` |

Recommended order: W-UI-4 early or parallel to W-UI-1 so assign has targets.

## Accept record (Owner 2026-08-12)

| Q | Choice | Meaning |
| --- | --- | --- |
| Q1 | **A** | Inbox stays LIST queue variant (`Item`), not gold `DataTable` |
| Q2 | **A** | Keep lead ≡ member for `create_work_task` this wave |
| Q3 | **Include** | W-UI-4 `/work/team` department membership in this package |

Analysis tables that informed Accept remain in Git history of this file’s
Proposed revision; runtime authority follows § 3–§ 4 and § 7.

## Consequences

- ADR 0033 remains the hosting/domain SSOT; this ADR owns UI compose + create UX
  + documented create authority + `/work/team` MVP.
- Pilot smoke in `tasks/todo.md` stays required; UI waves do not replace the
  7-day membership watch.
- W-UI-4 adds SECURITY DEFINER membership RPCs (T2, department members only).
- Rollback of UI waves is deploy revert; domain rollback remains
  `docs/runbooks/work-module-pilot-rollback.md`.
- Implementation may start: preferred W-UI-4 early, then W-UI-1..3.