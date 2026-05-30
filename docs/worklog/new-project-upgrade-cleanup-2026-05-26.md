# New Project Upgrade Cleanup - 2026-05-26

## Scope

This worklog starts cleanup for a future upgraded project without changing the
active production/pilot path.

The first slice was docs-only:

1. Refresh active snapshot counts from the current checkout.
2. Create a baseline package for upgrade decisions.
3. Open a cleanup queue in `tasks/todo.md`.

The follow-up hardening slice adds a runtime hygiene guard and removes obvious
retired/deprecated source markers. It still does not change migrations, database
state, production configuration, or UI behavior.

The data-audit slice is source-only. It classifies current generated tables,
views, storage buckets, cron artifacts, and provider identifiers, but it does
not query live Supabase, list storage objects, apply migrations, or prove
production state.

## Current Evidence

Command:

```bash
node scripts/project-snapshot.mjs
```

Snapshot:

| Area                              | Count |
| --------------------------------- | ----: |
| Worktree status entries           |     0 |
| `apps/web/app/**/page.tsx` routes |   109 |
| API route handlers                |    13 |
| Total route handlers              |    15 |
| Generated DB tables               |   116 |
| Generated DB views                |     9 |
| Generated DB functions            |   241 |
| Generated DB enums                |     0 |
| SQL migration files               |   363 |
| Test/spec files                   |    40 |
| Playwright specs                  |     9 |
| Shared unit tests                 |    31 |

Current commit: `b020d1b0`.

## Cleanup Contract

| Perspective | Decision                                                                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PM          | Start with a reversible baseline package. Do not pause pilot/hardening until owner reactivates a cutover program.                                                                                 |
| BA          | Preserve legal, tax, payment, finance, payroll, audit, storage evidence, auth, and provider identifiers unless a data audit says otherwise and owner signs off.                                   |
| Senior Dev  | Prefer same-stack green baseline preparation first. Do not port schema debt wholesale and do not replay all historical migrations as the normal install path.                                     |
| QA/QC       | Static verification can close this docs-only slice. Real upgrade readiness still requires data audit, migration rehearsal, persona tests, and POS -> payment -> stock -> KDS/print -> HDDT smoke. |

## Follow-up Hardening Contract

| Perspective | Decision                                                                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| PM          | Treat "no retired/dead code in baseline" as an enforceable source gate, not a slogan.                                                                |
| BA          | Preserve evidence and legal/provider history in audited worklogs, but do not let it define active runtime behavior.                                  |
| Senior Dev  | Combine `comtammatu` runtime contracts with `matu-platform` architecture principles only after mapping conflicts. Do not copy either tree wholesale. |
| QA/QC       | Add a focused `pnpm lint:baseline` gate and run it before the full repo verification gate.                                                           |

## Files Updated

- `docs/plan/new-project-upgrade-baseline.md`
- `docs/CODEBASE_MAP.md`
- `docs/spec/database-schema.md`
- `docs/modules/database.md`
- `docs/modules/web-app.md`
- `tasks/todo.md`
- `docs/worklog/README.md`
- `scripts/check-baseline-hygiene.mjs`
- `package.json`
- `docs/agent/rules/engineering.md`
- Route/module/ACL inventory artifact, later consolidated into active codebase
  docs.
- `docs/plan/data-audit-classification.md`
- Live migration drift reconciliation artifact, later consolidated into the
  live-schema-first baseline extraction doc.
- `docs/plan/live-schema-first-baseline-extraction.md`
- `docs/plan/supabase-managed-surfaces-baseline.md`
- `docs/plan/supabase-local-baseline-replay.md`
- `docs/runbooks/supabase-greenfield-baseline.md`
- `docs/runbooks/README.md`
- `scripts/supabase-baseline-extract.mjs`
- `scripts/supabase-baseline-local-check.mjs`
- active runtime files with unneeded retired/deprecated wording or exports

## Open Items

- Run live data audit from the approved target environment: row counts, table
  sizes, last-write timestamps, FK graph, storage object counts/checksums,
  provider identifier manifest, prod apply proof, and queue-state decisions.
- Run real POS -> payment -> stock -> KDS/print -> HĐĐT smoke in approved
  staging after provider credentials and seed data are available.
- Resolve the POS payment/stock mutation conflict between `comtammatu` and
  `matu-platform`.

## Verification

- `pnpm lint:baseline` passed.
- `pnpm typecheck` passed.
- `pnpm lint` passed with existing i18n warnings (`1301` warnings, `0` errors).
- `pnpm build` passed.
- `pnpm --filter @comtammatu/shared test` passed (`254` tests).
- `pnpm --filter @comtammatu/print-agent test:document` passed.
- Route/module/ACL inventory slice: `pnpm lint:baseline`, `pnpm typecheck`,
  `pnpm lint`, and `pnpm build` passed after adding the inventory artifact.
- Data-audit classification slice: `pnpm lint:baseline` passed;
  `pnpm typecheck && pnpm lint && pnpm build` passed. Lint still reports the
  existing i18n warnings (`1301` warnings, `0` errors).
- Baseline extraction tooling slice: script help and guard checks passed for
  `scripts/supabase-baseline-extract.mjs` and
  `scripts/supabase-baseline-local-check.mjs`; `git diff --check`,
  `pnpm lint:baseline`, and `pnpm typecheck && pnpm lint && pnpm build` passed.
  Lint reports existing i18n warnings (`1304` warnings, `0` errors).
- Public schema candidate slice: `pnpm db:baseline:extract:dry-run`,
  `pnpm db:baseline:extract`, and `pnpm db:baseline:local-check` passed after
  fixing wrapper handling for pnpm's `--` separator.
- Managed surfaces manifest slice: read-only Supabase MCP queries verified the
  target project and enumerated extensions, storage buckets/policies, DB cron,
  realtime publication/replica identity, auth hook/config, and Data API grant
  summary. No migrations were applied and no production project was queried.
  `git diff --check`, `pnpm lint:baseline`, and
  `pnpm typecheck && pnpm lint && pnpm build` passed. Lint reports existing
  i18n warnings (`1304` warnings, `0` errors).
- Greenfield target restore slice: public schema restored to `staging` /
  `jmasiwuqiyedqvyfzhuq`, post-public managed surfaces applied, and
  `pnpm db:types` regenerated from the greenfield project with no generated
  type diff. `node scripts/project-snapshot.mjs`, `git diff --check`,
  `pnpm lint:baseline`, and `pnpm typecheck && pnpm lint && pnpm build` passed.
  Lint still reports existing i18n warnings (`1304` warnings, `0` errors).
- Supabase advisors were run after the restore. They report inherited lints that
  must be triaged before any cutover, including `security_definer_view` on
  `public.printer_agent_status`, broad executable `SECURITY DEFINER` functions,
  materialized views exposed through the Data API, public bucket listing
  policies, unindexed foreign keys, and multiple permissive RLS policies.

## Greenfield Target Restore Rehearsal

Owner-provided greenfield/new baseline Supabase project:
`staging` / `jmasiwuqiyedqvyfzhuq`.

Readiness check on 2026-05-26:

| Area                        |           Result |
| --------------------------- | ---------------: |
| Project status              |   ACTIVE_HEALTHY |
| Region                      | `ap-southeast-1` |
| Postgres                    |     `17.6.1.127` |
| Public base tables          |                0 |
| Public views                |                0 |
| Public materialized views   |                0 |
| Public functions            |                0 |
| Storage buckets             |                0 |
| Realtime publication tables |                0 |

Applied to `staging` through Supabase MCP after verifying the target was empty:

| Migration version | Migration name                   | Result                                                                                                                                             |
| ----------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260526155743`  | `greenfield_required_extensions` | Installed `hypopg`, `index_advisor`, and `pg_cron`; existing `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, and `supabase_vault` remained present. |
| `20260526155851`  | `greenfield_storage_buckets`     | Recreated five bucket config rows: `feedback-photos`, `grn-evidence`, `hddt-archive`, `inventory-attachments`, and `menu-images`.                  |

Generated install bundle:
`docs/plan/supabase-managed-surfaces-install-bundle.sql`.

The first remote restore route failed before any schema was committed.
Supabase CLI linked through a scratch workdir under `/tmp` correctly targeted
`jmasiwuqiyedqvyfzhuq`, but `supabase db query --linked` and
`supabase db push --linked --dry-run` failed from this machine with:

```text
IPv6 is not supported on your current network: dial tcp [2406:...]:5432: connect: no route to host
```

The successful route used the Supavisor session pooler shard
`aws-1-ap-southeast-1.pooler.supabase.com:5432` with the owner-provided
password from `.env`. A full single-transaction restore was rolled back after
the pooler dropped the long-running connection near the grants section, leaving
the target at `0` public objects. The final restore was then applied as seven
natural pg_dump chunks, each in its own transaction:

| Chunk | Lines         | Surface                       | Result |
| ----- | ------------- | ----------------------------- | ------ |
| 1     | `1-20615`     | prelude, types, functions     | Pass   |
| 2     | `20616-24807` | tables, views, matviews       | Pass   |
| 3     | `24808-25771` | primary/unique constraints    | Pass   |
| 4     | `25772-27428` | indexes and triggers          | Pass   |
| 5     | `27429-29271` | foreign keys                  | Pass   |
| 6     | `29272-30827` | RLS enablement and policies   | Pass   |
| 7     | `30828-33917` | grants and default privileges | Pass   |

Post-public managed surface bundle section B then applied successfully.

Final target verification:

| Area                        | Count |
| --------------------------- | ----: |
| Public base tables          |   116 |
| Public functions            |   280 |
| Public RLS policies         |   263 |
| Public materialized views   |     6 |
| Storage buckets             |     5 |
| Storage object policies     |    14 |
| Realtime publication tables |    11 |
| DB cron jobs                |    10 |

`pnpm db:types` was regenerated from `SUPABASE_PROJECT_ID=jmasiwuqiyedqvyfzhuq`;
the generated database type file did not differ from the current checkout.

## Live Data Audit Dry Run

Ran read-only Supabase MCP queries on 2026-05-26 against local-env target
project `comtammatu` / `iexwsuaqqenyjiskawoj`. The separate `matu-prod` project
was discovered but not queried.

This dry run did not write data, apply migrations, list object keys, or print
secret values.

### Target

| Item           | Observed                |
| -------------- | ----------------------- |
| Project        | `comtammatu`            |
| Ref            | `iexwsuaqqenyjiskawoj`  |
| Region         | `ap-southeast-1`        |
| Status         | `ACTIVE_HEALTHY`        |
| Postgres       | 17.6                    |
| Auth users     | 24                      |
| Latest sign-in | 2026-05-26 09:28:31 UTC |

### Schema Counts

| Area                                       | Local generated/source snapshot | Live dry-run |
| ------------------------------------------ | ------------------------------: | -----------: |
| Public tables                              |                             116 |          116 |
| Public views/materialized views            |                               9 |            9 |
| Public functions                           |                             241 |          280 |
| Local migration files / applied migrations |                             363 |          393 |

Drift notes:

- Live `supabase_migrations.schema_migrations` has 393 applied versions, while
  local `supabase/migrations` has 363 files.
- Live has applied `20260524*` and `20260525*` migration versions that are not
  represented by the same local version set.
- Local has later `20260526*` through `20260531*` migration files and six
  `20260601*` versions beyond live's latest applied `20260601960300`.
- Therefore, greenfield baseline generation must not proceed until migration
  history is reconciled against the schema actually used for generated types.

### Largest Live Tables

| Table                  | Approx rows | Total size |
| ---------------------- | ----------: | ---------: |
| `print_jobs`           |       13613 |      21 MB |
| `order_items`          |        9463 |    5256 kB |
| `orders`               |        4730 |    4048 kB |
| `notifications`        |        4989 |    3560 kB |
| `payments`             |        4391 |    3120 kB |
| `kds_tickets`          |         533 |    2936 kB |
| `kitchen_send_batches` |        4960 |    2304 kB |
| `order_status_history` |       12496 |    2088 kB |
| `tax_invoices`         |        1591 |    1752 kB |

### Storage Buckets

| Bucket                  | Public | Objects |    Bytes |
| ----------------------- | ------ | ------: | -------: |
| `feedback-photos`       | false  |       0 |        0 |
| `grn-evidence`          | false  |       0 |        0 |
| `hddt-archive`          | false  |       0 |        0 |
| `inventory-attachments` | true   |       6 | 16847593 |
| `menu-images`           | true   |      36 | 22371841 |

Checksum manifests are still missing. The dry run counted buckets only and did
not list paths.

### Queue And Provider State

| Artifact                                                            | Exact rows | Note                                                                               |
| ------------------------------------------------------------------- | ---------: | ---------------------------------------------------------------------------------- |
| `print_jobs`                                                        |      13613 | Largest table; includes 536 failed jobs.                                           |
| `orders`                                                            |       4730 | Live operational data.                                                             |
| `payments`                                                          |       4391 | Live revenue ledger.                                                               |
| `tax_invoices`                                                      |       1591 | 1573 issued Viettel rows, 16 Viettel drafts, 1 mock draft, 1 skipped/not_required. |
| `reconcile_run_log`                                                 |       1573 | All observed rows are `transitioned` from cron.                                    |
| `printer_agents`                                                    |          3 | Branch-device registry exists.                                                     |
| `archive_run_log`                                                   |          0 | No archive attempts recorded.                                                      |
| `hddt-archive` objects                                              |          0 | No archived PDF/XML objects in storage.                                            |
| `webhook_events`                                                    |          0 | No MoMo webhook idempotency history in this target.                                |
| `notification_outbox`                                               |          0 | No pending external notification queue rows.                                       |
| `telegram_outbox`                                                   |          0 | No pending feedback Telegram rows.                                                 |
| `printer_agent_presence_tokens`                                     |          0 | Presence tokens must be provisioned or rotated before network-gated live smoke.    |
| `branch_trusted_egress_ips`                                         |          0 | Network gate is not provisioned in this target.                                    |
| `stocktake_conflicts` / `stocktake_drafts` / `stocktake_zone_locks` |          0 | No active stocktake transient rows in dry-run target.                              |
| `stock_levels` / `stock_movements`                                  |          0 | Inventory ledger is empty in this target despite POS/payment data.                 |

Payment grouping observed:

| Method   | Status      | Stock consumed status | Count | Total amount |
| -------- | ----------- | --------------------- | ----: | -----------: |
| `cash`   | `completed` | `ok`                  |  2154 |    169559140 |
| `cash`   | `completed` | null                  |  1553 |    143887220 |
| `vietqr` | `completed` | null                  |   601 |     62031800 |
| `cash`   | `completed` | `out_of_stock`        |    62 |      4941000 |
| `vietqr` | `failed`    | null                  |    16 |      1257000 |
| `momo`   | `failed`    | null                  |     5 |        52000 |

### Cron

Live DB `pg_cron` has 10 active jobs:

- `auto_close_periods`
- `cleanup-abandoned-payments`
- `compute_branch_daily_waste_caps`
- `refresh_abc_classification`
- `refresh_mv_grn_price_baseline`
- `refresh_mv_inventory_stock_current`
- `refresh-finance-views-daily`
- `scan-inventory-alerts-daily`
- `weekly_grn_override_report`
- `weekly_waste_report`

Root `vercel.json` still has no App Route cron definitions, so `/api/cron/*`
deployment scheduling remains `DEFER_DECISION`.

### Dry-Run Verdict

`CONDITIONAL GO` for continuing baseline cleanup; `NO-GO` for creating a
greenfield database baseline today.

Blockers found by the dry run:

1. Migration history drift: 393 applied live vs 363 local migration files, plus
   function count drift.
2. HĐĐT archive is not populated: 1573 issued Viettel invoices but 0 archive
   storage objects and 0 archive run logs.
3. Print queue history is material and has failed rows; `print_jobs` cannot be
   blindly dropped or treated as ephemeral.
4. Network-gate provisioning is absent in this target: 0 trusted IP rows and 0
   presence token rows.
5. POS/payment data exists but inventory ledger/balances are empty in this
   target, so the POS payment/stock mutation contract remains unresolved by
   data evidence.

## Migration Drift Reconciliation

Added a live migration drift reconciliation artifact after read-only
comparison between local migration files and live `comtammatu`
`supabase_migrations.schema_migrations`.

Key result:

| Check                      |    Local checkout | Live `comtammatu` |
| -------------------------- | ----------------: | ----------------: |
| Migration files / rows     |         363 files |  393 applied rows |
| Unique versions            |               362 |               393 |
| Exact-version matches      |               308 |               308 |
| Live-only applied versions |               n/a |                85 |
| Local-only unique versions |                54 |               n/a |
| Duplicate versions         | 1 local duplicate | 0 live duplicates |

Verdict: `NO-GO` for creating a greenfield database baseline from the current
local migration chain. Recommended path is `live-schema-first`: export/pull the
verified live schema into a clean baseline, then author forward migrations after
owner sign-off.

## Live Schema First Decision

Owner accepted `live-schema-first` on 2026-05-26.

Added `docs/plan/live-schema-first-baseline-extraction.md` as the read-only
extraction contract. The document records the live schema manifest from
`comtammatu` / `iexwsuaqqenyjiskawoj` and confirms the current local toolchain
state:

| Tool                | Current state                                                        |
| ------------------- | -------------------------------------------------------------------- |
| Supabase CLI        | Available via `pnpm dlx supabase` (`2.101.0`); not installed on PATH |
| `pg_dump`           | Not available on PATH                                                |
| Docker              | Available                                                            |
| Local Supabase link | `.temp/project-ref` points to `iexwsuaqqenyjiskawoj`                 |

Live manifest highlights:

| Area                                                               | Observed |
| ------------------------------------------------------------------ | -------: |
| Database size                                                      |  `79 MB` |
| Public tables                                                      |      116 |
| Public views/materialized views                                    |        9 |
| Public functions                                                   |      280 |
| Public policies                                                    |      263 |
| Public RLS-disabled tables                                         |        0 |
| Public tables without primary key                                  |        0 |
| Public `SECURITY DEFINER` functions missing explicit `search_path` |        0 |
| Active DB cron jobs                                                |       10 |
| Storage buckets                                                    |        5 |
| Realtime publication tables                                        |       11 |

Next gate: run the extraction wrapper sequentially, then restore a clean
baseline candidate into scratch Supabase Local and an approved empty dev/test
database. No migration was applied and no production project was queried.

## Supabase Local Replay Check

Ran Supabase Local through `pnpm dlx supabase` in a scratch workdir on
2026-05-26. The existing `matu-platform` Supabase Local instance occupied the
default ports, so the replay used `/tmp/comtammatu-supabase-local-check` with a
scratch project id and DB port `55432`.

Command:

```bash
pnpm dlx supabase db start --workdir /tmp/comtammatu-supabase-local-check
```

Result:

```text
Applying migration 20260508055046_hddt_summary_rpcs.sql...
ERROR: column oi.vat_rate does not exist (SQLSTATE 42703)
```

Root cause: `20260508055046_hddt_summary_rpcs.sql` uses
`order_items.vat_rate`, but the local migration that creates the column is
`20260509000000_finance_phase1_5_vat_per_line.sql`.

This confirms the current local migration folder is not an empty-database
install path. `local-chain-first` is closed as `NO-GO`; `live-schema-first`
remains the finalized baseline strategy.

## Baseline Extraction Tooling

Added guarded commands for the `live-schema-first` path:

| Command                            | Purpose                                                        |
| ---------------------------------- | -------------------------------------------------------------- |
| `pnpm db:baseline:extract:dry-run` | Sanitized linked `pg_dump` dry-run.                            |
| `pnpm db:baseline:extract`         | Schema export into untracked `.baseline-artifacts/`.           |
| `pnpm db:baseline:local-check`     | Scratch Supabase Local restore check for a candidate SQL file. |

The first `public` schema dry-run returned a sanitized `pg_dump` plan. A
parallel multi-schema dry-run attempt hit Supabase temp-login auth failures and
a temporary connection circuit breaker. The runbook now requires sequential
linked dumps through the repo wrapper.

## Public Schema Candidate Export

After the temp-login circuit breaker cleared, the `public` schema candidate was
exported successfully.

| Item                 | Result                                                                          |
| -------------------- | ------------------------------------------------------------------------------- |
| Export command       | `pnpm db:baseline:extract -- --schemas=public --timeout-ms=300000`              |
| Artifact             | `.baseline-artifacts/supabase-live-baseline-20260526T152439Z/public.schema.sql` |
| Artifact size        | 33,917 lines / 1,292,460 bytes                                                  |
| Manifest             | `.baseline-artifacts/supabase-live-baseline-20260526T152439Z/manifest.json`     |
| Manifest project ref | `iexwsuaqqenyjiskawoj`                                                          |

The artifact directory is ignored by git through `.baseline-artifacts/`.

## Public Schema Local Check

The public schema candidate was applied to an empty scratch Supabase Local DB.

Command:

```bash
pnpm db:baseline:local-check -- --baseline=.baseline-artifacts/supabase-live-baseline-20260526T152439Z/public.schema.sql --timeout-ms=600000
```

Result:

```text
Applying migration 20260526000000_live_schema_baseline.sql...
Supabase Local baseline check passed in /tmp/comtammatu-baseline-local-check-20260526T152530Z
Stopping containers...
Stopped supabase local development setup.
```

Follow-up container check showed only the pre-existing `matu-platform` Supabase
Local containers still running.

Verdict: `PUBLIC-SCHEMA BOOT PASS`.

This does not yet accept the full greenfield baseline. Managed Supabase surfaces
are now inventoried in `docs/plan/supabase-managed-surfaces-baseline.md`, but
they still need install SQL/config and restore proof: `storage`, `auth`, `cron`,
`realtime`, `extensions`, and auth hook/config.
