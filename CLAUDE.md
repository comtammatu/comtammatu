# Cơm Tấm Má Tư — Restaurant Management System

Single-tenant multi-branch for Cơm Tấm Má Tư CTCP. Hierarchy: `Tenant (L0) → Branch (L1)`.

## Working Principles

> "Minimum code that solves the problem. Nothing speculative."
> "Touch only what you must. Clean up only your own mess."

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
- After SQL migration applied → `pnpm db:types` to regenerate types
- Claude applies migrations via `supabase db push` (or equivalent) — write file → apply → regen types. Owner does NOT apply manually
- ACL single source: route-level = `packages/shared/src/auth/module-acl.ts`; row-level = `staff_permissions` table + `has_permission(branch, key)` SQL helper (Auth v2). Permission key catalog = `packages/shared/src/auth/permissions.ts`

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

## Code Navigation Graph

**Read `.context-graph/NAV.md` before grepping.** It maps 931 nodes (functions, types, variables) across 296 files with file:line references. Use it for O(1) navigation instead of O(n) grep scans.

```bash
# Regenerate after code changes:
context-graph analyze . --format claude-md
context-graph index > .context-graph/NAV.md

# Find dead/isolated code:
context-graph dead

# Interactive visualization:
context-graph serve --port 3333
```

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

## Team Workflow — 4-Agent Debate Protocol

Every task MUST go through all 4 agents before implementation. No exceptions.

### Team Roles

| Role           | Agent Type                   | Responsibility                                                                                                                       |
| -------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **PM**         | `oh-my-claudecode:planner`   | Scope, priority, acceptance criteria, timeline. Asks "should we build this?" and "what's the MVP?"                                   |
| **BA**         | `oh-my-claudecode:analyst`   | Requirements analysis, business logic validation, edge cases, data flow. Asks "what are the rules?" and "what can go wrong?"         |
| **Senior Dev** | `oh-my-claudecode:architect` | Architecture, code design, implementation plan, tech debt assessment. Asks "how should we build this?" and "does it fit the system?" |
| **QA/QC**      | `oh-my-claudecode:critic`    | Test strategy, acceptance verification, regression check, quality gates. Asks "how do we know it works?" and "what could break?"     |

### Mandatory Workflow

For EVERY task (feature, bug fix, refactor):

#### Phase 1: Debate (parallel agents)

Spawn all 4 agents in parallel with the task description. Each agent reviews from their perspective and returns:

- **PM**: Scope decision (in/out), acceptance criteria, priority assessment
- **BA**: Business rules, edge cases, data flow analysis, requirement gaps
- **Senior Dev**: Architecture fit, implementation approach, risk assessment, affected files
- **QA/QC**: Test plan, regression risks, quality gates, verification steps

#### Phase 2: Synthesis

After all 4 agents respond, synthesize their findings:

1. List all agreements (all 4 agree)
2. List all conflicts (agents disagree) — resolve each explicitly
3. Produce a unified task contract with:
   - Scope (from PM)
   - Business rules (from BA)
   - Implementation plan (from Senior Dev)
   - Test plan (from QA/QC)

#### Phase 3: Implementation

Execute the unified plan. Senior Dev implements, following the agreed architecture.

#### Phase 4: Verification

Before marking complete:

1. `pnpm typecheck && pnpm lint && pnpm build` MUST pass
2. QA/QC agent reviews the diff for correctness
3. BA agent verifies business rules are met
4. PM agent confirms acceptance criteria satisfied

### Agent Prompt Templates

When spawning agents, include this context:

- Current task description
- Relevant files (from codebase)
- `CLAUDE.md` constraints
- `tasks/regressions.md` rules
- Any related docs from `docs/`

### Skip Conditions

The ONLY time you may skip the 4-agent debate:

- Typo fixes (< 3 lines changed)
- Documentation-only changes
- Dependency version bumps

Everything else goes through all 4 agents.
