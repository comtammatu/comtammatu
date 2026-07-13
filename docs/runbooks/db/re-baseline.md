# Runbook — Re-baseline the migration chain from current prod

> **Owner-approved, prod-touching read-only dump.** The direct `pg_dump` helper
> is schema-only, ref-allowlisted, and redacts connection details. It never
> changes production or its migration ledger. The goal is a NEW self-contained
> baseline that lets a data-less Supabase Preview start from current production
> schema truth.

## Why this exists

`supabase/migrations/00000000000000_baseline.sql` is a point-in-time `pg_dump` of
prod (`public` + `private`). Over time the forward chain accumulates and stops
replaying cleanly on top of the snapshot — the **squash-vs-history** class:

- **Drop ordering.** `20260609103000_remove_intermediate_scope.sql` does
  `DROP TABLE areas` **before** dropping `profiles.area_id`, so the FK
  `profiles_area_id_fkey` blocks it (SQLSTATE 2BP01) on a fresh replay. It
  succeeded on prod because `area_id` was already gone by then; an older snapshot
  still contained it.
- **State self-assertions.** `20260616200000_rls_dedup_stock_transfer_payroll.sql`
  asserts a production-only RLS policy count (`payroll_entries survivors expected
  3, got 2`) that a baseline-plus-forwards replay does not reproduce.

The clean fix is **not** to rewrite historical migrations — it is to
**re-baseline**: regenerate the baseline from current prod and archive the
now-squashed forward chain.

## Preconditions

- Explicit owner approval for the guarded production schema dump.
- A direct production read connection assembled by the allowlisted helper.
- Budget approval for an on-demand Supabase Preview Branch.
- A clean git worktree off `main`.

## Procedure

1. **Dump public + private from prod** (owner-run; read-only). Use the repo tool —
   it builds the direct privileged libpq connection from `.env.local`
   (`SUPABASE_PASSWORD_IEXW` + `supabase/.temp/pooler-url`):

   ```bash
   pnpm db:baseline:extract -- --schemas=public,private
   ```

   Without `--baseline-out`, it writes the per-schema dump files and a redacted
   manifest under `.baseline-artifacts/`. Assemble and replace the baseline only
   with the explicit output flag:

   ```bash
   pnpm db:baseline:extract -- \
     --schemas=public,private \
     --engine=pg_dump \
     --baseline-out=supabase/migrations/00000000000000_baseline.sql
   ```

   Notes:
   - `private` first so public triggers/policies referencing `private.*` resolve;
     `SET check_function_bodies = false` so private SQL helpers that read public
     tables create before those tables exist.
   - Strip `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin …` — Supabase-managed
     defaults the local migration role cannot set (`42501`); keep the
     `FOR ROLE postgres` ones. A fresh Supabase env configures them itself.
   - The extract uses `--no-owner` and keeps GRANTs inlined (do NOT pass
     `--no-privileges`). Never use `supabase db dump --linked` — it silently drops
     RLS-restricted tables.
   - The baseline is self-contained — there is no separate `private-bootstrap.sql`.
   - Managed surfaces (storage buckets/policies, extensions, realtime, cron) are
     omitted by `pg_dump --schema`, so replaying the chain re-applies them via the
     fold migration `20260627140000_fold_managed_surfaces.sql` (Section C storage
     policies etc.).

2. **Archive the squashed forward chain.** Every public/private schema migration
   with a timestamp at or before the new dump's cutoff and represented by the
   prod schema state is now represented by the baseline:

   ```bash
   git mv supabase/migrations/<each-forward>.sql supabase/migration-archive/
   ```

   Keep only migrations newer than the re-baseline cutoff, migrations not yet
   represented by prod, plus the managed-surfaces fold migration
   `20260627140000_fold_managed_surfaces.sql`. The fold migration intentionally
   remains active because `pg_dump --schema=public,private` omits extensions,
   storage buckets/policies, realtime publication membership, and cron jobs.

3. **Prove a clean from-empty replay** on a new data-less Supabase Preview
   Branch associated with the exact Git branch:

   ```bash
   supabase branches create <name> \
     --project-ref iexwsuaqqenyjiskawoj \
     --git-branch <git-branch>
   ```

   `Supabase Preview` and the fail-closed wrapper check must return literal
   `success` on the exact head SHA. If a remaining post-cutoff migration still
   diverges, fix that migration or move the cutoff later. Docker Local is not a
   substitute for this proof.

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

- A fresh Supabase Preview Branch provisions from the exact Git SHA and its
  Preview check returns literal `success`.
- `pnpm db:types` produces no diff vs committed types.
- The remaining forward chain is either strictly newer than the dump cutoff, not
  yet represented by prod, or the managed-surfaces fold migration, and the whole
  remaining chain replays clean.
