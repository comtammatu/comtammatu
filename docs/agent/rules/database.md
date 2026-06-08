# Database, Supabase, Auth, And ACL Rules

Use this file before changing Supabase queries, migrations, RLS, auth, ACL, Server Actions, RPC functions, or generated database types.

## Query Boundary

- MUST use `supabase-js` for all queries.
- NEVER use Prisma.
- Server Actions and RSC may import `@comtammatu/database`.
- Client components may import only `@comtammatu/database/supabase/client`.
- Proxy and Edge code must import `@comtammatu/database/supabase/middleware`.

## Server Actions

- MUST validate all Server Action inputs with Zod schemas.
- NEVER return raw Supabase/Postgres `error.message` to clients.
- Treat blocked writes carefully: RLS may return `{ data: null, error: null }`.
- For multi-item atomic writes, create and call a Postgres RPC function instead of issuing multiple independent client writes.

## Migration Policy

- Write the SQL migration file before applying it.
- Agents MAY apply migrations directly on approved dev/test Supabase servers for verification.
- Before applying to dev/test, verify the target project/environment and confirm it is not production.
- NEVER apply migrations directly to production.
- Production flow: open a PR, merge the PR, then the owner applies the migration manually.
- After the migration is applied to the schema used for generated types, run `pnpm db:types`.

## DB Type Boundaries

- Money: `NUMERIC(15,2)`
- Time: `TIMESTAMPTZ`
- Primary keys: `BIGINT GENERATED ALWAYS AS IDENTITY`
- Text: `TEXT`, not `VARCHAR`

## RLS And Grants

- New tables need explicit `GRANT ... TO authenticated`.
- UNIQUE constraints must include tenant scope: `UNIQUE(field, tenant_id)`, not `UNIQUE(field)`.
- RLS permissive policies combine with OR. Avoid accidentally widening access with separate permissive policies.
- When writing self-scope plus admin-scope policies, gate admin-scope policies behind the correct permission check.

## Auth And ACL

- Auth hook MUST be `SECURITY DEFINER`, or JWT custom claims may silently fail.
- JWT claims are expected to include:

```ts
{
  tenant_id: number,
  branch_id: number | null,
  user_role: StaffRole,   // legacy-compat — positions.legacy_role_code
  position: string        // canonical — positions.code, "unassigned" if no row
}
```

The `position` claim was added in migration `20260423020000_auth_v2_m5_bridge.sql`.

- ACL single source: `packages/shared/src/auth/module-acl.ts`.
- Do not create a second auth policy layer in UI helpers.

## Intentional Exceptions (Do Not "Fix")

These are deliberate KEEPs in the lean HKD baseline. Do not relitigate or "correct" them without an owner decision:

- **`tenant_id` retained though single-tenant.** The business is one Hộ Kinh Doanh, but `tenant_id` stays on tenant-scoped tables as the canonical scope key (RLS predicate `tenant_id = auth_tenant_id()`, JWT claim). It is a deliberate scope mechanism, not dead multi-tenant scaffolding.
- **UNIQUE scope via FK transitivity.** The default rule is `UNIQUE(field, tenant_id)`. Some child tables omit an explicit `tenant_id` in a UNIQUE constraint when the parent FK already guarantees tenant scope transitively (e.g. a line table unique on `(parent_id, ...)` where `parent_id` is itself tenant-scoped). These are intentional exceptions to the composite-unique rule, not bugs.
- **`BMIDL-RLS-INTENTIONAL-ROLE-FASTPATH`.** `branch_menu_item_daily_limits` gates RLS via `auth_role()` (the JWT role fast-path), **not** `has_permission()`. This is intentional: the table is non-destructive and read-mostly, so the ~1h stale-revoke window of the role fast-path is acceptable. Use `has_permission()` only for destructive/instant-revoke gates (see `docs/modules/auth.md` → "RLS Gate Choice"). Do not migrate BMIDL to `has_permission()`.

## Known Failure Patterns

- `"use client"` plus `@comtammatu/database` barrel import causes build failures.
- RLS can return no data and no error on blocked writes.
- TypeScript 6 packages using `process.env` need `"types": ["node"]` in tsconfig.
- Zod 4 uses `{ error: }`, not `{ message: }`; use `z.email()`, not `.email()`.
- PL/pgSQL `IF record IS NOT NULL` is true only when every column is non-null. Check a guaranteed non-null column or use `FOUND`.

Also read `tasks/regressions.md` before database/auth work.
