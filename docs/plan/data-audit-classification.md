# Data Audit Classification

> Status: SOURCE-ONLY BASELINE PREP  
> Date: 2026-05-26  
> Scope: public generated types, storage buckets authored in migrations, cron
> handlers/jobs, provider identifiers, and baseline migration rules.

This is not a live Supabase audit. It classifies the current repo contract so
greenfield packaging can continue without treating unknown data as disposable.
Live row counts, table sizes, last-write timestamps, storage object counts,
checksums, prod apply status, and auth-user preservation still require an
owner-approved dev/prod environment check before any new database is created.

The 4-agent debate is skipped for this slice because it is documentation-only.
The decision rule still follows the database source ladder:

1. `packages/database/src/types/database.types.ts`
2. Applied dev/prod Supabase state, when checked
3. `supabase/migrations/*.sql`
4. Active module docs
5. Archived plans as historical context only

## Classification Rules

| Class | Meaning | Baseline action |
| --- | --- | --- |
| `MIGRATE` | Required live operational, legal, audit, provider, or user-continuity data | Transform and load into the new baseline. |
| `ARCHIVE_ONLY` | Must be retained but does not need to be live | Export immutable snapshot with manifest and checksum. |
| `DROP_ACCEPTED` | Owner accepts loss | Exclude only after named owner sign-off and evidence. |
| `REBUILD_FROM_SOURCE` | Derived or seedable from retained source rows/code | Recompute or reseed in the new baseline. |
| `DEFER_DECISION` | Active dependency, unclear retention, queue state, or secret/identity handling still unresolved | Blocks greenfield DB work until resolved. |

Current stance: no table, bucket, provider identifier, or cron artifact is
classified as `DROP_ACCEPTED` in this source-only pass.

## Table Classification

Generated snapshot: 116 public tables.

| Artifact | Class | Reason / next evidence |
| --- | --- | --- |
| `accounting_periods` | `MIGRATE` | Period close continuity. |
| `archive_run_log` | `MIGRATE` | HĐĐT archive attempt audit and retry evidence. |
| `area_branches` | `MIGRATE` | Area/branch scope mapping. |
| `areas` | `MIGRATE` | Branch hierarchy. |
| `attendance_records` | `MIGRATE` | Labor/payroll record. |
| `audit_logs` | `MIGRATE` | Accountability and investigation chain. |
| `branch_attendance_config` | `MIGRATE` | HR branch policy. |
| `branch_daily_waste_cap` | `REBUILD_FROM_SOURCE` | Derived daily cap; recompute from retained revenue/waste source rows. |
| `branch_express_window` | `MIGRATE` | Active GRN auto-approval policy config until owner retires it. |
| `branch_feature_flags` | `MIGRATE` | Runtime rollout state. |
| `branch_menu_item_daily_limits` | `MIGRATE` | POS operational limit state; cutover needs current-day counter rule. |
| `branch_override_attempts` | `ARCHIVE_ONLY` | Security/audit attempt history; live state comes from active code hashes. |
| `branch_override_codes` | `DEFER_DECISION` | Hashes may migrate or be rotated/re-provisioned at cutover. |
| `branch_trusted_egress_ips` | `MIGRATE` | POS/KDS/Runner network perimeter. |
| `branch_zones` | `MIGRATE` | POS layout and table grouping. |
| `branches` | `MIGRATE` | L1 operational identity. |
| `chart_of_accounts` | `MIGRATE` | Finance/GL identity. |
| `employees` | `MIGRATE` | HR identity and portal references. |
| `employment_contracts` | `MIGRATE` | Labor/legal record. |
| `feedback_daily_reports` | `MIGRATE` | Customer feedback reporting continuity. |
| `feedback_qr_codes` | `MIGRATE` | Public QR/token identity. |
| `feedback_settings` | `MIGRATE` | Feedback workflow config. |
| `feedbacks` | `MIGRATE` | Customer feedback source rows. |
| `fiscal_periods` | `MIGRATE` | Finance period state. |
| `goods_received_notes` | `MIGRATE` | Procurement/AP source record. |
| `grn_baseline_pause` | `MIGRATE` | Active variance suppression window. |
| `grn_express_extend_audit` | `ARCHIVE_ONLY` | Approval-extension audit history. |
| `grn_hardblock_overrides` | `MIGRATE` | QC override evidence and active trust-score input. |
| `grn_items` | `MIGRATE` | GRN line source record. |
| `ingredient_abc_class` | `REBUILD_FROM_SOURCE` | Weekly/on-demand ABC classification derived from retained inventory value. |
| `ingredient_category_review_policy` | `MIGRATE` | Food-safety / review policy. |
| `ingredients` | `MIGRATE` | Inventory catalog. |
| `inventory_locations` | `MIGRATE` | Stock scope and location identity. |
| `inventory_qc_settings` | `MIGRATE` | QC policy config. |
| `journal_entries` | `MIGRATE` | Accounting chain. |
| `journal_entry_lines` | `MIGRATE` | Accounting chain detail. |
| `kds_station_categories` | `MIGRATE` | KDS routing config. |
| `kds_stations` | `MIGRATE` | KDS station identity. |
| `kds_tickets` | `MIGRATE` | Active kitchen queue/history. |
| `kitchen_daily_counters` | `MIGRATE` | Operational numbering/counter continuity. |
| `kitchen_send_batches` | `MIGRATE` | Runner/KDS dispatch state. |
| `menu_categories` | `MIGRATE` | Menu catalog. |
| `menu_item_available_sides` | `MIGRATE` | Menu serving rules. |
| `menu_item_modifiers` | `MIGRATE` | Menu serving rules. |
| `menu_item_variants` | `MIGRATE` | Menu catalog detail. |
| `menu_items` | `MIGRATE` | Menu catalog. |
| `mv_refresh_log` | `ARCHIVE_ONLY` | Staleness/audit log; green refresh cycle starts fresh. |
| `notification_outbox` | `DEFER_DECISION` | Pending rows may need live migration; sent/skipped rows can archive. |
| `notification_reads` | `MIGRATE` | User unread/read state. |
| `notifications` | `MIGRATE` | Durable in-app notifications. |
| `order_daily_counters` | `MIGRATE` | Operational order numbering continuity. |
| `order_items` | `MIGRATE` | Revenue/detail source rows. |
| `order_status_history` | `MIGRATE` | Order audit history. |
| `orders` | `MIGRATE` | Revenue and POS source rows. |
| `payments` | `MIGRATE` | Revenue ledger and provider reconciliation. |
| `payroll_entries` | `MIGRATE` | Payroll/legal record. |
| `payroll_periods` | `MIGRATE` | Payroll period state. |
| `permission_audit_log` | `MIGRATE` | Permission-change audit. |
| `permission_keys` | `REBUILD_FROM_SOURCE` | Permission catalog should be seeded from target ACL source. |
| `pos_sessions` | `MIGRATE` | Cashier shift/session continuity. |
| `pos_terminals` | `MIGRATE` | POS terminal identity. |
| `positions` | `MIGRATE` | Staff position identity and role bridge. |
| `posting_rules` | `MIGRATE` | Finance posting contract. |
| `print_jobs` | `DEFER_DECISION` | Open jobs may need live migration; completed jobs can archive. |
| `print_template_versions` | `MIGRATE` | Receipt/document rendering contract. |
| `printer_agent_presence_tokens` | `DEFER_DECISION` | Token hashes may migrate or be rotated per branch/agent. |
| `printer_agents` | `MIGRATE` | Branch-device registry. |
| `printer_menu_categories` | `MIGRATE` | Printer routing config. |
| `printer_print_types` | `MIGRATE` | Printer routing config. |
| `printers` | `MIGRATE` | Printer fleet identity. |
| `production_order_items` | `MIGRATE` | Central kitchen production detail. |
| `production_orders` | `MIGRATE` | Production source record. |
| `production_recipes` | `MIGRATE` | Production BOM. |
| `profiles` | `MIGRATE` | App-user public identity; auth-user mapping still needs live plan. |
| `purchase_order_items` | `MIGRATE` | Procurement detail. |
| `purchase_orders` | `MIGRATE` | Procurement source record. |
| `recipes` | `MIGRATE` | Menu/inventory BOM. |
| `reconcile_run_log` | `MIGRATE` | HĐĐT reconcile attempt audit. |
| `refunds` | `MIGRATE` | Revenue reversal and audit. |
| `role_templates` | `MIGRATE` | Permission defaults; compare with target ACL before load. |
| `shift_assignments` | `MIGRATE` | HR schedule source rows. |
| `shift_requests` | `MIGRATE` | HR workflow continuity. |
| `shifts` | `MIGRATE` | HR shift catalog. |
| `staff_permissions` | `MIGRATE` | Explicit staff grants/revokes. |
| `stock_issue_items` | `MIGRATE` | Inventory issue/waste detail. |
| `stock_issues` | `MIGRATE` | Inventory issue/waste source rows. |
| `stock_levels` | `MIGRATE` | Operational stock balance; validate against ledger aggregates. |
| `stock_movements` | `MIGRATE` | Inventory ledger source of truth. |
| `stock_transfer_items` | `MIGRATE` | Transfer detail. |
| `stock_transfers` | `MIGRATE` | Transfer source record. |
| `stocktake_conflicts` | `DEFER_DECISION` | Must be resolved or explicitly archived before cutover. |
| `stocktake_drafts` | `DEFER_DECISION` | Active drafts need a freeze/cutoff rule. |
| `stocktake_lines` | `MIGRATE` | Stocktake source rows. |
| `stocktake_sessions` | `MIGRATE` | Stocktake source record. |
| `stocktake_zone_locks` | `DEFER_DECISION` | Ephemeral locks should expire or be released before cutover. |
| `summary_run_queue` | `MIGRATE` | HĐĐT B2C batch queue/audit. |
| `supplier_credit_notes` | `MIGRATE` | AP/legal record. |
| `supplier_invoices` | `MIGRATE` | AP/tax source record. |
| `supplier_items` | `MIGRATE` | Supplier catalog mapping. |
| `supplier_payments` | `MIGRATE` | AP payment record. |
| `supplier_price_list` | `MIGRATE` | Procurement price/baseline input. |
| `supplier_return_items` | `MIGRATE` | Supplier return detail. |
| `supplier_returns` | `MIGRATE` | Procurement/AP source record. |
| `suppliers` | `MIGRATE` | Supplier catalog. |
| `system_settings` | `MIGRATE` | Tenant settings and provider/payment flags; secret values need separate handling. |
| `tables` | `MIGRATE` | POS table identity. |
| `tax_invoice_events` | `MIGRATE` | HĐĐT audit trail. |
| `tax_invoice_orders` | `MIGRATE` | HĐĐT order linkage. |
| `tax_invoices` | `MIGRATE` | Tax/legal source record and archive paths. |
| `telegram_destinations` | `MIGRATE` | Feedback alert routing. |
| `telegram_outbox` | `DEFER_DECISION` | Pending alerts may need live migration; sent rows can archive. |
| `tenant_po_counters` | `MIGRATE` | PO numbering continuity. |
| `tenants` | `MIGRATE` | L0 tenant identity. |
| `user_trust_score` | `MIGRATE` | Active self-view and GRN trust scoring input. |
| `vas_report_lines` | `MIGRATE` | Vietnamese accounting/tax reporting. |
| `webhook_events` | `MIGRATE` | Provider idempotency and payment audit. |

## View Classification

Generated snapshot: 9 public views/materialized views. These should be
recreated from target SQL and refreshed from retained source rows, not copied as
authoritative data.

| Artifact | Class | Reason |
| --- | --- | --- |
| `feedbacks_with_masked_phone` | `REBUILD_FROM_SOURCE` | View over retained feedback rows. |
| `mv_daily_revenue` | `REBUILD_FROM_SOURCE` | Derived finance/revenue aggregate. |
| `mv_food_cost` | `REBUILD_FROM_SOURCE` | Derived inventory/finance aggregate. |
| `mv_grn_price_baseline` | `REBUILD_FROM_SOURCE` | Derived procurement baseline. |
| `mv_inventory_stock_current` | `REBUILD_FROM_SOURCE` | Derived from retained stock ledger and levels. |
| `mv_inventory_value_ranking` | `REBUILD_FROM_SOURCE` | Derived inventory ranking. |
| `mv_top_items` | `REBUILD_FROM_SOURCE` | Derived sales/menu aggregate. |
| `printer_agent_status` | `REBUILD_FROM_SOURCE` | View over printer agent registry/presence. |
| `v_print_agent_fleet` | `REBUILD_FROM_SOURCE` | View over printer fleet tables. |

## Storage Bucket Classification

Authored buckets found in migrations: 5.

| Bucket | Class | Evidence / migration source | Cutover rule |
| --- | --- | --- | --- |
| `hddt-archive` | `MIGRATE` | Private PDF/XML bucket, 10 MB cap, finance signed-download path | Copy objects with checksum manifest; verify path columns in `tax_invoices`. |
| `grn-evidence` | `MIGRATE` | Private audit evidence bucket; no authenticated delete policy | Copy objects with checksum manifest; preserve override row linkage. |
| `inventory-attachments` | `MIGRATE` | Public-read inventory attachment bucket, tenant-prefixed paths | Copy or archive by linked GRN/return/writeoff rows; verify public-read policy in target. |
| `feedback-photos` | `MIGRATE` | Private feedback photo bucket, service-role upload path | Copy only retained feedback photos; apply retention policy first. |
| `menu-images` | `MIGRATE` | Public-read menu image bucket, tenant-prefixed paths | Copy current catalog images and verify public read in target. |

Required live evidence still missing: object count, total bytes, per-object
checksum manifest, orphan object report, and signed URL smoke per private
bucket.

## External Provider And Secret Classification

Do not copy secret values into docs, migrations, or seed files. This section
tracks identifiers and configuration surfaces only.

| Surface | Class | Source | Cutover rule |
| --- | --- | --- | --- |
| MoMo POS native QR | `MIGRATE` | `MOMO_PARTNER_CODE`, `MOMO_ACCESS_KEY`, `MOMO_SECRET_KEY`, `MOMO_SANDBOX`, `MOMO_REDIRECT_URL`, webhook `/api/webhooks/momo`, `webhook_events` | Re-enter/rotate secrets; run native `qrCodeUrl` smoke. Link URLs are not scan-to-pay QR substitutes. |
| VietQR | `MIGRATE` | `VIETQR_API_KEY`, `VIETQR_BANK_ID`, `VIETQR_ACCOUNT_NO`, `VIETQR_ACCOUNT_NAME`, plus `system_settings` overrides | Re-enter/rotate secrets; verify branch/tenant payment settings. |
| Viettel S-Invoice | `MIGRATE` | `COMPANY_TAX_CODE`, `SINVOICE_USERNAME`, `SINVOICE_PASSWORD`, `SINVOICE_TEMPLATE_CODE`, `SINVOICE_INVOICE_SERIES`, `SINVOICE_BASE_URL`, `SINVOICE_SANDBOX` | Re-enter/rotate secrets; run provider smoke for issue/reconcile/archive. |
| Telegram feedback alerts | `MIGRATE` | `TELEGRAM_BOT_TOKEN`, `telegram_destinations`, `telegram_outbox` | Re-enter bot token; migrate destinations; resolve pending outbox rows. |
| Print-agent presence | `DEFER_DECISION` | `AGENT_ID`, `WEB_BASE_URL`, raw `PRINT_AGENT_PRESENCE_TOKEN`, hashed `printer_agent_presence_tokens` | Decide migrate hashes vs rotate/re-provision one raw token per branch agent. |
| Cron bearer | `MIGRATE` | `CRON_SECRET` for `/api/cron/*` and AI/feedback cron-style routes | Rotate secret; verify every scheduled caller uses the new value. |
| Feedback host split | `MIGRATE` | `NEXT_PUBLIC_FEEDBACK_HOST`, `NEXT_PUBLIC_APP_HOST`, allowed-origin policy | Preserve host separation; verify cookies remain host-only. |
| POS network gate | `MIGRATE` | `POS_NETWORK_GATE`, `branch_trusted_egress_ips`, `/api/branch-presence` | Default enabled in production; incident-disable is not a baseline default. |
| Upstash rate limit | `MIGRATE` | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Re-enter/rotate secrets; verify auth rate-limit behavior. |

## Cron And Worker Classification

`vercel.json` currently has no `crons` array, so App Route cron schedules must
be proven in deployment config before cutover. DB `pg_cron` jobs are authored in
migrations, but live presence still needs `cron.job` verification in the target
Supabase project.

| Artifact | Class | Source | Cutover rule |
| --- | --- | --- | --- |
| `refresh-finance-views-daily` | `MIGRATE` | `pg_cron` migration | Recreate schedule and verify `mv_refresh_log`/freshness signal. |
| `scan-inventory-alerts-daily` | `MIGRATE` | `pg_cron` migration | Recreate schedule if inventory alerts remain active. |
| `refresh_mv_inventory_stock_current` | `MIGRATE` | `pg_cron` migration | Recreate schedule after ledger import. |
| `refresh_mv_grn_price_baseline` | `MIGRATE` | `pg_cron` migration | Recreate only if GRN baseline policy remains active. |
| `weekly_grn_override_report` | `MIGRATE` | `pg_cron` migration | Recreate if hardblock override reporting remains active. |
| `weekly_waste_report` | `MIGRATE` | `pg_cron` migration | Recreate if waste approval module remains active. |
| `refresh_abc_classification` | `MIGRATE` | `pg_cron` migration | Recreate after inventory value views are built. |
| `auto_close_periods` | `MIGRATE` | `pg_cron` migration | Recreate with finance owner approval. |
| `cleanup-abandoned-payments` | `MIGRATE` | `pg_cron` migration | Recreate to prevent stale POS payment slots. |
| `compute_branch_daily_waste_caps` | `MIGRATE` | `pg_cron` migration | Recreate if daily waste caps remain in the target module. |
| `/api/cron/feedback-daily-report` | `DEFER_DECISION` | App Route handler; no `vercel.json` cron | Add deployment schedule or explicit manual-only decision. |
| `/api/cron/feedback-retention` | `DEFER_DECISION` | App Route handler; no `vercel.json` cron | Add deployment schedule before relying on photo/data retention. |
| `/api/cron/hddt-archive` | `DEFER_DECISION` | App Route handler; docs mention schedule but root `vercel.json` lacks it | Add deployment schedule and verify `HDDT_ARCHIVE_ENABLED`. |
| `/api/cron/hddt-daily-summary` | `DEFER_DECISION` | App Route handler; docs mention schedule but root `vercel.json` lacks it | Add deployment schedule and verify `HDDT_DAILY_SUMMARY_ENABLED`. |
| `/api/cron/hddt-reconcile` | `DEFER_DECISION` | App Route handler; docs mention schedule but root `vercel.json` lacks it | Add deployment schedule or owner-approved manual recovery posture. |
| `/api/cron/kds-maintenance` | `DEFER_DECISION` | App Route handler; no `vercel.json` cron | Add deployment schedule or prove alternate invoker. |
| `/api/cron/telegram-flush` | `DEFER_DECISION` | App Route handler plus post-feedback internal call | Add deployment schedule or prove after-submit invocation is sufficient. |

## Live Audit Blockers

These remain unresolved after this source-only pass:

1. Run live row counts, approximate table sizes, and last-write timestamps for
   all 116 public tables.
2. Generate FK graph and table-reference report from source plus live schema.
3. Verify migration apply status in dev/test and production; do not infer
   `prod-applied` from migration filenames or generated types.
4. Export storage object count, total bytes, and checksum manifest per retained
   bucket.
5. Produce a provider identifier manifest without secret values: MoMo request
   IDs, S-Invoice invoice numbers/provider refs, VietQR bank/account identifiers,
   webhook IDs, and print-agent IDs.
6. Resolve all `DEFER_DECISION` rows, especially active queues, stocktake
   conflict/draft/lock state, print jobs, presence tokens, branch override code
   rotation, and App Route cron scheduling.
7. Decide auth-user preservation: keep Supabase Auth user IDs where feasible, or
   create an explicit `old_user_id -> new_user_id` map before loading `profiles`,
   staff, audit, HR, and finance rows.

## Greenfield Migration Rules

- Build a clean baseline schema from verified current shape; do not replay all
  363 historical migrations as the normal install path.
- Preserve primary IDs where feasible for tenant, branch, user/profile, order,
  payment, stock, GL, payroll, invoice, and provider-bound rows.
- Never drop legal/tax/finance/payroll/payment/audit/storage/provider data
  without live evidence plus owner sign-off.
- Rebuild views, materialized views, counters, and report aggregates from
  retained source rows unless the table above says the exact live state must
  migrate.
- Validate migrated money and stock with before/after aggregates:
  revenue by local date, payment totals by method, refund totals, VAT invoice
  counts/states, stock quantity/value by branch/location, payroll totals by
  period, and open AP totals.
- Provider UX must fail closed: missing native QR/provider capability, missing
  S-Invoice config, missing branch-device identity, or disabled network gate is
  a blocker, not a fallback baseline.

## Owner Sign-Off Table

| Data class | Blue artifact | Decision | Owner | Date | Evidence |
| --- | --- | --- | --- | --- | --- |
| Live DB tables | 116 public tables | Source-only classification complete; live audit pending | TBD | TBD | `database.types.ts` + live row counts/sizes still needed |
| Views/MVs | 9 public views | Rebuild from retained source rows | TBD | TBD | SQL definitions + refresh smoke |
| Storage | 5 buckets | Migrate retained objects | TBD | TBD | Object counts + checksum manifest |
| Provider identifiers | MoMo, VietQR, Viettel S-Invoice, Telegram, print-agent | Migrate identifiers; rotate/re-enter secrets | TBD | TBD | Provider smoke + redacted manifest |
| Cron/workers | DB `pg_cron` + App Route cron handlers | Recreate proven jobs; App Route schedules deferred | TBD | TBD | `cron.job`, deployment config, route smoke |
| Defers | Queues, print jobs, stocktake transient state, tokens, branch override codes | Must resolve before green DB work | TBD | TBD | Owner decisions + live counts |
