# Worklog

Nơi lưu các artefact theo dõi tiến độ và adoption.

- Dùng cho continuity, planning, và sign-off nhẹ.
- Không dùng làm source of truth thay cho `docs/ref/`.

## Inventory

- [inventory/adoption-matrix.md](inventory/adoption-matrix.md): theo dõi trạng thái `doc / code / verify / decision`
- [inventory/evidence-log.md](inventory/evidence-log.md): log evidence cho từng round QA UI/UX
- [inventory/inventory-ux-workflow-review.md](inventory/inventory-ux-workflow-review.md): review workflow/IA trước refactor UI
- [inventory/inventory-ux-contract.md](inventory/inventory-ux-contract.md): contract UX đã chốt cho pilot hiện tại
- [inventory/inventory-pilot-contract-v2.md](inventory/inventory-pilot-contract-v2.md): handoff contract + prompt cho Inventory pilot 4 điểm

## Maintenance

- [pilot-hardening-readiness-2026-05-24.md](pilot-hardening-readiness-2026-05-24.md): hardening board for route-group migration, generated snapshots, payment readiness, network gate, live smoke, and migration status
- [ui-design-system-ssot-audit-2026-05-24.md](ui-design-system-ssot-audit-2026-05-24.md): audit và khóa lại source-of-truth cho Design System, typography, spacing, và legacy `matu-*` layer
- [task-regression-cleanup-2026-05-23.md](task-regression-cleanup-2026-05-23.md): first pass cleanup for top-level `tasks/` and `tasks/regressions.md`

## Quy tắc

- Ghi ngắn, cập nhật được, và bám đúng trạng thái thực tế
- Khi một lát feature thay đổi materially, cập nhật worklog tương ứng
- Với Inventory, thay đổi UX/IA hoặc workflow wiring phải cập nhật cả adoption matrix và artefact review/contract liên quan
- Nếu một quyết định đã ổn định dài hạn, chuyển nó về `docs/ref/`
- Audit đã bị thay thế hoặc không còn active thì chuyển về `docs/archive/worklog/`
- Task/report snapshot đã đóng thì chuyển về `docs/archive/worklog/tasks/`
