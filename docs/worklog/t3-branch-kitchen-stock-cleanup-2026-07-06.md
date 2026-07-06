# T3 Branch Kitchen Stock Cleanup - 2026-07-06

> Reconciled-through f3f32966b

Skill plan: repo rules = engineering + skills + database + UI + workflow; external skills = supabase + supabase-postgres-best-practices; runtime tools = CodeGraph + Supabase CLI local migration creation + pnpm gates; skipped = production apply and live write checks because production is SELECT-only unless owner delegates apply.

PM: scope is limited to making Bep CN a stock-bearing branch location and showing where its quantity sits in the stock surface. Acceptance is: branch kitchen stock is counted in branch stock, kitchen stock is visible as a location breakdown, and production receives only a migration file for owner apply.

BA: Bep CN is inventory while goods are physically there; stock decreases only when a consumption/export movement is posted. Existing ledger rows must not be rewritten blindly, and old kitchen locations with stock must remain visible rather than being deleted.

Senior Dev: use the existing `stock_levels.location_id` model, `fetchStockBearingLocationIds`, and current stock page aggregation. The migration standardizes each branch's canonical kitchen location/default-consumption flag and seeds only zero-quantity kitchen stock rows where needed.

QA/QC: cover the stock page query and UI type with static tests, keep the existing inventory rebuild checks passing, re-index CodeGraph after changes, then run `corepack pnpm typecheck`, `corepack pnpm lint`, and `corepack pnpm build`.

Unified contract: no new Bep CN page. Bep CN appears in `Tồn kho` as part of the per-item total and as a location breakdown under the quantity; item detail continues to show the full location rows. The migration must be idempotent and must not mutate production during agent execution.
