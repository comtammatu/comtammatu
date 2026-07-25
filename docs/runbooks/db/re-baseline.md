# Runbook — Re-baseline the migration chain from current prod

> **Prod-touching, read-only dump.** Use only the owner-held direct connection
> with the Production ref verified against the Environment Registry. Stored CLI
> link state is never target authority. The goal is a NEW self-contained
> baseline that squashes the forward chain so a from-empty replay matches current
> prod exactly.

`supabase/migration-lineage.json` records the candidate baseline file, version,
and hash. Its guard validates local install-layout integrity; it neither changes
the Production ledger nor controls Preview access.

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
   (`SUPABASE_PASSWORD_IEXW` or `SUPABASE_DB_PASSWORD` +
   `supabase/.temp/pooler-url`):

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

3. **Update the lineage manifest.** Set the new baseline file/version/hash. Run:

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
   before and after.

7. **Merge the source re-baseline.** The PR contains the baseline,
   archive/seed/fold classification, manifest hash, types, and replay evidence.
   It does not apply schema or rewrite production history.

8. **Align the production migration ledger only under a separate explicit owner
   approval.** Rehearse the current Supabase CLI squash/repair behavior on a
   disposable database, preserve the existing ledger evidence, and use an
   owner-operated literal Production binding to prove that the migration list
   contains the new baseline cutoff plus only newer forward versions. Stored
   link state is not evidence. This is a production metadata write; source
   re-baselining does not authorize it. The repo prod guard must not be disabled;
   if it blocks `migration repair`, the owner performs the exact reviewed command
   outside the guarded agent runtime.

9. **Use Preview independently when needed.** Re-run the lineage guard, create
   one throwaway Preview with the verified Production parent, inspect its
   deployment log through trusted registration or owner-operated evidence, then
   delete it after verification.

10. **Close the alignment change.** File → PR → owner. Tier **T3** (baseline /
    migration chain). Future migrations append on top of the aligned baseline
    and retain their filename version in the production ledger.

## Current alignment packet — 2026-07-25

This packet records the read-only comparison against Production
`iexwsuaqqenyjiskawoj`. Refresh it immediately before an owner-authorized
metadata or schema write; it is not authorization to run one.

Use a clean worktree at the exact source commit being aligned. The current
shared worktree is not suitable because it is behind `origin/main` and contains
uncommitted HĐĐT work.

### Classification

Keep these Production ledger versions:

- `20260720035548_baseline`
- `20260724030942_enforce_self_order_payment_fingerprint_v1`
- `20260724070601_fix_menu_limit_warehouse_replenishment`

The fingerprint migration's stored statement differs from the current file,
but Production already has the validated `payment:v1` constraint, both
invariant triggers enabled, and zero `legacy:v0` rows. This is catalog/data
equivalence, not statement equality.

The following source versions are schema-equivalent to an existing
Production-applied version. Add the source version as `applied` only after the
same comparison is refreshed:

| Source version | Existing Production version | Evidence |
| --- | --- | --- |
| `20260720035549` | `20260717151346` | All five extensions, five buckets, ten storage policies, ten realtime tables, and nine cron jobs match the managed-surface fold |
| `20260720035550` | `20260719091531` | Stored SQL MD5 matches |
| `20260720035551` | `20260719091552` | Stored SQL MD5 matches |
| `20260720035552` | `20260719091602` | Stored SQL MD5 matches |
| `20260721120000` | `20260721111518` | Stored SQL MD5 matches |
| `20260721121000` | `20260721111549` | Stored SQL MD5 matches |
| `20260721135538` | `20260721135954` | Applied SQL matches the pre-ACL file; current function ACL is `postgres,service_role` only |
| `20260721160235` | `20260721160551` | SQL matches after whitespace normalization |
| `20260721174543` | `20260721183309` | Stored SQL MD5 matches |
| `20260721210937` | `20260721142727` | Stored SQL MD5 matches |
| `20260721211000` | `20260721150240` | Current reconciliation function completes the issue job; no completed job is unbound |
| `20260721221745` | `20260721151828` | SQL matches after whitespace normalization |
| `20260722074001` | `20260722075955` | Stored SQL MD5 matches |
| `20260725122220` | `20260725060308` | Stored SQL MD5 matches |
| `20260725141050` | `20260725084711` | Stored SQL MD5 matches |
| `20260725141240` | `20260725100805` | Stored SQL MD5 matches |
| `20260725141900` | `20260725100849` | Stored SQL MD5 matches |
| `20260725142100` | `20260725100918` | Stored SQL MD5 matches |
| `20260725142200` | `20260725100952` | Stored SQL MD5 matches |
| `20260725142300` | `20260725101020` | Stored SQL MD5 matches |

Do not mark these as applied:

- `20260720120000_fix_paid_menu_item_sales_aggregation.sql` has no Production
  ledger row. Production still uses the stale `LANGUAGE sql` definition that
  buckets by `orders.created_at` and does not expand sides. Apply the actual
  migration through the owner-approved schema path, then record its source
  version.
- `20260725160907_add_customer_invoice_qr_flow.sql` is pending feature work.
  Keep it out of Production until the legal, Viettel, Preview, and release gates
  in ADR 0013 pass.

### Owner-operated order

1. Save a fresh read-only Production ledger and catalog/ACL evidence.
2. Create one disposable Preview from Production and require automatic migration
   replay plus contract, race, privilege, and HTTP smoke. No manual SQL patch is
   accepted as Preview evidence.
3. Apply `20260720120000_fix_paid_menu_item_sales_aggregation.sql` to Production
   through the owner-approved schema path. `migration repair` is not a substitute
   for this SQL.
4. Add the schema-equivalent source versions above as `applied`.
5. Only after all source versions are present, mark their superseded Production
   aliases and every pre-`20260720035548` squashed entry as `reverted`.
6. Require `supabase migration list` parity and a `supabase db push --dry-run`
   with no pending migration against the clean non-feature source commit.
7. Regenerate types from Production and review the diff.
8. Delete the Preview after all evidence is collected.

Run steps 3–5 only with explicit owner approval in that session and an
owner-held literal Production connection. Never use stored link state, never
disable the repository guard, and preserve the before/after ledger output for
rollback. If the refreshed hash or catalog evidence differs, stop before the
first write and regenerate this mapping.

### Execution evidence — 2026-07-25

- Production `iexwsuaqqenyjiskawoj` now records the source baseline and forwards
  from `20260720035548` through `20260725142300`; the provider-applied
  `20260725060308_allow_guest_cancel_vietqr` row remains until its source file
  is committed.
- `20260720120000_fix_paid_menu_item_sales_aggregation.sql` was applied once.
  The live function uses completed `payments.paid_at`, expands side lines, keeps
  `private.finance_scope`, denies anon execution, and the temporary connector
  version was replaced by the source version in the ledger.
- Disposable Preview `qxdsfqfhalvuixjkjyll`, parent
  `iexwsuaqqenyjiskawoj`, completed automatic replay from the aligned ledger.
  The receipt-QR migration then passed its SQL contract, concurrent race, ACL,
  authenticated Data API denial, and index checks without calling the invoice
  provider.
- The receipt-QR migration remains absent from Production. Its legal, Viettel,
  authenticated HTTP, and release gates remain independent.

## Acceptance

- CI `baseline-replay` runs `pnpm db:baseline:local-check` successfully on its
  from-empty Docker DB.
- Baseline-only normalized catalog and ACL fingerprints match prod exactly.
- Type generation from the full rebuilt schema contains only reviewed
  post-cutoff deltas.
- The remaining forward chain is either strictly newer than the dump cutoff, not
  yet represented by prod, or the managed-surfaces fold migration, and the whole
  remaining chain replays clean.
- `pnpm lint:migration-lineage` exits 0. Any Preview proof records its verified
  parent separately from the Production ledger.
