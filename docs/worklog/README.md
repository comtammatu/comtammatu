# Worklog

Nơi lưu các artefact theo dõi tiến độ và adoption.

- Dùng cho continuity, planning, và sign-off nhẹ.
- Không dùng làm source of truth thay cho `docs/ref/`, `docs/spec/`, hoặc `tasks/regressions.md`.

## Inventory

- [inventory/adoption-matrix.md](inventory/adoption-matrix.md): theo dõi trạng thái `doc / code / verify / decision`
- [inventory/evidence-log.md](inventory/evidence-log.md): log evidence cho từng round QA UI/UX
- [inventory/inventory-ux-workflow-review.md](inventory/inventory-ux-workflow-review.md): review workflow/IA trước refactor UI
- [inventory/inventory-ux-contract.md](inventory/inventory-ux-contract.md): contract UX đã chốt cho pilot hiện tại
- [inventory/inventory-pilot-contract-v2.md](inventory/inventory-pilot-contract-v2.md): handoff contract + prompt cho Inventory pilot 4 điểm

## Active Notes

- [employee-daily-work-v1-2026-06-09.md](employee-daily-work-v1-2026-06-09.md): Employee daily-work contract hiện tại
- [pos-item-level-discount-migration-2026-06-09.md](pos-item-level-discount-migration-2026-06-09.md): item-level discount money migration contract
- [pos-shift-close-discount-hddt-2026-06-09.md](pos-shift-close-discount-hddt-2026-06-09.md): close-shift + HĐĐT discount hotfix contract
- [runner-public-display-2026-06-09.md](runner-public-display-2026-06-09.md): Runner public customer display contract
- [runner-kds-status-logic-2026-06-09.md](runner-kds-status-logic-2026-06-09.md): Runner queue visibility rule
- [pilot-hardening-readiness-2026-05-24.md](pilot-hardening-readiness-2026-05-24.md): historical pre-launch snapshot still referenced by current tracker

## Quy tắc

- Ghi ngắn, cập nhật được, và bám đúng trạng thái thực tế
- Khi một lát feature thay đổi materially, cập nhật worklog tương ứng
- Với Inventory, thay đổi UX/IA hoặc workflow wiring phải cập nhật cả adoption matrix và artefact review/contract liên quan
- Nếu một quyết định đã ổn định dài hạn, chuyển nó về đúng SSOT: business vào `docs/ref/`, design-system vào `docs/spec/design-system.md`, agent/process rule vào `docs/agent/rules/` hoặc `tasks/regressions.md`
- Audit đã bị thay thế hoặc không còn active thì xóa khỏi docs sau khi durable rules đã được promote vào `tasks/regressions.md`, `tasks/lessons.md`, hoặc canonical docs.
