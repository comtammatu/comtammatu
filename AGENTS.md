# Cơm Tấm Má Tư — Bộ phần mềm quản lý vận hành và bán hàng

Bộ phần mềm quản lý vận hành và bán hàng cho Hộ kinh doanh Cơm Tấm Má Tư.
Single-tenant, multi-branch.

Nhiệm vụ: bán đúng, bếp nhận đúng, thu tiền đúng, in/hóa đơn đúng, kho trừ đúng,
và chủ/quản lý nhìn được tình trạng vận hành thật theo ngày.

Hierarchy: `Tenant (L0) → Branch (L1)`.

This file is the agent entrypoint. Keep it short and stable. Detailed, topic-specific rules live under `docs/agent/rules/`.

## Rule Loading

Before implementation, read the applicable rule files:

- Always read `docs/agent/rules/engineering.md` for repo commands, architecture, import boundaries, and core constraints.
- Read `docs/agent/rules/skills.md` before selecting external skills, plugins, MCP tools, browser tools, or subagents.
- Read `docs/agent/rules/database.md` for Supabase, migrations, RLS, ACL, auth, Server Actions, RPCs, or database type work.
- Read `docs/agent/rules/ui.md` before any UI, UX, route surface, component, styling, or copy change.
- Read `docs/agent/rules/workflow.md` for review-tier rules (T3 full debate / T2 self-review / T1 skip), verification, and completion gates.
- Read `docs/agent/rules/team.md` for the standing operating-team roles and missions, the end-to-end task loop, and the cross-runtime (Codex) review pass.
- Read `docs/agent/rules/notifications.md` before adding any notification, alert, anomaly detector, or scheduled report (the producer / dedup / routing contract).
- Read `docs/agent/rules/references.md` when onboarding or choosing the source-of-truth docs for a task.

Instruction memory and learning memory stay separate:

- Shared rules and policies live in `AGENTS.md` and `docs/agent/rules/`.
- `CLAUDE.md` is a compatibility shim only; do not duplicate rules there.
- Skill/plugin routing lives in `docs/agent/rules/skills.md`; external skills are workflow aids, not project authority.
- Regression lessons live in `tasks/regressions.md`.
- Retrospectives and durable learnings live in `tasks/lessons.md`.
- Current work tracking lives in `tasks/todo.md`.
- Project-owned Agent Workspace config may live in the repo for Claude and
  Codex (the two supported runtimes). Keep secrets, MCP tokens, plugin caches,
  generated sessions, worktrees, and per-user local state out of version
  control. See `docs/agent/rules/references.md` → "Agent Entrypoints Per IDE"
  for the per-runtime entrypoint + prod-DB guard-adapter map.

## Communication Protocol

Optimize for context economy between agents and clarity for the owner. This is
the single source of truth for which language each surface uses; do not restate
it elsewhere — point here.

- **Agent-to-agent text → English.** Subagent prompts, T3/T2 debate transcripts, multi-agent handoffs, structured tool I/O, and any reasoning exchanged between agents are English. English keeps the shared context window dense and reads identically across every runtime (Claude Code, Codex).
- **Code, identifiers, comments, and commit subjects → English** (see Critical Constraints). Comments state only non-obvious constraints.
- **Owner-facing chat replies → Vietnamese.** Answer the owner in Vietnamese — concise but complete (gọn gàng, không bỏ chi tiết cần truyền đạt). Keep code, symbols, commands, file paths, identifiers, and log/error excerpts verbatim; never translate them.
- **Persisted docs keep their established language.** Owner/human planning and domain docs stay Vietnamese where already written (`docs/plan/decisions.md`, `tasks/todo.md`, `docs/ref/`, business/legal docs). Agent-internal staging stays English (`docs/worklog/` debate transcripts, `tasks/lessons.md`, `tasks/regressions.md`). Match the file you are editing — never flip an existing file's language as a side effect.

## Critical Constraints

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

## UI Authority

- NEVER invent or redesign the UI outside the project's established design system.
- NEVER exceed authority when editing UI; only make UI changes explicitly requested or clearly required by the task.
- UI design-system SSOT is `docs/spec/design-system.md`; it defines the Com Tam Ma Tu Custom Theme.
- USE `shadcn/ui` components and the project's active preset as the primitive implementation baseline after the design-system contract selects the pattern.
- NEVER treat `components.json`, `globals.css`, app wrappers, regression notes, or worklogs as competing UI authorities.
- BEFORE UI/UX rebuild work, read and follow `docs/spec/design-system.md` as the locked Custom Theme contract.
- UI/UX rebuild PRs MUST state the surface, primary user job, route family, change type, and primitives used before implementation.

## Architecture

<!-- MIRROR:architecture:begin — synced copy; edit BOTH AGENTS.md and docs/agent/rules/engineering.md. -->

```text
Browser → proxy.ts (auth + ACL) → App Router → Supabase (PostgREST + Auth)
Printing → apps/print-agent (Node daemon, polls print_jobs) → ESC/POS LAN printers
```

Next.js 16.2 | React 19.2 | TypeScript 6.0 | Tailwind 4.2 | Zod 4 | Turborepo 2.9 | Node >= 24

<!-- MIRROR:architecture:end -->

## Commands

<!-- MIRROR:commands:begin — synced copy; edit BOTH AGENTS.md and docs/agent/rules/engineering.md. -->

```bash
pnpm dev          # Start dev server (Turbopack)
pnpm build        # Production build
pnpm typecheck    # Type checking across all packages
pnpm lint         # Repo guard checks (copy, ui-contract, client-storage, rules-mirror, guard-sync, regression-guards, review-tier) + ESLint
pnpm test         # Test suites (turbo test)
pnpm verify       # Full gate: deps audit + baseline hygiene + typecheck + lint + build + test
pnpm db:types     # Regenerate Supabase types after migration is applied to the type source schema
```

<!-- MIRROR:commands:end -->

## Workflow Summary

Pick review depth by blast radius (full rules in `docs/agent/rules/workflow.md`):

- **T3 — full debate** (auth/RLS, money, multi-row writes, new `SECURITY DEFINER` RPC, schema-changing migration, data backfill). Write or spawn all four perspectives (PM / BA / Senior Dev / QA) before coding.
- **T2 — self-review** (everything else that changes behavior). Write 2–4 lines per perspective in the task notes / PR body before coding.
- **T1 — skip** allowed only for typo fixes under 3 changed lines, doc-only changes, and dependency version bumps with no API change. State the skip reason in the commit body.

For how these tiers sit inside the end-to-end team loop (intake → land → learn) and the cross-runtime Codex review pass, see `docs/agent/rules/team.md`.
