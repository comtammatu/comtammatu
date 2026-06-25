# SePay Webhook Payment Contract

Reconciled-through 5a52d8f8
Owner: current SePay webhook integration slice. Retire after the PR lands and the stable facts are promoted to module docs/runbooks.

## T3 Contract

Skill plan: repo rules = engineering + skills + database + workflow + team + references; external skills = supabase + supabase-postgres-best-practices; runtime tools = CodeGraph + Sepay docs + Supabase CLI for migration creation; skipped = direct DB apply because the registry has no dev/test Supabase ref and production is owner-applied only.

PM: scope is webhook settlement for existing VietQR bank transfers, not a new payment method or accounting surface. Done means POS creates one pending `vietqr` payment with a random transfer memo, then SePay can POST a signed bank transaction and the app records one completed payment for that pending row.

BA: business rules are HMAC required, webhook idempotency by SePay `id`, only `transferType='in'`, tenant scope resolved from the signed receiving `accountNumber`, payment matched by SePay `code` or transfer memo containing the generated `payments.provider_ref` inside that tenant, amount and receiving account validated before completion, duplicate/amount-mismatch/bad-memo events logged without creating a second payment.

Senior Dev: implementation keeps multi-row writes inside `public.confirm_sepay_payment`, reuses `webhook_events`, `payments.method='vietqr'`, `complete_payment_and_consume_stock`, and receipt enqueue. The route does raw-body auth, account-scope resolution, event claiming, and RPC dispatch only.

QA/QC: targeted checks are static route/migration assertions plus full repo gates. Runtime smoke is deferred until the migration is owner-applied and `SEPAY_WEBHOOK_SECRET` is configured on the public HTTPS deployment.

## Self-Attestation

BA rules map to `apps/web/app/api/webhooks/sepay/route.ts` for HMAC/raw body/account-bound claiming and `supabase/migrations/20260625171721_sepay_webhook_payment.sql` for account/amount/payment atomicity. POS VietQR creation uses `createPayment` so the generated memo exists in `payments.provider_ref` before customer transfer. Deferred item: live SePay dashboard send-test and real small-transfer smoke after owner applies the migration and `SEPAY_WEBHOOK_SECRET`.
