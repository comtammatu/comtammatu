# Runbook — Re-baseline the migration chain from Production

> **Production-touching, read-only dump.** Use only an owner-held direct
> connection after verifying the ref against
> `docs/agent/rules/database.md`. Stored CLI link state is never target
> authority.

`supabase/migration-lineage.json` records the active baseline file, version and
hash. Re-baselining changes repository install history; it does not authorize a
Production ledger or schema write.

## Preconditions

- Clean worktree at the exact `main` commit being re-baselined.
- Owner-held read credential for Production.
- No unrelated pending migration in `supabase/migrations/`.
- CI baseline replay is available.
- Tier T3 review and exact owner approval for any later Production metadata
  alignment.

## Procedure

1. Verify Production and run the guarded read-only extract:

   ```bash
   corepack pnpm db:baseline:extract:dry-run -- --schemas=public,private
   corepack pnpm db:baseline:extract -- --schemas=public,private
   ```

   The extractor accepts only registered Production
   `enloyfnuerqgaqderbwb`. It builds an explicit direct connection from
   `SUPABASE_DB_URL_ENLOY` or the registered password inputs; it never uses
   `supabase link`.

2. Assemble one self-contained baseline:

   ```bash
   CUTOFF=<14-digit verified Production ledger cutoff>
   ART=.baseline-artifacts/supabase-live-baseline-<timestamp>
   cp "$ART/public_private.schema.sql" \
     "supabase/migrations/${CUTOFF}_baseline.sql"
   ```

   The extractor dumps both schemas in one `pg_dump` call to preserve
   cross-schema dependency order, normalizes pg_dump session tokens, resets
   fresh-environment ACL defaults, preserves explicit grants, and excludes
   Supabase-managed default privileges that the migration role cannot set.

3. Classify every active migration at or before the cutoff:

   - archive schema/DML already represented by the dump;
   - keep newer or unapplied forwards active;
   - retain required bootstrap/reference data in the active install path;
   - keep managed surfaces such as extensions, Storage, Realtime and cron in a
     forward migration because a `public`/`private` dump does not contain them.

4. Update `supabase/migration-lineage.json`, then run:

   ```bash
   corepack pnpm lint:migration-lineage
   ```

5. Prove a clean from-empty replay in the CI-only harness:

   ```bash
   corepack pnpm db:baseline:local-check
   ```

   Compare normalized catalog, function and ACL fingerprints with Production.
   Counts alone are insufficient.

6. Regenerate types only after the rebuilt schema is the registered type
   source:

   ```bash
   SUPABASE_PROJECT_ID=enloyfnuerqgaqderbwb corepack pnpm db:types
   git diff -- packages/database/src/types/database.types.ts
   ```

7. Run repository gates and merge the source re-baseline. Do not run
   `migration repair`, raw `supabase db push`, or any Production apply as part
   of the source-only change.

8. If Production ledger alignment is genuinely required, perform a separate
   owner-approved T3 operation from a clean commit. Preserve before/after ledger
   evidence, rehearse on a verified throwaway Preview Branch, and stop on any
   mismatch.

## Acceptance

- `corepack pnpm lint:migration-lineage` passes.
- CI from-empty replay passes.
- Normalized schema/function/ACL evidence matches Production.
- Generated type diff contains only reviewed post-cutoff changes.
- No archived migration is replayed by a fresh install.
- No Production schema or ledger write occurred without separate explicit
  owner delegation.
