# Backlog — Post-Pilot Features

> Features đã review nhưng defer ra sau v1.0.0 pilot.
> Promote vào sprint khi pilot stable.

## Post-Pilot (Priority Order)

### Notifications System

- `notifications` table + `push_subscriptions`
- In-app alerts: low stock, order ready, shift reminder
- Push notifications (web + mobile)
- **Depends on:** M2 (POS) + M5 (Stock)

### Waste Logs

- `waste_logs` table — ghi nhận hao hụt/hư hỏng nguyên liệu
- Stock movement type='waste'
- Food cost accuracy improvement
- **Depends on:** M5 (Stock)

### Stock Counts (Kiểm kê)

- `stock_counts` + `stock_count_items` tables
- Kiểm kê thực tế vs hệ thống
- Variance report
- **Depends on:** M5 (Stock)

### KDS Timing Rules

- `kds_timing_rules` table — cảnh báo món chậm theo category
- Color escalation: green → yellow → red
- **Depends on:** M3 (KDS)

### Warehouses + Stock Transfers

- `warehouses` table — kho tổng + kho chi nhánh
- `stock_transfer_requests` + `stock_transfer_request_items`
- Central warehouse → branch transfers
- **Depends on:** M5 (Stock)

## Post-v1.0 (Tier 2)

### Delivery Integration

- `delivery_orders` + `delivery_platforms` + `platform_menu_mappings`
- GrabFood + ShopeeFood auto-sync
- **Depends on:** M2 (POS) + M1 (Menu)

### Marketing Campaigns

- `campaigns` + `campaign_recipients`
- Zalo OA/ZNS notifications
- Targeted promotions
- **Depends on:** Post-v1.0 (Loyalty)

### Device Registration

- `registered_devices` table — POS device management
- Approve/reject devices per branch
- **Depends on:** M2 (POS)

### Leave Management

- `leave_requests` table — xin nghỉ phép
- Approval workflow (employee → manager)
- **Depends on:** M7 (HR/Payroll)

### Shift Assignments

- `shift_assignments` table — phân ca tự động/thủ công
- Calendar view
- **Depends on:** M7 (HR/Payroll)

## Explicitly Excluded (from greenfield)

| Feature                 | Reason                                             |
| ----------------------- | -------------------------------------------------- |
| `menus` (wrapper table) | Old multi-brand pattern. Direct categories → items |
| `menu_branches`         | Single-tenant, no per-branch menu variants         |
| `deletion_requests`     | GDPR-style. Not required for internal F&B          |
| `security_events`       | Merged into audit_logs                             |
| `registered_devices`    | Simplified — POS terminals handle device identity  |
