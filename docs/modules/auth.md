# Auth & ACL Module

## Overview

Authentication and authorization for staff/operator surfaces. Protected requests
pass through this module before feature code. Chain: Supabase Auth (identity) →
JWT custom claims hook (position + application role) → `proxy.ts` (route ACL) →
RLS with `has_permission()` (row gate). Public customer surfaces such as
`/br/[branchId]/pickup` bypass staff login by design.

**Owner:** `packages/shared/src/auth/` + `apps/web/proxy.ts` +
`supabase/migrations/20260727120000_baseline.sql` + active auth forwards.

Canonical role/scope/route boundaries:
`docs/spec/role-route-matrix.md`. Runtime route fast-gate:
`module-acl.ts`. Keep that spec, `module-acl.ts`, `route-map.ts`, and auth tests
in sync on route/nav/default-landing changes.

**Authority.** Runtime: this file + `packages/shared/src/auth/module-acl.ts` +
`apps/web/proxy.ts` + `has_permission` / `has_permission_any`. Target cutover:
[ADR 0015](../plan/adr/0015-authorization-model.md) — do not implement from that
ADR. Owner identity columns: [ADR 0005](../plan/adr/0005-owner-identity-source-separation.md)
— do not dual-source `tenants.owner_user_id` into `has_permission` /
`auth_is_owner`. DEFINER / RLS / atomic RPC: [`database.md`](database.md) and
`docs/agent/rules/database.md` (no ADR 0011). Do not call this model PBAC.

Write gate: `has_permission*()` + live bindings. Do not authorize INSERT /
UPDATE / DELETE with a `*:view` key, and do not add `auth_role()` /
`has_position()` on a new write policy or RPC unless the row cites an adapter
below. JWT `user_role` + `canAccess` admit routes only. `positions.code` is an
HR label (mapper feeds JWT). `auth_role()` reads the live profile, not the JWT,
and is not a write key.

Adapters until ADR 0015: D076 JWT roles on Control L0; ADR 0045
`has_position('central_supply_ops')` on catalog write; `auth_role() = 'owner'`
**and** a real write key only to split tenant vs own-branch scope (for example
`printers_*`).

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

JWT `user_role` comes from `positions.code` (shared TS + SQL mapper). HR
`label_vi` / `label_en` must not gate authz. Unknown/retired codes fail closed
to `unassigned`. Application-role set: D076; Inventory workflow boundary: D091;
routes: `docs/spec/role-route-matrix.md`. Temporary until ADR 0015: accountant /
central_supply_ops / central_kitchen_lead on Control L0 + GRN/PO per D076/D091.

## RLS Gate Choice

- **`has_permission(branch_id, key)`** — live bindings + compat grants; revoke
  **immediate**. Use for destructive UPDATE/DELETE and instant-grant gates.
- **`auth_role()`** — live role from `profiles.position_id → positions.code`.
  Route/scope only; action grants still use `has_permission*()`.

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
  `representative` into auth; do not OR `owner_user_id` into `has_permission` /
  `auth_is_owner` until a new decision (ADR 0005). Action authority needs
  explicit binding/capability.
- **Private Branch Realtime follows live assignment**, not grant breadth.
  `can_read_branch_ops(branch_id)`: active profile + active target branch in
  tenant. Owner → any active tenant branch; non-Owner → `profiles.branch_id`
  only. `staff_permissions` must never widen transport audience. Deactivation
  enforced on next authorize / JWT refresh / reconnect — not a socket kill.

## Auth — Position vs Permission

Layer meanings above. Short map: **Position** (`positions` / `profiles.position_id`)
= HR label only; **application role** = JWT `user_role` for `MODULE_ACL`;
**permission** = `permission_keys`; **role binding** = `auth_role_bindings`
(canonical); **compat grant** = `staff_permissions` (read-only; browser
grant/revoke/apply-template RPCs revoked). Authz path: `proxy.ts` →
`canAccess` → module ACL + branch scope; rows via `has_permission*()`. Owner has
no unconditional permission bypass; position/workplace alone never grant a
system role.

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
| Staff lifecycle | `/hr?view=accounts` | `staff:provision`, `staff:assign_position`, `hr:manage_employee` | Position/workplace ≠ role bindings. `positions.code='owner'` is excluded from HR list/create/update/deactivate — Owner is tenant identity, not an HR-managed subject |
| Role binding | `/hr/staff/[id]/permissions` | read `auth:binding_read`; write `auth:binding_manage` + AAL2 | Binding + immutable audit. Owner profiles are not an HR binding target on this route |
| Employee / salary / HĐLĐ | `/hr` | `hr:view_employee`, `hr:view_sensitive_employee`, `hr:manage_employee` | Tenant employee/contract RLS |
| Attendance / leave | `/hr/attendance` | attendance/leave caps by op | Company scope revalidated server-side |
| Shift / task setup | `/hr/setup` | `hr:manage_shift_catalog`, `hr:manage_position_tasks` | Global shifts; position defaults + one employee override |
| Branch employee task overrides | `/br/[branchId]/team` | `hr:manage_employee_shift_overrides` | Actor-branch employees only |
| Branch people / shifts | `/br/[branchId]/team`, `/shift/*` | Exact-branch HR caps | No cross-branch, sensitive, payroll, or binding |
| Personal self-service | `/me/*` | live `self:access` + actor identity | Caller never supplies tenant/employee/role/branch authority |
| Payroll | `/hr/payroll/*` | prepare `hr:payroll_prepare`; finalize `hr:payroll_snapshot` | Idempotent snapshot; payment is Finance-owned |

## Auth Flow

1. Credentials at `/login` → `signInWithPassword()`.
2. Owner-only optional MFA: verified TOTP + session still `aal1` → login returns
   `mfaRequired`; browser `challengeAndVerify` before redirect
   (`/settings/security`, helpers in `apps/web/lib/auth/mfa.ts`). Staff and
   Owners without MFA stay AAL1. Role-binding reads stay AAL1; writes need
   `aal === aal2` (`errorCode: "aal2_required"` + step-up dialog).
3. `custom_access_token_hook()` injects exactly
   `{tenant_id, branch_id, user_role, position_code}` into JWT `app_metadata`.
4. Cookies via `@supabase/ssr`.
5. Each request: proxy `updateSession()` →
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
   exact `/br/[branchId]/pickup`, plus `/r` and `/api/feedback` (guest feedback).
2. **Login:** authenticated → `resolvePostLoginRedirect`; else form.
3. **Unauthenticated → `/login`**.
4. **Claims:** null → `/access-denied?reason=missing-auth-context`. No fabricated claims.
5. **Company HR:** `/hr/*` requires Tenant capability; Branch grant cannot admit.
6. **control_surface + module ACL:** `canAccess`; failure → default route or access-denied.
   Control home `/` also admits JWT `self_service` with live `self:access` (not `hr:view_employee`).
   Branch-floor roles never stay on `/` via capability alone.
7. **Self canonicalization:** company staff keep `/me/*`; Branch roles map to
   `/br/[branchId]/*`. Owner / inactive `self:access` / invalid claims fail closed.
8. **Branch scope:** mismatch → `branch-scope-mismatch`. POS/KDS reject
   missing/inactive/non-operational branches in proxy. Public pickup display validates
   in page (no staff claims).

`resolvePostLoginRedirect` in `scope.ts` is the single post-login destination
(tests in `scope.test.ts`). Root `/` and Branch Manager `/br/{branchId}` use it.

### Invariant

> After `proxy()` returns on a protected path: authenticated, claims valid,
> module access granted, and for protected `/br/[branchId]/*` — branch scope matches.

`loadAuthState()` throws if proxy session/claims invariant is violated. Separately,
revoked Auth while cookie JWT still valid → redirect GET `/api/auth/signout` via
`probeAuthSessionLiveness` (liveness, not second ACL gate).

## Failure Modes

Login post-validation always returns generic
`"Email hoặc mật khẩu không đúng"` (`LOGIN-MESSAGE-MUST-BE-GENERIC`); detail
only in structured logs. Notable signals: `auth.login.claims_missing`,
`auth.login.no_session_after_signin`, `auth.login.rate_limit_failopen`
(fail-open), RLS silent `{ data: null, error: null }`, `canAccess` false,
stale JWT until refresh, zombie JWT after global signOut
(`ZOMBIE-JWT-AFTER-GLOBAL-SIGNOUT`).

Liveness split: **proxy** = `getSession()` only (`PROXY-NEVER-CALL-GETUSER`);
**RSC `getAuthContext`** = cookie claims, no `getUser()`; **`loadAuthState`** =
cookie + `probeAuthSessionLiveness` → `/api/auth/signout`; **`withAction*`** =
`getUser()` → `session_expired` + local `signOut` (never soft deny).

## Blocked-State Reasons

`blocked-state.ts`: `insufficient-permission`, `missing-auth-context`,
`branch-scope-mismatch`, `branch-surface-restricted`, `untrusted-network`.
Unknown → `DEFAULT_BLOCKED_STATE_COPY`. Helper:
`buildAccessDeniedPath(reason, { from? })`. `/access-denied` is presentation
only (`BLOCKED-STATE-UI-IS-PRESENTATION-ONLY`).

POS/KDS network gate (prod, non-owner): trusted egress IPs in `proxy.ts`.
Owner per-branch bypass `branch_network_gate_bypasses` (`1h`/`2h`/`4h`/
`pos_shift`/`business_day`; auto-revoke on session close or `expires_at`).
Engineering kill-switch `POS_NETWORK_GATE=off` opens all branches — platform
incidents only, never single-store Wi‑Fi ops.

## Blast Radius

| Change | Affected |
| ------ | -------- |
| New permission key | Migration INSERT `permission_keys` + `permissions.ts` |
| New position | Migration INSERT `positions` + seed |
| New role_template | Migration or admin RPC |
| New module in route ACL | `module-acl.ts` + proxy resolve + `nav-config.ts` |
| JWT claims shape | Hook SQL + `types.ts` + `scope.ts` + `proxy.ts` (`PLPGSQL-RECORD-IS-NOT-NULL`) |
| Cut table RLS to Auth | DROP/CREATE with `has_permission*` / `has_permission_any`; keep structural gates separate |
