# ADR 0012 — Owner control and Branch surface boundary

**Status:** Accepted

**Decision owner:** Owner, 2026-07-15

## Context

Tenant-wide control and branch operations reused several capability keys, which
made a role appear to inherit top-level modules when it should only receive a
branch-native workflow. Entry routing also depended on branch selection and
device context instead of the role/scope contract.

## Decision

- There are exactly two authenticated product planes: **Owner** and **Branch**.
- Owner enters `/`. Owner-only module families are `/settings`, `/menu`,
  `/orders`, `/inventory`, `/finance`, `/branches`, and `/hr`.
- Every branch-pinned role enters `/br/[branchId]`, using the branch claim from
  the JWT. Missing or mismatched scope fails closed.
- There is no picker root, route alias, compatibility redirect, or device-based
  destination field.
- `module-acl.ts` owns route admission. Shared capability keys such as
  `inventory` and `orders` may protect Branch-native routes but never grant the
  corresponding Owner route family.
- Branch HR is a read-only projection of personal information, attendance, and
  leave state. Staff CRUD, leave/checkout approval, payroll, HĐLĐ, BHXH,
  accounts, and permissions are Owner-only.
- Owner and Branch have distinct shells projected from `nav-config.ts`; neither
  shell embeds or advertises the other role's navigation.

## Consequences

Branch Manager keeps explicit current-branch operations and setup permissions,
but cannot enter L0 routes or mutate HR data. Inventory count assignment stays
in the Branch stock module instead of appearing as an HR/team tab. Owner may
open any branch explicitly for oversight without changing the default `/`
entry.

## Verification

- Owner fresh login and `/login?returnTo=/` resolve to `/`.
- Branch roles fresh-login to the claimed `/br/{branchId}` and cannot preserve
  an Owner `returnTo`.
- Route map, ACL, navigation, proxy, Server Actions, SQL permissions, generated
  route matrix, and source terminology agree.
- Owner-authenticated desktop and 390px browser smoke are required before this
  change is browser/runtime proven.
