# T3 Inventory GRN RPC Schema Cleanup - 2026-07-06

> Reconciled-through f3f32966b

Skill plan: repo rules = engineering + skills + database + workflow; external skills = supabase + supabase-postgres-best-practices; runtime tools = CodeGraph + Supabase SELECT-only audit + Supabase CLI migration creation + pnpm tests; skipped = production apply because production is owner-applied only.

PM: Scope is limited to closing the remaining GRN base-unit legacy path. Acceptance is: new GRN confirmations stay base-unit correct, post-confirm GRN amendments post base-unit deltas, and the known legacy GRN receipt row can be corrected by migration without widening Inventory scope to FIFO, lots, or requisitions.

BA: `entry_unit_id` maps to `units.id`; conversion must join `ingredient_units` by `(tenant_id, ingredient_id, unit_id)`. `stock_movements.quantity_change` and `stock_levels.current_quantity` are base-unit quantities. Existing `grn_amend` rows cannot be inferred from the current GRN line without stored entry metadata, so migration fails fast if such legacy rows exist.

Senior Dev: Keep the fix in one migration: override `amend_grn_line`, backfill mismatched `grn_receipt` movements, and adjust `stock_levels` by the movement delta. Do not mutate production during agent execution.

QA/QC: Static tests cover the RPC body and backfill contract. Production SELECT-only dry-run must show the target count before owner apply and should show zero mismatches after owner apply.
