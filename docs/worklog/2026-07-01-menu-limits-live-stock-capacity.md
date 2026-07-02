# Menu-Limits Live Stock Capacity

Reconciled-through 0a85386e

Skill plan: repo rules = engineering + database + workflow + team; external skills = investigate + supabase; runtime tools = CodeGraph + Supabase read-only SELECT + CLI migration; skipped = external subagents unavailable, single-runtime transcript used.

PM: Fix the regression where Menu-Limits shows no stock after daily limit rows are cleared. MVP is a migration-only fix that makes the manager list and POS availability consume live computed stock without seeding rows.

BA: `branch_menu_item_daily_limits` stores manual caps and snapshots, but missing rows must not mean missing stock when recipes and warehouse stock are valid. Existing manual limit, disabled state, sold counters, active holds, and stock-outcome availability semantics stay unchanged.

Senior Dev: Update `branch_menu_limit_availability(...)` so `stock_capacity` and `stock_capacity_live` fall back to `compute_menu_item_stock_capacity(...)`. Keep `list_branch_menu_daily_limits(...)` and POS callers on that shared function. Avoid data backfill and avoid production apply in this session.

QA/QC: Runtime SELECT confirmed Phuoc Hai has 22 computable positive items with null displayed stock because today's daily-limit rows are missing. Static tests must assert the SQL fallback and the existing menu-limit tests must pass.

Synthesis: Agreements: one shared SQL function is the root cause and the smallest safe fix. Conflict resolved: do not seed `branch_menu_item_daily_limits`; dynamic fallback avoids another cleanup job and keeps manager-entered caps as the only persisted state. Verification: static test, TypeScript/lint/build if feasible, plus CodeGraph re-index after edits.
