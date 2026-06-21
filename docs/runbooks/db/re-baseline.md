# Runbook — Re-baseline the migration chain from current prod

> **Owner-run, prod-touching (read-only dump).** Agents are SELECT-only on prod
> and cannot `pg_dump` it; this is an owner action. The goal is a NEW
> self-contained baseline that squashes the forward chain so a from-empty replay
> matches current prod exactly.

## Why this exists

`supabase/migrations/00000000000000_baseline.sql` is a `--schema=public` dump from
2026-05-30. Two gaps make a from-empty replay diverge from prod:

1. **Self-containment (FIXED, tier 1).** The dump references `private.*` objects it
   never creates. `supabase/_local-dev/private-bootstrap.sql` (tracked) supplies
   the `private` schema + helpers and `db:baseline:local-check` prepends it, so the
   **baseline alone now replays clean** on local docker (CI job `baseline-replay`).
2. **Forward-chain divergence (this runbook, tier 2).** The 98 forward migrations
   after the baseline do **not** cleanly replay on top of the squashed baseline.
   First failure: `20260609103000_remove_intermediate_scope.sql` does
   `DROP TABLE areas` **before** dropping `profiles.area_id`, so the FK
   `profiles_area_id_fkey` blocks it (SQLSTATE 2BP01). On prod this migration
   succeeded because `area_id` was already gone by 2026-06-09; the 2026-05-30
   baseline snapshot still contains it. This is the squash-vs-history class
   (same as the D042 preview-branch replay failure). Likely more divergences
   follow this one.

The clean fix is **not** to rewrite ~90 historical migrations — it is to
**re-baseline**: regenerate the baseline from current prod and archive the
now-squashed forward chain.

## Preconditions

- A prod read connection string (owner-held). `pg_dump` is a read; the prod-DB
  guard does not block `pg_dump` (only `pg_restore`, write `psql`, write MCP).
- Docker running locally (`db:baseline:local-check` needs it).
- A clean git worktree off `main`.

## Procedure

1. **Dump public + private from prod** (captures both schemas → self-contained):

   ```bash
   pg_dump "$PROD_DB_URL" \
     --schema=public --schema=private \
     --no-owner --no-privileges --schema-only \
     --file=supabase/migrations/00000000000000_baseline.sql
   ```

   Notes:
   - Keep `--no-owner`; drop `--no-privileges` only if you want GRANTs inlined
     (the current baseline carries them — match whichever the team standardized).
   - Confirm the dump emits `CREATE SCHEMA private;` and the 9 `private.*`
     functions. If it does, the separate `private-bootstrap.sql` becomes
     redundant for replay — keep it only if you still want the permissive stubs
     for local QA, otherwise delete it and drop the prepend in
     `scripts/supabase-baseline-local-check.mjs`.
   - Managed surfaces (storage buckets/policies, exotic extensions) stay in
     `supabase/managed-surfaces.install.sql` — `pg_dump --schema` does not emit
     them. Do not try to fold them into the baseline.

2. **Archive the squashed forward chain.** Every migration with a timestamp at or
   before the new dump's cutoff is now represented by the baseline:

   ```bash
   git mv supabase/migrations/<each-forward>.sql supabase/migrations/_archive/
   ```

   Keep only migrations newer than the re-baseline cutoff in `supabase/migrations/`.

3. **Prove a clean from-empty replay** (full chain now = baseline + only the
   post-cutoff migrations):

   ```bash
   pnpm db:baseline:local-check
   ```

   It must exit 0. If a remaining post-cutoff migration still diverges, fix THAT
   migration (it has not yet reached prod-stable squash) or move the cutoff later.

4. **Regenerate types** from the rebuilt schema and confirm no drift:

   ```bash
   pnpm db:types
   git diff --stat packages/database/src/database.types.ts   # expect no change
   ```

5. **Ledger note (prod is NOT re-applied).** Re-baselining changes only the
   committed files; prod's `schema_migrations` already lists every applied
   migration. Do **not** run `supabase db push`/`migration repair` against prod
   as part of this — the new baseline is a replay artifact for fresh envs, not a
   prod migration. Verify the prod ledger still matches the (archived) history
   before and after.

6. **PR + owner apply.** File → PR → owner. Tier **T3** (baseline / migration
   chain). After merge, future migrations append on top of the new baseline.

## Acceptance

- `pnpm db:baseline:local-check` exits 0 on a from-empty docker DB.
- `pnpm db:types` produces no diff vs committed types.
- The first forward migration after the new baseline is strictly newer than the
  dump cutoff, and the whole remaining chain replays clean.
