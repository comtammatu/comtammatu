# Docs Index

Điểm vào chung cho hệ thống tài liệu của repo này.

## Trạng thái hiện tại

- `main` chỉ phục vụ CTCP Chén Sứ / Cơm Tấm Má Tư.
- Production dùng Vercel project `comtammatu`, Supabase ref
  `enloyfnuerqgaqderbwb` và domain `web.comtammatu.com`.
- Platforms (GitHub CI / Vercel / Supabase): [modules/infrastructure.md](modules/infrastructure.md)
- Current architecture: [spec/architecture.md](spec/architecture.md)
- Active tracker: [tasks/todo.md](../tasks/todo.md)
- `plan/decisions.md` only preserves meanings for referenced `Dxxx` labels.
  ADR status decides whether a direction is Accepted, Proposed, or Parked; ADRs
  are decision records, not the active tracker.
- Superseded plans and snapshots are deleted after their live contract or action
  is promoted to the owning spec, ref, module, runbook, or task. Git history is
  the archive.

## Đọc theo nhu cầu

- Setup local + env Vercel: [ref/setup.md](ref/setup.md)
- Onboarding kỹ thuật: [CODEBASE_MAP.md](CODEBASE_MAP.md)
- Ngôn ngữ chuẩn + thuật ngữ dự án: [ref/glossary.md](ref/glossary.md)
- Skill/plugin/tool routing cho agent: [agent/rules/skills.md](agent/rules/skills.md)
- Kiến trúc hệ thống: [architecture/README.md](architecture/README.md)
- Má Tư visual contract and authority map: [spec/design-system.md](spec/design-system.md)
- PWA install / offline / OS support: [spec/pwa.md](spec/pwa.md)
- UI implementation and Base UI migration guide: [modules/ui.md](modules/ui.md)
- Database schema source ladder: [spec/database-schema.md](spec/database-schema.md)
- Finance active boundary: [modules/finance.md](modules/finance.md)
- Auth/ACL (current + ADR 0015 cutover pointer): [modules/auth.md](modules/auth.md)
- Canonical business/reference docs: [ref/README.md](ref/README.md)
- Feature/module architecture: `docs/modules/*`, `docs/spec/*`
- Active work: `tasks/todo.md`; decision records: `docs/plan/decisions.md` and
  `docs/plan/adr/*`
- Readiness checklist và smoke gates: [runbooks/README.md](runbooks/README.md)
  (gồm inventory, POS/KDS, finance, và `runbooks/db/*`)
- Xuất tri thức agent dạng OKF tạm thời: `corepack pnpm docs:okf` -> `.tmp/okf/`
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
- `plan/`: compatibility decisions, ADR records, and the one active registered
  rollout plan; not implementation SSOT
- `runbooks/`: operational verification (gồm `db/` cho Preview branch và re-baseline)
