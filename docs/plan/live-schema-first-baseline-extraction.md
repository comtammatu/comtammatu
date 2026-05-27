# Live Schema First Baseline Extraction

> Status: OWNER-APPROVED PREP
> Date: 2026-05-26
> Canonical schema source: Supabase project `comtammatu` / `iexwsuaqqenyjiskawoj`
> Production project `matu-prod` was discovered but not queried.

Owner accepted the `live-schema-first` path after the migration drift
reconciliation. This file turns that decision into the extraction contract for a
future clean database baseline package.

This artifact is read-only. It does not apply migrations, alter schema, export
secrets, create a new project, or query `matu-prod`.

4-agent debate is skipped because this is documentation-only. The implementation
work starts only after the extraction toolchain and target database are
explicitly approved.

## Decision

Use the verified live schema as the canonical shape for the upgraded baseline.

Do not use the current `supabase/migrations` folder as the greenfield install
path. The current chain has one duplicate local version and only 308 exact
matches against 393 live migration rows.

Supabase Local replay later confirmed this decision: the current local migration
chain fails from an empty database at
`20260508055046_hddt_summary_rpcs.sql` because it references
`order_items.vat_rate` before `20260509000000_finance_phase1_5_vat_per_line.sql`
creates that column. See `docs/plan/supabase-local-baseline-replay.md`.

## Live Manifest

Read-only Supabase MCP queries on 2026-05-26 observed:

| Area                              | Value                  |
| --------------------------------- | ---------------------- |
| Project                           | `comtammatu`           |
| Ref                               | `iexwsuaqqenyjiskawoj` |
| Region                            | `ap-southeast-1`       |
| Status                            | `ACTIVE_HEALTHY`       |
| Postgres                          | `17.6.1.121`           |
| Database size                     | `79 MB`                |
| Migration history rows            | 393                    |
| Duplicate live migration versions | 0                      |

### Schema Shape

| Schema       | Tables | Partitioned tables | Views | Materialized views | Sequences | Functions | RLS enabled tables | RLS disabled tables | Policies |
| ------------ | -----: | -----------------: | ----: | -----------------: | --------: | --------: | -----------------: | ------------------: | -------: |
| `public`     |    116 |                  0 |     3 |                  6 |        99 |       280 |                116 |                   0 |      263 |
| `auth`       |     23 |                  0 |     0 |                  0 |         1 |         4 |                 16 |                   7 |        0 |
| `storage`    |      8 |                  0 |     0 |                  0 |         0 |        17 |                  8 |                   0 |       14 |
| `cron`       |      2 |                  0 |     0 |                  0 |         2 |         7 |                  2 |                   0 |        2 |
| `realtime`   |      9 |                  1 |     0 |                  0 |         1 |        12 |                  1 |                   9 |        0 |
| `extensions` |      0 |                  0 |     4 |                  0 |         0 |        67 |                  0 |                   0 |        0 |

Other observed counts:

| Artifact                                                           | Count |
| ------------------------------------------------------------------ | ----: |
| Indexes in tracked schemas                                         |   648 |
| User triggers in tracked schemas                                   |    92 |
| Constraints in tracked schemas                                     |   853 |
| Public tables without primary key                                  |     0 |
| Public RLS-disabled tables                                         |     0 |
| Public `SECURITY DEFINER` functions                                |   217 |
| Public `SECURITY DEFINER` functions missing explicit `search_path` |     0 |

### Public Views

| View                          | Kind              | Security invoker |
| ----------------------------- | ----------------- | ---------------- |
| `feedbacks_with_masked_phone` | view              | true             |
| `printer_agent_status`        | view              | false            |
| `v_print_agent_fleet`         | view              | true             |
| `mv_daily_revenue`            | materialized view | false            |
| `mv_food_cost`                | materialized view | false            |
| `mv_grn_price_baseline`       | materialized view | false            |
| `mv_inventory_stock_current`  | materialized view | false            |
| `mv_inventory_value_ranking`  | materialized view | false            |
| `mv_top_items`                | materialized view | false            |

Materialized views are expected to be accessed through checked functions or
revoked grants, not by relying on RLS inheritance.

### Installed Extensions

| Extension            | Schema       | Version |
| -------------------- | ------------ | ------- |
| `hypopg`             | `extensions` | `1.4.1` |
| `index_advisor`      | `extensions` | `0.2.0` |
| `pg_cron`            | `pg_catalog` | `1.6.4` |
| `pg_stat_statements` | `extensions` | `1.11`  |
| `pgcrypto`           | `extensions` | `1.3`   |
| `supabase_vault`     | `vault`      | `0.3.1` |
| `uuid-ossp`          | `extensions` | `1.1`   |

### Storage Buckets

| Bucket                  | Public | Objects |    Bytes |
| ----------------------- | ------ | ------: | -------: |
| `feedback-photos`       | false  |       0 |        0 |
| `grn-evidence`          | false  |       0 |        0 |
| `hddt-archive`          | false  |       0 |        0 |
| `inventory-attachments` | true   |       6 | 16847593 |
| `menu-images`           | true   |      36 | 22371841 |

Storage bucket rows and object data are not fully represented by a schema-only
dump. The baseline package must recreate bucket config and then migrate object
content through a separate storage manifest.

### Realtime And Replica Identity

`supabase_realtime` publishes:

- `public.branch_menu_item_daily_limits`
- `public.kds_tickets`
- `public.kitchen_send_batches`
- `public.notifications`
- `public.order_status_history`
- `public.orders`
- `public.payments`
- `public.pos_sessions`
- `public.print_jobs`
- `public.printer_agents`
- `public.tables`

Replica identity full is enabled on:

- `public.branch_menu_item_daily_limits`
- `public.kds_tickets`
- `public.kitchen_send_batches`
- `public.notifications`
- `public.orders`
- `public.payments`
- `public.pos_sessions`
- `public.print_jobs`
- `public.printer_agents`
- `public.tables`

Note: `order_status_history` is published but was not observed in the
`REPLICA IDENTITY FULL` list. Verify whether its primary key identity is
sufficient before packaging realtime behavior.

### Active DB Cron Jobs

| Job                                  | Schedule      |
| ------------------------------------ | ------------- |
| `auto_close_periods`                 | `0 19 * * *`  |
| `cleanup-abandoned-payments`         | `0 * * * *`   |
| `compute_branch_daily_waste_caps`    | `30 17 * * *` |
| `refresh_abc_classification`         | `0 19 * * 6`  |
| `refresh_mv_grn_price_baseline`      | `5 * * * *`   |
| `refresh_mv_inventory_stock_current` | `*/5 * * * *` |
| `refresh-finance-views-daily`        | `15 23 * * *` |
| `scan-inventory-alerts-daily`        | `0 23 * * *`  |
| `weekly_grn_override_report`         | `0 2 * * 5`   |
| `weekly_waste_report`                | `0 2 * * 1`   |

Cron jobs are data rows in `cron.job`; a schema-only dump or migration squash
can miss them. They must be recreated explicitly in the baseline package.

## Extraction Contract

1. Work from a scratch extraction workspace or clean branch, not by mutating the
   existing migration folder in place.
2. Keep the existing `supabase/migrations` folder as historical input only until
   the clean baseline is proven.
3. Export schema from `comtammatu` / `iexwsuaqqenyjiskawoj` only after verifying
   the project ref in the command output.
4. Do not dump or restore `matu-prod` in this track.
5. Do not restore Supabase-managed schemas blindly into a new project. Treat
   `auth`, `storage`, `realtime`, `vault`, and `extensions` as managed surfaces
   requiring explicit extraction rules.
6. Create a clean baseline migration from the verified live shape, then author
   forward migrations on top of that baseline.
7. Keep data migration separate from schema extraction. Operational rows,
   provider identifiers, storage objects, auth users, and queues follow
   `docs/plan/data-audit-classification.md`.

## Toolchain State

| Tool                | Current state                                                        |
| ------------------- | -------------------------------------------------------------------- |
| Supabase CLI        | Available via `pnpm dlx supabase` (`2.101.0`); not installed on PATH |
| `pg_dump`           | Not available on PATH                                                |
| Docker              | Available                                                            |
| Local Supabase link | `.temp/project-ref` points to `iexwsuaqqenyjiskawoj`                 |

Repo-owned wrappers now standardize the next extraction attempt:

| Command                                                | Purpose                                                          |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `pnpm db:baseline:extract:dry-run -- --schemas=public` | Print sanitized linked `pg_dump` plan without writing SQL files. |
| `pnpm db:baseline:extract -- --schemas=public`         | Export schema SQL into `.baseline-artifacts/`.                   |
| `pnpm db:baseline:local-check -- --baseline=<file>`    | Apply a candidate SQL file to scratch Supabase Local.            |

Supabase documentation confirms `supabase db pull` creates migration files from
a linked remote project and requires Docker for its shadow database workflow.
It also notes that `migration squash` omits data manipulation statements,
including cron jobs, storage buckets, and vault secrets, so squash is not enough
for this baseline package.

2026-05-26 CLI dry-run note: `supabase db dump --linked --schema public
--dry-run` successfully produced a sanitized `pg_dump` plan. A parallel
multi-schema dry run hit Supabase temp-login authentication failures and a
temporary connection circuit breaker. From this point, run linked dumps
sequentially through the repo wrapper and avoid parallel linked export commands.

2026-05-26 public schema candidate result:

| Item                 | Result                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Export command       | `pnpm db:baseline:extract -- --schemas=public --timeout-ms=300000`                                                                             |
| Artifact             | `.baseline-artifacts/supabase-live-baseline-20260526T152439Z/public.schema.sql`                                                                |
| Artifact size        | 33,917 lines / 1,292,460 bytes                                                                                                                 |
| Manifest project ref | `iexwsuaqqenyjiskawoj`                                                                                                                         |
| Local check command  | `pnpm db:baseline:local-check -- --baseline=.baseline-artifacts/supabase-live-baseline-20260526T152439Z/public.schema.sql --timeout-ms=600000` |
| Local check result   | Passed; empty Supabase Local scratch DB applied `public` schema candidate                                                                      |
| Scratch workdir      | `/tmp/comtammatu-baseline-local-check-20260526T152530Z`                                                                                        |

The check stopped and removed the scratch local project afterward. A container
check showed only the pre-existing `matu-platform` Supabase Local containers
still running.

This is a `PUBLIC-SCHEMA BOOT PASS`, not full greenfield baseline acceptance.
Managed Supabase surfaces and data migration remain separate gates. The
read-only managed-surface inventory now lives in
`docs/plan/supabase-managed-surfaces-baseline.md`; the install SQL/config bundle
now lives in `docs/plan/supabase-managed-surfaces-install-bundle.sql`.

2026-05-26 greenfield target note: owner provided `staging` /
`jmasiwuqiyedqvyfzhuq` as the new baseline target. Target readiness check showed
an empty public schema and no storage buckets. Extensions and bucket config were
applied through Supabase MCP. Direct linked Supabase CLI access was blocked by
IPv6 routing from this machine, so the remote restore used the Supavisor session
pooler shard `aws-1-ap-southeast-1.pooler.supabase.com:5432`. The public schema
candidate restored successfully in seven transaction-scoped chunks, then the
post-public managed-surface bundle applied successfully.

## Approved Next Steps

1. Run:
   - `node scripts/project-snapshot.mjs`
   - `pnpm typecheck && pnpm lint && pnpm build`
2. Compare restored schema counts against this manifest. The package is not
   accepted until public table/view/function counts, RLS/policy counts, storage
   bucket config, cron jobs, and realtime publication behavior are reconciled.

## Current Blockers

| Blocker                                                                  | Resolution needed                                                       |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Auth users and storage objects are not covered by schema-only extraction | Use the data audit classification and storage manifest before cutover   |
| POS/payment/stock mutation contract remains unresolved                   | Decide whether payment completion mutates inventory in the new baseline |
| HĐĐT archive is empty in the queried target                              | Resolve archive backfill policy before legal/tax data migration         |

Closed option:

| Option              | Result                                                                          |
| ------------------- | ------------------------------------------------------------------------------- |
| `local-chain-first` | `NO-GO`; Supabase Local empty-DB replay fails before duplicate-version handling |

## Acceptance Criteria For Baseline Candidate

- Clean baseline can restore into an empty approved dev/test Supabase database.
- Restored schema matches this live manifest or has explicit owner-approved
  deviations.
- Generated database types are regenerated from the restored source schema.
- `pnpm typecheck && pnpm lint && pnpm build` passes after type regeneration.
- Storage buckets, cron jobs, realtime publication, extension list, and
  security-definer search-path posture are explicitly verified.
- Data migration remains separate and does not silently drop legal, provider,
  payment, tax, audit, auth, or storage evidence.
