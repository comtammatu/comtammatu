# T3 — SePay Webhook HĐĐT Fix

> Reconciled-through e58592cb5

Skill plan: repo rules = engineering + skills + database + workflow + legal/HĐĐT refs; external skills = investigate + supabase + supabase-postgres-best-practices; runtime tools = CodeGraph + SELECT-only PostgREST against production ref `iexwsuaqqenyjiskawoj`; skipped = subagents unavailable, single-agent written T3 transcript used.

PM: Scope is fix-forward only: SePay-confirmed paid orders must get the same per-order HĐĐT attempt as cashier-confirmed VietQR. Backfill is out of scope because duplicate issuance needs portal/manual-state review.

BA: HĐĐT active mode means no-MST/no-buyer sales still issue with `buyerNotGetInvoice=true`. Payment remains the commercial close; HĐĐT failure must not roll back paid state. Existing active invoices or active summary links must not be double-issued.

Senior Dev: Keep SQL RPC payment-only. Extract the current per-order invoice creation core into a server helper shared by authenticated Server Actions and service-role webhook routes. Let the webhook call it only after `confirm_sepay_payment` returns `completed` or `already_completed`.

QA/QC: Production SELECT confirmed `129` SePay-paid orders missing active invoice/summary rows. Add static regression cover for webhook wiring plus existing POS idempotent replay guards. Run targeted tests, then typecheck/lint/build if time allows.

Contract: after a valid SePay webhook marks an order paid, the route attempts `issueTaxInvoiceForPaidOrder({ orderId })`; provider failures produce a draft row for Finance when possible; webhook payment processing stays successful and no backfill runs automatically.

## Follow-Up — Missing SePay Recovery Action

PM: Scope is now a bounded operator recovery button for historical processed SePay webhooks that will not replay. No production write is performed by the agent; owner/Finance must trigger the action from the app after deploy.

BA: Candidate truth is `webhook_events.provider='sepay' AND processing_status='processed'` with a linked completed VietQR payment. Exclude orders that already have an active per-order invoice or active summary link before issuing.

Senior Dev: Reuse `issueTaxInvoiceForPaidOrder` so duplicate guards, no-buyer defaults, provider draft handling, and branch access checks stay in one place. Keep scan and issue caps in the Server Action; no new SQL/RPC/migration.

QA/QC: Add a static guard that the recovery path reads processed SePay webhook events, binds to completed VietQR payments, and calls the shared helper. Targeted tests should cover this plus the webhook fix-forward guard.
