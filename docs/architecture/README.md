# Architecture Landing

Điểm vào chung cho tài liệu kiến trúc cấp hệ thống. Glossary chuẩn của dự án được giữ tại `docs/ref/glossary.md`.

## Nên đọc trước

- [../ref/glossary.md](../ref/glossary.md) — nguồn chuẩn duy nhất cho ngôn ngữ dự án, thuật ngữ nghiệp vụ, và quy tắc đặt tên
- [../spec/architecture.md](../spec/architecture.md) — tổng quan kiến trúc hệ thống hiện tại
- [../spec/database-schema.md](../spec/database-schema.md) — schema chuẩn và ranh giới dữ liệu
- [../modules/auth.md](../modules/auth.md) — auth, vai trò, JWT claims, ACL
- [../ref/business-context.md](../ref/business-context.md) — business boundary và phạm vi sản phẩm
- [../ref/inventory.md](../ref/inventory.md) — semantics chuẩn cho procurement, production, stock, và transfer

## Mục tiêu của thư mục này

- Gói các quyết định kiến trúc cấp hệ thống vào một chỗ dễ tìm
- Dẫn người đọc sang glossary chuẩn trước khi viết docs, đặt tên module, hoặc thêm copy mới
- Giảm drift giữa business docs, specs, UI copy, và code comments

## Boundary

- `docs/architecture/*`: cross-cutting architecture, decision narrative, và entry points từ kiến trúc sang glossary chuẩn
- `docs/ref/glossary.md`: source of truth cho vocabulary và naming policy
- `docs/ref/*`: business rules và semantics chi tiết theo domain
- `docs/spec/*`: schema, data flow, diagrams, implementation-facing structure
- `docs/modules/*`: module-level onboarding và blast-radius notes
