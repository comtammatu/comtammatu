# Agent Reference Map

Use this file to find the source-of-truth docs for onboarding, implementation planning, and review.

## System Overview

- LLM fast-orientation wiki: `docs/llm-wiki/README.md`
- Codebase map + module index: `docs/CODEBASE_MAP.md`
- Auth & ACL: `docs/modules/auth.md`
- Database: `docs/modules/database.md`
- Web App: `docs/modules/web-app.md`
- UI: `docs/modules/ui.md`
- Security: `docs/modules/security.md`
- Infrastructure: `docs/modules/infrastructure.md`

## Planning And Specs

- Active work tracker: `tasks/todo.md`
- Current technical status: `docs/CODEBASE_MAP.md`
- Architecture decisions: `docs/plan/decisions.md`
- Active ADRs: `docs/plan/adr/`
- Archived greenfield ADRs: `docs/archive/plan/adr/`
- System architecture: `docs/spec/architecture.md`
- Database schema: `docs/spec/database-schema.md`
- Design system contract: `docs/spec/design-system.md`
- Suspended greenfield rebuild reference: `docs/archive/plan/system-rebuild/`
- Historical plans only: `docs/archive/plan/`
- Historical refs/worklogs only: `docs/archive/ref/`, `docs/archive/worklog/`

## Business Domain

- Reference index: `docs/ref/README.md`
- CTCP business context: `docs/ref/business-context.md`
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
- Historical task worklogs: `docs/archive/worklog/tasks/`
- Runbook index: `docs/runbooks/README.md`
- Worklog index: `docs/worklog/README.md`

## Memory Maintenance Rules

- Put durable policy in `AGENTS.md` or topic files under `docs/agent/rules/`.
- Put incident-specific failure prevention in `tasks/regressions.md`.
- Put retrospective explanations in `tasks/lessons.md`.
- Keep user-local or machine-local notes out of version-controlled shared rule files.
- Keep rules concrete and verifiable. Avoid vague guidance such as "write good code" or "be careful".
