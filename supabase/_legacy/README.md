# `_legacy/` — FROZEN in-place production DB track

`comtammatu` `main` is **no longer developed**. Production keeps running on this
in-place lineage **until the Greenfield lean DB cutover completes**; after that,
this whole folder is retired.

> Do NOT add migrations here. The canonical go-forward DB is the lean baseline
> `supabase/migrations/00000000000000_baseline.sql` (built + replay-verified via
> `supabase/greenfield/verify/`).

## Contents (frozen)

- **`inplace-migrations/`** — the old in-place chain:
  - `00000000000000_baseline.sql` — pre-lean squashed baseline (116-table, **NOT
    self-contained**: references `private.*` but never `CREATE SCHEMA private` →
    does not replay from empty; this is the bug the lean rebuild fixed).
  - `20260602011000_attendance_revoke_delete.sql` — active in-place migration.
  - `20260607*_db_debt_cleanup*.sql` — 6 in-place hardening migrations.
  - `_archive/` (379) + `_rollback/` (21) — historical chain + rollbacks.
- **`greenfield-hardening/`** — 11 hardening/cut migrations **already folded into**
  the lean baseline (RLS hardening, canonical position codes, role-bridge cut,
  `legacy_role_code` drop, redundant-index drop).
- **`seed-inplace.sql`** — the in-place seed (references cut tables; a lean seed is TODO).

These inputs are still read (read-only) by `../greenfield/verify/build-lean.sh`
to regenerate the lean baseline from current prod truth. Nothing here is applied
to any new environment.
