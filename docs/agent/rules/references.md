# Agent Reference Map

Use this file to find the source-of-truth docs for onboarding, implementation planning, and review.

## System Overview

- Agent entrypoint: `AGENTS.md`
- Skill/plugin/tool routing: `docs/agent/rules/skills.md`
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
- HKD business context: `docs/ref/business-context.md`

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
- Keep secrets, generated sessions, cache files, and per-user local notes out of
  version-controlled shared rule files.
- Keep rules concrete and verifiable. Avoid vague guidance such as "write good code" or "be careful".
- Do not add an archive tree or keep superseded implementation plans in the repo. When a decision is current, promote it into the source-of-truth doc above; when it is not current, remove it.
