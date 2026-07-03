# SePay Webhook Receipt Print Recovery

> Reconciled-through 106c375c

## Skill Plan

Skill plan: repo rules = engineering + database + workflow + regressions; external skills = supabase + supabase-postgres-best-practices + systematic-debugging; runtime tools = CodeGraph, shell, Supabase MCP; skipped = UI/browser tools because this is a DB/RPC behavior fix with no UI diff.

## T3 Review

PM: Scope is limited to SePay webhook settlement producing the same receipt-print side effect as POS payment confirmation. Done means webhook-paid VietQR orders enqueue or retry the receipt job without forcing duplicate paper for receipts that already printed.

BA: Payment state remains source-of-truth in `payments` and `orders`; print remains fail-soft so bank settlement is not rolled back by printer issues. The edge case is an idempotent/late webhook where the payment is already completed but the receipt job is missing, failed, or expired.

Senior Dev: Keep `confirm_sepay_payment` service-role-only and reuse `enqueue_receipt_print` as the idempotency boundary. The migration only changes the VietQR `already_completed` branch to call the same fail-soft enqueue block used by fresh completion. Existing `enqueue_receipt_print` service-role behavior preserves `printed` jobs instead of resetting them to `pending`.

QA: Static coverage asserts the new migration enqueues in the `already_completed` branch and that the receipt helper still does not reprint service-role `printed` jobs. Production read-only sampling found processed SePay events with paid orders and no receipt job, alongside events that had receipt jobs, matching the missing-idempotent-print failure mode.

## Attestation

Test-plan items covered: static regression test for the new SQL branch plus full repo gates. Deferred: local baseline replay if Docker is unavailable. BA rule mapping: `confirm_sepay_payment` handles missing/retry receipt jobs in `supabase/migrations/20260703140015_sepay_webhook_receipt_already_completed.sql`; no-reprint behavior remains in `enqueue_receipt_print` in the baseline. Known out-of-scope: historical paid orders missing receipts are not backfilled automatically to avoid unexpected paper output.
