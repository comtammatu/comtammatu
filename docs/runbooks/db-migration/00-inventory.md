# DB Inventory — Supabase → Self-hosted Postgres (US-Q07)

**Generated:** 2026-05-14  
**Source:** Local container `comtammatu-db` (port 54320), 335 migrations applied.  
**Plan reference:** `docs/plan/db-migration-supabase-to-postgres.md`

---

## Summary

| Category | Count | Notes |
|---|---|---|
| Tables (`public` schema) | 121 (118 base + 3 views) | See §1 |
| SECURITY DEFINER functions | 207 total | 131 call `auth.uid/role/jwt()` → needs-rewrite on pgxpool |
| RLS policies | 259 across 111 tables | All tables except a handful have RLS |
| pg_cron jobs | 10 | See §4 |
| Storage buckets | 4 | feedback-photos, menu-images, inventory-attachments, grn-evidence |
| Realtime publication tables | 10 | See §5 |
| Extensions (seeded container) | 1 installed (`plpgsql`); 3 required (`pg_cron`, `pgcrypto`, `pgjwt`) | See §7 |

---

## §1 — Tables (public schema, grouped by module)

### Orders & POS

| Table | Purpose | Disposition |
|---|---|---|
| `orders` | Core order records; all POS/table/takeaway orders | migrate-as-is |
| `order_items` | Line items per order | migrate-as-is |
| `order_daily_counters` | Per-(branch,day) sequential order numbering | migrate-as-is |
| `order_status_history` | Append-only audit trail of every order state change | migrate-as-is |
| `pos_sessions` | Cashier shift open/close sessions with float amounts | migrate-as-is |
| `pos_terminals` | Registered POS hardware per branch | migrate-as-is |
| `tables` | Restaurant table layout (dine-in) | migrate-as-is |
| `kitchen_send_batches` | Kitchen ticket batches; one per order-send or add-on | migrate-as-is |
| `kds_tickets` | KDS per-item ticket queue for kitchen display | migrate-as-is |
| `kds_stations` | KDS station definitions per branch | migrate-as-is |
| `kds_station_categories` | Menu category→KDS station routing | migrate-as-is |
| `kitchen_daily_counters` | Per-(branch,day) kitchen ticket sequence | migrate-as-is |

### Payments & Finance

| Table | Purpose | Disposition |
|---|---|---|
| `payments` | Payment records (cash, MoMo, VietQR, etc.) | migrate-as-is |
| `refunds` | Refund records linked to payments | migrate-as-is |
| `webhook_events` | Idempotency log for payment provider webhooks | migrate-as-is |
| `journal_entries` | GL journal entry headers | migrate-as-is |
| `journal_entry_lines` | GL journal entry debit/credit lines | migrate-as-is |
| `chart_of_accounts` | Account hierarchy per tenant | migrate-as-is |
| `fiscal_periods` | Monthly accounting periods with soft/hard close dates | migrate-as-is |
| `accounting_periods` | Two-stage period close control | migrate-as-is |
| `posting_rules` | Auto-posting rules for journal automation | migrate-as-is |
| `payroll_periods` | Payroll period definitions | migrate-as-is |
| `payroll_entries` | Per-employee payroll calculation entries | migrate-as-is |
| `mv_refresh_log` | Last refresh timestamps for finance materialized views | migrate-as-is |
| `summary_run_queue` | Queue + audit for daily B2C invoice batch runs | migrate-as-is |

### Tax & Invoicing

| Table | Purpose | Disposition |
|---|---|---|
| `tax_invoices` | HĐĐT (electronic tax invoices) headers | migrate-as-is |
| `tax_invoice_orders` | Junction: orders grouped into daily-summary invoices | migrate-as-is |
| `tax_invoice_events` | State-change audit trail for tax invoices | migrate-as-is |
| `vas_report_lines` | VAS (value-added service) report lines | migrate-as-is |

### Menu

| Table | Purpose | Disposition |
|---|---|---|
| `menu_items` | Menu item catalog per tenant | migrate-as-is |
| `menu_categories` | Menu category hierarchy | migrate-as-is |
| `menu_item_variants` | Variants (size, combo) for menu items | migrate-as-is |
| `menu_item_modifiers` | Add-on/modifier options for menu items | migrate-as-is |
| `menu_item_available_sides` | Available side dishes per menu item | migrate-as-is |
| `branch_menu_item_daily_limits` | Per-(branch, item, day) sales caps and sold_today counter | migrate-as-is |

### Inventory

| Table | Purpose | Disposition |
|---|---|---|
| `ingredients` | Ingredient catalog with review flags | migrate-as-is |
| `stock_levels` | Current stock quantities per (branch, ingredient, location) | migrate-as-is |
| `stock_movements` | Ledger of all stock in/out movements | migrate-as-is |
| `stock_issues` | Waste / issue requests | migrate-as-is |
| `stock_issue_items` | Line items for stock issues | migrate-as-is |
| `stock_transfers` | Inter-branch stock transfer headers | migrate-as-is |
| `stock_transfer_items` | Line items for transfers | migrate-as-is |
| `inventory_locations` | Named storage locations per branch | migrate-as-is |
| `inventory_qc_settings` | QC thresholds per branch | migrate-as-is |
| `stocktake_sessions` | Stocktake session headers | migrate-as-is |
| `stocktake_lines` | Per-ingredient count lines in a stocktake | migrate-as-is |
| `stocktake_drafts` | Counter auto-save (30s heartbeat stash, ephemeral) | migrate-as-is |
| `stocktake_zone_locks` | Table-based zone lock with TTL for concurrent counters | migrate-as-is |
| `stocktake_conflicts` | Offline sync conflict ledger; never silent client-wins | migrate-as-is |
| `ingredient_abc_class` | Pareto A/B/C classification per (tenant, branch, ingredient) | migrate-as-is |
| `ingredient_category_review_policy` | Per-tenant per-category manual review defaults | migrate-as-is |
| `branch_daily_waste_cap` | Nightly snapshot of per-branch daily waste cap | migrate-as-is |
| `branch_express_window` | Daily express auto-approve time window per branch | migrate-as-is |
| `branch_override_codes` | Rotating override code hash for GRN price variance | migrate-as-is |
| `branch_override_attempts` | Rate-limit log for override code attempts | migrate-as-is |
| `grn_baseline_pause` | 30-day baseline suppression after hardblock override | migrate-as-is |
| `grn_express_extend_audit` | Append-only log of express window extends (rate-limited) | migrate-as-is |
| `grn_hardblock_overrides` | Append-only log of hardblock overrides (rate-limited) | migrate-as-is |

### Purchasing / Procurement

| Table | Purpose | Disposition |
|---|---|---|
| `goods_received_notes` | GRN headers (deliveries from suppliers) | migrate-as-is |
| `grn_items` | GRN line items with price variance tracking | migrate-as-is |
| `purchase_orders` | PO headers | migrate-as-is |
| `purchase_order_items` | PO line items | migrate-as-is |
| `suppliers` | Supplier master | migrate-as-is |
| `supplier_invoices` | Supplier invoice records | migrate-as-is |
| `supplier_credit_notes` | Credit notes from suppliers | migrate-as-is |
| `supplier_payments` | Payments made to suppliers | migrate-as-is |
| `supplier_returns` | Return-to-supplier headers | migrate-as-is |
| `supplier_return_items` | Return line items | migrate-as-is |
| `supplier_items` | Supplier SKU mapping for PO pre-fill | migrate-as-is |
| `supplier_price_list` | Hybrid price list (contract/quotation/grn_last/manual) | migrate-as-is |
| `tenant_po_counters` | Per-tenant per-year PO sequence (atomic via RPC) | migrate-as-is |

### Production

| Table | Purpose | Disposition |
|---|---|---|
| `production_orders` | Production batch headers (semi-finished goods) | migrate-as-is |
| `production_order_items` | Production batch line items | migrate-as-is |
| `production_recipes` | Production recipe definitions | migrate-as-is |
| `recipes` | Base recipe ingredient lists | migrate-as-is |

### HR & Scheduling

| Table | Purpose | Disposition |
|---|---|---|
| `employees` | Employee records per tenant | migrate-as-is |
| `employment_contracts` | Contract records with wage/insurance info | migrate-as-is |
| `attendance_records` | Clock-in/out records | migrate-as-is |
| `branch_attendance_config` | Attendance config per branch | migrate-as-is |
| `shifts` | Shift definitions | migrate-as-is |
| `shift_assignments` | Assigned shifts per employee | migrate-as-is |
| `shift_requests` | Employee shift swap/request workflow | migrate-as-is |
| `positions` | HR position titles (not auth roles) | migrate-as-is |
| `user_trust_score` | Per-(tenant, branch, user) trust score scaffold | migrate-as-is |

### Feedback

| Table | Purpose | Disposition |
|---|---|---|
| `feedbacks` | Customer feedback submissions (INSERT via RPC only) | migrate-as-is |
| `feedback_qr_codes` | QR tokens for feedback forms | migrate-as-is |
| `feedback_settings` | Tenant-scoped feedback module config | migrate-as-is |
| `feedback_daily_reports` | AI-generated daily feedback summaries | migrate-as-is |
| `telegram_destinations` | Telegram chat targets for feedback alerts | migrate-as-is |
| `telegram_outbox` | Outbound Telegram alert queue (polled worker) | migrate-as-is |

### Printing

| Table | Purpose | Disposition |
|---|---|---|
| `print_jobs` | Print job queue consumed by printer agents | migrate-as-is |
| `print_template_versions` | Versioned print templates (immutable snapshots) | migrate-as-is |
| `printers` | Printer registrations per branch | migrate-as-is |
| `printer_agents` | Print agent registration + last-seen heartbeat | migrate-as-is |
| `printer_menu_categories` | Printer→menu category routing | migrate-as-is |
| `printer_print_types` | Printer→document type routing | migrate-as-is |

### Notifications

| Table | Purpose | Disposition |
|---|---|---|
| `notifications` | Role+branch targeted notification feed | migrate-as-is |
| `notification_reads` | Per-user read-state (presence = read) | migrate-as-is |
| `notification_outbox` | Outbound notification queue | migrate-as-is |

### Auth & Permissions

| Table | Purpose | Disposition |
|---|---|---|
| `profiles` | Extended user profile linked to `auth.users` | migrate-as-is |
| `users` | Application user records (mirrors auth.users subset) | migrate-as-is |
| `staff_permissions` | Source of truth for authz grants | migrate-as-is |
| `permission_catalog` | Permission key definitions | migrate-as-is |
| `permission_keys` | Global catalog of permission strings | migrate-as-is |
| `permission_audit_log` | Append-only audit of grant/revoke actions | migrate-as-is |
| `role_templates` | Preset permission bundles for bulk grants | migrate-as-is |
| `role_permission_defaults` | Default permissions per role template | migrate-as-is |
| `user_permissions` | Effective permission cache/override per user | migrate-as-is |

### Branches & Tenancy

| Table | Purpose | Disposition |
|---|---|---|
| `tenants` | Tenant (L0) master records | migrate-as-is |
| `branches` | Branch (L1) records per tenant | migrate-as-is |
| `areas` | Area groupings of branches | migrate-as-is |
| `area_branches` | Branch→area membership | migrate-as-is |
| `branch_zones` | Physical zones within a branch | migrate-as-is |
| `branch_feature_flags` | Per-branch feature flag rollout control | migrate-as-is |
| `branch_trusted_egress_ips` | POS/KDS network gate (NAT IP allowlist) | migrate-as-is |
| `user_area_assignments` | User→area assignment for area managers | migrate-as-is |
| `system_settings` | Global system configuration | migrate-as-is |

### Audit

| Table | Purpose | Disposition |
|---|---|---|
| `audit_logs` | Append-only immutable audit trail (no UPDATE/DELETE RLS) | migrate-as-is |

---

## §2 — SECURITY DEFINER Functions / RPCs

**Total: 207 functions.** All are in schema `public`.

**131 of 207 call `auth.uid()`, `auth.role()`, or `auth.jwt()`** — these break on plain `pgxpool` because there is no Supabase middleware to inject the auth context. The Go BE already works around this by passing explicit UUIDs (see `internal/handler/notifications/handler.go:47–73`). **This pattern must be preserved for every Go BE caller.**

The remaining 76 functions are background/system functions called by pg_cron, triggers, or service_role — they do not rely on auth context and migrate as-is.

### Auth-context-dependent functions (needs-rewrite disposition for Go BE callers)

These functions internally call `auth.uid()`/`auth.role()`. Direct invocation over `pgxpool` returns NULL for the auth context. Go BE callers must pass identity explicitly.

Selected high-traffic examples:

| Function | Auth call used | Called by |
|---|---|---|
| `create_order` | `auth.uid()` | POS |
| `cancel_order` | `auth.uid()`, `auth.role()` | POS/admin |
| `append_order_items` | `auth.uid()` | POS |
| `complete_payment_and_consume_stock` | `auth.uid()` | Payment handler |
| `confirm_vietqr_payment` | `auth.uid()` | Payment handler |
| `confirm_cash_payment` | `auth.uid()` | POS |
| `create_payment` | `auth.uid()` | POS |
| `bump_kds_ticket` | `auth.uid()` | KDS |
| `recall_kds_ticket` | `auth.uid()` | KDS |
| `submit_feedback` | `auth.uid()` | Feedback form |
| `grant_permission` | `auth.uid()`, `auth.role()` | Admin |
| `revoke_permission` | `auth.uid()`, `auth.role()` | Admin |
| `has_permission` | `auth.uid()` | RLS policies (called from RLS) |
| `has_permission_any` | `auth.uid()` | RLS policies |
| `log_audit` | `auth.uid()`, `auth.role()` | Many trigger/RPC paths |
| `custom_access_token_hook` | `auth.uid()` | GoTrue JWT issuance |
| `transition_order_status` | `auth.uid()` | Order workflow |
| `transition_order_item_status` | `auth.uid()` | KDS/POS |
| `confirm_goods_receipt_note` | `auth.uid()` | Inventory |
| `create_stocktake_session` | `auth.uid()` | Inventory |
| `finalize_stocktake` | `auth.uid()` | Inventory |
| `create_waste_entry` | `auth.uid()` | Inventory |

> **⚠ Critical:** `has_permission()` and `has_permission_any()` are called from RLS policies on most tables. On plain Postgres they still work — `auth.uid()` returns NULL but the RLS context for direct Go BE queries bypasses RLS anyway (service_role). For any authenticated PostgREST path still in use during the bridge period, these functions work correctly because PostgREST sets `role` and `request.jwt.claims`. Post-cutover, once PostgREST is removed, these functions are only called from the Go BE which already uses explicit-UUID binding.

### Non-auth-context functions (migrate-as-is)

Called by pg_cron, triggers, or invoked as system tasks:

`scan_inventory_alerts`, `refresh_finance_views`, `compute_branch_daily_waste_caps`, `refresh_mv_grn_price_baseline`, `refresh_mv_inventory_stock_current`, `cleanup_abandoned_payments`, `auto_close_periods`, `refresh_abc_classification`, `weekly_grn_override_report`, `weekly_waste_report`, `feedback_retention_cleanup`, `expire_stuck_print_jobs`, all `trg_*` trigger functions, `fn_generate_*` report functions.

**Disposition:** All 207 functions → **migrate-as-is** (schema dump preserves them). Go BE callers of the 131 auth-context-dependent ones → **needs-rewrite** (explicit UUID binding pattern, already established).

---

## §3 — RLS Policies

**259 policies across 111 tables.** Every business table has RLS. Only a handful of system/catalog tables have no policies.

Tables with highest policy counts (≥4):

| Table | Policies |
|---|---|
| `branches` | 4 |
| `ingredients` | 4 |
| `menu_categories` | 4 |
| `menu_items` | 4 |
| `menu_item_variants` | 4 |
| `menu_item_modifiers` | 4 |
| `menu_item_available_sides` | 4 |
| `pos_terminals` | 4 |
| `print_template_versions` | 4 |
| `printers` | 4 |
| `printer_menu_categories` | 4 |
| `printer_print_types` | 4 |
| `stock_transfer_items` | 4 |
| `tables` | 4 |
| `payroll_entries` | 5 |
| `attendance_records` | 5 |

**Disposition:** All RLS policies → **migrate-as-is**. They are included in the schema dump (`pg_dump --schema-only`). They depend on `has_permission()` and `auth.uid()` — correct behaviour during the PostgREST bridge period; after PostgREST retirement Go BE uses service_role which bypasses RLS.

---

## §4 — pg_cron Jobs

**10 jobs** defined across migrations. `pg_cron` and `pgcrypto` extensions are required but not installed in the seeded local container (stub env per `00-seed-blockers.md`). On production Supabase all 10 are active.

| Job name | Schedule (UTC) | VN local equiv | Function | Business logic |
|---|---|---|---|---|
| `scan-inventory-alerts-daily` | `0 23 * * *` | 06:00 daily | `scan_inventory_alerts()` | Scans stock levels, writes alert rows for low-stock/stockout conditions |
| `refresh-finance-views-daily` | `15 23 * * *` | 06:15 daily | `refresh_finance_views()` | Refreshes finance materialized views (revenue, cost, GL rollups) |
| `compute_branch_daily_waste_caps` | `30 17 * * *` | 00:30 daily | `compute_branch_daily_waste_caps()` | Nightly snapshot: waste cap = max(500k, min(5tr, 0.025 × avg_revenue_7d)) |
| `refresh_mv_grn_price_baseline` | `5 * * * *` | Every hour HH:05 | `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_grn_price_baseline` | Hourly refresh of GRN 30-day price baseline MV used for variance checks |
| `refresh_mv_inventory_stock_current` | `*/5 * * * *` | Every 5 min | `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_inventory_stock_current` | Near-realtime inventory stock level MV for dashboard |
| `cleanup-abandoned-payments` | `0 * * * *` | Every hour | `cleanup_abandoned_payments()` | Expires pending payments older than threshold |
| `auto_close_periods` | `0 19 * * *` | 02:00 daily | `auto_close_periods()` | Soft/hard closes accounting periods on schedule |
| `refresh_abc_classification` | `0 19 * * 6` | 02:00 Saturday | `refresh_abc_classification()` | Weekly Pareto A/B/C recomputation for ingredients |
| `weekly_grn_override_report` | `0 2 * * 5` | 09:00 Friday | `weekly_grn_override_report()` | Weekly report of GRN hardblock overrides |
| `weekly_waste_report` | `0 2 * * 1` | 09:00 Monday | `weekly_waste_report()` | Weekly waste tier analysis report |

**Disposition:** All 10 jobs → **migrate-as-is** (`pg_cron` extension migrates with schema, jobs re-enabled after cutover per Phase 6). The plan flags open question of moving some to Go scheduler post-cutover; that is deferred and does not block cutover.

> Note: the plan (§3.D) also mentions `hddt-daily-summary`, `feedback-daily-report`, `feedback-retention`, and `telegram-flush`. Searching migrations, `feedback_retention_cleanup` runs via the `feedback-retention` job (not found as a separate cron entry — may be triggered by the daily report job or a Next.js Server Action). Confirm against live `cron.job` table before cutover.

---

## §5 — Realtime Publication (supabase_realtime)

**10 tables** in `supabase_realtime` publication, from migration files:

| Table | Added by migration | Subscriber | Disposition |
|---|---|---|---|
| `kds_tickets` | `20260407110000_kds_tickets.sql` | KDS display PWA | replace-with-go-native (§3.B) |
| `kitchen_send_batches` | `20260513001000_kitchen_send_batches_realtime.sql` | KDS display PWA | replace-with-go-native (§3.B) |
| `branch_menu_item_daily_limits` | `20260517000000_branch_menu_daily_limits_realtime.sql` | POS (sold_today counter) | replace-with-go-native (§3.B) |
| `pos_sessions` | `20260426181830_pos_sessions_realtime.sql` | POS (session state) | replace-with-go-native (§3.B) |
| `orders` | `20260428000000_pos_realtime_publication.sql` | POS order list | replace-with-go-native (§3.B) |
| `tables` | `20260428000000_pos_realtime_publication.sql` | POS floor map | replace-with-go-native (§3.B) |
| `payments` | `20260428100000_add_payments_and_printer_agents_to_realtime.sql` | POS payment status | replace-with-go-native (§3.B) |
| `printer_agents` | `20260428100000_add_payments_and_printer_agents_to_realtime.sql` | Print agent status | replace-with-go-native (§3.B) |
| `notifications` | `20260425010000_create_notifications.sql` | Admin notification feed | replace-with-go-native (§3.B) |
| `print_jobs` | `20260423140000_printing_foundation.sql` | Printer agent job queue | replace-with-go-native (§3.B) |
| `order_status_history` | `20260520010000_audit_log_completeness.sql` | Admin order detail timeline | replace-with-go-native (§3.B) |

> The plan §3.B originally listed 4 tables. The actual publication has **11 tables** — 7 more than planned. Each requires a `pg_notify` trigger + Go fan-out channel + FE subscription swap. This expands the Phase 0.5 scope significantly.

All 11 `REPLICA IDENTITY` were set to `FULL` in migration `20260425024802_realtime_replica_identity_full.sql`.

**Disposition:** All 11 → **replace-with-go-native**. Drop `supabase_realtime` publication after cutover (no `supabase/realtime` container in new stack).

---

## §6 — Storage Buckets

4 buckets defined in migrations:

| Bucket ID | Public | Size limit | MIME types | Contents | Disposition |
|---|---|---|---|---|---|
| `feedback-photos` | No | 5 MB | jpeg, png, webp, heic | Per-submission customer photos | replace-with-go-native → R2 (§3.C) |
| `menu-images` | Yes | 5 MB | jpeg, png, webp | Menu item images | replace-with-go-native → R2 (§3.C) |
| `inventory-attachments` | Yes | 10 MB | jpeg, png, webp, heic, pdf | GRN / inventory documents (public shareable URLs, tenant-scoped paths) | replace-with-go-native → R2 (§3.C) |
| `grn-evidence` | No | unlimited | any | GRN hardblock override PDF evidence | replace-with-go-native → R2 (§3.C) |

> **Note:** The plan §3.C mentions only `feedback-photos` and `menu-images`. Two additional buckets exist: `inventory-attachments` and `grn-evidence`. Both must be included in the `rclone copy` + Go BE presigned URL work.

---

## §7 — Extensions

Extensions **required** by migrations (not all installed in seeded local container — see `00-seed-blockers.md`):

| Extension | Schema | Required for | Installed locally | Disposition |
|---|---|---|---|---|
| `plpgsql` | pg_catalog | PL/pgSQL functions (all RPCs) | ✅ yes (v1.0) | migrate-as-is |
| `pg_cron` | extensions | Scheduled jobs (§4) | ❌ stub | migrate-as-is — install on new Postgres 17 |
| `pgcrypto` | extensions | Password hashing, token generation | ❌ stub | migrate-as-is — install on new Postgres 17 |
| `pgjwt` | extensions | JWT generation in `custom_access_token_hook` | ❌ stub | migrate-as-is — install on new Postgres 17 |

> Also verify `uuid-ossp` — migrations use `gen_random_uuid()` (pgcrypto) but some older ones may reference `uuid_generate_v4()`. Run `grep -r "uuid_generate" supabase/migrations/` before Phase 2.

---

## §8 — Roles & Grants (summary)

Key roles used in RLS policies and grants (from migrations):

| Role | Purpose |
|---|---|
| `postgres` | Superuser / migration runner |
| `authenticated` | All logged-in users (PostgREST bridge + RLS) |
| `anon` | Unauthenticated (feedback form, public menu reads) |
| `service_role` | Backend service bypass (Go BE, cron jobs, webhook handlers) |

All tables in `public` must have explicit `GRANT SELECT/INSERT/UPDATE/DELETE ON ... TO authenticated, anon, service_role` — new tables added post-cutover must include these grants or RLS-blocked writes will silently return `{ data: null, error: null }`.

---

## §9 — Biggest DB-Exit Risk

**The realtime publication scope is 11 tables, not 4.** The plan §3.B was designed around 4 realtime tables (kds_tickets, kitchen_send_batches, branch_menu_item_daily_limits, pos_sessions). The actual publication contains 11 tables including high-frequency tables like `orders`, `payments`, `print_jobs`, `notifications`, and `printer_agents`. Each additional table requires:
1. A `pg_notify` trigger (DB side)
2. A dedicated Go LISTEN channel + fan-out logic
3. A FE subscription swap off `supabase.channel(...)`

This nearly triples the Phase 0.5 scope and is the **hardest cutover prerequisite** — the plan's 2–4 week estimate for Phase 0.5 should be revised upward. Recommend auditing each of the 11 tables for FE subscription call sites before committing to a cutover date.

---

*Generated from local container `comtammatu-db` + migration file analysis. Do not edit manually — re-run the §2 queries from `docs/plan/db-migration-supabase-to-postgres.md` after each major migration batch.*
