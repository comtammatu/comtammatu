# POS KDS And Kitchen Print Routing Fix

Status: Reconciled-through 18d060cbbb4a3319cb16f7535bac0764d5d7bcba; superseded by generic kitchen route policy.

Skill plan: repo rules = engineering + database + workflow + team; external skills = supabase, supabase-postgres-best-practices; runtime tools = codegraph, Supabase CLI read-only/prod ledger, local tests; skipped = production apply because the owner applies production migrations manually.

PM: Scope is the live POS dispatch bug where items without an explicit KDS station route should go to the existing kitchen printer route instead of being hardcoded as bill-only.

BA: Explicit KDS category mapping creates KDS tickets. If no active KDS category mapping exists, an active kitchen-ticket printer route handles the item. Missing both KDS and printer routing stays fail-loud.

Senior Dev: Fix the root routing function `route_order_to_kds` so all callers inherit the behavior: create order, append order items, and manual send. Keep warning behavior tied to real missing KDS/printer routing, not category type.

QA: Add static KDS regression coverage, extend the SQL contract test, and verify the stock outcome helper consumes non-KDS lines only after kitchen dispatch. Do not apply the migration to production in this task.

Attestation: The correction migration removes category-type hardcode from `route_order_to_kds`, removes blank-station fallback routing, uses category-specific or default kitchen printer dispatch, and keeps `kds_no_route` for missing route configuration.
