# Module Card — Auth & ACL

## Current State

Auth v2 is shipped. Position and permission are separated:

- **Position**: HR title stored in `positions`, linked from `profiles.position_id`.
- **Legacy role**: `positions.legacy_role_code` emits `user_role` in JWT for route-level compatibility.
- **Permission grant**: `staff_permissions(user_id, branch_id, permission_key, valid_from, valid_until)` is the row/action authorization source.
- **Permission helper**: SQL `has_permission(branch_id, key)` / `has_permission_any(key)` gates RLS and RPCs.

`profiles.role` and the old `staff_role` enum are dropped.

## Core Files

- `packages/shared/src/auth/types.ts`
- `packages/shared/src/auth/module-acl.ts`
- `packages/shared/src/auth/permissions.ts`
- `packages/shared/src/auth/scope.ts`
- `packages/shared/src/auth/route-resolution.ts`
- `packages/shared/src/auth/nav-config.ts`
- `packages/shared/src/auth/app-discovery.ts`
- `packages/shared/src/auth/blocked-state.ts`
- `apps/web/proxy.ts`
- `apps/web/app/_lib/auth.ts`

## Route Gate

`apps/web/proxy.ts` is the single auth and ACL gate:

1. Public path bypass.
2. Login handling and post-login redirect.
3. Session refresh through Supabase SSR middleware.
4. JWT claims extraction from access token, not `user.app_metadata`.
5. URL -> `ModuleKey` through `resolveModuleFromPath`.
6. Route-level `canAccess(user_role, moduleKey)`.
7. Procurement permission gate for `inventory_procurement`.
8. Branch scope for POS/KDS/branch settings/menu limits.
9. POS/KDS operational-site check and production network gate.

Layouts may read claims with `loadAuthState()`, but should not duplicate the proxy policy.

## Module ACL Snapshot

Important route-level modules:

- `employee`, `notifications`: all staff.
- `dashboard`, `staff`, `finance`, `hr`, `reports`, `accounting`: owner/super_manager.
- `settings`: owner/super_manager/area_manager/branch_manager.
- `inventory`: owner/super_manager/area_manager/branch_manager/warehouse_manager/production_manager.
- `inventory_procurement`: owner/super_manager/warehouse_manager/production_manager plus permission gate.
- `inventory_admin`: retired, empty `allowedRoles`.
- `pos`: cashier/waiter/branch_manager.
- `kds`: chef/branch_manager.
- `branch_menu_limits`: owner/super_manager/area_manager/branch_manager/cashier/chef.

## Failure Rules

- Do not read hook-injected claims from `session.user.app_metadata`.
- Do not add route access in a layout while forgetting `module-acl.ts` and `route-resolution.ts`.
- Do not treat hidden UI as security.
- Do not store branch scope outside URL/path.
- Do not return raw Supabase/Postgres errors on auth failure.

## What To Do Next

For new surfaces:

1. Add or reuse a `ModuleKey`.
2. Add route resolution.
3. Add nav/discovery config only if it belongs in primary navigation.
4. Add permission keys for action-level/RLS gates.
5. Add tests or smoke checks for roles and branch scope.
