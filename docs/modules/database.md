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

Source of truth: generated types from the schema used by app code. Snapshot
generated from the current checkout on 2026-05-30 with
`node scripts/project-snapshot.mjs`:

- **118 tables**, **9 views**, **241 RPC/SQL functions**
- **2 active migration files** in `supabase/migrations/`: the baseline plus
  forward migrations
- **0 enums** — staff roles are strings carried in JWT claims; `position` is the
  canonical claim and `user_role` remains the compatibility claim

### DB Source-of-Truth Ladder

When facts disagree, trust the higher tier:

| Tier | Source                                          | What it tells you                                               |
| ---- | ----------------------------------------------- | --------------------------------------------------------------- |
| 1    | `packages/database/src/types/database.types.ts` | The shape currently usable from app code (post `pnpm db:types`) |
| 2    | Applied state of dev/prod DB                    | What RLS, defaults, constraints actually enforce right now      |
| 3    | `supabase/migrations/*.sql`                     | What changes have been authored — file existence ≠ applied      |
| 4    | `docs/spec/database-schema.md`                  | Schema source ladder, migration layout, and status vocabulary   |
| 5    | Hand-written module docs                        | Narrative + design rationale; can lag the sources above         |

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

| Domain        | Representative tables                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth          | `permission_keys`, `positions`, `role_templates`, `staff_permissions`, `permission_audit_log`                                                                          |
| Tenant + IA   | `tenants`, `branches`, `profiles`, `areas`, `area_branches`, `system_settings`, `branch_attendance_config`                                                             |
| Menu          | `menu_categories`, `menu_items`, `menu_item_variants`, `menu_item_modifiers`, `menu_item_available_sides`                                                              |
| POS           | `pos_terminals`, `pos_sessions`, `branch_zones`, `tables`, `printer_configs`, `branch_menu_item_daily_limits`                                                          |
| Orders / KDS  | `orders`, `order_items`, `order_status_history`, `kds_stations`, `kds_station_categories`, `kds_tickets`                                                               |
| Payments      | `payments`, `payment_webhooks`, `refunds`                                                                                                                              |
| Inventory     | `ingredients`, `recipes`, `stock_levels`, `stock_movements`, `inventory_locations`, `stocktake_sessions`, `stocktake_lines`, `stock_transfers`, `stock_transfer_items` |
| Procurement   | `suppliers`, `purchase_orders`, `purchase_order_items`, `goods_received_notes`, `grn_items`, `supplier_invoices`, `supplier_returns`                                   |
| Production    | `production_recipes`, `production_orders`, `production_order_items` — RLS also gates through `is_inventory_production_operator()`                                      |
| Finance       | `chart_of_accounts`, `journal_entries`, `journal_entry_lines`, `fiscal_periods`, `tax_invoices`, `vas_report_lines`, `audit_logs`                                      |
| HR            | `employees`, `employment_contracts`, `shifts`, `shift_assignments`, `attendance_records`, `payroll_periods`, `payroll_entries`                                         |
| Print agent   | `print_jobs` (claim/complete/expire RPCs), `printer_configs`                                                                                                           |
| Trust / QC    | `branch_trusted_egress_ips`, `branch_override_codes`, `branch_override_attempts`, `inventory_qc_settings`                                                              |
| Notifications | `notifications`, `branch_feature_flags`                                                                                                                                |

For the per-column / per-policy reference of a specific table, prefer reading the originating migration and generated types. Do not recreate hand-written schema dumps; they drift from generated types and applied database state.

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
    OR auth_role() IN ('owner', 'super_manager', 'area_manager')
  );

-- 4. GRANT (mandatory — RLS without GRANT = silent block)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.{table} TO authenticated;
```

## Migration Conventions

Fresh/dev installs are baseline-first. `supabase/migrations/00000000000000_baseline.sql`
is the public-schema install path; `supabase/managed-surfaces.install.sql` is the
privileged companion for extensions, storage policies, realtime, and cron.
Forward migrations live in `supabase/migrations/` with timestamp-prefixed
filenames after the baseline.

| Convention    | Rule                                                              |
| ------------- | ----------------------------------------------------------------- |
| PK            | `BIGINT GENERATED ALWAYS AS IDENTITY`                             |
| Money         | `NUMERIC(15,2)`                                                   |
| Time          | `TIMESTAMPTZ`                                                     |
| Text          | `TEXT` (never VARCHAR)                                            |
| Unique        | `UNIQUE(field, tenant_id)` — always composite                     |
| Apply         | NEVER before PR merge — owner runs the approved Supabase apply path after merge |
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
