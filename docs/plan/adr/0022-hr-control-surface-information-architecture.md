# ADR 0022 — Company HR and Branch people-operations information architecture

**Status:** Accepted — implementation contract approved 2026-08-01

**Decision owner:** Owner

**Review tier:** T3 — authorization, sensitive HR data, payroll, and multi-surface routing

## Context

The HR surfaces do not yet communicate their scope clearly. The Owner direction
for this proposal is:

- `/hr/*` is the complete company HR administration family, covering the
  company office and every branch in detail;
- `/br/[branchId]/*` remains the branch-management and branch-operation plane;
- `/br/[branchId]/team` plus manager-only shift routes remain fixed to the branch
  in the URL;
- `/me/*` is the canonical personal self-service family for every non-Owner
  employee, including Branch Managers.

The current Owner HR control surface also has structural disorder:

- `/hr` combines employee records and access accounts, and loads both domains
  even when only one view is open;
- `/hr/attendance` combines four jobs, a second view axis, and nested leave
  tabs; its default may change from Today to Approvals based on live data;
- `/hr/payroll` has a sound workflow but concentrates URL state, preflight,
  table rendering, calendar, adjustments, and snapshot actions in one client
  over 1,000 lines;
- `/hr/setup` loads leave policy, shifts, and position tasks together although
  the URL already identifies one active tab.

The control-surface shell currently renders
`Người · Thời gian · Lương · Quy tắc`. `Thời gian` and `Quy tắc` are abstract
labels: they do not tell an HR operator whether the destination owns attendance,
shifts, working hours, leave policy, or configuration. The sibling routes also
render a page-header button back to `/hr`, duplicating navigation and making
peer workspaces appear subordinate.

The Branch plane already supports the employee's mobile day flow and must not be
broken merely to share personal features with company employees. Its remaining
IA problem is narrower: manager-only people operations must be labeled and
linked clearly without turning the employee's `Ca làm` destination into a
different workspace by role.

This ADR covers UI information architecture, URL state, component composition,
and active-view loading. It does not authorize schema, RLS, ACL, payroll math,
attendance semantics, or notification changes.

## Research findings

1. `apps/web/app/lib/control-surface-nav.ts` already owns the four-item HR deep
   navigation. A second local module navigator is unnecessary.
2. `/hr/page.tsx` concurrently loads employee records, attention counts, and
   staff-account data. `HrClient` then selects `profile|accounts` on the client.
3. `/hr/attendance` owns `tab`; Timesheet owns `view`, `day`, `employee`, and
   `filter`; `LeaveRequestsTable` adds another `AppPageTabs` inside Approvals.
4. `attendance-table.tsx` is over 1,200 lines and owns Today, summary, calendar,
   raw records, detail sheets, and dialogs.
5. `payroll-list-client.tsx` is over 1,000 lines. Its workflow order is already
   correct: period filters → blockers → period table → calendar or adjustment
   → snapshot.
6. `/hr/payroll/[periodId]` is a redirect shim to the month query on the list;
   it is not an independent detail workspace.
7. `/hr/setup/page.tsx` fetches all three setting domains in one `Promise.all`.
8. Existing shared components cover the target composition: `AppPage`,
   `AppPageHeader`, `AppPageTabs`, `AppListFrame`, `AppToolbar`, `DataTable`,
   `FormDialog`, `AppDialog`, shared states, and row-action menus.
9. `/br/[branchId]/team` already resolves branch scope, loads the live team
   board, and exposes a branch employee tab. It links to checkout and leave
   approval routes under `/br/[branchId]/shift/*`.
10. `/br/[branchId]/shift/roster`, `checkout-approvals`, and `leave-approvals`
    are already branch-scoped manager workflows. A branch-scoped monthly
    attendance/working-hours view is the missing peer workflow.
11. `/me/*` already provides personal clock, schedule/leave, profile, and
    payslip surfaces for Accountant and central-site roles. Branch employees
    already receive the same staff-runtime content under Branch-native routes.

## Domain boundaries

The refactor must preserve these distinctions:

- employee record, HĐLĐ, HR position, assignment, and pay basis are not access
  permissions;
- account identity and permission state are not employment state;
- company shift definitions belong to `Thiết lập nhân sự`; company-wide weekly
  assignments and attendance belong to `Chấm công & ca làm`;
- a Branch Manager assigns approved shift definitions to employees, reviews
  attendance/working hours, and approves same-branch checkout/leave; this does
  not grant company-wide HR administration;
- a Branch Manager route derives scope from `/br/[branchId]` plus verified
  claims and never exposes an `all branches` selector;
- personal self-service derives the actor from the authenticated identity and
  never accepts an employee picker;
- HR calculates and snapshots salary obligations; Finance records payment;
- `position_shift_tasks` remains the shift-task SSOT; copying another
  position's tasks is an action, not a second template model;
- HR positions must not become a second authorization layer.

ADR 0012 remains authoritative: `/me/*` is canonical personal self-service.
The old Branch personal routes are compatibility redirects only.

## Personas and authorization model

Three business personas participate in HR administration, but business titles
must remain separate from access authority:

| Business concept  | Example                                               | Authorization effect                              |
| ----------------- | ----------------------------------------------------- | ------------------------------------------------- |
| HR position       | `Quản lý nhân sự` in the employee record              | None by itself                                    |
| Identity          | Supabase Auth user                                    | Establishes the actor/session only                |
| Tenant membership | Active employment in this tenant                      | Establishes relationship, not capability          |
| Site assignment   | Assigned to company office or one branch              | Establishes work placement, not company authority |
| Access role       | `hr_manager`, `tenant_owner`, `branch_manager`        | Groups capabilities only                          |
| Role binding      | Role + principal + exact tenant/site scope + validity | Grants scoped authority                           |

Target bindings:

| Persona           | Target access role                                                     | Binding scope                                           | Primary work home                     |
| ----------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------- |
| Quản lý nhân sự   | `hr_manager`                                                           | Tenant                                                  | `/hr`                                 |
| Chủ sở hữu        | `tenant_owner`; separate `security_admin` when managing human bindings | Tenant; Security Admin follows ADR 0015 assurance rules | `/hr` for HR, `/` for company control |
| Quản lý chi nhánh | `branch_manager`                                                       | Exact site/branch                                       | `/br/[branchId]/team`                 |

`branch_id = NULL`, a company-office assignment, or an HR position must never
be interpreted as tenant-wide HR authority. Likewise, a Company Owner identity
does not create a universal RLS bypass; the Owner needs explicit tenant-scoped
capabilities for the HR tenant.

Quản lý nhân sự and Quản lý chi nhánh are employees too. Both use actor-only
`/me/*`. Owner remains denied from Self according to ADR 0012.

## Data sensitivity classes

| Class                   | Examples                                                                     | Quản lý nhân sự        | Chủ sở hữu                                | Quản lý chi nhánh |
| ----------------------- | ---------------------------------------------------------------------------- | ---------------------- | ----------------------------------------- | ----------------- |
| Branch-safe people data | Name, employee code, position label, branch, employment active state         | Company-wide           | Company-wide                              | Own branch only   |
| Attendance operations   | Assigned shift, check-in/out, working hours, leave state                     | Company-wide           | Company-wide                              | Own branch only   |
| Sensitive HR data       | Citizen ID, bank account, HĐLĐ, contract salary, dependants, insurance basis | Company-wide           | Company-wide                              | Denied            |
| Payroll data            | Gross/net salary, deductions, PIT, insurance, adjustment notes               | Prepare/read           | Prepare/read/finalize                     | Denied            |
| Account lifecycle       | Login identity, active state, provisioning status                            | View/create/deactivate | View/create/deactivate                    | Denied            |
| Authorization security  | Role bindings, permission exceptions, expiry, audit log                      | Read status only       | Manage through `security_admin` with AAL2 | Denied            |

RLS/query projections must enforce these classes. Hiding a column in React is
not an authorization boundary.

## Functional and permission matrix

Legend:

- **Manage** — read plus allowed writes in the stated scope;
- **Prepare** — create or edit a draft, but not perform the final authority step;
- **Operate** — branch daily action only;
- **Read** — no mutation;
- **Denied** — route, action, RPC, RLS, and navigation all deny.

### Company HR routes

| Place / function                                           | Quản lý nhân sự                       | Chủ sở hữu                            | Quản lý chi nhánh       |
| ---------------------------------------------------------- | ------------------------------------- | ------------------------------------- | ----------------------- |
| `/hr` — employee list, company/office/branch filter        | Manage                                | Manage                                | Denied                  |
| Create/edit employee record                                | Manage                                | Manage                                | Denied                  |
| HĐLĐ, compensation, bank/ID, dependants, insurance fields  | Manage                                | Manage                                | Denied                  |
| Employment activation/deactivation and placement           | Manage                                | Manage                                | Denied                  |
| Account list and provisioning state                        | Manage lifecycle                      | Manage lifecycle                      | Denied                  |
| Create/deactivate login account                            | Manage                                | Manage                                | Denied                  |
| Assign position/site                                       | Manage                                | Manage                                | Denied                  |
| View applied access-role status                            | Read                                  | Read                                  | Denied                  |
| Apply/revoke role binding or permission exception          | Denied                                | Manage via `security_admin` + AAL2    | Denied                  |
| Permission audit log                                       | Read summary only                     | Full read/export                      | Denied                  |
| `/hr/attendance` — today, attendance, hours, leave, roster | Manage                                | Manage                                | Denied                  |
| Force-close stale attendance with reason                   | Manage                                | Manage                                | Denied                  |
| Correct an attendance record                               | Manage through audited correction RPC | Manage through audited correction RPC | Denied on company route |
| Approve company-office/central/branch leave or checkout    | Manage                                | Manage                                | Denied on company route |
| `/hr/payroll` — preview and sensitive payroll data         | Prepare                               | Manage                                | Denied                  |
| Add/remove payroll adjustment                              | Prepare                               | Manage                                | Denied                  |
| Snapshot/finalize payroll obligation                       | Manage                                | Manage                                | Denied                  |
| Record payroll payment/evidence                            | Denied; Finance route only            | Denied in HR; Finance route only      | Denied                  |
| `/hr/setup` — leave/workday policy                         | Manage                                | Manage                                | Denied                  |
| Company shift catalog                                      | Manage                                | Manage                                | Denied                  |
| Position shift tasks                                       | Manage                                | Manage                                | Denied                  |

Company HR is therefore not Owner-only in the target. It is available to an
active tenant-scoped `hr_manager` binding and to explicit Owner bindings. A
Branch Manager never gains `/hr/*` merely because a company-HR page can be
filtered to that branch.

### Branch Manager routes

| Place / function                                    | Quản lý nhân sự                        | Chủ sở hữu                              | Quản lý chi nhánh                    |
| --------------------------------------------------- | -------------------------------------- | --------------------------------------- | ------------------------------------ |
| `/br/[branchId]/team` live team board               | Use `/hr`; not advertised              | Read/operate for oversight              | Operate own branch                   |
| Branch-safe employee list                           | Use `/hr` filtered to branch           | Read                                    | Read own branch                      |
| Employee salary, HĐLĐ, ID/bank, account, permission | Denied on Branch plane                 | Denied on Branch plane; use `/hr`       | Denied                               |
| `/shift/roster` assign company shifts               | Use `/hr/attendance`                   | Operate for oversight                   | Operate own branch                   |
| `/shift/attendance` days and working hours          | Use `/hr/attendance`                   | Read/operate for oversight              | Read own branch                      |
| Force-close stale/open attendance                   | Use `/hr/attendance`                   | Operate with reason/audit               | Operate own branch with reason/audit |
| Rewrite original check-in/out values                | Denied; use audited company correction | Denied on Branch plane                  | Denied                               |
| Approve checkout                                    | Use `/hr/attendance`                   | Operate for oversight                   | Operate own branch                   |
| Approve/reject leave                                | Use `/hr/attendance`                   | Operate for oversight                   | Operate own branch                   |
| Define company shift catalog or leave policy        | Denied on Branch plane                 | Denied on Branch plane; use `/hr/setup` | Denied                               |
| Employee shift-task overrides (`shift_checklist_templates.employee_id`) | Operate via `/hr/setup` | Operate via `/hr/setup` | Operate own-branch employees via Team → Nhân viên (`hr:manage_employee_shift_overrides`) |
| Company position task templates (`position_shift_tasks`) | Operate via `/hr/setup` | Operate via `/hr/setup` | Denied |

The Branch Manager can manage people operations, not legal employment or
security administration. `Thiết lập ca làm` at branch scope means assigning an
approved shift to employees. It does not mean creating a second branch shift
catalog. Branch Managers may customize per-employee “Việc trong ca” overrides
for staff on their branch; company-wide position templates stay Owner/HR-only.

### Personal self-service

| Function                            | Company/Control employee | Chủ sở hữu | Store-branch employee or manager            |
| ----------------------------------- | ------------------------ | ---------- | ------------------------------------------- |
| Own clock and workday tasks         | `/me/*`, actor only      | Denied     | `/me/*`, actor only                         |
| Own schedule and attendance history | `/me/*`, actor only      | Denied     | `/me/schedule`, actor only                  |
| Submit/cancel own leave request     | `/me/*`, actor only      | Denied     | `/me/schedule/leave`, actor only            |
| Own profile and payslip             | `/me/*`, actor only      | Denied     | `/me/profile` and `/me/payslip`, actor only |
| Select another employee or branch   | Denied                   | Denied     | Denied                                      |

Self-service authority comes from actor/resource identity plus active
membership, not from broad HR or Branch Manager capabilities.

## Capability contract

### Existing runtime capabilities that remain useful

| Capability                  | Target use                                                                       |
| --------------------------- | -------------------------------------------------------------------------------- |
| `hr:view_employee`          | Branch-safe or full projection according to binding scope and sensitivity policy |
| `hr:manage_employee`        | Company-HR employee lifecycle and HR record writes                               |
| `hr:approve_checkout`       | Scoped checkout approval                                                         |
| `hr:request_leave`          | Actor-only leave request                                                         |
| `hr:approve_leave_request`  | Scoped leave approval                                                            |
| `hr:assign_shift`           | Tenant or site scoped roster assignment                                          |
| `staff:view`                | Account lifecycle/status read                                                    |
| `staff:manage`              | Account provisioning/activation, not role-binding mutation                       |
| `staff:assign_position`     | Employee position/site assignment                                                |
| `staff:assign_permission`   | Transitional permission mutation; target Security Admin binding only             |
| `finance:payroll_calculate` | Transitional payroll prepare gate until HR capability cutover                    |

### Capabilities required to remove current coupling

| Required capability          | Why it is needed                                                           | Quản lý nhân sự | Chủ sở hữu            | Quản lý chi nhánh |
| ---------------------------- | -------------------------------------------------------------------------- | --------------- | --------------------- | ----------------- |
| `hr:view_sensitive_employee` | Do not infer salary/ID/bank/HĐLĐ visibility from role name                 | Tenant          | Tenant                | None              |
| `hr:force_close_attendance`  | Replace role-only force-close checks with explicit audited authority       | Tenant          | Tenant                | Site              |
| `hr:correct_attendance`      | Allow correction of recorded values only through an audited company-HR RPC | Tenant          | Tenant                | None              |
| `hr:manage_leave_policy`     | Stop borrowing broad `settings:tenant`                                     | Tenant          | Tenant                | None              |
| `hr:manage_shift_catalog`    | Stop borrowing `staff:manage` for company shifts                           | Tenant          | Tenant                | None              |
| `hr:manage_position_tasks`   | Stop borrowing `staff:manage` for shift-task rules                         | Tenant          | Tenant                | None              |
| `hr:manage_employee_shift_overrides` | Branch-scoped employee override templates without position CRUD     | Tenant (via position-tasks key) | Tenant (via position-tasks key) | Site              |
| `hr:payroll_prepare`         | Replace the HR use of `finance:payroll_calculate`                          | Tenant          | Tenant                | None              |
| `hr:payroll_snapshot`        | Separate preparation from final HR obligation snapshot                     | Tenant          | Tenant                | None              |
| `staff:provision`            | Separate account lifecycle from employee and authorization mutation        | Tenant          | Tenant                | None              |
| `auth:binding_read`          | Show access status without mutation                                        | Tenant summary  | Tenant                | None              |
| `auth:binding_manage`        | Apply/revoke roles and exceptions under ADR 0015                           | None            | Security Admin + AAL2 | None              |
| `auth:audit_read`            | Read permission history                                                    | Tenant summary  | Tenant                | None              |

These names are target manifest entries, not permission rows authorized for
Production creation by this planning task. During cutover, compatibility aliases
may map existing keys to the new typed registry, but UI, Server Actions, RPCs,
RLS, tests, and audit events must converge on one vocabulary.

## Implementation state

- `hr_manager`, `tenant_owner`, `branch_manager`, and `security_admin` are
  explicit role bindings; the HR position remains authorization-neutral.
- HR actions use dedicated capability keys for employee, attendance, setup,
  payroll preparation/snapshot, account lifecycle, and binding status.
- RLS/RPC remains authoritative. Company scope is revalidated against tenant
  data; Branch scope is fixed to the verified URL branch.
- Payroll snapshot and employee-specific shift-task overrides are transactional
  RPCs. Existing attendance checklist rows remain immutable snapshots.

### Personal-route boundary (Initial delivery tranche)

The personal-route boundary in §Initial delivery tranche is shipped. `/me/*`
is mounted inside Control Surface chrome for Accountant, central-site, and
company-office employees; `Trang cá nhân` is the Avatar Footer entry in both
the desktop sidebar and the mobile header account menu. An active
company-office employee with no work-module binding (`self_service`) lands on
`/me` as the default post-login destination and is granted actor-only
self-service only — `resolveControlSurfaceDiscoveryGroups` returns no module
for that role, so no Finance, Inventory, HR, or Tenant capability is implied.
Owner remains denied `/me/*`. Store-assigned employees keep
`/br/[branchId]/shift/*` and `/br/[branchId]/profile/*` as the canonical
personal route family; a direct `/me/*` request canonicalizes to the claimed
branch route rather than rendering a second personal surface.

## Boundary scenarios

| Scenario                                                                         | Required result                                                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| An employee's position changes to `Quản lý nhân sự`, but no role binding exists  | No new route or data access                                                                             |
| A Quản lý nhân sự works at `Văn phòng công ty` but has only an office assignment | Personal `/me/*` only; no `/hr/*` until a Tenant `hr_manager` binding exists                            |
| HR provisions an account for a new employee                                      | Account remains `Chờ cấp quyền` until Security Admin applies an approved role binding                   |
| HR and Owner finalize the same payroll period concurrently                       | The first transaction creates the snapshot; the second receives `already_finalized` without a duplicate |
| Owner lacks an active `security_admin` binding or AAL2                           | HR data remains available through Owner HR capabilities, but role-binding mutation is denied            |
| Branch Manager opens another branch id or employee id directly                   | Route/RPC/RLS fails closed without confirming whether the record exists                                 |
| Branch Manager transfers to another branch                                       | Old site binding is revoked; the old branch becomes inaccessible without waiting for JWT refresh        |
| Branch Manager and company HR approve the same leave request concurrently        | One atomic transition wins; the second receives an already-resolved result, not a second approval layer |
| Owner opens `/me/*`                                                              | Denied; Owner does not clock or submit employee self-service leave                                      |

## Options considered

### A. Merge all HR work into `/hr`

Rejected. A dashboard or mega-page would move disorder into a card mosaic or a
larger tab set while making ACL and URL state less clear.

### B. Create a route for every tab

Examples include `/hr/people`, `/hr/accounts`, `/hr/attendance/approvals`, and
`/hr/setup/shifts`.

Rejected for this refactor. These states are not independent record workspaces.
The route and redirect churn would exceed the IA benefit.

### C. Keep four route homes and normalize their internal hierarchy

Accepted as the proposal. The route homes reflect four different jobs and
frequencies. The root problem is duplicated navigation, unstable defaults,
query leakage, inactive-domain loading, and component concentration.

### Account placement

Keep Accounts at `/hr?view=accounts` because access setup follows employee
onboarding and permission detail already lives under
`/hr/staff/[id]/permissions`. Do not advertise Accounts as a fifth deep-nav
item. The account view must instead own its header, CTA, filters, loader, and
state vocabulary. `/hr/staff` remains a compatibility redirect.

## Decision

Adopt three presentation planes with explicit scope:

| Plane                                 | Canonical family   | Primary audience                                         | Scope                                           | Owns                                                                                            |
| ------------------------------------- | ------------------ | -------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Company HR                            | `/hr/*`            | Owner / company HR authority allowed by current ACL      | Entire tenant: all branches plus company office | Full employee record, HĐLĐ, accounts/permissions, attendance, roster, payroll, HR setup         |
| Branch employee and people operations | `/br/[branchId]/*` | Store-assigned employees and Branch Manager              | Exactly the verified branch in the URL          | Mobile employee day flow plus same-branch team, roster, attendance, checkout and leave approval |
| Company/Control self-service          | `/me/*`            | Accountant, central-site and future company-office roles | Authenticated actor only                        | Own clock, tasks, schedule, leave request, profile, payslip inside Control Surface chrome       |

Company HR uses these route homes and exact UI labels:

```text
Nhân sự
├── Hồ sơ nhân viên            /hr
│   ├── Hồ sơ nhân viên              ?view=profile (default)
│   └── Tài khoản & phân quyền       ?view=accounts
├── Chấm công & ca làm         /hr/attendance
│   ├── Hôm nay                      ?tab=today (stable default)
│   ├── Cần duyệt                    ?tab=approvals
│   ├── Bảng công                    ?tab=timesheet
│   └── Phân ca                      ?tab=roster
├── Bảng lương                 /hr/payroll
│   └── Kỳ lương                     ?month=YYYY-MM
└── Thiết lập nhân sự          /hr/setup
    ├── Ngày công & nghỉ phép        ?tab=leave (default)
    ├── Khung ca làm                 ?tab=shifts
    └── Việc trong ca                ?tab=tasks
```

Every company-HR list uses an explicit scope control:

```text
Phạm vi: Toàn công ty | Văn phòng công ty | <từng chi nhánh>
```

`Toàn công ty` is the tenant-wide aggregate. `Văn phòng công ty` represents
employees whose work assignment is company-office scope rather than a branch.
Named branches remain individual choices. Display scope is URL state; write
authority is still re-derived by Server Action/RPC/RLS.

Branch Manager navigation uses concrete labels:

```text
Nhân sự chi nhánh              /br/[branchId]/team
├── Theo dõi ca hôm nay              (default)
└── Nhân viên chi nhánh              ?tab=members

Ca làm & chấm công             /br/[branchId]/shift
├── Phân ca                          /shift/roster
├── Bảng chấm công                   /shift/attendance
├── Duyệt kết ca                     /shift/checkout-approvals
└── Duyệt nghỉ phép                  /shift/leave-approvals
```

`Thiết lập ca làm` in the Branch Manager job means assigning the company shift
catalog to branch employees. It does not mean changing company-wide shift
definitions. A future branch-specific shift-definition override requires a
separate domain and authorization decision.

Use one control type per information level:

| Information level           | UI owner                     | HR example                                                         |
| --------------------------- | ---------------------------- | ------------------------------------------------------------------ |
| Independent workspace       | Shell deep nav and route     | Hồ sơ nhân viên, Chấm công & ca làm, Bảng lương, Thiết lập nhân sự |
| Mode within a workspace     | `AppPageTabs` and URL        | Hồ sơ/Tài khoản & phân quyền; Hôm nay/Cần duyệt/Bảng công/Phân ca  |
| View of one dataset         | `AppToolbar` control         | Timesheet summary/calendar/clock records                           |
| Dataset filter              | Form control in `AppToolbar` | Site, month, position, status                                      |
| Short create/edit task      | `FormDialog`                 | Employee, account, shift, task, payroll adjustment                 |
| Secondary view/confirmation | `AppDialog`                  | Work calendar, leave history, snapshot confirmation                |
| Independent access workflow | Existing detail route        | `/hr/staff/[id]/permissions`                                       |

Do not add an HR dashboard, second shell, local module-nav component, UI
dependency, or design token. The single visual signature is a compact,
actionable `Cần xử lý` lane that appears only when work exists; no KPI mosaic.

## URL contract

### Hồ sơ nhân viên — `/hr`

| View                   | Canonical URL       | Owned query keys                                          |
| ---------------------- | ------------------- | --------------------------------------------------------- |
| Hồ sơ nhân viên        | `/hr`               | `q`, `branch`, `position`, `contract`, `salary`, `status` |
| Tài khoản & phân quyền | `/hr?view=accounts` | `q`, `branch`, `position`, `status`                       |

Changing `view` removes keys not owned by the destination. The two lists must
not interpret a stale query key with different business meaning. Company-HR
scope uses `branch=all|office|<branchId>` and defaults to `all`.

### Chấm công & ca làm — `/hr/attendance`

| Tab       | Canonical URL                  | Owned query keys                                       |
| --------- | ------------------------------ | ------------------------------------------------------ |
| Hôm nay   | `/hr/attendance`               | `branch=all                                            | office | <id>` |
| Cần duyệt | `/hr/attendance?tab=approvals` | `branch`, optional secondary `panel`                   |
| Bảng công | `/hr/attendance?tab=timesheet` | `branch`, `month`, `view`, `day`, `employee`, `filter` |
| Phân ca   | `/hr/attendance?tab=roster`    | `branch`, `week`                                       |

`/hr/attendance` always opens Today. Pending counts decorate Approvals and link
to it; they never alter the route default.

Accept legacy `tab=leave|schedule|attendance` for one compatibility cycle and
normalize them to `approvals|approvals|timesheet` with `replace`. Changing tabs
removes query keys not owned by the destination.

### Bảng lương — `/hr/payroll`

The canonical workspace is `/hr/payroll?month=YYYY-MM`. Preserve the current
owned state: `branch`, `q`, `salaryStatus`, `standardDays`, and `calendar`.
`branch` uses the same `all|office|<branchId>` company-HR scope vocabulary.

Keep `/hr/payroll/[periodId]` as `REDIRECT-SHIM`. Do not build a detail page
until a payroll period becomes an independent document workflow that the list
cannot represent.

### Thiết lập nhân sự — `/hr/setup`

| Tab                   | Canonical URL          | Active data domain                    |
| --------------------- | ---------------------- | ------------------------------------- |
| Ngày công & nghỉ phép | `/hr/setup`            | Standard workdays and leave policy    |
| Khung ca làm          | `/hr/setup?tab=shifts` | Company shift catalog                 |
| Việc trong ca         | `/hr/setup?tab=tasks`  | Positions, tasks, related ingredients |

Only the active domain is loaded and rendered. An error belongs to the active
tab rather than becoming a page-wide partial failure.

### Nhân sự chi nhánh — `/br/[branchId]/team`

The route scope is the validated `branchId`; it has no company/branch selector.
It keeps two URL modes:

| Mode                | Canonical URL                     | Job                                                        |
| ------------------- | --------------------------------- | ---------------------------------------------------------- |
| Theo dõi ca hôm nay | `/br/[branchId]/team`             | Live employee/shift/attendance state and actionable counts |
| Nhân viên chi nhánh | `/br/[branchId]/team?tab=members` | Read-only branch-safe employee projection                  |

It must not display company-wide salary, HĐLĐ, account, permission, or employees
from another branch.

### Ca làm & chấm công — `/br/[branchId]/shift/*`

Manager jobs are explicit routes with scope fixed by the URL:

| Job             | Canonical URL                                   |
| --------------- | ----------------------------------------------- |
| Phân ca         | `/br/[branchId]/shift/roster?week=YYYY-MM-DD`   |
| Bảng chấm công  | `/br/[branchId]/shift/attendance?month=YYYY-MM` |
| Duyệt kết ca    | `/br/[branchId]/shift/checkout-approvals`       |
| Duyệt nghỉ phép | `/br/[branchId]/shift/leave-approvals`          |

Personal Branch routes remain compatibility redirects to the matching `/me/*`
route for one cycle. They no longer own personal data loaders or navigation.

`/br/[branchId]/shift/attendance` reuses the branch-safe attendance projection and
must reuse the branch-safe attendance projection and shared attendance math;
it must not clone the company-HR query or expose tenant-wide scope.

### Company/Control self-service — `/me/*`

Canonical personal routes for every non-Owner employee are actor-scoped:

- `/me/clock` — own clock-in/out;
- `/me` — own workday tasks;
- `/me/schedule` and `/me/schedule/leave` — own schedule and leave request;
- `/me/profile` — own profile;
- `/me/payslip` — own payslip.

`/me/*` uses the personal self-service shell. Branch management links remain in
the verified Branch plane and never change personal actor scope.

## Surface composition

### Hồ sơ nhân viên toàn công ty

```text
AppPage width="xwide"
├── AppPageHeader: Hồ sơ nhân viên toàn công ty + Thêm nhân viên
├── AppPageTabs: Hồ sơ nhân viên | Tài khoản & phân quyền
├── Cần xử lý (only when count > 0)
├── AppListFrame
│   ├── AppToolbar: phạm vi · search · position · contract · salary · status
│   └── DataTable / mobileCardRender
└── Employee FormDialog
```

- Store list filters in the URL so reload, Back, and payroll blocker links
  restore state.
- Remove the empty `Cần xử lý` section; normal state needs no extra card.
- Build one `RowActionItem[]` per row and feed the shared visible, context, and
  mobile action doors.
- Continue using `FormDialog` for create/edit; do not add a form route.
- Default the scope control to `Toàn công ty`; expose `Văn phòng công ty` and
  every permitted branch as explicit options.
- For Accounts, derive `Tài khoản & phân quyền`, the access description, and
  `Tạo tài khoản` from the active view.
- Load staff-account data only for `view=accounts` after the existing `staff`
  access gate.
- Do not show salary/HĐLĐ as account state or permission state as employment
  state.

### Chấm công & ca làm toàn công ty

```text
AppPage width="xwide"
├── AppPageHeader: Chấm công & ca làm
├── AppPageTabs: Hôm nay | Cần duyệt (count) | Bảng công | Phân ca
└── one active panel
```

Hôm nay:

- Show one clock-record list with `Phạm vi` as the first filter. Default to
  `Toàn công ty`; allow `Văn phòng công ty` or one branch.
- Hide month and view controls.
- Use `AppDialog` for short photo/detail views; retain the current mobile
  `Sheet` only where it satisfies the touch contract.

Cần duyệt:

- Show two pending queues: checkout and leave, each with its count, empty state,
  and action feedback.
- Remove the nested `pending|approved-month|history` tablist from daily work.
- Open leave history as a secondary addressable `AppDialog` using
  `panel=leave-history`; keep month/status controls inside that dialog.
- Keep rejection as `FormDialog` because a reason is required.

Bảng công:

- Use one toolbar ordered site → month → view → conditional employee/scope.
- Default to `summary`; label modes `Tổng hợp · Lịch · Vào/ra`.
- Treat the mode selector as a dataset view, not another navigation tablist.
- Render only the selected table/calendar tree and allow one business overlay.

Phân ca:

- Load roster data only for `tab=roster`.
- Keep site, week, and `hr:assign_shift` ownership here.
- Do not expose shift definitions or shift-task rules in this tab.

`attendance/page.tsx` resolves the URL and server-dispatches one active panel.
Extract task-specific panels only while implementing their phase; do not create
a generic HR panel framework or scaffold inactive files.

### Nhân sự chi nhánh — `/br/[branchId]/team`

- Rename Branch bottom navigation from the abstract `Đội` to `Nhân viên`.
  Use `Nhân sự chi nhánh` as the page title and keep these two roles of copy
  consistent: destination label versus workspace heading.
- Rename the tabs to `Theo dõi ca hôm nay` and `Nhân viên chi nhánh`.
- Keep the live board task-first: employees working, not started, waiting for
  checkout approval, or on approved leave.
- Keep the employee tab branch-safe and read-only. Company HR edits remain in
  `/hr`.
- Link roster, attendance hours, checkout approval, and leave approval to the
  Branch Manager shift workspace rather than embedding another tab layer.

### Ca làm & chấm công chi nhánh — `/br/[branchId]/shift/*`

```text
Branch mobile day flow
├── Hôm nay
├── Chấm công
├── Lịch làm / Xin nghỉ
└── Hồ sơ / Phiếu lương

Branch Manager links
├── Phân ca
├── Bảng chấm công
├── Duyệt kết ca (count)
└── Duyệt nghỉ phép (count)
```

- `/me` is the personal mobile day-flow landing for every non-Owner employee.
- `Phân ca` assigns the company shift catalog to employees of this branch.
- `Bảng chấm công` shows the branch's monthly days, hours, check-in/out, leave,
  and attention states; it cannot switch branch.
- Approval pages remain touch-native LIST/task surfaces and show only this
  branch's records.
- Manager jobs are explicit links and never replace or hide the employee's own
  `Ca làm` flow.

#### Mobile employee experience contract

The mobile hierarchy follows the employee's day, not the module catalog:

| Priority | Screen and route                              | Mobile job                                                                                            |
| -------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1        | Branch home `/br/[branchId]`                  | Show today's shift state and one adaptive primary action: `Chấm công vào` → `Làm nhiệm vụ` → `Kết ca` |
| 2        | `Ca làm` `/br/[branchId]/shift`               | Show the same state as a short step flow: clock in, required work, clock out                          |
| 3        | `/shift/schedule` and `/shift/schedule/leave` | Show own schedule first; expose `Xin nghỉ` as a direct actor-only action                              |
| 4        | `/profile` and `/profile/payslip`             | Show own profile and payslip; never mix in team or account administration                             |

- Keep Branch management navigation separate from the personal `/me/*` shell.
- Put `Lịch làm` and `Xin nghỉ` as explicit local shortcuts in the personal
  `Ca làm` flow. Keep the header avatar as the one-tap `Hồ sơ` entry. Do not add
  a second personal navigation system.
- Keep one full-width, state-aware primary action in the first mobile viewport.
  Secondary information follows the action; manager queues never push the
  employee's own action below them.
- A Branch Manager sees the same personal day flow first. Manager-only links
  appear in a separate `Quản lý chi nhánh` section with pending counts and do
  not change the meaning of `/shift`.
- Clock actions are single-purpose. While submitting, disable repeat taps and
  show progress. Success uses the server result and returns to the personal day
  flow; failure stays on the clock screen with a recoverable Vietnamese message.
  Offline state never presents a successful clock event.
- Camera or location denial explains the missing permission and the recovery
  action without losing the current route. No raw provider or database error is
  exposed.
- Touch targets are at least 44×44 px with at least 8 px separation. Sticky
  controls respect safe-area insets and never cover the last task. No required
  action depends on hover or a horizontal swipe.
- Loading preserves the primary-action slot to avoid layout movement. Empty,
  no-shift, awaiting-approval, completed, offline, and recoverable-error states
  state what happened and the next available action in text, not color alone.
- Browser Back/Forward, refresh, and deep links preserve the active personal
  route. Completing a clock action must not create a history loop.

Company/Control employees use the same actor-only content contract under
`/me/*`, but inside the responsive Control Surface shell. `Trang cá nhân` is
available from the avatar/account menu in both the desktop sidebar and its
mobile drawer equivalent. This does not create another mobile bottom nav or
expose Branch navigation to central-site employees.

#### Approved Markdown UI frames

These frames lock information order, interaction, and responsive behavior. They
are not pixel specifications and do not create visual tokens or components
outside the Má Tư Design System.

##### Frame A — Company/Control `/me` on mobile

```text
┌──────────────────────────────────────┐
│ Công việc của tôi          [Avatar] │  account menu trigger
├──────────────────────────────────────┤
│ HÔM NAY · Thứ Sáu, 01/08             │
│ Ca Hành chính · 08:00–17:00          │
│ [ Chưa vào ca ]                      │
│                                      │
│ Vào ca        Ra ca       Việc       │
│   —             —         0/3        │
│                                      │
│ [          Chấm công vào          ]  │  one primary action
├──────────────────────────────────────┤
│ TIẾN TRÌNH CA                        │
│ ① Chấm công vào          [Hiện tại]  │
│ ② Việc trong ca               [Chờ]  │
│ ③ Kết ca                     [Chờ]   │
├──────────────────────────────────────┤
│ Lịch làm                         ›   │
│ Xin nghỉ                         ›   │
│ Phiếu lương                      ›   │
└──────────────────────────────────────┘
```

- With one or more work modules, the existing Control Surface mobile navigation
  remains available and opens the Sidebar drawer. `/me` is not added to it.
- With zero work modules, hide the empty `Mô-đun` bottom navigation. The header
  avatar opens the same account menu as the desktop Avatar Footer.
- If no shift is assigned today, replace the status and CTA with `Chưa có ca làm
hôm nay` and `Xem lịch làm`; do not offer a clock action that cannot succeed.
- The first viewport reserves the same panel and CTA height while loading, so
  the action does not jump when data resolves.

##### Frame B — Mobile clock-in

```text
┌──────────────────────────────────────┐
│ ‹  Chấm công hôm nay                 │
├──────────────────────────────────────┤
│ Ca Hành chính · 08:00–17:00          │
│ [ Chưa chấm công ]                   │
├──────────────────────────────────────┤
│                                      │
│          CAMERA PREVIEW 4:3          │
│                                      │
├──────────────────────────────────────┤
│ [             Chụp ảnh            ]  │  primary before capture
│ [ Hủy ]                              │
└──────────────────────────────────────┘

After capture
┌──────────────────────────────────────┐
│ [ảnh xem trước]  Ảnh đã sẵn sàng     │
│ [Chụp lại]        [Chọn ảnh khác]    │
│ [        Xác nhận chấm công        ] │  primary after capture
└──────────────────────────────────────┘
```

- Camera starts only for a valid, unstarted assigned shift. Permission denial
  keeps the route and shows `Cho phép quyền camera rồi thử lại`, `Mở camera`, and
  the existing file-upload fallback.
- Submission disables every competing photo action, shows progress inside the
  primary button, and accepts only the server result as success.
- Offline or recoverable failure keeps the preview when safe, displays an inline
  error with retry, and never shows a recorded attendance state.
- Successful clock-in returns to the personal workday route without creating a
  Back-history loop. Checkout uses the same pending/success/error discipline.

##### Frame C — Company/Control `/me` on desktop

```text
┌──────────────────────┬───────────────────────────────────────────────┐
│ Má Tư                │ Công việc của tôi                            │
│                      │                                               │
│ [work modules only]  │ ┌────────────────┐ ┌───────────────────────┐ │
│ Kho hàng             │ │ Hôm nay        │ │ Tiến trình ca        │ │
│ Tài chính            │ │ Ca · trạng thái│ │ ① Vào ca             │ │
│ ...                  │ │ giờ vào / ra   │ │ ② Việc trong ca      │ │
│                      │ │ [Primary CTA]  │ │ ③ Kết ca             │ │
│                      │ └────────────────┘ └───────────────────────┘ │
│                      │                                               │
│ Thông báo            │ Lịch làm · Xin nghỉ · Phiếu lương            │
│ ┌──────────────────┐ │                                               │
│ │ Avatar · Tên   ⌃ │ │                                               │
│ └──────────────────┘ │                                               │
└──────────────────────┴───────────────────────────────────────────────┘
```

- Keep content narrow and task-led inside `AppShell`; desktop may use the
  existing sticky summary plus workflow column, but the reading order remains
  identical to mobile.
- When the actor has no work modules, omit the module list rather than showing
  disabled Finance, Inventory, or HR entries. Brand, Notifications, and Avatar
  Footer remain visible; `/me` is the post-login landing.
- Do not add a `/me` Sidebar item, dashboard KPI, decorative hero, branch/site
  selector, or employee picker.

##### Frame D — Avatar Footer menu

```text
┌──────────────────────────────────┐
│ [User]   Trang cá nhân           │  → /me
├──────────────────────────────────┤
│ [Theme]  Chế độ tối              │
├──────────────────────────────────┤
│ [Logout] Đăng xuất               │  destructive
└──────────────────────────────────┘
```

The symbols above describe placement only; runtime uses the existing Lucide icon
family. `Trang cá nhân` is the first normal action, Theme is separate, and Sign
out remains the final destructive group. The mobile avatar trigger opens the
same menu and preserves these labels and order.

##### Frame E — Branch employee on mobile

```text
┌──────────────────────────────────────┐
│ Chi nhánh Nguyễn Thái Học [AV] [Bell]│
├──────────────────────────────────────┤
│ HÔM NAY · Ca Sáng                    │
│ [ Đang làm việc ]          2/3 việc  │
│ Vào 08:02 · Ra —                     │
│ [          Hoàn thành việc        ]  │
├──────────────────────────────────────┤
│ Việc trong ca                        │
│ ✓ Mở quầy                            │
│ ✓ Kiểm tra dụng cụ                   │
│ ○ Vệ sinh cuối ca                    │
├──────────────────────────────────────┤
│ Lịch làm · Xin nghỉ                  │
├──────────────────────────────────────┤
│  Trang chủ        Ca làm             │  existing Branch bottom nav
└──────────────────────────────────────┘
```

- Keep the Branch header, manager URLs, adapters, and bottom navigation.
  Personal work stays under the `/me` shell.
- The adaptive CTA and personal task flow precede any Branch Manager queue. A
  manager receives a separate `Quản lý chi nhánh` section below personal work.
- Profile stays a one-tap header-avatar destination at `/me/profile`; schedule
  and leave stay under `/me/schedule/*`.

#### Visual and component contract for the frames

| Concern            | Approved contract                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell              | `AppShell` for Company/Control; existing Branch operator shell for `/br/[branchId]/*`                                                                   |
| Personal content   | Registered `EmployeePage`, `EmployeePanel`, `EmployeeInlineState`, `EmployeeStatusStrip`, and `EmployeeActionSection` adapters                          |
| Branch content     | Registered `BranchOperatorPage`, `BranchOperatorPanel`, `BranchOperatorInlineState`, and related Branch adapters                                        |
| Primary action     | Shared `Button` touch size; one terracotta `primary` action per state, full-width on phone                                                              |
| State              | `StatusBadge` for business status; `Alert`, `Spinner`, `AppEmptyState`, `ErrorPanel`, and shared skeletons for feedback                                 |
| Personal shortcuts | Existing Item/action-section composition; no second nav rail or personal dashboard                                                                      |
| Typography         | Geist for headings, body, and control copy; Geist Mono only for times and operational figures                                                           |
| Color and depth    | Existing semantic tokens, rice-cream foundation, terracotta action, deep-navy text, restrained borders/elevation; light and night modes share hierarchy |
| Motion             | Existing Má Tư motion tokens only; feedback explains state change, respects reduced motion, and never moves layout bounds                               |
| Density            | Compact staff-runtime rhythm owned by the existing page and panel adapters; no route-local spacing scale                                                |

No new shared component is approved by these frames. Implement with the existing
shells and registered adapters; add a route-scoped composition only if the
current adapter anatomy cannot express the accepted hierarchy.

#### Interaction-state acceptance matrix

| State               | First message                                 | Primary action                   | Recovery / next route                                        |
| ------------------- | --------------------------------------------- | -------------------------------- | ------------------------------------------------------------ |
| Loading             | Preserve today-card and CTA geometry          | Disabled skeleton slot           | Resolve in place without layout jump                         |
| No assigned shift   | `Chưa có ca làm hôm nay`                      | `Xem lịch làm`                   | `/me/schedule` or Branch schedule equivalent                 |
| Ready to clock in   | Shift name and time, `Chưa vào ca`            | `Chấm công vào`                  | Dedicated clock route                                        |
| Camera denied       | Explain permission requirement                | `Mở camera`                      | Retry permission or choose an existing photo                 |
| Offline             | `Mất kết nối. Chưa ghi nhận chấm công.`       | Disabled submit                  | Retry after connectivity returns; never optimistic success   |
| Submitting          | `Đang ghi nhận…`                              | Same disabled CTA with progress  | Ignore repeat taps; await server result                      |
| Working             | Check-in time and required-work progress      | Next incomplete work or `Kết ca` | Personal workday route                                       |
| Checkout pending    | `Đang chờ quản lý duyệt`                      | No duplicate submit              | Allow existing cancel action when business rules permit      |
| Completed           | Check-in and check-out times, `Đã hoàn thành` | None                             | Schedule and payslip remain secondary                        |
| Recoverable error   | What failed and whether data was recorded     | `Thử lại` when safe              | Keep current route/input/preview where safe                  |
| Inactive membership | No personal data                              | None                             | Permission-denied route; do not render a partial `/me` shell |

Touch targets are at least 44×44 px with visible focus and pressed states. Text
and icons accompany semantic color. Verify at `375×812`, `390×844`, tablet
portrait, desktop `≥1024`, light/night, keyboard, reduced motion, and enlarged
text. No required action uses hover, horizontal swipe, or a hidden gesture.

### Bảng lương

Keep the current workflow order and make it one vertical reading path:

```text
AppPageHeader: Bảng lương
AppToolbar: month · site · profile status · standard days · calendar
AppSection warning: blockers (only when present)
AppSection: period status + DataTable
AppDialog: work calendar
FormDialog: adjustment
AppDialog: snapshot confirmation
```

- Remove the header back button; deep nav owns peer navigation.
- Link profile blockers to `/hr?...salary=missing` and attendance blockers to
  `/hr/attendance?tab=timesheet...`; do not repair source data in Payroll.
- Do not render a successful preflight section when no blockers exist.
- Extract preview-table and calendar presentation from `PayrollListClient`.
  Keep the parent as URL/action/selection coordinator; do not create a one-use
  context, hook, or controller abstraction.
- Hide edit/snapshot actions for locked periods instead of showing unexplained
  disabled controls.
- Keep `FormDialog` for adjustments and `AppDialog` for calendar/confirmation.

### Thiết lập nhân sự toàn công ty

```text
AppPageHeader: Thiết lập nhân sự
AppPageTabs: Ngày công & nghỉ phép | Khung ca làm | Việc trong ca
└── one active SETTINGS-PANEL or LIST
```

- Ngày công & nghỉ phép: one RHF/Zod policy form inside `AppSection`.
- Khung ca làm: list-first `AppListFrame`/`DataTable`; create/edit with `FormDialog`;
  confirm disabling an assigned shift with `AppDialog`.
- Shift tasks: retain the list-first position view, assigned people/roles
  summary, task count, `FormDialog` create/edit, and optional `AppDialog`
  preview. Do not return to a dropdown that exposes one position as the screen.
- Do not use a wizard or stack all three settings on one page.

## Shared component policy

| Need                        | Existing component                             |
| --------------------------- | ---------------------------------------------- |
| Page and header             | `AppPage`, `AppPageHeader`                     |
| Owner list                  | `AppListFrame`, `AppToolbar`, `DataTable`      |
| URL tab within one route    | `AppPageTabs`, `TabsContent`, `UrlTabs`        |
| Create/edit                 | `FormDialog` and shared RHF/Zod fields         |
| Secondary view/confirmation | `AppDialog`                                    |
| Status                      | `StatusBadge`, registry-backed `Badge`         |
| Empty/error/loading         | `AppEmptyState`, `ErrorPanel`, `PageSkeleton`  |
| Row actions                 | `RowActionsMenu`, `RowActionsContextMenuItems` |

## Implementation plan

### Initial delivery tranche — clarify Branch and Company personal IA

Start with the personal-route boundary before the broader Company HR phases.
This changes delivery order only; it does not widen the ADR into auth, data,
brand, or component-system redesign.

1. Characterize Branch employee navigation and preserve every canonical
   `/br/[branchId]/shift/*` and `/profile/*` caller.
2. Keep store-assigned employees entirely inside the Branch mobile IA. Preserve
   bottom navigation, profile entry, Back/Forward, branch scope, and existing
   deep links.
3. Mount `/me/*` inside Control Surface chrome for Accountant, central-site, and
   eligible company-office employees. Add `Trang cá nhân` to the Avatar Footer
   dropdown; keep the Sidebar as work navigation.
4. Make `/me` the default landing for an active company-office employee with no
   work-module binding. This grants actor-only self-service, never a Finance,
   Inventory, HR, or Tenant capability.
5. Keep Owner denied. Keep inactive membership and missing or mismatched required
   site scope fail closed.
6. Pass route/scope tests plus authenticated Accountant, central-site,
   zero-module office, Branch Manager, and floor-role navigation smoke,
   prioritizing mobile employee states.

Exit: Branch employees retain the current mobile route family without redirect;
Control roles reach actor-only personal work through `Trang cá nhân`; neither
surface advertises the other's IA.

Do not begin central Branch-IA cleanup or redesign work-module navigation in
this tranche. First stabilize the personal route boundary and mobile day flow.

### Phase 0 — contract and regression baseline

- Add characterization tests for current route/query behavior and legacy aliases.
- Record authenticated company-HR, Branch Manager, and employee-self captures
  at desktop, tablet portrait, and mobile.
- Record loader/query counts for each default route.
- Lock the three planes, scope vocabulary, route homes, and current ACL for this
  work. Record ADR 0012 as the regression contract for Branch personal routes.

Exit: baseline URLs, captures, and load evidence exist; behavior is unchanged.

### Phase 1 — capability and scope contract

- Approve the persona matrix and capability manifest above.
- Define `hr_manager`, `tenant_owner`, `branch_manager`, and `security_admin`
  as scoped access roles under ADR 0015; do not add authority to an HR position
  or custom JWT claim.
- Bind Quản lý nhân sự and Owner HR authority at Tenant scope; bind Quản lý chi
  nhánh at the exact site scope.
- Split payroll prepare/snapshot, HR setup, account provisioning, attendance
  force-close/correction, and binding-management capabilities.
- Specify the sensitive-data projection and positive/negative policy matrix for
  every capability and scope.
- Require Security Admin AAL2 for human role-binding mutation.

Exit: route registry, Server Action contract, RPC/RLS matrix, audit events, and
test fixtures can all reference one approved capability vocabulary. No UI route
is opened to Quản lý nhân sự yet.

### Phase 2 — navigation and headers

- Rename company HR deep nav to
  `Hồ sơ nhân viên · Chấm công & ca làm · Bảng lương · Thiết lập nhân sự`.
- Rename Branch bottom-nav destinations to `Ca làm` and `Nhân viên`.
- Keep one navigation owner per plane and remove route-peer back buttons.
- Normalize title, description, and one primary CTA per active view.
- Implement company scope vocabulary `Toàn công ty · Văn phòng công ty · từng
chi nhánh`, plus query ownership and cleanup on view/tab changes.
- Normalize attendance aliases without breaking bookmarks.

Exit: deep links, reload, Back/Forward, and active nav are deterministic, with
one workspace navigation owner.

### Phase 3 — Company employee records active-view loading

- Server-dispatch employee or account loaders.
- Move employee-list filters to URL state.
- Collapse `Cần xử lý` to a conditional actionable lane.
- Standardize row actions and existing dialogs.

Exit: Employee records do not query account data; Accounts do not query the
employee list/attention data; both keep distinct labels and states.

### Phase 4 — Company attendance and shifts active-job loading

- Make `Hôm nay` the stable default.
- Server-dispatch only the active tab panel and its data.
- Replace nested leave-history tabs with a secondary addressable dialog.
- Normalize `Bảng công` and `Phân ca` toolbar/query ownership.
- Split `attendance-table.tsx` only along task boundaries being changed.

Exit: each tab has one main job, one control row, and one active data tree;
pending work never changes the route entry state.

### Phase 5 — Branch employee and manager clarity

- Keep `/br/[branchId]/team` as `Nhân sự chi nhánh` with the two concrete tabs.
- Keep `/br/[branchId]/shift` as the employee's stable personal day flow.
- Add the branch-scoped `/shift/attendance` monthly hours view by reusing shared
  attendance read models and math.
- Keep manager-only roster, attendance, checkout, and leave routes explicit;
  do not replace the employee's own `Ca làm` destination by role.
- Preserve ADR 0012, Screen Context Map, route matrix, and nav contracts together;
  do not let documentation and runtime describe different plane ownership.

Exit: Branch personal routes always mean the authenticated employee; manager
routes always mean same-branch administration; neither can select another
employee or branch outside its contract.

### Phase 6 — Payroll client reduction

- Preserve filters, formulas, actions, and Server Actions.
- Extract preview-table and calendar presentation from the coordinator.
- Normalize blocker destinations, locked actions, and overlay ownership.
- Keep and test the `[periodId]` redirect shim.

Exit: calculation/snapshot behavior is unchanged, blockers reach the source
workflow, and the coordinator no longer owns all presentation details.

### Phase 7 — Company HR setup active-tab loading

- Resolve the tab on the server and fetch one domain.
- Render one settings/list panel with tab-scoped states.
- Retain list-first Shifts and Shift tasks with shared dialogs.

Exit: `Ngày công & nghỉ phép` does not load `Khung ca làm`/`Việc trong ca`;
`Khung ca làm` does not load the other domains; `Việc trong ca` does not load
the other domains.

### Phase 8 — compatibility cleanup and contract sync

- Remove old UI branches, query aliases, and components only after one
  compatibility cycle.
- Update Screen Context Map, route matrix, or module docs only when an
  observable contract changes.
- Refresh CodeGraph and run the full repository gate.

## Acceptance criteria

Global:

- one navigation owner per workspace and no page back control duplicating it;
- company HR always states company-wide scope and Branch Manager pages always
  state the branch name;
- at most one primary CTA per page/view;
- reload, share, Back, and Forward restore the same tab and owned filters;
- changing tabs removes irrelevant query keys;
- inactive tabs do not load or render their business data;
- no raw `pay_basis`, role code, or permission key appears in UI;
- desktop, tablet portrait, and mobile keep the same IA with accessible touch,
  keyboard, loading, empty, error, and no-access states.

Company employee records:

- Employee records and Accounts have separate headers, CTA, filters, loader,
  empty/error states, and state vocabulary;
- `Cần xử lý` appears only when its count is greater than zero;
- payroll missing-profile links open the filtered employee list;
- HR position and access permission remain separate.

Company attendance and shifts:

- `/hr/attendance` always opens `Hôm nay`;
- the `Cần duyệt` count never changes the default tab;
- `Cần duyệt` contains no nested tablist;
- `Bảng công` renders one view and `Phân ca` loads only when active;
- legacy aliases work during the compatibility cycle.

Payroll:

- blockers appear only when action is required and link to the owner workflow;
- locked periods expose no adjustment or repeat-snapshot action;
- calendar uses `AppDialog`, adjustment uses `FormDialog`;
- `[periodId]` redirects to the correct month and standard days.

Company HR setup:

- only the active tab is fetched and rendered;
- Shifts and Shift tasks are list-first and use `FormDialog` for create/edit;
- no dropdown makes one position/template the entire screen;
- `position_shift_tasks` remains the SSOT.

Branch Manager:

- `/br/[branchId]/team` is titled `Nhân sự chi nhánh` and exposes
  `Theo dõi ca hôm nay · Nhân viên chi nhánh`;
- `/br/[branchId]/shift/*` is titled `Ca làm & chấm công` and exposes Phân ca,
  Bảng chấm công, Duyệt kết ca, and Duyệt nghỉ phép;
- the branch name is visible and cannot be changed to another branch;
- monthly attendance shows days and working hours for same-branch employees;
- no salary, HĐLĐ, account, permission, or company-wide employee data appears.

Personal self-service:

- Branch employees keep clock, tasks, schedule/leave, profile, and payslip under
  their claimed `/br/[branchId]/*` mobile routes;
- Accountant and central-site roles use `/me/*` inside Control Surface chrome;
- Control Avatar Footer exposes `Trang cá nhân`; `/me` is not a tier-one Sidebar
  module;
- no personal surface exposes an employee picker, cross-site selector, or team
  approval;
- Branch home and `Ca làm` expose one adaptive primary action in the first
  mobile viewport, while schedule, leave, and profile remain reachable without
  crossing surfaces;
- mobile clock submission handles pending, offline, permission-denied, success,
  and recoverable failure without duplicate transitions or false success;
- all mobile actions meet the touch, safe-area, text-state, and browser-history
  contract above at `375×812` and `390×844`.

## Verification

Static and unit checks:

- resolver tests for `view`, `tab`, `month`, aliases, and query cleanup;
- route-access tests for `hr`, `hr_payroll`, and `staff`;
- route/scope tests for `branch_team`, Branch shift manager routes, and `/me/*`;
- loader tests proving inactive domains are not called;
- cross-branch and cross-employee IDOR tests for Branch and Self projections;
- locked-payroll and blocker-destination tests.

Authenticated browser checks:

- Owner across company-HR routes, scopes, tabs, deep links, reload, Back, and
  Forward;
- Branch Manager across own-branch Team, roster, attendance, checkout approval,
  and leave approval; mismatched branch URL fails closed;
- Branch employee across personal `/br/[branchId]/*` on mobile; no cross-branch
  or company-control navigation is advertised;
- Accountant and central-site employee across `/me/*` in Control Surface chrome;
- roles outside route ACL are not offered navigation and direct access is denied;
- desktop ≥1024, tablet portrait <1024, and mobile;
- keyboard tablists, toolbars, row actions, and dialog focus return;
- loading, empty, filtered-empty, recoverable error, and no-access states.

Repository gates:

```bash
corepack pnpm agent:start
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build
corepack pnpm test
corepack pnpm verify
```

After each source-changing phase, refresh CodeGraph before review. A redirect to
`/login` is not authenticated UI acceptance evidence.

## T3 four-lens review

### PM

The proposal keeps four user jobs and does not invent an HR dashboard. Each
phase is independently shippable and measurable through loader count, URL
stability, scope clarity, and time to the primary action. Branch Managers get
the concrete same-branch jobs requested without receiving company-HR pages.

### BA

Company/Branch/Self, employee/account, shift-definition/roster, HR/Finance, and
position/permission boundaries remain explicit. No business SSOT or formula
changes.

### Senior Developer

Server dispatch addresses inactive-domain loading at the source. Shared read
models avoid a duplicate Branch attendance implementation. The plan uses
existing components, avoids a new shell/framework/context, and retains narrow
compatibility redirects.

### QA

The highest risks are query leakage, unstable defaults, cross-branch or
cross-employee scope leakage, role-dependent `/shift` behavior, and inactive
panels mounting. Acceptance covers these risks across route history, three
planes, and three responsive states.

### Synthesis

- Agreement: `/me` is a peer personal route, never an Inventory child or a
  tier-one module. Store-assigned employees remain under `/br/[branchId]/*`.
- Agreement: active company-office employment may grant actor-only self-service
  without granting a work module. Position, assignment, module role, and
  capability remain separate.
- Delivery boundary: shell/frame work can ship for currently recognized roles
  first. Enabling a previously unassigned office position to authenticate and
  land on `/me` must ship with the approved T3 identity/membership/route contract,
  not as a page-local redirect.
- Required proof: active versus inactive membership, zero/one/many work modules,
  Owner denial, Branch canonicalization, self-only IDOR denial, module Sidebar
  visibility, and authenticated mobile/desktop states.

## Consequences

- The four company-HR route homes and current domain authority remain stable.
- UI labels state the actual job; `Thời gian`, `Quy tắc`, and Branch `Đội` are
  retired from these navigation roles.
- Company HR defaults to `Toàn công ty` and can narrow to office or one branch.
- Branch Manager people operations stay fixed to the branch in the URL.
- Branch personal work remains canonical under `/br/[branchId]/*`; Company and
  Control personal work remains canonical under `/me/*`.
- Navigation becomes predictable even when pending counts change.
- Default-route loading decreases because inactive domains are not fetched.
- Large clients gain task boundaries without generic abstractions.
- Existing bookmarks remain valid through redirect and alias compatibility.
- ADR 0012 remains unchanged; personal Branch routes are not retired.
- Explicit Owner acceptance is required before implementation.

## Out of scope

- authorization cutover or ADR 0015 implementation;
- payroll, attendance, leave, BHXH, or PIT formula changes;
- new HR roles or Branch Manager access to Owner HR routes;
- branch-specific shift-definition overrides or a second shift catalog;
- HR KPI dashboards, charts, notifications, or scheduled reports;
- schema, RPC, RLS, or generated database type changes;
- visual-theme changes outside `docs/spec/design-system.md`.
