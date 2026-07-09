# Agent Reference Map

Use this file to find the source-of-truth docs for onboarding, implementation planning, and review.
It is an index, not a context bundle: load only the target docs needed for the
current task, and never treat runtime adapters, ignored local tool state, or
`tasks/todo.md` as parallel authority.

## System Overview

- Agent entrypoint: `AGENTS.md`
- Skill/plugin/tool routing: `docs/agent/rules/skills.md`
- Optional T3 second-runtime review: `docs/agent/rules/team.md`
- Optional subagent/context routing: `docs/agent/rules/orchestration.md`
- Codebase map + module index: `docs/CODEBASE_MAP.md`
- Auth & ACL: `docs/modules/auth.md`
- Database: `docs/modules/database.md`
- Finance: `docs/modules/finance.md`
- Web App: `docs/modules/web-app.md`
- UI: `docs/modules/ui.md`
- Security: `docs/modules/security.md`
- Infrastructure: `docs/modules/infrastructure.md`
- Architecture hub: `docs/architecture/README.md`

## Agent Entrypoints Per IDE

Registered runtime adapters are **Claude Code** and **Codex**. Each loads its
own entrypoint and wires the same canonical prod-DB guard. Root adapter
directories such as `.claude/`, `.codex/`, `.cursor/`, and `.agents/` are
allowed when they wire tools back to this repo's rules instead of becoming a
second source of truth. Adding another IDE means adding an adapter, not
duplicating rules. Keep secrets, MCP tokens, plugin caches, generated sessions,
worktrees, and per-user local state out of version control.

| IDE         | Auto-loaded entrypoint           | MCP config           | Prod-DB guard adapter                                 |
| ----------- | -------------------------------- | -------------------- | ----------------------------------------------------- |
| Claude Code | `CLAUDE.md` (shim → `AGENTS.md`) | `.mcp.json`          | `.claude/settings.json` → `scripts/guard-prod-db.mjs` |
| Codex       | `AGENTS.md` (native)             | `.codex/config.toml` | `.codex/hooks.json` → `scripts/guard-prod-db.mjs`     |
| Cursor      | (none yet — create an adapter-local pointer to `AGENTS.md`) | adapter-specific | add adapter + register in `scripts/check-guard-sync.mjs` before write-capable DB/tool use |

`scripts/guard-prod-db.mjs` is the single guard; the adapter configs only wire it
per runtime. `corepack pnpm lint:guard-sync` enforces that every adapter in `ADAPTER_PATHS`
(`scripts/check-guard-sync.mjs`) wires the canonical hook with matching matchers.
A new IDE without a registered adapter runs **UNGUARDED against the production
DB** — add the adapter and register it in `check-guard-sync.mjs` before using it.
Until then, keep production-affecting tools read-only in that IDE adapter.

Per-user toolsets are not repo authority. `.claude/settings.json` may pin a
small reusable Claude tool shelf, but every task still routes through
`docs/agent/rules/skills.md`. The only tracked repo skill is
`.claude/skills/tax-vn/`, which is a wrapper around the legal/tax reference docs.

## Intentional Mirrors

Two duplications are deliberate and machine-enforced — do NOT "de-duplicate" them:

- `MIRROR:constraints` / `MIRROR:architecture` / `MIRROR:commands` blocks are
  copied byte-for-byte between `AGENTS.md` and `docs/agent/rules/engineering.md`
  (each runtime auto-loads only its entrypoint). `corepack pnpm lint:rules-mirror`
  enforces equality — edit BOTH identically.
- The prod-DB guard triad (`scripts/guard-prod-db.mjs`, `.claude/settings.json`,
  and `.codex/hooks.json`) is kept in sync by `corepack pnpm lint:guard-sync`.

## Planning And Specs

- Active work tracker: `tasks/todo.md`
- ADRs: `docs/plan/adr/` (accepted, rejected, superseded, or parked owner-kept
  future options)
- Legacy decision index: `docs/plan/decisions.md` (do not add backlog,
  implementation plans, or transient debate records)
- System architecture: `docs/spec/architecture.md`
- Role/scope/route matrix: `docs/spec/role-route-matrix.md` — hand-authored
  preamble (product frame, principles, navigation contract) plus a
  `GENERATED:role-route-matrix` block regenerated from
  `packages/shared/src/auth/*.ts` by `scripts/gen-role-route-matrix.mjs`
  (`corepack pnpm gen:route-matrix` / `lint:route-matrix` drift check); do not
  hand-edit inside the GENERATED markers
- Database schema source ladder: `docs/spec/database-schema.md`
- Design system contract: `docs/spec/design-system.md`
- Inventory overview diagrams: `docs/spec/inventory-overview-diagrams.md`
- Toast/notification UX spec: `docs/spec/toast-notification-system.md`
- Operational audio (POS/KDS beep + voice): `docs/spec/operational-audio-alerts.md` (ADR `docs/plan/adr/0008-operational-audio-alerts.md`)

## Business Domain

- Reference index: `docs/ref/README.md`
- Project vocabulary & naming SSoT: `docs/ref/glossary.md`
- Domain knowledge encyclopedia for F&B, Finance, Tax/HKD, labor, and operational
  reasoning: `docs/ref/domain-encyclopedia.md`
- Operational data and metric contract: `docs/ref/operational-data-contract.md`
- HKD business context: `docs/ref/business-context.md`
- HKD legal framework register (SSoT for laws/decrees): `docs/ref/legal-framework-2026.md`

Do not re-enumerate `docs/ref/` here — the index above is the single owner of
that list.

## Meta-Learning

The task tracker (`tasks/todo.md`, Planning And Specs above), skill/plugin routing
(`docs/agent/rules/skills.md`, System Overview above), and the
regressions/lessons stores (Memory Maintenance Rules below) own their own
registration. Unique to this section:

- Runbook index: `docs/runbooks/README.md`
- Worklog policy: `docs/worklog/README.md`

## Memory Maintenance Rules

Which store each fact type lives in is routed by `AGENTS.md` → "Instruction
memory and learning memory stay separate". This section owns how those stores
are maintained.

- No separate agent-only doc tree (`docs/llm-wiki/`, `docs/superpowers/`, and
  the like) — owned by
  `engineering.md` → Core Constraints (`MIRROR:constraints`); place durable
  content in the normal source-of-truth docs above.
- Put incident-specific failure prevention in `tasks/regressions.md`.
- Put retrospective explanations in `tasks/lessons.md`.
- One fact lives in exactly one store. `tasks/lessons.md` and
  `tasks/regressions.md` are staging areas that shrink as rules mature: prefer
  enforcement over prose — when a rule can be a lint, test, or hook, write the
  guard and delete the prose (an enforced rule costs zero context; a prose rule
  is re-read every session). Promote a stable lesson to a canonical doc, then
  delete it from the staging file.
- Keep secrets, generated sessions, cache files, and per-user local notes out of
  version-controlled shared rule files.
- Keep rules concrete and verifiable. Avoid vague guidance such as "write good code" or "be careful".
- Do not add an archive tree or keep superseded implementation plans in the
  repo. Current decisions move into the source-of-truth docs above. Owner-kept
  future options may be parked in `docs/plan/adr/` only when the ADR states
  `Status: Parked`, why it is not being built now, and the concrete revisit
  trigger; otherwise delete them.

## No Snapshot Backlog

`docs/plan/*` is restricted to ADRs and the legacy `decisions.md` index.
`docs/worklog/*` is restricted to its README policy file unless a PR-local
staging note is explicitly removed, promoted, or parked before closeout. Dated
audits, implementation plans, debate transcripts, mockups, and backlog snapshots
do not belong in the shared repo.

- **Promote, park, or delete.** Current contracts move into the owned
  source-of-truth docs above. Owner-kept future options that are not current work
  become Parked ADRs with a concrete revisit trigger. Resolved or obsolete
  findings are deleted; git history is the archive.
- **Do not legitimize staleness with banners.** `Reconciled-through` status lines
  are not enough. `corepack pnpm lint:doc-staleness` fails when non-durable
  plan/worklog snapshots remain.
- **Use PR bodies for transient review artifacts.** T2/T3 debate summaries,
  second-runtime notes, and implementation checklists should live in the PR or
  task note first. Only promote durable rules, contracts, or lessons; park only
  owner-kept future options with a revisit trigger.

## Open Knowledge Format Export

- OKF is an exchange/export format for agent-readable project knowledge, not a
  project authority. The source-of-truth docs above always win.
- Run `corepack pnpm docs:okf` to generate a disposable OKF v0.1 bundle under
  `.tmp/okf/` from the current Markdown authority files.
- Generated OKF bundles must stay out of version control unless the owner
  explicitly approves a publishable artifact path.
- Never copy generated OKF content back into source docs. Update the canonical
  source doc, then regenerate the bundle.
