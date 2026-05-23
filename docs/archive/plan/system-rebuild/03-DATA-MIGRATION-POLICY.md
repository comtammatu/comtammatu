# 03 — Data Migration Policy

> **Suspended 2026-05-23:** This greenfield/blue-green rebuild pack is historical reference only. Active delivery continues in-place via `tasks/todo.md`. Do not apply freeze/cutover instructions unless the owner explicitly reactivates this program.

> Purpose: prevent accidental loss of operational, tax, finance, payroll, and audit data.

## Principle

Data is not dropped because a feature is visually or architecturally retired.

Every table, bucket, event stream, and external identifier from blue must be classified before green implementation depends on it.

## Classification

| Class | Meaning | Action |
|---|---|---|
| `MIGRATE` | Required live operational or legal data | Transform and load into green. |
| `ARCHIVE_ONLY` | Must be retained but not live | Export immutable snapshot with checksum and manifest. |
| `DROP_ACCEPTED` | Owner accepts loss | Exclude from green; record sign-off. |
| `REBUILD_FROM_SOURCE` | Derived data | Recompute from retained source rows. |
| `DEFER_DECISION` | Unclear value or dependency | Blocks baseline/cutover until resolved. |

## Keep Or Migrate By Default

| Data | Reason |
|---|---|
| Tenant, branch, area, tables, zones | Operational identity and scope. |
| Auth users, profiles, positions, permissions | User continuity and audit references. |
| Orders, payments, refunds, webhook events | Revenue and reconciliation. |
| HĐĐT/tax invoices, VAT data, PDFs | Compliance. |
| Finance GL, COA, journal entries, periods | Accounting chain. |
| Payroll, contracts, attendance, PIT/BHXH data | Labor/legal records. |
| Inventory stock ledger, stock levels, GRN, transfers | Operational stock truth. |
| Suppliers, purchase orders, supplier invoices/payments | AP and audit. |
| Audit logs | Accountability and investigation. |
| Storage evidence | Tax/audit attachments and PDFs. |
| Provider configs and external IDs | Reconciliation and webhook binding. |

## Archive By Default

| Data | Reason |
|---|---|
| retired trust-score history | Business evidence may matter, but not live logic. |
| old hardblock override evidence | Audit value possible; live policy may be retired. |
| old stocktake conflict/offline helper rows | Operational context; not necessarily green workflow. |
| retired feature flag history | Change history, not runtime dependency. |
| old policy evidence PDFs | Retain if attached to audit/tax flows. |

## Drop Only After Audit

Candidate drops require all of:

1. no app/API/RLS/function reference
2. no legal retention requirement
3. no unresolved business workflow
4. no external integration dependency
5. owner sign-off naming the data class

Potential candidates:

- V1 Inventory permission keys
- V1 express windows
- retired waste-tier config
- retired trust-score engine
- derived MVs that can be rebuilt
- stale feature flag rows

## Blockers

These are `DEFER_DECISION` until explicitly resolved:

- supplier returns and credit notes
- supplier invoices and payments if AP scope is unclear
- unresolved stocktake conflicts
- hardblock/evidence buckets
- auth user preservation strategy
- identifier language normalization, including position-code casing/language
- rollback requirement after green receives production writes

## Audit Outputs

The data audit must produce:

- row counts by table
- approximate size by table
- last write timestamp by table
- FK dependency graph
- RLS/function/API references by table
- storage bucket object counts and total bytes
- external provider identifiers
- checksum manifests for archived/migrated storage objects
- owner decision table

## Migration Rules

- Preserve primary IDs where feasible.
- If user IDs cannot be preserved, create a durable `old_user_id -> new_user_id` map.
- Do not trust client-side money or stock quantities during migration validation.
- Recompute derived balances from source rows when possible.
- Produce before/after aggregate checks:
  - revenue by day
  - payment totals by method
  - VAT invoice counts/states
  - stock quantity/value by branch/location
  - payroll totals by period
  - open AP/AR totals

## Sign-Off Table

Use this format in the final audit report:

| Data class | Blue artifact | Decision | Owner | Date | Evidence |
|---|---|---|---|---|---|
| Example | `supplier_invoices` | `MIGRATE` | TBD | TBD | row count + finance approval |
