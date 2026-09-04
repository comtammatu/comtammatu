# ADR 0012 — Owner control and Branch surface boundary

**Status:** Accepted

**Decision owner:** Owner, 2026-07-15

**Amended by:** ADR 0037 (office actors land on `/`; `/me` is the personal
profile plane, not the post-login landing or daily work hub; punch stays at
`/me/clock` via the `/` command bar).

Runtime Dual Thesis, post-login targets, and shells:
[`docs/spec/architecture.md`](../../spec/architecture.md) and
[`docs/modules/web-app.md`](../../modules/web-app.md). This ADR owns the plane
boundary; do not implement chrome or route lists from here.

## Decision

- Three authenticated presentation planes: Owner (`control_surface`), Branch
  (`branch_surface` + `station_chrome`), and Self (`self_surface`). They share
  domain records and authorization; Self is not a second HR administration
  surface.
- Owner and other L0-admitted roles enter `/`. Every branch-pinned role enters
  `/br/[branchId]` from the JWT branch claim; missing or mismatched scope
  fails closed.
- Every non-Owner employee uses `/me/*` for personal schedule, leave, profile,
  and payslip, with punch at `/me/clock`. Owner is explicitly denied the Self
  plane: no `/me`, no punch, no self-service leave, and no discovery into that
  route family.
- `module-acl.ts` owns route admission. Shared capability keys such as
  `inventory` and `orders` may protect Branch-native routes but never grant
  the corresponding Owner L0 route family.
- Branch HR is a branch-safe projection of employee and attendance state.
  Staff CRUD, payroll, HĐLĐ, BHXH, accounts, and permissions stay on `/hr/*`.
  Branch Managers retain same-branch floor checkout/leave approval.
- Owner and Branch have distinct shells projected from `nav-config.ts`; neither
  shell embeds or advertises the other role's navigation. There is no picker
  root or device-based destination field.

## Consequences

Branch Manager keeps current-branch operations and setup, but cannot enter L0
routes or mutate HR data. Owner may open any branch for oversight without
changing the default `/` entry. Accountant self-service stores immutable null
branch scope; central and floor self-service store the assigned site at
creation.

## Verification

- Owner fresh login and `/login?returnTo=/` resolve to `/`.
- Branch Managers fresh-login to the claimed `/br/{branchId}`; other employees
  land on their canonical personal or operational surface and cannot preserve
  a company-control `returnTo` without the required capability.
- Route map, ACL, navigation, proxy, and generated route matrix agree.
