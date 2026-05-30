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

`--schema=public` excludes Supabase-managed surfaces. A fresh-from-zero env also
needs these applied separately — see
`docs/plan/supabase-managed-surfaces-install-bundle.sql` and
`docs/runbooks/matu-dev-migration-squash-2026-05-30.md`:

- extensions (pgcrypto, pg_cron, hypopg, index_advisor, …)
- storage buckets + storage policies
- realtime publication membership (`ALTER PUBLICATION supabase_realtime ADD TABLE …` — 11 tables)
- cron jobs (10) via `cron.schedule(...)`

The `config.toml` auth-hook setting stays in the repo.

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
