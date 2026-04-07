# Auth & ACL Module

## Overview

Authentication and authorization for the entire system. Every request passes through this module before reaching any feature code. The auth chain spans three layers: Supabase Auth (identity), JWT custom claims hook (role injection), and proxy.ts (route-level ACL enforcement).

**Owner:** `packages/shared/src/auth/` + `apps/web/proxy.ts` + `supabase/migrations/*jwt*`

## Components

| File                                               | Purpose                                                                                        | Lines                      |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------- |
| `packages/shared/src/auth/types.ts`                | Role enum, JWT claims shape, scope types                                                       | Core types                 |
| `packages/shared/src/auth/module-acl.ts`           | Module → allowed roles mapping, `canAccess()`, `getAccessibleModules()`                        | ACL single source of truth |
| `packages/shared/src/auth/scope.ts`                | `extractClaims()` (reads `user_role` or `role` fallback), `getScope()`, `getDefaultRedirect()` | JWT claim extraction       |
| `packages/shared/src/auth/nav-config.ts`           | Admin sidebar navigation groups filtered by role                                               | UI navigation              |
| `apps/web/proxy.ts`                                | Next.js middleware — auth check + ACL enforcement                                              | Request gateway            |
| `supabase/migrations/*_jwt_custom_claims_hook.sql` | `custom_access_token_hook()` — injects claims into JWT                                         | DB-level auth              |

## Role Hierarchy

```
owner                          ← unrestricted, tenant-wide
├── super_manager              ← everything except owner mgmt
├── area_manager               ← tenant-wide (no area scoping yet)
├── branch_manager             ← single branch operations
│   ├── cashier                ← POS (/br/[branchId]/pos)
│   ├── waiter                 ← POS (/br/[branchId]/pos)
│   └── chef                   ← KDS (/br/[branchId]/kds)
└── office                     ← HQ staff, no branch assignment
```

Roles are stored as Postgres ENUM `staff_role` (`packages/shared/src/auth/types.ts:3`). Adding a role requires a migration (`ALTER TYPE staff_role ADD VALUE`), updating `STAFF_ROLES` array, and updating `MODULE_ACL`.

## Auth Flow

1. User submits credentials at `/login` (`apps/web/app/(auth)/login/actions.ts`)
2. Server action calls `supabase.auth.signInWithPassword()`
3. Supabase fires `custom_access_token_hook()` (`supabase/migrations/20260401000001_jwt_custom_claims_hook.sql`) — SECURITY DEFINER
4. Hook reads `profiles` table, injects `{tenant_id, branch_id, user_role}` into JWT `app_metadata`
5. JWT returned to client, stored in cookies via `@supabase/ssr`
6. Every subsequent request: `proxy.ts` calls `updateSession()` → `extractClaims()` → `canAccess(role, module)`

## ACL Matrix

Defined in `packages/shared/src/auth/module-acl.ts`. Single source of truth — proxy.ts, admin shell, and layouts all read from here.

| Module    | owner | super_mgr | area_mgr | branch_mgr | cashier | waiter | chef | office |
| --------- | ----- | --------- | -------- | ---------- | ------- | ------ | ---- | ------ |
| dashboard | ✓     | ✓         | ✓        | ✓          |         |        |      |        |
| menu      | ✓     | ✓         | ✓        | ✓          |         |        |      |        |
| inventory | ✓     | ✓         | ✓        | ✓          |         |        |      |        |
| orders    | ✓     | ✓         | ✓        | ✓          |         |        |      |        |
| staff     | ✓     | ✓         | ✓        | ✓          |         |        |      |        |
| hr        | ✓     | ✓         |          |            |         |        |      |        |
| crm       | ✓     | ✓         | ✓        | ✓          |         |        |      |        |
| finance   | ✓     | ✓         |          |            |         |        |      |        |
| reports   | ✓     | ✓         | ✓        | ✓          |         |        |      |        |
| settings  | ✓     | ✓         | ✓        | ✓          |         |        |      |        |
| pos       |       |           |          | ✓          | ✓       | ✓      |      |        |
| kds       |       |           |          | ✓          |         |        | ✓    |        |
| employee  | ✓     | ✓         | ✓        | ✓          | ✓       | ✓      | ✓    | ✓      |

**Settings sub-page ACL:** The settings module allows area_manager and branch_manager, but sub-pages have additional guards:

- `/admin/settings/branches` — owner, super_manager only (page-level redirect)
- `/admin/settings/general` — owner, super_manager only (page-level redirect)
- `/admin/settings/tables` — all settings roles (area_manager, branch_manager see only their branch data)

## Proxy Routing Logic

`apps/web/proxy.ts` — the `proxy(request)` function:

1. **Public paths bypass auth:** `/api/health`, `/api/webhooks` (`proxy.ts:isPublic()`)
2. **Login page:** authenticated users redirect to role default; unauthenticated see login
3. **Protected routes:** `resolveModule(pathname)` maps URL → `ModuleKey`, then `canAccess(role, moduleKey)` checks ACL
4. **Forbidden:** redirects to role default with `?forbidden=1`

## Failure Modes

| Failure                     | Signal                                          | Recovery                                                                        |
| --------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| JWT hook returns no claims  | User lands on login repeatedly                  | Check `custom_access_token_hook` is SECURITY DEFINER, check profiles row exists |
| RLS blocks silently         | `{ data: null, error: null }` — no error thrown | Check GRANT + RLS policy for the table                                          |
| Role not in MODULE_ACL      | `canAccess()` returns false, user redirected    | Add role to MODULE_ACL for the module                                           |
| Stale JWT after role change | Old role persists until token refresh           | Call `supabase.auth.refreshSession()` or wait for proxy `updateSession()`       |

## Blast Radius

| Change                       | Affected                                                           |
| ---------------------------- | ------------------------------------------------------------------ |
| Add new role to `staff_role` | Migration + types.ts + module-acl.ts + scope.ts + all RLS policies |
| Add new module to ACL        | module-acl.ts + proxy.ts `resolveModule()` + nav-config.ts         |
| Change JWT claims shape      | jwt hook SQL + types.ts + scope.ts + proxy.ts                      |

## Design Rationale

- **JWT claims over DB lookup per request:** Performance. Claims are verified cryptographically without a DB round-trip. Trade-off: stale data until token refresh.
- **SECURITY DEFINER on hook:** Required by Supabase — the auth hook must read `profiles` which RLS would block during token minting.
- **Single ACL source:** `module-acl.ts` prevents drift between proxy, nav, and layout guards.
- **Invite-only (no self-signup):** Business requirement — staff are added by managers via Admin API with pre-set `tenant_id` + `role`.

<!-- ORACLE-META
Written by codebase-oracle (manual) | 2026-04-02
Data: Direct source reading
Audience: new engineer, feature owner | Confidence: 95%
Unknowns: 1 (area_manager scoping)
-->
