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

- [employee-portal-home-wave1-2026-05-28.md](employee-portal-home-wave1-2026-05-28.md): T2 contract and acceptance criteria for the first `/employee` home UX refresh
- [employee-portal-schedule-wave2-2026-05-28.md](employee-portal-schedule-wave2-2026-05-28.md): T2 contract for bridging `/employee/schedule` and `/employee/shift-register`
- [employee-portal-clock-attendance-wave3-2026-05-28.md](employee-portal-clock-attendance-wave3-2026-05-28.md): T2 contract for bridging `/employee/clock` and `/employee/attendance`
- [employee-portal-self-service-wave4-2026-05-28.md](employee-portal-self-service-wave4-2026-05-28.md): T2 contract for bridging employee profile, payslip, and permissions
- [employee-portal-missing-profile-wave5-2026-05-28.md](employee-portal-missing-profile-wave5-2026-05-28.md): T2 contract for consistent missing-profile recovery states in employee task routes
- [employee-portal-picker-ergonomics-wave6-2026-05-28.md](employee-portal-picker-ergonomics-wave6-2026-05-28.md): T2 contract for touch-safe week/month pickers in employee schedule and attendance
- [employee-portal-ia-reset-wave7-2026-05-28.md](employee-portal-ia-reset-wave7-2026-05-28.md): T2 contract for resetting `/employee` home back to personal tasks plus separated branch tools
- [admin-employee-portal-acl-2026-05-28.md](admin-employee-portal-acl-2026-05-28.md): T3 contract for keeping admin-level roles on the Admin route instead of `/employee/*`
- [feedback-reference-learning-2026-05-25.md](feedback-reference-learning-2026-05-25.md): learned from `~/matu-feedback` and `~/matu-platform`; recommends a review-conversion gate and Feedback-owned Google review config while preserving `comtammatu` security model
- [pilot-hardening-readiness-2026-05-24.md](pilot-hardening-readiness-2026-05-24.md): hardening board for route-group migration, generated snapshots, payment readiness, network gate, live smoke, and migration status

## Quy tắc

- Ghi ngắn, cập nhật được, và bám đúng trạng thái thực tế
- Khi một lát feature thay đổi materially, cập nhật worklog tương ứng
- Với Inventory, thay đổi UX/IA hoặc workflow wiring phải cập nhật cả adoption matrix và artefact review/contract liên quan
- Nếu một quyết định đã ổn định dài hạn, chuyển nó về `docs/ref/`
- Audit đã bị thay thế hoặc không còn active thì xóa khỏi docs sau khi durable rules đã được promote vào `tasks/regressions.md`, `tasks/lessons.md`, hoặc canonical docs.
