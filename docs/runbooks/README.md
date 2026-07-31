# Runbooks

Operational checklists and readiness gates.

- Use when verifying a flow before considering it ready.
- Do not use this directory as the source of truth for business rules; canonical
  rules remain in `docs/ref/`.

## Inventory

- [inventory/pre-release-qa.md](inventory/pre-release-qa.md): Inventory smoke and readiness checklist

## POS / KDS

- [operations-smoke-gate.md](operations-smoke-gate.md): end-to-end operating gate for the mission `sell correctly -> kitchen receives correctly -> collect correctly -> print/issue HĐĐT correctly -> deduct stock correctly -> management sees correctly`
- [hddt-viettel-operations.md](hddt-viettel-operations.md): Viettel S-invoice smoke/reconcile/archive
- [pos-kds/print-agent-rollout.md](pos-kds/print-agent-rollout.md): branch ESC/POS print-agent daemon rollout checklist
- [pos-kds/realtime-load-testing.md](pos-kds/realtime-load-testing.md): load test realtime POS/KDS

## Finance

- [finance-financial-truth-rollout.md](finance-financial-truth-rollout.md): rollout DB → Preview → Production cho SePay ledger, tiền theo ca POS và Daily Close

## Supabase / Schema / Migration

- [../spec/database-schema.md](../spec/database-schema.md): source ladder, migration status vocabulary, and baseline-first layout
- [../../supabase/migrations/README.md](../../supabase/migrations/README.md): fresh-env install order for the public baseline and managed surfaces

## How to Use

1. Read the corresponding canonical doc in `docs/ref/`.
2. Run the repository's required verification.
3. Use the runbook to check the changed scope.
4. If docs and code disagree, update the doc before marking the work complete.
