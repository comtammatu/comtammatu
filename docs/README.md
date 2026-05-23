# Docs Index

Điểm vào chung cho hệ thống tài liệu của repo này.

## Trạng thái hiện tại

- Active delivery track: tiếp tục phát triển in-place trên repo `comtammatu` cho pilot/hardening.
- Active tracker: [tasks/todo.md](../tasks/todo.md)
- Greenfield rebuild pack under `docs/archive/plan/system-rebuild/` is suspended/historical reference as of 2026-05-23. Do not treat its in-place freeze or cutover steps as active unless owner explicitly reactivates it.

## Đọc theo nhu cầu

- Onboarding kỹ thuật: [CODEBASE_MAP.md](CODEBASE_MAP.md)
- Ngôn ngữ chuẩn + thuật ngữ dự án: [ref/glossary.md](ref/glossary.md)
- Kiến trúc hệ thống: [architecture/README.md](architecture/README.md)
- Canonical business/reference docs: [ref/README.md](ref/README.md)
- Feature/module architecture: `docs/modules/*`, `docs/spec/*`
- Active planning: `tasks/todo.md`, `docs/plan/adr/*`, `docs/plan/decisions.md`
- Suspended greenfield rebuild reference: `docs/archive/plan/system-rebuild/*`
- Historical/superseded plans: `docs/archive/plan/*`
- Readiness checklist và smoke gates: [runbooks/README.md](runbooks/README.md)
- Continuity / adoption tracking: [worklog/README.md](worklog/README.md)

## Inventory nhanh

- Canonical reference: [ref/inventory.md](ref/inventory.md)
- Sơ đồ tổng quan: [spec/inventory-overview-diagrams.md](spec/inventory-overview-diagrams.md)
- Thiết kế location ledger historical: [archive/plan/inventory-location-ledger.md](archive/plan/inventory-location-ledger.md)
- Contract Phase 2 historical: [archive/plan/inventory-location-ledger-phase2.md](archive/plan/inventory-location-ledger-phase2.md)
- App patch map Phase 2 historical: [archive/plan/inventory-location-ledger-phase2-app-patch.md](archive/plan/inventory-location-ledger-phase2-app-patch.md)
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
- `plan/`: active decisions and ADRs
- `archive/plan/`: superseded roadmap, sprint, and historical plan snapshots
- `archive/ref/` and `archive/worklog/`: historical references and superseded audits
- `runbooks/`: operational verification
- `worklog/`: evolving progress/adoption artefacts
