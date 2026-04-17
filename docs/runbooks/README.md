# Runbooks

Checklist vận hành và readiness gates.

- Dùng khi cần verify một flow trước khi coi là sẵn sàng.
- Không dùng thư mục này làm source of truth cho business rules; canonical rules vẫn nằm ở `docs/ref/`.

## Inventory

- [inventory/pre-release-qa.md](inventory/pre-release-qa.md): smoke + readiness checklist cho Inventory
- [inventory/ui-ux-rubric.md](inventory/ui-ux-rubric.md): rubric chấm UI/UX theo operator và thiết bị thật
- [inventory/operator-journeys.md](inventory/operator-journeys.md): kịch bản đóng vai nhân viên vận hành mỗi ngày
- [inventory/route-cta-matrix.md](inventory/route-cta-matrix.md): ma trận route, section, CTA, role, device, severity

## Cách dùng

1. Đọc canonical doc tương ứng trong `docs/ref/`
2. Chạy verify bắt buộc của repo
3. Dùng runbook để kiểm scope vừa thay đổi
4. Nếu có lệch giữa doc và code, cập nhật doc trước khi đánh dấu xong
