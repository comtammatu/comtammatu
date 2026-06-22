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

## Managed surfaces (NOT in the baseline)

`pg_dump --schema=public --schema=private` excludes Supabase-managed surfaces.
Apply **`../managed-surfaces.install.sql`** (i.e. `supabase/managed-surfaces.install.sql`)
AFTER the baseline on a fresh env. It is a privileged install step (NOT an
auto-applied migration), idempotent:

- extensions (pgcrypto, uuid-ossp, hypopg, index_advisor, pg_cron). pgcrypto's
  `crypt`/`gen_salt` are required by the QA seed, so apply managed-surfaces
  before seeding a fresh env.
- storage buckets (4) + storage.objects RLS policies (12) — **the policy section
  needs `storage.objects` ownership (`supabase_storage_admin`); run it as that
  role / via the Dashboard if a plain migration role errors with "must be owner"**
- realtime publication membership (`ADD TABLE` — fresh env only)
- cron jobs via `cron.schedule(...)`

The `config.toml` auth-hook setting stays in the repo. `supabase/managed-surfaces.install.sql`
is the canonical companion install file for fresh environments.

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
