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

- NEVER apply migrations directly.
- Write the SQL migration file.
- Open a PR.
- Merge the PR.
- The owner applies the migration manually.
- After the migration is merged and applied, run `pnpm db:types`.

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
{ tenant_id: number, branch_id: number | null, user_role: StaffRole }
```

- ACL single source: `packages/shared/src/auth/module-acl.ts`.
- Do not create a second auth policy layer in UI helpers.

## Known Failure Patterns

- `"use client"` plus `@comtammatu/database` barrel import causes build failures.
- RLS can return no data and no error on blocked writes.
- TypeScript 6 packages using `process.env` need `"types": ["node"]` in tsconfig.
- Zod 4 uses `{ error: }`, not `{ message: }`; use `z.email()`, not `.email()`.
- PL/pgSQL `IF record IS NOT NULL` is true only when every column is non-null. Check a guaranteed non-null column or use `FOUND`.

Also read `tasks/regressions.md` before database/auth work.

