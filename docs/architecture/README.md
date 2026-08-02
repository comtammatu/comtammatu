# Architecture Landing

Điểm vào chung cho tài liệu kiến trúc cấp hệ thống. `docs/ref/glossary.md` mô tả
vocabulary của source hiện tại. `docs/spec/architecture.md` là nguồn duy nhất
cho runtime architecture, package graph và quy tắc đặt code hiện hành. Trạng
thái triển khai và công việc theo ngày thuộc runbook hoặc `tasks/todo.md`.

Source tiến hóa qua các seam hiện hữu trong `apps/*` và `packages/*`; không fork
repo hoặc dựng runtime sản phẩm song song.

## Nên đọc trước

- [../spec/architecture.md](../spec/architecture.md) — **current** architecture + Product Dual Thesis (Hệ thống + Vận hành bán hàng)
- [../ref/glossary.md](../ref/glossary.md) — current-state vocabulary của hệ thống đang chạy
- [../plan/decisions.md](../plan/decisions.md) — net-effect decisions, gồm D015/D091
- [../spec/database-schema.md](../spec/database-schema.md) — schema chuẩn và ranh giới dữ liệu
- [../modules/auth.md](../modules/auth.md) — Auth, JWT claims và ACL của hệ thống hiện tại
- [../ref/business-context.md](../ref/business-context.md) — business boundary và phạm vi sản phẩm
- [../ref/inventory.md](../ref/inventory.md) — semantics chuẩn cho procurement, production, stock, và transfer

## Định hướng có điều kiện

- [target-authorization.md](target-authorization.md) mô tả đích cutover quyền
  truy cập đã được ADR 0015 chấp thuận; runtime hiện tại vẫn phải đọc
  `docs/modules/auth.md` và source ACL/RLS.
- [sunmi-v3-pda-support.md](sunmi-v3-pda-support.md) và
  [sunmi-v3-device-research.md](sunmi-v3-device-research.md) là đề xuất pilot có
  cổng dừng theo đúng SKU và bằng chứng máy thật; chưa phải runtime contract.

## Mục tiêu của thư mục này

- Dẫn người đọc đến đúng SSOT trước khi viết docs, đặt tên module hoặc thêm copy
- Giảm drift giữa business docs, specs, UI copy, và code comments

## Boundary

- `docs/spec/architecture.md`: current runtime/package/module contract
- `docs/architecture/*`: landing và narrative cross-cutting có điều kiện; không
  lặp lại current contract hoặc lưu implementation plan đã hoàn tất
- `docs/ref/glossary.md`: source of truth cho current-state vocabulary và naming
  policy
- `docs/ref/*`: business rules và semantics chi tiết theo domain
- `docs/spec/*`: schema, data flow, diagrams, implementation-facing structure
- `docs/modules/*`: module-level onboarding và blast-radius notes
