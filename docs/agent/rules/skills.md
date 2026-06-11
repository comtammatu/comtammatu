# Skill And Plugin Routing Rules

Use this file before selecting external skills, plugins, MCP tools, browser tools,
or subagents for a task. The goal is deterministic routing: the same request
should load the same project rules and the same skill family regardless of which
agent handles it.

## Authority Order

1. `AGENTS.md`
2. The applicable files under `docs/agent/rules/`
3. Project source-of-truth docs from `docs/agent/rules/references.md`
4. External skills/plugins/tool docs
5. Agent memory or local notes

If an external skill conflicts with this repo, the repo wins. Use the skill for
workflow and tool know-how, not as authority to redesign architecture, UI,
database policy, copy, or business rules.

## Repository Boundary

- Project-owned Agent Workspace config may live in this repo for Claude, Codex,
  Cursor, or similar tools. Treat it as an adapter to the repo rules, not as a
  competing source of truth.
- Adapter config MAY carry runtime enforcement for its own agent — permission
  allow/deny lists, hooks, guard scripts (e.g. `.claude/settings.json` +
  `.claude/hooks/guard-prod-db.mjs` enforce the Environment Registry in
  `database.md` for Claude Code sessions). It MUST NOT duplicate rule content:
  enforcement references the shared rules, the rules stay here. Share facts;
  enforce per runtime.
- Do not commit secrets, MCP tokens, plugin caches, generated sessions,
  worktrees, or per-user local state.
- Do not vendor external skills into this repo unless the owner explicitly asks
  for a product-owned skill package and approves the path.
- Durable project routing lives here, under `docs/agent/rules/`, not in a
  machine-local cache or per-user skill folder.
- Skill names below are capability contracts. If the exact skill is unavailable,
  use the closest installed equivalent, say what was unavailable, and continue
  with repo rules.

## Skill Plan Gate

Before coding or changing docs for any non-trivial task, state a short skill
plan in the task notes, PR body, or worklog:

```text
Skill plan: repo rules = engineering + <topic rules>; external skills = <names>;
runtime tools = <browser/db/cli>; skipped = <reason>.
```

T1 doc-only or typo-only work may skip the plan, but the final note or commit
body must say it was T1/doc-only.

Load the minimum useful set. Do not stack several overlapping skills unless each
one owns a different risk surface.

## Required Routing Matrix

Skill names below are capability contracts (see Repository Boundary), not a
promise that the exact skill is installed. Inventory last re-verified
2026-06-11. When a named skill is missing, use the closest installed
equivalent, or `find-skills` if the owner asked for new tooling.

| Task signal                                                                       | Required repo rules/docs                                                                         | Required skills/plugins when available                                                                                                                            | Required verification                                                                                                                |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Broad repo audit, onboarding, "read all source", architecture orientation         | `engineering.md`, `references.md`, `docs/CODEBASE_MAP.md`                                        | a repo-understanding/codebase-graph skill when installed; `health` or `review` only when the user asks for audit/review | Summarize evidence paths; do not claim runtime state without smoke evidence                                                          |
| Code review, PR review, regression hunt                                           | `engineering.md`, `workflow.md`, relevant module docs, `tasks/regressions.md`                    | `review`; an external second-opinion reviewer (e.g. `codex`) only when requested; a diff-understanding skill for large diffs when installed                                                     | Findings first with file/line refs; run targeted checks when feasible                                                                |
| Next.js App Router, RSC, Server Actions, routing, proxy                           | `engineering.md`, `database.md` if data/auth touched, relevant module doc                        | `vercel:nextjs`, `vercel:react-best-practices` when available                                                                              | `pnpm typecheck && pnpm lint && pnpm build` for implementation                                                                       |
| React component performance or bundle risk                                        | `engineering.md`, `ui.md` if UI changes                                                          | `vercel:react-best-practices` or the closest installed React best-practices skill                                                                                              | Typecheck/lint/build; inspect imports for barrel/client boundary drift                                                               |
| UI, UX, route surface, copy, shadcn component, forms, operational POS/KDS UI      | `ui.md`, `docs/spec/design-system.md`, `docs/modules/ui.md`, `tasks/regressions.md`, domain docs | a shadcn skill (e.g. `vercel:shadcn`); a design-polish skill (e.g. `impeccable-design-polish`) only for explicit design/audit/polish work after project UI authority is loaded                                   | Browser/runtime smoke for meaningful UI; no fake primitives or design-system drift                                                   |
| Landing, marketing, portfolio, or visual concept outside operational ERP surfaces | `ui.md`, `docs/spec/design-system.md` if it touches web runtime                                  | an anti-slop/brand design skill (e.g. `taste-skill`) only when the surface is actually brand/marketing/prototype work                             | Visual/browser verification; do not override the Custom Theme for app surfaces                                                       |
| Supabase queries, migrations, RLS, grants, auth, storage, generated types, RPCs   | `database.md`, `workflow.md`, `tasks/regressions.md`, `docs/spec/database-schema.md`             | `supabase`, `supabase-postgres-best-practices`; use Supabase MCP/CLI only after target env is verified                                                            | T3 if schema/RLS/money/security-definer/data backfill; migration file before apply; `pnpm db:types` after applied type-source schema |
| Money, payments, refunds, HĐĐT, journal, payroll/tax                              | `database.md`, `workflow.md`, finance/legal docs, relevant runbooks                              | `supabase`, `supabase-postgres-best-practices`; product/QA perspectives required by T3                                                                            | Full T3 debate; targeted domain tests plus full gates                                                                                |
| Browser QA, route smoke, responsive/layout evidence                               | `workflow.md`, relevant UI/module docs                                                           | `playwright` for repeatable browser interaction; `browse`, `qa`, or `qa-only` for broader QA                         | Capture URL, viewport, route, and observed state; separate auth/env blockers from code regressions                                   |
| Deployment, Vercel, CI, GitHub PR, release/canary                                 | `engineering.md`, `workflow.md`, deployment/runbook docs                                         | `gh` CLI / GitHub tools, `vercel:*`, `ship`, `land-and-deploy`, `canary` only when owner asks to publish/land/deploy                                                           | Do not mutate production without owner-approved flow; cite CI/deploy evidence                                                        |
| Documentation, runbooks, lessons, task tracker                                    | `references.md`, relevant module/spec/runbook                                                    | Usually no external skill. Use a docx skill (e.g. `anthropic-skills:docx`) only for Word artifacts; use `make-pdf` only when asked for PDF                                            | Check links/anchors and keep docs in the correct SSOT location                                                                       |
| TikTok, campaign, offer, brand exploration, launch assets                         | `references.md`, `docs/ref/business-context.md`                                    | a creative/brand skill when installed (e.g. `taste-skill`)                                                                                                        | Keep output human, operational, and separate from product/runtime docs                                                               |
| Need a new reusable agent workflow or external skill                              | This file plus `references.md`                                                                   | `skill-creator`, `find-skills` only when the owner explicitly asks to create/install/update a skill                                            | Do not install or vendor silently; record durable project routing here if it affects future work                                     |

## Project-Specific Skill Rules

### Supabase

- Use `supabase` for any database/auth/storage/RLS/RPC task.
- Use `supabase-postgres-best-practices` for schema, query, index, RLS
  performance, and locking/concurrency questions.
- Supabase skill guidance is not permission to apply migrations. The repo's
  migration policy in `database.md` and `AGENTS.md` controls apply rights.
- For current Supabase product behavior, verify against official docs/changelog
  when implementation depends on unstable CLI/API behavior.

### Shadcn And UI Design

- Use `shadcn` for primitives, component composition, registry/preset questions,
  and form/control structure.
- Use a design-polish skill (e.g. `impeccable-design-polish`) only when the user
  asks for design, redesign, critique, audit, polish, UX hardening, or visual
  craft. Even then, load `docs/spec/design-system.md` first and keep operational
  ERP surfaces inside the Custom Theme contract.
- Do not use anti-slop/brand design skills (e.g. `taste-skill`) for Admin, POS,
  KDS, Inventory, Employee, Finance, HR, or other operational app surfaces. They
  are allowed for landing, portfolio, campaign, and brand concept work only.
- Product Design plugin skills are for prototypes and product direction. They do
  not replace the runtime design-system SSOT.

### Browser And QA

- Use Browser/in-app browser when the user explicitly says Browser, in-app
  browser, open localhost, inspect local app, click, type, or screenshot.
- Use Playwright/gstack QA when a task needs repeatable browser interaction,
  screenshots, responsive checks, form flows, or route matrices.
- After significant frontend changes, collect runtime evidence when a dev server
  is available. If auth/env blocks the smoke, report that blocker separately.

### Repo Understanding And Graph Skills

- Use a repo-understanding/graph skill (e.g. `understand-anything:*` when
  installed) for broad repo orientation, graph-backed analysis, large refactors,
  domain extraction, onboarding, and large diff explanation.
- Do not use graph artifacts as a substitute for reading current source files
  before editing. Treat graphs as navigation aids.

### GStack Workflow Skills

- Use `review` for pre-landing risk review.
- Use `investigate` for systematic root-cause debugging.
- Use `qa` for full QA runs; use `qa-only` when the user asks for report-only QA.
- Use `ship`, `land-and-deploy`, `canary`, and deployment workflow skills only
  when the user explicitly asks to ship, land, deploy, or monitor.
- Use `context-save` / `context-restore` only for continuity work, not as product
  documentation.

### GitHub, Vercel, And CI

- Use GitHub skills/tools for PRs, issues, CI failures, review comments, and
  publishing changes.
- Use Vercel skills/tools for Vercel deployments, env vars, routing middleware,
  framework guidance, or observability.
- Do not use Chrome or Computer Use as the first option for GitHub/Vercel if a
  dedicated connector, CLI, or API path is available.

## Subagents And Debate

- T3 tasks must follow `workflow.md`: four perspectives before implementation.
- T2 tasks use the self-review block. Include the skill plan above it or inside
  it.
- Subagents are optional for T2 and mandatory only when `workflow.md` requires a
  full T3 debate and the runtime supports spawning them.
- If subagents are unavailable, write the four-perspective debate yourself and
  call out that subagents were unavailable.

## Anti-Patterns

- Do not choose skills based on agent preference. Route by task signal.
- Do not skip a required domain skill because the change looks small if it
  touches a high-risk boundary such as RLS, money, auth, or shadcn primitives.
- Do not let external UI/design skills introduce a second design system.
- Do not let database skills bypass production migration policy.
- Do not claim a skill/plugin was used unless its instructions or tools actually
  informed the work.
- Do not create a parallel "AI docs" tree. Promote durable rules into
  `AGENTS.md`, `docs/agent/rules/`, module docs, specs, runbooks, tasks, or
  worklogs according to `references.md`.
