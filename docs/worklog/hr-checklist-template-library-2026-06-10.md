# HR Checklist Template Library - T3 Contract

Date: 2026-06-10

## Surface

- Surface: `/hr` workspace and `/employee` daily work loop.
- Primary user job: Owner/Manager maintain reusable work checklist templates, assign a default template to each employee, optionally override a scheduled day, then monitor completion from HR while floor staff only tick `Chưa làm` / `Xong`.
- Route family: `/hr`, `/employee`, `/employee/tasks`, `/employee/clock`, branch settings shortcut.
- Change type: schema/RLS/RPC migration, Server Actions, HR UI, Employee task display, seed data.
- Primitives: existing `AppPage`/`AppSection`, shadcn Tabs, Button, Dialog, Sheet, Table, Select, Input, Textarea, Checkbox, Badge, Progress, Item.

## Skill Plan

Repo rules = engineering + skills + database + ui + workflow + references. External skills = supabase + shadcn. Runtime tools = local source inspection, migration/type checks, browser smoke. Supabase CLI is unavailable in this shell, so the migration file is authored manually and `pnpm db:types` may require owner/dev apply later.

## T3 Debate

PM:
- Build checklist as an HR operations capability, not a new system role.
- MVP is global + branch template library, employee default assignment, daily override through scheduling, snapshot on clock-in, and HR monitoring.
- Keep the employee experience narrow: no template editing or choosing on the floor-staff screen.

BA:
- Effective template precedence is shift override, then employee default, then empty checklist.
- Template edits never mutate active or historical attendance checklist rows.
- Branch managers may create/edit branch templates for their own branch only; Owner/super_manager may manage global and branch templates.
- Checkout should be blocked only by unfinished required items.

Senior Dev:
- Keep `attendance_records` as the workday parent and snapshot checklist item fields onto `attendance_checklist_items`.
- Stop selecting checklist templates by `role_code`; keep legacy role data only as migration compatibility.
- Use service-role Server Actions and Postgres RPCs for multi-item template writes and clock-in snapshot.
- Extend existing HR/Employee components instead of introducing a separate checklist app surface.

QA/QC:
- Static tests must prove role-scoped selection is gone, snapshot fields exist, RPC grants remain service-role-only, and direct attendance writes stay revoked.
- Behavior tests cover Owner global template, branch manager branch template, employee default, shift override precedence, required-only checkout block, and empty checklist fallback.
- Required gates remain shared/web tests, typecheck, lint, build, and browser smoke where auth/env allow it.

## Unified Contract

1. Checklist templates are work templates: `Quầy`, `Phục vụ`, `Nướng`, `Phụ bếp`, `Tạp vụ`.
2. System roles remain authorization buckets only.
3. Global templates use `branch_id = null`; branch templates use the branch id.
4. Employee default template is the normal assignment path; shift assignment override wins for that date.
5. Clock-in snapshots template item title, phase, done definition, required flag, and sort order.
6. Employee task state remains binary.
7. HR is the management and monitoring surface.
