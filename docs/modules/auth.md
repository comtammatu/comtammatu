# Auth & ACL Module

> **Auth (shipped 2026-04-22/23):** Position (HR chức vụ) is separated from Permission (quyền truy cập). Authz runs against a normalized `staff_permissions(user_id, branch_id, permission_key, valid_from, valid_until)` table, gated by RLS via `has_permission(branch_id, key)`. Legacy role strings (`branch_manager`, `cashier`, …) are still emitted in JWT as `user_role` for backward compat — they're derived from `positions.code mapper`. `profiles.role` column + `staff_role` enum **dropped**. See the Auth section below.

## Overview

Authentication and authorization for staff/operator surfaces. Protected requests pass through this module before reaching feature code. The auth chain spans four layers: Supabase Auth (identity), JWT custom claims hook (position + legacy-role injection), proxy.ts (route-level ACL enforcement), and RLS with `has_permission()` (row-level, permission-driven). Public customer surfaces such as `/br/[branchId]/runner` bypass staff login by design.

**Owner:** `packages/shared/src/auth/` + `apps/web/proxy.ts` + `supabase/migrations/*jwt*` + `supabase/migrations/*auth*`

Canonical role/scope/route boundaries live in `docs/spec/role-route-matrix.md`.
`module-acl.ts` remains the runtime route fast-gate source of truth; route,
navigation, and default-landing changes must keep the spec, `module-acl.ts`,
`route-map.ts`, and auth tests in sync.

## Components

| File                                                         | Purpose                                                                                        | Lines                     |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------- |
| `packages/shared/src/auth/types.ts`                          | Role enum, JWT claims shape (`user_role` + optional `position`), scope types                   | Core types                |
| `packages/shared/src/auth/module-acl.ts`                     | Module → allowed roles mapping, `canAccess()`, `getAccessibleModules()`                        | Route-level ACL (legacy)  |
| `packages/shared/src/auth/permissions.ts`                    | `PERMISSION_KEYS` (86 keys), `hasPermission()`, `hasAny/All` pure fns — **Auth authz**         | Permission catalog        |
| `packages/shared/src/auth/scope.ts`                          | `extractClaims()` + `decodeJwtAppMetadata()` + `extractClaimsFromAccessToken()`                | JWT claim extraction      |
| `packages/shared/src/auth/route-resolution.ts`               | Public/legacy/beta route helpers + URL → `ModuleKey` mapping                                   | Proxy route mapping       |
| `packages/shared/src/auth/route-map.ts`                      | Route family contract: surface, entry point, chrome, back behavior, breadcrumb root            | Navigation contract       |
| `packages/shared/src/auth/nav-config.ts`                     | Admin sidebar navigation groups filtered by role                                               | UI navigation             |
| `packages/shared/src/auth/app-discovery.ts`                  | Shared app discovery metadata derived from ACL + nav config                                    | Shell discovery contract  |
| `packages/shared/src/auth/blocked-state.ts`                  | Canonical blocked-state reasons, user-facing copy, `buildAccessDeniedPath()`                   | Access-state contract     |
| `apps/web/app/(public)/access-denied/page.tsx`               | Single presentation route for "authenticated but blocked" (renders copy from blocked-state)    | Access-state view         |
| `apps/web/app/_lib/auth.ts`                                  | `loadAuthState()` — shared claims reader for layouts/pages; throws if proxy invariant violated | Layout claims helper      |
| `apps/web/proxy.ts`                                          | Next.js middleware — **single auth gate**: session + claims + module ACL + branch scope        | Request gateway           |
| `supabase/migrations/*_jwt_custom_claims_hook.sql`           | `custom_access_token_hook()` — injects claims into JWT                                         | DB-level auth             |
| `supabase/migrations/20260422120000_auth_tables.sql`         | Auth core tables: `permission_keys`, `positions`, `role_templates`, `staff_permissions`        | Auth schema               |
| `supabase/migrations/20260422120002_auth_has_permission.sql` | `has_permission(branch, key)` / `has_permission_any(key)` SECURITY DEFINER helpers             | Auth RLS helpers          |
| `apps/web/app/(protected)/admin/staff/[id]/permissions/`     | Admin UI for grant/revoke + audit (page + client + actions)                                    | Permission admin UI       |
| `apps/web/app/_lib/permissions.ts`                           | Server helpers `fetchCurrentUserPermissions()` + `currentUserHasPermission()`                  | App-side permission reads |

Discovery invariant: `MODULE_ACL.hr_payroll` vẫn gate `/hr/payroll/*` cho
owner/super_manager, nhưng không nằm trong `DOMAIN_WORKSPACE_ITEMS` hoặc app
discovery mặc định. HKD pilot mở `/hr` cho nhân viên/ca/ngày công trước; payroll
chỉ là direct-support khi cần đối soát/chốt lương.

## Role Hierarchy

```
owner                          ← governance + tenant-wide oversight, including orders and inventory
├── super_manager              ← Tenant: vận hành + catalog NL, procurement
├── branch_manager             ← single branch command + operations
├── warehouse_manager          ← branch procurement workflow
├── production_manager         ← branch production workflow
├── cashier                    ← POS (/br/[branchId]/pos)
├── waiter                     ← POS (/br/[branchId]/pos)
├── chef                       ← KDS (/br/[branchId]/kds)
└── office                     ← back-office staff, explicit grants only
```

Compatibility access buckets (`owner`, `cashier`, …) still exist as `STAFF_ROLES` / `AccessBucket` TS constants and are emitted in JWT `user_role` for backward compatibility. They are derived from `positions.code` through the mapper in shared auth and SQL. HR display names live in `positions.label_vi` / `positions.label_en` and must not gate authz.

## RLS Gate Choice — `has_permission()` vs `auth_role()`

Two parallel ACL mechanisms exist; pick the right one:

- **`has_permission(branch_id, key)`** — queries `staff_permissions` live. Revoke is **immediate**. Use for destructive UPDATE/DELETE policies and any gate that must honor instant grant changes.
- **`auth_role()`** — reads JWT `user_role` claim (cached up to ~1h until token refresh). Use ONLY for: (a) scope/side guards inside RPC bodies (e.g. `branch_manager` forbidden from inter-site ship), (b) "tenant sees all branches" SELECT pattern (`branch_id = auth_branch_id() OR auth_role() IN HQ_ROLES`), (c) named ABAC helpers (`is_inventory_production_operator()`), (d) module-ACL fast-path on non-destructive read-mostly tables (e.g. `branch_menu_item_daily_limits` — see regression rule `BMIDL-RLS-INTENTIONAL-ROLE-FASTPATH`).

**Refactor history:**

- 2026-05-07 H2a — `refunds_update` policy migrated from `auth_role() IN ('owner','super_manager')` → `has_permission(branch_id,'orders:refund_approve')` (`supabase/migrations/20260601200000_h2a_refunds_update_perm_gate.sql`). Closed 1h stale-revoke window for refund approve/reject which is reachable via direct UPDATE in `apps/web/app/(protected)/orders/refund-actions.ts`.
- 2026-05-24 α4b — `admin_update_profile` and `toggle_profile_active` now derive actor role and branch live from `profiles + positions`; `set_branch_kind` gates on `settings:tenant`. `can_access_branch()` remains a separate RLS-policy batch because it is a shared branch-scope predicate.
- Backlog H2b — `hr_payroll` policies (`20260416040000:31,38,42,123,130,134`) follow same pattern; deferred pending business decision on payroll-specific permission keys.

## Invariants (post H3a, 2026-05-07)

- **`profiles.position_id` is NOT NULL** + FK `ON DELETE RESTRICT`. Every active or inactive profile MUST point to a seeded position in its tenant. Enforced by migration `20260601100000_auth_v3_h3a_position_id_required.sql`.
  - `handle_new_user` trigger raises `position_not_resolved` (SQLSTATE P0001) if `raw_app_meta_data->>'role'` does not map to a seeded position — signup fails loudly instead of inserting a broken profile.
  - `admin_update_profile` raises the same exception if a manager passes a role that does not resolve to a position for the tenant.
  - Deleting a position with active profiles raises `foreign_key_violation` (SQLSTATE 23503). Admins must reassign profiles before deleting.
- **Owner identity has three separate meanings.** `tenants.representative` is a free-text legal-document name (TEXT, not UUID), `positions.code='owner'` is the current runtime owner-bypass / JWT role source, and `tenants.owner_user_id UUID NOT NULL` is the canonical owner auth identity column for future ownership-transfer UI/RPC. Do not wire `representative` into auth. Do not add a dual-source `has_permission()` branch unless the deferred H3b flip is intentionally shipped. See ADR 0005: `docs/plan/adr/0005-owner-identity-source-separation.md`.

## Auth — Position vs Permission

| Concept        | Storage                                                                          | Purpose                                                                                                                                                                                                                                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Position**   | `positions` (per tenant) + `profiles.position_id`                                | HR chức vụ label. Codes are canonical English `lower_snake_case` ONLY — the 11-code set in `POSITION_CODE_TO_STAFF_ROLE` (shared TS) / `private.staff_role_from_position_code` (SQL twin); legacy Vietnamese codes were renamed/removed at the root by `20260610230000_canonical_position_codes_lean`. Display via `label_vi`. Does not gate authz. |
| **Permission** | `permission_keys` catalog (global)                                               | Canonical action strings: `inventory:read`, `pos:use`, 86 keys.                                                                                                                                                                                                                                                                                     |
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

| Module                                                     | owner | super_mgr | branch_mgr | wh_mgr | prod_mgr | cashier | waiter | chef | office |
| ---------------------------------------------------------- | ----- | --------- | ---------- | ------ | -------- | ------- | ------ | ---- | ------ |
| dashboard                                                  | ✓     | ✓         |            |        |          |         |        |      |        |
| menu                                                       | ✓     | ✓         | ✓          |        |          |         |        |      |        |
| inventory                                                  | ✓     | ✓         | ✓          | ✓      | ✓        |         |        |      |        |
| inventory_procurement (NCC, PO, GRN, HĐ NCC, công thức)    | ✓     | ✓         |            | ✓      | ✓        |         |        |      |        |
| inventory_admin (retired — empty allowed_roles)            |       |           |            |        |          |         |        |      |        |
| orders                                                     | ✓     | ✓         | ✓          |        |          | ✓       |        |      |        |
| staff                                                      | ✓     | ✓         |            |        |          |         |        |      |        |
| hr                                                         | ✓     | ✓         | ✓          |        |          |         |        |      |        |
| finance                                                    | ✓     | ✓         |            |        |          |         |        |      |        |
| accounting (direct-only period close/reopen)               | ✓     | ✓         |            |        |          |         |        |      |        |
| reports                                                    | ✓     | ✓         |            |        |          |         |        |      |        |
| settings                                                   | ✓     | ✓         |            |        |          |         |        |      |        |
| pos                                                        |       |           | ✓          |        |          | ✓       | ✓      |      |        |
| kds                                                        |       |           | ✓          |        |          |         |        | ✓    |        |
| runner (staff nav/discovery only; display route is public) |       |           | ✓          |        |          | ✓       | ✓      | ✓    |        |
| branch_dashboard                                           | ✓     | ✓         | ✓          |        |          |         |        |      |        |
| branch_settings                                            | ✓     | ✓         | ✓          |        |          |         |        |      |        |
| branch_menu_limits                                         | ✓     | ✓         | ✓          |        |          | ✓       |        | ✓    |        |
| employee                                                   |       |           | ✓          | ✓      | ✓        | ✓       | ✓      | ✓    | ✓      |
| notifications                                              | ✓     | ✓         | ✓          | ✓      | ✓        | ✓       | ✓      | ✓    | ✓      |

> `wh_mgr` = `warehouse_manager`, `prod_mgr` = `production_manager`. Route-level ACL đọc `user_role` từ JWT, derived từ `positions.code`. Row-level authz vẫn đi qua `has_permission(branch_id, key)` — matrix này chỉ là fast gate.
>
> Inventory mutating RPC chính đã permission-gated; phần `auth_role()` còn lại là route/side/scope guard hoặc legacy helper. Xem `docs/ref/inventory-rbac-matrix.md` §6.
>
> Runner exception: `/br/[branchId]/runner` is an exact public customer display path. `MODULE_ACL.runner` remains for staff discovery/navigation metadata, not for forcing Account Login on the board.

**Trang nhân viên boundary:** `employee` là bề mặt self-service / bàn giao vận hành cho staff không thuộc `ADMIN_ROLES`. `owner` và `super_manager` không vào `/employee/*`; request trực tiếp được đưa về Admin default route.

**Owner (chủ sở hữu):** ngoài các module quản trị / giám sát còn có thể vào `orders` và `inventory` để kiểm tra trực tiếp vận hành tenant-level. Tuy vậy owner không được coi là operator hằng ngày trong inventory docs/UI; các bề mặt Inventory hiện tối ưu cho `super_manager`, `branch_manager`, `warehouse_manager`, `production_manager`.

**Inventory sub-route ACL:** `inventory` allows `owner`, `super_manager`, `branch_manager`, `warehouse_manager`, `production_manager` cho tồn kho, điều chuyển, stocktake, expiry, reports, và branch operations. `inventory_procurement` ở cấp chi nhánh: `owner`, `super_manager`, `warehouse_manager`, `production_manager` vào `suppliers`, `purchase-orders`, `grn`, `supplier-invoices`, `recipes`, và `receiving` theo `route-resolution.ts`. `inventory_admin` (`/admin/inventory/*`) đã retired qua `allowedRoles: []`: page files đã removed, nhưng URL space vẫn map qua module này để proxy chặn bằng ACL chuẩn thay vì xem như admin route chưa phân loại. `production` không dùng module riêng; Server Actions và DB/RPC/RLS hard-deny `branch_manager` dù có manual production/menu grant. Operator production là `super_manager` / `production_manager`; `owner` có access kiểm tra/khẩn cấp nhưng không được UX dẫn như operator hằng ngày. `branch_manager` vì vậy chỉ nên thấy nhịp branch ops: nhận inbound transfer, tạo intra-branch transfer `Cấp bếp`, stocktake, adjustment/write-off.

**UX boundary quan trọng:** nav có thể hẹp hơn module-level ACL để giảm nhiễu vận hành. Ví dụ `branch_manager` vẫn vào được `/inventory/transfers` để nhận hàng, nhưng UI không nên quảng bá action tạo inter-site transfer như tác vụ mặc định của vai trò này.

**Route-map boundary:** `MODULE_ACL` trả lời "role có được vào module không";
`route-map.ts` trả lời "URL này thuộc surface nào và dùng chrome/back behavior
nào". Không dùng route-map để cấp quyền. Không dùng shell/nav local để bypass
`MODULE_ACL`. Route rời workspace phải dùng `resolveRoleHomeLink(role, branchId?)`
thay vì hardcode `/admin/dashboard`, vì non-admin role sẽ bị proxy đưa về
default khác.
Inventory route contract dùng danh sách active prefixes; unknown Inventory URL
không được giữ trong post-login `returnTo`.

**Settings surface boundary:** Tenant setup belongs under `/admin/settings/*`
and is for owner/super_manager. Branch setup belongs under
`/br/[branchId]/settings/*` and may include branch_manager for their own branch.
The runtime `settings` module excludes branch_manager; branch-scoped setup must
use `branch_dashboard` / `branch_settings` route families.

- `/admin/settings/branches` — owner, super_manager only (page-level redirect)
- `/admin/settings/general` — owner, super_manager only (page-level redirect)
- `/br/[branchId]/settings/tables`, `/br/[branchId]/settings/kds`, `/br/[branchId]/settings/pos`, `/br/[branchId]/settings/pos-sessions`, `/br/[branchId]/settings/printers` — branch setup roles with branch-scope enforcement

## Proxy Routing Logic — Single Gate

`apps/web/proxy.ts` is the **only** file that runs staff auth / ACL / branch-scope redirects. Layouts and pages for protected surfaces trust the proxy; they call `loadAuthState()` (`apps/web/app/_lib/auth.ts`) to read claims but never re-check them. If anything below is missing on a protected surface, the proxy has a gap — not the layout.

The `proxy(request)` function evaluates in order:

1. **Public paths bypass auth:** `/api/health`, `/api/webhooks`, `/sw.js`, `/access-denied`, `/payment/momo/*`, and exact `/br/[branchId]/runner` (`route-resolution.ts:isPublicAppPath`). The access-denied page is public so a blocked-but-authenticated user can read the copy without re-entering the ACL loop.
2. **Legacy canonical redirects:** `/admin/finance/*` redirects to `/finance/*` through `resolveLegacyRouteRedirectPath()` before module ACL. The same helper is used by post-login `returnTo` resolution.
3. **Login page:** authenticated users bounce to `resolvePostLoginRedirect(claims, returnTo, { surface })`; unauthenticated users see the form.
4. **Unauthenticated → `/login?returnTo=<current-url>`** (surface-aware: beta users go to `/beta/login`).
5. **Claims extraction:** if `extractClaims()` returns null, proxy redirects to `/access-denied?reason=missing-auth-context&from=<path>`. Proxy **does not** fabricate claims.
6. **Module ACL:** `resolveModuleFromPath(pathname)` maps URL → `ModuleKey`; `canAccess(role, moduleKey)` gates. Failure → `/access-denied?reason=insufficient-permission&from=<path>`, except disallowed Admin URLs and admin-level `/employee/*` visits redirect to the role's Admin default route.
7. **Branch-scope for POS/KDS/branch settings/menu limits:** if a protected branch-scoped URL is not reachable for the user's branch assignment → `/access-denied?reason=branch-scope-mismatch`. POS/KDS also reject `branch`/`branch` branches. These checks live in proxy; downstream protected layouts do not re-implement them. Runner rejects invalid/non-operational branches inside the public display page because it has no staff claims.

The resolver `resolvePostLoginRedirect(claims, returnTo, { surface?: "legacy" | "beta" })` (`packages/shared/src/auth/scope.ts`) is the **single** post-login destination function. Surface controls beta-prefix wrapping; the underlying ACL + branch-scope rules are shared. Unit tests live in `packages/shared/src/auth/__tests__/scope.test.ts` (run `pnpm --filter @comtammatu/shared test`).

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

`packages/shared/src/auth/blocked-state.ts` chốt reason codes của flow "authenticated but blocked":

- `insufficient-permission` — role hiện tại không vào được module/route đó
- `missing-auth-context` — session có user nhưng không resolve được claims cần thiết để authorize
- `branch-scope-mismatch` — URL có `branchId` nhưng `claims.branch_id` khác hoặc null (POS/KDS/branch settings/menu limits)
- `branch-surface-restricted` — POS/KDS mở trên branch không hợp lệ hoặc không active

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
- **Single gate = proxy:** layouts and pages must not re-check session/claims/ACL. The 2026-04-17 cleanup removed duplicate guards from 8 layouts + 12 pages; those checks now live only in `proxy.ts`. `loadAuthState()` throws (not redirects) if claims are missing — silent redirects previously hid proxy bugs for months.
- **Invite-only (no self-signup):** Business requirement — staff are added by managers via Admin API with pre-set `tenant_id` + `role`.
