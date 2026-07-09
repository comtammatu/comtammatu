# Cơm Tấm Má Tư — Bộ phần mềm quản lý vận hành và bán hàng

Bộ phần mềm quản lý vận hành và bán hàng cho Hộ kinh doanh Cơm Tấm Má Tư.
Single-tenant, multi-branch.

Nhiệm vụ: bán đúng, bếp nhận đúng, thu tiền đúng, in/hóa đơn đúng, kho trừ đúng,
và chủ/quản lý nhìn được tình trạng vận hành thật theo ngày.

Hierarchy: `Tenant (L0) → Branch (L1)`.

This file is the agent entrypoint. Keep it short and stable. Detailed, topic-specific rules live under `docs/agent/rules/`.

## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the
repo root), keep the graph fresh instead of trusting a previous session:

- Start each implementation session/task with `codegraph index .` before relying
  on graph output. `codegraph status .` is a post-refresh check, not a substitute
  after active code or DB churn.
- Use CodeGraph before grep/find/manual file reads for source lookup:
  `codegraph explore "..."` / MCP `codegraph_explore`, and `codegraph node ...`
  for a specific file or symbol.
- After changing source files, SQL migrations, or generated database types, run
  `codegraph index .` again before final review or closeout.
- If `.codegraph/` is missing, skip CodeGraph entirely; indexing is an owner
  decision.

## Rule Loading

Before implementation, read the applicable rule files:

- Always read `docs/agent/rules/engineering.md` for repo commands, architecture, import boundaries, and core constraints.
- Read `docs/agent/rules/skills.md` before selecting external skills, plugins, MCP tools, browser tools, or subagents. Its **Authority Order** and **Required Routing Matrix** give layer-first and task-signal routing into the rules, skills, and verification a task needs.
- Read `docs/agent/rules/database.md` for Supabase, migrations, RLS, ACL, auth, Server Actions, RPCs, or database type work.
- Read `docs/agent/rules/ui.md` before any UI, UX, route surface, component, styling, or copy change.
- Read `docs/agent/rules/workflow.md` for behavior changes, review-tier rules (T3 full debate / T2 self-review / T1 skip), verification, and completion gates. T1 doc-only or typo-only work may skip after stating the skip reason.
- Read `docs/agent/rules/team.md` only for T3 second-runtime review or arbitration.
- Read `docs/agent/rules/orchestration.md` only when routing work across subagents, multi-agent Workflow, parallel runtimes, or a real context-budget problem. Inline single-agent tasks may skip it.
- Read `docs/agent/rules/notifications.md` before adding any notification, alert, anomaly detector, or scheduled report (the producer / dedup / routing contract).
- Read `docs/agent/rules/references.md` when onboarding or choosing the source-of-truth docs for a task.

Instruction memory and learning memory stay separate:

- Shared rules and policies live in `AGENTS.md` and `docs/agent/rules/`.
- `CLAUDE.md` is a compatibility shim only; do not duplicate rules there.
- Skill/plugin routing lives in `docs/agent/rules/skills.md`; external skills are workflow aids, not project authority.
- Regression lessons live in `tasks/regressions.md`.
- Retrospectives and durable learnings live in `tasks/lessons.md`.
- Current work tracking lives in `tasks/todo.md`.
- Root runtime-adapter directories (`.claude/`, `.codex/`, …) are tool wiring,
  not a second source of truth. The adapter registry, guard-adapter map, and
  hygiene rules live in `docs/agent/rules/references.md` → "Agent Entrypoints
  Per IDE".

## Communication Protocol

Optimize for context economy between agents and clarity for the owner. This is
the single source of truth for which language each surface uses; do not restate
it elsewhere — point here.

- **Agent-to-agent text → English.** Subagent prompts, T3/T2 debate transcripts, multi-agent handoffs, structured tool I/O, and any reasoning exchanged between agents are English. English keeps the shared context window dense and reads identically across every runtime (Claude Code, Codex).
- **Code, identifiers, comments, and commit subjects → English** (see Critical Constraints). Comments state only non-obvious constraints.
- **Owner-facing chat replies → Vietnamese.** Answer the owner in Vietnamese — concise but complete (gọn gàng, không bỏ chi tiết cần truyền đạt). Keep code, symbols, commands, file paths, identifiers, and log/error excerpts verbatim; never translate them.
- **Persisted docs follow a declared per-surface default; never flip an existing file's language as a side effect.** Language is assigned by purpose. Each surface has a default for NEW files; existing files are grandfathered — if a file already differs from its surface default, keep it.
  - **Vietnamese** (owner/human planning, domain, operator-facing): `docs/ref/`, `docs/user-guides/`, `docs/plan/` (incl. `docs/plan/decisions.md`), `docs/architecture/`, `docs/README.md`, business/legal docs.
  - **English** (agent rules, technical contracts, agent-internal staging): `docs/agent/rules/`, `docs/modules/`, `docs/spec/`, `docs/plan/adr/`, `docs/worklog/README.md`, `docs/CODEBASE_MAP.md`, `tasks/` (incl. `tasks/todo.md`, `tasks/lessons.md`, `tasks/regressions.md`), and root `AGENTS.md` / `CLAUDE.md`.
  - **English default, Vietnamese allowed for operator-facing checklists:** `docs/runbooks/`.
  - Root `README.md` is intentionally bilingual: Vietnamese mission/overview + English tech stack.
- **One prose language per doc.** Within a single doc, explanatory prose stays in one language. Vietnamese domain/legal terms, UI-copy strings, role labels, env vars, and code identifiers are kept verbatim inside prose of either language and do NOT count as mixing — an English doc carrying verbatim Vietnamese domain nouns (e.g. HĐĐT, HKD, "doanh thu") is a correct English doc, not a half-translated one.

## Critical Constraints

<!-- MIRROR:constraints:begin — intentional synced copy in AGENTS.md and docs/agent/rules/engineering.md (other agents auto-load only their entrypoint). Edit BOTH identically; `corepack pnpm lint:rules-mirror` enforces. -->

- MUST use TypeScript strict mode. `noUncheckedIndexedAccess: true`
- MUST use `supabase-js` for all queries. NEVER Prisma.
- MUST validate all Server Action inputs with Zod schemas.
- MUST run `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build` before marking implementation tasks complete.
- NEVER return raw Supabase/Postgres `error.message` to clients.
- NEVER import `@comtammatu/database` barrel in `"use client"` components.
- NEVER store scope in `localStorage` or React Context. Scope belongs in URL params only.
- Multi-item atomic writes MUST use a Postgres RPC function.
- Agents MAY apply migrations directly only after verifying the target ref against the Environment Registry in `docs/agent/rules/database.md`; production apply additionally requires explicit owner delegation in the current session.
- After SQL migration is applied to the schema used for generated types, run `corepack pnpm db:types`.
- ACL single source: `packages/shared/src/auth/module-acl.ts`.
- NEVER add agent notes, dev commit notes, implementation explanations, or internal commentary to project UI.
- NEVER leave tombstone or provenance notes about deleted code, files, flows, or projects — in code comments, docs, or SQL. Delete cleanly; git history is the record.
- Code comments MUST be English and only state non-obvious constraints. NEVER add narrative, explanatory, or change-log comments (no "đã xóa/đã gỡ", no owner-decision dates in code).
- Put durable explanations, guides, operational notes, and task notes in Markdown docs, guides, or note files inside the source tree.
- MUST follow `docs/agent/rules/skills.md` for skill/plugin/tool selection on non-trivial tasks.
- NEVER create a separate agent-only documentation tree such as `docs/llm-wiki/` or `docs/superpowers/`; use `AGENTS.md`, `docs/agent/rules/`, `docs/CODEBASE_MAP.md`, module docs, specs, runbooks, tasks, decisions, or ADRs (including Parked ADRs for owner-kept future options with a revisit trigger) according to the content type; `docs/worklog/` is policy-only.

<!-- MIRROR:constraints:end -->

## UI Authority

- UI design-system SSOT is `docs/spec/design-system.md`; it defines the Com Tam Ma Tu Custom Theme.
- NEVER invent or redesign UI outside that contract, and never exceed the UI authority the task grants.
- All UI guardrails, typography rules, and the operational-UI philosophy live in `docs/agent/rules/ui.md` — read it before any UI change.

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
corepack pnpm dev          # Start dev server (Turbopack)
corepack pnpm build        # Production build
corepack pnpm typecheck    # Type checking across all packages
corepack pnpm lint         # Repo guard checks (copy, ui-contract, client-storage, rules-mirror, guard-sync, seed-permissions, regression-guards, baseline hygiene, review-tier, doc-staleness, i18n:no-grow, route-matrix) + ESLint
corepack pnpm test         # Test suites (turbo test)
corepack pnpm verify       # Full gate: deps audit + baseline hygiene + typecheck + lint + build + test
corepack pnpm db:types     # Regenerate Supabase types after migration is applied to the type source schema
```

<!-- MIRROR:commands:end -->

## Workflow Summary

Review depth (T1/T2/T3), tier triggers, and the four perspectives (PM / BA /
Senior Dev / QA) are owned by `docs/agent/rules/workflow.md` → Review Depth —
Tier By Risk. Use `docs/agent/rules/team.md` only for T3 second-runtime review
or arbitration.
