# Runbooks

Checklist vận hành và readiness gates.

- Dùng khi cần verify một flow trước khi coi là sẵn sàng.
- Không dùng thư mục này làm source of truth cho business rules; canonical rules vẫn nằm ở `docs/ref/`.

## Inventory

- [inventory/pre-release-qa.md](inventory/pre-release-qa.md): smoke + readiness checklist cho Inventory

## POS / KDS

- [operations-smoke-gate.md](operations-smoke-gate.md): gate vận hành đầu cuối theo chuỗi kết quả ADR 0025 §1
- [food-delivery-platform-onboarding.md](food-delivery-platform-onboarding.md): quyền API, sandbox và readiness gate cho GrabFood, beFood, ShopeeFood, Green SM Food
- [food-delivery-matu-agent.md](food-delivery-matu-agent.md): cài đặt và vận hành Má Tư Agent trên Android cho ShopeeFood, GreenSM Food và beFood
- [hddt-viettel-operations.md](hddt-viettel-operations.md): smoke/reconcile/archive cho Viettel S-invoice
- [pos-kds/print-agent-rollout.md](pos-kds/print-agent-rollout.md): rollout checklist cho print-agent daemon ESC/POS tại chi nhánh
- [pos-kds/realtime-load-testing.md](pos-kds/realtime-load-testing.md): load test realtime POS/KDS

## Finance

- [finance-financial-truth-rollout.md](finance-financial-truth-rollout.md): rollout DB → Preview → Production cho SePay ledger, tiền theo ca POS và Daily Close

## Database

- [db/preview-branch-setup.md](db/preview-branch-setup.md): Preview Supabase branch setup and guard checks
- [db/re-baseline.md](db/re-baseline.md): owner procedure to regenerate the squashed baseline

## Supabase / Schema / Migration

- [../spec/database-schema.md](../spec/database-schema.md): source ladder, migration status vocabulary, and baseline-first layout
- [../../supabase/migrations/README.md](../../supabase/migrations/README.md): fresh-env install order for the public baseline and managed surfaces

## Cách dùng

1. Đọc canonical doc tương ứng trong `docs/ref/`
2. Chạy verify bắt buộc của repo
3. Dùng runbook để kiểm scope vừa thay đổi
4. Nếu có lệch giữa doc và code, cập nhật doc trước khi đánh dấu xong
