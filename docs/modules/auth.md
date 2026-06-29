# Auth & ACL Module

> **Current auth contract:** Position (HR chức vụ) is separated from Permission (quyền truy cập). Authz runs against a normalized `staff_permissions(user_id, branch_id, permission_key, valid_from, valid_until)` table, gated by RLS via `has_permission(branch_id, key)`. Legacy role strings (`branch_manager`, `cashier`, …) are still emitted in JWT as `user_role` for backward compat — they're derived from `positions.code mapper`. Runtime code must not depend on `profiles.role` or `staff_role`.

## Overview

Authentication and authorization for staff/operator surfaces. Protected requests pass through this module before reaching feature code. The auth chain spans four layers: Supabase Auth (identity), JWT custom claims hook (position + legacy-role injection), proxy.ts (route-level ACL enforcement), and RLS with `has_permission()` (row-level, permission-driven). Public customer surfaces such as `/br/[branchId]/runner` bypass staff login by design.

**Owner:** `packages/shared/src/auth/` + `apps/web/proxy.ts` + `supabase/migrations/00000000000000_baseline.sql` + `supabase/migrations/*auth*`

Canonical role/scope/route boundaries live in `docs/spec/role-route-matrix.md`.
`module-acl.ts` remains the runtime route fast-gate source of truth; route,
navigation, and default-landing changes must keep the spec, `module-acl.ts`,
`route-map.ts`, and auth tests in sync.

## Components

| File                                                         | Purpose                                                                                        | Lines                     |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------- |
| `packages/shared/src/auth/types.ts`                          | Role enum, JWT claims shape (`user_role` + optional `position`), scope types                   | Core types                |
| `packages/shared/src/auth/module-acl.ts`                     | Module → allowed roles mapping, `canAccess()`, `getAccessibleModules()`                        | Route-level ACL (legacy)  |
| `packages/shared/src/auth/permissions.ts`                    | `PERMISSION_KEYS` (83 keys), `hasPermission()`, `hasAny/All` pure fns — **Auth authz**         | Permission catalog        |
| `packages/shared/src/auth/scope.ts`                          | `extractClaims()` + `decodeJwtAppMetadata()` + `extractClaimsFromAccessToken()`                | JWT claim extraction      |
| `packages/shared/src/auth/route-resolution.ts`               | Public/legacy/beta route helpers + URL → `ModuleKey` mapping                                   | Proxy route mapping       |
| `packages/shared/src/auth/route-map.ts`                      | Route family contract: surface, entry point, chrome, back behavior, breadcrumb root            | Navigation contract       |
| `packages/shared/src/auth/nav-config.ts`                     | Admin sidebar navigation groups filtered by role                                               | UI navigation             |
| `packages/shared/src/auth/app-discovery.ts`                  | Shared app discovery metadata derived from ACL + nav config                                    | Shell discovery contract  |
| `packages/shared/src/auth/blocked-state.ts`                  | Canonical blocked-state reasons, user-facing copy, `buildAccessDeniedPath()`                   | Access-state contract     |
| `apps/web/app/(public)/access-denied/page.tsx`               | Single presentation route for "authenticated but blocked" (renders copy from blocked-state)    | Access-state view         |
| `apps/web/app/_lib/auth.ts`                                  | `loadAuthState()` — shared claims reader for layouts/pages; throws if proxy invariant violated | Layout claims helper      |
| `apps/web/proxy.ts`                                          | Next.js middleware — **single auth gate**: session + claims + module ACL + branch scope        | Request gateway           |
| `supabase/migrations/00000000000000_baseline.sql`           | `custom_access_token_hook()` — injects claims into JWT                                         | DB-level auth             |
| `supabase/migrations/00000000000000_baseline.sql`           | Auth core tables: `permission_keys`, `positions`, `role_templates`, `staff_permissions`        | Auth schema               |
| `supabase/migrations/00000000000000_baseline.sql`           | `has_permission(branch, key)` / `has_permission_any(key)` SECURITY DEFINER helpers             | Auth RLS helpers          |
| `apps/web/app/(protected)/admin/staff/[id]/permissions/`     | Admin UI for grant/revoke + audit (page + client + actions)                                    | Permission admin UI       |
| `apps/web/app/_lib/permissions.ts`                           | Server helpers `fetchCurrentUserPermissions()` + `currentUserHasPermission()`                  | App-side permission reads |

Discovery invariant: `MODULE_ACL.hr_payroll` still gates `/hr/payroll/*` for
owner, but is not part of `DOMAIN_WORKSPACE_ITEMS` or default app
discovery. HKD operation opens `/hr` for staff/shifts/workdays first;
payroll is direct-support only, for reconciling/finalizing pay when needed.

## Role Hierarchy

```
owner                          ← governance + tenant-wide oversight, vận hành + catalog NL, procurement
├── branch_manager             ← single branch command + operations
├── warehouse_manager          ← Kho Tổng procurement + stock workflow
├── production_manager         ← Bếp Trung Tâm production workflow
├── cashier                    ← POS (/br/[branchId]/pos)
├── chef                       ← KDS (/br/[branchId]/kds)
└── office                     ← back-office staff, explicit grants only
```

Compatibility access buckets (`owner`, `cashier`, …) still exist as `STAFF_ROLES` / `AccessBucket` TS constants and are emitted in JWT `user_role` for backward compatibility. They are derived from `positions.code` through the mapper in shared auth and SQL. HR display names live in `positions.label_vi` / `positions.label_en` and must not gate authz.

## RLS Gate Choice — `has_permission()` vs `auth_role()`

Two parallel ACL mechanisms exist; pick the right one:

- **`has_permission(branch_id, key)`** — queries `staff_permissions` live. Revoke is **immediate**. Use for destructive UPDATE/DELETE policies and any gate that must honor instant grant changes.
- **`auth_role()`** — reads JWT `user_role` claim (cached up to ~1h until token refresh). Use ONLY for: (a) scope/side guards inside RPC bodies (e.g. `branch_manager` forbidden from inter-site ship), (b) "tenant sees all branches" SELECT pattern (`branch_id = auth_branch_id() OR auth_role() IN HQ_ROLES`), (c) named ABAC helpers (`is_inventory_production_operator()`), (d) module-ACL fast-path on non-destructive read-mostly tables (e.g. `branch_menu_item_daily_limits` — see regression rule `BMIDL-RLS-INTENTIONAL-ROLE-FASTPATH`).

**ACL contract notes:**

- `refunds_update` uses `has_permission(branch_id,'orders:refund_approve')`; destructive refund approval must not depend on cached `auth_role()`.
- `admin_update_profile` and `toggle_profile_active` derive actor role and branch live from `profiles + positions`; `set_branch_kind` gates on `settings:tenant`.
- `can_access_branch()` is a separate RLS-policy batch because it is a shared branch-scope predicate.
- `hr_payroll` policy scope is handled with the HRM payroll/base-salary work; do not add payroll permission keys outside that task.

## Invariants (post H3a, 2026-05-07)

- **`profiles.position_id` is NOT NULL** + FK `ON DELETE RESTRICT`. Every active or inactive profile MUST point to a seeded position in its tenant. Enforced in `supabase/migrations/00000000000000_baseline.sql`.
  - `handle_new_user` trigger raises `position_not_resolved` (SQLSTATE P0001) if `raw_app_meta_data->>'role'` does not map to a seeded position — signup fails loudly instead of inserting a broken profile.
  - `admin_update_profile` raises the same exception if a manager passes a role that does not resolve to a position for the tenant.
  - Deleting a position with active profiles raises `foreign_key_violation` (SQLSTATE 23503). Admins must reassign profiles before deleting.
- **Owner identity has three separate meanings.** `tenants.representative` is a free-text legal-document name (TEXT, not UUID), `positions.code='owner'` is the current runtime owner-bypass / JWT role source, and `tenants.owner_user_id UUID NOT NULL` is the canonical owner auth identity column. Do not wire `representative` into auth. Do not add a dual-source `has_permission()` branch unless ADR 0005 is superseded by a new owner-gated decision.

## Auth — Position vs Permission

| Concept        | Storage                                                                          | Purpose                                                                                                                                                                                                                                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Position**   | `positions` (per tenant) + `profiles.position_id`                                | HR chức vụ label. Codes are canonical English `lower_snake_case` ONLY — mapped by `POSITION_CODE_TO_STAFF_ROLE` (shared TS) / `private.staff_role_from_position_code` (SQL twin). Display via `label_vi`. Does not gate authz. |
| **Permission** | `permission_keys` catalog (global)                                               | Canonical action strings: `inventory:read`, `pos:use`, 83 keys.                                                                                                                                                                                                                                                                                     |
| **Grant**      | `staff_permissions(user_id, branch_id, permission_key, valid_from, valid_until)` | Source of truth for authz. `branch_id IS NULL` ⇒ tenant-wide. Temporal window.                                                                                                                                                                                                                                                                      |
| **Template**   | `role_templates(permission_keys[])`                                              | Preset bundle applied when assigning a position (snapshot; edits don't propagate).                                                                                                                                                                                                                                                                  |

**Authz path (every request):** `proxy.ts` still does route-level module ACL via `canAccess(user_role, module)` as the fast gate. Row-level authz delegates to `has_permission(branch_id, key)` in RLS — owner bypass built-in, temporal validity filtered, branch access explicit through grants or `profiles.branch_id`.

**Grant/revoke** goes through SECURITY DEFINER RPCs that enforce caller must hold `staff:assign_permission` and log every change to `permission_audit_log`:

- `grant_permission(target, branch, key, template?, valid_from?, valid_until?)`
- `revoke_permission(target, branch, key)`
- `apply_template_to_user(target, branch, template, valid_from?, valid_until?)`

Owner is protected: RPCs refuse to touch a user whose position code is `owner` (governed separately via `tenants.representative`).

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

Defined in `packages/shared/src/auth/module-acl.ts`. Single source of truth — proxy.ts, admin shell, and layouts all read from here.

| Module                                                     | owner | branch_mgr | wh_mgr | prod_mgr | cashier | chef | office |
| ---------------------------------------------------------- | ----- | ---------- | ------ | -------- | ------- | ---- | ------ |
| dashboard                                                  | ✓     |            |        |          |         |      |        |
| menu                                                       | ✓     | ✓          |        |          |         |      |        |
| inventory                                                  | ✓     | ✓          | ✓      | ✓        |         |      |        |
| inventory_procurement (NCC, PO, GRN, HĐ NCC, công thức)    | ✓     |            | ✓      | ✓        |         |      |        |
| inventory_admin (blocked; empty allowed_roles)             |       |            |        |          |         |      |        |
| orders                                                     | ✓     | ✓          |        |          | ✓       |      |        |
| staff                                                      | ✓     |            |        |          |         |      |        |
| hr                                                         | ✓     | ✓          |        |          |         |      |        |
| finance                                                    | ✓     |            |        |          |         |      |        |
| reports                                                    | ✓     |            |        |          |         |      |        |
| settings                                                   | ✓     |            |        |          |         |      |        |
| pos                                                        | ✓     | ✓          |        |          | ✓       |      |        |
| kds                                                        | ✓     | ✓          |        |          |         | ✓    |        |
| runner (public display route)                              | ✓     | ✓          |        |          | ✓       | ✓    |        |
| branch_dashboard                                           | ✓     | ✓          |        |          |         |      |        |
| branch_settings                                            | ✓     | ✓          |        |          |         |      |        |
| branch_menu_limits                                         | ✓     | ✓          |        |          |         |      |        |
| employee                                                   |       | ✓          | ✓      | ✓        | ✓       | ✓    | ✓      |
| notifications                                              | ✓     | ✓          | ✓      | ✓        | ✓       | ✓    | ✓      |

> `wh_mgr` = `warehouse_manager`, `prod_mgr` = `production_manager`. Route-level ACL reads `user_role` from the JWT, derived from `positions.code`. Row-level authz still goes through `has_permission(branch_id, key)` — this matrix is only a fast gate.
>
> The main inventory mutating RPCs are permission-gated; the remaining `auth_role()` usages are route/side/scope guards or legacy helpers. See `docs/ref/inventory-rbac-matrix.md` §6.
>
> Runner exception: `/br/[branchId]/runner` is an exact public customer display path. `MODULE_ACL.runner` remains for route metadata and protected future child routes, not for forcing Account Login on the board. Current pilot intentionally skips a public slug; add a tokenized URL again if live operational telemetry exposure or public load becomes a real issue.

**Employee page boundary:** `employee` is the self-service / operational-handoff surface for staff outside `ADMIN_ROLES`. `owner` does not enter `/employee/*`; a direct request is sent to the Admin default route.

**Owner:** beyond the admin / monitoring modules, can also enter `orders` and `inventory` to directly inspect tenant-level operations. However, the owner is not treated as a daily operator in inventory docs/UI; the Inventory surfaces are currently optimized for `branch_manager`, `warehouse_manager`, `production_manager`.

**Inventory sub-route ACL:** `inventory` allows `owner`, `branch_manager`, `warehouse_manager`, `production_manager` for stock on hand, real transfers, consumption, stocktake, expiry, reports, and branch operations. `inventory_procurement`: `owner`, `warehouse_manager`, `production_manager` access `suppliers`, `purchase-orders`, `grn`, `supplier-invoices`, `recipes`, and `receiving` per `route-resolution.ts`; the receiving site can be `branch`, `central_supply`, or `central_kitchen`. `inventory_admin` (`/admin/inventory/*`) always has `allowedRoles: []` so the proxy blocks it via the standard ACL. `production` does not use its own module; Server Actions and DB/RPC/RLS hard-deny `branch_manager` even with a manual production/menu grant. The production operator is `production_manager` at the Central Kitchen (Bếp Trung Tâm); `owner` has inspection/emergency access but is not led through the UX as a daily operator. `branch_manager` should therefore only see the branch-ops rhythm: receive inbound transfers, approve consumption, stocktake, adjustment/write-off.

**Important UX boundary:** nav can be narrower than the module-level ACL to reduce operational noise. For example `branch_manager` can still reach `/inventory/transfers` to receive goods, but the UI should not promote the create-inter-site-transfer action as a default task for this role.

**Route-map boundary:** `MODULE_ACL` answers "can the role enter the module";
`route-map.ts` answers "which surface this URL belongs to and which chrome/back
behavior it uses". Do not use route-map to grant permission. Do not use local
shell/nav to bypass `MODULE_ACL`. A route leaving the workspace must use
`resolveRoleHomeLink(role, branchId?)` instead of hardcoding `/admin/dashboard`,
because non-admin roles get sent by the proxy to a different default.
The Inventory route contract uses a list of active prefixes; an unknown Inventory
URL must not be kept in the post-login `returnTo`.

**Settings surface boundary:** Tenant setup belongs under `/admin/settings/*`
and is for owner. Branch setup belongs under
`/br/[branchId]/settings/*` and may include branch_manager for their own branch.
The runtime `settings` module excludes branch_manager; branch-scoped setup must
use `branch_dashboard` / `branch_settings` route families.

- `/admin/settings/branches` — owner only (page-level redirect)
- `/admin/settings/general` — owner only (page-level redirect)
- `/br/[branchId]/settings/tables`, `/br/[branchId]/settings/kds`, `/br/[branchId]/settings/pos`, `/br/[branchId]/settings/pos-sessions`, `/br/[branchId]/settings/printers` — branch setup roles with branch-scope enforcement

## Proxy Routing Logic — Single Gate

`apps/web/proxy.ts` is the **only** file that runs staff auth / ACL / branch-scope redirects. Layouts and pages for protected surfaces trust the proxy; they call `loadAuthState()` (`apps/web/app/_lib/auth.ts`) to read claims but never re-check them. If anything below is missing on a protected surface, the proxy has a gap — not the layout.

The `proxy(request)` function evaluates in order:

1. **Public paths bypass auth:** `/api/health`, `/api/webhooks`, `/sw.js`, `/access-denied`, `/payment/momo/*`, and exact `/br/[branchId]/runner` (`route-resolution.ts:isPublicAppPath`). The access-denied page is public so a blocked-but-authenticated user can read the copy without re-entering the ACL loop.
2. **Legacy canonical redirects:** `/admin/finance/*` redirects to `/finance/*` through `resolveLegacyRouteRedirectPath()` before module ACL. The same helper is used by post-login `returnTo` resolution.
3. **Login page:** authenticated users bounce to `resolvePostLoginRedirect(claims, returnTo)`; unauthenticated users see the form.
4. **Unauthenticated → `/login?returnTo=<current-url>`**.
5. **Claims extraction:** if `extractClaims()` returns null, proxy redirects to `/access-denied?reason=missing-auth-context&from=<path>`. Proxy **does not** fabricate claims.
6. **Module ACL:** `resolveModuleFromPath(pathname)` maps URL → `ModuleKey`; `canAccess(role, moduleKey)` gates. Failure → `/access-denied?reason=insufficient-permission&from=<path>`, except disallowed Admin URLs and admin-level `/employee/*` visits redirect to the role's Admin default route.
7. **Branch-scope for POS/KDS/branch settings/menu limits:** if a protected branch-scoped URL is not reachable for the user's branch assignment → `/access-denied?reason=branch-scope-mismatch`. POS/KDS and future protected Runner child routes reject missing, inactive, or non-operational branches in proxy. The exact public Runner display rejects invalid/non-operational branches inside the page because it has no staff claims.

The resolver `resolvePostLoginRedirect(claims, returnTo)` (`packages/shared/src/auth/scope.ts`) is the **single** post-login destination function. The underlying ACL + branch-scope rules are shared. Unit tests live in `packages/shared/src/auth/__tests__/scope.test.ts` (run `pnpm --filter @comtammatu/shared test`).

Root `/` uses the same shared default resolver as post-login fallback. Branch
Manager therefore lands in `/employee` by default; Branch Command remains a
branch-scoped management route opened from Employee manager tools or direct
links.

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
- Uses shadcn `Card` + `Button` primitives (follows **NO-FAKE-PRIMITIVES**).
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
