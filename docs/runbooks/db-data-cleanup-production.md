# Production DB Data Cleanup

Runbook for owner-run production data cleanup. Do not use this file as a
business-record retention policy; it is an operational checklist for the exact
audited cleanup batches linked below.

Authority:

- [Database environment registry](../agent/rules/database.md)
- Owner approval for the exact batch and refreshed preflight output from this
  runbook

## Rules

- Target production project: `iexwsuaqqenyjiskawoj`.
- Run only after owner approval for the exact batch.
- Take a backup/snapshot first.
- Run preflight before every apply, even if the query was checked earlier.
- Do not run cleanup SQL as a migration.
- Do not broaden date, branch, status, or time filters inline.
- Do not delete all April orders unless there is a separate owner sign-off.
- Keep `order_daily_counters`; preserving counters avoids sequence reuse after
  removing historical test orders.

## Batch 2: April Night Orders

Batch 2 deleted April 2026 POS test orders created in local UTC+7 night hours
from `22:00` to `<06:00` for branch 2 and branch 3.

Status: applied at `2026-06-12`. 32 orders removed (27 completed/paid totalling
2,546,000, 5 cancelled/unpaid) with all blocking refs (`tax_invoices`,
`tax_invoice_order_links`, `refunds`, `webhook_events`, `stock_movements`,
external split/merge refs) at zero. Both post-apply remaining-rows checks
returned `0`.

## Batch 3: Inventory Full Reset

Batch 3 resets all Inventory, Procurement, and Production data. It does not
archive or preserve old Inventory data.

This batch intentionally includes Inventory master/config rows:

- ingredients
- inventory locations
- suppliers
- waste caps
- Inventory QC settings
- ingredient review policy

This batch intentionally excludes non-Inventory platform data:

- tenants, branches, profiles, menu
- POS orders, payments, refunds, HĐĐT
- finance journals, audit logs, payroll, attendance
- print jobs unrelated to Inventory reset

Status: applied at `2026-06-12`. The FK safety check returned `outside_fk_refs = 0`
and the apply omitted `CASCADE` (a future cross-domain FK into Inventory must make
the statement fail rather than delete outside the explicit table list).
Post-apply verification: all 36 target tables are zero rows, and remaining
Inventory/workflow notifications are `0`.

Inventory screens are empty until fresh setup data is recreated.
