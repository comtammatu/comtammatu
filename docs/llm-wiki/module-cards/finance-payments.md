# Module Card — Finance & Payments

## Current State

Finance is a dedicated workspace at `/finance/*`, while payment collection lives in POS and provider configuration lives in admin settings.

Do not create `/merchant/*` for payment work.

## Route Ownership

- POS payment collection: `/br/[branchId]/pos`.
- Payment provider configuration: `/admin/settings/payments`.
- Finance reports/reconciliation/GL/HĐĐT: `/finance/*`.
- Legacy `/admin/finance/[[...slug]]` exists as compatibility behavior.

Finance routes include:

- `/finance`
- `/finance/revenue`
- `/finance/revenue/[date]`
- `/finance/reconciliation`
- `/finance/chart-of-accounts`
- `/finance/journal`
- `/finance/posting-rules`
- `/finance/food-cost`
- `/finance/periods`
- `/finance/audit-trail`
- `/finance/statements`
- `/finance/invoices`

## Current Status

- Cash payments work.
- VietQR/Momo real wiring depends on merchant credentials and payment hardening.
- MISA HĐĐT real provider wiring depends on provider credentials and compliance work.
- VAS/Finance exists but still has post-pilot hardening gaps.

## High-Risk Rules

- Webhooks must insert into `webhook_events` before side effects.
- Webhooks must bind tenant from signed/server-validated source.
- Payment confirm RPCs must recompute order total server-side.
- Stock consumption status must be checked; no fail-soft money-paid-zero-stock divergence.
- Refunds and approvals must use atomic RPCs.
- Finance materialized views must not expose RLS-bypassing direct access.
- Period-close guard belongs at DB/RPC level for GL-affecting mutations.
- Audit logs must redact credentials.

## What To Do Next

For payment/finance work:

1. Check `tasks/regressions.md` first.
2. Keep POS, Finance, and Admin Settings ownership separate.
3. Use RPCs for atomic payment/refund/GL/stock side effects.
4. Verify Momo/VietQR/MISA flows against tenant binding, idempotency, and safe error copy.
