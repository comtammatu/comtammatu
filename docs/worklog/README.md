# Worklog

Nơi lưu các artefact theo dõi tiến độ và adoption.

- Dùng cho continuity, planning, và sign-off nhẹ.
- Không dùng làm source of truth thay cho `docs/ref/`, `docs/spec/`, hoặc `tasks/regressions.md`.

## Active Notes

- [employee-daily-work-2026-06-09.md](employee-daily-work-2026-06-09.md): Employee daily-work contract hiện tại
- [employee-leave-requests-2026-06-10.md](employee-leave-requests-2026-06-10.md): Employee leave request + HRM approval contract
- [employee-checkout-approval-2026-06-09.md](employee-checkout-approval-2026-06-09.md): checkout approval contract cho Employee daily work
- [migration-hotfix-2026-06-09.md](migration-hotfix-2026-06-09.md): T3 contract cho migration hotfix scope trung gian + employee clock-in
- [pos-item-level-discount-migration-2026-06-09.md](pos-item-level-discount-migration-2026-06-09.md): item-level discount money migration contract
- [pos-shift-close-discount-hddt-2026-06-09.md](pos-shift-close-discount-hddt-2026-06-09.md): close-shift + HĐĐT discount hotfix contract
- [finance-revenue-date-range-2026-06-09.md](finance-revenue-date-range-2026-06-09.md): Finance Revenue range-bound top items contract
- [runner-public-display-2026-06-09.md](runner-public-display-2026-06-09.md): Runner public customer display contract
- [runner-kds-status-logic-2026-06-09.md](runner-kds-status-logic-2026-06-09.md): Runner queue visibility rule
- [runner-idle-mascot-visual-2026-06-09.md](runner-idle-mascot-visual-2026-06-09.md): Runner idle visual contract

## Quy tắc

- Ghi ngắn, cập nhật được, và bám đúng trạng thái thực tế
- Khi một lát feature thay đổi materially, cập nhật worklog tương ứng
- Với Inventory, thay đổi UX/IA hoặc workflow wiring phải cập nhật `docs/ref/inventory.md`, `docs/ref/inventory-sop.md`, `docs/ref/inventory-rbac-matrix.md`, và `docs/modules/web-app.md` theo phạm vi thay đổi
- Nếu một quyết định đã ổn định dài hạn, chuyển nó về đúng SSOT: business vào `docs/ref/`, design-system vào `docs/spec/design-system.md`, agent/process rule vào `docs/agent/rules/` hoặc `tasks/regressions.md`
- Audit đã bị thay thế hoặc không còn active thì xóa khỏi docs sau khi durable rules đã được promote vào `tasks/regressions.md`, `tasks/lessons.md`, hoặc canonical docs.
