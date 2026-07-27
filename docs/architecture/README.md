# Architecture Landing

Điểm vào chung cho tài liệu kiến trúc cấp hệ thống. `docs/ref/glossary.md` mô tả
vocabulary của source hiện tại; mô hình pháp nhân cũ runtime `matu-prod + app.comtammatu.com` đã
tạm ngưng từ commit `baf3720f8`.

Target Greenfield được triển khai tiếp trong chính repo `comtammatu`, dùng
`matu-greenfield-company + web.comtammatu.com`. Source tiến hóa qua các seam
hiện hữu trong `apps/*` và `packages/*`; không fork repo hoặc dựng runtime sản
phẩm song song.

## Nên đọc trước

- [../ref/glossary.md](../ref/glossary.md) — current-state vocabulary của hệ thống đang chạy
- [../spec/architecture.md](../spec/architecture.md) — tổng quan kiến trúc hệ thống hiện tại
- [target-modules-tech-stack-project-structure.md](target-modules-tech-stack-project-structure.md) — Modules, Tech Specs, Infra và Project Structure mục tiêu
- [../plan/decisions.md](../plan/decisions.md) — net-effect decisions, gồm D015/D082
- [../spec/database-schema.md](../spec/database-schema.md) — schema chuẩn và ranh giới dữ liệu
- [../modules/auth.md](../modules/auth.md) — Auth, JWT claims và ACL của hệ thống hiện tại
- [../ref/business-context.md](../ref/business-context.md) — business boundary và phạm vi sản phẩm
- [../ref/inventory.md](../ref/inventory.md) — semantics chuẩn cho procurement, production, stock, và transfer

## Mục tiêu của thư mục này

- Gói các quyết định kiến trúc cấp hệ thống vào một chỗ dễ tìm
- Dẫn người đọc sang đúng current-state hoặc target vocabulary trước khi viết
  docs, đặt tên module, hoặc thêm copy mới
- Giảm drift giữa business docs, specs, UI copy, và code comments

## Boundary

- `docs/architecture/*`: cross-cutting architecture, decision narrative, và
  entry points tới đúng current-state hoặc target vocabulary
- `docs/ref/glossary.md`: source of truth cho current-state vocabulary và naming
  policy
- `docs/ref/*`: business rules và semantics chi tiết theo domain
- `docs/spec/*`: schema, data flow, diagrams, implementation-facing structure
- `docs/modules/*`: module-level onboarding và blast-radius notes
