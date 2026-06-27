# Supabase migrations — baseline-first

`00000000000000_baseline.sql` is the **canonical self-contained install** for a
fresh environment: a `pg_dump` of the current production `public` + `private`
schemas. `private` is emitted first so public triggers/policies that reference
`private.*` resolve, and `check_function_bodies` is disabled at the top so the
private SQL helpers that read public tables create before those tables exist. It
replays clean from an empty database — the CI `baseline-replay` job
(`pnpm db:baseline:local-check`) gates this on every change. The historical
incremental chains could not replay from empty (squash-vs-history drop ordering
plus migrations that self-assert production-only state), which is why this single
squashed baseline exists.

## What's here

- `00000000000000_baseline.sql` — full `public` + `private` schema: tables,
  functions, RLS policies, indexes, grants, materialized views, the auth hook
  (`custom_access_token_hook` + its grant), and the `private` schema helpers.
  Apply first on a fresh env. Self-contained — no separate bootstrap file.
- `_archive/` — historical incremental migrations retained for history: the
  pre-baseline chain plus the forward chain squashed into the current baseline.
  NOT the install path; NOT applied by a fresh `supabase db reset`.

## Managed surfaces (folded into the chain)

`pg_dump --schema=public --schema=private` excludes Supabase-managed surfaces, so
they are folded back in as the forward migration
`20260627140000_fold_managed_surfaces.sql`. It is idempotent (`CREATE … IF NOT
EXISTS`, `DROP … IF EXISTS` + recreate, `DO $$ … $$` guards) and applied
automatically by `supabase db start` / `supabase db reset` / Supabase Branching as
part of the chain — there is no separate manual apply step:

- extensions (pgcrypto, uuid-ossp, hypopg, index_advisor, pg_cron). pgcrypto's
  `crypt`/`gen_salt` are required by the QA seed; the fold migration's Section A
  runs before the seed, so the seed always has them.
- storage buckets (4) + storage.objects RLS policies (12). The policy section
  needs `storage.objects` ownership; the Supabase migration role has it, so it runs
  in-chain without intervention.
- realtime publication membership (`ADD TABLE`, guarded so it only adds tables not
  already members).
- cron jobs via `cron.schedule(...)`.

The `config.toml` auth-hook setting stays in the repo. The fold migration is the
single source of truth for managed surfaces.

## Existing environments

- **Production (`iexwsuaqqenyjiskawoj`) keeps its applied migration history.** It
  is NOT reset to the baseline; the baseline is for fresh/dev envs only.
- **Production still needs the 2026-05-30 fixes applied** (under `_archive/`,
  also in git history) — owner-gated:
  - `20260602008000_payroll_entries_self_read_paid_only.sql`
  - `20260602009000_attendance_writes_revoke_direct_insert.sql`
  - `20260602010000_rls_policy_dedup.sql`

## Regenerating the baseline (re-baseline)

Full procedure: `docs/runbooks/db/re-baseline.md`. In short — owner dumps
`public` + `private` from prod over a direct privileged libpq connection (never
`supabase db dump --linked`, which silently drops RLS-restricted tables), then:

- strip `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin …` (Supabase-managed
  defaults the migration role cannot set),
- prepend `SET check_function_bodies = false;` with `private` before `public`,
- `git mv` the squashed forward chain into `_archive/`,
- prove `pnpm db:baseline:local-check` exits 0 and `pnpm db:types` shows no diff.
