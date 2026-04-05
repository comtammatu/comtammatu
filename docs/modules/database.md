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

## Schema (Sprint 1 complete)

11 tables with tenant isolation:

| Table                       | RLS                       | Purpose                                     | Since  |
| --------------------------- | ------------------------- | ------------------------------------------- | ------ |
| `tenants`                   | tenant_id match           | CTCP legal entity                           | v0.1.0 |
| `branches`                  | tenant_id match           | Physical locations                          | v0.1.0 |
| `profiles`                  | role-aware scoping        | Staff accounts (mutations via RPCs only)    | v0.1.0 |
| `system_settings`           | owner/super_manager write | Tenant-scoped key/value config              | S1-S2  |
| `menu_categories`           | manager+ write            | Menu category grouping                      | S1-S4  |
| `menu_items`                | manager+ write            | Menu items with base price                  | S1-S4  |
| `menu_item_variants`        | manager+ write            | Size/portion variants with price adjustment | S1-S4  |
| `menu_item_modifiers`       | manager+ write            | Add-on modifiers (extra toppings, etc.)     | S1-S4  |
| `menu_item_available_sides` | manager+ write            | Junction: which sides pair with which mains | S1-S4  |
| `branch_zones`              | manager+ write            | Dining zones per branch (Tầng 1, Sân vườn)  | S1-S5  |
| `tables`                    | manager+ write            | Physical tables with zone, capacity, status | S1-S5  |

Full schema reference: `docs/spec/database-schema.md`

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

<!-- ORACLE-META
Written by codebase-oracle (manual) | 2026-04-02
Data: Direct source reading
Audience: new engineer, feature owner | Confidence: 95%
Updated: Sprint 1 S6 complete (2026-04-03)
Unknowns: 0
-->
