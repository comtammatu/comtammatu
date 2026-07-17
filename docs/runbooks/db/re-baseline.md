# Runbook — Re-baseline the migration chain from current prod

> **Prod-touching, read-only dump.** Use only the owner-held direct connection
> with the Production ref verified against the Environment Registry. Stored CLI
> link state is never target authority. The goal is a NEW self-contained
> baseline that squashes the forward chain so a from-empty replay matches current
> prod exactly.

`supabase/migration-lineage.json` is the machine gate for this runbook. Never
raise its frozen forward limit to make CI green; completing this runbook is the
only path from `blocked_pending_rebaseline` to `aligned`.

## Why this exists

`supabase/migrations/20260717151345_baseline.sql` is a point-in-time `pg_dump` of
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

- A prod read connection string (owner-held). `pg_dump` is a read; the prod-DB
  guard does not block `pg_dump` (only `pg_restore`, write `psql`, write MCP).
- The CI baseline-replay job is available for the from-empty Docker proof;
  workstations do not substitute Local Docker for a Cloud target.
- A clean git worktree off `main`.

## Procedure

1. **Dump public + private from prod** (read-only). Prefer the repo tool — it
   builds the direct privileged libpq connection from `.env.local`
   (`SUPABASE_PASSWORD_IEXW` + `supabase/.temp/pooler-url`):

   ```bash
   pnpm db:baseline:extract -- --schemas=public,private
   ```

   It writes `public.schema.sql` + `private.schema.sql` under
   `.baseline-artifacts/supabase-live-baseline-<ts>/`. Assemble the baseline —
   `private` first, function-body checking off, managed default-privileges
   stripped:

   ```bash
   CUTOFF=<14-digit verified production ledger cutoff>
   ART=.baseline-artifacts/supabase-live-baseline-<ts>
   { echo "SET check_function_bodies = false;"; echo;
     cat "$ART/private.schema.sql"; echo;
     grep -v "^ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin " "$ART/public.schema.sql";
   } > "supabase/migrations/${CUTOFF}_baseline.sql"
   ```

   If the direct owner credential is unavailable, stop; do not replace it with
   stored link state or an unregistered target. Replay the resulting candidate
   through the CI-only baseline harness and compare normalized public/private
   catalog fingerprints and all schema/function/relation ACLs with prod before
   moving it into `supabase/migrations/`. Counts alone are insufficient. Ignore
   physical column ordinals and generated PostgreSQL `NOT NULL` constraint
   names; require semantic column and named-constraint definitions to match.

   Notes:
   - `private` first so public triggers/policies referencing `private.*` resolve;
     `SET check_function_bodies = false` so private SQL helpers that read public
     tables create before those tables exist.
   - Strip `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin …` — Supabase-managed
     defaults the local migration role cannot set (`42501`); keep the
     `FOR ROLE postgres` ones. A fresh Supabase env configures them itself.
   - The extract uses `--no-owner` and keeps GRANTs inlined (do NOT pass
     `--no-privileges`).
   - Before the dump's explicit object grants, revoke all table, sequence, and function
     privileges in `public` + `private` from `anon`, `authenticated`, and
     `service_role`. Fresh Supabase environments may grant a broader default ACL;
     the following explicit dump grants must then restore the exact prod ACL.
   - The baseline is self-contained — there is no separate `private-bootstrap.sql`.
   - Managed surfaces (storage buckets/policies, extensions, realtime, cron) are
     omitted by `pg_dump --schema`, so replaying the chain re-applies them via a
     managed-surfaces fold versioned immediately after the baseline cutoff.

2. **Archive the squashed forward chain.** Every public/private schema migration
   with a timestamp at or before the new dump's cutoff and represented by the
   prod schema state is now represented by the baseline:

   ```bash
   git mv supabase/migrations/<each-forward>.sql supabase/migration-archive/
   ```

   Keep only migrations newer than the re-baseline cutoff, migrations not yet
   represented by prod, plus the managed-surfaces fold migration. Archive its
   old version with the squashed chain, then copy it to the next valid version
   strictly greater than the baseline cutoff and lower than the first
   unsquashed forward migration. The fold intentionally remains active because
   a public/private schema dump omits extensions, storage buckets/policies,
   realtime publication membership, and cron jobs.

   Classify DML before moving files. One-off production backfills/repairs become
   history; bootstrap/reference rows required by an empty environment move to
   the canonical seed or managed-surfaces fold. Do not assume a schema dump
   preserves `INSERT`, `UPDATE`, or `DELETE` effects.

3. **Update the lineage manifest.** Set the new baseline file/version/hash, keep
   `state=blocked_pending_rebaseline`, keep `productionCutoff=null`, keep native
   Preview blocked, and reduce `activeForwardLimit` to the remaining forward
   count. Run:

   ```bash
   corepack pnpm lint:migration-lineage
   ```

4. **Prove a clean from-empty replay in CI** (full chain now = baseline + only
   the post-cutoff migrations). The `baseline-replay` job runs:

   ```bash
   pnpm db:baseline:local-check
   ```

   It must exit 0 in the CI-only Docker harness; do not run it as a workstation
   Cloud-target fallback. If a remaining post-cutoff migration still diverges,
   fix THAT migration (it has not yet reached prod-stable squash) or move the
   cutoff later.

5. **Regenerate types** from the full rebuilt schema. Review the diff and accept
   only fields/RPCs introduced by unsquashed post-cutoff migrations:

   ```bash
   pnpm db:types
   git diff -- packages/database/src/types/database.types.ts
   ```

6. **Ledger note (prod is NOT re-applied).** Re-baselining changes only the
   committed files; prod's `schema_migrations` already lists every applied
   migration. Do **not** run `supabase db push`/`migration repair` against prod
   as part of this — the new baseline is a replay artifact for fresh envs, not a
   prod migration. Verify the prod ledger still matches the (archived) history
   before and after. Native Preview remains blocked in this state.

7. **Merge the source re-baseline while native Preview stays blocked.** The PR
   contains the baseline, archive/seed/fold classification, manifest hash, types,
   and replay evidence. It does not apply schema or rewrite production history.

8. **Align the production migration ledger only under a separate explicit owner
   approval.** Rehearse the current Supabase CLI squash/repair behavior on a
   disposable database, preserve the existing ledger evidence, and use an
   owner-operated literal Production binding to prove that the migration list
   contains the new baseline cutoff plus only newer forward versions. Stored
   link state is not evidence. This is a production metadata write; source
   re-baselining does not authorize it. The repo prod guard must not be disabled;
   if it blocks `migration repair`, the owner performs the exact reviewed command
   outside the guarded agent runtime.

9. **Enable native Preview only after live ledger proof.** In a follow-up change,
   set
   `productionCutoff=baselineVersion`, `state=aligned`,
   `nativePreviewBranching=enabled`, and `activeForwardLimit` to at most `20`.
   Re-run the lineage guard and create one throwaway Preview. Inspect its
   deployment log only through trusted registration or owner-operated evidence,
   then delete it after verification.

10. **Close the alignment change.** File → PR → owner. Tier **T3** (baseline /
    migration chain). Future migrations append on top of the aligned baseline
    and retain their filename version in the production ledger.

## Acceptance

- CI `baseline-replay` runs `pnpm db:baseline:local-check` successfully on its
  from-empty Docker DB.
- Baseline-only normalized catalog and ACL fingerprints match prod exactly.
- Type generation from the full rebuilt schema contains only reviewed
  post-cutoff deltas.
- The remaining forward chain is either strictly newer than the dump cutoff, not
  yet represented by prod, or the managed-surfaces fold migration, and the whole
  remaining chain replays clean.
- `pnpm lint:migration-lineage` exits 0; native Preview is enabled only after the
  live production ledger and baseline version match.
