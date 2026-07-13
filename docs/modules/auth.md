# Auth & ACL Module

> **Current auth contract:** Position (HR chức vụ) is separated from Permission (quyền truy cập). Authz runs against a normalized `staff_permissions(user_id, branch_id, permission_key, valid_from, valid_until)` table, gated by RLS via `has_permission(branch_id, key)`. Legacy role strings (`branch_manager`, `cashier`, …) are still emitted in JWT as `user_role` for backward compat — they're derived from `positions.code mapper`. Runtime code must not depend on `profiles.role` or `staff_role`.

## Overview

Authentication and authorization for staff/operator surfaces. Protected requests
pass through this module before reaching feature code. Inside `proxy.ts`, route
surface audience is enforced separately from reusable module capability before
RLS applies permission-driven row gates. Public customer surfaces such as
Self-Order bypass staff login by design.

**Owner:** `packages/shared/src/auth/` + `apps/web/proxy.ts` + `supabase/migrations/00000000000000_baseline.sql` + `supabase/migrations/*auth*`

Canonical role/scope/route boundaries live in `docs/spec/role-route-matrix.md`.
Final route admission combines two contracts: `route-map.ts` owns plane audience,
while `module-acl.ts` owns reusable module capability. Route, navigation, and
default-landing changes must keep both contracts, the spec, and auth tests in
sync.

## Layer Meanings

Do not use Auth, ACL, PBAC, and RLS interchangeably. They answer different
questions:

| Layer                      | Source of truth                                                                      | Owns                                                                                   | Does not own                                               |
| -------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Auth identity              | Supabase Auth + `profiles` + `positions`                                             | Who the signed-in user is, tenant/site assignment, active HR position                  | Route admission, action permission, row visibility         |
| Route surface audience     | `packages/shared/src/auth/route-map.ts`; `canAccessRouteSurface()`                   | Whether a role may enter `admin_dashboard`, `branch`, or a public boundary             | Reusable module/action capability or row visibility        |
| Access bucket / capability | `positions.code` mapper -> JWT `user_role`; `packages/shared/src/auth/module-acl.ts` | Whether a bucket has a reusable module capability                                      | Final route audience, action permission, or row visibility |
| PBAC permission grants     | `permission_keys`, `staff_permissions`, `role_templates`                             | Whether a user can perform an action, with branch/tenant scope and validity window     | Navigation, default home, HR display labels                |
| Server action / RPC gate   | `withAction`, `withFormAction`, direct RPC checks                                    | Zod input validation, action-level roles + permission checks, atomic mutation boundary | Replacing RLS                                              |
| RLS                        | Postgres policies + `has_permission()` / `has_permission_any()`                      | Final row-level enforcement for PostgREST/Data API access                              | UI affordances, route taxonomy, staff management semantics |

Vocabulary rule: `position_code` is the HR position; `user_role` /
`access_bucket` is the compatibility route bucket; `permission_key` is the PBAC
action string. A department or position is not a route role unless the mapper
explicitly derives a bucket from it.

## Components

| File                                                  | Purpose                                                                                        | Lines                     |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------- |
| `packages/shared/src/auth/types.ts`                   | Role enum, JWT claims shape (`user_role` + optional `position`), scope types                   | Core types                |
| `packages/shared/src/auth/module-acl.ts`              | Reusable module → allowed access buckets mapping, `canAccess()`                                | Capability fast gate      |
| `packages/shared/src/auth/permissions.ts`             | `PERMISSION_KEYS`, derived permission count, `hasPermission()`, `hasAny/All` pure fns          | Permission catalog mirror |
| `packages/shared/src/auth/scope.ts`                   | `extractClaims()` + `decodeJwtAppMetadata()` + `extractClaimsFromAccessToken()`                | JWT claim extraction      |
| `packages/shared/src/auth/route-resolution.ts`        | Public route helpers + URL → `ModuleKey` mapping                                               | Proxy route mapping       |
| `packages/shared/src/auth/route-map.ts`               | Route family contract + plane audience through `canAccessRouteSurface()`                       | Surface access contract   |
| `packages/shared/src/auth/nav-config.ts`              | Admin sidebar navigation groups filtered by role                                               | UI navigation             |
| `packages/shared/src/auth/app-discovery.ts`           | Shared app discovery metadata derived from ACL + nav config                                    | Shell discovery contract  |
| `packages/shared/src/auth/blocked-state.ts`           | Canonical blocked-state reasons, user-facing copy, `buildAccessDeniedPath()`                   | Access-state contract     |
| `apps/web/app/(public)/access-denied/page.tsx`        | Single presentation route for "authenticated but blocked" (renders copy from blocked-state)    | Access-state view         |
| `apps/web/app/_lib/auth.ts`                           | `loadAuthState()` — shared claims reader for layouts/pages; throws if proxy invariant violated | Layout claims helper      |
| `apps/web/proxy.ts`                                   | Next.js middleware — **single auth gate**: session + claims + surface + capability + scope     | Request gateway           |
| `supabase/migrations/00000000000000_baseline.sql`     | `custom_access_token_hook()` — injects claims into JWT                                         | DB-level auth             |
| `supabase/migrations/00000000000000_baseline.sql`     | Auth core tables: `permission_keys`, `positions`, `role_templates`, `staff_permissions`        | Auth schema               |
| `supabase/migrations/00000000000000_baseline.sql`     | `has_permission(branch, key)` / `has_permission_any(key)` SECURITY DEFINER helpers             | Auth RLS helpers          |
| `apps/web/app/(protected)/hr/staff/[id]/permissions/` | HR UI for grant/revoke + audit (page + client + actions)                                       | Permission admin UI       |
| `apps/web/app/_lib/permissions.ts`                    | Server helper `currentUserHasPermission()`                                                     | App-side permission reads |

Discovery invariant: only Owner discovers Admin Dashboard groups. `/hr` and
`/hr/payroll/*` are Owner-only Admin Dashboard routes; Branch Manager works
through Branch `Hôm nay`, `Đội ngũ`, and leave-approval routes instead. Payroll
remains direct-support only and is not part of default discovery.

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

- `orders:refund`, `orders:refund_approve`, and `pos:void_paid_order` are
  Owner-reserved permission keys: `has_permission*()` ignores staff grants for
  them, and refund RLS uses live `auth_is_owner(auth.uid())`. Refund control must
  not depend on cached `auth_role()`.
- Refund creation, queue review, and approval remain Owner controls in Admin
  Dashboard. Branch Orders exposes active/recent orders and order detail, not a
  refund queue.
- Attendance history and check-in photo review remain Owner-only oversight for
  now. Branch exposes today's work, team context, and approval workflows without
  that historical/photo oversight surface.
- `admin_update_profile` and `toggle_profile_active` derive actor role and branch live from `profiles + positions`; `set_branch_kind` gates on `settings:tenant`.
- Branch-scope RPCs keep the branch predicate at the write boundary unless a shared helper is active in both policy and RPC surfaces.
- `hr_payroll` policy scope is handled with the HRM payroll/base-salary work; do not add payroll permission keys outside that task.

## Invariants (post H3a, 2026-05-07)

- **`profiles.position_id` is NOT NULL** + FK `ON DELETE RESTRICT`. Every active or inactive profile MUST point to a seeded position in its tenant. Enforced in `supabase/migrations/00000000000000_baseline.sql`.
  - `handle_new_user` trigger raises `position_not_resolved` (SQLSTATE P0001) if `raw_app_meta_data->>'role'` does not map to a seeded position — signup fails loudly instead of inserting a broken profile.
  - `admin_update_profile` raises the same exception if a manager passes a role that does not resolve to a position for the tenant.
  - Deleting a position with active profiles raises `foreign_key_violation` (SQLSTATE 23503). Admins must reassign profiles before deleting.
- **Owner identity has three separate meanings.** `tenants.representative` is a free-text legal-document name (TEXT, not UUID), `positions.code='owner'` is the current runtime owner-bypass / JWT role source, and `tenants.owner_user_id UUID NOT NULL` is the canonical owner auth identity column. Do not wire `representative` into auth. Do not add a dual-source `has_permission()` branch unless ADR 0005 is superseded by a new owner-gated decision.

## Auth — Position vs Permission

| Concept           | Storage                                                                          | Purpose                                                                                                                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Position**      | `positions` (per tenant) + `profiles.position_id`                                | HR chức vụ label. Codes are canonical English `lower_snake_case` ONLY — mapped by `POSITION_CODE_TO_STAFF_ROLE` (shared TS) / `private.staff_role_from_position_code` (SQL twin). Display via `label_vi`. Does not gate authz. |
| **Access bucket** | JWT `user_role` / `access_bucket`                                                | Compatibility bucket derived from `positions.code`. Feeds both route-surface and module-capability decisions. Not an action grant.                                                                                             |
| **Permission**    | `permission_keys` catalog (global)                                               | Canonical action strings such as `inventory:read`, `pos:use`, `staff:assign_position`.                                                                                                                                         |
| **Grant**         | `staff_permissions(user_id, branch_id, permission_key, valid_from, valid_until)` | Source of truth for authz. `branch_id IS NULL` ⇒ tenant-wide. Temporal window.                                                                                                                                                 |
| **Template**      | `role_templates(permission_keys[])`                                              | Preset bundle applied when assigning a position (snapshot; edits don't propagate).                                                                                                                                             |

**Authz path (every request):** `proxy.ts` first resolves the route family and
calls `canAccessRouteSurface(user_role, surface)`, then applies reusable module
capability through `canAccess(user_role, module)`. Row-level authz delegates to
`has_permission(branch_id, key)` in RLS — owner bypass built-in, temporal
validity filtered, branch access explicit through grants or
`profiles.branch_id`.

**Grant/revoke** goes through SECURITY DEFINER RPCs that enforce caller must hold `staff:assign_permission` and log every change to `permission_audit_log`:

- `grant_permission(target, branch, key, template?, valid_from?, valid_until?)`
- `revoke_permission(target, branch, key)`
- `apply_template_to_user(target, branch, template, valid_from?, valid_until?)`

Owner is protected: RPCs refuse to touch a user whose position code is `owner` (governed separately via `tenants.representative`).

## PBAC Operations

| Operation               | API / table                                                              | Meaning                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Create auth user        | Admin API + `handle_new_user()`                                          | Creates identity, profile, position, branch/site claim seed. Does not grant ad-hoc permissions.                                      |
| Assign position         | `admin_update_profile(..., p_role := position_code, p_branch_id := ...)` | Changes HR position and derived route bucket. Requires `staff:manage`; position/branch changes also require `staff:assign_position`. |
| Grant permission        | `grant_permission(target, branch, key, ...)`                             | Adds one PBAC grant. Branch-scoped keys require `branch_id`; tenant-scoped keys require `branch_id IS NULL`.                         |
| Apply template          | `apply_template_to_user(target, branch, template, ...)`                  | Copies a template snapshot into `staff_permissions`; later template edits do not auto-propagate.                                     |
| Revoke permission       | `revoke_permission(target, branch, key)`                                 | Ends a PBAC grant and writes audit.                                                                                                  |
| Enter route/module      | `proxy.ts` -> route surface gate -> `canAccess(user_role, module)`       | Final route audience plus reusable capability fast gates.                                                                            |
| Execute action/read row | `withAction` / RPC body / RLS policy -> `has_permission*()`              | Authoritative action and data gate.                                                                                                  |

## HR Permission Contract

`/hr` is an Owner-only Admin Dashboard workspace. Branch Manager and Staff use
Branch routes for daily work; shared loaders/actions may still reuse the same
module capabilities, but that reuse does not grant access to `/hr`.

| HR operation                          | Route audience                                                                                                    | PBAC / action gate                                                        | Data / action boundary                                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Staff access create/update/deactivate | Owner-only `/hr/staff/*`                                                                                          | `staff:manage`, plus `staff:assign_position` when position/branch changes | Admin RPCs enforce role hierarchy and branch containment                                               |
| Permission grant/revoke/template      | Owner-only `/hr/staff/[id]/permissions`                                                                           | `staff:assign_permission`                                                 | `staff_permissions` + `permission_audit_log`; scope must match key definition                          |
| Employee record, salary, HĐLĐ         | Owner-only `/hr/*`                                                                                                | Owner action roles and relevant HR/finance permissions                    | Compensation, identity, bank, and contract fields never enter Branch payloads                          |
| Global shift and position-task setup  | Owner-only `/hr/*`                                                                                                | Owner-only action roles                                                   | Tenant/global setup remains outside the Branch daily plane                                             |
| Attendance history and check-in photo | Owner-only `/hr/*` for now                                                                                        | Owner oversight permissions                                               | `fetchAttendance*`, `getAttendancePhotoUrl`, and stale-record controls stay out of Branch presentation |
| Today, team, and leave approvals      | Branch `/br/[branchId]/shift/*`, `/br/[branchId]/team`, `/br/[branchId]/shift/leave-approvals` for Owner/BM/Staff | Branch-safe read/approval permissions with branch containment             | Branch payloads stay within the route branch and omit Owner-only HR fields                             |
| Payroll                               | Owner-only `/hr/payroll/*`                                                                                        | `finance:payroll_calculate`, `finance:payroll_approve`                    | Payroll writes remain atomic                                                                           |

## Auth Flow

1. User submits credentials at `/login` (`apps/web/app/(public)/(auth)/login/actions.ts`)
2. Server action calls `supabase.auth.signInWithPassword()`
3. Supabase fires `custom_access_token_hook()` — SECURITY DEFINER
4. Hook reads `profiles` + `positions`, injects `{tenant_id, branch_id, user_role, access_bucket, position, position_code}` into JWT `app_metadata`. `user_role` / `access_bucket` derive from `positions.code`; `position` is the HR code.
5. JWT returned to client, stored in cookies via `@supabase/ssr`
6. Every subsequent request:
   - Proxy calls `updateSession()` → `extractClaimsFromAccessToken(session.access_token)` → `canAccessRouteSurface(user_role, surface)` → `canAccess(user_role, module)`
   - RLS on any DB access: `has_permission(branch_id, key)` checks `staff_permissions` (row gate)

**IMPORTANT:** `user.app_metadata` from supabase-js reads the `auth.users` row, which does **not** include hook-injected claims. Always use `extractClaimsFromAccessToken(session.access_token)` when you need `position`. See regression rule `JWT-CLAIMS-NOT-IN-APP-METADATA`.

## ACL Matrix

`packages/shared/src/auth/route-map.ts` owns route-family surface audience;
`packages/shared/src/auth/module-acl.ts` owns reusable module capability.
`docs/spec/role-route-matrix.md` is their generated human-readable view. Inventory
action roles live in `packages/shared/src/auth/inventory-roles.ts`, while
permission keys and RLS/RPC checks own mutation authority. Do not maintain
another role matrix or workflow summary here.

Surface audience and module capability are fast gates. Row-level authorization
uses `has_permission(branch_id, key)`, and branch scope remains URL/JWT-derived.

Settings boundary: tenant setup under `/admin/settings/*` is owner-only; branch
setup under `/br/[branchId]/settings/*` uses branch-scoped route families and
permission enforcement.

## Proxy Routing Logic — Single Gate

`apps/web/proxy.ts` is the **only** file that runs staff auth / ACL / branch-scope redirects. Layouts and pages for protected surfaces trust the proxy; they call `loadAuthState()` (`apps/web/app/_lib/auth.ts`) to read claims but never re-check them. If anything below is missing on a protected surface, the proxy has a gap — not the layout.

The `proxy(request)` function evaluates in order:

1. **Public paths bypass auth:** `/api/health`, `/api/webhooks`, `/sw.js`, `/access-denied`, `/q/*`, `/api/self-order/*`, and exact `/br/[branchId]/runner` (`route-resolution.ts:isPublicAppPath`). The access-denied page is public so a blocked-but-authenticated user can read the copy without re-entering the ACL loop.
2. **Login page:** authenticated users bounce to `resolvePostLoginRedirect(claims, returnTo)`; unauthenticated users see the form.
3. **Unauthenticated → `/login`**.
4. **Claims extraction:** if `extractClaims()` returns null, proxy redirects to `/access-denied?reason=missing-auth-context&from=<path>`. Proxy **does not** fabricate claims.
5. **Route surface audience:** `resolveRouteFamilyContract(pathname)` resolves the
   route surface; `canAccessRouteSurface(role, surface)` rejects non-Owner access
   to `admin_dashboard` and redirects to the role's Branch default.
6. **Module capability:** `resolveModuleFromPath(pathname)` maps URL to a reusable
   `ModuleKey`; `canAccess(role, moduleKey)` gates it. Failure returns the canonical
   insufficient-permission state.
7. **Branch scope:** protected Branch URLs must match the user's branch assignment
   unless the role is Owner. POS/KDS and protected station routes also reject
   missing, inactive, or non-operational branches.

The resolver `resolvePostLoginRedirect(claims, returnTo)` is the **single**
post-login destination function and applies the same surface, capability, and
branch-scope rules. App discovery also suppresses Admin Dashboard groups for
non-Owner roles. `/notifications` remains a Branch utility; legacy top-level
notification action URLs are normalized to authorized Branch routes at read
time. Unit tests live in `packages/shared/src/auth/__tests__/scope.test.ts`.

Root `/` uses the same shared default resolver as post-login fallback. Owner
always receives the Branch/Admin Dashboard plane picker, including with one
operating branch. Branch Manager and Staff land in their Branch plane.

### Invariant

> _After `proxy()` returns on a protected path, any layout or page downstream can assume: the user is authenticated, claims are valid, the role may enter the route surface, the role has the reusable module capability, and — for protected Branch URLs — branch scope matches._

`loadAuthState()` throws if the invariant is violated. This surfaces proxy gaps via `error.tsx` rather than masking them with silent redirects.

## Failure Modes

| Failure                           | Signal                                                                                                | Recovery                                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| JWT hook returns no claims        | Generic login error + `console.error("auth.login.claims_missing", { user_id })` (post-2026-05-07 fix) | Check server logs for `user_id`. Verify `custom_access_token_hook` is SECURITY DEFINER + profile row exists + position_id resolves      |
| `getSession()` returns no session | Generic login error + `console.error("auth.login.no_session_after_signin")` + signOut                 | Cookie write failed mid-request. Inspect proxy `Set-Cookie` flow + browser cookie state                                                 |
| Upstash rate-limit unreachable    | `console.error("auth.login.rate_limit_failopen", { ip, error })` — login still proceeds (fail-open)   | Check Vercel log drain. Verify Upstash health (`UPSTASH_REDIS_REST_URL`). Persistent `security_events` table tracking is follow-up wave |
| RLS blocks silently               | `{ data: null, error: null }` — no error thrown                                                       | Check GRANT + RLS policy for the table                                                                                                  |
| Role not in MODULE_ACL            | `canAccess()` returns false, user redirected                                                          | Add role to MODULE_ACL for the module                                                                                                   |
| Role not allowed on route surface | `canAccessRouteSurface()` returns false, user redirected                                              | Keep Admin Dashboard Owner-only or move the job to its Branch route; do not widen shared capability keys                                |
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

| Change                       | Affected                                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add new permission key       | Migration (INSERT into `permission_keys`) + `packages/shared/src/auth/permissions.ts` constant                                                                                        |
| Add new position             | Migration (INSERT into `positions`) + seed script                                                                                                                                     |
| Add new role_template        | Migration (INSERT into `role_templates`) or via admin RPC                                                                                                                             |
| Add new route surface/family | route-map.ts + proxy/scope/discovery + route-contract tests                                                                                                                           |
| Add new module capability    | module-acl.ts + route-resolution.ts + nav-config.ts                                                                                                                                   |
| Change JWT claims shape      | hook SQL + types.ts + scope.ts + proxy.ts. Always check `record.tenant_id IS NOT NULL` not `record IS NOT NULL` in plpgsql (see `PLPGSQL-RECORD-IS-NOT-NULL` regression).             |
| Cut a table's RLS to Auth    | DROP old policies + CREATE with `has_permission(branch_id, key)` (branch-scoped) or `has_permission_any(key)` (tenant-scoped). Keep structural gates (`branch_kind` checks) separate. |

## Design Rationale

- **JWT claims over DB lookup per request:** Performance. Claims are verified cryptographically without a DB round-trip. Trade-off: stale data until token refresh.
- **SECURITY DEFINER on hook:** Required by Supabase — the auth hook must read `profiles` which RLS would block during token minting.
- **Separate surface and capability contracts:** `route-map.ts` prevents an
  Admin Dashboard audience decision from narrowing a module capability that
  Branch workflows legitimately reuse.
- **Single gate = proxy:** layouts and pages must not re-check session/claims/ACL. `loadAuthState()` throws (not redirects) if claims are missing; proxy remains the only route gate.
- **Invite-only (no self-signup):** Business requirement — staff are added by managers via Admin API with pre-set `tenant_id` + `role`.
