# Schema Drift Audit — 2026-07-02

Skill plan: repo rules = engineering + database + workflow; external skills = supabase, supabase-postgres-best-practices, ponytail; runtime tools = Supabase MCP SELECT-only on `iexwsuaqqenyjiskawoj`, pnpm/node.

PM: scope = expose baseline.sql versus prod drift before the next migration; acceptance = repeatable audit script plus a report of known drift and owner decision needed; priority = high because baseline replay can be false-green.

BA: rules = production is SELECT-only, re-baseline is owner-gated, and fresh-env correctness must be separated from deployed-prod truth; edge cases = a function can be absent from prod but still referenced in baseline function bodies.

Dev: approach = parse local baseline objects, compare with a prod catalog manifest, then document drift instead of editing broad baseline content blindly; files = audit script and this worklog; risk = parser coverage, not runtime behavior.

QA: tests = script self-test, run audit against current baseline/prod evidence, and keep full repo gate for closeout; regressions = no direct prod writes and no unreviewed baseline squash.

## Findings

Prod project verified through Supabase MCP `list_projects`: `iexwsuaqqenyjiskawoj` = `comtammatu`, `ACTIVE_HEALTHY`, Postgres 17.6.1. All prod catalog checks below were SELECT-only.

Object counts, using schemas `public,private` and table columns from base/partitioned tables only:

| Object kind | `baseline.sql` | Prod | Drift summary |
| --- | ---: | ---: | --- |
| Functions | 292 | 320 | A: 1 baseline-only, B: 29 prod-only |
| Tables | 110 | 117 | A: 0 baseline-only, B: 7 prod-only |
| Columns | 1304 | 1393 | A: 0 baseline-only, B: 89 prod-only |

Set A — baseline declares, prod is missing:

- Function: `public.can_access_branch(p_branch_id bigint)`.
- Tables: none.
- Columns: none.

Additional landmine evidence: current baseline also references `public.can_access_branch(...)` inside `public.bump_kds_ticket`, `public.complete_kds_tickets`, and `public.recall_kds_ticket`; prod has already removed those references. Removing only the helper from `baseline.sql` without updating those function bodies would leave the baseline internally stale.

Set B — prod has, baseline is missing:

Functions:

- `public.approve_inventory_count_slip(p_slip_id bigint)`
- `public.branch_kitchen_ingredient_availability(p_tenant_id bigint, p_branch_id bigint)`
- `public.branch_menu_limit_availability(p_tenant_id bigint, p_branch_id bigint, p_limit_date date, p_stock_outcome_enabled boolean)`
- `public.compute_menu_item_stock_capacity(p_tenant_id bigint, p_branch_id bigint, p_menu_item_id bigint)`
- `public.confirm_sepay_payment(p_tenant_id bigint, p_order_id bigint, p_provider_ref text, p_transfer_amount numeric, p_account_number text, p_bank_reference text, p_provider_data jsonb)`
- `public.enforce_branch_ingredient_stock()`
- `public.ensure_order_payment_code(p_tenant_id bigint, p_branch_id bigint, p_order_id bigint)`
- `public.ensure_production_order_central_kitchen()`
- `public.generate_order_payment_code()`
- `public.get_ap_aging()`
- `public.get_branch_menu_ingredient_caps_for_pos(p_branch_id bigint)`
- `public.get_branch_menu_stock_capacity(p_branch_id bigint)`
- `public.get_my_count_slip(p_slip_id bigint)`
- `public.get_stock_movement_report(p_start_date date, p_end_date date, p_branch_id bigint)`
- `public.inv_to_base(p_ingredient_id bigint, p_unit_id bigint, p_qty numeric)`
- `public.inv_to_base_for_tenant(p_tenant_id bigint, p_ingredient_id bigint, p_unit_id bigint, p_qty numeric)`
- `public.order_payment_code_is_exposed(p_order_id bigint, p_tenant_id bigint, p_branch_id bigint, p_payment_code text)`
- `public.post_pos_cancelled_ready_waste(p_order_id bigint, p_actor_id uuid, p_reason text)`
- `public.post_pos_sale_consumption_if_ready(p_order_id bigint, p_actor_id uuid)`
- `public.prevent_order_amount_mutation_after_payment_code_exposed()`
- `public.refresh_branch_menu_stock_capacity(p_tenant_id bigint, p_branch_id bigint, p_menu_item_id bigint, p_ingredient_id bigint)`
- `public.refund_paid_order(p_order_id bigint, p_reason text)`
- `public.request_inventory_count_recount(p_slip_id bigint, p_note text)`
- `public.set_finance_cash_opening(p_cash_balance numeric, p_bank_balance numeric, p_opening_date date)`
- `public.set_inventory_count_assignments(p_branch_id bigint, p_location_id bigint, p_employee_id bigint, p_ingredient_ids bigint[])`
- `public.submit_inventory_count_slip(p_branch_id bigint, p_location_id bigint, p_lines jsonb)`
- `public.trg_refresh_menu_stock_capacity_on_recipe()`
- `public.trg_refresh_menu_stock_capacity_on_stock()`
- `public.upsert_ingredient_catalog(p_ingredient_id bigint, p_name text, p_sku text, p_category_id bigint, p_unit_cost numeric, p_item_kind text, p_storage_type text, p_min_stock_level numeric, p_max_stock_level numeric, p_reorder_point numeric, p_shelf_life_days integer, p_units jsonb)`

Tables:

- `public.annual_leave_entitlements`
- `public.ingredient_categories`
- `public.ingredient_units`
- `public.inventory_count_assignments`
- `public.inventory_count_slip_lines`
- `public.inventory_count_slips`
- `public.units`

Columns on prod-only tables:

- `public.annual_leave_entitlements`: `id`, `tenant_id`, `employee_id`, `year`, `entitlement_days`, `notes`, `created_at`, `updated_at`
- `public.ingredient_categories`: `id`, `tenant_id`, `name`, `tone_class`, `sort_order`, `is_active`, `created_at`, `updated_at`
- `public.ingredient_units`: `id`, `tenant_id`, `ingredient_id`, `unit_id`, `to_base_factor`, `is_base`, `allow_purchase`, `allow_issue`, `allow_production`, `sort_order`, `is_active`, `created_at`, `updated_at`
- `public.inventory_count_assignments`: `id`, `tenant_id`, `branch_id`, `location_id`, `employee_id`, `ingredient_id`, `is_active`, `assigned_by`, `created_at`, `updated_at`
- `public.inventory_count_slip_lines`: `id`, `tenant_id`, `slip_id`, `ingredient_id`, `system_quantity`, `counted_quantity`, `variance`, `note`, `entry_unit_id`
- `public.inventory_count_slips`: `id`, `tenant_id`, `branch_id`, `location_id`, `employee_id`, `count_date`, `status`, `note`, `submitted_by`, `submitted_at`, `reviewed_by`, `reviewed_at`, `review_note`, `created_at`, `updated_at`
- `public.units`: `id`, `tenant_id`, `code`, `name`, `is_active`, `created_at`, `updated_at`

Columns on shared tables:

- `public.branch_menu_item_daily_limits.stock_capacity`
- `public.grn_items.entry_unit_id`
- `public.ingredients.category_id`
- `public.kds_tickets.first_ready_at`
- `public.orders.payment_code`
- `public.payroll_entries.paid_leave_days`
- `public.payroll_entries.payable_days`
- `public.payroll_entries.unpaid_leave_days`
- `public.payroll_periods.standard_days`
- `public.production_order_items.entry_unit_id`
- `public.production_recipes.entry_unit_id`
- `public.purchase_order_items.entry_unit_id`
- `public.recipes.entry_unit_id`
- `public.refunds.tax_invoice_id`
- `public.stock_issue_items.entry_unit_id`
- `public.stock_movements.entry_quantity`
- `public.stock_movements.entry_unit_id`
- `public.stock_transfer_items.entry_unit_id`
- `public.stocktake_lines.entry_unit_id`

The audit script added in this slice is `scripts/check-schema-drift.mjs`. It parses local baseline, emits a read-only prod manifest SQL query, and compares against a saved prod manifest JSON. It also has `--self-test` for parser regressions.

## Owner Decision

Recommendation: choose **RE-BASELINE** using `docs/runbooks/db/re-baseline.md`. The drift is no longer a single helper; prod has 29 functions, 7 tables, and 89 table columns missing from the baseline. A committed prod-schema manifest guard would detect future drift, but it would not make a fresh environment correct.

Narrow manual baseline patch is not recommended unless owner explicitly rejects re-baseline. The minimum safe narrow patch for Set A would need to copy current prod definitions for `bump_kds_ticket`, `complete_kds_tickets`, and `recall_kds_ticket` plus remove `can_access_branch` grants/comment/function; that is already hand-rebaselining a subset.

Until owner decides, this worklog documents the known drift and prevents the next migration review from treating baseline replay as proof of prod compatibility.
