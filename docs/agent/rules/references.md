# Agent Reference Map

Use this file to find the source-of-truth docs for onboarding, implementation planning, and review.

## System Overview

- Agent entrypoint: `AGENTS.md`
- Codebase map + module index: `docs/CODEBASE_MAP.md`
- Auth & ACL: `docs/modules/auth.md`
- Database: `docs/modules/database.md`
- Finance: `docs/modules/finance.md`
- Web App: `docs/modules/web-app.md`
- UI: `docs/modules/ui.md`
- Security: `docs/modules/security.md`
- Infrastructure: `docs/modules/infrastructure.md`

## Planning And Specs

- Active work tracker: `tasks/todo.md`
- Current technical status: `docs/CODEBASE_MAP.md`
- Architecture decisions: `docs/plan/decisions.md`
- Active ADRs: `docs/plan/adr/`
- System architecture: `docs/spec/architecture.md`
- Database schema source ladder: `docs/spec/database-schema.md`
- Design system contract: `docs/spec/design-system.md`

## Business Domain

- Reference index: `docs/ref/README.md`
- Business context (Hộ Kinh Doanh): `docs/ref/business-context.md`
- Setup guide: `docs/ref/setup.md`
- HĐĐT & Thuế GTGT: `docs/ref/einvoice-tax.md`
- Hợp đồng lao động: `docs/ref/labor-contracts.md`
- Kho hàng (Inventory): `docs/ref/inventory.md`
- Inventory SOP: `docs/ref/inventory-sop.md`
- Inventory training handoff: `docs/ref/inventory-role-handoff.md`
- Inventory RBAC matrix: `docs/ref/inventory-rbac-matrix.md`
- Thuế TNCN & Lương: `docs/ref/payroll-pit.md`

## Meta-Learning

- Regression rules: `tasks/regressions.md`
- Lessons learned: `tasks/lessons.md`
- Current tasks: `tasks/todo.md`
- Runbook index: `docs/runbooks/README.md`
- Worklog index: `docs/worklog/README.md`

## Single Source Of Truth

- Every fact has **one canonical owner**. Find that owner first and update it; do not scatter the same fact across multiple docs.
- Redundancy is allowed only when it is **deliberate and marked**: a mirror exists because a consumer auto-loads only its own entrypoint. Examples in this repo: `AGENTS.md` mirrors Commands / Critical Constraints / Architecture from `docs/agent/rules/engineering.md` because Codex and Cursor auto-load only `AGENTS.md`; `.cursor` / `.codex` entrypoints mirror the same. These are intentional — do **not** collapse them.
- Guard each deliberate mirror with a drift anchor (an HTML comment naming the canonical owner, e.g. `<!-- mirror: docs/agent/rules/engineering.md#commands — keep in sync -->`) and keep both copies in sync when either changes.
- Facts that **every** agent needs go in `docs/agent/rules/` (or `AGENTS.md`), never in one agent's private memory — Codex and Cursor cannot read another agent's memory. Promoting private-memory-only facts into these portable docs is a real fix; killing dead/stale refs is the other half.

## Docs Keep Lean

- **Prefer updating an existing doc over adding a new one.** Do not pile miscellaneous, stale, or one-off files into `docs/`.
- Do **not** create separate agent-only doc trees such as `docs/llm-wiki/`; place durable content in the normal source-of-truth docs above.
- Honor the retention policy in `docs/worklog/README.md`: promote stable decisions into `docs/ref/` (or the canonical doc), and delete dead audit/progress logs after their durable rules are promoted into `tasks/regressions.md`, `tasks/lessons.md`, or canonical docs.
- Never bulk-delete docs without owner confirmation. If a doc looks fully dead, **flag it for the owner** rather than deleting it.
- Do not add an archive tree or keep superseded implementation plans in the repo. When a decision is current, promote it into the source-of-truth doc above; when it is not current, remove it (subject to the no-bulk-delete rule above).

## Memory Maintenance Rules

- Put durable policy in `AGENTS.md` or topic files under `docs/agent/rules/`.
- Do not create separate agent-only docs such as `docs/llm-wiki/`; place durable content in the normal source-of-truth docs above.
- Put incident-specific failure prevention in `tasks/regressions.md`.
- Put retrospective explanations in `tasks/lessons.md`.
- Keep user-local or machine-local notes out of version-controlled shared rule files.
- Keep rules concrete and verifiable. Avoid vague guidance such as "write good code" or "be careful".
