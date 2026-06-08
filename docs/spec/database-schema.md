# Database Schema Source Of Truth

This file is the current orientation point for database schema work. It is not
a hand-maintained per-column schema dump.

## Current Snapshot

Generated from the current checkout on 2026-05-30 with:

```bash
node scripts/project-snapshot.mjs
```

| Area                                        | Count |
| ------------------------------------------- | ----: |
| Public tables in generated types            |   118 |
| Public views in generated types             |     9 |
| Public RPC/SQL functions in generated types |   241 |
| Public enums in generated types             |     0 |
| Active SQL migration files                  |     2 |

Live-schema manifest (matu-dev, verified 2026-05-30): **118 tables · 3 views + 6
materialized views · 279 `pg_proc` public functions** (generated types list only
the 241 RPC/SQL-callable) · **273 public RLS policies · 523 indexes · 14
`storage.objects` policies · 11 realtime-published tables · 10 cron jobs**.

The early-2026 hand-written table-by-table reference has been removed. Use the
source ladder below instead of resurrecting stale schema dumps.

## Migration layout (lean baseline — 2026-06-07)

> ⚠️ The schema details below still describe the **in-place 116-table track** (now
> frozen). The canonical DB going forward is the **HKD lean baseline (58 tables)** —
> this spec's table-by-table content is pending the CTCP→HKD reframe.

- `supabase/migrations/00000000000000_baseline.sql` — the **lean baseline** (58 tables,
  self-contained, replay-from-empty verified). Regenerated from current prod truth via
  `supabase/greenfield/verify/build-lean.sh`.
- `supabase/managed-surfaces.install.sql` — extensions / storage buckets + RLS / realtime
  / cron companion, applied after the baseline on a fresh env.
- `supabase/_legacy/` — the **frozen** pre-lean in-place track (old baseline, the 379
  historical migrations, rollbacks); production runs it until the Greenfield cutover.
  See `supabase/_legacy/README.md`.

## Source Ladder

When database facts disagree, trust the higher source:

| Tier | Source                                          | Use For                                                               |
| ---- | ----------------------------------------------- | --------------------------------------------------------------------- |
| 1    | `packages/database/src/types/database.types.ts` | Shape currently usable by app code after `pnpm db:types`              |
| 2    | Applied dev/prod Supabase state                 | RLS, defaults, constraints, extensions, and real runtime behavior     |
| 3    | `supabase/migrations/*.sql`                     | Authored schema changes; file existence does not prove applied status |
| 4    | `docs/modules/database.md` and module docs      | Domain grouping, rationale, and implementation guidance               |

## Domain Groups

Use `docs/modules/database.md` for domain grouping and migration conventions.
For a specific table, read the generated type and the migration that created or
last changed it.

Current high-level groups:

- Auth and permissions.
- Tenant, branch, area, and staff identity.
- Menu, POS, orders, KDS, and runner.
- Payments, refunds, webhooks, HĐĐT, and reconciliation.
- Inventory, procurement, production, QC, and waste.
- Finance, journal, fiscal period, VAS reporting, and audit.
- HR, contracts, shifts, attendance, payroll, and employee portal.
- Print agent, printer fleet, print jobs, and document templates.
- Feedback, notifications, trust, and security perimeter tables.

## Migration Status Vocabulary

Use these labels exactly when describing schema state:

- **planned** — no SQL file exists yet.
- **drafted** — SQL file exists in `supabase/migrations/`, but apply status is
  not proven.
- **applied to dev** — migration was pushed to the dev/test Supabase project.
- **types generated** — `pnpm db:types` regenerated generated types from the
  schema used by app code.
- **UI wired** — Server Actions, pages, or route handlers call the new shape.
- **prod-applied** — owner manually applied the migration to production.

Never infer `prod-applied` from a migration filename.
