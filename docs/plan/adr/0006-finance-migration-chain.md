# ADR 0006 — Finance Migration Chain & GL Retirement Ordering

**Status:** Accepted (2026-06-16) — documents the ordering already executed by D020
**Context:** Closes todo item L6 ("Finance migration-chain ADR")
**Decision drivers:** D020 (enterprise-GL retirement, owner-approved 2026-06-13, applied prod 2026-06-14); D013 (HKD operating-finance posture); baseline-first migration policy

This ADR records the dependency ordering and rollback constraints of the finance
migration chain, and the boundary D020 draws between the **retired enterprise GL**
and the **operating finance** that stays. It exists so a future re-baseline,
rollback, or fresh-environment provision does not re-introduce or half-remove the GL
layer in the wrong order.

## Context

Má Tư is a Hộ Kinh Doanh and files no BCTC (D012/D013), so the double-entry GL
(journal entries, chart of accounts, posting rules, fiscal periods, VAS statements)
was retired from the live DB and UI under **D020**. The GL layer was never just one
migration — it was a tightly-ordered chain where business RPCs (payment, GRN,
transfer, production, payroll, supplier) auto-posted balanced journal entries, with
FK `journal_entry_id` columns on those subledger tables and period-guard triggers on
`journal_entries`. Removing it safely required a specific order; doing it out of order
500s every payment (webhook retries against a dropped RPC) or masks refund failures.

The GL source migrations are archived (`supabase/migrations/_archive/20260416*`,
`20260419*`, `20260425034448_vas_report_lines`, `20260506000000…`, `20260527000000…`);
they are NOT in the active forward chain. The baseline (`00000000000000_baseline.sql`)
predates D020, so a fresh environment provisioned from baseline + forward chain gets
the GL retired by the D020 forward migration, not by replaying the archived GL files.

## Decision

**The canonical finance retirement order (executed by D020, the "5-step chain"):**

1. `20260611001000_disable_payment_stock_leg` — redefines
   `complete_payment_and_consume_stock()` to be non-fatal (no stock consume) and fixes
   `reverse_payment_and_post()` hoàn-kho. **Must precede** GL removal (D016).
2. `20260612120000_refund_keep_order_payment_status` — keeps order `payment_status`
   intact and strips the GL reverse-post from refund. **Must precede** GL removal.
3. **Code deploy** — re-source the finance cockpit + remove the GL UI routes
   (`finance/{chart-of-accounts,journal,posting-rules,statements,audit-trail,periods}`,
   `admin/accounting`) so nothing calls a soon-dropped RPC.
4. `20260614100000_d020_retire_enterprise_gl` — one atomic transaction: rewrite the 8
   business RPCs (remove GL legs, preserve every non-GL behavior byte-for-byte), drop
   7 `journal_entry_id` FK columns, drop 22 GL functions + 2 period-guard triggers,
   drop 6 GL tables (`journal_entry_lines`, `journal_entries`, `posting_rules`,
   `chart_of_accounts`, `fiscal_periods`, `vas_report_lines`). Keeps `accounting_periods`
   + `close_period_soft/hard`/`reopen_period` (operational month-close, D013).
5. **`pnpm db:types`** + typecheck/lint/build (GL types removed from generated types).

**Operating finance kept (explicitly out of the retirement, do not touch):** HĐĐT
`tax_invoices` + `/finance/invoices` + `reconcile_run_log` (NĐ 70/2025);
`/finance/revenue` (khai-thuế source = `tax_invoices` status='issued');
`/finance/food-cost`; `supplier_invoices` (chứng từ chi phí); the `expenses`
single-entry ledger (`20260615140000`, D028); tier-based GTGT
(`20260616130000_derive_sales_tax_rate`).

## Rollback dependencies

D020 is one-way by design (D001 greenfield; reversing it requires amending D020
first). There are no `*_down.sql` files for the GL migrations — they were archived,
not given rollback scripts. If a reversal is ever needed, the safe order is the
reverse of the retirement, gated by FK direction:

- Re-create tables before their referents: `chart_of_accounts` → `posting_rules` →
  `journal_entries`/`journal_entry_lines` → `fiscal_periods` → period-guard triggers.
- Re-add the 7 `journal_entry_id` FK columns only after `journal_entries` exists.
- Re-deploy the business RPCs' GL legs only after the tables + `auto_post_journal`
  exist, else every payment/GRN/transfer/payroll/production write raises.
- Cannot drop `chart_of_accounts` while `posting_rules`/`journal_entries` FK-reference
  it — this is the constraint that forces the strict order in both directions.

## Current production reality (2026-06-16)

GL layer fully retired and verified on prod (`iexwsuaqqenyjiskawoj`, applied
2026-06-14 via owner-delegated `apply_migration` + ledger repair). Operating finance
intact and in use. The prod ledger records D020 by file `name`; `version` is the
apply timestamp (see `docs/agent/rules/database.md` → Owner-Delegated Production
Apply), so never run file-based `supabase db push` against prod.

## Consequences

- A fresh environment is correct as long as it runs baseline + the forward chain in
  timestamp order; the GL never re-appears because its sources are archived and D020
  is a forward migration.
- Future finance work adds operating-finance migrations only; do not reintroduce GL
  tables/RPCs without amending D020 and this ADR.
- The expense + revenue + HĐĐT surfaces are the finance system of record now; any
  "where did the journal go" question resolves here, not in a missing GL.
