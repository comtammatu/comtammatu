# ADR 0012 — Owner control and Branch surface boundary

**Status:** Accepted

**Decision owner:** Owner, 2026-07-15

## Context

Tenant-wide control and branch operations reused several capability keys, which
made a role appear to inherit top-level modules when it should only receive a
branch-native workflow. Entry routing also depended on branch selection and
device context instead of the role/scope contract.

## Decision

- There are three authenticated presentation planes: **Owner**, **Branch**, and
  **Self**. They share domain records and authorization boundaries; Self is not
  a second HR administration surface.
- Owner enters `/`. Company control module families include `/settings`,
  `/menu`, `/orders`, `/inventory`, `/finance`, `/branches`, and `/hr`;
  admission is decided by explicit scoped capabilities rather than a business
  title.
- Every branch-pinned role enters `/br/[branchId]`, using the branch claim from
  the JWT. Missing or mismatched scope fails closed.
- Every non-Owner employee uses `/me/*` for personal attendance, workday tasks,
  schedule/leave, profile, and payslip. Legacy personal routes under
  `/br/[branchId]/shift/*` and `/br/[branchId]/profile/*` redirect to `/me/*`.
- Owner is explicitly denied the Self plane: no `/me`, no punch, no self-service
  leave, and no discovery or redirect into that route family.
- There is no picker root or device-based destination field. Personal Branch
  aliases remain redirects for one compatibility cycle.
- `module-acl.ts` owns route admission. Shared capability keys such as
  `inventory` and `orders` may protect Branch-native routes but never grant the
  corresponding Owner route family.
- Branch HR is a branch-safe projection of employee and attendance state.
  Staff CRUD, payroll, HĐLĐ, BHXH, accounts, and permissions stay on `/hr/*`.
  Branch Managers retain same-branch floor
  checkout/leave approval; Owner handles central-site and branchless queues.
- Owner and Branch have distinct shells projected from `nav-config.ts`; neither
  shell embeds or advertises the other role's navigation.

## Consequences

Branch Manager keeps explicit current-branch operations and setup permissions,
but cannot enter L0 routes or mutate HR data. Inventory count assignment stays
in the Branch stock module instead of appearing as an HR/team tab. Owner may
open any branch explicitly for oversight without changing the default `/`
entry. Accountant self-service stores immutable null branch scope; central and
floor self-service stores the assigned site at creation.

## T3 synthesis

- **PM:** ship complete self-service for every non-Owner role without rebuilding
  shifts or payroll.
- **BA:** immutable scope is assigned site for floor/central and null only for
  Accountant; Owner is the central/Accountant approver and cannot self-serve.
- **Senior Dev:** guarded RPCs derive actor and scope, snapshot D052
  `position_shift_tasks`, and keep attendance/leave mutations atomic and
  null-safe.
- **QA/QC:** prove Owner denial, cross-tenant/site IDOR rejection, deterministic
  concurrent transitions, fixed-monthly Accountant payroll, migration replay,
  and unchanged floor behavior.

The four lenses agree on the scope and deployment order: additive database
contract first, then compatible runtime exposure, then role smoke and payroll
verification.

## Verification

- Owner fresh login and `/login?returnTo=/` resolve to `/`.
- Branch Managers fresh-login to the claimed `/br/{branchId}`; other employees
  land on their canonical personal or operational surface and cannot preserve
  a company-control `returnTo` without the required capability.
- Route map, ACL, navigation, proxy, Server Actions, SQL permissions, generated
  route matrix, and source terminology agree.
- Owner-authenticated desktop and 390px browser smoke are required before this
  change is browser/runtime proven.
