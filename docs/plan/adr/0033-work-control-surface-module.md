# ADR 0033 — Work module: hosting, UI compose, and authority

**Status:** Accepted (Owner 2026-08-11 hosting/domain; 2026-08-12 UI compose Accept — Q1=A, Q2=A, Q3=include `/work/team` — consolidated from ADR 0035; merged 2026-08-24 — Git keeps the original)

**Decision owner:** Owner — **Review tier:** T2 (Control Surface module, membership RLS, notifications, membership RPCs; no money/stock/payroll schema)

**Amended by:** ADR 0037 (`/me` stays `Trang cá nhân`; the Work CTA is removed; Work surfaces as the `/` attention row).

## Context

Office staff need cross-department assigned work (inbox, board, calendar,
timeline) without a second deployable or second auth cookie domain. PR #348 /
`codex/workspace-foundation` proposed `apps/workspace` +
`work.comtammatu.com`; Owner rejected separate-app hosting in favor of same
Control Surface. ADR 0033 shipped W0–W5; investigation (2026-08-12) then
confirmed the pilot UI gaps blocking “done”: no create CTA, filters parsed
but not rendered, view toolbar outside `AppListFrame`, DETAIL without
`StatusBadge`, census mismatch, no `/work/team` onboarding path, and
`work:manage` not staff-delegable. Canonical product/IA:
`docs/ref/screen-context-map.md` §2.4C; compose recipes `docs/spec/page-archetypes.md` TASK_*; module seams `docs/modules/web-app.md`.

## Decision

### 1. Same Surface
Routes live under `apps/web` at `/work/*` inside Control Surface chrome. No
`apps/workspace`, no `work.*` host, no second Production Vercel project, no
Work-specific cookie domain, no `work_*` money/stock/payroll payloads.
Atomic RPCs + `expected_revision` stay mandatory.

### 2. Module ACL
`ModuleKey` `work` with `path: "/work"` (web default; no `app: "workspace"`).
Candidate roles may include all staff; live authority is
`can_access_workspace()` + RLS membership — not nav ACL alone.

### 3. Landing and views (URL only)
`/work` opens Inbox (`view=mine` / assignee·participant); full
multi-department Kanban is forbidden as default. `view=board|calendar|timeline`
with required scope (`project` or `department` for board/timeline). Filters:
`view`, `department`, `project`, `status`, `assignee`, `q`, `from`, `to`;
reject unknown enums; never take `tenant_id` from the client. Routes: Inbox
`/work`; task DETAIL `/work/tasks/[id]`; projects `/work/projects` +
`/work/projects/[id]`; team `/work/team` (`work:manage`).

### 4. Compose model for `/work`
| URL state | Compose shape | Required chrome |
| --- | --- | --- |
| `view=mine` (default) | **LIST** (queue variant — Accepted Q1=A) | `AppPage` xwide+compact → `AppPageHeader` (create in `actions`) → `AppListFrame` + `AppToolbar variant="inline"` → `Item` queue (not `DataTable` for this wave) |
| `view=board` + scope | **TASK_BOARD** | Same page shell; body is board; scope required (department **xor** project) |
| `view=calendar` | **TASK_CALENDAR** | Same shell; month via `month=` |
| `view=timeline` + `project=` | **TASK_TIMELINE** | Same shell; redirect to `view=mine` if project missing |
| `/work/tasks/[id]` | **DETAIL** | Header title = task title; `StatusBadge` for status; `AppBackLink`; primary save in `AppDetailFooter` |
| `/work/team` | **LIST** | Department-scoped membership admin (§8) |

Compose shapes `TASK_BOARD`, `TASK_CALENDAR`, `TASK_TIMELINE` are Control
Surface recipes — not KDS `BOARD` / `station_chrome`. **Census:** keep
`/work/page.tsx` compose entry as `LIST` (CI LIST frame law); register child
`data-page-archetype` for TASK_* with a static guard that board/calendar/timeline
bodies declare those markers; do **not** classify office Kanban as station
`BOARD`; register `/work/team/page.tsx` as `LIST`. **View switcher:**
URL-driven `Button`/`Link` row inside the list toolbar slot (or
`AppPageHeader.tabs` only if it stays link-mode); no full
`AppPageTabs`+`TabsContent` for Work views.

### 5. Create and assign (product)
1. **Create CTA** on Inbox (and optionally Board when scoped):
   `AppPageHeader.actions` → `FormDialog` → `createWorkTask`.
2. Create allowed for: Owner, `work:manage`, or **any active department
   member** (lead and member equal for create — Accepted Q2=A; do not invent
   lead-only create in this wave).
3. Assignee picker: department members of the selected department (UI);
   server may still accept any active profile; UI stays narrower. On assign
   (create or update): keep `work.task_assigned` notification.

### 6. Authority (no silent widening)
| Action | Who (RPC today → keep unless noted) |
| --- | --- |
| Bootstrap pilot `Van phong` | Owner or `work:manage` via `ensure_pilot_work_department` |
| Create task | Owner · `work:manage` · active dept member (Q2=A) |
| Write/status/comment/checklist | `can_write_work_task` (Owner · manage · assignee · created_by · dept member · project lead/collaborator) |
| Membership admin `/work/team` | Owner · `work:manage` (W-UI-4 in scope — Owner 2026-08-12) |
| `work:manage` delegation to staff | Remains `is_delegable_to_staff=false` |

Tenant `work:manage` for Owner (department/member admin in MVP). Leads get
authority from membership tables, not broad tenant grants. Pilot department
label: `Văn phòng`.

### 7. Control home `/` and `/me` (ADR 0037)
- `/` remains module attention hub; one attention row `work:mine-due` only when
  count > 0 → `/work`; no Work shell/Kanban/module tile in the `/` grid.
- `/me` remains `Trang cá nhân` (clock + `Việc trong ca`). The Work CTA was
  removed by ADR 0037; due Work tasks surface on the `/` attention row. Never
  merge `work_tasks` into `position_shift_tasks`.

### 8. Domain and `/work/team` MVP
Additive `work_*` tables: `work_departments`, `work_department_members`,
`work_projects`, `work_project_members`, `work_tasks`,
`work_task_participants`, `work_task_checklist_items`, `work_task_comments`,
`work_task_attachments`, `work_task_events`. Status: `backlog | todo |
in_progress | review | done | canceled`; priority: `low | normal | high |
urgent`. Tasks may link to Finance/Inventory/HR records later but must not
copy money, stock, or payroll payloads; mutations use atomic RPCs +
`expected_revision`.

`/work/team` (W-UI-4) is the Control Surface admin for **Work departments
and their members** (`work_departments` / `work_department_members`), not
Branch operator team rosters and not project rosters (`/work/projects` stays
later). MVP: (1) LIST of departments (pilot: `Van phong`), select one via
URL `?department=`; (2) members: name, role `lead|member`, active flag;
(3) Owner / `work:manage` actions via SECURITY DEFINER RPCs (tables stay
SELECT-only for `authenticated`): add/reactivate member with role, set role,
deactivate member (respect one-active-department-per-user index); (4) deep
link from `/work` chrome for entitled users only; (5) census `LIST` +
`AppListFrame`, create/add via `FormDialog`. Out of W-UI-4 MVP: project
members, multi-department org chart, HR position sync, staff self-join.

### 9. Supersession
Separate-app design in PR #348 is not to be merged as runtime; domain ideas
(`work_*`, membership, inbox-first) stay in this ADR.

## Implement waves (Accepted package)
| Wave | Outcome | Proof |
| --- | --- | --- |
| **W-UI-1** | Create FormDialog + header CTA; DETAIL `StatusBadge` + title | Static + smoke create→inbox→detail |
| **W-UI-2** | Inline toolbar: view switcher + `status`/`q` filters; board scope in toolbar | URL round-trip static |
| **W-UI-3** | Compose/static guards for TASK_* markers; empty/error `AppEmptyState` | `lint:ui-contract` + work-module-static |
| **W-UI-4** | `/work/team` + membership RPCs | Static + smoke add member → member opens `/work` |

Recommended order: W-UI-4 early or parallel to W-UI-1 so assign has targets.
Analysis tables that informed Accept remain in Git history of ADR 0035’s Proposed revision; runtime authority follows §5–§6 and §8.

## Consequences

- W0–W5 code is on Production; remaining proof is member/non-member pilot
  smoke and the 7-day watch (`docs/runbooks/work-module-pilot-rollback.md`);
  UI waves do not replace it.
- Notification `action_url` values are same-origin `/work/tasks/[id]`;
  `login-destination` stays unchanged.
- Page-archetype census must register Work routes under LIST/DETAIL or TASK_*
  compose shapes — never under station BOARD; W-UI-4 adds SECURITY DEFINER
  membership RPCs (T2, department members only). Rollback of UI waves is
  deploy revert; domain rollback remains `docs/runbooks/work-module-pilot-rollback.md`.

## Non-goals

Separate Work deployable; org-wide Kanban wall on `/`; AI/wiki; Gantt
leveling; time tracking; changing Branch KDS BOARD semantics; task
`sort_order` inside board columns; `/ds-lab` Work recipe (optional later);
tightening create to lead-only; full `/work/projects` CRUD; changing
`work:manage` delegability; Branch `/br/…/team` semantics; forcing Inbox
onto gold `DataTable` in this wave.
