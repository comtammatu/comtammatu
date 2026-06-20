# ADR 0006 — Finance Migration Chain And Operating-Finance Boundary

**Status:** Accepted (2026-06-16)
**Decision drivers:** D020 (enterprise accounting outside the HKD product, owner-approved 2026-06-13, applied prod 2026-06-14); D012 (HKD operating-finance posture); baseline-first migration policy

Má Tư is a Hộ kinh doanh. The current Finance product is operating finance:
revenue, HĐĐT, operating expenses, food-cost signal, supplier-invoice handoff,
cash summary, and accountant-export support. Enterprise double-entry accounting
is outside the product unless D020 is amended first.

This ADR records the finance migration dependency order so production,
fresh-environment installs, and rollback planning keep payment, GRN, transfer,
production, payroll, supplier, and refund flows in the HKD operating model.

## Decision

The canonical D020 chain is:

1. `20260611001000_disable_payment_stock_leg` — redefines
   `complete_payment_and_consume_stock()` to be non-fatal for stock consumption
   and fixes `reverse_payment_and_post()` refund stock behavior. Must precede
   D020.
2. `20260612120000_refund_keep_order_payment_status` — keeps order
   `payment_status` intact and strips accounting reverse-posting from refund.
   Must precede D020.
3. Code deploy — re-source the finance cockpit to the operating-finance
   surfaces so app code no longer calls enterprise-accounting RPCs.
4. `20260614100000_d020_retire_enterprise_gl` — one atomic transaction: rewrite
   the 8 business RPCs while preserving every non-accounting behavior, drop the
   accounting FK columns/functions/triggers/tables, and keep
   `accounting_periods` + `close_period_soft/hard`/`reopen_period` at the DB
   layer only as owner-gated support. Per D035 the app/route surface for
   period-close is removed; there is no exposed month-close UI.
5. Run `pnpm db:types`, then `pnpm typecheck && pnpm lint && pnpm build`.

Operating finance explicitly stays in scope:

- HĐĐT `tax_invoices`, `/finance/invoices`, and `reconcile_run_log`.
- `/finance/revenue` with issued HĐĐT as tax source.
- `/finance/food-cost`.
- `supplier_invoices` as supplier document handoff.
- `expenses` as the single-entry operating expense ledger.
- Tier-based GTGT from `20260616130000_derive_sales_tax_rate`.

## Fresh Environment And Production

A fresh environment is correct when it runs baseline + forward migrations in
timestamp order. The historical chain under `supabase/migrations/_archive/` is
not the active install path.

D020 is verified on prod (`iexwsuaqqenyjiskawoj`, applied 2026-06-14 via
owner-delegated `apply_migration` + ledger repair). The prod ledger records D020
by file `name`; `version` is the apply timestamp. Follow
`docs/agent/rules/database.md` for owner-delegated production apply, and never
run file-based `supabase db push` against prod.

## Reintroduction Gate

Reintroducing enterprise accounting requires amending D020 and this ADR first.
The safe order is constrained by FK direction:

- Tables before dependents.
- FK columns only after their referenced tables exist.
- Business RPC accounting legs only after tables and posting functions exist.
- App surfaces only after RPCs and generated types are live.

## Consequences

- Future finance work adds operating-finance migrations only.
- Questions about revenue, expense, HĐĐT, cash summary, or accountant export
  resolve to the operating-finance docs and modules, not to enterprise-accounting
  screens.
- Rollbacks or baselines must respect the D020 chain; partial replay creates
  payment/refund failures.
