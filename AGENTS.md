# Cơm Tấm Má Tư — Bộ phần mềm quản lý vận hành và bán hàng

Bộ phần mềm quản lý vận hành và bán hàng cho **Hộ Kinh Doanh** Cơm Tấm Má Tư
(một hộ kinh doanh, không phải công ty cổ phần). 1 app (`apps/web`) + `apps/print-agent`.
Single-tenant (`tenant_id` giữ có chủ đích cho scope), multi-branch (chi nhánh ngang hàng / flat-branch).

Nhiệm vụ: bán đúng, bếp nhận đúng, thu tiền đúng, in/hóa đơn đúng,
và chủ/quản lý nhìn được tình trạng vận hành thật theo ngày.

Hierarchy: `Tenant (L0) → Branch (L1)`. Lean roles: `owner`, `manager`, `staff`, `chef`.

This file is the agent entrypoint. Keep it short and stable. Detailed, topic-specific rules live under `docs/agent/rules/`.

## Rule Loading

Before implementation, read the applicable rule files:

- Always read `docs/agent/rules/engineering.md` for repo commands, architecture, import boundaries, and core constraints.
- Read `docs/agent/rules/database.md` for Supabase, migrations, RLS, ACL, auth, Server Actions, RPCs, or database type work.
- Read `docs/agent/rules/ui.md` before any UI, UX, route surface, component, styling, or copy change.
- Read `docs/agent/rules/workflow.md` for review-tier rules (T3 full debate / T2 self-review / T1 skip), verification, and completion gates.
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

<!-- mirror: canonical owners are docs/agent/rules/{engineering,references,database}.md — keep these one-liners in sync; full text lives in the rule files -->
## Durable Working Rules (mirror)

These are intentionally mirrored here so Codex/Cursor (which auto-load only `AGENTS.md`) see them. The canonical, full-text owner is named after each.

- **`"use server"` exports async only.** A `"use server"` file may export only async functions; a re-export barrel of Server Actions must NOT carry `"use server"`. → `docs/agent/rules/engineering.md`
- **Decompose by concern, not LoC.** Splitting a file targets one-concern-per-file, not a line-count threshold. → `docs/agent/rules/engineering.md`
- **Single source of truth.** One canonical owner per fact; deliberate mirrors must be marked with a drift anchor and kept in sync; do not collapse them. → `docs/agent/rules/references.md`
- **Docs keep lean.** Update over add; never bulk-delete; flag dead docs for the owner; honor `docs/worklog/README.md` retention. → `docs/agent/rules/references.md`
- **`JWT-CLAIMS-NOT-IN-APP-METADATA`.** Read claims via `extractClaimsFromAccessToken`, never `user.app_metadata`. → `docs/modules/auth.md`
- **`BMIDL-RLS-INTENTIONAL-ROLE-FASTPATH`.** `branch_menu_item_daily_limits` gates RLS via `auth_role()` (intentional read-mostly fast-path), not `has_permission()`. → `docs/agent/rules/database.md`

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
pnpm db:types     # Regenerate Supabase types after migration is applied to the type source schema
```

## Workflow Summary

Pick review depth by blast radius (full rules in `docs/agent/rules/workflow.md`):

- **T3 — full debate** (auth/RLS, money, multi-row writes, new `SECURITY DEFINER` RPC, schema-changing migration, data backfill). Write or spawn all four perspectives (PM / BA / Senior Dev / QA) before coding.
- **T2 — self-review** (everything else that changes behavior). Write 2–4 lines per perspective in the task notes / PR body before coding.
- **T1 — skip** allowed only for typo fixes under 3 changed lines, doc-only changes, and dependency version bumps with no API change. State the skip reason in the commit body.
