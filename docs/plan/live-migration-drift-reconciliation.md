# Live Migration Drift Reconciliation

> Status: READ-ONLY RECONCILIATION
> Date: 2026-05-26
> Target queried: Supabase project `comtammatu` / `iexwsuaqqenyjiskawoj`
> Production project `matu-prod` was discovered but not queried.

This report reconciles local migration files with the live migration history in
`supabase_migrations.schema_migrations`. It does not apply migrations, alter
schema, pull remote schema, print secrets, or query `matu-prod`.

4-agent debate is skipped because this is documentation-only. The output is a
blocker artifact for the new-project baseline track, not an implementation plan
to mutate the database.

## Verdict

`NO-GO` for creating a greenfield database baseline from the current migration
chain.

`CONDITIONAL GO` for continuing cleanup/docs work while migration history is
reconciled.

## Summary

| Check | Local checkout | Live `comtammatu` | Result |
| --- | ---: | ---: | --- |
| Migration files / rows | 363 files | 393 applied rows | Drift |
| Unique migration versions | 362 | 393 | Drift |
| Exact version matches | 308 | 308 | Only these are aligned |
| Live-only applied versions | n/a | 85 | Must recover or fold into baseline |
| Local-only versions | 54 unique versions | n/a | Must apply, drop, or supersede |
| Duplicate versions | 1 local duplicate | 0 live duplicates | Local chain invalid for replay |
| Public tables | 116 generated | 116 live | Count aligned |
| Views + materialized views | 9 generated | 9 live | Count aligned |
| Public functions | 241 generated | 280 live | Generated types are stale or incomplete |

The table/view counts can look healthy while migration history and function
shape are still not reproducible from the checkout. Do not use this migration
folder as a greenfield install source until the owner chooses a reconciliation
path.

## Hard Blockers

1. Local has a duplicate migration version:
   - `20260517000000_branch_menu_daily_limits_realtime.sql`
   - `20260517000000_hddt_reconcile_log_and_index.sql`
   Live history has only one row for version `20260517000000`, named
   `hddt_reconcile_log_and_index`.
2. Live has 85 applied versions that do not exist as exact local versions.
3. Local has 54 unique versions that are not applied live.
4. Several same-name migrations appear under different timestamps between live
   and local. This means "local-only" does not always mean "never applied"; it
   may mean "applied under a different timestamp."
5. Live function count is 280, while generated types expose 241 functions. This
   makes generated types insufficient as the only schema proof for greenfield
   packaging.

## Live-Only Applied Versions

These versions exist in `supabase_migrations.schema_migrations` but not as exact
local migration versions.

| Day | Count | Live versions / names |
| --- | ---: | --- |
| 2026-05-02 | 2 | `20260502140631` `branch_menu_daily_limits_realtime`; `20260502140741` `fix_edit_pending_order_item_pricing` |
| 2026-05-03 | 14 | `20260503002634` `kitchen_ticket_cashier_name`; `20260503002654` `audit_log_completeness`; `20260503043911` `security_invoker_views`; `20260503043913` `mv_refresh_log_rls`; `20260503044359` `set_search_path_definer`; `20260503044401` `revoke_anon_execute_definer`; `20260503044532` `revoke_public_execute_definer`; `20260503070722` `pos_served_requires_items_ready`; `20260503070735` `kitchen_send_batches_realtime`; `20260503070801` `reduce_qty_decrement_daily_limit`; `20260503070931` `finance_live_revenue_wrappers`; `20260503071013` `cancel_ticket_include_note`; `20260503071042` `receipt_print_static_idempotency`; `20260503071056` `print_agent_fleet_view` |
| 2026-05-05 | 24 | `20260505155928` `inventory_transfer_rpc_role_scope_gates`; `20260505155942` `finance_manual_journal_post_period_guard`; `20260505155954` `network_gate_branch_permission_rls`; `20260505160109` `db_rls_rpc_hot_path_optimization`; `20260505160143` `create_payment_reuse_active_slot`; `20260505160224` `branch_menu_daily_limits_realtime_v2`; `20260505160241` `audit_log_completeness_v2`; `20260505160322` `kitchen_ticket_cashier_name_v2`; `20260505160438` `finance_live_revenue_wrappers_v2`; `20260505160449` `security_invoker_views_v2`; `20260505160453` `mv_refresh_log_rls_v2`; `20260505160501` `print_agent_fleet_view_v2`; `20260505160540` `cancel_ticket_include_note_v2`; `20260505160559` `receipt_print_static_idempotency_v2`; `20260505160618` `set_search_path_definer_v2`; `20260505160624` `revoke_anon_execute_definer_v2`; `20260505160631` `revoke_public_execute_definer_v2`; `20260505161122` `inventory_rbac_template_contract_v2`; `20260505161314` `pos_append_served_and_strict_options`; `20260505161429` `print_templates_document_ast`; `20260505161536` `finance_manual_journal_atomic_rpc`; `20260505170344` `inventory_production_db_role_contract`; `20260505170604` `finance_dashboard_summary_rpc`; `20260505174824` `cancel_pending_payment_rpc` |
| 2026-05-06 | 23 | `20260506022355` `finance_hour_cashier_breakdowns`; `20260506041153` `fix_get_revenue_kpis_ambiguous_column`; `20260506064110` `confirm_vietqr_payment_rpc`; `20260506064133` `create_payment_drop_vietqr_and_pending_flip`; `20260506064145` `cancel_pending_payment_security_fix`; `20260506070059` `confirm_vietqr_payment_rpc`; `20260506070136` `create_payment_drop_vietqr_and_pending_flip`; `20260506070148` `cancel_pending_payment_security_fix`; `20260506185720` `production_order_shortage_detail`; `20260506190723` `feedback_create_tables`; `20260506190810` `feedback_rls_policies`; `20260506190822` `feedback_masked_phone_view`; `20260506190839` `submit_feedback_rpc`; `20260506190857` `feedback_permission_keys`; `20260506190915` `feedback_daily_reports`; `20260506190926` `feedback_settings`; `20260506190945` `submit_feedback_rpc_v2`; `20260506190952` `feedback_photos_storage`; `20260506191004` `feedback_retention_rpc`; `20260506191014` `feedback_moderate_permission`; `20260506191026` `telegram_destinations_circuit_breaker`; `20260506191039` `bulk_mark_suspect_rpc`; `20260506191224` `grn_received_means_delivered` |
| 2026-05-07 | 6 | `20260507080536` `audit_logs_tenant_entity_created_idx`; `20260507080555` `h2a_refunds_update_perm_gate`; `20260507080615` `h2b_hr_payroll_perm_gate`; `20260507080647` `m5_observability_warnings`; `20260507080717` `pos_order_service_charge_rpc`; `20260507101116` `split_order_counter_fix_drop_order_type` |
| 2026-05-13 | 2 | `20260513094038` `branch_code_order_number_suffix`; `20260513103332` `fix_finance_revenue_pos_session_cashier_ids` |
| 2026-05-24 | 8 | `20260524030719` `query_perf_hot_paths`; `20260524031004` `query_perf_kds_order_fix`; `20260524063158` `20260507100000_disable_inv_s12_dashboard_v2`; `20260524063221` `20260524010000_stocktake_complete_permission_gate`; `20260524063330` `20260601840000_finance_slow_query_followup`; `20260524063356` `20260601850000_kds_complete_tickets_rpc`; `20260524071418` `security_definer_rpc_hardening`; `20260524074120` `network_gate_presence_token_registry` |
| 2026-05-25 | 6 | `20260525103903` `shift_close_item_breakdown_table`; `20260525130048` `20260601960000_print_order_header_display`; `20260525130601` `20260601960100_print_template_helper_grant_hardening`; `20260525150311` `20260601960200_print_order_header_table_label`; `20260525151849` `20260601960300_order_based_kitchen_ticket_numbers`; `20260525152006` `20260601960400_harden_route_order_to_kds_grants` |

## Local-Only Versions

These local versions are not applied live as exact versions. Some may have been
applied under a different timestamp, so each row needs content-level matching
before deciding whether to apply, drop, or fold into a baseline snapshot.

| Day | Count | Local versions / files |
| --- | ---: | --- |
| 2026-05-02 | 1 | `20260502000100_pos_served_requires_items_ready.sql` |
| 2026-05-03 | 1 | `20260503000100_reduce_qty_decrement_daily_limit.sql` |
| 2026-05-05 | 2 | `20260505093000_inventory_transfer_rpc_role_scope_gates.sql`; `20260505094000_inventory_rbac_template_contract_v2.sql` |
| 2026-05-07 | 1 | `20260507100000_disable_inv_s12_dashboard_v2.sql` |
| 2026-05-11 | 13 | `20260511000100_feedback_create_tables.sql`; `20260511010000_feedback_rls_policies.sql`; `20260511020000_feedback_masked_phone_view.sql`; `20260511030000_submit_feedback_rpc.sql`; `20260511040000_feedback_permission_keys.sql`; `20260511050000_feedback_daily_reports.sql`; `20260511060000_feedback_settings.sql`; `20260511070000_submit_feedback_rpc_v2.sql`; `20260511080000_feedback_photos_storage.sql`; `20260511090000_feedback_retention_rpc.sql`; `20260511100000_feedback_moderate_permission.sql`; `20260511110000_telegram_destinations_circuit_breaker.sql`; `20260511120000_bulk_mark_suspect_rpc.sql` |
| 2026-05-13 | 1 | `20260513001000_kitchen_send_batches_realtime.sql` |
| 2026-05-18 | 1 | `20260518000000_fix_edit_pending_order_item_pricing.sql` |
| 2026-05-19 | 1 | `20260519000000_finance_live_revenue_wrappers.sql` |
| 2026-05-20 | 2 | `20260520000000_kitchen_ticket_cashier_name.sql`; `20260520010000_audit_log_completeness.sql` |
| 2026-05-21 | 6 | `20260521000000_cancel_ticket_include_note.sql`; `20260521000100_security_invoker_views.sql`; `20260521010000_mv_refresh_log_rls.sql`; `20260521020000_set_search_path_definer.sql`; `20260521030000_revoke_anon_execute_definer.sql`; `20260521030001_revoke_public_execute_definer.sql` |
| 2026-05-22 | 1 | `20260522000000_receipt_print_static_idempotency.sql` |
| 2026-05-23 | 1 | `20260523000000_print_agent_fleet_view.sql` |
| 2026-05-24 | 2 | `20260524000000_db_rls_rpc_hot_path_optimization.sql`; `20260524010000_stocktake_complete_permission_gate.sql` |
| 2026-05-25 | 2 | `20260525000000_create_payment_reuse_active_slot.sql`; `20260525010000_finance_manual_journal_post_period_guard.sql` |
| 2026-05-26 | 3 | `20260526000000_print_templates_document_ast.sql`; `20260526010000_network_gate_branch_permission_rls.sql`; `20260526020000_pos_append_served_and_strict_options.sql` |
| 2026-05-27 | 3 | `20260527000000_finance_manual_journal_atomic_rpc.sql`; `20260527010000_inventory_production_db_role_contract.sql`; `20260527020000_finance_dashboard_summary_rpc.sql` |
| 2026-05-29 | 1 | `20260529000000_finance_hour_cashier_breakdowns.sql` |
| 2026-05-30 | 2 | `20260530000000_fix_get_revenue_kpis_ambiguous_column.sql`; `20260530000100_grn_received_means_delivered.sql` |
| 2026-05-31 | 4 | `20260531000000_confirm_vietqr_payment_rpc.sql`; `20260531010000_create_payment_drop_vietqr_and_pending_flip.sql`; `20260531020000_cancel_pending_payment_security_fix.sql`; `20260531030000_production_order_shortage_detail.sql` |
| 2026-06-01 | 6 | `20260601930000_harden_confirm_vietqr_payment.sql`; `20260601950000_shift_close_item_breakdown_table.sql`; `20260601960000_print_order_header_display.sql`; `20260601960100_print_template_helper_grant_hardening.sql`; `20260601960200_print_order_header_table_label.sql`; `20260601960400_harden_route_order_to_kds_grants.sql` |

## Same-Name / Different-Version Evidence

The following examples show why simple version comparison is not enough:

| Migration name | Live version | Local version |
| --- | --- | --- |
| `branch_menu_daily_limits_realtime` | `20260502140631` | `20260517000000` |
| `fix_edit_pending_order_item_pricing` | `20260502140741` | `20260518000000` |
| `kitchen_ticket_cashier_name` | `20260503002634` | `20260520000000` |
| `audit_log_completeness` | `20260503002654` | `20260520010000` |
| `security_invoker_views` | `20260503043911` | `20260521000100` |
| `mv_refresh_log_rls` | `20260503043913` | `20260521010000` |
| `set_search_path_definer` | `20260503044359` | `20260521020000` |
| `revoke_anon_execute_definer` | `20260503044401` | `20260521030000` |
| `revoke_public_execute_definer` | `20260503044532` | `20260521030001` |
| `feedback_create_tables` | `20260506190723` | `20260511000100` |
| `feedback_photos_storage` | `20260506190952` | `20260511080000` |
| `grn_received_means_delivered` | `20260506191224` | `20260530000100` |
| `network_gate_presence_token_registry` | `20260524074120` and `20260601870000` | `20260601870000` |
| `order_based_kitchen_ticket_numbers` | `20260525151849` and `20260601960300` | `20260601960300` |

Some items appear live twice under different versions/namespaces. Before any
cleanup, compare SQL bodies and live schema effects. Do not blindly re-apply
local-only files whose logic may already exist live under another timestamp.

## Required Resolution Path

1. Freeze greenfield DB baseline generation until this report has an owner
   decision.
2. Choose canonical source for baseline extraction:
   - `live-schema-first`: pull/export current live schema, then create a clean
     green baseline migration from that shape.
   - `local-chain-first`: repair local history, remove duplicate versions,
     recover missing live SQL, then prove replay from empty DB.
3. For every live-only row, recover SQL body from Supabase migration history or
   from git/worklog evidence, then classify it as:
   - already represented by a local migration under a different timestamp
   - missing from local and must be restored
   - intentionally excluded from the future baseline
4. For every local-only row, classify it as:
   - safe to apply to the target dev/type-source project
   - already applied under a different live version
   - superseded by later SQL
   - not part of the new baseline
5. Fix the duplicate local version before any replay-based verification.
6. Only after the source-of-truth is chosen, regenerate database types from that
   exact schema and re-run `node scripts/project-snapshot.mjs`.

## Current Recommendation

Use `live-schema-first` for the upgraded baseline package.

Reason: the live project contains operational data and 393 applied migration
rows. The local migration chain has a duplicate version and multiple
timestamp-rewritten migrations, so replaying the folder as the install path is
not trustworthy. A clean baseline should be generated from the verified live
schema, with forward migrations authored only after the drift is documented and
signed off.

## Owner Decision

Owner accepted `live-schema-first` on 2026-05-26.

The extraction contract and live schema manifest are now tracked in
`docs/plan/live-schema-first-baseline-extraction.md`. This decision does not
create a new database, export secrets, or apply migrations. It only chooses the
source-of-truth strategy for the future clean baseline package.

## Supabase Local Replay Check

Supabase Local empty-database replay was run on 2026-05-26 in a scratch workdir.
It failed before reaching the duplicate local migration version:

```text
Applying migration 20260508055046_hddt_summary_rpcs.sql...
ERROR: column oi.vat_rate does not exist (SQLSTATE 42703)
```

`20260508055046_hddt_summary_rpcs.sql` defines `_compute_vat_breakdown(...)`
using `order_items.vat_rate`, but the local migration that creates
`order_items.vat_rate` is `20260509000000_finance_phase1_5_vat_per_line.sql`.

Replay evidence is recorded in
`docs/plan/supabase-local-baseline-replay.md`.

This closes `local-chain-first` as `NO-GO` for the upgraded baseline package.
