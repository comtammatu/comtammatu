# Data Classification — Sign-off Table

> **Suspended 2026-05-23:** This greenfield/blue-green rebuild pack is historical reference only. Active delivery continues in-place via `tasks/todo.md`. Do not apply freeze/cutover instructions unless the owner explicitly reactivates this program.

> Fill one row per blue artifact (table, view, RPC, bucket, cron job).
> Default class = `DEFER_DECISION` if unclear.
> Every `DEFER_DECISION` MUST resolve before W6 cutover.

---

## §1. Tables (public schema)

| Blue artifact | Class | Reason | Owner | Date | Evidence |
|---|---|---|---|---|---|
| **Core operational** | | | | | |
| `tenants` | MIGRATE | Identity | | | row count |
| `branches` | MIGRATE | Identity + scope | | | row count |
| `areas` | MIGRATE | Hierarchy | | | row count |
| `tables` (POS tables) | MIGRATE | POS scope | | | row count |
| `zones` | MIGRATE | POS layout | | | row count |
| `profiles` | MIGRATE | User reference | | | row count |
| `positions` | MIGRATE | Role mapping (note: ADR-0004 normalize casing) | | | row count |
| `staff_permissions` | REBUILD_FROM_SOURCE | Re-derive from `role_templates` post-cutover | | | per ADR-0001 |
| `role_templates` | MIGRATE | Permission seed | | | row count |
| `permission_keys` | REBUILD_FROM_SOURCE | New 87-key catalog | | | per W0 |
| **Revenue** | | | | | |
| `orders` | MIGRATE | Revenue core | | | row count |
| `order_items` | MIGRATE | Revenue detail | | | row count |
| `payments` | MIGRATE | Revenue ledger | | | row count |
| `refunds` | MIGRATE | Compliance | | | row count |
| `webhook_events` | MIGRATE | Idempotency audit | | | row count |
| **Tax / e-invoice** | | | | | |
| `tax_invoices` | MIGRATE | Compliance | | | per provider count |
| `vas_report_lines` | MIGRATE | Tax export | | | row count |
| **Finance / GL** | | | | | |
| `journal_entries` | MIGRATE | Accounting chain | | | row count |
| `chart_of_accounts` | MIGRATE | GL identity | | | row count |
| `accounting_periods` | MIGRATE | Period close | | | row count |
| **Nhân sự & tiền lương** | | | | | |
| `attendance` | MIGRATE | Labor record | | | row count |
| `payroll_records` | MIGRATE | Legal record | | | row count |
| `employment_contracts` | MIGRATE | Legal | | | row count |
| `dependents` | MIGRATE | PIT | | | row count |
| **Inventory core (V2 KEEP)** | | | | | |
| `ingredients` | MIGRATE | Catalog | | | row count |
| `recipes` | MIGRATE | BOM | | | row count |
| `production_recipes` | MIGRATE | BOM | | | row count |
| `inventory_locations` | MIGRATE | CW/CK/branch | | | row count |
| `stock_levels` | MIGRATE | Operational truth | | | row count |
| `stock_movements` | MIGRATE | Ledger | | | row count |
| `stock_transfers` + `stock_transfer_items` | MIGRATE | Operational | | | row count |
| `stocktake_sessions` + `stocktake_lines` | MIGRATE | Operational | | | row count |
| `goods_received_notes` + lines | MIGRATE | AP/audit | | | row count |
| `purchase_orders` + lines | MIGRATE | Procurement | | | row count |
| `production_orders` + items | MIGRATE | CK production | | | row count |
| `suppliers` | MIGRATE | NCC catalog | | | row count |
| **V1 retired (drop after audit)** | | | | | |
| `user_trust_score` | DEFER_DECISION → ARCHIVE_ONLY | Audit value possible; not live | | | row count |
| `branch_express_window` | DROP_ACCEPTED | V2 no express | | | row count = ? |
| `grn_express_audit` | DROP_ACCEPTED | V2 no express | | | row count = ? |
| `grn_hardblock_overrides` | DEFER_DECISION → ARCHIVE_ONLY (PDFs in `grn-evidence`) | Tax audit may need PDFs | | | row count + bucket size |
| `branch_override_codes` | DROP_ACCEPTED | V2 no hardblock policy | | | row count = ? |
| `branch_daily_waste_caps` | DROP_ACCEPTED | V2 no waste tier | | | row count = ? |
| `ingredient_category_review_policy` | MIGRATE (cold-chain seed) | Food safety | | | per W3 spec |
| `supplier_price_list` | DEFER_DECISION | Phase 3 redesign | | | row count |
| `supplier_items` | DEFER_DECISION | Phase 3 | | | row count |
| `supplier_invoices` | DEFER_DECISION → MIGRATE if AP scope confirmed | Compliance if used | | | row count |
| `supplier_payments` | DEFER_DECISION → MIGRATE if AP scope | Compliance | | | row count |
| `supplier_credit_notes` | DEFER_DECISION | Audit value | | | row count |
| `supplier_returns` | DEFER_DECISION | Operational scope | | | row count |
| `stocktake_drafts` | REBUILD_FROM_SOURCE (live sessions only) | Drafts ephemeral | | | row count |
| `stocktake_zone_locks` | DROP_ACCEPTED | TTL-based, regenerate | | | row count |
| `stocktake_conflicts` | DEFER_DECISION → resolve to 0 then DROP | Pending must resolve | | | per §8a |
| `stocktake_offline_batches` | DROP_ACCEPTED | Pilot didn't enable offline | | | row count |
| **Infra (cross-cutting)** | | | | | |
| `branch_feature_flags` | MIGRATE (clean V1 rows) | Future rollout | | | row count |
| `notifications` | MIGRATE | Operational | | | row count |
| `audit_logs` | MIGRATE | Accountability | | | row count |

---

## §2. Materialized views

| Blue artifact | Class | Reason |
|---|---|---|
| `mv_inventory_stock_current` | MIGRATE | V2 dashboard depend |
| `mv_grn_price_baseline` | DROP_ACCEPTED | V1 variance UI gone |
| `mv_inventory_value_ranking` | DROP_ACCEPTED | Defer Phase 3 |
| `mv_top_items_food_cost` | MIGRATE if Finance UI needs | Defer review |

---

## §3. RPCs (functions)

| Group | Class | Note |
|---|---|---|
| Auth (`has_permission`, `has_permission_any`) | REBUILD_FROM_SOURCE | New baseline |
| POS lifecycle (`void_order_item`, `cancel_order`, etc) | MIGRATE | Revenue path |
| Payment (`confirm_cash_payment`, `complete_payment_and_consume_stock`, `create_refund`, `reverse_payment_and_post`) | MIGRATE | Revenue + audit |
| KDS (`bump_kds_ticket`, `recall_kds_ticket`) | MIGRATE | Operational |
| Inventory V2 (`confirm_goods_receipt_note`, `commit_intra_branch_transfer`, transfer 5-step state machine, `confirm_production_order`) | MIGRATE | V2 core |
| Inventory legacy `auth_role()` whitelist (17 RPCs per `inventory-rbac-matrix.md §6`) | REBUILD_FROM_SOURCE | Body rewrite to `has_permission()` |
| V1 retired (`compute_user_trust_score`, `unblind_stocktake_session`, `recount_stocktake_round`, `set_branch_express_window`, `extend_branch_express_window`, `set_category_review_policy`, `rotate_branch_override_code`, `create_waste_from_order`) | DROP_ACCEPTED | V2 doesn't use |
| Period close (`enforce_period_close`, `reopen_accounting_period`) | MIGRATE | Finance |
| Tax (`tax_invoice_state_*`) | MIGRATE | Compliance |

---

## §4. Storage buckets

| Bucket | Class | Reason |
|---|---|---|
| `grn-evidence` | MIGRATE | Tax audit PDFs |
| `tax-invoices` | MIGRATE | HĐĐT PDFs |
| `receipts` | MIGRATE if archived | Operational |
| `staff-photos` | MIGRATE | HR |
| `payroll-pdfs` | MIGRATE | Compliance |
| `*-test`, `*-temp` | DROP_ACCEPTED | If owned by dev |

---

## §5. Cron jobs

| Job name | Class | Note |
|---|---|---|
| `refresh_mv_inventory_stock_current` | MIGRATE | V2 dashboard |
| `refresh_mv_grn_price_baseline` | DROP_ACCEPTED | V1 |
| `refresh_mv_inventory_value_ranking` | DROP_ACCEPTED | V1 |
| `scan_inventory_alerts` | MIGRATE | V2 reorder alert |
| `refresh_finance_views` | MIGRATE if Finance UI depends | |
| `cleanup_abandoned_payments` | MIGRATE | Operational |

---

## §6. Sign-off

After every row above is filled with a non-`DEFER_DECISION` class:

| Role | Name | Date |
|---|---|---|
| BA (data classification) | _____________ | _____________ |
| Architect (technical feasibility) | _____________ | _____________ |
| Owner (legal/audit retention) | _____________ | _____________ |

`DEFER_DECISION` count at sign-off must equal **0**. Any remaining = block W6 cutover.
