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
| `packages/shared/src/auth/app-discovery.ts`        | Shared app discovery metadata derived from ACL + nav config                                    | Shell discovery contract   |
| `packages/shared/src/auth/blocked-state.ts`        | Canonical blocked-state reasons, user-facing copy, `buildAccessDeniedPath()`                   | Access-state contract      |
| `apps/web/app/access-denied/page.tsx`              | Single presentation route for "authenticated but blocked" (renders copy from blocked-state)    | Access-state view          |
| `apps/web/app/_lib/auth.ts`                        | `loadAuthState()` — shared claims reader for layouts/pages; throws if proxy invariant violated | Layout claims helper       |
| `apps/web/proxy.ts`                                | Next.js middleware — **single auth gate**: session + claims + module ACL + branch scope        | Request gateway            |
| `supabase/migrations/*_jwt_custom_claims_hook.sql` | `custom_access_token_hook()` — injects claims into JWT                                         | DB-level auth              |

## Role Hierarchy

```
owner                          ← governance + tenant-wide oversight, including orders and inventory
├── super_manager              ← Trụ sở: vận hành + catalog NL, procurement
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

| Module                                                  | owner | super_mgr | area_mgr | branch_mgr | cashier | waiter | chef | office |
| ------------------------------------------------------- | ----- | --------- | -------- | ---------- | ------- | ------ | ---- | ------ |
| dashboard                                               | ✓     | ✓         | ✓        | ✓          |         |        |      |        |
| menu                                                    |       | ✓         | ✓        | ✓          |         |        |      |        |
| inventory                                               | ✓     | ✓         | ✓        | ✓          |         |        |      |        |
| inventory_procurement (NCC, PO, GRN, HĐ NCC, công thức) | ✓     | ✓         |          |            |         |        |      |        |
| orders                                                  | ✓     | ✓         | ✓        | ✓          |         |        |      |        |
| staff                                                   |       | ✓         | ✓        | ✓          |         |        |      |        |
| hr                                                      | ✓     | ✓         |          |            |         |        |      |        |
| crm                                                     |       | ✓         | ✓        |            |         |        |      |        |
| finance                                                 | ✓     | ✓         |          |            |         |        |      |        |
| reports                                                 | ✓     | ✓         | ✓        | ✓          |         |        |      |        |
| settings                                                | ✓     | ✓         | ✓        | ✓          |         |        |      |        |
| pos                                                     |       |           |          | ✓          | ✓       | ✓      |      |        |
| kds                                                     |       |           |          | ✓          |         |        | ✓    |        |
| employee                                                | ✓     | ✓         | ✓        | ✓          | ✓       | ✓      | ✓    | ✓      |

**Owner (chủ sở hữu):** ngoài các module quản trị / giám sát còn có thể vào `orders` và `inventory` để kiểm tra trực tiếp vận hành tenant-level. Tuy vậy owner không được coi là operator hằng ngày trong inventory docs/UI; các bề mặt Inventory hiện tối ưu cho `super_manager`, `area_manager`, `branch_manager`.

**Inventory sub-route ACL:** `inventory` allows `owner`, `super_manager`, `area_manager`, `branch_manager` cho tồn kho, điều chuyển, stocktake, expiry, reports, và branch operations. `inventory_procurement` vẫn hẹp ở cấp trụ sở: `owner` và `super_manager` vào `suppliers`, `purchase-orders`, `grn`, `supplier-invoices`, `recipes`, và `receiving` theo `route-resolution.ts`. `production` không dùng module riêng nhưng page/nav đang giữ hẹp cho `super_manager` ở UI layer và page guard. `branch_manager` vì vậy chỉ nên thấy nhịp branch ops: nhận transfer, `kitchen_use` (`Cấp bếp`), stocktake, adjustment.

**UX boundary quan trọng:** nav có thể hẹp hơn module-level ACL để giảm nhiễu vận hành. Ví dụ `branch_manager` vẫn vào được `/inventory/transfers` để nhận hàng, nhưng UI không nên quảng bá action tạo inter-site transfer như tác vụ mặc định của vai trò này.

**Settings sub-page ACL:** The settings module allows area_manager and branch_manager, but sub-pages have additional guards:

- `/admin/settings/branches` — owner, super_manager only (page-level redirect)
- `/admin/settings/general` — owner, super_manager only (page-level redirect)
- `/admin/settings/tables` — all settings roles (area_manager, branch_manager see only their branch data)

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

> *After `proxy()` returns, any layout or page downstream can assume: the user is authenticated, claims are valid, the role has module access, and — for `/br/[branchId]/{pos,kds}` — branch scope matches.*

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

| Change                       | Affected                                                           |
| ---------------------------- | ------------------------------------------------------------------ |
| Add new role to `staff_role` | Migration + types.ts + module-acl.ts + scope.ts + all RLS policies |
| Add new module to ACL        | module-acl.ts + proxy.ts `resolveModule()` + nav-config.ts         |
| Change JWT claims shape      | jwt hook SQL + types.ts + scope.ts + proxy.ts                      |

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
