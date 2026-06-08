# Greenfield lean-baseline build + verify

Reproducible pipeline that produces and verifies the HKD lean DB baseline
(`../../migrations/00000000000000_baseline.sql`, 58 tables) — the "build on prod truth, fold cleanup,
trim, prove it replays" approach.

## Why this exists

The squashed `supabase/migrations/00000000000000_baseline.sql` is **not
self-contained** (references `private.*` 53× but never `CREATE SCHEMA private`)
and sits on a divergent private-schema lineage, so it does not replay from
empty. Supabase branch auto-replay of prod's 403-migration chain also fails
deterministically (stops at `s6`, 87/116 tables, no `private` schema). So we
rebuild the lean baseline from the **current prod schema** (the only complete,
self-contained source) instead.

## Pipeline (`build-lean.sh`)

```
prod pg_dump (read-only, 116 tbl, self-contained, has HĐĐT)
  + supa-shim.sql        local Supabase-compat (auth/extensions/cron/storage/roles)
  + cleanup/hardening    greenfield/migrations ×11 + active + db_debt_cleanup ×6  (clean)
  + ../lean-cutover.sql  drop ~61 tables + 16 GL/production/transfer RPCs + cash_entries
  + dewire-rpcs.sql      9 money/GRN/dashboard RPCs — GL/consume branch removed
  = ../../migrations/00000000000000_baseline.sql 58 tables · replay-from-empty 0 real errors
```

## Run

```bash
# docker daemon must be running; SUPABASE_PASSWORD in .env.local (prod read-only)
bash supabase/greenfield/verify/build-lean.sh
```

## Files

- `supa-shim.sql` — local-postgres Supabase stand-ins (verify-only, NOT shipped).
- `dewire-rpcs.sql` — the 9 de-wired RPCs (CREATE OR REPLACE; "không trừ kho" + no GL).
- `build-lean.sh` — the full build + replay-from-empty verification.
- `../lean-cutover.sql` — the DROP/ALTER/cash_entries cutover (drops 61 tbl + 16 RPCs).
- `../../migrations/00000000000000_baseline.sql` — OUTPUT: the verified lean schema (58 tables).

## Apply to a real env

The lean baseline is Supabase-native (auth/extensions/storage exist there) — apply
`../../migrations/00000000000000_baseline.sql` to a fresh Supabase branch/project (via `supabase` CLI or the
SQL editor). The local `supa-shim.sql` is only for offline replay verification.
