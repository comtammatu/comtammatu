# Role / Route Restructure — 2026-06-13

## Trigger

Admin Dashboard currently reads like a temporary visual surface instead of a
usable management product. Owner cannot easily answer: how to set up the store,
add branches, add staff, coordinate branches, and operate without prior project
context. The same confusion appears in permissions: Branch Manager needs branch
setup rights, but those rights leak through `/admin/settings`, which makes BM
look like a partial Admin user.

## Review Tier

T3, because the follow-up implementation touches auth, route gates, settings,
navigation, and role defaults.

## Perspectives

PM:

- The product is an HKD F&B operating system, not a generic ERP menu.
- Owner needs a chain-management cockpit and setup path.
- Branch Manager needs a branch command center, not a reduced Admin.

BA:

- The real hierarchy is `Tenant (L0) -> Branch (L1)`.
- Tenant setup and branch setup are different business jobs.
- Permission grants still decide actions; route role only decides surface entry.

Senior Dev:

- Keep `module-acl.ts` as the current route fast-gate SSOT while moving the
  durable contract into `docs/spec/role-route-matrix.md`.
- Change route-map, nav-config, app-discovery, scope defaults, and tests in one
  implementation PR. Do not patch one sidebar item at a time.
- Avoid adding new branch-scoped workflows under `/admin/*`.

QA:

- Verify post-login defaults for owner, super_manager, branch_manager, and
  non-manager operators.
- Verify BM cannot reach tenant setup routes after migration, but can still
  configure their own branch.
- Verify owner/super_manager can inspect branch command/settings without losing
  tenant-level access.

## Synthesized Contract

- `/admin/*` is L0 tenant command and tenant setup for owner/super_manager.
- `/br/[branchId]/*` is L1 branch command, branch setup, and branch operations.
- Branch Manager post-login/fallback target is `/employee`.
- Root `/` delegates to the same shared role default instead of adding another
  intermediate surface.
- Domain workspaces remain first-class routes, not Admin tabs.
- Mutations and row access stay permission/RLS-driven.

Canonical spec: `docs/spec/role-route-matrix.md`.

## Implementation Sequence

1. Contract slice: add role-route spec and docs references.
2. Route/auth slice: add branch command route family while keeping BM default
   on Employee.
3. Navigation slice: remove BM tenant Admin discovery; expose branch command and
   branch setup from branch operations discovery.
4. Admin UX slice: rebuild `/admin/dashboard` around tenant setup, live operating
   status, and domain handoff.
5. Branch UX slice: build `/br/[branchId]/dashboard` around branch day state,
   POS/KDS/printer/table readiness, local staff day flow, and branch tasks.

Status after first implementation slice:

- Steps 1-3 are wired in code with auth tests.
- Root `/` delegates to `getDefaultRedirect`; Branch Manager and non-admin staff
  land on Employee.

Status after second implementation slice (steps 4-5, T2 note in
`tasks/todo.md` 2026-06-13):

- Step 4 done: `/admin/dashboard` rebuilt as L0 tenant command — canonical
  KpiCard grid, per-branch live operating status (paid orders/revenue, open POS
  session, print-agent health, failed print jobs 24h) with deep links into
  Branch Command, tenant setup section, and domain handoff cards. The
  duplicate DashboardFocus layer was removed; dashboard data actions are
  scoped to owner/super_manager, matching the route ACL.
- Step 5 done: `/br/[branchId]/dashboard` surfaces branch day metrics
  (revenue, paid orders, table occupancy, kitchen load) and an operating
  readiness block (POS session, printer agent + failed jobs, pending checkout
  approvals) above the command tiles. Reads are RLS-backed; pos_sessions and
  the checkout queue use the service client with explicit tenant+branch
  filters behind the route's ACL + branch-match gate.
- Static contract test: `apps/web/tests/command-dashboards-static.test.ts`.

## Verification Targets For Code Slice

- `resolvePostLoginRedirect(branch_manager with branch_id, null)` returns branch
  command.
- BM direct visit to `/admin/settings` no longer becomes their settings path.
- BM direct visit to `/br/{ownBranch}/settings` remains allowed.
- BM direct visit to another branch settings returns branch-scope mismatch.
- Owner/super_manager can deep-link into `/br/[branchId]/settings`.
- App discovery contains no BM `/admin/settings` item after migration.

## Follow-Up: Employee Entry Contract

Skill plan: repo rules = engineering + database/auth + UI + workflow +
references; external skills = vercel:nextjs + shadcn; runtime tools = CLI tests
and local HTTP smoke; skipped = Supabase MCP because there is no schema or data
write.

PM: Employee is the staff/manager work entry already present in the product.
Done means opening `/` as Branch Manager reaches `/employee`, not another hub.

BA: Branch Manager remains L1 branch-scoped and must not regain tenant Admin
settings. Branch Command and Branch Settings stay branch-scoped route families
for the work that actually needs them.

Senior Dev: Keep one resolver path: `getDefaultRedirect()` powers root,
post-login, and wrong-route fallback. Do not introduce a second dashboard-like
surface to compensate for unclear navigation.

QA: Verify BM default/fallback is `/employee`, BM still cannot enter tenant
Admin setup, BM can still open own branch settings by direct branch URL, and the
mandatory gates still pass.
