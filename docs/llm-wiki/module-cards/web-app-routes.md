# Module Card — Web App & Routes

## Current State

The web app is a Next.js 16.2 App Router project with 109 `page.tsx` routes under `apps/web/app`.

The current architecture remains path-based, single-domain:

```text
Browser -> proxy.ts -> App Router -> Server Actions/RSC -> Supabase
```

## Top-Level Surfaces

- `/login`: auth.
- `/access-denied`: public blocked-state explanation.
- `/`: redirects to role default.
- `/admin/*`: tenant foundation, staff, settings, reports, feedback, compatibility redirects.
- `/employee/*`: employee self-service.
- `/br/[branchId]/pos`: POS.
- `/br/[branchId]/kds`: KDS.
- `/br/[branchId]/settings/*`: branch-scoped settings.
- `/br/[branchId]/menu-limits`: daily menu quota.
- `/inventory/*`: canonical Inventory workspace.
- `/finance/*`: Finance workspace.
- `/hr/*`: HR workspace.
- `/menu`: menu/catalog.
- `/orders`: order visibility.
- `/notifications`: durable notification inbox.
- `/payment/momo/return`: public payment return.
- `/r/[token]/*`: public QR feedback.

## Current Route Ownership

Do not add `/merchant/*` for the Super App/Merchant Platform rebuild. Use existing route owners:

- Payment collection: `/br/[branchId]/pos`.
- Payment provider setup: `/admin/settings/payments`.
- Reconciliation and finance reporting: `/finance/*`.
- Employee self-service: `/employee/*`.
- Management and configuration: `/admin/*`, `/hr/*`, `/inventory/*`, `/finance/*`.

## Admin Is Narrower Now

`/admin/*` is not the universal home for every domain. It owns foundation, executive reporting, settings, staff, and feedback.

Retired or compatibility areas:

- `/admin/inventory/*` is a retired URL space mapped to `inventory_admin.allowedRoles = []`; page files have been removed.
- `/admin/finance/[[...slug]]` is compatibility redirect behavior into Finance.
- Deep domain workflows should stay in dedicated workspaces.

## Route Creation Rule

Create a new page only when the workflow needs durable browser history, a distinct ACL/data boundary, a real entity detail route, a long/line-heavy workflow, or shareable report filters.

Use tabs/query/sheets/dialogs for sub-views, short forms, and contextual details.

## High-Impact Files

- `apps/web/proxy.ts`
- `packages/shared/src/auth/route-resolution.ts`
- `packages/shared/src/auth/module-acl.ts`
- `packages/shared/src/auth/nav-config.ts`
- `packages/shared/src/auth/app-discovery.ts`
- `apps/web/app/components/app-shell.tsx`
- `apps/web/app/components/surface.tsx`

## What To Do Next

For IA work:

1. Read `docs/modules/web-app.md`, `docs/spec/architecture.md`, and `tasks/todo.md`.
2. Decide route owner before touching UI.
3. Check route resolver and module ACL.
4. Keep `/employee` narrow and task-led.
5. Avoid app-launcher duplication across admin and employee surfaces.
