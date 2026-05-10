# Engineering Rules

Use this file for repo-wide engineering constraints, commands, architecture, imports, routing, and runtime boundaries.

## Commands

```bash
pnpm dev          # Start dev server (Turbopack)
pnpm build        # Production build
pnpm typecheck    # Type checking across all packages
pnpm lint         # ESLint
pnpm db:types     # Regenerate Supabase types after migration is applied to the type source schema
```

## Core Constraints

- MUST use TypeScript strict mode. `noUncheckedIndexedAccess: true`
- MUST use `supabase-js` for all queries. NEVER Prisma.
- MUST validate all Server Action inputs with Zod schemas.
- MUST run `pnpm typecheck && pnpm lint && pnpm build` before marking implementation tasks complete.
- NEVER return raw Supabase/Postgres `error.message` to clients.
- NEVER import `@comtammatu/database` barrel in `"use client"` components.
- NEVER store scope in `localStorage` or React Context. Scope belongs in URL params only.
- Multi-item atomic writes MUST use a Postgres RPC function.
- Agents MAY apply migrations directly on approved dev/test Supabase servers only, after verifying the target environment.
- NEVER apply migrations directly to production. Production flow: write migration file → PR → merge → owner applies manually.
- After SQL migration is applied to the schema used for generated types, run `pnpm db:types`.
- ACL single source: `packages/shared/src/auth/module-acl.ts`.
- NEVER add agent notes, dev commit notes, implementation explanations, or internal commentary to project UI.
- Put durable explanations, guides, operational notes, and task notes in Markdown docs, guides, or note files inside the source tree.

## Architecture

```text
Browser → proxy.ts (auth + ACL) → App Router → Supabase (PostgREST + Auth)
```

Production may split public feedback onto `NEXT_PUBLIC_FEEDBACK_HOST`; proxy host-gates `/r/*` before auth and blocks admin/POS paths on the feedback origin.

Next.js 16.2 | React 19.2 | TypeScript 6.0 | Tailwind 4.2 | Zod 4 | Turborepo 2.9 | Node >= 24

## Import Boundaries

- Server Actions / RSC: `@comtammatu/database` full barrel.
- Proxy / Edge: `@comtammatu/database/supabase/middleware`.
- Client `"use client"` components: `@comtammatu/database/supabase/client` only. NEVER use the full barrel.

## URL Structure

```text
/admin/*              → Tenant-level management (manager+ roles)
/br/[branchId]/pos    → POS (cashier/waiter)
/br/[branchId]/kds    → KDS (chef)
/portal               → Universal post-login work destination (all staff)
/employee             → Employee self-service (all staff)
/login                → Auth
```

## Proxy

Next.js 16 proxy file: `apps/web/proxy.ts`

Required export:

```ts
export function proxy(request: NextRequest) {
  // auth + ACL
}
```

## JWT Claims

```ts
{ tenant_id: number, branch_id: number | null, user_role: StaffRole }
```

## Code Navigation Graph

If `.context-graph/NAV.md` exists, read it before broad code searches. It maps functions, types, variables, and file references for faster navigation.

```bash
# Regenerate after code changes:
context-graph analyze . --format claude-md
context-graph index > .context-graph/NAV.md

# Find dead/isolated code:
context-graph dead

# Interactive visualization:
context-graph serve --port 3333
```

Use `rg` or `rg --files` for normal text and file searches when available.
