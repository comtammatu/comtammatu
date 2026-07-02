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

- Root runtime-adapter directories (`.claude/`, `.codex/`, …) are adapters to
  the repo rules, never competing sources of truth (registry:
  `references.md` → Agent Entrypoints Per IDE). They may wire tools,
  permissions, hooks, launchers, local prompts, and lightweight handoff
  helpers.
- Adapter config MAY carry runtime enforcement for its own agent — permission
  allow/deny lists and hook wiring. Shared guard logic lives once in
  `scripts/` (e.g. `scripts/guard-prod-db.mjs` enforces the Environment
  Registry in `database.md`; `.claude/settings.json` and `.codex/hooks.json`
  only wire it to their runtime). Adapters MUST NOT duplicate rule content or
  fork guard scripts: enforcement references the shared rules and shared
  scripts. Share facts and logic; wire per runtime.
- New IDE adapters are allowed, but write-capable database/tool actions must be
  wired to the canonical guard before use. Until an adapter is registered in
  `scripts/check-guard-sync.mjs`, keep it read-only for production-affecting
  tools.
- Version-control hygiene for adapter dirs (no secrets, tokens, caches,
  sessions, worktrees, per-user state) is owned by `references.md` → Agent
  Entrypoints Per IDE.
- Do not vendor external skills into this repo unless the owner explicitly asks
  for a product-owned skill package and approves the path.
- Durable project routing lives here, under `docs/agent/rules/`, not in a
  machine-local cache or per-user skill folder.
- Skill names below are capability contracts. If the exact skill is unavailable,
  use the closest installed equivalent, say what was unavailable, and continue
  with repo rules.

## Skill Plan Gate

T3 tasks MUST state a short skill plan before coding — it feeds the
four-perspective debate and has a reviewer-inspectable home in the PR body,
task notes, or a `docs/worklog/` note when the contract is too large for the
PR. T2 tasks SHOULD state one, but may omit it when routing is obvious
(engineering + the single topic rule, no external skills). State it in the task
notes, PR body, or worklog:

```text
Skill plan: repo rules = engineering + <topic rules>; external skills = <names>;
runtime tools = <browser/db/cli>; skipped = <reason>.
```

T1 doc-only or typo-only work may skip the plan, but the final note or commit
body must say it was T1/doc-only.

Load the minimum useful set. Do not stack several overlapping skills unless each
one owns a different risk surface.

## Layer Index

Layer-first entry points into the **Required Routing Matrix** below — the
matrix owns the rules, skills, and verification; this index only routes. Pick
the minimum useful set per the anti-stacking rule above.

- **UI / UX / copy / route surface** → matrix row "UI, UX, route surface…" and Má Tư UI Skill Routing below. Default T2 (T3 if auth-gated flow).
- **FE — RSC / Server Actions / proxy / perf** → rows "Next.js App Router…" and "React component performance…". Default T2.
- **BE — Supabase / RLS / RPC / auth / money** → rows "Supabase queries…" and "Money, payments…". Default T3.
- **Infra — deploy / CI / env / print-agent** → row "Deployment, Vercel, CI…" plus `docs/modules/infrastructure.md` and runbooks. Default T2 (T3 if prod-affecting).
- **Architecture — cross-cutting design** → row "Broad repo audit…" plus `docs/architecture/README.md` and `docs/spec/architecture.md`; planning: `superpowers:brainstorming` → `superpowers:writing-plans`; optional artifact template `eos-system-design` / `eos-tech-spec` when installed. Default T3.
- **Review / PR / regression / security** → row "Code review, PR review…"; security scope: `cso` or the built-in `security-review`. Tier per diff blast radius.
- **Process — debug / test / QA** → row "Browser QA, route smoke…" for QA; debug: `investigate` or `superpowers:systematic-debugging`; TDD/verification superpowers only when they directly own the task step. Tier inherited from the task.

## Toolset Reproducibility

These plugins/skills are **per-user Claude state, not repo-pinned**: the rich set
(`frontend-design`, `vercel:*`, `supabase`, `playwright`, `superpowers`, …) lives
in `~/.claude/settings.json`; the gitignored `.claude/settings.local.json` only
adds `oh-my-claudecode`. The only git-tracked repo skill is `tax-vn`
(`.claude/skills/tax-vn/`). What survives a different machine or runtime:

- **The durable, runtime-neutral contract is the Layer Index + Required Routing
  Matrix in THIS file.** Codex (no plugin loading) and any other-machine agent read it
  and route to the closest available capability. This is why no rule may DEPEND on
  a plugin (see Plugin Lanes and Anti-Patterns).
- **Reproducible Claude default:** the project-relevant official-marketplace
  plugins are pinned in shared `.claude/settings.json` → `enabledPlugins`
  (`frontend-design`, `vercel`, `supabase`, `playwright`, `superpowers`,
  `claude-md-management`) so a new Claude dev gets the toolset without
  rediscovering it.
- **Selected by task signal, never by availability.** The pinned plugin list is
  a curated shelf, not a preload mandate. Load only the row that owns the current
  risk surface; if a plugin is unavailable or its context conflicts with repo
  rules, skip it and use the repo rules plus the closest local tool.
- **Per-user marketplace plugins — NOT pinned, keep in your own config:**
  `oh-my-claudecode`, `ponytail`, `telegram`; `engineering-os` runs from a
  per-user plugin cache (its local-path marketplace source is machine-specific
  and may dangle — never load-bearing).
- **`gstack` is not a marketplace plugin** — it is a separately-installed project
  under `~/.claude/skills/gstack/` (its own installer / `gstack-upgrade`), so it
  cannot be pinned via `enabledPlugins`; a dev installs it themselves. The Layer
  Index and Routing Matrix name gstack skills (`review`, `qa`, `investigate`, `cso`,
  `ship`/`land-and-deploy`/`canary`) only as capability contracts — each pairs in
  the same row with a reproducible or runtime-neutral fallback (T-tier debate,
  `playwright`, `superpowers:systematic-debugging`, `security-review` / OMC
  `security-reviewer`, `gh` + `vercel:*`). Nothing is load-bearing on gstack.

### Headroom Context Compression

Headroom is an optional per-user context compressor — never a repo dependency
or source of truth (do not add `headroom-ai` to `package.json` or vendor its
skills); `headroom learn` is dry-run-only for this repo. Operational checklist:
`docs/runbooks/agent-headroom.md`.

## Required Routing Matrix

The Layer Index above routes into this table; rows below are the task-signal
view, and the verification column lives here. Skill names are capability
contracts (see Repository Boundary). Inventory last re-verified 2026-07-02.

| Task signal                                                                       | Required repo rules/docs                                                                                | Required skills/plugins when available                                                                                                                                                                                                                                                                                                                                           | Required verification                                                                                                                         |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Broad repo audit, onboarding, "read all source", architecture orientation         | `engineering.md`, `references.md`, `docs/CODEBASE_MAP.md`                                               | if `.codegraph/` exists, `codegraph_explore` first (both runtimes — verbatim source + blast radius in one call; treat its output as already Read), else a read-only Explore/search subagent (see Subagents, Debate, And Read Delegation); `health`/`review` for audit and `cso` for a security/threat-model audit only when the user asks | Summarize evidence paths; do not claim runtime state without smoke evidence                                                                   |
| Code review, PR review, regression hunt                                           | `engineering.md`, `workflow.md`, relevant module docs, `tasks/regressions.md`                           | `review`; an external second-opinion reviewer (e.g. `codex`) only when requested; a diff-understanding skill for large diffs when installed                                                                                                                                                                                                                                      | Findings first with file/line refs; run targeted checks when feasible                                                                         |
| Next.js App Router, RSC, Server Actions, routing, proxy                           | `engineering.md`, `database.md` if data/auth touched, relevant module doc                               | `vercel:nextjs`, `vercel:react-best-practices` when available                                                                                                                                                                                                                                                                                                                    | `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build` for implementation                                                     |
| React component performance or bundle risk                                        | `engineering.md`, `ui.md` if UI changes                                                                 | `vercel:react-best-practices` or the closest installed React best-practices skill                                                                                                                                                                                                                                                                                                | Typecheck/lint/build; inspect imports for barrel/client boundary drift                                                                        |
| UI, UX, route surface, copy, Má Tư DS component, forms, operational POS/KDS UI    | `ui.md`, `docs/spec/design-system.md`, `docs/modules/ui.md`, `tasks/regressions.md`, domain docs        | repo Má Tư DS primitives and surface adapters first; a UI/UX checklist skill when installed; `impeccable-design-polish` for explicit product-UI audit/polish after project UI authority is loaded                                                                                                                                                                         | Browser/runtime smoke for meaningful UI; no fake primitives or design-system drift                                                            |
| Landing, marketing, portfolio, or visual concept outside operational ERP surfaces | `ui.md`, `docs/spec/design-system.md` if it touches web runtime                                         | `taste-skill` (anti-slop/brand) only when the surface is actually brand/marketing/prototype work; `impeccable-design-polish` brand critique/polish when useful                                                                                                                                                                                                                     | Visual/browser verification; do not override the Custom Theme for app surfaces                                                                |
| Supabase queries, migrations, RLS, grants, auth, storage, generated types, RPCs   | `database.md`, `workflow.md`, `tasks/regressions.md`, `docs/spec/database-schema.md`                    | `supabase`, `supabase-postgres-best-practices`; use Supabase MCP/CLI only after target env is verified                                                                                                                                                                                                                                                                           | T3 if schema/RLS/money/security-definer/data backfill; migration file before apply; `corepack pnpm db:types` after applied type-source schema |
| Money, payments, refunds, HĐĐT, journal, payroll/tax                              | `database.md`, `workflow.md`, `docs/ref/legal-framework-2026.md`, finance/legal docs, relevant runbooks | `tax-vn` (repo skill: routes the legal/tax/HĐĐT/payroll docs and names the real compute functions); `supabase`, `supabase-postgres-best-practices`; product/QA perspectives required by T3                                                                                                                                                                                       | Full T3 debate; targeted domain tests plus full gates                                                                                         |
| Browser QA, route smoke, responsive/layout evidence                               | `workflow.md`, relevant UI/module docs                                                                  | `playwright` for repeatable browser interaction; `browse`, `qa`, or `qa-only` for broader QA                                                                                                                                                                                                                                                                                     | Capture URL, viewport, route, and observed state; separate auth/env blockers from code regressions                                            |
| Deployment, Vercel, CI, GitHub PR, release/canary                                 | `engineering.md`, `workflow.md`, deployment/runbook docs                                                | `gh` CLI / GitHub tools, `vercel:*`, `ship`, `land-and-deploy`, `canary` only when owner asks to publish/land/deploy                                                                                                                                                                                                                                                             | Do not mutate production without owner-approved flow; cite CI/deploy evidence                                                                 |
| Documentation, runbooks, lessons, task tracker                                    | `references.md`, relevant module/spec/runbook                                                           | Usually no external skill. Use a docx skill (e.g. `anthropic-skills:docx`) only for Word artifacts; use `make-pdf` only when asked for PDF                                                                                                                                                                                                                                       | Check links/anchors and keep docs in the correct SSOT location                                                                                |
| TikTok, campaign, offer, brand exploration, launch assets                         | `references.md`, `docs/ref/business-context.md`                                                         | a creative/brand skill when installed (e.g. `taste-skill`)                                                                                                                                                                                                                                                                                                                       | Keep output human, operational, and separate from product/runtime docs                                                                        |
| Need a new reusable agent workflow or external skill                              | This file plus `references.md`                                                                          | `anthropic-skills:skill-creator` (harness-bundled), `find-skills` only when the owner explicitly asks to create/install/update a skill                                                                                                                                                                                                                                                                              | Do not install or vendor silently; record durable project routing here if it affects future work                                              |

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
  surface (D012/D020).
- Execution entry point: the `tax-vn` repo skill (`.claude/skills/tax-vn/`)
  routes these docs in order and names the real compute functions in
  `packages/shared/src/payroll/` and the HĐĐT helpers. It restates no rule and
  no number — authority stays in the docs above. (Claude runtime; Codex follows
  the same doc order directly.)
- Boundary cases — when `tax-vn` FIRES vs when to ROUTE ELSEWHERE (identical for
  both runtimes):
  - FIRES: "what PIT bracket applies to this payroll run", "is this HĐĐT error
    code retryable", "does this revenue cross the 1 tỷ threshold".
  - ROUTE ELSEWHERE: "add an index to the payroll table" → `database.md`/supabase;
    "fix payslip PDF spacing" → `ui.md`/print; "where is the PIT compute function
    defined" → codegraph. `tax-vn` routes legal/tax/HĐĐT _rules_, not schema,
    layout, or code-location lookups.

### Má Tư UI Skill Routing

Classify the surface first: Admin, POS, KDS, Inventory, Employee, Finance, HR,
Menu, Orders, and authenticated tools are **product UI** (design serves the
operator workflow); landing pages, campaigns, portfolios, brand concepts, and
launch assets are **brand/marketing UI**.

Load authority before external skills: `docs/spec/design-system.md`,
`docs/modules/ui.md`, `tasks/regressions.md`, and the domain docs for the route
family. The Custom Theme contract wins over every external skill, generated
design system, preset suggestion, color palette, font pairing, or motion
recipe. Then write the UI rebuild gate before implementation: surface, primary
user job, route family, change type (visual refactor / UX flow / copy /
behavior), primitives to use, and regression rules at risk.

Skill stacks, in order (capability contracts — use the closest installed
equivalent):

- **Product UI:** repo Má Tư DS primitives (`@comtammatu/ui`) and
  `apps/web/app/components/surface.tsx` for composition and form/control
  structure — never external UI CLI, registry, or preset output as a project
  authority; a UI/UX checklist skill (accessibility, touch targets, responsive
  behavior, forms, pre-delivery quality control) when installed;
  `impeccable-design-polish` for product-UI critique/audit/polish/harden when
  the user asks for design work. Never `taste-skill` or other anti-slop/brand
  skills on operational app surfaces — they are for landing, portfolio,
  campaign, and brand concept work only.
- **Brand/marketing UI:** `taste-skill` for design-read and anti-slop
  direction; `impeccable-design-polish` for brand critique/polish; a checklist
  skill for accessibility/responsive pre-flight coverage. Any runtime touch
  still stays inside the Custom Theme contract.

When an external design skill asks for its own project context files
(`PRODUCT.md`, `DESIGN.md`, `design-system/MASTER.md`, page override trees,
route-local themes), treat that as a tooling mismatch, not a repo gap — never
create or persist them. Map the request to existing sources and state the
substitution in the skill plan:

- Product/business context: `docs/ref/business-context.md`, relevant
  `docs/ref/*`, and the route family module doc.
- UI/design contract: `docs/spec/design-system.md`; implementation patterns:
  `docs/modules/ui.md`, `apps/web/app/components/surface.tsx`,
  `packages/ui/src/components/*`.
- Negative rules and known drift: `tasks/regressions.md`; current work state:
  `tasks/todo.md`.

Reject external-skill output that conflicts with app constraints: no new fonts,
dark-mode strategy, arbitrary color ramps, kinetic/GSAP/motion libraries, fake
primitives, fake screenshots, route-local themes, or decorative page structures
on operational surfaces unless the owner explicitly changes
`docs/spec/design-system.md` first. External skill outputs are advisory —
translate them back into route family, primary user job, approved primitives,
regression rules at risk, and the verification the repo expects. Verify by
route behavior, not aesthetics alone: the mobile-first viewport exposes the
next safe action or live queue where relevant, desktop adds density without
changing IA, empty/loading/error states use approved primitives, and meaningful
UI changes get browser/runtime smoke when a safe dev target is available.

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

- CodeGraph freshness rules (index at session start, re-index after final
  source/SQL/generated-type changes) are owned by `AGENTS.md` → CodeGraph.
- For broad repo orientation, "where/how/which" questions, naming-convention
  sweeps, large-refactor mapping, domain extraction, onboarding, and large diff
  explanation: if `.codegraph/` exists, call `codegraph_explore` first. One
  capped call returns verbatim, line-numbered source grouped by file plus the
  blast radius (callers/dependents) — cheaper and more accurate than a Read/grep
  loop or a search subagent, and it serves both the Claude and Codex runtimes.
  If the index is missing, do not initialize it silently; delegate to a read-only
  Explore/search subagent (see Subagents, Debate, And Read Delegation) rather
  than reading many files on the main thread. Indexing is an owner decision.
- Treat `codegraph_explore` / `codegraph_node` source output as already Read —
  do not re-open those files. A graph is a navigation aid, never a substitute
  for reading the current source of the specific symbol you are about to edit.

### GStack Workflow Skills

Per-user gstack skills (`review`, `investigate`, `qa`/`qa-only`, `cso`,
`careful`/`guard`/`freeze`, `ship`/`land-and-deploy`/`canary`,
`context-save`/`context-restore`) route per the matrix; nothing is load-bearing
on them. Net-new constraints:

- Use `cso` for security audit / threat model scope ("security review"), not a
  generic `review`.
- `careful` / `guard` / `freeze` complement, never replace, the migration
  policy in `database.md`.
- Publish skills (`ship`, `land-and-deploy`, `canary`) only when the user
  explicitly asks to ship, land, deploy, or monitor; `context-save` /
  `context-restore` are continuity aids, not product documentation.
- `learn`, `retro`, and `setup-deploy` keep gstack-side stores — never let them
  fork this repo's SSoT (`tasks/lessons.md`, `tasks/regressions.md`,
  `docs/worklog/`, `AGENTS.md`); `setup-deploy` must not rewrite `CLAUDE.md`
  (a stable pointer to `AGENTS.md`).

### Plugin Lanes — OMC, engineering-os, Ponytail

These installed workflow plugins are Claude-runtime aids, not authority — Codex
does not load them, so no rule, gate, or workflow may DEPEND on one. Route by lane:

- **engineering-os (`eos-*`)** — optional structured deliverables only:
  system-design, tech-spec, PR review, sprint, release notes, incident, api-docs,
  weekly report. It is a machine-local plugin/cache, not a repo-pinned
  dependency. Use it only when available and useful; otherwise write the artifact
  directly from repo rules. Its templates are not a competing authority.
- **oh-my-claudecode (`oh-my-claudecode:*`)** — OPT-IN, explicitly-invoked
  orchestration/heavy-lift only (`ultrawork`, `team`, `trace`, `ask`). The repo's
  T3 four-perspective debate (`workflow.md`) stays the runtime-neutral backbone;
  OMC orchestration never replaces it. Its auto stores (`project-memory`, `wiki`,
  `notepad`, `learner`, `.omc/`) are a parallel, Claude-only learning source — do
  NOT treat them as memory; SSoT stays `tasks/lessons.md`, `tasks/regressions.md`,
  `AGENTS.md`, `docs/agent/rules/` (Anti-Patterns).
- **ponytail** — laziest-correct / YAGNI code discipline. Orthogonal; routes
  nothing, governs how code is written.

Where a plugin overlaps a native system (EOS `eos-code-review` / OMC
`code-reviewer` vs repo `review` + T-tier; OMC `team`/`ultrawork` vs the T3
debate + Agent Teams), prefer the repo flow; reach for the plugin only for a
capability the repo flow lacks.

### GitHub, Vercel, And CI

- Use GitHub skills/tools for PRs, issues, CI failures, review comments, and
  publishing changes.
- Use Vercel skills/tools for Vercel deployments, env vars, routing middleware,
  framework guidance, or observability.
- Do not use Chrome or Computer Use as the first option for GitHub/Vercel if a
  dedicated connector, CLI, or API path is available.

### Re-Runnable Skills

A project-owned skill meant to be re-run (improve / update / partial re-run /
correct) MUST name those follow-up phrasings in its `description`, or the trigger
silently dies after a cold start. Stateless doc-routers like `tax-vn` are exempt
(every invocation is fresh). Do NOT introduce a parallel `_workspace/` store or a
Phase-0 self-context check to fake resumability unless the owner approves an
artifact-producing orchestrator — and any such resume contract MUST be
runtime-neutral (readable by Claude AND Codex), never a Claude-skill convention.

### Evolving Skills And Rules From Feedback

When feedback shows a skill or rule misbehaved, fix at the _principle_ level, not
the one failing example — but stop at the intended responsibility boundary. The
goal of a decompose/refactor is separation by concern, not a line count. Do not
"generalize" a focused skill past its domain (never widen `tax-vn` into a generic
tax/PDF helper). Before widening any skill's scope, check its dependents and
update its `description` to match. Durable separation/feedback principles live
here in the shared rules, not in a single runtime's private memory.

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
- Model tier is chosen per call by task complexity, not fixed. Use the strongest
  available reviewer (for example GPT-5.5 or equivalent) for T3 challenge,
  architecture forks, auth/RLS/security, money, migrations, and ambiguous BA/PM
  calls. Use a mid-tier coding model for bounded implementation slices. Use fast
  coding models (for example GPT-5.3-Codex-Spark or equivalent) for read-only
  sweeps, caller/evidence collection, test-log triage, small mechanical patches,
  and QA sidecars. Any borrowed orchestrator/harness template that hardcodes one
  model tier on every call must have that mandate stripped before adoption.
  The concrete per-task routing table lives in
  [orchestration.md](orchestration.md) → Model-Tier Lanes (L0–L3).
- Agent Teams (`TeamCreate` / `SendMessage` / `TaskCreate`) is enabled for the
  Claude runtime (`.claude/settings.json` → `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)
  and MAY be used for live multi-agent coordination. It is an OPTIONAL capability:
  Codex has no equivalent, so no rule or workflow may DEPEND on it. The
  four-perspective debate and any orchestration MUST stay runtime-neutral with a
  graceful single-agent / written-transcript fallback (see `workflow.md`). It is an
  experimental flag — expect it to churn; never make load-bearing governance
  contingent on it.
- Claude-runtime accelerators for the T3 flow live in-repo: the
  `.claude/agents/t3-lens.md` subagent (generic read-only lens — the
  orchestrator's prompt assigns PM/BA/Dev/QA or a specialist flex) and the
  `.claude/commands/t3-debate.md` / `.claude/commands/verify-gate.md`
  launchers. They are optional accelerators, registered in `references.md` →
  Agent Entrypoints Per IDE; the written transcript stays the canonical form
  (`team.md` → Runtime-Neutral Mandate).

## Anti-Patterns

- Do not choose skills based on agent preference. Route by task signal.
- Do not skip a required domain skill because the change looks small if it
  touches a high-risk boundary such as RLS, money, auth, or Má Tư DS primitives.
- Do not let external UI/design skills introduce a second design system.
- Do not let database skills bypass production migration policy.
- Do not claim a skill/plugin was used unless its instructions or tools actually
  informed the work.
- Do not create a parallel "AI docs" tree. Promote durable rules into
  `AGENTS.md`, `docs/agent/rules/`, module docs, specs, runbooks, tasks, or
  worklogs according to `references.md`.
