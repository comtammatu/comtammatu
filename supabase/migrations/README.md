# Supabase migrations — baseline-first

`00000000000000_baseline.sql` is the **canonical public-schema install** for a
fresh environment. Generated 2026-05-30 from matu-dev (`nikkridjukdbqvkvqlmi`)
via libpq `pg_dump 18` and validated to replay from an empty public schema. The
378-file historical chain could **not** replay from empty (ordering bug at
`20260508055046` — references `order_items.vat_rate` before `20260509000000`
creates it), which is why this baseline exists.

## What's here

- `00000000000000_baseline.sql` — full public schema: tables, functions, RLS
  policies, indexes, grants, materialized views, the auth hook
  (`custom_access_token_hook` + its grant). Apply first on a fresh env.
- `_archive/` — the 379 historical incremental migrations, retained for history.
  NOT the install path; NOT applied by a fresh `supabase db reset`.

## Managed surfaces (NOT in the baseline)

`--schema=public` excludes Supabase-managed surfaces. Apply
**`../managed-surfaces.install.sql`** (i.e. `supabase/managed-surfaces.install.sql`)
AFTER the baseline on a fresh env. It is a privileged install step (NOT an
auto-applied migration) — generated 2026-05-30 from matu-dev + iexws, idempotent:

- extensions (pgcrypto, uuid-ossp, hypopg, index_advisor, pg_cron)
- storage buckets (5) + storage.objects RLS policies (14) — **the policy section
  needs `storage.objects` ownership (`supabase_storage_admin`); run it as that
  role / via the Dashboard if a plain migration role errors with "must be owner"**
- realtime publication membership (11 tables; `ADD TABLE` — fresh env only)
- cron jobs (10) via `cron.schedule(...)`

The `config.toml` auth-hook setting stays in the repo. (The older
`docs/plan/supabase-managed-surfaces-install-bundle.sql` was the greenfield-target
rehearsal version; the file above supersedes it for matu-dev/fresh installs.)

## Existing environments (option X — 2026-05-30)

- **Production (`iexwsuaqqenyjiskawoj`) keeps its applied migration history.** It
  is NOT reset to the baseline; the baseline is for fresh/dev envs.
- matu-dev was rebuilt from the baseline 2026-05-30 (schema verified exact). Its
  `schema_migrations` history may be repaired separately to baseline-first.
- **Production still needs the 2026-05-30 fixes applied** (now under `_archive/`,
  also in git history) — owner-gated:
  - `20260602008000_payroll_entries_self_read_paid_only.sql`
  - `20260602009000_attendance_writes_revoke_direct_insert.sql`
  - `20260602010000_rls_policy_dedup.sql`

## Regenerating the baseline

See the runbook. Always extract with a DIRECT privileged connection (libpq
`pg_dump`), never `supabase db dump --linked` (it silently drops RLS-restricted
tables — verified it dropped 18/118).
