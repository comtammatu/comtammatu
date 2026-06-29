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

T3 tasks MUST state a short skill plan before coding — it feeds the
four-perspective debate and has a reviewer-inspectable home in the PR body or a
`docs/worklog/` note. T2 tasks SHOULD state one, but may omit it when routing is
obvious (engineering + the single topic rule, no external skills). State it in
the task notes, PR body, or worklog:

```text
Skill plan: repo rules = engineering + <topic rules>; external skills = <names>;
runtime tools = <browser/db/cli>; skipped = <reason>.
```

T1 doc-only or typo-only work may skip the plan, but the final note or commit
body must say it was T1/doc-only.

Load the minimum useful set. Do not stack several overlapping skills unless each
one owns a different risk surface.

## Layer Skill Map

Layer-indexed entry view for the way an agent thinks about a change ("I'm
touching FE / BE / Infra…"). It is a dispatch table over the same rule docs and
the same skill set as the task-signal **Required Routing Matrix** below — not a
competing authority. Pick the **minimum useful set** per the anti-stacking rule;
each skill named owns a distinct risk surface. Skills are capability contracts:
if one is unavailable, use the closest installed equivalent and continue with the
rule docs, which every runtime loads. Most of these skills are per-user Claude
state, not repo-pinned (see Toolset Reproducibility).

| Layer (you're touching…)                       | Load rules first                                                          | Matrix row → verify lives there       | Default tier         | Skills by risk-surface (use what's available)                                                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **UI** / UX / copy / route surface             | `ui.md`, `spec/design-system.md`, `modules/ui.md`, `tasks/regressions.md` | "UI, UX, route surface…"              | T2 (T3 if auth-gated flow) | primitives: a shadcn skill (`vercel:shadcn`); composition/anti-slop: `frontend-design`; a11y: `design:accessibility-review`; copy: `design:ux-copy`; audit/polish: `impeccable-design-polish`; brand/landing only: `taste-skill` |
| **FE** (RSC / Server Actions / proxy / perf)   | `engineering.md` (+ `database.md` if data/auth)                           | "Next.js App Router…", "React perf…"  | T2                   | `vercel:nextjs`, `vercel:react-best-practices`; caching/routing: `vercel:next-cache-components`, `vercel:routing-middleware`; build: `vercel:turbopack`                          |
| **BE** (Supabase / RLS / RPC / auth / money)   | `database.md`, `workflow.md`, `tasks/regressions.md`, `spec/database-schema.md` | "Supabase queries…", "Money…HĐĐT…" | T3                   | `supabase`, `supabase-postgres-best-practices`; tax/HĐĐT/payroll rules: `tax-vn` (repo skill); serverless: `vercel:vercel-functions`                                            |
| **Infra** (deploy / CI / env / print-agent)    | `engineering.md`, `modules/infrastructure.md`, `workflow.md`, runbooks    | "Deployment, Vercel, CI…"             | T2 (T3 if prod-affecting) | `vercel:deployments-cicd`, `vercel:env-vars`, `vercel:vercel-cli`, `vercel:vercel-firewall`; `gh` CLI; publish (only when owner asks): `ship`, `land-and-deploy`, `canary` |
| **Architecture** (cross-cutting design)        | `engineering.md`, `architecture/README.md`, `spec/architecture.md`, `CODEBASE_MAP.md` | "Broad repo audit…orientation"   | T3                   | orient: `codegraph_explore`; design process: `superpowers:brainstorming` → `superpowers:writing-plans`; structured deliverable: `eos-system-design`, `eos-tech-spec`; deep advisory (opt-in): OMC `architect`/`planner`/`critic` |
| **Review** / PR / regression / security        | `workflow.md`, `tasks/regressions.md`, relevant module docs               | "Code review, PR review…"             | per diff blast-radius | repo flow first (`review` + T-tier); structured: `eos-code-review`; second opinion: `codex`; security/threat-model: `cso` / `security-review`; process: `superpowers:requesting-code-review` / `receiving-code-review` |
| **Process** (debug / test / QA — cross-layer)  | `workflow.md`                                                             | "Browser QA, route smoke…" for QA     | inherit              | debug: `superpowers:systematic-debugging` / `investigate`; test: `superpowers:test-driven-development`; QA: `qa` / `qa-only` / `playwright`; done-gate: `superpowers:verification-before-completion` |

## Toolset Reproducibility

These plugins/skills are **per-user Claude state, not repo-pinned**: the rich set
(`frontend-design`, `vercel:*`, `supabase`, `playwright`, `superpowers`, …) lives
in `~/.claude/settings.json`; the gitignored `.claude/settings.local.json` only
adds `oh-my-claudecode`. The only git-tracked repo skill is `tax-vn`
(`.claude/skills/tax-vn/`). What survives a different machine or runtime:

- **The durable, runtime-neutral contract is the Layer Skill Map + Routing Matrix
  in THIS file.** Codex (no plugin loading) and any other-machine agent read it
  and route to the closest available capability. This is why no rule may DEPEND on
  a plugin (see Plugin Lanes and Anti-Patterns).
- **Reproducible Claude default:** the project-relevant official-marketplace
  plugins are pinned in shared `.claude/settings.json` → `enabledPlugins`
  (`frontend-design`, `vercel`, `supabase`, `playwright`, `superpowers`,
  `claude-md-management`) so a new Claude dev gets the toolset without
  rediscovering it.
- **Per-user marketplace plugins — NOT pinned, keep in your own config:**
  `oh-my-claudecode`, `ponytail`, `telegram`; `engineering-os` is a local-path
  marketplace (machine-specific, not reproducible).
- **`gstack` is not a marketplace plugin** — it is a separately-installed project
  under `~/.claude/skills/gstack/` (its own installer / `gstack-upgrade`), so it
  cannot be pinned via `enabledPlugins`; a dev installs it themselves. The Layer
  Skill Map names gstack skills (`review`, `qa`, `investigate`, `cso`,
  `ship`/`land-and-deploy`/`canary`) only as capability contracts — each pairs in
  the same row with a reproducible or runtime-neutral fallback (T-tier debate,
  `playwright`, `superpowers:systematic-debugging`, `security-review` / OMC
  `security-reviewer`, `gh` + `vercel:*`). Nothing is load-bearing on gstack.

### Headroom Context Compression

Headroom is a per-user workflow accelerator for long agent sessions. It is not a
repo dependency, not a source of truth, and not a replacement for CodeGraph,
repo rules, production verification, or the hard gates in `workflow.md`.

- Use it for log-heavy and tool-output-heavy work: `pnpm verify`, build/test
  failures, large Supabase SELECT results, long review sessions, or multi-agent
  handoffs.
- Skip it for short chat, small code-only edits, and source lookup where
  CodeGraph already returns the needed source directly.
- Keep setup local/user-level (`headroom wrap codex` / `headroom wrap claude`);
  do not add `headroom-ai` to `package.json`, vendor its skills, or commit
  generated Headroom caches/session state.
- `headroom learn` is dry-run only for this repo unless the owner explicitly
  asks to apply a learning. Do not let it write tracked `AGENTS.md` or
  `CLAUDE.md`; promote durable corrections manually to `tasks/regressions.md`,
  `tasks/lessons.md`, or the owning rule doc per `references.md`.
- Prefer `HEADROOM_TELEMETRY=off` while working with operational data.

Operational checklist: `docs/runbooks/agent-headroom.md`.

## Required Routing Matrix

The Layer Skill Map above is the layer-indexed companion to this table; rows below
are the task-signal view, and the verification column lives here. Skill names in
both are capability contracts (see Repository Boundary), not a promise that the
exact skill is installed. Inventory last re-verified 2026-06-22. When a named
skill is missing, use the closest installed equivalent, or `find-skills` if the
owner asked for new tooling.

| Task signal                                                                       | Required repo rules/docs                                                                         | Required skills/plugins when available                                                                                                                            | Required verification                                                                                                                |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Broad repo audit, onboarding, "read all source", architecture orientation         | `engineering.md`, `references.md`, `docs/CODEBASE_MAP.md`                                        | if `.codegraph/` exists, `codegraph_explore` first (both runtimes — verbatim source + blast radius in one call; treat its output as already Read), else a read-only Explore/search subagent (see Subagents, Debate, And Read Delegation); `understand-anything` plugin optional; `health`/`review` for audit and `cso` for a security/threat-model audit only when the user asks | Summarize evidence paths; do not claim runtime state without smoke evidence                                                          |
| Code review, PR review, regression hunt                                           | `engineering.md`, `workflow.md`, relevant module docs, `tasks/regressions.md`                    | `review`; an external second-opinion reviewer (e.g. `codex`) only when requested; a diff-understanding skill for large diffs when installed                                                     | Findings first with file/line refs; run targeted checks when feasible                                                                |
| Next.js App Router, RSC, Server Actions, routing, proxy                           | `engineering.md`, `database.md` if data/auth touched, relevant module doc                        | `vercel:nextjs`, `vercel:react-best-practices` when available                                                                              | `pnpm typecheck && pnpm lint && pnpm build` for implementation                                                                       |
| React component performance or bundle risk                                        | `engineering.md`, `ui.md` if UI changes                                                          | `vercel:react-best-practices` or the closest installed React best-practices skill                                                                                              | Typecheck/lint/build; inspect imports for barrel/client boundary drift                                                               |
| UI, UX, route surface, copy, shadcn component, forms, operational POS/KDS UI      | `ui.md`, `docs/spec/design-system.md`, `docs/modules/ui.md`, `tasks/regressions.md`, domain docs | a shadcn skill (e.g. `vercel:shadcn`); `ui-ux-pro-max` as a checklist/reasoning aid when available; `impeccable` for explicit product-UI audit/polish after project UI authority is loaded | Browser/runtime smoke for meaningful UI; no fake primitives or design-system drift                                                   |
| Landing, marketing, portfolio, or visual concept outside operational ERP surfaces | `ui.md`, `docs/spec/design-system.md` if it touches web runtime                                  | an anti-slop/brand design skill (e.g. `taste-skill`) only when the surface is actually brand/marketing/prototype work; `impeccable` brand/polish when useful | Visual/browser verification; do not override the Custom Theme for app surfaces                                                       |
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
    defined" → codegraph. `tax-vn` routes legal/tax/HĐĐT *rules*, not schema,
    layout, or code-location lookups.

### Shadcn And UI Design

- Use `shadcn` for primitives, component composition, registry/preset questions,
  and form/control structure.
- Use `ui-ux-pro-max` only as a supplemental UI/UX checklist and reasoning aid:
  accessibility, touch targets, responsive behavior, forms, navigation, charts,
  motion meaning, and pre-delivery quality control. Never let it generate or
  persist a parallel `design-system/MASTER.md`, page override tree,
  `PRODUCT.md`, `DESIGN.md`, route-local theme, or any other competing UI source
  of truth in this repo.
- Use `impeccable` for product-UI critique, audit, polish, hardening, layout,
  typography, and copy refinement when the user asks for design work. If the
  skill asks for root `PRODUCT.md` / `DESIGN.md`, map that context to existing
  repo sources instead: `docs/ref/business-context.md`,
  `docs/spec/design-system.md`, `docs/modules/ui.md`, and the relevant module
  docs.
- Do not use anti-slop/brand design skills (e.g. `taste-skill`) for Admin, POS,
  KDS, Inventory, Employee, Finance, HR, or other operational app surfaces. They
  are allowed for landing, portfolio, campaign, and brand concept work only.
- Product Design plugin skills are for prototypes and product direction. They do
  not replace the runtime design-system SSOT.
- Do not install, vendor, or copy external skills into the repo silently. If an
  exact skill such as `ui-ux-pro-max` is not installed, use the closest installed
  equivalent, or use the owner-provided GitHub reference only for the current
  task. Use `find-skills` / `skill-installer` only when the owner explicitly asks
  to install or update tooling.

#### External Design-Skill Context Map

When an external UI/design skill asks for its own project context files, do not
create them in this repo. Map the request to existing project sources:

- Product/business context: `docs/ref/business-context.md`, relevant
  `docs/ref/*`, and the route family module doc.
- UI/design contract: `docs/spec/design-system.md`.
- UI implementation patterns: `docs/modules/ui.md`,
  `apps/web/app/components/surface.tsx`, and `packages/ui/src/components/*`.
- Negative rules and known drift: `tasks/regressions.md`.
- Current work state: `tasks/todo.md`.

If a skill reports missing `PRODUCT.md`, `DESIGN.md`, or
`design-system/MASTER.md`, treat that as a tooling mismatch, not a repo gap.
Continue with the map above and state the substitution in the skill plan or
final note. External skill outputs are advisory: translate them back into route
family, primary user job, approved primitives, regression rules at risk, and the
verification that the repo expects.

### Ma Tu UI/UX Workflow

Use this workflow for UI/UX design tasks in this repo:

1. Classify the surface first. Admin, POS, KDS, Inventory, Employee, Finance,
   HR, Menu, Orders, and authenticated tools are product UI: design serves the
   operator workflow. Landing pages, campaigns, portfolios, brand concepts, and
   launch assets are brand/marketing UI.
2. Load authority before external skills: `docs/spec/design-system.md`,
   `docs/modules/ui.md`, `tasks/regressions.md`, and the domain docs for the
   route family. The Custom Theme contract wins over every external skill,
   generated design system, preset suggestion, color palette, font pairing, or
   motion recipe.
3. Write the UI rebuild gate before implementation: surface, primary user job,
   route family, change type (visual refactor / UX flow / copy / behavior),
   primitives to use, and regression rules at risk.
4. For product UI, use this skill stack in order:
   `shadcn` for primitive and form/control composition;
   `ui-ux-pro-max` for checklist coverage;
   `impeccable` for product-UI critique/polish/harden;
   skip `taste-skill` unless the task has a brand/landing/prototype surface.
5. For brand/marketing UI, use this skill stack in order:
   `taste-skill` for design-read and anti-slop direction;
   `impeccable` for brand critique/polish;
   `ui-ux-pro-max` for accessibility/responsive/pre-flight coverage;
   still keep any runtime touch inside the Custom Theme contract.
6. Reject external-skill output that conflicts with app constraints: no new
   fonts, dark-mode strategy, arbitrary color ramps, kinetic/GSAP/motion
   libraries, fake primitives, fake screenshots, route-local themes, or
   decorative page structures on ERP surfaces unless the owner explicitly
   changes `docs/spec/design-system.md` first.
7. Verify by route behavior, not aesthetics alone: mobile first viewport exposes
   the next safe action or live queue where relevant, desktop adds density
   without changing IA, empty/loading/error states use approved primitives, and
   meaningful UI changes get browser/runtime smoke when a safe dev target is
   available.

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

### Plugin Lanes — OMC, engineering-os, Ponytail

These installed workflow plugins are Claude-runtime aids, not authority — Codex
does not load them, so no rule, gate, or workflow may DEPEND on one. Route by lane:

- **engineering-os (`eos-*`)** — structured deliverables only: system-design,
  tech-spec, PR review, sprint, release notes, incident, api-docs, weekly report.
  Thin adapter over its own `templates/`, zero hooks/MCP. Draft an artifact with
  it, then map back to this repo's SSoT — its templates are not a competing
  authority.
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
`code-reviewer` vs repo `review` + T-tier; OMC `team`/`ultrawork` vs the T3 debate
+ Agent Teams), prefer the repo flow; reach for the plugin only for a capability
the repo flow lacks.

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

When feedback shows a skill or rule misbehaved, fix at the *principle* level, not
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
- Model tier is chosen per call by task complexity, not fixed: cheap/deterministic
  routing and read-only delegation may use a lighter model; reserve the strongest
  model for genuinely hard reasoning. Any borrowed orchestrator/harness template
  that hardcodes a single tier (e.g. `model: "opus"` on every call) must have that
  mandate stripped before adoption.
- Agent Teams (`TeamCreate` / `SendMessage` / `TaskCreate`) is enabled for the
  Claude runtime (`.claude/settings.json` → `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)
  and MAY be used for live multi-agent coordination. It is an OPTIONAL capability:
  Codex has no equivalent, so no rule or workflow may DEPEND on it. The
  four-perspective debate and any orchestration MUST stay runtime-neutral with a
  graceful single-agent / written-transcript fallback (see `workflow.md`). It is an
  experimental flag — expect it to churn; never make load-bearing governance
  contingent on it.

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
