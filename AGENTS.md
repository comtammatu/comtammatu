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
- `CLAUDE.md` is a compatibility shim only; do not duplicate rules there.
- Regression lessons live in `tasks/regressions.md`.
- Retrospectives and durable learnings live in `tasks/lessons.md`.
- Current work tracking lives in `tasks/todo.md`.
- Keep local agent/tool folders out of the repo: `.claude/`, `.codex/`, `.agents/`, `.gstack/`, `.omc/`, MCP tokens, plugin caches, and per-user tool settings.

## Critical Constraints

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
- NEVER create a separate agent-only documentation tree such as `docs/llm-wiki/`; use `AGENTS.md`, `docs/agent/rules/`, `docs/CODEBASE_MAP.md`, module docs, specs, runbooks, tasks, or worklogs according to the content type.

## UI Authority

- The current UI contract is a frozen legacy runtime contract for maintenance only, not authority for the next UX rebuild.
- NEVER start UX rebuild implementation on top of the frozen legacy contract, current `AppShell`, or current `surface.tsx` visual rules.
- BEFORE UI/UX rebuild work, first choose the UX reference with the owner, then update `docs/spec/design-system.md`, `docs/agent/rules/ui.md`, `docs/modules/ui.md`, `tasks/regressions.md`, and `scripts/check-ui-contract.mjs` as one authority reset.
- NEVER invent or redesign the UI outside the owner-approved design-system contract. During the freeze, no broad rebuild contract is active; only the scoped Khung quản trị rebuild authority in `docs/spec/design-system.md` is active.
- NEVER exceed authority when editing UI; only make maintenance UI changes explicitly requested or clearly required by the task.
- For maintenance-only UI work, USE `shadcn/ui` components and the frozen current-runtime preset evidence as the default path.
- For UX rebuild work, USE `shadcn/ui` components only after the owner-approved authority reset defines the new preset/tokens/components.
- For maintenance-only UI work, read `docs/spec/design-system.md` as the frozen current-runtime contract.
- For the current Khung quản trị rebuild slice, use installed shadcn primitives first and do not run `shadcn init --preset b6FS5q9aq` until the owner chooses reinstall, merge, or skip.
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
pnpm db:types     # Regenerate Supabase types after migration is applied to the type source schema
```

## Workflow Summary

Every feature, bug fix, and refactor must follow the 4-agent debate protocol in `docs/agent/rules/workflow.md` before implementation.

Skip the 4-agent debate only for:

- Typo fixes under 3 changed lines
- Documentation-only changes
- Dependency version bumps
