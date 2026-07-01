# Worklog

Worklog chỉ giữ contract hoặc checklist đang còn cần cho một lát việc chưa đóng.
Không dùng thư mục này làm archive, backlog, hay source of truth thứ hai.

## Active Notes

- `order-payment-code-2026-06-26.md` — POS payment-code model (mã `DH...`)
  follow-up; reconciled-through 682126b0.
- `2026-06-28-per-employee-count-slips.md` — owner: `tasks/todo.md`
  per-employee count-slip row.
- `2026-06-28-pos-ingredient-stock-limit.md` — owner: `tasks/todo.md`
  POS sell-limit row.
- `audit-2026-06-28-*.md` — owner:
  `docs/plan/remediation-roadmap-2026-06-28.md`.
- `2026-07-01-pos-drink-kds-routing.md` — owner: `tasks/todo.md`
  split-current-dirty-WIP row.

## Rules

- Mỗi worklog phải có owner hiện tại: runbook, task row, decision, hoặc PR đang mở.
- Khi quyết định đã ổn định, chuyển phần bền về đúng SSOT: `docs/ref/`, `docs/spec/`, `docs/modules/`, `docs/plan/decisions.md`, `tasks/regressions.md`, hoặc `tasks/lessons.md`.
- Nếu worklog chỉ còn là biên bản cũ hoặc audit đã được promote, xóa file thay vì giữ để tham khảo.
- Không thêm dated note mới nếu nội dung có thể sống trực tiếp trong `tasks/todo.md`, ADR, runbook, hoặc canonical reference.
