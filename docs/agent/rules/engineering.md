# Engineering Rules

Use this file for repo-wide engineering constraints, import/runtime boundaries,
routing pointers, and Git conventions. Commands and the architecture summary
live in `AGENTS.md`.

## Core Constraints

<!-- MIRROR:constraints:begin — intentional synced copy in AGENTS.md and docs/agent/rules/engineering.md (other agents auto-load only their entrypoint). Edit BOTH identically; `corepack pnpm lint:rules-mirror` enforces. -->

- MUST use TypeScript strict mode. `noUncheckedIndexedAccess: true`
- MUST use `supabase-js` for all queries. NEVER Prisma.
- MUST validate all Server Action inputs with Zod schemas.
- MUST run `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build` before marking implementation tasks complete.
- NEVER return raw Supabase/Postgres `error.message` to clients.
- NEVER runtime-import the `@comtammatu/database` barrel in `"use client"` components; type-only imports are allowed.
- NEVER store scope in `localStorage` or React Context. Scope belongs in URL params only.
- Writes whose correctness spans multiple rows MUST use a Postgres RPC function.
- Agents MAY apply migrations directly only after verifying the target ref against the Environment Registry in `docs/agent/rules/database.md`; production apply additionally requires explicit owner delegation in the current session.
- After SQL migration is applied to the schema used for generated types, run `corepack pnpm db:types`.
- ACL single source: `packages/shared/src/auth/module-acl.ts`.
- NEVER add agent notes, dev commit notes, implementation explanations, or internal commentary to project UI.
- NEVER leave tombstone or provenance notes about deleted code, files, flows, or projects — in code comments, docs, or SQL. Delete cleanly; git history is the record.
- Code comments MUST be English and only state non-obvious constraints. NEVER add narrative, explanatory, or change-log comments (no deletion notes or owner-decision dates in code).
- Put durable explanations, guides, operational notes, and task notes in Markdown docs, guides, or note files inside the source tree.
- MUST follow `docs/agent/rules/skills.md` for skill/plugin/tool selection on non-trivial tasks.
- NEVER create a separate agent-only documentation tree such as `docs/llm-wiki/` or `docs/superpowers/`; use `AGENTS.md`, `docs/agent/rules/`, `docs/CODEBASE_MAP.md`, module docs, specs, runbooks, tasks, decisions, or ADRs (including Parked ADRs for owner-kept future options with a revisit trigger) according to the content type; `docs/worklog/` is policy-only.

<!-- MIRROR:constraints:end -->

## Import Boundaries

- Server Actions / RSC: `@comtammatu/database/supabase/server`.
- Privileged server-only code that intentionally bypasses RLS:
  `@comtammatu/database/supabase/service`; follow `database.md` authorization rules.
- Proxy: `@comtammatu/database/supabase/middleware`.
- Client `"use client"` components: runtime imports use
  `@comtammatu/database/supabase/client` only.
- Database types: type-only imports from `@comtammatu/database` or
  `@comtammatu/database/types`.

## URL Structure

Canonical route families and ownership: `docs/spec/role-route-matrix.md`.

## Proxy

Next.js proxy entrypoint: `apps/web/proxy.ts`. Auth, route/surface, branch-scope,
and network-gate contracts are owned by the source and auth docs.

## JWT Claims

Claim shape and auth-hook rules are owned by `docs/agent/rules/database.md` →
Auth And ACL.

## Git And Commit Conventions

- NEVER add AI attribution to commits or PRs: no `Co-Authored-By:` trailers, no "Generated with" bylines.
- Subject line: English, imperative, conventional prefix when one fits (`fix(scope): …`, `feat: …`, `chore: …`).
- Agent-authored, non-merge implementation commits MUST carry a `Verification:`
  line listing the gates actually run, plus the review-tier note required by
  `docs/agent/rules/workflow.md` (T1 skip reason, or T2/T3 pointer).
- Do not commit or push unless the owner asked for it in the current task.
- In a dirty or shared working tree, snapshot `git status`, declare the files
  owned by the task, preserve unrelated changes, and re-read a file before
  patching if another writer may overlap. Do not run repo-wide formatters.
- Parallel writers use isolated worktrees. Before staging, inspect the
  task-scoped diff; never leave a partially staged index. Stage only owned files,
  commit immediately, and re-check `git log -1` before committing.
