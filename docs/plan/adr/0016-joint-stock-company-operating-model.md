# ADR 0016 — Joint-stock company operating model

**Status:** Accepted, 2026-07-27

**Scope:** Target operating model implemented in `comtammatu` after cutoff
`baf3720f8`.

## Context

The target product is built for a Vietnamese F&B business organized as a
joint-stock company. Its authority must represent the legal entity, enterprise
tax/accounting duties, and company governance while preserving historical
evidence under its original effective context.

## Decision

1. `Tenant (L0)` represents the operating company; `Branch (L1)` remains an
   operational scope and is not a separate legal person.
2. Legal identity comes from the registered company record. Brand, application
   `owner`, shareholder, legal representative and beneficial owner are separate
   concepts.
3. Legacy legal-policy docs are removed from the active documentation tree and
   remain available only through Git history. Historical transactions, issued
   invoices, tax records and audit evidence are immutable and retained under
   their original effective context.
4. VAT method, item rates, invoice template and series are explicit
   effective-dated configuration approved against the company/provider record.
   They are never inferred from annual revenue.
5. Finance remains an operating-finance surface. It may show revenue, food
   cost, operating expenses, operating result, cash, inventory, payables and
   tax workflow. It does not claim to be a general ledger or statutory
   financial statement.
6. `net_profit` means profit after CIT and is available only after complete
   accounting close. Until then the canonical product label is
   `Kết quả vận hành`.
7. The company and accountant must select the applicable enterprise accounting
   regime and approve recognition, costing, depreciation, tax and close rules.
8. Database/provider changes remain owner-gated under this repository's
   Environment Registry and database rules.

## Consequences

- Remove annual-revenue sales-tax inference from active source paths.
- Snapshot item VAT on each order/invoice line and preserve issued snapshots.
- Do not treat supplier payment, ending inventory, equity contribution or
  dividend as operating expense.
- Do not apply a migration or change provider credentials/template without
  exact-target authority and verified evidence.
- Company-model source and documentation changes land incrementally behind the
  existing seams in `comtammatu`; retired legal model records retain their historical context.

## Authority

- `docs/spec/architecture.md`
- `docs/ref/legal-framework-2026.md`
- `docs/ref/einvoice-tax.md`
- `docs/modules/finance.md`
