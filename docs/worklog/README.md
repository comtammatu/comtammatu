# Worklog

Nơi lưu các artefact theo dõi tiến độ và adoption.

- Dùng cho continuity, planning, và sign-off nhẹ.
- Không dùng làm source of truth thay cho `docs/ref/`, `docs/spec/`, hoặc `tasks/regressions.md`.

## Active Notes

- [platform-consolidation-2026-06-12.md](platform-consolidation-2026-06-12.md): bằng chứng khảo sát + harvest checklist cho D015 (một Platform, matu-platform freeze)
- [role-route-restructure-2026-06-13.md](role-route-restructure-2026-06-13.md): T3 contract tách L0 Admin/Tenant Command khỏi L1 Branch Command cho Branch Manager (D017)
- [ui-surface-workflow-audit-2026-06-13.md](ui-surface-workflow-audit-2026-06-13.md): audit route/shell/component/workflow drift trước khi gom UI về surface contract
- [db-data-cleanup-2026-06-12.md](db-data-cleanup-2026-06-12.md): DB data cleanup retention, April order test-data audit, và applied Inventory full reset
- [hrm-truc-ngay-cong-2026-06-10.md](hrm-truc-ngay-cong-2026-06-10.md): HRM "1 trục Ngày công" T3 contract (bỏ đăng ký ca/phân ca) — contract nguồn được migrations `20260610234500` + `20260611103000` + static test trỏ tới

## Quy tắc

- Ghi ngắn, cập nhật được, và bám đúng trạng thái thực tế
- Khi một lát feature thay đổi materially, cập nhật worklog tương ứng
- Với Inventory, thay đổi UX/IA hoặc workflow wiring phải cập nhật `docs/ref/inventory.md`, `docs/ref/inventory-sop.md`, `docs/ref/inventory-rbac-matrix.md`, và `docs/modules/web-app.md` theo phạm vi thay đổi
- Nếu một quyết định đã ổn định dài hạn, chuyển nó về đúng SSOT: business vào `docs/ref/`, design-system vào `docs/spec/design-system.md`, agent/process rule vào `docs/agent/rules/` hoặc `tasks/regressions.md`
- Audit đã bị thay thế hoặc không còn active thì xóa khỏi docs sau khi durable rules đã được promote vào `tasks/regressions.md`, `tasks/lessons.md`, hoặc canonical docs.
