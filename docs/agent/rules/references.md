# Agent Reference Map

Use this file to find the source-of-truth docs for onboarding, implementation planning, and review.

## System Overview

- Codebase map + module index: `docs/CODEBASE_MAP.md`
- Auth & ACL: `docs/modules/auth.md`
- Database: `docs/modules/database.md`
- Web App: `docs/modules/web-app.md`
- UI: `docs/modules/ui.md`
- Security: `docs/modules/security.md`
- Infrastructure: `docs/modules/infrastructure.md`

## Planning And Specs

- Roadmap + phases: `docs/plan/roadmap.md`
- UI/UX rebuild plan: `docs/plan/ui-ux-rebuild.md`
- UI/UX page contracts: `docs/plan/ui-ux-page-contracts.md`
- M2-Ext POS order lifecycle: `docs/plan/m2-order-lifecycle.md`
- Architecture decisions: `docs/plan/decisions.md`
- System architecture: `docs/spec/architecture.md`
- Database schema: `docs/spec/database-schema.md`
- Design system contract: `docs/spec/design-system.md`

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
- Inventory ERP gap matrix: `docs/ref/inventory-erp-gap-matrix.md`
- Thuế TNCN & Lương: `docs/ref/payroll-pit.md`

## Meta-Learning

- Regression rules: `tasks/regressions.md`
- Lessons learned: `tasks/lessons.md`
- Current tasks: `tasks/todo.md`
- Runbook index: `docs/runbooks/README.md`
- Worklog index: `docs/worklog/README.md`

## Memory Maintenance Rules

- Put durable policy in `AGENTS.md` or topic files under `docs/agent/rules/`.
- Put incident-specific failure prevention in `tasks/regressions.md`.
- Put retrospective explanations in `tasks/lessons.md`.
- Keep user-local or machine-local notes out of version-controlled shared rule files.
- Keep rules concrete and verifiable. Avoid vague guidance such as "write good code" or "be careful".

