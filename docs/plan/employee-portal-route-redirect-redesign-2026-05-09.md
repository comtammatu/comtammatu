# Cổng nhân viên và điểm làm việc - thiết kế route và redirect

Date: 2026-05-09
Status: implementation-ready
Skill: gstack `/autoplan` style review, run in-thread because subagent delegation was not authorized in this tool session.

## Problem

`/employee` is currently doing two jobs:

- Personal self-service: profile, clock, attendance, schedule, payslip.
- Cross-app launchpad: POS, KDS, orders, inventory, menu, HR, settings, feedback.

That creates the gap called out by the owner: when owner, super manager, managers, and frontline staff all sign in, the product does not clearly answer "where am I supposed to go now?" The route name says employee self-service, but the screen also acts as the system launcher.

## Current System Map

- `apps/web/app/(auth)/login/actions.ts` signs in, extracts JWT claims, then redirects through `resolvePostLoginRedirect`.
- `apps/web/proxy.ts` redirects authenticated login visits through `resolvePostLoginRedirect`, and unauthenticated private routes to `/login?returnTo=...`.
- `packages/shared/src/auth/scope.ts` is the single post-login resolver.
- `packages/shared/src/auth/route-resolution.ts` maps path prefixes to `ModuleKey`.
- `packages/shared/src/auth/module-acl.ts` is the module ACL source of truth.
- `apps/web/app/employee/page.tsx` renders both self-service cards and role-based management handoffs.
- `packages/shared/src/auth/app-discovery.ts` already has a shared app discovery model for admin, workspaces, and branch operations.

## Decision

Create a universal `/portal` route as the only default post-login landing page for the legacy surface.

Keep `/employee` as personal self-service for all staff. Do not remove it. Do not force direct POS/KDS/Admin defaults because those have branch, network, and permission edge cases. The portal shows one primary recommended destination plus the full allowed app list.

Valid `returnTo` still wins when it resolves to an accessible module and matches branch scope. That preserves deep links and shared terminal flows.

Beta keeps its existing defaults because this repo does not currently contain a `/beta/portal` route.

## Redirect Contract

```text
Unauthenticated private route
  -> /login?returnTo=<current path>

Successful login
  -> if returnTo is safe + allowed + branch-scoped OK: returnTo
  -> else /portal

Authenticated visit to /login
  -> same resolver as successful login

Visit /
  -> /portal

Visit /employee
  -> personal self-service only, not the canonical app launcher
```

## Role Landing Matrix

| Role | `/portal` primary action | Secondary discovery |
| --- | --- | --- |
| owner | `/admin/dashboard` | Finance, HR, Inventory, settings, reports, employee self-service |
| super_manager | `/admin/dashboard` | Finance, HR, Inventory, settings, reports, employee self-service |
| area_manager | `/inventory` | Orders, menu, branch settings/menu limits where allowed |
| branch_manager | `/orders` | POS, KDS, Inventory, menu, branch settings/menu limits |
| warehouse_manager | `/inventory` | Procurement and receiving surfaces exposed by ACL/permission |
| production_manager | `/inventory/production` | Inventory production and catalog surfaces exposed by ACL/permission |
| cashier | `/br/{branchId}/pos` when branch exists | Employee self-service, notifications, allowed branch tools |
| waiter | `/br/{branchId}/pos` when branch exists | Employee self-service, notifications |
| chef | `/br/{branchId}/kds` when branch exists | Employee self-service, menu limits, notifications |
| office | `/employee` | Employee self-service and notifications |

Missing branch context never generates a broken deep link. The portal shows a blocked/needs-setup state and points the user to self-service/profile instead.

## Four-Perspective Checkpoint

PM:
The scope should solve the destination confusion, not redesign every module shell. Acceptance is clear: login fallback lands on `/portal`; `/employee` no longer has to explain all product areas; every role gets one obvious next step and can still reach self-service.

BA:
The business rule is not "all staff are employees" but "all users need a work entry point." Owner and super manager are governance users, branch staff are operational users, and everyone still has personal HR tasks. The route model must represent that distinction.

Senior Dev:
The safest architecture is a small route and ACL addition, not a redirect web of role-specific destinations. Reuse `resolvePostLoginRedirect`, `MODULE_ACL`, `resolveModuleFromPath`, and app discovery. Keep URL scope in paths only.

QA/QC:
Test the pure resolver first: default fallback, safe returnTo, unsafe returnTo, branch mismatch, portal module resolution, and all-role portal ACL. Then run shared auth tests plus typecheck/lint/build before calling the implementation complete.

## Autoplan Review

### CEO Review

Premise accepted: the current gap is product IA, not only UI copy. The user needs a named home that matches the job-to-be-done. The complete fix is to separate universal work entry from employee self-service.

Alternative rejected: direct every role to a deep route after login. It looks efficient for cashier/chef, but fails when branch context is missing, POS/KDS network gate blocks, or a manager has multiple valid jobs.

Alternative rejected: keep `/employee` as the universal launcher and rename panels. That keeps the same overloaded route and repeats the current mistake.

### Design Review

The portal should be a dense operational launcher, not a marketing dashboard. First viewport shows:

1. Identity and scope: role + branch.
2. One primary destination card.
3. Allowed app groups from the shared discovery contract.
4. Personal self-service as a clearly labeled secondary group.

No new visual system. Use `AppPage`, `AppPageHeader`, `AppSection`, `AppLinkCard`, `Badge`, and `Button`.

### Engineering Review

Implementation slices:

1. Add `portal` module to labels, ACL, and route resolver.
2. Change legacy `getDefaultRedirect` to `/portal`; keep beta default behavior unchanged.
3. Add `/portal/page.tsx` using server-side claims and employee context.
4. Keep `/employee` intact for self-service until a later cleanup pass can remove management launchpad duplication.
5. Update shared auth tests and architecture docs.

### DX Review

Future maintainers should find the rule in one place:

- route access: `module-acl.ts`
- route classification: `route-resolution.ts`
- post-login fallback: `scope.ts`
- portal composition: `/portal/page.tsx`

Avoid adding local redirect logic in pages or layouts.

## Error And Rescue Registry

| Failure | User-visible symptom | Rescue |
| --- | --- | --- |
| User has no branch but role expects POS/KDS | Portal cannot build branch URL | Show setup/self-service card instead of broken link |
| User follows stale admin URL | Proxy resolves ACL failure | Fallback to `/portal`, not `/employee` |
| User follows valid deep link | Deep link preserved after login | `returnTo` remains first priority |
| Permission revoked while JWT role still allows module | Route may pass fast ACL but RLS/action blocks | Keep permission-critical gates in Server Actions/RLS |
| POS/KDS network gate blocks device | `/access-denied?reason=untrusted-network` | Portal remains reachable; user can switch task or report setup issue |

## Failure Modes Registry

| Risk | Severity | Mitigation |
| --- | --- | --- |
| `/portal` not added to ACL resolver | High | Add module key + tests for `resolveModuleFromPath("/portal")` |
| Owner loses fast access to dashboard | Medium | Primary portal card points to `/admin/dashboard`; valid dashboard returnTo still preserved |
| Employee portal duplicate launchpad remains | Medium | Accept as transition state; mark follow-up cleanup |
| Beta routes accidentally point to missing `/beta/portal` | Medium | Keep `getBetaDefaultRedirect` unchanged |
| New copy violates terminology rules | Medium | Use Vietnamese canonical labels and shared message file |

## Not In Scope

- Removing role launcher panels from `/employee` in this pass.
- Changing RLS, permission grants, or JWT claim shape.
- Adding multi-branch selection for owner/super manager.
- Reworking Admin, Inventory, POS, or KDS shells.
- Changing POS/KDS network gate behavior.

## Test Plan

Run:

```bash
pnpm --filter @comtammatu/shared test
pnpm typecheck
pnpm lint
pnpm build
```

Targeted assertions:

- `getDefaultRedirect(owner)` and every legacy role return `/portal`.
- `resolvePostLoginRedirect(role, validReturnTo)` still preserves accessible deep links.
- `resolvePostLoginRedirect(role, invalidReturnTo)` falls back to `/portal`.
- `/portal` resolves to module `portal` and `canAccess(role, "portal")` is true for every `STAFF_ROLES` value.
- Beta default tests remain unchanged.

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | CEO | Create `/portal` instead of overloading `/employee` | Mechanical | Explicit over clever | Route name now matches user job | Keep `/employee` as universal launcher |
| 2 | Eng | Make `/portal` default fallback, preserve valid `returnTo` | Mechanical | Completeness | Solves login ambiguity without breaking deep links | Direct role-to-app redirects |
| 3 | Design | Use existing app surface primitives only | Mechanical | DRY | Maintains locked design system | New portal-only visual system |
| 4 | DX | Keep beta defaults unchanged | Mechanical | Pragmatic | No `/beta/portal` route exists | Point beta users to missing route |
