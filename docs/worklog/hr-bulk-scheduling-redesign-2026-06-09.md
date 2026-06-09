# HR bulk scheduling redesign - T3 Contract

Date: 2026-06-09

## Surface

- Surface: `/hr` route family.
- Primary user job: manager creates reusable shifts, schedules many employees across many days, and reviews attendance without per-person-per-day busywork.
- Change type: schema/RPC migration, Server Actions, and HR UI rebuild.
- Primitives: existing `AppPage`/`AppSection`, shadcn Tabs, Button, Sheet, Dialog, AlertDialog, Table, Select, Input, Checkbox, Badge, Spinner.

## Skill Plan

Repo rules = engineering + database + ui + workflow + references. External skills = supabase, supabase-postgres-best-practices, shadcn, next-best-practices. Runtime tools = local source inspection, static tests, typecheck/lint/build. Skipped = direct Supabase apply/db:types because `supabase` CLI is unavailable in this shell; migration is written for owner/dev apply.

## T3 Debate

PM:
- Build the smallest useful bulk scheduler now: shift CRUD plus multi-employee, multi-day assignment.
- Acceptance is fewer clicks for weekly/monthly scheduling, with preview counts before write.
- Keep Employee daily work stable; do not expand into multi-shift attendance in this PR.

BA:
- The workflow keeps one primary shift assignment per employee per business date because the DB unique constraint already enforces it.
- Active branch, active shift, and active employees must be checked before assignment.
- Existing assignments are handled by explicit mode: skip or replace future.
- Deleting/switching assignments should be limited to future dates to avoid corrupting attendance/payroll history.

Senior Dev:
- Multi-row assignment must be one Postgres RPC, called from a Zod-validated Server Action through service role.
- Shift update/deactivate stays action-gated by branch scope and staff management permission.
- UI should reuse existing HR route structure and shadcn primitives instead of creating a new surface system.
- Generated DB types cannot be refreshed here until the migration is applied to the type source schema.

QA/QC:
- Static tests must prove the RPC exists, grants are service-role-only, and client code does not scatter insert assignments.
- Source tests must cover bulk preview/action symbols and UI controls for employee/date selection and modes.
- Full gates are `pnpm typecheck && pnpm lint && pnpm build`; note any unrelated dirty-tree test blockers separately.

## Unified Contract

1. `/hr` keeps tabs: Nhân viên, Ca làm, Phân ca, Ngày công.
2. `Ca làm` supports create, edit, and deactivate; no hard delete.
3. `Phân ca` supports bulk scheduling many employees across a date range with weekday filters.
4. Bulk write goes through `bulk_upsert_shift_assignments` and returns counts for created, skipped, replaced, and invalid items.
5. This change does not alter `attendance_records` or introduce multi-shift-per-day attendance.
