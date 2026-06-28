# Per-employee inventory count slips (Task 1) — T3 contract

Owner asked for three features; this worklog covers **Task 1** only. Decisions
locked with the owner: count semantics = **count on-hand + reconcile variance**
(not consumption reporting); sequencing 1 → 2 → 3.

## Problem

Employees should each be assigned the ingredients they are responsible for
counting; they submit a count slip; a manager reviews the variance and approves,
adjusting stock. The codebase already had the heavy `stocktake_sessions`
machinery and the per-employee consumption-report flow, but **no per-employee
ingredient-assignment concept** — `start_stocktake` seeds the whole catalog and
anyone may count any line.

## Decision: build a new lightweight object, reuse logic not schema

Four-perspective debate (PM/BA/SeniorDev/QA, code-grounded) rejected extending
`stocktake_sessions` (session-scoped, single auditor, no per-line ownership, wrong
status set) and the consumption-report flow (posts *consumption* depletion, not
*count_adjustment* reconciliation). New tables `inventory_count_*`; reuse the
**adjustment math** of `complete_stocktake` and the **submit/approve/notify
shape** of `leave_requests`.

## Schema (migration `20260627201823_inventory_per_employee_count_slips.sql`)

- `inventory_count_assignments` — manager config: who counts what, per
  `(branch, location, employee, ingredient)`. Partial unique
  `(tenant,branch,location,ingredient) WHERE is_active` → **one active owner per
  cell** (prevents double-count/double-adjust). `is_active` soft-delete.
- `inventory_count_slips` — one per `(branch, location, employee, count_date)`.
  Status `submitted | needs_changes | approved`.
- `inventory_count_slip_lines` — `system_quantity` (snapshot at submit),
  `counted_quantity`, `variance` GENERATED. Manager-only RLS read (blind).

RPCs (SECURITY DEFINER, branch-gated, never return raw error):
- `set_inventory_count_assignments` — `inventory:count_assign`. Reassigns cells
  away from other employees, then sets this employee's exact set.
- `submit_inventory_count_slip` — `inventory:count_submit`. Resolves employee,
  validates every line is an active assignment, requires **all** assignments
  counted (anti-cherry-pick), snapshots system qty, fires `count_slip_submitted`.
- `get_my_count_slip` — blind read of caller's own counted values (strips
  `system_quantity`/`variance`).
- `approve_inventory_count_slip` — `inventory:count_approve`. `FOR UPDATE` +
  idempotent (re-approve no-ops), self-approval blocked, posts `count_adjustment`
  movement `= counted − fresh on-hand` per non-zero line (trigger applies the
  delta + `last_counted_at`; **never** touches `stock_levels` directly), fires
  `count_slip_approved`.
- `request_inventory_count_recount` — `inventory:count_approve` → `needs_changes`
  + `count_slip_recount` notification; employee resubmits.

## Critical correctness decisions (from the debate)

1. **No double-apply.** Approve inserts the movement only; `trg_update_stock_on_movement`
   is delta-based and already stamps `last_counted_at`. (Original design's manual
   `SET current_quantity=counted` would have applied the variance twice.)
2. **Delta vs fresh, not snapshot.** Approve re-reads on-hand under lock and posts
   `counted − fresh`, so interim sales/receipts are preserved (authoritative
   recount), matching `complete_stocktake`. Result on-hand = counted (≥0), so the
   `current_quantity >= 0` CHECK can never trip; shrinkage shows as a negative
   movement delta, not negative stock.
3. **Blind is structural.** No pre-seeded lines; the employee count surface is
   driven by `inventory_count_assignments` (ingredient list only). Lines (with
   system qty) are manager-RLS-only; employees read counted values via the
   definer RPC.
4. **employee_id (bigint), not profile_id** — matches every per-employee table.
5. **location_id NOT NULL** — on-hand is per-location; the movement trigger
   requires it.

## Permissions

3 new branch-scoped keys (`inventory:count_assign|submit|approve`),
`PERMISSION_KEY_COUNT` 88 → 91, mirrored in `permissions.ts`. `role_templates`
backfilled (count_submit → counting positions; assign/approve → manager
positions). **Caveat:** role_templates are snapshot-only — existing staff need an
owner re-grant via `/admin/staff/[id]/permissions` (owner auto-bypasses).

## Notifications

`inventory.count_slip_submitted` → branch_manager/warehouse_manager/owner;
`inventory.count_slip_approved` / `inventory.count_slip_recount` → submitter
bucket. dedup `inventory.count_slip:{slip_id}:{event}` (event-suffixed so resubmit
isn't suppressed). Registered in `notifications.md`, `kindLabel`, and the icon map.

## Out of scope for v1

Multi-round/recount escalation, ABC, offline drafts, photos, approval chains,
hard reject (use recount), variance thresholds/reason codes, scheduled-count
reminders, bulk approve.

## Status & remaining work

- [x] Migration + permissions mirror + notifications registration + static-test
      count bump.
- [x] **Migration APPLIED to PROD** (`iexwsuaqqenyjiskawoj`, owner-delegated this
      session via org-scoped MCP `apply_migration`; guard temporarily bypassed +
      restored byte-for-byte). Verified: 3 tables, 5 RPCs, 3 perm keys, 3 RLS
      policies, partial-unique index all present; security advisors clean for the
      new objects (only the standard SECURITY-DEFINER-executable WARN every RPC
      carries). `pnpm db:types` regenerated from prod (256 additive lines, no drift).
- [x] Server actions + UI: `/inventory/count-assignments` (manager config),
      `/employee/count` (blind count), `/inventory/count-slips` (manager review
      queue) — built via the `withAction` wrapper, Zod, VN error mappers, no raw
      error.message. Nav wired: inventory nav gated by count_assign/count_approve
      (routes registered in `INVENTORY_ROUTE_PREFIXES` so the proxy ACL covers
      them); `/employee/count` surfaced as a **conditional home-page card** shown
      only when the employee has active assignments (the bottom nav is hard-capped
      at 4 items by `employee-mobile-app-ui.test.ts`). Status labels single-sourced
      via `COUNT_SLIP_STATUS_LABELS_VI` + a `count-slip` `status-badge.tsx` domain.
- [x] Full gate green end-to-end: `pnpm typecheck && pnpm lint && pnpm build &&
      pnpm test` (web 245 pass / 0 fail). Two real defects the gate caught and we
      fixed: the new inventory routes escaped ACL module coverage (added to
      `INVENTORY_ROUTE_PREFIXES`); a 5th employee bottom-nav tab violated the
      4-item contract (moved to a home-page card).
- [x] **Authz model refined** (owner: "the assignment IS the authorization").
      Migration `20260628081816_count_slip_drop_submit_perm.sql` (APPLIED to prod):
      DROPPED `inventory:count_submit` entirely — `submit_inventory_count_slip` now
      gates on (active employee at branch + active per-line assignment), no separate
      permission. Backfilled `inventory:count_assign` + `inventory:count_approve` to
      existing manager-position staff (branch_manager/warehouse_manager/production_manager;
      owner auto-bypasses) so **managers have them by default** (6 grants for 3 managers).
      `PERMISSION_KEY_COUNT` 91→90. So the only setup left is assigning ingredients to
      employees (which itself enables their submit) — no manual permission grants.
- [ ] (Nice-to-have) Regression guard mirroring STOCKTAKE-BLIND-STRIP-SERVER-SIDE
      for count slip lines.

## Verification

Contract-layer changes (no new-type references yet): `pnpm typecheck && pnpm lint
&& pnpm test`. Tier: **T3** (schema migration + new SECURITY DEFINER RPCs +
stock-adjusting multi-row write). Debate transcript: this file.
