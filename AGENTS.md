# Cơm Tấm Má Tư — Restaurant Management System

Single-tenant multi-branch system for Cơm Tấm Má Tư CTCP.

Hierarchy: `Tenant (L0) → Branch (L1)`.

This file is the agent entrypoint. Keep it short and stable. Detailed, topic-specific rules live under `docs/agent/rules/`.

## Rule Loading

Before implementation, read the applicable rule files:

- Always read `docs/agent/rules/engineering.md` for repo commands, architecture, import boundaries, and core constraints.
- Read `docs/agent/rules/database.md` for Supabase, migrations, RLS, ACL, auth, Server Actions, RPCs, or database type work.
- Read `docs/agent/rules/ui.md` before any UI, UX, route surface, component, styling, or copy change.
- Read `docs/agent/rules/workflow.md` for debate protocol, skip conditions, verification, and completion gates.
- Read `docs/agent/rules/references.md` when onboarding or choosing the source-of-truth docs for a task.

Instruction memory and learning memory stay separate:

- Shared rules and policies live in `AGENTS.md` and `docs/agent/rules/`.
- Regression lessons live in `tasks/regressions.md`.
- Retrospectives and durable learnings live in `tasks/lessons.md`.
- Current work tracking lives in `tasks/todo.md`.

## Critical Constraints

- MUST use TypeScript strict mode. `noUncheckedIndexedAccess: true`
- MUST use `supabase-js` for all queries. NEVER Prisma.
- MUST validate all Server Action inputs with Zod schemas.
- MUST run `pnpm typecheck && pnpm lint && pnpm build` before marking implementation tasks complete.
- NEVER return raw Supabase/Postgres `error.message` to clients.
- NEVER import `@comtammatu/database` barrel in `"use client"` components.
- NEVER store scope in `localStorage` or React Context. Scope belongs in URL params only.
- Multi-item atomic writes MUST use a Postgres RPC function.
- After SQL migration is merged and applied, run `pnpm db:types`.
- NEVER apply migrations directly. Write migration file → PR → merge → owner applies manually.
- ACL single source: `packages/shared/src/auth/module-acl.ts`.

## UI Authority

- NEVER invent or redesign the UI outside the project's established design system.
- NEVER exceed authority when editing UI; only make UI changes explicitly requested or clearly required by the task.
- USE `shadcn/ui` components and the project's active preset as the default UI path.
- BEFORE UI/UX rebuild work, read and follow `docs/spec/design-system.md` as the locked design-system contract.
- UI/UX rebuild PRs MUST state the surface, primary user job, route family, change type, and primitives used before implementation.

## Architecture

```text
Browser → proxy.ts (auth + ACL) → App Router → Supabase (PostgREST + Auth)
```

Next.js 16.2 | React 19.2 | TypeScript 6.0 | Tailwind 4.2 | Zod 4 | Turborepo 2.9 | Node >= 24

## Commands

```bash
pnpm dev          # Start dev server (Turbopack)
pnpm build        # Production build
pnpm typecheck    # Type checking across all packages
pnpm lint         # ESLint
pnpm db:types     # Regenerate Supabase types after migration is merged and applied
```

## Workflow Summary

Every feature, bug fix, and refactor must follow the 4-agent debate protocol in `docs/agent/rules/workflow.md` before implementation.

Skip the 4-agent debate only for:

- Typo fixes under 3 changed lines
- Documentation-only changes
- Dependency version bumps
