# Worklog

Nơi lưu các artefact theo dõi tiến độ và adoption.

- Dùng cho continuity, planning, và sign-off nhẹ.
- Không dùng làm source of truth thay cho `docs/ref/`, `docs/spec/`, hoặc `tasks/regressions.md`.

## Active Notes

- [hrm-truc-ngay-cong-2026-06-10.md](hrm-truc-ngay-cong-2026-06-10.md): HRM "1 trục Ngày công" contract (bỏ đăng ký ca/phân ca)
- [employee-daily-work-2026-06-09.md](employee-daily-work-2026-06-09.md): Employee daily-work contract hiện tại
- [employee-pwa-shell-2026-06-11.md](employee-pwa-shell-2026-06-11.md): Employee PWA shell và install/offline affordance
- [employee-leave-requests-2026-06-10.md](employee-leave-requests-2026-06-10.md): Employee leave request + HRM approval contract
- [employee-checkout-approval-2026-06-09.md](employee-checkout-approval-2026-06-09.md): checkout approval contract cho Employee daily work
- [pos-daily-limit-holds-2026-06-10.md](pos-daily-limit-holds-2026-06-10.md): daily-limit hold reservation contract cho POS order create/append
- [hr-checklist-template-library-2026-06-10.md](hr-checklist-template-library-2026-06-10.md): HR checklist template library + employee daily checklist contract
- [notifications-pwa-cleanup-2026-06-10.md](notifications-pwa-cleanup-2026-06-10.md): Notification inbox + PWA push cleanup contract

## Quy tắc

- Ghi ngắn, cập nhật được, và bám đúng trạng thái thực tế
- Khi một lát feature thay đổi materially, cập nhật worklog tương ứng
- Với Inventory, thay đổi UX/IA hoặc workflow wiring phải cập nhật `docs/ref/inventory.md`, `docs/ref/inventory-sop.md`, `docs/ref/inventory-rbac-matrix.md`, và `docs/modules/web-app.md` theo phạm vi thay đổi
- Nếu một quyết định đã ổn định dài hạn, chuyển nó về đúng SSOT: business vào `docs/ref/`, design-system vào `docs/spec/design-system.md`, agent/process rule vào `docs/agent/rules/` hoặc `tasks/regressions.md`
- Audit đã bị thay thế hoặc không còn active thì xóa khỏi docs sau khi durable rules đã được promote vào `tasks/regressions.md`, `tasks/lessons.md`, hoặc canonical docs.
