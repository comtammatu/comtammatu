# ADR 0033 — Work module: hosting, UI compose, and authority

**Status:** Accepted (Owner 2026-08-11 hosting/domain; 2026-08-12 UI compose
Accept — Q1=A, Q2=A, Q3=include `/work/team`)

**Decision owner:** Owner

**Amended by:** ADR 0037 (`/me` stays `Trang cá nhân`; the Work CTA is removed;
due Work surfaces in the `/` Mine region, not a Work shell on `/`).

Runtime compose: [`docs/spec/page-archetypes.md`](../../spec/page-archetypes.md)
TASK_* and [`docs/ref/screen-context-map.md`](../../ref/screen-context-map.md)
§2.4C. This ADR owns hosting and authority; do not implement UI recipes from
here.

## Decision

- Routes live under `apps/web` at `/work/*` inside Control Surface chrome. No
  `apps/workspace`, no `work.*` host, no second Production Vercel project, no
  Work-specific cookie domain.
- `ModuleKey` `work` with `path: "/work"`. Candidate roles may include all
  staff; live authority is `can_access_workspace()` + RLS membership — not nav
  ACL alone.
- `/work` opens Inbox (`view=mine`). Org-wide Kanban is forbidden as default
  and on `/`. Filters never take `tenant_id` from the client. Routes: Inbox
  `/work`; task DETAIL `/work/tasks/[id]`; projects `/work/projects`; team
  `/work/team` (`work:manage` — Work departments and members, not Branch
  `/br/…/team`).
- Create allowed for Owner, `work:manage`, or any active department member.
  `work:manage` stays `is_delegable_to_staff=false`.
- Tasks may link to Finance/Inventory/HR records later but must not copy money,
  stock, or payroll payloads. Mutations use atomic RPCs + `expected_revision`.
  Never merge `work_tasks` into `position_shift_tasks`.
- Compose shapes `TASK_BOARD`, `TASK_CALENDAR`, `TASK_TIMELINE` are Control
  Surface recipes — not KDS `BOARD` / `station_chrome`.

## Non-goals

Separate Work deployable; org-wide Kanban wall on `/`; AI/wiki; Gantt;
time tracking; changing Branch KDS BOARD semantics; changing `/br/…/team`;
tightening create to lead-only; changing `work:manage` delegability.

## Verification

Notification `action_url` values are same-origin `/work/tasks/[id]`. Domain
rollback: `docs/runbooks/work-module-pilot-rollback.md`.
