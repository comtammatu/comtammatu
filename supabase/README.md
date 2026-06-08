# `supabase/` — DB package

Canonical DB going forward is the **HKD lean baseline**. The pre-lean in-place
track (what `comtammatu` `main`/production still runs) is frozen under `_legacy/`
until the Greenfield cutover completes.

```
supabase/
  config.toml                       project config
  migrations/
    00000000000000_baseline.sql     ← CANONICAL lean baseline (58 tables, replay-verified)
  managed-surfaces.install.sql      extensions / storage buckets+policies / realtime / cron companion
  greenfield/                       lean-rebuild DB tooling:
    lean-cutover.sql                  the DROP/ALTER/cash_entries transform (116→58)
    verify/                           build + replay-from-empty verification (build-lean.sh)
  tests/                            pgTAP-style SQL contract tests
  _legacy/                         FROZEN in-place track (prod-only until cutover) — see _legacy/README.md
```

## Lean baseline status

- **58 tables** (from 116 prod, −50%); keeps HĐĐT + money + audit bedrock; cuts
  GL/VAS, formal payroll engine, heavy inventory, recipes/consume, feedback/CRM,
  formal-PO, area, central-kitchen/warehouse (flat-branch).
- **Self-contained + replay-from-empty verified** (0 real errors) — fixes the old
  baseline's non-replayability.
- Regenerate from prod truth: `bash supabase/greenfield/verify/build-lean.sh`.

## Apply to an environment

The lean baseline is Supabase-native (auth/extensions/storage exist there). Apply
`migrations/00000000000000_baseline.sql` (+ `managed-surfaces.install.sql`) to a
fresh Supabase branch/project via the `supabase` CLI or the SQL editor.
`greenfield/verify/supa-shim.sql` is **only** for offline (local-postgres) replay
verification — never shipped.
