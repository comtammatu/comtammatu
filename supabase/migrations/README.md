# Supabase migrations — baseline-first

`20260720035548_baseline.sql` is the self-contained install for a fresh
environment: a point-in-time `pg_dump` of the production `public` + `private`
schemas. `private` is emitted first so public triggers/policies that reference
`private.*` resolve, and `check_function_bodies` is disabled at the top so the
private SQL helpers that read public tables create before those tables exist. It
replays clean from an empty database — the CI `baseline-replay` job
(`pnpm db:baseline:local-check`) gates this on every change. The historical
incremental chains could not replay from empty (squash-vs-history drop ordering
plus migrations that self-assert production-only state), which is why this single
squashed baseline exists.

`../migration-lineage.json` records the baseline file, version, and hash.
`pnpm lint:migration-lineage` enforces one intact baseline, unique migration
versions, and forward versions newer than the baseline. Preview authorization is
separate: the database guard verifies the requested branch's Production parent
for every action.

## What's here

- `20260720035548_baseline.sql` — full `public` + `private` schema: tables,
  functions, RLS policies, indexes, grants, materialized views, the auth hook
  (`custom_access_token_hook` + its grant), and the `private` schema helpers.
  Apply first on a fresh env. Self-contained — no separate bootstrap file.
- `../migration-archive/` — historical incremental migrations retained for history: the
  pre-baseline chain plus the forward chain squashed into the current baseline.
  NOT the install path; NOT applied by a fresh `supabase db reset`.

## Managed surfaces (folded into the chain)

`pg_dump --schema=public --schema=private` excludes Supabase-managed surfaces, so
they are folded back in as the forward migration
`20260720035549_fold_managed_surfaces.sql`. It is idempotent (`CREATE … IF NOT
EXISTS`, `DROP … IF EXISTS` + recreate, `DO $$ … $$` guards) and applied
automatically by `supabase db start` / `supabase db reset` / Supabase Branching as
part of the chain — there is no separate manual apply step:

- extensions (pgcrypto, uuid-ossp, hypopg, index_advisor, pg_cron). pgcrypto's
  `crypt`/`gen_salt` are required by the QA seed; the fold migration's Section A
  runs before the seed, so the seed always has them.
- storage buckets (5) + storage.objects RLS policies (10). The policy section
  needs `storage.objects` ownership; the Supabase migration role has it, so it runs
  in-chain without intervention.
- realtime publication membership (`ADD TABLE`, guarded so it only adds tables not
  already members).
- cron jobs via `cron.schedule(...)`.

The fold migration is the single source of truth for managed surfaces.

The public/private baseline cannot carry triggers owned by `auth.users`.
`20260720035550_restore_auth_user_profile_trigger.sql` restores the canonical
`on_auth_user_created` trigger after the baseline, so hosted Auth signups invoke
`public.handle_new_user()` on a fresh Cloud environment.

The baseline also emits materialized views `WITH NO DATA`.
`20260720035551_initialize_materialized_views.sql` populates only uninitialized
current views before runtime functions use concurrent refresh.

A managed-state reset can leave the pg_cron launcher on its previous job cache.
`20260720035552_reregister_managed_cron_jobs.sql` re-registers the canonical jobs
only while the environment has no orders, records a one-cadence health grace for
new job ids, and reloads the launcher configuration. Populated Production skips
the re-registration path.

## Existing environments

- **Production (`iexwsuaqqenyjiskawoj`) keeps its applied migration history.** It
  is NOT reset to the baseline; the baseline is for fresh environments only.
- There is no persistent non-production project. Native Supabase Branching
  requires the guard to verify the Production parent for each on-demand Preview
  action. Moving files to `../migration-archive/` alone does not change the
  parent project's ledger.

## Regenerating the baseline (re-baseline)

Full procedure: `docs/runbooks/db/re-baseline.md`. In short — owner dumps
`public` + `private` from prod over a direct privileged libpq connection (never
`supabase db dump --linked`, which silently drops RLS-restricted tables), then:

- strip `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin …` (Supabase-managed
  defaults the migration role cannot set),
- neutralize environment-managed table/sequence ACL defaults before replaying
  the explicit production grants,
- prepend `SET check_function_bodies = false;` with `private` before `public`,
- `git mv` the squashed forward chain into `supabase/migration-archive/`,
- re-version the managed-surfaces fold strictly after the new baseline cutoff,
- classify required bootstrap DML into seed/fold instead of losing it in a schema
  dump,
- update `../migration-lineage.json`,
- prove `pnpm db:baseline:local-check` exits 0 and
  `SUPABASE_PROJECT_ID=iexwsuaqqenyjiskawoj pnpm db:types` shows no diff.
