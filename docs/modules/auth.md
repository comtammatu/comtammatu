# Auth & ACL Module

> **Auth v2 (shipped 2026-04-22/23):** Position (HR chức vụ) is separated from Permission (quyền truy cập). Authz runs against a normalized `staff_permissions(user_id, branch_id, permission_key, valid_from, valid_until)` table, gated by RLS via `has_permission(branch_id, key)`. Legacy role strings (`branch_manager`, `cashier`, …) are still emitted in JWT as `user_role` for backward compat — they're derived from `positions.legacy_role_code`. `profiles.role` column + `staff_role` enum **dropped**. See the Auth v2 section below.

## Overview

Authentication and authorization for the entire system. Every request passes through this module before reaching any feature code. The auth chain spans four layers: Supabase Auth (identity), JWT custom claims hook (position + legacy-role injection), proxy.ts (route-level ACL enforcement), and RLS with `has_permission()` (row-level, permission-driven).

**Owner:** `packages/shared/src/auth/` + `apps/web/proxy.ts` + `supabase/migrations/*jwt*` + `supabase/migrations/*auth_v2*`

## Components

| File                                                            | Purpose                                                                                        | Lines                     |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------- |
| `packages/shared/src/auth/types.ts`                             | Role enum, JWT claims shape (`user_role` + optional `position`), scope types                   | Core types                |
| `packages/shared/src/auth/module-acl.ts`                        | Module → allowed roles mapping, `canAccess()`, `getAccessibleModules()`                        | Route-level ACL (legacy)  |
| `packages/shared/src/auth/permissions.ts`                       | `PERMISSION_KEYS` (87 keys), `hasPermission()`, `hasAny/All` pure fns — **Auth v2 authz**      | Permission catalog (v2)   |
| `packages/shared/src/auth/scope.ts`                             | `extractClaims()` + `decodeJwtAppMetadata()` + `extractClaimsFromAccessToken()`                | JWT claim extraction      |
| `packages/shared/src/auth/nav-config.ts`                        | Admin sidebar navigation groups filtered by role                                               | UI navigation             |
| `packages/shared/src/auth/app-discovery.ts`                     | Shared app discovery metadata derived from ACL + nav config                                    | Shell discovery contract  |
| `packages/shared/src/auth/blocked-state.ts`                     | Canonical blocked-state reasons, user-facing copy, `buildAccessDeniedPath()`                   | Access-state contract     |
| `apps/web/app/access-denied/page.tsx`                           | Single presentation route for "authenticated but blocked" (renders copy from blocked-state)    | Access-state view         |
| `apps/web/app/_lib/auth.ts`                                     | `loadAuthState()` — shared claims reader for layouts/pages; throws if proxy invariant violated | Layout claims helper      |
| `apps/web/proxy.ts`                                             | Next.js middleware — **single auth gate**: session + claims + module ACL + branch scope        | Request gateway           |
| `supabase/migrations/*_jwt_custom_claims_hook.sql`              | `custom_access_token_hook()` — injects claims into JWT                                         | DB-level auth             |
| `supabase/migrations/20260422120000_auth_v2_tables.sql`         | Auth v2 core tables: `permission_keys`, `positions`, `role_templates`, `staff_permissions`     | Auth v2 schema            |
| `supabase/migrations/20260422120002_auth_v2_has_permission.sql` | `has_permission(branch, key)` / `has_permission_any(key)` SECURITY DEFINER helpers             | Auth v2 RLS helpers       |
| `apps/web/app/admin/staff/[id]/permissions/`                    | Admin UI for grant/revoke + audit (page + client + actions)                                    | Permission admin UI       |
| `apps/web/app/_lib/permissions.ts`                              | Server helpers `fetchCurrentUserPermissions()` + `currentUserHasPermission()`                  | App-side permission reads |

## Role Hierarchy

```
owner                          ← governance + tenant-wide oversight, including orders and inventory
├── super_manager              ← Trụ sở: vận hành + catalog NL, procurement
├── area_manager               ← tenant-wide; area scope enforced via per-branch grants in `staff_permissions` (Auth v2)
├── branch_manager             ← single branch operations
│   ├── cashier                ← POS (/br/[branchId]/pos)
│   ├── waiter                 ← POS (/br/[branchId]/pos)
│   └── chef                   ← KDS (/br/[branchId]/kds)
└── office                     ← HQ staff, no branch assignment
```

Legacy role strings (`owner`, `cashier`, …) still exist as `STAFF_ROLES` TS constants and are emitted in JWT `user_role` for backward compat. They are **derived** from `positions.legacy_role_code` — the `staff_role` enum + `profiles.role` column were dropped in M5 (2026-04-23). To add a new legacy role value, update `STAFF_ROLES` + `positions.legacy_role_code` mapping in the seed. To add a new HR position, insert into `positions` with the proper `legacy_role_code` bridge.

## Auth v2 — Position vs Permission

| Concept        | Storage                                                                          | Purpose                                                                                                                                                       |
| -------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Position**   | `positions` (per tenant) + `profiles.position_id`                                | HR chức vụ label. Blue still has legacy codes like `kho_truong` / `quan_ly_CN`; green baseline maps these to English codes per ADR-0004. Does not gate authz. |
| **Permission** | `permission_keys` catalog (global)                                               | Canonical action strings: `inventory:read`, `pos:use`, 87 keys.                                                                                               |
| **Grant**      | `staff_permissions(user_id, branch_id, permission_key, valid_from, valid_until)` | Source of truth for authz. `branch_id IS NULL` ⇒ tenant-wide. Temporal window.                                                                                |
| **Template**   | `role_templates(permission_keys[])`                                              | Preset bundle applied when assigning a position (snapshot; edits don't propagate).                                                                            |

**Authz path (every request):** `proxy.ts` still does route-level module ACL via `canAccess(user_role, module)` as the fast gate. Row-level authz delegates to `has_permission(branch_id, key)` in RLS — owner bypass built-in, temporal validity filtered, area_manager scope preserved via per-branch grants (backfilled from `area_branches`).

**Grant/revoke** goes through SECURITY DEFINER RPCs that enforce caller must hold `staff:assign_permission` and log every change to `permission_audit_log`:

- `grant_permission(target, branch, key, template?, valid_from?, valid_until?)`
- `revoke_permission(target, branch, key)`
- `apply_template_to_user(target, branch, template, valid_from?, valid_until?)`

Owner is protected: RPCs refuse to touch a user whose position code is `owner` (governed separately via `tenants.representative`).

## Auth Flow

1. User submits credentials at `/login` (`apps/web/app/(auth)/login/actions.ts`)
2. Server action calls `supabase.auth.signInWithPassword()`
3. Supabase fires `custom_access_token_hook()` — SECURITY DEFINER
4. Hook reads `profiles` + `positions`, injects `{tenant_id, branch_id, user_role, position}` into JWT `app_metadata`. `user_role` derives from `positions.legacy_role_code`; `position` is the HR code.
5. JWT returned to client, stored in cookies via `@supabase/ssr`
6. Every subsequent request:
   - Proxy calls `updateSession()` → `extractClaimsFromAccessToken(session.access_token)` → `canAccess(user_role, module)` (route gate)
   - RLS on any DB access: `has_permission(branch_id, key)` checks `staff_permissions` (row gate)

**IMPORTANT:** `user.app_metadata` from supabase-js reads the `auth.users` row, which does **not** include hook-injected claims. Always use `extractClaimsFromAccessToken(session.access_token)` when you need `position`. See regression rule `JWT-CLAIMS-NOT-IN-APP-METADATA`.

## ACL Matrix

Defined in `packages/shared/src/auth/module-acl.ts`. Single source of truth — proxy.ts, admin shell, and layouts all read from here.

| Module                                                  | owner | super_mgr | area_mgr | branch_mgr | wh_mgr | prod_mgr | cashier | waiter | chef | office |
| ------------------------------------------------------- | ----- | --------- | -------- | ---------- | ------ | -------- | ------- | ------ | ---- | ------ |
| dashboard                                               | ✓     | ✓         |          |            |        |          |         |        |      |        |
| menu                                                    | ✓     | ✓         | ✓        | ✓          |        |          |         |        |      |        |
| inventory                                               | ✓     | ✓         | ✓        | ✓          | ✓      | ✓        |         |        |      |        |
| inventory_procurement (NCC, PO, GRN, HĐ NCC, công thức) | ✓     | ✓         |          |            | ✓      | ✓        |         |        |      |        |
| inventory_admin (RETIRED — empty allowed_roles)         |       |           |          |            |        |          |         |        |      |        |
| orders                                                  | ✓     | ✓         | ✓        | ✓          |        |          | ✓       |        |      |        |
| staff                                                   | ✓     | ✓         |          |            |        |          |         |        |      |        |
| hr                                                      | ✓     | ✓         |          |            |        |          |         |        |      |        |
| crm                                                     | ✓     | ✓         |          |            |        |          |         |        |      |        |
| finance                                                 | ✓     | ✓         |          |            |        |          |         |        |      |        |
| accounting (period close/reopen)                        | ✓     | ✓         |          |            |        |          |         |        |      |        |
| reports                                                 | ✓     | ✓         |          |            |        |          |         |        |      |        |
| settings                                                | ✓     | ✓         | ✓        | ✓          |        |          |         |        |      |        |
| pos                                                     |       |           |          | ✓          |        |          | ✓       | ✓      |      |        |
| kds                                                     |       |           |          | ✓          |        |          |         |        | ✓    |        |
| branch_settings                                         | ✓     | ✓         | ✓        | ✓          |        |          |         |        |      |        |
| branch_menu_limits                                      | ✓     | ✓         | ✓        | ✓          |        |          | ✓       |        | ✓    |        |
| employee                                                | ✓     | ✓         | ✓        | ✓          | ✓      | ✓        | ✓       | ✓      | ✓    | ✓      |
| notifications                                           | ✓     | ✓         | ✓        | ✓          | ✓      | ✓        | ✓       | ✓      | ✓    | ✓      |

> `wh_mgr` = `warehouse_manager`, `prod_mgr` = `production_manager`. Route-level ACL đọc `user_role` từ JWT, derived từ `positions.legacy_role_code`. Row-level authz vẫn đi qua `has_permission(branch_id, key)` — matrix này chỉ là fast gate.
>
> Inventory mutating RPC chính đã permission-gated; phần `auth_role()` còn lại là route/side/scope guard hoặc legacy helper. Xem `docs/ref/inventory-rbac-matrix.md` §6.

**Owner (chủ sở hữu):** ngoài các module quản trị / giám sát còn có thể vào `orders` và `inventory` để kiểm tra trực tiếp vận hành tenant-level. Tuy vậy owner không được coi là operator hằng ngày trong inventory docs/UI; các bề mặt Inventory hiện tối ưu cho `super_manager`, `area_manager`, `branch_manager`.

**Inventory sub-route ACL:** `inventory` allows `owner`, `super_manager`, `area_manager`, `branch_manager`, `warehouse_manager`, `production_manager` cho tồn kho, điều chuyển, stocktake, expiry, reports, và branch operations. `inventory_procurement` ở cấp trụ sở/kho: `owner`, `super_manager`, `warehouse_manager`, `production_manager` vào `suppliers`, `purchase-orders`, `grn`, `supplier-invoices`, `recipes`, và `receiving` theo `route-resolution.ts`. `inventory_admin` (`/admin/inventory/*` — `cold-chain`, `express-windows`, `feature-flags`, `trust`) đã RETIRED qua `allowedRoles: []`: page files còn tồn tại nhưng không role nào pass module ACL. `production` không dùng module riêng; Server Actions và DB/RPC/RLS hard-deny `area_manager` và `branch_manager` dù có manual production/menu grant. Operator production là `super_manager` / `production_manager`; `owner` có access kiểm tra/khẩn cấp nhưng không được UX dẫn như operator hằng ngày. `branch_manager` vì vậy chỉ nên thấy nhịp branch ops: nhận inbound transfer, tạo intra-branch transfer `Cấp bếp`, stocktake, adjustment/write-off.

**UX boundary quan trọng:** nav có thể hẹp hơn module-level ACL để giảm nhiễu vận hành. Ví dụ `branch_manager` vẫn vào được `/inventory/transfers` để nhận hàng, nhưng UI không nên quảng bá action tạo inter-site transfer như tác vụ mặc định của vai trò này.

**Settings sub-page ACL:** The settings module allows area_manager and branch_manager, but sub-pages have additional guards:

- `/admin/settings/branches` — owner, super_manager only (page-level redirect)
- `/admin/settings/general` — owner, super_manager only (page-level redirect)
- `/admin/settings/areas` — owner, super_manager only (page-level redirect)
- `/admin/settings/tables`, `/admin/settings/kds`, `/admin/settings/pos`, `/admin/settings/payments`, `/admin/settings/printers` — all settings roles (area_manager, branch_manager see only their branch data)

## Proxy Routing Logic — Single Gate

`apps/web/proxy.ts` is the **only** file that runs auth / ACL / branch-scope redirects. Layouts and pages trust the proxy; they call `loadAuthState()` (`apps/web/app/_lib/auth.ts`) to read claims but never re-check them. If anything below is missing, the proxy has a gap — not the layout.

The `proxy(request)` function evaluates in order:

1. **Public paths bypass auth:** `/api/health`, `/api/webhooks`, `/sw.js`, `/access-denied` (`route-resolution.ts:isPublicAppPath`). The access-denied page is public so a blocked-but-authenticated user can read the copy without re-entering the ACL loop.
2. **Login page:** authenticated users bounce to `resolvePostLoginRedirect(claims, returnTo, { surface })`; unauthenticated users see the form.
3. **Unauthenticated → `/login?returnTo=<current-url>`** (surface-aware: beta users go to `/beta/login`).
4. **Claims extraction:** if `extractClaims()` returns null, proxy redirects to `/access-denied?reason=missing-auth-context&from=<path>`. Proxy **does not** fabricate claims.
5. **Module ACL:** `resolveModuleFromPath(pathname)` maps URL → `ModuleKey`; `canAccess(role, moduleKey)` gates. Failure → `/access-denied?reason=insufficient-permission&from=<path>`.
6. **Branch-scope for POS/KDS:** if `claims.branch_id !== urlBranchId` → `/access-denied?reason=branch-scope-mismatch`. If the matched branch is `warehouse`/`central_kitchen` → `/access-denied?reason=warehouse-branch-restricted`. Both checks live in proxy; POS/KDS layouts no longer verify them.

The resolver `resolvePostLoginRedirect(claims, returnTo, { surface?: "legacy" | "beta" })` (`packages/shared/src/auth/scope.ts`) is the **single** post-login destination function. Surface controls beta-prefix wrapping; the underlying ACL + branch-scope rules are shared. Unit tests live in `packages/shared/src/auth/__tests__/scope.test.ts` (run `pnpm --filter @comtammatu/shared test`).

### Invariant

> _After `proxy()` returns, any layout or page downstream can assume: the user is authenticated, claims are valid, the role has module access, and — for `/br/[branchId]/{pos,kds}` — branch scope matches._

`loadAuthState()` throws if the invariant is violated. This surfaces proxy gaps via `error.tsx` rather than masking them with silent redirects.

## Failure Modes

| Failure                     | Signal                                          | Recovery                                                                        |
| --------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| JWT hook returns no claims  | User lands on login repeatedly                  | Check `custom_access_token_hook` is SECURITY DEFINER, check profiles row exists |
| RLS blocks silently         | `{ data: null, error: null }` — no error thrown | Check GRANT + RLS policy for the table                                          |
| Role not in MODULE_ACL      | `canAccess()` returns false, user redirected    | Add role to MODULE_ACL for the module                                           |
| Stale JWT after role change | Old role persists until token refresh           | Call `supabase.auth.refreshSession()` or wait for proxy `updateSession()`       |

## Blocked-State Reasons

`packages/shared/src/auth/blocked-state.ts` chốt reason codes của flow "authenticated but blocked":

- `insufficient-permission` — role hiện tại không vào được module/route đó
- `missing-auth-context` — session có user nhưng không resolve được claims cần thiết để authorize
- `branch-scope-mismatch` — URL có `branchId` nhưng `claims.branch_id` khác hoặc null (POS/KDS)
- `warehouse-branch-restricted` — POS/KDS mở trên branch thuộc kind `warehouse` / `central_kitchen`
- `headquarters-branch-restricted` — reserved cho future use (không emit hiện tại)

Nếu reason code bị thiếu hoặc lạ, `/access-denied` fallback về copy generic (`DEFAULT_BLOCKED_STATE_COPY`) thay vì crash.

### `buildAccessDeniedPath(reason, { from? })`

Single canonical helper cho "send blocked user somewhere they can read what happened." Output: `/access-denied?reason=<code>&from=<encoded-path>`. Proxy là consumer duy nhất hiện tại.

### `/access-denied` page

- Public path (bypasses `updateSession`) — bất kỳ user nào truy cập được.
- Chỉ đọc `searchParams.reason` + `searchParams.from` → render copy qua `resolveBlockedState()`.
- Không tự check auth, không tự redirect. Tuân thủ **BLOCKED-STATE-UI-IS-PRESENTATION-ONLY**.
- Dùng shadcn `Card` + `Button` primitives (tuân **NO-FAKE-PRIMITIVES**).
- Hai action: "Về phân hệ mặc định" (link to `/`) và "Đăng nhập lại" (link to `/login`).

## Blast Radius

| Change                       | Affected                                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add new permission key       | Migration (INSERT into `permission_keys`) + `packages/shared/src/auth/permissions.ts` constant                                                                                        |
| Add new position             | Migration (INSERT into `positions` with `legacy_role_code` mapping) + seed script                                                                                                     |
| Add new role_template        | Migration (INSERT into `role_templates`) or via admin RPC                                                                                                                             |
| Add new module to route ACL  | module-acl.ts + proxy.ts `resolveModule()` + nav-config.ts                                                                                                                            |
| Change JWT claims shape      | hook SQL + types.ts + scope.ts + proxy.ts. Always check `record.tenant_id IS NOT NULL` not `record IS NOT NULL` in plpgsql (see `PLPGSQL-RECORD-IS-NOT-NULL` regression).             |
| Cut a table's RLS to Auth v2 | DROP old policies + CREATE with `has_permission(branch_id, key)` (branch-scoped) or `has_permission_any(key)` (tenant-scoped). Keep structural gates (`branch_kind` checks) separate. |

## Design Rationale

- **JWT claims over DB lookup per request:** Performance. Claims are verified cryptographically without a DB round-trip. Trade-off: stale data until token refresh.
- **SECURITY DEFINER on hook:** Required by Supabase — the auth hook must read `profiles` which RLS would block during token minting.
- **Single ACL source:** `module-acl.ts` prevents drift between proxy, nav, and layout guards.
- **Single gate = proxy:** layouts and pages must not re-check session/claims/ACL. The 2026-04-17 cleanup removed duplicate guards from 8 layouts + 12 pages; those checks now live only in `proxy.ts`. `loadAuthState()` throws (not redirects) if claims are missing — silent redirects previously hid proxy bugs for months.
- **Invite-only (no self-signup):** Business requirement — staff are added by managers via Admin API with pre-set `tenant_id` + `role`.

<!-- ORACLE-META
Written by codebase-oracle (manual) | 2026-04-02
Data: Direct source reading
Audience: new engineer, feature owner | Confidence: 95%
Updated: Inventory route boundary + UX/nav sync (2026-04-16)
Unknowns: 1 (area_manager scoping)
-->
