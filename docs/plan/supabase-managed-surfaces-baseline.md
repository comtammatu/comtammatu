# Supabase Managed Surfaces Baseline

> Status: READ-ONLY MANIFEST
> Date: 2026-05-26
> Target: Supabase project `comtammatu` / `iexwsuaqqenyjiskawoj`
> Related: `docs/plan/live-schema-first-baseline-extraction.md`

This manifest closes the first inventory pass for Supabase-managed surfaces that
sit around the `public` schema baseline. It does not apply migrations, create a
new database, export object data, export secrets, or mutate production.

4-agent debate is skipped because this is documentation-only. The next
implementation step is an install bundle plus restore rehearsal against an
approved empty dev/test target.

## Safety Boundary

- Query target was verified as project `comtammatu`, ref
  `iexwsuaqqenyjiskawoj`, region `ap-southeast-1`, status `ACTIVE_HEALTHY`,
  Postgres `17.6.1.121`.
- Production project `matu-prod` was not queried.
- Do not restore Supabase-owned schemas (`auth`, `storage`, `realtime`) through
  a blind raw dump. Supabase platform docs state that managed services assume
  their own schema ownership for service migrations.
- Storage object bytes are not represented by database schema backup. Bucket
  metadata and storage object manifests must be handled separately.
- Data API exposure and schema grants must be rechecked after restore because
  newer Supabase projects may not expose newly created tables/schemas the same
  way older projects did.

## Current Changelog Notes

Supabase changelog review on 2026-05-26 found these baseline-relevant changes:

| Date       | Surface  | Baseline impact                                                                |
| ---------- | -------- | ------------------------------------------------------------------------------ |
| 2026-05-25 | GraphQL  | New projects disable `pg_graphql` introspection by default from 2026-06-15.    |
| 2026-04-28 | Data API | New table/API exposure is no longer safe to assume for all new projects.       |
| 2025-03-18 | Platform | Access restrictions on `auth`, `storage`, and `realtime` schemas require care. |
| 2025-07-11 | Realtime | Realtime settings are a platform surface, not only database DDL.               |
| 2024-04-04 | Realtime | Broadcast and Presence authorization need separate review if activated later.  |

`pg_graphql` is not installed in the live manifest today.

## Extensions

| Extension            | Schema       | Version | Baseline action                                            |
| -------------------- | ------------ | ------- | ---------------------------------------------------------- |
| `hypopg`             | `extensions` | `1.4.1` | Enable only if index-advisor workflow remains in baseline. |
| `index_advisor`      | `extensions` | `0.2.0` | Enable with `hypopg` if retained.                          |
| `pg_cron`            | `pg_catalog` | `1.6.4` | Required for DB cron jobs below.                           |
| `pg_stat_statements` | `extensions` | `1.11`  | Operational observability extension.                       |
| `pgcrypto`           | `extensions` | `1.3`   | Required by app schema.                                    |
| `plpgsql`            | `pg_catalog` | `1.0`   | Built-in language; do not package as app-owned extension.  |
| `supabase_vault`     | `vault`      | `0.3.1` | Extension only; vault secret values must be re-entered.    |
| `uuid-ossp`          | `extensions` | `1.1`   | Required by app schema.                                    |

## Storage Buckets

| Bucket                  | Public | File limit | Allowed MIME types                                    |
| ----------------------- | ------ | ---------: | ----------------------------------------------------- |
| `feedback-photos`       | false  |    5242880 | `image/jpeg`, `image/png`, `image/webp`, `image/heic` |
| `grn-evidence`          | false  |       null | null                                                  |
| `hddt-archive`          | false  |   10485760 | `application/pdf`, `application/xml`, `text/xml`      |
| `inventory-attachments` | true   |   10485760 | JPEG, PNG, WebP, HEIC, PDF                            |
| `menu-images`           | true   |    5242880 | JPEG, PNG, WebP                                       |

Storage object data is not part of this schema pass. The data-audit track must
produce object path/checksum manifests for `inventory-attachments` and
`menu-images` before any real greenfield migration.

### Storage Policies

Live storage policies are all on `storage.objects`:

| Policy                                 | Roles           | Command  | Bucket / scope summary                                                    |
| -------------------------------------- | --------------- | -------- | ------------------------------------------------------------------------- |
| `feedback_photos_authenticated_select` | `authenticated` | `SELECT` | Tenant folder matches JWT `tenant_id`.                                    |
| `feedback_photos_service_role_all`     | `service_role`  | `ALL`    | Service-role access for `feedback-photos`.                                |
| `grn_evidence_no_delete`               | `authenticated` | `DELETE` | Blocks deleting `grn-evidence` through authenticated role.                |
| `grn_evidence_read`                    | `authenticated` | `SELECT` | Requires GRN override or report permission.                               |
| `grn_evidence_upload`                  | `authenticated` | `INSERT` | Requires GRN hardblock override permission.                               |
| `hddt_archive_select`                  | `authenticated` | `SELECT` | Tenant folder plus `finance:view`; bucket remains private.                |
| `inv_attach_delete`                    | `authenticated` | `DELETE` | Tenant folder for `inventory-attachments`.                                |
| `inv_attach_insert`                    | `authenticated` | `INSERT` | Tenant folder plus procurement, supplier return, or write-off permission. |
| `inv_attach_read`                      | `public`        | `SELECT` | Public read for `inventory-attachments` bucket.                           |
| `inv_attach_update`                    | `authenticated` | `UPDATE` | Tenant folder for `inventory-attachments`.                                |
| `menu_images_delete`                   | `authenticated` | `DELETE` | Tenant folder plus `menu:write`.                                          |
| `menu_images_insert`                   | `authenticated` | `INSERT` | Tenant folder plus `menu:write`.                                          |
| `menu_images_read`                     | `public`        | `SELECT` | Public read for `menu-images` bucket.                                     |
| `menu_images_update`                   | `authenticated` | `UPDATE` | Tenant folder plus `menu:write`.                                          |

## DB Cron Jobs

| Job                                  | Schedule      | Command                                                                        |
| ------------------------------------ | ------------- | ------------------------------------------------------------------------------ |
| `auto_close_periods`                 | `0 19 * * *`  | `SELECT public.auto_close_periods();`                                          |
| `cleanup-abandoned-payments`         | `0 * * * *`   | `SELECT public.cleanup_abandoned_payments()`                                   |
| `compute_branch_daily_waste_caps`    | `30 17 * * *` | `SELECT public.compute_branch_daily_waste_caps();`                             |
| `refresh_abc_classification`         | `0 19 * * 6`  | `SELECT public.refresh_abc_classification();`                                  |
| `refresh_mv_grn_price_baseline`      | `5 * * * *`   | `REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_grn_price_baseline;`         |
| `refresh_mv_inventory_stock_current` | `*/5 * * * *` | `REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_inventory_stock_current;`    |
| `refresh-finance-views-daily`        | `15 23 * * *` | `SET LOCAL statement_timeout = '5min'; SELECT public.refresh_finance_views();` |
| `scan-inventory-alerts-daily`        | `0 23 * * *`  | `SELECT public.scan_inventory_alerts();`                                       |
| `weekly_grn_override_report`         | `0 2 * * 5`   | `SELECT public.weekly_grn_override_report();`                                  |
| `weekly_waste_report`                | `0 2 * * 1`   | `SELECT public.weekly_waste_report();`                                         |

Package cron through explicit `cron.schedule(...)` install SQL after
`pg_cron` and the referenced functions/materialized views exist. Do not assume
rows in `cron.job` survive a schema-only dump or migration squash.

## Realtime

`supabase_realtime` currently publishes these public tables:

| Table                           | Replica identity |
| ------------------------------- | ---------------- |
| `branch_menu_item_daily_limits` | `full`           |
| `kds_tickets`                   | `full`           |
| `kitchen_send_batches`          | `full`           |
| `notifications`                 | `full`           |
| `order_status_history`          | `default`        |
| `orders`                        | `full`           |
| `payments`                      | `full`           |
| `pos_sessions`                  | `full`           |
| `print_jobs`                    | `full`           |
| `printer_agents`                | `full`           |
| `tables`                        | `full`           |

`order_status_history` is published with default replica identity. Keep it as a
review item before writing the install bundle: either default identity is
enough for current subscribers, or the bundle should make the identity decision
explicit.

## Auth Hook

Live auth hook function:

| Field              | Observed                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------- |
| Function           | `public.custom_access_token_hook(event jsonb)`                                           |
| Returns            | `jsonb`                                                                                  |
| Owner              | `postgres`                                                                               |
| Security definer   | true                                                                                     |
| Function config    | `search_path=""`                                                                         |
| Definition SHA-256 | `4c878f7a4135ffa01c81d6af25dc55f14fd2c760d3327e2307c902316bb8a652`                       |
| Local auth config  | `supabase/config.toml` enables `pg-functions://postgres/public/custom_access_token_hook` |

The install bundle must recreate the function, grant execute to
`supabase_auth_admin`, revoke execute from public web roles, and keep
`SECURITY DEFINER` plus explicit empty `search_path`.

## Data API And Grants

Observed SQL grants on `public` relations:

| Grantee         | Relation count | SELECT | INSERT | UPDATE | DELETE | TRUNCATE | REFERENCES | TRIGGER |
| --------------- | -------------: | -----: | -----: | -----: | -----: | -------: | ---------: | ------: |
| `anon`          |            117 |    117 |    117 |    117 |    117 |      117 |        117 |     117 |
| `authenticated` |            117 |    117 |    109 |    109 |    109 |      117 |        117 |     117 |

These grants are not a replacement for RLS. The public schema live manifest
shows all public tables have RLS enabled, and that must remain a restore gate.
After restore, verify the Supabase Data API exposed schema settings from
Dashboard/API as a platform setting, not only via SQL grants.

## Packaging Order

1. Enable required extensions.
2. Apply the public schema baseline SQL that already passed Supabase Local boot.
3. Recreate storage buckets and storage policies.
4. Recreate the auth hook function, grants, and `supabase/config.toml` hook
   contract.
5. Add realtime publication entries and replica identity decisions.
6. Add DB cron jobs through explicit `cron.schedule(...)` statements.
7. Re-enter or rotate Vault/provider secrets; never export live secret values.
8. Restore approved data slices and storage objects after separate data-audit
   approval.
9. Run `pnpm db:types`, then `pnpm typecheck && pnpm lint && pnpm build`.

## Current Verdict

`CONDITIONAL GO` to write a managed-surface install bundle next.

This is still `NO-GO` for full greenfield acceptance because:

- Managed surfaces are enumerated but not yet converted to install SQL/config.
- The bundle has not been restored to an approved empty dev/test database.
- Storage object manifests and provider/queue data decisions remain open in the
  data-audit track.
- Data API exposed schema settings require post-restore platform verification.
