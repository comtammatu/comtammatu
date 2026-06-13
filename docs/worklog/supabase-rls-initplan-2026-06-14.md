# RLS auth_rls_initplan Wave - 2026-06-14

Scope: production project `iexwsuaqqenyjiskawoj`. Clears the performance advisor
`auth_rls_initplan` (20 flags). Companion to the security definer revoke
(`supabase-definer-revoke-wave5-2026-06-14.md`).

Skill plan: repo rules = engineering + database + workflow; external skills =
supabase + supabase-postgres-best-practices; runtime tools = Supabase MCP
read-only catalog + advisor; skipped = prod apply (no in-session delegation;
file → PR → owner per D015), and no dev/test DB exists to apply against.

## T3 Synthesis

PM: behavior-preserving perf fix; acceptance = advisor `auth_rls_initplan` → 0
with zero RLS behavior change.

BA: every flagged policy gates on `auth.uid()` (the row owner check). The fix must
not alter who can see/write which rows — only when `auth.uid()` is evaluated.

Senior Dev: the advisor flags only the `auth` schema function `auth.uid()`, not
the project's public `auth_tenant_id()/auth_role()/auth_branch_id()` helpers.
Confirmed by matching the advisor's per-table counts exactly to the set of
policies containing a bare `auth.uid()` (profiles 2, notification_push_subscriptions
4, notification_reads 3, payroll_entries 2, leave_requests 2, and 7 singletons =
20). Wrapping in `( SELECT auth.uid() )` lets Postgres hoist it to a per-statement
InitPlan; `auth.uid()` is STABLE and argument-free, so the scalar subquery is
value-identical.

QA/QC: the migration is data-driven — it reads each policy's live definition and
does a single-token `replace(... 'auth.uid()' ...)` via `ALTER POLICY`, so roles,
cmd, permissive flag, and every other predicate are preserved by construction.
A read-only preview confirmed all 20 rewrites are valid SQL and differ from the
originals only by the wrap (including occurrences nested inside EXISTS / IN
subqueries). Post-loop self-check RAISEs (rolls back) if any public policy still
carries a bare `auth.uid()`.

## Affected policies (20)

| Table | Policy | Clause(s) |
| --- | --- | --- |
| attendance_checklist_items | attendance_checklist_items_select | USING |
| attendance_records | attendance_select | USING |
| branch_menu_item_daily_holds | bmidh_select | USING |
| branch_trusted_egress_ips | btei_delete | USING |
| employees | employees_select_self | USING |
| leave_requests | leave_requests_select | USING |
| leave_requests | leave_requests_self_insert | WITH CHECK |
| notification_push_subscriptions | *_delete_own / *_insert_own / *_select_own / *_update_own | USING/CHECK |
| notification_reads | *_delete_own / *_insert_own / *_select_own | USING/CHECK |
| payroll_entries | payroll_entries_select | USING |
| payroll_entries | pe_employee_self_select | USING |
| permission_audit_log | perm_audit_self_view | USING |
| profiles | Users can update own safe fields | USING + WITH CHECK |
| profiles | profiles_select_self | USING |
| user_trust_score | trust_score_read_own_or_admin | USING |

Example (notification_reads_select_own): `(user_id = auth.uid())` →
`(user_id = ( SELECT auth.uid() ))`. The other 19 follow the same single-token
substitution.

Out of scope (deliberate): `auth_tenant_id()`, `auth_role()`, `auth_branch_id()`,
`has_permission()`, `has_permission_any()` are NOT wrapped. The advisor does not
flag them, and `has_permission*` is intentionally evaluated live for revocation
freshness (`RLS-DESTRUCTIVE-MUST-USE-HAS-PERMISSION`). Wrapping the `auth_*` JWT
readers is an optional later micro-pass; this wave stays scoped to the advisor's
flagged token.

## Deliverable

`supabase/migrations/20260614091000_rls_initplan_wrap_auth_uid.sql` — single
`BEGIN/COMMIT` transaction, data-driven `ALTER POLICY` loop + self-check.

## Production Apply (done 2026-06-14)

Owner delegated in-session apply (§2), same lifted-then-restored guard window as
the definer revoke. Applied via `mcp__supabase__execute_sql`: dry-run
(`BEGIN … loop … self-check … ROLLBACK`) passed, then real
(`BEGIN … loop … self-check … ledger insert … COMMIT`). Ledger row
`20260614091000` recorded.

Verified on prod:

1. Zero public policies retain a bare `auth.uid()`; 21 policies now carry
   `( SELECT auth.uid() )` = the 20 rewritten here + `staff_permissions_select_self`
   (already wrapped before this wave, correctly skipped by the migration filter).
2. Performance advisor `auth_rls_initplan` is now **0** (was 20).
3. No `pnpm db:types` (policy expressions only; no schema/type change).

Remaining smoke (owner, non-blocking): confirm a non-admin employee still sees
only their own `profiles` / `employees` / `attendance_records` /
`payroll_entries` (paid) / `leave_requests` / `notification_*` rows, an admin
keeps branch/tenant scope, and POS daily-hold visibility (`bmidh_select`) is
unchanged. The rewrite is value-identical, so behavior change is not expected.

Rollback: the inverse is the same loop replacing `( SELECT auth.uid() )` back to
`auth.uid()`. Not expected — the change is value-identical.

## Not Done

- `unindexed_foreign_keys` (145), `multiple_permissive_policies` (54), and
  `unused_index` (161, deferred per `tasks/todo.md` until ≥1 business cycle) remain
  separate performance waves.
