# POS/KDS Inventory Truth Implementation Plan

> Reconciled-through d35d5a7f
> Status: G8 LOCAL BROWSER ROUTE SMOKE PASSED — G1/G2/G3/G4 are code-complete with full gate green before smoke-doc updates; POS stock outcomes now share tenant-aware unit conversion; local Supabase scratch proved payment/cancel/refund/availability stock outcomes, direct grants/RLS role gates, and route-level manager/POS/KDS UI ownership on replayed migrations.
> Owner decisions captured: stock movement thật xảy ra khi đơn thanh toán hoàn tất hoặc khi hủy sau KDS `ready`; KDS `ready` là mốc "bếp đã làm"; POS/KDS không còn UI quản lý giới hạn món.
> Durable decision: `docs/plan/decisions.md` D053.

**Goal:** Make branch sell limits, POS/KDS order lifecycle, inventory consumption, waste, per-shift counts, and multi-unit conversion agree on one operational truth.

**Architecture:** POS creates reserved demand, KDS marks kitchen progress, and Inventory writes final ledger only after the order outcome is known. Manager UI computes `Tồn | Sẵn bán | Còn` from live stock, manual cap, and pending demand; POS/KDS only consume the resulting sellable state. Multi-row writes stay in Postgres RPCs/triggers with deterministic locks and idempotent stock movements.

**Tech Stack:** Next.js App Router, supabase-js, Postgres SECURITY DEFINER RPCs, RLS/grants, Zod, shadcn/ui, `tsx --test`, `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build`.

---

## Goal Frame

### Business Goal

Owner and branch managers can decide what is sellable per branch using real stock. POS cannot oversell. KDS does not own stock. Inventory ledger records the correct outcome:

- paid/completed order -> `sale_consumption`
- cancelled after KDS `ready` -> waste/hao hụt
- cancelled before KDS `ready` -> no stock movement

### Done

- POS/KDS no longer expose the menu-limit management UI.
- Branch Manager/Owner surface shows `Tồn | Sẵn bán | Còn`.
- `Còn` is not double-counted after paid orders start decrementing stock.
- Payment completion writes sale consumption idempotently.
- Cancellation after KDS `ready` writes waste idempotently.
- Per-shift inventory count remains required before checkout when assigned.
- Multi-unit entry quantities are converted to base before any stock movement.
- Full gate passes before any implementation is marked done.

### Non-Goals

- No second holds table in this slice. Reuse the existing `branch_menu_item_daily_holds` flow; do not add another reservation system.
- Side-dish recipe consumption is covered by the follow-up migration `20260630142401_pos_stock_outcome_side_dish_consumption.sql`.
- No FIFO/FEFO costing engine.
- No new POS/KDS IA.
- No production DB apply by agent unless owner delegates explicitly in that session.

### Tier

T3. The work touches schema/RPCs, multi-row writes, inventory ledger, POS payment/cancel flows, KDS status contracts, permissions, and user-facing operational UI.

### Skill Plan

Repo rules = engineering + database + UI + workflow + team + orchestration. External skills = writing-plans, Supabase/Postgres guidance already consulted. Runtime tools = CodeGraph for orientation, shell for static checks, browser/Playwright later for route smoke. Review subagents completed Data/DB, POS/KDS flow, and QA/rollout fan-in; execution uses sequential subagent-driven lanes.

### Execution Mode

Mode: **subagent-driven, sequential T3 lanes with review barriers**.

G0 is frozen by D053. Lane A may remove POS/KDS management entry points while preserving any separate KDS operational out-of-stock route. Lanes B/C/D must not run in parallel against the same migration file; one DB owner writes the migration, reviewers challenge it between steps.

## Core Contract

### Lifecycle State Rules

| Event                        | Stock reservation       | Stock movement                      | Business meaning                                 |
| ---------------------------- | ----------------------- | ----------------------------------- | ------------------------------------------------ |
| POS creates/appends order    | Increase pending demand | None                                | Stock is held for sellability only.              |
| KDS `preparing`              | Pending demand remains  | None                                | Kitchen started but not counted as made.         |
| KDS `ready`                  | Pending demand remains  | None                                | Kitchen has made the item.                       |
| Order paid/completed         | Release pending demand  | `consumption / sale_consumption`    | Sale happened; food cost counts against revenue. |
| Cancel before any ready item | Release pending demand  | None                                | No confirmed kitchen output.                     |
| Cancel after ready item      | Release pending demand  | `waste / cancelled_after_kds_ready` | Kitchen made it, but no revenue.                 |

`ready` means **ever reached ready at line/ticket level**, not only current order status. Use immutable `kds_tickets.first_ready_at`, set once when a ticket first moves to `ready`; do not use `bumped_at` as proof because recall can reset it. If KDS recalls a ticket from `ready` back to `preparing`, the item still counts as made for waste purposes. For mixed orders, waste applies only to lines/tickets that ever reached `ready` or `served`; pending lines release demand without stock movement.

### Availability Formula

The old shape `min(stock_capacity, limit_quantity) - sold_today` is unsafe once paid orders decrement stock, because completed sales would reduce both stock and `sold_today`.

Use separate terms:

```text
stock_remaining = live_stock_capacity - pending_unfinalized_demand
manual_remaining = manual_limit_quantity - accepted_today
Còn = min(non-null stock_remaining, non-null manual_remaining)
```

Definitions:

- `live_stock_capacity`: sellable portions from current stock and recipe.
- `pending_unfinalized_demand`: accepted order demand not yet paid/completed/cancelled, plus any active pre-submit holds that have not materialized into an order. Existing `branch_menu_item_daily_holds` is the only pre-submit hold system.
- `accepted_today`: orders that counted against the manager's daily manual cap, including pending and completed, excluding cancelled before acceptance release.
- `manual_limit_quantity`: branch manager's in-shift `Sẵn bán` quantity. It is required for active selling and must be less than or equal to `live_stock_capacity`; default is `live_stock_capacity` when the manager has not lowered it.

### UI Vocabulary

| Label     | Meaning                                                                                                           | Source                      |
| --------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `Tồn`     | Sellable portions from current branch stock and recipe.                                                           | Live availability RPC.      |
| `Sẵn bán` | Portions the manager permits for the shift. Required for active selling, defaults to `Tồn`, and must be `<= Tồn`. | Manual cap + disabled flag. |
| `Còn`     | Remaining portions POS may still accept.                                                                          | Formula above.              |

## File Map

### Decision And Planning

- Modify: `docs/plan/decisions.md`
  - Add a new decision superseding the current D016 stock-off stance for the re-enabled inventory truth model.
- Modify: `tasks/todo.md`
  - Add one active row for this rollout after owner approves the plan.

### Backend / Database

- Created migration: `supabase/migrations/20260630062650_pos_kds_inventory_truth_g1_access.sql`
  - Tightens menu-limit management RPC roles to owner + branch_manager.
  - Narrows direct `INSERT/UPDATE/DELETE` on `branch_menu_item_daily_limits`.
- Created migration: `supabase/migrations/20260630071000_pos_kds_inventory_truth_g2_availability.sql`
  - Adds the availability helper/RPC that separates live stock, pending demand, active holds, accepted demand, and manual cap.
- Created migration: `supabase/migrations/20260630082000_pos_kds_inventory_truth_g3_outcomes.sql`
  - Adds `kds_tickets.first_ready_at`.
  - Ensures stock movement subtype constraints allow `sale_consumption` and `cancelled_after_kds_ready`.
  - Adds partial unique index on `stock_movements` grain `(tenant_id, order_id, movement_subtype, ingredient_id, location_id)` for `sale_consumption` and `cancelled_after_kds_ready`.
  - Adds stock-outcome helpers for paid/completed sale consumption and ready-cancel waste.
  - Rewires payment finalization, KDS ready/served, and active cancel paths to those helpers.
- Modify baseline later:
  - Reflect schema/RPC changes after the forward migrations are reviewed and applied in the normal baseline-refresh lane.
- Modify or replace existing functions:
  - `get_branch_menu_daily_limits_for_pos`
  - `list_branch_menu_daily_limits`
  - `clear_branch_menu_daily_limit`
  - `complete_payment_and_consume_stock`
  - `finalize_paid_order`
  - `cancel_order`
  - `refund_paid_order`
  - `consume_stock_for_order`
  - `consume_stock_for_order_service`
  - `restore_stock_for_order`
  - KDS ready RPCs that set `kds_tickets.first_ready_at`

### Web App

- Modify: `apps/web/app/(protected)/br/[branchId]/settings/menu-limits/*`
  - Rename surface to manager-facing sell control.
  - Show `Tồn | Sẵn bán | Còn`.
  - Remove "hôm nay" wording where it implies a manual-only cap.
- Modify: `apps/web/app/(protected)/br/[branchId]/pos/*`
  - Remove manager menu-limit entry points.
  - Keep only sell-state badges or disabled state.
- Modify: `apps/web/app/(protected)/br/[branchId]/kds/*`
  - Remove menu-limit sheet/management entry.
  - Preserve KDS status workflow only.
- Modify: `apps/web/lib/messages/pos.ts`.
- Modify: `packages/shared/src/labels/vi.ts` if the module label changes from daily limit wording.
- Modify: `packages/shared/src/auth/module-acl.ts` only if route labels or module comments need alignment; allowed roles already match owner + branch_manager.

### Tests

- Modify/add:
  - `apps/web/tests/menu-limits-stock-capacity.test.ts`
  - `apps/web/tests/pos-daily-limit-stock-capacity.test.ts`
  - `apps/web/tests/pos-stock-outcome-contract.test.ts`
  - `apps/web/tests/kds-ready-stock-boundary.test.ts`
  - `apps/web/tests/inventory-pos-unit-conversion.test.ts`
  - Supabase SQL tests if local baseline runner can exercise the RPC shape

## Goal Milestones

### G0 — Decision Contract Frozen

Outcome: repo has one durable decision for this new model.

- [x] Write `docs/plan/decisions.md` D053:
  - paid/completed -> sale consumption
  - cancel after KDS `ready` -> waste
  - cancel before `ready` -> no movement
  - POS/KDS no menu-limit management UI
  - manager UI owns `Tồn | Sẵn bán | Còn`
  - D016 is superseded only after stock catalog and movement conversion are ready
- [x] Add the rollout row to `tasks/todo.md`.
- [x] Keep `Kho CN` / branch default issue location as stock-bearing branch inventory; KDS is not a stock owner.
- [x] Freeze rollout flag: `pos_stock_outcome_posting`, default OFF per branch; rollback = disable flag.
- [x] Freeze payment-before-ready policy: Option B. Payment can happen first, but stock outcome stays pending until both paid and `first_ready_at` are true.
- [x] Freeze the existing holds contract: reuse `branch_menu_item_daily_holds`; active pre-submit holds reduce availability, committed holds tied to an order are not counted twice, completed/cancelled orders release hold demand according to order outcome.
- [x] Freeze idempotency: partial unique index on `stock_movements` grain `(tenant_id, order_id, movement_subtype, ingredient_id, location_id)`.
- [x] Freeze ready boundary: line/ticket `ever-ready` via immutable `kds_tickets.first_ready_at`; `bumped_at` remains current KDS completion/recall metadata only.

Verification:

```bash
corepack pnpm lint:doc-staleness
```

Expected: no new stale snapshot failure.

### G1 — Access And UI Ownership Cleaned

Outcome: POS/KDS cannot manage sell limits; branch manager app can.

- [x] Tighten SQL roles in `clear_branch_menu_daily_limit` to `owner`, `branch_manager`.
- [x] Confirm `set_branch_menu_daily_limit` and `list_branch_menu_daily_limits` reject cashier/chef for management reads/writes.
- [x] Revoke or narrow direct table writes on `branch_menu_item_daily_limits` so browser roles cannot bypass the RPC.
- [x] Remove KDS `MenuLimitsSheet` entry point.
- [x] Preserve KDS operational out-of-stock action if it remains a separate workflow; do not route chef users into quota management.
- [x] Remove POS manager-style menu-limit entry point.
- [x] Keep POS item tiles disabled or badged from computed sell state.
- [x] Rename manager labels:
  - `stockCapacityLabel` -> `Tồn`
  - `manualLimitLabel` -> `Sẵn bán`
  - remaining label -> `Còn`
  - `Hạn mức bán hôm nay` -> `Giới hạn bán`

Verification result:

- Pass: targeted web/shared suites covering menu-limit entry removal and SQL role guards.
- Pass: `corepack pnpm typecheck`.
- Pass: `corepack pnpm lint`.
- Pass: `PATH=$(dirname $(command -v corepack)):$PATH ./node_modules/.bin/turbo lint`.
- Pass: `corepack pnpm build`.

Targeted checks:

```bash
corepack pnpm --filter @comtammatu/web test -- menu-limits-stock-capacity.test.ts pos-menu-limits-entry.test.ts
corepack pnpm --filter @comtammatu/shared test -- scope.test.ts module-acl-matrix.test.ts
```

Expected: route/access tests prove cashier/chef cannot enter the management surface.

### G2 — Availability Source Rebuilt Without Double Count

Outcome: `Còn` uses live stock plus pending demand, not `stock_capacity - sold_today` blindly.

- [x] Create a single availability helper/RPC returning:
  - `menu_item_id`
  - `stock_capacity_live`
  - `manual_limit_quantity`
  - `accepted_today`
  - `pending_unfinalized_demand`
  - `active_hold_demand`
  - `available_to_sell`
  - `is_disabled`
- [x] Keep `branch_menu_item_daily_limits` for manual caps and disabled state.
- [x] Stop using stored `stock_capacity` as the only source for `Còn` when the stock-outcome flag is enabled; POS/settings use RPC `available_to_sell` first and fall back to the old formula only for compatibility.
- [x] Realtime limit updates coalesce a limits refetch because raw table events do not carry computed `available_to_sell`.
- [x] Add tests proving the read-side contract:
  - server `available_to_sell` wins over legacy `stock_capacity - sold_today`
  - pending demand/active holds are present in the SQL contract
  - manual cap still binds through compatibility fallback
  - manager RPC exposes the availability components
- [x] G3 stock-outcome helpers take deterministic order-level advisory locks before posting movements.
- [ ] Full create/append/reduce/void/edit/split demand preservation stays in G4/G6 runtime QA because it needs applied-schema checks against holds and order mutation RPCs.

Verification result:

- Pass: targeted web limit suites.
- Pass: targeted shared SECURITY DEFINER suite.
- Pass: `corepack pnpm typecheck`.
- Pass: `corepack pnpm lint`.
- Pass: `corepack pnpm build`.

Targeted checks:

```bash
corepack pnpm --filter @comtammatu/web test -- pos-daily-limit-stock-capacity.test.ts menu-limits-stock-capacity.test.ts
corepack pnpm --filter @comtammatu/shared test -- security-definer-rpc-static.test.ts
```

Expected: tests encode the new formula.

### G3 — Order Outcome Writes Stock Truth

Outcome: final order outcome writes exactly one stock movement path.

- [x] Payment completion path:
  - allow payment before ready
  - leave stock outcome pending until both paid/completed and `first_ready_at` are true
  - write `stock_movements.type = 'consumption'`
  - write `movement_subtype = 'sale_consumption'`
  - enforce the partial unique index idempotency guard
- [x] Cancel path:
  - inspect whether each relevant KDS ticket/item ever reached `ready`
  - before `ready`: no movement
  - after `ready`: write waste movement with subtype `cancelled_after_kds_ready` for ready lines only
  - require reason for manager/audit on after-ready cancellation
- [x] Preserve immutable ready boundary with `kds_tickets.first_ready_at`; recall does not clear it.
- [x] Use branch warehouse/default issue location for outcome stock movement.
- [x] Keep outcome helpers private from browser roles; service-role callable only.
- [x] Runtime SQL smoke verified hold/order-status demand release on an applied local schema.
- [x] Paid void/refund runtime smoke proved it does not create a second consumption, waste, or restore movement.
- [ ] Map backend stock outcome errors to operator-safe Vietnamese messages if the rollout exposes new failure strings in POS/KDS.

Verification result so far:

- Pass: `corepack pnpm --filter @comtammatu/web test -- pos-stock-outcome-contract.test.ts`.
- Pass: `corepack pnpm --filter @comtammatu/shared test -- security-definer-rpc-static.test.ts`.
- Pass: `corepack pnpm typecheck`.
- Pass: `corepack pnpm lint`.
- Pass: `corepack pnpm build`.

Targeted checks:

```bash
corepack pnpm --filter @comtammatu/web test -- pos-payment-replay-behavioral.test.ts pos-void-paid.test.ts kds-order-status.test.ts
corepack pnpm lint:review-tier
```

Expected: idempotency and ready-boundary tests pass; review-tier identifies this as T3.

### G4 — Multi-Unit Conversion Made Load-Bearing

Outcome: no inventory movement writes entry units directly without base conversion.

- [ ] Standardize the SQL conversion path for stock movement quantities.
- [x] G3 POS outcome helpers avoid the `auth_tenant_id()`-dependent `inv_to_base` path for service-role callers by calling `inv_to_base_for_tenant` with the order tenant.
- [ ] Replace or wrap the remaining non-POS service-role stock posting paths with an explicit tenant-aware helper.
- [ ] Convert or verify these write paths:
  - GRN
  - issue
  - transfer
  - waste
  - stocktake
  - employee count slips
  - production
  - [x] POS sale consumption
  - [x] cancelled-after-ready waste
- [ ] Fail closed when the selected unit is inactive, not attached to the ingredient, or not allowed for that operation.
- [ ] Keep recipe quantities in base until a separate recipe-entry-unit phase is approved.

Targeted checks:

```bash
corepack pnpm --filter @comtammatu/web test -- inventory-entry-unit-atomic-rpcs.test.ts inventory-catalog-hardening.test.ts
```

Expected: static tests catch any movement path bypassing conversion.

Verification result for the POS outcome slice:

- Pass: `corepack pnpm --filter @comtammatu/shared test -- security-definer-rpc-static.test.ts`.
- Pass: `corepack pnpm --filter @comtammatu/web test -- pos-stock-outcome-contract.test.ts`.
- Pass: `codegraph index .` (usable; unchanged warning for 2 unreadable files).
- Pass: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build`.
- Pass: `corepack pnpm db:baseline:local-check`.
- Pass: Supabase Local scratch replay of baseline plus active forward migrations through `20260630082000_pos_kds_inventory_truth_g3_outcomes.sql`.
- Pass: static guard that `refund_paid_order` does not call POS stock outcome helpers or write `stock_movements`.
- Pass: local applied-schema SQL smoke in Supabase scratch:
  - branch trigger created the default warehouse/kitchen locations
  - `refresh_branch_menu_stock_capacity` produced 10 sellable portions from 20 base units and recipe quantity 2
  - `complete_payment_and_consume_stock` after KDS `first_ready_at` posted one `sale_consumption` movement for -4 base units and was idempotent on retry
  - `post_pos_cancelled_ready_waste` posted one `cancelled_after_kds_ready` movement for -2 base units and was idempotent on retry
  - `refund_paid_order` after sale consumption did not create `refund_restore` or any extra stock movement
  - `branch_menu_limit_availability(..., true)` returned `stock_capacity_live=7`, `pending_unfinalized_demand=2`, `active_hold_demand=1`, `available_to_sell=4`

### G5 — Per-Shift Count Gate Stays Intact

Outcome: the stock sale changes do not weaken `Việc trong ca`.

- [ ] Keep `inventory_count` auto-surfaced from active assignments.
- [ ] Keep checkout blocked until assigned location slips are submitted/approved.
- [ ] Ensure count units display in the assigned entry unit but submit base-converted quantities.
- [ ] Add regression coverage if sale/waste movement changes touch count slip helpers.

Targeted checks:

```bash
corepack pnpm --filter @comtammatu/web test -- employee-today-checklist-phases.test.ts employee-daily-work-static.test.ts
```

Expected: checkout gate remains server-authoritative.

### G6 — Runtime QA And Rollout

Outcome: one branch can safely enable the new contract.

- [ ] Keep migration additive where possible.
- [x] Verify local baseline replay with `corepack pnpm db:baseline:local-check`.
- [x] Apply baseline plus active forward migrations to local Supabase scratch first.
- [ ] Use a Supabase preview branch for DB apply verification when the local DB cannot exercise RLS/grants/locks.
- [x] Local applied-schema SQL smoke covered idempotency, default location selection, holds, payment outcome, cancel outcome, paid void/refund no-restore, and tenant-aware unit conversion through recipe/entry unit conversion.
- [x] Local direct grants/RLS SQL smoke covered browser-role table grants, service-role-only outcome helpers, cashier denial for management RPCs/direct DML, and branch-manager success for set/list/clear.
- [x] Local browser route smoke covered Branch Manager sell-control labels `Tồn | Sẵn bán | Còn`, cashier POS entry through an open session and available table into the menu surface, and chef KDS board load with no menu-limit management UI on POS/KDS.
- [ ] Full functional browser smoke remains open for zero-`Còn` item blocking, KDS `ready`, cancel-before-ready release, cancel-after-ready waste, and paid sale consumption. The G8 scratch used a custom Supabase local port, so client realtime/REST calls were blocked by the app's local CSP allowlist for `127.0.0.1:54321`; rerun this pass on the default local Supabase port or extend local CSP for the scratch port.
- [ ] Run full hard gate:

```bash
corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build
```

- [ ] For release-grade PR, run:

```bash
corepack pnpm verify
```

- [ ] Browser smoke after implementation:
  - [x] Branch Manager opens sell-control screen and sees `Tồn | Sẵn bán | Còn`.
  - [x] Cashier opens POS, selects a sell context, reaches the menu, and does not see menu-limit management UI.
  - [x] Chef opens KDS board and does not see menu-limit management UI.
  - POS item becomes unavailable at zero `Còn`.
  - KDS can mark `ready`.
  - Cancel before `ready` releases availability.
  - Cancel after `ready` records waste.
  - Paid order records sale consumption.
- [ ] Production flow:
  - PR merge first.
  - Owner applies production migration manually, unless explicitly delegating apply in that session.
  - Run `corepack pnpm db:types` after the type-source schema is updated.
  - Enable one branch first.
  - Disable the branch flag as the rollback path if stock posting or availability fails.

## Execution Lanes

### Lane A — Contract And UI Authority

Owner: Orchestrator + UI lens.

Files:

- `docs/plan/decisions.md`
- `tasks/todo.md`
- `apps/web/lib/messages/pos.ts`
- `apps/web/app/(protected)/br/[branchId]/settings/menu-limits/*`
- POS/KDS entry-point files

Exit: POS/KDS no longer manage limits; manager surface wording is correct.

### Lane B — Availability And Locking

Owner: Data/DB steward + Senior Dev.

Files:

- `supabase/migrations/20260630120000_pos_kds_inventory_truth.sql`
- `supabase/migrations/00000000000000_baseline.sql`
- `apps/web/app/(protected)/br/[branchId]/settings/menu-limits/menu-limit-cap.ts`
- `apps/web/app/(protected)/br/[branchId]/pos/_utils/daily-limit-draft.ts`
- `apps/web/tests/pos-daily-limit-stock-capacity.test.ts`
- `apps/web/tests/menu-limits-stock-capacity.test.ts`
- `supabase/tests/pos_inventory_availability_truth_test.sql`

Exit: formula is correct and concurrent last-portion writes serialize.

### Lane C — Order Outcome Ledger

Owner: Data/DB steward + QA.

Files:

- `supabase/migrations/20260630120000_pos_kds_inventory_truth.sql`
- `supabase/migrations/00000000000000_baseline.sql`
- `apps/web/app/(protected)/br/[branchId]/pos/order-void-actions.ts`
- `apps/web/app/(protected)/br/[branchId]/pos/void-paid-actions.ts`
- `apps/web/tests/pos-stock-outcome-contract.test.ts`
- `apps/web/tests/pos-void-paid.test.ts`
- `supabase/tests/pos_stock_outcome_idempotency_test.sql`

Exit: sale/waste/no-movement outcomes are idempotent and covered.

### Lane D — Multi-Unit Guardrail

Owner: Inventory domain + Data/DB steward.

Files:

- `supabase/migrations/20260629140000_inventory_multiunit_production_pos.sql`
- `supabase/migrations/20260630120000_pos_kds_inventory_truth.sql`
- `apps/web/tests/inventory-entry-unit-atomic-rpcs.test.ts`
- `apps/web/tests/inventory-pos-unit-conversion.test.ts`

Exit: every new movement path converts through base unit.

### Lane E — Rollout And QA

Owner: QA + Prod-Guard.

Files:

- runbook or worklog note only if runtime evidence needs recording

Exit: first branch enabled with smoke evidence and rollback path.

## Happy Paths

### Paid Order

1. Manager sees `Tồn 30 | Sẵn bán 25 | Còn 25`.
2. POS sells 3 portions.
3. Pending demand makes `Còn 22`.
4. KDS marks tickets `ready`.
5. Customer pays.
6. RPC writes `sale_consumption`.
7. Live stock decreases.
8. `Còn` remains correct because completed demand is no longer subtracted twice.

### Cancel Before Ready

1. POS accepts an order.
2. KDS has not marked `ready`.
3. Manager/cashier cancels with reason according to existing cancel policy.
4. Pending demand is released.
5. No stock movement is written.

### Cancel After Ready

1. POS accepts an order.
2. KDS marks `ready`.
3. Customer cancels.
4. RPC writes waste movement `cancelled_after_kds_ready`.
5. No revenue is counted.
6. Inventory value decreases as real hao hụt.

## Edge Cases To Cover

- Two POS terminals sell the last portion at the same time.
- Manual cap is lower than stock.
- Stock is lower than manual cap.
- Recipe missing for a menu item.
- Ingredient has stock but no active branch warehouse/default issue location.
- KDS `ready` was pressed by mistake.
- Payment is attempted before KDS `ready`.
- Paid order is voided after sale consumption already posted.
- Cancelled-after-ready is retried after network failure.
- Multi-unit factor is missing or inactive.
- Count slip is pending at checkout.
- Side dish has a recipe and is present in `order_items.sides`: outcome helpers consume its recipe together with the main line.

## Backlog After First Slice

1. Manager resolution queue for paid stock-tracked orders that never receive `first_ready_at`.
2. KDS ready rollback with manager reason.
3. Branch-level stock anomaly alerts when `Còn` becomes negative from manual adjustments.
4. Better food-cost variance report: sale consumption vs cancelled-after-ready waste.
5. Replace stored `stock_capacity` trigger with live availability only if the trigger becomes a maintenance burden.
6. Add runbook for first branch enablement and rollback.

## Stop Conditions

- Any migration needs destructive changes before code has stopped reading the old shape.
- Availability formula cannot distinguish completed sales from pending demand.
- Availability formula cannot reconcile active holds, committed holds, accepted orders, completed orders, and cancellations.
- Payment path cannot write stock movement idempotently.
- Cancel path cannot reliably determine line/ticket ever-ready.
- Unit conversion cannot fail closed.
- No branch-level default-OFF rollout flag exists for stock-outcome posting.
- Full hard gate fails.

## Review Fan-In 2026-06-30

Three read-only review lanes were spawned: Data/DB, POS/KDS product flow, and QA/rollout. Agreements:

- Keep the plan T3.
- G0 is frozen in D053; changing payment-before-ready, holds semantics, idempotency, or ever-ready requires updating D053 first.
- Add a default-OFF branch flag for stock-outcome posting.
- Reuse or explicitly retire existing holds; do not add a second reservation system.
- Tighten direct table grants/RLS, not only UI/RPC roles.
- Verify DB behavior with SQL smoke on preview/local, not static tests alone.
- Remove POS/KDS quota-management UI but keep KDS operational out-of-stock separate if still needed.
