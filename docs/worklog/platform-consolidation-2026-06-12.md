# Platform consolidation — khảo sát + harvest checklist (2026-06-12)

Bằng chứng cho quyết định [D015](../plan/decisions.md). Khảo sát đa tác tử 2026-06-12: code 2 repo, dữ liệu prod (SELECT-only), kiểm chứng pháp lý qua web.

## Số liệu prod tại thời điểm quyết định

- 50 ngày live (2026-04-24 → 06-12): orders 6.138 (completed 92,1%, cancelled 7,7%), order_items 12.289, order_status_history 16.729.
- payments 5.676; đã thu 504,6tr VND (cash 81,2%, VietQR 18,8%). MoMo: 0 thành công / 5 failed trong 50 ngày — cần quyết sửa-hay-gỡ.
- tax_invoices 2.876 (issued 2.820) — phát hành hằng ngày qua Viettel S-Invoice; reconcile_run_log 2.825.
- print_jobs 16.664 (~2,7 job/đơn). 4 branches (chi nhánh Đất Đỏ, CN Đất Đỏ, CN Phước Hải, chi nhánh).
- Mật độ đơn x2 trong 7 ngày cuối: ~45 → ~101 đơn/ngày, peak 162 (06-07). Run-rate quy năm ≈ 3–3,7 tỷ → vắt ranh Nhóm 2/Nhóm 3 (mốc 3 tỷ, NĐ 68/2026).
- Module rỗng hoàn toàn trên prod: inventory toàn chuỗi, refunds, payroll, leave, contracts, webhook_events. Bảng expense KHÔNG tồn tại trong schema.

## Gap chính của hệ sống (thứ tự đóng)

1. Daily close UI: RPC `enqueue_shift_close_print` có, không có màn chốt ca/chốt ngày cho staff.
2. Expense: không có bảng — chi vận hành nằm ngoài hệ thống; rủi ro thuế nếu rơi Nhóm 3 (TNCN 17% trên doanh thu − chi phí, sổ S2b–S2e).
3. Idempotency formal: chưa có bảng idempotency_keys; payment/order dựa natural key + provider_ref.
4. HĐĐT: thiếu PDF/XML archive, webhook/poll ingestion trạng thái CQT, daily-summary batch (`tax_invoice_orders` 0 dòng).
5. Accountant export: chưa có gói kê khai quý (TT 152/2025: sổ thu/chi tiền, sổ doanh thu, S1a/S2a-HKD).
6. Test mức DB: 0 pgTAP cho 279 RPC + 273 RLS; chưa có e2e.

## Harvest checklist từ matu-platform (một chiều, viết lại theo convention with-action/RPC)

| # | Tài sản | Nguồn (matu-platform) | Mức |
|---|---|---|---|
| a | pgTAP harness + CI test-db | `packages/database/test/runner.sh`, 44 file `test/rpc|rls/*.test.sql`, `.github/workflows/test-db.yml` | Port tooling nguyên, viết test payment/permission trước |
| b | Idempotency + webhook event-claim | migrations `20260517080148_operator_idempotency_keys`, `20260517155447_pos_order_idempotency_runtime`, `20260601081012_payment_webhook_events` | Port pattern SQL, tích hợp with-action.ts |
| c | Inventory ledger | migrations chuỗi `20260509000003`–`20260525*` (lots, UOM, requisitions `20260517155447`, replenishment `20260519160205`, partial-receive `20260510000008`, production output conversion `20260514153014`/`20260515022953`, recent-cost RPC `20260515171921`) | Spec + migration chọn lọc; cửa sổ 0-data |
| d | HĐĐT worker pattern | `supabase/functions/process-einvoice/` (index.ts, viettel-payload.ts TT78, viettel-response.ts, 3 test), queue `20260512000020` | Harvest pattern queue/retry/vault/token-cache, adapt runtime hiện hành |
| e | PBAC anti-escalation | migrations `20260509000008_pbac_anti_escalation`, `20260514120552_auth_position_pbac_hardening`, grant/revoke/sync RPC | Ý tưởng + RPC chọn lọc |
| f | Feedback module | migrations `20260511000000`–`20260511000007`, `apps/feedback/` | Khi owner/Tài cần; bản hoàn chỉnh duy nhất (hệ sống đã drop 06-09) |
| g | Reports daily shape | `20260603011544_report_branch_net_profit_daily_rpc`, `20260609141056_..._source`, `20260602064948_report_inventory_daily_cost_rpc` | Spec-level cho daily close + dashboard owner |

Không harvest: i18n next-intl, multi-app structure, agent memory foundation, CRM (matu-platform tự xóa `20260609201150_remove_crm_runtime`).

## Pháp lý đã kiểm chứng (06/2026)

NQ 198/2025 (bỏ khoán 01/01/2026), NĐ 70/2025 (MTT ≥1 tỷ, ăn uống), NĐ 68/2026 + TT 18/2026 (4 nhóm, khai quý), NĐ 141/2026 (ngưỡng miễn 1 tỷ hồi tố 01/01/2026 — cần bổ sung docs/ref), TT 152/2025 (sổ sách, lưu ≥5 năm), TT 32/2025 (thay TT 78), GTGT ăn uống 2,4% là giảm tạm thời đến 31/12/2026 (gốc 3%), Luật TNCN 109/2025 hiệu lực 01/07/2026. Kế toán phải xác nhận: xếp nhóm doanh thu, COA, chi phí hợp lệ, thủ tục hủy/thay thế HĐĐT, thời hạn lưu HĐĐT 5 hay 10 năm.
