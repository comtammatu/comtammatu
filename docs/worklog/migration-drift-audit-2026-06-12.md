# Migration Drift Audit - 2026-06-12

Scope: production project `iexwsuaqqenyjiskawoj`. The initial audit was
read-only. After owner delegation in the same session, the single forward
reconcile migration was applied. No production migration-history repair was
executed in this phase.

Skill plan: repo rules = engineering + database + workflow + skills; external
skills = supabase + supabase-postgres-best-practices; runtime tools = Supabase
MCP read-only SQL + local migration/source inspection; skipped = production
apply/repair because the Environment Registry allows SELECT-only unless owner
delegates a write in the current session.

## T3 Synthesis

PM:

- Goal is to make runtime state trustworthy before cleaning ledger history.
- Acceptance is an object-level matrix that separates cosmetic ledger drift from
  real runtime mismatch.
- The smallest production fix is a forward migration for the one confirmed
  runtime residue; do not rewrite old migration files.

BA:

- Migration filenames are not proof of production state; use catalog objects,
  grants, dependencies, and row counts.
- Cloud-only duplicate ledger entries may remain until a later CLI-history
  cleanup phase.
- Dropping stale data is acceptable only when the column has no true values and
  no user object dependencies.

Senior Dev:

- Keep reconciliation forward-only and idempotent.
- Do not use `schema_migrations` repair to hide runtime drift.
- Draft one migration under `supabase/migrations/` and leave production apply to
  the owner flow.

QA/QC:

- Verify grants with `has_function_privilege`, not by reading old migration
  text.
- Verify feedback/customer-response objects are absent at catalog level.
- After owner apply, run `pnpm db:types`, then `pnpm typecheck && pnpm lint &&
  pnpm build`.

## Ledger Matrix

Baseline note: production retains historical 202604/202605 ledger history. The
local `00000000000000_baseline.sql` is the fresh-env install path, not expected
to appear in production `schema_migrations`.

### Cloud-Only Ledger Entries

These entries do not exist as local active migration files. Each name embeds the
intended local timestamp, and the correct local timestamp is also present in the
production ledger.

| Cloud version | Cloud name | Local counterpart | Classification |
| --- | --- | --- | --- |
| `20260609060814` | `20260609090000_shift_close_discount_totals` | `20260609090000_shift_close_discount_totals.sql` | ledger-only duplicate |
| `20260609060921` | `20260609093000_employee_daily_work_v1` | `20260609093000_employee_daily_work.sql` | ledger-only duplicate |
| `20260609061120` | `20260609094000_pos_item_level_discount` | `20260609094000_pos_item_level_discount.sql` | ledger-only duplicate |
| `20260609125020` | `20260609131000_restore_auth_create_user_helper` | `20260609131000_restore_auth_create_user_helper.sql` | ledger-only duplicate |
| `20260609125232` | `20260609131100_fix_branch_required_trigger_security` | `20260609131100_fix_branch_required_trigger_security.sql` | ledger-only duplicate |

Recommended action: leave these alone until the explicit ledger-cleanup phase.
If the future goal is clean `supabase migration list/db push`, prefer no-op
placeholder files or Supabase migration repair after backup and owner approval.

### Same-Version Drift Candidates

| Version | Local file | Cloud ledger finding | Object-level result | Classification |
| --- | --- | --- | --- | --- |
| `20260609094000` | `pos_item_level_discount` | Some revoke statements differ: local revokes `PUBLIC, anon`; cloud row has `PUBLIC` only. | Current grants are correct: anon/public cannot execute POS discount RPCs; authenticated and service_role can. Later hardening migration covers runtime. | `OK_RUNTIME` |
| `20260609100000` | `employee_checkout_approval` | Cloud row still includes the earlier request-code verification shape. | Current functions no longer reference `checkout_requested_code_verified`, but the column still exists. It has 34 rows, all `false`, and no normal dependencies. | `NEEDS_FORWARD_RECONCILE` |
| `20260609124231` | `auth_refactor_grant_hardening` | Cloud row grants the older `_with_code` request function shape. | Current grants are correct after later hardening: attendance checkout RPCs are service_role-only, browser roles cannot execute them. | `OK_RUNTIME` |
| `20260609230843` | `drop_customer_response_module` | Cloud name is `drop_feedback_module`; first statement/comment differs and local file additionally drops the authenticated storage policy name. | No feedback tables, view, functions, permission keys, or feedback storage policies remain. | `OK_RUNTIME` |

### Apply-Path Formatting Differences

Several rows have `statement_count = 1` in production while the local SQL splits
into multiple statements. The observed pattern is an apply-path artifact: the
row stores the full migration body as one statement. These are not treated as
runtime drift without an object mismatch.

Examples include:

- `20260609132012_grant_private_schema_usage_to_service_role`
- `20260609151615_finance_top_items_date_range`
- `20260609153030_employee_checklist_templates_by_role`
- `20260609161402_finance_top_items_side_items`
- `20260610180000_branch_manager_view_branch_employees`
- `20260610190000_apply_cashier_checklist_template_role`
- `20260610211000_fix_clock_in_template_fallback`
- `20260610230000_canonical_position_codes_lean`
- `20260610234500_hrm_leave_grants_drop_shift_requests`
- `20260611103000_hrm_p2_drop_shift_assignments_lean_hr_keys`

## Runtime Evidence

### POS Discount Grants

Current production grants:

| Function group | anon | public | authenticated | service_role |
| --- | --- | --- | --- | --- |
| `apply_order_discount` / `clear_order_discount` | no | no | yes | yes |
| `apply_order_item_discount` / `clear_order_item_discount` | no | no | yes | yes |

Conclusion: no forward migration needed for the discount grant drift.

### Attendance Checkout

Current production functions:

| Function | Runtime evidence |
| --- | --- |
| `employee_request_clock_out(bigint,bigint,bigint)` | service_role-only; does not mention `checkout_requested_code_verified`; checks required checklist items only. |
| `employee_clock_out_with_code(bigint,bigint,bigint)` | service_role-only; delegates to `employee_request_clock_out`. |
| `branch_manager_approve_employee_clock_out(bigint,bigint,bigint,uuid,text)` | service_role-only; does not mention `checkout_requested_code_verified`. |

Stale column:

| Column | Rows | True | False | Null | Dependencies |
| --- | ---: | ---: | ---: | ---: | --- |
| `attendance_records.checkout_requested_code_verified` | 34 | 0 | 34 | 0 | only automatic column/default dependency observed |

Conclusion: draft a forward migration to drop the stale column after guarding
that no true values or normal dependencies exist.

### Customer Response / Feedback Module

Catalog check returned no remaining:

- feedback tables
- feedback view
- feedback functions
- `feedback:%` permission keys
- feedback storage policies

Conclusion: local/cloud name drift is cosmetic for runtime.

### Auth Helper And Branch Required Trigger

Current production objects:

| Object | Runtime evidence |
| --- | --- |
| `auth_role_to_position(text)` | SECURITY DEFINER; service_role-only. |
| `position_id_from_access_bucket(text,bigint)` | SECURITY DEFINER; service_role-only; uses private staff role mapper. |
| `check_branch_required()` | SECURITY DEFINER; service_role-only; uses private staff role mapper; branch-required guard present. |
| `trg_profiles_branch_required` | BEFORE INSERT and BEFORE UPDATE on `profiles`. |

Conclusion: no forward migration needed for the duplicate auth helper/trigger
ledger rows.

## Forward Migration

Applied after owner delegation:

- `supabase/migrations/20260612063858_reconcile_checkout_request_code_residue.sql`

Behavior:

1. No-op if `attendance_records.checkout_requested_code_verified` is already
   absent.
2. Refuse to proceed if any row has `checkout_requested_code_verified IS TRUE`.
3. Refuse to proceed if the column has non-automatic dependencies.
4. Drop the stale column.

Production apply evidence:

| Check | Result |
| --- | --- |
| Ledger version | `20260612063858` |
| Ledger name | `reconcile_checkout_request_code_residue` |
| Ledger statement count | `3` |
| Ledger/local split hash | `a9c14167443b71703a5aad1189d5b75a` |
| Stale column after apply | absent |
| `pnpm db:types` | regenerated `packages/database/src/types/database.types.ts` to 9873 lines |

## Follow-Up Plan

1. Commit and review the migration + regenerated types.
2. Confirm `packages/database/src/types/database.types.ts` no longer includes
   `checkout_requested_code_verified`.
3. Run `pnpm typecheck && pnpm lint && pnpm build`.

Ledger cleanup remains a separate phase after runtime reconcile is applied and
verified.
