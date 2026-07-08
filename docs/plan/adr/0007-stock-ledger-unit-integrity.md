# ADR 0007 — Stock Ledger Unit Integrity Closure

**Status:** Proposed (2026-07-08)
**Decision drivers:** inventory unit phase C closure (drop of legacy `ingredients.purchase_unit` / `measure_unit`); `20260707191741` `stock_movements.entry_unit_id NOT NULL`; cross-model audit (in-house + Codex gpt-5.5 xhigh) confirming five writers break that constraint and two of them silently write non-base quantities.

## Context

The inventory ledger has a two-column contract per movement:

- `stock_movements.quantity_change` — always the **base** unit (the SSOT for `stock_levels.current_quantity`).
- `stock_movements.entry_unit_id` + `entry_quantity` — the unit and quantity the operator entered.

Phase C removed the legacy free-text unit columns on `ingredients` and made `stock_movements.entry_unit_id` NOT NULL (`20260707191741`). A combined audit (Claude Code investigation + Codex gpt-5.5 xhigh verification against the actual SQL) confirmed:

1. **Five writers** omit `entry_unit_id` / `entry_quantity` in their `stock_movements` INSERT, so they raise `23502` at INSERT under the new NOT NULL constraint. Three are LIVE (TypeScript callers in `apps/web`); two are service-role / legacy.
2. **Two of the LIVE writers** (`confirm_supplier_return`, `branch_manager_approve_consumption_report`) also skip `inv_to_base`, writing the entry quantity straight into `quantity_change`. When the entry unit is not the base unit, the ledger and `stock_levels` silently diverge.
3. The source line tables (`supplier_return_items`, `attendance_consumption_report_lines`) carry a free-text `unit` column, not a real `entry_unit_id`, so the writers cannot convert correctly even if patched alone.
4. No reconciliation view asserts `SUM(stock_movements.quantity_change) = stock_levels.current_quantity`, so drift is only caught by stocktake.
5. No DB-level CHECK ties the sign of `quantity_change` to `type`; the invariant lives only in writer convention.
6. `grn_amend` is a correction delta and may be positive OR negative; any sign rule must place it in the any-sign bucket.

Codex's extra findings folded in: `stock_issue_items` also needs `entry_unit_id` on the HRM consumption path; `unit_cost` on supplier return must be normalised to per-base-unit to stay comparable to GRN-posted WAC; the first-movement `UPDATE … INSERT` race on `stock_levels` (unique key `(ingredient, branch, location, tenant)`) is a known but lower-priority concurrency edge.

## Decision

Close the ledger unit contract with a five-file forward migration chain. Additive only — no destructive column drops, no signature changes that break deployed app code. Each file is independently idempotent and applies clean on a fresh baseline replay as well as on production (where `20260707191741` already ran).

1. `20260708120000_inventory_unit_backfill_entry_unit.sql` — idempotent backfill of any remaining NULL `stock_movements.entry_unit_id` to the ingredient's active base unit, with `entry_quantity` falling back to `ABS(quantity_change)`. Catches rows the earlier `20260708103000` backfill missed.
2. `20260708120500_inventory_source_line_entry_units.sql` — add real `entry_unit_id` to `supplier_return_items` and `attendance_consumption_report_lines`. Backfill prefers the authoritative source where one exists (`grn_items.entry_unit_id` for supplier returns) and falls back to the ingredient base unit. Composite FK `(entry_unit_id, tenant_id) -> units(id, tenant_id)` added `NOT VALID` then validated. Patch the three upstream line writers (`create_supplier_return_from_grn`, `create_supplier_return_from_stock`, `employee_submit_consumption_report`) so future rows populate `entry_unit_id` and no longer reference the dropped `unit` / `ingredients.purchase_unit` columns. The 5-arg `employee_submit_consumption_report(bigint, bigint, jsonb, text, boolean) RETURNS bigint` signature is preserved verbatim — only the report-lines INSERT changes.
3. `20260708121000_fix_inventory_live_writers.sql` — re-declare the three LIVE writers so every `stock_movements` INSERT carries `entry_unit_id` + `entry_quantity` and converts via `inv_to_base`. `confirm_supplier_return` normalises `unit_cost` to per-base-unit. `branch_manager_approve_consumption_report` also writes `entry_unit_id` on `stock_issue_items` and resolves the entry unit per loop iteration. `confirm_production_run` only adds entry cols to the raw-material leg; `production_runs.completed_by` is NOT referenced (column does not exist).
4. `20260708121500_inventory_legacy_writer_repair.sql` — re-declare the two latent writers (`confirm_production_order`, `consume_stock_for_order` + `consume_stock_for_order_service`) with the same entry-col + base-unit resolve patch. No TypeScript caller today, but the NOT NULL constraint would raise if they were invoked; the audit must close every writer.
5. `20260708122000_stock_ledger_reconciliation_and_sign_check.sql` — add `public.stock_ledger_reconciliation(p_branch_id, p_location_id)` returning rows where `abs(SUM(quantity_change) - current_quantity) > 0.001`. Tenant-scoped via `auth_tenant_id()` AND branch-scoped via `has_permission(p_branch_id, 'inventory:read')` (so the SECURITY DEFINER function does not bypass branch inventory RLS). Add `stock_movements_quantity_sign_by_type_check` after a precheck that raises `stock_movements_quantity_sign_precheck_failed` on dirty data; the constraint is added `NOT VALID` then `VALIDATE`d to avoid an ACCESS EXCLUSIVE rewrite. `grn_amend` is in the any-sign bucket (positive or negative delta). Zero is permitted in the positive/negative buckets (a no-op movement is allowed), so the rule only flags a strictly wrong sign.

## Consequences

- **Positive.** Every `stock_movements` writer now honours the base/entry pair and the NOT NULL constraint holds. Supplier return and HRM consumption no longer silently mis-write the base quantity. Operators get a reconciliation RPC to detect drift. The sign-vs-type invariant is DB-enforced, not convention-only.
- **Negative / trade-off.** The two source-line tables keep their legacy free-text `unit` column (not dropped) to avoid a destructive coupling with deployed app code; new writers stop relying on it for ledger math. The HRM consumption source-location CTE still compares raw `l.quantity` against `current_quantity` — this is safe because HRM lines are authored in base after phase C and the migration #2 backfill resolves historical rows to base, but it means a future HRM flow that lets staff pick a non-base entry unit would need the CTE converted too.
- **Verification gap.** `corepack pnpm db:types` must run after the owner applies the chain to the type-source schema; until then generated types do not reflect the new column / RPC. `typecheck`, `lint`, and all repo guards pass with the migration files in place (no TypeScript source changed). `db:baseline:local-check` could not run in this session (Docker unavailable) — the owner should run it on a Preview Branch before prod apply.
- **Review tier.** The repo review-tier guard floors this work at T3 (migration × multiple, money/WAC, auth/RLS-adjacent). It must go through the full T3 debate per `docs/agent/rules/workflow.md` before merge; the advisory from `corepack pnpm lint` is recorded here.

## Open Items (Follow-up)

- `inv_from_base` helper does not exist; inverse conversions are inlined ad hoc. Add a single audited helper if more base->entry surfaces appear.
- `trg_update_stock_on_movement` still does not maintain `avg_unit_cost`; WAC stays writer-owned. Centralise the WAC formula if a third variant appears.
- First-movement race on `stock_levels` unique key (concurrent `UPDATE` then `INSERT` on the same stock key) — known, lower priority; consider an `INSERT … ON CONFLICT` rework if concurrency incidents appear.
- Inter-branch transfer has no explicit "in transit" stock account; received < shipped posts only the received quantity with no balancing movement. Operationally intended today; revisit if loss-in-transit reporting is needed.
