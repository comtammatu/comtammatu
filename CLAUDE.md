# Cơm Tấm Má Tư — Restaurant Management System

Single-tenant multi-branch for Cơm Tấm Má Tư CTCP. Hierarchy: `Tenant (L0) → Branch (L1)`.

## Commands

```bash
pnpm dev          # Start dev server (Turbopack)
pnpm build        # Production build
pnpm typecheck    # Type checking across all packages
pnpm lint         # ESLint
pnpm db:types     # Regenerate Supabase types (after migration merged & applied)
```

## Constraints

- MUST use TypeScript strict mode. `noUncheckedIndexedAccess: true`
- MUST use supabase-js for all queries. NEVER Prisma
- MUST validate all Server Action inputs with Zod schemas
- MUST run `pnpm typecheck && pnpm lint && pnpm build` before marking task complete
- NEVER return raw Supabase/Postgres error.message to client
- NEVER import `@comtammatu/database` barrel in "use client" components
- NEVER store scope in localStorage/Context — URL params only
- Multi-item atomic writes → Postgres RPC function
- After SQL migration merged & applied → `pnpm db:types`
- NEVER apply migrations directly — write file → PR → merge → owner applies manually
- ACL single source: `packages/shared/src/auth/module-acl.ts`

## Architecture

```
Browser → proxy.ts (auth + ACL) → App Router → Supabase (PostgREST + Auth)
```

Next.js 16.2 | React 19.2 | TypeScript 6.0 | Tailwind 4.2 | Zod 4 | Turborepo 2.9 | Node >= 24

### Import Boundaries

- **Server Actions / RSC:** `@comtammatu/database` (full barrel)
- **Proxy / Edge:** `@comtammatu/database/supabase/middleware`
- **Client ("use client"):** `@comtammatu/database/supabase/client` (NEVER barrel)

### URL Structure

```
/admin/*              → Tenant-level management (manager+ roles)
/br/[branchId]/pos    → POS (cashier/waiter)
/br/[branchId]/kds    → KDS (chef)
/employee             → Employee portal (all staff)
/login                → Auth
```

### Proxy (Next.js 16)

File: `apps/web/proxy.ts` — export `proxy(request: NextRequest)`

### JWT Claims

```ts
{ tenant_id: number, branch_id: number | null, user_role: StaffRole }
```

## DB Type Boundaries

Money: `NUMERIC(15,2)` | Time: `TIMESTAMPTZ` | PK: `BIGINT GENERATED ALWAYS AS IDENTITY` | Text: `TEXT` (no VARCHAR)

## Things That Will Bite You

- "use client" + barrel import → build explodes. Use `/supabase/client` directly
- RLS returns `{ data: null, error: null }` on blocked writes — no error thrown
- Auth hook MUST be SECURITY DEFINER or JWT gets no custom claims (silent fail)
- New tables need explicit `GRANT ... TO authenticated`
- UNIQUE constraints: `UNIQUE(field, tenant_id)` not `UNIQUE(field)`
- TypeScript 6: packages using `process.env` need `"types": ["node"]` in tsconfig
- Zod 4: `{ message: }` → `{ error: }`, `.email()` → `z.email()`

## References

### System overview (read first for onboarding)

- Codebase map + module index: `docs/CODEBASE_MAP.md`
- Auth & ACL (roles, JWT, proxy, RLS): `docs/modules/auth.md`
- Database (clients, types, migrations, RLS patterns): `docs/modules/database.md`
- Web App (routes, layouts, server actions): `docs/modules/web-app.md`
- UI (shadcn components, styling): `docs/modules/ui.md`
- Security (rate limiting): `docs/modules/security.md`
- Infrastructure (monorepo, build, deploy): `docs/modules/infrastructure.md`

### Planning & specs

- Roadmap + phases: `docs/plan/roadmap.md`
- M2-Ext POS order lifecycle (planned): `docs/plan/m2-order-lifecycle.md`
- Architecture decisions: `docs/plan/decisions.md`
- System architecture: `docs/spec/architecture.md`
- Database schema: `docs/spec/database-schema.md`

### Business domain

- CTCP business context: `docs/ref/business-context.md`
- Setup guide: `docs/ref/setup.md`
- HĐĐT & Thuế GTGT: `docs/ref/einvoice-tax.md`
- Hợp đồng lao động: `docs/ref/labor-contracts.md`
- Kho hàng (Inventory): `docs/ref/inventory.md`
- Thuế TNCN & Lương: `docs/ref/payroll-pit.md`

### Meta-learning

- Regression rules: `tasks/regressions.md`
- Lessons learned: `tasks/lessons.md`
- Current tasks: `tasks/todo.md`
