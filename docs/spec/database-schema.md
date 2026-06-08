# Database Schema Source Of Truth

This file is the current orientation point for database schema work. It is not
a hand-maintained per-column schema dump.

## Current Snapshot — Lean HKD Baseline

The canonical DB is the **Hộ Kinh Doanh lean baseline**. Counts below are from
`supabase/migrations/00000000000000_baseline.sql`; regenerate exact figures with
`node scripts/project-snapshot.mjs` after `pnpm db:types`.

| Area                                        | Count |
| ------------------------------------------- | ----: |
| Public tables (baseline.sql)                |    59 |
| Public views (baseline.sql)                 |     9 |
| Public functions (baseline.sql)             |   213 |
| Public enums                                |     0 |
| Active SQL migration files                  |     2 |

`tenant_id` is **retained on purpose**: the business is a single Hộ Kinh Doanh, but
`tenant_id` remains the canonical RLS/JWT scope key (single-tenant, deliberate KEEP —
not leftover multi-tenant scaffolding). Realtime publication membership now lives in the
baseline itself (not a separate managed step).

The pre-lean hand-written table-by-table reference has been removed. Use the source
ladder below instead of resurrecting stale schema dumps.

### What changed vs the pre-lean track

The old in-place track carried ~118 tables. The lean baseline **cut**: GL/journal/COA/VAS
reporting + fiscal periods, the payroll engine (BHXH/PIT calc + payslip generation), heavy
inventory (transfers, issues, waste, production orders/recipes, purchase orders, QC, ABC,
inventory_locations sub-locations), perpetual sale-deduction recipes, feedback/CRM/trust,
and `area` / `area_branches` (+ `area_manager`). It **re-added / kept deliberately**:
item-level discount columns on order items, lean scheduling (`shift_assignments`,
`shift_requests`, `shifts`), supplier debt (`supplier_invoices` / `supplier_payments`),
cash-book (`cash_entries`), attendance, and HĐĐT (`tax_invoices*`).

## Migration layout (lean baseline)

- `supabase/migrations/00000000000000_baseline.sql` — the **lean HKD baseline** (59 tables,
  self-contained, replay-from-empty verified).
- `supabase/managed-surfaces.install.sql` — extensions / storage buckets + RLS / cron
  companion applied after the baseline on a fresh env.

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

Current high-level groups (lean HKD baseline):

- Auth and permissions (`permission_keys`, `positions`, `staff_permissions`).
- Tenant, branch (flat / peer), and staff identity (`tenants`, `branches`, `profiles`, `employees`). No `area`.
- Menu, POS, orders, KDS (`menu_*`, `orders`, `order_items` incl. item discount, `kds_*`, `pos_*`).
- Payments, refunds, webhooks, HĐĐT (`payments`, `refunds`, `webhook_events`, `tax_invoice*`, `tax_invoices`).
- Lean inventory: `ingredients`, `suppliers`, `goods_received_notes` / `grn_items`, `stock_levels`, `stock_movements`, `stocktake_sessions` / `stocktake_lines`. No transfers / production / QC / waste / PO / recipes / sub-locations.
- Supplier debt and cash-book (`supplier_invoices`, `supplier_payments`, `cash_entries`).
- Scheduling and attendance (`shifts`, `shift_assignments`, `shift_requests`, `attendance_records`, `branch_attendance_config`). Lean payroll rollup only (`payroll_periods`, `payroll_entries`) — no BHXH/PIT engine.
- Print agent (`printers`, `printer_agents`, `print_jobs`, `pos_terminals`).
- Notifications, system settings, audit, and run-log/queue plumbing (`notifications`, `system_settings`, `audit_logs`, `*_run_log`, `summary_run_queue`).

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
