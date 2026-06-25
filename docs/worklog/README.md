# Worklog

Worklog chỉ giữ contract hoặc checklist đang còn cần cho một lát việc chưa đóng.
Không dùng thư mục này làm archive, backlog, hay source of truth thứ hai.

## Active Notes

- `inventory-matu-platform-import-dry-run-2026-06-22.md` — hợp đồng T3 và đối
  soát chốt import Inventory từ `matu-platform`.
- `inventory-post-import-audit-2026-06-22.md` — mốc nghiệm thu và bằng chứng
  smoke sau import Inventory từ `matu-platform`.
## Rules

- Mỗi worklog phải có owner hiện tại: runbook, task row, decision, hoặc PR đang mở.
- Khi quyết định đã ổn định, chuyển phần bền về đúng SSOT: `docs/ref/`, `docs/spec/`, `docs/modules/`, `docs/plan/decisions.md`, `tasks/regressions.md`, hoặc `tasks/lessons.md`.
- Nếu worklog chỉ còn là biên bản cũ hoặc audit đã được promote, xóa file thay vì giữ để tham khảo.
- Không thêm dated note mới nếu nội dung có thể sống trực tiếp trong `tasks/todo.md`, ADR, runbook, hoặc canonical reference.
