# Supabase migrations — baseline-first

`00000000000000_baseline.sql` is the **canonical self-contained schema install**
for a fresh environment: a direct, schema-only `pg_dump` of the current
production `public` + `private` schemas. `private` is emitted first so public
triggers and policies that reference `private.*` resolve, and
`check_function_bodies` is disabled at the top so private SQL helpers that read
public tables create before those tables exist. Every migration change is proven
on a fresh Supabase Preview Branch; Docker Local is not a release gate.

## What's here

- `00000000000000_baseline.sql` — full `public` + `private` schema: tables,
  functions, RLS policies, indexes, grants, materialized views, the auth hook
  (`custom_access_token_hook` + its grant), and the `private` schema helpers.
  Apply first on a fresh env. Self-contained — no separate bootstrap file.
- `../migration-archive/` — historical incremental migrations represented by
  the current baseline. NOT the install path and never discovered by Supabase
  Branching.

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

Production (`iexwsuaqqenyjiskawoj`) keeps its applied migration history and is
never reset to the baseline. The baseline is only the starting point for a new
data-less environment. New production changes always use a new monotonic forward
migration and the owner-gated apply path.

## Regenerating the baseline (re-baseline)

Full procedure: `docs/runbooks/db/re-baseline.md`. In short — owner dumps
`public` + `private` from prod over a direct privileged libpq connection (never
`supabase db dump --linked`, which silently drops RLS-restricted tables), then:

- assemble with `--baseline-out`, which strips Supabase-managed default
  privileges and emits `private` before `public`,
- `git mv` the squashed forward chain into `supabase/migration-archive/`,
- prove the active chain and seeds on a fresh Supabase Preview Branch, then run
  `pnpm db:types` against that verified type source.
