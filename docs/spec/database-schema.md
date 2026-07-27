# Database Schema Source Of Truth

This file is the current orientation point for database schema work. It is not
a hand-maintained per-column schema dump.

For a disposable checkout snapshot, run:

```bash
node scripts/project-snapshot.mjs
```

Do not persist the generated counts in docs. Use the source ladder below instead
of maintaining schema dumps.

## Migration layout (baseline-first)

The pre-baseline incremental chain could not replay from an empty DB (ordering bug at
`20260508055046`), so it was consolidated:

- `supabase/migrations/20260727120000_baseline.sql` — canonical public+private
  schema install; validated to replay on an empty DB.
- `supabase/migrations/<timestamp>_*.sql` after it — forward migrations on the baseline.
- `supabase/migration-archive/` — historical and squashed forward migrations
  retained for archaeology, not replayed by the active chain.
- `supabase/migration-lineage.json` — machine guard for the baseline hash and
  active migration layout. It is not Production-ledger proof and does not govern
  Preview eligibility.
- `supabase/migrations/20260727120001_fold_managed_surfaces.sql` — extensions /
  storage buckets + RLS policies / realtime publication / cron jobs (excluded from
  the baseline schema dump, folded back in here). It is a forward migration in the
  chain, so it is applied automatically after the baseline — not a separate manual
  step (the storage-policy section needs `storage.objects` owner, which the migration
  role has).
- Production keeps its applied migration history; the baseline is the fresh-env
  install path. Cloud verification uses a disposable Preview Branch whose parent
  is Production; there is no persistent non-production database. Repository type
  generation reads Production after the migration is applied. Workstations do
  not use Local Docker as a fallback. Empty-database replay is a CI-only harness,
  and Production evidence stays within `database.md` rights.
  Fresh-env notes live in `supabase/migrations/README.md`.

## Source Ladder

When database facts disagree, trust the higher source:

| Tier | Source                                          | Use For                                                               |
| ---- | ----------------------------------------------- | --------------------------------------------------------------------- |
| 1    | `packages/database/src/types/database.types.ts` | Shape currently usable by app code after `corepack pnpm db:types`     |
| 2    | Applied Preview/Production state                | RLS, defaults, constraints, extensions, and real runtime behavior     |
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
- **preview-applied** — migration was applied to an on-demand Preview Branch.
- **types generated** — `corepack pnpm db:types` regenerated types from the
  schema used by app code.
- **UI wired** — Server Actions, pages, or route handlers call the new shape.
- **prod-applied** — migration was applied to production under the explicit
  rights in `docs/agent/rules/database.md`.

Never infer `prod-applied` from a migration filename.
