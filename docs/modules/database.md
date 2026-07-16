# Database Module

## Overview

Supabase client wrappers and auto-generated types. Four client variants serve
request-scoped server, privileged service, browser, and proxy contexts. Normal
application access goes through PostgREST with RLS; service-role code is an
explicit trusted bypass.

**Owner:** `packages/database/` + `supabase/migrations/`

## Components

| File                          | Purpose                                      | Runtime          |
| ----------------------------- | -------------------------------------------- | ---------------- |
| `src/supabase/server.ts`      | `createClient()` for RSC and Server Actions  | Node.js (server) |
| `src/supabase/client.ts`      | `createClient()` for "use client" components | Browser          |
| `src/supabase/service.ts`     | Service-role client for trusted jobs         | Node.js (server) |
| `src/supabase/middleware.ts`  | `updateSession()` for proxy.ts               | Edge             |
| `src/types/database.types.ts` | Auto-generated from Supabase schema          | Shared           |
| `src/index.ts`                | Shared database types                        | Shared           |

## Import Boundaries

This is the most critical constraint in the codebase. Violating it causes build failures.

| Context                 | Import                                     | Why                                     |
| ----------------------- | ------------------------------------------ | --------------------------------------- |
| Server Actions / RSC    | `@comtammatu/database/supabase/server`     | Request-scoped user client              |
| Privileged server code  | `@comtammatu/database/supabase/service`    | Intentional RLS bypass                  |
| proxy.ts                | `@comtammatu/database/supabase/middleware` | Session refresh boundary                |
| "use client" components | `@comtammatu/database/supabase/client`     | Cannot import `next/headers` in browser |

The root barrel is type-only. Runtime code must use the explicit subpath for its
execution context.

## Package Exports

Defined in `packages/database/package.json`:

```
.                    → src/index.ts (type-only shared exports)
./supabase/server    → src/supabase/server.ts
./supabase/client    → src/supabase/client.ts
./supabase/service   → src/supabase/service.ts
./supabase/middleware → src/supabase/middleware.ts
./types              → src/types/database.types.ts
```

## Schema — Current Shape

Source of truth: generated types for app-visible shape, current applied schema
for runtime behavior, and active migrations for authored changes. Do not keep
hand-written table/function counts here.

### DB Source-of-Truth Ladder

When facts disagree, trust the higher tier:

| Tier | Source                                          | What it tells you                                               |
| ---- | ----------------------------------------------- | --------------------------------------------------------------- |
| 1    | `packages/database/src/types/database.types.ts` | The shape currently usable from app code (post `pnpm db:types`) |
| 2    | Applied state of Preview/production DB          | What RLS, defaults, constraints actually enforce right now      |
| 3    | `supabase/migrations/*.sql`                     | What changes have been authored — file existence ≠ applied      |
| 4    | `docs/spec/database-schema.md`                  | Schema source ladder, migration layout, and status vocabulary   |
| 5    | Hand-written module docs                        | Narrative + design rationale; can lag the sources above         |

### Migration Status Vocabulary

Use these labels consistently when communicating migration state:

- **planned** — change discussed, no SQL written yet
- **drafted** — `.sql` file committed in `supabase/migrations/`, NOT yet applied
- **preview-applied** — migration applied to an on-demand Preview Branch
- **types generated** — `pnpm db:types` regenerated from the configured type-source schema
- **prod-applied** — migration applied to the production project under `database.md` rights
- **UI wired** — Server Actions / pages / RPCs are calling the new shape

A migration file dated AFTER today is normal — the file exists, but apply status is independent.

### Domain Groups

Tables are organized by domain. For per-table columns/constraints, read the migration that created the table or `database.types.ts` directly.

| Domain        | Representative tables                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth          | `permission_keys`, `positions`, `role_templates`, `staff_permissions`, `permission_audit_log`                                                                          |
| Tenant + IA   | `tenants`, `branches`, `profiles`, `system_settings`, `branch_attendance_config`                                                                                       |
| Menu          | `menu_categories`, `menu_items`, `menu_item_variants`, `menu_item_modifiers`, `menu_item_available_sides`                                                              |
| POS           | `pos_terminals`, `pos_sessions`, `branch_zones`, `tables`, `printer_configs`, `branch_menu_item_daily_limits`                                                          |
| Orders / KDS  | `orders`, `order_items`, `order_status_history`, `kds_stations`, `kds_station_categories`, `kds_tickets`                                                               |
| Payments      | `payments`, `payment_webhooks`, `refunds`                                                                                                                              |
| Inventory     | `ingredients`, `recipes`, `stock_levels`, `stock_movements`, `inventory_locations`, `stocktake_sessions`, `stocktake_lines`, `stock_transfers`, `stock_transfer_items` |
| Procurement   | `suppliers`, `purchase_orders`, `purchase_order_items`, `goods_received_notes`, `grn_items`, `supplier_invoices`, `supplier_returns`                                   |
| Production    | `production_recipes`, `production_runs` — writes are permission-, branch-, and RPC-gated                                                                                |
| Finance       | `tax_invoices`, `expenses`, `accounting_periods`                                                                                                                       |
| HR            | `employees`, `employment_contracts`, `shifts`, `attendance_records`, `payroll_periods`, `payroll_entries`                                                              |
| Print agent   | `print_jobs` (claim/complete/expire RPCs), `printer_configs`                                                                                                           |
| Trust / QC    | `branch_trusted_egress_ips`, `branch_override_codes`, `branch_override_attempts`, `inventory_qc_settings`                                                              |
| Notifications | `notifications`, `notification_reads`, `notification_outbox`, `branch_feature_flags`                                                                                   |

For the per-column / per-policy reference of a specific table, prefer reading the originating migration and generated types. Do not recreate hand-written schema dumps; they drift from generated types and applied database state.

## RLS Pattern

Most public application tables follow this pattern. Intentional exceptions such
as global catalogs, derived logs, and no-client-write tables must be justified by
their table policy.

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
    OR auth_role() = 'owner'
  );

-- 4. GRANT (mandatory — RLS without GRANT = silent block)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.{table} TO authenticated;
```

## Migration Conventions

Fresh/dev installs are baseline-first. `supabase/migrations/20260716093507_baseline.sql`
is the public+private schema install path; the managed surfaces (extensions, storage
policies, realtime, and cron) are folded into the chain as the forward migration
`supabase/migrations/20260716093508_fold_managed_surfaces.sql`, applied automatically.
Forward migrations live in `supabase/migrations/` with timestamp-prefixed
filenames after the baseline.

| Convention    | Default for new tenant-owned business entities                                                   |
| ------------- | ------------------------------------------------------------------------------------------------ |
| PK            | `BIGINT GENERATED ALWAYS AS IDENTITY`; auth UUID and natural/composite keys are valid exceptions |
| Money         | `NUMERIC(15,2)` unless the domain requires a different documented scale                          |
| Time          | `TIMESTAMPTZ` for instants                                                                       |
| Text          | `TEXT`                                                                                           |
| Unique        | Include tenant scope unless the key is intentionally global or parent-scoped                     |
| Apply         | Follow `docs/agent/rules/database.md`; every migration is T3                                     |
| After applied | Run `corepack pnpm db:types` when the type-source schema changed                                 |

## Security Functions (SECURITY DEFINER)

| Function                     | Purpose                           | Why DEFINER                                      |
| ---------------------------- | --------------------------------- | ------------------------------------------------ |
| `custom_access_token_hook()` | Inject claims into JWT            | Must read profiles during auth — RLS would block |
| `handle_new_user()`          | Create profile on signup          | Trigger runs before user has JWT                 |
| `update_my_profile()`        | Self-update safe fields           | Bypasses column-level restrictions safely        |
| `admin_update_profile()`     | Manager updates with scope checks | Implements role hierarchy logic in SQL           |

> Auth-bootstrap DEFINER functions only. Permission-management RPCs
> (`grant_permission`, `revoke_permission`, `apply_template_to_user`, …) are in
> [`auth.md`](auth.md); print-job claim/complete/expire RPCs are in the
> print-agent module. Every DEFINER function must pin a safe `search_path` and
> authorize explicitly.

## Failure Modes

| Failure                           | Signal                                 | Recovery                                   |
| --------------------------------- | -------------------------------------- | ------------------------------------------ |
| Missing GRANT on new table        | `{ data: null, error: null }` — silent | Add `GRANT ... TO authenticated`           |
| RLS policy missing                | Same silent null                       | Add RLS policy with tenant_id check        |
| Stale types after migration       | TypeScript errors on new columns       | Run `pnpm db:types`                        |
| Runtime DB import in "use client" | Browser/server boundary failure        | Use `@comtammatu/database/supabase/client` |

## Adding a New Table Checklist

1. Create migration: `supabase/migrations/{timestamp}_{name}.sql`
2. Add `tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE`
3. Enable RLS: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
4. Add policies (at minimum: tenant isolation for SELECT)
5. Add GRANTs: `GRANT SELECT, INSERT, UPDATE, DELETE ON ... TO authenticated`
6. Add tenant scope to business keys unless an explicit exception applies
7. Verify on a Preview Branch when runtime schema proof is needed
8. Follow the production apply rights and deploy ordering in `database.md`
9. Run `corepack pnpm db:types` after the type-source schema is applied
10. Run the repository verification gates
