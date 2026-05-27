# POS / KDS — Payment Autopost Verify

Checklist này dùng khi owner chuẩn bị apply migration `20260419220000_gl_payment_autopost_nonfatal.sql` và cần xác nhận POS/KDS không còn bị block bởi cấu hình GL thiếu.

## Mục tiêu

- Cash payment vẫn chốt đơn dù `posting_rules`, `chart_of_accounts`, hoặc `fiscal_periods` chưa đầy đủ.
- VietQR/MoMo confirm cũng giữ nguyên triết lý non-fatal với GL autopost.
- KDS smoke vẫn ổn sau các thay đổi E2E fixture/runtime.

## Trước khi apply

1. Xác nhận file migration mới có mặt trong repo:
   - `supabase/migrations/20260419220000_gl_payment_autopost_nonfatal.sql`
2. Xác nhận bug hiện tại đã được tái hiện:
   - Cash payment có thể fail với `posting_rule_not_found: SALE_CASH for tenant 2`
3. Đảm bảo môi trường test có:
   - `E2E_CASHIER_EMAIL`
   - `E2E_CASHIER_PASSWORD`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

## Apply migration

1. Owner apply migration theo quy trình Supabase hiện tại của dự án.
2. Không chạy migration trực tiếp từ agent local nếu chưa qua quy trình owner approval.

## Verify sau apply

1. Khởi động app local:

```bash
pnpm dev
```

2. Chạy smoke POS cash:

```bash
cd apps/web
pnpm exec dotenv -e .env.test.local -- playwright test payment-cash.spec.ts --project=chromium
```

Kỳ vọng:

- Test `paying a confirmed order completes the order and releases the table without touching KDS` pass
- Order chuyển `unpaid -> paid`, `orders.status='completed'`
- Bàn dine-in tự chuyển `available` sau payment-close; không còn bước `trả bàn` riêng
- KDS ticket chưa xong vẫn giữ trạng thái bếp và tiếp tục hiển thị trên KDS

3. Chạy smoke KDS:

```bash
cd apps/web
pnpm exec dotenv -e .env.test.local -- playwright test kds-queue.spec.ts --project=chromium
```

Kỳ vọng:

- Ticket bump `pending -> preparing -> ready`
- Recall `ready -> preparing -> pending`

4. Chạy verify bắt buộc của repo:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

## Nếu cash payment vẫn fail

1. Kiểm tra log server action `createPayment`
2. Tìm các dấu hiệu sau:
   - `posting_rule_not_found`
   - `gl_account_not_found`
   - `fiscal_period_closed`
3. Nếu vẫn còn các lỗi trên sau apply, xác nhận migration đã được apply đúng project/database
4. Nếu payment chuyển `paid` nhưng journal trống:
   - chấp nhận được theo contract non-fatal của vòng này
   - backoffice reconcile sau, không block cashier

## Evidence cần ghi lại

- Kết quả Playwright cho:
  - `payment-cash.spec.ts`
  - `kds-queue.spec.ts`
- Kết quả:
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm build`
- Nếu có, đính kèm log lỗi GL còn lại để phân biệt:
  - lỗi vận hành POS
  - lỗi cấu hình accounting/backoffice
