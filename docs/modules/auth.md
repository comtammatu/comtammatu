# Auth & ACL Module

> **Current auth contract:** Position (HR chức vụ) is separated from Permission (quyền truy cập). Authz runs against a normalized `staff_permissions(user_id, branch_id, permission_key, valid_from, valid_until)` table, gated by RLS via `has_permission(branch_id, key)`. Legacy role strings (`branch_manager`, `cashier`, …) are still emitted in JWT as `user_role` for backward compat — they're derived from `positions.code mapper`. Runtime code must not depend on `profiles.role` or `staff_role`.

## Overview

Authentication and authorization for staff/operator surfaces. Protected requests pass through this module before reaching feature code. The auth chain spans four layers: Supabase Auth (identity), JWT custom claims hook (position + legacy-role injection), proxy.ts (route-level ACL enforcement), and RLS with `has_permission()` (row-level, permission-driven). Public customer surfaces such as `/br/[branchId]/runner` bypass staff login by design.

**Owner:** `packages/shared/src/auth/` + `apps/web/proxy.ts` + `supabase/migrations/00000000000000_baseline.sql` + `supabase/migrations/*auth*`

Canonical role/scope/route boundaries live in `docs/spec/role-route-matrix.md`.
`module-acl.ts` remains the runtime route fast-gate source of truth; route,
navigation, and default-landing changes must keep the spec, `module-acl.ts`,
`route-map.ts`, and auth tests in sync.

## Layer Meanings

Do not use Auth, ACL, PBAC, and RLS interchangeably. They answer different
questions:

| Layer                         | Source of truth                                                                 | Owns                                                                                  | Does not own                                                            |
| ----------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Auth identity                 | Supabase Auth + `profiles` + `positions`                                        | Who the signed-in user is, tenant/site assignment, active HR position                  | Route admission, action permission, row visibility                       |
| Access bucket / route ACL     | `positions.code` mapper -> JWT `user_role`; `packages/shared/src/auth/module-acl.ts` | Whether a bucket can enter a module or route family                                    | Whether a button/action is allowed; whether DB rows are readable/writable |
| PBAC permission grants        | `permission_keys`, `staff_permissions`, `role_templates`                        | Whether a user can perform an action, with branch/tenant scope and validity window     | Navigation, default home, HR display labels                              |
| Server action / RPC gate      | `withAction`, `withFormAction`, direct RPC checks                               | Zod input validation, action-level roles + permission checks, atomic mutation boundary | Replacing RLS                                                            |
| RLS                           | Postgres policies + `has_permission()` / `has_permission_any()`                 | Final row-level enforcement for PostgREST/Data API access                             | UI affordances, route taxonomy, staff management semantics               |
| Private Branch Realtime topic | Realtime RLS + `can_read_branch_ops(branch_id)`                                      | Active Owner tenant scope or active non-Owner assigned-branch subscription scope       | Granting business actions or widening scope through `staff_permissions`   |

Vocabulary rule: `position_code` is the HR position; `user_role` /
`access_bucket` is the compatibility route bucket; `permission_key` is the PBAC
action string. A department or position is not a route role unless the mapper
explicitly derives a bucket from it.

## Components

| File                                                  | Purpose                                                                                        | Lines                     |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------- |
| `packages/shared/src/auth/types.ts`                   | Role enum, JWT claims shape (`user_role` + optional `position`), scope types                   | Core types                |
| `packages/shared/src/auth/module-acl.ts`              | Module → allowed access buckets mapping, `canAccess()`                                         | Route-level ACL           |
| `packages/shared/src/auth/permissions.ts`             | `PERMISSION_KEYS`, derived permission count, `hasPermission()`, `hasAny/All` pure fns           | Permission catalog mirror |
| `packages/shared/src/auth/scope.ts`                   | `extractClaims()` + `decodeJwtAppMetadata()` + `extractClaimsFromAccessToken()`                | JWT claim extraction      |
| `packages/shared/src/auth/route-resolution.ts`        | Public route helpers + URL → `ModuleKey` mapping                                               | Proxy route mapping       |
| `packages/shared/src/auth/route-map.ts`               | Route family contract: surface, entry point, chrome, back behavior, breadcrumb root            | Navigation contract       |
| `packages/shared/src/auth/nav-config.ts`              | Admin sidebar navigation groups filtered by role                                               | UI navigation             |
| `packages/shared/src/auth/app-discovery.ts`           | Shared app discovery metadata derived from ACL + nav config                                    | Shell discovery contract  |
| `packages/shared/src/auth/blocked-state.ts`           | Canonical blocked-state reasons, user-facing copy, `buildAccessDeniedPath()`                   | Access-state contract     |
| `apps/web/app/(public)/access-denied/page.tsx`        | Single presentation route for "authenticated but blocked" (renders copy from blocked-state)    | Access-state view         |
| `apps/web/app/_lib/auth.ts`                           | `loadAuthState()` — shared claims reader for layouts/pages; throws if proxy invariant violated | Layout claims helper      |
| `apps/web/proxy.ts`                                   | Next.js middleware — **single auth gate**: session + claims + module ACL + branch scope        | Request gateway           |
| `supabase/migrations/00000000000000_baseline.sql`     | `custom_access_token_hook()` — injects claims into JWT                                         | DB-level auth             |
| `supabase/migrations/00000000000000_baseline.sql`     | Auth core tables: `permission_keys`, `positions`, `role_templates`, `staff_permissions`        | Auth schema               |
| `supabase/migrations/00000000000000_baseline.sql`     | `has_permission(branch, key)` / `has_permission_any(key)` SECURITY DEFINER helpers             | Auth RLS helpers          |
| `supabase/migrations/*branch_ops_realtime_scope.sql`  | Active profile/branch authorization for private `branch:{id}:ops` topics                       | Realtime scope gate       |
| `apps/web/app/(protected)/hr/staff/[id]/permissions/` | HR UI for grant/revoke + audit (page + client + actions)                                       | Permission admin UI       |
| `apps/web/app/_lib/permissions.ts`                    | Server helper `currentUserHasPermission()`                                                    | App-side permission reads |

Discovery invariant: `MODULE_ACL.hr_payroll` still gates `/hr/payroll/*` for
owner, but is not part of `DOMAIN_WORKSPACE_ITEMS` or default app
discovery. HKD operation opens `/hr` for staff/shifts/workdays first;
payroll is direct-support only, for reconciling/finalizing pay when needed.

## Role Hierarchy

```
owner                          ← governance + tenant-wide oversight, vận hành + catalog NL, procurement
├── branch_manager             ← single branch command + operations
├── cashier                    ← POS (/br/[branchId]/pos)
├── chef                       ← KDS (/br/[branchId]/kds)
└── branch_staff               ← branch runtime without POS/KDS specialty
```

These compatibility access buckets are emitted in JWT `user_role`. They are
derived from `positions.code` through the mapper in shared auth and SQL. HR
display names live in `positions.label_vi` / `positions.label_en` and must not
gate authz. Unknown or retired position codes fail closed to `unassigned`.

## RLS Gate Choice — Live PBAC vs JWT Bucket

Two DB-side gates exist; pick the right one:

- **`has_permission(branch_id, key)`** — queries `staff_permissions` live. Revoke is **immediate**. Use for destructive UPDATE/DELETE policies and any gate that must honor instant grant changes.
- **`auth_role()`** — reads JWT `user_role` claim (cached up to ~1h until token refresh). Use ONLY for: (a) scope/side guards inside RPC bodies (e.g. `branch_manager` forbidden from inter-site ship), (b) "tenant sees all branches" SELECT pattern (`branch_id = auth_branch_id() OR auth_role() IN HQ_ROLES`), (c) named ABAC helpers (`is_inventory_production_operator()`), (d) module-ACL fast-path on non-destructive read-mostly tables (e.g. `branch_menu_item_daily_limits` — see regression rule `BMIDL-RLS-INTENTIONAL-ROLE-FASTPATH`).

**ACL contract notes:**

- `refunds_update` uses `has_permission(branch_id,'orders:refund_approve')`; destructive refund approval must not depend on cached `auth_role()`.
- `admin_update_profile` and `toggle_profile_active` derive actor role and branch live from `profiles + positions`; `set_branch_kind` gates on `settings:tenant`.
- Branch-scope RPCs keep the branch predicate at the write boundary unless a shared helper is active in both policy and RPC surfaces.
- `hr_payroll` policy scope is handled with the HRM payroll/base-salary work; do not add payroll permission keys outside that task.

## Invariants (post H3a, 2026-05-07)

- **`profiles.position_id` is NOT NULL** + FK `ON DELETE RESTRICT`. Every active or inactive profile MUST point to a seeded position in its tenant. Enforced in `supabase/migrations/00000000000000_baseline.sql`.
  - `handle_new_user` trigger raises `position_not_resolved` (SQLSTATE P0001) if `raw_app_meta_data->>'role'` does not map to a seeded position — signup fails loudly instead of inserting a broken profile.
  - `admin_update_profile` raises the same exception if a manager passes a role that does not resolve to a position for the tenant.
  - Deleting a position with active profiles raises `foreign_key_violation` (SQLSTATE 23503). Admins must reassign profiles before deleting.
- **Owner identity has three separate meanings.** `tenants.representative` is a free-text legal-document name (TEXT, not UUID), `positions.code='owner'` is the current runtime owner-bypass / JWT role source, and `tenants.owner_user_id UUID NOT NULL` is the canonical owner auth identity column. Do not wire `representative` into auth. Do not add a dual-source `has_permission()` branch unless ADR 0005 is superseded by a new owner-gated decision.
- **Private Branch Realtime follows live assignment, not PBAC breadth.**
  `can_read_branch_ops(branch_id)` requires an active profile and active target
  branch in the caller's tenant. An active Owner may subscribe across active
  tenant branches; every non-Owner may subscribe only to `profiles.branch_id`.
  A branch-scoped or tenant-wide `staff_permissions` row must never widen this
  transport audience. Supabase caches Realtime authorization for the connection,
  so a profile or branch deactivation is enforced when the channel next
  authorizes, receives a refreshed JWT, or reconnects; this function is not a
  targeted socket-disconnect mechanism.

## Auth — Position vs Permission

| Concept        | Storage                                                                          | Purpose                                                                                                                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Position**   | `positions` (per tenant) + `profiles.position_id`                                | HR chức vụ label. Codes are canonical English `lower_snake_case` ONLY — mapped by `POSITION_CODE_TO_STAFF_ROLE` (shared TS) / `private.staff_role_from_position_code` (SQL twin). Display via `label_vi`. Does not gate authz. |
| **Access bucket** | JWT `user_role` / `access_bucket`                                             | Compatibility route bucket derived from `positions.code`. Feeds `MODULE_ACL` and route/default-home decisions. Not an action grant.                                                                                             |
| **Permission** | `permission_keys` catalog (global)                                               | Canonical action strings such as `inventory:read`, `pos:use`, `staff:assign_position`.                                                                                                                                         |
| **Grant**      | `staff_permissions(user_id, branch_id, permission_key, valid_from, valid_until)` | Source of truth for authz. `branch_id IS NULL` ⇒ tenant-wide. Temporal window.                                                                                                                                                 |
| **Template**   | `role_templates(permission_keys[])`                                              | Preset bundle applied when assigning a position (snapshot; edits don't propagate).                                                                                                                                             |

**Authz path (every request):** `proxy.ts` still does route-level module ACL via `canAccess(user_role, module)` as the fast gate. Row-level authz delegates to `has_permission(branch_id, key)` in RLS — owner bypass built-in, temporal validity filtered, branch access explicit through grants or `profiles.branch_id`.

**Grant/revoke** goes through SECURITY DEFINER RPCs that enforce caller must hold `staff:assign_permission` and log every change to `permission_audit_log`:

- `grant_permission(target, branch, key, template?, valid_from?, valid_until?)`
- `revoke_permission(target, branch, key)`
- `apply_template_to_user(target, branch, template, valid_from?, valid_until?)`

Owner is protected: RPCs refuse to touch a user whose position code is `owner` (governed separately via `tenants.representative`).

## PBAC Operations

| Operation           | API / table                                                              | Meaning                                                                                  |
| ------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Create auth user    | Admin API + `handle_new_user()`                                          | Creates identity, profile, position, branch/site claim seed. Does not grant ad-hoc permissions. |
| Assign position     | `admin_update_profile(..., p_role := position_code, p_branch_id := ...)` | Changes HR position and derived route bucket. Requires `staff:manage`; position/branch changes also require `staff:assign_position`. |
| Grant permission    | `grant_permission(target, branch, key, ...)`                             | Adds one PBAC grant. Branch-scoped keys require `branch_id`; tenant-scoped keys require `branch_id IS NULL`. |
| Apply template      | `apply_template_to_user(target, branch, template, ...)`                  | Copies a template snapshot into `staff_permissions`; later template edits do not auto-propagate. |
| Revoke permission   | `revoke_permission(target, branch, key)`                                  | Ends a PBAC grant and writes audit.                                                       |
| Enter route/module  | `proxy.ts` -> `resolveModuleFromPath()` -> `canAccess(user_role, module)` | Fast route admission only.                                                               |
| Execute action/read row | `withAction` / RPC body / RLS policy -> `has_permission*()`           | Authoritative action and data gate.                                                      |

## HR Permission Contract

`/hr` is a management workspace. Daily staff runtime remains under
`/br/[branchId]/shift/*` and `/br/[branchId]/profile/*`.

| HR operation | Route ACL | PBAC / action gate | Server action / RPC | RLS / table boundary |
| ------------ | --------- | ------------------ | ------------------- | -------------------- |
| Staff access create/update/deactivate | `staff` -> owner-only `/hr/staff/*` | `staff:manage`, plus `staff:assign_position` when position/branch changes | `createStaff`, `updateStaff`, `toggleStaffActive`; `admin_update_profile`, `toggle_profile_active` | `profiles`, `positions`, `staff_permissions`; RPCs enforce role hierarchy and branch containment |
| Permission grant/revoke/template | `staff` -> owner-only `/hr/staff/[id]/permissions` | `staff:assign_permission` | `grantPermissionAction`, `revokePermissionAction`, `applyTemplateAction`; `grant_permission`, `revoke_permission`, `apply_template_to_user` | `staff_permissions`, `permission_audit_log`; scope must match key definition |
| Employee record, salary, HĐLĐ | `hr` -> owner + branch_manager | Owner writes; branch_manager reads own-branch safe subset only | `createEmployeeAccount`, `updateEmployee`, `fetchEmployees`; active contract write via `employment_contracts` | `employees`, `employment_contracts`, `profiles`; branch_manager payload excludes compensation, ID, and bank-account fields |
| Global shift and position-task setup | `hr` -> owner + branch_manager workspace, owner-only mutation UI | Owner-only action roles | `createShift`, `updateShift`, `deactivateShift`, `setShiftBoundaries`, `savePositionTasks` | `shifts` and `position_shift_tasks` are tenant/global setup, not branch staff runtime |
| Attendance and leave oversight | `hr` -> owner + branch_manager | Branch-safe gates: `hr:approve_leave_request`, `hr:view_employee`, `staff:manage` with branch containment | `fetchAttendance`, `fetchAttendanceSummary`, `getAttendancePhotoUrl`, `forceCloseStaleAttendance`, leave approval actions | `attendance_records`, `leave_requests`; branch_manager must stay inside own branch |
| Payroll | `hr_payroll` -> owner-only `/hr/payroll/*` | `finance:payroll_calculate`, `finance:payroll_approve` | `createPayrollPeriod`, `calculatePayroll`, approve/payroll export actions; `upsert_payroll_calculation` | `payroll_periods`, `payroll_entries`; payroll writes stay atomic |

## Auth Flow

1. User submits credentials at `/login` (`apps/web/app/(public)/(auth)/login/actions.ts`)
2. Server action calls `supabase.auth.signInWithPassword()`
3. Supabase fires `custom_access_token_hook()` — SECURITY DEFINER
4. Hook reads `profiles` + `positions`, injects `{tenant_id, branch_id, user_role, access_bucket, position, position_code}` into JWT `app_metadata`. `user_role` / `access_bucket` derive from `positions.code`; `position` is the HR code.
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

Settings boundary: tenant setup under `/admin/settings/*` is owner-only; branch
setup under `/br/[branchId]/settings/*` uses branch-scoped route families and
permission enforcement.
## Proxy Routing Logic — Single Gate

`apps/web/proxy.ts` is the **only** file that runs staff auth / ACL / branch-scope redirects. Layouts and pages for protected surfaces trust the proxy; they call `loadAuthState()` (`apps/web/app/_lib/auth.ts`) to read claims but never re-check them. If anything below is missing on a protected surface, the proxy has a gap — not the layout.

The `proxy(request)` function evaluates in order:

1. **Public paths bypass auth:** `/api/health`, `/api/webhooks`, `/sw.js`, `/access-denied`, `/payment/momo/*`, and exact `/br/[branchId]/runner` (`route-resolution.ts:isPublicAppPath`). The access-denied page is public so a blocked-but-authenticated user can read the copy without re-entering the ACL loop.
2. **Login page:** authenticated users bounce to `resolvePostLoginRedirect(claims, returnTo)`; unauthenticated users see the form.
3. **Unauthenticated → `/login`**.
4. **Claims extraction:** if `extractClaims()` returns null, proxy redirects to `/access-denied?reason=missing-auth-context&from=<path>`. Proxy **does not** fabricate claims.
5. **Module ACL:** `resolveModuleFromPath(pathname)` maps URL → `ModuleKey`; `canAccess(role, moduleKey)` gates. Failure → `/access-denied?reason=insufficient-permission&from=<path>`, except disallowed Admin URLs redirect to the role's default route.
6. **Branch-scope for POS/KDS/branch settings/menu limits:** if a protected branch-scoped URL is not reachable for the user's branch assignment → `/access-denied?reason=branch-scope-mismatch`. POS/KDS and future protected Runner child routes reject missing, inactive, or non-operational branches in proxy. The exact public Runner display rejects invalid/non-operational branches inside the page because it has no staff claims.

The resolver `resolvePostLoginRedirect(claims, returnTo)` (`packages/shared/src/auth/scope.ts`) is the **single** post-login destination function. The underlying ACL + branch-scope rules are shared. Unit tests live in `packages/shared/src/auth/__tests__/scope.test.ts` (run `pnpm --filter @comtammatu/shared test`).

Root `/` uses the same shared default resolver as post-login fallback. Branch
Manager lands on the branch operator hub `/br/{branchId}` by default. Branch
Command remains a branch-scoped management route opened from operator tools or
direct links.

### Invariant

> _After `proxy()` returns on a protected path, any layout or page downstream can assume: the user is authenticated, claims are valid, the role has module access, and — for protected branch-scoped `/br/[branchId]/*` surfaces — branch scope matches._

`loadAuthState()` throws if the invariant is violated. This surfaces proxy gaps via `error.tsx` rather than masking them with silent redirects.

## Failure Modes

| Failure                           | Signal                                                                                                | Recovery                                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| JWT hook returns no claims        | Generic login error + `console.error("auth.login.claims_missing", { user_id })` (post-2026-05-07 fix) | Check server logs for `user_id`. Verify `custom_access_token_hook` is SECURITY DEFINER + profile row exists + position_id resolves      |
| `getSession()` returns no session | Generic login error + `console.error("auth.login.no_session_after_signin")` + signOut                 | Cookie write failed mid-request. Inspect proxy `Set-Cookie` flow + browser cookie state                                                 |
| Upstash rate-limit unreachable    | `console.error("auth.login.rate_limit_failopen", { ip, error })` — login still proceeds (fail-open)   | Check Vercel log drain. Verify Upstash health (`UPSTASH_REDIS_REST_URL`). Persistent `security_events` table tracking is follow-up wave |
| RLS blocks silently               | `{ data: null, error: null }` — no error thrown                                                       | Check GRANT + RLS policy for the table                                                                                                  |
| Role not in MODULE_ACL            | `canAccess()` returns false, user redirected                                                          | Add role to MODULE_ACL for the module                                                                                                   |
| Stale JWT after role change       | Old role persists until token refresh                                                                 | Call `supabase.auth.refreshSession()` or wait for proxy `updateSession()`                                                               |

> **Login error consolidation (2026-05-07):** All post-validation failure modes (wrong creds, no session, no claims) return the same generic Vietnamese copy `"Email hoặc mật khẩu không đúng"` to prevent credential-validity enumeration. Distinguishing context lives only in structured server logs. See regression rule `LOGIN-MESSAGE-MUST-BE-GENERIC` and `apps/web/app/(public)/(auth)/login/actions.ts`.

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
- Uses Má Tư DS `Card` + `Button` primitives (follows **NO-FAKE-PRIMITIVES**).
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
- **Single gate = proxy:** layouts and pages must not re-check session/claims/ACL. `loadAuthState()` throws (not redirects) if claims are missing; proxy remains the only route gate.
- **Invite-only (no self-signup):** Business requirement — staff are added by managers via Admin API with pre-set `tenant_id` + `role`.
