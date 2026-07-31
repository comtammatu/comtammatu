# Docs Index

Common entry point for this repository's documentation.

## Current State

- Current operating branch: Production runs in place on `phuoc-hai`; current work
  must follow the runtime truth of this branch.
- Active tracker: [tasks/todo.md](../tasks/todo.md)
- Superseded docs are not retained in this repo. Current contracts must live in `tasks/todo.md`, `docs/plan/adr/`, module docs, specs, runbooks, or canonical references.

## Read by Need

- Technical onboarding: [CODEBASE_MAP.md](CODEBASE_MAP.md)
- Canonical language and project terminology: [ref/glossary.md](ref/glossary.md)
- Agent skill/plugin/tool routing: [agent/rules/skills.md](agent/rules/skills.md)
- System architecture: [architecture/README.md](architecture/README.md)
- Má Tư visual contract and authority map: [spec/design-system.md](spec/design-system.md)
- UI implementation and Base UI migration guide: [modules/ui.md](modules/ui.md)
- Database schema source ladder: [spec/database-schema.md](spec/database-schema.md)
- Finance active boundary: [modules/finance.md](modules/finance.md)
- Canonical business/reference docs: [ref/README.md](ref/README.md)
- Feature/module architecture: `docs/modules/*`, `docs/spec/*`
- Active planning: `tasks/todo.md`, `docs/plan/adr/*`
- Readiness checklist and smoke gates: [runbooks/README.md](runbooks/README.md)
- Worklog policy: [worklog/README.md](worklog/README.md)
- Temporary OKF agent knowledge export: `pnpm docs:okf` -> `.tmp/okf/`
  (generated, not an SSOT)

## Quick Inventory

- Canonical reference: [ref/inventory.md](ref/inventory.md)
- SOP: [ref/inventory-sop.md](ref/inventory-sop.md)
- QA gate: [runbooks/inventory/pre-release-qa.md](runbooks/inventory/pre-release-qa.md)
- Runtime route/UI contract: [modules/web-app.md](modules/web-app.md)

## Conventions

- `architecture/`: cross-cutting architecture landing, linking to the canonical glossary in `ref/glossary.md`
- `ref/`: canonical rules, boundaries, business semantics, and glossary
- `modules/` and `spec/`: technical structure and schema
- `agent/rules/`: agent entry rules, workflow gates, skill routing, database/UI/engineering constraints
- `spec/design-system.md`: Má Tư visual contract; primitive behavior, workflow
  composition, and regression proof have separate owners in the authority map
- `plan/`: active decisions and ADRs
- `runbooks/`: operational verification
- `worklog/`: policy only; use PR/task notes for transient implementation artifacts
