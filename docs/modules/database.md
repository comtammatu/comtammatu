# Database Module

## Overview

Supabase client wrappers and auto-generated types. Four clients: request-scoped
server, privileged service, browser, proxy. App access via PostgREST + RLS;
service-role is an explicit trusted bypass.

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

| Context                 | Import                                     | Why                                     |
| ----------------------- | ------------------------------------------ | --------------------------------------- |
| Server Actions / RSC    | `@comtammatu/database/supabase/server`     | Request-scoped user client              |
| Privileged server code  | `@comtammatu/database/supabase/service`    | Intentional RLS bypass                  |
| proxy.ts                | `@comtammatu/database/supabase/middleware` | Session refresh boundary                |
| "use client" components | `@comtammatu/database/supabase/client`     | Cannot import `next/headers` in browser |

Root barrel is type-only. Runtime code must use the explicit subpath.

## Package Exports

`packages/database/package.json`: `.` → type-only; `./supabase/{server,client,service,middleware}`; `./types` → `database.types.ts`.

## Schema — Current Shape

SoT: generated types (app-visible), applied schema (runtime), migrations
(authored). Do not keep hand-written table/function counts here.

### DB Source-of-Truth Ladder

| Tier | Source                                                    | What it tells you                                               |
| ---- | --------------------------------------------------------- | --------------------------------------------------------------- |
| 1    | `packages/database/src/types/database.types.ts`           | Shape usable from app code (post `pnpm db:types`)               |
| 2    | Applied Production or owner-operated Preview Branch state | What RLS/defaults/constraints enforce now                       |
| 3    | `supabase/migrations/*.sql`                               | Authored changes — file existence ≠ applied                     |
| 4    | `docs/spec/database-schema.md`                            | Schema ladder, migration layout, status vocabulary              |
| 5    | Hand-written module docs                                  | Narrative; can lag tiers above                                  |

### Migration Status Vocabulary

- **planned** — discussed, no SQL
- **drafted** — `.sql` in `supabase/migrations/`, not applied
- **preview-applied** — on owner-operated Preview Branch
- **types generated** — `pnpm db:types` from type-source schema
- **prod-applied** — production under `database.md` rights
- **UI wired** — actions/pages/RPCs call the new shape

File date AFTER today is normal; apply status is independent.

### Domain Groups

For columns/constraints: originating migration or `database.types.ts`.

| Domain         | Representative tables |
| -------------- | --------------------- |
| Auth           | `permission_keys`, `positions`, `role_templates`, `staff_permissions`, `permission_audit_log` |
| Tenant + IA    | `tenants`, `branches`, `profiles`, `system_settings`, `branch_attendance_config` |
| Menu           | `menu_categories`, `menu_items`, variants/modifiers/sides |
| POS            | `pos_terminals`, `pos_sessions`, `branch_zones`, `tables`, `printer_configs`, daily limits |
| Orders / KDS   | `orders`, `order_items`, `order_status_history`, `kds_stations`, `kds_tickets` |
| Payments       | `payments`, `payment_webhooks`, `refunds` |
| Inventory      | `ingredients`, `recipes`, `stock_levels`, `stock_movements`, locations, stocktake, transfers |
| Procurement    | suppliers, POs, GRNs, `supplier_invoices`, returns |
| Production     | `production_recipes`, `production_runs` (permission/branch/RPC-gated) |
| Finance        | `tax_invoices`, `expenses`, `accounting_periods` |
| HR             | employees, contracts, shifts, attendance, payroll |
| Print agent    | `print_jobs`, `printer_configs` |
| Branch network | `branch_trusted_egress_ips` (POS/KDS/print gates; not Inventory QC) |
| Notifications  | `notifications`, reads, outbox, `branch_feature_flags` |

## RLS Pattern

No generic role predicate. Choose policy from table action/scope semantics.
Exceptions (global catalogs, derived logs, no-client-write) need table-level
justification. Pattern: `ENABLE RLS` → tenant + `has_permission` SELECT →
`GRANT` only exposed verbs. Full rules: `docs/agent/rules/database.md`.

## Migration Conventions

Baseline: `20260727120000_baseline.sql` + managed fold
`20260727120001_fold_managed_surfaces.sql`. Forward migrations timestamp-prefixed
after baseline.

| Convention    | Default                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------- |
| PK            | `BIGINT GENERATED ALWAYS AS IDENTITY` (UUID/natural/composite exceptions OK)             |
| Money         | `NUMERIC(15,2)` unless domain docs otherwise                                             |
| Time / Text   | `TIMESTAMPTZ` / `TEXT`                                                                   |
| Unique        | Include tenant scope unless intentionally global/parent-scoped                           |
| Apply         | `docs/agent/rules/database.md`; every migration is T3                                    |
| After applied | `corepack pnpm db:types` when type-source schema changed                                 |

## Security Functions (SECURITY DEFINER)

| Function                     | Purpose                        | Why DEFINER                                      |
| ---------------------------- | ------------------------------ | ------------------------------------------------ |
| `custom_access_token_hook()` | Inject claims into JWT         | Must read profiles during auth                   |
| `handle_new_user()`          | Create profile on signup       | Trigger before user has JWT                      |
| `update_my_profile()`        | Self-update safe fields        | Safe column bypass                               |
| `update_staff_profile()`     | Owner updates staff assignment | Atomic PBAC replace on assignment change         |

Auth-bootstrap DEFINER only. Permission RPCs → [`auth.md`](auth.md); print-job
RPCs → print-agent module. Every DEFINER must pin `search_path` and authorize.

## Failure Modes

| Failure                           | Signal                                 | Recovery                                   |
| --------------------------------- | -------------------------------------- | ------------------------------------------ |
| Missing GRANT on new table        | `{ data: null, error: null }` — silent | Add `GRANT ... TO authenticated`           |
| RLS policy missing                | Same silent null                       | Add RLS policy with tenant_id check        |
| Stale types after migration       | TypeScript errors on new columns       | Run `pnpm db:types`                        |
| Runtime DB import in "use client" | Browser/server boundary failure        | Use `@comtammatu/database/supabase/client` |

## Adding a New Table Checklist

1. Migration `supabase/migrations/{timestamp}_{name}.sql`
2. `tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE`
3. Enable RLS + policies (min: tenant isolation SELECT) + GRANTs
4. Tenant-scope business keys unless explicit exception
5. Verify Production (read rights) or owner Preview Branch for mutation proof
6. Follow `database.md` apply rights / deploy ordering
7. `corepack pnpm db:types` after type-source apply; run verify gates
