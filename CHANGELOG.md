# Changelog

All notable changes to this project will be documented in this file.

## [feedback-v1.0.0] - 2026-05-08

### Added — QR feedback module (Slice 1 + 2 + 3, feature-tagged release)

First public release of the customer-feedback module. Customers scan QR → submit rating + comment + optional phone + ≤3 photos → owner gets Telegram alerts (rating ≤3 by default) + AI-enriched inbox + daily AI report.

- **Customer-facing route** `/r/[token]` (public, unauthenticated, rate-limited 5/token + 20/IP per 30min, honeypot, Origin check)
- **Admin routes** `/admin/feedback` (inbox), `/qr` (owner-only QR generator), `/settings` (Telegram + AI), `/reports` (daily AI reports)
- **13 migrations** (`supabase/migrations/20260511*_feedback_*` and `*_telegram_*` and `*_bulk_mark_suspect_*`) — tables, RLS, RPCs, retention, photo storage, circuit breaker
- **6 permission keys**: `feedback:view`, `:view_phone`, `:view_report`, `:manage_qr`, `:manage_telegram`, `:manage_settings` (+ `:moderate` from Slice 3)
- **AI Tier 1** — per-feedback enrichment (25-category taxonomy, severity, sentiment, Vietnamese summary)
- **AI Tier 2** — daily report cron (02:00) with markdown output
- **Photo upload** — client compress + private Storage bucket + 5MB limit + mime allowlist + signed URLs (TTL 10min) + freshness window (5min anti-IDOR) + double-upload guard
- **Retention cron** (03:00) — comment 24m delete, phone NULL after 6m, IP hash NULL after 3m, photos with rows
- **Bot defense** — 14-char token (~83 bits entropy via `crypto.getRandomValues`), honeypot, rate limit, IP hash (SHA-256 + rotating salt), Origin check
- **PHI safety** — `feedbacks_with_masked_phone` view with `security_invoker=true`, raw phone never logged, IP hash exposed only as `has_ip_hash` boolean

### Required env vars
`TELEGRAM_BOT_TOKEN`, `CRON_SECRET`, `ALLOWED_ORIGINS_FEEDBACK`, `IP_HASH_SALT`, `NEXT_PUBLIC_APP_URL`, `ANTHROPIC_API_KEY`

### Known issues (16 total — see `docs/releases/feedback-v1.0.0.md` and `tasks/todo.md`)
2 HIGH (origin-check bypass when env empty, missing security headers), 4 MEDIUM (photo IDOR, Vercel fire-and-forget, photo RLS branch gap, thank-you bypass), 6 LOW, 4 INFO. QA report: `.gstack/qa-reports/qa-report-feedback-module-2026-05-07.md` (health score 63.5/100, architect-verified).

### Pending owner steps post-release
1. Verify 13 migrations applied to production (per CLAUDE.md production migration policy: file → PR → merge → owner manual apply)
2. Set 6 env vars in Vercel (above)
3. Smoke test 1 QR end-to-end — scan, submit ≤3★, verify Telegram alert arrives within 90s
4. Address ISSUE-001 + ISSUE-012 + ISSUE-013 (top-3 follow-ups, ~45 min total)

Full release notes: `docs/releases/feedback-v1.0.0.md`

---

## [Unreleased] — m4-payments-fix slice 2 (deep RPCs, 2026-04-30)

### Added
- **`reverse_payment_and_post(p_refund_id)` atomic RPC** — locks refund→payment→order, posts a balanced GL reversal journal (Dr `5111` / Cr `1111` cash or Cr `1121` bank), restores stock when consumption happened, flips `payments.status='refunded'` + `orders.payment_status='refunded'`, stamps `refund.approved_at/by`, writes one `audit_logs` row. Idempotent on already-approved refunds. Gated by `orders:refund_approve`. (Migration `20260510020000`.)
- **`restore_stock_for_order(p_order_id, p_actor_id)` internal helper** — walks order_items × recipes, INSERTs positive stock_movements with `type='refund_restore'`. REVOKEd from `authenticated`; only callable from SECURITY DEFINER paths. (Migration `20260510020000`.)
- **`create_refund(p_payment_id, p_amount, p_reason)` RPC** — replaces direct INSERT in `refund-actions.ts`. Validates `payment.status='completed'` (the missing precondition), enforces `sum(pending+approved refunds) ≤ payment.amount`, writes audit row. (Migration `20260510030000`.)
- **`stock_movements.type` CHECK extended** to include `refund_restore` (additive).
- **`journal_entries.reference_type` CHECK extended** to include `refund` (additive). Prior values `transfer` and `production` also enumerated explicitly so the constraint matches all existing posting paths.

## [Unreleased] — m4-payments-fix foundation + D011 v2 no-wait pieces (2026-04-29)

### Added
- **`webhook_events` table** with `UNIQUE (provider, request_id)` for payment-webhook idempotency. RLS allows `finance:view` SELECT; INSERT only via service_role webhook handlers. (Branch `m4-payments-fix`.)
- **`refunds.approved_at TIMESTAMPTZ`** column populated by the upcoming `reverse_payment_and_post` RPC.
- **`payments.stock_consumed_status TEXT`** column (nullable until recompute migration adds CHECK) — replaces the boolean `stock_consumed` return signal with a queryable status enum (`ok | out_of_stock | recipe_missing | internal_error`).
- **Permission key `orders:refund_approve`** seeded into the `owner` and `super_manager` role templates. Distinct from existing `orders:refund` (creation); approval requires escalation.
- **`redactCredentials()` utility** (`packages/shared/src/utils/redact-credentials.ts`) — case-insensitive exact-key allowlist that strips secrets before they hit `audit_logs`. 11 unit tests.
- **`with-action.ts` `requireBranchScope` option** — branch_manager / cashier with null `branch_id` are rejected with `branch_scope_unset` instead of widening to tenant scope.
- **Test runner wired into turbo:** new `test` task + root `pnpm test` and `pnpm verify` aggregate.
- **D011 v2 ADR** (`docs/plan/decisions.md`) sequencing the provider-config + local-fallback layer AFTER m4-payments-fix lands. (Branch `d011-v2`.)
- **D011 v2 provider resolver** (`packages/shared/src/providers/config.ts`) and **LocalMisaProvider** (`packages/shared/src/providers/impl/misa-local.ts`) staged as pure logic. (Branch `d011-v2`.)
- **Provider QA runbook** at `docs/runbooks/finance/providers-pre-release-qa.md`.
- **7 new regression rules** capturing the m4 + D011 design contracts:
  - `AUDIT-NEVER-LOG-CREDENTIALS`
  - `WEBHOOK-MUST-IDEMPOTENT`
  - `WEBHOOK-MUST-BIND-TENANT`
  - `STOCK-CONSUME-MUST-CHECK-RESULT`
  - `PAYMENT-AMOUNT-MUST-RECOMPUTE-SERVER`
  - `REFUND-MUST-CHECK-PAYMENT-COMPLETED`
  - `REFUND-MUST-REVERSE-ATOMICALLY`

### Pending (next slice — WAITING owner apply migrations + `pnpm db:types`)
- `reverse_payment_and_post(p_refund_id)` atomic RPC + `restore_stock_for_order` helper (m4 P0-1)
- `create_refund` RPC with `payment.status='completed'` precondition + `area_manager` scope check (m4 P0-5)
- `payment_recompute_total` migration rewriting `confirm_cash_payment` + `complete_payment_and_consume_stock` to add server-side total recompute and `stock_consumed_status` enum return (m4 P0-3 + P0-4)
- `posting_rule_refund_approve` seed (m4 §3.6)
- TS callers: `apps/web/app/orders/refund-actions.ts`, `apps/web/app/api/webhooks/momo/route.ts`, `apps/web/app/br/[branchId]/pos/payment-actions.ts`
- D011 v2 PR-1+: `provider_configs` table, `confirm_manual_payment` wrapper RPC, admin UI

## [1.1.0.0] - 2026-04-15

### Added
- GL auto-posting engine: every business transaction now creates balanced journal entries automatically
- `posting_rules` table with 16 VAS-standard rules configurable per tenant
- `auto_post_journal()` core RPC called from all business-event RPCs
- POS cash/VietQR/Momo payments auto-post Revenue + COGS + VAT journals
- GRN confirmation auto-posts Inventory (Dr 152) / AP (Cr 331) journals
- Supplier payment tracking with `supplier_payments` table and AP reduction journals
- Payroll approval auto-posts multi-line journal (salary, BHXH/BHYT/BHTN, PIT)
- Stock transfer receive auto-posts inter-branch inventory reclassification
- Production order completion auto-posts raw material consumption + finished goods output
- Fiscal period management (open/closing/closed) with period enforcement
- Month-end close procedure with MV refresh and 5-category GL reconciliation
- Posting rules admin page at `/admin/finance/posting-rules`
- Fiscal periods page at `/admin/finance/periods` with close workflow and reconciliation dialog
- Badge "Tự động" on auto-posted journal entries
- Account 155 (Thành phẩm) added to VAS chart of accounts
- `confirm_payment_and_post()` atomic RPC replacing non-atomic VietQR/Momo confirmation
- Implicit subledger FK (`journal_entry_id`) on payments, GRN, invoices, payroll, transfers, production

### Changed
- `create_payment()` RPC now auto-posts GL journal on cash payment completion
- `confirm_goods_receipt_note()` RPC now auto-posts GL journal on GRN confirmation
- `stock_transfer_receive()` RPC now auto-posts GL journal on transfer receive
- `confirm_production_order()` RPC now auto-posts GL journal on production completion
- `confirmPayment` server action refactored from 3 non-atomic DB calls to atomic RPC
- `approvePayroll` server action now calls `post_payroll_journal` on approval

### Removed
- Inventory design mockup files (`inventory/trang_*/`) — implementations live in `apps/web/app/inventory/`
