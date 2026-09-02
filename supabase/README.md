# Supabase

Cloud Postgres + Auth + RLS + Realtime + Storage for Cơm Tấm Má Tư.
Production (`enloyfnuerqgaqderbwb`) is the repository type source and sole
persistent database. Agent rights and apply policy:
[`docs/agent/rules/database.md`](../docs/agent/rules/database.md).

| Path | Purpose |
| --- | --- |
| [`migrations/`](migrations/) | Active, ordered install input (baseline + forwards) |
| [`tests/`](tests/) | SQL / pgTAP-style DB tests |
| [`migration-lineage.json`](migration-lineage.json) | Baseline identity for `lint:migration-lineage` |

Fresh-env layout and managed-surface fold:
[`migrations/README.md`](migrations/README.md).

Clients and generated types: [`packages/database`](../packages/database/).
After an apply to Production: `SUPABASE_PROJECT_ID=enloyfnuerqgaqderbwb corepack pnpm db:types`.

Operational runbooks:

- Preview Branch: [`docs/runbooks/db/preview-branch-setup.md`](../docs/runbooks/db/preview-branch-setup.md)
- Re-baseline: [`docs/runbooks/db/re-baseline.md`](../docs/runbooks/db/re-baseline.md)

Topology with Vercel / GitHub: [`docs/modules/infrastructure.md`](../docs/modules/infrastructure.md).
