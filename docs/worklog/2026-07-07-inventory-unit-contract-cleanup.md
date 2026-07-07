# Inventory Unit Contract Cleanup

> Reconciled-through fd912b955

Skill plan: repo rules = engineering + database + workflow; external skills = supabase + supabase-postgres-best-practices; runtime tools = CodeGraph + local checks; skipped = no production writes.

PM: scope is the Phase C unit-contract breakage only. Done means active runtime queries and post-Phase-C migrations no longer read dropped legacy unit columns.

BA: `entry_unit_id` points to `units.id`; conversion belongs to `(ingredient_id, unit_id)` in `ingredient_units`; stock levels, movements, and WAC are base-unit values. Supplier-return rows no longer carry entry-unit history, so display uses the ingredient base unit.

Senior Dev: reuse the existing unit catalog and PostgREST embeds. Synthesize display `unit` at the action boundary where older clients still expect it; do not add new data columns or backfill production.

QA/QC: static guard blocks legacy unit selects and post-Phase-C migration references. Full repo gates remain `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build`.
