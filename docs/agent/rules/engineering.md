# Engineering Rules

Use this file for repo-wide engineering constraints, commands, architecture, imports, routing, and runtime boundaries.

## Commands

<!-- MIRROR:commands:begin — synced copy; edit BOTH AGENTS.md and docs/agent/rules/engineering.md. -->

```bash
pnpm dev          # Start dev server (Turbopack)
pnpm build        # Production build
pnpm typecheck    # Type checking across all packages
pnpm lint         # Repo guard checks (copy, db-boundary, ui-contract, client-storage, rules-mirror, guard-sync) + ESLint
pnpm test         # Test suites (turbo test)
pnpm verify       # Full gate: deps audit + baseline hygiene + typecheck + lint + build + test
pnpm db:types     # Regenerate Supabase types after migration is applied to the type source schema
```

<!-- MIRROR:commands:end -->

## Core Constraints

<!-- MIRROR:constraints:begin — intentional synced copy in AGENTS.md and docs/agent/rules/engineering.md (other agents auto-load only their entrypoint). Edit BOTH identically; `pnpm lint:rules-mirror` enforces. -->

- MUST use TypeScript strict mode. `noUncheckedIndexedAccess: true`
- MUST use `supabase-js` for all queries. NEVER Prisma.
- MUST validate all Server Action inputs with Zod schemas.
- MUST run `pnpm typecheck && pnpm lint && pnpm build` before marking implementation tasks complete.
- NEVER return raw Supabase/Postgres `error.message` to clients.
- NEVER import `@comtammatu/database` barrel in `"use client"` components.
- NEVER store scope in `localStorage` or React Context. Scope belongs in URL params only.
- Multi-item atomic writes MUST use a Postgres RPC function.
- Agents MAY apply migrations directly on approved dev/test Supabase servers only, after verifying the target ref against the Environment Registry in `docs/agent/rules/database.md`.
- NEVER apply migrations directly to production. Production flow: write migration file → PR → merge → owner applies manually.
- After SQL migration is applied to the schema used for generated types, run `pnpm db:types`.
- ACL single source: `packages/shared/src/auth/module-acl.ts`.
- NEVER add agent notes, dev commit notes, implementation explanations, or internal commentary to project UI.
- NEVER leave tombstone or provenance notes about deleted code, files, flows, or projects — in code comments, docs, or SQL. Delete cleanly; git history is the record.
- Code comments MUST be English and only state non-obvious constraints. NEVER add narrative, explanatory, or change-log comments (no "đã xóa/đã gỡ", no owner-decision dates in code).
- Put durable explanations, guides, operational notes, and task notes in Markdown docs, guides, or note files inside the source tree.
- MUST follow `docs/agent/rules/skills.md` for skill/plugin/tool selection on non-trivial tasks.
- NEVER create a separate agent-only documentation tree such as `docs/llm-wiki/`; use `AGENTS.md`, `docs/agent/rules/`, `docs/CODEBASE_MAP.md`, module docs, specs, runbooks, tasks, or worklogs according to the content type.

<!-- MIRROR:constraints:end -->

## Architecture

<!-- MIRROR:architecture:begin — synced copy; edit BOTH AGENTS.md and docs/agent/rules/engineering.md. -->

```text
Browser → proxy.ts (auth + ACL) → App Router → Supabase (PostgREST + Auth)
Printing → apps/print-agent (Node daemon, polls print_jobs) → ESC/POS LAN printers
```

Next.js 16.2 | React 19.2 | TypeScript 6.0 | Tailwind 4.2 | Zod 4 | Turborepo 2.9 | Node >= 24

<!-- MIRROR:architecture:end -->

## Import Boundaries

- Server Actions / RSC: `@comtammatu/database` full barrel.
- Proxy / Edge: `@comtammatu/database/supabase/middleware`.
- Client `"use client"` components: `@comtammatu/database/supabase/client` only. NEVER use the full barrel.

## URL Structure

```text
/admin/*              → Tenant-level management (manager+ roles)
/br/[branchId]/pos    → POS (cashier/waiter)
/br/[branchId]/kds    → KDS (chef)
/employee             → Employee task surface (all staff)
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

## Git And Commit Conventions

- Commits MUST be authored as `comtammatu@gmail.com`. The identity is set repo-locally (`git config user.email comtammatu@gmail.com`, `git config user.name "Luong The Binh"`); never override the author per commit.
- NEVER add AI attribution to commits or PRs: no `Co-Authored-By:` trailers, no "Generated with" bylines.
- Subject line: English, imperative, conventional prefix when one fits (`fix(scope): …`, `feat: …`, `chore: …`).
- Commit body MUST carry a `Verification:` line listing the gates actually run, plus the review-tier note required by `docs/agent/rules/workflow.md` (T1 skip reason, or T2/T3 pointer).
- Do not commit or push unless the owner asked for it in the current task.
- Multiple agents may work in this working tree concurrently. Never leave a
  partially staged index across steps: stage and commit in one atomic step,
  stage only files your task changed, and re-check `git log -1` immediately
  before committing.

Use `rg` or `rg --files` for normal text and file searches when available.
