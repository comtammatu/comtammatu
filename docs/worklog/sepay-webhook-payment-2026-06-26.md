# SePay Webhook Payment Contract

Reconciled-through 5a52d8f8
Owner: current SePay webhook integration slice. Retire after the PR lands and the stable facts are promoted to module docs/runbooks.

## T3 Contract

Skill plan: repo rules = engineering + skills + database + workflow + team + references; external skills = supabase + supabase-postgres-best-practices; runtime tools = CodeGraph + Sepay docs + Supabase CLI for migration creation; skipped = direct DB apply because the registry has no dev/test Supabase ref and production is owner-applied only.

PM: scope is webhook settlement for existing VietQR bank transfers, not a new payment method or accounting surface. Done means POS creates one pending `vietqr` payment with a random `DH ...` transfer memo, then SePay can POST a signed bank transaction and the app records one completed payment for that pending row.

BA: business rules are HMAC required, webhook idempotency by SePay `id`, only `transferType='in'`, tenant scope resolved from the signed receiving `accountNumber`, payment matched by SePay `code` or transfer memo containing the generated `payments.provider_ref` inside that tenant, memo must start with `DH`, amount and receiving account validated before completion, duplicate/amount-mismatch/bad-memo events logged without creating a second payment.

Senior Dev: implementation keeps multi-row writes inside `public.confirm_sepay_payment`, reuses `webhook_events`, `payments.method='vietqr'`, `complete_payment_and_consume_stock`, and receipt enqueue. The route does raw-body auth, account-scope resolution, event claiming, and RPC dispatch only.

QA/QC: targeted checks are static route/migration assertions plus full repo gates. Runtime smoke is deferred until the migration is owner-applied and `SEPAY_WEBHOOK_SECRET` is configured on the public HTTPS deployment.

## Cash-Confirmed QR Correction Follow-Up

Skill plan: repo rules = engineering + skills + database + workflow; external skills = supabase + supabase-postgres-best-practices; runtime tools = CodeGraph + Supabase CLI for migration creation; skipped = direct DB apply because only production Supabase exists and owner applies migrations.

PM: scope is the real cashier mistake path: a bill is confirmed as cash, but the customer pays by scanning a printed VietQR code. Done means a matching SePay transfer can move the order/payment from `cash` to `vietqr` without making the cashier recreate a bill.

BA: correction is allowed only when the SePay code matches `payments.provider_ref`, the receiving bank account matches configured VietQR account, and the transfer amount matches both payment and order total. The correction clears cash drawer fields so close-shift no longer counts the bill as expected cash.

Senior Dev: keep the existing one-active-payment invariant. Cash confirmation preserves or creates a `DH...` `provider_ref`; printed QR uses that code; SePay lookup accepts `cash` or `vietqr` payments and the RPC performs the atomic correction.

QA/QC: regression coverage is static assertions for route lookup, migration behavior, and provisional-print QR source, plus repo `typecheck`, `lint`, and `build`. Live smoke remains deferred until the migration is owner-applied.

## Self-Attestation

BA rules map to `apps/web/app/api/webhooks/sepay/route.ts` for HMAC/raw body/account-bound claiming and `supabase/migrations/20260625171721_sepay_webhook_payment.sql` for account/amount/payment atomicity. POS VietQR creation uses `createPayment` so the generated memo exists in `payments.provider_ref` before customer transfer. Cash-confirmed correction maps to `supabase/migrations/20260625215140_sepay_cash_vietqr_correction.sql`; printed provisional QR source maps to `apps/web/app/(protected)/br/[branchId]/pos/print-actions.ts`. Deferred item: live SePay dashboard send-test and real small-transfer smoke after owner applies the migration and `SEPAY_WEBHOOK_SECRET`.
