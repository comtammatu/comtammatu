# Docs Index

Điểm vào chung cho hệ thống tài liệu của repo này.

## Trạng thái hiện tại

- Active delivery track: production đang vận hành in-place trên repo `comtammatu`; ongoing work là hardening + feature follow-ups.
- Active tracker: [tasks/todo.md](../tasks/todo.md)
- Retired docs are not retained in this repo. Current decisions must live in `tasks/todo.md`, `docs/plan/adr/`, `docs/plan/decisions.md`, module docs, specs, runbooks, or canonical references.

## Đọc theo nhu cầu

- Onboarding kỹ thuật: [CODEBASE_MAP.md](CODEBASE_MAP.md)
- Ngôn ngữ chuẩn + thuật ngữ dự án: [ref/glossary.md](ref/glossary.md)
- Kiến trúc hệ thống: [architecture/README.md](architecture/README.md)
- UI Design System SSOT: [spec/design-system.md](spec/design-system.md)
- UI implementation guide: [modules/ui.md](modules/ui.md)
- Database schema source ladder: [spec/database-schema.md](spec/database-schema.md)
- Finance active boundary: [modules/finance.md](modules/finance.md)
- Canonical business/reference docs: [ref/README.md](ref/README.md)
- Feature/module architecture: `docs/modules/*`, `docs/spec/*`
- Active planning: `tasks/todo.md`, `docs/plan/adr/*`, `docs/plan/decisions.md`
- Readiness checklist và smoke gates: [runbooks/README.md](runbooks/README.md)
- Continuity / adoption tracking: [worklog/README.md](worklog/README.md)

## Inventory nhanh

- Canonical reference: [ref/inventory.md](ref/inventory.md)
- Sơ đồ tổng quan: [spec/inventory-overview-diagrams.md](spec/inventory-overview-diagrams.md)
- SOP: [ref/inventory-sop.md](ref/inventory-sop.md)
- Training 1 trang: [ref/inventory-role-handoff.md](ref/inventory-role-handoff.md)
- RBAC matrix: [ref/inventory-rbac-matrix.md](ref/inventory-rbac-matrix.md)
- QA gate: [runbooks/inventory/pre-release-qa.md](runbooks/inventory/pre-release-qa.md)
- Adoption tracking: [worklog/inventory/adoption-matrix.md](worklog/inventory/adoption-matrix.md)
- UX workflow review: [worklog/inventory/inventory-ux-workflow-review.md](worklog/inventory/inventory-ux-workflow-review.md)
- UX contract đã chốt: [worklog/inventory/inventory-ux-contract.md](worklog/inventory/inventory-ux-contract.md)

### Trạng thái Inventory hiện tại

- Procurement UI đã chốt là `HQ procurement hub`: `Receiving -> PO -> GRN -> supplier invoice`
- Branch flow hiện đi theo `Nhận transfer -> Cấp bếp -> Stocktake/alerts`, không dùng `Receiving` như generic inbound hub
- Dashboard `/inventory` đã chuyển sang `task queue first`
- `Ingredients / Suppliers / Recipes` đã canonical về `Danh mục`; các route cũ trong `Settings` chỉ còn giữ redirect tương thích

## Quy ước

- `architecture/`: cross-cutting architecture và các điểm vào/alias sang glossary chuẩn
- `ref/`: canonical rules, boundary, business semantics, glossary chuẩn
- `modules/` và `spec/`: technical structure và schema
- `spec/design-system.md`: single source of truth cho UI design-system; runtime configs, primitives, adapters, and regression rules only enforce it
- `plan/`: active decisions and ADRs
- `runbooks/`: operational verification
- `worklog/`: evolving progress/adoption artefacts
