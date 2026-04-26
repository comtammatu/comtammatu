# Cổng nhân viên rebuild plan

> Updated: 2026-04-25 | Status: planning contract | Route family: `/employee/*`

## 4-agent debate summary

This plan synthesizes the required 4-agent debate:

| Role | Decision |
| --- | --- |
| PM | Rebuild `/employee` as a narrow staff self-service surface, not a dashboard or admin shell. |
| BA | Self-service data must resolve from the logged-in user only; HR/payroll management stays in `/hr` and `/admin/staff`. |
| Senior Dev | Data contract must be fixed before UI polish: self employee lookup, attendance writes, schedule RLS, and released payslip reads. |
| QA/QC | Payroll privacy, RLS negative tests, attendance server validation, and mobile browser checks are release-blocking. |

Agreements:

- `/employee/*` is the staff self-service route family for all authenticated staff roles.
- `/hr/*` owns HR/payroll management. `/admin/staff/*` owns staff account and permission administration.
- The portal home must answer three questions in the first mobile viewport: am I clocked in, what is my next shift, where do I go next?
- POS/KDS links are role handoffs only. They must not become embedded workflows inside the portal.
- The current landing page is too hero/dashboard-like and has management launcher drift.
- Existing subroutes are enough for MVP; new request workflows are later scope.

Conflict resolutions:

- M7 is marked shipped, but full portal features are deferred. Treat current M7 as baseline availability, not feature-complete self-service.
- Managers may use `/employee`, but they see their own self-service state first. Management links, if kept, are compact secondary handoffs, never a second navigation shell.
- Payslip exposure defaults to `paid` payroll periods only. `draft`, `calculated`, and `approved` are not visible to employees until business explicitly adds a release state.
- `/employee/permissions` is not part of the normal MVP staff experience. Either hide it from production navigation or convert it into a plain-language support summary.

## Surface contract

Surface: `Cổng nhân viên` (`/employee/*`).

Primary user job:

- Staff starts or reviews their workday: clock in/out, view schedule, check attendance history, view released payslips, confirm profile/support data, and jump to POS/KDS when authorized.

Change type:

- Visual refactor: yes.
- UX flow change: yes, mainly task ordering and removal of dashboard/admin drift.
- Copy change: yes, use Vietnamese utility copy and glossary terms.
- Behavior/data contract change: yes, because current self-service reads and writes are not fully safe without RLS/RPC cleanup.

Design-system primitives:

- `Button`, `Badge`, `Card`, `Item`, `ItemGroup`, `Table`, `Tabs`, `Sheet` or `Drawer`, `Alert`, `Empty`, `Spinner`, `Skeleton`, `Input`, `Select`, `Field`, `FieldGroup`, `Separator`.
- Use Tabler icons through the current shadcn contract.
- No fake primitives, no route theme, no decorative admin dashboard cards, no arbitrary Tailwind dimensions.

## Current route inventory

| Route | Current purpose | Rebuild decision |
| --- | --- | --- |
| `/employee` | Portal home plus POS/KDS/admin/workspace links | Rebuild as today task hub. Remove hero/dashboard feel and management-shell drift. |
| `/employee/clock` | GPS + QR/manual code clock-in, clock-out | Keep as primary workflow; move critical validation into server/RPC contract. |
| `/employee/schedule` | Weekly self schedule | Keep; enforce self-only data below app filtering. |
| `/employee/attendance` | Last 30 days attendance | Keep; make history compact and self-scoped. |
| `/employee/payslip` | Recent payroll entries | Keep only released/paid self payslips. |
| `/employee/profile` | User profile, branch, employee code, trust score | Keep; mask/omit sensitive data by default. |
| `/employee/permissions` | Auth v2 self-debug page | Exclude from normal MVP navigation or convert to plain-language support summary. |

## Data contract risks to fix first

These are blockers before UI rebuild is considered complete:

1. `employees_select` currently gates on `hr:view_employee`, which can block normal staff from resolving their own `employees.profile_id`.
2. Attendance writes rely on app-layer GPS/HMAC checks and direct `attendance_records` DML. Move clock-in/out to RPCs that re-check employee, tenant, branch, GPS, daily code, duplicate state, and checkout state.
3. `shift_assignments_select` from the original HR migration is tenant-wide. The app filters self, but RLS should enforce self vs manager scope or the portal should read through a self RPC.
4. Payslip reads currently fetch recent payroll entries without an employee release-state filter. Use a `get_my_released_payslips` RPC or equivalent server boundary that returns only self rows from `paid` periods.
5. Never accept `employeeId` from URL or client state for self-service routes. Resolve `auth.uid()` -> `employees.profile_id` -> `employees.id` server-side every time.

## MVP business rules

- The portal is self-service for every staff role, including owner and managers.
- `position` is an HR label, not an authorization gate. Action availability comes from `staff_permissions` and permission RPCs.
- Clock-in branch policy for MVP: allow the assigned branch from JWT, or a branch scheduled for the employee on that date. Cross-branch ad-hoc clock-in is deferred.
- Clock-in requires server-side GPS radius check within 200m and a valid daily QR/manual code.
- Clock-out updates the user's current open record. Requiring GPS for checkout is deferred unless the owner explicitly chooses it.
- One attendance row per employee/day remains the MVP model. Split shifts, overnight shifts, and multi-branch same-day work require a separate schema decision.
- Schedule is read-only for the employee.
- Attendance history is read-only for the employee. Corrections/disputes are deferred, with a clear "contact manager" path.
- Payslip is read-only and self-only. Show only paid/released periods.
- Profile shows non-sensitive data by default. Mask or omit CCCD, bank details, GPS coordinates, raw permission grants, and payroll internals unless explicitly needed.

## Out of scope

- Employee CRUD, contract management, payroll calculation, payroll approval, shift assignment editing, permission grant/revoke.
- Revenue, finance, inventory, procurement, or admin report dashboards.
- Leave/overtime/request workflows, document signing, employee notification center, and manager approvals.
- Local-first/offline portal behavior.
- New design system, new app shell, or a second admin navigation model.

## Implementation waves

### Wave 0 - Route Contract

Deliverables:

- Keep this plan as the task contract.
- Add or update `/employee/*` route contracts in `docs/plan/ui-ux-page-contracts.md` before runtime edits.
- Confirm terminology against `docs/ref/glossary.md` and `packages/shared/src/labels/vi.ts`.

Exit criteria:

- Surface, user job, route family, change type, primitives, risks, and acceptance criteria are explicit for each subroute.

### Wave 1 - Self-service Data Boundary

Deliverables:

- Add a safe self employee context boundary, preferably a single helper/RPC used by all portal pages.
- Fix self-access for `employees`.
- Move clock-in/out writes behind RPCs or an equivalent atomic server boundary.
- Add self-only schedule and released-payslip read paths.
- Run `pnpm db:types` after applied migration changes to the type source schema.

Exit criteria:

- Staff without HR permissions can resolve their own portal context.
- Direct client reads/writes cannot access another employee's schedule, attendance, or payroll.
- Raw Supabase/Postgres errors are mapped to safe Vietnamese messages.

### Wave 2 - Server and Component Structure

Deliverables:

- Create `apps/web/app/employee/_lib/*` for `getCurrentEmployee`, VN business date helpers, branch/schedule summary mapping, and action result mapping.
- Remove stale self-service code that imports HR management actions from `apps/web/app/hr/actions.ts`.
- Keep Server Components responsible for initial data. Client components handle only interaction state.

Exit criteria:

- No client component imports the `@comtammatu/database` barrel.
- Server Actions validate inputs with Zod 4.
- Common self-service lookups are not duplicated across pages.

### Wave 3 - Portal Home UX

Deliverables:

- Rebuild `/employee` as a task hub:
  - Today clock state and primary action.
  - Next shift / current shift summary.
  - Compact links to schedule, attendance, payslip, profile.
  - POS/KDS handoff links only when route access and branch context allow it.
- Remove hero copy, admin-dashboard cards, duplicated status blocks, and broad management launcher feel.

Exit criteria:

- First mobile viewport shows the next staff action.
- Manager users still see their own portal state first.
- No HR/admin management content is embedded in the portal.

### Wave 4 - Subroute Polish

Deliverables:

- `/employee/clock`: state machine polish, safe fallback when camera/GPS/config fails, no secret leaks.
- `/employee/schedule`: week controls, self-only rows, clear empty state.
- `/employee/attendance`: 30-day history, status labels, mobile list and desktop table.
- `/employee/payslip`: released payslip list, clear period status, net/gross/insurance/PIT breakdown.
- `/employee/profile`: safe personal summary, branch, position, support state.
- `/employee/permissions`: hide from normal nav or convert to support-safe plain-language summary.

Exit criteria:

- All pages use approved primitives and stable responsive layouts.
- Vietnamese copy is not mojibake and follows glossary terminology.

### Wave 5 - Verification and Release

Required gates:

1. Auth/RLS negative tests with at least two users and two branches.
2. Attendance tests for GPS denied, GPS too far, no GPS config, wrong code, valid manual code, camera fallback, duplicate check-in, checkout before check-in, second checkout.
3. Payroll privacy review: no draft/calculated/other-employee payroll rows in network payload or UI.
4. Browser checks on mobile and desktop for `/employee`, `/employee/clock`, `/employee/schedule`, `/employee/attendance`, `/employee/payslip`, `/employee/profile`, and whichever permissions/support route remains.
5. `pnpm typecheck && pnpm lint && pnpm build`.
6. QA confirms UI visibility is not treated as authorization.

## Acceptance criteria

- `/employee/*` remains accessible to all staff roles allowed by module ACL.
- A staff member without HR permissions can use self-service routes when linked to an employee record.
- A staff member cannot view or mutate another employee's attendance, schedule, payslip, profile, or permission summary.
- Clock-in/out cannot be bypassed by calling Supabase tables directly from the client.
- Payslip shows only paid/released self records.
- Missing employee record, missing branch, no GPS config, no payslip, and access-blocked states use safe actionable UI.
- No raw database error messages reach the client.
- UI follows `radix-lyra`, `stone`, `tabler`, and the existing shadcn primitive catalog.
- No route-specific theme layer, fake primitive, arbitrary dimensions, or new vocabulary source.

## Implementation prompt

Use this prompt for the next implementation pass:

```text
You are working in C:\Users\MATU\Downloads\comtammatu.

Goal: implement the Cổng nhân viên (`/employee/*`) rebuild from docs/plan/employee-portal-rebuild-plan.md.

Before editing:
1. Read AGENTS.md.
2. Read docs/agent/rules/engineering.md, database.md, ui.md, workflow.md, and references.md.
3. Read docs/spec/design-system.md, docs/modules/ui.md, tasks/regressions.md, docs/ref/glossary.md, docs/ref/payroll-pit.md, and docs/ref/labor-contracts.md.
4. Run the required 4-agent debate for implementation scope unless the current change is documentation-only.

Implementation order:
1. Add/update `/employee/*` route contracts in docs/plan/ui-ux-page-contracts.md.
2. Fix self-service data boundaries first:
   - self employee context,
   - safe clock-in/out RPC or equivalent atomic boundary,
   - self-only schedule reads,
   - paid/released self payslip reads.
3. Add `apps/web/app/employee/_lib/*` helpers for current employee, VN business date, branch/schedule summary, and safe action messages.
4. Rebuild `/employee` as a narrow task hub, not a second admin shell.
5. Polish clock, schedule, attendance, payslip, profile, and permissions/support route.

Constraints:
- Use supabase-js only. Never Prisma.
- Validate all Server Action inputs with Zod 4.
- Never return raw Supabase/Postgres error messages to clients.
- Never import `@comtammatu/database` barrel in client components.
- Do not store scope in localStorage or React Context.
- Use shadcn/radix-lyra primitives and current semantic tokens only.
- Keep UI copy Vietnamese and glossary-aligned.
- Preserve unrelated worktree changes.

Verification:
- Run focused auth/RLS tests for two users and two branches.
- Verify attendance GPS/QR/manual code flows.
- Verify payroll privacy and released-only payslip output.
- Browser-check mobile and desktop for every `/employee/*` route touched.
- Run `pnpm typecheck && pnpm lint && pnpm build` before marking implementation complete.

Deliverable:
- Code and migration/docs changes needed to satisfy the plan.
- A concise final report with changed files, verification commands, and any remaining blockers.
```
