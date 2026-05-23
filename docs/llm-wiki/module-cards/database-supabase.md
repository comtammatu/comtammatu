# Module Card — Database & Supabase

## Current State

Generated DB types show the current app-facing schema:

- 115 public tables.
- 9 public views.
- 214 public functions.
- 337 migration files.

Use generated types and applied DB state over old hand-written schema docs.

## Core Files

- `packages/database/src/types/database.types.ts`
- `packages/database/src/supabase/server.ts`
- `packages/database/src/supabase/client.ts`
- `packages/database/src/supabase/middleware.ts`
- `supabase/migrations/*.sql`
- `scripts/gen-types.mjs`

## Client Boundaries

| Context | Import |
| --- | --- |
| RSC / Server Actions | `@comtammatu/database` |
| Proxy / Edge | `@comtammatu/database/supabase/middleware` |
| `"use client"` | `@comtammatu/database/supabase/client` |

Never import the database barrel in a client component.

## DB Source-Of-Truth Ladder

1. `packages/database/src/types/database.types.ts`.
2. Applied dev/prod DB state.
3. Migration files.
4. Hand-written docs.

Migration file existence does not mean the migration is applied. After applying a migration to the schema used for type generation, run `pnpm db:types`.

## Domain Groups

Representative domains:

- Auth v2: `permission_keys`, `positions`, `role_templates`, `staff_permissions`, `permission_audit_log`.
- Tenant/site: `tenants`, `branches`, `areas`, `area_branches`, `system_settings`.
- POS/orders/KDS: `pos_sessions`, `pos_terminals`, `orders`, `order_items`, `kds_tickets`.
- Payment/refunds: `payments`, `payment_webhooks`, `refunds`, `webhook_events`.
- Inventory/procurement/production: `ingredients`, `stock_movements`, `inventory_locations`, `purchase_orders`, `goods_received_notes`, `supplier_invoices`, `production_orders`.
- Finance: `chart_of_accounts`, `journal_entries`, `fiscal_periods`, `tax_invoices`, `audit_logs`.
- HR: `employees`, `employment_contracts`, `shifts`, `attendance_records`, `payroll_periods`, `payroll_entries`.
- Print/network: `print_jobs`, `printer_configs`, `printer_agents`, `branch_trusted_egress_ips`.

## Critical Rules

- Use Supabase JS, never Prisma.
- RLS plus explicit `GRANT` is mandatory.
- Multi-item atomic writes must use Postgres RPCs.
- Never expose raw DB error messages to clients.
- Materialized views do not inherit RLS; expose through SECURITY DEFINER RPCs with tenant/branch checks.
- Any GL-affecting mutation needs DB/RPC-level period guard, not only action-layer checks.

## What To Do Next

For DB work:

1. Read `docs/agent/rules/database.md`.
2. Check existing RPCs and migrations before adding schema.
3. Apply only to approved dev/test environments.
4. Run `pnpm db:types` after apply.
5. Run full implementation verification before marking complete.
