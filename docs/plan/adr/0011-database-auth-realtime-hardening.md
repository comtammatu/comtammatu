# ADR 0011 — Database, auth, and realtime hardening

**Status:** Partially implemented (2026-07-10) — the six confirmed P1 findings are remediated in code
and migration files; the migrations await the owner's production apply. P2/P3 remain parked.\
**Revisit trigger:** Owner prioritizes one of the remaining P2/P3 findings, resolves one of the listed
policy decisions, or production metrics show further regression in the affected path.\
**Evidence snapshot:** 2026-07-10 production schema, query statistics, and Supabase Advisor output.

## Implementation status

| Finding | Status | Where |
|---------|--------|-------|
| P1-1 per-row `has_permission` in orders RLS | Addressed indirectly: the three aggregate RPCs below remove the full-set scans that made it hurt. The policies themselves are unchanged — a row-column argument can never be initplan-hoisted. | `20260710090000_orders_and_sales_aggregate_rpcs.sql` |
| P1-2 `/orders` summary | Implemented — `get_orders_summary` replaces two count-exact scans plus the SECURITY INVOKER `get_orders_paid_summary`, whose drop is deferred to `20260710093000` (see Apply order). | same migration + `orders/actions.ts` |
| P1-3 food-cost | Implemented, **deviating from the fix proposed below** — see the deviation note in that section. | same migration + `_lib/food-cost-actions.ts` |
| P1-4 deactivated staff keep access | Implemented — `is_active` predicate added to the staff-grant branch of both `has_permission` and `has_permission_any`. | `20260710091000_has_permission_active_profile_guard.sql` |
| P1-5 GRN write RLS | Implemented — `grn_items_write` FOR ALL split into branch + draft-scoped INSERT/UPDATE/DELETE; `grn_update` branch-scoped and draft-gated, with WITH CHECK admitting `cancelled` so the discard path still works. | `20260710092000_grn_write_branch_draft_scope.sql` |
| P1-6 variance truncation | Implemented — `get_theoretical_consumption` aggregates the theoretical side in SQL. | `20260710090000_*.sql` + `inventory/report-actions.ts` |

### Apply order

`20260710090000` is additive while `20260710093000` is destructive, so they cannot be applied as one
step: the deployment currently running in production still calls `get_orders_paid_summary`, whereas the
code on `main` already calls the three new RPCs. Dropping before the deploy breaks `/orders` on the live
app; deploying before the additive migration breaks it the other way. Hence:

1. Apply `20260710090000` (three new RPCs). Production then holds both the old and the new functions, so
   the running deployment is unaffected.
2. Apply `20260710091000` (`is_active` guard) and `20260710092000` (GRN write RLS). Neither is coupled to
   an app version.
3. Run `corepack pnpm db:types`, then deploy `main`. Nothing calls `get_orders_paid_summary` any more.
4. Apply `20260710093000`, which drops it. `supabase/migration-rollback/20260710093000_*_down.sql` recreates the function if
   the deploy has to be rolled back.

DDL was validated on a throwaway preview branch, which also caught a real defect: policy bodies using bare
`auth_tenant_id()` / `has_permission()` do not resolve under `SET search_path = ''`, so every policy
expression is schema-qualified.

Scope: 7 parallel lanes over `apps/web`, `packages/shared`, `supabase/migrations`, plus SELECT-only
evidence from PROD (`iexwsuaqqenyjiskawoj`) and Supabase Advisor (security + performance).
All P0/P1 findings were adversarially re-verified against live PROD; verdicts noted inline.

## Verdict

No P0. Six P1s, all confirmed. The database is small (largest table 39 MB, cache hit 1.0000,
no I/O or connection pressure) — every performance problem is **CPU burned by per-row RLS
permission checks**, not by data volume. The security posture is strong inside function bodies
(0 SECURITY DEFINER functions with unpinned `search_path`; every risk-ranked money/auth RPC has an
internal ACL check) and weaker at the grant/policy layer.

Advisor triage: the 170 `authenticated_security_definer_function_executable` warnings are noise
(bodies check ACL); the 208 `unindexed_foreign_keys` are index spam (audit columns pointing at a
3-row `profiles` table) — exactly one index is worth creating. The 5 `auth_rls_initplan` warnings
are real but minor; the advisor **misses** the actual initplan killer (`has_permission(branch_id, …)`
takes a row column, so it can never be hoisted).

---

## P1 — confirmed

### 1. Per-row `has_permission()` in `orders` / `order_items` RLS (root cause of all slow queries)

`orders_select` = `tenant_id = auth_tenant_id() AND (has_permission(branch_id,'orders:read') OR has_permission(branch_id,'kds:use'))`.
The argument is a row column ⇒ no initplan hoist ⇒ the STABLE SECURITY DEFINER helper runs per row.

PROD evidence: `profiles` (3 rows) has **10,402,002 seq scans**, `positions` (8 rows) **10,333,566** —
that is the helper firing. Any full-set query over `orders` (8,539 rows) or `order_items` (18,153 rows)
costs 2.7–4.5 s despite 100% cache hit.

Fix: full-set aggregates must go through SECURITY DEFINER RPCs that check tenant + permission **once**
at the top. Do not attempt an initplan rewrite of these policies — it is impossible with a row-column
argument. (`staff_permissions` already has the covering btree; cost is invocation count, not probe cost.)

### 2. `/orders` page burns ~9 s of DB CPU per view

`apps/web/app/(protected)/orders/actions.ts:258-287` fires `Promise.all` of two `count:'exact'` head
scans plus `rpc('get_orders_paid_summary')` — and that RPC is `prosecdef=false` (SECURITY INVOKER),
so its `count(*)/sum()` runs under the per-row RLS above.

`pg_stat_statements`: unfiltered count-exact 70 calls / mean **3,330 ms**; `get_orders_paid_summary`
70 calls / mean **2,816 ms**; branch-filtered variants 2,727 / 3,116 ms. Scales linearly with order count.

Fix: one SECURITY DEFINER RPC (pinned `search_path`) returning `total_count`, `in_progress_count`,
`paid_count`, `paid_revenue` for the filter set. Expected ~9 s → <50 ms.

### 3. Food-cost report is the #1 application statement (808 s total)

`apps/web/app/_lib/food-cost-actions.ts:52-88` pages **every** `order_items` row through PostgREST
(`orders!inner` embed) and aggregates in Node. `pg_stat_statements`: 178 calls, mean **4,540 ms**,
total **808,097 ms** — only Supabase Realtime's internal WAL poller costs more. Each page re-runs the
LATERAL join with both `order_items` and `orders` RLS firing per row.

A SECURITY DEFINER `public.get_food_cost(p_branch_id, p_start_date, p_end_date)` **already exists in
PROD** (baseline.sql:13082, present in generated types) and has **zero callers**.

Worse: this fetch sits on the finance cockpit critical render path
(`finance/_lib/finance-cockpit.ts:668`), `finance/food-cost/page.tsx:24`, `inventory/reports/page.tsx:92`.

Fix: reconcile `get_food_cost`'s unit-conversion/yield logic with the TS implementation, then call it
and delete the pagination loop.

**Deviation (implemented).** `get_food_cost` was *not* adopted. It reads `mv_food_cost`, which buckets by
`date_trunc('week', …)` and costs recipes off a `DISTINCT ON` latest-GRN price with **no entry-unit → base
conversion and no yield factor**. `9b20f3eda` had deliberately replaced that RPC with the TypeScript
`buildFoodCostRows` path precisely to get unit-conversion-aware costing, so calling `get_food_cost` again
would have regressed correctness to buy performance.

What shipped instead: `get_menu_item_sales_agg` aggregates only the *sales* side —
`SUM(quantity)`, `SUM(subtotal)` and the first `item_name` per `(branch_id, menu_item_id)` — under one
permission check. `buildFoodCostRows` consumes that pre-grouped input unchanged (it already sums per
group, so pre-aggregation is behaviour-preserving) and keeps the recipe/unit-cost math in TS against the
small `recipes` table. This removes the 18k-row PostgREST dump and the row-cap truncation without
touching the costing model.

### 4. Deactivated staff keep full data-plane write access

`toggle_profile_active` (baseline.sql:24529) only flips `profiles.is_active`. It does not revoke
`staff_permissions`, does not ban the auth user, and nothing anywhere revokes sessions/refresh tokens.
`has_permission` / `has_permission_any` check only grant validity — **no `is_active` predicate**.

PROD: **7 inactive profiles still hold 142 live grants**, including `pos:use`, `pos:void_order`,
`inventory:write`, `orders:void`/`refund`, `hr:approve_checkout`. A deactivated employee can re-login
and keep calling permission-gated SECURITY DEFINER RPCs (e.g. `void_order_item`, which derives
tenant/branch from `profiles`, not from JWT claims) via direct PostgREST, indefinitely.

Scope correction from verification: the "owner bypass" half of this is already fixed
(migration `20260707181000` routes it through the `is_active`-guarded `auth_is_owner`); and direct
RLS *table* writes fail with a claim-less token (185/186 policies reference `auth_tenant_id()`).
The live hole is the **staff-grant branch of `has_permission` + claims-independent RPCs**.

Fix: add an `is_active` predicate to both EXISTS branches of `has_permission` / `has_permission_any`.
Optionally have the deactivation action ban the auth user to kill refresh tokens.

### 5. `grn_items` / `goods_received_notes` write RLS is tenant-wide with no draft gate

`grn_items_write` (FOR ALL) = `tenant_id = auth_tenant_id() AND has_permission_any('procurement:grn_create')`.
`has_permission_any` has **no branch predicate**, and `authenticated` holds INSERT/UPDATE/DELETE on both
tables. No trigger blocks it. So a holder of `procurement:grn_create` at branch 2 (PROD has 3 such users)
can `UPDATE`/`DELETE` lines and headers of **confirmed** GRNs at branch 3 via crafted PostgREST calls,
bypassing the audited `amend_grn_line` RPC and silently diverging the document from posted stock ledger.

Because the policy is `FOR ALL` it also adds a second, tenant-wide **SELECT** path over the correctly
branch-scoped `grn_items_select` — this is the one advisor `multiple_permissive_policies` entry that is
an access-widening bug rather than a perf duplicate.

The draft/branch checks exist only in TypeScript (`inventory/grn-actions.ts:783`).

Fix: mirror the sibling `stock_issue_items_write` pattern — scope to the parent GRN's `branch_id` via
`has_permission(g.branch_id, …)` and to `g.status = 'draft'`; leave `amend_grn_line` as the only
post-confirm path.

### 6. Consumption-variance report silently truncates at the PostgREST row cap

`inventory/report-actions.ts:309-319` selects all order ids in range with no `.range()`/`.limit()`.
PROD has 2,402 completed orders / 30 d and crosses the ~1,000-row cap around **day 13**, so any longer
range computes theoretical consumption from only the first 1,000 orders while the actual side
(`stock_movements`, 231 rows) is complete ⇒ **variance numbers are wrong, not just slow**.

The team already hit and documented this exact cap in `orders/actions.ts:273` and fixed it there with
an aggregate RPC. Same fix applies. (The chunk loop at `:352-410` also re-fetches the 21-row `recipes`
table once per 200-order chunk, sequentially.)

---

## P2

| # | Finding | Where |
|---|---------|-------|
| 7 | `ALTER DEFAULT PRIVILEGES … GRANT ALL ON FUNCTIONS TO authenticated` makes every new RPC callable by default (250/357 functions). Root cause of the 170 advisor warnings. Newer migrations already REVOKE per-function — the default keeps re-opening. | baseline.sql:48140 |
| 8 | `has_permission()` never checks that the caller-supplied `branch_id` belongs to the caller's tenant. `rotate_branch_override_code` writes keyed only on `branch_id` ⇒ latent cross-tenant write (single-tenant PROD today). | baseline.sql |
| 9 | `use-pos-menu-sync` has no coalescing: one paid order emits ~1 broadcast per recipe ingredient (`stock_levels` FOR EACH ROW trigger) ⇒ ~N full-menu refetches + N stacked toasts per POS client. Sibling surfaces use `useRealtimeRefresh`'s trailing debounce. | `pos/_hooks/use-pos-menu-sync.ts:46-54` |
| 10 | `REPLICA IDENTITY FULL` on `kitchen_send_batches` + `printer_agents`, which are **not in the realtime publication** — pure WAL amplification on every heartbeat/kitchen send. | baseline.sql:29189, :30671 |
| 11 | `REPLICA IDENTITY FULL` on `print_jobs` (40 MB, UPDATE-churn, UPDATE-only subscriber), `order_status_history` + `notifications` (INSERT-only subscribers) — FULL buys nothing there. Keep it on orders/tables/kds_tickets/payments (filtered DELETE delivery). | baseline.sql |
| 12 | Three concurrent `postgres_changes` subscriptions on `notifications` per POS client; two are tenant-wide firehoses filtered client-side. Per-event RLS cost is per-subscriber. | `use-notifications.ts`, `use-foreground-notifications.ts`, `use-order-sync.ts:588` |
| 13 | Payroll self-read "paid-only" gate is **dead**: `pe_employee_self_select` ORs it away, so employees can read their own DRAFT payroll. Two archived migrations state contradictory intents (0602 dropped it; 0616 says it "is KEPT"). Owner decision. | baseline.sql:41872 |
| 14 | Role-scope mismatch: `office` holds `procurement:price_list_read` **branch-scoped**, but the three read policies check `has_permission(NULL, …)` (tenant-wide only) ⇒ the read grant is dead; reads survive only through the FOR ALL write policy, and `grn_baseline_pause` is unreadable for `office`. | baseline.sql:40710/42029/42852 |
| 15 | 5 `auth_rls_initplan` policies use bare `auth.uid()`; the codebase already uses the wrapped `(select auth.uid())` form elsewhere. Mechanical. | attendance_consumption_report(_lines), annual_leave_entitlements, inventory_count_assignments/_slips |
| 16 | `sync_insurance_base` RPC error swallowed after the contract upsert — payroll/BHXH insurance base can diverge silently. Two dependent writes, no atomicity. | `hr/actions.ts:167-169` |
| 17 | `importMenu` is multi-phase and non-atomic; an early return after phase 1/2 leaves committed rows behind a **stale** POS menu cache (revalidation only on the full-success path). | `menu/actions.ts:788, 1340-1343` |
| 18 | N+1: `createStockTransferDraft` awaits `resolveEntryUnitCode` per line (1 query each). The waste flow already has the batched `.in()/.in()` equivalent. | `inventory/transfer-actions.ts:577-583` |
| 19 | Operator dashboard `payments` + `orders!inner` embed: 308 calls, mean 408 ms — same RLS-join pattern, user-visible poll path. | `(operator)/dashboard/data.ts:85` |
| 20 | 14 confirmed unused indexes (lifetime `idx_scan=0`; index stats never reset), all on hot insert paths (`notifications`, `print_jobs`, `kitchen_send_batches`, `order_status_history`) ⇒ pure write amplification. `kitchen_send_batches` carries a **literal duplicate pair** on `order_id`. | — |
| 21 | FK-index triage: of the advisor's 208, exactly **one** is worth creating: `idx_print_jobs_reprinted_from` (self-FK, largest table, rows actually deleted). The rest reference the 3-row immutable `profiles`. Decline as spam. | — |

## P3 (informational)

- 23 client-callable RPCs have zero callers repo-wide (incl. `close_period_hard`/`reopen_period`,
  `override_grn_hardblock`, `rotate_branch_override_code`). Attack surface + maintenance debt.
  Owner confirms which are planned-UI before any REVOKE/DROP.
- 59 functions executable by `anon` (all SECURITY INVOKER, so RLS still gates them) including
  `close_pos_session`, `save_print_template_version`, `toggle_item_active`.
- `log_audit` lets any authenticated user fabricate audit rows (actor is stamped correctly; content is not).
- `grant_permission`: the extend/UPDATE branch writes no `permission_audit_log` entry; and it never checks
  the granter holds the key being granted (two `staff:assign_permission` holders can escalate by mutual
  grant — not exploitable today: all 5 holders are owners).
- Demotion leaves stale JWT claims for ≤ token TTL and never reconciles `staff_permissions`.
- `branch_manager` holds `hr:view_employee` **tenant-wide** while every other key is branch-scoped ⇒
  cross-branch profile/leave reads. Confirm intent.
- `rls_enabled_no_policy` trio (`archive_run_log`, `order_daily_counters`, `reconcile_run_log`) is
  deny-by-design: only `service_role` holds grants. Not a lockout.
- Anon surface is clean: the only policies naming `anon` are 3 deny-all (`false`) policies.
- Hot POS/KDS path still rides `postgres_changes`; the ops-bus escape hatch exists and is proven.
- Auth config (dashboard toggles, no code): leaked-password protection **off**, too few MFA options,
  Auth capped at 10 absolute DB connections (switch to percentage-based).

---

## Recommended order

Steps 1–4 are done (see "Implementation status" above); step 5 remains.

1. ~~**Perf, one migration + one code change**: SECURITY DEFINER aggregate RPC for `/orders` summary (P1-2)
   and switch food-cost to `get_food_cost` (P1-3).~~ Done, except food-cost uses the new
   `get_menu_item_sales_agg` rather than `get_food_cost` — see the deviation note under P1-3.
2. ~~**Security, one migration**: `is_active` predicate in `has_permission`/`has_permission_any` (P1-4).~~ Done.
3. ~~**Security, one migration**: branch + draft scope on `grn_items_write` / `grn_update` (P1-5).~~ Done.
4. ~~**Correctness**: aggregate RPC for consumption variance (P1-6).~~ Done.
5. Then P2 sweeps: default-privileges revoke (7), replica identity (10, 11), realtime coalescing (9, 12),
   initplan rewrite (15), index cleanup (20, 21).

Owner decisions needed: payroll self-read intent (13), `office` price-list scope (14),
`branch_manager` HR scope, dead-RPC retention.

All migrations are file → PR → owner applies (no dev target; see `docs/agent/rules/database.md`).
