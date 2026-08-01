# Auth & ACL Module

## Overview

Authentication and authorization for staff/operator surfaces. Protected requests pass through this module before reaching feature code. The auth chain spans four layers: Supabase Auth (identity), JWT custom claims hook (position + legacy-role injection), proxy.ts (route-level ACL enforcement), and RLS with `has_permission()` (row-level, permission-driven). Public customer surfaces such as `/br/[branchId]/runner` bypass staff login by design.

**Owner:** `packages/shared/src/auth/` + `apps/web/proxy.ts` +
`supabase/migrations/20260727120000_baseline.sql` + active auth forwards

Canonical role/scope/route boundaries live in `docs/spec/role-route-matrix.md`.
`module-acl.ts` remains the runtime route fast-gate source of truth; route,
navigation, and default-landing changes must keep the spec, `module-acl.ts`,
`route-map.ts`, and auth tests in sync.

## Layer Meanings

Do not use Auth, route ACL, permission grants, and RLS interchangeably.
They answer different questions.

| Layer                         | Source of truth                                                                      | Owns                                                                                   | Does not own                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Auth identity                 | Supabase Auth + `profiles` + `positions`                                             | Who the signed-in user is, tenant/site assignment, active HR position                  | Route admission, action permission, row visibility                        |
| Application role / route ACL  | `positions.code` mapper -> JWT `user_role`; `packages/shared/src/auth/module-acl.ts` | Whether a role can enter a module or route family                                      | Whether a button/action is allowed; whether DB rows are readable/writable |
| Permission grants             | `permission_keys`, `auth_role_bindings`; compatibility `staff_permissions`           | Whether a user can perform an action, with branch/tenant scope and validity window     | Navigation, default home, HR display labels                               |
| Server action / RPC gate      | `withAction`, `withFormAction`, direct RPC checks                                    | Zod input validation, action-level roles + permission checks, atomic mutation boundary | Replacing RLS                                                             |
| RLS                           | Postgres policies + `has_permission()` / `has_permission_any()`                      | Final row-level enforcement for PostgREST/Data API access                              | UI affordances, route taxonomy, staff management semantics                |
| Private Branch Realtime topic | Realtime RLS + `can_read_branch_ops(branch_id)`                                      | Active Owner tenant scope or active non-Owner assigned-branch subscription scope       | Granting business actions or widening scope through `staff_permissions`   |

Vocabulary rule: `position_code` is the HR position; `user_role` is the
canonical application role; `permission_key` is the legacy action string. A
department or position is not a route role unless the mapper explicitly derives
an application role from it.

## Components

| File                                                  | Purpose                                                                                                                                                                                      | Lines                           |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `packages/shared/src/auth/types.ts`                   | Role enum, canonical JWT claims shape (`tenant_id`, `branch_id`, `user_role`, `position_code`)                                                                                               | Core types                      |
| `packages/shared/src/auth/module-acl.ts`              | control_surface + module capability → allowed application roles, `canAccess()`                                                                                                               | Route-level ACL                 |
| `packages/shared/src/auth/permissions.ts`             | `PERMISSION_KEYS`, derived permission count, `hasPermission()`, `hasAny/All` pure fns                                                                                                        | Permission catalog mirror       |
| `packages/shared/src/auth/scope.ts`                   | `extractClaims()` + `decodeJwtAppMetadata()` + `extractClaimsFromAccessToken()`                                                                                                              | JWT claim extraction            |
| `packages/shared/src/auth/route-resolution.ts`        | Public helpers + control_surface path classifier + URL → `ModuleKey` mapping                                                                                                                 | Proxy route mapping             |
| `packages/shared/src/auth/route-map.ts`               | Route family contract: surface, entry point, chrome, back behavior, breadcrumb root                                                                                                          | Navigation contract             |
| `packages/shared/src/auth/nav-config.ts`              | control_surface navigation and Branch navigation groups                                                                                                                                      | UI navigation                   |
| `packages/shared/src/auth/app-discovery.ts`           | Shared app discovery metadata derived from ACL + nav config                                                                                                                                  | Shell discovery contract        |
| `packages/shared/src/auth/blocked-state.ts`           | Canonical blocked-state reasons, user-facing copy, `buildAccessDeniedPath()`                                                                                                                 | Access-state contract           |
| `apps/web/app/(public)/access-denied/page.tsx`        | Single presentation route for "authenticated but blocked" (renders copy from blocked-state)                                                                                                  | Access-state view               |
| `apps/web/app/_lib/auth.ts`                           | `loadAuthState()` — shared claims reader for layouts/pages; throws if proxy session/claims invariant violated; probes Auth liveness and redirects revoked zombie JWTs to `/api/auth/signout` | Layout claims + liveness helper |
| `apps/web/app/_lib/auth-session-liveness.ts`          | `probeAuthSessionLiveness()` — Auth `getUser` probe for protected RSC; redirect on revoke                                                                                                    | Far-from-expiry zombie clear    |
| `apps/web/proxy.ts`                                   | Next.js middleware — **single auth gate**: session + claims + module ACL + branch scope                                                                                                      | Request gateway                 |
| `supabase/migrations/20260727120000_baseline.sql`     | `custom_access_token_hook()` — injects claims into JWT                                                                                                                                       | DB-level auth                   |
| `supabase/migrations/20260727120000_baseline.sql`     | Auth core tables: `permission_keys`, `positions`, `role_templates`, `staff_permissions`                                                                                                      | Auth schema                     |
| `supabase/migrations/20260727120000_baseline.sql`     | `has_permission(branch, key)` / `has_permission_any(key)` SECURITY DEFINER helpers                                                                                                           | Auth RLS helpers                |
| `supabase/migrations/*branch_ops_realtime_scope.sql`  | Active profile/branch authorization for private `branch:{id}:ops` topics                                                                                                                     | Realtime scope gate             |
| `apps/web/app/(protected)/hr/staff/[id]/permissions/` | Role-binding status for HR; guarded Security Admin changes use AAL2                                                                                                                          | Access status UI                |
| `apps/web/app/_lib/permissions.ts`                    | Server helper `currentUserHasPermission()`                                                                                                                                                   | App-side permission reads       |

Discovery invariant: tenant-level navigation starts from
`CONTROL_SURFACE_NAV_GROUPS`, then Company HR entries are filtered by live
Tenant capability. `MODULE_ACL` remains only the coarse route candidate gate.
Branch Manager/Staff discovery contains Branch groups and keeps personal routes
under `/br/[branchId]/*`. `/me/*` is the Control-shell personal route for
eligible company-scoped staff and is never a tier-one module.

## Role Hierarchy

```
owner                          ← governance + tenant-wide oversight, vận hành + catalog NL, procurement
├── accountant                 ← /finance + Inventory GRN/PO slice (D076/D091; temporary until ADR 0015)
├── central_supply_ops         ← Kho Tổng site ops / GRN draft (D076/D091; temporary until ADR 0015)
├── central_kitchen_lead       ← Bếp TT production + GRN draft (D076/D091; temporary until ADR 0015)
├── branch_manager             ← single branch command + operations (no purchase-price view — D091)
├── cashier                    ← POS (/br/[branchId]/pos)
├── chef                       ← KDS (/br/[branchId]/kds)
└── branch_staff               ← branch runtime without POS/KDS specialty
```

These application roles are emitted in JWT `user_role`. They are derived from
`positions.code` through the mapper in shared auth and SQL. HR
display names live in `positions.label_vi` / `positions.label_en` and must not
gate authz. Unknown or retired position codes fail closed to `unassigned`.
D076 owns the application-role set; the three central/accounting roles are
JWT-role adapters and must migrate under ADR 0015 Authority. Runtime ACL, login
destinations, and role templates follow the generated role-route matrix. D091
owns their Inventory workflow boundary.

## RLS Gate Choice — Live Permission Grants vs JWT Role

Two DB-side gates exist; pick the right one:

- **`has_permission(branch_id, key)`** — resolves live role bindings and compatibility grants. Revoke is **immediate**. Use for destructive UPDATE/DELETE policies and any gate that must honor instant grant changes.
- **`auth_role()`** — derives the current application role live from the active `profiles.position_id -> positions.code` chain. Use it for hierarchy and scope predicates inside RPCs; action grants still belong to `has_permission*()`.

**ACL contract notes:**

- `refunds_update` uses `has_permission(branch_id,'orders:refund_approve')`; destructive refund approval must not depend on cached `auth_role()`.
- `update_staff_profile` and `toggle_profile_active` require an active Owner and reconcile legacy permission grants atomically; `set_branch_kind` gates on `settings:tenant`.
- Branch-scope RPCs keep the branch predicate at the write boundary unless a shared helper is active in both policy and RPC surfaces.
- `hr_payroll` policy scope is handled with the HRM payroll/base-salary work; do not add payroll permission keys outside that task.

## Invariants (post H3a, 2026-05-07)

- **`profiles.position_id` is NOT NULL** + FK `ON DELETE RESTRICT`. Every active or inactive profile MUST point to a seeded position in its tenant. Enforced in `supabase/migrations/20260727120000_baseline.sql`.
  - `handle_new_user` requires explicit provisioning inputs `tenant_id`, `branch_id`, and `position_code`; missing or unknown positions fail closed.
  - `update_staff_profile` raises if Owner passes a `position_code` that does not resolve to an active assignable position for the tenant.
  - Deleting a position with active profiles raises `foreign_key_violation` (SQLSTATE 23503). Admins must reassign profiles before deleting.
- **Owner identity has three separate meanings.** `tenants.representative` is a free-text legal-document name (TEXT, not UUID), `positions.code='owner'` supplies a coarse JWT route bucket, and `tenants.owner_user_id UUID NOT NULL` is the canonical owner auth identity column. Do not wire `representative` into auth; action authority still requires an explicit binding/capability.
- **Private Branch Realtime follows live assignment, not permission-grant breadth.**
  `can_read_branch_ops(branch_id)` requires an active profile and active target
  branch in the caller's tenant. An active Owner may subscribe across active
  tenant branches; every non-Owner may subscribe only to `profiles.branch_id`.
  A branch-scoped or tenant-wide `staff_permissions` row must never widen this
  transport audience. Supabase caches Realtime authorization for the connection,
  so a profile or branch deactivation is enforced when the channel next
  authorizes, receives a refreshed JWT, or reconnects; this function is not a
  targeted socket-disconnect mechanism.

## Auth — Position vs Permission

| Concept                 | Storage                                                                          | Purpose                                                                                                                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Position**            | `positions` (per tenant) + `profiles.position_id`                                | HR chức vụ label. Codes are canonical English `lower_snake_case` ONLY — mapped by `POSITION_CODE_TO_STAFF_ROLE` (shared TS) / `private.staff_role_from_position_code` (SQL twin). Display via `label_vi`. Does not gate authz. |
| **Application role**    | JWT `user_role`                                                                  | Canonical route role derived from `positions.code`. Feeds `MODULE_ACL` and route/default-home decisions. Not an action grant.                                                                                                  |
| **Permission**          | `permission_keys` catalog (global)                                               | Canonical action strings such as `inventory:read`, `pos:use`, `staff:assign_position`.                                                                                                                                         |
| **Role binding**        | `auth_role_bindings(user_id, role_key, scope_kind, scope_id, active)`            | Canonical system authority. Tenant and Branch scope are explicit and independent of HR position/workplace.                                                                                                                     |
| **Compatibility grant** | `staff_permissions(user_id, branch_id, permission_key, valid_from, valid_until)` | Read during the compatibility cycle; browser grant/revoke functions are disabled.                                                                                                                                              |

**Authz path (every request):** `proxy.ts` first classifies control_surface
routes and gates them through `canAccess(user_role, "owner")`, then
applies the resolved module capability ACL and Branch scope. Row-level authz
delegates to `has_permission(branch_id, key)` in RLS. Temporal validity and
scope are evaluated from explicit role bindings and compatibility grants;
Owner has no unconditional permission bypass.

Legacy `staff_permissions` rows remain readable during the compatibility cycle,
but browser execution of `grant_permission`, `revoke_permission`, and
`apply_template_to_user` is revoked. New access changes use
`auth_role_bindings`; profile position and workplace never grant a system role
by themselves.

## Access Operations

| Operation                 | API / table                                           | Meaning                                                                               |
| ------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Create auth user          | Admin API + `handle_new_user()`                       | Creates identity and profile without granting a system role.                          |
| Assign position/workplace | guarded staff actions and RPCs                        | Company HR assignment boundary, separate from access.                                 |
| Grant/revoke role         | `set_auth_role_binding(target, role, branch, active)` | Requires `auth:binding_manage`, `security_admin`, AAL2, Tenant validation, and audit. |
| Read role state           | `auth_role_bindings`                                  | HR uses `auth:binding_read` read-only.                                                |
| Enter Company HR          | `proxy.ts` -> Tenant capability                       | Branch-scoped grants never admit `/hr/*`.                                             |
| Execute action/read row   | `withAction` / RPC / RLS -> `has_permission*()`       | Authoritative action and data gate.                                                   |

## HR Permission Contract

`/hr` is a Company HR control surface for `tenant_owner` and `hr_manager`
bindings. Branch Manager oversight remains under `/br/[branchId]/team` and
`/br/[branchId]/shift/*`. Company-scoped personal work is canonical under
`/me/*`; Branch staff keep their existing Branch route family.

| HR operation                  | Route                             | Permission / action gate                                               | Server boundary                                 | Data boundary                                                     |
| ----------------------------- | --------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------- |
| Staff account lifecycle       | `/hr?view=accounts`               | `staff:provision`, `staff:assign_position`, `hr:manage_employee`       | guarded staff actions/RPCs                      | profile position/workplace, separate from role bindings           |
| Role binding                  | `/hr/staff/[id]/permissions`      | read: `auth:binding_read`; write: `auth:binding_manage` + AAL2         | `setRoleBindingAction`; `set_auth_role_binding` | binding and immutable audit tables                                |
| Employee record, salary, HĐLĐ | `/hr`                             | `hr:view_employee`, `hr:view_sensitive_employee`, `hr:manage_employee` | employee actions                                | Tenant-scoped employee/contract RLS                               |
| Attendance and leave          | `/hr/attendance`                  | attendance/leave capabilities by operation                             | audited correction and force-close RPCs         | Company scope selector is revalidated server-side                 |
| Shift and task setup          | `/hr/setup`                       | `hr:manage_shift_catalog`, `hr:manage_position_tasks`                  | shift actions and employee override RPCs        | global shifts; position defaults plus one full employee override  |
| Branch people and shifts      | `/br/[branchId]/team`, `/shift/*` | exact-branch HR capabilities                                           | branch-safe projections and RPCs                | no cross-branch, sensitive employee, payroll, or binding access   |
| Personal self-service         | `/me/*`                           | live tenant `self:access` binding plus actor identity                  | proxy gate + guarded self-service RPCs          | caller never supplies tenant, employee, role, or branch authority |
| Payroll                       | `/hr/payroll/*`                   | prepare: `hr:payroll_prepare`; finalize: `hr:payroll_snapshot`         | idempotent `snapshot_payroll_calculation`       | one transactional snapshot; payment remains Finance-owned         |

## Auth Flow

1. User submits credentials at `/login` (`apps/web/app/(public)/(auth)/login/actions.ts`)
2. Server action calls `supabase.auth.signInWithPassword()`
3. Supabase fires `custom_access_token_hook()` — SECURITY DEFINER
4. Hook reads `profiles` + `positions` and injects exactly `{tenant_id, branch_id, user_role, position_code}` as authorization claims in JWT `app_metadata`.
5. JWT returned to client, stored in cookies via `@supabase/ssr`
6. Every subsequent request:
   - Proxy calls `updateSession()` → `extractClaimsFromAccessToken(session.access_token)` → `canAccess(user_role, module)` (route gate)
   - RLS on any DB access: `has_permission(branch_id, key)` checks `staff_permissions` (row gate)

**IMPORTANT:** `user.app_metadata` from supabase-js reads the `auth.users` row, which does **not** include hook-injected claims. Always use `extractClaimsFromAccessToken(session.access_token)` when you need `position`. See regression rule `JWT-CLAIMS-NOT-IN-APP-METADATA`.

## ACL Matrix

`packages/shared/src/auth/module-acl.ts` owns route-level module access;
`docs/spec/role-route-matrix.md` is its generated human-readable view. Inventory
action roles live in `packages/shared/src/auth/inventory-roles.ts`, while permission
keys and RLS/RPC checks own mutation authority. Do not maintain another role matrix
or workflow summary here.

Route ACL is only a fast gate. Row-level authorization uses
`has_permission(branch_id, key)`, and branch scope is revalidated at the DB
boundary rather than trusted from URL state.

Settings boundary: tenant setup under `/settings/*` is owner-only; branch
setup under `/br/[branchId]/settings/*` uses branch-scoped route families and
permission enforcement.

## Proxy Routing Logic — Single Gate

`apps/web/proxy.ts` is the **only** file that runs staff auth / ACL / branch-scope redirects. Layouts and pages for protected surfaces trust the proxy; they call `loadAuthState()` (`apps/web/app/_lib/auth.ts`) to read claims but never re-check them. If anything below is missing on a protected surface, the proxy has a gap — not the layout.

The `proxy(request)` function evaluates in order:

1. **Public paths bypass auth:** `/api/health`, `/api/webhooks`, `/sw.js`, `/access-denied`, and exact `/br/[branchId]/runner` (`route-resolution.ts:isPublicAppPath`). `/r` and `/api/feedback` are public guest feedback surfaces (QR scan and submit API). The access-denied page is public so a blocked-but-authenticated user can read the copy without re-entering the ACL loop.
2. **Login page:** authenticated users bounce to `resolvePostLoginRedirect(claims, returnTo)`; unauthenticated users see the form.
3. **Unauthenticated → `/login`**.
4. **Claims extraction:** if `extractClaims()` returns null, proxy redirects to `/access-denied?reason=missing-auth-context&from=<path>`. Proxy **does not** fabricate claims.
5. **Company HR capability:** `/hr/*` probes the required Tenant capability; a Branch-scoped grant cannot admit the route.
6. **control_surface and Module candidate ACL:** `isOwnerRoutePath(pathname)` and `resolveModuleFromPath(pathname)` classify the route; `canAccess(role, moduleKey)` is the coarse gate, while capability/RLS remains authoritative. Failure redirects to the role's default route or `/access-denied` as appropriate.
7. **Self canonicalization:** company-scoped staff keep `/me/*`; Branch roles canonicalize `/me/*` to their claimed `/br/[branchId]/*` equivalent. Owner, inactive `self:access`, and invalid claims fail closed.
8. **Branch-scope for POS/KDS/branch settings/menu limits:** if a protected branch-scoped URL is not reachable for the user's branch assignment → `/access-denied?reason=branch-scope-mismatch`. POS/KDS and future protected Runner child routes reject missing, inactive, or non-operational branches in proxy. The exact public Runner display rejects invalid/non-operational branches inside the page because it has no staff claims.

The resolver `resolvePostLoginRedirect(claims, returnTo)` (`packages/shared/src/auth/scope.ts`) is the **single** post-login destination function. The underlying ACL + branch-scope rules are shared. Unit tests live in `packages/shared/src/auth/__tests__/scope.test.ts` (run `pnpm --filter @comtammatu/shared test`).

Root `/` uses the same shared default resolver as post-login fallback. Branch
Manager lands on the branch branch home `/br/{branchId}` by default. Branch
Command remains a branch-scoped management route opened from operator tools or
direct links.

### Invariant

> _After `proxy()` returns on a protected path, any layout or page downstream can assume: the user is authenticated, claims are valid, the role has module access, and — for protected branch-scoped `/br/[branchId]/*` surfaces — branch scope matches._

`loadAuthState()` throws if the proxy session/claims invariant is violated
(surfaces gaps via `error.tsx`). Separately, when Auth session is revoked while
the cookie JWT is still valid, `loadAuthState` redirects to GET
`/api/auth/signout` via `probeAuthSessionLiveness` — that is Auth liveness
recovery, not a second ACL gate.

## Failure Modes

| Failure                           | Signal                                                                                                                                            | Recovery                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JWT hook returns no claims        | Generic login error + `console.error("auth.login.claims_missing", { user_id })` (post-2026-05-07 fix)                                             | Check server logs for `user_id`. Verify `custom_access_token_hook` is SECURITY DEFINER + profile row exists + position_id resolves                                                                                                                                                                                                                                                                                                                                      |
| `getSession()` returns no session | Generic login error + `console.error("auth.login.no_session_after_signin")` + signOut                                                             | Cookie write failed mid-request. Inspect proxy `Set-Cookie` flow + browser cookie state                                                                                                                                                                                                                                                                                                                                                                                 |
| Upstash rate-limit unreachable    | `console.error("auth.login.rate_limit_failopen", { ip, error })` — login still proceeds (fail-open)                                               | Check Vercel log drain. Verify Upstash health (`UPSTASH_REDIS_REST_URL`). Persistent `security_events` table tracking is follow-up wave                                                                                                                                                                                                                                                                                                                                 |
| RLS blocks silently               | `{ data: null, error: null }` — no error thrown                                                                                                   | Check GRANT + RLS policy for the table                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Role not in MODULE_ACL            | `canAccess()` returns false, user redirected                                                                                                      | Add role to MODULE_ACL for the module                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Stale JWT after role change       | Old role persists until token refresh                                                                                                             | Call `supabase.auth.refreshSession()` or wait for proxy `updateSession()`                                                                                                                                                                                                                                                                                                                                                                                               |
| Zombie JWT after global signOut   | Peer tab still has valid access JWT; refresh terminal (`session_not_found` / refresh_token_*) while auth-js proactive-preserve would keep session | Middleware forces anonymous + deletion cookies when terminal refresh observed (even if access still valid). Mutations via `withAction` return `session_expired` after `getUser` liveness. Protected `loadAuthState` probes Auth via `probeAuthSessionLiveness` and redirects revoked sessions to GET `/api/auth/signout` (cookie clear). Residual: public Runner (intentional) and any staff surface that skips `loadAuthState`. See `ZOMBIE-JWT-AFTER-GLOBAL-SIGNOUT`. |

> **Login error consolidation (2026-05-07):** All post-validation failure modes (wrong creds, no session, no claims) return the same generic Vietnamese copy `"Email hoặc mật khẩu không đúng"` to prevent credential-validity enumeration. Distinguishing context lives only in structured server logs. See regression rule `LOGIN-MESSAGE-MUST-BE-GENERIC` and `apps/web/app/(public)/(auth)/login/actions.ts`.

### Proxy session refresh vs Auth liveness

- **Proxy / middleware:** `getSession()` only (`PROXY-NEVER-CALL-GETUSER`). Near-expiry refresh runs automatically; terminal refresh failures clear the session. Middleware additionally overrides auth-js proactive-preserve so a still-valid access JWT cannot outlive a dead refresh token on that request path.
- **RSC `getAuthContext`:** cookie `getSession()` claims only — do not add `getUser()` here (GRN/expense false-deny).
- **Protected RSC `loadAuthState`:** cookie `getSession()` plus Auth liveness via `probeAuthSessionLiveness` (`apps/web/app/_lib/auth-session-liveness.ts`). Revoked Auth → redirect to GET `/api/auth/signout` (Route Handler Set-Cookie). This closes the far-from-expiry zombie window on layouts/pages that call `loadAuthState` (including POS layout).
- **Mutations (`withAction*`):** Auth liveness via `getUser()`; revoked Auth → `session_expired` + local `signOut`, never soft "Không có quyền".

## Blocked-State Reasons

`packages/shared/src/auth/blocked-state.ts` defines the reason codes for the "authenticated but blocked" flow:

- `insufficient-permission` — the current role cannot enter that module/route
- `missing-auth-context` — the session has a user but the claims needed to authorize cannot be resolved
- `branch-scope-mismatch` — the URL has a `branchId` but `claims.branch_id` differs or is null (POS/KDS/branch settings/menu limits)
- `branch-surface-restricted` — POS/KDS opened on an invalid or inactive branch

If a reason code is missing or unknown, `/access-denied` falls back to generic copy (`DEFAULT_BLOCKED_STATE_COPY`) instead of crashing.

### `buildAccessDeniedPath(reason, { from? })`

Single canonical helper for "send a blocked user somewhere they can read what happened." Output: `/access-denied?reason=<code>&from=<encoded-path>`. The proxy is the only consumer right now.

### `/access-denied` page

- Public path (bypasses `updateSession`) — reachable by any user.
- Only reads `searchParams.reason` + `searchParams.from` → renders copy via `resolveBlockedState()`.
- Does not check auth or redirect on its own. Follows **BLOCKED-STATE-UI-IS-PRESENTATION-ONLY**.
- Uses Má Tư DS `Card` + `Button` shared components (follows **NO-FAKE-PRIMITIVES**).
- Two actions: "Về phân hệ mặc định" (link to `/`) and "Đăng nhập lại" (link to `/login`).

## Blast Radius

| Change                      | Affected                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add new permission key      | Migration (INSERT into `permission_keys`) + `packages/shared/src/auth/permissions.ts` constant                                                                                        |
| Add new position            | Migration (INSERT into `positions`) + seed script                                                                                                                                     |
| Add new role_template       | Migration (INSERT into `role_templates`) or via admin RPC                                                                                                                             |
| Add new module to route ACL | module-acl.ts + proxy.ts `resolveModule()` + nav-config.ts                                                                                                                            |
| Change JWT claims shape     | hook SQL + types.ts + scope.ts + proxy.ts. Always check `record.tenant_id IS NOT NULL` not `record IS NOT NULL` in plpgsql (see `PLPGSQL-RECORD-IS-NOT-NULL` regression).             |
| Cut a table's RLS to Auth   | DROP old policies + CREATE with `has_permission(branch_id, key)` (branch-scoped) or `has_permission_any(key)` (tenant-scoped). Keep structural gates (`branch_kind` checks) separate. |

## Design Rationale

- **JWT claims over DB lookup per request:** Performance. Claims are verified cryptographically without a DB round-trip. Trade-off: stale data until token refresh.
- **SECURITY DEFINER on hook:** Required by Supabase — the auth hook must read `profiles` which RLS would block during token minting.
- **Single ACL source:** `module-acl.ts` prevents drift between proxy, nav, and layout guards.
- **Single gate = proxy:** layouts and pages must not re-check session/claims/ACL. `loadAuthState()` throws (not redirects) if claims are missing; proxy remains the only route gate. Auth-session revoke recovery (redirect to signout) is liveness, not ACL.
- **Invite-only (no self-signup):** Business requirement — staff are added by managers via Admin API with pre-set `tenant_id` + `role`.
