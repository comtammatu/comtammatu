# Database Schema Source Of Truth

This file is the current orientation point for database schema work. It is not
a hand-maintained per-column schema dump.

## Current Snapshot

Generated from the current checkout on 2026-07-02 with:

```bash
node scripts/project-snapshot.mjs
```

| Area                                        | Count |
| ------------------------------------------- | ----: |
| Public tables in generated types            |   117 |
| Public views in generated types             |     8 |
| Public RPC/SQL functions in generated types |   271 |
| Public enums in generated types             |     0 |
| Active SQL migration files                  |     2 |

The early-2026 hand-written table-by-table reference has been removed. Use the
source ladder below instead of resurrecting stale schema dumps.

## Migration layout (baseline-first, re-baselined — 2026-07-02)

The pre-baseline incremental chain could not replay from an empty DB (ordering bug at
`20260508055046`), so it was consolidated:

- `supabase/migrations/00000000000000_baseline.sql` — canonical public+private
  schema install; validated to replay on an empty DB.
- `supabase/migrations/<timestamp>_*.sql` after it — forward migrations on the baseline.
- `supabase/migrations/_archive/` — the 543 historical and squashed forward
  migrations (retained, NOT applied).
- `supabase/migrations/20260627140000_fold_managed_surfaces.sql` — extensions /
  storage buckets + RLS policies / realtime publication / cron jobs (excluded from
  the baseline schema dump, folded back in here). It is a forward migration in the
  chain, so it is applied automatically after the baseline — not a separate manual
  step (the storage-policy section needs `storage.objects` owner, which the migration
  role has).
- `supabase/migrations/20260702094500_branch_stock_operator_actions.sql` —
  branch-stock operator RPC and permission backfill not yet represented by prod.
- Production keeps its applied migration history; the baseline is the fresh/dev
  install path. There is still no dev/test Supabase project, so future
  verification uses prod SELECT-only evidence plus local baseline replay unless
  the owner provisions a dev ref. Fresh-env install notes live in
  `supabase/migrations/README.md`.

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
- Finance, expenses, HĐĐT, accountant export, period-close support, and audit.
- HR, contracts, shifts, attendance, leave requests, payroll, and employee portal.
- Print agent, printer fleet, print jobs, and document templates.
- Notifications, trust, and security perimeter tables.

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
