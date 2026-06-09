# Employee checkout approval - T3 Contract

Date: 2026-06-09

## Surface

- Surface: Employee daily work loop and Branch Manager approval queue in `apps/web`.
- Primary user job: attendance-subject staff finishes checklist, sends a checkout request, then the correct manager tier approves it.
- Route family: `/employee`, `/employee/clock`, `/employee/tasks`, `/employee/checkout-approvals`.
- Change type: schema/RPC/action authorization plus Employee/Branch Manager UX state change.
- Primitives: existing Employee shell, `AppSection`, shadcn Button/Badge/Item/Table/Alert.
- Motion/effect role: none beyond lightweight pending state.

Skill plan: repo rules = engineering + database + ui + workflow; external skills
= shadcn + supabase + supabase-postgres-best-practices; runtime tools = CLI
static checks, no live DB apply; skipped = browser smoke until a dev session/auth
target is available.

## T3 Debate

PM:

- Build the smallest approval loop: request checkout from the existing clock screen, approve from the correct manager queue.
- Acceptance is that staff cannot finalize `check_out` directly; Branch Manager approves branch floor staff only, while Branch Manager checkout escalates upward.
- Checkout request is a direct handoff to management approval; staff must not scan QR or enter a branch code before sending it.
- Do not treat Employee portal access as attendance obligation for every role.

BA:

- Checklist completion remains a prerequisite before a checkout request can be sent.
- The final attendance `check_out` should use the employee request time, not the later manager click time, so payroll reflects when staff handed off.
- Duplicate requests should be idempotent and stay pending until approval.
- The approval request itself is the proof-of-handoff; manager approval is the control point.
- Branch Manager must not approve another branch, must not self-approve, and must not approve another Branch Manager's own checkout.
- Branch Manager checkout should target owner/super-manager/area-manager; if no upper manager process exists, the request must remain pending rather than self-finalizing.
- Roles without a floor shift or open attendance record are not forced into chấm công just because they can access self-service.

Senior Dev:

- Keep `attendance_records` as the source of truth and add request/approval metadata columns instead of introducing a parallel table.
- Change employee checkout RPC semantics from "finalize" to "request"; store requester role and target approval roles on `attendance_records` without any checkout-code gate.
- Continue using service-role Server Actions, but pass tenant, branch, employee/user identifiers into RPCs so scope is checked in SQL too.
- Emit a durable notification to the computed target roles using the existing notifications table.

QA/QC:

- Verify pending, done, and duplicate request states from both employee home and clock page.
- Verify the approval action is role and branch scoped, including Branch Manager with null branch, self-approval, and Branch Manager requester escalation.
- Verify non-floor roles with no shift/open attendance land in a non-required state instead of a forced clock-in CTA.
- Check generated DB types and focused static tests in addition to `pnpm typecheck && pnpm lint && pnpm build`.
- Recheck regression rules around service-role attendance writes and UI permission flags.

## Unified Contract

1. Staff completes checklist, then sends a checkout request for manager approval.
2. A request stores `checkout_requested_at`, requester role, and target approval roles; it does not set `check_out` and does not require QR/code verification.
3. Branch Manager approves cashier/waiter/chef pending requests on `/employee/checkout-approvals`.
4. Approval sets `check_out = checkout_requested_at` and records approval actor/time.
5. Branch Manager checkout targets owner/super-manager/area-manager and cannot be approved by the same Branch Manager.
6. Attendance obligation is workflow/data driven: default floor roles (`cashier`, `waiter`, `chef`), today's scheduled shift, or an already opened attendance record. Other roles with no shift/open attendance are not forced to chấm công.
7. The existing Employee shell remains the UI authority; no new portal or HR dashboard is introduced.

## Environment Note

`supabase` CLI is available through `pnpm dlx supabase`; direct shell `supabase`
is not installed. Migrations were not applied directly to the linked Supabase
project in this workspace. Apply migrations only to an approved dev/test target,
then run `pnpm db:types` if the generated type source schema is updated.

## Hotfix - Private Schema Usage

Root cause found on 2026-06-09: `employee_request_clock_out` reached a valid
open attendance record, then failed with `permission denied for schema private`
when resolving `private.staff_role_from_position_code(...)`. Granting `EXECUTE`
on the helper function alone is insufficient; PostgreSQL also requires `USAGE`
on the containing schema.

T3 hotfix synthesis:

- PM: checkout submission must work after checklist completion; no QR/code path
  should be reintroduced.
- BA: service-role Server Actions may use private helpers, but browser-callable
  `anon` and `authenticated` roles must not gain private schema access.
- Senior Dev: add a narrow migration granting only `USAGE ON SCHEMA private` and
  helper `EXECUTE` to `service_role`; keep revoke coverage for public roles.
- QA/QC: reproduce with a cleanup-backed probe record, verify the raw DB error,
  then add a static regression assertion for the schema grant.
