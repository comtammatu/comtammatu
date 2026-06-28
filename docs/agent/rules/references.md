# Agent Reference Map

Use this file to find the source-of-truth docs for onboarding, implementation planning, and review.

## System Overview

- Agent entrypoint: `AGENTS.md`
- Skill/plugin/tool routing: `docs/agent/rules/skills.md`
- Multi-agent team loop + Codex orchestration: `docs/agent/rules/team.md`
- Orchestration routing + context budget + anti-repeat loop: `docs/agent/rules/orchestration.md`
- Codebase map + module index: `docs/CODEBASE_MAP.md`
- Auth & ACL: `docs/modules/auth.md`
- Database: `docs/modules/database.md`
- Finance: `docs/modules/finance.md`
- Web App: `docs/modules/web-app.md`
- UI: `docs/modules/ui.md`
- Security: `docs/modules/security.md`
- Infrastructure: `docs/modules/infrastructure.md`
- Architecture hub: `docs/architecture/README.md`
- User guides (operator-facing): `docs/user-guides/README.md`

## Agent Entrypoints Per IDE

Supported runtimes are **Claude Code** and **Codex**. Each loads its own
entrypoint and wires the same canonical prod-DB guard; adding another IDE means
adding an adapter, not duplicating rules.

| IDE         | Auto-loaded entrypoint           | MCP config           | Prod-DB guard adapter                                 |
| ----------- | -------------------------------- | -------------------- | ----------------------------------------------------- |
| Claude Code | `CLAUDE.md` (shim → `AGENTS.md`) | `.mcp.json`          | `.claude/settings.json` → `scripts/guard-prod-db.mjs` |
| Codex       | `AGENTS.md` (native)             | `.codex/config.toml` | `.codex/hooks.json` → `scripts/guard-prod-db.mjs`     |

`scripts/guard-prod-db.mjs` is the single guard; the adapter configs only wire it
per runtime. `pnpm lint:guard-sync` enforces that every adapter in `ADAPTER_PATHS`
(`scripts/check-guard-sync.mjs`) wires the canonical hook with matching matchers.
A new IDE without a registered adapter runs **UNGUARDED against the production
DB** — add the adapter and register it in `check-guard-sync.mjs` before using it.

Per-user toolsets are not repo-pinned: the reproducible Claude plugin set lives in
`.claude/settings.json`, while `gstack` QA/review/deploy skills are self-installed
(`~/.claude/skills/gstack/`, own installer) and optional. Details and per-layer
fallbacks: `docs/agent/rules/skills.md` → Toolset Reproducibility.

## Intentional Mirrors

Two duplications are deliberate and machine-enforced — do NOT "de-duplicate" them:

- `MIRROR:constraints` / `MIRROR:architecture` / `MIRROR:commands` blocks are
  copied byte-for-byte between `AGENTS.md` and `docs/agent/rules/engineering.md`
  (each runtime auto-loads only its entrypoint). `pnpm lint:rules-mirror`
  enforces equality — edit BOTH identically.
- The prod-DB guard triad (`scripts/guard-prod-db.mjs`, `.claude/settings.json`,
  and `.codex/hooks.json`) is kept in sync by `pnpm lint:guard-sync`.

## Planning And Specs

- Active work tracker: `tasks/todo.md`
- Current technical status: `docs/CODEBASE_MAP.md`
- Architecture decisions: `docs/plan/decisions.md`
- Active ADRs: `docs/plan/adr/`
- System architecture: `docs/spec/architecture.md`
- Role/scope/route matrix: `docs/spec/role-route-matrix.md`
- Database schema source ladder: `docs/spec/database-schema.md`
- Design system contract: `docs/spec/design-system.md`
- Inventory overview diagrams: `docs/spec/inventory-overview-diagrams.md`
- Toast/notification UX spec: `docs/spec/toast-notification-system.md`

## Business Domain

- Reference index (canonical, full list of `docs/ref/` files): `docs/ref/README.md`
- Project vocabulary & naming SSoT: `docs/ref/glossary.md`
- Domain knowledge encyclopedia for F&B, Finance, Tax/HKD, labor, and operational
  reasoning: `docs/ref/domain-encyclopedia.md`
- Operational data and metric contract: `docs/ref/operational-data-contract.md`
- HKD business context: `docs/ref/business-context.md`
- HKD legal framework register (SSoT for laws/decrees): `docs/ref/legal-framework-2026.md`

Do not re-enumerate `docs/ref/` here — the index above is the single owner of
that list.

## Meta-Learning

- Regression rules: `tasks/regressions.md`
- Lessons learned: `tasks/lessons.md`
- Current tasks: `tasks/todo.md`
- Skill/plugin routing rules: `docs/agent/rules/skills.md`
- Runbook index: `docs/runbooks/README.md`
- Worklog index: `docs/worklog/README.md`

## Memory Maintenance Rules

- Put durable policy in `AGENTS.md` or topic files under `docs/agent/rules/`.
- Put durable skill/plugin routing in `docs/agent/rules/skills.md`. Agent
  Workspace config may point to these rules, but must not become a second
  source of truth.
- Do not create separate agent-only docs such as `docs/llm-wiki/`; place durable content in the normal source-of-truth docs above.
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
- Do not add an archive tree or keep superseded implementation plans in the repo. When a decision is current, promote it into the source-of-truth doc above; when it is not current, remove it.

## Transient Snapshot Docs

`docs/plan/*` dated audit/remediation files and `docs/worklog/*` are **point-in-time snapshots, not source of truth**. Their findings get fixed by later PRs; an unreconciled snapshot reads as if every finding is still open and misleads the next agent (and any model reading the repo cold).

- **Verify before acting.** Treat a finding in a snapshot doc as a claim to re-verify against current code + git history, never a live fact. Durable truth lives in the `docs/agent/rules/`, `docs/ref/`, `docs/spec/`, `docs/modules/` zones above.
- **Required banner.** Every snapshot doc MUST carry, in its first 15 lines, a status line naming the commit it was last reconciled against: `Reconciled-through <git-sha>`. `pnpm lint:doc-staleness` flags snapshot docs missing it (advisory; `DOC_STALENESS_STRICT=1` fails closed). `docs/plan/decisions.md`, `docs/plan/adr/`, and `README.md` are durable and exempt.
- **Reconcile-on-merge.** When a PR lands a finding tracked in a snapshot doc, tag that finding `✅ #<PR>` in place and bump the doc's `Reconciled-through` sha. Never leave a landed finding presented as open.
- **Retire when empty.** When all findings have landed, delete the doc (git is the archive) or promote any durable rule to its canonical doc above. Do not keep a fully-resolved audit as a tombstone.

## Open Knowledge Format Export

- OKF is an exchange/export format for agent-readable project knowledge, not a
  project authority. The source-of-truth docs above always win.
- Run `pnpm docs:okf` to generate a disposable OKF v0.1 bundle under
  `.tmp/okf/` from the current Markdown authority files.
- Generated OKF bundles must stay out of version control unless the owner
  explicitly approves a publishable artifact path.
- Do not create `docs/llm-wiki/`, duplicate rule trees, or copy generated OKF
  content back into source docs. Update the canonical source doc, then
  regenerate the bundle.
