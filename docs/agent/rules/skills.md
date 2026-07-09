# Skill And Tool Routing Rules

Use this file before selecting external skills, plugins, MCP tools, browser
tools, or subagents. Keep routing small: project rules decide what is allowed;
external tools only help execute the task.

## Authority Order

1. `AGENTS.md`
2. Applicable files under `docs/agent/rules/`
3. Source-of-truth docs from `docs/agent/rules/references.md`
4. External skills, plugins, MCP docs, and browser tooling
5. Agent memory or local notes

If an external tool conflicts with this repo, the repo wins. Do not create
plugin-specific docs, memory stores, workflow folders, or alternate design/API
contracts inside the repo.

## Repository Boundary

- Root adapter directories (`.claude/`, `.codex/`, `.agents/`, ...) wire tools
  back to this repo. They do not own project rules.
- Ignored local tool state (`.agents/skills/`, `.mcp.json`,
  `.claude/settings.local.json`, caches, logs, sessions) is runtime wiring, not
  task input or project authority.
- Do not vendor external skills into the repo unless the owner explicitly asks.
- Skill names below are capability contracts. If the exact skill is unavailable,
  use the closest installed equivalent and state the fallback.
- Load the minimum useful set. Do not stack overlapping skills or agents.

## Skill Plan Gate

T3 tasks MUST state a short skill plan before coding. T2 tasks SHOULD state one
when routing is not obvious. T1 doc-only or typo-only work may skip with the
skip reason.

```text
Skill plan: repo rules = engineering + <topic rules>; external skills = <names or none>; runtime tools = <browser/db/cli>; skipped = <reason>.
```

Put the plan in the PR body, task note, or owner-facing work summary. Do not
create a dated worklog file for it.
Name only the rules, tools, and skills actually used for this task; do not paste
the full routing matrix or installed-skill list into prompts.

## Required Routing Matrix

| Task signal | Required repo docs | External capability when available | Verification |
| --- | --- | --- | --- |
| Broad repo/code orientation | `engineering.md`, `references.md`, `docs/CODEBASE_MAP.md` | CodeGraph first when `.codegraph/` exists; otherwise a read-only search helper | Cite evidence paths; do not claim runtime state without smoke evidence |
| Code review, PR review, regression hunt | `engineering.md`, `workflow.md`, relevant module docs, `tasks/regressions.md` | review/security-review tools only when they add evidence | Findings first with file/line refs; targeted checks when feasible |
| Next.js, React, Server Actions, proxy | `engineering.md`; `database.md` if data/auth touched | Next.js/React best-practices skill | `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build` |
| UI, UX, route surface, copy, forms, POS/KDS | `ui.md`, `docs/spec/design-system.md`, `docs/spec/page-archetypes.md`, `docs/ref/screen-context-map.md`, `docs/modules/ui.md`, relevant regressions | At most one design-review capability for a real unresolved design question; browser tooling for runtime evidence after the UI Advisor Gate is complete | Browser/runtime smoke for meaningful UI; no design-system drift |
| Supabase, migrations, RLS, auth, RPC, generated types | `database.md`, `workflow.md`, `tasks/regressions.md`, schema docs | Supabase and Postgres best-practices skills; MCP/CLI only after target ref verification | T3 for schema/RLS/security-definer/backfill; migration file before apply; `db:types` after applied type-source schema |
| Money, payments, HĐĐT, payroll, tax, labor | `database.md`, `workflow.md`, `docs/ref/legal-framework-2026.md`, specific legal refs | `tax-vn` in Claude, or direct doc routing in other runtimes; Supabase if DB touched | T3; cite governing law doc; targeted tests plus full gates |
| Browser QA, route smoke, responsive/layout evidence | `workflow.md`, relevant UI/module docs | Playwright/browser/QA tools | Capture URL, viewport, route, observed state, and blockers |
| Deployment, Vercel, CI, GitHub PR | `engineering.md`, `workflow.md`, deployment/runbooks | GitHub/Vercel tools only for the requested operation | Cite CI/deploy evidence; no production mutation outside owner-approved flow |
| Docs, runbooks, lessons, task tracker | `references.md`, relevant module/spec/runbook | Usually none | Correct source-of-truth location; links/anchors when changed |
| New reusable agent workflow or skill | `references.md`, this file | Skill creation/install tools only when owner explicitly asks | Do not install, vendor, or pin silently |

## Domain Rules

### Supabase

- Use Supabase skills/tools for database/auth/storage/RLS/RPC work.
- Tool guidance never overrides `database.md` migration and production rights.
- Verify current Supabase CLI/API behavior from official docs when an
  implementation depends on unstable product behavior.

### HKD / Legal / Tax / HĐĐT / Payroll

- Load `docs/ref/legal-framework-2026.md` first, then the specific domain doc:
  `einvoice-tax.md`, `payroll-pit.md`, `labor-contracts.md`, or
  `business-context.md`.
- Never assert a legal/tax/labor number from memory. Cite the governing doc.
- If code and docs disagree, flag the disagreement; do not silently reconcile.
- The `tax-vn` repo skill is a Claude convenience wrapper only. Other runtimes
  follow the same doc order directly.

### UI

- Load `docs/spec/design-system.md`, `docs/modules/ui.md`, `ui.md`, and relevant
  regressions before external design advice.
- Complete `docs/spec/page-archetypes.md` § 0.1 UI Advisor Gate before using an
  external design skill or plugin. Project context and archetypes choose the
  workflow and page shape; external output may review the decision but cannot
  replace it.
- Product UI uses Má Tư DS primitives and `apps/web/app/components/surface.tsx`
  first. External UI output is advisory only.
- Use the minimum capability that closes a known gap: a design review for an
  unresolved interaction or hierarchy decision, and browser tooling for
  runtime evidence. Do not install or stack tools merely because the agent
  lacks a completed UI Advisor Gate.
- Do not create tool-specific context files (`PRODUCT.md`, `DESIGN.md`,
  design-system folders, route-local theme docs). Map the request to existing
  repo sources.

### Browser And QA

- Use browser tooling when the task asks to inspect/click/screenshot, or when a
  UI/runtime change needs evidence.
- Never point exploratory browser/QA tooling at a dev server backed by live
  production credentials unless the owner explicitly asks for that live check.

### Repo Understanding

- CodeGraph freshness rules live in `AGENTS.md`.
- If `.codegraph/` exists, use CodeGraph before broad grep/read loops for source
  lookup. Treat CodeGraph source output as already-read for the shown symbols.
- If the graph is missing, do not initialize it silently.

## Anti-Patterns

- Do not choose a skill because it is installed; route by task signal.
- Do not let external tools create a second design system, DB policy, task
  board, memory store, rule tree, or architecture record.
- Do not claim a tool was used unless its instructions or output informed the
  work.
- Do not add dated snapshot docs for plans, debates, audits, or backlog. Promote
  durable facts to the owned source doc, park owner-kept future options as ADRs
  with revisit triggers, or delete them.
