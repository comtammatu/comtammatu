# Database Module

## Overview

Supabase client wrappers and auto-generated types. Three client variants serve different runtime contexts (server, client, middleware). All data access goes through PostgREST with Row-Level Security enforced by JWT claims.

**Owner:** `packages/database/` + `supabase/migrations/`

## Components

| File                          | Purpose                                      | Runtime          |
| ----------------------------- | -------------------------------------------- | ---------------- |
| `src/supabase/server.ts`      | `createClient()` for RSC and Server Actions  | Node.js (server) |
| `src/supabase/client.ts`      | `createClient()` for "use client" components | Browser          |
| `src/supabase/middleware.ts`  | `updateSession()` for proxy.ts               | Edge             |
| `src/types/database.types.ts` | Auto-generated from Supabase schema          | Shared           |
| `src/index.ts`                | Barrel export (server-safe only)             | Server           |

## Import Boundaries

This is the most critical constraint in the codebase. Violating it causes build failures.

| Context                 | Import                                     | Why                                     |
| ----------------------- | ------------------------------------------ | --------------------------------------- |
| Server Actions / RSC    | `@comtammatu/database` (barrel)            | Full access, server-only                |
| proxy.ts / Edge         | `@comtammatu/database/supabase/middleware` | No Node.js deps allowed in Edge         |
| "use client" components | `@comtammatu/database/supabase/client`     | Cannot import `next/headers` in browser |

**Never import the barrel (`@comtammatu/database`) in "use client" files.** The barrel re-exports server.ts which imports `next/headers` — this crashes the Turbopack build.

## Package Exports

Defined in `packages/database/package.json`:

```
.                    → src/index.ts (barrel — server only)
./supabase           → src/supabase/index.ts
./supabase/server    → src/supabase/server.ts
./supabase/client    → src/supabase/client.ts
./supabase/middleware → src/supabase/middleware.ts
./types              → src/types/database.types.ts
```

## Schema — Current Shape

Source of truth: generated types from the live schema. Lean HKD baseline
(`supabase/migrations/00000000000000_baseline.sql`; regenerate exact counts with
`node scripts/project-snapshot.mjs`):

- **59 tables**, **9 views**, **213 functions**
- **2 active migration files** (lean baseline + forward) in `supabase/migrations/`
- **0 enums** — `staff_role` ENUM was dropped (Auth cleanup, 2026-04-23); roles are now strings derived from `positions.legacy_role_code` (lean roles: `owner`, `manager`, `staff`, `chef`)
- `tenant_id` retained on tenant-scoped tables as the deliberate single-tenant scope key (RLS predicate + JWT claim)

### DB Source-of-Truth Ladder

When facts disagree, trust the higher tier:

| Tier | Source                                                               | What it tells you                                               |
| ---- | -------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1    | `packages/database/src/types/database.types.ts`                      | The shape currently usable from app code (post `pnpm db:types`) |
| 2    | Applied state of dev/prod DB                                         | What RLS, defaults, constraints actually enforce right now      |
| 3    | `supabase/migrations/*.sql`                                          | What changes have been authored — file existence ≠ applied      |
| 4    | Hand-written docs (`docs/modules/*`, `docs/spec/database-schema.md`) | Narrative + design rationale; lags 1-3 by definition            |

### Migration Status Vocabulary

Use these labels consistently when communicating migration state:

- **planned** — change discussed, no SQL written yet
- **drafted** — `.sql` file committed in `supabase/migrations/`, NOT yet applied
- **applied to dev** — `supabase db push` ran on the dev project; live RLS/columns may differ from prod
- **types generated** — `pnpm db:types` regenerated `database.types.ts` from the dev DB
- **prod-applied** — owner ran the migration on the prod Supabase project
- **UI wired** — Server Actions / pages / RPCs are calling the new shape

A migration file dated AFTER today is normal — the file exists, but apply status is independent.

### Domain Groups

Tables are organized by domain. For per-table columns/constraints, read the migration that created the table or `database.types.ts` directly.

| Domain          | Representative tables (lean HKD baseline)                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Auth            | `permission_keys`, `positions`, `staff_permissions` — roles: owner/manager/staff/chef                                                  |
| Tenant + IA     | `tenants`, `branches` (flat / peer), `profiles`, `system_settings`, `branch_attendance_config`, `branch_feature_flags` — no `area`     |
| Menu            | `menu_categories`, `menu_items`, `menu_item_variants`, `menu_item_modifiers`, `menu_item_available_sides`                              |
| POS             | `pos_terminals`, `pos_sessions`, `branch_zones`, `tables`, `printers`, `branch_menu_item_daily_limits`                                 |
| Orders / KDS    | `orders`, `order_items` (item-level discount columns), `order_status_history`, `kds_stations`, `kds_station_categories`, `kds_tickets`, `kitchen_send_batches` |
| Payments / HĐĐT | `payments`, `webhook_events`, `refunds`, `tax_invoices`, `tax_invoice_orders`, `tax_invoice_events`                                    |
| Inventory (lean)| `ingredients`, `stock_levels`, `stock_movements`, `goods_received_notes`, `grn_items`, `stocktake_sessions`, `stocktake_lines` — no transfers / production / recipes / sub-locations / PO / QC / waste |
| Supplier debt   | `suppliers`, `supplier_invoices`, `supplier_payments`, `cash_entries`                                                                  |
| Scheduling / HR | `employees`, `shifts`, `shift_assignments`, `shift_requests`, `attendance_records`, `payroll_periods`, `payroll_entries` (rollup only) |
| Print agent     | `print_jobs` (claim/complete/expire RPCs), `printers`, `printer_agents`                                                                |
| Plumbing        | `notifications`, `audit_logs`, `archive_run_log`, `reconcile_run_log`, `summary_run_queue`, `order_daily_counters`                     |

For the per-column / per-policy reference of a specific table, prefer reading the originating migration and generated types. Do not recreate hand-written schema dumps; they drift from generated types and applied database state.

> **`BMIDL-RLS-INTENTIONAL-ROLE-FASTPATH`:** `branch_menu_item_daily_limits` gates RLS via the JWT `auth_role()` fast-path, **not** `has_permission()`. This is intentional (non-destructive, read-mostly table; ~1h stale-revoke window acceptable). Do not "fix" it to `has_permission()`. See `docs/agent/rules/database.md` → Intentional Exceptions.

## RLS Pattern

Every table follows this pattern:

```sql
-- 1. Enable RLS
ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY;

-- 2. Tenant isolation (mandatory)
CREATE POLICY "Tenant isolation" ON public.{table}
  FOR SELECT USING (tenant_id = auth_tenant_id());

-- 3. Branch scoping (where applicable)
CREATE POLICY "Branch scope" ON public.{table}
  FOR SELECT USING (
    branch_id = auth_branch_id()
    OR auth_role() IN ('owner', 'manager')
  );

-- 4. GRANT (mandatory — RLS without GRANT = silent block)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.{table} TO authenticated;
```

## Migration Conventions

Migrations live in `supabase/migrations/` with timestamp-prefixed filenames.

| Convention    | Rule                                                              |
| ------------- | ----------------------------------------------------------------- |
| PK            | `BIGINT GENERATED ALWAYS AS IDENTITY`                             |
| Money         | `NUMERIC(15,2)`                                                   |
| Time          | `TIMESTAMPTZ`                                                     |
| Text          | `TEXT` (never VARCHAR)                                            |
| Unique        | `UNIQUE(field, tenant_id)` — always composite                     |
| Apply         | NEVER before PR merge — owner runs `supabase db push` after merge |
| After applied | Run `pnpm db:types` to regenerate types                           |

## Security Functions (SECURITY DEFINER)

| Function                     | Purpose                           | Why DEFINER                                      |
| ---------------------------- | --------------------------------- | ------------------------------------------------ |
| `custom_access_token_hook()` | Inject claims into JWT            | Must read profiles during auth — RLS would block |
| `handle_new_user()`          | Create profile on signup          | Trigger runs before user has JWT                 |
| `update_my_profile()`        | Self-update safe fields           | Bypasses column-level restrictions safely        |
| `admin_update_profile()`     | Manager updates with scope checks | Implements role hierarchy logic in SQL           |

## Failure Modes

| Failure                       | Signal                                 | Recovery                                         |
| ----------------------------- | -------------------------------------- | ------------------------------------------------ |
| Missing GRANT on new table    | `{ data: null, error: null }` — silent | Add `GRANT ... TO authenticated`                 |
| RLS policy missing            | Same silent null                       | Add RLS policy with tenant_id check              |
| Stale types after migration   | TypeScript errors on new columns       | Run `pnpm db:types`                              |
| Barrel import in "use client" | Turbopack build error                  | Switch to `@comtammatu/database/supabase/client` |

## Adding a New Table Checklist

1. Create migration: `supabase/migrations/{timestamp}_{name}.sql`
2. Add `tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE`
3. Enable RLS: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
4. Add policies (at minimum: tenant isolation for SELECT)
5. Add GRANTs: `GRANT SELECT, INSERT, UPDATE, DELETE ON ... TO authenticated`
6. Add unique constraints composite with tenant_id
7. Push branch → create PR → merge
8. Owner runs `supabase db push` after merge
9. Run `pnpm db:types` (after migration applied)
10. Verify: `pnpm typecheck && pnpm build`
