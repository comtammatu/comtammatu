# Admin Page Rebuild Plan

> Updated: 2026-04-25 | Status: planning contract | Surface: `/admin/*`

## Decision

Rebuild Admin as a dense management workspace, not a decorative dashboard.

The first implementation scope is intentionally narrow:

- `/admin` shell and navigation
- `/admin/dashboard`
- `/admin/settings/*`
- `/admin/staff`
- `/admin/staff/*`

The broader `/admin` route family must still be documented in the contract before implementation touches runtime UI:

- `/admin/reports/*`
- `/admin/inventory/*`
- `/admin/accounting/periods`
- `/admin/crm`

Do not add `/admin/menu` or `/admin/orders` in this rebuild wave. Runtime routes are currently `/menu` and `/orders`.

## Source Of Truth

Read and obey these before implementation:

- `AGENTS.md`
- `docs/agent/rules/engineering.md`
- `docs/agent/rules/database.md`
- `docs/agent/rules/ui.md`
- `docs/agent/rules/workflow.md`
- `docs/agent/rules/references.md`
- `docs/spec/design-system.md`
- `docs/modules/ui.md`
- `docs/modules/auth.md`
- `docs/plan/ui-ux-rebuild.md`
- `docs/plan/ui-ux-page-contracts.md`
- `tasks/regressions.md`

Runtime authority:

- `apps/web/components.json`
- `packages/ui/components.json`
- `packages/ui/src/styles/globals.css`
- `apps/web/app/layout.tsx`
- `packages/ui/src/components/*`
- `packages/shared/src/auth/module-acl.ts`
- `packages/shared/src/auth/route-resolution.ts`
- `apps/web/proxy.ts`

## 4-Agent Debate Summary

### PM

- Admin should be rebuilt as P1 after Login/POS/KDS.
- Staff and Settings are the highest-value MVP because they are real management workflows.
- Dashboard should be an action hub, not a card mosaic.
- First PR should not absorb Inventory, Finance, HR, POS, KDS, `/menu`, or `/orders`.

### BA

- Admin business jobs split into tenant-level cockpit, staff/permission management, branch-floor settings, policy tools, reporting, and accounting controls.
- Current route access is inconsistent: some Admin pages are allowed by module ACL but blocked by the blanket dashboard gate.
- Branch/tenant scope must be explicit and server-authoritative.
- Copy should use Vietnamese utility language and canonical glossary/shared labels.

### Senior Dev

- Keep Admin pages as RSC data loaders with small client islands for tables, filters, dialogs, and action states.
- Fix route/module ACL consistency and sidebar icon mapping before visual work.
- Introduce small composition wrappers only when they reduce repeated layout work: `AdminPageHeader`, `AdminToolbar`, `AdminTableShell`.
- Use only `@comtammatu/ui/components/*` primitives and app form helpers.

### QA/QC

- Admin route contracts must be written before runtime edits.
- Verify module ACL, proxy route resolution, sidebar visibility, page guards, and Server Actions independently.
- Hidden UI is not security.
- Implementation is incomplete until `pnpm typecheck && pnpm lint && pnpm build` passes and browser/role checks are recorded.

## Agreements

- Admin is a management workspace: tables, filters, forms, review states, and action queues outrank decorative summaries.
- Design system remains locked to shadcn `radix-lyra`, `stone`, Tabler icons, semantic tokens, and existing primitives.
- No fake primitives, route-specific theme layer, arbitrary Tailwind dimensions, static presentation inline styles, or raw palette status styling.
- Route/auth/nav reconciliation is Gate 0 and must happen before broad visual rebuild.
- Scope/filter state must be URL-addressable or server-derived. Never use localStorage or React Context for scope.
- Server Actions keep Zod validation, permission checks, tenant/branch revalidation, and safe mapped error messages.

## Conflicts And Resolutions

### Full `/admin` vs MVP scope

Conflict: PM recommended a narrow MVP; BA/Senior Dev/QA wanted every live Admin route represented.

Resolution: Gate 0 documents the full live `/admin` family. The first runtime implementation wave stays limited to shell, dashboard, settings, staff, and staff permissions. Reports, inventory admin, accounting, and CRM are later waves unless an ACL/nav fix is required to unblock the shell.

### Dashboard gate vs module-specific Admin access

Conflict: `proxy.ts` currently blocks every `/admin/*` path for users without `dashboard`, while `MODULE_ACL` allows some manager roles into `settings` and `inventory_admin`.

Resolution: Treat this as a blocking contract issue. Implementation must reconcile `isAdminRoutePath`, `resolveModuleFromPath`, `MODULE_ACL`, and `resolveAdminNavGroups` before UI polish.

### Visual refactor vs behavior change

Conflict: A pure visual pass is safer, but Admin currently has route/ACL mismatches that affect who can reach pages.

Resolution: First implementation may include route/auth/nav fixes needed to make Admin coherent. It must not change database schema, business rules, or write behavior unless a separate debate approves it.

### Branch-floor settings and tenant-wide grants

Conflict: Owner/manager settings visibility and tenant-wide permission grants are not fully aligned across docs, nav, and actions.

Resolution: Mark as Gate 0 discovery. Do not solve with UI-only conditionals. Decide the policy, then update module ACL, route resolution, page guards, actions, and docs together.

## Gate 0: Contract, Auth, And Nav

This gate must finish before rebuilding the visual surface.

1. Add detailed Admin route contracts to `docs/plan/ui-ux-page-contracts.md` or a dedicated Admin contract doc.
2. Resolve stale `/admin/menu` and `/admin/orders` references. Runtime routes are `/menu` and `/orders`.
3. Map `/admin/inventory` to `inventory_admin` and `/admin/accounting` to `accounting` in `resolveModuleFromPath`.
4. Replace the blanket `/admin/*` dashboard gate with module-specific Admin access logic, while keeping `/admin` root redirect behavior.
5. Align `MODULE_ACL`, `resolveAdminNavGroups`, `AdminShell`, page guards, and settings sub-page guards.
6. Fix Admin sidebar icon mapping so shared nav icon names resolve to Tabler icons instead of falling back.
7. Replace empty role allowlists such as `getAuthContextWithPermission([], ...)` with concrete role lists or `STAFF_ROLES` according to the intended policy.
8. Confirm owner access to branch-floor settings and tenant-wide permission grant behavior.
9. Make every branch-scoped Admin filter URL-addressable and every branch-scoped mutation re-validate the target branch server-side.

## Route Contract Inventory

| Route | Primary Job | Initial Wave |
| --- | --- | --- |
| `/admin` | Redirect to Admin landing | Gate 0 |
| `/admin/dashboard` | Action hub and operational snapshot | MVP |
| `/admin/settings` | Settings index | MVP |
| `/admin/settings/branches` | Tenant branch setup | MVP |
| `/admin/settings/general` | Tenant general setup | MVP |
| `/admin/settings/payments` | Payment configuration | MVP |
| `/admin/settings/areas` | Area/branch grouping | MVP |
| `/admin/settings/tables` | Branch floor/table setup | MVP |
| `/admin/settings/pos` | POS terminal setup | MVP |
| `/admin/settings/kds` | Kitchen station setup | MVP |
| `/admin/settings/printers` | Printer setup | MVP if linked in settings nav |
| `/admin/settings/printers/jobs` | Print job monitoring | Later admin tools wave |
| `/admin/staff` | Staff management | MVP |
| `/admin/staff/audit` | Staff/admin audit trail | Later admin tools wave |
| `/admin/staff/[id]/permissions` | Permission grant/revoke/template | MVP |
| `/admin/reports/*` | Executive reports | Later wave |
| `/admin/inventory/*` | Inventory policy/admin tools | Later wave |
| `/admin/accounting/periods` | Accounting period close/reopen | Later wave, high security |
| `/admin/crm` | CRM placeholder or future tool | Later wave |

## Implementation Waves

### Wave 0 - Admin Contract/Auth/Nav

- Write route contracts.
- Fix route resolution and Admin access policy.
- Fix sidebar icon mapping and nav visibility.
- Decide branch-floor settings and tenant-wide grant policy.

Acceptance:

- Direct URL access, sidebar visibility, and page guards agree.
- Forbidden routes redirect according to the shared blocked/default-landing contract.
- No UI component invents its own access policy.

### Wave 1 - Khung quản trị

- Standardize `AdminShell` header, breadcrumb, primary action area, and page title rhythm.
- Remove duplicate hero-like headings inside child pages where the shell already provides page context.
- Add small wrappers only if they compose real primitives without restyling them.

Allowed primitives:

- `Sidebar`
- `Breadcrumb`
- `Button`
- `Badge`
- `Separator`
- `Empty`
- `Skeleton`
- `Spinner`

### Wave 2 - Staff And Permissions

- Rebuild staff list around URL filters, table/list responsive layout, shared empty states, and safe action menus.
- Keep create/update/toggle actions behind Auth v2 permission helpers and RPC/service-role paths.
- Normalize permission detail page around grant/revoke/template flows and audit trail.

Allowed primitives:

- `Table`
- `DropdownMenu`
- `Dialog` or `FormDialog`
- `AlertDialog`
- `Badge`
- `InputGroup`
- `Select`
- `FieldGroup`
- `Empty`

### Wave 3 - Settings

- Normalize settings nav, table/list shells, branch selector behavior, and CRUD dialogs.
- Move branch selection for branch-floor settings from client-only state to URL params where it controls the operational scope.
- Keep tenant strategy pages separate from branch-floor pages.

Target pages:

- Branches
- General
- Payments
- Areas
- Tables and zones
- POS terminals
- KDS stations
- Printers

### Wave 4 - Dashboard

- Keep dashboard as a route/action hub.
- Reduce decorative stat-card mosaics unless a summary directly supports a management decision.
- Verify date calculations against Vietnam business-day/timezone expectations before changing business metrics.

### Wave 5 - Reports, Inventory Admin, Accounting, CRM

- Add route-specific contracts before touching each group.
- For reports, re-check materialized view access and `RLS-NOT-APPLIED-ON-MV`.
- For accounting periods, verify `accounting:period_reopen`, 2FA/policy requirements, and high-risk action confirmation.
- Keep CRM scoped as placeholder unless business requirements exist.

## Non-Goals

- Do not redesign the design system.
- Do not add a new Admin theme or page-specific visual language.
- Do not create `/admin/menu` or `/admin/orders`.
- Do not move `/inventory`, `/finance`, `/hr`, `/menu`, `/orders`, POS, or KDS into this MVP.
- Do not apply migrations directly.
- Do not change data model or permission semantics through UI-only conditionals.

## Acceptance Criteria

- Admin route contract names the surface, user job, route family, change type, primitives, risks, and acceptance tests.
- Admin pages share one shell/header rhythm and do not duplicate page identity in nested cards.
- Each MVP page has a clear toolbar/filter row, count/status context, table/list content, and approved empty/loading/error state.
- CRUD dialogs use shared form helpers or real shadcn field composition.
- Filters and scope are URL-addressable when they affect what data or branch is being managed.
- Navigation, proxy ACL, module ACL, page guards, and Server Actions agree.
- No raw Supabase/Postgres error message reaches clients.
- No fake primitive, arbitrary Tailwind dimension, route theme CSS, static presentation inline style, or vocabulary drift is introduced.
- `pnpm typecheck && pnpm lint && pnpm build` passes before implementation is marked complete.

## Verification Matrix

| Area | Verification |
| --- | --- |
| Type/build | `pnpm typecheck && pnpm lint && pnpm build` |
| Copy | Run `pnpm lint:copy` when Vietnamese copy changes |
| Design system | Re-check runtime config and Admin UI against `radix-lyra`, `stone`, Tabler icons, semantic tokens |
| ACL | Direct URL tests for owner, super_manager, area_manager, branch_manager, warehouse_manager, and forbidden POS/KDS-only roles |
| Server Actions | Forged payloads cannot bypass role, permission, tenant, or branch checks |
| Browser | Desktop `1440x900`, tablet `768x1024`, mobile `390x844` |
| UI states | Loading, empty, error, blocked, table overflow, dialog focus, destructive confirmation |
| Reports | Materialized views are never exposed directly to `authenticated` without permission re-checks |

## Prompt For Implementation

```md
You are working in C:\Users\MATU\Downloads\comtammatu.

Goal: rebuild the `/admin` route family as a dense management workspace using the locked shadcn `radix-lyra` / stone / Tabler design system.

Before editing runtime UI, read:
- AGENTS.md
- docs/agent/rules/engineering.md
- docs/agent/rules/database.md
- docs/agent/rules/ui.md
- docs/agent/rules/workflow.md
- docs/agent/rules/references.md
- docs/spec/design-system.md
- docs/modules/ui.md
- docs/modules/auth.md
- docs/plan/admin-page-rebuild-plan.md
- docs/plan/ui-ux-rebuild.md
- docs/plan/ui-ux-page-contracts.md
- tasks/regressions.md

Run the required 4-agent debate before implementation. Treat Gate 0 as blocking:
1. Write or update Admin route contracts.
2. Resolve stale `/admin/menu` and `/admin/orders` references.
3. Reconcile `/admin/*` proxy gating with `MODULE_ACL` and `resolveModuleFromPath`.
4. Map `/admin/inventory` and `/admin/accounting` explicitly.
5. Fix Admin nav/icon mapping and role-visible groups.
6. Replace empty role allowlists with concrete intended roles or `STAFF_ROLES`.
7. Decide owner branch-floor settings and tenant-wide permission grant policy.

First runtime scope:
- `/admin` shell and navigation
- `/admin/dashboard`
- `/admin/settings/*`
- `/admin/staff`
- `/admin/staff/*`

Do not add `/admin/menu` or `/admin/orders`. Do not touch `/inventory`, `/finance`, `/hr`, `/menu`, `/orders`, POS, or KDS unless needed for a shared ACL/nav fix explicitly documented in Gate 0.

Implementation rules:
- Keep pages as RSC data loaders with client islands for filters, tables, dialogs, and action states.
- Use `@comtammatu/ui/components/*` primitives and `apps/web/app/components/form/*` helpers.
- Prefer filters + table/list/detail forms over dashboard card mosaics.
- Use URL params for branch/filter scope when scope affects data or mutations.
- Never use localStorage or React Context for scope.
- Never create fake primitives, route themes, arbitrary Tailwind dimensions, static presentation inline styles, or raw palette status classes.
- Keep Supabase-only queries, Zod Server Action validation, permission-key checks, branch/tenant revalidation, and safe mapped error messages.
- Hidden UI is not security; Server Actions/RPC/RLS stay authoritative.

Verification before done:
- pnpm typecheck && pnpm lint && pnpm build
- pnpm lint:copy if copy changes
- Browser check desktop/tablet/mobile for shell, tables, filters, dialogs, empty/error/loading states
- Role/ACL direct URL checks for allowed and forbidden users
```

## Next Plan: Gate 0 + MVP Execution Contract

> Status: implementation handoff contract | Scope: documentation plus future Admin MVP execution | Debate: skipped because this section is documentation-only.

This section turns the Admin rebuild plan into a decision-complete execution contract. It does not authorize runtime UI polish until Gate 0 is verified. The current worktree already shows changes in `packages/shared/src/auth/route-resolution.ts` and `apps/web/proxy.ts`, but those changes are not considered complete until they are covered by tests or explicit route/role verification.

Execution order:

1. Lock route/auth/nav behavior.
2. Write detailed Admin route contracts.
3. Standardize `AdminShell`.
4. Rebuild the MVP surfaces: dashboard, settings, staff, and staff permissions.
5. Keep reports, inventory admin, accounting, and CRM in later waves unless a Gate 0 fix must touch their route mapping.

First runtime MVP scope:

- `/admin` shell/navigation
- `/admin/dashboard`
- `/admin/settings/*`
- `/admin/staff`
- `/admin/staff/*`

Out of MVP scope:

- `/admin/reports/*`
- `/admin/inventory/*`
- `/admin/accounting/periods`
- `/admin/crm`
- `/inventory/*`
- `/finance/*`
- `/hr/*`
- `/menu`
- `/orders`
- `/br/[branchId]/pos`
- `/br/[branchId]/kds`

Do not add `/admin/menu` or `/admin/orders`. Runtime routes remain `/menu` and `/orders`.

### Gate 0 - Auth, Route, Nav

Gate 0 must finish before any broad visual UI/UX rebuild. The implementer must treat URL access, sidebar visibility, page guards, and Server Actions as separate layers that must agree.

#### Route resolution contract

`resolveModuleFromPath()` must resolve live Admin routes as follows:

| Route | Module key |
| --- | --- |
| `/admin` | `dashboard` |
| `/admin/dashboard` | `dashboard` |
| `/admin/settings/*` | `settings` |
| `/admin/staff/*` | `staff` |
| `/admin/reports/*` | `reports` |
| `/admin/inventory/*` | `inventory_admin` |
| `/admin/accounting/*` | `accounting` |
| `/admin/crm/*` | `crm` |

Unknown `/admin/*` paths must not serve without module mapping. They should route through the default landing behavior instead of silently bypassing ACL.

Current worktree note:

- `route-resolution.ts` already has a diff mapping `/admin/inventory` to `inventory_admin`.
- `route-resolution.ts` already has a diff mapping `/admin/accounting` to `accounting`.
- Keep these mappings only after verification confirms they match `MODULE_ACL`, Admin nav, and direct URL behavior.

#### Proxy contract

`apps/web/proxy.ts` must enforce Admin access by resolved module, not by a blanket `dashboard` requirement.

Required behavior:

- Resolve the module with `resolveModuleFromPath(pathname)`.
- Use `canAccess(claims.user_role, moduleKey)` for every mapped route.
- For Admin ACL failure, redirect to the role's default landing.
- For non-Admin ACL failure, redirect to `/access-denied`.
- For unknown Admin routes with no module mapping, redirect to the role's default landing.
- Keep `/admin` root behavior compatible with its redirect to `/admin/dashboard`.

Current worktree note:

- `proxy.ts` already has a diff removing the blanket Admin dashboard gate.
- This diff must still be verified with direct URL checks for each Admin role.

#### Navigation contract

Admin sidebar visibility is UX, not security. The sidebar must reflect `MODULE_ACL`, but direct URL access must remain authoritative through proxy/page/action gates.

Required behavior:

- `resolveAdminNavGroups(role)` remains the shared nav source.
- `AdminShell` must correctly map shared icon names to Tabler components.
- Icon names that must resolve include `LayoutDashboard`, `BarChart3`, `Users`, `ShieldCheck`, `Receipt`, and `Settings`.
- Do not fix ACL by hiding links only.
- Do not introduce a second route-access matrix inside UI components.

Known risk:

- `packages/shared/src/auth/nav-config.ts` emits icon names such as `LayoutDashboard` and `BarChart3`.
- `apps/web/app/admin/components/admin-shell.tsx` currently maps names like `IconLayoutDashboard`, so most icons can fall back if not normalized.

#### Empty role allowlist contract

Never pass `[]` to `getAuthContext()`, `getAuthContextWithPermission()`, `getAuthContextWithAnyPermission()`, or `getAuthContextWithPermissions()` when the intent is "authenticated user with permission." The helper rejects empty role arrays before checking permission.

Current known Admin targets:

| File area | Current risk | Required plan |
| --- | --- | --- |
| Accounting periods | `getAuthContextWithPermission([], ACCOUNTING_PERIOD_REOPEN)` | Replace `[]` with the intended accounting admin roles or `STAFF_ROLES`, then rely on permission key |
| Inventory cold-chain admin | empty allowlist with policy permission | Replace `[]` with `MODULE_ACL.inventory_admin.allowedRoles` or an explicit inventory-admin role list |
| Inventory express windows | empty allowlist with any-permission gate | Replace `[]` with `MODULE_ACL.inventory_admin.allowedRoles` or an explicit inventory-admin role list |
| Inventory trust leaderboard | empty allowlist with reports permission | Replace `[]` with the allowed cross-user report roles or `MODULE_ACL.inventory_admin.allowedRoles`, depending on the route contract |

The plan must choose a concrete allowlist per route contract. Do not patch by using `STAFF_ROLES` everywhere unless the route is intentionally permission-only for all authenticated roles.

### Admin Route Contracts

Before runtime edits, add detailed route contracts to `docs/plan/ui-ux-page-contracts.md` or a dedicated Admin contract section in this file. Each route contract must include:

- Surface
- Primary user job
- Route family
- Change type: auth/nav, visual refactor, UX flow, copy, behavior
- Data source
- Mutation path
- Permission key or ACL module
- Scope rule
- UI primitives
- Regression risks
- Acceptance criteria

#### `/admin/dashboard`

Surface: Admin cockpit.

Primary user job: Open the management workspace, see the current operating snapshot, and jump to the next management surface.

Change type:

- Auth/nav: yes, through module-specific Admin access.
- Visual refactor: yes.
- UX flow: minor.
- Copy: likely.
- Behavior: no metric semantics change unless business-day/timezone rules are explicitly verified.

Data source:

- `apps/web/app/admin/dashboard/actions.ts`
- Supabase reads for dashboard stats and recent orders.

Permission and ACL:

- Module ACL: `dashboard`
- Permission key: `dashboard:view`

Scope rule:

- Tenant-wide for owner/super_manager.
- If branch-scoped dashboard access is introduced later, branch filtering must be explicit and server-validated.

UI primitives:

- `Card` only for actual grouped summaries or route links.
- `Badge` for status.
- `Table` or list primitives for recent operational records.
- `Button` for navigation actions.
- `Empty` for no data.

Regression risks:

- Dashboard can drift into decorative stat mosaics.
- Today/yesterday calculations can be wrong if they use server-local time instead of Vietnam business-day assumptions.
- Raw status labels can drift from POS/KDS terminology.

Acceptance:

- Dashboard works as an action hub.
- Every summary supports a concrete next management action.
- No duplicate page identity when `AdminShell` already provides title/breadcrumb.

#### `/admin/settings/*`

Surface: Admin settings.

Primary user job: Configure tenant strategy settings and branch-floor settings without mixing tenant-wide and branch-scoped authority.

Change type:

- Auth/nav: yes.
- Visual refactor: yes.
- UX flow: yes for branch selector state.
- Copy: likely.
- Behavior: only for URL-backed scope if it replaces client-only state without changing write semantics.

Data source:

- Settings pages and actions under `apps/web/app/admin/settings`.
- Branches, areas, tables, zones, POS terminals, KDS stations, printers, payments, and general tenant settings.

Mutation path:

- Existing Server Actions under each settings sub-route.
- Keep Zod validation and mapped errors.

Permission and ACL:

- Module ACL: `settings`
- Tenant settings permission: `settings:tenant`
- Branch settings permission: `settings:branch`
- Printer management permission where applicable: `printer:manage`

Scope rule:

- Tenant strategy pages: owner/super_manager unless policy changes.
- Branch-floor pages: allowed roles from `BRANCH_FLOOR_SETTINGS_ROLES` plus any confirmed owner/super_manager visibility.
- Branch selection that changes managed data must live in URL params.
- Mutations must re-check branch ownership/scope server-side.

UI primitives:

- `Tabs` or `ButtonGroup` for settings sections when appropriate.
- `Table` for dense lists.
- `Dialog` or `FormDialog` for CRUD.
- `Select` for branch filters.
- `FieldGroup` and app form helpers for forms.
- `Empty`, `Alert`, and `Skeleton` for state handling.

Regression risks:

- Client-only branch selection can hide scope from URL and mutation validation.
- Settings nav can become a second ACL layer.
- Raw links styled as pills can drift from primitives.
- Owner visibility for branch-floor settings is not fully locked.

Acceptance:

- Tenant strategy and branch-floor settings are visually and behaviorally separate.
- Branch-scoped management state is URL-addressable.
- CRUD dialogs use shared form primitives and preserve safe Server Action behavior.

#### `/admin/staff`

Surface: Staff management.

Primary user job: Find, create, update, activate/deactivate, and open permissions for staff.

Change type:

- Auth/nav: yes.
- Visual refactor: yes.
- UX flow: minor.
- Copy: yes, especially Auth v2 vocabulary.
- Behavior: no write-policy changes.

Data source:

- `profiles`
- `positions`
- `branches`

Mutation path:

- `createStaff`
- `updateStaff`
- `toggleStaffActive`
- RPC/service-role paths already used by staff actions.

Permission and ACL:

- Module ACL: `staff`
- Permission keys include `staff:manage` and `staff:assign_position`.

Scope rule:

- Follow staff action hierarchy rules.
- Operational staff require a real branch.
- Operational roles must not be assigned to central warehouse or central kitchen for POS/KDS.

UI primitives:

- `Table` for desktop.
- `Item`, `Card`, or approved list composition for mobile.
- `Badge` for role/status.
- `DropdownMenu` for row actions.
- `Dialog` or `FormDialog` for create/edit.
- `AlertDialog` for destructive or disabling confirmations if added.
- `Empty` for no staff or no filter results.

Regression risks:

- Staff page can show roles while Auth v2 language should distinguish position, role bridge, and permissions.
- UI action visibility can drift from Server Action permission checks.
- Mobile list can fake badges/buttons if not composed with primitives.

Acceptance:

- Filters are URL-backed.
- Desktop keeps a dense table.
- Mobile remains usable without inventing a separate information architecture.
- Permission and edit actions are reachable but still enforced server-side.

#### `/admin/staff/[id]/permissions`

Surface: Staff permission management.

Primary user job: Grant, revoke, apply templates, and inspect audit history for a staff member.

Change type:

- Auth/nav: yes.
- Visual refactor: yes.
- UX flow: yes if audit/grant flows are regrouped.
- Copy: yes.
- Behavior: no permission semantics change unless approved separately.

Data source:

- `permission_keys`
- `role_templates`
- `staff_permissions`
- `permission_audit_log`

Mutation path:

- `grant_permission`
- `revoke_permission`
- `apply_template_to_user`

Permission and ACL:

- Module ACL: `staff`
- Permission key: `staff:assign_permission`

Scope rule:

- Owner protection stays in RPC.
- Tenant-wide grant behavior must be decided before UI exposes it.
- Branch-scoped grants must be explicit and validated.

UI primitives:

- `Table`
- `Tabs`
- `Badge`
- `Dialog`
- `AlertDialog`
- `Select`
- `FieldGroup`
- `Empty`

Regression risks:

- Raw permission jargon can leak into normal business copy.
- Tenant-wide grants can appear supported in UI while actions reject `branch_id === null`.
- Audit trail can become secondary even though it is the accountability surface.

Acceptance:

- Grant/revoke/template/audit are presented as one coherent management workflow.
- UI copy uses safe Auth v2 vocabulary: position, permission, permission template, grant, revoke.
- Server Actions remain authoritative.

#### `/admin/reports/*`

Surface: Executive reporting.

Primary user job: Review revenue, stock movement, and inventory value reports.

Initial wave: later wave only, except Gate 0 route mapping and navigation verification.

Permission and ACL:

- Module ACL: `reports`
- Report permission keys must be route-specific when actions/data require them.

Scope rule:

- Report filters must be URL-addressable.
- Branch filters must be permission-checked.

Regression risks:

- `RLS-NOT-APPLIED-ON-MV`: materialized views must not be exposed directly to `authenticated` without a security-definer permission re-check.
- Arbitrary Tailwind values currently exist in report UI.
- Date/time filters can drift from business-day rules.

Acceptance:

- Documented route contract exists before UI changes.
- No report implementation relies on sidebar visibility as access control.

#### `/admin/inventory/*`

Surface: Inventory admin tools.

Primary user job: Manage inventory policy/configuration tools such as feature flags, cold-chain policy, express windows, and trust leaderboard.

Initial wave: later wave only, except Gate 0 route mapping and empty allowlist fixes if needed to make route access coherent.

Permission and ACL:

- Module ACL: `inventory_admin`
- Sub-pages keep their own fine-grained permission gates.

Scope rule:

- Branch-sensitive tools must use explicit branch scope and server validation.
- Cross-user trust leaderboard remains gated separately from self-view trust score.

Regression risks:

- Empty role allowlists currently make permission-gated pages unreachable.
- Arbitrary Tailwind values currently exist in inventory admin UI.
- Inventory admin can be confused with operational `/inventory/*`.

Acceptance:

- Route contract clearly labels these as policy/admin tools, not inventory operations.
- Fine-grained permission gates are documented per page.

#### `/admin/accounting/periods`

Surface: Accounting period control.

Primary user job: Review soft/hard-close state and perform approved period reopen/control actions.

Initial wave: later wave, high security.

Permission and ACL:

- Module ACL: `accounting`
- Permission key: `accounting:period_reopen`

Scope rule:

- Tenant-wide accounting control unless future policy adds branch-specific accounting.
- High-risk actions require explicit confirmation and any policy-required 2FA flow.

Regression risks:

- Empty role allowlist can make page unreachable.
- Period close rules are accounting-sensitive and must not be bypassed by UI-only logic.
- Backdated inventory/finance behavior must remain governed by database policy.

Acceptance:

- Route contract exists before UI changes.
- Reopen/control actions remain permission-gated and auditable.

#### `/admin/crm`

Surface: CRM placeholder or future customer tool.

Primary user job: Not fully defined yet.

Initial wave: later wave only.

Permission and ACL:

- Module ACL: `crm`

Scope rule:

- Do not expand CRM behavior without a separate business contract.

Regression risks:

- Placeholder can become a decorative dead-end.
- CRM can overlap orders/customers without a defined source of truth.

Acceptance:

- Keep out of MVP.
- Do not add new CRM workflow until requirements exist.

### MVP UI/UX Execution Contract

MVP UI work starts only after Gate 0 passes.

#### AdminShell

Required behavior:

- `AdminShell` owns page identity through breadcrumb and title.
- Child pages should not repeat large hero headings in nested `Card` containers.
- Header supports a primary action slot only if the current page needs it.
- Sidebar collapse must preserve navigation and accessible labels.

Primitives:

- `Sidebar`
- `Breadcrumb`
- `Button`
- `Badge`
- `Separator`

Do not:

- Add a route-specific Admin theme.
- Add new helper classes that behave like a parallel design system.
- Put implementation notes or agent commentary into UI.

#### Dashboard

Required behavior:

- Convert dashboard from decorative summary to route/action hub.
- Keep metrics only when they lead to a management decision.
- Keep recent operational records scannable.
- Verify Vietnam business-day/timezone assumptions before changing today/yesterday calculations.

Do not:

- Add marketing copy.
- Add card mosaics that do not support a next action.
- Change metric semantics during visual cleanup.

#### Staff

Required behavior:

- Use URL-backed filters.
- Keep desktop table dense and readable.
- Mobile list can use cards/items, but buttons and badges must remain real primitives.
- CRUD remains backed by Zod Server Actions and Auth v2 permission checks.

Do not:

- Expose action buttons that imply authorization not enforced server-side.
- Introduce raw permission jargon into normal staff-management copy.

#### Staff permissions

Required behavior:

- Present grants, revokes, templates, and audit as one coherent management workflow.
- Make branch-scoped vs tenant-wide grant behavior explicit once policy is decided.
- Preserve owner protection and audit trail semantics.

Do not:

- Treat audit as optional decoration.
- Create a second permission model in UI state.

#### Settings

Required behavior:

- Separate tenant strategy settings from branch-floor settings.
- Move branch selection that affects managed data into URL params.
- Re-validate branch scope server-side for mutations.
- Use shared form helpers or shadcn field composition for CRUD dialogs.

Do not:

- Store branch selection in localStorage or React Context.
- Use a client-only branch selector for mutation authority.
- Solve owner/manager visibility with UI-only conditionals.

### Later Waves With Guardrails

Reports, inventory admin, accounting, and CRM are later waves. They still need contracts now so future implementation does not reopen route/auth decisions.

Rules:

- Do not rebuild these pages in the MVP UI pass.
- Do fix Gate 0 route mapping or empty allowlist issues if they block correct Admin access.
- Do not touch materialized-view-backed reports without checking `RLS-NOT-APPLIED-ON-MV`.
- Do not touch accounting period behavior without a separate high-security debate.
- Do not expand CRM until the business job is defined.

### Verification Plan

#### Automated gates

Run after implementation changes:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Run when copy changes:

```bash
pnpm lint:copy
```

Documentation-only edits do not require the full runtime gate, but the changed Markdown must be reviewed for duplicate sections, stale route names, and contradictions with `MODULE_ACL`.

#### Auth and ACL checks

Verify direct URL behavior for:

- `owner`
- `super_manager`
- `area_manager`
- `branch_manager`
- `warehouse_manager`
- cashier/waiter/chef as forbidden Admin users except routes explicitly allowed by module policy

Checks:

- Allowed Admin routes render.
- Forbidden Admin routes redirect to the role's default landing.
- Unknown `/admin/*` does not bypass ACL.
- Sidebar visibility matches module access.
- Direct URL behavior matches sidebar visibility.
- Page-level permission gates do not use empty role arrays.

#### UI and browser checks

Viewport checks:

- Desktop: `1440x900`
- Tablet: `768x1024`
- Mobile: `390x844`

Required UI states:

- Sidebar expanded and collapsed
- Breadcrumb and page title
- Table overflow
- Mobile staff/settings list
- Empty state
- Loading state
- Error state
- Dialog focus and close
- Destructive confirmation

#### Security and data checks

- Forged Server Action payloads cannot bypass role, permission, tenant, or branch checks.
- Branch-scoped settings mutations re-check target branch server-side.
- No raw Supabase/Postgres `error.message` reaches UI.
- Reports and materialized views are not queried directly without permission re-checks.
- Multi-item atomic writes remain RPC-backed.

### Assumptions

- Continue by appending to `docs/plan/admin-page-rebuild-plan.md`, not by replacing the existing plan.
- Existing dirty worktree changes are user/current-work changes and must not be reverted.
- This section is documentation-only and does not change runtime UI/UX.
- SQL migration is not expected for the Admin UI MVP.
- If permission semantics require SQL later, create a migration file only; production migration is owner-applied after PR/merge.

## Next Plan: Gate 0 Implementation Work Packages

> Status: implementation-ready work package plan | Scope: Gate 0 only | Debate: skipped because this section is documentation-only.

This section decomposes Gate 0 into small implementation work packages. The goal is to make the next execution pass deterministic: fix route/auth/nav consistency first, verify it, then allow the Admin MVP UI rebuild to start.

Gate 0 is complete only when all of these are true:

- Every live `/admin/*` route resolves to the intended `ModuleKey`.
- Proxy behavior is module-specific and cannot serve an unmapped Admin route.
- Admin sidebar visibility matches `MODULE_ACL`.
- Admin page-level permission gates no longer use empty role allowlists.
- Route contracts document the policy for dashboard, settings, staff, staff permissions, reports, inventory admin, accounting, and CRM.
- Verification proves direct URL access, not only sidebar navigation.

### Work Package 0A - Route Contract Baseline

Purpose:

- Lock the route contract before code changes continue.
- Prevent `/admin/menu` and `/admin/orders` from reappearing as assumed runtime routes.
- Make every later UI PR cite a stable contract.

Files:

- `docs/plan/admin-page-rebuild-plan.md`
- `docs/plan/ui-ux-page-contracts.md`

Required edits:

- Add or link the Admin route contracts from this plan into `docs/plan/ui-ux-page-contracts.md`.
- Mark `/admin/menu` and `/admin/orders` as non-runtime routes.
- State that runtime routes remain `/menu` and `/orders`.
- Mark `/admin/reports/*`, `/admin/inventory/*`, `/admin/accounting/periods`, and `/admin/crm` as later waves.
- State that Gate 0 route/auth/nav fixes may touch later-wave routes only to make access control coherent.

Acceptance:

- A future implementer can identify the allowed module, primary job, permission gate, scope rule, and acceptance criteria for every live Admin route group.
- No route contract relies on "Admin dashboard access" as a blanket proxy gate.
- No route contract allows UI-only visibility to substitute for route or action authorization.

### Work Package 0B - Route Resolution And Proxy

Purpose:

- Make URL access match `MODULE_ACL`.
- Remove the stale assumption that every `/admin/*` user must access `dashboard`.
- Block unknown Admin routes from rendering without ACL mapping.

Files:

- `packages/shared/src/auth/route-resolution.ts`
- `apps/web/proxy.ts`
- Relevant auth tests if they already exist near shared auth/proxy behavior.

Required behavior:

- `/admin` resolves to `dashboard`.
- `/admin/dashboard` resolves to `dashboard`.
- `/admin/settings/*` resolves to `settings`.
- `/admin/staff/*` resolves to `staff`.
- `/admin/reports/*` resolves to `reports`.
- `/admin/inventory/*` resolves to `inventory_admin`.
- `/admin/accounting/*` resolves to `accounting`.
- `/admin/crm/*` resolves to `crm`.
- Unknown `/admin/*` does not render without module mapping.
- Admin ACL failure redirects to role default landing.
- Non-admin ACL failure redirects to `/access-denied`.

Test requirements:

- Add or update unit tests for `resolveModuleFromPath()`.
- Cover beta-prefixed Admin paths if existing auth tests already cover beta routing.
- Add proxy behavior tests only if the repo already has a suitable proxy test harness. If not, document manual verification commands and browser checks.

Manual verification matrix:

| Role | Expected allowed Admin groups |
| --- | --- |
| `owner` | dashboard, staff, reports, settings tenant pages, inventory admin if ACL allows, accounting, CRM |
| `super_manager` | dashboard, staff, reports, settings tenant pages, inventory admin if ACL allows, accounting, CRM |
| `area_manager` | settings if ACL allows, inventory admin if ACL allows, no dashboard unless ACL changes |
| `branch_manager` | settings if ACL allows, inventory admin if ACL allows, no dashboard unless ACL changes |
| `warehouse_manager` | inventory admin if ACL allows, no dashboard unless ACL changes |
| `cashier` / `waiter` / `chef` | no Admin groups unless a future ACL explicitly grants one |

Acceptance:

- Direct URL access and `MODULE_ACL` agree for each role.
- Existing logged-in users who lack `dashboard` but have `settings` are not blocked from `/admin/settings/*` by a blanket dashboard gate.
- Unknown Admin paths are not accidentally public to authenticated users.

### Work Package 0C - Admin Navigation And Icon Mapping

Purpose:

- Make Admin nav accurately reflect module access.
- Fix icon fallback caused by shared nav icon names not matching the local Tabler map.

Files:

- `packages/shared/src/auth/nav-config.ts`
- `apps/web/app/admin/components/admin-shell.tsx`
- Shared label files only if copy labels must be corrected.

Required behavior:

- `resolveAdminNavGroups(role)` remains the source for Admin sidebar items.
- `AdminShell` maps shared icon keys to Tabler icons using the names emitted by `nav-config.ts`.
- At minimum, support `LayoutDashboard`, `BarChart3`, `Users`, `ShieldCheck`, `Receipt`, and `Settings`.
- Keep fallback icon behavior for unknown future icons, but treat fallback use as a test finding when it happens for current nav items.
- Do not introduce route-specific nav arrays inside AdminShell.

Copy requirements:

- Keep Vietnamese utility labels.
- Avoid `Admin Shell`, `Dashboard`, `tenant-wide`, `legacy role`, or raw technical policy language in user-facing labels unless the page is explicitly an audit/admin policy page.

Acceptance:

- Every current Admin sidebar item renders its intended icon.
- Sidebar item list changes when role changes according to `MODULE_ACL`.
- Direct URL access still works independently of sidebar visibility.

### Work Package 0D - Empty Role Allowlist Cleanup

Purpose:

- Fix permission-gated Admin pages that currently reject everyone before checking permission.
- Make role allowlists explicit and auditable.

Known targets:

- `apps/web/app/admin/accounting/periods/page.tsx`
- `apps/web/app/admin/inventory/cold-chain/page.tsx`
- `apps/web/app/admin/inventory/express-windows/page.tsx`
- `apps/web/app/admin/inventory/trust/page.tsx`

Decision rule:

- Use `MODULE_ACL.<module>.allowedRoles` when the page is module-scoped and permission-gated.
- Use a named explicit role list when the page intentionally narrows access below module ACL.
- Use `STAFF_ROLES` only when the route is intentionally "any authenticated role with permission."
- Do not leave `[]` as a placeholder.

Route-specific defaults:

| Route | Recommended role allowlist default |
| --- | --- |
| `/admin/accounting/periods` | `MODULE_ACL.accounting.allowedRoles` |
| `/admin/inventory/cold-chain` | `MODULE_ACL.inventory_admin.allowedRoles` |
| `/admin/inventory/express-windows` | `MODULE_ACL.inventory_admin.allowedRoles` |
| `/admin/inventory/trust` | `MODULE_ACL.inventory_admin.allowedRoles` unless the contract narrows to report managers |

Acceptance:

- No Admin page passes `[]` into `getAuthContext*` helpers.
- Each page still checks the fine-grained permission key after role allowlist passes.
- Unauthorized users get a safe redirect or blocked state; raw backend errors are not exposed.

### Work Package 0E - Settings Scope Policy

Purpose:

- Decide and document branch-floor settings visibility before UI implementation uses conditionals.
- Prepare settings pages for URL-backed branch scope.

Files:

- `apps/web/app/admin/settings/settings-nav.tsx`
- `apps/web/app/admin/settings/layout.tsx`
- `apps/web/app/admin/settings/tables/tables-client.tsx`
- Other settings pages only after the route contract names them.

Policy questions to lock in docs before code:

- Owner and super_manager should see tenant strategy settings.
- Owner and super_manager should also see branch-floor settings unless the business explicitly excludes them.
- Area_manager and branch_manager should see branch-floor settings only within allowed branch scope.
- Tenant strategy pages remain owner/super_manager unless `MODULE_ACL` and permission policy change.

URL scope rule:

- If selected branch changes the managed data, use `?branchId=`.
- The page loader validates the requested branch against claims and branch access.
- Client components receive a validated branch id and do not decide authority themselves.
- Server Actions receive explicit branch id and re-check scope.

Acceptance:

- Settings branch selection can be bookmarked and refreshed.
- Branch-scoped settings do not depend on client-only state.
- Branch-scoped mutations cannot be forged across branches.

### Work Package 0F - Admin MVP Entry Criteria

Purpose:

- Define the exact point where UI/UX rebuild may start.

Admin MVP UI work may start only after:

- Work Package 0A route contracts are merged.
- Work Package 0B route/proxy verification is complete.
- Work Package 0C nav/icon mapping is fixed and verified.
- Work Package 0D empty allowlists are removed.
- Work Package 0E settings scope policy is documented.

MVP UI execution order after Gate 0:

1. `AdminShell` header, breadcrumb, title rhythm, and action slot.
2. Staff list and staff filters.
3. Staff create/edit dialogs and active toggle flow.
4. Staff permission management page.
5. Settings shell/nav and URL branch scope.
6. Settings CRUD pages.
7. Dashboard action hub cleanup.

Do not start with dashboard visuals. Dashboard is lower operational value than settings and staff, and it is more likely to drift into decorative cards.

Acceptance:

- Each MVP UI PR touches one route family or one shared Admin shell pattern.
- Each PR states surface, primary user job, route family, change type, and primitives used.
- Each PR keeps behavior unchanged unless its contract says otherwise.

### Work Package 0G - Verification Runbook

Purpose:

- Provide a repeatable verification sequence for Gate 0.

Automated sequence:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

If copy changes:

```bash
pnpm lint:copy
```

Route-resolution checks:

- Confirm `/admin`, `/admin/dashboard`, `/admin/settings`, `/admin/staff`, `/admin/reports`, `/admin/inventory`, `/admin/accounting`, and `/admin/crm` resolve to the expected module keys.
- Confirm `/admin/unknown-test-route` does not bypass ACL.
- Confirm beta-prefixed Admin routes still strip beta prefix before resolving module keys if beta routing is in scope.

Role checks:

- Use seeded or known test accounts when available.
- If accounts are unavailable, document the missing account as a verification blocker instead of claiming role coverage.
- Verify direct URL access, not just sidebar links.

Browser checks:

- `1440x900`: sidebar, breadcrumb, dense table layout.
- `768x1024`: sidebar behavior and settings/staff usability.
- `390x844`: mobile list fallback, no clipped labels, no unexpected horizontal overflow outside intended table scroll.

Security checks:

- Attempt forged branch id in branch-scoped settings mutation.
- Attempt permission action from a role that can see the page but lacks the fine-grained permission.
- Confirm no raw Supabase/Postgres error text is surfaced to the client.

Acceptance:

- Verification result lists exact routes, roles, expected result, and observed result.
- Any missing account or untestable path is recorded as residual risk.
- Gate 0 cannot be marked complete on `pnpm build` alone.

### Work Package 0H - Implementation Prompt For Gate 0

Use this prompt for the next coding pass:

```md
Implement Gate 0 for Admin route/auth/nav in C:\Users\MATU\Downloads\comtammatu.

Read:
- AGENTS.md
- docs/agent/rules/engineering.md
- docs/agent/rules/database.md
- docs/agent/rules/ui.md
- docs/agent/rules/workflow.md
- docs/agent/rules/references.md
- docs/spec/design-system.md
- docs/modules/auth.md
- docs/modules/ui.md
- docs/plan/admin-page-rebuild-plan.md
- tasks/regressions.md

Scope:
- Route contracts for Admin.
- `resolveModuleFromPath()` mappings for all live `/admin/*` route groups.
- `proxy.ts` module-specific Admin ACL behavior.
- Admin sidebar icon mapping for shared nav icon keys.
- Empty role allowlist cleanup in Admin permission-gated pages.
- Settings branch-scope policy documentation, with URL-scope implementation only if included in this Gate 0 pass.

Do not:
- Rebuild runtime UI visuals yet.
- Add `/admin/menu` or `/admin/orders`.
- Change database schema.
- Apply migrations directly.
- Move Inventory, Finance, HR, POS, KDS, `/menu`, or `/orders` into Admin MVP.

Implementation rules:
- Keep `MODULE_ACL` as the single route ACL source.
- Hidden UI is not security.
- Server Actions/RPC/RLS stay authoritative.
- Do not pass `[]` to auth-context permission helpers.
- No raw Supabase/Postgres errors to clients.

Verification:
- pnpm typecheck
- pnpm lint
- pnpm build
- pnpm lint:copy if copy changes
- Direct URL checks for owner, super_manager, area_manager, branch_manager, warehouse_manager, and forbidden POS/KDS-only roles.
```

### Gate 0 Completion Checklist

- [ ] Admin route contracts are written and linked from the active planning docs.
- [ ] `/admin/menu` and `/admin/orders` are explicitly marked non-runtime.
- [ ] `resolveModuleFromPath()` covers every live Admin route group.
- [ ] Unknown `/admin/*` cannot render without a module mapping.
- [ ] Proxy uses module-specific ACL for Admin paths.
- [ ] Admin ACL failure redirects to default landing.
- [ ] Non-Admin ACL failure redirects to `/access-denied`.
- [ ] Admin nav icons resolve without unintended fallback for current items.
- [ ] Sidebar visibility matches `MODULE_ACL`.
- [ ] No Admin page passes `[]` to `getAuthContext*` helpers.
- [ ] Settings branch-floor visibility policy is documented.
- [ ] URL-backed branch scope is specified for settings pages that manage branch data.
- [ ] Automated gates pass after code implementation.
- [ ] Direct URL role matrix is recorded.
- [ ] Browser checks are recorded for desktop, tablet, and mobile.
