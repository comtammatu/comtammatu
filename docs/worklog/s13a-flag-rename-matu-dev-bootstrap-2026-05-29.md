# S13A stocktake flag rename + matu-dev dev sandbox bootstrap — 2026-05-29

WS-4 naming cleanup (de-version the S13A stocktake feature flag) plus standing
up a personal dev sandbox to validate the data migration off production.

## S13A flag rename (shipped to repo, validated on dev)

- **Change:** flag key `inv_s13a_stocktake_v2` → `inv_stocktake_redesigned`;
  TS constant `S13A_STOCKTAKE_V2` → `INVENTORY_STOCKTAKE_REDESIGNED`.
- **Files:** `supabase/migrations/20260602007000_rename_s13a_stocktake_flag.sql`
  (UPDATE of `branch_feature_flags.flag_key`), `inventory/_lib/feature-flags.ts`
  (constant), `inventory/stocktake/new/page.tsx` + `inventory/stocktake/[id]/count/page.tsx`
  (2 gate call sites). `is_feature_enabled(branch_id, flag_key)` is generic → no fn change.
- **Validated on matu-dev:** 4 rows renamed, 0 leftover on old key, 4 distinct
  branches (no PK conflict), `is_feature_enabled()` resolves cleanly on the new key.
- **Production ordering (owner-applied):** apply the migration BEFORE/with deploying
  the code reading the new key — until applied, the gate fails safe (UI hidden).
- **Left intact deliberately:** URL error token `stocktake_v2_not_enabled` is
  load-bearing (read in `stocktake/[id]/page.tsx` to break a count↔[id] redirect loop
  when the flag is off). Renaming it is a separate, string-coupled cosmetic change — not
  done here. Historical seed `20260425170000` still lists the old key (applied migration,
  not edited); new branches are not auto-seeded flags anyway.

## matu-dev dev sandbox (`nikkridjukdbqvkvqlmi`)

Owner created a personal dev project (`matu-dev`, region ap-southeast-1) and pointed
`.env.local` at it (iexw config commented out). Bootstrapped the schema via
`supabase db push --db-url` (targeting matu-dev directly so the tracked `config.toml`
prod link is untouched).

### Two latent migration-chain findings (the chain does NOT replay cleanly from scratch)

1. **`check_function_bodies` ordering bug.** `20260508055046_hddt_summary_rpcs.sql`
   creates `LANGUAGE sql` fn `_compute_vat_breakdown` referencing `order_items.vat_rate`,
   but that column is only added later by `20260509000000_finance_phase1_5_vat_per_line.sql`.
   With `check_function_bodies=on` (default) Postgres validates the body at CREATE → fails.
   **Workaround:** `ALTER ROLE postgres SET check_function_bodies = off` before push
   (prod likely applied via pg_dump-style restore which sets this off).

2. **Data-seed migrations not replayable.** `20260508070447_seed_suon_cong_recipe.sql`
   (and the sibling `seed_suon_*` / `redo_suon_*` cluster) seed recipe rows for menu item
   "Sườn cọng" and hard-assert `RAISE EXCEPTION ... kỳ vọng 21 ... got 0`. On a fresh DB the
   menu item doesn't exist (created via the app on prod, not by a migration) → assertion fails.
   A from-scratch bootstrap stalls here.

### Status

- ~254/375 migrations applied. Schema present through the inventory feature-flag foundation
  (`branch_feature_flags` + `is_feature_enabled` + seeded flags) — sufficient to validate the
  S13A rename. NOT a full dev env yet.
- To finish: either seed the prerequisite menu/ingredient base data, or
  `supabase migration repair --status applied <seed versions>` to skip the data-seed cluster
  (schema-complete, recipe seed data absent). Owner decision — depends on what the dev env needs.

## Config notes

- `.mcp.json` still points `project_ref=xyjpeoucwaouusknjlhm` (deprecated W0' green Supabase).
  Stale; the Supabase MCP routes by per-call `project_id` so it didn't matter. Worth fixing.
- `.env.local` `SUPABASE_PASSWORD` was initially the stale iexw password (failed matu-dev auth);
  owner updated it to matu-dev's. App runtime uses HTTPS anon/service keys, so this only affects
  CLI/migration direct-DB connections.
