# HR Permission Contract Lock

> Reconciled-through b179630bb

Review tier: T3, because this slice changes HR auth/action gates.

Skill plan: repo rules = engineering + skills + database + workflow; external skills = supabase; runtime tools = CodeGraph + local tests; skipped = DB apply/browser smoke because this is contract/action-gate work.

PM: scope = lock `/hr` semantics and remove staff-admin permission ambiguity; acceptance = owner-only staff/payroll/contract mutation, branch-manager branch-safe attendance/leave view/review, floor staff no `/hr`.

BA: rules = route ACL, PBAC grants, Server Action gates, and RLS are separate; branch-manager cannot mutate tenant-wide staff access or global position-task setup.

Senior Dev: approach = reuse existing `MODULE_ACL.staff.allowedRoles`, narrow the few mismatched action/page gates, and add one static guard instead of new auth abstractions.

QA/QC: tests = targeted auth static test plus `typecheck`, `lint`, `build`, `git diff --check`, and CodeGraph re-index/status.

## HR Operation Boundary Cleanup

Review tier: T3, because this slice tightens a branch-scoped HR mutation gate.

Skill plan: repo rules = engineering + skills + database + workflow; external skills = supabase; runtime tools = CodeGraph + local tests; skipped = DB migration/browser smoke because this is a Server Action wrapper guard only.

PM: scope = keep the `/hr` cleanup narrow; acceptance = branch-manager mutations do not run before branch scope is established.

BA: rules = branch-manager may oversee own-branch attendance, but cannot widen a stale-attendance close to tenant scope.

Senior Dev: approach = reuse `withAction({ requireBranchScope: true })`; no new helper or permission abstraction.

QA/QC: tests = extend the HR static contract guard and rerun auth/scope targeted tests plus repo gates.

## HR Branch Manager Surface Cleanup

Review tier: T2, because this slice changes HR route presentation but keeps the
server action and RLS contract unchanged.

Skill plan: repo rules = engineering + skills + database + ui + workflow;
external skills = supabase; runtime tools = CodeGraph + local tests; skipped =
DB migration/browser smoke because this is a conditional render cleanup.

PM: scope = make the branch-manager `/hr` surface match the permission
contract; acceptance = branch-manager sees branch-safe people/day oversight,
not owner global setup or payroll readiness.

BA: rules = `/hr` route admission is not permission to configure global shifts,
position task rules, payroll, salary, or HĐLĐ data.

Senior Dev: approach = reuse existing `canManageEmployees` server-derived prop
instead of adding a new client permission model.

QA/QC: tests = extend the HR static guard to keep setup and shift fetching
owner-only on the client surface.

## HR Leave Read Scope Cleanup

Review tier: T3, because this slice tightens branch-scoped HR read
authorization.

Skill plan: repo rules = engineering + skills + database + workflow; external
skills = supabase; runtime tools = CodeGraph + local tests; skipped = DB
migration/browser smoke because this is a Server Action read guard only.

PM: scope = close the direct-action path, not redesign HR leave.

BA: rules = branch-manager may review leave only inside their assigned branch;
a permission grant must not turn them into cross-branch HR.

Senior Dev: approach = mirror the existing attendance branch check in the two
leave-read actions.

QA/QC: tests = extend the HR static guard for branch-scope and branch mismatch
checks on leave reads.

## HR Leave Review Write Gate Cleanup

Review tier: T3, because this slice tightens branch-scoped HR approval
authorization.

Skill plan: repo rules = engineering + skills + database + workflow; external
skills = supabase; runtime tools = CodeGraph + local tests; skipped = DB
migration/browser smoke because the existing RPC already enforces request-row
branch permission.

PM: scope = close the direct-action tenant-wide probe path for leave approval;
acceptance = approve/reject actions carry the reviewed request branch into the
PBAC wrapper.

BA: rules = branch-manager may approve/reject leave only for the branch of the
request row; caller-sent branch is an early action gate, while the RPC remains
the final authority from persisted `leave_requests.branch_id`.

Senior Dev: approach = reuse `permissionBranchId` and pass `request.branch_id`
from the existing table row; no RPC or RLS change.

QA/QC: tests = extend HR static guards so approve/reject actions require a
branch-scoped permission probe and the client passes the row branch id.

## HR Payroll Owner-Only Guard

Review tier: T3, because this slice verifies payroll salary/HĐLĐ access gates.

Skill plan: repo rules = engineering + skills + database + workflow; external
skills = supabase; runtime tools = CodeGraph + local tests; skipped = DB
migration/browser smoke because payroll actions already carry the owner-only
runtime gate and this slice adds drift protection only.

PM: scope = lock payroll as owner direct-support, not branch-manager HR
oversight; acceptance = direct Server Action reads and writes stay owner-only.

BA: rules = salary, PIT/BHXH outputs, payroll entries, and contract salary
sources are not branch-safe HR oversight data.

Senior Dev: approach = reuse existing `PAYROLL_ROLES` and `withAction` gates;
no new permission abstraction.

QA/QC: tests = extend the HR static guard so payroll calculate/read actions
must use owner-only roles and payroll permissions.

## HR Personnel Base-Table RLS Cleanup

Review tier: T3, because this slice tightens RLS for employee PII,
compensation, and HĐLĐ rows.

Skill plan: repo rules = engineering + skills + database + workflow; external
skills = supabase; runtime tools = CodeGraph + migration source audit + local
tests; skipped = production migration apply because `iexwsuaqqenyjiskawoj` is
SELECT-only for agents.

PM: scope = make RLS match the HR contract: branch-manager can enter `/hr` for
own-branch oversight, but not query full employee or contract rows through the
Data API.

BA: rules = route ACL, PBAC grants, Server Action payload shape, and RLS are
separate controls. Branch-safe employee lists are a Server Action response
contract; tenant-wide/admin `employees` access and `employment_contracts`
access are owner-only. The existing `employees_select_self` policy remains the
intentional own-row exception for staff runtime.

Senior Dev: approach = swap only four base-table policies and inline the
DB-live owner check to avoid exposing another RPC function. Keep
`employees_select_self` intact for staff profile, shift, schedule, and paid
payslip self-service.

QA/QC: tests = extend the HR static guard to reject future personnel
base-table policies that use `hr:view_employee` or `hr:manage_employee` for
full-row access.

## HR Attendance PBAC Gate Cleanup

Review tier: T3, because this slice tightens HR attendance read and private
photo URL authorization.

Skill plan: repo rules = engineering + skills + database + workflow; external
skills = supabase; runtime tools = CodeGraph + local tests; skipped = DB
migration/browser smoke because this is a Server Action authorization fix only.

PM: scope = close the route-role-only attendance read gap; acceptance =
branch-manager attendance detail, summary, and photo URL reads require a
branch-scoped `hr:view_employee` grant, while stale-attendance close requires
branch-scoped `staff:manage`.

BA: rules = entering `/hr` is route ACL only; attendance rows and private
clock-in photos are branch-scoped employee data and need PBAC at the Server
Action boundary. Stale-attendance close is a mutation, not a read, so it uses
the stricter staff-management permission.

Senior Dev: approach = reuse existing `withAction` permissionBranchId and pass
the already-selected branch id from the attendance table; no custom auth helper.

QA/QC: tests = extend HR static guards and the HR manager attendance static
test, then rerun targeted auth/HR tests plus repo gates.

## HR Shift Setup Direct-Action Cleanup

Review tier: T3, because this slice narrows a global HR setup Server Action.

Skill plan: repo rules = engineering + skills + database + workflow; external
skills = supabase; runtime tools = CodeGraph + local tests; skipped = DB
migration/browser smoke because this is an action role gate only.

PM: scope = align direct action access with the existing owner-only setup UI;
acceptance = branch-manager cannot call global shift setup reads directly.

BA: rules = global shift catalog belongs to owner setup. Branch-manager daily
attendance review reads shift names through attendance rows, not the setup
catalog action.

Senior Dev: approach = swap `fetchShifts` to existing `HR_ROLES`; no new helper.

QA/QC: tests = extend the HR static contract guard.

## HR Personnel Mutation PBAC Cleanup

Review tier: T3, because this slice tightens direct personnel create/update
actions that write salary, government-ID, bank, and HĐLĐ fields.

Skill plan: repo rules = engineering + skills + database + workflow; external
skills = supabase; runtime tools = CodeGraph + local tests; skipped = DB
migration/browser smoke because RLS was already narrowed owner-only and this is
a Server Action contract cleanup.

PM: scope = keep the personnel mutation path explicit without renaming the
staff runtime surface; acceptance = direct create/update actions require the
existing HR management permission in addition to the owner-only role gate.

BA: rules = `/hr` route admission, PBAC grants, Server Action write contracts,
and RLS are separate layers. Salary, ID, bank, and HĐLĐ writes remain owner
personnel administration, not branch-manager HR oversight.

Senior Dev: approach = add `PERMISSION_KEYS.HR_MANAGE_EMPLOYEE` to the existing
`HR_ROLES` action wrappers; no new helper, schema split, RLS migration, or
payroll abstraction.

QA/QC: tests = extend the HR static contract guard so personnel mutations
cannot drift back to role-only gates.

## HR Branch Oversight Payload Cleanup

Review tier: T3, because this slice protects salary, government-ID, bank, and
HĐLĐ payload boundaries for branch-manager HR access.

Skill plan: repo rules = engineering + skills + database + ui + workflow;
external skills = supabase; runtime tools = CodeGraph + local tests; skipped =
DB migration/browser smoke because RLS already blocks base-table access and this
slice only tightens Server Action payload and client consumption contracts.

PM: scope = separate owner personnel administration from branch-manager
oversight without a form rewrite; acceptance = branch-manager HR reads stay
branch-safe and do not run payroll/HĐLĐ readiness logic.

BA: rules = branch-manager can see own-branch staff oversight data, not salary,
CCCD, bank, or HĐLĐ terms. Route admission is not permission to receive those
fields in payload.

Senior Dev: approach = keep the existing owner-only form gate, stop client
readiness calculations when `canManageEmployees` is false, and add one static
guard around the existing select constants.

QA/QC: tests = extend HR static guard so the branch-manager select cannot regain
sensitive employee or contract columns.
