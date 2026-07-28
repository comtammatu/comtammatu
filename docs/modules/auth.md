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
| Permission grants             | `permission_keys`, `staff_permissions`, `role_templates`                             | Whether a user can perform an action, with branch/tenant scope and validity window     | Navigation, default home, HR display labels                               |
| Server action / RPC gate      | `withAction`, `withFormAction`, direct RPC checks                                    | Zod input validation, action-level roles + permission checks, atomic mutation boundary | Replacing RLS                                                             |
| RLS                           | Postgres policies + `has_permission()` / `has_permission_any()`                      | Final row-level enforcement for PostgREST/Data API access                              | UI affordances, route taxonomy, staff management semantics                |
| Private Branch Realtime topic | Realtime RLS + `can_read_branch_ops(branch_id)`                                      | Active Owner tenant scope or active non-Owner assigned-branch subscription scope       | Granting business actions or widening scope through `staff_permissions`   |

Vocabulary rule: `position_code` is the HR position; `user_role` is the
canonical application role; `permission_key` is the legacy action string. A
department or position is not a route role unless the mapper explicitly derives
an application role from it.

## Components

| File                                                  | Purpose                                                                                        | Lines                     |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------- |
| `packages/shared/src/auth/types.ts`                   | Role enum, canonical JWT claims shape (`tenant_id`, `branch_id`, `user_role`, `position_code`) | Core types                |
| `packages/shared/src/auth/module-acl.ts`              | control_surface + module capability → allowed application roles, `canAccess()`                   | Route-level ACL           |
| `packages/shared/src/auth/permissions.ts`             | `PERMISSION_KEYS`, derived permission count, `hasPermission()`, `hasAny/All` pure fns          | Permission catalog mirror |
| `packages/shared/src/auth/scope.ts`                   | `extractClaims()` + `decodeJwtAppMetadata()` + `extractClaimsFromAccessToken()`                | JWT claim extraction      |
| `packages/shared/src/auth/route-resolution.ts`        | Public helpers + control_surface path classifier + URL → `ModuleKey` mapping                     | Proxy route mapping       |
| `packages/shared/src/auth/route-map.ts`               | Route family contract: surface, entry point, chrome, back behavior, breadcrumb root            | Navigation contract       |
| `packages/shared/src/auth/nav-config.ts`              | control_surface navigation and Branch navigation groups                                    | UI navigation             |
| `packages/shared/src/auth/app-discovery.ts`           | Shared app discovery metadata derived from ACL + nav config                                    | Shell discovery contract  |
| `packages/shared/src/auth/blocked-state.ts`           | Canonical blocked-state reasons, user-facing copy, `buildAccessDeniedPath()`                   | Access-state contract     |
| `apps/web/app/(public)/access-denied/page.tsx`        | Single presentation route for "authenticated but blocked" (renders copy from blocked-state)    | Access-state view         |
| `apps/web/app/_lib/auth.ts`                           | `loadAuthState()` — shared claims reader for layouts/pages; throws if proxy session/claims invariant violated; probes Auth liveness and redirects revoked zombie JWTs to `/api/auth/signout` | Layout claims + liveness helper |
| `apps/web/app/_lib/auth-session-liveness.ts`          | `probeAuthSessionLiveness()` — Auth `getUser` probe for protected RSC; redirect on revoke | Far-from-expiry zombie clear |
| `apps/web/proxy.ts`                                   | Next.js middleware — **single auth gate**: session + claims + module ACL + branch scope        | Request gateway           |
| `supabase/migrations/20260727120000_baseline.sql`     | `custom_access_token_hook()` — injects claims into JWT                                         | DB-level auth             |
| `supabase/migrations/20260727120000_baseline.sql`     | Auth core tables: `permission_keys`, `positions`, `role_templates`, `staff_permissions`        | Auth schema               |
| `supabase/migrations/20260727120000_baseline.sql`     | `has_permission(branch, key)` / `has_permission_any(key)` SECURITY DEFINER helpers             | Auth RLS helpers          |
| `supabase/migrations/*branch_ops_realtime_scope.sql`  | Active profile/branch authorization for private `branch:{id}:ops` topics                       | Realtime scope gate       |
| `apps/web/app/(protected)/hr/staff/[id]/permissions/` | HR UI for grant/revoke + audit (page + client + actions)                                       | Permission admin UI       |
| `apps/web/app/_lib/permissions.ts`                    | Server helper `currentUserHasPermission()`                                                     | App-side permission reads |

Discovery invariant: tenant-level navigation comes only from owner-filtered
`OWNER_NAV_GROUPS`. `MODULE_ACL.hr_payroll` still gates `/hr/payroll/*` for
Owner but remains a deep HR entry, not a primary control_surface card. Branch
Manager/Staff discovery contains Branch groups only.

## Role Hierarchy

```
owner                          ← governance + tenant-wide oversight, vận hành + catalog NL, procurement
├── accountant                 ← /finance + Inventory PO slice (D088; temporary until ADR 0015)
├── central_supply_ops         ← Kho Tổng site ops / GRN draft (D088; temporary until ADR 0015)
├── central_kitchen_lead       ← Bếp TT production + GRN draft (D088; temporary until ADR 0015)
├── branch_manager             ← single branch command + operations (no purchase-price view — D088)
├── cashier                    ← POS (/br/[branchId]/pos)
├── chef                       ← KDS (/br/[branchId]/kds)
└── branch_staff               ← branch runtime without POS/KDS specialty
```

These application roles are emitted in JWT `user_role`. They are derived from
`positions.code` through the mapper in shared auth and SQL. HR
display names live in `positions.label_vi` / `positions.label_en` and must not
gate authz. Unknown or retired position codes fail closed to `unassigned`.
D088 expands the set beyond the former five-role baseline; the three new roles
are JWT-role adapters and must migrate under ADR 0015 Authority. Runtime ACL,
login destinations, and role templates follow D088 Wave 1+; treat the tree above
as the live product contract until ADR 0015 replaces temporary JWT roles.

## RLS Gate Choice — Live Permission Grants vs JWT Role

Two DB-side gates exist; pick the right one:

- **`has_permission(branch_id, key)`** — queries `staff_permissions` live. Revoke is **immediate**. Use for destructive UPDATE/DELETE policies and any gate that must honor instant grant changes.
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
- **Owner identity has three separate meanings.** `tenants.representative` is a free-text legal-document name (TEXT, not UUID), `positions.code='owner'` is the current runtime owner-bypass / JWT role source, and `tenants.owner_user_id UUID NOT NULL` is the canonical owner auth identity column. Do not wire `representative` into auth. Do not add a dual-source `has_permission()` branch unless ADR 0005 is superseded by a new owner-gated decision.
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

| Concept              | Storage                                                                          | Purpose                                                                                                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Position**         | `positions` (per tenant) + `profiles.position_id`                                | HR chức vụ label. Codes are canonical English `lower_snake_case` ONLY — mapped by `POSITION_CODE_TO_STAFF_ROLE` (shared TS) / `private.staff_role_from_position_code` (SQL twin). Display via `label_vi`. Does not gate authz. |
| **Application role** | JWT `user_role`                                                                  | Canonical route role derived from `positions.code`. Feeds `MODULE_ACL` and route/default-home decisions. Not an action grant.                                                                                                  |
| **Permission**       | `permission_keys` catalog (global)                                               | Canonical action strings such as `inventory:read`, `pos:use`, `staff:assign_position`.                                                                                                                                         |
| **Grant**            | `staff_permissions(user_id, branch_id, permission_key, valid_from, valid_until)` | Source of truth for authz. `branch_id IS NULL` ⇒ tenant-wide. Temporal window.                                                                                                                                                 |
| **Template**         | `role_templates(permission_keys[])`                                              | Preset bundle applied when assigning a position (snapshot; edits don't propagate).                                                                                                                                             |

**Authz path (every request):** `proxy.ts` first classifies control_surface
routes and gates them through `canAccess(user_role, "owner")`, then
applies the resolved module capability ACL and Branch scope. Row-level authz
delegates to `has_permission(branch_id, key)` in RLS — owner bypass built-in,
temporal validity filtered, branch access explicit through grants or
`profiles.branch_id`.

**Grant/revoke** goes through SECURITY DEFINER RPCs that enforce caller must hold
`staff:assign_permission`:

- `grant_permission(target, branch, key, template?, valid_from?, valid_until?)`
- `revoke_permission(target, branch, key)`
- `apply_template_to_user(target, branch, template, valid_from?, valid_until?)`

Direct Data API access to `staff_permissions` is read-only for `authenticated`
and unavailable to `anon`; clients must use the RPCs above for every write. A
position or assigned-branch change through `update_staff_profile()` atomically
replaces the position baseline. Other grant lifecycle changes must be made
explicitly through legacy permission RPCs. Applying a different canonical template is a
supported additive exception: it adds capabilities but never changes the
profile position, canonical role, route surface, or branch scope. Owner review
is durable only when the matching `apply_template` audit row proves the grant
was Owner-applied. The canonical cleanup blocks unaudited exceptions until the
Owner explicitly revokes, then applies the intended template again. The Owner
template and Owner-only permission keys can never be delegated to staff.
`permission_keys.is_delegable_to_staff` is the fail-closed SSOT used by permission
checks, database writes, role templates, and the permission editor.

Audit coverage is not yet uniform: new grants and revocations write
`permission_audit_log`, while updating an existing row through
`grant_permission` does not currently append a new audit event.

Owner is protected: RPCs refuse to touch a user whose position code is `owner` (governed separately via `tenants.representative`).

## Legacy Permission Operations

| Operation               | API / table                                                               | Meaning                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Create auth user        | Admin API + `handle_new_user()`                                           | Creates identity, profile, position, branch/site claim seed. Does not grant ad-hoc permissions.                                         |
| Assign position         | `update_staff_profile(..., p_position_code := ..., p_branch_id := ...)`   | Owner-only assignment boundary. Position, branch, and active-state changes atomically replace legacy grants from the position template. |
| Grant permission        | `grant_permission(target, branch, key, ...)`                              | Adds one legacy permission grant. Branch-scoped keys require `branch_id`; tenant-scoped keys require `branch_id IS NULL`.               |
| Apply template          | `apply_template_to_user(target, branch, template, ...)`                   | Copies a template snapshot into `staff_permissions`; later template edits do not auto-propagate.                                        |
| Revoke permission       | `revoke_permission(target, branch, key)`                                  | Ends a legacy permission grant and writes audit.                                                                                        |
| Enter control_surface     | `proxy.ts` -> `isOwnerRoutePath()` -> `canAccess(user_role, "owner")`     | Owner-only surface admission before reusable module capabilities.                                                                       |
| Enter route/module      | `proxy.ts` -> `resolveModuleFromPath()` -> `canAccess(user_role, module)` | Fast module capability admission only.                                                                                                  |
| Execute action/read row | `withAction` / RPC body / RLS policy -> `has_permission*()`               | Authoritative action and data gate.                                                                                                     |

## HR Permission Contract

`/hr` is an Owner-only control_surface module. Daily staff runtime and Branch
Manager people oversight remain under `/br/[branchId]/*`, including
`/br/[branchId]/team` and shift/profile routes. Checkout and leave approval
routes are available to Owner and the assigned Branch Manager for that branch.

| HR operation                          | Route ACL                                                                            | Permission / action gate                                                                                | Server action / RPC                                                                                                                         | RLS / table boundary                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Staff access create/update/deactivate | `staff` -> owner-only `/hr/staff/*`                                                  | `hr:manage_employee` plus `staff:assign_position`                                                       | `createStaff`, `updateStaff`, `toggleStaffActive`; `update_staff_profile`, `toggle_profile_active`                                          | `profiles`, `positions`, `staff_permissions`; assignment changes atomically replace legacy grants |
| Permission grant/revoke/template      | `staff` -> owner-only `/hr/staff/[id]/permissions`                                   | `staff:assign_permission`                                                                               | `grantPermissionAction`, `revokePermissionAction`, `applyTemplateAction`; `grant_permission`, `revoke_permission`, `apply_template_to_user` | `staff_permissions`, `permission_audit_log`; scope must match key definition                      |
| Employee record, salary, HĐLĐ         | `hr` -> Owner-only control_surface                                                     | Owner writes tenant employee and contract data                                                          | `createEmployeeAccount`, `updateEmployee`, `fetchEmployees`; active contract write via `employment_contracts`                               | `employees`, `employment_contracts`, `profiles`                                                   |
| Global shift and position-task setup  | `hr` -> Owner-only control_surface                                                     | Owner-only action roles                                                                                 | `createShift`, `updateShift`, `deactivateShift`, `setShiftBoundaries`, `savePositionTasks`                                                  | `shifts` and `position_shift_tasks` are tenant/global setup, not Branch staff runtime             |
| Attendance and leave administration   | Owner: `/hr`; Owner + Branch Manager: `/br/[branchId]/shift/*-approvals`             | `hr:approve_leave_request`, `hr:approve_checkout`; Branch Manager grants must equal the assigned branch | `fetchAttendance`, `fetchAttendanceSummary`, `forceCloseStaleAttendance`, leave and checkout approval actions                               | RLS/RPC deny self-review, peer-manager review, and cross-branch review                            |
| Branch people visibility              | Branch Manager: `/br/[branchId]/team`; staff self-service under shift/profile routes | Branch-scoped `staff:view`                                                                              | Branch-safe employee, attendance, and leave projections                                                                                     | Read-only projection; no employee, contract, payroll, HĐLĐ, BHXH, or permission write             |

Branch Manager gets branch-safe employee, attendance, and leave visibility plus
same-branch checkout and leave approval. Tenant-wide HR setup, staff CRUD,
contracts, insurance, and payroll stay Owner-only.
| Payroll | `hr_payroll` -> owner-only `/hr/payroll/*` | `finance:payroll_calculate`, `finance:payroll_approve` | `createPayrollPeriod`, `calculatePayroll`, approve/payroll export actions; `upsert_payroll_calculation` | `payroll_periods`, `payroll_entries`; payroll writes stay atomic |

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
`has_permission(branch_id, key)`, and branch scope remains URL/JWT-derived.

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
5. **control_surface ACL:** `isOwnerRoutePath(pathname)` classifies the tenant management family; `canAccess(role, "owner")` gates it. Failure redirects to the role's Branch-first default route.
6. **Module capability ACL:** `resolveModuleFromPath(pathname)` maps URL → `ModuleKey`; `canAccess(role, moduleKey)` gates. Failure → `/access-denied?reason=insufficient-permission&from=<path>`, except control_surface routes redirect to the role's default route.
7. **Branch-scope for POS/KDS/branch settings/menu limits:** if a protected branch-scoped URL is not reachable for the user's branch assignment → `/access-denied?reason=branch-scope-mismatch`. POS/KDS and future protected Runner child routes reject missing, inactive, or non-operational branches in proxy. The exact public Runner display rejects invalid/non-operational branches inside the page because it has no staff claims.

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

| Failure                           | Signal                                                                                                | Recovery                                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| JWT hook returns no claims        | Generic login error + `console.error("auth.login.claims_missing", { user_id })` (post-2026-05-07 fix) | Check server logs for `user_id`. Verify `custom_access_token_hook` is SECURITY DEFINER + profile row exists + position_id resolves      |
| `getSession()` returns no session | Generic login error + `console.error("auth.login.no_session_after_signin")` + signOut                 | Cookie write failed mid-request. Inspect proxy `Set-Cookie` flow + browser cookie state                                                 |
| Upstash rate-limit unreachable    | `console.error("auth.login.rate_limit_failopen", { ip, error })` — login still proceeds (fail-open)   | Check Vercel log drain. Verify Upstash health (`UPSTASH_REDIS_REST_URL`). Persistent `security_events` table tracking is follow-up wave |
| RLS blocks silently               | `{ data: null, error: null }` — no error thrown                                                       | Check GRANT + RLS policy for the table                                                                                                  |
| Role not in MODULE_ACL            | `canAccess()` returns false, user redirected                                                          | Add role to MODULE_ACL for the module                                                                                                   |
| Stale JWT after role change       | Old role persists until token refresh                                                                 | Call `supabase.auth.refreshSession()` or wait for proxy `updateSession()`                                                               |
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
