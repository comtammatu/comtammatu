# Docs Index

Điểm vào chung cho hệ thống tài liệu của repo này.

## Trạng thái hiện tại

- Active delivery track: production đang vận hành in-place trên repo
  `comtammatu`; current work phải bám runtime truth của chính repo này.
- Active tracker: [tasks/todo.md](../tasks/todo.md)
- Superseded docs are not retained in this repo. Current contracts must live in `tasks/todo.md`, `docs/plan/adr/`, module docs, specs, runbooks, or canonical references.

## Đọc theo nhu cầu

- Onboarding kỹ thuật: [CODEBASE_MAP.md](CODEBASE_MAP.md)
- Ngôn ngữ chuẩn + thuật ngữ dự án: [ref/glossary.md](ref/glossary.md)
- Skill/plugin/tool routing cho agent: [agent/rules/skills.md](agent/rules/skills.md)
- Kiến trúc hệ thống: [architecture/README.md](architecture/README.md)
- Má Tư visual contract and authority map: [spec/design-system.md](spec/design-system.md)
- UI implementation and Base UI migration guide: [modules/ui.md](modules/ui.md)
- Database schema source ladder: [spec/database-schema.md](spec/database-schema.md)
- Finance active boundary: [modules/finance.md](modules/finance.md)
- Canonical business/reference docs: [ref/README.md](ref/README.md)
- Feature/module architecture: `docs/modules/*`, `docs/spec/*`
- Active planning: `tasks/todo.md`, `docs/plan/adr/*`
- Readiness checklist và smoke gates: [runbooks/README.md](runbooks/README.md)
- Worklog policy: [worklog/README.md](worklog/README.md)
- Xuất tri thức agent dạng OKF tạm thời: `pnpm docs:okf` -> `.tmp/okf/`
  (generated, không phải SSOT)

## Inventory nhanh

- Canonical reference: [ref/inventory.md](ref/inventory.md)
- SOP: [ref/inventory-sop.md](ref/inventory-sop.md)
- QA gate: [runbooks/inventory/pre-release-qa.md](runbooks/inventory/pre-release-qa.md)
- Runtime route/UI contract: [modules/web-app.md](modules/web-app.md)

## Quy ước

- `architecture/`: cross-cutting architecture landing, dẫn sang glossary chuẩn ở `ref/glossary.md`
- `ref/`: canonical rules, boundary, business semantics, glossary chuẩn
- `modules/` và `spec/`: technical structure và schema
- `agent/rules/`: agent entry rules, workflow gates, skill routing, database/UI/engineering constraints
- `spec/design-system.md`: Má Tư visual contract; primitive behavior,
  workflow composition và regression proof có owner riêng trong authority map
- `plan/`: active decisions and ADRs
- `runbooks/`: operational verification
- `worklog/`: policy only; use PR/task notes for transient implementation artifacts
