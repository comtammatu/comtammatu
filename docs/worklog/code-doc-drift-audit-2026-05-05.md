# Code / Docs Drift Audit — 2026-05-05

> Scope: read-only audit after report "Docs va Codebase dang khac xa nhau".
> Workflow: documentation-only audit, so the 4-agent debate is skipped per `docs/agent/rules/workflow.md`.
> Workspace note: worktree is already dirty; this audit does not modify existing docs or runtime code.

## Executive Summary

Docs drift is real and material. The most risky drift is not wording; it changes how an engineer would reason about routes, auth, and database shape.

Runtime evidence from the current workspace:

- `apps/web/app` has 108 `page.tsx` routes.
- `packages/database/src/types/database.types.ts` contains 102 tables, 8 views, and 178 RPC/function entries.
- `packages/shared/src/auth/permissions.ts` declares `PERMISSION_KEY_COUNT = 87`.
- `packages/shared/src/auth/module-acl.ts` includes current module keys that several docs omit: `inventory_admin`, `accounting`, `branch_settings`, `branch_menu_limits`, and `notifications`.
- `supabase/migrations` has 273 migration files, with filenames through `20260526000000_print_templates_document_ast.sql`. That is later than this audit date, 2026-05-05, so migration status docs must separate "file exists", "applied to dev", and "applied to generated type source".

## P0 Drift

### 1. Database docs are from an older schema era

Docs:

- `docs/modules/database.md` says "Schema (Sprint 1 complete)" and lists 19 tables.
- `docs/spec/database-schema.md` still documents `profiles.role`, `staff_role ENUM`, and future area scoping.

Runtime:

- Generated types have 102 tables, 8 views, and 178 function entries.
- Generated `profiles` row has `position_id` and `area_id`; it does not have `role`.
- Generated types have no enum entries.
- Auth v2 tables are runtime-visible: `positions`, `permission_keys`, `role_templates`, `staff_permissions`, `permission_audit_log`.

Risk:

- New database work may follow obsolete RLS and role guidance.
- Engineers may add direct role checks against columns/enums that no longer exist.
- Migration/type status is hard to trust.

Fix:

- Replace `docs/modules/database.md` schema section with a generated-type snapshot and links by domain.
- Rewrite `docs/spec/database-schema.md` around current Auth v2 and domain table groups, or archive the old Sprint 1 schema as historical.
- Add a small "DB source-of-truth hierarchy": migration files vs applied dev DB vs generated `database.types.ts`.

### 2. Route / IA docs contradict runtime

Docs:

- `docs/CODEBASE_MAP.md` says `/admin/inventory*` has been removed and is no longer supported.
- `docs/modules/web-app.md` says `/inventory` is the only live Inventory domain and should not be mirrored under `/admin/*`.
- `docs/spec/architecture.md` describes only Admin, POS, KDS, and Employee as browser surfaces.

Runtime:

- `/admin/inventory` exists with `cold-chain`, `express-windows`, `feature-flags`, and `trust`.
- ACL has `inventory_admin` for `/admin/inventory`.
- Admin nav exposes `inventory_admin` as `Cau hinh kho`.
- Live top-level workspaces also include `/inventory`, `/finance`, `/hr`, `/menu`, `/orders`, `/notifications`, `/payment/momo/return`, branch settings, and branch menu limits.

Risk:

- Engineers may delete or bypass live admin inventory tooling because docs say it is removed.
- New routes can be mapped to the wrong ACL module.
- QA may miss branch-scoped settings and quota routes.

Fix:

- Make `packages/shared/src/auth/route-resolution.ts` and `module-acl.ts` the source of truth for route/module docs.
- Update `docs/CODEBASE_MAP.md`, `docs/modules/web-app.md`, and `docs/spec/architecture.md` in one PR.
- Explicitly define `/admin/inventory` as configuration/admin tooling, distinct from `/inventory` operations.

### 3. Auth / ACL docs are internally inconsistent

Docs:

- `docs/modules/auth.md` top section correctly says Auth v2 dropped `profiles.role` and `staff_role`.
- The same file still says `area_manager` has tenant-wide access with no area scoping.
- Its ACL matrix does not match `module-acl.ts` for several modules.
- It says `PERMISSION_KEYS` has 62 keys.

Runtime:

- `STAFF_ROLES` includes `warehouse_manager` and `production_manager`.
- `PERMISSION_KEY_COUNT = 87`.
- `dashboard` is owner/super_manager only.
- `menu` includes owner.
- `staff` is owner/super_manager only.
- `crm` is owner/super_manager only.
- `branch_settings`, `branch_menu_limits`, `inventory_admin`, `accounting`, and `notifications` are real module keys.
- Default post-login route is `/admin/dashboard` only for owner/super_manager; all other staff default to `/employee`.

Risk:

- Access changes can be made against stale docs and accidentally widen or narrow access.
- Onboarding engineers may misunderstand which roles are operational vs admin.

Fix:

- Replace the handwritten ACL matrix with a generated table from `MODULE_ACL`.
- Update Auth v2 counts and role hierarchy.
- Add default landing route behavior from `packages/shared/src/auth/scope.ts`.

## P1 Drift

### 4. Roadmap and task status disagree

Docs:

- `docs/plan/roadmap.md` says M4/M6/M7 are partial.
- `tasks/todo.md` says M0-M7 are shipped, then lists P0 gaps and "WAITING/APPLY" statuses.

Runtime:

- Many payment, finance, payroll, refunds, webhook, period-close, print-agent, and inventory hardening migrations/files exist.
- Generated DB types already include tables/functions that todo entries describe as awaiting apply in some places.

Risk:

- "Hoàn thành" is being used for schema-file exists, dev-applied, type-generated, UI-wired, and pilot-ready interchangeably.

Fix:

- Define status vocabulary: `planned`, `migration drafted`, `applied to dev`, `types generated`, `UI wired`, `pilot-ready`, `prod-applied`.
- Split roadmap into product status and implementation/deployment status.
- Review all items with filenames after 2026-05-05 because their timestamps are future relative to this audit date.

### 5. Web app route tree docs are incomplete

Missing or stale in docs:

- `/access-denied`
- `/orders`
- `/notifications`
- `/admin/accounting/periods`
- `/admin/inventory/*`
- `/br/[branchId]/settings/*`
- `/br/[branchId]/menu-limits`
- `/inventory/m/*`
- `/inventory/waste/*`
- `/inventory/settings/qc`
- `/inventory/supplier-credit-notes`
- `/api/branch-presence`
- `/api/debug/claims`
- `/api/webhooks/momo`
- print-agent package and printer fleet routes

Fix:

- Regenerate route inventory from `apps/web/app`.
- Keep detailed route list in `docs/modules/web-app.md`.
- Keep high-level surface map in `docs/spec/architecture.md`.

## Recommended Sync Plan

1. Freeze canonical sources:
   - Routes/ACL: `packages/shared/src/auth/route-resolution.ts`, `module-acl.ts`, `nav-config.ts`.
   - DB shape: `packages/database/src/types/database.types.ts`.
   - Migrations: `supabase/migrations`.
   - UI contract: `docs/spec/design-system.md` plus `packages/ui/src/styles/globals.css` and component manifests.

2. First cleanup PR, docs-only:
   - Update `docs/CODEBASE_MAP.md`.
   - Update `docs/modules/web-app.md`.
   - Update `docs/spec/architecture.md`.
   - Update `docs/modules/auth.md` ACL/default-route sections.
   - Add a short generated route snapshot.

3. Second cleanup PR, docs-only:
   - Rewrite `docs/modules/database.md`.
   - Rewrite or archive `docs/spec/database-schema.md`.
   - Add database source-of-truth and migration status vocabulary.

4. Third cleanup PR:
   - Normalize `docs/plan/roadmap.md` and `tasks/todo.md` statuses.
   - Resolve future-dated migration wording explicitly: file date, intended apply date, actual apply status.

5. Add a lightweight drift check:
   - Generate route list from `apps/web/app`.
   - Generate module ACL table from `module-acl.ts`.
   - Generate DB object counts from `database.types.ts`.
   - Fail CI only when a tracked snapshot changes without docs update.

## Suggested Acceptance Criteria

- No active doc claims `/admin/inventory*` is removed while the route exists.
- No active doc claims `profiles.role` or `staff_role ENUM` is current.
- Auth docs match `MODULE_ACL`, `STAFF_ROLES`, `PERMISSION_KEY_COUNT`, and `getDefaultRedirect`.
- Web app docs include every top-level route family and every route module key.
- Database docs describe current domain groups instead of the old 19-table Sprint 1 shape.
- Roadmap/todo status labels distinguish code existence from deployed/applied/pilot-ready status.
