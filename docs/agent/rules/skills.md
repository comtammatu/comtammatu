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

- Project-owned Agent Workspace config may live in this repo for Claude or
  Codex (the two supported runtimes). Treat it as an adapter to the repo rules,
  not as a competing source of truth.
- Adapter config MAY carry runtime enforcement for its own agent — permission
  allow/deny lists and hook wiring. Shared guard logic lives once in
  `scripts/` (e.g. `scripts/guard-prod-db.mjs` enforces the Environment
  Registry in `database.md`; `.claude/settings.json` and `.codex/hooks.json`
  only wire it to their runtime). Adapters MUST NOT duplicate rule content or
  fork guard scripts: enforcement references the shared rules and shared
  scripts. Share facts and logic; wire per runtime.
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
2026-06-13. When a named skill is missing, use the closest installed
equivalent, or `find-skills` if the owner asked for new tooling.

| Task signal                                                                       | Required repo rules/docs                                                                         | Required skills/plugins when available                                                                                                                            | Required verification                                                                                                                |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Broad repo audit, onboarding, "read all source", architecture orientation         | `engineering.md`, `references.md`, `docs/CODEBASE_MAP.md`                                        | if `.codegraph/` exists, `codegraph_explore` first (both runtimes — verbatim source + blast radius in one call; treat its output as already Read), else a read-only Explore/search subagent (see Subagents, Debate, And Read Delegation); `understand-anything` plugin optional; `health`/`review` for audit and `cso` for a security/threat-model audit only when the user asks | Summarize evidence paths; do not claim runtime state without smoke evidence                                                          |
| Code review, PR review, regression hunt                                           | `engineering.md`, `workflow.md`, relevant module docs, `tasks/regressions.md`                    | `review`; an external second-opinion reviewer (e.g. `codex`) only when requested; a diff-understanding skill for large diffs when installed                                                     | Findings first with file/line refs; run targeted checks when feasible                                                                |
| Next.js App Router, RSC, Server Actions, routing, proxy                           | `engineering.md`, `database.md` if data/auth touched, relevant module doc                        | `vercel:nextjs`, `vercel:react-best-practices` when available                                                                              | `pnpm typecheck && pnpm lint && pnpm build` for implementation                                                                       |
| React component performance or bundle risk                                        | `engineering.md`, `ui.md` if UI changes                                                          | `vercel:react-best-practices` or the closest installed React best-practices skill                                                                                              | Typecheck/lint/build; inspect imports for barrel/client boundary drift                                                               |
| UI, UX, route surface, copy, shadcn component, forms, operational POS/KDS UI      | `ui.md`, `docs/spec/design-system.md`, `docs/modules/ui.md`, `tasks/regressions.md`, domain docs | a shadcn skill (e.g. `vercel:shadcn`); a design-polish skill (e.g. `impeccable-design-polish`) only for explicit design/audit/polish work after project UI authority is loaded                                   | Browser/runtime smoke for meaningful UI; no fake primitives or design-system drift                                                   |
| Landing, marketing, portfolio, or visual concept outside operational ERP surfaces | `ui.md`, `docs/spec/design-system.md` if it touches web runtime                                  | an anti-slop/brand design skill (e.g. `taste-skill`) only when the surface is actually brand/marketing/prototype work                             | Visual/browser verification; do not override the Custom Theme for app surfaces                                                       |
| Supabase queries, migrations, RLS, grants, auth, storage, generated types, RPCs   | `database.md`, `workflow.md`, `tasks/regressions.md`, `docs/spec/database-schema.md`             | `supabase`, `supabase-postgres-best-practices`; use Supabase MCP/CLI only after target env is verified                                                            | T3 if schema/RLS/money/security-definer/data backfill; migration file before apply; `pnpm db:types` after applied type-source schema |
| Money, payments, refunds, HĐĐT, journal, payroll/tax                              | `database.md`, `workflow.md`, `docs/ref/legal-framework-2026.md`, finance/legal docs, relevant runbooks | `tax-vn` (repo skill: routes the legal/tax/HĐĐT/payroll docs and names the real compute functions); `supabase`, `supabase-postgres-best-practices`; product/QA perspectives required by T3                                                                            | Full T3 debate; targeted domain tests plus full gates                                                                                |
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

### HKD Domain (legal / tax / HĐĐT / labor / payroll)

- For any task touching tax rates, HĐĐT/e-invoice rules, the business form (HKD
  vs company), labor contracts, BHXH, or PIT: load
  `docs/ref/legal-framework-2026.md` (the SSoT law register) FIRST, then the
  specific domain doc (`einvoice-tax.md` / `payroll-pit.md` /
  `labor-contracts.md`) and `docs/ref/business-context.md`.
- Cite the governing văn bản (NĐ 70/2025, NĐ 68/2026, NĐ 141/2026, TT 152/2025,
  TT 32/2025, Luật TNCN 109/2025, NQ 110/2025) — never assert a tax/labor rule
  from memory. When a doc and the code disagree (e.g. PIT bracket count), flag it
  for owner/accountant; do not silently reconcile either side.
- Má Tư is a Hộ kinh doanh: no formal BCTC/VAS. Treat enterprise-accounting
  guidance as an advanced layer reachable by direct permission, not the default
  surface (D012/D013).
- Execution entry point: the `tax-vn` repo skill (`.claude/skills/tax-vn/`)
  routes these docs in order and names the real compute functions in
  `packages/shared/src/payroll/` and the HĐĐT helpers. It restates no rule and
  no number — authority stays in the docs above. (Claude runtime; Codex follows
  the same doc order directly.)

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
- `browse` / `open-gstack-browser` run a standalone Chromium daemon that
  persists across commands. Point it only at a safe local dev target — never at
  a dev server whose `.env.local` resolves to a production database or live
  S-invoice credentials. Stop the daemon when done.

### Repo Understanding, Search, And Context Economy

- For broad repo orientation, "where/how/which" questions, naming-convention
  sweeps, large-refactor mapping, domain extraction, onboarding, and large diff
  explanation: if `.codegraph/` exists, call `codegraph_explore` first. One
  capped call returns verbatim, line-numbered source grouped by file plus the
  blast radius (callers/dependents) — cheaper and more accurate than a Read/grep
  loop or a search subagent, and it serves both the Claude and Codex runtimes.
  Run `codegraph init` if the index is missing. With no index, delegate to a
  read-only Explore/search subagent (see Subagents, Debate, And Read Delegation)
  rather than reading many files on the main thread.
- Treat `codegraph_explore` / `codegraph_node` source output as already Read —
  do not re-open those files. `understand-anything` is an optional alternative;
  its output dir is gitignored (`.understand-anything/`, alongside `.codegraph/`).
  A graph is a navigation aid, never a substitute for reading the current source
  of the specific symbol you are about to edit.

### GStack Workflow Skills

- Use `review` for pre-landing risk review.
- Use `investigate` for systematic root-cause debugging.
- Use `qa` for full QA runs; use `qa-only` when the user asks for report-only QA.
- Use `ship`, `land-and-deploy`, `canary`, and deployment workflow skills only
  when the user explicitly asks to ship, land, deploy, or monitor.
- Use `context-save` / `context-restore` only for continuity work, not as product
  documentation.
- Use `cso` for a security audit / threat model (OWASP, STRIDE, secrets,
  dependency and skill supply-chain). It fits this repo's `packages/security`
  and prod-guard posture; route here for "security review", not a generic
  `review`.
- Use `careful` / `guard` / `freeze` for destructive or prod-adjacent work
  (migrations, data backfill, anything touching the production DB) — they warn
  before `DROP`/`rm -rf`/force-push and can scope edits to one directory. They
  complement, never replace, the migration policy in `database.md`.
- `learn`, `retro`, and `setup-deploy` keep their own gstack-side stores. Do not
  let them fork a parallel learning or config source: this repo's SSoT stays
  `tasks/lessons.md`, `tasks/regressions.md`, `docs/worklog/`, and `AGENTS.md`
  (see Anti-Patterns). `setup-deploy` must not rewrite `CLAUDE.md` (a stable
  pointer to `AGENTS.md`).

### GitHub, Vercel, And CI

- Use GitHub skills/tools for PRs, issues, CI failures, review comments, and
  publishing changes.
- Use Vercel skills/tools for Vercel deployments, env vars, routing middleware,
  framework guidance, or observability.
- Do not use Chrome or Computer Use as the first option for GitHub/Vercel if a
  dedicated connector, CLI, or API path is available.

## Subagents, Debate, And Read Delegation

- Read delegation (context economy): before reading more than roughly three
  files to answer a question, or to do any broad orientation/search, delegate to
  a read-only Explore/search subagent and consume only its conclusion. The main
  context window is the scarce resource; burning it on line-by-line reading a
  subagent could absorb is the default failure mode to avoid. This applies at
  every risk tier — it governs reads, not writes. Reserve main-thread reading
  for files you will edit or must quote/match verbatim (e.g. before an `Edit`).
  When `.codegraph/` exists, prefer `codegraph_explore` even over spawning a
  search subagent — it is the pre-built index, so a subagent search just repeats
  work it already did (see Repo Understanding, Search, And Context Economy).
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
