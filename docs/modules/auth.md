# Auth & ACL Module

## Overview

Authentication and authorization for staff/operator surfaces. Protected requests
pass through this module before feature code. Chain: Supabase Auth (identity) →
JWT custom claims hook (position + application role) → `proxy.ts` (route ACL) →
RLS with `has_permission()` (row gate). Public customer surfaces such as
`/br/[branchId]/runner` bypass staff login by design.

**Owner:** `packages/shared/src/auth/` + `apps/web/proxy.ts` +
`supabase/migrations/20260727120000_baseline.sql` + active auth forwards.

Canonical role/scope/route boundaries:
`docs/spec/role-route-matrix.md`. Runtime route fast-gate:
`module-acl.ts`. Keep that spec, `module-acl.ts`, `route-map.ts`, and auth tests
in sync on route/nav/default-landing changes.

Target cutover model: [ADR 0015](../plan/adr/0015-authorization-model.md).
Until cutover, this module remains runtime authority — do not treat archived
authorization-target notes as runtime contract.

## Layer Meanings

Do not conflate Auth, route ACL, permission grants, and RLS.

| Layer                         | Source of truth | Owns | Does not own |
| ----------------------------- | --------------- | ---- | ------------ |
| Auth identity                 | Supabase Auth + `profiles` + `positions` | Who the user is; tenant/site; HR position | Route admission, action permission, row visibility |
| Application role / route ACL  | `positions.code` → JWT `user_role`; `module-acl.ts` | Module/route family admission | Button/action grants; row R/W |
| Permission grants             | `permission_keys`, `auth_role_bindings`; compat `staff_permissions` | Action permission with branch/tenant scope + validity | Nav, default home, HR labels |
| Server action / RPC gate      | `withAction`, `withFormAction`, direct RPC checks | Zod input, action roles + permissions, atomic mutation | Replacing RLS |
| RLS                           | Policies + `has_permission()` / `has_permission_any()` | Final row enforcement | UI affordances, route taxonomy |
| Private Branch Realtime topic | Realtime RLS + `can_read_branch_ops(branch_id)` | Owner tenant scope or non-Owner assigned-branch scope | Business actions via `staff_permissions` |

Vocabulary: `position_code` = HR position; `user_role` = application role;
`permission_key` = action string. A department/position is not a route role
unless the mapper derives one.

## Source Files

- Shared ACL/nav: `packages/shared/src/auth/{types,module-acl,permissions,scope,route-resolution,route-map,nav-config,app-discovery,blocked-state,inventory-roles}.ts`
- Gate + helpers: `apps/web/proxy.ts` (**single** staff gate); `apps/web/app/_lib/{auth,auth-session-liveness,permissions}.ts`
- UI: `apps/web/app/(public)/access-denied/page.tsx`; `apps/web/app/(protected)/hr/staff/[id]/permissions/`
- DB: `supabase/migrations/20260727120000_baseline.sql`; `*branch_ops_realtime_scope.sql`

Discovery: `CONTROL_SURFACE_NAV_GROUPS` then Company HR by Tenant capability.
`MODULE_ACL` = coarse route candidate. Branch discovery under `/br/[branchId]/*`.
`/me/*` = Control-shell personal — never tier-one module.

## Role Hierarchy

```
owner                          ← governance + tenant oversight, operations + catalog NL, procurement
├── accountant                 ← /finance + Inventory GRN/PO (D076/D091; temp until ADR 0015)
├── central_supply_ops         ← central warehouse (`Kho Tổng`) / GRN draft (D076/D091; temp until ADR 0015)
├── central_kitchen_lead       ← central kitchen (`Bếp TT`) production + GRN draft (D076/D091; temp until ADR 0015)
├── branch_manager             ← single branch ops (no purchase-price — D091)
├── cashier                    ← POS (/br/[branchId]/pos)
├── chef                       ← KDS (/br/[branchId]/kds)
└── branch_staff               ← branch runtime without POS/KDS specialty
```

JWT `user_role` is derived from `positions.code` (shared TS + SQL mapper). HR
labels (`label_vi` / `label_en`) must not gate authz. Unknown/retired codes fail
closed to `unassigned`. D076 owns the application-role set; D091 owns Inventory
workflow boundary. Full route matrix: `docs/spec/role-route-matrix.md`.

## RLS Gate Choice

- **`has_permission(branch_id, key)`** — live bindings + compat grants; revoke
  **immediate**. Use for destructive UPDATE/DELETE and instant-grant gates.
- **`auth_role()`** — live role from `profiles.position_id → positions.code`.
  Hierarchy/scope in RPCs; action grants still use `has_permission*()`.

Notes: `refunds_update` uses `has_permission(...,'orders:refund_approve')` —
not cached `auth_role()`. `update_staff_profile` / `toggle_profile_active`
require active Owner; `set_branch_kind` gates on `settings:tenant`. Branch-scope
RPCs keep the branch predicate at the write boundary. Do not add payroll
permission keys outside HRM payroll/base-salary work.

## Invariants

- **`profiles.position_id` NOT NULL** + FK `ON DELETE RESTRICT`. Every profile
  points to a seeded tenant position (`20260727120000_baseline.sql`).
  - `handle_new_user` requires `tenant_id`, `branch_id`, `position_code`;
    missing/unknown fail closed.
  - `update_staff_profile` rejects unresolvable/inactive assignable positions.
  - Deleting a position with profiles → `23503`; reassign first.
- **Owner has three meanings.** `tenants.representative` = free-text legal name
  (not auth). `positions.code='owner'` = coarse JWT route bucket.
  `tenants.owner_user_id` = canonical owner auth identity. Do not wire
  `representative` into auth; action authority needs explicit binding/capability.
- **Private Branch Realtime follows live assignment**, not grant breadth.
  `can_read_branch_ops(branch_id)`: active profile + active target branch in
  tenant. Owner → any active tenant branch; non-Owner → `profiles.branch_id`
  only. `staff_permissions` must never widen transport audience. Deactivation
  enforced on next authorize / JWT refresh / reconnect — not a socket kill.

## Auth — Position vs Permission

| Concept | Storage | Purpose |
| ------- | ------- | ------- |
| **Position** | `positions` + `profiles.position_id` | HR label. Codes: English `lower_snake_case` via `POSITION_CODE_TO_STAFF_ROLE` / `private.staff_role_from_position_code`. Display via `label_vi`. Does not gate authz. |
| **Application role** | JWT `user_role` | Route role from `positions.code`. Feeds `MODULE_ACL` / default home. Not an action grant. |
| **Permission** | `permission_keys` | Action strings (`inventory:read`, `pos:use`, …). |
| **Role binding** | `auth_role_bindings` | Canonical system authority; Tenant/Branch scope independent of HR position. |
| **Compatibility grant** | `staff_permissions` | Readable during compat cycle; browser grant/revoke disabled. |

**Authz path:** `proxy.ts` classifies control_surface → `canAccess(user_role, …)`
→ module ACL + Branch scope. Row authz → `has_permission*()` in RLS. Owner has
no unconditional permission bypass. New access changes use `auth_role_bindings`;
position/workplace alone never grant a system role.
Browser `grant_permission` / `revoke_permission` / `apply_template_to_user`
execution is revoked.

## Access Operations

| Operation | API / table | Meaning |
| --------- | ----------- | ------- |
| Create auth user | Admin API + `handle_new_user()` | Identity + profile; no system role |
| Assign position/workplace | Guarded staff actions/RPCs | Company HR; separate from access |
| Grant/revoke role | `set_auth_role_binding(...)` | `auth:binding_manage` + `security_admin` + AAL2 + Tenant validation + audit |
| Read role state | `auth_role_bindings` | HR: `auth:binding_read` |
| Enter Company HR | `proxy.ts` → Tenant capability | Branch-scoped grants never admit `/hr/*` |
| Execute action/read row | `withAction` / RPC / RLS → `has_permission*()` | Authoritative action + data gate |

## HR Permission Contract

`/hr` is Company HR for `tenant_owner` / `hr_manager` bindings. Branch Manager
oversight: `/br/[branchId]/team`, `/br/[branchId]/shift/*`. Company personal:
`/me/*`.

| HR operation | Route | Gate | Boundary |
| ------------ | ----- | ---- | -------- |
| Staff lifecycle | `/hr?view=accounts` | `staff:provision`, `staff:assign_position`, `hr:manage_employee` | Position/workplace ≠ role bindings |
| Role binding | `/hr/staff/[id]/permissions` | read `auth:binding_read`; write `auth:binding_manage` + AAL2 | Binding + immutable audit |
| Employee / salary / HĐLĐ | `/hr` | `hr:view_employee`, `hr:view_sensitive_employee`, `hr:manage_employee` | Tenant employee/contract RLS |
| Attendance / leave | `/hr/attendance` | attendance/leave caps by op | Company scope revalidated server-side |
| Shift / task setup | `/hr/setup` | `hr:manage_shift_catalog`, `hr:manage_position_tasks` | Global shifts; position defaults + one employee override |
| Branch employee task overrides | `/br/[branchId]/team` | `hr:manage_employee_shift_overrides` | Actor-branch employees only |
| Branch people / shifts | `/br/[branchId]/team`, `/shift/*` | Exact-branch HR caps | No cross-branch, sensitive, payroll, or binding |
| Personal self-service | `/me/*` | live `self:access` + actor identity | Caller never supplies tenant/employee/role/branch authority |
| Payroll | `/hr/payroll/*` | prepare `hr:payroll_prepare`; finalize `hr:payroll_snapshot` | Idempotent snapshot; payment is Finance-owned |

## Auth Flow

1. Credentials at `/login` → `signInWithPassword()`.
2. `custom_access_token_hook()` injects exactly
   `{tenant_id, branch_id, user_role, position_code}` into JWT `app_metadata`.
3. Cookies via `@supabase/ssr`.
4. Each request: proxy `updateSession()` →
   `extractClaimsFromAccessToken` → `canAccess` (route). RLS →
   `has_permission*` (row).

**IMPORTANT:** `user.app_metadata` from supabase-js reads `auth.users` and does
**not** include hook claims. Always use `extractClaimsFromAccessToken`. See
`JWT-CLAIMS-NOT-IN-APP-METADATA`.

## Proxy Routing Logic — Single Gate

ACL: `module-acl.ts` + `docs/spec/role-route-matrix.md`. Inventory roles:
`inventory-roles.ts`. Mutation authority = permission keys + RLS/RPC. Route ACL
is fast gate only; branch scope revalidated at DB. Settings: `/settings/*`
owner-only; `/br/[branchId]/settings/*` branch-scoped + permissions.

`apps/web/proxy.ts` is the **only** staff auth / ACL / branch-scope redirect
file. Protected layouts/pages call `loadAuthState()` to read claims — never
re-check ACL. Missing invariant = proxy gap.

`proxy(request)` order:

1. **Public bypass:** `/api/health`, `/api/webhooks`, `/sw.js`, `/access-denied`,
   exact `/br/[branchId]/runner`, plus `/r` and `/api/feedback` (guest feedback).
2. **Login:** authenticated → `resolvePostLoginRedirect`; else form.
3. **Unauthenticated → `/login`**.
4. **Claims:** null → `/access-denied?reason=missing-auth-context`. No fabricated claims.
5. **Company HR:** `/hr/*` requires Tenant capability; Branch grant cannot admit.
6. **control_surface + module ACL:** `canAccess`; failure → default route or access-denied.
7. **Self canonicalization:** company staff keep `/me/*`; Branch roles map to
   `/br/[branchId]/*`. Owner / inactive `self:access` / invalid claims fail closed.
8. **Branch scope:** mismatch → `branch-scope-mismatch`. POS/KDS reject
   missing/inactive/non-operational branches in proxy. Public Runner validates
   in page (no staff claims).

`resolvePostLoginRedirect` in `scope.ts` is the single post-login destination.
Tests: `packages/shared/src/auth/__tests__/scope.test.ts`. Root `/` uses the
same default resolver. Branch Manager default: `/br/{branchId}`.

### Invariant

> After `proxy()` returns on a protected path: authenticated, claims valid,
> module access granted, and for protected `/br/[branchId]/*` — branch scope matches.

`loadAuthState()` throws if proxy session/claims invariant is violated. Separately,
revoked Auth while cookie JWT still valid → redirect GET `/api/auth/signout` via
`probeAuthSessionLiveness` (liveness, not second ACL gate).

## Failure Modes

| Failure | Signal | Recovery |
| ------- | ------ | -------- |
| JWT hook no claims | Generic login error + `auth.login.claims_missing` | Hook SECURITY DEFINER; profile + position resolve |
| No session after signin | Generic login + `auth.login.no_session_after_signin` + signOut | Cookie / `Set-Cookie` path |
| Upstash rate-limit down | `auth.login.rate_limit_failopen` — login continues | Upstash health; fail-open by design |
| RLS silent block | `{ data: null, error: null }` | GRANT + policy |
| Role not in MODULE_ACL | `canAccess` false → redirect | Add role to ACL |
| Stale JWT after role change | Old role until refresh | `refreshSession()` / proxy `updateSession()` |
| Zombie JWT after global signOut | Peer tab keeps access JWT | Middleware clears on terminal refresh; `withAction` → `session_expired`; `loadAuthState` → `/api/auth/signout`. See `ZOMBIE-JWT-AFTER-GLOBAL-SIGNOUT` |

All post-validation login failures return the same Vietnamese copy
`"Email hoặc mật khẩu không đúng"` (`LOGIN-MESSAGE-MUST-BE-GENERIC`). Detail
only in structured server logs.

### Proxy session refresh vs Auth liveness

- **Proxy:** `getSession()` only (`PROXY-NEVER-CALL-GETUSER`). Terminal refresh
  clears session; overrides auth-js proactive-preserve so dead refresh cannot
  keep a live access JWT on that path.
- **RSC `getAuthContext`:** cookie claims only — no `getUser()` (GRN/expense false-deny).
- **Protected `loadAuthState`:** cookie session + `probeAuthSessionLiveness` →
  revoke redirects to `/api/auth/signout`.
- **Mutations (`withAction*`):** `getUser()` liveness → `session_expired` + local
  `signOut`, never soft "Không có quyền".

## Blocked-State Reasons

Defined in `blocked-state.ts`:

- `insufficient-permission` — role cannot enter module/route
- `missing-auth-context` — user present, claims unresolved
- `branch-scope-mismatch` — URL `branchId` ≠ `claims.branch_id`
- `branch-surface-restricted` — POS/KDS on invalid/inactive branch

Unknown reason → `DEFAULT_BLOCKED_STATE_COPY`. Canonical redirect helper:
`buildAccessDeniedPath(reason, { from? })`. `/access-denied` is public
presentation only (`BLOCKED-STATE-UI-IS-PRESENTATION-ONLY`); reads
`reason`/`from`, no auth re-check. Actions: default module (`/`) and re-login.

## Blast Radius

| Change | Affected |
| ------ | -------- |
| New permission key | Migration INSERT `permission_keys` + `permissions.ts` |
| New position | Migration INSERT `positions` + seed |
| New role_template | Migration or admin RPC |
| New module in route ACL | `module-acl.ts` + proxy resolve + `nav-config.ts` |
| JWT claims shape | Hook SQL + `types.ts` + `scope.ts` + `proxy.ts` (`PLPGSQL-RECORD-IS-NOT-NULL`) |
| Cut table RLS to Auth | DROP/CREATE with `has_permission*` / `has_permission_any`; keep structural gates separate |
