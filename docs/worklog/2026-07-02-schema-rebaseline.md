# Schema Re-baseline — 2026-07-02

Reconciled-through c4cf7e11

Skill plan: repo rules = engineering + database + workflow + re-baseline runbook; external skills = supabase, supabase-postgres-best-practices, ponytail; runtime tools = `pg_dump` read-only against `iexwsuaqqenyjiskawoj`, local Supabase baseline replay, schema drift audit script.

Review tier: T3. This changes the baseline migration artifact and the active migration chain, but does not apply any migration or write to production.

## T3 Contract

PM: scope is one re-baseline from current production schema into `supabase/migrations/00000000000000_baseline.sql`, plus archiving forward migrations represented by that dump. Acceptance requires baseline/prod schema drift Set A and Set B to resolve, local from-empty replay to pass, and standard repo gates to pass. Out of scope: production ledger repair, production migration apply, or new schema behavior.

BA: production remains SELECT-only for the agent; `pg_dump --schema-only` is the only prod-touching operation. The committed baseline is a replay artifact for future fresh environments, while production keeps its existing `schema_migrations` ledger. Managed surfaces omitted by schema dump must stay covered by the fold migration policy or be captured in the baseline if the prod dump includes them.

Senior Dev: build the baseline from `private` then `public` schema dumps with function body checking disabled, strip only Supabase-managed default privileges that local replay cannot own, and archive timestamped forward files at or before the dump cutoff. Keep changes to migration artifacts and the worklog; do not rewrite historical archived migrations.

QA/QC: run `scripts/check-schema-drift.mjs --self-test`, repeat the drift audit against current prod metadata, run `corepack pnpm db:baseline:local-check`, confirm `corepack pnpm db:types` has no generated-type diff unless explained, then run `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm lint:baseline && corepack pnpm test && corepack pnpm build`.

## Execution Notes

- Source branch: `codex/schema-rebaseline`, based on `codex/inventory-landmines` because that dependency has not landed on `main` yet.
- Production ref: `iexwsuaqqenyjiskawoj`.
- Prod write policy: no `db push`, no `migration repair`, no migration apply, no write SQL.

## Results

- Prod schema dump artifact: `.baseline-artifacts/supabase-live-baseline-20260702T102855Z/` (not committed).
- Prod ledger snapshot: 594 rows; active migration files were ledger-applied except `20260627140000_fold_managed_surfaces.sql`, which intentionally remains active for managed surfaces excluded from `pg_dump --schema=public,private`.
- Active migration chain after re-baseline: `00000000000000_baseline.sql` + `20260627140000_fold_managed_surfaces.sql`.
- Archived squashed forward migrations: 84 files moved from `supabase/migrations/` to `supabase/migrations/_archive/`.
- Drift audit after re-baseline: baseline and prod both report `functions=320`, `tables=117`, `columns=1393`; Set A and Set B are empty.
- `corepack pnpm db:baseline:local-check` applies both the rebuilt baseline and the fold migration, then exits 0.
- `corepack pnpm db:types` regenerated `packages/database/src/types/database.types.ts` with no diff.
